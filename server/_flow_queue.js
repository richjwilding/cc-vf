import QueueManager from './queue_manager'; 
import { getLogger } from './logger';
import Primitive from "./model/Primitive";
import { dispatchControlUpdate, fetchPrimitive } from './SharedFunctions';
import { runFlow, runFlowInstance, scaffoldWorkflow } from './workflow';

const logger = getLogger('workflow-queue'); // Debug level for moduleA

let instance
let _queue

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
    }

}

export default function FlowQueue(){    
    if( instance ){
        return instance
    }
    

    instance = {
        stepStatus: async (primitive)=>{
            const primitiveId = primitive.id
            const workspaceId = primitive.workspaceId

            const jobs = await _queue.getJobStatus( workspaceId, {id: primitiveId, mode: "run_step"})
            let running = false, waiting = false
            for(const d of jobs){
                const status = d.getState()
                running ||= status === "active"
                waiting ||= status === "waiting"

            }
            return {running, waiting}
        },
        scaffoldWorkflow:async (primitive, options)=>{
            const primitiveId = primitive.id
            const workspaceId = primitive.workspaceId
            const field = "processing.scaffold_workflow"
            
            await  _queue.addJob(workspaceId, {id: primitiveId,  mode: "scaffold_workflow", field, options})
            
            dispatchControlUpdate(primitiveId, field , {status: "pending"}, {track: primitiveId})
        },
        runFlow: async (primitive)=>{
            const primitiveId = primitive.id
            const workspaceId = primitive.workspaceId
            const field = "processing.run_flow_instance"
            
            await _queue.addJob(workspaceId, {id: primitiveId,  mode: "run_flow", field})
            
            dispatchControlUpdate(primitiveId, field , {status: "pending"}, {track: primitiveId})
        },
        runFlowInstance: async (primitive, options)=>{
            const primitiveId = primitive.id
            const workspaceId = primitive.workspaceId
            const field = "processing.run_flow_instance"
            
            await _queue.addJob(workspaceId, {id: primitiveId,  mode: "run_flow_instance", options, field, notify: true})
            
            dispatchControlUpdate(primitiveId, field , {status: "pending"}, {track: primitiveId})
        },
        runStep: async (primitive)=>{
            const primitiveId = primitive.id
            const workspaceId = primitive.workspaceId
            const field = "processing.run_step"
            
            await _queue.addJob(workspaceId, {id: primitiveId,  mode: "run_step", field})
            
            dispatchControlUpdate(primitiveId, field , {status: "pending"}, {track: primitiveId})
        }

    }
    instance.pending = async ()=>{
        return await _queue.status();
    }
    instance.purge = async (workspaceId)=>{
        if( workspaceId ){
            return await _queue.purgeQueue(workspaceId);
        }else{
            return await _queue.purgeAllQueues();

        }
    }
    
    _queue = new QueueManager("flow", /*processQueue*/ undefined, 3);
    instance.getJob = async function (...args) {
        return await _queue.getJob.apply(_queue, args);
    };
    
    instance.addJob = async function (...args) {
        return await _queue.addJob.apply(_queue, args);
    };
    instance.addJobResponse = async function (...args) {
        return await _queue.addJobResponse.apply(_queue, args);
    };
    instance.getChildWaiting = async function (...args) {
        return await _queue.getChildWaiting.apply(_queue, args);
    };
    instance.resetChildWaiting = async function (...args) {
        return await _queue.resetChildWaiting.apply(_queue, args);
    };
    instance.notify = async (job, result)=>{
        logger.info("Got notification ", {job, result, _expand: true})

    }

    instance.myInit = async ()=>{
        console.log("Flow Queue")
    }
    
    return instance
}