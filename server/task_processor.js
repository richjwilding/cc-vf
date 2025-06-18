import { combineGroupsToChunks, expandFragmentsForContext, extractSentencesAndKeywords, fetchFragmentsForTerm, groupNeighboringSentences } from "./DocumentSearch";
import PrimitiveConfig, {flattenStructuredResponse} from "./PrimitiveConfig"
import PrimitiveParser from "./PrimitivesParser";
import { addRelationship, addRelationshipToMultiple, cosineSimilarity, createPrimitive, decodePath, dispatchControlUpdate, doPrimitiveAction, executeConcurrently, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, getConfig, getConfigParentForTerm, getDataForImport, getDataForProcessing, getFilterName, getPrimitiveInputs, multiPrimitiveAtOrginLevel, primitiveChildren, primitiveDescendents, primitiveListOrigin, primitiveOrigin, primitiveParents, primitiveParentsOfType, primitiveTask, removePrimitiveById, uniquePrimitives } from "./SharedFunctions"
import { findFilterMatches } from "./actions/SharedTransforms";
import { lookupCompanyByName } from "./crunchbase_helper";
import { decodeBase64ImageToStorage, extractURLsFromPage, fetchLinksFromWebQuery, getMetaDescriptionFromURL, googleKnowledgeForQuery, googleKnowledgeForQueryScaleSERP, queryGoogleSERP } from "./google_helper";
import { getLogger } from "./logger";
import Category from "./model/Category"
import Primitive from "./model/Primitive";
import { analyzeListAgainstTopics, buildEmbeddings, processInChunk, processPromptOnText, summarizeMultiple } from "./openai_helper";
import { findEntries, modiftyEntries, removeEntries, reviseUserRequest } from "./prompt_helper";
import axios from 'axios';

const parser = PrimitiveParser()

const logger = getLogger('task_processor', "info"); // Debug level for moduleA

export async function getItemsForQuery(primitive){
    let items
    if( primitive.type === "view"){
        items = (await getDataForProcessing( primitive, {} ))[0]
    }else{
        items = Object.keys(primitive.primitives ?? {}).includes("imports") ? await getDataForImport( primitive ) : await primitiveChildren(primitive)
    }
    return items.filter(d=>!["segment", "query", "view", "category"].includes(d.type))
}

function getAllCombinations(axisValues) {
    return axisValues.reduce((acc, axis) => {
      return acc.flatMap(combination => {
        return axis.map(value => combination.concat(value));
      });
    }, [[]]);
  }


