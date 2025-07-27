import OpenAI from "openai"
import { getLogger } from "../../logger";
import * as suggest_visualizations from "./suggest_visualizations.js";

const logger = getLogger('agent_module_design_view', "debug", 0); // Debug level for moduleA

export async function implementation(params, scope, notify){
    const openai = new OpenAI({ apiKey: process.env.OPEN_API_KEY });

    const flowEditor = scope.mode === "flow_editor"
    const validFunctions = flowEditor ? ["object_params","prepare_categorization_preprocessing"] : ["sample_data","object_params","parameter_values_for_data", "suggest_categories", "existing_categorizations"]
    
    const fns =  scope.functions.filter(d=>validFunctions.includes(d.name) )
    if( !params.source_ids?.[0]){
        return "No id provided"
    }
    const fields = await scope.functionMap["object_params"]({id: params.source_ids[0]}, scope, notify)

    /*
        Each filter (if in use) should have the following format
        - title: a title for the filter
        - actingOn: one of "parameter" or "category"
        - parameter: the name of the parameter (if type is parameter)
        - categoryType: one of "existing" (if using a categorization from existing_categories) or "new" if using a declared categorization list from "suggest_categories" or the chat history context
        - categoryId: the id of the category to use (if type is category and categoryType os existing)
        - categoryItems: an array containing the new categories to setup (each having a title and description field) - (if type is category and categoryType is "new")
        - operation: one of "in", "not_in", "top_rank", "bottom_rank"
        - values: an array of values to filter
        }
        */

    const axisDef = flowEditor
        ? {
        "type": "object",
        "description": "Axis specification: choose exactly one of the following shapes.",
        "oneOf": [
            {
            "type": "object",
            "required": ["category_prompt", "parameter"],
            "properties": {
                "category_prompt": {
                "type": "string",
                "description": "The LLM prompt that will generate a suitable categorization of this data when executed later"
                },
                "parameter": {
                "type": "string",
                "description": "Parameter to categorize"
                }
            },
            "additionalProperties": false
            },
            {
            "type": "object",
            "required": ["operator","parameter"],
            "properties": {
                "operator": {
                "type": "string",
                "enum": ["sum","max","min","mean"],
                "description": "Aggregate operator to apply"
                },
                "parameter": {
                "type": "string",
                "description": "Parameter to which the operation is applied"
                }
            },
            "additionalProperties": false
            },
            {
            "type": "object",
            "required": ["parameter"],
            "properties": {
                "parameter": {
                "type": "string",
                "description": "Parameter to use (raw of with custom bracket) - without applying any categorization or operation"
                }
            },
            "additionalProperties": false
            }
        ],
        "additionalProperties": false
        }
        : {
        "type": "object",
        "description": "Axis specification: choose exactly one of the following shapes.",
        "oneOf": [
            {
            "type": "object",
            "required": ["category_id"],
            "properties": {
                "category_id": {
                "type": "string",
                "description": "Id returned from existing_categorization"
                }
            },
            "additionalProperties": false
            },
            {
            "type": "object",
            "required": ["new_category"],
            "properties": {
                "new_category": {
                "type": "object",
                "description": "Define a new categorization",
                "properties": {
                    "title": {
                    "type": "string",
                    "description": "Name of the categorization"
                    },
                    "parameter": {
                    "type": "string",
                    "description": "Parameter to categorize"
                    },
                    "items": {
                    "type": "array",
                    "minItems": 1,
                    "description": "List of categories",
                    "items": {
                        "type": "object",
                        "required": ["title","description"],
                        "properties": {
                        "title": {
                            "type": "string",
                            "description": "Name of this category"
                        },
                        "description": {
                            "type": "string",
                            "description": "Description of this category"
                        }
                        },
                        "additionalProperties": false
                    }
                    }
                },
                "required": ["title","parameter","items"],
                "additionalProperties": false
                }
            },
            "additionalProperties": false
            },
            {
            "type": "object",
            "required": ["operator","parameter"],
            "properties": {
                "operator": {
                "type": "string",
                "enum": ["none", "sum","max","min","mean"],
                "description": "Aggregate operator to apply"
                },
                "parameter": {
                "type": "string",
                "description": "Parameter to which the operation is applied"
                }
            },
            "additionalProperties": false
            },{
            "type": "object",
            "required": ["parameter"],
            "properties": {
                "parameter": {
                "type": "string",
                "description": "Parameter to use (raw of with custom bracket) - without applying any categorization or operation"
                }
            },
            "additionalProperties": false
            }
        ],
        "additionalProperties": false
        }


    const messages = [
        {
            role: "system",
            content: `
    You are a data visualization agent.  The user wants to visualize their data in one or more views as specified in their prompt according to these instructions in the chat context.
    Some parameters may have "custom_bracket" with defined "buckets" which should be used rather than a new categorization of that parameter
    ${flowEditor 
    ? `If the visualization calls for categorization, call prepare_categorization_preprocessing to get a prompt defintion which will create a suitable categorization and execution time
    Inspect the schema of the data using object_params to understand the schema, then use this knowledge in setting axis and filters as appropriate
    `
    : `If the visualization calls for categorization, proceed in this order until you find something suitable:
    1) Use any relevant categorization from the chat context
    2) Call "existing_categorization" to check for existing categorizations that are suitable
    3) Call suggest_categories only if nothing from the previous 2 steps is suitable
    Inspect the data using parameter_values_for_data or sample_data, and object_params to understand the schema, then use this knowledge in setting axis and filters as appropriate`}

    Think very carefully about the most optimal way to create a view the result the user is asking for - here are the details about what is possible
    ${suggest_visualizations.VIEW_OPTIONS}` 
        },
        {
            role: "user",
            content: `Here are the parameters of the objects from the source: ${JSON.stringify(fields)}`
        },
        /*{
            role: "user",
            content: `Here is the recent chat history for context: ${JSON.stringify(scope.history.filter(d=>!d.removePrevious).slice(-15))}`
        },*/
        scope.latestCategories && {
            role: "user",
            content: `Here is the latest discussion with the user about categorization: ${JSON.stringify(scope.latestCategories)}`
        },
        scope.latestView && {
            role: "user",
            content: `Here is the latest discussion with the user about visualization: ${JSON.stringify(scope.latestView)}`
        },
        {
            role: "user",
            content: JSON.stringify(params)
        }
        ].filter(Boolean)


