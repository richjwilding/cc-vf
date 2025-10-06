import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { getLogger } from "../../logger.js";
import Primitive from "../../model/Primitive.js";
import PrimitiveConfig from "../../PrimitiveConfig.js";
import { processAsSingleChunk } from "../../openai_helper.js";
import {
  QueueAI,
  addRelationshipToMultiple,
  createPrimitive,
  fetchPrimitive,
  fetchPrimitives,
  findPrimitiveOriginParent,
} from "../../SharedFunctions.js";
import { materializeCategorization, normalizeCategorizationField } from "./categorization_helpers.js";

const logger = getLogger("agent_module_insight_categorization", "debug", 0);

const PLATFORM_ALIASES = new Map([
  ["instagram", ["instagram", "ig", "insta"]],
  ["reddit", ["reddit"]],
  ["linkedin", ["linkedin"]],
  ["tiktok", ["tiktok"]],
  ["trustpilot", ["trustpilot"]],
  ["google news", ["google news", "google-news", "news"]],
  ["google", ["google web", "google"]],
  ["google patents", ["google patents", "patents"]],
]);

const DEFAULT_CATEGORY_COUNT = 6;
const MAX_HISTORY_LENGTH = 20;

const instructionSchema = {
  name: "insight_instruction_plan",
  schema: {
    type: "object",
    properties: {
      objective: {
        type: "string",
        description: "Concise restatement of the user's objective",
      },
      platforms: {
        type: "array",
        description: "Array of lowercase platform identifiers the user mentioned or implied",
        items: { type: "string" },
        default: [],
      },
      filters: {
        type: "array",
        description: "Keywords or entities that should be used to filter data",
        items: { type: "string" },
        default: [],
      },
      categorization: {
        type: "object",
        properties: {
          theme: {
            type: "string",
            description: "Theme or focus for categorization",
          },
          field: {
            type: "string",
            description: "Primary field/parameter to categorize",
          },
          title: {
            type: "string",
            description: "Suggested title for resulting categorization or view",
          },
          category_count: {
            type: "integer",
            minimum: 2,
            maximum: 20,
            description: "Desired number of categories",
          },
          sample_limit: {
            type: "integer",
            minimum: 50,
            description: "Optional sample size limit",
          },
        },
        required: ["theme"],
        additionalProperties: false,
      },
    },
    required: ["categorization"],
    additionalProperties: true,
  },
};

function normalizeWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizePlatform(value) {
  if (!value) return null;
  const lower = value.toLowerCase();
  for (const [canonical, aliases] of PLATFORM_ALIASES.entries()) {
    if (aliases.some((alias) => lower.includes(alias))) {
      return canonical;
    }
  }
  return null;
}

function detectPlatformsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const detected = new Set();
  for (const [canonical, aliases] of PLATFORM_ALIASES.entries()) {
    if (aliases.some((alias) => lower.includes(alias))) {
      detected.add(canonical);
    }
  }
  return Array.from(detected);
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter((val) => typeof val === "string" && val.trim().length > 0).map((val) => val.trim())));
}

function normalizeFieldCandidate(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^param\./i, "").trim();
}

function normalizeReferenceId(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const numeric = String(value).trim();
  if (!/^[-+]?\d+$/.test(numeric)) {
    return null;
  }
  const parsed = Number.parseInt(numeric, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeReferenceLookup(lookup = {}) {
  const result = {};
  for (const [key, value] of Object.entries(lookup || {})) {
    const normalized = normalizeReferenceId(value);
    if (normalized !== null) {
      result[String(key)] = normalized;
    }
  }
  return result;
}

function keywordScore(text = "", keywords = []) {
  if (!text || !keywords.length) {
    return 0;
  }
  const lower = text.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (!keyword) continue;
    const token = keyword.toLowerCase();
    if (token.length < 3) continue;
    if (lower.includes(token)) {
      score += 1;
    }
  }
  return score;
}

function extractInstructionKeywords(instructions, limit = 12) {
  if (typeof instructions !== "string") {
    return [];
  }
  const tokens = instructions
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && token.length >= 3 && !stopWords.has(token));
  return tokens.slice(0, limit);
}

const stopWords = new Set([
  "the","and","for","with","from","that","this","into","about","their","there","what","when","where","which","will","would",
  "could","should","over","under","between","across","while","after","before","using","based","include","including","analysis",
  "analyze","analysis","categorize","category","categories","group","groups","grouping","data","dataset","datasets","insight","insights",
  "user","users","people","information","looking","look","want","need","help","please"
]);

function ensureInsightState(scope) {
  if (!scope) {
    return null;
  }

  let state = null;
  if (scope.mode === "insights" && scope.modeState) {
    state = scope.modeState;
  } else if (scope.getStoredModeState) {
    state = scope.getStoredModeState("insights");
  }

  const initialize = () => ({
    lastAction: null,
    history: [],
    categorizations: [],
    pendingCategorization: null,
    lastSources: null,
  });

  if (!state) {
    state = initialize();
    scope.setStoredModeState?.("insights", state);
    if (scope.mode === "insights") {
      scope.modeState = state;
    }
  } else {
    if (!Object.prototype.hasOwnProperty.call(state, "pendingCategorization")) {
      state.pendingCategorization = null;
    }
    if (!Object.prototype.hasOwnProperty.call(state, "lastSources")) {
      state.lastSources = null;
    }
  }

  return state;
}

