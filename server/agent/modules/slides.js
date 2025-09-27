// modules/slides.js
import { randomUUID } from "node:crypto";
import { getLogger } from "../../logger.js";
import { dispatchControlUpdate } from "../../SharedFunctions.js";
import { categoryDetailsForAgent } from "../utils.js";
import { generateDetailedSections, inferChartKindFromText } from "./analysis_section_engine.js";
import { implementation as existingCategorizationsImpl } from "./existing_categorizations.js";
import { implementation as suggestCategoriesImpl } from "./suggest_categories.js";
import { processAsSingleChunk } from "../../openai_helper.js";

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

function clampCategoryCount(value, fallback = 6) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 2), 20);
}

function normalizeCategoryItems(input) {
  if (!input) {
    return [];
  }
  const candidates = Array.isArray(input) ? input.flat(Infinity) : [input];
  return candidates
    .map((entry) => {
      if (!entry) {
        return null;
      }
      if (typeof entry === "string") {
        return { title: entry };
      }
      const title =
        entry.title ?? entry.name ?? entry.label ?? entry.t ?? entry.heading ?? null;
      if (!title) {
        return null;
      }
      const description =
        entry.description ?? entry.detail ?? entry.summary ?? entry.d ?? entry.text ?? null;
      return description ? { title, description } : { title };
    })
    .filter(Boolean);
}

function extractExistingCategorizations(raw) {
  if (!raw) {
    return [];
  }
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return [];
    }
  }
  const candidates = Array.isArray(parsed) ? parsed.flat(Infinity) : [parsed];
  return candidates
    .map((entry) => {
      if (!entry) {
        return null;
      }
      const items = normalizeCategoryItems(entry.categories);
      if (!items.length) {
        return null;
      }
      return {
        title: entry.title ?? entry.name ?? entry.label ?? null,
        description: entry.description ?? entry.summary ?? null,
        categorizationId: entry.categorization_id ?? entry.id ?? null,
        source: entry.source ?? entry.parent ?? null,
        items,
      };
    })
    .filter(Boolean);
}

