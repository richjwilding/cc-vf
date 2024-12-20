import { registerAction } from "../action_helper"
import QueueAI from "../ai_queue";
import QueueDocument from "../document_queue";
import { getLogger } from "../logger";
import Category from "../model/Category";
import QueryQueue from "../query_queue";
import { addRelationship, createPrimitive, doPrimitiveAction, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, getDataForImport, primitiveParentsOfType } from "../SharedFunctions"
import { aggregateItems, compareItems, iterateItems, queryByAxis, resourceLookupQuery } from "../task_processor";
const logger = getLogger('actionrunner'); // Debug level for moduleA

registerAction( "run_runner", undefined, async (primitive, action, options, req)=>{
    let list = await getDataForImport( primitive, undefined, true ) 
    logger.info(`Action runner ${primitive.id} / ${primitive.plainId} got ${list.length} items for ${options.action} / ${options.flowStarted} / ${options.newIteration}`)
    
    if( !options.newIteration ){
        list = list.filter(d=>d.processing?.flow?.start !== options.flowStarted)
        logger.info(`Filtered to ${list.length} for flow continuation`)
    }

    for(const d of list ){
        logger.info(` - Will run ${options.action} for ${d.id} / ${d.plainId}`)
        try{
            await doPrimitiveAction(d, options.action, options.actionOptions)
        }catch(e){
            logger.error(`Error in run_runner action`)
            logger.error(e)
            throw e
        }
    }
})
registerAction( "run_search", undefined, async (primitive, action, options, req)=>{
    let list = await getDataForImport( primitive, undefined, true ) 
    logger.info(`Search runner ${primitive.id} / ${primitive.plainId} got ${list.length} items`)

    const candidateChildSearches = Object.values(primitive?.primitives?.config ?? {})
    const childSearches = await fetchPrimitives( candidateChildSearches, {type: "search"} )

    logger.info(`Got ${childSearches.length} existing searches`)
    if( list.length > 0){

        
        const itemCategoryIds = list.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i)
        const itemCategoryId = itemCategoryIds[0]
        if( itemCategoryIds.length > 1){
            logger.error(`Target list for search has multiple categories - using first ${itemCategoryId}`)
            list = list.filter(d=>d.referenceId === itemCategoryId)
        }
        const itemCategory = await Category.findOne({id: itemCategoryId})
        const searchSet = itemCategory.resultCategories.find((d)=>d.searchCategoryIds?.includes(primitive.referenceId))
        console.log(`Found ${searchSet?.id} for ${primitive.referenceId} in ${itemCategory.title}`)
        if( searchSet ){
            for(const d of list ){
                try{
                    logger.info(` - Checking search node for ${d.id} / ${d.plainId}`)
                    
                    const currentSearches = childSearches.filter(d2=>Object.keys(d2.parentPrimitives ?? {}).includes(d.id))
                    let childSearch = currentSearches[0]
                    if( currentSearches.length > 1){
                        logger.error(`Found mutiple searches ${childSearches.length} for run_seach ${primitive.id} <> ${d.id}`)
                    }
                    if( childSearch ){
                        logger.info(` --- Found child search ${childSearch.id} / ${childSearch.plainId} for ${d.id} / ${d.plainId}`)
                    }else{
                        logger.info(` --- No child search found for ${d.id} / ${d.plainId}`)
                        childSearch = await createPrimitive({
                            workspaceId: primitive.workspaceId,
                            paths: ["origin", "config"],
                            parent: primitive.id,
                            data:{
                                type: "search",
                                referenceId: primitive.referenceId
                            }
                        })
                        if( childSearch ){
                            await addRelationship(d.id, childSearch.id, `link`)
                            await addRelationship(d.id, childSearch.id, `primitives.search.${searchSet.id}`)

                            logger.info(` --- Created child search ${childSearch.id} / ${childSearch.plainId} found for ${d.id} / ${d.plainId}`)
                            //const res = await doPrimitiveAction(childSearch, "do_search" )
                            await QueryQueue().doQuery(childSearch)
                            console.log(`do_search dispatched for ${childSearch.id}`)
                        }
                    }
                    
                }catch(e){
                    logger.error(`Error in run_search action`)
                    logger.error(e)
                    throw e
                }
            }
        }
    }
})

registerAction( "custom_query", undefined, async (primitive, action, options = {}, req)=>{
    const thisCategory = await Category.findOne({id: primitive.referenceId})
    //const parentForScope = (await primitiveParentsOfType(primitive, ["working", "view", "segment", "query"]))?.[0] ?? primitive
    let parentForScope 
    
    if( options.flow ){
        const prevStepId = primitive.primitives?.imports?.[0]
        if( !prevStepId ){
            throw `Nothing to import from in custom_query flow ${primitive.id}`
        }
        parentForScope = await fetchPrimitive( prevStepId )
        logger.info(`Parent set to flow input for ${primitive.id} / ${primitive.plainId}`)
        options.force = true

    }else{
        parentForScope = (await findParentPrimitivesOfType(primitive, ["working", "view", "segment", "query"]))?.[0] ?? primitive
    }

    if( thisCategory.type === "aggregator"){
        await aggregateItems( parentForScope, primitive, options )
    }else if( thisCategory.type === "comparator"){
        await compareItems( parentForScope, primitive, options )
    }else if( thisCategory.type === "iterator"){
        await iterateItems( parentForScope, primitive, options )
    }else  if( thisCategory.type === "lookup"){
        await resourceLookupQuery( parentForScope, primitive, options )
    }else if( primitive.referenceParameters.useAxis && !options?.scope){
        await queryByAxis( parentForScope, primitive, options )                
    }else{
        await QueueDocument().doDataQuery( primitive, {...action, ...options})
    }
})
registerAction( "run_categorizer", undefined, async (primitive, action, options, req)=>{
    console.log(`******\nIN RUN CATEGORIZER\n******`, options)
    if( options.flow ){
        const targetId = primitive.primitives?.imports?.[0]
        await QueueAI().categorize( primitive, {id: targetId}, {textOnly: true })
    }

})