import { registerAction } from "../action_helper"
import QueueAI from "../ai_queue";
import QueueDocument from "../document_queue";
import { decodeBase64ImageToStorage, getGoogleAdKeywordMetrics, uploadDataToBucket } from "../google_helper";
import { getLogger } from "../logger";
import Category from "../model/Category";
import Workspace from "../model/Workspace";
import { categorize, generateImage, processPromptOnText } from "../openai_helper";
import QueryQueue from "../query_queue";
import { addRelationship, addRelationshipToMultiple, createPrimitive, dispatchControlUpdate, doPrimitiveAction, executeConcurrently, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, getConfig, getConfigParent, getDataForImport, getPrimitiveInputs, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentsOfType, removePrimitiveById } from "../SharedFunctions"
import { aggregateItems, checkAndGenerateSegments, compareItems, iterateItems, lookupEntity, oneShotQuery, queryByAxis, resourceLookupQuery, runAIPromptOnItems } from "../task_processor";
import { findCompanyURL } from "../company_discovery";
import { replicateWorkflow } from "../workflow";
import { flattenStructuredResponse } from "../PrimitiveConfig";
import { baseURL, cartesianProduct, cleanURL, markdownToSlate } from "./SharedTransforms";
const logger = getLogger('actionrunner', 'debug'); // Debug level for moduleA

/*registerAction("test_replicate", {type: "flow"}, async (primitive, action, options, req)=>{
    const workspace = await Workspace.findOne({_id: options.workspaceId})
    if( workspace ){
        return await replicateWorkflow( primitive, workspace )
    }
})*/
registerAction( "test_cags", undefined, async (primitive, action, options = {}, req)=>{
    return await checkAndGenerateSegments(primitive, options?.parent ?? primitive, {checkOnly: true, ...options} )
})