function storeState(scope, state) {
  if (!scope || !state) {
    return;
  }
  scope.setStoredModeState?.("insights", state);
  if (scope.mode === "insights") {
    scope.modeState = state;
  }
  scope.touchSession?.();
}

async function parseInstruction(instructions) {
  const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You convert user insight-analysis requests into structured parameters. Only include platforms the user clearly references or implies.",
        },
        {
          role: "user",
          content: instructions,
        },
      ],
      response_format: { type: "json_schema", json_schema: instructionSchema },
    });

    const raw = response.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    logger.warn("Failed to parse instructions", { error: error?.message });
    return null;
  }
}

function summarizeSources(sources = []) {
  return sources.map((entry) => ({
    id: entry.id,
    title: entry.title,
    type: entry.type,
    number_results: entry.number_results,
    platforms: entry.platforms,
  }));
}

function buildPlanSummary(plan) {
  const lines = [];
  if (plan.platforms?.length) {
    lines.push(`Platforms: ${plan.platforms.join(", ")}`);
  }
  if (plan.sourceSummaries?.length) {
    const list = plan.sourceSummaries
      .map((entry) => `${entry.title ?? "Untitled"} [[id:${entry.id}]]`)
      .join(", ");
    lines.push(`Data sources (${plan.sourceSummaries.length}): ${list}`);
  }
  if (plan.existingViewId) {
    lines.push(`Active view: [[id:${plan.existingViewId}]]`);
  } else if (plan.searchSourceIds?.length) {
    lines.push("Active view: will create a new consolidated view over the target data");
  } else if (plan.preferredSourceId) {
    lines.push(`Primary source: [[id:${plan.preferredSourceId}]]`);
  }
  if (plan.categorization?.theme) {
    lines.push(`Categorization focus: ${plan.categorization.theme}`);
  }
  if (plan.categorization?.field) {
    lines.push(`Categorization field: ${plan.categorization.field}`);
  }
  if (plan.categorization?.category_count) {
    lines.push(`Target category count: ${plan.categorization.category_count}`);
  }
  return lines.join("\n");
}

async function fetchConnectedData(scope, notify) {
  const fn = scope.functionMap?.["get_connected_data"];
  if (!fn) {
    return [];
  }
  try {
    return (await fn({ annotated: true }, scope, notify)) ?? [];
  } catch (error) {
    logger.warn("get_connected_data failed", { error: error?.message });
    return [];
  }
}

async function fetchAvailableSources(platforms, scope, notify) {
  if (!Array.isArray(platforms) || !platforms.length) {
    return [];
  }
  const fn = scope.functionMap?.["get_data_sources"];
  if (!fn) {
    return [];
  }
  try {
    return (await fn({ platform: platforms }, scope, notify)) ?? [];
  } catch (error) {
    logger.warn("get_data_sources failed", { error: error?.message, platforms });
    return [];
  }
}

function expandPlatformTokens(value) {
  const tokens = new Set();
  if (value == null) {
    return tokens;
  }
  const base = String(value).toLowerCase().trim();
  if (!base) {
    return tokens;
  }
  tokens.add(base);
  const withoutParens = base.replace(/\s*\([^)]*\)/g, "").trim();
  if (withoutParens && !tokens.has(withoutParens)) {
    tokens.add(withoutParens);
  }
  const simplified = base.replace(/[^a-z0-9]+/g, " ").trim();
  if (simplified && !tokens.has(simplified)) {
    tokens.add(simplified);
  }
  return tokens;
}

function platformsMatch(entryPlatforms = [], targetPlatforms = []) {
  if (!targetPlatforms.length) {
    return true;
  }
  const entryTokens = new Set();
  for (const value of entryPlatforms || []) {
    for (const token of expandPlatformTokens(value)) {
      entryTokens.add(token);
    }
  }
  return targetPlatforms.some((platform) => {
    const target = platform.toLowerCase();
    for (const token of entryTokens) {
      if (token === target || token.includes(target) || target.includes(token)) {
        return true;
      }
    }
    return false;
  });
}