async function pickExistingCategorization(goal, candidates, notify) {
  if (!candidates?.length) {
    return null;
  }
  const goalText = goal?.trim() ? goal.trim() : 'No specific goal provided.';

  const optionText = candidates
    .map((candidate, idx) => {
      const header = `${idx + 1}. ${candidate.title ?? 'Untitled categorization'}`;
      const details = [];
      if (candidate.description) {
        details.push(`Summary: ${candidate.description}`);
      }
      const categories = candidate.items
        ?.slice(0, 8)
        .map((item) => (item.description ? `${item.title} — ${item.description}` : item.title))
        .join('; ');
      if (categories) {
        details.push(`Categories: ${categories}`);
      }
      return [header, ...details].join('\n   ');
    })
    .join('\n\n');

  const prompt = [
    'You are choosing the best existing categorization for a slide section.',
    `Section goal: ${goalText}`,
    '',
    'Options:',
    optionText,
    '',
    'Select the single option that best aligns with the goal and provides clear, useful buckets for the section.',
  ].join('\n');

  const output = `Provide the result as a json object with fields "best" (number) and "reason" (string). The number must be between 1 and ${candidates.length}. Do not include anything else.`;

  let bestIndex = 1;
  try {
    const llm = await processAsSingleChunk(prompt, {
      engine: 'gpt4o-mini',
      temperature: 0,
      output,
      maxTokens: 512,
    });
    if (llm?.success && llm.results) {
      const payload = llm.results;
      const parsed = parseInt(payload.best ?? payload.Best ?? payload.option ?? payload.choice, 10);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= candidates.length) {
        bestIndex = parsed;
        if (payload.reason) {
          notify?.(`LLM chose option ${bestIndex}: ${payload.reason}`, true);
        }
      }
    }
  } catch (error) {
    logger.warn('pickExistingCategorization LLM selection failed', { error: error?.message });
  }

  const chosen = candidates[bestIndex - 1] ?? candidates[0];
  const label = chosen.title ? `: ${chosen.title}` : ` option ${bestIndex}`;
  notify?.(`Using existing categorization${label}.`, true);
  return chosen;
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
      "Update or regenerate fields on existing slide sections. " +
      "When changing chart types, supply either a full visualization object or the desired chart_kind and the agent will regenerate the section.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["updates"],
      properties: {
        section_ids: {
          type: "array",
          description:
            "Section ids in the CURRENT slide to update. Must be integers from the current slide spec.",
          items: { type: "integer" },
          minItems: 1
        },
        selector: {
          type: "object",
          description:
            "Optional helper to locate sections automatically when section_ids are unknown.",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["summary","visualization"] },
            chart_kind: { type: "string", enum: ["bar","pie","bubble","heatmap"] },
            overview_contains: { type: "string" },
            index: { type: "integer", minimum: 1, description: "1-based index within the filtered matches." }
          }
        },
        updates: {
          type: "object",
          description:
            "Partial updates to apply to each section. This MUST be a JSON object, not a quoted string. " +
            "Supported keys: pre_filter, categorization, summarization, visualization, post_filter. " +
            "Each key's value can be either a literal string/object, or {$ref:'<group>.<key>'}. " +
            "Use chart_kind to request a different visualization type without supplying the full schema.",
          additionalProperties: true,
          properties: {
            type: { type: "string", enum: ["summary","visualization"] },
            overview: { type: "string" },
            chart_kind: { type: "string", enum: ["bar","pie","bubble","heatmap"] },
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
              "post_filter",
              "overview",
              "type"
            ]
          }
        },
        goal: { type: "string", description: "User goal context to feed into regeneration." },
        instructions: { type: "string", description: "Additional instructions for regeneration when changing chart types." }
      }
    }
  },
  implementation: async (params, scope, notify) => {
    const sess = requireSlideSession(scope);
    const spec = sess.data.slideSpec;
    if (!spec) return { error: "No slide draft yet." };

    spec.sections = Array.isArray(spec.sections) ? spec.sections : [];
    const sections = spec.sections;

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

    const updates = coerceUpdates(params.updates);
    if (Object.keys(updates).length === 0) {
      return { error: "No updates provided." };
    }

    const onlyList = Array.isArray(params.only_keys) ? params.only_keys.filter((k) => typeof k === "string") : null;
    const only = onlyList ? new Set(onlyList) : null;

    const selector = (params.selector && typeof params.selector === "object") ? params.selector : null;
    const resolveType = (value) => (value === "summary" || value === "visualization") ? value : null;

    const desiredType = resolveType(updates.type) || resolveType(selector?.type) || (
      updates.visualization !== undefined || updates.chart_kind ? "visualization" :
      updates.summarization !== undefined ? "summary" : null
    );

    const desiredChartKind = updates.chart_kind || updates.visualization?.chart?.kind || updates.visualization?.chart_kind || selector?.chart_kind || null;

    const byId = new Map(sections.map((s) => [s.id, s]));
    let targetIds = Array.isArray(params.section_ids) ? params.section_ids.filter(Number.isInteger) : [];
    targetIds = Array.from(new Set(targetIds));

    const instructionsText = typeof params.instructions === "string" ? params.instructions.trim() : "";
    const goalText = typeof params.goal === "string" ? params.goal : undefined;

    const resolveSections = () => {
      if (targetIds.length) {
        const resolved = targetIds.map((id) => {
          const found = byId.get(id);
          if (!found) throw new Error(`Unknown section_id ${id}`);
          return found;
        });
        return resolved;
      }

      let candidates = sections.slice();
      const typeHint = resolveType(selector?.type) || desiredType;
      if (typeHint) {
        candidates = candidates.filter((sec) => sec.type === typeHint);
      }
      if (selector?.chart_kind) {
        candidates = candidates.filter((sec) => (sec.chart?.kind || sec.chart_kind) === selector.chart_kind);
      }
      if (!selector?.chart_kind && desiredChartKind && typeHint === "visualization") {
        const kindMatches = candidates.filter((sec) => (sec.chart?.kind || sec.chart_kind) === desiredChartKind);
        if (kindMatches.length === 1) {
          candidates = kindMatches;
        }
      }
      if (selector?.overview_contains) {
        const needle = selector.overview_contains.toLowerCase();
        candidates = candidates.filter((sec) => (sec.overview || "").toLowerCase().includes(needle));
      }
      if (selector?.index) {
        const idx = selector.index - 1;
        if (idx < 0 || idx >= candidates.length) {
          return { error: "selector.index is out of range for matching sections." };
        }
        candidates = [candidates[idx]];
      }

      if (!candidates.length && typeHint) {
        const fallback = sections.filter((sec) => sec.type === typeHint);
        if (fallback.length === 1) return fallback;
      }

      if (!candidates.length && desiredChartKind) {
        const kindMatches = sections.filter((sec) => (sec.chart?.kind || sec.chart_kind) === desiredChartKind);
        if (kindMatches.length === 1) return kindMatches;
      }

      if (!candidates.length) {
        return { error: "Unable to determine which section to update. Provide section_ids or selector." };
      }

      if (candidates.length === 1) return candidates;

      if (typeHint === "visualization") {
        const viz = sections.filter((sec) => sec.type === "visualization");
        if (viz.length === 1) return viz;
      }
      if (typeHint === "summary") {
        const summaries = sections.filter((sec) => sec.type === "summary");
        if (summaries.length === 1) return summaries;
      }

      return { error: "Multiple sections match the selector. Provide section_ids to disambiguate." };
    };

    let targetSections;
    try {
      const resolved = resolveSections();
      if (resolved?.error) return resolved;
      targetSections = resolved;
      targetIds = targetSections.map((s) => s.id);
    } catch (err) {
      return { error: err.message };
    }

    if (!targetSections.length) {
      return { error: "No matching sections found." };
    }

    const MERGE_KEYS = [
      "pre_filter",
      "categorization",
      "summarization",
      "visualization",
      "post_filter"
    ];

    const applyFieldUpdates = (section, sourceUpdates, onlyGuard, options = {}) => {
      const allowVisualization = options.allowVisualization !== false;
      const allowType = options.allowType === true;
      for (const key of MERGE_KEYS) {
        if (!(key in sourceUpdates)) continue;
        if (onlyGuard && !onlyGuard.has(key)) continue;
        if (key === "visualization" && !allowVisualization) continue;
        const next = sourceUpdates[key];
        if (section[key] && typeof section[key] === "object" && next && typeof next === "object" && !("$ref" in next)) {
          section[key] = { ...section[key], ...next };
        } else {
          section[key] = next;
        }
      }
      if ("overview" in sourceUpdates && (!onlyGuard || onlyGuard.has("overview"))) {
        section.overview = sourceUpdates.overview;
      }
      if (allowType && "type" in sourceUpdates && (!onlyGuard || onlyGuard.has("type"))) {
        const nextType = resolveType(sourceUpdates.type);
        if (nextType) section.type = nextType;
      }
    };

    const hasInstructions = Boolean(instructionsText);
    const needsRegeneration = (section) => {
      if (resolveType(updates.type) && updates.type !== section.type) return true;
      if (desiredType === "visualization" && section.type !== "visualization") return true;
      if (desiredChartKind) {
        const currentKind = section.chart?.kind || section.chart_kind;
        if (section.type !== "visualization" || !currentKind || currentKind !== desiredChartKind) {
          return true;
        }
      }
      const vizUpdate = updates.visualization;
      if (vizUpdate && typeof vizUpdate === "object" && !("$ref" in vizUpdate)) {
        const hasChart = vizUpdate.chart && vizUpdate.chart.kind && vizUpdate.chart.value;
        const hasAxis = vizUpdate.axis_1 || vizUpdate.split_by || vizUpdate.axis_2;
        if (!hasChart || !hasAxis) return true;
      }
      if (hasInstructions) return true;
      return false;
    };

    const regenSections = [];
    const manualSections = [];
    for (const section of targetSections) {
      if (needsRegeneration(section)) {
        regenSections.push(section);
      } else {
        manualSections.push(section);
      }
    }

    if (manualSections.length && updates.visualization !== undefined) {
      const bad = manualSections.find((section) => section.type !== "visualization");
      if (bad) {
        return { error: `Section ${bad.id} is not a visualization. Use chart_kind/type to regenerate it instead.` };
      }
    }

    for (const section of manualSections) {
      applyFieldUpdates(section, updates, only, { allowVisualization: true, allowType: false });
    }

    let regenSuccess = 0;
    if (regenSections.length) {
      const uniqueSources = Array.from(new Set(regenSections.map((sec) => sec.sourceId).filter(Boolean)));
      let sampleData = [];
      let categoryDefs = [];
      let existingCategorizations = null;

      if (uniqueSources.length === 1) {
        const sampleSource = uniqueSources[0];
        try {
          const sampler = scope.functionMap?.["sample_data"];
          if (sampler) {
            const res = await sampler({ id: sampleSource, limit: 20, forSample: true, withCategory: true }, scope);
            if (Array.isArray(res?.data)) sampleData = res.data;
            if (Array.isArray(res?.categories)) {
              categoryDefs = res.categories.map((d) => categoryDetailsForAgent(d)).filter(Boolean);
            }
          }
        } catch (err) {
          logger.error("update_slide_section sample_data error", err);
        }
        try {
          const existingFetcher = scope.functionMap?.["existing_categorizations"];
          if (existingFetcher) {
            const res = await existingFetcher({ id: sampleSource, forSample: true, withCategory: true }, scope);
            if (res?.categories) existingCategorizations = res.categories;
          }
        } catch (err) {
          logger.error("update_slide_section existing_categorizations error", err);
        }
      }

      const sectionRequests = regenSections.map((section) => {
        const outlineType = resolveType(updates.type) || section.type;
        const outline = {
          type: outlineType,
          overview: updates.overview ?? section.overview
        };
        if ("pre_filter" in updates) outline.pre_filter = updates.pre_filter;
        else if (section.pre_filter != null) outline.pre_filter = section.pre_filter;

        if ("categorization" in updates) outline.categorization = updates.categorization;
        else if (section.categorization != null) outline.categorization = section.categorization;

        if (outlineType === "summary") {
          if ("summarization" in updates) outline.summarization = updates.summarization;
          else if (section.summarization != null) outline.summarization = section.summarization;
        } else {
          if (updates.visualization && typeof updates.visualization === "object") {
            if (updates.visualization.axis_1) outline.axis_1 = updates.visualization.axis_1;
            if (updates.visualization.axis_2) outline.axis_2 = updates.visualization.axis_2;
            if (updates.visualization.split_by) outline.split_by = updates.visualization.split_by;
          } else {
            if (section.axis_1) outline.axis_1 = section.axis_1;
            if (section.axis_2) outline.axis_2 = section.axis_2;
            if (section.split_by) outline.split_by = section.split_by;
          }
        }

        const chartKind = desiredChartKind || section.chart?.kind || inferChartKindFromText(outline.overview || "");

        return {
          outline,
          chart_kind: chartKind,
          existingSection: section,
          instructions: instructionsText || undefined,
          goal: goalText || undefined,
          sourceId: section.sourceId,
          section_id: section.id
        };
      });

      const primarySource = uniqueSources[0] || regenSections[0].sourceId || null;
      const generatedSections = await generateDetailedSections({
        scope,
        goal: goalText,
        sourceId: primarySource,
        categoryData: categoryDefs,
        sectionRequests,
        slideDefs: spec.defs,
        sampleData,
        existingCategorizations,
        usage: {
          functionName: "agent_module_update_slide_section",
          usageId: "agent_module_update_slide_section_regen"
        }
      });

      regenSections.forEach((section, index) => {
        const generated = generatedSections?.[index];
        if (!generated) return;
        const nextSection = {
          ...generated,
          id: section.id,
          sourceId: generated.sourceId || section.sourceId
        };
        applyFieldUpdates(nextSection, updates, only, { allowVisualization: false, allowType: true });
        const pos = sections.findIndex((s) => s.id === section.id);
        if (pos >= 0) {
          sections[pos] = nextSection;
          regenSuccess += 1;
        }
      });

      if (regenSections.length && regenSuccess === 0) {
        return { error: "Failed to regenerate the requested section(s)." };
      }
    }

    sess.data.slideSpec = spec;
    touch(scope);

    const message = regenSuccess ? "Regenerated slide section(s)." : "Updated slide section(s).";
    notify?.(message, true);
    return { preview: spec, updated_section_ids: targetIds };
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
    const sourceId = sec.sourceId;
    if (!sourceId) return { error: "Section has no sourceId" };

    spec.defs = spec.defs || {};
    spec.defs.categorizations = spec.defs.categorizations || {};

    const parameterName =
      sec.categorization && typeof sec.categorization === "object" && typeof sec.categorization.parameter === "string"
        ? sec.categorization.parameter
        : "context";

    let selectedItems = null;
    let selectedMeta = null;

    const existingFetcher =
      scope.functionMap?.["existing_categorizations"] ?? existingCategorizationsImpl;

    if (existingFetcher) {
      try {
        const existingRes = await existingFetcher(
          { id: sourceId, withCategory: true, forSample: true },
          scope,
          notify
        );
        const existingOptions = extractExistingCategorizations(existingRes?.categories);
        if (existingOptions.length) {
          const chosen = await pickExistingCategorization(
            params.goal || sec.overview,
            existingOptions,
            notify
          );
          if (chosen?.items?.length) {
            selectedItems = chosen.items;
            selectedMeta = chosen;
          }
        }
      } catch (error) {
        logger.warn("suggest_section_categorization existing_categorizations failed", {
          error: error?.message,
          chatId: scope.chatUUID
        });
      }
    }

    if (!selectedItems) {
      const suggestFn = scope.functionMap?.["suggest_categories"] ?? suggestCategoriesImpl;
      if (!suggestFn) {
        return { error: "Categorization helper unavailable." };
      }

      const numberOfCategories = clampCategoryCount(params.number);
      const theme =
        params.goal || sec.goal || sec.overview || `Categorization for section ${sec.id}`;
      const typeDescription = sec.type || "section items";

      notify?.("Analyzing data to suggest categories...", true);
      let suggestion;
      try {
        suggestion = await suggestFn(
          {
            sourceIds: [sourceId],
            theme,
            type: typeDescription,
            field: parameterName,
            number: numberOfCategories,
            limit: 500,
            confirmed: true
          },
          scope,
          notify
        );
      } catch (error) {
        logger.warn("suggest_section_categorization suggest_categories failed", {
          error: error?.message,
          chatId: scope.chatUUID
        });
        return { error: error?.message ?? "Unable to suggest categories." };
      }

      const normalized = normalizeCategoryItems(suggestion?.categories);
      if (!normalized.length) {
        return { error: "No categories could be suggested." };
      }
      selectedItems = normalized;
    }

    if (!selectedMeta?.categorizationId && (!selectedItems || selectedItems.length === 0)) {
      return { error: "No categories available for inline definition." };
    }

    let cat;
    if (selectedMeta?.categorizationId) {
      cat = {
        categorization_id: selectedMeta.categorizationId,
        title: selectedMeta.title ?? `Existing categorization`,
      };
    } else {
      cat = {
        mode: "inline_explicit",
        parameter: parameterName,
        items: selectedItems ?? [],
      };
    }

    const key = `category_${Object.keys(spec.defs.categorizations).length}`;
    spec.defs.categorizations[key] = cat;
    sec.categorization = { $ref: `categorizations.${key}` };

    notify?.("Applied a suitable categorization.", true);

    touch(scope);
    return {
      preview: spec,
      new_categorization_ref: `categorizations.${key}`,
      new_categorization: cat
    };
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
