import { getLogger } from "../../logger.js";
import fetchConnectedHierarchy from "../../actions/getConnectedHierarchy.js";
import Category from "../../model/Category.js";
import PrimitiveConfig from "../../PrimitiveConfig.js";
import { getConfig, getBaseFilterForView } from "../../SharedFunctions.js";

const logger = getLogger("agent_module_get_connected_data", "debug", 0);

const DATA_TYPES = new Set(["view", "query", "filter", "search", "summary"]);

const filterCache = new Map();

function toIdString(value) {
  if (value == null) return null;
  try {
    return String(value);
  } catch (error) {
    return null;
  }
}

function normalizeFilterForAgent(filter) {
  if (!filter) return null;
  try {
    const {
      resolvedFilterType,
      pivot,
      relationship,
      check,
      includeNulls,
      skip,
      isRange,
    } = PrimitiveConfig.commonFilterSetup(filter);
    if (skip) {
      return null;
    }
    return {
      original_type: filter.type,
      resolved_type: resolvedFilterType,
      parameter: filter.parameter ?? filter.param,
      subtype: filter.subtype,
      relationship,
      pivot,
      values: check,
      include_nulls: includeNulls ?? undefined,
      invert: filter.invert ?? false,
      is_range: Boolean(isRange),
      source_primitive_id: filter.sourcePrimId ? toIdString(filter.sourcePrimId) : undefined,
    };
  } catch (error) {
    logger.debug("get_connected_data: normalizeFilterForAgent failed", { error: error?.message });
    return null;
  }
}

async function collectFiltersForPrimitive(primitive, scope) {
  const id = toIdString(primitive?._id ?? primitive?.id);
  if (!id) {
    return [];
  }

  if (filterCache.has(id)) {
    return filterCache.get(id);
  }

  try {
    scope.cache ||= {};
    const config = await getConfig(primitive, scope.cache);
    const filters = await getBaseFilterForView(primitive, config);
    const normalized = (filters ?? [])
      .map(normalizeFilterForAgent)
      .filter(Boolean);
    filterCache.set(id, normalized);
    return normalized;
  } catch (error) {
    logger.debug("get_connected_data: collectFiltersForPrimitive failed", { error: error?.message, id });
    filterCache.set(id, []);
    return [];
  }
}

function buildPrimitiveMetrics(primitive) {
  const summary = {
    count: 0,
    sourceCounts: { origin: 0, alt_origin: 0, import: 0 },
    referenceIds: [],
  };

  if (!primitive) {
    return summary;
  }

  if (primitive.type === "search") {
    const origin = primitive.primitives?.origin ?? {};
    const alt = primitive.primitives?.alt_origin ?? {};
    const originItems = origin.allItems ?? [];
    const altItems = alt.allItems ?? [];

    const originCount = originItems.length || origin.allUniqueItems?.length || origin.allIds?.length || 0;
    const altCount = altItems.length || alt.allUniqueItems?.length || alt.allIds?.length || 0;

    summary.sourceCounts.origin = originCount;
    summary.sourceCounts.alt_origin = altCount;
    summary.count = originCount + altCount;
    summary.referenceIds = [
      ...originItems.map((item) => item?.referenceId),
      ...altItems.map((item) => item?.referenceId),
    ].filter((value) => value !== undefined && value !== null);
  } else {
    const items = primitive.itemsForProcessing ?? primitive.primitives?.origin?.allItems ?? [];
    summary.count = Array.isArray(items) ? items.length : 0;
    summary.sourceCounts.import = summary.count;
    summary.referenceIds = (Array.isArray(items) ? items : [])
      .map((item) => item?.referenceId)
      .filter((value) => value !== undefined && value !== null);
  }

  return summary;
}

function registerCategoryId(map, value) {
  if (value === undefined || value === null) {
    return;
  }
  const key = toIdString(value);
  if (!key) return;
  if (!map.has(key)) {
    map.set(key, value);
  }
}