function selectRelevantSources({ connected = [], available = [], platforms = [] }) {
  const relevant = new Map();

  const consider = (entry, sourceType) => {
    if (!entry?.id) return;
    if (platforms.length && !platformsMatch(entry.platforms, platforms)) {
      return;
    }
    const normalizedReferenceIds = Array.isArray(entry.referenceIds)
      ? entry.referenceIds
          .map((refId) => normalizeReferenceId(refId))
          .filter((refId) => refId !== null)
      : [];
    const normalized = {
      id: String(entry.id),
      title: entry.title,
      type: entry.type,
      number_results: entry.number_results,
      platforms: (entry.platforms || []).map((p) => p?.toLowerCase?.() ?? p),
      sourceType,
      connection_reason: entry.connection_reason,
      referenceId: normalizeReferenceId(entry.referenceId),
      referenceIds: normalizedReferenceIds,
      metadata: entry.metadata,
      schema: entry.schema,
    };
    if (!relevant.has(normalized.id)) {
      relevant.set(normalized.id, normalized);
    } else if (sourceType === "connected") {
      relevant.set(normalized.id, normalized);
    }
  };

  connected.forEach((entry) => consider(entry, "connected"));
  available.forEach((entry) => consider(entry, "available"));

  const all = Array.from(relevant.values());
  const byType = {};
  for (const entry of all) {
    const type = entry.type ?? "unknown";
    if (!byType[type]) {
      byType[type] = [];
    }
    byType[type].push(entry);
  }

  return { all, byType };
}

async function findExistingViewForSources(searchIds, connectedViews, scope) {
  if (!searchIds.length) {
    return null;
  }

  // Check connected views first.
  if (connectedViews.length) {
    try {
      const candidates = await fetchPrimitives(connectedViews.map((entry) => entry.id));
      for (const candidate of candidates ?? []) {
        if (!candidate) continue;
        const imports = (candidate.primitives?.imports || []).map(String);
        if (searchIds.every((id) => imports.includes(id))) {
          return candidate.id;
        }
      }
    } catch (error) {
      logger.warn("Failed to evaluate connected views", { error: error?.message });
    }
  }

  try {
    const view = await Primitive.findOne({
      workspaceId: scope.workspaceId,
      type: "view",
      deleted: { $exists: false },
      "primitives.imports": { $all: searchIds },
    })
      .select({ _id: 1 })
      .lean();
    if (view?._id) {
      return String(view._id);
    }
  } catch (error) {
    logger.warn("Failed to query views by imports", { error: error?.message });
  }

  return null;
}

function buildDefaultReferenceParameters(referenceId) {
  const base = {
    target: "items",
    descend: true,
    explore: {
      view: 0,
      axis: {
        column: { type: "none", filter: [] },
        row: { type: "none", filter: [] },
      },
      filterTrack: 0,
    },
  };

  if (referenceId !== null && referenceId !== undefined) {
    base.referenceId = referenceId;
  }

  return base;
}

async function gatherReferenceMetadata(sourceIds, plan, scope, notify, options = {}) {
  const ids = (Array.isArray(sourceIds) ? sourceIds : [sourceIds])
    .filter(Boolean)
    .map((value) => String(value));

  if (!ids.length) {
    return { referenceId: null, referenceIds: [], referenceLookup: {}, fieldDefinitions: new Map() };
  }

  const captureFields = options.captureFields === true;
  const resolvedLookup = normalizeReferenceLookup(plan?.referenceLookup);
  const fieldDefinitions = new Map();

  if (Array.isArray(plan?.schemaFields)) {
    for (const entry of plan.schemaFields) {
      const sourceId = entry?.sourceId;
      const fieldName = entry?.field;
      const definition = entry?.definition;
      if (!sourceId || !fieldName || !definition) {
        continue;
      }
      const existing = fieldDefinitions.get(sourceId) ?? [];
      existing.push({ [fieldName]: definition });
      fieldDefinitions.set(sourceId, existing);
    }
  }

  const referenceSet = new Set(Object.values(resolvedLookup).filter((value) => value !== null));

  const objectParamsFn = scope.functionMap?.["object_params"];
  for (const sourceId of ids) {
    const currentRef = normalizeReferenceId(resolvedLookup[sourceId]);
    const needsLookup = currentRef === null || (captureFields && !fieldDefinitions.has(sourceId));
    if (!needsLookup) {
      continue;
    }
    if (typeof objectParamsFn !== "function") {
      continue;
    }
    try {
      const result = await objectParamsFn(
        { id: sourceId },
        { ...scope, withId: true },
        notify,
      );
      if (Array.isArray(result?.referenceIds)) {
        const normalizedRefs = result.referenceIds
          .map((refId) => normalizeReferenceId(refId))
          .filter((refId) => refId !== null);

        if (currentRef === null && normalizedRefs.length) {
          resolvedLookup[sourceId] = normalizedRefs[0];
        }

        for (const refId of normalizedRefs) {
          referenceSet.add(refId);
        }
      }
      if (captureFields && Array.isArray(result?.fields) && result.fields.length) {
        const normalized = result.fields.filter((entry) => entry && typeof entry === "object");
        if (normalized.length) {
          fieldDefinitions.set(sourceId, normalized);
        }
      }
    } catch (error) {
      logger.debug("object_params lookup failed", { error: error?.message, sourceId });
    }
  }

  const referenceIds = Array.from(referenceSet);

  const primaryRef = ids
    .map((id) => normalizeReferenceId(resolvedLookup[id]))
    .find((ref) => ref !== null) ?? referenceIds[0] ?? null;

  return {
    referenceId: primaryRef ?? null,
    referenceIds,
    referenceLookup: normalizeReferenceLookup(resolvedLookup),
    fieldDefinitions,
  };
}

