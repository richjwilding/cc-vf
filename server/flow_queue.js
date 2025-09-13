import { BaseQueue } from './base_queue';
import { getLogger } from './logger';
import { addRelationship, dispatchControlUpdate, fetchPrimitive, getConfig, primitiveOrigin, primitiveParentsOfType, removeRelationship } from './SharedFunctions';
import { runFlow, runFlowInstance, scaffoldWorkflow, runStep, flowInstanceStepsStatus } from './workflow';
import Primitive from './model/Primitive';

const logger = getLogger('flow-queue', "debug"); // Debug level for moduleA

export async function processQueue( job, cancelCheck ){
    const primitive = await fetchPrimitive( job.data.id )
    const options = job.data.options
    const workspaceId = primitive.workspaceId
    const mode = job.data.mode

    console.log(`Flow queue executing `, job.id, mode)
    switch(mode){
        case "scaffold_workflow":
            await scaffoldWorkflow(primitive, options)
            break
        case "run_flow":
            await runFlow(primitive, options)
            break
        case "run_flow_instance":
            await runFlowInstance(primitive, options)
            break
        case "run_step":
            await runStep(primitive, options)
            break
    }

}

class FlowQueueClass extends BaseQueue {
    constructor() {
        super('flow', undefined, 2); // Call the base constructor with queue name and options

        this.registerNotification("run_flow_instance", async (primitive, result, mode, parentJob)=>{
            if( result.started ){
                console.log(`Flow instance ${primitive.id} / ${primitive.plainId} started notification`)
                return
            }

            console.log(`Flow instance ${primitive.id} / ${primitive.plainId} finished all allocated steps for iteration`)
            /*if( result.success === true){
                if( primitive.processing?.flow.last_run?.steps ){
                    console.log(`Flow instance ${primitive.plainId} finished step`)
                    
                    await this._queue.invokeWorkerJob({ id: primitive.id, mode: "run_flow_instance", field:  "processing.run_flow_instance"}, parentJob, {nextStep: true, workspaceId: primitive.workspaceId})

                    return {keepAlive: true}
                }else if( primitive.processing?.flow.last_run?.still_running ){
                    console.log(`Flow instance ${primitive.plainId} still running - check for new steps`)
                    try{
                        logger.info(`Looking for follow-on steps for ${primitive.id}`)
                        const flowInstance = await fetchPrimitive( primitiveOrigin(primitive) )
                        if( flowInstance.type === "flowinstance"){
                            const stepStatus = await flowInstanceStepsStatus( flowInstance )
                            const stepsToRun = stepStatus.filter(d=>d.can && d.need && !d.running)
                            if( stepsToRun.length > 0){
                                logger.info(`Found new steps (non fast follow-on) - invoking run_flow_instance`)
                                await this._queue.invokeWorkerJob({ id: primitive.id, mode: "run_flow_instance", field:  "processing.run_flow_instance"}, parentJob, {nextStep: true, workspaceId: primitive.workspaceId})
                                return {keepAlive: true}
                            }
                        }
                    }catch(err){
                        logger.error(`Exception thrown looking for next steps post flow completion ${primitive.id}`, err)                    
                    }

                }else{
                    console.log(`Flow instance ${primitive.plainId} finished last step`)
                    const update = {
                        ...primitive.processing?.flow,
                        completed: (new Date()).toISOString(),
                        status: "complete"
                    }
                    primitive = await dispatchControlUpdate(primitive.id, "processing.flow", update)
                }
            }*/
        })
        this.registerChildNotification("run_flow_instance", async (primitive, child, result, childMode, parentMode, parentJob)=>{
            try{

                if( primitive.type === "flowinstance"){
                    logger.debug(`Step finished in flowinstance ${primitive.id} [run_flow_instance] - ${child?.id} [${childMode}] chaining check for next steps (parent: ${JSON.stringify(parentJob)})`)
                    if(!result.started){
                        const counter = result.error ? "error_steps" : "completed_steps"
                        await Primitive.updateOne(
                            { _id: primitive.id },
                            { $inc: { [`processing.flow.audit.${counter}`]: 1 }}
                        );
                    }

                    try{
                        //   const flowInstance = await fetchPrimitive( primitiveOrigin(primitive) )
                        await this._queue.invokeWorkerJob({ id: primitive.id, mode: "run_flow_instance", field:  "processing.run_flow_instance"}, parentJob, {nextStep: true, workspaceId: primitive.workspaceId})
                    }catch(err){
                        logger.error(`Exception thrown looking for fast follow steps ${primitive.id}`, err)                    
                    }
                }
            }catch(err){
                logger.error(`Error in registerChildNotification- run_flow_instance`, err)
            }
        })
        this.registerNotification("run_step", async (primitive, result, mode, parentJob)=>{
            if( result.started ){
                console.log(`Step ${primitive.id} ${primitive.plainId} started notification`)
                return

            }
            console.log(`Step ${primitive.id} ${primitive.plainId} finished ${result.success === true} ${!result.error}`)
            if( result.success === true){
                
                const update = {
                    ...primitive.processing?.flow,
                    status: "complete"
                }
                let handleError = false
                if( result.error){
                    handleError = true
                    update.error = result.error
                }else if( Object.values(update.child ?? {}).find(d=>d.error)){
                    handleError = true
                    update.error = "child_error"
                }
                if( handleError ){
                    const primitiveConfig = await getConfig( primitive )
                    if( primitiveConfig?.fcHandleError === "stop" ){
                        update.status = "error"
                    }else if( primitiveConfig?.fcHandleError === "skip" ){
                        update.status = "error_skip"
                    }else{
                        const isNested = primitive.type === "search"
                        if( isNested && (primitiveConfig?.fcHandleError?.startsWith("stop_") || primitiveConfig?.fcHandleError?.startsWith("skip_"))){
                            const targetPercentage = parseInt(primitiveConfig.fcHandleError.split("_")[1]) / 100
                            const children = (primitive.primitives.origin ?? []).length
                            const targetChildrenCount = Math.floor( children * targetPercentage )
                            const actualChildErrors = Object.values(update.child ?? {}).filter(d=>d.error).length
                            logger.info(`Inspecting child error rate ${actualChildErrors} (${children} total / target ${targetChildrenCount} - ${targetPercentage * 100}%)`)
                            if( actualChildErrors >= targetChildrenCount ){
                                if( primitiveConfig?.fcHandleError?.startsWith("stop_" )){
                                    update.status = "error"
                                }else{
                                    update.status = "error_skip"
                                }
                                logger.info(` - Over threshold for error setting to ${update.status}`)
                            }
                        }else{
                            update.status = "error_ignore"
                        }
                    }
                }
                await dispatchControlUpdate(primitive.id, "processing.flow", update)
                
            }else{
                if( result.error){
                    // Exception thrown rather than graceful error handlie 
                    console.log(`Step ${primitive.id} ${primitive.plainId} finished with exception`)
                    const update = {
                        ...primitive.processing?.flow,
                        status: "error"
                    }
                    await dispatchControlUpdate(primitive.id, "processing.flow", update)
                }
            }
        })
        this.registerChildNotification("run_step", async (primitive, child, result, childMode)=>{
            if( primitive && child){
                if( primitive.id !== child.id ){
                    console.log(`Step ${primitive.id} / ${primitive.plainId} [run_step] finished for child ${child.id} / ${child.plainId} (${childMode})`)

                    let existingRels = (child.parentPrimitives?.[primitive.id] ?? []).filter(d=>d === "done" || d === "fail")
                    let targetRel
                    
                    logger.debug("Existing relationship to remove", existingRels)
                    for(const d of existingRels){
                        await removeRelationship(primitive.id, child.id, d)
                    }

                    const childStatus = primitive.processing?.flow?.child ?? {}
                    let writeChildStatus = false
                    if( result.error){
                        childStatus[child.id] = {error: result.error}
                        writeChildStatus = true
                    }else{
                        if( childStatus[child.id] ){
                            delete childStatus[child.id]
                            writeChildStatus = true
                        }
                    }
                    if( writeChildStatus ){
                        await dispatchControlUpdate(primitive.id, "processing.flow.child", childStatus)
                    }
                    
                    if( result.success === true){
                        targetRel = "done"
                    }else{
                        targetRel = "fail"
                    }
                    if( targetRel ){
                        await addRelationship(primitive.id, child.id, targetRel)
                        logger.debug(`-- ${primitive.id} => ${child.id} : ${targetRel}`)
                    }
                }else{
                    if( primitive.type === "flowinstance" ){
                        logger.debug(`Flowinstance primitive completed child action ${childMode} `)
                        if( childMode === "run_flow_instance" ){
                            logger.debug(` -- Nested flow ${primitive.id} completed in run_step`)
                            if( primitive.processing?.flow?.status !== "complete"){
                                return {keepAlive: true}
                            }                                
                        }
                    }
                }
            }
        })
    }


