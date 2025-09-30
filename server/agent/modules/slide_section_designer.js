import OpenAI from "openai";
import { getLogger } from "../../logger";
import { recordUsage } from "../../usage_tracker";
import { categoryDetailsForAgent } from "../utils";

export const ANALYSIS_OPTIONS = `*) The ultimate goal is to prodce a slide which helps the user with their goal
                                  *) Slides can one or more elements with each element being a markdown summarization of data or a chart / graph of data
                                  *) Slides must be optimized for readability and be as concise as possible whilst delivering on the user's goal
                                  *) Slides must use only the data available from the specified source
                                  *) Slides can have one of the following layouts
                                  *) - full_page: Full page analysis
                                  *) - left_summary: A slide with a left pane summary covering 1/4 of the page width - with the right hand side showing a single visualization or set of summaries
                                  *) Data can be grouped / categorized by specific paramters of the data schema using AI.
                                  *) AI can summarize the data based on any of the parameters in the schema - in both short of long form using suitable AI prompts to shape the summarization and the specific outputs
                                  *) Summaries can be created of the full data set, a subset of the data by filtering specific parameters, or a subset of data by grouping on categorizations
                                  *) Categorizations are expensive so use an existing categorization where suitable before defining a new one (unless the user specifically states a new categorization)
                                  *) Data can be visualzied in graphs and charts
                                  *) Reusability rules (STRICT):**
                                  *) - If a section field (pre_filter, categorization, summarization, visualization, post_filter) is reused across multiple sections in the SAME slide, put the canonical definition in slide-level "defs" and reference it with {"$ref":"<group>.<key>"}.
                                  *) - Prefer {"$ref": "..."} over {"same_as": ...}. Use {"same_as": ...} only when reusing a field that is *unique to one section* and not worth adding to defs.
                                  *) - NEVER chain or self-reference: a field with {"same_as":{section_id,field}} must point to a section that has that field as a **literal string or a {$ref}**, not another {"same_as"}.
                                  *) - {"same_as"} may only refer to a section **in the same slide** and with a **smaller section_id** (appeared earlier).
                                  *) - At least once per slide, each reused field must have a concrete definition (string or {$ref}). Do not produce two sections that both use {"same_as"} for the same field with no anchor.
                                    *) If any section in a slide uses a categorization, every section in that slide that references the same concept MUST either:
                                    *) - include the same {"$ref":"categorizations.<key>"}, or
                                    *) - explicitly declare why it's not categorized (rare).
                                  *) If you define defs.categorizations.<name>, you MUST reference it at least once via {"$ref":"categorizations.<name>"} in a section's categorization or list it in a filter's requires.
                                  *) If a filter mentions a field that is only available via a slide-defined categorization, you MUST also attach that categorization to every section that uses the filter.
                                          *) Never instruct counting or math inside summarization. If counts are needed, they belong in the visualization; the summary should interpret the (already computed) results (e.g., "Hydration and Skin & Beauty dominate, with notable lift over others").
                                    *) Prefer slide-level defs + $ref over same_as. Use same_as only when a one-off reuse is clearly tied to a single section and not worth a defs entry.`;

const logger = getLogger("slide_section_designer", "debug", 0);

function buildSectionBaseDefs() {
  return {
    MaybeFilter: {
      oneOf: [
        { type: "string" },
        { $ref: "#/$defs/FilterRef" }
      ]
    },
    FilterRef: {
      type: "object",
      required: ["$ref"],
      properties: {
        $ref: { type: "string", pattern: "^filters\\.[A-Za-z0-9_-]+$" }
      },
      additionalProperties: false
    },
    CatRef: {
      type: "object",
      required: ["$ref"],
      properties: {
        $ref: { type: "string", pattern: "^categorizations\\.[A-Za-z0-9_-]+$" }
      },
      additionalProperties: false
    },
    FieldParam: {
      type: "object",
      additionalProperties: false,
      properties: {
        parameter: { type: "string", description: "Name of a field in the source schema" }
      },
      required: ["parameter"]
    },
    AxisDef: {
      oneOf: [ { $ref: "#/$defs/CatRef" }, { $ref: "#/$defs/FieldParam" } ]
    },
    MeasureSpec: {
      type: "object",
      additionalProperties: false,
      required: ["agg"],
      properties: {
        field: { type: "string" },
        agg: { type: "string", enum: ["count","sum","avg","min","max","median"] },
        filter: { $ref: "#/$defs/MaybeFilter" },
        format: { type: "string" }
      }
    }
  };
}

