import { getLogger } from "../../logger";
import { summarizeMultiple } from "../../openai_helper";
import { reviseUserRequest } from "../../prompt_helper";
import { extractFlatNodes } from "../../task_processor";
import { flattenStructuredResponse } from "../../PrimitiveConfig.js";
import { getDataForAgentAction, streamingResponseHandler } from "../utils";

const logger = getLogger('agent_module_one_shot_summary', "debug", 2); // Debug level for moduleA

export async function implementation(params, scope, notify = ()=>{}){
   try{
   
        notify("Planning...")
        const revised = await reviseUserRequest(params.query + "\nUse markdown to format the result into an easily to read output.", {expansive: true, id_limit: 20, engine: "o4-mini"})
    
        notify("Fetching data...")
        let items, toSummarize, resolvedSourceIds
        try{
            ;[items, toSummarize, resolvedSourceIds] = await getDataForAgentAction( params, scope)
        }catch(e){
            logger.warn("one_shot_summary aborted", { error: e?.message, chatId: scope.chatUUID })
            return { error: e?.message ?? "Unable to locate connected data sources" }
        }

        notify(`[[chat_scope:${resolvedSourceIds.join(",")}]]`, false, true)

        if( toSummarize.length > 200 && !params.limit && !params.confirmed){
            return {result: `There are ${toSummarize.length} results to process - confirm user is happy to wait and call again with confirmed=true`}
        }

        const toProcess = toSummarize.map(d=>Array.isArray(d) ? d.join(", ") : d)
        const pass = streamingResponseHandler( notify, items )



        notify("Analyzing...")
        const results = await summarizeMultiple( toProcess,{
            workspaceId: scope.workspaceId,
            usageId: scope.primitive.id,
            functionName: "agent-query-summary",
            prompt: revised.task,
            output: revised.output,
            types: "fragments",
            markPass: true,
            batch: toProcess.length > 1000 ? 100 : undefined,
            temperature: 0.4,
            markdown: true, 
            notify,
            wholeResponse: true,
            engine: "o4-mini",
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


        let structured = results?.summary?.structure ?? null
        let plain = results?.summary?.plain ?? null
        if( structured ){
            try {
                plain = flattenStructuredResponse(structured, structured)
            } catch(err) {
                logger.warn("Failed to flatten structured summary", { error: err?.message })
            }
        }else if( !plain ){
            if( typeof results?.summary === "string" ){
                plain = results.summary
            }else if( Array.isArray(results?.summary) ){
                plain = results.summary.map((entry)=>{
                    if( typeof entry === "string" ){
                        return entry
                    }
                    if( entry?.plain ){
                        return entry.plain
                    }
                    if( entry?.summary && typeof entry.summary === "string" ){
                        return entry.summary
                    }
                    return JSON.stringify(entry)
                }).filter(Boolean).join("\n\n")
            }else if( results?.summary?.summary ){
                plain = results.summary.summary
            }
        }

        const out = typeof plain === "string" ? plain.trim() : ""
        let nodeResult = structured
        if( nodeResult ){
            const idsForSections = extractFlatNodes(nodeResult).map(d=>d.ids)
            const allIds = idsForSections.flat().filter((d,i,a)=>d && a.indexOf(d) === i)
            let sourceIds = allIds.map(d=>items[d]?.id).filter((d,i,a)=>d !== undefined && a.indexOf(d) === i)
            if( sourceIds.length > 0){
                notify(`\n[[ref:${sourceIds.join(",")}]]`, false)
            }
        }
        
        return {
            summary: out,
            result: out,
            plain: out,
            structured,
            references: resolvedSourceIds,
            __ALREADY_SENT: true
        }
    }catch(e){
        logger.error(`error in agent query`,  {chatId: scope.chatUUID})
        logger.error(e)
        return {result: "Query failed"}
    }
}
export const definition = {
        "name": "one_shot_summary",
        "description": "Performs a user specified summarization task using all specified source data as the input. Will run in multiple passes and can take several minutes for large datasets. Only to be called when the user specifically indicates they want a summary / summarization. If the source data contains >200 items (call get_data_sources to check) then you MUST prompt the user before calling to confirm they are happy to wait as it may take several minutes. Must NOT be used to categorize data.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "The user's task, modified to include relevant context from the chat history to be sufficiently specific and detailed to solicit a qulaity response."
            },
            "limit": {
              "type": "number",
              "description": "Optional number of random data points to select for the summary (omit if the full set is to be used)"
            },
            "confirmed": {
              "type": "boolean",
              "description": "Optional flag indicating if the user has given confirmation to run on large data sets"
            },
            "sourceIds": {
              "type": "array",
              "items": { "type": "string" },
              "description": "list of one or more source IDs to restrict the summarization task to. Ensure you use the correct id(s) from the chat history"
            },
            "objectTypes": {
              "type": "array",
              "items": {
                "type": "string",
                "enum": ["review","post","article","organization","web"]
              },
              "description": "Optional list of object types to include in the retrieval step, aligned to the summarization."
            }
          },
          "required": ["query"]
        }
      }