registerAction("lookup_entity", {type: "action"}, async (primitive, action, options, req)=>{
    const config = await getConfig( primitive )
    const inputs = await getPrimitiveInputs( primitive )
    if( inputs?.items ){
        let lookupList = inputs.items.data ?? []
        if( typeof(lookupList) === "string"){
            if( lookupList.indexOf("\n") > -1){
                lookupList = lookupList.split("\n")
            }else{
                lookupList = lookupList.split(",")
            }
            lookupList = lookupList.map(d=>d.trim()).filter(Boolean)
        }
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
                }else if( config.source_type === "Name"){
                    let data = await findCompanyURL(toLookup, {returnCandidates: true})
                    if( data.length > 0){
                        const item = data[0]
                        console.log(`Got ${item.name} ${item.domain}`)

                        const newData = {
                            workspaceId: primitive.workspaceId,
                            parent: primitive.id,
                            paths: ['origin'],
                            data:{
                                title: item.name,
                                referenceParameters:{
                                  url: item.domain
                                },
                                type: "entity",
                                referenceId: 29
                            }
                        }
                        const newPrim = await createPrimitive( newData )
                    }
                }
            }else if( config.entity_type === "Web Resource"){
                let resultCategoryId = 78
                let cleaned, name
                if( config.source_type === "URL"){
                    cleaned = toLookup.trim()
                }else if( config.source_type === "Name"){
                    let data = await findCompanyURL(toLookup, {returnCandidates: true})
                    if( data.length > 0){
                        const item = data[0]
                        name = item.name
                        cleaned = item.url

                    }
                }
                if( cleaned ){
                    const newData = {
                        workspaceId: primitive.workspaceId,
                        parent: primitive.id,
                        paths: ['origin'],
                        data:{
                            title: name ?? cleaned,
                            referenceParameters:{
                                url: cleaned
                            },
                            type: "result",
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

    let inputs = await getPrimitiveInputs( primitive )
    if( inputs ){
        inputs = Object.entries(inputs).reduce((a,[k,v])=>{
            a[k] = v.data
            return a
        }, {})
    }

    console.log(`Inputs`, inputs)

    for(const d of list.reverse() ){
        logger.info(` - Will run ${options.action} for ${d.id} / ${d.plainId}`)
        try{
            await doPrimitiveAction(d, options.action, {...(options.actionOptions ?? {}), ...(inputs ?? {})})
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

    function normalizeTerms(terms){
        if( Array.isArray(terms) ){
            return terms
        }
        if( typeof(terms) === "string"){
            let asArray
            if( terms.includes("\n")){
                asArray = terms.split("\n")
            }else{
                asArray = terms.split(",")
            }
            return asArray.map(d=>d.trim())
        }
    }
    function buildSearchKey(terms){
        return (terms ?? []).map(d=>d.toLowerCase()).sort().join("-")
    }

    if( list.length > 0){
        const candidateChildSearches = Object.values(primitive?.primitives?.config ?? {})
        const childSearches = await fetchPrimitives( candidateChildSearches, {type: "search"} )
        
        logger.info(`Got ${childSearches.length} existing searches`)
        if( list.length > 0){
            const searchConfig = await getConfig( primitive )
            const terms = normalizeTerms(searchConfig.terms )
            const searchKey = buildSearchKey(terms)
            
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
                        let force
                        logger.info(` - Checking search node for ${d.id} / ${d.plainId}`)
                        
                        const currentSearches = childSearches.filter(d2=>Object.keys(d2.parentPrimitives ?? {}).includes(d.id))
                        let childSearch = currentSearches[0]
                        if( currentSearches.length > 1){
                            logger.error(`Found mutiple searches ${childSearches.length} for run_seach ${primitive.id} <> ${d.id}`)
                        }
                        if( childSearch ){
                            const status = childSearch.processing?.query?.status
                            logger.info(` --- Found child search ${childSearch.id} / ${childSearch.plainId} for ${d.id} / ${d.plainId} = ${status}`)
                            
                            const childKey =  buildSearchKey((childSearch.checkCache?.keywords ?? "").split(","))
                            if( searchKey && (childKey === searchKey)){
                                logger.info(` - Search terms not changed since last run`)
                                if(  status !== "rerun"){
                                    logger.info("--- Skipping")
                                    continue
                                }
                                force = true
                            }
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
                                await addRelationship(d.id, childSearch.id, `auto`)
                                await addRelationship(d.id, childSearch.id, `primitives.search.${searchSet.id}`)
                                
                                logger.info(` --- Created child search ${childSearch.id} / ${childSearch.plainId} found for ${d.id} / ${d.plainId}`)
                                //const res = await doPrimitiveAction(childSearch, "do_search" )
                            }
                        }
                        if( childSearch ){
                            await QueryQueue().doQuery(childSearch, {flow: true, force})
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

    const legacySegments = config.legacy
    if( legacySegments ){
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
        options.legacySegments = true
    }else{
        parentForScope = primitive
    }

    if( !parentForScope ){
            await QueueDocument().doDataQuery( primitive, {...action, ...options})

    }   else{
        if( thisCategory.type === "aggregator"){
            await aggregateItems( parentForScope, primitive, options )
        }else if( thisCategory.type === "one_shot_query"){
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

        }else if( category.mode === "evaluate"){
            let targetCategoryObject = (await primitiveChildren(primitive, "category"))?.[0]
            if( !targetCategoryObject ){
                logger.info(`Evaluator needs internal category - creating`)
                targetCategoryObject = await createPrimitive({
                    workspaceId: primitive.workspaceId,
                    paths: ["origin", "config"],
                    parent: primitive.id,
                    data:{
                        title: `Category for ${primitive.plainId}`,
                        referenceId: 90,
                        type: "category"
                    }
                })
            }
            if( targetCategoryObject ){
                //console.log(`Will run evaluator ${targetId}`)
                //await QueueAI().markCategories( targetCategoryObject, {id: targetId})
                console.log(`Will run evaluator ${primitive}`)
                await QueueAI().markCategories( targetCategoryObject, {id: primitive.id})
                console.log(`BACK FROM VAL`)
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


function collectStructuredSummaryIds(node, acc = new Set()) {
    if (!node) {
        return acc;
    }
    if (Array.isArray(node)) {
        for (const entry of node) {
            collectStructuredSummaryIds(entry, acc);
        }
        return acc;
    }
    const ids = node.ids;
    if (Array.isArray(ids)) {
        for (const value of ids) {
            if (!value) {
                continue;
            }
            if (typeof value === "string" || typeof value === "number") {
                acc.add(String(value));
            } else if (typeof value === "object" && value.id) {
                acc.add(value.id);
            }
        }
    } else if (typeof ids === "string" || typeof ids === "number") {
        acc.add(String(ids));
    }
    if (Array.isArray(node.subsections)) {
        collectStructuredSummaryIds(node.subsections, acc);
    }
    return acc;
}

registerAction( "split_structured_summary_sections", {id: 109, type: "categoryId"}, async (primitive, action, options = {}, req)=>{
    const sections = primitive.referenceParameters?.structured_summary;
    if (!Array.isArray(sections) || sections.length <= 1) {
        return { created: [], skipped: true };
    }

    const parentEntries = Object.entries(primitive.parentPrimitives ?? {}).filter(([k, rels])=>rels.includes("primitives.origin"));
    const created = [];

    for (let index = 0; index < sections.length; index++) {
        const section = sections[index];
        if (!section || typeof section !== "object") {
            continue;
        }

        const sectionClone = JSON.parse(JSON.stringify(section));
        const structuredPayload = [sectionClone];
        const summaryText = flattenStructuredResponse(structuredPayload, structuredPayload);

        const referenceParameters = {
            ...(primitive.referenceParameters ?? {}),
            structured_summary: structuredPayload,
            summary: summaryText
        };

        const heading = typeof sectionClone.heading === "string" && sectionClone.heading.trim().length > 0
            ? sectionClone.heading.trim()
            : undefined;
        const primitiveTitle = typeof primitive.title === "string" && primitive.title.trim().length > 0
            ? primitive.title.trim()
            : "Summary Section";
        const fallbackTitle = sections.length > 1
            ? `${primitiveTitle} - Section ${index + 1}`
            : primitiveTitle;
        const title = heading ?? fallbackTitle;

        const newPrimitive = await createPrimitive({
            workspaceId: primitive.workspaceId,
            data:{
                type: primitive.type,
                title,
                referenceId: primitive.referenceId,
                referenceParameters
            }
        }, undefined, req);

        for (const [parentId, paths] of parentEntries) {
            const pathList = Array.isArray(paths) ? paths : (paths ? [paths] : []);
            if (pathList.length > 0) {
                await addRelationship(parentId, newPrimitive.id, pathList);
            }
        }

        const sectionIds = Array.from(collectStructuredSummaryIds(sectionClone));
        if (sectionIds.length > 0) {
            await addRelationshipToMultiple(newPrimitive.id, sectionIds, "source", primitive.workspaceId);
        }

        created.push(newPrimitive.id);
    }

    return { created };
});

registerAction( "keyword_metrics", undefined, async (primitive, action, options = {}, req)=>{
    const result = await getGoogleAdKeywordMetrics(options.keywords, options.geo, req)
    let data
    //const result = await getGoogleAdKeywordMetrics(primitive.title, req)


    if( result.success){
        data = result.results[0]
        let updated  = {
            "avg_monthly": data.monthly ? parseInt(data.monthly.reduce((a,c)=>a+c,0) / 12) : 0,
            "last_12_mo":data.monthly,
            "competition": data.competition,
            "bid_high": data.highBid,
            "bid_low": data.lowBid
        }
        //await dispatchControlUpdate(primitive.id, "referenceParameters", updated)
        //console.log(updated)
        return updated
    }
})
registerAction( "generate_image", undefined, async (primitive, action, options = {}, req)=>{
    const config = await getConfig( primitive )

    if( !config.prompt ){
        return
    }
    const styles = {
                                        "drawing": "A detailed pencil sketch in black and white, with fine shading and crosshatching. Style should resemble a hand-drawn illustration in an artist’s sketchbook, with realistic proportions, clean lines, and intricate detail.",
                                        "cartoon": "A colorful cartoon-style illustration with bold outlines, exaggerated expressions, and simplified forms. The style should be playful, vibrant, and engaging, similar to a modern animated show, with flat colors and dynamic poses.",
                                        "photo": "A high-resolution, photorealistic image that looks like it was taken with a professional DSLR camera. Use realistic lighting, natural textures, depth of field, and accurate proportions. The result should be indistinguishable from an actual photograph.",
                                        "infographic": "A clean, modern infographic-style design with vector graphics, icons, and clear typography. The layout should be minimal, well-organized, and visually appealing, optimized for communicating information clearly with charts, symbols, and color coding.",
                                        "pixelArt": "A retro 8-bit pixel art scene with blocky, low-resolution characters and environments. Each element should be constructed from small, square pixels with a limited color palette, evoking the style of classic video games from the 1980s.",
                                        "illustration": "A hand-drawn illustration in a sketchy marker and ink style, with soft shading, textured lines, and a slightly whimsical feel. The colors should look like they were applied with markers or watercolor, giving the image warmth and a human touch."
                                        }


    const prompt = [
        config.prompt,
        config.style ? styles[config.style] : undefined,
        config.color,
        "Do not include any text"
    ].filter(Boolean).join(". ")

    const response = await generateImage(prompt, { size: config.aspect, background: config.background })
    if (response.success) {
        console.log(`Got image data`)
        await uploadDataToBucket(response.data, primitive.id, 'cc_vf_images')
        dispatchControlUpdate(primitive.id, "imageCount", (primitive.imageCount ?? 0) + 1)
        console.log(`done`, primitive.id)
    }
})
    
