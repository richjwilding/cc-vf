import { markActionComplete, registerAction } from "./action_helper";
import { getLogger } from "./logger";
import { addRelationship, createPrimitive, dispatchControlUpdate, doPrimitiveAction, fetchPrimitive, fetchPrimitives, getConfig, getFilterName, primitiveChildren, primitiveDescendents, primitiveParentsOfType, removeRelationship } from "./SharedFunctions";
import { checkAndGenerateSegments, getItemsForQuery, getSegemntDefinitions } from "./task_processor";
import PrimitiveParser from './PrimitivesParser';
import FlowQueue from "./flow_queue";


registerAction("run_step", undefined, async (p,a,o)=>FlowQueue().runStep(p,o))
registerAction("run_flow", {id: "flow"}, async (p,a,o)=>FlowQueue().runFlow(p,o))
registerAction("run_flow_instance", {id: "flowinstance"}, async (p,a,o)=>FlowQueue().runFlowInstance(p,o))
registerAction("workflow_info", {id: "flow"}, async (p,a,o)=>scheduleScaffoldWorkflow(p,{...(o ?? {}), create: false}))
registerAction("workflow_scaffold", {id: "flow"}, async (p,a,o)=>{
    const result = await scheduleScaffoldWorkflow(p, o)
    markActionComplete(p, o)
    return result
})

const logger = getLogger('workflow'); // Debug level for moduleA

export async function scheduleScaffoldWorkflow( flow, options = {} ){
    try{
        await FlowQueue().scaffoldWorkflow(flow,options)
    }catch(e){
        logger.error("Error scheduleScaffoldWorkflow ")
        logger.error(e)
    }
}

