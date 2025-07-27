import { modiftyEntries } from "../../actions/SharedTransforms";
import { getLogger } from "../../logger";
import { summarizeMultiple } from "../../openai_helper";
import { reviseUserRequest } from "../../prompt_helper";
import { extractFlatNodes, getFragmentsForQuery } from "../../task_processor";
import { resolveId, streamingResponseHandler } from "../utils";

const logger = getLogger('agent_module_one_shot_query', "debug", 0); // Debug level for moduleA

export async function implementation(params, scope, notify){
        try{

            notify("Planning...")
            const revised = await reviseUserRequest(params.query + "\nUse markdown to format the result into an easily to read output.", {expansive: true, id_limit: 20, engine: "o4-mini"})

            let sourceIds
            if( params.sourceIds?.length > 0){
                let sources = await resolveId(params.sourceIds, {...scope, projection: "_id primitives type"})
                sourceIds = sources.map(d=>d.id)
                notify(`[[chat_scope:${sourceIds.join(",")}]]`, false, true)
            }

            const fragmentList = await getFragmentsForQuery( scope.primitive, params.query, 
                                    {sourceIds, types: ["result", "summary"]},
                                {
                                    lookupCount: 10,
                                    searchTerms: 100,
                                    scanRatio: 0.12
                                })

            if( fragmentList.length === 0 ){
                return {result: "No relevant data found"}
            }
            notify(`Retrieved ${fragmentList.length} entries for analysis`)
            const fragmentText = fragmentList.map(d=>d.text)
            
            const pass = streamingResponseHandler( notify, fragmentList )
            notify("Analyzing...")

            const results = await summarizeMultiple( fragmentText,{
                workspaceId: scope.workspaceId,
                usageId: scope.primitive.id,
                functionName: "agent-query-query",
                prompt: revised.task,
                output: revised.output,
                types: "fragments",
                markPass: true,
                batch: fragmentText.length > 1000 ? 100 : undefined,
                temperature: 0.4,
                markdown: true, 
                wholeResponse: true,
                engine: "o3-mini",
                stream: (delta, endStream)=>{
                    try{
                        if( endStream ){
                            pass.end()
                            return
                        }
                        if (delta) pass.write(delta);
                    }catch(e){
                        logger.error(`Got error`,  {chatId: scope.chatUUID})
                        logger.error(e)
                    }
                },
                debug: true, 
                debug_content:true
            })


            if( !results.success){
                return {error: "Error connecting with agent"}
            }


            let out = ""
            let nodeResult = results?.summary?.structure
            modiftyEntries( nodeResult, "ids", entry=>{
                let ids = typeof(entry.ids) === "string" ? entry.ids.replaceAll("[","").replaceAll("]","").split(",").map(d=>parseInt(d)).filter(d=>isNaN(d)) : entry.ids
                if( ids ){
                    let sourceIds = ids.map(d=>{
                        if( fragmentList[d] ){
                            return fragmentList[d].id
                        }else{
                            console.warn(`Cant find referenced fragment ${d} in `, ids, entry.ids, entry)
                        }
                    }).filter((d,i,a)=>a.indexOf(d) === i)
                    return sourceIds
                }
                return []
            } )
            if( nodeResult ){
                const idsForSections = extractFlatNodes(nodeResult).map(d=>d.ids)
                const allIds = idsForSections.flat().filter((d,i,a)=>d && a.indexOf(d) === i)
                if( allIds.length > 0){
                    notify(` [[ref:${allIds.join(",")}]]`, false)
                }
            }
            
            return {
                __ALREADY_SENT: true, 
                forClient:["context"], 
                context: {
                    canCreate: true,
                    type: "one_shot_query",
                    queryResult: nodeResult,
                    query: params.query,
                    revised,
                    sourceIds
                }}
        }catch(e){
            logger.error(`error in agent query`,  {chatId: scope.chatUUID})
            logger.error(e)
            return {result: "Query failed"}
        }
}
export const definition = {
        "name": "one_shot_query",
        "description": "Performs an advanced retrieval-augmented generation query over specified sources and object types. Only to be used for answering queries the user has - must NOT be used for visualization design",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "The user's search query, modified to include relevant context from the chat history to be sufficiently specific and detailed to solicit a qulaity response."
            },
            "sourceIds": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Optional list of source IDs to restrict the query. Ensure you use the correct id(s) from the chat history"
            },
            "objectTypes": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": ["review","post","article","organization","web"]
              },
              "description": "Optional list of object types to include in the retrieval step, aligned to the query."
            }
          },
          "required": ["query"]
        }
      }