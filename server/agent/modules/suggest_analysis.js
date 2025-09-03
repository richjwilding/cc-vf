import OpenAI from "openai"
import { getLogger } from "../../logger";
import { categoryDetailsForAgent, resolveId } from "../utils";
import { recordUsage } from "../../usage_tracker";
import { VIEW_OPTIONS } from "./suggest_visualizations";
import { touchSlideState } from "./slides";

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
                    	            *) - explicitly declare why it’s not categorized (rare).
                                  *) If you define defs.categorizations.<name>, you MUST reference it at least once via {"$ref":"categorizations.<name>"} in a section’s categorization or list it in a filter’s requires.
                                  *) If a filter mentions a field that is only available via a slide-defined categorization, you MUST also attach that categorization to every section that uses the filter.
	                    	          *) Never instruct counting or math inside summarization. If counts are needed, they belong in the visualization; the summary should interpret the (already computed) results (e.g., “Hydration and Skin & Beauty dominate, with notable lift over others”).
                    	            *) Prefer slide-level defs + $ref over same_as. Use same_as only when a one-off reuse is clearly tied to a single section and not worth a defs entry.`

const logger = getLogger('agent_module_suggest_analysis', "debug", 0); // Debug level for moduleA


const pass_a_schema = {
          "name": "analysis_suggestions",
          schema: {
                    "type":"object",
                    "required":["suggestions"],
                    "additionalProperties":false,
                    "properties":{
                      "suggestions":{
                        "type":"array",
                        "minItems":3,
                        "maxItems":5,
                        "items":{"$ref":"#/$defs/SlideSuggestionOutline"}
                      }
                    },
                    "$defs":{
                      "SlideSuggestionOutline":{
                        "type":"object",
                        "additionalProperties":false,
                        "required":["description","layout","sections"],
                        "properties":{
                          "id":{"type":"integer"},
                          "description":{"type":"string"},
                          "layout":{"type":"string","enum":["full_page","left_summary"]},
                          "sections":{
                            "type":"array",
                            "minItems":1,
                            "maxItems":3,
                            "items":{"oneOf":[
                              {"$ref":"#/$defs/SummarySectionOutline"},
                              {"$ref":"#/$defs/VizSectionOutline"}
                            ]}
                          }
                        }
                      },
                      "SummarySectionOutline":{
                        "type":"object",
                        "additionalProperties":false,
                        "required":["type"],
                        "properties":{
                          "type":{"type":"string","const":"summary"},
                          "overview":{"type":"string"}
                        }
                      },
                      "VizSectionOutline":{
                        "type":"object",
                        "additionalProperties":false,
                        "required":["type","chart"],
                        "properties":{
                          "type":{"type":"string","const":"visualization"},
                          "chart":{
                            "type":"object",
                            "additionalProperties":false,
                            "required":["kind"],
                            "properties":{"kind":{"type":"string","enum":["heatmap","bubble","pie","bar"]}}
                          },
                          "overview":{"type":"string"}
                        }
                      }
                    }
                  }
                }

export async function implementation(params, scope, notify){
        const {data, categories} = await scope.functionMap["sample_data"]({limit: 20, ...params, forSample: true, withCategory: true}, scope)
        const {categories: categorizations} = await scope.functionMap["existing_categorizations"]({...params, forSample: true, withCategory: true}, scope)

        const output_schema = {
          "name": "analysis_suggestions",
          "schema": {
            "type": "object",
            "description": "Container for AI-generated slide suggestions based solely on the specified data source(s).",
            "properties": {
              "suggestions": {
                "type": "array",
                "description": "List of suggested slides. Each suggestion is self-contained (no implicit cross-linking between suggestions).",
                "items": { "$ref": "#/$defs/SlideSuggestion" },
                "minItems": 1
              }
            },
            "required": ["suggestions"],
            "additionalProperties": false,
            "$defs": {
              "MeasureSpec": {
                "type": "object",
                "additionalProperties": false,
                "required": ["agg"],
                "properties": {
                  "field": { "type": "string", "description": "Numeric field to aggregate (ignored for count)." },
                  "agg": { "type": "string", "enum": ["count", "sum", "avg", "min", "max", "median"] },
                  "filter": { "$ref": "#/$defs/MaybeRefOrString", "description": "Optional filter applied before aggregation." },
                  "format": { "type": "string", "description": "Optional numeric format, e.g., '0.0%', '0,0'." }
                }
              },"CategoryItem": {
                "type": "object",
                "description": "A single explicit category definition.",
                "properties": {
                  "title": {
                    "type": "string",
                    "description": "Human-friendly name shown on slides, 1–4 words."
                  },
                  "description": {
                    "type": "string",
                    "description": "Up to ~20 words describing what belongs in this category."
                  },
                  "examples": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Optional 1–5 short example phrases to anchor the category."
                  }
                },
                "required": ["title"],
                "additionalProperties": false
              },

              "CategorizationSpec": {
                "description": "How to obtain/use a categorization for this section.",
                "oneOf": [
                  {
                    "type": "object",
                    "description": "Reference an already-defined categorization by hex id.",
                    "properties": { 
                      "categorization_id": { "type": "string", "description": "24 hex id of existing categorization" },
                      "title": { "type": "string", "description": "title of the existing categorization" } 
                    },
                    "required": ["categorization_id", "title"],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "description": "Reference an already-defined categorization in defs.",
                    "properties": { "$ref": { "type": "string", "description": "e.g. 'categorizations.intent'" } },
                    "required": ["$ref"],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "description": "Define a prompt to be materialized at slide creation time.",
                    "properties": {
                      "mode": { "type": "string", "const": "inline_prompt", "description": "Create at slide creation time." },
                      "parameter": { "type": "string", "description": "Source field to categorize (e.g., 'Overview')." },
                      "prompt": { "type": "string", "description": "LLM prompt describing buckets to generate." },
                      "target_count": { "type": "integer", "minimum": 2, "maximum": 20, "description": "Desired number of buckets." }
                    },
                    "required": ["mode", "parameter", "prompt"],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "description": "Use a field of the data without any processing - MUST align with the data schema.",
                    "properties": {
                      "parameter": { "type": "string", "description": "Source field (e.g., 'overview')." }
                    },
                    "required": ["parameter"],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "description": "Requires a separate preprocessing task before slide can render.",
                    "properties": {
                      "mode": { "type": "string", "const": "needs_task", "description": "Run a separate task first." },
                      "task": { "type": "string", "enum": ["categorize_data"], "description": "Task name." },
                      "parameter": { "type": "string", "description": "Source field to categorize." },
                      "task_args": {
                        "type": "object",
                        "description": "Inputs for the task (e.g., label list, model hints).",
                        "additionalProperties": true
                      },
                      "produces_ref": {
                        "type": "string",
                        "description": "Where the resulting definition will be placed, e.g. 'categorizations.intent'."
                      }
                    },
                    "required": ["mode", "task", "parameter", "produces_ref"],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "description": "Reuse a categorization from an earlier section in the SAME slide.",
                    "properties": {
                      "same_as": {
                        "type": "object",
                        "properties": {
                          "section_id": {
                            "type": "integer",
                            "description": "Prior section id in the same slide (must be < current section)."
                          },
                          "field": {
                            "type": "string",
                            "enum": ["categorization"],
                            "description": "Field name to reuse."
                          }
                        },
                        "required": ["section_id", "field"],
                        "additionalProperties": false
                      }
                    },
                    "required": ["same_as"],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "description": "Inline explicit categories (fully specified; no task needed).",
                    "properties": {
                      "mode": { "type": "string", "const": "inline_explicit", "description": "Use these categories as-is." },
                      "parameter": { "type": "string", "description": "Source field to categorize." },
                      "items": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 20,
                        "items": { "$ref": "#/$defs/CategoryItem" },
                        "description": "Complete list of explicit categories."
                      }
                    },
                    "required": ["mode", "parameter", "items"],
                    "additionalProperties": false
                  }
                ]
              },
              "DefsRef": {
                "type": "object",
                "description": "Reference to a reusable definition declared in the slide-level 'defs' block.",
                "required": ["$ref"],
                "properties": {
                  "$ref": {
                    "type": "string",
                    "description": "A reference path into the slide-level defs. Format: '<group>.<key>'. Valid groups: filters, categorizations, summaries, visuals.",
                    "pattern": "^(filters|categorizations|summaries|visuals)\\.[A-Za-z0-9_-]+$"
                  }
                },
                "additionalProperties": false
              },
              "SameAsRef": {
                "type": "object",
                "description": "Explicit pointer to reuse a field value defined on another section within the same slide.",
                "required": ["same_as"],
                "properties": {
                  "same_as": {
                    "type": "object",
                    "required": ["section_id", "field"],
                    "properties": {
                      "section_id": {
                        "type": "integer",
                        "description": "The numeric id of the section to copy from."
                      },
                      "field": {
                        "type": "string",
                        "description": "The field name to copy from that section.",
                        "enum": ["pre_filter", "categorization", "summarization", "visualization", "post_filter"]
                      }
                    },
                    "additionalProperties": false
                  }
                },
                "additionalProperties": false
              },
              "MaybeRefOrString": {
                "description": "A field that may be an inline string, a defs $ref, or a same_as pointer.",
                "oneOf": [
                  { "type": "string" },
                  { "$ref": "#/$defs/DefsRef" },
                  { "$ref": "#/$defs/SameAsRef" }
                ]
              },
              "SlideSuggestion": {
                "type": "object",
                "description": "A single slide suggestion describing layout and one or more sections.",
                "properties": {
                  "id": {
                    "type": "integer",
                    "description": "A slide-suggestion identifier (start at 1 and increment per response)."
                  },
                  "description": {
                    "type": "string",
                    "description": "A concise, human-friendly title for the slide."
                  },
                  "layout": {
                    "type": "string",
                    "description": "The selected slide layout.",
                    "enum": ["full_page", "left_summary"]
                  },
                  "defs": {
                    "type": "object",
                    "description": "Reusable building blocks to avoid duplication across sections.",
                    "properties": {
                      "filters": {
                        "type": "object",
                        "description": "Named filter definitions.",
                        "additionalProperties": {
                          "type": "string",
                          "description": "Filter description to apply BEFORE or AFTER a transformation (as appropriate). Must align with the data schema."
                        }
                      },
                      "categorizations": {
                        "type": "object",
                        "description": "Slide-level named categorizations you can $ref.",
                        "additionalProperties": {
                          "type": "string",
                          "description": "Materialized categorization prompt/description (human-readable); rendering engine stores/links the actual category set id."
                        }
                      },
                      "summaries": {
                        "type": "object",
                        "description": "Named summarization prompts/specs.",
                        "additionalProperties": {
                          "type": "string",
                          "description": "Detailed guidance for text summaries to achieve the user goal. Do NOT include instructions to perform maths (including counting)."
                        }
                      },
                      "visuals": {
                        "type": "object",
                        "description": "Named visualization specs.",
                        "additionalProperties": {
                          "type": "string",
                          "description": "Detailed description of how to visualize the data (chart type, mappings, small-multiples, sorting, etc.)."
                        }
                      }
                    },
                    "additionalProperties": false
                  },
                  "sections": {
                    "type": "array",
                    "description": "Ordered content blocks that together make up the slide.",
                    "items": {
                      "description": "Content block definition.",
                      "oneOf": [{
                        "type": "object",
                        "required": ["sourceId", "type", "overview"],
                        "additionalProperties": false,
                        "properties": {
                          "id": {
                            "type": "integer",
                            "description": "Section identifier unique within the slide. If omitted by the model, the client may assign sequential ids."
                          },
                          "sourceId": {
                            "type": "string",
                            "description": "The id of the source data object that this section reads from."
                          },
                          "type": {
                            "type": "string",
                            "description": "Type of content in this section.",
                            "const": "summary"
                          },
                          "pre_filter": {
                            "$ref": "#/$defs/MaybeRefOrString",
                            "description": "Optional filter to apply BEFORE categorization. Must align with the data schema (e.g., include only posts with non-empty Overview)."
                          },
                          "categorization": {
                            "$ref": "#/$defs/CategorizationSpec",
                            "description": "Optional description of how to categorize/group the data for this section. Must align with the data schema."
                          },
                          "summarization": {
                            "$ref": "#/$defs/MaybeRefOrString",
                            "description": "Detailed description of how to summarize the data to achieve the user goal (respecting schema, pre_filter, and categorization). Note that if a categorization is in place then a separate summary will be generated for each category. Only include if type = 'summary'. MUST NOT contain instructions to perform maths (including counting)."
                          },
                          "overview": {
                            "type": "string",
                            "description": "A 15 - 40 word human readable overview of the summarization in this section, including the type of content (ie sumamry, table, pie chart, timeline, bar chart etc)"
                          }
                        }
                      },{
                        "type": "object",
                        "required": ["sourceId", "type", "overview", "chart"],
                        "additionalProperties": false,
                        "properties": {
                          "id": { "type": "integer", "description": "Section identifier unique within the slide. If omitted by the model, the client may assign sequential ids." },
                          "sourceId": { "type": "string", "description": "The id of the source data object that this section reads from." },
                          "type": { "type": "string", "const": "visualization", "description": "Type of content in this section." },

                          "pre_filter": { "$ref": "#/$defs/MaybeRefOrString", "description": "Optional filter to apply BEFORE categorization/visualization." },

                          "axis_1": {
                            "type": "object",
                            "additionalProperties": false,
                            "properties": {
                              "definition": { "$ref": "#/$defs/CategorizationSpec", "description": "Definition of first axis (if required)" },
                              "filter": { "$ref": "#/$defs/MaybeRefOrString", "description": "Optional filter to apply to the x axis" }
                            }
                          },
                          "axis_2": {
                            "type": "object",
                            "additionalProperties": false,
                            "properties": {
                              "definition": { "$ref": "#/$defs/CategorizationSpec", "description": "Definition of second axis (if required)" },
                              "filter": { "$ref": "#/$defs/MaybeRefOrString", "description": "Optional filter to apply to the y axis" }
                            }
                          },

                          "series_1": { "$ref": "#/$defs/CategorizationSpec", "description": "Optional description of how to categorize/group series 1 of this visualization" },
                          "split_by": { "$ref": "#/$defs/CategorizationSpec", "description": "Optional third categorization used to subdivide results (e.g., platform)." },

                          "visualization": { "$ref": "#/$defs/MaybeRefOrString", "description": "Narrative/layout hints for the viz." },

                          "palette": { "type": "string", "enum": ["blue", "green", "heat", "purple"], "description": "Color palette to use for this visualization." },

                          "overview": { "type": "string", "description": "A 15–40 word human readable overview of the visualization." },

                          "chart": {
                            "type": "object",
                            "additionalProperties": false,
                            "required": ["kind"],
                            "properties": {
                              "kind": { "type": "string", "enum": ["heatmap", "bubble", "pie", "bar"] },

                              "value": { "$ref": "#/$defs/MeasureSpec", "description": "Primary quantitative measure (color/height/size)." },

                              "orientation": { "type": "string", "enum": ["vertical", "horizontal"], "description": "Bars only." },
                              "stack": { "type": "boolean", "default": false, "description": "Bars only: stack categories." },
                              "normalize": { "type": "boolean", "default": false, "description": "Bars only: 100% stacked normalization." },

                              "size": { "$ref": "#/$defs/MeasureSpec", "description": "Bubble size measure (bubble only)." },
                              "color_by": { "$ref": "#/$defs/CategorizationSpec", "description": "Optional color grouping/legend." },

                              "donut": { "type": "boolean", "default": false, "description": "Pie only: render as donut." },
                              "labels": { "type": "boolean", "default": true, "description": "Show labels on marks." },

                              "sort_by": { "type": "string", "enum": ["value_asc", "value_desc", "alpha_asc", "alpha_desc", "none"], "default": "value_desc" },
                              "top_n": { "type": "integer", "minimum": 1, "description": "Limit to top N categories (others → 'Other')." },

                              "grouping": { "type": "string", "enum": ["grouped", "stacked"], "default": "grouped", "description": "How split_by/series_1 render within a single axes context (non-pie)." },

                              "facet": {
                                "type": "object",
                                "additionalProperties": false,
                                "description": "Render small multiples (e.g., one pie per platform).",
                                "properties": {
                                  "by": { "type": "string", "enum": ["split_by", "series_1", "axis_1", "axis_2"], "description": "Which categorization to facet on." },
                                  "layout": { "type": "string", "enum": ["row", "column", "grid"], "default": "grid" },
                                  "max_cols": { "type": "integer", "minimum": 1 },
                                  "scale": { "type": "string", "enum": ["none", "area", "radius"], "default": "none", "description": "For pies/bubbles: scale facet size by group total." }
                                },
                                "required": ["by"]
                              }
                            }
                          }
                        },

                        "oneOf": [
                          {
                            "title": "Heatmap requirements",
                            "if": { "properties": { "chart": { "properties": { "kind": { "const": "heatmap" } }, "required": ["kind"] } } },
                            "then": {
                              "required": ["axis_1", "axis_2", "chart"],
                              "properties": {
                                "axis_1": { "required": ["definition"] },
                                "axis_2": { "required": ["definition"] },
                                "chart": {
                                  "required": ["value"],
                                  "not": { "anyOf": [ { "required": ["orientation"] }, { "required": ["size"] }, { "required": ["donut"] } ] }
                                }
                              }
                            }
                          },
                          {
                            "title": "Bubble requirements",
                            "if": { "properties": { "chart": { "properties": { "kind": { "const": "bubble" } }, "required": ["kind"] } } },
                            "then": {
                              "required": ["axis_1", "axis_2", "chart"],
                              "properties": {
                                "axis_1": { "required": ["definition"] },
                                "axis_2": { "required": ["definition"] },
                                "chart": {
                                  "required": ["size"],
                                  "not": { "anyOf": [ { "required": ["orientation"] }, { "required": ["stack"] }, { "required": ["normalize"] }, { "required": ["donut"] } ] }
                                }
                              }
                            }
                          },
                          {
                            "title": "Pie requirements",
                            "if": { "properties": { "chart": { "properties": { "kind": { "const": "pie" } }, "required": ["kind"] } } },
                            "then": {
                              "required": ["axis_1", "chart"],
                              "properties": {
                                "axis_1": { "required": ["definition"] },
                                "chart": {
                                  "required": ["value"],
                                  "properties": {
                                    "facet": {
                                      "type": "object",
                                      "properties": {
                                        "by": { "const": "split_by" },
                                        "scale": { "enum": ["none", "area", "radius"], "default": "area" }
                                      },
                                      "required": ["by"]
                                    }
                                  },
                                  "not": { "anyOf": [ { "required": ["orientation"] }, { "required": ["stack"] }, { "required": ["normalize"] }, { "required": ["size"] } ] }
                                }
                              }
                            }
                          },
                          {
                            "title": "Bar requirements",
                            "if": { "properties": { "chart": { "properties": { "kind": { "const": "bar" } }, "required": ["kind"] } } },
                            "then": {
                              "required": ["axis_1", "chart"],
                              "properties": {
                                "axis_1": { "required": ["definition"] },
                                "chart": {
                                  "required": ["value", "orientation"],
                                  "properties": { "grouping": { "enum": ["grouped", "stacked"] } },
                                  "not": { "anyOf": [ { "required": ["size"] }, { "required": ["donut"] } ] }
                                }
                              }
                            }
                          }
                        ]
                      }
                    ]
                    },
                    "minItems": 1
                  }
                },
                "required": ["id", "description", "layout", "sections"],
                "additionalProperties": false
              }
            }
          }
        }




        if( data && categories){
            const categoryDefs = categories.map(d=>categoryDetailsForAgent( d )).filter(d=>d)

            const categoryDataAsString = JSON.stringify(categoryDefs)
            
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
                },/*{
                role: "user",
                content: `here is some sample data:\n${JSON.stringify(data)}`
                },*/
                categorizations.length > 0 && {
                  role: "user",
                  content: `here is a list of existing categorizations of this data:\n${categorizations}`
                },
                {
                role: "user",
                content: `here is goal of the user:\n${params.goal}`
               },{
                role: "user",
                content: `Suggest 3-5 suitable slides using the options available and which are achievable for the data sample, schema and the view options provided.
                        Ensure the options meets the specific goal from the user.  Summaries, categorization and filters must be used on the data to be as specific and precise as possible in meeting the user's goal - do not suggest general ideas. Use the human friendly name of fields rather than the field name in your summary.`
               }
            ].filter(Boolean)
            console.log( messages)
            const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
            const res = await openai.chat.completions.create({
              model: "gpt-5-mini",
              //model: 'gpt-4.1',
              messages,
              response_format: { 
                  type: "json_schema",
                  json_schema: output_schema
              }
            });
        
            const msg = res.choices[0].message;
            recordUsage( {
              workspace: scope.workspaceId, 
              functionName: "agent_module_suggest_analysis", 
              usageId: "agent_module_suggest_analysis", 
              api: "open_ai", 
              data: res
            })
            try{
              const suggestions = JSON.parse(msg?.content)?.suggestions

              const normalized = (suggestions || []).map((s, i) => ({
                  id: (typeof s.id === 'number' ? s.id : i + 1),
                  ...s
              }));

              // Create or refresh a 'slides' subflow session and seed it with the outline
              let slideSession = null;

              if (scope.workSession && scope.workSession.flow === 'slides') {
                /*slideSession = scope.workSession;
                slideSession.payload = { suggestions: normalized };
                slideSession.state = 'list';                // show the user the list to pick from
                slideSession.data.selection = null;         // nothing selected yet
                scope.touchWorkSession?.();*/
                throw "Why is this reachable?"
              } else if (typeof scope.beginWorkSession === 'function') {
                slideSession = scope.beginWorkSession('slides', { suggestions: normalized });
                slideSession.state = 'list';
                slideSession.data ||= {} 
                slideSession.data.selection = null;

                touchSlideState(scope)
              }

              return {
                //forClient: ["suggestions"],
                suggestions
              }
            }catch(e){
              logger.error(`Error in suggest_analysis`, e)
              return {error: "problem"}
            }
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