import OpenAI from "openai";
import { getLogger } from "../../logger.js";
import { categoryDetailsForAgent } from "../utils.js";
import { recordUsage } from "../../usage_tracker.js";
import { generateDetailedSections } from "./analysis_section_engine.js";
import {
  touchSlideState,
  getCachedSampleData,
  setCachedSampleData,
  getCachedCategories,
  setCachedCategories,
  getCachedExistingCategorizations,
  setCachedExistingCategorizations
} from "./slides.js";
import { applyLayoutPresetToSections } from "./sharedLayout.js";
import { VIEW_OPTIONS } from "./suggest_visualizations.js";
import { SINGLE_SLIDE_OUTLINE_SCHEMA, SKELETON_SYSTEM_PROMPT } from "./slide_outline_schemas.js";

const logger = getLogger("agent_module_design_slide", "debug", 0);

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

function ensureSlidesState(scope) {
  if (scope.mode === "slides" && scope.modeState) {
    return scope.modeState;
  }
  if (typeof scope.activateMode === "function") {
    return scope.activateMode("slides");
  }
  return null;
}

function normalizeOutline(outline, fallbackId = 1) {
  if (!outline || typeof outline !== "object") {
    return null;
  }
  const sections = Array.isArray(outline.sections) ? outline.sections : [];
  return {
    id: typeof outline.id === "number" ? outline.id : fallbackId,
    description: outline.description ?? outline.title ?? "Slide",
    layout: outline.layout ?? "full_page",
    defs: outline.defs ?? undefined,
    sections
  };
}

async function outlineFromRequest(openai, params, contextMessages) {
  const messages = [
    { role: "system", content: SKELETON_SYSTEM_PROMPT },
    ...contextMessages,
    {
      role: "user",
      content: `Create a single slide outline that satisfies the user's explicit request:\n${params.request}`
    },
    {
      role: "user",
      content: "Include a title (<=10 plain-language words) for every section and avoid schema field names or {$ref} syntax in those titles."
    },
    {
      role: "user",
      content: "Output MUST match the JSON schema. Provide exactly one suggestion in the suggestions array."
    }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages,
    response_format: {
      type: "json_schema",
      json_schema: SINGLE_SLIDE_OUTLINE_SCHEMA
    }
  });

  recordUsage({
    workspace: params.scopeWorkspaceId,
    functionName: "agent_module_design_slide",
    usageId: "agent_module_design_slide_outline",
    api: "open_ai",
    data: response
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    return null;
  }
  try {
    const parsed = JSON.parse(content);
    const suggestion = parsed?.suggestions?.[0];
    return normalizeOutline(suggestion);
  } catch (error) {
    logger.error("Failed to parse outline from request", error);
    return null;
  }
}

function buildContextMessages({ params, categoryDataAsString, sampleData, existingCategorizations }) {
  const messages = [
    { role: "user", content: `Data from source ${params.id} is available.` },
    { role: "user", content: `Here is the schema of the data:\n${categoryDataAsString}` },
    { role: "user", content: `Here is some sample data:\n${JSON.stringify(sampleData)}` },
    {
      role: "user",
      content: `Here are details of what views can be created:\n${VIEW_OPTIONS.replaceAll(/\s+/g, " ")}`
    }
  ];

  if (existingCategorizations?.length) {
    messages.push({
      role: "user",
      content: `Existing categorizations for this data:\n${JSON.stringify(existingCategorizations)}`
    });
  }

  if (params.goal) {
    messages.push({ role: "user", content: `User goal:\n${params.goal}` });
  }

  return messages;
}

