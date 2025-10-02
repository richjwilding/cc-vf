import OpenAI from "openai";
import { getLogger } from "../../logger.js";
import { categoryDetailsForAgent } from "../utils.js";
import { recordUsage } from "../../usage_tracker.js";
import { VIEW_OPTIONS } from "./suggest_visualizations.js";
import { ANALYSIS_OPTIONS } from "./analysis_section_engine.js";
import { buildSlideOutlineSchema, SKELETON_SYSTEM_PROMPT } from "./slide_outline_schemas.js";
import {
  touchSlideState,
  setCachedSampleData,
  setCachedCategories,
  setCachedExistingCategorizations
} from "./slides.js";
import { applyLayoutPresetToSections } from "./sharedLayout.js";

const logger = getLogger("agent_module_suggest_slide_skeleton", "debug", 0);

function withDefaultTitle(section) {
  if (!section || typeof section !== "object") {
    return section;
  }
  const rawTitle = typeof section.title === "string" ? section.title.trim() : "";
  if (rawTitle) {
    return section;
  }
  let fallback = "Slide section";
  if (section.type === "summary") {
    fallback = "Summary insight";
  } else if (section.type === "visualization") {
    fallback = "Data visualization";
  }
  return { ...section, title: fallback };
}

function clampCount(value, fallbackMin = 3, fallbackMax = 5) {
  if (value == null) {
    return { min: fallbackMin, max: fallbackMax };
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return { min: fallbackMin, max: fallbackMax };
  }
  const count = Math.min(Math.max(parsed, 1), 6);
  return { min: count, max: count };
}

function normalizeOutline(s, index) {
  if (!s || typeof s !== "object") {
    return null;
  }
  const sections = Array.isArray(s.sections) ? s.sections : [];
  const appliedLayout = applyLayoutPresetToSections(s.layout, sections);
  return {
    id: typeof s.id === "number" ? s.id : index + 1,
    description: s.description,
    layout: appliedLayout.layout ?? s.layout,
    defs: s.defs || undefined,
    sections: appliedLayout.sections.map(withDefaultTitle),
    detailLevel: "outline"
  };
}

export async function implementation(params, scope) {
  const sampleDataFn = scope.functionMap?.["sample_data"];
  const existingCatsFn = scope.functionMap?.["existing_categorizations"];

  const { data, categories } = sampleDataFn
    ? await sampleDataFn({
        limit: 20,
        ...params,
        forSample: true,
        withCategory: true
      }, scope)
    : {};

  const { categories: categorizations = [] } = existingCatsFn
    ? await existingCatsFn({
        ...params,
        forSample: true,
        withCategory: true
      }, scope)
    : {};

  if (!data || !categories) {
    return {
      data_missing: data === undefined,
      metadata_missing: categories === undefined,
      metatdata: categories === undefined
    };
  }

  const categoryDefs = categories
    .map((entry) => categoryDetailsForAgent(entry))
    .filter(Boolean);

  const categoryDataAsString = JSON.stringify(categoryDefs);
  const requested = clampCount(params.count);
  const schema = buildSlideOutlineSchema({
    minSuggestions: requested.min,
    maxSuggestions: requested.max
  });

  const messages = [
    { role: "system", content: SKELETON_SYSTEM_PROMPT },
    { role: "user", content: `Here are details of what analysis can be done:\n${ANALYSIS_OPTIONS.replaceAll(/\s+/g, " ")}` },
    { role: "user", content: `Here are details of what views can be created:\n${VIEW_OPTIONS.replaceAll(/\s+/g, " ")}` },
    { role: "user", content: `Data from source ${params.id} is available.` },
    { role: "user", content: `Here is the schema of the data:\n${categoryDataAsString}` },
    { role: "user", content: `Here is some sample data:\n${JSON.stringify(data)}` },
    categorizations.length > 0 && {
      role: "user",
      content: `Here is a list of existing categorizations of this data:\n${JSON.stringify(categorizations)}`
    },
    params.goal && { role: "user", content: `Here is the goal of the user:\n${params.goal}` },
    {
      role: "user",
      content: `Suggest ${requested.min === requested.max ? requested.min : `${requested.min}-${requested.max}`} suitable slide outlines that are achievable for the data sample, schema, and view options provided. Produce lightweight sections (type, title, overview, chart_kind if visualization) and slide-level defs ONLY for filters and categorizations. Reference defs using {$ref:'filters.<key>'} or {$ref:'categorizations.<key>'}. Use human-friendly field names. Each section title must be a plain-language label of at most 10 words and must not include schema field names or {$ref} syntax.`
    }
  ].filter(Boolean);

  const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
  let response;
  try {
    response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages,
      response_format: {
        type: "json_schema",
        json_schema: schema
      }
    });
  } catch (error) {
    logger.error("Failed to generate slide skeleton suggestions", error);
    return { error: "openai_error" };
  }

  recordUsage({
    workspace: scope.workspaceId,
    functionName: "agent_module_suggest_slide_skeleton",
    usageId: "agent_module_suggest_slide_skeleton",
    api: "open_ai",
    data: response
  });

  const content = response.choices?.[0]?.message?.content;
  let outlines = [];
  if (content) {
    try {
      const parsed = JSON.parse(content);
      outlines = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    } catch (error) {
      logger.error("Failed to parse slide skeleton suggestions", error);
    }
  }

  const suggestions = outlines
    .map((outline, index) => normalizeOutline(outline, index))
    .filter(Boolean);

  if (suggestions.length) {
    let state = null;
    if (scope.mode === "slides" && scope.modeState) {
      state = scope.modeState;
    } else if (typeof scope.activateMode === "function") {
      state = scope.activateMode("slides");
    }

    if (state) {
      state.state = "list";
      state.suggestions = suggestions;
      state.data ||= {};
      state.data.sourceId = params.id;
      if (params.goal) {
        state.data.goal = params.goal;
      }
      state.data.selection = null;
      state.data.slideSpec = null;
      state.data.selectionSpec = null;
      if (Array.isArray(data)) {
        setCachedSampleData(state, params.id, data);
      }
      if (Array.isArray(categories)) {
        setCachedCategories(state, params.id, categories);
      }
      if (categorizations != null) {
        setCachedExistingCategorizations(state, params.id, categorizations);
      }
      scope.touchSession?.();
      touchSlideState(scope);
    }
  }

  return { suggestions };
}

export const definition = {
  name: "suggest_slide_skeleton",
  description: "Produce outline-level slide suggestions when the user is still exploring ideas; skip this if the user already provided a concrete slide brief.",
  parameters: {
    type: "object",
    required: ["id", "goal"],
    properties: {
      id: {
        type: "string",
        description: "ID of the source data object to analyze."
      },
      goal: {
        type: "string",
        description: "Description of what the user is trying to learn or show."
      },
      count: {
        type: "integer",
        minimum: 1,
        maximum: 6,
        description: "Optional number of suggestions to generate."
      }
    },
    additionalProperties: false
  }
};
