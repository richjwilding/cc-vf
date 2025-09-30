import OpenAI from "openai"
import { getLogger } from "../../logger";
import { recordUsage } from "../../usage_tracker";
import { VIEW_OPTIONS } from "./suggest_visualizations";
import { touchSlideState } from "./slides";
import { ANALYSIS_OPTIONS, expandSlideOutlines, getAnalysisContext } from "./slide_section_designer";

const logger = getLogger('agent_module_suggest_analysis', "debug", 0); // Debug level for moduleA


// Pass A: outline schema establishes slide-level definitions (defs) and lightweight sections that reference them.
const pass_a_schema = {
  name: "analysis_suggestions",
  schema: {
    type: "object",
    required: ["suggestions"],
    additionalProperties: false,
    properties: {
      suggestions: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: { $ref: "#/$defs/SlideSuggestionOutline" }
      }
    },
    $defs: {
      // Reuse core building blocks so Pass A speaks the same language as Pass B
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
          description: { type: "string" },
          layout: { type: "string", enum: ["full_page", "left_summary"] },
          // Pass A owns all canonical definitions
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
        required: ["type"],
        properties: {
          type: { type: "string", const: "summary" },
          overview: { type: "string" },
          pre_filter: { $ref: "#/$defs/MaybeRefOrString" },
          categorization: { $ref: "#/$defs/DefsRef" }
        }
      },
      VizSectionOutline: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: { type: "string", const: "visualization" },
          overview: { type: "string", description: "Describe what to visualize and why (no config) including any filters, grouping and axis / splits." },
          chart_kind: { type: "string", enum: ["heatmap", "bubble", "pie", "bar" ] },
          //pre_filter: { $ref: "#/$defs/MaybeRefOrString" },
          //axis_1: { type: "object", additionalProperties: false, properties: { definition: { $ref: "#/$defs/DefsRef" } } },
          //axis_2: { type: "object", additionalProperties: false, properties: { definition: { $ref: "#/$defs/DefsRef" } } },
          //split_by: { $ref: "#/$defs/DefsRef" }
        }
      }
    }
  }
}

// Concrete per-section JSON schemas used in Pass B
export async function implementation(params, scope, notify){
        const context = await getAnalysisContext(params, scope);
        const {data, categories} = context || {};

        if( data && categories){
            const categoryDataAsString = context.categoryDataAsString || JSON.stringify(context.categoryDefs || []);
            const categorizationsText = context.categorizationsText;

            const messages = [
               {
                role: "system",
                content: `You are a data analysis agent.  The user is looking to analyze their data in clear and concise slides.`
               },{
                role: "user",
                content: `Here is are details of what analysis that can done:\n${ANALYSIS_OPTIONS.replaceAll(/\s+/g," ")}`
               },{
                 role: "user",
                  content: `Here is are details of what views can be created:\n${VIEW_OPTIONS.replaceAll(/\s+/g," ")}`
               },{
                 role: "user",
                 content: `Data from source ${params.id} is available`,
                },{
                 role: "user",
                 content: `Here is the schema of the data:\n${categoryDataAsString}`,
                },{
                role: "user",
                content: `Here is some sample data:\n${JSON.stringify(data)}`
                },
                categorizationsText && {
                  role: "user",
                  content: `here is a list of existing categorizations of this data:\n${categorizationsText}`
                },
                {
                role: "user",
                content: `here is goal of the user:\n${params.goal}`
               },{
                role: "user",
                content: `Suggest 3-5 suitable slides using the options available and which are achievable for the data sample,schema and the view options provided.
                        Ensure the options meets the specific goal from the user. In Pass A, define slide-level defs ONLY for filters and categorizations. Categorizations MUST use the CategorizationSpec schema: either an existing id {categorization_id,title}, an inline_prompt {mode:'inline_prompt',parameter,prompt,target_count?}, a direct field {parameter}, a needs_task {mode:'needs_task',task:'categorize_data',parameter,task_args?,produces_ref}, or inline_explicit {mode:'inline_explicit',parameter,items:[CategoryItem...]}. Avoid $ref or same_as inside defs. Sections must reference these defs using {$ref: 'filters.<key>'} or {$ref:'categorizations.<key>'}. Keep sections lightweight (type, chart.kind, overview, and minimal refs). Use human-friendly field names in text.`
                }
             ].filter(Boolean)
            console.log( messages)
            const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
            const res = await openai.chat.completions.create({
              model: "gpt-5-mini",
              messages,
              response_format: {
                  type: "json_schema",
                  json_schema: pass_a_schema
              }
            });
            const msg = res.choices[0].message;
            recordUsage({
              workspace: scope.workspaceId,
              functionName: "agent_module_suggest_analysis",
              usageId: "agent_module_suggest_analysis_pass_a",
              api: "open_ai",
              data: res
            })

            const outlines = (() => {
              try {
                return JSON.parse(msg?.content)?.suggestions || []
              } catch (_) { return [] }
            })();

            const normalizedOutlines = outlines.map((s, i) => ({
              id: (typeof s.id === 'number' ? s.id : i + 1),
              description: s.description,
              layout: s.layout,
              defs: s.defs || undefined,
              sections: Array.isArray(s.sections) ? s.sections : []
            }));

            const expandedResults = await expandSlideOutlines({
              outlines: normalizedOutlines,
              context,
              goal: params.goal,
              sourceId: params.id,
              scope
            });

            const expandedSuggestions = expandedResults.filter(Boolean);

            const finalSuggestions = expandedSuggestions.length ? expandedSuggestions : normalizedOutlines;

            let slideSession = null;
            if (scope.workSession && scope.workSession.flow === 'slides') {
              throw "Why is this reachable?";
            } else if (typeof scope.beginWorkSession === 'function') {
              slideSession = scope.beginWorkSession('slides', { suggestions: finalSuggestions });
              slideSession.state = 'list';
              slideSession.data ||= {};
              slideSession.data.selection = null;
              slideSession.data.analysisContext = context;
              touchSlideState(scope)
            }

            return { suggestions: finalSuggestions }
        }
        return {
            data_missing: data === undefined,
            metatdata: categories === undefined,
        }
}

export const definition = {
    "name": "suggest_analysis",
    "description": "Produce a list of suggested presentation slides using the available data which will help the user in delivering or advancing on their goal",
    "parameters": {
        "type": "object",
        "required": ["id", "goal"],
        "properties": {
          "id": {
              "type": "string",
              "description": "ID of the source data object to analyze."
          },
          "goal": {
              "type": "string",
              "description": "Description of what they're trying to learn or show in the analysis."
          }
        },
        "additionalProperties": false
    }
}
