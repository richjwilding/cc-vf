import { registerAction } from "./action_helper";
import { getLogger } from "./logger";
import { addRelationship, createPrimitive, dispatchControlUpdate, DONT_LOAD, doPrimitiveAction, executeConcurrently, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, getConfig, getFilterName, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentsOfType, primitivePrimitives, relevantInstanceForFlowChain, removePrimitiveById, removeRelationship } from "./SharedFunctions";
import { checkAndGenerateSegments, getItemsForQuery, getSegemntDefinitions } from "./task_processor";
import PrimitiveParser from './PrimitivesParser';
import FlowQueue from "./flow_queue";
import Category from "./model/Category";
import Primitive from "./model/Primitive";
import { SIO } from "./socket";
import PrimitiveConfig from "./PrimitiveConfig";


registerAction("new_flow_instance", undefined, async (primitive, a, options)=>{
    throw "WHAT IS THIS FOR? new_flow_instance"
    const inputType = options.type ?? "result"
    const inputReferenceId = options.referenceId ?? 35
    const inputSourceId = primitive.primitives?.imports?.[0]
    if( inputSourceId ){
        let inputSource = await fetchPrimitive( inputSourceId )
        if( inputSource.type !== "segment"){
            if( inputSource.type === "view" ){
                inputSource = await fetchPrimitive( inputSource.primitives?.imports?.[0] )
                if( inputSource.type !== "segment"){
                    throw `Cant find segment - Dont know where to add for ${primitive.id} / ${primitive.plainId}`
                }
            }else{
                throw `Dont know where to add for ${primitive.id} / ${primitive.plainId}`
            }            
        }
        console.log(`Will add ${inputType} (${inputReferenceId}) to ${inputSource.title}`)

        const newPrim = await createPrimitive({
            workspaceId: inputSource.workspaceId,
            paths: ["origin"],
            parent: inputSource.id,
            data:{
                type: inputType,
                referenceId: inputReferenceId,
                title: `New ${inputType}`,
            }
        })
        await dispatchControlUpdate( newPrim.id, "title", `New ${inputType} (${newPrim.plainId})`)
        await scaffoldWorkflow(primitive)
    }
})

registerAction("run_flowinstance_from_step", undefined, async (p,a,o)=>FlowQueue().runFlowInstance(p,{...o, force: true, fromStepIds: [o.from]}))
registerAction("run_step", undefined, async (p,a,o)=>FlowQueue().runStep(p,{...o, singleStep: true}))
registerAction("run_flow", {id: "flow"}, async (p,a,o)=>FlowQueue().runFlow(p,o))
registerAction("run_flow_instance", {id: "flowinstance"}, async (p,a,o)=>FlowQueue().runFlowInstance(p,{...o, force: true}))
registerAction("continue_flow_instance", {id: "flowinstance"}, async (p,a,o)=>FlowQueue().runFlowInstance(p, {...o, manual: true}))
registerAction("step_info", undefined, async (p,a,o)=>{
    let flowInstance = o.flowInstance ?? (await primitiveParentsOfType(p, "flowinstance"))?.[0]
    if( flowInstance ){
        const status = await stepInstanceStatus(p, flowInstance)
        return status
    }
})
registerAction("instance_info", {id: "flowinstance"}, async (p,a,o)=>flowInstanceStatus(p,o))
registerAction("run_subflow", {id: "flowinstance"}, async (p,a,o)=>{
    const allSubFlows = await primitivePrimitives(p, "primitives.subfi")
    console.log(`Got ${allSubFlows.length} subflows`)
    const theseSubFlows = allSubFlows.filter(d=>Object.keys(d.parentPrimitives ?? {}).includes(o.subFlowId))
    console.log(` --  ${theseSubFlows.length} relevant subflows`)
    FlowQueue().runFlowInstance(p,{...o, force: true, fromStepIds: theseSubFlows.map(d=>d.id)})
})
registerAction("workflow_info", {id: "flow"}, async (p,a,o)=>getScaffoldWorkflow(p,{...(o ?? {}), create: false}))
registerAction("instance_scaffold", {id: "flow"}, async (p,a,o)=>{
    const flow = (await primitiveParentsOfType(p, "flow"))?.[0]
    const result = await scaffoldWorkflowInstance( p, flow, undefined, undefined, {create: true} )
})
registerAction("workflow_scaffold", {id: "flow"}, async (p,a,o)=>{
    const result = await scaffoldWorkflow(p, o)
    return result
})
registerAction("create_flowinstance", {id: "flow"}, async (p,a,o)=>{
    const result = await createWorkflowInstance(p, o)
    return result
})

const logger = getLogger('workflow'); // Debug level for moduleA

export async function getScaffoldWorkflow( flow, options = {} ){
    try{
        return await scaffoldWorkflow(flow,{...options, create:false})
    }catch(e){
        logger.error("Error scheduleScaffoldWorkflow ")
        logger.error(e)
    }
}

export async function createWorkflowInstance( flow, options = {} ){
    console.log(options)
    //return
    if( flow.primitives?.imports && flow.primitives.imports.length > 0){
        throw "Workflows with imports not handled right now"
    }

    const newPrim = await createPrimitive({
        workspaceId: flow.workspaceId,
        paths: ["origin", "config"],
        parent: flow.id,
        data:{
            type: "flowinstance",
            title: `Instance of ${flow.plainId}`,
            referenceParameters:{
                target:"items"
            }
        }
    })
    if( newPrim ){
        logger.debug(`Created new flow instance ${newPrim.id} ${newPrim.plainId} for ${flow.id} / ${flow.plainId}`)
        await scaffoldWorkflowInstance(newPrim, flow, undefined, undefined, {create: true})
    }
    return newPrim
}

