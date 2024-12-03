import { markActionComplete, registerAction } from "./action_helper";
import { getLogger } from "./logger";
import { addRelationship, createPrimitive, fetchPrimitive, fetchPrimitives, getFilterName, primitiveChildren, primitiveDescendents, removeRelationship } from "./SharedFunctions";
import { checkAndGenerateSegments, getItemsForQuery, getSegemntDefinitions } from "./task_processor";
import PrimitiveParser from './PrimitivesParser';
import FlowQueue from "./flow_queue";


registerAction("workflow_info", {id: "flow"}, (p,a,o)=>scaffoldWorkflow(p,{...(o ?? {}), create: false}))
registerAction("workflow_scaffold", {id: "flow"}, async (p,a,o)=>{
    const result = await scaffoldWorkflow(p, o)
    markActionComplete(p, o)
    return result
})

const logger = getLogger('workflow'); // Debug level for moduleA

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
                        }else{
                            const originalImportStep = steps.find(d=>d.id === importId)
                            if( originalImportStep ){
                                const mappedImportStep = instanceInfo.steps.find(d=>d.stepId === originalImportStep.id)
                                logger.info(`Step ${step.id} / ${step.plainId} imports from flow step ${originalImportStep.id} / ${originalImportStep.plainId} - mapping to flow instance ${mappedImportStep.instance.id} / ${mappedImportStep.instance.plainId}`)
                                targetImports.push(mappedImportStep.instance.id )
                            }else{
                                throw "Importing from something other than flow or step - possibly nested segemnt??"
                            }
                        }
                    }
                    const currentImports = Object.values(mappedStep.instance.primitives?.imports ?? {})
                    const toAdd = targetImports.filter(d=>!currentImports.includes(d))
                    const toRemove = currentImports.filter(d=>!targetImports.includes(d))
                    logger.debug(`${toAdd.length} imports to add, ${toRemove.length} imports to remove`)
                    if( options.create !== false ){
                        for(const importId of toAdd){
                            await addRelationship(mappedStep.instance.id, importId, "imports")
                        }
                        for(const importId of toRemove){
                            await removeRelationship(mappedStep.instance.id, importId, "imports")
                        }
                    }
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

async function runFlow( flow ){
    const flowInstances = await scaffoldWorkflow(flow)
    for( const flowInstance of flowInstances ){
        if( !flowInstance.instance.missing ){
            logger.info(`Scheduling run for ${flowInstance.instance.id} / ${flowInstance.instance.plainId} (of flow ${flow.id} / ${flow.plainId})`)
        }
    }
}
async function runFlowInstance( flowInstance ){
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
async function stepInstanceStatus( step, flowInstance ){
    const {can, need} = await shouldStepRun( step, flowInstance)
    const running = await stepIsRunning( step, flowInstance )
    return {
        can,
        running,
        need
    }
}
async function getFlowInstanceSteps( flowInstance ){
    return await primitiveChildren( flowInstance )
}

async function shouldStepRun( step, flowInstance){
    let canReason, nedReason



    return {can: true, need: true, canReason, nedReason}
}
async function stepIsRunning( step ){
    const status = await FlowQueue().stepStatus(step)
    return status.running || status.waiting
}
async function runStep( step, flowInstance){
}