export async function getSegemntDefinitions( primitive, customAxis, config, withItems = false ){
    try{
    if( !config ){
        config = await getConfig( primitive )
    }
    let axis = []
    if( customAxis ){
        axis = customAxis
    }else{
        if( config?.explore?.axis ){//primitive.type === "view" ){
            if( config?.explore?.axis?.column){
                const d = config?.explore?.axis?.column
                axis.push( {sourcePrimId: primitive.primitives?.axis?.column?.[0], ...d} )
            }
            if( config?.explore?.axis?.row){
                const d = config?.explore?.axis?.row
                axis.push( {sourcePrimId: primitive.primitives?.axis?.row?.[0], ...d} )
            }
        }
    }
    console.log(`Got ${axis.length} axis`)
    
    let items = await getItemsForQuery(primitive)
    
    if( axis.length === 0){
        return [{
            filters: [],
            id: primitive.id,
            items
        }]
    }
    
    console.log(`Got ${items.length} items`)

    const axisValues = []
    const filterConfig = []
    const itemMap = {}
    for(const thisAxis of axis){
        let {resolvedFilterType, pivot, relationship, check, includeNulls, skip, isRange} = PrimitiveConfig.commonFilterSetup( thisAxis, true )
        console.log(`${resolvedFilterType} / ${pivot} / ${relationship}`)
        
        let childCategories

        if( thisAxis.sourcePrimId ){
            const source = await fetchPrimitive( thisAxis.sourcePrimId )
            let pp = new Proxy(source.primitives ?? {}, parser)
            childCategories = pp.origin.uniqueAllIds
        }

        const {access, parameter,...mappedFilter} = thisAxis

        if( parameter ){
            mappedFilter.param = parameter
        }
        mappedFilter.type = thisAxis.type === "category" ? "parent" : thisAxis.type

        /*
        if( thisAxis.type === "segment_filter"){
            resolvedFilterType = "parent"
            relationship = "auto"
            pivot = 1
            mappedFilter.type = resolvedFilterType
            mappedFilter.pivot = pivot
            mappedFilter.relationship = relationship
            mappedFilter.sourcePrimId = undefined
        }*/
        delete mappedFilter["filter"]

        
        let lookups = await multiPrimitiveAtOrginLevel( items, pivot, relationship)
        let values = []
        
        if( thisAxis.type === "segment_filter" ){
            const segmentsForAxis = {}
            for(const items of lookups){
                for(const d of items){
                    const importConfig = d.referenceParameters?.importConfig
                    if( importConfig && importConfig.length > 0){
                        for( const thisImport of importConfig){
                            segmentsForAxis[thisImport.id] ||= {id: thisImport.id}
                            if( thisImport.filters){
                                const filterForAxis = thisImport.filters[thisAxis.axis]
                                if( filterForAxis){
                                    segmentsForAxis[thisImport.id].filters ||= []
                                    if( filterForAxis.pivot >= 1){
                                        logger.warn(`NOT UPDATING RELATIONSHIP FOR SEGMENT FILTER 2nd STAGE`)
                                    }
                                    delete filterForAxis["axis"]
                                    filterForAxis.segmentFilter = true
                                    const existing = findFilterMatches(segmentsForAxis[thisImport.id].filters, filterForAxis)
                                    if( !existing ){
                                        segmentsForAxis[thisImport.id].filters.push( filterForAxis)
                                        console.log(`Added item ${segmentsForAxis[thisImport.id].filters.length} for axis ${thisAxis.axis}`)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            axisValues.push( Object.values(segmentsForAxis)[0]?.filters) // just one import for now
        }else{
            values = lookups.map((item,idx)=>{
                let data
                if( resolvedFilterType === "title"){
                    data = item.map(d=>d.title)
                }
                else if( resolvedFilterType === "parameter"){
                    //data = item.map(d=>d.referenceParameters?.[mappedFilter.parameter ?? mappedFilter.param])
                    const param = mappedFilter.parameter ?? mappedFilter.param
                    data = item.map(d=>decodePath(d.referenceParameters, param))
                }else if( resolvedFilterType === "type"){
                    data = item.map(d=>d.referenceId)
                }else if( resolvedFilterType === "parent"){
                    if( thisAxis.subtype === "question"){
                        data = item.filter(d=>d.type === "prompt").map(d=>primitiveOrigin(d))
                    }else if( mappedFilter.subtype === "search"){
                        throw "Should filter by type"
                    }else if( thisAxis.type === "category" ){
                        data = item.map(d=>d.id).map(d=>childCategories.includes(d) ? d : undefined).filter((d,i,a)=>d && a.indexOf(d)===i)
                    }else{
                        data = item.map(d=>d.id)
                    }
                }else if( resolvedFilterType === "primitive"){
                        data = item
                }

                if( data?.length === 0){
                    data = [undefined]
                }

                if( thisAxis.filter){
                    data = data.filter(d=>!(d === undefined ? thisAxis.filter.includes("_N_") : thisAxis.filter.includes(d)) )
                }


                itemMap[ items[idx].id ] ||= []
                itemMap[ items[idx].id ].push( data )
                return data
            })
            let uniqueValues = [undefined, ...values].flat().map(d=>d ? d : undefined).filter((d,i,a)=>a.indexOf(d)===i)
            axisValues.push(uniqueValues)
        }
        filterConfig.push(mappedFilter)
    }
    const combos = getAllCombinations( axisValues )
    if( axis.find(d=>d.type === "segment_filter") ){

        for(const d of combos){
            console.log(d)
        }
        const importConfigList = combos.map(d=>{
            return {
                id: primitive.id, 
                filters: d.map((_,i)=>{
                return {
                    ...filterConfig[i],
                    ...d[i]
                }
            })
        }})
        return importConfigList
    }
    const segmentFilter = combos.map(d=>{
        return d.map((d,i)=>{
            return {
                ...filterConfig[i],
                value: d === undefined ? null : d
            }
        })
    })


    const itemPositions = Object.values(itemMap).map(d=>getAllCombinations(d)).flat()

    const importConfigList = segmentFilter.map(d=>{
        const values = d.map(d=>d.value === null ? undefined : d.value)
        const itemMatch = itemPositions.map(d=>d.reduce((a,c,i)=>a && c === values[i], true))
        const itemCount = itemMatch.filter(d=>d).length
        if( itemCount === 0){
            return undefined
        }
        logger.debug(`Got ${itemCount} items in segment ${values.join(",")}`)
        if( withItems ){
            const idList = Object.keys(itemMap)
            return {
                filters: d,
                id: primitive.id,
                items: itemMatch.flatMap((d,i)=>d ? items.find(d=>d.id === idList[i]) : undefined).filter(d=>d)
            }
        }
        return {
                filters: d,
                id: primitive.id
            }
        
    }).filter(d=>d)
    return importConfigList
}catch(error){
    logger.error(`Error in getSegemntDefinitions`, error)
}

}

export async function checkAndGenerateSegments( parent, primitive, options = {} ){
    const out = []
    const currentSegments = await primitiveChildren( parent, "segment")
    const checked = currentSegments.reduce((a,d)=>{a[d.id] = false; return a}, {})
    let customAxis 
    const config = await getConfig( primitive )

    if( config?.axis ){
        customAxis = Object.values(config.axis  ?? {}).filter(d=>d)
    }
    if( config?.segments ){
        let targetSegments = config?.segments
        if( targetSegments && Array.isArray(targetSegments) && targetSegments.length > 0){
            logger.debug(`Checking segments at ${parent.id} / ${parent.plainId}`)
            logger.debug( `Got ${targetSegments.length} segments to create / check - currently have ${currentSegments.length}`)

            const segmentsArePrimitives = typeof(targetSegments[0]) === "object" && targetSegments[0].id !== undefined

            const segmentNames = segmentsArePrimitives ? targetSegments.map(d=>d.title) : targetSegments

            let idx = 0
            for(const d of segmentNames){
                let existing = currentSegments.filter(d2=>d2.title === d)
                if(existing.length > 1 ){
                    logger.warn(`Got multiple segments for ${d} = ${existing.map(d=>d.plainId).join(", ")}`)
                    existing = existing[0]
                    checked[ existing.id ] = true
                }else if( existing.length === 1){
                    existing = existing[0]
                    checked[ existing.id ] = true
                }else{
                    existing = undefined
                }
                if( existing ){
                    logger.debug(`++ Got segments for ${d} = ${existing.plainId}`)
                }else{
                    const data = {
                        workspaceId: primitive.workspaceId,
                        parent: parent.id,
                        data:{
                            type: "segment",
                            title: d
                        }
                    }                    
                    if( segmentsArePrimitives ){
                        data.data.referenceParameters = {sourcePrimId: targetSegments[idx].id}
                    }
                    existing = await createPrimitive( data )
                    if( !existing ){
                        throw "Couldnt create segment"
                    }
                    await addRelationship(existing.id, parent.id, "imports")
                    logger.debug(`Created new segment ${existing.id} ${existing.plainId} for ${d}`)
                }
                out.push(existing)
                idx++
            }


        }else{
            return
        }

    }else{
        let targetSegmentConfig
        if( (config?.by_axis === false) && (!options.by_axis)){
            targetSegmentConfig = [
                {
                    id: parent.id
                }
                
            ]
        }else{
            targetSegmentConfig = await getSegemntDefinitions(parent, customAxis)
        }
        
        logger.debug(`Checking segments at ${parent.id} / ${parent.plainId}`)
        logger.debug( `Got ${targetSegmentConfig.length} segments to create / check - currently have ${currentSegments.length}`)
        
        for(const importConfig of targetSegmentConfig){
            let existing = currentSegments.filter(d=>PrimitiveConfig.checkImports( d, importConfig.id, importConfig.filters))
            if(existing.length > 1 ){
                logger.warn(`Got multiple segments for ${JSON.stringify(importConfig)} = ${existing.map(d=>d.plainId).join(", ")}`)
                existing = existing[0]
                checked[ existing.id ] = true
            }else if( existing.length === 1){
                existing = existing[0]
                checked[ existing.id ] = true
            }else{
                existing = undefined
            }
            if( existing ){
                logger.debug(`++ Got segments for ${JSON.stringify(importConfig)} = ${existing.plainId}`)
            }
            if( !existing ){
                existing = await createPrimitive({
                    workspaceId: primitive.workspaceId,
                    parent: parent.id,
                    data:{
                        type: "segment",
                        title: "New segement",
                        referenceParameters:{
                            //target:"items",
                            importConfig:[importConfig]
                        }
                    }
                })
                if( !existing ){
                    throw "Couldnt create segment"
                }
                await addRelationship(existing.id, parent.id, "imports")
                logger.debug(`Created new segment ${existing.id} ${existing.plainId} for ${JSON.stringify(importConfig)}`)
            }
            out.push(existing)
        }
    }
    if( options.clear){//} || primitive.referenceParameters?.segments ){
        const toClear = Object.keys(checked).filter(d=>!checked[d])
        if( toClear.length > 0){
            logger.debug(`${toClear.length} of ${currentSegments.length} to be cleared`)
            for(const d of toClear){await removePrimitiveById( d )}
        }
        return {segments: out, cleared: toClear}
    }
    return out
} 
export async function aggregateItems( parent, primitive, options = {}){
    return await baselineItemProcess( parent, primitive, options, {action: "rebuild_summary"})
}
export async function baselineItemProcess( parent, primitive, options = {}, execOptions = {}){
    const segments = await checkAndGenerateSegments( parent, primitive, {...options, ...(execOptions.lookup ?? {})})
    const config = await getConfig( primitive )
    const currentAggregators = (await primitiveChildren( primitive )).filter(d=>d.referenceId === config.aggregate)
    const aggregatorCategory = await Category.findOne({id: config.aggregate})
    if( !aggregatorCategory){
        throw `Couldnt find aggregator ${config.aggregate}`
    }
    
    const out = []
    
    logger.debug(config)
    logger.info(`Got ${segments.length} target segments and ${currentAggregators.length} aggregators`)
    
    for( const segment of segments){
        let existing = config.split ? undefined : currentAggregators.find(d=>Object.keys(d.parentPrimitives).includes(segment.id))
        if( existing ){
            if( !options.force ){
                if( existing.referenceParameters?.summary){
                    logger.debug(`Skipping existing item`)
                }
                continue
            }
        }else{
            existing = await createPrimitive({
                workspaceId: primitive.workspaceId,
                paths: ["origin", "config"],
                parent: primitive.id,
                data:{
                    referenceId: config.aggregate,
                    type: aggregatorCategory.primitiveType,
                    title: `Instance of ${primitive.plainId}`,
                    referenceParameters:{
                        //target:"items"
                    }
                }
            }, true, undefined, {category: aggregatorCategory})
            if( !existing ){
                throw "Couldnt create aggregator"
            }
            await addRelationship(existing.id, segment.id, "imports")
            existing = await fetchPrimitive(existing.id)
            await addRelationship(segment.id, existing.id, "auto")
            logger.debug(`Created new aggregate ${existing.id} ${existing.plainId} for ${primitive.id} / ${primitive.plainId}`)
            
        }
        if( existing ){
            logger.debug(`Aggregation ${existing.plainId}`)
            if( execOptions.primitivesOnly ){
                out.push( existing)
            }else{
                await doPrimitiveAction( existing, execOptions.action ?? "rebuild_summary")
            }
        }
        
    }
    if( execOptions.primitivesOnly ){
        return out
    }
}
export async function compareItems( parent, primitive, options = {}){
    const config = await getConfig( primitive )
    if( config.compare_type == "streamline"){
        return await streamlineWithPeers( parent, primitive, options)
    }else{
        return await baselineItemProcess( parent, primitive, options, {action: "rebuild_summary"})
    }
}
export async function streamlineWithPeers( parent, primitive, options = {}){
    try{
        const targetPrimitives = await baselineItemProcess( parent, primitive, options, {primitivesOnly: true})
        const config = await getConfig( primitive )

        /*
        const allSegments = await primitiveChildren( parent, "segment")
        let targetSegmentConfig
        if( (primitive.referenceParameters?.by_axis === false) && (!options.by_axis)){
            targetSegmentConfig = [
                {
                    id: parent.id
                }
                
            ]
        }else{
            targetSegmentConfig = await getSegemntDefinitions(parent)
        }

        const others = []
        
        for(const importConfig of targetSegmentConfig){
            let existing = allSegments.find(d=>PrimitiveConfig.checkImports( d, importConfig.id, importConfig.filters))
            if(existing){
                others.push( existing )
            }
        }*/

        const others = await primitiveListOrigin( targetPrimitives, 1, "segment")

        logger.debug(`Got ${others.length} segments`)

        const param = config.field?.slice(6)
        let structured = false

        function translateItem(title, items){
            return items.map(d=>{
                let content, root
                if(config.field === "title"){
                    content = d.title
                }else{
                    if( param === "summary" && d.referenceParameters.structured_summary){
                        structured = true
                        root = d.referenceParameters.structured_summary
                        const mapped = extractFlatNodes(d.referenceParameters.structured_summary  )
                        content = mapped                 
                    }else{
                        content = d.referenceParameters[param]
                    }
                }
                return {
                    title,
                    content,
                    root
                }
            })[0]
        }
        
        const {results:allItems} = await executeConcurrently( others, async (segment)=>{
            const items = await getItemsForQuery( segment)
            return translateItem(await getFilterName(segment), items)
        })
        const partials = []
        let idx = 0

        for(const d of allItems){
            let final
            if( structured ){
                final = d.content.map(d=>d.content)
            }else{
                const keywords = extractSentencesAndKeywords(d.content.replace(/[\s\t\n]+/g, ' '));
                const groupedSentences = groupNeighboringSentences(keywords);
                final = combineGroupsToChunks(groupedSentences).filter(d=>d && d.length > 0)
            }
            
            logger.debug(`For ${d.title} have ${final.length} groups (${structured ? "Structured" : "Text"})`)
            let {results:embeddings, _} = await executeConcurrently( final, async (segment, part)=>{
                const response = await buildEmbeddings( segment)
                logger.silly(`-- part ${part} back`)
                if( response?.success){
                    return { part: part, segment: segment, embeddings: response.embeddings}
                }  
                return undefined
            }, undefined, undefined, 10)
            
            partials.push({
                idx,
                title: d.title,
                groups: final,
                embeddings
            })
            idx++
        }

        logger.debug("Comparing fragments")
        const forScoring = partials.map(d=>d.embeddings.map(d2=>({
            id: `${d.idx}-${d2.part}`,
            itemIdx: d.idx,
            ...d2
        }))).flat()
        let checked = new Set()
        let scores = []
        for( const left of forScoring){
            for( const right of forScoring){
                if( left.itemIdx === right.itemIdx ){
                    continue
                }
                const sId = [left.id, right.id].sort().join("-")
                if( checked.has(sId)){
                    continue
                }
                checked.add( sId )
                let score = cosineSimilarity(left.embeddings, right.embeddings)
                if( score > 0.9 ){
                    scores.push( {
                        leftId: left.id,
                        rightId: right.id,
                        score
                    })
                }
            }
        }
        
        const topicGroups = groupItems( scores )

        let repetitions
        const updateInstructions = {}

        for(const topic of topicGroups ){
            logger.debug(`Doing topic group`)
            const fragments = topic.map(d=>[d.leftId,d.rightId]).flat().filter((d,i,a)=>a.indexOf(d)===i).map(d=>{let [idx,part]=d.split("-");return partials[idx].groups[part] })

            logger.debug("Looking for repetition")
            const results = await processPromptOnText( fragments,{
                opener:  "Here is a list of numbered text fragments to analyze",
                prompt: `Identify an exhaustive list of repetitive detail which do not add any value to the reader - repetition which provides context for the proceeding text should be listed.   Do not group repetitive items together - i want specifics.  Be thoughtful to ensure you identify each occurrence of repetition and ensure you consider each and every text fragment. Review your work and correct any mistakes.`,
                output: `Provide your answer in a json object with the following structure:
                            {
                                items:[
                                {
                                    class: type of repetition identified (ie repetition of facts, quotes, narrative etc),
                                    description: 20 word summary of the repetition,
                                    ids: list the fragment number of each and every items this repetition occurs in
                                },
                                ....
                                ]
                            }`,
                no_num: false,
                temperature: 0.7,
                workspaceId: primitive.workspaceId,
                usageId: primitive.id,
                functionName: "compare_repetition",
                debug: false,
                debug_content: false,
                //wholeResponse: true
                field: "items"
            })
            repetitions = results.output

            
            const getInstructions = async (repetition, n)=>{
                logger.debug(`Getting update instructions ${n}`)
                
                let fragmentList, fragments
                if( structured ){
                    fragmentList = topic.map(d=>[d.leftId,d.rightId]).flat().filter((d,i,a)=>a.indexOf(d)===i).filter((d,i)=>repetition.ids.includes(i)).filter((d,i,a)=>a.indexOf(d)===i)
                    fragments = fragmentList.map((d,i)=>{
                            let [idx,part]=d.split("-")
                            const item = allItems[idx]
                            return `{idx: ${i},section_title: ${item.title},content: ${partials[idx].groups[part]}`
                        })
                }else{
                    fragmentList = topic.map(d=>[d.leftId,d.rightId]).flat().filter((d,i,a)=>a.indexOf(d)===i).filter((d,i)=>repetition.ids.includes(i)).map((d,i)=>{
                        let [idx,part]=d.split("-")
                        return idx}).filter((d,i,a)=>a.indexOf(d)===i)
                    fragments = fragmentList.map((idx,i)=>{
                            return `{idx: ${i},section_title: ${partials[idx].title},content: ${partials[idx].groups.join("\n")}}`
                        })
                }
                const results = await processPromptOnText( fragments,{
                    opener:  `Here is data about sections in a report. These sections have found to have duplication about the following topic: ${repetition.description}\n`,
                    prompt: `Your task is to remove repetitive text about that topic that does not add any value to the reader. The content about the topic should be kept in at least one segment - more if it adds value to several.  Carefully review each item including the section title that has been provided to identify which fargment(s) should remain as is, and which should be updated to remove repetition.`,
                    output: `Provide your answer in a json object with the following structure:
                                {
                                    items:[
                                    {
                                        idx: the idx field of the section,
                                        rationale: a 20 word summary on why this is the approproate treatment of this section,
                                        retain: if the section should retain the content about the topic,
                                        revise: if the section should be revised to remove repetition about the topic,
                                        instructions: if revised, 30 word instruction i can give to an LLM on what to revised in this section . Assume the LLM does not have the full set of fragments and will therefore not know what is repetitive / redundant - you must there be explicit about what to do and must not refer to duplicated / repetitive / redudnant text (or similar)
                                    },
                                    ....
                                    ]
                                }`,
                    temperature: 0.7,
                    workspaceId: primitive.workspaceId,
                    usageId: primitive.id,
                    functionName: "compare_instructions",
                    debug: false,
                    debug_content: false,
                    //wholeResponse: true
                    field: "items"
                })
                if( results.output ){
                    for(const d of results.output){
                        if( d.revise ){
                            const mapped = fragmentList[d.idx]
                            logger.debug(`- ${d.idx} -> ${mapped}`)
                            updateInstructions[mapped] ||= []
                            updateInstructions[mapped].push( d.instructions)
                        }
                    }
                }
            }
            
            if( repetitions ){
                await executeConcurrently(repetitions, getInstructions)
            }

            logger.debug( updateInstructions)
            const updateSection = async({key, instructions}, n)=>{
                const [idx, part] = key.split("-")
                let item, node
                if( structured ){
                    node = allItems[idx]?.content?.[part]?.node
                    item = JSON.stringify(node?.content)
                }else{
                    item = partials[idx].groups.join("\n")

                }
                let mappedInstructions = instructions.map((d,i)=>`${i}. ${d}`).join("\n")
                if( item ){
                    logger.debug(`Doing update ${n}`, mappedInstructions)
                    const results = await processPromptOnText( item,{
                        opener:  `Here is a section from a report. Your task is to update it.\n`,
                        prompt: `Revise the section based upon these editorial comments:\n${mappedInstructions}\n---\n\n`,
                        output: `Provide your answer in a json object with the following structure:
                                    {
                                        updated: Updated content, keeping everything the same except for the changes needed in the editorial comments,
                                        cleared: a boolean indicating id the updated content is now empty / redundant
                                    }`,
                        temperature: 0.7,
                        workspaceId: primitive.workspaceId,
                        usageId: primitive.id,
                        functionName: "compare_rewrite",
                        debug: false,
                        debug_content: false,
                        wholeResponse: true
                    })
                    if( results.success){
                        let update = results.output[0]
                        if( structured ){
                            if( update.cleared){
                                node.omit = true
                            }else{
                                node.oldContent = node.content
                                node.content = update.updated
                            }
                        }
                    }
                }
            }

            const updateList = Object.keys(updateInstructions).map(d=>({key: d, instructions:updateInstructions[d]}))
            await executeConcurrently(updateList, updateSection)

            logger.debug(`Storing results`)
            let idx = 0
            for(const item of allItems){
                if( structured ){
                    const segment = removeOmittedItemsFromStructure( item.root )
                    const flat = flattenStructuredResponse( segment, segment)
                    const target = targetPrimitives[idx]
                    logger.debug(`Updating ${target.plainId} / ${target.id}`)
                    dispatchControlUpdate(target.id, "referenceParameters.summary", flat)
                    dispatchControlUpdate(target.id, "referenceParameters.structured_summary", segment)
                }
                idx++
            }
        }

        

    }catch(e){
                logger.debug(`Error in comparePeers`)
                console.log(e)

    }
}


class UnionFind {
    constructor() {
        this.parent = new Map();
    }

    find(x) {
        if (!this.parent.has(x)) this.parent.set(x, x);
        if (this.parent.get(x) !== x) {
            this.parent.set(x, this.find(this.parent.get(x)));
        }
        return this.parent.get(x);
    }

    union(x, y) {
        const rootX = this.find(x);
        const rootY = this.find(y);
        if (rootX !== rootY) {
            this.parent.set(rootX, rootY);
        }
    }
}

function groupItems(items) {
    const uf = new UnionFind();

    // Step 1: Union connected IDs
    items.forEach(item => {
        uf.union(item.leftId, item.rightId);
    });

    // Step 2: Group items based on root
    const groups = new Map();
    items.forEach(item => {
        const root = uf.find(item.leftId);
        if (!groups.has(root)) {
            groups.set(root, []);
        }
        groups.get(root).push(item);
    });

    // Convert groups map to array of groups
    return Array.from(groups.values());
}


export async function comapreToPeers( parent, activeSegment, primitive, options = {}){
    try{
        const allSegments = await primitiveChildren( parent, "segment")
        const config = await getConfig( primitive )
        let targetSegmentConfig
        if( (primitive.referenceParameters?.by_axis === false) && (!options.by_axis)){
            targetSegmentConfig = [
                {
                    id: parent.id
                }
                
            ]
        }else{
            targetSegmentConfig = await getSegemntDefinitions(parent)
        }

        const others = [], thisOne = []
        
        for(const importConfig of targetSegmentConfig){
            let existing = allSegments.find(d=>PrimitiveConfig.checkImports( d, importConfig.id, importConfig.filters))
            if(existing){
                const importSet = existing.referenceParameters.importConfig.find(d=>d.id === parent.id)
                if( PrimitiveConfig.checkImports( activeSegment, parent.id, importSet?.filters)){
                    thisOne.push(existing)
                }else{
                    others.push( existing )
                }
            }
        }
        console.log(`Got ${thisOne.length} / ${others.length} segments`)

        const param = config.field?.slice(6)
        let structured = false

        function translateItem(items){
            return items.map(d=>{
                if(config.field === "title"){
                    return d.title
                }else{
                    if( param === "summary" && d.referenceParameters.structured_summary){
                        structured = true
                        return JSON.stringify(d.referenceParameters.structured_summary)
                    }
                    return d.referenceParameters[param]
                }
            })
        }
        
        const {results:otherItems} = await executeConcurrently( others, async (segment)=>{
            const items = await getItemsForQuery( segment)
            return {title: await getFilterName(segment), content: translateItem(items).filter(d=>d)}
        })

        const activePrimitives = await getItemsForQuery( thisOne[0] )
        const activeItem = translateItem(activePrimitives).filter(d=>d)[0]
        const activeText = `Covering - ${await getFilterName(thisOne[0])}:\n${activeItem}`
        const otherText = otherItems.map((d,i)=>`\n\nItem ${i+1}:${d.title}\n=============\n${d.content}`)

        const fullText = `The data is a set of summaries for different segements - i need your help to compare and contrast these segments with one i am particularly interested in. Here are the peer segments for context:\n ${otherText}\n\nAnd here is the target segement to update:\n ${activeText}\n---END OF SEGMENT\n\n`

        let result
        let prompt = (config.prompt ? config.prompt : undefined) ?? "Compare all of the segments and then highlight what is unique about the one i am interested in"
        const streamline = await summarizeMultiple([fullText],{
            prompt,
            output: structured ? "Generate a n new output for the segment im interested in in a json object with a field called 'new_segment'. The field must be in the same structure as the input for this segment - including nested subsections - but with the relevant content fields updated where necessary - add a 'omit' field to any subsections which should be removed from this segment, and a 'updates' field containing a 30 word overview of your changes. Ensure you consider and include every entry in the input array - and every nested subsection of this segment."
                    : "Provide the output as a json object with a field called 'summary' containing the new summary as a string with suitable linebreaks to deliniate sections",
//            output: "Provide the output as a json object with a field called 'summary' containing the new summary as a markdown string in the format specified",
            engine: config.engine ?? "gpt4p",
            markdown: true,//config.markdown, 
            temperature: config.temperature ?? primitive.referenceParameters?.temperature,
            heading: true,//config.heading,
            keepLineBreaks: true,
            wholeResponse: structured,
            debug: true,
            debug_content:true
        })

        if( structured ){
            console.log(streamline)
            if( streamline.success ){
                const segment = removeOmittedItemsFromStructure( streamline.summary.new_segment )
                const flat = flattenStructuredResponse( segment, segment)
                console.log(flat)
                console.log("done")
                return {
                    plain: flattenStructuredResponse( segment, segment),
                    structured: segment
                }

            }
        }

        if( streamline.success && streamline.summary){
            return streamline.summary
        }
    }catch(e){
                console.log(`Error in comparePeers`)
                console.log(e)

    }
}


export async function iterateItems( parent, primitive, options = {}){

    const segments = await checkAndGenerateSegments( parent, primitive, options)
    const config = await getConfig( primitive )

    const aggregateReferenceId = 38
    
    const currentAggregators = (await primitiveChildren( primitive )).filter(d=>d.referenceId === aggregateReferenceId)
    const aggregatorCategory = await Category.findOne({id: aggregateReferenceId})
    if( !aggregatorCategory){
        throw `Couldnt find aggregator ${config.aggregate}`
    }
    
    
    console.log(config)
    console.log(`Got ${segments.length} target segments and ${currentAggregators.length} aggregators`)
    
    
    for( const segment of segments){
        let existing = currentAggregators.find(d=>Object.keys(d.parentPrimitives).includes(segment.id))
        
        if( !existing ){
            existing = await createPrimitive({
                workspaceId: primitive.workspaceId,
                paths: ["origin", "config"],
                parent: primitive.id,
                data:{
                    referenceId: aggregateReferenceId,
                    type: aggregatorCategory.primitiveType,
                    title: `Instance of ${primitive.plainId}`,
                    referenceParameters:{
                        //target:"items"
                    }
                }
            }, true, undefined, {category: aggregatorCategory})
            if( !existing ){
                throw "Couldnt create aggregator"
            }
            await addRelationship(existing.id, segment.id, "imports")
            existing = await fetchPrimitive(existing.id)
            await addRelationship(segment.id, existing.id, "auto")
            console.log(`Created new aggregate ${existing.id} ${existing.plainId} for ${primitive.id} / ${primitive.plainId}`)
        }
        if( existing ){
            console.log(`Aggregation ${existing.plainId}`)
            await doPrimitiveAction( existing, "run_process")
        }
    }
}
export async function runProcess( primitive, options = {}){
    const source = options.source ? await fetchPrimitive( options.source ) : undefined
    const [items, toProcess] = await getDataForProcessing(primitive, {field: "param.summary"}, source, {instance: options?.instance, forceImport: true} )

    console.log(`${items.length} items`)

    const config = await getConfig( primitive )
    console.log(config)
    config.resultCategoryId = config.extract
    config.extractor ={
        method: "query",
        field:"summary"
    }
    await extractor( primitive, config, {items: items, toProcess: toProcess} )
}

export async function extractor( source, config, options = {} ){
    const addTarget = await fetchPrimitive(primitiveOrigin( source ))
    const extractConfig = config.extractor ?? {method: "lookup", direction: "child"}
    const extractTargetCategory = await Category.findOne({id: config.resultCategoryId})
    
    if( !addTarget || !extractTargetCategory){
        return "Cant extract - missing parent of extract id"
    }
    let currentParents
    
    if(extractConfig.direction === "parent"){
        currentParents = (await primitiveParents(source)) .filter(d=>d.referenceId === config.resultCategoryId)
        if( currentParents.length > 0 ){
            console.log(`Already linked`)
            return 
        }
    } 


    if( extractConfig.method === "lookup"){
        const field = extractConfig.field ?? "title"
        const value = field === "title" ? source.title : source.referenceParameters?.[field]
        console.log(value)

        let lookup = await lookupEntity( value, extractTargetCategory, source.workspaceId, {parent: addTarget})
        if( lookup ){
            if(extractConfig.direction === "parent"){
                await addRelationship( lookup.id, source.id, "link")
                console.log(`Linked to ${lookup.id} / ${lookup.plainId}`)
            }
        }

    }else{
        if( extractTargetCategory.ai?.extract ){
            console.log(`Will extract ${extractTargetCategory.id} / ${extractTargetCategory.title}`)
            const metadata = {}
            for(const k of Object.keys(extractTargetCategory.ai.extract.responseFields) ){
                const field = extractTargetCategory.ai.extract.responseFields[k].target ?? k
                metadata[field] = `a ${field} field containing ${extractTargetCategory.ai.extract.responseFields[k].prompt}`
            }
            console.log(metadata)
            const query = extractTargetCategory.ai.extract.prompt
            const outPrompt = [
                `Return the result in a json object called "answer" which is an array containing every part of your answer.  Each part must have a boolean 'answered' field indicating if this part contains an answer or if no answer was found`,
                `, a 'quote' field containing up to 50 words of the exact text used from the fragments`,
                `, a 'ids' field containing the number of the text fragments containing information used to produce this specific part of the answer (include no more than 10 numbers), and a 'count' field indicating the total number of text fragments used in this part of the answer.`,
                `For each part of your answer also include ${JSON.stringify(metadata)}`
            ].filter(d=>d).join("") + "."
            
            console.log(`----> DO QUERY`)

            const results = await processPromptOnText( options.toProcess,{
                opener:  "Here is a list of numbered items to process",
                prompt: `Using only the information explcitly provided in the text fragments answer the following question or task: ${query}.\nEnsure you use all relevant information to give a comprehensive answer.`,
                //output: `Return the result in a json object called "answer" which is an array containing one or more parts of your answer.  Each part must have a 'overview' field containing a summary of the part in no more than 20 words, an 'answer' field containing the full part of the answer in 100-250 words, a 'quote' field containing up to 50 words of the exact text used from the fragments, a 'ids' field containing the number of the text fragments containing information used to produce this specific part of the answer (include no more than 10 numbers), and a 'count' field indicating the total number of text fragments used in this part of the answer.${(extraFields ?? "").length > 0 ? extraFields + ", " : ""}`,
                output: outPrompt,
                no_num: false,
                temperature: 1,
                markPass: true,
                batch:  20, 
                idField: "ids",
                debug: true,
                debug_content: true,
                field: "answer"
            })
            const task = await Primitive.findOne({_id: await primitiveTask( source ) })
            for(const candidate of results.output){
                if( !candidate.answered){
                    continue
                }
                let lookup = await lookupEntity( candidate.title, extractTargetCategory, source.workspaceId, {parent: addTarget, context: {topics: task?.referenceParameters?.topics}})

                if( lookup ){
                    console.log(`Got lookup result`)
                    if(extractConfig.direction === "parent"){
                        await addRelationship( lookup.id, source.id, "link")
                        console.log(`Linked to ${lookup.id} / ${lookup.plainId} to ${source.id}`)
                    }else{
                        await addRelationship( source.id, lookup.id, "link")
                        console.log(`Linked from ${source.id} to ${lookup.id} / ${lookup.plainId}`)

                        if( addTarget && !Object.keys(lookup.parentPrimitives ?? {}).includes(addTarget.id)){
                            await addRelationship( addTarget.id, lookup.id, "link")
                            console.log(`Linked from ${addTarget.id} to ${lookup.id} / ${lookup.plainId}`)
                        }
                    }
                }

            }
        }
    }
}

export async function lookupEntity( value, referenceCategory, workspaceId, options = {} ){
    if( referenceCategory.id === 29){
        return await loopkupOrganization(value, referenceCategory, workspaceId, options)
    }else if( referenceCategory.id === 44){
        return await lookupPerson(value, referenceCategory, workspaceId, options)
    }
}
export async function lookupPerson( value, referenceCategory, workspaceId, options = {} ){
    let item = await findExistingEntityByTitle( value, referenceCategory, workspaceId)
    if( item ){
        return item
    }
    let candidates = []
    const valuesToTry = [value].filter(d=>d && d.length > 0)
    for(const cValue of valuesToTry){
        const googleKnowledge = await googleKnowledgeForQuery( `who is ${cValue}`, {overview: true}, )

        if( googleKnowledge){

            let actualName = googleKnowledge.overview?.title
            if( !actualName && googleKnowledge.knowledge?.description){
                const result = await processPromptOnText( googleKnowledge.knowledge?.description,{
                    opener: "Here a description about a person",
                    prompt:"Identify the name they are most commonly known by",
                    output: "provide your answer in a json object called with a single field called 'known_by' contianing you answer",
                    wholeResponse: true,
                    debug:true,
                    debug_content:true

                })
                if( result?.success && result.output?.[0]){
                    actualName = result.output[0].known_by
                }
                
            }

            const candidate = {
                title: actualName ?? cValue,
                description: googleKnowledge.knowledge?.description,
                description_source: googleKnowledge.knowledge?.description_source,
                image: googleKnowledge.overview?.items?.find(d=>d.attrid==="VisualDigestFirstImageResult")?.image
            }
            candidates.push( candidate )
        }
    }

    console.log(`Got ${candidates.length} candidates from remote`)
    let match = candidates[0]
    if( match ){
        console.log(match)
        let item = await findExistingEntityByTitle( match.title, referenceCategory, workspaceId)
        if( item ){
            return item
        }
        item = match

        const newData = {
            workspaceId: workspaceId,
            parent: options.parent?.id,
            data:{
                type: referenceCategory.primitiveType,
                referenceId: referenceCategory.id,
                title: item.title,
                referenceParameters:{
                    description: item.description,
                    description_source: item.description_source,
                }
            }
        }
        if( item.image ){
            newData.data.referenceParameters.hasImg = true
        }
        const newPrim = await createPrimitive( newData )
        console.log(`created new ${newPrim?.id}`)
        if( newPrim && item.image ){
            if( item.image.match(/https?:\/\// )){
                await replicateURLtoStorage(item.image, newPrim._id.toString(), "cc_vf_images")
            }else if(item.image.match(/^data:image/ )){
                await decodeBase64ImageToStorage(item.image, newPrim._id.toString(), "cc_vf_images")
            }
        }
        return newPrim

    }
}

export async function findExistingEntityByTitle(value, referenceCategory, workspaceId ){
    const valuesToTry = [value].filter(d=>d && d.length > 0)
    let match

    if( valuesToTry.length > 0){
        const regexArray = valuesToTry.map(pattern => new RegExp(pattern, 'i'));
        const candidates = await Primitive.find({
            title: { $in: regexArray },
            referenceId: referenceCategory.id,
            deleted: {$exists: false},
            workspaceId: workspaceId
        })
        console.log(`Got ${candidates.length} candidates`)
        if( candidates.length > 0){
            return candidates[0]
        }
    }

    return undefined
}


export async function loopkupOrganization( value, referenceCategory, workspaceId, options = {} ){
    let item = await findExistingEntityByTitle( value, referenceCategory, workspaceId)
    if( item ){
        return item
    }
    const remoteLookup = await lookupCompanyByName( value )
    console.log(`Got ${remoteLookup.length} candidates from remote`)
    if( remoteLookup.length > 0){
        const urlsToCheck = remoteLookup.map(d=>d.website_url).filter(d=>d && d.length > 0)

        if( urlsToCheck.length > 0){
            const candidates = await Primitive.findOne({
                "referenceParameters.url": { $in: urlsToCheck },
                referenceId: referenceCategory.id,
                deleted: {$exists: false},
                workspaceId: workspaceId
            })
            if( candidates ){
                console.log(`Got from url`)
                return candidates
            }
        }
        
        item = remoteLookup[0]
        
    }
    if( !item ){
        console.log(`--- Looking to resolve ${value} via websearch`)
        const url = await findCompanyURLByName( value, options.context  )
        
        if( url ){
            const candidates = await Primitive.findOne({
                "referenceParameters.url": url,
                referenceId: referenceCategory.id,
                deleted: {$exists: false},
                workspaceId: workspaceId
            })
            console.log(`Check URL ${url} ${candidates}`)
            if( candidates ){
                console.log(`Got from url 2`)
                return candidates
            }
        
            item = {
                name: value,
                website_url: url
            }
        }
    }
    if( item ){

        const newData = {
            workspaceId: workspaceId,
            parent: options.parent?.id,
            data:{
                type: referenceCategory.primitiveType,
                referenceId: referenceCategory.id,
                title: item.name,
                referenceParameters:{
                    url: item.website_url
                }
            }
        }
        const newPrim = await createPrimitive( newData )
        console.log(`created new ${newPrim?.id}`)
        return newPrim
    }
}
export async function findCompanyURLByNameLogoDev( name, context = {}){
    try{
        const { data } = await axios.get('https://api.logo.dev/search', {
                params: { q: name },
                headers: {
                    'Authorization': `Bearer ${process.env.LOGODEV_KEY}`
            }
        });
        if( context.withDescriptions){
            const withDescriptions = await executeConcurrently(data, async (d)=>{
                try{
                    const { data } = await axios.get(`https://api.logo.dev/describe/${d.domain}`, {
                        headers: {
                            'Authorization': `Bearer ${process.env.LOGODEV_KEY}`
                            }
                        });
                        return data
                    }catch(e){
                        logger.error(`Error in findCompanyURLByNameLogoDev`, name, context, e)
                        return undefined                        
                    }
                })
                if( withDescriptions.results){
                    return  withDescriptions.results
                }
        }
        return data.filter(d=>d)
    }catch(e){
        logger.error(`Error in findCompanyURLByNameLogoDev`, name, context, e)
        return []
    }
}
export async function findCompanyURLByName( name, context = {}){
    console.log(`>>>> SHOULD USE LOGO.DEV`)
    let results = await Promise.all([
        findCompanyURLByNameByApollo(name, context),
        findCompanyURLByNameByZoominfo(name, context),
        findCompanyURLByKnowledgeGraph(name, context),
        findCompanyURLByNameByAboutUs(name, context)
    ]);
    results = results.flat().filter((d,i,a)=>d && a.indexOf(d)===i).map(d=>({hostname: d}))

    console.log(results)
    if( context.topics ){
        await executeConcurrently(results, async (d, i)=>{
            results[i].meta = await getMetaDescriptionFromURL(d.hostname)
        })
        const toProcess = Object.values(results).filter(d=>d.meta)
        const pass = []
        
        if( toProcess.length > 0){
            const result = await analyzeListAgainstTopics(toProcess, context.topics, {asScore: true,prefix: "Organization", type: "organization"})
            if( result?.success && result.output){
                for(const d of result.output){
                    console.log(d)
                    if( d.s >= 2){
                        pass.push({...toProcess[d.i], s:d.s})
                    }
                }
            }
            console.log(`Passed `)
            console.log(pass)
            return pass.sort((a,b)=>b.s - a.s)[0]?.hostname
        }
    }
    return results[0]?.hostname

    return undefined
}
export async function findCompanyURLByNameByApollo( name, context ){
    const result = await fetchLinksFromWebQuery(`\"${name}\" site:apollo.io`, {timeFrame: ""})
    if( result.links ){
        const regex = new RegExp(`View ${name} \\((https?:\\/\\/[^\\)]+)\\)`,'i')
        
        let matched
        
        for(const d of result.links){
            const m = d.snippet?.match(regex)
            if( m){
                matched = m[1]
                break
            }
        }
        if( matched ){
            console.log(`Got URL ${matched}`)
        }
        return matched
    }

}
export async function findCompanyURLByNameByZoominfo( name, context ){
    const result = await fetchLinksFromWebQuery(`\"${name}\" site:zoominfo.com`, {timeFrame: ""})
    if( result.links ){
        const regex = new RegExp(`View ${name} \\((https?:\\/\\/[^\\)]+)\\)`,'i')
        
        let matched
        
        for(const d of result.links){
            const m = d.snippet?.match(regex)
            if( m){
                matched = m[1]
                break
            }
        }
        return matched
    }
}
export async function findCompanyURLByNameByAboutUs( name, context = {}){
    const result = await fetchLinksFromWebQuery(`\"${name}\" "about"`, {timeFrame: ""})
    if( result.links ){
        const regex = new RegExp(name,'i')
        
        const domains = {}

        const ignoreDomains = [
            'www.globaldata.com',
            'www.bloomberg.com',
            'www.statista.com',
            'linkedin.com',
            'finance.yahoo.com',
            'uk.marketscreener.com',
            'www.dnb.com',
            '.instagram.com',
            '.indeed.com',
            'www.zoominfo.com',
            'www.apollo.io',
            'rocketreach.co'
        ]
        
        for(const d of result.links){
            if( d.snippet?.match(regex) || d.title?.match(regex) ){
                const url = new URL(d.url)
                const hostname = url.hostname
                if( hostname.toLowerCase().indexOf(name.toLowerCase()) > -1){
                    return d.url
                }else if( hostname.toLowerCase().indexOf(name.toLowerCase().replaceAll(" ", "")) > -1){
                    return d.url
                }else if( hostname === "en.wikipedia.org"){
                    console.log(`Got wiki -examining`)
                    return await extractMainURLFromWikipedia( d.url )
                }else if(ignoreDomains.filter(d=>hostname.toLowerCase().indexOf(d) > -1).length > 0){
                    continue
                }
                domains[hostname] = domains[hostname] ?? {snippet: d.snippet, url: url.origin, hostname: hostname}
                domains[hostname].count = (domains[hostname].count || 0) + 1
            }
        }
        console.log(domains)
        let candidates = Object.keys(domains).filter(d=>domains[d].count > 1).sort((a,b)=>domains[b].count - domains[a].count)
        return candidates

    }
}
async function extractMainURLFromWikipedia( url ){
        const urls = await extractURLsFromPage( url )
        for(const d of urls){
            if(d.text.match(/official website/i)){
                return d.url
            }
        }
}
export async function findCompanyURLByKnowledgeGraph( name, context ){
    const result = await googleKnowledgeForQuery(`\"${name}\"`, {timeFrame: ""})
    if( result ){
        if( result.type?.match(/company/i) || result.type?.match(/manufacturer/i) || result.source?.name === "Summarized from the website"){
            if( result.website?.match(/wikipedia/i) ){
                console.log(`Got wiki -examining`)
                return await extractMainURLFromWikipedia( result.website )
            }
            return result.website
        }
        return undefined
    }
}
export async function queryByAxis( parent, primitive, options = {}){

    const segments = await checkAndGenerateSegments( parent, primitive, options)
    const config = await getConfig( primitive )

    const aggregateReferenceId = 38
    
    const currentAggregators = (await primitiveChildren( primitive )).filter(d=>d.referenceId === aggregateReferenceId)
    const aggregatorCategory = await Category.findOne({id: aggregateReferenceId})
    if( !aggregatorCategory){
        throw `Couldnt find aggregator ${config.aggregate}`
    }
    
    
    console.log(config)
    console.log(`Got ${segments?.length} target segments and ${currentAggregators?.length} aggregators`)
    
    
    for( const segment of segments){
        console.log(`Doing query for segment ${segment.plainId}`)
        await doPrimitiveAction( primitive, "custom_query", {scope: segment.id, addToScope: true})
    }
}
export async function resourceLookupQuery( parentForScope, primitive){
    const scopeIds = primitive.primitives.params?.scope ?? parentForScope.primitives.params?.scope 
    if( !scopeIds || scopeIds.length === 0){
        console.log(`No scopes`)
    }
    const scopes = await fetchPrimitives(scopeIds)
    const constrainedReferenceId = primitive.referenceParameters?.constrainedReferenceId ?? parentForScope.referenceParameters?.constrainedReferenceId
    let constrained = []
    const cache = {}
    for(const d of scopes){
        const items = await getDataForImport( d, cache)
        const descendant = await primitiveDescendents(items, "result")
        constrained.push( descendant )
    }
    constrained = uniquePrimitives( constrained.flat() )
    if( constrainedReferenceId ){
        console.log(`doing ref constrain - had ${constrained.length}`)
        constrained = constrained.filter(d=>d.referenceId === constrainedReferenceId)
    }
    console.log(`Constrained to ${constrained.length}`)
    const ids = constrained.map(d=>d.id)
    const threshold_min = primitive.referenceParameters?.thresholdMin ?? 0.9
    const searchTerms = primitive.referenceParameters?.candidateCount ?? 1000
    const scanRatio = primitive.referenceParameters?.scanRatio ?? 0.15
    const prompts = primitive.referenceParameters?.query?.split(",")
    

    const serachScope = [
        {workspaceId: primitive.workspaceId},
        {foreignId: {$in: ids}}
    ]
    let fragments =  await fetchFragmentsForTerm(prompts, {serachScope,searchTerms, scanRatio, threshold_min}) 
    console.log(`have ${Object.keys(fragments).length} fragments`)
    const resultIds = fragments.map(d=>d.id).filter((d,i,a)=>a.indexOf(d)===i)
    await addRelationshipToMultiple(primitive.id, resultIds, "ref", primitive.workspaceId)
    
}
export async function replicateFlow(start, target, options = {}){
    if( typeof(target) === "string"){
        target = await fetchPrimitive( target )
    }
    const steps = await primitiveDescendents(start, ["view", "query"], {through: true, fullDocument:true, filterAtStep: true})
    const sourceBoardPrimitive = (await primitiveParentsOfType( start, "board"))?.[0]
    const targetBoardPrimitive = (await primitiveParentsOfType( target, "board"))?.[0]

    console.log(`Got ${steps.length} to replicate from ${start.plainId} / ${start.id} on board ${sourceBoardPrimitive.plainId} / ${sourceBoardPrimitive.id}`)
    if( !target){
        console.log(`Dont have target`)
        return
    }
    if( !sourceBoardPrimitive || !targetBoardPrimitive ){
        console.log(`Dont have board primitives ${sourceBoardPrimitive ? "" : "source"} ${targetBoardPrimitive ? "" : "target"}`)
        return
    }
    console.log(`Replicate to ${target.plainId} / ${target.id} on board ${targetBoardPrimitive.plainId} / ${targetBoardPrimitive.id}`)

    console.log(steps.map(d=>d.plainId ).join(", "))

    const flow = {}

    function addNodeToFlow( node, parentId ){
        if( flow[node.id]){
            throw `${node.id} already in flow`
        }
        const {importConfig, ...paramsToClone} = node.referenceParameters
        const pp = new Proxy(node.primitives ?? {}, parser)

        const childPrimitives = pp.origin.uniqueAllIds.map(d=>steps.find(d2=>d2.id === d)).filter(d=>d)
        
        childPrimitives.forEach(d=>{
            addNodeToFlow(d, node.id)
        })
        if( childPrimitives.length >0){
            debugger
        }

        flow[node.id] = {
            sourceId: node.id,
            sourcePlainId: node.plainId,
            children: childPrimitives.map(d=>flow[d.id]),
            linkParentAsImport: pp.imports.allIds.includes(parentId),
            workspaceId: node.workspaceId,            
            data:{
                title:node.title,
                type: node.type,
                referenceId: node.referenceId,
                referenceParameters: paramsToClone,
            }
        }
    }

    const initalNodesToAdd = steps.filter(d=>Object.keys(d.parentPrimitives).includes(start.id))

    for( const d of initalNodesToAdd){
        addNodeToFlow( d, start.id )
    }

    function logNode(node, i = 0){
        const {children, ...info} = node
        const indent = "   ".repeat(i)
        console.log("----".repeat(i))
        for(const d of Object.keys(info)){
            console.log(`${indent}${d}: ${d === "data" ? JSON.stringify(info[d]) : info[d]}`)
        }
        for(const d of node.children){
            console.log(`${indent}${d.sourcePlainId} / ${d.sourceId} - ${d.data.type} ${d.data.title}}`)
            logNode(d, i + 1)
        }
    }
    async function replicateNodeToTarget( node, targetId){
        const newData = {
            parent: targetId,
            workspaceId: node.workspaceId,
            data:node.data
        }
        const replicant = await createPrimitive(newData)
        if( replicant ){
            console.log(`Will add `, newData, `to ${targetId}`)
            await addRelationship( replicant.id, targetId, "imports")
            await addRelationship( targetBoardPrimitive.id, replicant.id, "ref")
            node.replicatedTo = replicant.id
            
            for(const d of node.children){
                await replicateNodeToTarget( d, replicant.id)
            }
        }
    }

    for(const d of initalNodesToAdd){
        await replicateNodeToTarget(flow[d.id], target.id)
    }
    const mappings = Object.values(flow).reduce((a,c)=>{a[c.sourceId] = c.replicatedTo; return a}, {})
    console.log(mappings)
    const locationMapping = Object.keys(sourceBoardPrimitive.frames).reduce((a,c)=>{a[mappings[c]] = sourceBoardPrimitive.frames[c]; return a}, {})
    console.log(locationMapping)

    await dispatchControlUpdate(targetBoardPrimitive.id, "frames", locationMapping)
}

export async function validateResponse(task, response, nodeStruct, inputs, config, outputPrompt, pass = 0, feedback = []){
    const maxTries = 5
    console.log(`*** DOING REVIEW ${pass + 1} of ${maxTries}` )

    const flatText = flattenStructuredResponse( response, nodeStruct)
    console.log(flatText)

    let reviewTask = `I previously gave an AI the above data alongside a task - i need you to carefully review the response as follows.

                        HERE IS THE RESPONSE OUTPUT:
                        ${flatText}
                        ----- END OF RESPONSE OUTPUT

                        You are tasked with reviewing a response output against provided data fragments. For each statement or claim in the response output, follow these steps:

                        1. **Marking Check**: Identify if the statement or claim is marked with a ^ character:
                        - If marked, verify the statement against your general knowledge for errors. Do not flag it as incorrect unless it disagrees with known facts.
                        - If not marked, proceed to the next steps.

                        2. **Data Verification**: Carefully review each unmarked statement:
                        - Identify which fragment(s) support the statement directly, through implication, or inference.
                        - Check each data point and entity name for accuracy against the fragments.

                        3. **Comprehensive Review**:
                        - Cross-reference each statement with all fragments to ensure it is supported by combining multiple fragments or through valid reasoning.
                        - Specifically verify numerical values for any discrepancies, regardless of magnitude.
                        4. **Qualitative Assessment Check**:,
                            - Identify and flag qualitative assessments, focusing on subjective language or claims.
                            - Verify if qualitative statements are supported by data trends or broader context 
                            - Assess whether qualitative claims align with the overall trends and context provided by the data - or if they have been  significantly exaggerated / down-played.
                            - When reviewing quotes, do not fact the content of the quote - just ensure the quote was in the original data
                        5. **Error Identification**:
                        - Highlight statements that are completely lacking provenance, contain factual inaccuracies, or instances where qualitative statements are wildly off.
                        - Ensure your findings are genuine errors, not omissions, abbreviations, or abridged details.
                        - Do not highlight factual errors in quotes, just highlight if the quote was not present in the original data 
                        Do this for all statements or claims in the response output i provided.  Filter out all of the statements or claims which do not contain errors. Your response should be an empty array if no statement contain an error. `.replaceAll(/[^\S\r\n]+/g," ")


    let reviewOutput = `Provide your in a JSON structure with an array called "issues" with an entry for each statement which is incorrect or not in the data.  Use this format:
    {
    claim: the statement or claim,
    ids: ids of the fragment(s) which substantiate the claim
    not_in_data: if the statement or claim is not support by the data,
    marked: if the statement of claim has been marked with a ^ character
    incorrect: if the statement or claim is factually incorrect,
    verify: if the statement or claim should be verified,
    issue: a 15 word summary of the issue identified,
    fix: a 20 word instruction to the AI on how to fix the issue
    }`.replaceAll(/[^\S\r\n]+/g," ")

    let out = response

    const reviewResult = await summarizeMultiple( inputs,{
        ...config, 
        prompt: reviewTask,
        output: reviewOutput,
        types: "fragments",
        focus: config.focus, 
        markPass: true,
        batch: inputs.length > 1000 ? 100 : undefined,
        temperature: 0.6,
        markdown: config.markdown, 
        heading: config.heading,
        wholeResponse: true,
        scored: config.scored,
        debug: true, 
        debug_content:true
    })
    
    const errors = reviewResult?.summary?.issues
    if(errors?.length > 0){
        let validErrors = errors.filter(d=>(!d.marked && (d.incorrect || d.not_in_data)) || (d.marked && !d.not_in_data && d.incorrect))
        console.log(`Review gave ${validErrors.length} (was ${errors.length})`)
        
        if( validErrors.length > 0){
            let correctionTask = "I previously gave an AI the above data alongside a task - i have reviewed the output and noted a number of errors that need correcting."
            correctionTask += `Here is the original task: \n${task}\n\n----\n\nAnd here is the output i got: ${flatText}\n\nAnd here are the errors:\n${validErrors.map((d,i)=>`${i+1}. ${d.fix}`).join("\n")}\n\nRevise the output by repeating the original task and ensuring all of the errors indentified have been corrected - make the smallest changes possible and leave other text alone - review your response to ensure no new errors are introduced.`
            
            const results = await summarizeMultiple( inputs,{
                ...config, 
                prompt: correctionTask,
                output: outputPrompt.replace(/structure/,`revisions": "an array conatining a string with a 20 word summary of your revisions for each error provided", "structure`),
                types: "fragments",
                focus: config.focus, 
                markPass: true,
                batch: inputs.length > 1000 ? 100 : undefined,
                //allow_infer: true,
                markdown: config.markdown, 
                heading: config.heading,
                wholeResponse: true,
                scored: config.scored,
                //debug: true, 
                //debug_content:true
            })
            if(results?.summary?.structure){
                console.log(`Revisions:`)
                console.log(results.summary.revisions)
                feedback.push(results.summary.revisions)
                pass++
                if( pass < 4){
                    console.log(`Checking pass (${pass})`)
                    const thisCheck = await validateResponse(task, results?.summary?.structure, nodeStruct, inputs, config, outputPrompt, pass + 1, feedback)
                    out = thisCheck.response
                }
            }
        }
    }
    
    return {
        passes: feedback.length,
        feedback,
        response: out
    }
}
export async function oneShotQuery( primitive, primitiveConfig, options = {}){
    function progressCallback(message){
        if( options.notify ){
            options.notify( message?.text ?? message )
        }
        if( primitive ){
            const field ="processing.rebuild_summary.progress"
            dispatchControlUpdate(primitive.id, field, message , {track: primitive.id})
        }
    }

    progressCallback( "Looking up sources")

    const queryData = await getRevisedQueryWithLocalMods( primitive, primitiveConfig, options)
    const parentForScope = (await findParentPrimitivesOfType(primitive, ["working", "view", "segment", "query"]))?.[0] ?? primitive
    console.log(queryData)

    const importIds = parentForScope.primitives?.imports


    const fragments = await getFragmentsForQuery(
                                primitive, 
                                queryData.task, {
                                    fromPrimitive: true
                                }, {
                                    lookupCount: primitiveConfig.lookupCount,
                                    searchTerms: primitiveConfig.candidateCount,
                                    scanRatio: primitiveConfig.scanRatio
                                })
    if( fragments ){

        progressCallback( `Preparing ${fragments.length} data fragments`)

        const result = await buildStructuredSummary( primitive, queryData, fragments, fragments.map(d=>d.text), primitiveConfig, true, progressCallback)
        console.log(result)
        return result
    }
}


export async function substitutePlaceholders( prompt, primitive, segmentName, mergedInputs){
    if(prompt.indexOf("{") == -1){
        return prompt
    }        
    if( !mergedInputs){
        let parentInputs = {}
        const configParentId = Object.keys(primitive.parentPrimitives ?? {}).filter(d=>primitive.parentPrimitives[d].includes("primitives.config"))?.[0]
        if( configParentId ){
            const configParentForInputs = await fetchPrimitive( configParentId )
            parentInputs = await getPrimitiveInputs( configParentForInputs )
        }
        
        const primitiveInputs = await getPrimitiveInputs( primitive )
        mergedInputs = {
            ...parentInputs,
            ...primitiveInputs
        }
    }

    if( Object.keys(mergedInputs ?? {}).length > 0 ){
        for(const inp of Object.keys(mergedInputs)){
            if( segmentName !== undefined && mergedInputs[inp].dataBySegment){
                if( mergedInputs[inp].dataBySegment[segmentName]){
                    console.log(`---- WILL USE SEGMENT ${segmentName} portion of input ${inp}`)
                    prompt = prompt.replaceAll(`{${inp}}`, mergedInputs[inp].dataBySegment[segmentName])
                }
            }else if( mergedInputs[inp].data){
                prompt = prompt.replaceAll(`{${inp}}`, mergedInputs[inp].data)
            }
        }
    }
    return prompt
}

export async function getRevisedQueryWithLocalMods(primitive, primitiveConfig, options = {}){
    const doUpdate = !options.overridePrompt
    let revised

    let prompt = options.overridePrompt ?? primitiveConfig.prompt ?? primitiveConfig.query

    let segmentName
    if( prompt.includes("{focus}") || prompt.includes("{segment}")){
        const segmentSource = primitive.primitives?.imports?.[0]
        if( segmentSource ){
            console.log(`getting ${segmentSource}`)
            const segment = primitive.type === "segment" ? primitive : (await fetchPrimitive( segmentSource ))
            if( segment ){
                segmentName = (await getFilterName(segment)) ?? segment.title
            }
        }
    }
    if(options.overridePrompt ){
        console.log(`---> Overriding prompt`)
        revised = await reviseUserRequest(options.overridePrompt)
    }else{
        if( !primitiveConfig ){
            primitiveConfig = await getConfig(primitive)
        }
        if( !prompt ){
            logger.info(`No prompt to process for ${primitive.id} / ${primitive.plainId}`)
        }
        revised = primitiveConfig.revised_query?.structure


        prompt = await substitutePlaceholders(prompt, primitive, segmentName)

        if( !revised || primitiveConfig.revised_query.cache !== prompt){
            revised = await reviseUserRequest(prompt, primitiveConfig)
            if( !revised ){
                logger.warn(`Could not create revised query`)
                return
            }
            if( doUpdate ){
                const configParent = await getConfigParentForTerm(primitive, "prompt")
                if( configParent ){
                    logger.info(`Revised query built for top level query - storing`)
                    await dispatchControlUpdate( primitive.id, "referenceParameters.revised_query", {structure: revised, cache: prompt})
                }
            }
        }
    }

    if( segmentName ){
        revised.task = revised.task.replaceAll(/\{focus\}/gi, segmentName);
        revised.task = revised.task.replaceAll(/\{segment\}/gi, segmentName);
        
        revised.output = revised.output.replaceAll(/\{focus\}/gi, segmentName);
        revised.output = revised.output.replaceAll(/\{segment\}/gi, segmentName);
        logger.info(`Applied local mod {segment} -> ${segmentName}`)
    }

    
    return revised
}

export async function getFragmentsForQuery( primitive, query,  {sourceIds = [], fromPrimitive, types, referenceIds} = {}, {lookupCount = 10, thresholdSeek = 0.005, thresholdMin = 0.85,searchTerms = 1000, scanRatio = 0.15} = {}){
    const _prompts = await processPromptOnText( query,{
        workspaceId: primitive.workspaceId,
        functionName: "fragment-fetch-for-query",
        opener: `You are an agent helping a user answer questions about the data that have stored in a database of many thousands of text fragments. You must answer questions or complete tasks using information in the database only.  Fragments have been encoded with embeddings and can be retrieved with appropriate keywords or phrases.`,
        prompt: `Build a list of ${lookupCount} keywords and phrases that will retrieve information from the database which can answer this task or question.`,
        output: `Return the result in a json object called "result" with a field called 'prompts' containing the keyword and phrases list as an array`,
        engine: "o4-mini",
        debug: true,
        debug_content: true,
        field: "result"
    })
    if( !_prompts?.success ){
        throw "Prompt generation failed"   
    }
    const prompts = _prompts.output?.[0]?.prompts

    const serachScope = [{workspaceId: primitive.workspaceId}]

    if( sourceIds?.length > 0 || fromPrimitive){
        let inScopeIds = []
        if( fromPrimitive ){
            const [items, _] = await getDataForProcessing( primitive )
            if( items?.length ){
                inScopeIds = items.map(d=>d.id)
            }
        }else{
            console.log(`Restricting to items from ${sourceIds.length} sources`)
            const sources = await fetchPrimitives( sourceIds)
            let inScopeSources = sources
            let baseScopes = inScopeSources.filter(d=>d.type === "result" || d.type === "summary")
            const searchScopes = inScopeSources.filter(d=>d.type === "search")
            const otherScopes = inScopeSources.filter(d=>d.type === "query" || d.type === "view" || d.type === "working" || d.type === "segment")

            if( types?.length > 0 ){
                baseScopes = baseScopes.filter(d=>types.includes(d.type))
            }
            if(referenceIds?.length > 0){
                baseScopes = baseScopes.filter(d=>referenceIds.includes(d.referenceId))
            }
            
            if( baseScopes.length > 0){
                inScopeIds.push(...baseScopes.flatMap(d=>d.id))
            }
            if( searchScopes.length > 0){
                console.log(`-- Got search sources`)
                inScopeIds.push(...(await primitiveDescendents( sources, types, {referenceIds} )).flatMap(d=>d.id))
            }
            for(const scope of otherScopes){
                console.log(`-- Got other sources`)
                const items = await getDataForImport(scope, undefined, true)
                console.log(`Got ${items.length} from ${scope.plainId}`)
                inScopeIds.push(...items.map(d=>d.id))
            }
        }
        if( inScopeIds.length === 0 ){
            logger.info("No suitable data to use")
            return []
        }
        serachScope.push(  {foreignId: {$in: inScopeIds}})
        logger.info(`>>>>> Restricting search scope`)
    }

    let fragments = await fetchFragmentsForTerm(prompts, {searchTerms, scanRatio, thresholdSeek, thresholdMin, serachScope})
    if( fragments.length === 0 ){
        return {result: "No relevant data found"}
    }
    let fragmentList = Object.values(fragments).filter((d,i,a)=>a.findIndex(d2=>d2.id === d.id && d2.part === d.part)===i)
    fragmentList = fragmentList.sort((a,b)=>{
        if( a.id === b.id ){
            return a.part - b.part
        }
        return a.id.localeCompare(b.id)
    })
    return fragmentList
}
export async function summarizeWithQuery( primitive ){
        const primitiveConfig = await getConfig(primitive)
        const [items, toSummarize] = await getDataForProcessing(primitive, {...primitiveConfig}, undefined, {forceImport: true})
        if( items.length > 0){
            //const queryData = await getRevisedQueryWithLocalMods( primitive, primitiveConfig)
            logger.warn(`-------------------\nUse DRY functions here\n----------------------`)
            const evidenceCategory = await Category.findOne({id: items[0].referenceId})
            let config = evidenceCategory?.ai?.summarize?.[ config?.summary_type ?? "summary"] ?? {}
            let segmentName
            if( primitiveConfig.prompt?.trim && primitiveConfig.prompt.trim().length > 0){
                config.prompt = primitiveConfig.prompt
                
                const segmentSource = primitive.primitives?.imports?.[0]
                if( segmentSource ){
                    console.log(`getting ${segmentSource}`)
                    const segment = primitive.type === "segment" ? primitive : (await fetchPrimitive( segmentSource ))
                    if( segment ){
                        segmentName = (await getFilterName(segment)) ?? segment.title
                        config.prompt = config.prompt.replaceAll('{focus}', segmentName)
                        config.prompt = config.prompt.replaceAll('{segment}', segmentName)
                    }
                }
            }
            
            
            let revised
            if( primitiveConfig.revised_query ){
                console.log(`--- Checking revised structure from config`)
                revised = primitiveConfig.revised_query.structure

                if( revised.task.includes("{focus}") || revised.task.includes("{segment}") || revised.output.includes("{focus}") || revised.output.includes("{segment}") ||((primitiveConfig.revised_query.cache !== config.prompt) && (primitiveConfig.revised_query.cache === primitiveConfig.prompt))){
                    console.log(`--- Revised structure has local mods - reapplying`)
                    revised.task = revised.task.replaceAll(/\{focus\}/gi, segmentName);
                    revised.task = revised.task.replaceAll(/\{segment\}/gi, segmentName);
                    
                    revised.output = revised.output.replaceAll(/\{focus\}/gi, segmentName);
                    revised.output = revised.output.replaceAll(/\{segment\}/gi, segmentName);
                }
            }
            if(!revised){
                console.log(`--- Revised structure not present - building`)
                revised = await reviseUserRequest(config.prompt, primitiveConfig)
            }
            

            let parentInputs = {}
            const configParentId = Object.keys(primitive.parentPrimitives ?? {}).filter(d=>primitive.parentPrimitives[d].includes("primitives.config"))?.[0]
            if( configParentId ){
                const configParent = await fetchPrimitive( configParentId )
                parentInputs = await getPrimitiveInputs( configParent )
            }

            const primitiveInputs = await getPrimitiveInputs( primitive )
            const mergedInputs = {
                ...parentInputs,
                ...primitiveInputs
            }

            if( mergedInputs ){
                for(const inp of Object.keys(mergedInputs)){
                    if( segmentName && mergedInputs[inp].dataBySegment){
                        if( mergedInputs[inp].dataBySegment[segmentName]){
                            console.log(`---- WILL USE SEGMENT ${segmentName} portion of input ${inp}`)
                            revised.task = revised.task.replaceAll(`{${inp}}`, mergedInputs[inp].dataBySegment[segmentName])
                        }
                    }else if( mergedInputs[inp].data){
                        revised.task = revised.task.replaceAll(`{${inp}}`, mergedInputs[inp].data)
                    }
                }
            }
            return await buildStructuredSummary( primitive, revised, items, toSummarize, primitiveConfig)
        }
}

export async function buildStructuredSummary( primitive, revised, items, toSummarize, primitiveConfig, refetchFragments = false, progressCallback ){
    try{
            let toProcess = toSummarize.map(d=>Array.isArray(d) ? d.join(", ") : d)
            
            const results = await summarizeMultiple( toProcess,{
                workspaceId: primitive.workspaceId,
                usageId: primitive.id,
                functionName: "queryWithStructure",
                prompt: revised.task,
                output: revised.output,
                types: "fragments",
                focus: primitiveConfig.focus, 
                markPass: true,
                batch: toProcess.length > 1000 ? 50 : undefined,
                temperature: primitiveConfig.temperature,
                //allow_infer: true,
                markdown: primitiveConfig.markdown, 
                heading: primitiveConfig.heading,
                wholeResponse: true,
                scored: primitiveConfig.scored,
                engine: primitiveConfig.engine ?? "gpt-4o",
                progressCallback: (status)=>{
                    const percentage = status.completed / status.total
                    const message = {text: `Analyzing ${(percentage * 100).toFixed(0)}%`, percentage}
                    progressCallback( message )
                },
                merge: false,
                debug: true, 
                debug_content:true
            })


            if( results.shouldMerge){
                if( primitiveConfig.split  ){
                    console.log(`Split into multiple responses`)
                }else{
                    let flatten = results.summary.flatMap(d=>d.structure)
                    console.log(`Need to merge multiple responses to structured output -  have ${flatten.length}`)
                    progressCallback( "Finalizing..." )
                    
                    const activeIds = extractFlatNodes(flatten).flatMap(entry=>{
                        const mapped = typeof(entry.ids) === "string" ? entry.ids.replaceAll("[","").replaceAll("]","").split(",").map(d=>parseInt(d)).filter(d=>!isNaN(d)) : entry.ids
                        console.log(mapped)
                        return mapped
                    }).filter((d,i,a)=>d && a.indexOf(d)===i)
                    console.log(`-- Got ${activeIds.length} active fragments, collecting and regenerating`)

                    if( refetchFragments ){
                        const activeFragments = activeIds.map(d=>items[d])
                        items = await expandFragmentsForContext( activeFragments )
                        toSummarize = items.map(d=>d.text);
                        toProcess = toSummarize
                    }else{

                        
                        let combined = activeIds.map(idx => ({
                            item:      items[idx],
                            summary:   toSummarize[idx]
                        }));
                        
                        combined.sort((a, b) => {
                            if (a.item.id === b.item.id) {
                                return a.item.part - b.item.part;
                            }
                            return a.item.id.localeCompare(b.item.id);
                        });
                        
                        items       = combined.map(pair => pair.item);
                        toSummarize = combined.map(pair => pair.summary);
                        toProcess = toSummarize.map(d=>Array.isArray(d) ? d.join(", ") : d)
                    }
                        
                    console.log(`- rebuilt to ${items.length} / ${toSummarize.length} / ${toProcess.length}`)

                    const reworked = await summarizeMultiple( toProcess,{
                        workspaceId: primitive.workspaceId,
                        usageId: primitive.id,
                        functionName: "queryWithStructureCombine",
                        prompt: revised.task,
                        output: revised.output,
                        types: "fragments",
                        focus: primitiveConfig.focus, 
                        batch: false,
                        temperature: primitiveConfig.temperature,
                        //allow_infer: true,
                        markdown: primitiveConfig.markdown, 
                        heading: primitiveConfig.heading,
                        wholeResponse: true,
                        scored: primitiveConfig.scored,
                        engine: primitiveConfig.engine ?? "gpt-4o",
                        merge: false,
                        debug: true, 
                        debug_content:true
                    })
                    if( reworked ){
                        console.log(`Got revised back`)
                        if( reworked?.summary?.structure){
                            results.summary.structure = reworked.summary.structure
                        }
                    }
                    
                    

                    /*
                    flatten = flatten.filter(d=>{
                        const idsForSection = extractFlatNodes([d]).flatMap(d=>d.ids)
                        return idsForSection.length > 0
                    })
                    console.log(`-- Filtered to ${flatten.length} with actual results (based on ids)`)
                    if( flatten.length === 0){
                        return ""
                    }
                    const idsList = {}
                    let idGroup = 1
                    modiftyEntries( flatten, "ids", entry=>{
                        const ids = typeof(entry.ids) === "string" ? entry.ids.replaceAll("[","").replaceAll("]","").split(",").map(d=>parseInt(d)) : entry.ids
                        const idKey = `g${idGroup}`
                        idsList[idKey] = ids
                        idGroup++
                        return idKey
                    } )


                    const outputFormat = revised.output.replaceAll("List the numbers associated with all of the fragments of text used for this section", "List each and every item in the 'ids' field of each of the source summaries which you have rationalized into this new item - you MUST include ALL items from the relevant source summaries")

                    const consolidated = await processInChunk( flatten, 
                        [
                            {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                            {"role": "user", "content": `Here is a list of summaries:`}],
                            [
                                {"role": "user", "content":  `Rationalize these summaries into a single response to address this original prompt. Be careful to note which summaries you are merging together. Be incredibly careful to maintain the integrity and validaity of what you are writing - dont conflate or confuse items. You MUST ONLY use the data I provided to compelte this task - DO NOT use your own knowledge. If asked to include quotes use a selection of the quotes stated in the interim results.  ${revised.task}`
                            },
                            {"role": "user", "content": outputFormat},
                        ],
                        {
                            engine: primitiveConfig.engine ?? "gpt-4o",
                            workspaceId: primitive.workspaceId,
                            usageId: primitive.id,
                            functionName: "queryWithStructure_merge",
                            wholeResponse: true,
                            field: undefined,
                            debug: true,
                            debug_content: true
                        })
                    
                    if( Object.hasOwn(consolidated, "success")){
                        logger.error(`Error in merging responses for summarizeWithQuery`, consolidated)
                        throw "Error in merging responses for summarizeWithQuery"
                    }
                    if( consolidated.length > 1){
                        logger.error(`Merged responses has multiple passes - unexpected`)
                    }
                    const refined = consolidated[0]?.structure
                    if( refined ){
                        modiftyEntries( refined, "ids", entry=>{
                            const ids = typeof(entry.ids) === "string" ? entry.ids.split(",").map(d=>d.trim()) : entry.ids
                            const remapped = ids.flatMap(d=>{
                                const mapped = idsList[d]
                                if( !mapped ){
                                    logger.error(`Couldnt find ${d} in mapped Ids`)
                                    return undefined
                                }
                                return mapped
                            }).filter((d,i,a)=>d !== undefined && a.indexOf(d)===i)
                            return remapped
                        })
                        results.summary.structure = refined                
                    }
                        */
                }
            }


            if( results?.summary?.structure ){
                let nodeStruct = revised.structure
                let nodeResult = results?.summary?.structure

                if( primitiveConfig.verify ){
                    const validated = await validateResponse( revised.task, results?.summary?.structure, nodeStruct, toProcess, {}, revised.output)
                    
                    if( validated ){
                        nodeResult = validated.response
                    }
                }


                let asList, outputList = []
                if( primitiveConfig.split ){
                    if( nodeResult[0]?.content){
                        const sectionCandidates = nodeResult.reduce((a,d)=>{
                            a[d.heading] = (a[d.heading] ?? 0) + 1
                            return a
                        },{})
                        if(Object.keys(sectionCandidates).length > 1 ){
                            logger.info(`Results look to be fragmented - ${Object.keys(sectionCandidates).join(", ")} - joining`)
                            let idx = 0, current, track = new Set()
                            asList = []
                            for(const entry of nodeResult){
                                if( track.has( entry.heading) ){
                                    asList.push(current)
                                    current = undefined
                                    track = new Set()
                                }
                                if( !current ){
                                    idx++
                                    current = {nodeResult: [], title: `Item ${idx}`}
                                    console.log(`Creating section ${idx}`)
                                }
                                current.nodeResult.push( entry )
                                console.log(`-- Adding section ${entry.heading}`)
                                track.add( entry.heading)
                            }
                            if( current.nodeResult.length > 0){
                                    asList.push(current)
                            }

                        }else{
                            asList = nodeResult.map(d=>({nodeResult: [d]}))
                        }
                    }else{
                        if( nodeResult[0].sections ){
                            asList = nodeResult.map((d,i)=>({nodeResult: d.sections}))
                        }else if( nodeResult[0].structure ){
                            asList = nodeResult.map((d,i)=>({nodeResult: d.structure}))
                        }else if( nodeResult[0].group && nodeResult[0].details){
                            asList = nodeResult.map((d,i)=>({nodeResult: d.details}))
                        }else if( nodeResult[0].subsections){
                            asList = nodeResult.map((d,i)=>({heading:d.heading ?? `Section ${i}`, nodeResult: d.subsections}))
                        }else{
                            asList = nodeResult.map((d,i)=>({nodeResult: d}))
                        }
                    }                   
                    if( !asList || asList.length === 0){
                        console.log(`GOT EMPTY AFTER SPLIT`)
                        console.log( nodeResult )
                        console.log( nodeResult[0] )
                    }
                }else{
                    asList = [{nodeResult}]
                }

                for( const {heading, nodeResult} of asList){

                    let out = flattenStructuredResponse( nodeResult, nodeStruct, primitiveConfig.heading !== false)
                    const allIds = inlineMapResponseIdsToInputs( nodeResult, items)
                    
/*                    modiftyEntries( nodeResult, "ids", entry=>{
                        const ids = typeof(entry.ids) === "string" ? entry.ids.split(",").map(d=>parseInt(d)) : entry.ids
                        const remapped = ids.map(d=>{
                            const primitive = items[d]
                            if( primitive){
                                return primitive.id
                            }else{
                                logger.error(`--- Referenced item out of bounds:`)
                                logger.error(entry.ids)
                            }
                        }).filter(d=>d)
                        return remapped
                    } )
                    const idsForSections = extractFlatNodes(nodeResult).map(d=>d.ids)
                    const allIds = idsForSections.flat().filter((d,i,a)=>d && a.indexOf(d) === i)*/
                    
                    
                    outputList.push({plain:out, heading: heading, structured: nodeResult, sourceIds: allIds})
                }
                return outputList
            }
            
    }catch(error){
        logger.error(error)
        throw error
    }
    return ""
}
export function inlineMapResponseIdsToInputs( nodeResult, mapList){
    modiftyEntries( nodeResult, "ids", entry=>{
        let ids = typeof(entry.ids) === "string" ? entry.ids.replaceAll("[","").replaceAll("]","").split(",").map(d=>parseInt(d)).filter(d=>!isNaN(d)) : entry.ids
        const remapped = ids.map(d=>{
            const source = mapList[d]
            if( source){
                return source.id
            }else{
                logger.warn(`Cant find referenced fragment ${d} in `, ids, entry.ids)
            }
        }).filter((d,i,a)=>d && a.indexOf(d) === i )
        return remapped
    } )
    const idsForSections = extractFlatNodes(nodeResult).map(d=>d.ids)
    const allIds = idsForSections.flat().filter((d,i,a)=>d && a.indexOf(d) === i)
    return allIds
}
function removeOmittedItemsFromStructure(nodeResult){
    let out = []
    for(const d of nodeResult){
        if( !d.omit){
            const {subsections, ...data} = d
            if( subsections){
                data.subsections = removeOmittedItemsFromStructure(subsections)
            }
            out.push( data )
        }else{
            console.log(`Skipping ${d.heading}`)
        }
    }
    return out
}
export function extractFlatNodes(nodeResult, types = ["markdown formatted string"], out){
    out ||= []
    for(const d of nodeResult){
        //if( types.includes(d.type) ){
        if( d.content || d.ids ){
            out.push({
                content: d.content,
                ids: d.ids,
                node: d
            })
        }
        if( d.subsections){
            extractFlatNodes(d.subsections, types, out)
        }
    }
    return out
}