import OpenAI from "openai";
import { getLogger } from "../../logger.js";
import { recordUsage } from "../../usage_tracker.js";

export const ANALYSIS_OPTIONS = `*) The ultimate goal is to prodce a slide which helps the user with their goal
                                  *) Slides can one or more elements with each element being a markdown summarization of data or a chart / graph of data
                                  *) Slides must be optimized for readability and be as concise as possible whilst delivering on the user's goal
                                  *) Slides must use only the data available from the specified source
                                  *) Slides can adopt flexible layouts (single column, split summary + visualization, multi-panel etc.) - use the layout metadata provided for each section to decide placement and relative emphasis
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

const LAYOUT_SLOT_SIZES = {
  large: new Set(["full_page", "full_width", "center", "bottom_full", "hero"]),
  medium: new Set(["top_full", "middle_full", "right_column", "left_column", "upper", "lower", "canvas"]),
  small: new Set(["top_left", "top_right", "middle_left", "middle_right", "bottom_left", "bottom_right", "callout", "sidebar", "tile", "stack"]),
};

function classifyLayoutFootprint(layout) {
  if (!layout || typeof layout !== "object") {
    return "medium";
  }
  const slot = typeof layout.slot === "string" ? layout.slot.toLowerCase() : null;
  const size = typeof layout.size === "string" ? layout.size.toLowerCase() : null;
  const emphasis = typeof layout.emphasis === "string" ? layout.emphasis.toLowerCase() : null;

  if (size === "large" || emphasis === "high") return "large";
  if (size === "small" || emphasis === "low") return "small";

  if (slot) {
    if (LAYOUT_SLOT_SIZES.large.has(slot)) return "large";
    if (LAYOUT_SLOT_SIZES.small.has(slot)) return "small";
    if (LAYOUT_SLOT_SIZES.medium.has(slot)) return "medium";
  }

  return "medium";
}

function determineWordBudgets(layout, sectionHint) {
  const footprint = classifyLayoutFootprint(layout);
  const totals = {
    large: 240,
    medium: 170,
    small: 120,
  };
  const totalWords = totals[footprint] ?? totals.medium;
  const sections = Math.max(sectionHint || 3, 1);
  const perSection = Math.max(40, Math.round(totalWords / sections));
  return { totalWords, perSection, footprint };
}

function buildSummaryPromptGuidance(outline) {
  if (!outline || outline.type !== "summary") {
    return null;
  }

  const overviewText = typeof outline.overview === "string" ? outline.overview.trim() : null;
  const layoutSections = Array.isArray(outline.layout?.sections) ? outline.layout.sections.length : 0;
  const { totalWords, perSection, footprint } = determineWordBudgets(outline.layout, layoutSections || 3);

  return `When populating the 'summarization' field, write a concrete prompt for the summarization agent for the following goal: ${overviewText}.

The prompt:
1) Must start: "Using only the content in the "
2) Structure:
2a) If the goal asks for a single summary - you must explicitly define the focus of the summary and specify a limit of  ${perSection * 1.5} words
2b) If the goal asks for a summary and breakdown of thematic areas / topics: You must explicitly define a summary section of (and include this has a  ${perSection * 1.5} word limit), followed by a definition of a template for each breakdown area (and include a  ${Math.floor(perSection * 0.6)} word limit for each and instructions to use this template for each breakdown area)
2c) If the goal asks for a summary and further analysis: you must explicitly define ${layoutSections ?? 3} sections in the prompt- the first being a summary and the remaining  decomposing the thesis into relevant considerations. The prompt must include explicit word caps of ${Math.floor(perSection * 0.6)} words each, and ensure the full response stays below ${totalWords} words to fit the slide layout
2d) If the goal asks for a list of items: You must define a template for items (and include a ${Math.floor(perSection * 0.6)} word limit for each and instructions to use this template for each item in the list)
3) You must not include sections for recommendation, evidence or quotes in this prompt unless the goals asks for it
4)The agent should not include any audit sections (ie those about content length, data availability or job completion) 
5) End with " Do not include any audit/meta information. Be evidence led, do not make up facts, and avoid hyperbole"

Do not include reference to the schema field names, filters, category identifiers, or data source names in your instruction. Refer to the evidence in plain language (e.g. ‘the posts’, ‘the records’).

here are some examples: Analyze the provided data to find any and all examples of {segment} and its parent company / group planing, experimenting with, trialling or deploying AI, Automation or Robotics (either developed in-house or from an external vendor)

