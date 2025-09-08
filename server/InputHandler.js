import Category from "./model/Category"
import PrimitiveConfig from "./PrimitiveConfig"
import { DONT_LOAD, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, getConfig, getDataForImport, getFilterName, getPrimitiveInputs } from "./SharedFunctions"
import { getSegemntDefinitions } from "./task_processor"

export async function fetchPrimitiveInputs(primitive, sourceId, mode = "inputs", pinMode = "input", cache){
    let inputMap = PrimitiveConfig.getInputMap(primitive, mode)

    if( sourceId ){
        inputMap = inputMap.filter(d=>d.sourceId === sourceId)
    }

    let sourceIds = inputMap.map(d=>d.sourceId).filter((d,i,a)=>a.indexOf(d)===i) 

    const sourcePrimitives = await fetchPrimitives( sourceIds, undefined, DONT_LOAD )
    let categoryIds = [130,primitive.referenceId, ...sourcePrimitives.map(d=>d.referenceId)].filter((d,i,a)=>a.indexOf(d)===i) 
    const categories = await Category.find({id: {$in: categoryIds}})

    let thisCategory
    let inputFlowParentForInstance
    if( primitive.type === "flowinstance" ){
        inputFlowParentForInstance = (await findParentPrimitivesOfType(primitive, "flow"))[0]
        thisCategory = categories.find(d=>d.id === 130)
    }else{
        thisCategory = categories.find(d=>d.id === primitive.referenceId)
    }


    const out = []

    for(const d of inputMap){
        let sourcePrimitive = sourcePrimitives.find(d2=>d2.id === d.sourceId)
        const sourceCategory = categories.find(d=>d.id === sourcePrimitive.referenceId)
        let sourcePinConfig = sourceCategory?.pins?.output?.[d.sourcePin]

        

        if( sourcePrimitive.type === "flow" || sourcePrimitive.type === "flowinstance"){
            const flow = sourcePrimitive.type === "flow" ? sourcePrimitive : (await findParentPrimitivesOfType(sourcePrimitive, "flow"))[0]
            if( flow.referenceParameters?.controlPins?.[d.sourcePin]){
                sourcePrimitive = flow
                sourcePinConfig = {
                    ...flow.referenceParameters?.controlPins?.[d.sourcePin],
                    source: `param.${d.sourcePin}`

                }                                        
            }else if( flow.referenceParameters?.inputPins?.[d.sourcePin]){
                sourcePinConfig = {
                    ...flow.referenceParameters?.inputPins?.[d.sourcePin],
                    source: `param.${d.sourcePin}`
                }                                        
            }else if( flow.referenceParameters?.outputPins?.[d.sourcePin]){
                sourcePinConfig = {
                    ...flow.referenceParameters?.outputPins?.[d.sourcePin],
                    source: `param.${d.sourcePin}`
                }                                        
            }
        }

        let inputMapConfig = thisCategory?.pins?.[pinMode]?.[d.inputPin]
        if( inputMapConfig?.hasConfig ){
            const inputMapSource = primitive.type === "flowinstance" ? inputFlowParentForInstance : primitive
            const localConfig = (await getConfig(inputMapSource, cache, true)).pins?.[d.inputPin] ?? {}
            console.log(localConfig)
            inputMapConfig = {
                ...inputMapConfig,
                ...localConfig
            }
        }

        out.push({
        ...d,
        sourcePrimitive,
        inputMapConfig,
        sourcePinConfig})
    }
    inputMap = out

    let configForPins

    let dynamicPinSource = primitive
    if(primitive.type === "flowinstance"){
        dynamicPinSource = inputFlowParentForInstance
    }else if( !primitive.flowElement ){
        // should get config parent??
        //dynamicPinSource = receiver.configParent ?? receiver
        
    }

    if( dynamicPinSource.type === "categorizer" || dynamicPinSource.type === "query" || dynamicPinSource.type === "flow" || dynamicPinSource.type === "summary" || dynamicPinSource.type === "action" || dynamicPinSource.type === "actionrunner"){
        configForPins = await getConfig(dynamicPinSource, cache, true)
    }

    let dynamicPins = PrimitiveConfig.getDynamicPins(dynamicPinSource,  configForPins)

    if( (primitive.type === "flow" || primitive.type === "flowinstance") && mode === "outputs"){
        if( !configForPins ){
            configForPins = await getConfig(dynamicPinSource, cache, true)
        }
        dynamicPins = {
            ...dynamicPins,
            ...PrimitiveConfig.getDynamicPins(dynamicPinSource, configForPins, "outputs")
        }
    }


    let generatorPins = {}
    if( primitive.type === "actionrunner"){
        if( configForPins.generator){
            const generateTarget = await Category.find( {id:configForPins.generator})
            generatorPins = generateTarget[0]?.ai?.generate?.inputs ?? {}
        }else{
            const targetCategory = await Category.findOne( {id: configForPins.referenceId})
            generatorPins = PrimitiveConfig.getPinsForAction( targetCategory, configForPins.action)
        }

            dynamicPins = {
                ...dynamicPins,
                ...generatorPins
            }        
    }


    let interim = PrimitiveConfig.alignInputAndSource(inputMap,  dynamicPins)

    async function resolveAxis( segment){
        const fetchTitleList = segment.filters.filter(d=>d.type === "parent")
        if( fetchTitleList.length > 0){
            const ids = fetchTitleList.map(d=>d.value)
            const resolved = await fetchPrimitives(ids, undefined, DONT_LOAD)
            let i = 0
            for(const d of resolved){
                if( fetchTitleList[i].value === d.id){
                    fetchTitleList[i].orignalValue = fetchTitleList[i].value
                    fetchTitleList[i].value = d.type === "segment" ? await getFilterName( d ) : d.title
                    
                }else{
                    console.log(`MISMATCH`)
                }
                i++
            }
        }
    }


    for(const d of interim){
        if( d.sourceTransform === "imports"){
            d.sources = await getDataForImport( d.sourcePrimitive, cache )
        }else if( d.sourceTransform === "pin_relay"){
            if( d.useConfig === "primitive"){
                if( primitive.type === "flowinstance"){
                    const fis = (await primitivePrimitives(primitive, 'primitives.subfi', "flowinstance" )).filter(d2=>Object.keys(d2.parentPrimitives ?? {}).includes(d.sourcePrimitive.id))
                    console.log(`GOT ${fis.length} instances to get from`)
                    d.sources = []
                    for(const fi of fis){
                        const outputs = await getPrimitiveOutputs(fi, cache)
                        if(outputs && outputs[d.sourcePin]){
                            d.sources.push( ...(outputs[d.sourcePin].data ?? []) )
                        }
                    }
                }else{
                    const po = await fetchPrimitive( primitiveOrigin(primitive))
                    if( po.type === "flowinstance"){
                        d.sources = (await getPrimitiveInputs(po, cache))[d.sourcePin]?.data
                    }
                }
            }else if( d.useConfig === "string"){
                const sourceInputs = await getPrimitiveInputs(d.sourcePrimitive, cache)
                if( sourceInputs[d.sourcePin] ){
                    d.pass_through = sourceInputs[d.sourcePin]?.data
                    d.passThroughCoonfig = "string"
                    d.useConfig = "pass_through"
                }
            }
        }else if( d.sourceTransform === "filter_imports"){
            const sourceConfig = await getConfig( d.sourcePrimitive )
            const defs = await getSegemntDefinitions( d.sourcePrimitive, undefined, sourceConfig, true)
            d.sourceBySegment = {}
            for(const segment of defs){
                await resolveAxis(segment)
                const label = segment.filters.map(d=>d.value).join(" - ")
                d.sourceBySegment[label] ||= []
                d.sourceBySegment[label] = d.sourceBySegment[label].concat( segment.items)

            }
        }else if( d.sourceTransform === "get_axis"){
            const sourceConfig = await getConfig( d.sourcePrimitive )
            const axis = sourceConfig?.explore?.axis[d.axis]
            if( axis ){
                const customAxis = {sourcePrimId: d.sourcePrimitive.primitives?.axis?.row?.[0], ...axis} 
                const defs = await getSegemntDefinitions( d.sourcePrimitive, [customAxis], sourceConfig)
                if( customAxis.type === "primitive"){
                    d.pass_through = defs.flatMap(d=>d.filters.map(d=>d.value))
                }else{
                    for(const segment of defs){
                        await resolveAxis(segment)
                    }
                    d.pass_through = defs.flatMap(d=>d.filters.map(d=>d.value))
                }
            }
            //d.pass_through = extents.map(d=>d.label)
        }else if( d.sourceTransform === "child_list_to_string"){
            d.sources = await getDataForImport( d.sourcePrimitive, cache)
        }
    }


    let output =  PrimitiveConfig.translateInputMap(interim)
    return output
}