import { fetchFragmentsForTerm } from "./DocumentSearch";
import PrimitiveConfig, {flattenStructuredResponse} from "./PrimitiveConfig"
import PrimitiveParser from "./PrimitivesParser";
import { addRelationship, addRelationshipToMultiple, createPrimitive, dispatchControlUpdate, doPrimitiveAction, executeConcurrently, fetchPrimitive, fetchPrimitives, getConfig, getDataForImport, getDataForProcessing, getFilterName, multiPrimitiveAtOrginLevel, primitiveChildren, primitiveDescendents, primitiveListOrigin, primitiveOrigin, primitiveParents, primitiveParentsOfType, primitiveTask, removePrimitiveById, uniquePrimitives } from "./SharedFunctions"
import { lookupCompanyByName } from "./crunchbase_helper";
import { decodeBase64ImageToStorage, extractURLsFromPage, fetchLinksFromWebQuery, getMetaDescriptionFromURL, googleKnowledgeForQuery, googleKnowledgeForQueryScaleSERP, queryGoogleSERP } from "./google_helper";
import Category from "./model/Category"
import Primitive from "./model/Primitive";
import { analyzeListAgainstTopics, processPromptOnText, summarizeMultiple } from "./openai_helper";
import { findEntries, removeEntries, reviseUserRequest } from "./prompt_helper";

const parser = PrimitiveParser()

