import PrimitiveConfig from "./PrimitiveConfig"
import PrimitiveParser from "./PrimitivesParser";
import { addRelationship, createPrimitive, doPrimitiveAction, fetchPrimitive, getConfig, getDataForImport, getDataForProcessing, multiPrimitiveAtOrginLevel, primitiveChildren, removePrimitiveById, uniquePrimitives } from "./SharedFunctions"
import Category from "./model/Category"

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
        mappedFilter.pivot = thisAxis.access ?? thisAxis.pivot
        mappedFilter.type = thisAxis.type === "category" ? "parent" : thisAxis.type

        filterConfig.push(mappedFilter)
        
        let lookups = await multiPrimitiveAtOrginLevel( items, pivot, relationship)

        let values = lookups.map((item,idx)=>{
            let data
            if( resolvedFilterType === "title"){
                data = item.map(d=>d.title)
            }
            else if( resolvedFilterType === "parameter"){
                data = item.map(d=>d.referenceParameters?.[thisAxis.parameter ?? thisAxis.param])
            }else if( resolvedFilterType === "type"){
                data = item.map(d=>d.referenceId)
            }else if( resolvedFilterType === "parent"){
                if( thisAxis.subtype === "question" || thisAxis.subtype === "search"){
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
            existing = await addRelationship(existing.id, segment.id, "imports")
            console.log(existing)
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