const output_schema = {
    name: "views",
    schema: {
    type: "object",
    properties: {
        views: {
            "type":"array",
            "items": {
            type: "object",
                properties: {
                    source: {
                        "type": "string",
                        "description": "the source id to fetch data from"
                    },
                    title: {
                        "type": "string",
                        "description": "Title for this visualization"
                    },
                    layout: {
                        "type": "string",
                        "enum": ["items", "heatmap", "bubble", "pie", "bar"],
                        "description": "Name of layout to use"
                    },
                    filters: {
                        "type": "array",
                        "items":axisDef,
                        "description": "List of filters to apply"
                    },
                    palette: {
                        "type": "object",
                        "description": "Details of the palette to use",
                        "oneOf": [
                        {
                            "type": "object",
                            "required": ["palette_name"],
                            "properties": {
                            "palette_name": {
                                "type": "string",
                                "enum": ["blue","ice","purple","heat", "scale"],
                                "description": "Name of predefined palette to use"
                            }
                            },
                            "additionalProperties": false
                        },
                        {
                            "type": "object",
                            "required": ["colors"],
                            "properties": {
                            "colors": {
                                "type": "array",
                                "items": {                   
                                "type": "string"
                                },
                                "description": "List of colors in css hex format to use for the palette"
                            },
                            },
                            "additionalProperties": false
                        }
                        ],
                        "additionalProperties": false
                    },
                    x_axis: axisDef,
                    y_axis: axisDef
                }
                }
            }
        }
        }
}
        
        logger.debug(scope.chatUUID, messages)

        let planJson = null;
        while (true) {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            functions: fns,
            function_call: "auto",
            response_format: { 
                type: "json_schema",
                json_schema: output_schema
            }
        });
    
        const msg = res.choices[0].message;
    
        if (msg.function_call) {
            const { name, arguments: jsonArgs } = msg.function_call;
            const args = JSON.parse(jsonArgs);
            logger.debug(`design_view will call ${name}`, {chatId: scope.chatUUID})
    
            const fn = scope.functionMap[name]
            if(!fn){
            throw `couldnt find ${name}`
            }
            const fnResult = await fn(args, scope, notify);
            logger.debug("design_view Got", {fnResult,  chatId: scope.chatUUID})
    
            messages.push({
            role: "assistant",
            function_call: { name: name, arguments: jsonArgs }
            });
    
            messages.push({
            role: "function",
            name,
            content: JSON.stringify(fnResult)
            });
    
            continue;
        }
    
        planJson = msg.content;
        messages.push(msg);
        break;
        }
    
    logger.info("design_view done", {planJson, chatId: scope.chatUUID})
    try{
        const result = JSON.parse(planJson)
        const sourceIds = result.views.map(d=>d.source)
        
        notify(`[[chat_scope:${sourceIds[0]}]]`, false, true)
        
        const views = JSON.stringify({views: result.views})
        console.log(views[0])
        
        return {
            dataForClient: views,
            dataType: "preview",
            result: result

        }
    }catch(e){
        logger.error(e)
    }
    return "failed"
    }
