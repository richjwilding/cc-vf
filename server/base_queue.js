import { createClient } from 'redis';
import { Queue, Worker } from 'bullmq';

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
        this.workers = {};
        this.connection = redisOptions
        this.settings = settings

        this.processCallback = callback
        this.redis = createClient({socket: {host: redisOptions.host, port: redisOptions.port}});

        this.redis.connect().catch(console.error);

        this.initializeActiveQueues();
        this.startIdleCheck();
        console.log(`QUEUE MANAGER INIIT`)
        console.log(this.connection)
    }

    async initializeActiveQueues() {
        // Retrieve active queues from Redis
        const activeQueues = await this.redis.sMembers('activeQueues');
        activeQueues.forEach(queueName => {
            this.getQueue(queueName.split('-')[0]);
        });
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

            this.workers[queueName] = [];
            for (let i = 0; i < this.numWorkersPerQueue; i++) {
                this.workers[queueName].push(new Worker(queueName, async job => {
                    await this.setQueueActivity(queueName, true);

                    // Process job here
                    console.log(`Processing job ${job.name}`);
                    if( this.processCallback ){
                        await this.processCallback( job, ()=>this.checkIfJobCancelled(job.name) )
                    }
                    await this.resetCancelJob(job.name)

                    await this.setQueueActivity(queueName, false);
                }, { connection: this.connection, ...this.settings }));
            }
        }
        return this.queues[queueName];
    }

    async addJob(workspaceId, jobData) {
        try {
            const jobId = jobData.id + "-" + jobData.mode
            const queue = await this.getQueue(workspaceId);
            const existing = await queue.getJob(jobId)
            if(  existing ){
                console.log(`Job already present - skipping `)
                return
            }
            console.log(`Starting job ${jobId} on ${workspaceId}`)
            await queue.add(jobId, jobData, { removeOnComplete: true, removeOnFail: true, jobId: jobId });
            await this.updateQueueActivity(`${workspaceId}-${this.type}`);
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
    async purgeQueue(workspaceId, qn) {
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
                await this.markQueueInactive(workspaceId);
            }
        } catch (error) {
            console.error(`Error purging queue: ${error}`);
        }
    }

    async status() {
        let aggregateList = [];

        for (const queueName in this.queues) {
            try {
                const queue = this.queues[queueName];
                const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);
                for(const job of jobs) {
                    aggregateList.push({
                        queue: queueName,
                        id: job.id,
                        name: job.name,
                        status: await job.getState(),
                        data: job.data,
                        attemptsMade: job.attemptsMade,
                        failedReason: job.failedReason
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