function buildSchema(referenceIds = [], categoryMap = new Map()) {
  const counts = new Map();
  for (const id of referenceIds) {
    const key = toIdString(id);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const categories = [];
  const metadata = {};
  for (const [key, count] of counts.entries()) {
    const category = categoryMap.get(key);
    categories.push({
      id: category?.id ?? key,
      title: category?.title,
      count,
    });
    if (category?.parameters && typeof category.parameters === "object") {
      Object.assign(metadata, category.parameters);
    }
  }

  return {
    categories,
    metadata,
  };
}

function groupHierarchyByRoot(hierarchy = []) {
  const grouped = new Map();
  for (const item of hierarchy) {
    if (!item?._id) continue;
    const rootKey = toIdString(item.rootId ?? item._id);
    if (!grouped.has(rootKey)) {
      grouped.set(rootKey, []);
    }
    grouped.get(rootKey).push(item);
  }
  return grouped;
}

async function fetchCategoryMap(categoryIdRegistry) {
  if (!categoryIdRegistry || categoryIdRegistry.size === 0) {
    return new Map();
  }

  const ids = Array.from(categoryIdRegistry.values());
  try {
    const categories = await Category.find(
      { id: { $in: ids } },
      { id: 1, title: 1, description: 1, parameters: 1 }
    ).lean();
    return new Map(categories.map((cat) => [toIdString(cat.id), cat]));
  } catch (error) {
    logger.debug("get_connected_data: failed to fetch categories", { error: error?.message });
    return new Map();
  }
}

async function annotateNode({
  item,
  rootKey,
  importerIndex,
  groupedByRoot,
  categoryMap,
  scope,
  metricsByPrimitive,
  annotationsByPrimitive,
  pathStack,
  parentIds,
  importedVia,
}) {
  if (!item?._id) {
    return null;
  }

  const primitive = item;
  const idStr = toIdString(primitive._id);
  const depth = Number.isInteger(primitive.depth) ? primitive.depth : 0;
  const metrics = metricsByPrimitive.get(idStr) ?? buildPrimitiveMetrics(primitive);
  if (!metricsByPrimitive.has(idStr)) {
    metricsByPrimitive.set(idStr, metrics);
  }

  const baseFilters = await collectFiltersForPrimitive(primitive, scope);
  const filters = baseFilters.length ? baseFilters : undefined;
  const schemaInfo = buildSchema(metrics.referenceIds, categoryMap);
  const schemaCategories = schemaInfo.categories.length ? schemaInfo.categories : undefined;
  const schemaMetadata = Object.keys(schemaInfo.metadata ?? {}).length ? schemaInfo.metadata : undefined;

  const annotation = {
    node: {
      id: idStr,
      plainId: primitive.plainId,
      title: primitive.title,
      type: primitive.type,
    },
    depth,
    root_id: rootKey,
    parent_ids: parentIds,
    imported_via: importedVia,
    count: metrics.count,
    source_counts: metrics.sourceCounts,
    ...(filters ? { filters } : {}),
    ...(schemaCategories || schemaMetadata
      ? {
          schema: {
            ...(schemaCategories ? { categories: schemaCategories } : {}),
            ...(schemaMetadata ? { metadata: schemaMetadata } : {}),
          },
        }
      : {}),
    children: [],
  };

  const storeKey = toIdString(annotation.node.id);
  if (storeKey) {
    if (!annotationsByPrimitive.has(storeKey)) {
      annotationsByPrimitive.set(storeKey, []);
    }
    annotationsByPrimitive.get(storeKey).push(annotation);
  }

  const nextDepth = depth + 1;
  const depthMap = importerIndex.get(rootKey)?.get(nextDepth);
  if (!depthMap) {
    return annotation;
  }

  const rawChildIds = []
    .concat(primitive.importsIds ?? [])
    .concat(primitive.primitives?.importsIds ?? [])
    .concat(primitive.primitives?.imports?.allIds ?? [])
    .concat(item.importsIds ?? []);
  const childrenIds = Array.from(new Set(rawChildIds.map(toIdString))).filter(Boolean);
  for (const childId of childrenIds) {
    const importerSet = depthMap.get(childId);
    if (!importerSet || !importerSet.has(storeKey)) {
      continue;
    }
    const candidates = (groupedByRoot.get(rootKey) ?? []).filter(
      (candidate) => toIdString(candidate._id) === childId && (Number.isInteger(candidate.depth) ? candidate.depth : 0) === nextDepth
    );
    for (const candidate of candidates) {
      const pathKey = `${childId}@${nextDepth}`;
      if (pathStack.has(pathKey)) {
        annotation.children.push({
          node: {
            id: candidate._id,
            plainId: candidate.plainId,
            title: candidate.title,
            type: candidate.type,
          },
          cycle: true,
        });
        continue;
      }
      pathStack.add(pathKey);
      const childAnnotation = await annotateNode({
        item: candidate,
        rootKey,
        importerIndex,
        groupedByRoot,
        categoryMap,
        scope,
        metricsByPrimitive,
        annotationsByPrimitive,
        pathStack,
        parentIds: [...parentIds, annotation.node.id],
        importedVia: Array.from(importerSet).map(toIdString).filter(Boolean),
      });
      if (childAnnotation) {
        annotation.children.push(childAnnotation);
      }
      pathStack.delete(pathKey);
    }
  }

  return annotation;
}

async function buildAnnotatedHierarchy({ hierarchy, importerIndex, scope }) {
  if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
    return { roots: [], byPrimitive: new Map() };
  }

  const groupedByRoot = groupHierarchyByRoot(hierarchy);
  const metricsByPrimitive = new Map();
  const categoryIdRegistry = new Map();

  for (const item of hierarchy) {
    if (!item?._id) continue;
    const idStr = toIdString(item._id);
    if (!metricsByPrimitive.has(idStr)) {
      const metrics = buildPrimitiveMetrics(item);
      metricsByPrimitive.set(idStr, metrics);
      for (const refId of metrics.referenceIds ?? []) {
        registerCategoryId(categoryIdRegistry, refId);
      }
    } else {
      const metrics = metricsByPrimitive.get(idStr);
      for (const refId of metrics.referenceIds ?? []) {
        registerCategoryId(categoryIdRegistry, refId);
      }
    }
  }

  const categoryMap = await fetchCategoryMap(categoryIdRegistry);
  const annotationsByPrimitive = new Map();
  const roots = [];

  for (const item of hierarchy) {
    if ((Number.isInteger(item.depth) ? item.depth : 0) !== 0) continue;
    const rootKey = toIdString(item.rootId ?? item._id);
    const pathKey = `${toIdString(item._id)}@0`;
    const pathStack = new Set([pathKey]);
    const annotation = await annotateNode({
      item,
      rootKey,
      importerIndex,
      groupedByRoot,
      categoryMap,
      scope,
      metricsByPrimitive,
      annotationsByPrimitive,
      pathStack,
      parentIds: [],
      importedVia: [],
    });
    if (annotation) {
      roots.push(annotation);
    }
  }

  return { roots, byPrimitive: annotationsByPrimitive };
}