function collectSchemaFieldDefinitions(sourceEntries = [], referenceLookup = {}, fieldDefinitionMap = new Map()) {
  const fieldMap = new Map();
  const entryById = new Map(
    (sourceEntries ?? [])
      .filter((entry) => entry && entry.id)
      .map((entry) => [String(entry.id), entry])
  );

  const definitionEntries = fieldDefinitionMap instanceof Map
    ? fieldDefinitionMap.entries()
    : Object.entries(fieldDefinitionMap ?? {});

  const resolveCategoryId = (sourceId) => {
    const entry = entryById.get(sourceId);
    if (entry?.referenceIds?.length) {
      const normalized = normalizeReferenceId(entry.referenceIds[0]);
      if (normalized !== null) {
        return normalized;
      }
    }
    if (referenceLookup?.[sourceId] !== undefined) {
      const normalized = normalizeReferenceId(referenceLookup[sourceId]);
      if (normalized !== null) {
        return normalized;
      }
    }
    if (entry?.referenceId !== undefined) {
      const normalized = normalizeReferenceId(entry.referenceId);
      if (normalized !== null) {
        return normalized;
      }
    }
    return null;
  };

  let added = false;
  for (const [sourceIdRaw, descriptors] of definitionEntries) {
    const sourceId = String(sourceIdRaw);
    const descriptorList = Array.isArray(descriptors) ? descriptors : [];
    if (!descriptorList.length) {
      continue;
    }
    const categoryId = resolveCategoryId(sourceId);
    for (const descriptor of descriptorList) {
      if (!descriptor || typeof descriptor !== "object") {
        continue;
      }
      for (const [fieldName, definition] of Object.entries(descriptor)) {
        if (!fieldName || !definition || typeof definition !== "object") {
          continue;
        }
        fieldMap.set(fieldName, {
          definition,
          categoryId: categoryId ?? null,
          sourceId,
        });
        added = true;
      }
    }
  }

  if (added) {
    return fieldMap;
  }

  for (const [sourceId, entry] of entryById.entries()) {
    const categoryId = resolveCategoryId(sourceId);
    const candidateMetadata = entry.schema?.metadata && typeof entry.schema.metadata === "object"
      ? entry.schema.metadata
      : entry.metadata && typeof entry.metadata === "object"
        ? entry.metadata
        : null;
    if (!candidateMetadata) {
      continue;
    }
    for (const [fieldName, definition] of Object.entries(candidateMetadata)) {
      if (!definition || typeof definition !== "object") {
        continue;
      }
      fieldMap.set(fieldName, {
        definition,
        categoryId: categoryId ?? null,
        sourceId,
      });
    }
  }

  return fieldMap;
}

function pickFieldFromSchema(requestedField, schemaFields) {
  if (!schemaFields || !schemaFields.size) {
    return requestedField ?? null;
  }

  const normalizedRequested = requestedField ? requestedField.toLowerCase() : null;
  if (normalizedRequested) {
    for (const [fieldName] of schemaFields) {
      if (fieldName.toLowerCase() === normalizedRequested) {
        return fieldName;
      }
    }
  }

  if (normalizedRequested) {
    for (const [fieldName, info] of schemaFields) {
      const label = typeof info.definition?.title === "string" ? info.definition.title.toLowerCase() : null;
      if (label && (label === normalizedRequested || label.includes(normalizedRequested) || normalizedRequested.includes(label))) {
        return fieldName;
      }
    }
  }

  const preferredOrder = [normalizedRequested, "description", "body", "content", "text", "summary", "title"].filter(Boolean);
  for (const preferred of preferredOrder) {
    for (const [fieldName] of schemaFields) {
      if (fieldName.toLowerCase().includes(preferred)) {
        return fieldName;
      }
    }
  }

  const textualCandidates = [];
  for (const [fieldName, info] of schemaFields) {
    const type = typeof info.definition?.type === "string" ? info.definition.type.toLowerCase() : "";
    if (["string", "text", "markdown"].some((needle) => type.includes(needle))) {
      textualCandidates.push(fieldName);
    }
  }
  if (textualCandidates.length) {
    return textualCandidates[0];
  }

  return schemaFields.keys().next().value ?? requestedField ?? null;
}

async function fetchFieldSample({ sourceId, field, scope, notify, limit = 40 }) {
  const sampleFn = scope.functionMap?.["sample_data"];
  if (typeof sampleFn !== "function" || !sourceId || !field) {
    return { values: [], coverage: 0 };
  }
  try {
    const sample = await sampleFn({ id: sourceId, limit }, scope, notify);
    const rows = Array.isArray(sample?.data) ? sample.data : Array.isArray(sample) ? sample : [];
    const values = rows
      .map((row) => {
        if (row && typeof row === "object") {
          if (Object.prototype.hasOwnProperty.call(row, field)) {
            return row[field];
          }
          if (row[field?.toLowerCase?.()] !== undefined) {
            return row[field.toLowerCase()];
          }
        }
        return undefined;
      })
      .filter((value) => value !== undefined && value !== null && String(value).trim().length > 0);
    const coverage = rows.length ? values.length / rows.length : 0;
    return {
      values: values.slice(0, limit),
      uniqueValues: Array.from(new Set(values.map((value) => String(value).trim()))),
      coverage,
      totalSampled: rows.length,
    };
  } catch (error) {
    logger.debug("fetchFieldSample failed", { error: error?.message, sourceId, field });
    return { values: [], coverage: 0 };
  }
}

