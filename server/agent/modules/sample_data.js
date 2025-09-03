import { pickAtRandom } from "../../actions/SharedTransforms";
import { getLogger } from "../../logger";
import Category from "../../model/Category";
import { decodePath, executeConcurrently, getDataForImport } from "../../SharedFunctions";
import { getCategoryParameterNameForAgent, resolveId } from "../utils";

const logger = getLogger('agent_module_sample_data', "debug", 0); // Debug level for moduleA

export async function implementation(params, scope, notify){
    const primitive = (await resolveId(params.id, scope))[0]
    if( primitive ){
        logger.info(`Doing lookup`, {chatId: scope.chatUUID})
        let limit = params.limit ?? 20
        let items = await getDataForImport( primitive, undefined, {sample: limit} )
        if( items.length > 0){
            const total = items.length

            //const resolved = pickAtRandom(items, limit)
            const resolved = items
            const resultCategories = (await Category.find({id: {$in: resolved.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d) === i)}})).reduce((a,c)=>{a[c.id] = c; return a},{})

            const extracted = []
            const forContext = []
            for(const d of resolved){
                if( resultCategories[d.referenceId] ){
                    const paramsForAgent = getCategoryParameterNameForAgent( resultCategories[d.referenceId], {forSample: true})
                    if( paramsForAgent.length > 0){
                        const thisExtract = paramsForAgent.reduce((a,c)=>{
                            a[c] = decodePath( d.referenceParameters, c)
                            return a
                        },{
                            title: d.title,
                            plainId: d.plainId
                        })
                        extracted.push( thisExtract)
                        continue
                    }
                }
                forContext.push( d )
            }
            if( forContext.length > 0){
                const contexts = await executeConcurrently( forContext, buildContext)
                if( contexts.results){
                    extracted.push( ...contexts.results )
                }
            }
            logger.info(`Extracted = ${extracted.length}, forContext = ${forContext.length}`, {chatId: scope.chatUUID})
            if( params.withCategory ){
                return {
                    data: extracted,
                    categories: Object.values(resultCategories)
                }
            }
            return extracted
        }
    }
    return "no data"
}
export const definition = {
    "name": "sample_data",
    "description": "Fetch a sample of records from an existing view, query, filter, or search object so the agent and user can inspect what the data looks like.",
    "parameters": {
        "type": "object",
        "required": ["id"],
        "properties": {
        "id": {
            "type": "string",
            "description": "The unique identifier of the view/query/filter/search object to sample data from."
        },
        "limit": {
            "type": "integer",
            "minimum": 1,
            "default": 20,
            "description": "The maximum number of records to return (defaults to 20)."
        }
        },
        "additionalProperties": false
    }
}