export async function scaffoldWorkflow( flow, options = {} ){
    const isSubFlow = flow.flowElement === true
    if( isSubFlow && !options.subFlowForInstanceId ){
        throw "Cant scaffold subflow without parent flow instance"
    }
    let parentFlowInstance = options.subFlowForInstanceId ? await fetchPrimitive( options.subFlowForInstanceId ) : undefined
    if( options.subFlowForInstanceId && !parentFlowInstance ){
        throw `Cant find subflow instance ${options.subFlowForInstanceId}`
    }

    const parser = PrimitiveParser()
    const pp = new Proxy(flow.primitives, parser)
    let customAxis 



    const {instanceSteps: items, importPrimitives: flowImports} = await getInstanceStepsWithImports( flow )

    //const items = await primitiveChildren( flow )
    const steps = items.filter(d=>d.type !== "flowinstance")
    const baseInstances = items.filter(d=>d.type === "flowinstance")
    const importIds = pp.imports.allIds
    let sources
    let sourceNotFound = false
    if( importIds.length ){
        sources = await fetchPrimitives( importIds )
        if( isSubFlow ){
            const instanceSources =[]
            for(const source of sources){
                if(!source.flowElement){
                    throw `${source.id} is not a flow element in trying to scaffold subflow ${flow.id}`
                }
                if( source.type === "flow"){
                    logger.debug(`- Subflow imports from parent flow, redirecting to instances`)
                    //instanceSources.push(...(await primitiveChildren( source, "flowinstance" )))
                    //logger.debug(`- Found ${instanceSources.length} instances`)
                    instanceSources.push(parentFlowInstance)
                }else{
                    const instanceSteps = await primitivePrimitives( source, "primitives.config" )
                    const sourceForInstance = instanceSteps.find(d=>Object.keys(d.parentPrimitives).includes( options.subFlowForInstanceId ))
                    if( sourceForInstance ){
                        logger.debug(`- Found instance step for subflow import ${sourceForInstance.id} / ${sourceForInstance.plainId}`)
                        instanceSources.push( sourceForInstance)
                    }else{
                        /*const instance = baseInstances.find(d=>d.id === options.subFlowForInstanceId)
                        if( instance ){
                            const importIds = instance.primitives.imports
                            if( importIds?.length > 0 ){
                                const instanceSegments = await fetchPrimitives(importIds, {type: "segment"})
                                if( instanceSegments){
                                    const sourceViaSegment = instanceSteps.find(d=>Object.keys(d.primitives.origin).includes( options.subFlowForInstanceId ))
                                }
                            }
                        }*/
                       logger.debug(`- Couldnt find instance step for subflow import ${flow.id} / ${flow.plainId} - ${options.subFlowForInstanceId}`)
                        sourceNotFound = true
                        if( instanceSteps.length === 1){
                            instanceSources.push( instanceSteps[0] )
                            logger.debug(`--  Attempting recovery`)
                        }
                    }
                }
            }
            sources = instanceSources
        }
    }
    let instanceList = []
    


    logger.info(`Scaffold workflow`, {flow: flow.id});
    logger.info(`Flow has ${steps.length} steps, ${sources?.length} sources, ${baseInstances.length} instances`, {primitive: flow.id});

    

    if( sources ){
        logger.info(`Flow fed from imports`);
        for( const source of sources){
            logger.debug(`-- For ${source.title}`, {flow: flow.id, source: source.id});
            
            const {segments, cleared} = await checkAndGenerateSegments( source, flow, {...options, clear: true, by_axis: true})
            logger.debug(`-- got ${segments.length} segments`, {flow: flow.id, source: source.id});
            if( cleared.length > 0){
                console.log(`${cleared.length} segments removed - checking and removing hanging flow instances`)
                for(const clearId of cleared){
                    let existing = baseInstances.find(d=>Object.keys(d.parentPrimitives).includes(clearId))
                    if( existing ){
                        logger.debug(`- removing flow instance ${existing.id} for cleared segment ${clearId}`)
                        await removePrimitiveById( existing.id )
                    }
                }
            }
            
            for( const segment of segments){
                let existing = baseInstances.find(d=>Object.keys(d.parentPrimitives).includes(segment.id))
                
                if( !existing ){
                    if(options.create === false){
                        existing = {
                            missing: true,
                        }
                    }else{
                        existing = await createPrimitive({
                            workspaceId: flow.workspaceId,
                            paths: ["origin", "config"],
                            parent: flow.id,
                            data:{
                                type: "flowinstance",
                                title: await getFilterName(segment) ?? `Instance of ${flow.plainId}`,
                                referenceParameters:{
                                    target:"items"
                                }
                            }
                        })
                        if( !existing ){
                            throw "Couldnt create aggregator"
                        }
                        logger.debug(`Created new flow instance ${existing.id} ${existing.plainId} for ${flow.id} / ${flow.plainId}`)
                        await addRelationship(existing.id, segment.id, "imports")
                        await addRelationship(segment.id, existing.id, "auto")
                        if( isSubFlow ){
                            await addRelationship(parentFlowInstance.id, existing.id, "subfi")
                            logger.debug(` - linked as subflow instance to ${parentFlowInstance.id}`)
                        }
                        existing = await fetchPrimitive(existing.id)
                    }
                }
                instanceList.push({
                    instance: existing,
                    for: segment.id,
                    status:{}
                })
            }
        }
        for(const instanceInfo of instanceList){
            if( !instanceInfo.instance.missing){
                await scaffoldWorkflowInstance( instanceInfo.instance, flow, steps, flowImports, options)
            }
        }
    }else{
        logger.info(`Flow fed from inputs`);
        for(const instance of baseInstances){
            //await scaffoldWorkflowInstance( instance, flow, steps, options)
            await scaffoldWorkflowInstance( instance, flow, steps, flowImports, options)
        }
    }
}