<example1>
Produce a single summary with the following sections:
- Overview: a 80 word overview of how {segment} is using these technologies
- Use case: the target use cases (problems / enhancements / improvements / cost savings etc)
- Impact: an overview of the impact including metrics (e.g $$ or time savings / productivity etc)
- Reaction: an overview of the reaction from staff / customers / suppliers / shareholder as relevant.
If the company has multiple inititaives the sumamry should touch on all of them
</example1>
<example2>
Im researching what people are saying in instagram posts about Thorne products. Provide me an analysis of the key recurring different topics, sentiments and views in the posts
Include verbatim quotes to evidence each section of your analysis
</example2>
<example3>
Review these reddit discussions and produce an analysis of each discussion of Thorne products
- Include the following details where mentioned:
- Customer motivations and perceived benefits of the solution they are looking for (ie more energy, manage knee pain etc)
- Key differentiators (clinical quality, trust signals, recommendations, etc.) of discussed products (include the brand where mentioned - ie Thorne or the name of the competitor)
- Emotional and experiential language around use of products including the brand in question (ie Thorne or the name of the competitor)
- Friction points, hesitation moments, perceived objections about using any products, choosing a specific product, or using Thorne
- Quotes: a list of up to 3 verbatim quotes to evidence you analysis
</example3>`

  return `When populating the 'summarization' field, write a concrete prompt for the summarization agent for the following goal: ${overviewText}.
      The prompt:
      1) Must start: "Using only the content in the "
      2) You must explicitly define between ${layoutSections ?? 3} sections in the prompt- the first being a summary and the remaining  decomposing the thesis into relevant considerations. The prompt must include explicit word caps of ${perSection} words each, and ensure the full response stays below ${totalWords} words to fit the slide layout.
      3) You must not include sections for recommendation, evidence or quotes in this prompt unless the goals asks for it
      4)The agent should not include any audit sections (ie those about content length, data availability or job completion) 
      5) End with " Do not include any audit/meta information. Be evidence led, do not make up facts, and avoid hyperbole"

      Do not include reference to the schema field names, filters, category identifiers, or data source names in your instruction. Refer to the evidence in plain language (e.g. ‘the posts’, ‘the records’).

      here are some examples: Analyze the provided data to find any and all examples of {segment} and its parent company / group planing, experimenting with, trialling or deploying AI, Automation or Robotics (either developed in-house or from an external vendor)

      <example1>
      Produce a single summary with the following sections:
      - Overview: a 80 word overview of how {segment} is using these technologies
      - Use case: the target use cases (problems / enhancements / improvements / cost savings etc)
      - Impact: an overview of the impact including metrics (e.g $$ or time savings / productivity etc)
      - Reaction: an overview of the reaction from staff / customers / suppliers / shareholder as relevant.
      If the company has multiple inititaives the sumamry should touch on all of them
      </example1>
      <example2>
      Im researching what people are saying in instagram posts about Thorne products. Provide me an analysis of the key recurring different topics, sentiments and views in the posts
      Include verbatim quotes to evidence each section of your analysis
      </example2>
      <example3>
      Review these reddit discussions and produce an analysis of each discussion of Thorne products
      - Include the following details where mentioned:
      - Customer motivations and perceived benefits of the solution they are looking for (ie more energy, manage knee pain etc)
      - Key differentiators (clinical quality, trust signals, recommendations, etc.) of discussed products (include the brand where mentioned - ie Thorne or the name of the competitor)
      - Emotional and experiential language around use of products including the brand in question (ie Thorne or the name of the competitor)
      - Friction points, hesitation moments, perceived objections about using any products, choosing a specific product, or using Thorne
      - Quotes: a list of up to 3 verbatim quotes to evidence you analysis
      </example3>`

  const guidance = [];
  guidance.push("When populating the `summarization` field, write a concrete instruction for the summarization agent. The instruction must rely solely on the provided, connected data sources—never introduce outside knowledge or speculation.");

  if (overviewText) {
    guidance.push(`Use this overview as the organising thesis for the prompt: ${overviewText}`);
  }

  guidance.push(
    `Request a concise markdown summary with ${layoutSections || 3} sections, each capped at ${perSection} words, and ensure the full response stays below ${totalWords} words to fit the slide layout.`
  );

  const footprintDescriptor = footprint === "large"
    ? "a full-width placement"
    : footprint === "small"
      ? "a compact callout"
      : "a shared layout region";
  guidance.push(
    `Remind the agent that the summary will appear in ${footprintDescriptor}, so it must remain tight, skimmable, and shaped for slide-ready prose.`
  );

  guidance.push(
    "Instruct the agent to be evidence-led: cite concrete metrics, quotes, and observations that exist in the underlying data. Avoid hyperbole, value judgements, or sweeping claims. If the data is silent or contradictory, note that directly instead of guessing."
  );

  guidance.push(
    "Keep the wording general: do not list schema field names, filters, category identifiers, or data source names. Refer to the evidence in plain language (e.g. ‘the posts’, ‘the records’)."
  );

  guidance.push(
    "Write the instruction as a direct imperative sentence or short paragraph—avoid prefixes such as 'Instruction for the agent'. Encourage the agent to pick clear, human-readable section headings that match the overview (e.g. ‘Snapshot’, ‘Evidence’, ‘Gaps’)."
  );

  guidance.push(
    "Explicitly instruct the agent to to be evidence led and to avoid hyperbole."
  );
  
  guidance.push(`here are some examples: Analyze the provided data to find any and all examples of {segment} and its parent company / group planing, experimenting with, trialling or deploying AI, Automation or Robotics (either developed in-house or from an external vendor)