export const definition = {
        "name": "design_view",
        "description": "Setup a specific view / visualization of the source data",
        "parameters": {
          "type": "object",
          "required": ["prompt", "source_ids", "axis"],
          "properties": {
            "prompt": {
              "type": "string",
              "description": "A clear definition of what the user has asked for including objective, any filtering and categorization that is needed, how many views and their layouts. Do not include ordering unless user specified it."
            },
            "source_ids": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Limit the visualization to these specific source objects"
            },
            "style": {
              "type": "object",
              "description": "Optional style preferences for the visualization, including chart type and palette notes.",
              "properties": {
                "type": {
                  "type": "string",
                  "description": "Type of visualization (e.g. 'line_chart', 'bar_chart', 'scatter_plot')."
                },
                "palette": {
                  "type": "string",
                  "description": "Any notes on color palette or styling (e.g. 'use brand colors', 'high-contrast')."
                }
              },
              "required": ["type"],
              "additionalProperties": false
            },
            "axis": {
              "type": "object",
              "description": "Axis specification: for each axis, either reference a parameter, an existing category by ID, or describe a new category.",
              "properties": {
                "x": {
                  "type":"string",
                  "description": "Description of the x axis (if required)"
                },"y": {
                  "type":"string",
                  "description": "Description of the x axis (if required)"
                }
              },
              "additionalProperties": false
            },
            "filters": {
              "type": "array",
              "description": "List of filters to apply.",
              "items": {
                "type": "object",
                "required": ["parameter", "operation", "value"],
                "properties": {
                  "parameter": {
                    "type": "string",
                    "description": "Field or category parameter to filter on."
                  },
                  "operation": {
                    "type": "string",
                    "enum": ["equals", "not_equals", "in", "not_in", "gt", "lt", "gte", "lte", "top_rank", "bottom_rank"],
                    "description": "Comparison operator."
                  },
                  "value": {
                    "oneOf": [
                      { "type": "string" },
                      { "type": "number" },
                      { "type": "boolean" },
                      {
                        "type": "array",
                        "items": {
                          "type": ["string", "number", "boolean"]
                        }
                      }
                    ],
                    "description": "Value or list of values to compare against."
                  }
                },
                "additionalProperties": false
              }
            }
          },
          "additionalProperties": false
        }
      }