const SECTION_SCHEMAS = {
  summary: () => ({
    name: "section_summary",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "integer" },
        sourceId: { type: "string" },
        type: { type: "string", const: "summary" },
        pre_filter: { $ref: "#/$defs/MaybeFilter" },
        categorization: { $ref: "#/$defs/AxisDef" },
        summarization: { type: "string" },
        overview: { type: "string" }
      },
      required: ["sourceId","type","overview"],
      $defs: buildSectionBaseDefs()
    }
  }),
  visualization: {
    bar: () => ({
      name: "section_visualization_bar",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "integer" },
          sourceId: { type: "string" },
          type: { type: "string", const: "visualization" },
          pre_filter: { $ref: "#/$defs/MaybeFilter" },
          axis_1: {
            type: "object", additionalProperties: false,
            properties: {
              definition: { $ref: "#/$defs/AxisDef" },
              filter: { $ref: "#/$defs/MaybeFilter" }
            },
            required: ["definition"]
          },
          split_by: { $ref: "#/$defs/AxisDef" },
          overview: { type: "string" },
          chart: {
            type: "object", additionalProperties: false,
            properties: {
              kind: { type: "string", const: "bar" },
              value: { $ref: "#/$defs/MeasureSpec" },
              orientation: { type: "string", enum: ["vertical","horizontal"] },
              grouping: { type: "string", enum: ["grouped","stacked"], default: "grouped" },
              labels: { type: "boolean", default: true },
              sort_by: { type: "string", enum: ["value_asc","value_desc","alpha_asc","alpha_desc","none"], default: "value_desc" },
              top_n: { type: "integer", minimum: 1 },
              facet: {
                type: "object", additionalProperties: false,
                properties: { by: { type: "string", enum: ["split_by","axis_1"] }, layout: { type: "string", enum: ["row","column","grid"], default: "grid" }, max_cols: { type: "integer", minimum: 1 } },
                required: ["by"]
              }
            },
            required: ["kind","value","orientation"]
          }
        },
        required: ["sourceId","type","overview","axis_1","chart"],
        $defs: buildSectionBaseDefs()
      }
    }),
    pie: () => ({
      name: "section_visualization_pie",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "integer" },
          sourceId: { type: "string" },
          type: { type: "string", const: "visualization" },
          pre_filter: { $ref: "#/$defs/MaybeFilter" },
          axis_1: { type: "object", additionalProperties: false, properties: { definition: { $ref: "#/$defs/AxisDef" }, filter: { $ref: "#/$defs/MaybeFilter" } }, required: ["definition"] },
          split_by: { $ref: "#/$defs/AxisDef" },
          overview: { type: "string" },
          chart: {
            type: "object", additionalProperties: false,
            properties: {
              kind: { type: "string", const: "pie" },
              value: { $ref: "#/$defs/MeasureSpec" },
              donut: { type: "boolean", default: false },
              labels: { type: "boolean", default: true },
              sort_by: { type: "string", enum: ["value_asc","value_desc","alpha_asc","alpha_desc","none"], default: "value_desc" },
              top_n: { type: "integer", minimum: 1 },
              facet: {
                type: "object",
                additionalProperties: false,
                properties: {
                  by: { type: "string", enum: ["split_by"] },
                  layout: { type: "string", enum: ["row","column","grid"], default: "grid" },
                  max_cols: { type: "integer", minimum: 1 },
                  scale: { type: "string", enum: ["none","area","radius"], default: "area" }
                },
                required: ["by"]
              }
            },
            required: ["kind","value"]
          }
        },
        required: ["sourceId","type","overview","axis_1","chart"],
        $defs: buildSectionBaseDefs()
      }
    }),
    bubble: () => ({
      name: "section_visualization_bubble",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "integer" },
          sourceId: { type: "string" },
          type: { type: "string", const: "visualization" },
          pre_filter: { $ref: "#/$defs/MaybeFilter" },
          axis_1: { type: "object", additionalProperties: false, properties: { definition: { $ref: "#/$defs/AxisDef" }, filter: { $ref: "#/$defs/MaybeFilter" } }, required: ["definition"] },
          axis_2: { type: "object", additionalProperties: false, properties: { definition: { $ref: "#/$defs/AxisDef" }, filter: { $ref: "#/$defs/MaybeFilter" } }, required: ["definition"] },
          overview: { type: "string" },
          chart: {
            type: "object", additionalProperties: false,
            properties: {
              kind: { type: "string", const: "bubble" },
              size: { $ref: "#/$defs/MeasureSpec" },
              color_by: { $ref: "#/$defs/AxisDef" },
              labels: { type: "boolean", default: true }
            },
            required: ["kind","size"]
          }
        },
        required: ["sourceId","type","overview","axis_1","axis_2","chart"],
        $defs: buildSectionBaseDefs()
      }
    }),
    heatmap: () => ({
      name: "section_visualization_heatmap",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "integer" },
          sourceId: { type: "string" },
          type: { type: "string", const: "visualization" },
          pre_filter: { $ref: "#/$defs/MaybeFilter" },
          axis_1: { type: "object", additionalProperties: false, properties: { definition: { $ref: "#/$defs/AxisDef" }, filter: { $ref: "#/$defs/MaybeFilter" } }, required: ["definition"] },
          axis_2: { type: "object", additionalProperties: false, properties: { definition: { $ref: "#/$defs/AxisDef" }, filter: { $ref: "#/$defs/MaybeFilter" } }, required: ["definition"] },
          overview: { type: "string" },
          chart: {
            type: "object", additionalProperties: false,
            properties: {
              kind: { type: "string", const: "heatmap" },
              value: { $ref: "#/$defs/MeasureSpec" },
              labels: { type: "boolean", default: false },
              facet: { type: "object", additionalProperties: false, properties: { by: { type: "string", enum: ["axis_1","axis_2"] } } }
            },
            required: ["kind","value"]
          }
        },
        required: ["sourceId","type","overview","axis_1","axis_2","chart"],
        $defs: buildSectionBaseDefs()
      }
    })
  }
};

