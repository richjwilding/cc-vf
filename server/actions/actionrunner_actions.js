import { registerAction } from "../action_helper"
import QueueAI from "../ai_queue";
import QueueDocument from "../document_queue";
import { decodeBase64ImageToStorage, uploadDataToBucket } from "../google_helper";
import { getLogger } from "../logger";
import Category from "../model/Category";
import { categorize, generateImage, processPromptOnText } from "../openai_helper";
import QueryQueue from "../query_queue";
import { addRelationship, createPrimitive, dispatchControlUpdate, doPrimitiveAction, executeConcurrently, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, getConfig, getConfigParent, getDataForImport, getPrimitiveInputs, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentsOfType, removePrimitiveById } from "../SharedFunctions"
import { aggregateItems, compareItems, iterateItems, lookupEntity, queryByAxis, resourceLookupQuery, runAIPromptOnItems } from "../task_processor";
import { baseURL, cartesianProduct, cleanURL, markdownToSlate } from "./SharedTransforms";
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


function generateCombinations(input) {
    const keys = Object.keys(input);
    return keys.reduce((combinations, key) => {
      const temp = [];
      for (const combo of combinations) {
        for (const value of input[key]) {
          temp.push({ ...combo, [key]: value });
        }
      }
      return temp;
    }, [{}]); // Start with one empty combination
  }