export async function getInstanceStepsWithImports( flowInstance){
    console.time("getInstanceStepsWithImports")
    const flowId     = flowInstance._id;
    const parentKey  = `parentPrimitives.${flowId}`;

    const matchStage = { 
    $match: { 
        [parentKey]: {$in: ["primitives.origin","primitives.subfi"]},
        workspaceId: flowInstance.workspaceId,
        deleted: {$exists: false}
    } 
    };

   let [{instanceSteps, importPrimitives, configPrimitives}] = await Primitive.aggregate([
        // 1) filter down to only steps whose parentPrimitives[flowId] includes "primitives.origin"
        matchStage,

        // 2) run two pipelines in parallel: one to grab the raw step docs, one to grab all imports
        { $facet: {
            instanceSteps: [
                { $project: DONT_LOAD }
            ],
            // ——— extract, dedupe & lookup the imported primitives ———
            importPrimitives: [
                // pull out your two ID‑arrays (defaulting to empty if missing)
                { $project: {
                    imports:   { $ifNull: ["$primitives.imports", []] },
                    axis_row:   { $ifNull: ["$primitives.axis.row", []] },
                    axis_col:   { $ifNull: ["$primitives.axis.column", []] },
                    inputsObj: { $ifNull: ["$primitives.inputs", {}] },
                    outputsObj: { $ifNull: ["$primitives.outputs", {}] }
                  }
                },
                { $addFields: {
                    inputsList: {
                      $reduce: {
                        input: {
                          $map: {
                            input: { $objectToArray: "$inputsObj" },
                            as:    "p",
                            in:    { $ifNull: ["$$p.v", []] }
                          }
                        },
                        initialValue: [],
                        in:            { $concatArrays: ["$$value","$$this"] }
                      }
                    },
                    outputsList: {
                      $reduce: {
                        input: {
                          $map: {
                            input: { $objectToArray: "$outputsObj" },
                            as:    "p",
                            in:    { $ifNull: ["$$p.v", []] }
                          }
                        },
                        initialValue: [],
                        in:            { $concatArrays: ["$$value","$$this"] }
                      }
                    }
                }},
              
                // 3) union all five ID sources into allIds
                { $addFields: {
                    allIds: {
                      $setUnion: [
                        "$imports",
                        "$axis_row",
                        "$axis_col",
                        "$inputsList",
                        "$outputsList"
                      ]
                    }
                }},
                { 
                    $project: {
                      _id:        0,
                      imports:    1,
                      axis_row:   1,
                      axis_col:   1,
                      inputsList: 1,
                      outputsList:1,
                      allIds:     { $setUnion: ["$imports","$axis_row","$axis_col","$inputsList","$outputsList"] }
                    }
                  },
              
                { $unwind: "$allIds" },
                { $group: {
                    _id: null,
                    importIds: { $addToSet: "$allIds" }
                  }
                },
                
              
                // 1) convert to ObjectId **before** lookup
                { $project: {
                    objectIds: {
                      $map: {
                        input: "$importIds",
                        as: "id",
                        in: { $toObjectId: "$$id" }
                      }
                    }
                  }
                },
              
                // 2) do the lookup
                { $lookup: {
                    from: Primitive.collection.name,   // <- safest: use the actual collection name
                    localField: "objectIds",
                    foreignField: "_id",
                    as: "importPrimitives"
                  }
                },
                { $addFields: {
                    importPrimitives: {
                      $filter: {
                        input: "$importPrimitives",
                        as:    "p",
                        cond:   { $eq: [{ $type: "$$p.deleted" }, "missing"] }
                      }
                    }
                  }
                },
                { $unwind:      "$importPrimitives" },
                { $replaceRoot: { newRoot: "$importPrimitives" } }
            ],
            configPrimitives: [
                { $project: { parentPrimitives: 1 } },
                { $addFields: {
                    pairs: { $objectToArray: "$parentPrimitives" }
                  }
                },
                { $unwind: "$pairs" },
                { $match: {
                    $expr: { $in: [ "primitives.config", "$pairs.v" ] }
                  }
                },
                { $addFields: {
                    configObjectId: { $toObjectId: "$pairs.k" }
                  }
                },
                { $lookup: {
                    from:         Primitive.collection.name,
                    localField:   "configObjectId",
                    foreignField: "_id",
                    as:            "configPrimitive"
                  }
                },
                { $unwind: "$configPrimitive" },
                { $replaceRoot: { newRoot: "$configPrimitive" } }
              ]
        }}
    ]);

    console.timeEnd("getInstanceStepsWithImports")

    instanceSteps   = instanceSteps.map(doc => Primitive.hydrate(doc));
    importPrimitives = importPrimitives.map(doc => Primitive.hydrate(doc));
    configPrimitives = configPrimitives.map(doc => Primitive.hydrate(doc));

    return {instanceSteps, importPrimitives, configPrimitives}

    
}

