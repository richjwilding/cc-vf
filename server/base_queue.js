import { createClient } from 'redis';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { Worker as WorkerThread } from 'worker_threads';
import path from 'path';
import { SIO } from './socket';

class QueueManager {
    constructor(
            type, 
            callback,
            numWorkersPerQueue = 1, 
            redisOptions ={
                host: process.env.QUEUES_REDIS_HOST, 
                port: process.env.QUEUES_REDIS_PORT,
            },
            settings ={
                maxStalledCount: 0,
                removeOnFail: true,
                stalledInterval:300000

            },
            idleTimeBeforePurge = 300000 ) { 
        this.type = type;
        this.numWorkersPerQueue = numWorkersPerQueue;
        this.idleTimeBeforePurge = idleTimeBeforePurge;
        this.queues = {};
//        this.queueEvents = {};
        this.workers = {};
        this.workerThreads = []
        this.connection = redisOptions
        this.settings = settings

        this.processCallback = callback
        this.redis = createClient({socket: {host: redisOptions.host, port: redisOptions.port}});

        this.redis.connect().catch(console.error);

        console.log(`QUEUE MANAGER INIIT ${this.type}`)
        console.log(this.connection)
        if( !this.processCallback ){
            let readyCount = 0
            for (let i = 0; i < this.numWorkersPerQueue; i++) {
                console.log(`-- ${this.type} Thread ${i}`)
                let worker = new WorkerThread(path.resolve(__dirname, './job-worker.js'), {
                    workerData: {
                        queueName: type,
                        type: this.type,             // Pass the queue type to workerData
                        redisOptions: this.connection
                    }
                });
                worker.on('message', async (message) => {
                    if (message.type === 'startJob') {
                        console.log(`Job has started in worker ${message.queueName} / ${worker.threadId} - ${message.jobId}`)
                        this.setQueueActivity(message.queueName, true);
                    }else if (message.type === 'endJob') {
                        console.log(`Job has ended in worker ${message.queueName} - ${message.jobId}`)
                        this.setQueueActivity(message.queueName, false);
                        await this.redis.del(`job:${message.jobId}:cancel`);
                    }else if (message.type === 'notifyPrimitiveEvent') {
                        const { workspaceId, message: data } = message.data;
                        SIO.notifyPrimitiveEvent(workspaceId, JSON.parse(data));
                    }else if(message.type === "ready"){
                        readyCount++
                        console.log(`${readyCount} worker(s) ready for ${type}`)
                        if(readyCount === this.numWorkersPerQueue ){
                            console.log(`starting ${type} queues`)
                            this.initializeActiveQueues();
                            this.startIdleCheck();
                        }
                    }
                });
                worker.on('error', (error) => {
                    console.error(`Error in worker for queue ${this.type}:`, error);
                });
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        console.log(`Worker for queue ${this.type} exited with code ${code}`);
                    }
                });
                this.workerThreads.push(worker)

            }

        }else{
            this.initializeActiveQueues();
            this.startIdleCheck();
        }
    }

    async initializeActiveQueues() {
        // Retrieve active queues from Redis
        const activeQueues = await this.redis.sMembers('activeQueues');
        for(const queueName of activeQueues ){
            const [workspaceId, type] = queueName.split('-')
            if( type !== this.type){
                continue
            }
            const { activeCount, lastActivity } = await this.getQueueActivity(queueName);
            if (activeCount > 0 ) {
                console.log(`Have ${activeCount} items in queue ${queueName}- starting`)
                this.getQueue(workspaceId);
            }else{
                if( lastActivity === null ){
                    console.log(`No active items in queue  ${queueName} - removing`)
                    await this.redis.del(`${queueName}-activeCount`);
                    await this.redis.del(`${queueName}-lastActivity`);
                    await this.redis.sRem('activeQueues', queueName);
                }else{
                    console.log(`Have ${activeCount} items waiting in queue ${queueName} - starting`)
                    this.getQueue(workspaceId);
                }
            }
        }
    }

    async markQueueActive(workspaceId) {
        await this.redis.sAdd('activeQueues', `${workspaceId}-${this.type}`);
    }

    async markQueueInactive(workspaceId) {
        await this.redis.sRem('activeQueues', `${workspaceId}-${this.type}`);
    }

    async setQueueActivity(queueName, isActive) {
        const activeCountKey = `${queueName}-activeCount`;
        if (isActive) {
            await this.redis.incr(activeCountKey);
        } else {
            const count = await this.redis.decr(activeCountKey);
            if (count < 0) {
                // Ensure the count does not go below zero
                await this.redis.set(activeCountKey, '0');
            }
        }
        await this.updateQueueActivity(queueName);
    }

    
    async updateQueueActivity(queueName) {
        await this.redis.set(`${queueName}-lastActivity`, Date.now().toString());
    }

    async resetCancelJob(jobId) {
        await this.redis.del(`job:${jobId}:cancel`);
    }

    async cancelJob(jobId) {
        await this.redis.set(`job:${jobId}:cancel`, 'true');
    }

    async checkIfJobCancelled(jobId) {
        const isCancelled = await this.redis.get(`job:${jobId}:cancel`);
        console.log(`Checking if  ${jobId} cancelled `, isCancelled )
        return isCancelled === 'true';
    }

    async getQueueActivity(queueName) {
        const activeCount = await this.redis.get(`${queueName}-activeCount`);
        const lastActivity = await this.redis.get(`${queueName}-lastActivity`);
        return {
            activeCount: parseInt(activeCount) || 0,
            lastActivity: lastActivity ? parseInt(lastActivity) : null
        };
    }

    startIdleCheck() {
        setInterval(async () => {
            const now = Date.now();
            for (const queueName in this.queues) {
                const { activeCount, lastActivity } = await this.getQueueActivity(queueName);
                if (activeCount === 0 && lastActivity && now - lastActivity > this.idleTimeBeforePurge) {
                    console.log(`Purging queue for timeout`)
                    await this.purgeQueue(queueName.split('-')[0]);
                }
            }
        }, this.idleTimeBeforePurge);
    }

    async teminateJobsInQueue(workspaceId){
        const queueName = `${workspaceId}-${this.type}`;
        const queue = this.queues[queueName];
        const jobs = await queue.getJobs(['active']);
        for(const job of jobs) {
            await this.cancelJob( job.name )
        }
    }

    async getQueue(workspaceId) {
        const queueName = `${workspaceId}-${this.type}`;
        if (!this.queues[queueName]) {
            console.log(`Creating queue ${queueName}`)
            console.log(this.connection)
            this.queues[queueName] = new Queue(queueName, { connection: this.connection });
            await this.markQueueActive(workspaceId);

            if( this.processCallback ){
                this.workers[queueName] = [];
                for (let i = 0; i < this.numWorkersPerQueue; i++) {
                
                    console.log(`Creating queue worker in main thread for ${queueName}`)
                    
                    this.workers[queueName].push(new Worker(queueName, async job => {
                        await this.setQueueActivity(queueName, true);
                        
                        // Process job here
                        console.log(`Processing job ${job.name}`);
                        let result
                        let rescheduled = false
                        if( this.processCallback ){
                            result = await this.processCallback( job, ()=>this.checkIfJobCancelled(job.name) )
                            if( result?.reschedule ){
                                console.log(`Job asked to be rescheduled`)
                                rescheduled = true
                                const state = await job.getState();
                                console.log(state)
                                await result.reschedule()
                            }
                        }
                        await this.resetCancelJob(job.name)
                        if( !rescheduled ){
                            await this.setQueueActivity(queueName, false);
                        }
                        return true
                        
                    }, { connection: this.connection, ...this.settings }));
                }
            }else{
                console.log(`Notifying ${this.workerThreads?.length} ${this.type} worker threads for ${queueName}`)
                for(const worker of this.workerThreads){
                    console.log(`-`)
                    worker.postMessage({type:"watch", queueName})
                }

            }
        }
        return this.queues[queueName];
    }
    async getJobStatus(workspaceId, jobData) {
        const jobId = jobData.id + "-" + jobData.mode 
        const queue = await this.getQueue(workspaceId);
        const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed']);
        const filteredJobs = jobs.filter(job => job.id.startsWith(jobId));
        return filteredJobs
    }

    async addJob(workspaceId, jobData, options = {}) {
        try {
            const jobId = jobData.id + "-" + jobData.mode + (options.reschedule ? Date.now() : "")
            const queue = await this.getQueue(workspaceId);
            const existing = await queue.getJob(jobId)
            if(  existing ){
                const status = await existing.getState()
                if( status === "completed"){
                    await existing.remove()
                }else{
                    console.log(`Job already present - skipping `)
                    return
                }
            }
            console.log(`Starting job ${jobId} on ${workspaceId}`)
            await queue.add(jobId, jobData, {
                removeOnComplete: { age: 180}, 
                removeOnFail: true, 
                jobId: jobId, 
                attempts: 2, // Retry up to 3 times
                backoff: {
                    type: 'exponential', // Use exponential backoff
                    delay: 60 * 1000 * 20, // Initial delay: 5 minutes
                },
                ...options 
            });
            await this.updateQueueActivity(`${workspaceId}-${this.type}`);
            return true
        } catch (error) {
            console.error(`Error adding job to queue: ${error}`);
        }
    }

    async removeJob(workspaceId, jobId) {
        const queueName = `${workspaceId}-${this.type}`;
        try {
            const queue = this.queues[queueName];
            if (queue) {
                const job = await queue.getJob(jobId);
                if (job) {
                    await job.remove();
                }
            }
        } catch (error) {
            console.error(`Error removing job from queue: ${error}`);
        }
    }

    async purgeAllQueues() {
        for (const queueName in this.queues) {
            await this.purgeQueue(undefined, queueName)
        }
    }
    
    async purgeQueueLegacy(workspaceId, qn) {
        const queueName = qn ?? `${workspaceId}-${this.type}`;
        if( queueName && !workspaceId ){
            workspaceId = queueName.split('-')[0]
        }
        try {
            if (this.queues[queueName]) {
                await this.teminateJobsInQueue( workspaceId )
                if (this.workers[queueName]) {
                    for (const worker of this.workers[queueName]) {
                        await worker.close();
                    }
                    delete this.workers[queueName];
                }

                await this.queues[queueName].pause();
                await this.queues[queueName].obliterate({ force: true });
                await this.redis.del(`${queueName}-activeCount`);
                await this.redis.del(`${queueName}-lastActivity`);
                delete this.queues[queueName]
                //this.queueEvents[queueName].close()
                //delete this.queueEvents[queueName]
                await this.markQueueInactive(workspaceId);
            }
        } catch (error) {
            console.error(`Error purging queue: ${error}`);
        }
    }
    async purgeQueue(workspaceId, qn) {
        if( this.processCallback ){
            return this.purgeQueueLegacy( workspaceId, qn)
        }
        const queueName = qn ?? `${workspaceId}-${this.type}`;
        if( queueName && !workspaceId ){
            workspaceId = queueName.split('-')[0]
        }
    
        if (this.queues[queueName]) {
            console.log(`Purging queue: ${queueName}`);
    
            for (const worker of this.workerThreads) {
                try {
                    worker.postMessage({type: 'stop',queueName});
                } catch (err) {
                    console.error(`Error terminating worker thread for queue: ${queueName}`, err);
                }
            }
    
            // Pause and obliterate the BullMQ queue
            try {
                await this.queues[queueName].pause(); // Pause the queue
                await this.queues[queueName].obliterate({ force: true }); // Remove all jobs from the queue
                console.log(`Queue obliterated: ${queueName}`);
            } catch (err) {
                console.error(`Error obliterating queue: ${queueName}`, err);
            }
    
            // Remove Redis metadata for the queue
            await this.redis.del(`${queueName}-activeCount`);
            await this.redis.del(`${queueName}-lastActivity`);
    
            // Mark the queue as inactive
            await this.markQueueInactive(workspaceId);
    
            // Clean up queue reference
            delete this.queues[queueName];
        } else {
            console.log(`Queue ${queueName} does not exist, skipping purge.`);
        }
    }

    async status() {
        let aggregateList = [];

        for (const queueName in this.queues) {
            try {
                const queue = this.queues[queueName];
                const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
                const workerStatuses = this.workers[queueName]?.map((worker, index) => ({
                    workerId: index + 1,
                    threadId: worker.threadId,
                    isTerminated: worker.threadId === null,
                })) || [];

                for(const job of jobs) {
                    aggregateList.push({
                        queue: queueName,
                        jobs:{
                            id: job.id,
                            name: job.name,
                            status: await job.getState(),
                            data: job.data,
                            attemptsMade: job.attemptsMade,
                            failedReason: job.failedReason
                        },
                        workers: workerStatuses,
                    });
                }
            } catch (error) {
                console.error(`Error retrieving status for queue ${queueName}: ${error}`);
            }
        }

        return aggregateList;
    }
}

export default QueueManager;