async function getItemsForQuery(primitive){
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

export async function getSegemntDefinitions( primitive, customAxis ){
    let axis = []
    if( customAxis ){
        axis = customAxis
    }else{
        if( primitive.referenceParameters?.explore?.axis ){//primitive.type === "view" ){
            if( primitive.referenceParameters?.explore?.axis?.column){
                const d = primitive.referenceParameters?.explore?.axis?.column
                axis.push( {sourcePrimId: primitive.primitives?.axis?.column?.[0], ...d} )
            }
            if( primitive.referenceParameters?.explore?.axis?.row){
                const d = primitive.referenceParameters?.explore?.axis?.row
                axis.push( {sourcePrimId: primitive.primitives?.axis?.row?.[0], ...d} )
            }
        }
    }
    console.log(`Got ${axis.length} axis`)
    
    
    if( axis.length === 0){
        return [{
            filters: [],
            id: primitive.id
        }]
    }
    for(const d of axis){
        console.log(d)
    }

    let items = await getItemsForQuery(primitive)
    
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

        if( thisAxis.type === "segment_filter"){
            resolvedFilterType = "parent"
            relationship = "auto"
            pivot = 1
            mappedFilter.type = resolvedFilterType
            mappedFilter.pivot = pivot
            mappedFilter.relationship = relationship
            mappedFilter.sourcePrimId = undefined
        }
        delete mappedFilter["filter"]

        filterConfig.push(mappedFilter)
        
        let lookups = await multiPrimitiveAtOrginLevel( items, pivot, relationship)

        let values = lookups.map((item,idx)=>{
            let data
            if( resolvedFilterType === "title"){
                data = item.map(d=>d.title)
            }
            else if( resolvedFilterType === "parameter"){
                data = item.map(d=>d.referenceParameters?.[mappedFilter.parameter ?? mappedFilter.param])
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
            }

            if( data.length === 0){
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
    const combos = getAllCombinations( axisValues )
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
        const itemCount = itemPositions.filter(d=>d.reduce((a,c,i)=>a && c === values[i], true))
        if( itemCount.length === 0){
            return undefined
        }
        console.log(`Got ${itemCount.length} items in segment ${values.join(",")}`)
        return {
                filters: d,
                id: primitive.id
            }
        
    }).filter(d=>d)
    return importConfigList

}

export async function checkAndGenerateSegments( parent, primitive, options = {} ){
    const config = {
        target: "descend"
    }
    
    const out = []
    const currentSegments = await primitiveChildren( parent, "segment")
    const checked = currentSegments.reduce((a,d)=>{a[d.id] = false; return a}, {})
    let customAxis 

    if( primitive.referenceParameters?.axis ){
        customAxis = Object.values(primitive.referenceParameters.axis  ?? {}).filter(d=>d)
    }
    if( primitive.referenceParameters?.segments ){
        const targetSegments = primitive.referenceParameters?.segments
        if( targetSegments && Array.isArray(targetSegments)){
            console.log(`Checking segments at ${parent.id} / ${parent.plainId}`)
            console.log( `Got ${targetSegments.length} segments to create / check - currently have ${currentSegments.length}`)

            for(const d of targetSegments){
                let existing = currentSegments.filter(d2=>d2.title === d)
                if(existing.length > 1 ){
                    console.warn(`Got multiple segments for ${d} = ${existing.map(d=>d.plainId).join(", ")}`)
                    existing = existing[0]
                    checked[ existing.id ] = true
                }else if( existing.length === 1){
                    existing = existing[0]
                    checked[ existing.id ] = true
                }else{
                    existing = undefined
                }
                if( existing ){
                    console.warn(`++ Got segments for ${d} = ${existing.plainId}`)
                }else{
                    existing = await createPrimitive({
                        workspaceId: primitive.workspaceId,
                        parent: parent.id,
                        data:{
                            type: "segment",
                            title: d
                        }
                    })
                    if( !existing ){
                        throw "Couldnt create segment"
                    }
                    await addRelationship(existing.id, parent.id, "imports")
                    console.log(`Created new segment ${existing.id} ${existing.plainId} for ${d}`)
                }
                out.push(existing)

            }


        }else{
            return
        }

    }else{
        let targetSegmentConfig
        if( (primitive.referenceParameters?.by_axis === false) && (!options.by_axis)){
            targetSegmentConfig = [
                {
                    id: parent.id
                }
                
            ]
        }else{
            targetSegmentConfig = await getSegemntDefinitions(parent, customAxis)
        }
        
        console.log(`Checking segments at ${parent.id} / ${parent.plainId}`)
        console.log( `Got ${targetSegmentConfig.length} segments to create / check - currently have ${currentSegments.length}`)
        
        for(const importConfig of targetSegmentConfig){
            let existing = currentSegments.filter(d=>PrimitiveConfig.checkImports( d, importConfig.id, importConfig.filters))
            if(existing.length > 1 ){
                console.warn(`Got multiple segments for ${JSON.stringify(importConfig)} = ${existing.map(d=>d.plainId).join(", ")}`)
                existing = existing[0]
                checked[ existing.id ] = true
            }else if( existing.length === 1){
                existing = existing[0]
                checked[ existing.id ] = true
            }else{
                existing = undefined
            }
            if( existing ){
                console.warn(`++ Got segments for ${JSON.stringify(importConfig)} = ${existing.plainId}`)
            }
            if( !existing ){
                existing = await createPrimitive({
                    workspaceId: primitive.workspaceId,
                    parent: parent.id,
                    data:{
                        type: "segment",
                        title: "New segement",
                        referenceParameters:{
                            target:"items",
                            importConfig:[importConfig]
                        }
                    }
                })
                if( !existing ){
                    throw "Couldnt create segment"
                }
                await addRelationship(existing.id, parent.id, "imports")
                console.log(`Created new segment ${existing.id} ${existing.plainId} for ${JSON.stringify(importConfig)}`)
            }
            out.push(existing)
        }
    }
    if( options.clear){//} || primitive.referenceParameters?.segments ){
        const toClear = Object.keys(checked).filter(d=>!checked[d])
        if( toClear.length > 0){
            console.log(`${toClear.length} of ${currentSegments.length} to be cleared`)
            for(const d of toClear){await removePrimitiveById( d )}
            console.log("Cleared")
        }
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
    
    
    console.log(config)
    console.log(`Got ${segments.length} target segments and ${currentAggregators.length} aggregators`)
    
    for( const segment of segments){
        let existing = currentAggregators.find(d=>Object.keys(d.parentPrimitives).includes(segment.id))
        
        if( existing ){
            if( !options.force ){
                if( existing.referenceParameters?.summary){
                    console.log(`Skipping existing item`)
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
                        target:"items"
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
            await doPrimitiveAction( existing, execOptions.action ?? "rebuild_summary")
        }
        
    }
}
export async function compareItems( parent, primitive, options = {}){
    return await baselineItemProcess( parent, primitive, options, {lookup: {by_axis: true}})
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
        let prompt = (config.summary_type === "custom" ? config.prompt : undefined) ?? "Compare all of the segments and then highlight what is unique about the one i am interested in"
        const streamline = await summarizeMultiple([fullText],{
            prompt,
            output: structured ? "Generate a n new output for the segment im interested in in a json object with a field called 'new_segment'. The field must be in the same structure as the input for this segment - including nested subsections - but with the relevant content fields updated where necessary - add a 'omit' field to any subsections which should be removed from this segment. Ensure you consider and include every entry in the input array - and every nested subsection of this segment."
            : "Provide the output as a json object with a field called 'summary' containing the new summary as a string with suitable linebreaks to deliniate sections",
            engine: "gpt4p",
            markdown: config.markdown, 
            temperature: config.temperature ?? primitive.referenceParameters?.temperature,
            heading: config.heading,
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
                        target:"items"
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
    const [items, toProcess] = await getDataForProcessing(primitive, {field: "param.summary"}, source, {instance: options?.instance} )

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
                        console.log(`Linked to ${lookup.id} / ${lookup.plainId}`)
                    }else{
                        await addRelationship( source.id, lookup.id, "link")
                        console.log(`Linked to ${lookup.id} / ${lookup.plainId}`)
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
export async function findCompanyURLByName( name, context = {}){
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
                        5. **Error Identification**:
                        - Highlight statements that are completely lacking provenance, contain factual inaccuracies, or instances where qualitative statements are wildly off.
                        - Ensure your findings are genuine errors, not omissions, abbreviations, or abridged details.
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

export async function summarizeWithQuery( primitive ){
    try{

        const primitiveConfig = await getConfig(primitive)
        const [items, toSummarize] = await getDataForProcessing(primitive, {...primitiveConfig})
        if( items.length > 0){
            
            const evidenceCategory = await Category.findOne({id: items[0].referenceId})
            let config = evidenceCategory?.ai?.summarize?.[ config.summary_type ?? "summary"] ?? {}
            if( primitiveConfig.prompt?.trim && primitiveConfig.prompt.trim().length > 0){
                config.prompt = primitiveConfig.prompt
                
                const segmentSource = primitive.primitives?.imports?.[0]
                if( segmentSource ){
                    console.log(`getting ${segmentSource}`)
                    const segment = primitive.type === "segment" ? primitive : (await fetchPrimitive( segmentSource ))
                    if( segment ){
                        const name = (await getFilterName(segment)) ?? segment.title
                        config.prompt = config.prompt.replaceAll('{focus}', name)
                        config.prompt = config.prompt.replaceAll('{segment}', name)
                    }
                }
            }
            
            const toProcess = toSummarize.map(d=>Array.isArray(d) ? d.join(", ") : d)
            if( false ){
                const primitive = await fetchPrimitive("673710caa842fdc733a86777")
                const finances = await doPrimitiveAction(primitive, "convert_financials", {})
                if( finances){
                    toProcess.push(`Finance information (values in thousands USD)\n${finances}`)
                }
            }
            
            const revised = await reviseUserRequest(config.prompt)

            await dispatchControlUpdate( primitive.id, "log.ai.structured", revised.structure)
            
            const results = await summarizeMultiple( toProcess,{
                ...config, 
                prompt: revised.task,
                output: revised.output,
                types: "fragments",
                focus: primitiveConfig.focus, 
                markPass: true,
                batch: toProcess.length > 1000 ? 100 : undefined,
                temperature: primitiveConfig.temperature,
                //allow_infer: true,
                markdown: primitiveConfig.markdown, 
                heading: primitiveConfig.heading,
                wholeResponse: true,
                scored: primitiveConfig.scored,
                debug: true, 
                debug_content:true
            })


            console.log(results?.summary?.structure)
            if( results?.summary?.structure ){
                let nodeStruct = revised.structure
                let nodeResult = results?.summary?.structure

                if( primitiveConfig.verify ){
                    const validated = await validateResponse( revised.task, results?.summary?.structure, nodeStruct, toProcess, config, revised.output)
                    
                    if( validated ){
                        nodeResult = validated.response
                        console.log(`Set to post validation`, validated)
                    }
                }


                let out = flattenStructuredResponse( nodeResult, nodeStruct, primitiveConfig.heading !== false)
                console.log(out)
                return {plain:out, structured: nodeResult}
            }
            
        }
    }catch(error){
        console.log(error)
    }
    return ""
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