async function rankFieldCandidatesWithLlm({ instructions, candidates }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return new Map();
  }

  const payload = candidates.slice(0, 5).map((candidate) => ({
    field: candidate.field,
    coverage: candidate.sample.coverage,
    unique_examples: candidate.sample.uniqueValues?.slice(0, 6) ?? [],
    schema_title: candidate.schemaTitle ?? null,
    schema_description: candidate.schemaDescription ?? null,
  }));

  const prompt = [
    "You are ranking data fields for categorization.",
    "Consider the user's objective and the candidate fields provided.",
    `User instruction: ${instructions}`,
    "Each candidate shows the proportion of sampled rows with non-empty values (coverage) and several example values.",
    "Score relevance from 0 to 10. Favor fields whose values directly support the user's requested categorization.",
    "Return JSON: {\"evaluations\":[{\"field\":string,\"relevance_score\":number,\"reason\":string}]}.",
    "Only include fields that appear in the candidate list.",
    "Candidates:",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");

  try {
    const response = await processAsSingleChunk(prompt, {
      engine: "o4-mini",
      output: "Provide the result as a json object with an array called evaluations, each entry having fields 'field', 'relevance_score', and 'reason'. Do not include anything other than the json object in your response.",
    });

    if (!response?.success || !Array.isArray(response?.results?.evaluations)) {
      return new Map();
    }

    const mapped = new Map();
    for (const entry of response.results.evaluations) {
      const fieldName = typeof entry?.field === "string" ? entry.field : null;
      if (!fieldName) continue;
      const score = Number.isFinite(entry?.relevance_score) ? Number(entry.relevance_score) : 0;
      const reason = typeof entry?.reason === "string" ? entry.reason : "";
      mapped.set(fieldName, { score, reason });
    }
    return mapped;
  } catch (error) {
    logger.debug("rankFieldCandidatesWithLlm failed", { error: error?.message });
    return new Map();
  }
}

async function createViewForPlan(plan, scope, notify) {
  const searchIds = plan.searchSourceIds ?? [];
  if (!searchIds.length) {
    throw new Error("No search sources available to create a view");
  }

  let parent = scope.primitive;
  if (!parent || (parent.type !== "board" && parent.type !== "flow")) {
    try {
      parent = await findPrimitiveOriginParent(scope.primitive, ["board", "flow"]);
    } catch (error) {
      logger.warn("Failed to resolve parent for new view", { error: error?.message });
    }
  }

  if (!parent) {
    throw new Error("Unable to determine a parent to attach the new view");
  }

  notify?.("Creating consolidated view...", true);

  const { referenceId, referenceLookup: updatedLookup } = await gatherReferenceMetadata(searchIds, plan, scope, notify);
  if (updatedLookup) {
    plan.referenceLookup = {
      ...normalizeReferenceLookup(plan.referenceLookup),
      ...normalizeReferenceLookup(updatedLookup),
    };
  }
  const referenceParameters = buildDefaultReferenceParameters(referenceId);
  const renderConfig = {
    style: "default",
    colors: "default",
    order: "high_to_low",
  };

  const title = plan.viewTitle || `Insight view - ${new Date().toISOString().slice(0, 10)}`;

  const data = {
    workspaceId: parent.workspaceId,
    paths: ["origin"],
    parent: parent.id,
    data: {
      type: "view",
      title,
      referenceId: PrimitiveConfig.Constants.VIEW,
      referenceParameters,
      renderConfig,
    },
  };

  const view = await createPrimitive(data);
  if (!view) {
    throw new Error("Failed to create view");
  }

  try {
    await addRelationshipToMultiple(view.id, searchIds, "imports", parent.workspaceId);
  } catch (error) {
    logger.warn("Failed to attach sources to new view", { error: error?.message, viewId: view.id });
  }

  await scope.linkToChat?.(view.id);
  notify?.(`[[chat_scope:${view.id}]]`, false, true);

  return view.id;
}

function storePlan(scope, plan) {
  const state = ensureInsightState(scope);
  if (!state) {
    return;
  }

  state.pendingCategorization = plan;

  const summaryEntry = {
    type: "categorization_plan",
    timestamp: new Date().toISOString(),
    plan: {
      id: plan.id,
      theme: plan.categorization?.theme,
      field: plan.categorization?.field,
      category_count: plan.categorization?.category_count,
      platforms: plan.platforms,
      source_ids: plan.sourceIds,
      existing_view_id: plan.existingViewId ?? null,
      preferred_source_id: plan.preferredSourceId ?? null,
      requires_confirmation: plan.requiresConfirmation ?? false,
    },
  };

  state.lastAction = summaryEntry;
  state.history = [summaryEntry, ...(state.history || [])].slice(0, MAX_HISTORY_LENGTH);
  storeState(scope, state);
}