registerAction( "run_generator", undefined, async (primitive, action, options, req)=>{
    const category = await Category.findOne({id: options.generator})

    const generateConfig = category.ai?.generate
    const inputs = await getPrimitiveInputs( primitive )
    
    const inputsToConsolidate = Object.keys(inputs).filter(d=>inputs[d].dataBySegment)
    const inputsToMux = Object.keys(inputs).filter(d=>!inputs[d].dataBySegment)

    const consolidated = {}
    for(const inputName of inputsToConsolidate){
        for(const key of Object.keys(inputs[inputName].dataBySegment)){
            consolidated[key] ||= {}
            consolidated[key][inputName] = inputs[inputName].dataBySegment[key]
        }
    }
    //console.log(consolidated)
    const combinations = Object.values(consolidated).map(d=>generateCombinations(d)).flat()

    const fields = Object.keys(generateConfig.resultFields).map(d=>`${d}: ${generateConfig.resultFields[d].prompt}`).join(",")
    const outputPrompt = `Provide your output as a JSON object in a field called "generated" with the following structure: [{${fields}}, ..remaining items]`

    logger.info(`Generator has ${combinations.length} combinations to build`)
    async function doGeneration( theseInputs ){
        let prompt = generateConfig.generator
        const inputField = {}
        const linkTo = []
        for(const input of Object.keys(generateConfig.inputs)){
            if( theseInputs[input]){


                let value
                const useConfig = inputs[input].config
                if( useConfig === "string"){
                    value = theseInputs[input]
                }else if(useConfig === "primitive"){
                    const d = theseInputs[input]
                    linkTo.push(d.id)
                    if(d.type === "summary"){
                        value = d.referenceParameters?.summary
                    }else{
                        value = d.title
                    }
                }
                
                if( value ){
                    if( generateConfig.inputs[input].name){
                        value = generateConfig.inputs[input].name + ": " + value
                    }
                    prompt = prompt.replaceAll(`{${input}}`, value)               
                    inputField[input] = value
                }
            }else{
                prompt = prompt.replaceAll(`{${input}}`, "")
            }
        }

        const result = await processPromptOnText( "   ", {
                opener: "<task>" + prompt,
                prompt: "</task>",
                output: outputPrompt,
                engine: options.engine ?? "gpt4o",
                field: "generated",
                debug:true,
                debug_content: true
            })
        if( result.success && result.output){
            for(const generated of result.output){
                console.log(linkTo)

                let title = `New ${generateConfig.primitiveType}`
                const titleField = Object.keys(generateConfig.resultFields).find(d=>generateConfig.resultFields[d].target === "title")
                if( titleField ){
                    title = generated[titleField]
                    delete generated[titleField]
                }
                
                const newData = {
                    workspaceId: primitive.workspaceId,
                    parent: primitive.id,
                    paths: ['origin'],
                    data:{
                        type: category.primitiveType,
                        title,
                        referenceId: options.generator,
                        referenceParameters: {
                            ...inputField,
                            ...generated
                        }
                    }
                }
                const newPrim = await createPrimitive( newData )
                if( newPrim ){
                    for(const parentId of linkTo){
                        await addRelationship( parentId, newPrim.id, "auto")
                    }
                }
            }
        }
    }
    await executeConcurrently(combinations, doGeneration)
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
            
            const searchCategory = await Category.findOne({id: primitive.referenceId})
            let itemCategoryId = searchCategory?.actingOn
            
            if( !itemCategoryId){
                const itemCategoryIds = list.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i)
                itemCategoryId = itemCategoryIds[0]
                if( itemCategoryIds.length > 1){
                    logger.error(`Target list for search has multiple categories - using first ${itemCategoryId}`)
                    list = list.filter(d=>d.referenceId === itemCategoryId)
                }
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
                            logger.info("--- Skipping")
                            continue
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
                            }
                        }
                        if( childSearch ){
                            await QueryQueue().doQuery(childSearch)
                            console.log(`do_search dispatched for ${childSearch.id}`)
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
    
    if( primitive.flowElement){
        return
    }
    let configParent = await getConfigParent( primitive )
    const config = await getConfig(primitive)

    if( options.flow || configParent?.flowElement ){
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

    if( !parentForScope ){
            await QueueDocument().doDataQuery( primitive, {...action, ...options})

    }   else{
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
        }else if( config.useAxis && !options?.scope){
            await queryByAxis( parentForScope, primitive, options )                
        }else{
            await QueueDocument().doDataQuery( primitive, {...action, ...options})
        }     
    }
})
registerAction( "run_categorizer", undefined, async (primitive, action, options, req)=>{
    console.log(`******\nIN RUN CATEGORIZER\n******`, options)
    const category = await Category.findOne({id: primitive.referenceId})
    if( options.flow ){
        const targetId = primitive.primitives?.imports
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
                }else if( inputs.categories.config === "string"){
                    realignCategoriesToInput = true
                    let lines 
                    if( inputs.categories.data.includes("\n") ){
                        lines = inputs.categories.data.split("\n")
                    }else if( inputs.categories.data.includes(".") ){
                        lines = inputs.categories.data.split(".")
                    }else{
                        lines = inputs.categories.data.split(",")
                    }
                    categoryData = lines.map(d=>d.trim()).filter(d=>d).map(d=>{
                        const [title, description] = d.split(":")
                        return {
                            title,
                            description
                        }
                    })
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
                        const titleMatch = existingCategories.find(d2=>d2.title === d.title && d2.referenceParameters?.description !== d.description)
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
registerAction( "generate_image", {id: 138, type: "categoryId"}, async (primitive, action, options = {}, req)=>{
    const prompt = primitive.referenceParameters.summary
    const response = await generateImage( prompt, {size: "wide" })
    //await uploadDataToBucket( response.data, primitive.id, 'published_images', tag)
    console.log(response)
    if( response.success){
        dispatchControlUpdate(primitive.id, "referenceParameters.hasImg", true)
        await uploadDataToBucket(response.data, primitive.id, "cc_vf_images")
    }
})
registerAction( "split_summary", {id: "summary"}, async (primitive, action, options = {}, req)=>{
    try{
        let done = false
        const text = primitive.referenceParameters.summary
        //const struct = markdownToSlate(text)
        const lines = text.split("\n").filter(d=>d.match(/^\s*-+\s/)).map(d=>d.replace(/s*-+\s+/,"").trim()).filter(d=>d)
        const originId = primitiveOrigin( primitive )
        const originRel = primitive.parentPrimitives[originId]
        const segments = await findParentPrimitivesOfType(primitive, "segment")


        console.log(lines) 
        console.log(segments.map(d=>d.plainId))
        for(const d of lines ){
            let match = d.match(/\*\*(.*?)\*\*\s*:?\s*(.*)/)
            let title = match?.[1]
            let overview = match?.[2]
            const newData = {
                workspaceId: primitive.workspaceId,
                parent: originId,
                paths: originRel,
                data:{
                    title: title ?? d,
                    referenceParameters:{
                        summary: d
                    },
                    type: primitive.type,
                    referenceId: primitive.referenceId
                }
            }
            const newPrim = await createPrimitive( newData )
            if( newPrim ){
                done = true
                for(const segment of segments){
                    const segmentRel = primitive.parentPrimitives[segment.id]
                    for(const rel of segmentRel){
                        await addRelationship(segment.id, newPrim.id, rel)
                    }
                }
            }
        }
        if( done ){
            await removePrimitiveById( primitive.id )
        }
    }catch(e){
        logger.error(e)
    }
})