export async function scaffoldWorkflowInstance( flowInstance, flow, steps, flowImports, options = {} ){
    console.time("time_STEPS")
    const parser = PrimitiveParser()
    const pp = new Proxy(flow.primitives, parser)

    logger.info( "Flow instances:")
    const flowPrimitiveParser = new Proxy(flow.primitives ?? {}, PrimitiveParser())
    
    if(!steps || !flowImports){
        //const items = await primitiveChildren( flow )
        const {instanceSteps, importPrimitives} = await getInstanceStepsWithImports( flow )
        steps = instanceSteps.filter(d=>d.type !== "flowinstance")
        flowImports = importPrimitives
        console.log(`--> fetched steps and imports for source flow`)
    } 
    const instanceSteps = []
    logger.info( "Flow instance ", {id: flowInstance.id})
    const instanceStepsForFlow = await primitiveChildren( flowInstance )

    /*
    const importPrimitiveIds = steps.flatMap(step=>{
        let stepInstance = instanceStepsForFlow.find(d2=>d2.parentPrimitives?.[step.id]?.includes("primitives.config"))
        if( stepInstance ){

            const pp = (new Proxy(stepInstance.primitives ?? {}, PrimitiveParser()))
            return [pp.imports.uniqueAllIds, pp.inputs.uniqueAllIds,]
        }
        return
    }).flat().filter((d,i,a)=>d && a.indexOf(d) === i)
    console.log(`Pre cached ids = ${importPrimitiveIds.length}`)
    const importPrimitives = await fetchPrimitives( importPrimitiveIds )
*/

    const subFlows = []

    console.timeEnd("time_STEPS")
//    const {instanceSteps:instanceStepsForFlow, importPrimitives} = await getInstanceStepsWithImports( flowInstance )
  //  console.log(`${instanceStepsForFlow.length} / ${importPrimitives.length}`)

    const importCache = flowImports.reduce((a,d)=>{
        if( a[d.id]){
            console.log(`+++`)
        }
        a[d.id] = d
        return a
    }, {})


    //for(const step of steps){
    async function checkStep(step){
        //let stepInstance = instanceStepsForFlow.find(d2=>Object.keys(d2.parentPrimitives).includes(step.id))
        let stepInstance = instanceStepsForFlow.find(d2=>d2.parentPrimitives?.[step.id]?.includes("primitives.config"))
        if( stepInstance ){
            logger.debug(` - Step instance ${stepInstance.id} for ${step.id}`)
            if( stepInstance.flowElement){
                logger.warn(`Needing to reset flowElement status of ${stepInstance.id} / ${stepInstance.plainId}`)
                dispatchControlUpdate(stepInstance.id, "flowElement", false)
            }
        }else{
            logger.debug(` - Missing step instance for ${step.id}`)
            if( options.create !== false ){
                try{
                    if( step.type === "flow"){
                        logger.info("--- NEED TO SCAFFOLD SUB FLOW")
                        subFlows.push( step )
                        return
                    }else{
                        stepInstance = await duplicateStep( step, flowInstance)
                    }
                }catch(error){
                    console.log(error)
                    throw `Couldnt create step instance for ${step.id}`
                }
                if( stepInstance ){
                    logger.info(` - Created step instance ${stepInstance.id} for ${step.id}`)
                }
                
                if( Object.keys(step.primitives ?? {}).includes("axis")){
                    logger.warn(`Should replicate axis in flow instance ${step.id} / ${stepInstance.id}`)
                }
            }else{
                stepInstance = {
                    missing: true,
                }
            }
        }
        instanceSteps.push( {
            instance: stepInstance,
            stepId: step.id,
            title: `Instance of ${step.plainId} for ${flowInstance.plainId}`,
            //...(await stepInstanceStatus(stepInstance, flowInstance, importCache))
        } )
    }
    await executeConcurrently( steps , checkStep)
    console.timeEnd("time_STEPS")
    logger.info(`Check outputs`)
    console.time("time_OUTPUT")
    const outputList = flowPrimitiveParser.outputs
    const targetImports = []
    const outputPP = pp.fromPath("outputs")
    for(const rel of Object.keys(outputList)){
        for(const source of outputList[rel].allIds ){
            const paths = outputPP.paths(source).map(d=>"outputs" + d)
            const mappedStep = instanceSteps.find(d=>d.stepId === source)
            if( mappedStep ){
                logger.debug(`flow has output ${rel} from ${source} - need to map to ${mappedStep.instance.id} / ${mappedStep.instance.plainId} `)
                targetImports.push({id: mappedStep.instance.id, paths } )
            }else{
                const linkedSubFlow = subFlows.find(d=>d.id === source)
                if( linkedSubFlow ){
                    logger.debug(`flow has output ${rel} from subflow ${source} - mapping drectly`)
                    targetImports.push({id: linkedSubFlow.id, paths } )

                }else{
                    logger.debug(`Cant find instance of ${source} - looking in flowinstance chain`)
                    const sourcePrimitive = await fetchPrimitive( source )
                    if( sourcePrimitive ){
                        const instancesOfElement = await fetchPrimitives( sourcePrimitive.primitives?.config ?? [])
                        console.log(`- ${instancesOfElement.length}`)
                        if( instancesOfElement.length > 0){
                            const relevantTargetInstanceForElementInstance = await relevantInstanceForFlowChain( instancesOfElement, [flowInstance.id])
                            console.log(relevantTargetInstanceForElementInstance)
                            for( const d of relevantTargetInstanceForElementInstance){
                                if( d ){

                                    targetImports.push({id: d.id, paths } )
                                }
                            }
                        }

                    }
                    /*if( options.create ){
                        throw "Missing step"
                    }*/
                }
            }

        }
    }
    await alignPrimitiveRelationships( flowInstance, targetImports, "outputs", options.create)
    console.timeEnd("time_OUTPUT")

    logger.info(`Checking relationship mapping`)
    console.time("time_RELATION MAP")
    for(const step of steps){
        const mappedStep = instanceSteps.find(d=>d.stepId === step.id)
        if( mappedStep){
            for(const rel of ["imports", "inputs", "outputs", "axis.column","axis.row"]){
                const pp = (new Proxy(step.primitives ?? {}, PrimitiveParser())).fromPath(rel)
                const importIds= pp.uniqueAllIds

                //const importIds = Object.values(step.primitives[rel] ?? {})
                const targetImports = []
                for(const importId of importIds){
                    const paths = pp.paths(importId).map(d=>rel + d)
                    if(importId === flow.id){
                        logger.info(`Step ${step.id} / ${step.plainId} imports from flow ${flow.id} at ${rel} - mapping to flow instance ${flowInstance.id}`)
                        targetImports.push( {id: flowInstance.id, paths} )
                    }else{
                        let originalImportStep = steps.find(d=>d.id === importId)
                        let mappedImportStep
                        if( originalImportStep ){
                            mappedImportStep = instanceSteps.find(d=>d.stepId === originalImportStep.id)
                        }else{
                            logger.debug(`Importing from something (${importId}) outside of this flow instance (${flowInstance.id} / ${flowInstance.plainId}) `)

                            let importTarget = importCache[importId]
                            if( !importTarget){
                                logger.info(`- ${importId} not in cache for ${rel}`)
                               importTarget =  await fetchPrimitive( importId )
                               importCache[importId] = importTarget
                            } 
                            if( importTarget.flowElement ){
                                logger.debug(` - import is flow element, checking flow ancestory`)
                                const relevantIds = importTarget.primitives?.config ?? []
                                if( relevantIds.length > 0 ){
                                    const instances = await fetchPrimitives(  relevantIds )
                                    const targetInAncestor = (await relevantInstanceForFlowChain( instances, [flowInstance.id]))[0]
                                    if( targetInAncestor){
                                        logger.debug(` - found relevant ancestor for mapping ${targetInAncestor.id} / ${targetInAncestor.plainId}`)
                                        originalImportStep = importTarget
                                        mappedImportStep = {
                                            instance: targetInAncestor
                                        }

                                    }
                                }
                            }
                        }
                        if( mappedImportStep ){
                            logger.info(`Step ${step.id} / ${step.plainId} ${rel} from flow step ${originalImportStep.id} / ${originalImportStep.plainId} - mapping to flow instance ${mappedImportStep.instance.id} / ${mappedImportStep.instance.plainId}`)
                            
                            let mappedFilters
                            if( rel === "imports"){
                                let filtersForOriginal = step.referenceParameters?.importConfig?.filter(d=>d.id === importId) ?? []
                                logger.debug(`-- filters to remap for import`, {filtersForOriginal})
                                mappedFilters = filtersForOriginal.map(d=>{
                                    return {
                                        id: mappedImportStep.instance.id,
                                        filters: d.filters === undefined ? undefined : d.filters.map(d=>{
                                            if( d.type === "parent" && d.value === originalImportStep.id){
                                                logger.debug(`--- remapped done / fail filter : ${d.value} => ${mappedImportStep.instance.id}`)
                                                return {
                                                    ...d,
                                                    value: mappedImportStep.instance.id
                                                }
                                            }
                                            return d
                                        })
                                    }
                                })
                            }
                            if( rel.startsWith("axis") && originalImportStep.type === "categorizer"){
                                const internalId = mappedImportStep.instance.primitives?.origin?.[0]
                                logger.debug(` - Instance target is categorizer - redirecting to nested primitive ${internalId}`)
                                targetImports.push({id: internalId, filters: mappedFilters, paths} )
                            }else{
                                targetImports.push({id: mappedImportStep.instance.id, filters: mappedFilters, paths} )
                            }
                        }else{
                            if( mappedStep.instance.type === "page"){
                                logger.debug(`Importing from something other than flow or step id = ${importId} - currently in page, assume element?`)
                            }else if( originalImportStep.type === "flow"){
                                const fis = (await primitivePrimitives(flowInstance, 'primitives.subfi', "flowinstance" )).filter(d2=>Object.keys(d2.parentPrimitives ?? {}).includes(originalImportStep.id))
                                logger.debug(`Importing from flow = ${importId} - linking to ${fis.length} flowinstances`)
                                for(const d of fis){
                                    targetImports.push( {id: d.id, paths} )
                                }
                            }else{
                                throw `Importing from something other than flow or step id = ${importId} - possibly nested segemnt??`
                            }
                        }
                    }
                }
                await alignPrimitiveRelationships( mappedStep.instance, targetImports, rel, options.create)
            }
        }
    }
    console.timeEnd("time_RELATION MAP")
}