function inferChartKindFromText(text = "") {
  const t = (text || "").toLowerCase();
  if (t.includes("heatmap") || t.includes("matrix") || t.includes("grid")) return "heatmap";
  if (t.includes("bubble")) return "bubble";
  if (t.includes("pie") || t.includes("share") || t.includes("proportion")) return "pie";
  if (t.includes("bar") || t.includes("rank") || t.includes("top")) return "bar";
  return "bar";
}

export async function getAnalysisContext(params, scope, existing = {}) {
  const context = { ...existing };

  if ((!context.data || !context.categories) && scope?.functionMap) {
    try {
      const sample = await scope.functionMap["sample_data"]({ limit: 20, ...params, forSample: true, withCategory: true }, scope);
      context.data = sample?.data;
      context.categories = sample?.categories;
    } catch (err) {
      logger.error("Failed to fetch sample data for slide design", err);
    }
  }

  if (!context.categorizations && scope?.functionMap) {
    try {
      const existingCategorizations = await scope.functionMap["existing_categorizations"]({ ...params, forSample: true, withCategory: true }, scope);
      context.categorizations = existingCategorizations?.categories;
    } catch (err) {
      logger.error("Failed to fetch existing categorizations", err);
    }
  }

  if (!context.categoryDefs && Array.isArray(context.categories)) {
    context.categoryDefs = context.categories
      .map(d => categoryDetailsForAgent(d))
      .filter(Boolean);
  }

  if (!context.categoryDataAsString && context.categoryDefs) {
    context.categoryDataAsString = JSON.stringify(context.categoryDefs);
  }

  if (!context.categorizationsText && context.categorizations) {
    try {
      context.categorizationsText = JSON.stringify(context.categorizations);
    } catch (err) {
      logger.error("Failed to stringify categorizations", err);
    }
  }

  return context;
}

