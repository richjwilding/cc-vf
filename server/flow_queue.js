import QueueManager from './base_queue'; 
import { getLogger } from './logger';
import Primitive from "./model/Primitive";

const logger = getLogger('workflow-queue'); // Debug level for moduleA

let instance
let _queue

export async function processQueue( job, cancelCheck ){

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
        runStep: (primitive)=>{
            const primitiveId = primitive.id
            const workspaceId = primitive.workspaceId
            const field = "processing.run_step"
            
            _queue.addJob(workspaceId, {id: primitiveId,  mode: "run_step", field})
            
            dispatchControlUpdate(primitiveId, field , {status: "pending"}, {...data, track: primitiveId})
        }

    }
    instance.doQuery = (primitive, options )=>{
        const primitiveId = primitive.id
        const workspaceId = primitive.workspaceId
        const field = "processing.ai.flow"
        const data = {mode: "", text:"Running query", ...options}

        _queue.addJob(workspaceId, {id: primitiveId, ...data, field})
        dispatchControlUpdate(primitiveId, field , {status: "pending"}, {...data, track: primitiveId})
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
    
    instance.myInit = async ()=>{
        console.log("Flow Queue")
    }
    
    return instance
}