async function alignPrimitiveRelationships( targetPrimitive, targetImports, rel, create = true){
    const mappedPP = (new Proxy(targetPrimitive.primitives ?? {}, PrimitiveParser())).fromPath(rel)
    const currentImports = mappedPP.uniqueAllIds
    const currentImportsWithPaths = currentImports.map(d=>({id:d, paths: mappedPP.paths(d).map(d=>rel + d)}))

    function buildDelta(target, compare){
        return target.reduce((a,d)=>{
            const current = compare.find(d2=>d2.id === d.id)
            if( current){
                for(const path of d.paths){
                    if(!current.paths.includes(path)){
                        a.push({id: d.id, path: path})
                    }
                }
            }else{
                for(const path of d.paths){
                    a.push({id: d.id, path: path})
                }
            }
            return a
        }, [])
    }

    const toAdd = buildDelta(targetImports, currentImportsWithPaths)
    const toRemove = buildDelta(currentImportsWithPaths, targetImports)
    
    if( (toAdd + toRemove) > 0){
        logger.debug(`${toAdd.length} ${rel} to add, ${toRemove.length} ${rel} to remove`)
    }
    
    if( create !== false ){
        for(const d of toRemove){
            console.log(`--- Removing ${d.id} at ${d.path}`)
            await removeRelationship(targetPrimitive.id, d.id, d.path)
        }
        for(const d of toAdd){
            console.log(`--- Adding ${d.id} at ${d.path}`)
            await addRelationship(targetPrimitive.id, d.id, d.path)
        }
        if( rel === "imports"){
            const allFilters = targetImports.map(d=>d.filters).flat().filter(d=>d)
            let importConfig = allFilters?.length > 0 ? allFilters : null
            if( targetPrimitive.referenceParameters?.importConfig && !importConfig || !targetPrimitive.referenceParameters?.importConfig && importConfig){
                dispatchControlUpdate(targetPrimitive.id, "referenceParameters.importConfig", importConfig)
            }
        }
    }
}

