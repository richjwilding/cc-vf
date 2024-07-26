import PrimitiveConfig from "./PrimitiveConfig"
import PrimitiveParser from "./PrimitivesParser";
import { addRelationship, createPrimitive, doPrimitiveAction, fetchPrimitive, getConfig, getDataForImport, getDataForProcessing, multiPrimitiveAtOrginLevel, primitiveChildren, primitiveOrigin, primitiveParents, removePrimitiveById, uniquePrimitives } from "./SharedFunctions"
import { lookupCompanyByName } from "./crunchbase_helper";
import { extractURLsFromPage, fetchLinksFromWebQuery, googleKnowledgeForQuery, queryGoogleSERP } from "./google_helper";
import Category from "./model/Category"
import Primitive from "./model/Primitive";

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
                if( thisAxis.subtype === "question" || mappedFilter.subtype === "search"){
                    throw "Should filter by type"
                }
                if( thisAxis.type === "category" ){
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
        //const itemCount = Object.values(itemMap).filter(d=>d.reduce((a,c,i)=>a && c === values[i], true))
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

    const targetSegmentConfig = await getSegemntDefinitions(parent, customAxis)
    
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
    if( options.clear ){
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
    const segments = await checkAndGenerateSegments( parent, primitive, options)
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
        
        if( !existing ){
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
            await doPrimitiveAction( existing, "rebuild_summary")
        }
        
    }
}
export async function compareItems( parent, primitive, options = {}){
    const config = primitive.referenceParameters ?? {}
    let [items,data] = await getDataForProcessing(primitive, config, parent)
    console.log(`got ${items.length} items`)
    console.log(data)

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
    const [items, toProcess] = await getDataForProcessing(primitive, {}, source, {instance: options?.instance} )

    console.log(`${items.length} items`)
}

export async function extractor( source, config, options = {} ){
    const addTarget = await fetchPrimitive(primitiveOrigin( source ))
    const extractConfig = config.extractor
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
        let lookup = await lookupEntity( value, extractTargetCategory, source.workspaceId, {parent: addTarget.id})
        if( lookup ){
            if(extractConfig.direction === "parent"){
                await addRelationship( lookup.id, source.id, "link")
                console.log(`Linked to ${lookup.id} / ${lookup.plainId}`)
            }
        }

    }else{
        console.log(`Will extract ${extractTargetCategory.id} / ${extractTargetCategory.title}`)
        const metadata = {}
        for(const k of Object.keys(extractTargetCategory.ai.extract.responseFields) ){
            const field = extractTargetCategory.ai.extract.responseFields[k].target ?? k
            metadata[field] = `a ${field} field containing ${extractTargetCategory.ai.extract.responseFields[k].prompt}`
        }
        console.log(metadata)
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
        const url = await findCompanyURLByName( value )
        
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
export async function findCompanyURLByName( name, context ){
    /*
    let link = await findCompanyURLByNameByApollo(name, context)
    if( !link){
        link = await findCompanyURLByNameByZoominfo(name, context)
    }
    if( !link){
        link = await findCompanyURLByKnowledgeGraph(name, context)
    }
    if( !link){
        link = await findCompanyURLByNameByAboutUs(name, context)
    }
    return link*/

    const results = await Promise.all([
        findCompanyURLByNameByApollo(name, context),
        findCompanyURLByNameByZoominfo(name, context),
        findCompanyURLByKnowledgeGraph(name, context),
        findCompanyURLByNameByAboutUs(name, context)
    ]);
    console.log(results)

    // Process results
    for (let link of results) {
        if (link) {
            return link; // Return the first truthy link found
        }
    }
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
export async function findCompanyURLByNameByAboutUs( name, context ){
    const result = await fetchLinksFromWebQuery(`\"${name}\" "about"`, {timeFrame: ""})
    if( result.links ){
        const regex = new RegExp(name,'i')
        
        const domains = {}
        
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
                }else if(hostname.match(/linkedin.com/i)){
                    continue
                }
                domains[hostname] = (domains[hostname] || 0) + 1
            }
        }
        console.log(domains)
        let candidates = Object.keys(domains).filter(d=>domains[d] > 1).sort((a,b)=>domains[b]-domains[a])
        return candidates[0]
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
    console.log(`Got ${segments.length} target segments and ${currentAggregators.length} aggregators`)
    
    
    for( const segment of segments){
        console.log(`Doing query for segment ${segment.plainId}`)
        await doPrimitiveAction( primitive, "custom_query", {scope: segment.id, addToScope: true})
    }
}