import OpenAI from "openai";
import { getLogger } from "../../logger.js";
import { recordUsage } from "../../usage_tracker.js";

export const ANALYSIS_OPTIONS = `*) The ultimate goal is to prodce a slide which helps the user with their goal
                                  *) Slides can one or more elements with each element being a markdown summarization of data or
 a chart / graph of data
                                  *) Slides must be optimized for readability and be as concise as possible whilst delivering on
 the user's goal
                                  *) Slides must use only the data available from the specified source
                                  *) Slides can have one of the following layouts
                                  *) - full_page: Full page analysis
                                  *) - left_summary: A slide with a left pane summary covering 1/4 of the page width - with the
right hand side showing a single visualization or set of summaries
                                  *) Data can be grouped / categorized by specific paramters of the data schema using AI.
                                  *) AI can summarize the data based on any of the parameters in the schema - in both short of l
ong form using suitable AI prompts to shape the summarization and the specific outputs
                                  *) Summaries can be created of the full data set, a subset of the data by filtering specific p
arameters, or a subset of data by grouping on categorizations
                                  *) Categorizations are expensive so use an existing categorization where suitable before defin
ing a new one (unless the user specifically states a new categorization)
                                  *) Data can be visualzied in graphs and charts
                                  *) Reusability rules (STRICT):**
                                  *) - If a section field (pre_filter, categorization, summarization, visualization, post_filter
) is reused across multiple sections in the SAME slide, put the canonical definition in slide-level "defs" and reference it with
 {"$ref":"<group>.<key>"}.
                                  *) - Prefer {"$ref": "..."} over {"same_as": ...}. Use {"same_as": ...} only when reusing a fi
eld that is *unique to one section* and not worth adding to defs.
                                  *) - NEVER chain or self-reference: a field with {"same_as":{section_id,field}} must point to
a section that has that field as a **literal string or a {$ref}**, not another {"same_as"}.
                                  *) - {"same_as"} may only refer to a section **in the same slide** and with a **smaller sectio
n_id** (appeared earlier).
                                  *) - At least once per slide, each reused field must have a concrete definition (string or {$r
ef}). Do not produce two sections that both use {"same_as"} for the same field with no anchor.
                                    *) If any section in a slide uses a categorization, every section in that slide that referen
ces the same concept MUST either:
                                    *) - include the same {"$ref":"categorizations.<key>"}, or
                                    *) - explicitly declare why it's not categorized (rare).
                                  *) If you define defs.categorizations.<name>, you MUST reference it at least once via {"$ref":
"categorizations.<name>"} in a section's categorization or list it in a filter's requires.
                                  *) If a filter mentions a field that is only available via a slide-defined categorization, you
 MUST also attach that categorization to every section that uses the filter.
                                          *) Never instruct counting or math inside summarization. If counts are needed, they be
long in the visualization; the summary should interpret the (already computed) results (e.g., "Hydration and Skin & Beauty domin
ate, with notable lift over others").
                                    *) Prefer slide-level defs + $ref over same_as. Use same_as only when a one-off reuse is cle
arly tied to a single section and not worth a defs entry.`;

const logger = getLogger("analysis_section_engine", "debug", 0);

function buildSectionBaseDefs() {
  return {
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
    MaybeFilter: {
      oneOf: [ { type: "string" }, { $ref: "#/$defs/FilterRef" } ]
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
                properties: {
                  by: { type: "string", enum: ["split_by","axis_1"] },
                  layout: { type: "string", enum: ["row","column","grid"], default: "grid" },
                  max_cols: { type: "integer", minimum: 1 }
                },
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
          split_by: { $ref: "#/$defs/AxisDef" },
          axis_1: { type: "object", additionalProperties: false, properties: { definition: { $ref: "#/$defs/AxisDef" }, filter: { $ref: "#/$defs/MaybeFilter" } }, required: ["definition"] },
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
                  by: { type: "string", const: "axis_1" },
                  scale: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      mode: { type: "string", enum: ["radius","area"], default: "radius" },
                      measure: { $ref: "#/$defs/MeasureSpec" }
                    },
                    required: ["measure"]
                  }
                },
                required: ["by"]
              }
            },
            required: ["kind","value"]
          }
        },
        required: ["sourceId","type","overview","split_by","chart"],
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

export function inferChartKindFromText(text = "") {
  const t = (text || "").toLowerCase();
  if (t.includes("heatmap") || t.includes("matrix") || t.includes("grid")) return "heatmap";
  if (t.includes("bubble")) return "bubble";
  if (t.includes("pie") || t.includes("share") || t.includes("proportion")) return "pie";
  if (t.includes("bar") || t.includes("rank") || t.includes("top")) return "bar";
  return "bar";
}

function buildSchemaForOutline(outlineType, chartKind) {
  if (outlineType === "summary") {
    return SECTION_SCHEMAS.summary();
  }
  if (outlineType === "visualization") {
    const builder = SECTION_SCHEMAS.visualization?.[chartKind || "bar"];
    return builder ? builder() : SECTION_SCHEMAS.visualization.bar();
  }
  return null;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    logger.error("Failed to stringify value for prompt", err);
    return "";
  }
}