async function flowInstanceStatus( flowInstance, options ){
    const raw = await flowInstanceStepsStatus( flowInstance)
    return raw.map(d=>{
        return {
            ...d,
            step: {id: d.step.id, flows: d.step.processing?.flow}
        }
    })
}
async function duplicateStep( step, parent){
    let stepInstance = await createPrimitive({
        workspaceId: step.workspaceId,
        parent: parent.id,
        data:{
            type: step.type,
            referenceId: step.referenceId,
            title: `Instance of ${step.plainId} for ${parent.plainId}`
        }
    })
    
    await addRelationship(step.id, stepInstance.id, "auto")
    await addRelationship(step.id, stepInstance.id, "config")
    
    if(step.type === "categorizer"){
        const categoryId = step.referenceId === 144 ? 90 : 54
        logger.info(`Adding nested category for categrizer (${stepInstance.id}) (ref = ${categoryId}`)
        await createPrimitive({
            workspaceId: step.workspaceId,
            paths: ["origin", "config"],
            parent: stepInstance.id,
            data:{
                type: "category",
                referenceId: categoryId,
                title: `Category for ${stepInstance.plainId}`
            }
        })

    }
    stepInstance = await fetchPrimitive(stepInstance.id)


    return stepInstance
}

export async function runFlow( flow ){
    const flowStarted = new Date().toISOString()
    dispatchControlUpdate(flow.id, "processing.flow", {status: "running", started: flowStarted})
    const flowInstances = await scaffoldWorkflow(flow)
    for( const flowInstance of flowInstances ){
        if( !flowInstance.instance.missing ){
            logger.info(`Scheduling run for ${flowInstance.instance.id} / ${flowInstance.instance.plainId} (of flow ${flow.id} / ${flow.plainId})`)
            await FlowQueue().runFlowInstance( flowInstance.instance, {flow, flowStarted} )
            logger.info("Scheduled")
        }
    }
}
export async function runFlowInstance( flowInstance, options = {}){
    let flow = options.flow ?? (await primitiveParentsOfType(flowInstance, "flow"))?.[0]
    if( !flow ){
        logger.error(`Cant find parent flow for instance`, {flowInstance})
    }
    let newIteration = true
    if( !flowInstance.processing?.flow?.last_run && options.continue){
        logger.info(`Cant continue flow - no progress data`)
        return
    }
    let flowStarted = options.flowStarted ?? flowInstance.processing?.flow?.last_run?.started ?? flowInstance.processing?.flow?.started
    if( options.force || !flowStarted){
        flowStarted = new Date().toISOString()

    }
    if( flowInstance.processing?.flow?.started === flowStarted ){
        logger.info(`Flow instance already started for this iteration`)
        newIteration = false
        await dispatchControlUpdate(flowInstance.id, "processing.flow.status", "running")
    }else{
        await dispatchControlUpdate(flowInstance.id, "processing.flow", {status: "running", started: flowStarted})
        flowInstance = await fetchPrimitive( flowInstance.id )
        const instanceSteps = await getFlowInstanceSteps(flowInstance)
        const subFlows = await primitivePrimitives(flowInstance, "primitives.subfi")
        
        const stepsAndFlows = [...instanceSteps, ...subFlows]

        let stepsToWait = stepsAndFlows.map(d=>d.id)
        const stepsToUpdate = []
        if( options.fromStepIds && options.fromStepIds.length > 0){
            const track = new Set()
            function followStep( step ){
                stepsToUpdate.push(step.id)
                const thisStepParents = Object.keys(step.parentPrimitives ?? {}).filter(d=>step.parentPrimitives[d].includes('primitives.imports') || step.parentPrimitives[d].some(d=>d.startsWith('primitives.inputs')))
                const dependants = instanceSteps.filter(d=>thisStepParents.includes(d.id))
                for(const d of dependants){
                    if(!track.has(d.id)){
                        track.add(d.id)
                        followStep(d)
                    }
                }
            }
            for(const stepId of options.fromStepIds){
                const fromStep = stepsAndFlows.find(d=>d.id === stepId)
                if( !fromStep ){
                    throw `Couldnt find step ${stepId} to continue from`
                }
                followStep( fromStep )
            }

            const stepsAsDone = stepsToWait.filter(d=>!stepsToUpdate.includes(d))

            logger.debug(`Found ${stepsAsDone.length} steps to mark as complete`)
            for(const d of stepsAsDone){
                const p = stepsAndFlows.find(d2=>d2.id === d)
                logger.debug(` - D ${p.plainId} ${p.type}`)
            }
            for(const d of stepsToUpdate){
                const p = stepsAndFlows.find(d2=>d2.id === d)
                logger.debug(` - U ${p.plainId} ${p.type}`)
            }


            const toSet = {       
                "processing.flow":{
                    started: flowStarted,
                    status: "complete"
                }
            }
            await Primitive.updateMany(
                {
                    _id: {$in: stepsAsDone}
                },
                { 
                    $set: toSet
                }            
            )
            SIO.notifyPrimitiveEvent(flowInstance, {data: stepsAsDone.map(d=>({type: "set_fields", primitiveId: d, fields: toSet}))})

            stepsToWait = stepsToUpdate
            
        }
        console.log(`Found ${stepsToWait.length} steps to mark as waiting`)
        const toSet = {       
            "processing.flow":{
                started: flowStarted,
                status: "waiting"
            }
        }
        await Primitive.updateMany(
            {
                _id: {$in: stepsToWait}
            },
            { 
                $set: toSet
            }            
        )
        SIO.notifyPrimitiveEvent(flowInstance, {data: stepsToWait.map(d=>({type: "set_fields", primitiveId: d, fields: toSet}))})
        
    }
    logger.info(`Running flow instance ${flowInstance.id} @ ${flowInstance.processing?.flow?.started} (${flowStarted})`)
    logger.info(`Looking for next steps to run`)
    const stepStatus = await flowInstanceStepsStatus( flowInstance )

    logger.debug(stepStatus.map(d=>`${d.step.id} / ${d.step.plainId} / ${d.step.type} - [${d.candidateForRun ? "RC" : "--"}] N ${d.need} (${d.needReason}) C ${d.can} (${d.canReason})` ).join("\n"))

    const stepsToRun = stepStatus.filter(d=>d.can && d.need && !d.running)

    logger.info(`${stepsToRun.length} steps to run`, {steps: stepsToRun.map(d=>d.step.plainId)})

    let iteration = 0
    const lastRun = flowInstance.processing?.flow?.last_run?.steps ?? []
    const thisRun = stepsToRun.map(d=>d.step.id)
    if( !options.manual && (thisRun.length === lastRun.length && thisRun.every((v, i) => v === lastRun[i])) ){
        iteration = (flowInstance.processing?.flow?.last_run?.iteration ?? 0) + 1
        if( iteration > 3){
            logger.info(`Tried ${iteration} attempts to run steps ${thisRun.join(", ")} - failing`)
            //await dispatchControlUpdate(flowInstance.id, "processing.flow.last_run", null)
            await dispatchControlUpdate(flowInstance.id, "processing.flow.last_run", {failed: true})
            return
        }
        logger.debug(`Steps same as previous iteration - retrying iteration ${iteration}`)
    }

    if( stepsToRun.length === 0){
        await dispatchControlUpdate(flowInstance.id, "processing.flow.last_run", {completed: true})
        logger.info(`No more steps to run`)
    }else{
        await dispatchControlUpdate(flowInstance.id, "processing.flow.last_run", {steps: thisRun, iteration, started: flowStarted})
        
        for(const step of stepsToRun ){
            await FlowQueue().runStep(step.step, {flowStarted})
        }
    }

}
async function flowInstanceStepsStatus( flowInstance ){
    const {instanceSteps: children, importPrimitives, configPrimitives} = await getInstanceStepsWithImports( flowInstance )
    const instanceSteps = children.filter(d=>!d.parentPrimitives[flowInstance.id].includes("primitives.subfi"))
    const subFlows = children.filter(d=>d.parentPrimitives[flowInstance.id].includes("primitives.subfi"))

    const stepStatus = []
    
    const importCache = importPrimitives.reduce((a,d)=>{
        a[d.id] = d
        return a
    }, {})

    const skipStatus = await PrimitiveConfig.buildFlowInstanceStatus( flowInstance, [...instanceSteps, ...subFlows], {
        getPrimitives: (p)=>(new Proxy(p.primitives ?? {}, PrimitiveParser())),
        fetchPrimitives: async (p)=>await fetchPrimitives( p ),
        getConfig: async (p)=>await getConfig(p),
        relevantInstanceForFlowChain: async (a,b)=>await relevantInstanceForFlowChain(a,b)
    },{
        configPrimitives,
        withPrimitives: true,
        cache: importCache
    })
    const out = []
    for(const d of Object.values(skipStatus)){
        const running = d.need ? await stepIsRunning( d.primitive, flowInstance ) : false
        const {primitive, ...data} = d
        out.push({
            ...data,
            step: primitive,
            subflow: primitive.type === "flowinstance",
            running,
            flowStepId: primitive.type === "flowinstance"  ? primitiveOrigin(primitive) : Object.entries(primitive.parentPrimitives ?? {}).filter(d=>d[1].includes("primitives.config"))?.[0]
        })
    }
    return out
    const activeInstanceSteps = instanceSteps.filter(d=>!skipStatus[d.id].skip)
    for(const step of activeInstanceSteps){
        const status = await stepInstanceStatus(step, flowInstance, importCache)
        console.assert(status.can === skipStatus[step.id].can )
        console.assert(status.canReason === skipStatus[step.id].canReason )
        console.assert(status.needReason === skipStatus[step.id].needReason )
        console.assert(status.need === skipStatus[step.id].need )
        stepStatus.push({
            step,
            flowStepId: Object.keys(step.parentPrimitives ?? {}).find(d=>step.parentPrimitives[d].includes("primitives.config")),
            ...status,
            skip: skipStatus[step.id]?.skip,
            skipForConfiguration: skipStatus[step.id]?.skipForConfiguration,
        })
    }
    for( const subFlow of subFlows){
        const status = await stepInstanceStatus(subFlow, flowInstance, importCache)
        stepStatus.push({
            step: subFlow,
            subflow: true,
            flowStepId: primitiveOrigin(subFlow),
            ...status
        })

    }
    return stepStatus
}
async function stepInstanceStatus( step, flowInstance, cache){
    const should = await shouldStepRun( step, flowInstance, cache)
    const running = should.need ? await stepIsRunning( step, flowInstance ) : false
    return {
        ...should,
        running,
    }
}
async function getFlowInstanceSteps( flowInstance ){
    return await primitiveChildren( flowInstance )
}

