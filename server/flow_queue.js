import { BaseQueue } from './base_queue';
import { getLogger } from './logger';
import { addRelationship, dispatchControlUpdate, fetchPrimitive, primitiveParentsOfType, removeRelationship } from './SharedFunctions';
import { runFlow, runFlowInstance, scaffoldWorkflow, runStep } from './workflow';

const logger = getLogger('case-queue'); // Debug level for moduleA

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
        super('flow', undefined, 3); // Call the base constructor with queue name and options

        this.registerNotification("run_flow_instance", async (primitive, result, mode, parentJob)=>{
            if( result.success === true){
                if( primitive.processing?.flow.last_run?.steps ){
                    console.log(`Flow instance ${primitive.plainId} finished step`)
                    console.log(`------------------------------------------------------------\n---------- CHECKING FOR NEXT STEP IN FLOW WITHIN CURRENT JOB\n------------------------------------------------------------`)
                    
                    await this._queue.invokeWorkerJob({ id: primitive.id, mode: "run_flow_instance", field:  "processing.run_flow_instance"}, parentJob, {nextStep: true, workspaceId: primitive.workspaceId})

                    return {keepAlive: true}
                }else{
                    console.log(`Flow instance ${primitive.plainId} finished last step`)
                    const update = {
                        ...primitive.processing?.flow,
                        completed: (new Date()).toISOString(),
                        status: "complete"
                    }
                    primitive = await dispatchControlUpdate(primitive.id, "processing.flow", update)
                }
            }
        })
        this.registerNotification("run_step", async (primitive, result, mode, parentJob)=>{
            if( result.success === true){
                console.log(`Step ${primitive.id} ${primitive.plainId} finished`)
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
                    if( primitive.referenceParameters?.fcHandleError === "stop" ){
                        update.status = "error"
                    }else if( primitive.referenceParameters?.fcHandleError === "skip" ){
                        update.status = "error_skip"
                    }else{
                        update.status = "error_ignore"
                    }
                }
                await dispatchControlUpdate(primitive.id, "processing.flow", update)
                
            }else{

            }
        })
        this.registerChildNotification("run_step", async (primitive, child, result, childMode)=>{
            if( primitive && child){
                if( primitive.id !== child.id ){
                    console.log(`Step ${primitive.id} / ${primitive.plainId} finished for child ${child.id} / ${child.plainId} (${childMode})`)

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

        await this.addJob(primitive.workspaceId, { id: primitive.id, mode: "run_step", options, field });
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