function formatSampleData(sampleData) {
  if (!sampleData) return null;
  const data = Array.isArray(sampleData) ? sampleData.slice(0, 5) : sampleData;
  const str = safeStringify(data);
  return str ? `Here is some sample data:\n${str}` : null;
}

function formatExistingCategorizations(categorizations) {
  if (!categorizations) return null;
  if (typeof categorizations === "string") {
    return `Existing categorizations for this data:\n${categorizations}`;
  }
  const str = safeStringify(categorizations);
  return str ? `Existing categorizations for this data:\n${str}` : null;
}

export async function generateDetailedSections({
  openai,
  scope,
  goal,
  sourceId,
  categoryData,
  sectionRequests,
  slideDefs,
  sampleData,
  existingCategorizations,
  usage = { functionName: "analysis_section_engine", usageId: "analysis_section_engine_section" }
}) {
  if (!Array.isArray(sectionRequests) || sectionRequests.length === 0) {
    return [];
  }

  const client = openai || new OpenAI({ apiKey: process.env.OPEN_API_KEY });
  const categoryDataString = safeStringify(categoryData || []);
  const sampleMessage = formatSampleData(sampleData);
  const categorizationsMessage = formatExistingCategorizations(existingCategorizations);

  const defsMessage = slideDefs ? `Slide-level defs defined earlier (use ONLY these via $ref):\n${safeStringify(slideDefs)}` : null;
  const outputs = [];
  const usageFunction = usage?.functionName || "analysis_section_engine";
  const usageId = usage?.usageId || "analysis_section_engine_section";

  for (const request of sectionRequests) {
    const outline = { ...(request.outline || {}) };
    if (!outline.type && request.type) outline.type = request.type;
    if (!outline.overview && request.overview) outline.overview = request.overview;
    if (request.pre_filter && outline.pre_filter == null) outline.pre_filter = request.pre_filter;
    if (request.categorization && outline.categorization == null) outline.categorization = request.categorization;
    if (request.summarization && outline.summarization == null) outline.summarization = request.summarization;
    if (request.visualization && outline.visualization == null) outline.visualization = request.visualization;

    if (!outline.type) {
      outputs.push(null);
      continue;
    }

    const chartKind = request.chart_kind || outline.chart_kind || request.existingSection?.chart?.kind || inferChartKindFromText(outline.overview || request.instructions || "");
    const schema = buildSchemaForOutline(outline.type, chartKind);

    if (!schema) {
      outputs.push(null);
      continue;
    }

    const messages = [
      { role: "system", content: "You are a data analysis agent. Produce a single section config only (no slide/defs)." },
      { role: "user", content: `Follow these analysis constraints strictly:\n${ANALYSIS_OPTIONS.replaceAll(/\s+/g, " ")}` },
      { role: "user", content: `Here is the schema of the data:\n${categoryDataString}` },
      sampleMessage && { role: "user", content: sampleMessage },
      categorizationsMessage && { role: "user", content: categorizationsMessage },
      defsMessage && { role: "user", content: defsMessage },
      request.existingSection && { role: "user", content: `Current section spec:\n${safeStringify(request.existingSection)}` },
      request.context && { role: "user", content: request.context },
      { role: "user", content: `User goal:\n${request.goal || goal}` },
      { role: "user", content: `Here is the section outline to refine:\n${safeStringify(outline)}` },
      chartKind && { role: "user", content: `Use chart kind: ${chartKind}` },
      request.instructions && { role: "user", content: `Apply these edits or focus areas:\n${request.instructions}` },
      { role: "user", content: "Constraints: Output a SINGLE JSON object for the section only. Do not include defs. Do not include sourceId (the server will inject it). Use only {$ref:'filters.*'} and {$ref:'categorizations.*'} present in defs when referencing filters/categorizations. For axes/split/color_by you may either reference a categorization via {$ref:'categorizations.*'} or select a direct schema field via {parameter:'<field>'}. Always include type and overview." }
    ].filter(Boolean);

    try {
      const response = await client.chat.completions.create({
        model: "gpt-5-mini",
        messages,
        response_format: { type: "json_schema", json_schema: schema }
      });

      recordUsage({
        workspace: scope.workspaceId,
        functionName: usageFunction,
        usageId,
        api: "open_ai",
        data: response
      });

      const content = response.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object") {
            const resolvedSource = request.sourceId || outline.sourceId || request.existingSection?.sourceId || sourceId;
            if (resolvedSource) parsed.sourceId = resolvedSource;
            parsed.id = request.section_id;
            outputs.push(parsed);
            continue;
          }
        } catch (err) {
          logger.error("Section refinement JSON parse error", err);
        }
      }
    } catch (err) {
      logger.error("Failed to generate section details", err);
    }

    outputs.push(null);
  }

  return outputs;
}