function clearPlan(scope) {
  const state = ensureInsightState(scope);
  if (!state) {
    return;
  }
  state.pendingCategorization = null;
  storeState(scope, state);
}

function getPlan(scope, planId) {
  const state = ensureInsightState(scope);
  const plan = state?.pendingCategorization;
  if (!plan) {
    return null;
  }
  if (planId && plan.id !== planId) {
    return null;
  }
  return plan;
}

async function runSuggestCategories(plan, activeSourceId, scope, notify) {
  const fn = scope.functionMap?.["suggest_categories"];
  if (!fn) {
    throw new Error("suggest_categories tool is unavailable in this context");
  }

  const payload = {
    sourceIds: [activeSourceId],
    theme: plan.categorization?.theme,
    field: normalizeCategorizationField(plan.categorization?.field) ?? plan.categorization?.field,
    number: plan.categorization?.category_count ?? DEFAULT_CATEGORY_COUNT,
    confirmed: true,
  };

  const result = await fn(payload, scope, notify);
  if (result?.error) {
    throw new Error(result.error);
  }

  const state = ensureInsightState(scope);
  const lastAction = state?.lastAction;
  const categories = lastAction?.categories ?? result?.categories;
  const referenceIds = lastAction?.referenceIds ?? [];

  if (!categories?.length) {
    throw new Error("Unable to derive categories from data");
  }

  return { categories, referenceIds };
}

async function executeCategorization(plan, activeSourceId, scope, notify) {
  notify?.("Generating categories from data...", true);
  const { categories, referenceIds } = await runSuggestCategories(plan, activeSourceId, scope, notify);

  notify?.("Creating categorization...", true);
  const theme = plan.categorization?.theme;
  const field = plan.categorization?.field;
  const title = plan.categorization?.title || `${theme ?? "Insight"} categorization`;

  const result = await materializeCategorization({
    parentId: activeSourceId,
    categories,
    referenceIds,
    field,
    theme,
    title,
  });

  await scope.linkToChat?.(result.container.id);
  notify?.(`Created categorization [[id:${result.container.id}]]`, false, true);

  try {
    const target = await fetchPrimitive(activeSourceId);
    if (target) {
      notify?.("Running categorization...", true);
      await QueueAI().markCategories(result.container, target);
    }
  } catch (error) {
    logger.warn("Failed to queue categorization run", { error: error?.message, categorizationId: result.categoryId });
  }

  clearPlan(scope);

  return {
    categorization_id: result.categoryId,
    view_id: activeSourceId,
    category_count: categories.length,
  };
}

