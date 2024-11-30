import { registerAction } from "./action_helper";
import { getLogger } from "./logger";
import { addRelationship, createPrimitive, fetchPrimitive, fetchPrimitives, getFilterName, primitiveChildren, primitiveDescendents } from "./SharedFunctions";
import { checkAndGenerateSegments, getItemsForQuery, getSegemntDefinitions } from "./task_processor";
import PrimitiveParser from './PrimitivesParser';


registerAction("workflow_info", {id: "flow"}, (p,a,o)=>scaffoldWorkflow(p,a,{...(o ?? {}), create: false}))
registerAction("workflow_scaffold", {id: "flow"}, scaffoldWorkflow)

const logger = getLogger('workflow'); // Debug level for moduleA

export async function scaffoldWorkflow( flow, action, options = {} ){
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
    
    if (logger.isLevelEnabled('info')) {
        logger.info( "Flow instances:")
        for(const instanceInfo of instanceList){
            if( instanceInfo.instance.missing){
                logger.info( "Missing flow instance for", {segment: instanceInfo.for, name: instanceInfo.forName})
            }else{
                logger.info( "Flow instance ", {id: instanceInfo.instance.id, segment: instanceInfo.for, name: instanceInfo.forName})
                const instanceStepsForFlow = await primitiveChildren( instanceInfo.instance )
                for(const step of steps){
                    let stepInstance = instanceStepsForFlow.find(d2=>Object.keys(d2.parentPrimitives).includes(step.id))
                    if( stepInstance ){
                        logger.info(` - Step instance ${stepInstance.id} for ${step.id}`)
                    }else{
                        logger.info(` - Missing step instance for ${step.id}`)
                        if( true /*options.create !== false */){

                            try{

                                stepInstance = await createPrimitive({
                                    workspaceId: step.workspaceId,
                                    parent: instanceInfo.instance.id,
                                    data:{
                                        type: step.type,
                                        referenceId: step.referenceId,
                                        title: `Instance of ${step.plainId} for ${flow.plainId}`
                                    }
                                })
                            }catch(error){
                                console.log(error)
                                throw `Couldnt create step instance for ${step.id}`
                            }
                            if( stepInstance ){
                                logger.info(` - Created step instance ${stepInstance.id} for ${step.id}`)
                            }

                            await addRelationship(step.id, stepInstance.id, "auto")
                            await addRelationship(step.id, stepInstance.id, "config")
                            stepInstance = await fetchPrimitive(stepInstance.id)
                            
                            if( Object.keys(step.primitives ?? {}).includes("axis")){
                                logger.warn(`Should replicate axis in flow instance ${step.id} / ${stepInstance.id}`)
                            }
                        }
                    }
                }
            }
        }
    }
}