<example1>
Produce a single summary with the following sections:
- Overview: a 80 word overview of how {segment} is using these technologies
- Use case: the target use cases (problems / enhancements / improvements / cost savings etc)
- Impact: an overview of the impact including metrics (e.g $$ or time savings / productivity etc)
- Reaction: an overview of the reaction from staff / customers / suppliers / shareholder as relevant.
If the company has multiple inititaives the sumamry should touch on all of them
</example1>
<example2>
Im researching what people are saying in instagram posts about Thorne products. Provide me an analysis of the key recurring different topics, sentiments and views in the posts
Include verbatim quotes to evidence each section of your analysis
</example2>
<example3>
Review these reddit discussions and produce an analysis of each discussion of Thorne products
- Include the following details where mentioned:
- Customer motivations and perceived benefits of the solution they are looking for (ie more energy, manage knee pain etc)
- Key differentiators (clinical quality, trust signals, recommendations, etc.) of discussed products (include the brand where mentioned - ie Thorne or the name of the competitor)
- Emotional and experiential language around use of products including the brand in question (ie Thorne or the name of the competitor)
- Friction points, hesitation moments, perceived objections about using any products, choosing a specific product, or using Thorne
- Quotes: a list of up to 3 verbatim quotes to evidence you analysis
</example3>`)

  return guidance.join("\n\n");
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
  usage = { functionName: "analysis_section_engine", usageId: "analysis_section_engine_section" },
  onSectionStatusChange
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
    onSectionStatusChange?.(request, "pending");

    const outline = { ...(request.outline || {}) };
    if (!outline.type && request.type) outline.type = request.type;
    if (!outline.overview && request.overview) outline.overview = request.overview;
    if (request.pre_filter && outline.pre_filter == null) outline.pre_filter = request.pre_filter;
    if (request.categorization && outline.categorization == null) outline.categorization = request.categorization;
    if (request.summarization && outline.summarization == null) outline.summarization = request.summarization;
    if (request.visualization && outline.visualization == null) outline.visualization = request.visualization;

    if (!outline.type) {
      onSectionStatusChange?.(request, "error");
      outputs.push(null);
      continue;
    }

    const chartKind = outline.type === "summary"
      ? undefined
      : request.chart_kind || outline.chart_kind || request.existingSection?.chart?.kind || inferChartKindFromText(outline.overview || request.instructions || "");
    const schema = buildSchemaForOutline(outline.type, chartKind);

    if (!schema) {
      onSectionStatusChange?.(request, "error");
      outputs.push(null);
      continue;
    }

    const summaryGuidance = buildSummaryPromptGuidance(outline);

    const messages = [
      { role: "system", content: "You are a data analysis agent. Produce a single section config only (no slide/defs)." },
      { role: "user", content: `Follow these analysis constraints strictly:\n${ANALYSIS_OPTIONS.replaceAll(/\s+/g, " ")}` },
      { role: "user", content: `Here is the schema of the data:\n${categoryDataString}` },
      sampleMessage && { role: "user", content: sampleMessage },
      categorizationsMessage && { role: "user", content: categorizationsMessage },
      defsMessage && { role: "user", content: defsMessage },
      request.existingSection && { role: "user", content: `Current section spec:\n${safeStringify(request.existingSection)}` },
      request.context && { role: "user", content: request.context },
      outline.type !== "summary" && { role: "user", content: `User goal:\n${request.goal || goal}` },
      outline.type !== "summary" && { role: "user", content: `Here is the section outline to refine:\n${safeStringify(outline)}` },
      chartKind && { role: "user", content: `Use chart kind: ${chartKind}` },
      summaryGuidance && { role: "user", content: summaryGuidance },
      request.instructions && { role: "user", content: `Apply these edits or focus areas:\n${request.instructions}` },
      { role: "user", content: "Constraints: Output a SINGLE JSON object for the section only. Do not include defs. Do not include sourceId (the server will inject it). Use only {$ref:'filters.*'} and {$ref:'categorizations.*'} present in defs when referencing filters/categorizations. For axes/split/color_by you may either reference a categorization via {$ref:'categorizations.*'} or select a direct schema field via {parameter:'<field>'}. Always include type and overview." }
    ].filter(Boolean);

    console.log(`------ SECTION BUILD`)
    console.log(messages)
    console.log(`------ SECTION BUILD`)

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
            onSectionStatusChange?.(request, "ready");
            continue;
          }
        } catch (err) {
          logger.error("Section refinement JSON parse error", err);
        }
      }
    } catch (err) {
      logger.error("Failed to generate section details", err);
    }

    onSectionStatusChange?.(request, "error");
    outputs.push(null);
  }

  return outputs;
}