async function prepareImplementation(params = {}, scope = {}, notify) {
  try {
    const instructions = normalizeWhitespace(params.instructions);
    if (!instructions) {
      return { error: "Please provide instructions to analyze." };
    }

    notify?.("Parsing request...", true);
    const parsed = await parseInstruction(instructions);

    const detectedPlatforms = detectPlatformsFromText(instructions);
    const requestedPlatforms = uniqueStrings((parsed?.platforms || []).map(normalizePlatform).filter(Boolean));
    const platforms = uniqueStrings([...requestedPlatforms, ...detectedPlatforms]);

    const filters = uniqueStrings(parsed?.filters || []);
    const categoryCount = parsed?.categorization?.category_count ?? DEFAULT_CATEGORY_COUNT;
    const requestedField = normalizeFieldCandidate(parsed?.categorization?.field);
    const theme = parsed?.categorization?.theme || instructions;
    const title = parsed?.categorization?.title || `Categorization - ${theme}`;

    const state = ensureInsightState(scope);

    let connected = Array.isArray(state?.lastSources?.connected)
      ? state.lastSources.connected
      : [];
    if (!connected.length) {
      notify?.("Assessing connected sources...", true);
      connected = await fetchConnectedData(scope, notify);
    }

    let available = Array.isArray(state?.lastSources?.data_sources)
      ? state.lastSources.data_sources
      : [];

    const coversPlatforms = (sourcesList = [], targets = []) => {
      if (!targets.length) {
        return true;
      }
      return targets.every((target) =>
        sourcesList.some((entry) => platformsMatch(entry.platforms, [target]))
      );
    };

    if (!available.length || !coversPlatforms(available, platforms)) {
      notify?.("Assessing saved data sources...", true);
      available = await fetchAvailableSources(platforms, scope, notify);
    }

    const sources = selectRelevantSources({ connected, available, platforms });

    if (!sources.all.length) {
      return {
        error: "No relevant data sources found for the requested platforms.",
      };
    }

    const searchEntries = sources.byType.search ?? [];
    const viewEntries = sources.byType.view ?? [];
    const queryEntries = sources.byType.query ?? [];
    const filterEntries = sources.byType.filter ?? [];
    const summaryEntries = sources.byType.summary ?? [];

    const searchSourceIds = searchEntries.map((entry) => entry.id);

    let existingViewId = null;
    if (viewEntries.length) {
      existingViewId = viewEntries[0].id;
    } else {
      if (searchSourceIds.length) {
        existingViewId = await findExistingViewForSources(searchSourceIds, viewEntries, scope);
      }
      if (!existingViewId && queryEntries.length) {
        existingViewId = queryEntries[0].id;
      }
    }

    const preferredSourceId = existingViewId
      ?? viewEntries[0]?.id
      ?? queryEntries[0]?.id
      ?? filterEntries[0]?.id
      ?? summaryEntries[0]?.id
      ?? sources.all[0]?.id
      ?? null;

  const initialReferenceLookup = sources.all.reduce((acc, entry) => {
      const key = String(entry.id);
      const candidateRefs = Array.isArray(entry.referenceIds)
        ? entry.referenceIds
            .map((refId) => normalizeReferenceId(refId))
            .filter((refId) => refId !== null)
        : [];
      if (candidateRefs.length) {
        acc[key] = candidateRefs[0];
      } else if (entry?.referenceId !== undefined) {
        const normalized = normalizeReferenceId(entry.referenceId);
        if (normalized !== null) {
          acc[key] = normalized;
        }
      }
      return acc;
    }, {});

    const gatherMetaForFields = await gatherReferenceMetadata(
      sources.all.map((entry) => entry.id),
      { referenceLookup: initialReferenceLookup },
      scope,
      notify,
      { captureFields: true },
    );

    const referenceLookup = normalizeReferenceLookup(
      gatherMetaForFields.referenceLookup ?? initialReferenceLookup,
    );
    const schemaFieldMap = collectSchemaFieldDefinitions(
      sources.all,
      referenceLookup,
      gatherMetaForFields.fieldDefinitions,
    );

    const instructionKeywords = extractInstructionKeywords(instructions);
    const fieldCandidates = Array.from(schemaFieldMap.entries()).map(([fieldName, info]) => {
      const definition = info.definition ?? {};
      const title = typeof definition.title === "string" ? definition.title : "";
      const type = typeof definition.type === "string" ? definition.type : "";
      const description = typeof definition.description === "string" ? definition.description : "";
      const baseScore =
        keywordScore(fieldName, instructionKeywords) * 2 +
        keywordScore(title, instructionKeywords) * 1.5 +
        keywordScore(description, instructionKeywords) * 1;
      const textTypeBonus = /string|text|markdown|summary/i.test(type) ? 2 : 0;
      return {
        field: fieldName,
        score: baseScore + textTypeBonus,
        info,
        schemaTitle: title,
        schemaType: type,
        schemaDescription: description,
      };
    });

    fieldCandidates.sort((a, b) => b.score - a.score);

    const samplingTargets = fieldCandidates.slice(0, 5);
    const sampledFields = [];
    for (const candidate of samplingTargets) {
      const sample = await fetchFieldSample({
        sourceId: candidate.info.sourceId,
        field: candidate.field,
        scope,
        notify,
      });
      sampledFields.push({
        ...candidate,
        sample,
      });
    }

    const llmCandidatesInput = sampledFields.filter(({ sample }) => sample.coverage > 0 && sample.uniqueValues?.length);
    const llmEvaluations = await rankFieldCandidatesWithLlm({
      instructions,
      candidates: llmCandidatesInput,
    });

    const viableFields = sampledFields
      .filter(({ sample }) => sample.coverage > 0 && sample.uniqueValues?.length)
      .map((entry) => {
        const richness = Math.min(entry.sample.uniqueValues.length / 10, 3);
        const coverageBonus = entry.sample.coverage * 5;
        const llmResult = llmEvaluations.get(entry.field) ?? { score: 0, reason: "" };
        const llmScore = Number.isFinite(llmResult.score) ? llmResult.score : 0;
        const finalScore = entry.score + richness + coverageBonus + llmScore * 2;
        return { ...entry, finalScore, llmScore, llmReason: llmResult.reason ?? "" };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    let selectedField;
    let fieldEvaluations = viableFields;
    if (viableFields.length) {
      selectedField = viableFields[0].field;
    } else {
      selectedField = pickFieldFromSchema(requestedField, schemaFieldMap) || requestedField || null;
      fieldEvaluations = [];
      if (!selectedField) {
        return {
          error: "Unable to identify a field with useful data for categorization.",
        };
      }
    }

    const plan = {
      id: randomUUID(),
      instructions,
      platforms,
      filters,
      sourceIds: sources.all.map((entry) => entry.id),
      sourceSummaries: summarizeSources(sources.all),
      searchSourceIds,
      existingViewId,
      preferredSourceId,
      referenceLookup,
      schemaFields: schemaFieldMap.size
        ? Array.from(schemaFieldMap.entries()).map(([name, info]) => ({
            field: name,
            categoryId: info.categoryId,
            sourceId: info.sourceId,
            definition: info.definition,
            title: typeof info.definition?.title === "string" ? info.definition.title : undefined,
            type: info.definition?.type,
          }))
        : undefined,
      fieldEvaluations: fieldEvaluations.map((entry) => ({
        field: entry.field,
        score: entry.finalScore,
        sourceId: entry.info.sourceId,
        title: entry.schemaTitle,
        type: entry.schemaType,
        description: entry.schemaDescription,
        coverage: entry.sample.coverage,
        unique_examples: entry.sample.uniqueValues?.slice(0, 6) ?? [],
        total_sampled: entry.sample.totalSampled,
        llm_score: entry.llmScore ?? 0,
        llm_reason: entry.llmReason ?? "",
      })),
      viewTitle: title,
      categorizations: [],
      categorization: {
        theme,
        field: selectedField,
        category_count: categoryCount,
        title,
        filters,
      },
      createdAt: new Date().toISOString(),
      requiresConfirmation: true,
    };

    storePlan(scope, plan);

    if (existingViewId) {
      notify?.(`[[chat_scope:${existingViewId}]]`, false, true);
    } else if (plan.searchSourceIds.length) {
      notify?.(`[[chat_scope:${plan.searchSourceIds.join(",")}]]`, false, true);
    } else if (plan.sourceIds.length) {
      notify?.(`[[chat_scope:${plan.sourceIds.join(",")}]]`, false, true);
    }

    const summary = buildPlanSummary(plan);
    return {
      plan_id: plan.id,
      needs_new_view: !existingViewId && plan.searchSourceIds.length > 0,
      view_id: existingViewId,
      source_ids: plan.sourceIds,
      summary,
      forClient: ["context"],
      context: {
        canCreate: true,
        action_title: "Run categorization",
        type: "execute_insight_categorization",
        plan_id: plan.id,
        confirmed: true,
        plan,
        summary,
      },
    };
  } catch (error) {
    logger.error("prepare_insight_categorization failed", { error: error?.message });
    return { error: "Failed to prepare categorization plan" };
  }
}

async function executeImplementation(params = {}, scope = {}, notify) {
  try {
    let statePlan = params.plan ?? null;
    if (!statePlan) {
      statePlan = getPlan(scope, params.plan_id);
    }
    if (!statePlan) {
      return { error: "No pending categorization plan to execute." };
    }

    const confirmed = params.confirmed === true || params.plan?.confirmed === true;
    if (statePlan.requiresConfirmation && !confirmed) {
      notify?.("[[update:Awaiting confirmation before running categorization.]]", true);
      return { error: "Categorization plan has not been confirmed yet.", needs_confirmation: true };
    }

    notify?.("Setting up data context...", true);

    let activeSourceId = statePlan.existingViewId ?? statePlan.preferredSourceId ?? statePlan.sourceIds?.[0] ?? null;

    if (!statePlan.existingViewId && statePlan.searchSourceIds?.length) {
      const createdViewId = await createViewForPlan(statePlan, scope, notify);
      statePlan.existingViewId = createdViewId;
      statePlan.preferredSourceId = createdViewId;
      activeSourceId = createdViewId;
      storePlan(scope, statePlan);
    }

    if (!activeSourceId) {
      return { error: "No suitable data source was identified for categorization." };
    }

    notify?.(`[[chat_scope:${activeSourceId}]]`, false, true);

    const result = await executeCategorization(statePlan, activeSourceId, scope, notify);

    return {
      ...result,
      message: `Categorization [[id:${result.categorization_id}]] is running against view [[id:${result.view_id}]].`,
    };
  } catch (error) {
    logger.error("execute_insight_categorization failed", { error: error?.message });
    return { error: error?.message ?? "Failed to execute categorization" };
  }
}

export const prepareInsightCategorizationTool = {
  definition: {
    name: "prepare_insight_categorization",
    description:
      "Analyze the user's instruction, identify relevant data sources, and draft a plan to categorize insights. Stores the plan for later execution and reports the required setup.",
    parameters: {
      type: "object",
      properties: {
        instructions: {
          type: "string",
          description: "User instruction describing the insight task to perform.",
        },
      },
      required: ["instructions"],
      additionalProperties: false,
    },
  },
  implementation: prepareImplementation,
};

export const executeInsightCategorizationTool = {
  definition: {
    name: "execute_insight_categorization",
    description:
      "Execute the previously prepared insight categorization plan: ensure a consolidated view exists, create the categorization, and start processing.",
    parameters: {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "Identifier of the plan returned by prepare_insight_categorization. Optional if only one plan is pending.",
        },
        confirmed: {
          type: "boolean",
          description: "Set to true after the user explicitly confirms the plan should be executed.",
        },
        plan: {
          type: "object",
          description: "Optional plan payload, typically the object returned by prepare_insight_categorization.",
        },
      },
      additionalProperties: false,
    },
  },
  implementation: executeImplementation,
};

export default {
  prepareInsightCategorizationTool,
  executeInsightCategorizationTool,
};