export async function implementation(params, scope) {
  const slidesState = ensureSlidesState(scope);

  const sampleDataFn = scope.functionMap?.["sample_data"];
  const existingCatsFn = scope.functionMap?.["existing_categorizations"];

  const hasOutlineInput =
    (params.outline && typeof params.outline === "object") ||
    params.outline_id != null ||
    (typeof params.request === "string" && params.request.trim().length > 0);

  if (!hasOutlineInput) {
    return { error: "missing_outline_input", message: "Provide outline, outline_id, or request." };
  }

  let sampleData = getCachedSampleData(slidesState, params.id);
  sampleData = Array.isArray(sampleData) ? sampleData : null;
  let categories = getCachedCategories(slidesState, params.id);
  categories = Array.isArray(categories) ? categories : null;

  if ((!sampleData || !categories) && sampleDataFn) {
    const result = await sampleDataFn({
      limit: 20,
      ...params,
      forSample: true,
      withCategory: true
    }, scope);

    sampleData = Array.isArray(result?.data) ? result.data : sampleData;
    categories = Array.isArray(result?.categories) ? result.categories : categories;

    if (Array.isArray(sampleData)) {
      setCachedSampleData(slidesState, params.id, sampleData);
    }
    if (Array.isArray(categories)) {
      setCachedCategories(slidesState, params.id, categories);
    }
  }

  if (!sampleData || !categories) {
    return {
      data_missing: sampleData === undefined,
      metadata_missing: categories === undefined,
      metatdata: categories === undefined
    };
  }

  let existingCategorizations =
    getCachedExistingCategorizations(slidesState, params.id);

  if (existingCategorizations == null && existingCatsFn) {
    const result = await existingCatsFn({
      ...params,
      forSample: true,
      withCategory: true
    }, scope);

    existingCategorizations =
      typeof result?.categories !== "undefined" ? result.categories : existingCategorizations;

    if (existingCategorizations != null) {
      setCachedExistingCategorizations(slidesState, params.id, existingCategorizations);
    }
  }

  const categoryDefs = categories
    .map((entry) => categoryDetailsForAgent(entry))
    .filter(Boolean);
  const categoryDataAsString = JSON.stringify(categoryDefs);

  let outline = normalizeOutline(params.outline);

  if (!outline && params.outline_id != null) {
    const stored = slidesState?.suggestions?.find((s) => s.id === params.outline_id);
    outline = normalizeOutline(stored);
  }

  const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });

  if (!outline && typeof params.request === "string" && params.request.trim()) {
    try {
      outline = await outlineFromRequest(openai, {
        ...params,
        scopeWorkspaceId: scope.workspaceId
      }, buildContextMessages({
        params,
        categoryDataAsString,
        sampleData,
        existingCategorizations
      }));
    } catch (error) {
      logger.error("Failed to derive outline from request", error);
      outline = null;
    }
  }

  if (!outline) {
    return { error: "missing_outline" };
  }

  if (params.title_override) {
    outline.description = params.title_override;
  }
  if (params.layout_override) {
    outline.layout = params.layout_override;
  }

  const layoutApplied = applyLayoutPresetToSections(outline.layout, outline.sections || []);
  outline.layout = layoutApplied.layout;
  outline.sections = layoutApplied.sections.map(withDefaultTitle);

  const sectionRequests = (outline.sections || []).map((section, index) => ({
    section_id: section?.id ?? index + 1,
    outline: section,
    goal: params.goal,
    chart_kind: section?.chart_kind,
    _index: index
  }));

  if (slidesState) {
    slidesState.state = "preview";
    slidesState.data ||= {};
    slidesState.data.sourceId = params.id;
    if (params.goal) {
      slidesState.data.goal = params.goal;
    }
    slidesState.data.slideSpec = {
      id: outline.id ?? 1,
      title: outline.description,
      description: outline.description,
      layout: outline.layout ?? "full_page",
      defs: outline.defs,
      sections: outline.sections
    };
    slidesState.data.selection = params.outline_id ?? outline.id ?? null;
    slidesState.data.selectionSpec = outline;
    scope.touchSession?.();
    touchSlideState(scope);
  }

  const setSectionStatus = (request, status) => {
    const index = typeof request._index === "number"
      ? request._index
      : (outline.sections || []).findIndex((sec) =>
          sec.id === request.section_id || sec.id === request.existingSection?.id
        );
    if (index < 0) {
      return;
    }
    const target = outline.sections?.[index];
    if (!target) {
      return;
    }
    if (status === "ready") {
      delete target.runtime_status;
    } else {
      target.runtime_status = status;
    }
    if (slidesState) {
      touchSlideState(scope);
    }
  };

  const detailedSections = await generateDetailedSections({
    openai,
    scope,
    goal: params.goal,
    sourceId: params.id,
    categoryData: categoryDefs,
    sectionRequests,
    slideDefs: outline.defs,
    sampleData,
    existingCategorizations,
    usage: {
      functionName: "agent_module_design_slide",
      usageId: "agent_module_design_slide_section"
    },
    onSectionStatusChange: setSectionStatus
  });

  const refinedSections = (detailedSections || [])
    .filter(Boolean)
    .map((section, index) => ({
      ...section,
      id: section?.id ?? sectionRequests[index]?.section_id ?? index + 1,
      sourceId: section?.sourceId || params.id
    }));

  const fallbackSections = (outline.sections || []).map((section, index) => ({
    ...section,
    id: section?.id ?? index + 1,
    sourceId: params.id,
    detailLevel: "outline"
  }));

  const sections = (refinedSections.length ? refinedSections : fallbackSections).map(withDefaultTitle);

  const appliedLayout = applyLayoutPresetToSections(outline.layout, sections);
  const finalSections = appliedLayout.sections.map(withDefaultTitle);
  outline.layout = appliedLayout.layout ?? outline.layout;
  outline.sections = finalSections;

  const slide = {
    id: outline.id ?? 1,
    title: outline.description,
    description: outline.description,
    layout: outline.layout ?? "full_page",
    defs: outline.defs,
    sections: finalSections
  };

  if (slidesState) {
    slidesState.state = "preview";
    slidesState.data ||= {};
    slidesState.data.sourceId = params.id;
    if (params.goal) {
      slidesState.data.goal = params.goal;
    }
    slidesState.data.slideSpec = slide;
    slidesState.data.selection = params.outline_id ?? outline.id ?? null;
    slidesState.data.selectionSpec = outline;
    scope.touchSession?.();
    touchSlideState(scope);
  }

  return { slide, sections };
}

export const definition = {
  name: "design_slide",
  description: "Expand a slide outline or free-form request into a fully detailed slide specification. Call this directly when the user has already described the slide they want.",
  parameters: {
    type: "object",
    required: ["id"],
    properties: {
      id: {
        type: "string",
        description: "ID of the source data object to analyze."
      },
      goal: {
        type: "string",
        description: "Description of what the user is trying to accomplish with the slide."
      },
      outline: {
        type: "object",
        description: "Slide outline to expand into a detailed slide (as returned by suggest_slide_skeleton)."
      },
      outline_id: {
        type: "number",
        description: "ID of a previously suggested outline stored in the current slide session."
      },
      request: {
        type: "string",
        description: "Free-form description of the slide the user wants (the agent will convert to an outline)."
      },
      title_override: {
        type: "string",
        description: "A concise title to use for the slide - should convey the focus of the slide whilst being tight and short, do not describe the layout / sections."
      },
      layout_override: {
        type: "string",
        enum: ["full_page", "left_summary", "title_override"],
        description: "Optional override for the slide layout."
      }
    },
    additionalProperties: false
  }
};