export async function scaffoldWorkflow( flow, options = {} ){
    const parser = PrimitiveParser()
    const pp = new Proxy(flow.primitives, parser)
    let customAxis 
    const items = await primitiveChildren( flow )
    const steps = items.filter(d=>d.type !== "flowinstance")
    const sources = await fetchPrimitives( pp.imports.allIds  )
    const baseInstances = items.filter(d=>d.type === "flowinstance")
    let instanceList = []




    logger.info(`Scaffold workflow`, {flow: flow.id});
    logger.info(`Flow has ${steps.length} steps, ${sources.length} sources, ${baseInstances.length} instances`, {primitive: flow.id});
    
    for( const source of sources){
        logger.debug(`-- For ${source.title}`, {flow: flow.id, source: source.id});
        const segments = await checkAndGenerateSegments( source, flow, {...options, by_axis: true})
        logger.debug(`-- got ${segments.length} segments`, {flow: flow.id, source: source.id});

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
                forName: await getFilterName(segment),
                status:{
                }
            })
        }
    }

    logger.info( "Flow instances:")
    for(const instanceInfo of instanceList){
        instanceInfo.steps = []
        if( instanceInfo.instance.missing){
            logger.info( "Missing flow instance for", {segment: instanceInfo.for, name: instanceInfo.forName})
            instanceInfo.steps = steps.map(step=>({
                instance:{
                    missing: true,
                },
                stepId: step.id,
                title: `Instance of ${step.plainId}`
            }))
        }else{
            logger.info( "Flow instance ", {id: instanceInfo.instance.id, segment: instanceInfo.for, name: instanceInfo.forName})
            const instanceStepsForFlow = await primitiveChildren( instanceInfo.instance )
            for(const step of steps){
                let stepInstance = instanceStepsForFlow.find(d2=>Object.keys(d2.parentPrimitives).includes(step.id))
                if( stepInstance ){
                    logger.info(` - Step instance ${stepInstance.id} for ${step.id}`)
                }else{
                    logger.info(` - Missing step instance for ${step.id}`)
                    if( options.create !== false ){
                        try{
                            stepInstance = await duplicateStep( step, instanceInfo.instance)
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
                instanceInfo.steps.push( {
                    instance: stepInstance,
                    stepId: step.id,
                    title: `Instance of ${step.plainId} for ${instanceInfo.instance.plainId}`,
                    ...(await stepInstanceStatus(step, instanceInfo.instance))
                } )
            }
            logger.info(`Checking import mapping`)
            for(const step of steps){
                const mappedStep = instanceInfo.steps.find(d=>d.stepId === step.id)
                if( mappedStep){
                    const importIds = Object.values(step.primitives.imports ?? {})
                    const targetImports = []
                    for(const importId of importIds){
                        if(importId === flow.id){
                            logger.info(`Step ${step.id} / ${step.plainId} imports from flow ${flow.id} - mapping to flow instance ${instanceInfo.instance.id}`)
                            targetImports.push( {id: instanceInfo.instance.id} )
                        }else{
                            const originalImportStep = steps.find(d=>d.id === importId)
                            if( originalImportStep ){
                                const mappedImportStep = instanceInfo.steps.find(d=>d.stepId === originalImportStep.id)
                                logger.info(`Step ${step.id} / ${step.plainId} imports from flow step ${originalImportStep.id} / ${originalImportStep.plainId} - mapping to flow instance ${mappedImportStep.instance.id} / ${mappedImportStep.instance.plainId}`)
                                
                                let filtersForOriginal = step.referenceParameters.importConfig?.filter(d=>d.id === importId) ?? []
                                logger.debug(`-- ${filtersForOriginal} filters to remap for import`)
                                let mappedFilters = filtersForOriginal.map(d=>{
                                    return {
                                        id: mappedImportStep.instance.id,
                                        filters: d.filters.map(d=>{
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
                                
                                
                                targetImports.push({id: mappedImportStep.instance.id, filters: mappedFilters} )
                            }else{
                                throw "Importing from something other than flow or step - possibly nested segemnt??"
                            }
                        }
                    }
                    const currentImports = Object.values(mappedStep.instance.primitives?.imports ?? {})
                    const targetImportIds = targetImports.map(d=>d.id)
                    const toAdd = targetImportIds.filter(d=>!currentImports.includes(d))
                    const toRemove = currentImports.filter(d=>!targetImportIds.includes(d))
                    
                    
                    logger.debug(`${toAdd.length} imports to add, ${toRemove.length} imports to remove`)
                    if( options.create !== false ){
                        for(const importId of toAdd){
                            await addRelationship(mappedStep.instance.id, importId, "imports")
                        }
                        for(const importId of toRemove){
                            await removeRelationship(mappedStep.instance.id, importId, "imports")
                        }
                    }
                    const allFilters = targetImports.map(d=>d.filters).flat().filter(d=>d)
                    let importConfig = allFilters?.length > 0 ? allFilters : null
                    

                    dispatchControlUpdate(mappedStep.instance.id, "referenceParameters.importConfig", importConfig)
                }
            }
        }

    }
    return instanceList
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
    stepInstance = await fetchPrimitive(stepInstance.id)

    return stepInstance
}

export async function runFlow( flow ){
    const flowStarted = new Date().toISOString()
    dispatchControlUpdate(flow, "processing.flow", {status: "running", started: flowStarted})
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
    let flowStarted = options.flowStarted ?? flow.processing.flow.started
    if( flowInstance.processing?.flow?.started === flowStarted ){
        logger.info(`Flow instance already started for this iteration`)
        newIteration = false
    }else{
        dispatchControlUpdate(flowInstance, "processing.flow", {status: "running", started: flowStarted})
    }
    logger.info(`Looking for next steps to run`)
    const stepStatus = await flowInstanceStepsStatus( flowInstance )

    logger.debug(stepStatus.map(d=>`${d.step.id} / ${d.step.plainId} / ${d.step.type} - N ${d.need} (${d.needReason}) C ${d.can} (${d.canReason})` ).join("\n"))

    const stepsToRun = stepStatus.filter(d=>d.can && d.need)

    logger.info(`${stepsToRun.length} steps able to run`)

}
async function flowInstanceStepsStatus( flowInstance ){
    const instanceSteps = await getFlowInstanceSteps(flowInstance)
    const stepStatus = []
    for(const step of instanceSteps){
        const status = await stepInstanceStatus(step, flowInstance)
        stepStatus.push({
            step,
            ...status
        })
    }
    return stepStatus
}
async function stepInstanceStatus( step, flowInstance){
    const should = await shouldStepRun( step, flowInstance)
    const running = should.need ? await stepIsRunning( step, flowInstance ) : undefined
    return {
        ...should,
        running,
    }
}
async function getFlowInstanceSteps( flowInstance ){
    return await primitiveChildren( flowInstance )
}

async function shouldStepRun( step, flowInstance ){
    let flowStarted = flowInstance.processing?.flow?.started
    let canReason, needReason
    let can = undefined, need = false

    if( step.processing?.flow?.started === flowStarted){
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
        const importIds = Object.values(step.primitives?.imports ?? {})
        if( importIds.length > 0){
            const importPrimitives = await fetchPrimitives( importIds )
            for(const imp of importPrimitives){
                if( imp.type === "segment"){
                    throw "Need to move to segment origin to get flow step?"
                }
                if( imp.id !== flowInstance.id){
                    if( !Object.keys(imp.parentPrimitives ?? {}).includes(flowInstance.id) ){
                        throw `${imp.id} / ${imp.plainId} is not linked to flow instance ${flowInstance.id} / ${flowInstance.plainId}`
                    }
                }
                const importPrimValid = (imp.id === flowInstance.id) || (imp.processing?.flow?.started === flowStarted && imp.processing?.flow?.status === "complete")
                logger.debug(`Checking status of import step ${imp.id} / ${imp.plainId} = ${importPrimValid} for ${step.id} / ${step.plainId}`)
                can = can && importPrimValid
            }
            if( !can ){
                canReason = "data_not_ready"
            }
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
    let flowStarted = flowInstance.processing?.flow?.started
    let newIteration = step.processing?.flow?.started !== flowStarted

    if( newIteration ){
        dispatchControlUpdate(step, "processing.flow", {status: "running", started: flowStarted})
    }
    if( step.type === "actionrunner"){
        const config = await getConfig( step )
        if( config?.action ){
            await doPrimitiveAction(step, "run_runner", {action: config.action, flowStarted, newIteration})
        }else{
            logger.error(`No acton defined for ${step.id} / ${step.plainId} action runner`)
        }
    }else{
        logger.error(`${step.type} unhandles in runStep`)
    }

}