import { getLogger } from "../../logger.js";
import { findParentPrimitivesOfType, findPrimitiveOriginParent } from "../../SharedFunctions.js";
import { resolveId } from "../utils.js";
import { materializeCategorization } from "./categorization_helpers.js";

const logger = getLogger("agent_module_create_categorization", "debug", 0);

async function implementation(params = {}, scope = {}, notify) {
  try {
    const fallback = scope.modeState?.lastAction ?? {};
    const categories = params.categories ?? fallback.categories;

    if (!Array.isArray(categories) || categories.length === 0) {
      return { error: "No categories provided to create" };
    }

    const parentId = params.parentId ?? fallback.parentId ?? null;
    if (!parentId) {
      return { error: "A parentId is required" };
    }

    const resolvedParent = await resolveId(parentId, scope);
    let parent = [resolvedParent].flat().filter(Boolean)[0];
    if (!parent) {
      return { error: "Unable to resolve the requested parent" };
    }

    if (parent.type !== "view" && parent.type !== "query" && parent.type !== "board" && parent.type !== "flow") {      
        return { error: "Categorizations can only be created on a connected view, flow or board" };
    }

    const result = await materializeCategorization({
      parentId: parent.id,
      categories,
      referenceIds: params.referenceIds,
      field: params.field ?? fallback.field ?? null,
      theme: params.theme ?? fallback.theme ?? null,
      title: params.title ?? fallback.title ?? null,
    });

    notify?.(
      `Created categorization [[id:${result.container.id}]]`,
      true,
    );

    scope.touchSession?.();

    return {
      categorizationId: result.categoryId,
    };
  } catch (error) {
    logger.error("create_categorization failed", { error });
    return { error: "Failed to create categorization" };
  }
}

const categoriesSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", minLength: 1 },
      description: { type: "string" },
    },
    additionalProperties: false,
  },
  minItems: 1,
  maxItems: 20,
};

export const definition = {
  name: "create_categorization",
  description:
    "Create a persistent categorization under the selected view or query using previously suggested categories.",
  parameters: {
    type: "object",
    properties: {
      parentId: {
        type: "string",
        description: "ID of the view or query to attach the categorization to",
      },
      categories: {
        description: "Category title and description pairs to materialize",
        ...categoriesSchema,
      },
      field: {
        type: "string",
        description: "Field that the categorization applies to",
      },
      theme: {
        type: "string",
        description: "Theme or framing for the categorization",
      },
      title: {
        type: "string",
        description: "Short title for the categorization",
      },
    },
    required: ["parentId", "categories", "string"],
    additionalProperties: false,
  },
};

export const createCategorizationTool = {
  definition,
  implementation,
};

export { implementation };
