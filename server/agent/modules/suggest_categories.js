import { getLogger } from "../../logger";
import { buildCategories } from "../../openai_helper";
import { getDataForAgentAction } from "../utils";

const logger = getLogger('agent_module_suggest_categories', "debug", 0); // Debug level for moduleA

export async function implementation(params, scope, notify){
    notify("Fetching data...")
    let [items, toSummarize, resolvedSourceIds] = await getDataForAgentAction( params, scope)

    const toProcess = toSummarize.map(d=>Array.isArray(d) ? d.join(", ") : d)
    const literal = false

    if( toSummarize.length > 1000 && !params.limit && !params.confirmed){
        return {result: `There are ${toSummarize.length} results to process - confirm user is happy to wait and call again with confirmed=true`}
    }
    notify(`[[chat_scope:${resolvedSourceIds.join(",")}]]`, false, true)

    notify("Analyzing...")
    const result = await buildCategories( toProcess, {
        count: params.number ,
        types: params.type, 
        themes: params.theme, 
        literal,
        batch: 500,
        engine:  "o3-mini"
    }) 

    logger.debug(` -- Got ${result.categories?.length} suggested categories`,  {chatId: scope.chatUUID})
    if( result.categories?.length > 0){
        return {
            suggestedCategoriesFor: params.sourceIds,
            categorizationField: params.field,
            categories: result.categories.map(d=>({title:d.t, description: d.d})),
            forClient:["suggestedCategoriesFor","categorizationField","categories"]
        }
    }
    return {error: "Couldnt complete analysis"}
}
export const definition = {
        "name": "suggest_categories",
        "description": "Analyzes the indicated source from sourceIds to identify suitable categories aligned with the specified theme. Default to using all data unless the user asks to use a sample instead. This function fetches data - no need to call sample_data first",
        "parameters": {
          "type": "object",
          "properties": {
            "sourceIds": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "minItems": 1,
              "description": "One or more source IDs whose data will be categorized."
            },
            "theme": {
              "type": "string",
              "description": "The type of characterization to perform (e.g. 'the core CTA in the post', 'the underlying problem behind the issue described', 'the key capabilities the company offers')."
            },
            "type": {
              "type": "string",
              "description": "A short description of the items to be categorized (eg 'interviews', 'posts', 'companies'"
            },
            "field": {
              "type": "string",
              "description": "The field from the data object to be used for cataegorization (call object_params to determine best fit)"
            },
            "number": {
              "type": "number",
              "description": "The desired number of categories (between 2 and 20, default to 8)."
            },
            "limit": {
              "type": "number",
              "description": "Optional, indicating the size of the data sample to be used for categorization - omit to use all data. "
            },
            "confirmed": {
              "type": "boolean",
              "description": "Optional flag indicating if the user has given confirmation to run on large data sets"
            },
          },
          "required": ["sourceIds", "theme", "number"]
        }
}