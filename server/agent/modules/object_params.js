import { getLogger } from "../../logger";
import Category from "../../model/Category";
import { getConfig } from "../../SharedFunctions";
import { categoryDetailsForAgent, resolveId } from "../utils";

const logger = getLogger('agent_module_object_params', "debug", 0); // Debug level for moduleA

export async function implementation(params, scope, notify){
    const primitive = (await resolveId(params.id, scope))[0]
    if( primitive ){
        let targetReferenceIds = []
        const config = await getConfig(primitive)
        if( primitive.type === "search"){
            const category = await Category.findOne( {id: primitive.referenceId })
            const sources = config.sources.map(s=>category?.parameters.sources.options.find(d2=>d2.id === s))
            targetReferenceIds.push(...sources.flatMap(d=>d?.resultCategoryId).filter(d=>d))
        }
        const referenceIds = []
        if( targetReferenceIds.length > 0){
            let output = []
            const resultCategories = await Category.find( {id: {$in: targetReferenceIds}} )
            for(const d of resultCategories){
                const description = categoryDetailsForAgent( d )
                if( description ){
                    output.push( description )
                }
                if( scope.withId ){
                    referenceIds.push( d.id )
                }
            }
            if( scope.withId ){
                return {fields: output, referenceIds}
            }
            return output

        }
    }
    return "couldnt find"
}
export const definition = {
        "name": "object_params",
        "description": "Retrieve the list of output fields (name and type) exposed by the specified object’s view of its underlying data. Always returns the same result for a give id so only call once.",
        "parameters": {
          "type": "object",
          "required": ["id"],
          "properties": {
            "id": {
              "type": "string",
              "description": "The unique identifier of the view/query/filter/search object whose output-field schema should be returned."
            }
          },
          "additionalProperties": false
        }
}