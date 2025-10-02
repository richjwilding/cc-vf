import { ANALYSIS_OPTIONS } from "./analysis_section_engine.js";

export function buildSlideOutlineSchema({ minSuggestions = 1, maxSuggestions = 5 } = {}) {
  const min = Math.max(1, Math.floor(minSuggestions));
  const max = Math.max(min, Math.floor(maxSuggestions));

  return {
    name: "analysis_suggestions",
    schema: {
      type: "object",
      required: ["suggestions"],
      additionalProperties: false,
      properties: {
        suggestions: {
          type: "array",
          minItems: min,
          maxItems: max,
          items: { $ref: "#/$defs/SlideSuggestionOutline" }
        }
      },
      $defs: buildSharedDefs()
    }
  };
}

export const SINGLE_SLIDE_OUTLINE_SCHEMA = {
  ...buildSlideOutlineSchema({ minSuggestions: 1, maxSuggestions: 1 }),
  name: "analysis_single_suggestion"
};

export const SKELETON_SYSTEM_PROMPT = `You are a presentation design co-pilot that proposes slide structures before they are fully designed. ${ANALYSIS_OPTIONS.replaceAll(/\s+/g, " ")}`;

function buildSharedDefs() {
  return {
    MeasureSpec: {
      type: "object",
      additionalProperties: false,
      required: ["agg"],
      properties: {
        field: { type: "string", description: "Numeric field to aggregate (ignored for count)." },
        agg: { type: "string", enum: ["count", "sum", "avg", "min", "max", "median"] },
        filter: { $ref: "#/$defs/MaybeRefOrString", description: "Optional filter applied before aggregation." },
        format: { type: "string", description: "Optional numeric format, e.g., '0.0%', '0,0'." }
      }
    },
    CategoryItem: {
      type: "object",
      description: "A single explicit category definition.",
      properties: {
        title: { type: "string", description: "Human-friendly name shown on slides, 1–4 words." },
        description: { type: "string", description: "Up to ~20 words describing what belongs in this category." },
        examples: { type: "array", items: { type: "string" }, description: "Optional 1–5 short example phrases to anchor the category." }
      },
      required: ["title"],
      additionalProperties: false
    },
    CategorizationSpec: {
      description: "How to obtain/use a categorization.",
      oneOf: [
        {
          type: "object",
          description: "Reference an already-defined categorization by hex id.",
          properties: {
            categorization_id: { type: "string", description: "24 hex id of existing categorization" },
            title: { type: "string", description: "title of the existing categorization" }
          },
          required: ["categorization_id", "title"],
          additionalProperties: false
        },
        {
          type: "object",
          description: "Define a prompt to be materialized at slide creation time.",
          properties: {
            mode: { type: "string", const: "inline_prompt", description: "Create at slide creation time." },
            parameter: { type: "string", description: "Source field to categorize (e.g., 'Overview')." },
            prompt: { type: "string", description: "LLM prompt describing buckets to generate." },
            target_count: { type: "integer", minimum: 2, maximum: 20, description: "Desired number of buckets." }
          },
          required: ["mode", "parameter", "prompt"],
          additionalProperties: false
        },
        {
          type: "object",
          description: "Use a field of the data without any processing - MUST align with the data schema.",
          properties: { parameter: { type: "string", description: "Source field (e.g., 'overview')." } },
          required: ["parameter"],
          additionalProperties: false
        },
        {
          type: "object",
          description: "Requires a separate preprocessing task before slide can render.",
          properties: {
            mode: { type: "string", const: "needs_task", description: "Run a separate task first." },
            task: { type: "string", enum: ["categorize_data"], description: "Task name." },
            parameter: { type: "string", description: "Source field to categorize." },
            task_args: { type: "object", description: "Inputs for the task", additionalProperties: true },
            produces_ref: { type: "string", description: "Where the resulting definition will be placed, e.g. 'categorizations.intent'." }
          },
          required: ["mode", "task", "parameter", "produces_ref"],
          additionalProperties: false
        },
        {
          type: "object",
          description: "Inline explicit categories (fully specified; no task needed).",
          properties: {
            mode: { type: "string", const: "inline_explicit", description: "Use these categories as-is." },
            parameter: { type: "string", description: "Source field to categorize." },
            items: { type: "array", minItems: 2, maxItems: 20, items: { $ref: "#/$defs/CategoryItem" } }
          },
          required: ["mode", "parameter", "items"],
          additionalProperties: false
        }
      ]
    },
    DefsRef: {
      type: "object",
      required: ["$ref"],
      properties: {
        $ref: {
          type: "string",
          description: "Reference path into slide-level defs. Format: '<group>.<key>'.",
          pattern: "^(filters|categorizations)\\.[A-Za-z0-9_-]+$"
        }
      },
      additionalProperties: false
    },
    MaybeRefOrString: {
      oneOf: [
        { type: "string" },
        { $ref: "#/$defs/DefsRef" }
      ]
    },
    SlideSuggestionOutline: {
      type: "object",
      additionalProperties: false,
      required: ["description", "layout", "sections"],
      properties: {
        id: { type: "integer" },
        description: { 
          type: "string",
          "description": "A concise title to use for the slide - should convey the focus of the slide whilst being tight and short, do not describe the layout / sections"
        },
        layout: { type: "string", enum: ["full_page", "left_summary"] },
        defs: {
          type: "object",
          additionalProperties: false,
          properties: {
            filters: {
              type: "object",
              description: "Named filter definitions to be applied to the data (pre or post where relevant).",
              additionalProperties: { type: "string" }
            },
            categorizations: {
              type: "object",
              description: "Named categorization prompts/specs (materialized later).",
              additionalProperties: {
                oneOf: [
                  { type: "string" },
                  { $ref: "#/$defs/CategorizationSpec" }
                ]
              }
            }
          }
        },
        sections: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            oneOf: [
              { $ref: "#/$defs/SummarySectionOutline" },
              { $ref: "#/$defs/VizSectionOutline" }
            ]
          }
        }
      }
    },
    SummarySectionOutline: {
      type: "object",
      additionalProperties: false,
      required: ["type", "title"],
      properties: {
        type: { type: "string", const: "summary" },
        title: {
          type: "string",
          description: "<=10 word plain-language label for the section.",
          pattern: "^(?:\\S+\\s+){0,9}\\S+$"
        },
        overview: { type: "string" },
        pre_filter: { $ref: "#/$defs/MaybeRefOrString" },
        categorization: { $ref: "#/$defs/DefsRef" }
      }
    },
    VizSectionOutline: {
      type: "object",
      additionalProperties: false,
      required: ["type", "title"],
      properties: {
        type: { type: "string", const: "visualization" },
        title: {
          type: "string",
          description: "<=10 word plain-language label for the visualization.",
          pattern: "^(?:\\S+\\s+){0,9}\\S+$"
        },
        overview: { type: "string", description: "Describe what to visualize and why (no config) including any filters, grouping and axis / splits." },
        chart_kind: { type: "string", enum: ["heatmap", "bubble", "pie", "bar"] }
      }
    }
  };
}
