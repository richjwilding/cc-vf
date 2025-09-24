// modules/slides.js
import { randomUUID } from "node:crypto";
import { getLogger } from "../../logger.js";
import { buildCategories } from "../../openai_helper.js";
import { dispatchControlUpdate } from "../../SharedFunctions.js";
import { getDataForAgentAction, categoryDetailsForAgent } from "../utils.js";
import { generateDetailedSections } from "./analysis_section_engine.js";

const logger = getLogger("agent_module_slides", "debug", 0);

export function defaultSlideState(seed = {}) {
  const data = seed.data ?? {};
  return {
    id: seed.id ?? randomUUID(),
    state: seed.state ?? "list",
    data: {
      deckId: data.deckId ?? seed.deckId ?? null,
      selection: data.selection ?? seed.selection ?? null,
      slideSpec: data.slideSpec ?? seed.slideSpec ?? null,
      selectionSpec: data.selectionSpec ?? seed.selectionSpec ?? null,
    },
    suggestions: seed.suggestions ?? [],
  };
}

function requireSlideSession(scope) {
  if (scope.mode !== "slides" || !scope.modeState) {
    throw new Error("No active slides session. Say 'work on slides' or run suggest_analysis first.");
  }
  return scope.modeState;
}

export function touchSlideState(scope) {
  const session = requireSlideSession(scope);
  const slides = scope.immediateContext?.filter((d) => d.type === "page") ?? [];
  if (slides[0]) {
    dispatchControlUpdate(slides[0].id, "slide_state", session);
  }
  scope.touchSession?.();
}

function touch(scope) {
  touchSlideState(scope);
}

function applySlideSeed(state, seed = {}) {
  if (!seed) {
    return state ?? defaultSlideState();
  }
  const normalized = defaultSlideState(seed);
  if (!state) {
    return normalized;
  }

  if (Object.prototype.hasOwnProperty.call(seed, "id")) {
    state.id = normalized.id;
  }
  if (Object.prototype.hasOwnProperty.call(seed, "state")) {
    state.state = normalized.state;
  }

  if (seed.data) {
    state.data = {
      ...(state.data || {}),
      ...(normalized.data || {}),
    };
  }

  if (Object.prototype.hasOwnProperty.call(seed, "suggestions")) {
    state.suggestions = normalized.suggestions;
  }

  return state;
}
function nextSectionId(spec) {
  const ids = (spec.sections || []).map(s => s.id || 0);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}
function normalizeSections(sections = []) {
  return sections.map((s, i) => ({
    ...s,
    id: s.id ?? (i + 1)
  }));
}

function mergeDefs(existing = {}, incoming = {}) {
  const next = { ...(existing || {}) };
  if (incoming.filters) {
    next.filters = { ...(existing?.filters || {}), ...(incoming.filters || {}) };
  }
  if (incoming.categorizations) {
    next.categorizations = { ...(existing?.categorizations || {}), ...(incoming.categorizations || {}) };
  }
  if (incoming.summaries) {
    next.summaries = { ...(existing?.summaries || {}), ...(incoming.summaries || {}) };
  }
  if (incoming.visuals) {
    next.visuals = { ...(existing?.visuals || {}), ...(incoming.visuals || {}) };
  }
  return next;
}

/* ===========================
   1) Start from a suggestion
   =========================== */

