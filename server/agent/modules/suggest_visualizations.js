import OpenAI from "openai"
import { getLogger } from "../../logger";
import { categoryDetailsForAgent } from "../utils";
import { recordUsage } from "../../usage_tracker";

export const VIEW_OPTIONS = `*) Views can be built from the raw data of another object, and can also be built from categorized and / or filtered live views of the original data, so be sure to consider pre-processing steps if its valuable to split out or filter the data to build a compelling view
                    *) - Data for views can be categorized as a pre-processing step 
                    *) --- Categories can be built based upon literal string values 
                    *) --- Categories can also be built by having an AI process the field against a prompt to classify, normalize or evaluate the data against a prompt (see categorize_data)
                    *) - Data for views can be filtered across one or more of the fields i have told you about. 
                    *) --- Filtering can be based upon the raw value of the field
                    *) --- If applying a filter you can call parameter_values_for_data to see what values the field has in the data - you MUST always call this for textual filters
                    *) --- Filtering can also be based on a categorized version of the field value
                    *) - Some views can also be aligned by axis using the same fields - see the description of the layouts for details on which
                    *) - The following layouts are supported
                    *) --- Items - rendered child objects in a grid with the columns and rows are based on selected fields of the objects in view. This is the default view which you should use unless the user request aligns with one of the other layouts 
                    *) --- Heatmap - with the columns and rows are based on selected fields of the objects in view. Can be rendered with Green, Blue, Heat, Red, Scale (Red to Green) or Ice palletes
                    *) --- Bubble chart - with the columns and rows are based on selected fields of the objects in view and the size of the bubble indicating the number of objects in the 'cell'. Can be rendered with Green, Blue, Scale (Red to Green) or Ice palletes
                    *) --- Pie chart - where the content of a selected field is used to determine segment names and the size of the segment if number of objects which have the segment name as the value for the relevant field
                    *) --- Bar chart - where the content of a selected field is used to determine the x axis and the y-axis is the count of objects with the selected field having the value of the x-axis lavel 
                    `
const logger = getLogger('agent_module_suggest_visualizations', "debug", 0); // Debug level for moduleA

export async function implementation(params, scope, notify){
  console.log(params)
        const {data, categories} = await scope.functionMap["sample_data"]({limit: 20, ...params, withCategory: true}, scope)
        if( data && categories){
            const categoryDefs = categories.map(d=>categoryDetailsForAgent( d )).filter(d=>d)

            const categoryDataAsString = JSON.stringify(categoryDefs)
            
            const messages = [
               {
                role: "system",
                content: `You are a data visualization agent.  The user wants to visualize their data in one or more views - here is a dscription of what they want ${params.visual_goal}`
               },{
                role: "user",
                content: `Here is the schema of the data:\n${categoryDataAsString}`,
               },{
                role: "user",
                content: `Here is are details of what views can be created:\n${VIEW_OPTIONS.replaceAll(/\s+/g," ")}`
               },{
                role: "user",
                content: `Here is some sample data:\n${JSON.stringify(data)}`
               },{
                role: "user",
                content: `Suggest some suitable visualizations using the options available and which are achievable for the data sample, schema and the view options provided.
                        Ensure the options meets the specific goal from the user.  Summaries, categorization and filters must be used on the data to be as specific and precise as possible in meeting the user's goal - do not suggest general ideas. Use the human friendly name of fields rather than the field name in your summary.
                        Provide your answer in a json object as follows:
                        {
                          suggestions:[{
                            id: number to identify the suggestions - start at 1 and increment,
                            "type": type of visualization (pie, bubble, items, timeline, heatmap etc),
                            "description": A title for the visualization,
                              "categorization": an optional description of how to categorize the data (for visualization or summarization) ensuring alignment with the data schema,
                              "summarization": a detailed description of how to summarize the data to achieve the goal of the user (taking into account the schema, and pre-filter and any categorzation) - only inlucde if type is "summary",
                              "visualization": a detailed description of how to visualize the data to achieve the goal of the user (taking into account the schema, and pre-filter and any categorzation) - only inlucde if type is "visualization",
                              "post_filter": an optional description of the filter to apply post categorization / visualization ensuring alignment with the data schema (ie allows segments to be removed from the final result),
                            "data": {
                                "rows": what to display in the rows - a paramater name, catgeorization type, operation (such as count of posts),
                                "columns": what to display in the columns - a paramater name, catgeorization type, operation (such as count of posts),
                            },
                            "purpose": a description of how this visualization supports the goal of the user
                          },
                          ....remaining suggestions
                        ],
                      }
                        
                      Note that each suggestions must contain all relevant information - do not reference other suggestions`.replaceAll(/\s+/g," ")
               }
   
            ]
            const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });
            const res = await openai.chat.completions.create({
              model: "o4-mini",
              messages,
              response_format: { type: "json_object" }
            });
        
            const msg = res.choices[0].message;
            recordUsage( {
              workspace: scope.workspaceId, 
              functionName: "agent_module_suggest_visualizations", 
              usageId: "agent_module_suggest_visualizations", 
              api: "open_ai", 
              data: res
            })
            try{
              const suggestions = JSON.parse(msg?.content)?.suggestions

              if (Array.isArray(suggestions) && suggestions.length) {
                let state = null;

                if (scope.mode === "viz" && scope.modeState) {
                  state = scope.modeState;
                } else if (typeof scope.activateMode === "function") {
                  state = scope.activateMode("viz");
                }

                if (state) {
                  state.status = "list";
                  state.selection = null;
                  state.spec = null;
                  state.suggestions = suggestions;
                  scope.touchSession?.();
                }
              }

              return {
                forClient: ["suggestions"],
                suggestions
              }
            }catch(e){
              logger.error(`Error in suggest_visualizations`, e)
              return {error: "problem"}
            }
        }
        return {
            data_missing: data === undefined,
            metatdata: categories === undefined,
        }
}
export const definition = {
    "name": "suggest_visualizations",
    "description": "Suggest visualizations suitable for the specified source data - call only when the user is asking for suggestions or if is not clear what visualization they want",
    "parameters": {
        "type": "object",
        "required": ["id"],
        "properties": {
        "id": {
            "type": "string",
            "description": "ID of a data object (view/query/filter/search)."
        },
        "fields": {
            "type": "array",
            "description": "Optional list of fields user is interested in visualizing (categorical or numeric).",
            "items": { "type": "string" }
        },
        "visual_goal": {
            "type": "string",
            "description": "Optional user description of what they're trying to learn or show in the visualization."
        }
        },
        "additionalProperties": false
    }
}