    async stepStatus(primitive) {
        const primitiveId = primitive.id;

        const jobs = await this._queue.getJobStatus(primitive.workspaceId, { id: primitiveId, mode: "run_step" });
        let running = false, waiting = false;

        for (const d of jobs) {
            const status = await d.getState();
            running ||= status === "active";
            waiting ||= status === "waiting-children";
        }

        return { running, waiting };
    }

    async scaffoldWorkflow(primitive, options) {
        const field = "processing.scaffold_workflow";

        await this.addJob(primitive.workspaceId, { id: primitive.id, mode: "scaffold_workflow", field, options });
    }

    async runFlow(primitive) {
        const field = "processing.run_flow";

        await this.addJob(primitive.workspaceId, { id: primitive.id, mode: "run_flow", field });
    }

    async runFlowInstance(primitive, options) {
        const field = "processing.run_flow_instance";

        await this.addJob(primitive.workspaceId, { id: primitive.id, mode: "run_flow_instance", options, field, notify: true });
    }

    async runStep(primitive, options) {
        const field = "processing.run_step";
        const lockStepForExecution = await Primitive.updateOne(
            {
                _id: primitive.id,
                workspaceId: primitive.workspaceId,
                $or:[
                    {"processing.run_step.flowStarted": {$ne: options.flowStarted}}
                ]
            },{
                $set: {"processing.run_step.flowStarted": options.flowStarted}
            }
        )
        if( lockStepForExecution.modifiedCount > 0 ) {
            await this.addJob(primitive.workspaceId, { id: primitive.id, mode: "run_step", updateFields: {flowStarted: options.flowStarted}, options, field });
        }else{
            logger.debug(`Could not secure lock for ${primitive.id} for run_step`)
        }
    }
}

let instance;

export default function FlowQueue() {
    if (!instance) {
        instance = new FlowQueueClass();
        instance.myInit();
    }
    return instance;
}