async function shouldStepRun( step, flowInstance, cache = {} ){
    let flowStarted = flowInstance.processing?.flow?.started
    let canReason, needReason
    let can = undefined, need = false

    if( 
        (step.type === "flowinstance" && flowStarted && new Date(step.processing?.flow?.started) >= new Date(flowStarted)) ||
        (step.type !== "flowinstance" && flowStarted && step.processing?.flow?.started === flowStarted)
        ){
        if(step.processing?.flow?.status === "complete"){
            needReason = "complete"
        }else{
            need = true
            needReason = "not_complete"
        }
    }else{
        need = true
        needReason = "not_executed"
    }

    if( need ){
        can = true
        canReason = "all_ready"

        async function fetchImports( importIds ){
            let importPrimitives = importIds.map(d=>cache[d]).filter(d=>d)
            if( importPrimitives.length !== importIds.length){
                console.log(`-- Cache miss - fetching importIds`)
                importPrimitives = await fetchPrimitives( importIds )
            }
            return importPrimitives
        } 


        async function checkOutstandingSource( rel ){
            let can = true
            let inAncestor = false
            const pp = (new Proxy(step.primitives ?? {}, PrimitiveParser())).fromPath(rel)
            const importIds = pp.uniqueAllIds
            if( importIds.length > 0){
                const importPrimitives = await fetchImports( importIds)
                for(const baseImp of importPrimitives){
                    let imp = baseImp
                    if( imp.type === "segment"){
                        if( step.type === "flowinstance"){
                            logger.debug(`Got segment import for instance of sub flow`)
                            const parentStep = (await fetchImports( [primitiveOrigin(imp)] ))[0]
                            if( !parentStep || (parentStep.id !== flowInstance.id && !Object.keys(parentStep.parentPrimitives ?? {}).includes( flowInstance.id ))){
                                throw `mismatch on segment origin ${parentStep.id} not a child of flowInstance ${flowInstance.id}`                                
                            }
                            imp = parentStep
                        }else{
                            throw "Need to move to segment origin to get flow step?"
                        }
                    }
                    if( imp.type === "category" ){
                        logger.verbose(`-- Got category ${imp.id} / ${imp.plainId} for ${rel} - checking parent`)
                        const parent = (await fetchImports( [primitiveOrigin(imp)] ))[0]
                        if( parent ){
                            logger.verbose(`-- Got parent of catgeory  = ${parent.id} / ${parent.plainId}`)
                            imp = parent
                        }else{
                            logger.verbose(`-- Couldnt get parent`)
                        }

                    }
                    if( imp.id !== flowInstance.id){
                        if( !Object.keys(imp.parentPrimitives ?? {}).includes(flowInstance.id) ){
                            logger.verbose(`-- ${imp.id} / ${imp.plainId} not in this flow instance - checking ancestors`)
                            const chainResult = await relevantInstanceForFlowChain( [imp], [flowInstance.id])
                            if( chainResult.length === 0){
                                logger.error(`${imp.id} / ${imp.plainId} is not linked to flow instance ${flowInstance.id} / ${flowInstance.plainId} for ${step.id} / ${step.plainId}`)
                                can = false
                                continue
                            }else{
                                inAncestor = true
                                logger.verbose(`-- found in ancestor chain`)
                            }
                        }
                    }
                    const isSameFlow       = imp.id === flowInstance.id;
                    const hasValidStart    = flowStarted !== undefined;
                    const otherFlowStarted = imp.processing?.flow?.started;
                    const isComplete       = imp.processing?.flow?.status === "complete";

                    const timingOk = !inAncestor ? otherFlowStarted === flowStarted : otherFlowStarted <= flowStarted;
                    const importPrimValid = isSameFlow || (hasValidStart && isComplete && timingOk);

                    logger.debug(`Checking status of ${rel} step ${imp.id} / ${imp.plainId} = ${importPrimValid} for ${step.id} / ${step.plainId}`)
                    can = can && importPrimValid
                }
            }
            return !can
        }
        const waitImports = await checkOutstandingSource( "imports" )
        const waitInputs = await checkOutstandingSource( "inputs" )
        let waitAxis = false
        if( step.type === "view" || step.type === "query" ){
            const waitAxisCol = await checkOutstandingSource( "axis.column" )
            const waitAxisRow = await checkOutstandingSource( "axis.row" )
            waitAxis = waitAxisCol || waitAxisRow
        }
        if( waitImports || waitInputs || waitAxis){
            canReason = ""
            if( waitImports){
                canReason = "data_"
            }
            if( waitInputs){
                canReason += "inputs_"
            }
            if( waitAxis){
                canReason += "axis_"
            }
            canReason += "not_ready"
            can = false
        }
    }


    return {can, need, canReason, needReason}
}
async function stepIsRunning( step ){
    const status = await FlowQueue().stepStatus(step)
    return status.running || status.waiting
}
export async function runStep( step, options = {}){
    let flowInstance = options.flowInstance ?? (await primitiveParentsOfType(step, "flowinstance"))?.[0]
    let flowStarted = options.flowStarted ?? flowInstance.processing?.flow?.started
    let newIteration = step.processing?.flow?.started !== flowStarted

    let currentState = step.processing.flow ?? {}
    dispatchControlUpdate(step.id, "processing.flow", {...currentState, status: "running", started: flowStarted, singleStep: options.singleStep})
    //if( newIteration ){
    //}
    if(false){
        logger.info(`Delaying for 10 seconds`)
        await new Promise((resolve)=>setTimeout(()=>resolve(), 10000))
        return
    }

    if( step.type === "categorizer"){
        await doPrimitiveAction(step, "run_categorizer", {flowStarted, flow: true} )

    }else if( step.type === "actionrunner"){
        const config = await getConfig( step )
        if( config?.action ){
            await doPrimitiveAction(step, "run_runner", {action: config.action, flowStarted, newIteration, flow: true, force: options.singleStep})
        }else if( config?.generator ){
            await doPrimitiveAction(step, "run_generator", {generator: config?.generator, flowStarted, newIteration, flow: true, force: options.singleStep})
        }else{
            logger.error(`No acton defined for ${step.id} / ${step.plainId} action runner`)
        }
    }else if( step.type === "action"){
        const catgeory = await Category.findOne({id: step.referenceId})
        if( catgeory?.actions?.[0] ){
            await doPrimitiveAction(step, catgeory.actions[0].key, {flowStarted, flow: true} )
        }
    }else if( step.type === "search"){
        await doPrimitiveAction(step, "run_search", {flowStarted, flow: true} )
    }else if( step.type === "summary"){
        await doPrimitiveAction(step, "rebuild_summary", {flow: true} )
    }else if( step.type === "query"){
        await doPrimitiveAction(step, "custom_query", {flow: true} )
    }else if( step.type === "flowinstance"){
        await FlowQueue().runFlowInstance(step,{...options, force: true})
    }else{
        logger.error(`Unhandled step type '${step.type}' in runStep`)
    }

}