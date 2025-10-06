import { createPrimitive, fetchPrimitive, findPrimitiveOriginParent } from "../../SharedFunctions.js";
import { getLogger } from "../../logger.js";

const logger = getLogger("agent_categorization_helper", "debug", 0);

const CATEGORY_DEFAULT_TITLE = "LLM Categorization";
const ALLOWED_PARENT_TYPES = new Set(["view", "query", "board"]);

export function normalizeCategorizationField(field) {
  if (typeof field !== "string") {
    return null;
  }

  const trimmed = field.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "context" || lower === "title") {
    return lower;
  }

  if (lower.startsWith("param.")) {
    return trimmed.slice(trimmed.indexOf(".") + 1).trim();
  }

  return trimmed;
}

function sanitizeTitle(value, fallback) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 200);
  }
  return fallback;
}

export async function materializeCategorization({
  parentId,
  categories = [],
  field = null,
  theme = null,
  referenceIds,
  title = null,
}) {
  const normalizedCategories = Array.isArray(categories) ? categories.filter(Boolean) : [];
  if (!normalizedCategories.length) {
    throw new Error("At least one category definition is required");
  }

  if (!parentId) {
    throw new Error("parentId is required to create a categorization");
  }

  let parent = await fetchPrimitive(parentId);
  if (!parent) {
    throw new Error("Unable to locate the parent object for categorization");
  }

  if (!ALLOWED_PARENT_TYPES.has(parent.type)) {
    const ancestor = await findPrimitiveOriginParent(parent, ["view", "board"]);
    if (ancestor && ALLOWED_PARENT_TYPES.has(ancestor.type)) {
      parent = ancestor;
    } else {
      throw new Error("Categorizations can only be created on a connected view or board");
    }
  }

  const workspaceId = parent.workspaceId;
  const normalizedField = normalizeCategorizationField(field);

  const categorizationTitle = sanitizeTitle(
    title,
    theme
      ? `${theme} categorization`
      : normalizedField
        ? `Categorization of ${normalizedField}`
        : CATEGORY_DEFAULT_TITLE,
  );

  const referenceParameters = {
    field: normalizedField
      ? normalizedField === "context" || normalizedField === "title"
        ? normalizedField
        : `param.${normalizedField}`
      : undefined,
    theme: theme ?? undefined,
    referenceId: referenceIds,
    created_by_agent: true,
  };

  const container = await createPrimitive({
    workspaceId,
    parent: parent.id,
    paths: ["origin"],
    data: {
      type: "category",
      title: categorizationTitle,
      referenceParameters,
    },
  });

  if (!container) {
    throw new Error("Failed to create categorization container");
  }

  const childIds = [];
  for (let index = 0; index < normalizedCategories.length; index += 1) {
    const raw = normalizedCategories[index] ?? {};
    const childTitle = sanitizeTitle(raw.title, `Category ${index + 1}`);
    const childDescription = typeof raw.description === "string" ? raw.description.trim() : undefined;

    const child = await createPrimitive({
      workspaceId,
      parent: container.id,
      paths: ["origin"],
      data: {
        type: "category",
        title: childTitle,
        referenceParameters: {
          description: childDescription,
          order: index + 1
        },
      },
    });

    if (!child) {
      logger.warn("Failed to create child category", { containerId: container.id, index });
      continue;
    }

    childIds.push(child.id);
  }

  logger.info("Created categorization", {
    containerId: container.id,
    categoryCount: childIds.length,
    parentId: parent.id,
  });

  return {
    container,
    categoryId: container.id,
    subCategoryIds: childIds,
    parentId: parent.id,
  };
}