function estimateItemCount(primitive = {}) {
  const origin = primitive.primitives?.origin;
  return (
    origin?.uniqueAllItems?.length ??
    origin?.allUniqueItems?.length ??
    origin?.uniqueAllIds?.length ??
    origin?.allUniqueIds?.length ??
    primitive.referenceParameters?.itemCount ??
    null
  );
}

function summarizeConnection(metadata) {
  const reasons = new Set(metadata?.connection_reason ?? []);
  const via = new Set(metadata?.connected_via ?? []);
  return {
    connection_reason: Array.from(reasons),
    connected_via: Array.from(via).filter(Boolean),
  };
}

async function buildSearchMetadata(primitive, scope) {
  try {
    scope.cache ||= {};
    const config = await getConfig(primitive, scope.cache);
    if (!config) {
      return {};
    }
    return {
      platforms: config.sources || [],
      terms: config.terms || [],
      companies: config.companies || [],
      site: config.site || undefined,
      textual_filter: config.topic || undefined,
      search_time: config.timeFrame || undefined,
      target_number_of_results: config.count || undefined,
    };
  } catch (error) {
    logger.debug("get_connected_data: getConfig failed", { error, id: primitive.id });
    return {};
  }
}

export async function implementation(params = {}, scope = {}, notify) {
  const immediate = scope.immediateContext ?? [];
  const startingIds = immediate.map((item) => item?.id).filter(Boolean);

  if (!startingIds.length) {
    notify?.("No immediate context provided.", true);
    return [];
  }

  const hierarchy = await fetchConnectedHierarchy({
    workspaceId: scope.workspaceId,
    rootIds: startingIds,
  });

  if (!hierarchy.length) {
    notify?.("No connected data sources found.", true);
    return [];
  }

  const importersByRootDepth = new Map();
  for (const item of hierarchy) {
    if (!item?._id) continue;
    const rootKey = String(item.rootId ?? item._id);
    const parentId = String(item._id);
    const parentDepth = Number.isInteger(item.depth) ? item.depth : 0;
    const childDepthKey = parentDepth + 1;

    if (!importersByRootDepth.has(rootKey)) {
      importersByRootDepth.set(rootKey, new Map());
    }

    const depthMap = importersByRootDepth.get(rootKey);
    if (!depthMap.has(childDepthKey)) {
      depthMap.set(childDepthKey, new Map());
    }

    const childrenMap = depthMap.get(childDepthKey);
    for (const childId of item.importsIds ?? []) {
      const childKey = String(childId);
      if (!childrenMap.has(childKey)) {
        childrenMap.set(childKey, new Set());
      }
      childrenMap.get(childKey).add(parentId);
    }
  }

  const metadataById = new Map();
  for (const item of hierarchy) {
    if (!item?._id) continue;
    const id = String(item._id);
    const rootKey = String(item.rootId ?? item._id);
    const depthKey = Number.isInteger(item.depth) ? item.depth : 0;
    const entry = metadataById.get(id) || {
      primitive: item,
      connection_reason: new Set(),
      connected_via: new Set(),
    };

    if (item.depth === 0) {
      entry.connection_reason.add("immediate_context");
    } else {
      entry.connection_reason.add("import");
      const importers = importersByRootDepth.get(rootKey)?.get(depthKey)?.get(id);
      if (importers?.size) {
        for (const importerId of importers) {
          entry.connected_via.add(importerId);
        }
      } else {
        entry.connected_via.add(rootKey);
      }
    }

    metadataById.set(id, entry);
  }

  let annotationsByPrimitiveId;
  if (params?.annotated) {
    const annotationResult = await buildAnnotatedHierarchy({
      hierarchy,
      importerIndex: importersByRootDepth,
      scope,
    });
    annotationsByPrimitiveId = annotationResult.byPrimitive;
  }

  const candidates = [];
  for (const entry of metadataById.values()) {
    const { primitive } = entry;
    if (!primitive || !DATA_TYPES.has(primitive.type)) {
      continue;
    }

    const base = {
      id: primitive._id,
      type: primitive.type,
      referenceId: primitive.referenceId,
      number_results: estimateItemCount(primitive),
      ...summarizeConnection({
        connection_reason: entry.connection_reason,
        connected_via: entry.connected_via,
      }),
    };

    if (primitive.title) {
      base.title = primitive.title;
    }

    const filters = await collectFiltersForPrimitive(primitive, scope);
    if (filters.length) {
      base.filters = filters;
    }

    if (primitive.type === "search") {
      Object.assign(base, await buildSearchMetadata(primitive, scope));
    }

    if (annotationsByPrimitiveId) {
      const annotations = annotationsByPrimitiveId.get(toIdString(primitive._id));
      if (annotations?.length) {
        base.annotated = annotations.length === 1 ? annotations[0] : annotations;
      }
    }

    candidates.push(base);
  }

  candidates.sort((a, b) => {
    const reasonA = a.connection_reason?.includes("immediate_context") ? 0 : 1;
    const reasonB = b.connection_reason?.includes("immediate_context") ? 0 : 1;
    if (reasonA !== reasonB) return reasonA - reasonB;
    return (b.number_results ?? 0) - (a.number_results ?? 0);
  });

  if (!candidates.length) {
    notify?.("No connected data sources found.", true);
  } else {
    notify?.(`Found ${candidates.length} connected data source(s).`, true);
  }

  return candidates;
}

export const definition = {
  name: "get_connected_data",
  description:
    "Return metadata about data objects already connected to the current context (immediate items and their imports).",
  parameters: {
    type: "object",
    properties: {
      annotated: {
        type: "boolean",
        description:
          "Include annotated hierarchy details (counts, filters, schema metadata) for each connected item.",
        default: false,
      },
    },
    additionalProperties: false,
  },
};

export default { implementation, definition };