export async function expandSlideOutlines({ outlines, context, goal, sourceId, scope, model = "gpt-5-mini" }) {
  if (!Array.isArray(outlines) || outlines.length === 0) return [];

  const categoryDataAsString = context?.categoryDataAsString || "[]";
  const categorizationsText = context?.categorizationsText;

  const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });

  const outlinePromises = outlines.map(async (outline) => {
    const sectionPromises = (outline.sections || []).map(async (sec) => {
      let sectionSchema;
      let chartKind;

      if (sec.type === "summary") {
        sectionSchema = SECTION_SCHEMAS.summary();
      } else if (sec.type === "visualization") {
        chartKind = sec.chart_kind || inferChartKindFromText(sec.overview);
        const builder = SECTION_SCHEMAS.visualization?.[chartKind];
        sectionSchema = builder ? builder() : SECTION_SCHEMAS.visualization.bar();
      } else {
        return null;
      }

      const messages = [
        { role: "system", content: "You are a data analysis agent. Produce a single section config only (no slide/defs)." },
        { role: "user", content: `Follow these analysis constraints strictly:\n${ANALYSIS_OPTIONS.replaceAll(/\s+/g, " ")}` },
        { role: "user", content: `Here is the schema of the data:\n${categoryDataAsString}` },
        outline?.defs && { role: "user", content: `Slide-level defs defined in Pass A (use ONLY these via $ref):\n${JSON.stringify(outline.defs)}` },
        categorizationsText && { role: "user", content: `Existing categorizations for this data (db):\n${categorizationsText}` },
        { role: "user", content: `User goal:\n${goal}` },
        { role: "user", content: `Here is the section outline to refine:\n${JSON.stringify(sec)}` },
        chartKind && { role: "user", content: `Use chart kind: ${chartKind}` },
        { role: "user", content: "Constraints: Output a SINGLE JSON object for the section only. Do not include defs. Do not include sourceId (the server will inject it). Use only {$ref:'filters.*'} and {$ref:'categorizations.*'} present in defs when referencing filters/categorizations. For axes/split/color_by you may either reference a categorization via {$ref:'categorizations.*'} or select a direct schema field via {parameter:'<field>'}. Always include type and overview." }
      ].filter(Boolean);

      const res = await openai.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_schema", json_schema: sectionSchema }
      });

      recordUsage({
        workspace: scope?.workspaceId,
        functionName: "agent_module_suggest_analysis",
        usageId: "agent_module_suggest_analysis_pass_b_section",
        api: "open_ai",
        data: res
      });

      const msg = res.choices?.[0]?.message;
      try {
        const obj = JSON.parse(msg?.content || "{}");
        if (obj && typeof obj === "object") {
          obj.sourceId = sourceId;
          return obj;
        }
      } catch (err) {
        logger.error("Pass B section JSON parse error", err);
      }
      return null;
    });

    const settled = await Promise.allSettled(sectionPromises);
    const refinedSections = settled
      .map(r => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean);

    return {
      id: outline.id,
      description: outline.description,
      layout: outline.layout,
      defs: outline.defs,
      sections: refinedSections
    };
  });

  const results = await Promise.allSettled(outlinePromises);
  return results.map(r => (r.status === "fulfilled" ? r.value : null));
}

export { SECTION_SCHEMAS };
