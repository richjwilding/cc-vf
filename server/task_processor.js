import { fetchFragmentsForTerm } from "./DocumentSearch";
import PrimitiveConfig from "./PrimitiveConfig"
import PrimitiveParser from "./PrimitivesParser";
import { addRelationship, addRelationshipToMultiple, createPrimitive, dispatchControlUpdate, doPrimitiveAction, executeConcurrently, fetchPrimitive, fetchPrimitives, getConfig, getDataForImport, getDataForProcessing, multiPrimitiveAtOrginLevel, primitiveChildren, primitiveDescendents, primitiveListOrigin, primitiveOrigin, primitiveParents, primitiveParentsOfType, primitiveTask, removePrimitiveById, uniquePrimitives } from "./SharedFunctions"
import { lookupCompanyByName } from "./crunchbase_helper";
import { extractURLsFromPage, fetchLinksFromWebQuery, getMetaDescriptionFromURL, googleKnowledgeForQuery, queryGoogleSERP } from "./google_helper";
import Category from "./model/Category"
import Primitive from "./model/Primitive";
import { analyzeListAgainstTopics, processPromptOnText, summarizeMultiple } from "./openai_helper";
import { reviseUserRequest } from "./prompt_helper";

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

    function translateItem(items){
        return items.map(d=>{
            if(config.field === "title"){
                return d.title
            }else{
                return d.referenceParameters[param]
            }
        })
    }
    const {results:otherItems} = await executeConcurrently( others, async (segment)=>{
        const items = await getItemsForQuery( segment)
        return translateItem(items).filter(d=>d)
    })

    const activePrimitives = await getItemsForQuery( thisOne[0] )
    const activeText = translateItem(activePrimitives).filter(d=>d)[0]
    const otherText = otherItems.map((d,i)=>`Item ${i+1}\n=============\n${d}`)

    const fullText = `The data is a set of summaries for different segements - i need your help to compare and contrast these segments with one i am particularly interested in. Here are the peer segments for context:\n ${otherText}\n\nAnd here is the segement i am interested in:\n ${activeText}\n---END OF SEGMENT\n\n`

    let result
    let prompt = (config.summary_type === "custom" ? config.prompt : undefined) ?? "Compare all of the segments and then highlight what is unique about the one i am interested in"
    const streamline = await summarizeMultiple([fullText],{
        prompt,
        output: "Provide the output as a json object with a field called 'results' containing the new summary as a string with suitable linebreaks to deliniate sections",
        engine: "gpt4p",
        markdown: config.markdown, 
        temperature: config.temperature ?? primitive.referenceParameters?.temperature,
        heading: config.heading,
        keepLineBreaks: true,
        debug: true,
        debug_content:true
    })
    if( streamline.success && streamline.summary){
        return streamline.summary
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
    }
}
export async function loopkupOrganization( value, referenceCategory, workspaceId, options = {} ){
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
    let item
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


export async function summarizeWithQuery( primitive ){
    try{

        const primitiveConfig = await getConfig(primitive)
        const [items, toSummarize] = await getDataForProcessing(primitive, {...primitiveConfig})
        if( items.length > 0){
            
            const evidenceCategory = await Category.findOne({id: items[0].referenceId})
            let config = evidenceCategory?.ai?.summarize?.[ config.summary_type ?? "summary"] ?? {}
            if( config.prompt?.trim && config.prompt.trim().length > 0){
                config.prompt = config.prompt
                
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
            
            const revised = reviseUserRequest(config.prompt)
            
            const results = await summarizeMultiple( toProcess,{
                ...config, 
                prompt: revised.task,
                output: revised.output,
                types: "fragments",
                focus: config.focus, 
                markPass: true,
                batch: toProcess.length > 1000 ? 100 : undefined,
                temperature: config.temperature ?? primitive.referenceParameters?.temperature,
                allow_infer: true,
                markdown: config.markdown, 
                heading: config.heading,
                wholeResponse: true,
                scored: config.scored,
                debug: true, 
                debug_content:true
            })


            console.log(results?.summary?.structure)
            if( results?.summary?.structure ){



                console.log(`*** DOING REVIEW`)

                let reviewTask = "I previously gave an AI the above data alongside a task - i need you to review the response and validate that it is based on the data provided, this checking taht any company, entity or indivudal names is correctly referenced and that data points / facts havent been conflated. Note that text in the response that is marked with a '^' may have come from the AI and that is fine to leave as it has been noted to the user - only correct this if the AI knowlegde is wrong./\n\n"
                reviewTask += `Here is the original task: \n${revised.task}\n\n----\n\nAnd here is the output i got: ${JSON.stringify(results?.summary?.structure)}\n\n`

                let reviewOutput = "Provide your response in the following format:{revised: a boolean indicating if revisised output has been produced, errors: a boolean indicating if errors were found, references: a boolean indicating if entities were incorrectly referenced, findings:as a simple block of text sumamrising your findings in 100 words or less, revised_output: if revisions are needed - a revised output with corrections redactions - maintaing the structure and formatting of the original and adding a 'revised' field set to true for any sections that have been revised}"


                const reviewResult = await summarizeMultiple( toProcess,{
                    ...config, 
                    prompt: reviewTask,
                    output: reviewOutput,
                    types: "fragments",
                    focus: config.focus, 
                    markPass: true,
                    batch: toProcess.length > 1000 ? 100 : undefined,
                    temperature: config.temperature ?? primitive.referenceParameters?.temperature,
                    allow_infer: true,
                    markdown: config.markdown, 
                    heading: config.heading,
                    wholeResponse: true,
                    scored: config.scored,
                    debug: true, 
                    debug_content:true
                })
                
                let nodeResult = results?.summary?.structure

                if( reviewResult.summary.revised){
                    console.log(`Revised text being used`)
                    console.log(reviewResult.summary.findings)
                    if( reviewResult.summary.revised_output ){
                        nodeResult = reviewResult.summary.revised_output
                    }
                }


                let out = ""
                let nodeStruct = revised.structure

                function walkResults(nodeResult, nodeStruct, headerLevel = 0){
                    for(const d in nodeResult){
                        const nextR = nodeResult?.[d]
                        const nextS = nodeStruct?.[d]
                        if( nextS?.heading){
                            const h_level = Math.max((3 - headerLevel), 1)
                            out += `${"#".repeat(h_level)} ${nextS.heading}\n`
                        }
                        if( nextR?.content ){
                            out += `${nextR.content}\n`
                        }
                        if( nextR?.subsections){
                            walkResults(nextR?.subsections, nextS?.subsections, headerLevel + 1)
                        }
                    }
                }

                walkResults( nodeResult, nodeStruct)
                console.log(out)
                return out
            }
            
        }
    }catch(error){
        console.log(error)
    }
    return ""
}