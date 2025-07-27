import { fetchPrimitives, getDataForImport, multiPrimitiveAtOrginLevel, uniquePrimitives } from "../../SharedFunctions"
import { resolveId } from "../utils"
import { getLogger } from "../../logger";

const logger = getLogger('agent_module_existing_categorization', "debug", 2); // Debug level for moduleA

export async function implementation(params, scope, notify){
    if( !params.id ){
        return {result: "Need an Id"}
    }
    const sources = await resolveId( params.id, scope )
    logger.info(`--> Will get data from ${sources.map(d=>d.id).join(", ")}`, {chatId: scope.chatUUID})

    notify(`Fetching data...`,true)
    let items = []
    for(const d of sources){
        items.push(...(await getDataForImport( d )))
    }
    notify(`Looking for categorization...`,true)

    const categories = uniquePrimitives((await multiPrimitiveAtOrginLevel(items, 2, ["ref","origin"])).flat())
    const subCategories = (await fetchPrimitives( undefined, {
        workspaceId: scope.workspaceId,
        type: "category",
        $or: categories.map(d=>{
            return {[`parentPrimitives.${d.id}`]: "primitives.origin"}
        })
    })).reduce((a,c)=>{a[c.id] = c; return a},{})
    let out = [],idx = 1
    for(const d of categories){
        const sub = (d.primitives?.origin ?? []).map(d=>subCategories[d]).filter(d=>d)
        if( sub.length > 0 ){
            out.push(`${idx}) [[id:${d.id}]] ${d.title}`)
            sub.forEach(d=>{
                out.push(d.referenceParameters?.description ? `- ${d.title}: ${d.referenceParameters.description}` : `- ${d.title}`)
            })
            idx++
        }
    }        


    return {
        categories: out.join("\n"),
        forClient: ["categories"]
    }
    
}
export const definition = {
    "name": "existing_categorizations",
    "description": "Return any previously defined categorizations for a given data object (view/query/filter). Useful when suggesting a vizualization or building a view",
    "parameters": {
        "type": "object",
        "required": ["id"],
        "properties": {
        "id": {
            "type": "string",
            "description": "The ID of the view, query, filter, or search object."
        }
        },
        "additionalProperties": false
    }
}