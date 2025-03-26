import { registerAction } from "./action_helper";
import { getLogger } from "./logger";
import { addRelationship, createPrimitive, dispatchControlUpdate, doPrimitiveAction, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, getConfig, getFilterName, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentsOfType, primitivePrimitives, removeRelationship } from "./SharedFunctions";
import { checkAndGenerateSegments, getItemsForQuery, getSegemntDefinitions } from "./task_processor";
import PrimitiveParser from './PrimitivesParser';
import FlowQueue from "./flow_queue";
import Category from "./model/Category";
import Primitive from "./model/Primitive";
import { SIO } from "./socket";


registerAction("new_flow_instance", undefined, async (primitive, a, options)=>{
    const inputType = options.type ?? "result"
    const inputReferenceId = options.referenceId ?? 35
    const inputSourceId = primitive.primitives.imports[0]
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

registerAction("run_flowinstance_from_step", undefined, async (p,a,o)=>FlowQueue().runFlowInstance(p,{...o, force: true, fromStep: o.from}))
registerAction("run_step", undefined, async (p,a,o)=>FlowQueue().runStep(p,{...o, singleStep: true}))
registerAction("run_flow", {id: "flow"}, async (p,a,o)=>FlowQueue().runFlow(p,o))
registerAction("run_flow_instance", {id: "flowinstance"}, async (p,a,o)=>FlowQueue().runFlowInstance(p,{...o, force: true}))
registerAction("continue_flow_instance", {id: "flow"}, async (p,a,o)=>FlowQueue().runFlowInstance(p, {...o, manual: true}))
registerAction("step_info", undefined, async (p,a,o)=>{
    let flowInstance = o.flowInstance ?? (await primitiveParentsOfType(p, "flowinstance"))?.[0]
    if( flowInstance ){
        const status = await stepInstanceStatus(p, flowInstance)
        return status
    }
})
registerAction("instance_info", {id: "flowinstance"}, async (p,a,o)=>flowInstanceStatus(p,o))
registerAction("workflow_info", {id: "flow"}, async (p,a,o)=>getScaffoldWorkflow(p,{...(o ?? {}), create: false}))
registerAction("instance_scaffold", {id: "flow"}, async (p,a,o)=>{
    const flow = (await primitiveParentsOfType(p, "flow"))?.[0]
    const result = await scaffoldWorkflowInstance( p, flow, undefined, {create: true} )
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
        await scaffoldWorkflowInstance(newPrim, flow, undefined, {create: true})
    }
    return newPrim
}

export async function scaffoldWorkflow( flow, options = {} ){
    const isSubFlow = flow.flowElement === true
    if( isSubFlow && !options.subFlowForInstanceId ){
        throw "Cant scaffold subflow without parent flow instance"
    }
    let parentFlow = flow.flowElement ? await fetchPrimitive( primitiveOrigin(flow) ) : undefined

    const parser = PrimitiveParser()
    const pp = new Proxy(flow.primitives, parser)
    let customAxis 
    const items = await primitiveChildren( flow )
    const steps = items.filter(d=>d.type !== "flowinstance")
    const baseInstances = items.filter(d=>d.type === "flowinstance")
    const importIds = pp.imports.allIds
    let sources
    if( importIds.length ){
        sources = await fetchPrimitives( importIds )
        if( isSubFlow ){
            const instanceSources =[]
            for(const source of sources){
                if(!source.flowElement){
                    throw `${source.id} is not a flow element in trying to scaffold subflow ${flow.id}`
                }
                const instanceSteps = await primitivePrimitives( source, "primitives.config" )
                const sourceForInstance = instanceSteps.find(d=>Object.keys(d.parentPrimitives).includes( options.subFlowForInstanceId ))
                if( sourceForInstance ){
                    logger.debug(`- Found instance step for subflow import ${sourceForInstance.id} / ${sourceForInstance.plainId}`)
                    instanceSources.push( sourceForInstance)
                }else{
                    logger.debug(`- Couldnt find instance step for subflow import ${flow.id} / ${flow.plainId} - ${options.subFlowForInstanceId}, parent ${parentFlow.id}`)
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
            
            const segments = await checkAndGenerateSegments( source, flow, {...options, by_axis: true})
            logger.debug(`-- got ${segments.length} segments`, {flow: flow.id, source: source.id});
            
    throw "done"
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
                                title: `Instance of ${flow.plainId}`,
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
                await scaffoldWorkflowInstance( instanceInfo.instance, flow, steps, options)
            }
        }
    }else{
        logger.info(`Flow fed from inputs`);
        for(const instance of baseInstances){
            await scaffoldWorkflowInstance( instance, flow, steps, options)
        }
    }
}

export async function scaffoldWorkflowInstance( flowInstance, flow, steps, options = {} ){
    const parser = PrimitiveParser()
    const pp = new Proxy(flow.primitives, parser)

    logger.info( "Flow instances:")
    const flowPrimitiveParser = new Proxy(flow.primitives ?? {}, PrimitiveParser())
    
    if(!steps){
        const items = await primitiveChildren( flow )
        steps = items.filter(d=>d.type !== "flowinstance")
    } 

    const instanceSteps = []
    logger.info( "Flow instance ", {id: flowInstance.id})
    const instanceStepsForFlow = await primitiveChildren( flowInstance )

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
    const importCache = importPrimitives.reduce((a,d)=>{
        a[d.id] = d
        return a
    }, {})

    for(const step of steps){
        //let stepInstance = instanceStepsForFlow.find(d2=>Object.keys(d2.parentPrimitives).includes(step.id))
        let stepInstance = instanceStepsForFlow.find(d2=>d2.parentPrimitives?.[step.id]?.includes("primitives.config"))
        if( stepInstance ){
            logger.info(` - Step instance ${stepInstance.id} for ${step.id}`)
                dispatchControlUpdate(stepInstance.id, "flowElement", false)
        }else{
            logger.info(` - Missing step instance for ${step.id}`)
            if( options.create !== false ){
                try{
                    stepInstance = await duplicateStep( step, flowInstance)
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
            ...(await stepInstanceStatus(stepInstance, flowInstance, importCache))
        } )
    }
    logger.info(`Check outputs`)
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
                logger.debug(`Cant find instance of ${source} `)
                if( options.create ){
                    throw "Missing step"
                }
            }

        }
    }
    await alignPrimitiveRelationships( flowInstance, targetImports, "outputs", options.create)

    logger.info(`Checking relationship mapping`)
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
                        const originalImportStep = steps.find(d=>d.id === importId)
                        if( originalImportStep ){
                            const mappedImportStep = instanceSteps.find(d=>d.stepId === originalImportStep.id)
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
                                logger.debug(` - Instance target is categroizer - redirecting to nested primitive ${internalId}`)

                                targetImports.push({id: internalId, filters: mappedFilters, paths} )
                            }else{
                                targetImports.push({id: mappedImportStep.instance.id, filters: mappedFilters, paths} )
                            }
                        }else{
                            if( mappedStep.instance.type === "page"){
                                logger.debug(`Importing from something other than flow or step id = ${importId} - currently in page, assume element?`)
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
    
    logger.debug(`${toAdd.length} ${rel} to add, ${toRemove.length} ${rel} to remove`)
    
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
            
            dispatchControlUpdate(targetPrimitive.id, "referenceParameters.importConfig", importConfig)
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
        const nested = (await primitiveChildren( step, "category"))[0]
        if( nested){
            logger.info(`Adding nested category for categrizer (${stepInstance.id}) (inheriting from ${nested.id} / ${nested.referenceId}`)
            await createPrimitive({
                workspaceId: step.workspaceId,
                parent: stepInstance.id,
                data:{
                    type: nested.type,
                    referenceId: nested.referenceId,
                    title: `Category for ${stepInstance.plainId}`
                }
            })
        }

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
    let flowStarted = options.flowStarted ?? flowInstance.processing?.flow?.last_run?.started ?? flow.processing?.flow?.started
    if( options.force || !flowStarted){
        flowStarted = new Date().toISOString()

    }
    if( flowInstance.processing?.flow?.started === flowStarted ){
        logger.info(`Flow instance already started for this iteration`)
        newIteration = false
    }else{
        await dispatchControlUpdate(flowInstance.id, "processing.flow", {status: "running", started: flowStarted})
        flowInstance = await fetchPrimitive( flowInstance.id )
        const instanceSteps = await getFlowInstanceSteps(flowInstance)
        let stepsToWait = instanceSteps.map(d=>d.id)
        const stepsToUpdate = []
        if( options.fromStep ){
            const fromStep = instanceSteps.find(d=>d.id === options.fromStep)
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
            followStep( fromStep )

            const stepsAsDone = stepsToWait.filter(d=>!stepsToUpdate.includes(d))

            logger.debug(`Found ${stepsAsDone.length} steps to mark as complete`)
            for(const d of stepsAsDone){
                logger.debug(` - D ${instanceSteps.find(d2=>d2.id === d).plainId}`)
            }
            for(const d of stepsToUpdate){
                logger.debug(` - U${instanceSteps.find(d2=>d2.id === d).plainId}`)
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

    logger.debug(stepStatus.map(d=>`${d.step.id} / ${d.step.plainId} / ${d.step.type} - N ${d.need} (${d.needReason}) C ${d.can} (${d.canReason})` ).join("\n"))

    const stepsToRun = stepStatus.filter(d=>d.can && d.need)

    logger.info(`${stepsToRun.length} steps to run`, {steps: stepsToRun.map(d=>d.step.plainId)})
    

    let iteration = 0
    const lastRun = flowInstance.processing?.flow?.last_run?.steps ?? []
    const thisRun = stepsToRun.map(d=>d.step.id)
    if( !options.manual && (thisRun.length === lastRun.length && thisRun.every((v, i) => v === lastRun[i])) ){
        iteration = (flowInstance.processing?.flow?.last_run?.iteration ?? 0) + 1
        if( iteration > 3){
            logger.info(`Tried ${iteration} attempts to run steps ${thisRun.join(", ")} - failing`)
            await dispatchControlUpdate(flowInstance.id, "processing.flow.last_run", null)
            return
        }
        logger.debug(`Steps same as previous iteration - retrying iteration ${iteration}`)
    }

    if( stepsToRun.length === 0){
        await dispatchControlUpdate(flowInstance.id, "processing.flow.last_run", null)
        logger.info(`No more steps to run`)
    }else{
        await dispatchControlUpdate(flowInstance.id, "processing.flow.last_run", {steps: thisRun, iteration, started: flowStarted})
        
        for(const step of stepsToRun ){
            await FlowQueue().runStep(step.step, {flowStarted})
        }
    }

}
async function flowInstanceStepsStatus( flowInstance ){
    const instanceSteps = await getFlowInstanceSteps(flowInstance)
    const stepStatus = []

    const importPrimitiveIds = instanceSteps.flatMap(d=>{
        const pp = (new Proxy(d.primitives ?? {}, PrimitiveParser()))
        return [pp.imports.uniqueAllIds, pp.inputs.uniqueAllIds,]
    }).flat().filter((d,i,a)=>a.indexOf(d) === i)
    console.log(`Pre cached ids = ${importPrimitiveIds.length}`)
    const importPrimitives = await fetchPrimitives( importPrimitiveIds )
    const importCache = importPrimitives.reduce((a,d)=>{
        a[d.id] = d
        return a
    }, {})

    for(const step of instanceSteps){
        const status = await stepInstanceStatus(step, flowInstance, importCache)
        stepStatus.push({
            step,
            flowStepId: Object.keys(step.parentPrimitives ?? {}).find(d=>step.parentPrimitives[d].includes("primitives.config")),
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

    if( (step.processing?.flow?.started === flowStarted) && flowStarted){
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

    if(true || need ){
        can = true
        canReason = "all_ready"


        async function checkOutstandingSource( rel ){
            let can = true
            const pp = (new Proxy(step.primitives ?? {}, PrimitiveParser()))[rel]
            //const importIds = Object.values(step.primitives?.[rel] ?? {})
            const importIds = pp.uniqueAllIds
            if( importIds.length > 0){
                let importPrimitives = importIds.map(d=>cache[d]).filter(d=>d)                
                if( importPrimitives.length !== importIds.length){
                    console.log(`-- Cache miss - fetching importIds`)
                    importPrimitives = await fetchPrimitives( importIds )
                }
                for(const imp of importPrimitives){
                    if( imp.type === "segment"){
                        throw "Need to move to segment origin to get flow step?"
                    }
                    if( imp.id !== flowInstance.id){
                        if( !Object.keys(imp.parentPrimitives ?? {}).includes(flowInstance.id) ){
                            logger.error(`${imp.id} / ${imp.plainId} is not linked to flow instance ${flowInstance.id} / ${flowInstance.plainId} for ${step.id} / ${step.plainId}`)
                            can = false
                            continue
                        }
                    }
                    const importPrimValid = (imp.id === flowInstance.id) || (imp.processing?.flow?.started === flowStarted && (flowStarted !== undefined) && imp.processing?.flow?.status === "complete")
                    logger.debug(`Checking status of import step ${imp.id} / ${imp.plainId} = ${importPrimValid} for ${step.id} / ${step.plainId}`)
                    can = can && importPrimValid
                }
            }
            return !can
        }
        const waitImports = await checkOutstandingSource( "imports" )
        const waitInputs = await checkOutstandingSource( "inputs" )
        if( waitImports && waitImports ){
            canReason = "data_inputs_not_ready"
            can = false
        }else if( waitImports ){
            canReason = "data_not_ready"
            can = false
        }else if( waitInputs ){
            canReason = "inputs_not_ready"
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

    dispatchControlUpdate(step.id, "processing.flow", {status: "running", started: flowStarted, singleStep: options.singleStep})
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
    }else{
        logger.error(`Unhandled step type '${step.type}' in runStep`)
    }

}