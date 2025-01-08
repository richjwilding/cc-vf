import { registerAction } from "../action_helper"
import QueueAI from "../ai_queue";
import QueueDocument from "../document_queue";
import { getLogger } from "../logger";
import Category from "../model/Category";
import QueryQueue from "../query_queue";
import { addRelationship, createPrimitive, dispatchControlUpdate, doPrimitiveAction, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, getConfig, getDataForImport, getPrimitiveInputs, primitiveChildren, primitiveDescendents, primitiveParentsOfType, removePrimitiveById } from "../SharedFunctions"
import { aggregateItems, compareItems, iterateItems, lookupEntity, queryByAxis, resourceLookupQuery, runAIPromptOnItems } from "../task_processor";
import { baseURL, cleanURL } from "./SharedTransforms";
const logger = getLogger('actionrunner', 'debug'); // Debug level for moduleA


registerAction("lookup_entity", {type: "action"}, async (primitive, action, options, req)=>{
    const config = await getConfig( primitive )
    const inputs = await getPrimitiveInputs( primitive )
    if( inputs?.items ){
        let lookupList = inputs.items.data ?? []
        const existing = await primitiveDescendents(primitive, "entity", {fields:"referenceParameters", first: true})


        for(const toLookup of lookupList ){
            if( config.entity_type === "Organization"){
                if( config.source_type === "URL"){

                    const cleaned = baseURL( toLookup )

                    if( existing.find(d=>baseURL(d.referenceParameters?.url) === cleaned)){
                        logger.debug(`Skipping ${cleaned} - already here`)
                        continue
                    }
                    let resultCategoryId = 29

                    const newData = {
                        workspaceId: primitive.workspaceId,
                        parent: primitive.id,
                        paths: ['origin'],
                        data:{
                            title: cleaned,
                            referenceParameters:{
                              url: cleaned  
                            },
                            type: "entity",
                            referenceId: resultCategoryId
                        }
                    }
                    const newPrim = await createPrimitive( newData )
                }
            }
        }
    }
})
registerAction("run_prompt", undefined, async (primitive, action, options, req)=>{
    await QueueAI().runPromptOnPrimitive( primitive, options)
})




registerAction( "run_runner", undefined, async (primitive, action, options, req)=>{
    let list = await getDataForImport( primitive, undefined, true ) 
    logger.info(`Action runner ${primitive.id} / ${primitive.plainId} got ${list.length} items for ${options.action} / ${options.flowStarted} / ${options.newIteration}`)
    
    if( !options.newIteration && !options.force){
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

    if( list.length > 0){
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
    }else{
        logger.info(`Running search instance ${primitive.id} / ${primitive.plainId}`)
        await QueryQueue().doQuery( primitive )
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
    }else if( thisCategory.type === "ai_prompt"){
        await QueueAI().runPromptOnPrimitive( primitive, options)
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
    const category = await Category.findOne({id: primitive.referenceId})
    if( options.flow ){
        const targetId = primitive.primitives?.imports?.[0]
        if( category.mode === "assign"){
            let targetCategoryObject = (await primitiveChildren(primitive, "category"))?.[0]
            let inputs = await getPrimitiveInputs( primitive )
            let realignCategoriesToInput = false
            let categoryData 

            if( inputs.categories ){
                if( inputs.categories.config === "primitive"){
                    logger.info(`Category labeller assigned existing category primitive`)
                }else if( inputs.categories.config === "object_list"){
                    realignCategoriesToInput = true
                    categoryData = inputs.categories.data
                }
                if( realignCategoriesToInput && categoryData){
                    let categoiesToAdd = categoryData

                    if( !targetCategoryObject ){
                        logger.info(`Category labeller needs internal category - creating`)
                        
                        targetCategoryObject = await createPrimitive({
                            workspaceId: primitive.workspaceId,
                            paths: ["origin", "config"],
                            parent: primitive.id,
                            data:{
                                title: `Category for ${primitive.plainId}`,
                                type: "category"
                            }
                        })
                    }
                    if(!targetCategoryObject){
                        throw "Error creating new Catgeory for categorizer"
                    }
                    const existingCategories = await primitiveChildren(targetCategoryObject, "category")
                    const toAdd = categoryData.filter(d=>existingCategories.find(d2=>d2.title === d.title) == undefined)
                    const toDelete = existingCategories.filter(d=>categoryData.find(d2=>d2.title === d.title) == undefined)
                    const toUpdate = categoryData.reduce((a,d)=>{
                        const titleMatch = existingCategories.find(d2=>d2.title === d.title && d2.referenceParameters.description !== d.description)
                        if( titleMatch ){
                            a.push({
                                existing: titleMatch,
                                description: d.description
                            })
                        }
                        return a
                    }, [])

                    logger.info(` ${toAdd.length} categories to add, ${toDelete.length} categories to delete, ${toUpdate.length} categories to update` )
                    for(const d of toDelete){
                        await removePrimitiveById(d.id)
                    }
                    for(const d of toAdd){
                        await createPrimitive({
                            workspaceId: primitive.workspaceId,
                            parent: targetCategoryObject.id,
                            data:{
                                title: d.title,
                                referenceId: targetCategoryObject.referenceId,
                                type: "category",
                                referenceParameters: {
                                    description: d.description
                                }
                            }
                        })
                    }
                    for(const d of toUpdate){
                        dispatchControlUpdate(d.existing.id, "referenceParameters.description", d.description)
                    }


                }
            }
            if( targetCategoryObject ){
                logger.info(`Will assign to category ${targetCategoryObject.id} / ${targetCategoryObject.plainId}`)
                await QueueAI().markCategories( targetCategoryObject, {id: targetId})
            }

        }else if( category.mode === "build"){
            await QueueAI().categorize( primitive, {id: targetId}, {textOnly: true })
        }
    }

})