export const design_slide_from_suggestion = {
  definition: {
    name: "design_slide_from_suggestion",
    description: "Initialize a draft slide spec from a suggested analysis item.",
    parameters: {
      type: "object",
      required: ["suggestion_id"],
      properties: {
        suggestion_id: { type: "number", description: "ID from suggest_analysis output (1..N)" },
        title_override: { type: "string" },
        layout_override: { type: "string", enum: ["full_page","left_summary"] }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope, notify) => {
    const sess = requireSlideSession(scope);
    const outline = sess?.suggestions ?? [];
    const picked = outline.find(x => x.id === params.suggestion_id);
    if (!picked) return { error: "Invalid suggestion_id" };

    const draft = {
        title: params.title_override || picked.description,
        defs: picked.defs,
      layout: params.layout_override || picked.layout,
      sections: normalizeSections(picked.sections)
    };

    sess.data.slideSpec = draft;
    sess.data.selection = params.suggestion_id;
    sess.state = "preview";
    touch(scope);
    notify?.("Draft slide created from suggestion.", true);

    return { preview: draft };
  }
};

/* ===========================
   2) Global slide tweaks
   =========================== */

export const update_slide_from_suggestion = {
  definition: {
    name: "update_slide_from_suggestion",
    description: "Update the slide spec using a suggested analysis item / option.",
    parameters: {
      type: "object",
      required: ["suggestion_id"],
      properties: {
        suggestion_id: { type: "number", description: "ID from suggest_analysis output (1..N)" },
        title_override: { type: "string" },
        layout_override: { type: "string", enum: ["full_page","left_summary"] }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope, notify) => {
    const sess = requireSlideSession(scope);
    const outline = sess?.suggestions || [];
    const picked = outline.find(x => x.id === params.suggestion_id);
    if (!picked) return { error: "Invalid suggestion_id" };

    const draft = {
        title: params.title_override || picked.description,
        defs: picked.defs,
      layout: params.layout_override || picked.layout,
      sections: normalizeSections(picked.sections)
    };

    sess.data.slideSpec = draft;
    sess.data.selection = params.suggestion_id;
    sess.state = "preview";
    touch(scope);
    notify?.("Draft slide created from suggestion.", true);

    return { preview: draft };
  }
};
export const update_slide_title = {
  definition: {
    name: "update_slide_title",
    description: "Set or change the slide title in the current draft.",
    parameters: {
      type: "object",
      required: ["title"],
      properties: { title: { type: "string" } },
      additionalProperties: false
    }
  },
  implementation: async (params, scope) => {
    const sess = requireSlideSession(scope);
    sess.data.slideSpec = sess.data.slideSpec || { title: "", layout: "full_page", sections: [] };
    sess.data.slideSpec.title = params.title;
    touch(scope);
    return { preview: sess.data.slideSpec };
  }
};

export const update_slide_layout = {
  definition: {
    name: "update_slide_layout",
    description: "Change the layout of the current slide draft.",
    parameters: {
      type: "object",
      required: ["layout"],
      properties: { layout: { type: "string", enum: ["full_page","left_summary"] } },
      additionalProperties: false
    }
  },
  implementation: async (params, scope) => {
    const sess = requireSlideSession(scope);
    sess.data.slideSpec = sess.data.slideSpec || { title: "", layout: "full_page", sections: [] };
    sess.data.slideSpec.layout = params.layout;
    touch(scope);
    return { preview: sess.data.slideSpec };
  }
};

/* ===========================
   3) Section CRUD + reorder
   =========================== */

export const design_slide_sections = {
  definition: {
    name: "design_slide_sections",
    description: "Generate or refresh detailed section configurations for the current slide using the available data source.",
    parameters: {
      type: "object",
      required: ["id", "goal", "sections"],
      properties: {
        id: { type: "string", description: "ID of the source data object to analyze." },
        goal: { type: "string", description: "What the user wants to achieve with the slide." },
        slide: {
          type: "object",
          properties: {
            title: { type: "string" },
            layout: { type: "string", enum: ["full_page", "left_summary"] },
            defs: {
              type: "object",
              properties: {
                filters: { type: "object", additionalProperties: true },
                categorizations: { type: "object", additionalProperties: true },
                summaries: { type: "object", additionalProperties: true },
                visuals: { type: "object", additionalProperties: true }
              },
              additionalProperties: true
            }
          },
          additionalProperties: false
        },
        sections: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              section_id: { type: "integer" },
              sourceId: { type: "string" },
              outline: { type: "object", additionalProperties: true },
              type: { type: "string", enum: ["summary", "visualization"] },
              overview: { type: "string" },
              chart_kind: { type: "string", enum: ["heatmap", "bubble", "pie", "bar"] },
              pre_filter: { type: ["string", "object"] },
              categorization: { type: ["string", "object"] },
              summarization: { type: ["string", "object"] },
              visualization: { type: ["string", "object"] },
              instructions: { type: "string" },
              context: { type: "string" },
              goal: { type: "string" },
              insert_at: { type: "integer", minimum: 1 }
            },
            anyOf: [
              { required: ["outline"] },
              { required: ["section_id"] },
              { required: ["type", "overview"] }
            ]
          }
        }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope, notify) => {
    const sectionsInput = Array.isArray(params.sections) ? params.sections : [];
    if (sectionsInput.length === 0) {
      return { error: "sections must include at least one entry." };
    }

    let sess = null;
    if (scope.mode === "slides" && scope.modeState) {
      sess = scope.modeState;
    } else if (typeof scope.activateMode === "function") {
      sess = scope.activateMode("slides");
    }
    if (!sess) {
      return { error: "Slides session is not active." };
    }

    sess.data = sess.data || {};
    let spec = sess.data.slideSpec;
    if (!spec) {
      spec = {
        title: params.slide?.title || params.goal || "Untitled Slide",
        layout: params.slide?.layout || "full_page",
        defs: mergeDefs({}, params.slide?.defs || {}),
        sections: []
      };
      sess.data.slideSpec = spec;
      sess.state = "preview";
    } else {
      if (params.slide?.title) spec.title = params.slide.title;
      if (params.slide?.layout) spec.layout = params.slide.layout;
      if (params.slide?.defs) spec.defs = mergeDefs(spec.defs || {}, params.slide.defs);
    }

    spec.defs = spec.defs || {};
    spec.sections = Array.isArray(spec.sections) ? spec.sections : [];

    let sampleData = [];
    let categoryDefs = [];
    let existingCategorizations = null;

    try {
      const sampler = scope.functionMap?.["sample_data"];
      if (sampler) {
        const res = await sampler({ id: params.id, limit: 20, forSample: true, withCategory: true }, scope);
        if (Array.isArray(res?.data)) sampleData = res.data;
        if (Array.isArray(res?.categories)) {
          categoryDefs = res.categories.map((d) => categoryDetailsForAgent(d)).filter(Boolean);
        }
      }
    } catch (err) {
      logger.error("design_slide_sections sample_data error", err);
    }

    try {
      const existingFetcher = scope.functionMap?.["existing_categorizations"];
      if (existingFetcher) {
        const res = await existingFetcher({ id: params.id, forSample: true, withCategory: true }, scope);
        if (res?.categories) existingCategorizations = res.categories;
      }
    } catch (err) {
      logger.error("design_slide_sections existing_categorizations error", err);
    }

    const requests = [];
    for (const raw of sectionsInput) {
      const sectionId = Number.isInteger(raw.section_id) ? raw.section_id : null;
      const existing = sectionId ? (spec.sections || []).find((s) => s.id === sectionId) : null;

      const outline = raw.outline ? { ...raw.outline } : {};
      if (!outline.type && raw.type) outline.type = raw.type;
      if (!outline.overview && raw.overview) outline.overview = raw.overview;
      if (raw.pre_filter !== undefined && outline.pre_filter == null) outline.pre_filter = raw.pre_filter;
      if (raw.categorization !== undefined && outline.categorization == null) outline.categorization = raw.categorization;
      if (raw.summarization !== undefined && outline.summarization == null) outline.summarization = raw.summarization;
      if (raw.visualization !== undefined && outline.visualization == null) outline.visualization = raw.visualization;
      if (!outline.type && existing) outline.type = existing.type;

      const targetSource = raw.sourceId || existing?.sourceId || params.id;
      if (!outline.type) {
        return { error: "Each section must provide a type or reference an existing section." };
      }
      if (!targetSource) {
        return { error: "Unable to determine sourceId for a section." };
      }

      requests.push({
        outline,
        chart_kind: raw.chart_kind,
        existingSection: existing || undefined,
        instructions: raw.instructions,
        context: raw.context,
        goal: raw.goal,
        sourceId: targetSource,
        section_id: sectionId,
        insert_at: raw.insert_at
      });
    }

    const sectionResults = await generateDetailedSections({
      scope,
      goal: params.goal,
      sourceId: params.id,
      categoryData: categoryDefs,
      sectionRequests: requests,
      slideDefs: spec.defs,
      sampleData,
      existingCategorizations,
      usage: {
        functionName: "agent_module_design_slide_sections",
        usageId: "agent_module_design_slide_sections_section"
      }
    });

    const produced = [];
    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      const generated = sectionResults?.[i];
      if (!generated) continue;

      generated.sourceId = req.sourceId || generated.sourceId || params.id;

      if (req.section_id) {
        const idx = spec.sections.findIndex((s) => s.id === req.section_id);
        if (idx >= 0) {
          spec.sections[idx] = { ...generated, id: req.section_id, sourceId: generated.sourceId };
        } else {
          spec.sections.push({ ...generated, id: req.section_id, sourceId: generated.sourceId });
        }
        produced.push({ ...generated, id: req.section_id, sourceId: generated.sourceId });
        continue;
      }

      if (req.existingSection?.id) {
        const idx = spec.sections.findIndex((s) => s.id === req.existingSection.id);
        if (idx >= 0) {
          spec.sections[idx] = { ...generated, id: req.existingSection.id, sourceId: generated.sourceId };
        } else {
          spec.sections.push({ ...generated, id: req.existingSection.id, sourceId: generated.sourceId });
        }
        produced.push({ ...generated, id: req.existingSection.id, sourceId: generated.sourceId });
        continue;
      }

      const newSection = { ...generated };
      let assignedId = Number.isInteger(newSection.id) ? newSection.id : null;
      if (!assignedId || spec.sections.some((s) => s.id === assignedId)) {
        assignedId = nextSectionId(spec);
      }
      newSection.id = assignedId;

      if (req.insert_at && req.insert_at > 0 && req.insert_at <= spec.sections.length) {
        spec.sections.splice(req.insert_at - 1, 0, newSection);
      } else {
        spec.sections.push(newSection);
      }
      produced.push(newSection);
    }

    if (produced.length === 0) {
      return { error: "No sections were generated." };
    }

    sess.data.slideSpec = spec;
    sess.state = "preview";
    touch(scope);
    notify?.("Updated slide with generated section details.", true);

    return { preview: spec, sections: produced };
  }
};

export const add_slide_section = {
  definition: {
    name: "add_slide_section",
    description: "Add a new section to the slide (summary or visualization).",
    parameters: {
      type: "object",
      required: ["type","sourceId"],
      properties: {
        type: { type: "string", enum: ["summary","visualization"] },
        sourceId: { type: "string" },
        insert_at: { type: "number", description: "1-based index; omit to append" }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope) => {
    const sess = requireSlideSession(scope);
    const spec = sess.data.slideSpec || { title: "", layout: "full_page", sections: [] };
    spec.sections = spec.sections || [];
    const newSection = {
      id: nextSectionId(spec),
      sourceId: params.sourceId,
      type: params.type,
      pre_filter: null, categorization: null, summarization: null, visualization: null, post_filter: null
    };
    if (params.insert_at && params.insert_at > 0 && params.insert_at <= spec.sections.length) {
      spec.sections.splice(params.insert_at - 1, 0, newSection);
    } else {
      spec.sections.push(newSection);
    }
    sess.data.slideSpec = spec;
    touch(scope);
    return { preview: spec };
  }
};
export const update_slide_section = {
  definition: {
    name: "update_slide_section",
    description:
      "Update one or more fields on one or more slide sections. " +
      "Fields must be JSON objects (not strings). If you want to reuse a slide-level def, provide {$ref:'<group>.<key>'}.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["section_ids", "updates"],
      properties: {
        section_ids: {
          type: "array",
          description:
            "Section ids in the CURRENT slide to update. Must be integers from the current slide spec.",
          items: { type: "integer" },
          minItems: 1
        },
        updates: {
          type: "object",
          description:
            "Partial updates to apply to each section. This MUST be a JSON object, not a quoted string. " +
            "Supported keys: pre_filter, categorization, summarization, visualization, post_filter. " +
            "Each key's value can be either a literal string/object, or {$ref:'<group>.<key>'}. " +
            "Do NOT send JSON-in-a-string; send the object itself." +  
            "If you are updating a categorization be sure to update the relevant summarization or visualization definition to align with the update",
          additionalProperties: true,
          properties: {
            pre_filter: { type: ["string", "object"] },
            categorization: { type: ["string", "object"] },
            summarization: { type: ["string", "object"] },
            visualization: { type: ["string", "object"] },
            post_filter: { type: ["string", "object"] }
          }
        },
        // (optional) safety: constrain fields you *intend* to change
        only_keys: {
          type: "array",
          description:
            "Optional allowlist. If present, only these keys in `updates` will be applied.",
          items: {
            type: "string",
            enum: [
              "pre_filter",
              "categorization",
              "summarization",
              "visualization",
              "post_filter"
            ]
          }
        }
      }
    }
  },
  implementation: async (params, scope, notify) => {
    const sess = requireSlideSession(scope);
    const spec = sess.data.slideSpec;
    if (!spec) return { error: "No slide draft yet." };

    // --- 1) Coerce any accidental JSON strings into objects ---
    const normalize = (v) => {
      if (v == null) return v;
      if (typeof v === "string") {
        // try JSON.parse safely if it looks like JSON
        const s = v.trim();
        if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
          try { return JSON.parse(s); } catch {}
        }
        return v; // leave as string (allowed for summaries/filters)
      }
      return v;
    };

    const coerceUpdates = (u) => {
      if (!u || typeof u !== "object") return {};
      const out = {};
      for (const [k, v] of Object.entries(u)) out[k] = normalize(v);
      return out;
    };

    let updates = coerceUpdates(params.updates);
    const only = Array.isArray(params.only_keys) ? new Set(params.only_keys) : null;

    // --- 2) Validate section ids ---
    const byId = new Map((spec.sections || []).map(s => [s.id, s]));
    const targetIds = (params.section_ids || []).filter(Number.isInteger);
    if (targetIds.length === 0) return { error: "No valid section_ids" };
    for (const id of targetIds) {
      if (!byId.has(id)) return { error: `Unknown section_id ${id}` };
    }

    // --- 3) Apply updates with simple merge ---
    const MERGE_KEYS = [
      "pre_filter",
      "categorization",
      "summarization",
      "visualization",
      "post_filter"
    ];

    for (const id of targetIds) {
      const sec = byId.get(id);
      for (const k of MERGE_KEYS) {
        if (!(k in updates)) continue;
        if (only && !only.has(k)) continue;

        const next = updates[k];
        // If value is an object and not a ref, shallow-merge, else replace
        if (sec[k] && typeof sec[k] === "object" && next && typeof next === "object" && !("$ref" in next)) {
          sec[k] = { ...sec[k], ...next };
        } else {
          sec[k] = next;
        }
      }
    }

    notify?.("Updated slide section(s).", true);
    touch(scope); // keep session fresh
    return { preview: spec };
  }
};
export const reorder_slide_sections = {
  definition: {
    name: "reorder_slide_sections",
    description: "Reorder sections by specifying the exact new order of IDs.",
    parameters: {
      type: "object",
      required: ["order"],
      properties: {
        order: { type: "array", items: { type: "number" }, description: "New 1-based order of section IDs" }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope) => {
    const sess = requireSlideSession(scope);
    const spec = sess.data.slideSpec;
    if (!spec) return { error: "No slide draft yet." };
    const current = spec.sections || [];
    if (params.order.length !== current.length) return { error: "Order must include all section IDs." };
    const map = new Map(current.map(s => [s.id, s]));
    const reordered = params.order.map(id => {
      const s = map.get(id);
      if (!s) throw new Error("Invalid order: unknown section id " + id);
      return s;
    });
    spec.sections = reordered;
    touch(scope);
    return { preview: spec };
  }
};

/* =================================
   4) Data-aware helpers (optional)
   ================================= */

export const suggest_section_filters = {
  definition: {
    name: "suggest_section_filters",
    description: "Propose concrete pre/post filters for a section from schema and values.",
    parameters: {
      type: "object",
      required: ["section_id","hint"],
      properties: {
        section_id: { type: "number" },
        hint: { type: "string", description: "e.g. 'non-empty hashtags; remove Other<5%'" }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope, notify) => {
    // Skeleton: call object_params / parameter_values_for_data as needed
    // For now, just echo a minimal suggestion patch so the flow is wired.
    const sess = requireSlideSession(scope);
    const spec = sess.data.slideSpec;
    if (!spec) return { error: "No slide draft yet." };
    const sec = (spec.sections || []).find(s => s.id === params.section_id);
    if (!sec) return { error: "Invalid section_id" };

    // Demo suggestion:
    const suggested = {
      pre_filter: sec.pre_filter ?? "Include records where Post Content is present",
      post_filter: sec.post_filter ?? "Remove 'Other' if <5% of total"
    };
    notify?.(`Suggested filters: ${JSON.stringify(suggested)}`, true);

    // Apply patch
    Object.assign(sec, suggested);
    touch(scope);
    return { preview: spec, suggestions: suggested };
  }
};

export const suggest_section_categorization = {
  definition: {
    name: "suggest_section_categorization",
    description: "Draft or refine a categorization for this section based on data content amd schema, and user goal.",
    parameters: {
      type: "object",
      required: ["section_id","goal"],
      properties: {
        section_id: { type: "number" },
        goal: { type: "string" },
        //field: { type: "field" }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope, notify) => {
    const sess = requireSlideSession(scope);
    const spec = sess.data.slideSpec;
    if (!spec) return { error: "No slide draft yet." };
    const sec = (spec.sections || []).find(s => s.id === params.section_id);
    if (!sec) return { error: "Invalid section_id" };
    const sourceId = sec.sourceId
    if (!sourceId) return { error: "Section has no sourceId" };


    spec.defs = spec.defs || {};
    spec.defs.categorizations = spec.defs.categorizations || {};

    let [items, toSummarize, resolvedSourceIds] = await getDataForAgentAction( {...params, sourceIds: [sourceId], limit: 1000}, scope)
    const toProcess = toSummarize.map(d=>Array.isArray(d) ? d.join(", ") : d)
    const literal = false

    notify("Analyzing...")
    const result = await buildCategories( toProcess, {
        count: params.number ,
        types: params.type, 
        themes: params.theme, 
        literal,
        batch: 100,
        engine:  "o3-mini"
    }) 

    logger.debug(` -- Got ${result.categories?.length} suggested categories`,  {chatId: scope.chatUUID})
    const cat = {
        mode: "inline_explicit",
        parameter: "context",
        items: result.categories.map(d=>({title:d.t, description: d.d})),

    }
    const idx = Object.keys(spec.defs.categorizations).length
    const key = `category_${idx}`
    spec.defs.categorizations[key] = cat;
    sec.categorization = { $ref: `categorizations.${key}` };

    notify?.("Applied a suitable categorization prompt.", true);

    touch(scope);
    return { preview: spec, new_categorization_ref: `categorizations.${key}`, new_categorization: cat };
  }
};

/* ===========================
   5) Preview & persist
   =========================== */

export const preview_slide = {
  definition: {
    name: "preview_slide",
    description: "Return a preview of the current slide draft (no persistence).",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  implementation: async (params, scope) => {
    const sess = requireSlideSession(scope);
    if (!sess.data.slideSpec) return { error: "No slide draft yet." };
    touch(scope);
    return { preview: sess.data.slideSpec };
  }
};

export const create_slide = {
  definition: {
    name: "create_slide",
    description: "Persist the current slide draft into a deck.",
    parameters: {
      type: "object",
      properties: {
        deck_id: { type: "string", description: "Existing deck ID; omit to create a new deck" },
        position: { type: "number", description: "1-based insert position; omit to append" },
        exit_after: { type: "boolean", default: true, description: "End slide session after creating" }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope, notify) => {
    const sess = requireSlideSession(scope);
    const spec = sess.data.slideSpec;
    if (!spec) return { error: "No slide draft yet." };

    // TODO: persist to your storage. Example:
    // const slideId = await Slides.store({ deckId: params.deck_id, spec, position: params.position });
    const slideId = "slide_" + Math.random().toString(36).slice(2, 10);

    notify?.(`Slide created: [[id:${slideId}]]`, true);

    if (params.exit_after !== false) {
      sess.state = "added";
      scope.deactivateMode?.();
      return { result: "created", slide_id: slideId, route: "exit_subflow" };
    }

    touch(scope);
    return { result: "created", slide_id: slideId };
  }
};

/* ===========================
   6) Theme / styling
   =========================== */

export const set_slide_theme = {
  definition: {
    name: "set_slide_theme",
    description: "Set brand/theme tokens to apply to the slide.",
    parameters: {
      type: "object",
      properties: {
        palette: { type: "string", enum: ["blue","ice","purple","heat","scale"] },
        custom_colors: { type: "array", items: { type: "string" } },
        accent: { type: "string" },
        density: { type: "string", enum: ["compact","normal","spacious"] }
      },
      additionalProperties: false
    }
  },
  implementation: async (params, scope) => {
    const sess = requireSlideSession(scope);
    const spec = sess.data.slideSpec || { title: "", layout: "full_page", sections: [] };
    spec.theme = {
      ...(spec.theme || {}),
      ...(params.palette ? { palette_name: params.palette } : {}),
      ...(params.custom_colors ? { colors: params.custom_colors } : {}),
      ...(params.accent ? { accent: params.accent } : {}),
      ...(params.density ? { density: params.density } : {})
    };
    sess.data.slideSpec = spec;
    touch(scope);
    return { preview: spec };
  }
};

/* Utility export to register */
export const slideTools = [
  design_slide_from_suggestion,
  update_slide_from_suggestion,
  update_slide_title,
  update_slide_layout,
  design_slide_sections,
  add_slide_section,
  update_slide_section,
  reorder_slide_sections,
  suggest_section_filters,
  suggest_section_categorization,
  preview_slide,
  create_slide,
  set_slide_theme
];

export const slideMode = {
  id: "slides",
  label: "Slides",
  description: "Builds and edits slides from existing data",
  toolNames: new Set([...slideTools.map((t) => t.definition.name), "suggest_analysis"]),
  systemPrompt:
    "You are in slides mode. Help the user draft, refine, and finalize presentation-ready slides. Respect existing categorization definitions and confirm updates before applying them.",
  extraInstructions:
    "*) Amendment chaining (STRICT): If the user chooses a suggestion and also requests changes (e.g., 'categorize by wellness journey', 'make it a bar chart', 'shorter title'):\n" +
    "*) - 1. Call design_slide_from_suggestion with any title/layout overrides.\n" +
    "*) - 2. If an amendment mentions a new categorization, call suggest_section_categorization (once) to produce/choose a categorization spec, then call update_slide_section to apply it to ALL relevant sections.\n" +
    "*) - 3. If a visualization needs to change, call update_slide_section for those sections and keep categorization consistent.\n" +
    "*) - 4. If a summarization needs to change, call update_slide_section for those sections.\n" +
    "*) - 5. Confirm the updated slide spec to the user, then stop.\n" +
    "*) - 6. If the user switches to a different suggestion call update_slide_from_suggestion with the new suggestion id and overrides.\n" +
    "*) Prefer slide-level defs + $ref reuse over same_as. If a new categorization replaces one referenced by multiple sections, update the definition once and ensure sections point to the new $ref.\n" +
    "*) You must NOT perform slide updates without calling one of the above functions.",
  enterTriggers: [
    /\b(slide|deck|presentation|title slide|agenda|layout|add slide|create slide)\b/i,
    /\b(resume slides?)\b/i,
  ],
  exitTriggers: [
    /\b(exit slides?|stop slides?|back|new topic)\b/i,
  ],
  createState: defaultSlideState,
  contextName: "SLIDE_CONTEXT",
  buildContext: (state = {}) => ({
    slide_set_id: state.id,
    current_state: state.state,
    deck_id: state.data?.deckId ?? null,
    selection: state.data?.selection ?? null,
    current_slide_spec: state.data?.slideSpec ?? null,
    suggestions: state.suggestions ?? null,
  }),
  applySeed: applySlideSeed,
};
