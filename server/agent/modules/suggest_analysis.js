import OpenAI from "openai"
import { getLogger } from "../../logger";
import { categoryDetailsForAgent, resolveId } from "../utils";
import { recordUsage } from "../../usage_tracker";
import { VIEW_OPTIONS } from "./suggest_visualizations";

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

export async function implementation(params, scope, notify){
        const {data, categories} = await scope.functionMap["sample_data"]({limit: 20, ...params, forSample: true, withCategory: true}, scope)

        const output_schema = {
          "name": "analysis_suggestions",
          schema: {
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
              "CategoryItem": {
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
                      "type": "object",
                      "required": ["sourceId", "type"],
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
                          "enum": ["summary", "visualization"]
                        },
                        "pre_filter": {
                          "$ref": "#/$defs/MaybeRefOrString",
                          "description": "Optional filter to apply BEFORE categorization/visualization. Must align with the data schema (e.g., include only posts with non-empty Overview)."
                        },
                        "categorization": {
                          "$ref": "#/$defs/CategorizationSpec",
                          "description": "Optional description of how to categorize/group the data for this section. Must align with the data schema."
                        },
                        "summarization": {
                          "$ref": "#/$defs/MaybeRefOrString",
                          "description": "Detailed description of how to summarize the data to achieve the user goal (respecting schema, pre_filter, and categorization). Note that if a categorization is in place then a separate summary will be generated for each category. Only include if type = 'summary'. MUST NOT contain instructions to perform maths (including counting)."
                        },
                        "visualization": {
                          "$ref": "#/$defs/MaybeRefOrString",
                          "description": "Detailed description of how to visualize the data to achieve the user goal (respecting schema, pre_filter, and categorization). Only include if type = 'visualization'."
                        },
                        "post_filter": {
                          "$ref": "#/$defs/MaybeRefOrString",
                          "description": "Optional filter to apply AFTER categorization/visualization (e.g., remove 'Other' if <5% of total). Must align with the data schema."
                        }
                      }
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
                },{
                role: "user",
                content: `here is some sample data:\n${JSON.stringify(data)}`
                },{
                role: "user",
                content: `here is goal of the user:\n${params.goal}`
               },{
                role: "user",
                content: `Suggest 3-5 suitable slides using the options available and which are achievable for the data sample, schema and the view options provided.
                        Ensure the options meets the specific goal from the user.  Summaries, categorization and filters must be used on the data to be as specific and precise as possible in meeting the user's goal - do not suggest general ideas. Use the human friendly name of fields rather than the field name in your summary.`
                        /*Provide your answer in a json object as follows:
                        {
                          suggestions:[{
                            id: number to identify the suggestions - start at 1 and increment,
                            "description": A title for the slide,
                            "layout: "The naem of the selected layout",
                            "sections":[
                              {
                                "sourceId": the id of the source data,
                                "type": the type of content in this sections - one of "summary" or "visualization",
                                "pre_filter": an optional description of the filter to apply before categorization / visualization ensuring alignment with the data schema,
                                "categorization": an optional description of how to categorize the data (for visualization or summarization) ensuring alignment with the data schema,
                                "summarization": a detailed description of how to summarize the data to achieve the goal of the user (taking into account the schema, and pre-filter and any categorzation) - only inlucde if type is "summary. You must NOT include instructions to perform maths (including counting) in here",
                                "visualization": a detailed description of how to visualize the data to achieve the goal of the user (taking into account the schema, and pre-filter and any categorzation) - only inlucde if type is "visualization",
                                "post_filter": an optional description of the filter to apply post categorization / visualization ensuring alignment with the data schema (ie allows segments to be removed from the final result),
                                },
                            ],
                            ....remaining sections of the layout
                          },
                          ....remaining suggestions
                        ],
                      }
                        
                      Note that each suggestions must contain all relevant information - do not reference other suggestions`.replaceAll(/\s+/g," ")*/
               }
   
            ]
            console.log( messages)
            const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
            const res = await openai.chat.completions.create({
              model: "o4-mini",
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
                // already in slides mode → refresh payload and state
                slideSession = scope.workSession;
                slideSession.payload = { outline: normalized };
                slideSession.state = 'list';                // show the user the list to pick from
                slideSession.data.selection = null;         // nothing selected yet
                scope.touchWorkSession?.();
              } else if (typeof scope.beginWorkSession === 'function') {
                slideSession = scope.beginWorkSession('slides', { outline: normalized });
                slideSession.state = 'list';
                slideSession.data.selection = null;
                scope.touchWorkSession?.();
              }

              console.log(suggestions)
              return {
                forClient: ["suggestions"],
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