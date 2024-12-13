import { getLogger } from './logger';
import QueueManager from './queue_manager';
import { registerQueue } from './queue_register';
import { dispatchControlUpdate, fetchPrimitive } from './SharedFunctions';

export class BaseQueue {
    constructor(queueName, processQueue = undefined, concurrency = 3) {
        registerQueue(queueName, this)
        this.logger = getLogger(`${queueName}-queue`);
        this._queue = new QueueManager(queueName, processQueue, concurrency);
        this._queue.parentObject = this
        this.queueName = queueName
        this.notifyTracker = {}
    }

    async pending() {
        return await this._queue.status();
    }

    async purge(workspaceId) {
        if (workspaceId) {
            return await this._queue.purgeQueue(workspaceId);
        } else {
            return await this._queue.purgeAllQueues();
        }
    }

    async getJob(...args) {
        return await this._queue.getJob(...args);
    }

    async addJob(workspace, data, jobOptions) {
        dispatchControlUpdate(data.id, data.field, { status: "pending", pending: new Date().toISOString(), track: data.id });
        return await this._queue.addJob(workspace, data, jobOptions);
    }

    async addJobResponse(...args) {
        return await this._queue.addJobResponse(...args);
    }

    async getChildWaiting(...args) {
        return await this._queue.getChildWaiting(...args);
    }

    async resetChildWaiting(...args) {
        return await this._queue.resetChildWaiting(...args);
    }
    async sendNotification(...args){
        await this._queue.sendNotification(...args)
    }

    registerNotification(mode, callback){
        this.notifyTracker[mode] = callback
    }
    registerChildNotification(mode, callback){
        this.notifyTracker["_child_" + mode] = callback
    }

    async notify(job, result, childJob) {
        let status 
        if( result.started){
            status = "running"
        }else if(result.success === true){
            status = "completed"
        }else if(result.success === false){
            status = "failed"
        }
        this.logger.info("Got notification", { id:job.id, status, childJob });

        const prim = await fetchPrimitive( job.id )
        if( prim ){
            const update = {
                ...(prim.processing?.[job.mode] ?? {}),
                status, 
                [status]: new Date().toISOString(), 
                track: job.id
            }
            dispatchControlUpdate(job.id, `processing.${job.mode}`, update);

            if( childJob ){
                if( this.notifyTracker["_child_" + job.mode]){
                    const [childId, childMode] = childJob.split("-")
                    const child = await fetchPrimitive( childId)
                    await this.notifyTracker["_child_" + job.mode](prim, child, result, childMode, job.mode)
                }
            }else{
                if( this.notifyTracker[job.mode]){
                    await this.notifyTracker[job.mode](prim, result, job.mode)
                }
            }
        }
    }

    async myInit() {
        console.log(`${this.queueName} initialized`);
    }
}