import { createClient } from 'redis';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { threadId, Worker as WorkerThread } from 'worker_threads';
import path from 'path';
import { SIO } from './socket';
import { parentPort, workerData, isMainThread} from 'worker_threads';
import { getLogger } from './logger';
import { getQueueObjectByName } from './queue_register';
import { getRedisBase } from './redis';

// Channel for cross-service worker control messages
const CONTROL_CHANNEL = 'queue:control';

/*
import FlowQueue from './flow_queue';
import QueueAI from './ai_queue';
import QueueDocument from './document_queue';
import EnrichPrimitive from './enrich_queue';
import QueryQueue from './query_queue';
import BrightDataQueue from './brightdata_queue';*/

const asyncLocalStorage = require('./asyncLocalStorage');

const logger = getLogger('queue-manager', "debug"); // Debug level for moduleA


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
                maxStalledCount: 1,
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
        this.isWorkerThread = !isMainThread
        this.requestIdCounter = 0;
        this.pendingRequests = new Map();
        this.controlSource = process.env.GAE_SERVICE || process.env.ROLE || (this.isWorkerThread ? 'worker' : 'app');
        this.controlInstanceId = process.env.INSTANCE_UUID || process.env.GAE_INSTANCE || String(process.pid);

        this.sweepingWaitingChildren = false;

        //this.redis = createClient({socket: {host: redisOptions.host, port: redisOptions.port}});
        //this.redis.connect().catch(console.error);
        this.redis = getRedisBase()

        if (this.isWorkerThread) {
            // In worker thread
            logger.info(`QueueManager instantiated in worker thread for ${this.type}`);
            this.overrideMethodsForWorkerThread();
        } else {
            // In main thread
            const runWorkers = process.env.RUN_QUEUE_WORKERS === 'true' //|| process.env.NODE_ENV === 'development'
            logger.info(`QueueManager instantiated in main thread for ${this.type} (run workers = ${runWorkers} / ${process.env.RUN_QUEUE_WORKERS} / ${process.env.NODE_ENV})`);
            if( !this.processCallback && runWorkers){
                let readyCount = 0
                for (let i = 0; i < this.numWorkersPerQueue; i++) {
                    logger.debug(`-- ${this.type} Thread ${i}`)

                    const createThisWorker = (isReplacement)=>{
                        let worker = new WorkerThread(path.resolve(__dirname, './job-worker.js'), {
                            workerData: {
                                queueName: type,
                                type: this.type,             // Pass the queue type to workerData
                                redisOptions: this.connection,
                                instanceId: this.controlInstanceId
                            }
                        });

                        //worker.stdout?.on('data', d => process.stdout.write(`[worker ${worker.threadId}] ${d}`));
                        worker.stderr?.on('data', d => process.stderr.write(`[worker ${worker.threadId} ERR] ${d}`));
                        
                        worker.on('message', async (message) => {
                            if (message.type === 'startJob') {
                                logger.debug(`Job has started in worker ${message.queueName} / ${worker.threadId} - ${message.jobId}`)
                                workerState.running.add(`${message.queueName}/${message.jobId}/${message.token}`)
                                this.setQueueActivity(message.queueName, true);
                                

                                const job = await this.getJobFromQueue( {
                                    queueName: message.queueName,
                                    id: message.jobId
                                })
                                if( !job){
                                    logger.error(`Cant find job object`)
                                }
                                if( job?.parent ){
                                    const parentJobObject = await this.getJobFromQueue( {
                                        queueName: job.parent.queueKey.slice(5),
                                        id: job.parent.id
                                    } )
                                    if( parentJobObject ){
                                        logger.info(`================ Extended parent job lock ${job.parent.id} ================`)
                                        try{
                                            parentJobObject.updateProgress(1); 
                                        }catch(e){
                                            logger.info(`ERROR EXTENDING LOCK FOR PARENT JOB ${job.parent.id}`);
                                            logger.info(e)
                                        }
                                    }else{
                                        logger.error(`Cant find parent job`, job.parent)

                                    }
                                }
                                await this.sendNotification(
                                    message.jobId,{
                                        started: true
                                    }
                                )
                                
                            }else if (message.type === 'invoke_job_response') {
                                const { requestId, status, jobId, error } = message;
                                logger.debug(`Handling invokeJobResponse response ${requestId} for ${this.type} - ${jobId}`)
                                const { resolve, reject } = this.pendingRequests.get(requestId) || {};
                                if (resolve) {
                                    resolve(jobId);
                                    this.pendingRequests.delete(requestId);
                                }else{
                                    logger.error(`Couldnt find job to resolve in invokeJobResponse handler ${this.type}`)
                                }
                            }else if (message.type === 'endJob') {
                                
                                logger.debug(`Job has ended in worker ${message.queueName} - ${message.jobId} ${this.type} (${message.requestId})`)
                                workerState.running.delete(`${message.queueName}/${message.jobId}/${message.token}`)
                                
                                const parentJob = message.parent || null;

                                try {
                                    await this.finalizeJobLifecycle({
                                        queueName: message.queueName,
                                        jobId: message.jobId,
                                        parentJob,
                                        payload: {
                                            result: message.result,
                                            error: message.error,
                                            success: message.success,
                                        },
                                        reason: 'worker-complete'
                                    });
                                } catch (finalizeError) {
                                    logger.error(`Error finalizing job ${message.jobId} after worker completion`, finalizeError);
                                }

                                worker.postMessage({
                                    type: 'endJobResponse',
                                    requestId: message.requestId,
                                    queueType: message.queueType,
                                    jobId: message.id
                                });

                            }else if (message.type === 'sendNotificationToSocket') {
                                const { room, message: data } = message.data;
                                SIO.sendNotificationToSocket(room, JSON.parse(data));
                            }else if(message.type === "ready"){
                                readyCount++
                                logger.debug(`${readyCount} worker(s) ready for ${type}`)
                                if( isReplacement ){
                                    logger.info(`Notifying replacement worker about existing queues`)
                                    for(const qn of Object.keys(this.queues)){
                                        worker.postMessage({type:"watch", queueName: qn})
                                    }
                                }
                                
                                if(readyCount === this.numWorkersPerQueue ){
                                    this.initializeActiveQueues();
                                    this.startIdleCheck();
                                }
                            }else if (message.type === 'addJob') {
                                // Handle addJob requests from worker threads
                                const {requestId, workspaceId, jobData, options, parentJob, queueType} = message
                                logger.debug(`Got addJob request from child`)
                                logger.debug(`Queue ${this.type} got request for ${queueType}`)

                                let queue = this.getQueueObject(queueType)
                                if( !queue ){
                                    logger.info(message)
                                    throw `Dont have queue ${queue} to forward message to`
                                }
                                const jobOptions = {
                                    // Caller options first; we will ensure sane defaults for retries below
                                    ...options,
                                    removeOnComplete: { age: 180},
                                    // Enable retries by default; caller can override via options.attempts
                                    attempts: (options && typeof options.attempts === 'number') ? options.attempts : 3,
                                    waitChildren: true,
                                    removeOnFail: true, 
                                    parent: {id: parentJob.id, queue: `bull:${parentJob.queueName}`}
                                }
                                {
                                    (async()=>{
                                       const childId =  await queue.addJob( message.workspaceId, jobData, jobOptions)
                                       logger.info(`Child ID added ${childId} on ${jobOptions.parent.id} / ${jobOptions.parent.queue}`) 
                                       logger.debug(`Set Redis parent job:${childId}:parent to ${JSON.stringify(parentJob)}`)
                                        //await this.redis.set(`job:${childId}:parent`, JSON.stringify(parentJob));
                                        //this.markChildWaiting( parentJob.queueName, parentJob.id)
                                        
                                        worker.postMessage({
                                            type: 'addJobResponse',
                                            requestId,
                                            status: 'success',
                                            queueType,
                                            jobId: jobData.id
                                        });
                                    })()
                                }
                            }else if( message.type === "error"){
                                logger.error(`Error in worker for queue ${this.type}:\n${message.error.message}\n${message.error.stack}`)                  
                            }else if (message.type === 'heartbeat') {
                                try {
                                    const { threadId: tId, type: qType, reports, error } = message.data || {};
                                    if (error) {
                                        logger.info(`[hb:${this.type}] thread ${tId} error ${error}`);
                                    } else if (Array.isArray(reports)) {
                                        for (const r of reports) {
                                            if (r.error) {
                                                logger.info(`[hb:${this.type}] thread ${tId} ${r.queue} error ${r.error}`);
                                            } else {
                                                const c = r.counts || {};
                                                logger.info(`[hb:${this.type}] thread ${tId} ${r.queue} waiting=${c.waiting||0} active=${c.active||0} wchildren=${c['waiting-children']||0} delayed=${c.delayed||0} failed=${c.failed||0} completed=${c.completed||0}`);
                                            }
                                        }
                                    }
                                } catch (e) {
                                    logger.error('heartbeat message handling error', e);
                                }
                            }
                        });
                        worker.on('error', async (error) => {
                            console.error(`Error in worker for queue ${this.type}:`, error);                        
                        });
                        worker.on('exit', async (code) => {
                            if (code !== 0) {
                                logger.error(`Worker for queue ${this.type} exited with code ${code}`);
                                readyCount--
                                
                                logger.debug(workerState.running)
                                for(const d of workerState.running){
                                    try{
                                        
                                        const [qn, jid, token] = d.split("/")
                                        logger.debug(`Cancelling active jobs`, {qn, jid, token})
                                        const job = await this.queues[qn]?.getJob(jid)
                                        if( job ){
                                            const state = await job.getState()
                                            if( state === "active"){
                                                await job.moveToFailed({message: "Recover from crashed worker"}, token)
                                                try {
                                                    await this.setQueueActivity(qn, false);
                                                } catch (activityError) {
                                                    logger.error(`Error updating activity for crashed job ${jid} on ${qn}`, activityError);
                                                }
                                                try {
                                                    await this.resetChildWaiting(qn, jid);
                                                } catch (childError) {
                                                    logger.error(`Error clearing child wait counter for crashed job ${jid} on ${qn}`, childError);
                                                }
                                                try {
                                                    await this.resetCancelJob(jid);
                                                } catch (cancelError) {
                                                    logger.error(`Error clearing cancel flag for crashed job ${jid}`, cancelError);
                                                }
                                            }
                                        }
                                    }catch(error){
                                        logger.error("Error trying to reset worker after crash")
                                        logger.error(error)
                                    }
                                }
                                
                                workerState.running = new Set()
                                const newWorker = createThisWorker(true)
                                this.workerThreads[i] = newWorker
                                logger.debug(`Replaced worker ${i}`)
                                
                                workerState = {running: new Set()}
                                
                                
                            }
                        });
                        return worker
                    }
                    let workerState = {running: new Set()}
                    let worker = createThisWorker()
                    this.workerThreads.push(worker)

                }

            }else{
                this.initializeActiveQueues();
                this.startIdleCheck();
            }
        }
    }
    async sendNotification(jobId, data, {childJob, parentJob} = {}){
        let queue = this.getQueueObject(this.type)
        let result
        if( queue?.notify ){
            let [id, fulMmode] = jobId.split("-")
            let [mode, time] = fulMmode.split(":t")
            logger.debug(`sendNotification ${jobId} 3`)
            result = await queue.notify({
                    id,
                    mode
                },
                data,
                {
                    childJob,
                    parentJob
                })
        }else{
            logger.error(`Got no notify method for ${this.type}`)
        }
        return result
    }
    async invokeWorkerJob( data, parentJob, options){
        const requestId = ++this.requestIdCounter;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
        
            if( parentJob ){
                logger.debug(`Sending job request to worker as child of ${parentJob.queueName} / ${parentJob.id}`)
                const worker = this.workerThreads[0]
                if( worker ){
                    worker.postMessage({type:"invoke_job", data, requestId, parentJob, options})
                    setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        reject(new Error(`invokeWorkerJob timed out ${requestId}`));
                        this.pendingRequests.delete(requestId);
                    }
                    }, 15000);
                }else{
                    throw "Cant find worker"
                }
            }else{
                logger.debug(`No parent job - running from main thread`);
                (async () => {
                    await this.addJob( options.workspaceId, data, options)
                })();
                resolve()
            }
        
        });
    }
    async getJobFromQueue(job){
        try{

            if( job ){
                const [qId, qType] = job.queueName.split("-")
                const qo = this.getQueueObject(qType)
                const q = await qo._queue.getQueue(qId)
                if( q ){
                    const jobObject = await q.getJob(job.id);
                    if( jobObject ){
                        return jobObject
                    }else{
                        logger.error("Couldnt find job")
                    }
                }else{
                    logger.error("Couldnt find queue", {qId, qType})
                }
            }
        }catch(error){
            logger.error("Error in getJobQueue",error)
        }
    }
    getQueueObject(queueType){
        if( this.type === queueType ){
            logger.verbose(`Fetching same queue type - returning parent`)
            return this.parentObject
        }
        return getQueueObjectByName( queueType )
    }
    overrideMethodsForWorkerThread() {

        this.endJob = (data) => {
            const requestId = ++this.requestIdCounter;
            return new Promise((resolve, reject) => {
              this.pendingRequests.set(requestId, { resolve, reject });
              logger.verbose(`--> Sending endJOb with requestId ${requestId} `)
            
                parentPort.postMessage({ type: "endJob", requestId,...data });
          
              setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                  reject(new Error(`endJob timed out ${requestId}`));
                  this.pendingRequests.delete(requestId);
                }
              }, 15000);
            });
          };

        this.endJobResponse = async (message) => {
            const { requestId, status, jobId, error } = message;
            logger.debug(`Handling endJob response ${requestId} for ${this.type} - ${jobId}`)
            const { resolve, reject } = this.pendingRequests.get(requestId) || {};
            if (resolve) {
                resolve(jobId);
                this.pendingRequests.delete(requestId);
            }else{
                logger.error(`Couldnt find job to resolve in endJobResponse handler ${this.type}`)
            }
        }

        this.addJobResponse = async (message) => {
            const { requestId, status, jobId, error } = message;
            logger.verbose(`Handling addJob response ${requestId} for ${this.type} - ${jobId}`)
            const { resolve, reject } = this.pendingRequests.get(requestId) || {};
            if (resolve) {
                if (status === 'success') {
                    resolve(jobId);
                } else {
                    reject(new Error(error));
                }
                this.pendingRequests.delete(requestId);
            }else{
                logger.error(`Couldnt find job to resolve in addJobResponse handler ${this.type}`)
            }
        }
        

        this.addJob = async (workspaceId, jobData, options = {}) => {
            const requestId = ++this.requestIdCounter;

            
        

            return new Promise((resolve, reject) => {
                // Store the resolve and reject functions
                this.pendingRequests.set(requestId, { resolve, reject });

        
                let parentJob
                if( options.parent ){
                    parentJob = options.parent
                    logger.debug(`Overriding parent info`, parentJob)
                }else{
                    const store = asyncLocalStorage.getStore();
                    if (store && store.has('parentJob')) {
                        parentJob = store.get('parentJob');
                    }
                }

                const jobOptions = {
                    type: 'addJob',
                    requestId,
                    workspaceId,
                    jobData,
                    options,
                    queueType: this.type
                    
                }

                if( parentJob){
                    jobOptions.parentJob = {
                        id: parentJob.id,
                        queueName: parentJob.queueName
                    }
                    
                    logger.debug(`Parent job ${parentJob.id} in ${parentJob.queueName} asked for addjob on ${this.type} - request ${requestId}`, jobData)
                }
    
                try{
                    parentPort.postMessage(jobOptions);
                }catch(e){
                    logger.error(`Couldnt send addJob data to parent thread - likey not serializable`, jobOptions)
                    logger.error( jobOptions )
                }
                // Optionally, set a timeout to reject the promise if no response is received
                setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        reject(new Error('addJob timed out'));
                        this.pendingRequests.delete(requestId);
                    }
                }, 15000); // Timeout after 15 seconds
            });
        };


        // Adjust getQueue to avoid unnecessary actions
        this.getQueue = async (workspaceId) => {
            const queueName = `${workspaceId}-${this.type}`;
            if (!this.queues[queueName]) {
                this.queues[queueName] = new Queue(queueName, { connection: this.connection });
            }
            return this.queues[queueName];
        };

        this.initializeActiveQueues = async () => { /* Do nothing */ };
        this.startIdleCheck = () => { /* Do nothing */ };
        this.setQueueActivity = async () => { /* Do nothing */ };
        this.updateQueueActivity = async () => { /* Do nothing */ };
        this.teminateJobsInQueue = async () => { /* Do nothing */ };
        this.removeJob = async () => { /* Do nothing */ };
        this.purgeAllQueues = async () => { /* Do nothing */ };
        this.purgeQueue = async () => { /* Do nothing */ };
        this.status = async () => { return {}; }; // Return empty status or minimal information
        this.invokeWorkerJob = async () => { /* Do nothing */ };
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
                logger.info(`Have ${activeCount} items in queue ${queueName}- starting`)
                this.getQueue(workspaceId);
            }else{
                if( lastActivity === null ){
                    logger.info(`No active items in queue  ${queueName} - removing`)
                    await this.redis.del(`${queueName}-activeCount`);
                    await this.redis.del(`${queueName}-lastActivity`);
                    await this.redis.sRem('activeQueues', queueName);
                }else{
                    logger.info(`Have ${activeCount} items waiting in queue ${queueName} - starting`)
                    this.getQueue(workspaceId);
                }
            }
        }
    }
    async resetChildWaiting(queueName, jobId) {
        const key = `${queueName}-${jobId}-childrenCount`
        return await this.redis.del(key);
    }
    async getChildWaiting(queueName, jobId) {
        const key = `${queueName}-${jobId}-childrenCount`
        return await this.redis.get(key);
    }
    async removeChildTracker(queueName, jobId) {
        const key = `${queueName}-${jobId}-childrenCount`
        await this.redis.del(key);
    }
    async markChildWaiting(queueName, jobId) {
        const key = `${queueName}-${jobId}-childrenCount`
        await this.redis.incr(key);
    }

    async markChildComplete(queueName, jobId) {
        const key = `${queueName}-${jobId}-childrenCount`
        const count = await this.redis.decr(key)
        if (count < 0) {
            // Ensure the count does not go below zero
            await this.redis.set(key, '0');
        }
    }

    async cleanupWaitingChildrenJob(queueName, job, opts = {}) {
        const contextReason = opts.reason || 'cleanup';
        const dependencyQueueCache = new Map();
        const queuesToClose = [];
        const visited = opts.visited ?? new Set();
        const allowNestedCleanup = opts.allowNestedCleanup !== false;
        const maxDepth = typeof opts.maxDepth === 'number' && opts.maxDepth >= 0 ? opts.maxDepth : 3;
        const currentDepth = typeof opts.depth === 'number' ? opts.depth : 0;

        const identifier = job ? `${queueName}:${job.id}` : null;
        if (identifier) {
            if (visited.has(identifier)) {
                logger.warn(`[${this.type}] Skipping cleanup for ${identifier} to avoid recursive inspection`);
                return { removed: false, pendingDependencies: 0, reason: 'recursive-visit' };
            }
            visited.add(identifier);
        }

        try {
            const dependencyCounts = await job.getDependenciesCount({ processed: true, unprocessed: true });
            const pendingDependencies = dependencyCounts?.unprocessed ?? 0;

            if (pendingDependencies === 0) {
                logger.warn(`[${this.type}] Removing waiting-children job ${job.id} on ${queueName}: no pending dependencies`);
                await this.finalizeWaitingChildrenJob(queueName, job, {
                    reason: `${contextReason}:no-pending-dependencies`,
                    pendingDependencies: 0,
                });
                return { removed: true, pendingDependencies: 0, reason: 'no-pending-dependencies' };
            }

            const staleDependencies = [];
            const liveDependencies = [];
            const unknownDependencies = [];

            let cursor = 0;
            let scanned = 0;
            const maxKeysToInspect = Math.min(pendingDependencies, 1000);
            let remainingIterations = 200;
            let scannedAllDependencies = false;

            while (remainingIterations > 0 && scanned < maxKeysToInspect) {
                const deps = await job.getDependencies({ unprocessed: { cursor, count: Math.min(100, maxKeysToInspect - scanned) } });
                const keys = deps?.unprocessed || [];

                for (const key of keys) {
                    if (!key) {
                        continue;
                    }

                    scanned += 1;
                    try {
                        const detail = await this.inspectDependencyKey(key, dependencyQueueCache, queuesToClose, {
                            reason: contextReason,
                            visited,
                            depth: currentDepth + 1,
                            maxDepth,
                            allowNestedCleanup,
                        });
                        if (detail.status === 'stale') {
                            staleDependencies.push(detail);
                        } else if (detail.status === 'live') {
                            liveDependencies.push(detail);
                        } else {
                            unknownDependencies.push(detail);
                        }
                    } catch (err) {
                        unknownDependencies.push({ key, status: 'error', reason: err?.message || String(err) });
                        logger.error(`Error inspecting dependency ${key} for job ${job.id} on ${queueName}`, err);
                    }

                    if (scanned >= maxKeysToInspect) {
                        break;
                    }
                }

                cursor = deps?.nextUnprocessedCursor ?? 0;
                if (!cursor || cursor === 0 || scanned >= pendingDependencies) {
                    scannedAllDependencies = true;
                    break;
                }

                remainingIterations -= 1;
                if (remainingIterations <= 0) {
                    logger.warn(`Exceeded dependency scan limit for ${job.id} on ${queueName}`);
                }
            }

            if (liveDependencies.length === 0 && unknownDependencies.length === 0 && staleDependencies.length > 0 && (scannedAllDependencies || pendingDependencies <= staleDependencies.length)) {
                logger.warn(`[${this.type}] Removing waiting-children job ${job.id} on ${queueName}: dependencies stale`, {
                    pendingDependencies,
                    staleDependencies: staleDependencies.map(d => ({ queueName: d.queueName, jobId: d.jobId, state: d.reason })),
                });
                await this.finalizeWaitingChildrenJob(queueName, job, {
                    reason: `${contextReason}:stale-dependencies`,
                    pendingDependencies,
                    staleDependencies: staleDependencies.map(d => ({ queueName: d.queueName, jobId: d.jobId, state: d.reason })),
                });
                return {
                    removed: true,
                    pendingDependencies,
                    reason: 'stale-dependencies',
                    staleDependencies: staleDependencies.map(d => ({ queueName: d.queueName, jobId: d.jobId, state: d.reason })),
                };
            }

            if (liveDependencies.length > 0) {
                logger.debug(`[${this.type}] Job ${job.id} on ${queueName} still waiting on ${liveDependencies.length} child job(s)`);
            } else if (unknownDependencies.length > 0) {
                logger.debug(`[${this.type}] Job ${job.id} on ${queueName} has unresolved dependency metadata (${unknownDependencies.length} entries)`);
            }

            return {
                removed: false,
                pendingDependencies,
                liveDependencies: liveDependencies.length,
                staleDependencies: staleDependencies.length,
                unknownDependencies: unknownDependencies.length,
            };
        } catch (error) {
            logger.error(`Error inspecting waiting-children job ${job?.id} on ${queueName}`, error);
            return { removed: false, error };
        } finally {
            if (identifier) {
                visited.delete(identifier);
            }
            for (const entry of queuesToClose) {
                try {
                    await entry.close();
                } catch (closeErr) {
                    logger.error(`[${this.type}] Error closing temporary queue while inspecting dependencies`, closeErr);
                }
            }
        }
    }

    async finalizeJobLifecycle({ queueName, jobId, parentJob, payload, reason }) {
        const context = reason || 'finalize';

        try {
            await this.resetChildWaiting(queueName, jobId);
        } catch (err) {
            logger.error(`[${this.type}] Error clearing child wait counter for ${jobId} on ${queueName} (${context})`, err);
        }

        try {
            await this.setQueueActivity(queueName, false);
        } catch (err) {
            logger.error(`[${this.type}] Error updating activity for ${jobId} on ${queueName} (${context})`, err);
        }

        try {
            await this.resetCancelJob(jobId);
        } catch (err) {
            logger.error(`[${this.type}] Error clearing cancel flag for ${jobId} (${context})`, err);
        }

        let childResponse;
        try {
            childResponse = await this.sendNotification(jobId, payload || { success: true }, { parentJob });
        } catch (notifyError) {
            logger.error(`[${this.type}] Error sending notification for ${jobId} (${context})`, notifyError);
        }

        if (parentJob) {
            if (childResponse?.keepAlive) {
                logger.info(`--- Child ${jobId} requested to not notify parent ${parentJob.id}`);
            } else {
                const [qId, qType] = parentJob.queueName.split("-");
                const qo = this.getQueueObject(qType);

                if (qo) {
                    let grandparentJob;
                    try {
                        const parentJobObject = await this.getJobFromQueue({
                            queueName: parentJob.queueName,
                            id: parentJob.id
                        });
                        if (parentJobObject?.parent) {
                            grandparentJob = {
                                id: parentJobObject.parent.id,
                                queueName: parentJobObject.parent.queueKey.slice(5)
                            };
                        }
                    } catch (e) {
                        logger.error('Error fetching grandparent from BullMQ', e);
                    }

                    try {
                        await qo.sendNotification(
                            parentJob.id,
                            payload || { success: true },
                            {
                                childJob: jobId,
                                parentJob: grandparentJob
                            }
                        );
                    } catch (notifyParentError) {
                        logger.error(`[${this.type}] Error notifying parent queue ${parentJob.queueName} for ${jobId}`, notifyParentError);
                    }
                } else {
                    logger.warn(`[${this.type}] Could not resolve parent queue object for ${parentJob.queueName}`);
                }
            }
        }

        return childResponse;
    }

    parseDependencyKey(rawKey) {
        if (!rawKey || typeof rawKey !== 'string') {
            return null;
        }

        const parts = rawKey.split(':');
        if (parts.length < 3) {
            return null;
        }

        parts.shift();
        const queueName = parts.shift();
        const jobId = parts.join(':');

        if (!queueName || !jobId) {
            return null;
        }

        const lastHyphen = queueName.lastIndexOf('-');
        if (lastHyphen === -1) {
            return null;
        }

        const workspaceId = queueName.slice(0, lastHyphen);
        const queueType = queueName.slice(lastHyphen + 1);

        return { queueName, queueType, workspaceId, jobId };
    }

    async inspectDependencyKey(rawKey, cache, queuesToClose, opts = {}) {
        const parsed = this.parseDependencyKey(rawKey);
        if (!parsed) {
            return { key: rawKey, status: 'unknown', reason: 'unparseable-key' };
        }

        const { queueName, queueType, jobId } = parsed;
        const reasonContext = opts.reason || 'cleanup';
        const visited = opts.visited;
        const depth = typeof opts.depth === 'number' ? opts.depth : 0;
        const maxDepth = typeof opts.maxDepth === 'number' && opts.maxDepth >= 0 ? opts.maxDepth : 3;
        const allowNestedCleanup = opts.allowNestedCleanup !== false;
        const identifier = `${queueName}:${jobId}`;

        if (visited) {
            if (visited.has(identifier)) {
                return { key: rawKey, status: 'unknown', reason: 'cycle-detected', queueName, jobId };
            }
            visited.add(identifier);
        }

        if (!cache.has(queueName)) {
            let queueRef = null;
            let needsClose = false;

            try {
                if (queueType === this.type && this.queues?.[queueName]) {
                    queueRef = this.queues[queueName];
                } else {
                    const queueObject = this.getQueueObject(queueType);
                    const manager = queueObject?._queue;
                    if (manager && manager.queues?.[queueName]) {
                        queueRef = manager.queues[queueName];
                    }
                }

                if (!queueRef) {
                    queueRef = new Queue(queueName, { connection: this.connection });
                    needsClose = true;
                }
            } catch (err) {
                logger.error(`[${this.type}] Error opening queue ${queueName} while inspecting dependency ${rawKey}`, err);
                cache.set(queueName, { queue: null, needsClose: false });
                return { key: rawKey, status: 'unknown', reason: 'queue-open-error', queueName, jobId };
            }

            cache.set(queueName, { queue: queueRef, needsClose });
            if (needsClose && queueRef) {
                queuesToClose.push(queueRef);
            }
        }

        const cacheEntry = cache.get(queueName) || { queue: null, needsClose: false };
        const queueRef = cacheEntry.queue;

        if (!queueRef) {
            if (visited) {
                visited.delete(identifier);
            }
            return { key: rawKey, status: 'unknown', reason: 'queue-missing', queueName, jobId };
        }

        try {
            const dependencyJob = await queueRef.getJob(jobId);
            if (!dependencyJob) {
                return { key: rawKey, status: 'stale', reason: 'missing-job', queueName, jobId };
            }

            const dependencyState = await dependencyJob.getState();
            if (dependencyState === 'completed' || dependencyState === 'failed') {
                return { key: rawKey, status: 'stale', reason: dependencyState, queueName, jobId };
            }

            if (dependencyState === 'waiting-children') {
                if (depth >= maxDepth) {
                    return { key: rawKey, status: 'unknown', reason: 'waiting-children-depth', queueName, jobId };
                }

                const classification = await this.classifyWaitingChildrenDependency({
                    rawKey,
                    job: dependencyJob,
                    queueName,
                    jobId,
                    cache,
                    queuesToClose,
                    opts: {
                        ...opts,
                        depth: depth + 1,
                    },
                });

                if (classification.status === 'stale' && allowNestedCleanup) {
                    try {
                        await this.finalizeWaitingChildrenJob(queueName, dependencyJob, {
                            reason: `${reasonContext}:nested-${classification.reason || 'waiting-children'}`,
                            pendingDependencies: classification.pendingDependencies ?? 0,
                            staleDependencies: Array.isArray(classification.staleDependencies)
                                ? classification.staleDependencies.map(d => ({ queueName: d.queueName, jobId: d.jobId, state: d.reason }))
                                : undefined,
                        });
                        classification.cleaned = true;
                    } catch (nestedError) {
                        classification.cleaned = false;
                        logger.error(`[${this.type}] Error cleaning nested waiting-children job ${jobId} on ${queueName}`, nestedError);
                    }
                }

                return classification;
            }

            return { key: rawKey, status: 'live', reason: dependencyState, queueName, jobId };
        } catch (err) {
            logger.error(`[${this.type}] Error fetching dependency job ${jobId} on ${queueName}`, err);
            return { key: rawKey, status: 'unknown', reason: 'job-fetch-error', queueName, jobId };
        } finally {
            if (visited) {
                visited.delete(identifier);
            }
        }
    }

    async classifyWaitingChildrenDependency({ rawKey, job, queueName, jobId, cache, queuesToClose, opts = {} }) {
        const depth = typeof opts.depth === 'number' ? opts.depth : 0;
        const maxDepth = typeof opts.maxDepth === 'number' && opts.maxDepth >= 0 ? opts.maxDepth : 3;

        let dependencyCounts;
        try {
            dependencyCounts = await job.getDependenciesCount({ processed: true, unprocessed: true });
        } catch (err) {
            logger.error(`[${this.type}] Error retrieving dependency counts for nested job ${jobId} on ${queueName}`, err);
            return { key: rawKey, status: 'unknown', reason: 'dependency-count-error', queueName, jobId };
        }

        const pendingDependencies = dependencyCounts?.unprocessed ?? 0;
        if (pendingDependencies === 0) {
            return { key: rawKey, status: 'stale', reason: 'waiting-children-empty', queueName, jobId, pendingDependencies: 0 };
        }

        if (depth >= maxDepth) {
            return {
                key: rawKey,
                status: 'unknown',
                reason: 'waiting-children-depth',
                queueName,
                jobId,
                pendingDependencies,
            };
        }

        const staleDependencies = [];
        const liveDependencies = [];
        const unknownDependencies = [];

        let cursor = 0;
        let scanned = 0;
        const maxKeysToInspect = Math.min(pendingDependencies, 500);
        let remainingIterations = 200;
        let scannedAllDependencies = false;

        while (remainingIterations > 0 && scanned < maxKeysToInspect) {
            let deps;
            try {
                deps = await job.getDependencies({ unprocessed: { cursor, count: Math.min(100, maxKeysToInspect - scanned) } });
            } catch (err) {
                logger.error(`[${this.type}] Error retrieving nested dependencies for ${jobId} on ${queueName}`, err);
                return { key: rawKey, status: 'unknown', reason: 'dependency-fetch-error', queueName, jobId };
            }

            const keys = deps?.unprocessed || [];
            for (const key of keys) {
                if (!key) {
                    continue;
                }

                scanned += 1;
                try {
                    const detail = await this.inspectDependencyKey(key, cache, queuesToClose, {
                        ...opts,
                        depth: depth + 1,
                    });
                    if (detail.status === 'stale') {
                        staleDependencies.push(detail);
                    } else if (detail.status === 'live') {
                        liveDependencies.push(detail);
                    } else {
                        unknownDependencies.push(detail);
                    }
                } catch (err) {
                    unknownDependencies.push({ key, status: 'error', reason: err?.message || String(err) });
                    logger.error(`Error inspecting nested dependency ${key} for job ${jobId} on ${queueName}`, err);
                }

                if (scanned >= maxKeysToInspect) {
                    break;
                }
            }

            cursor = deps?.nextUnprocessedCursor ?? 0;
            if (!cursor || cursor === 0 || scanned >= pendingDependencies) {
                scannedAllDependencies = true;
                break;
            }

            remainingIterations -= 1;
            if (remainingIterations <= 0) {
                logger.warn(`Exceeded nested dependency scan limit for ${jobId} on ${queueName}`);
            }
        }

        if (
            liveDependencies.length === 0 &&
            unknownDependencies.length === 0 &&
            staleDependencies.length > 0 &&
            (scannedAllDependencies || pendingDependencies <= staleDependencies.length)
        ) {
            return {
                key: rawKey,
                status: 'stale',
                reason: 'waiting-children-stale',
                queueName,
                jobId,
                pendingDependencies,
                staleDependencies: staleDependencies.map(d => ({ queueName: d.queueName, jobId: d.jobId, reason: d.reason })),
            };
        }

        return {
            key: rawKey,
            status: 'live',
            reason: 'waiting-children-pending',
            queueName,
            jobId,
            pendingDependencies,
            liveDependencies: liveDependencies.length,
            unknownDependencies: unknownDependencies.length,
        };
    }

    async finalizeWaitingChildrenJob(queueName, job, meta = {}) {
        const reason = meta.reason || 'cleanup';
        const pendingDependencies = meta.pendingDependencies;
        const staleDependencies = Array.isArray(meta.staleDependencies) ? meta.staleDependencies : undefined;
        const parentJob = job?.parent ? { id: job.parent.id, queueName: job.parent.queueKey.slice(5) } : null;

        try {
            const updatedData = {
                ...(job.data || {}),
                awaitingChildren: false,
                forcedCleanup: reason,
                forcedCleanupAt: Date.now(),
            };

            if (staleDependencies) {
                updatedData.forcedCleanupDependencies = staleDependencies;
            }

            await job.updateData(updatedData);
        } catch (updateError) {
            logger.error(`[${this.type}] Error updating job data for ${job?.id} during cleanup`, updateError);
        }

        const payload = meta.payload || {
            result: { forcedCleanup: true, reason, pendingDependencies },
            error: null,
            success: true,
        };

        if (!meta.payload && staleDependencies) {
            payload.result.staleDependencies = staleDependencies;
        }

        const childResponse = await this.finalizeJobLifecycle({
            queueName,
            jobId: job.id,
            parentJob,
            payload,
            reason,
        });

        try {
            await job.remove();
        } catch (removeError) {
            logger.error(`[${this.type}] Error removing waiting-children job ${job.id} on ${queueName}`, removeError);
        }

        return { childResponse };
    }

    async sweepWaitingChildrenQueues(opts = {}) {
        if (this.sweepingWaitingChildren) {
            logger.debug(`[${this.type}] Skipping waiting-children sweep because another sweep is in progress`);
            return { skipped: true };
        }

        this.sweepingWaitingChildren = true;
        const result = { removed: [] };
        const reason = opts.reason || 'sweep';
        const limitPerQueue = Math.max(1, Number(opts.limitPerQueue || 5));

        try {
            const targets = new Set();

            if (Array.isArray(opts.queueNames) && opts.queueNames.length > 0) {
                for (const name of opts.queueNames) {
                    if (!name) continue;
                    const qn = String(name);
                    if (qn.endsWith(`-${this.type}`)) {
                        targets.add(qn);
                    }
                }
            } else {
                for (const name of Object.keys(this.queues || {})) {
                    if (name && name.endsWith(`-${this.type}`)) {
                        targets.add(name);
                    }
                }
                try {
                    const activeQueues = await this.redis.sMembers('activeQueues');
                    for (const name of activeQueues || []) {
                        if (name && name.endsWith(`-${this.type}`)) {
                            targets.add(name);
                        }
                    }
                } catch (activeError) {
                    logger.error(`[${this.type}] Error reading activeQueues for waiting-children sweep`, activeError);
                }
            }

            for (const queueName of targets) {
                let queueRef = this.queues[queueName];
                let createdTemporaryQueue = false;

                if (!queueRef) {
                    try {
                        queueRef = new Queue(queueName, { connection: this.connection });
                        createdTemporaryQueue = true;
                    } catch (err) {
                        logger.error(`[${this.type}] Failed to open queue ${queueName} for waiting-children sweep`, err);
                        continue;
                    }
                }

                try {
                    const jobs = await queueRef.getJobs(['waiting-children'], 0, limitPerQueue - 1, false);
                    for (const job of jobs) {
                        try {
                            const cleanupResult = await this.cleanupWaitingChildrenJob(queueName, job, { reason });
                            if (cleanupResult?.removed) {
                                result.removed.push({
                                    queueName,
                                    jobId: job.id,
                                    reason: cleanupResult.reason,
                                    pendingDependencies: cleanupResult.pendingDependencies ?? 0,
                                });
                            }
                        } catch (jobError) {
                            logger.error(`[${this.type}] Error cleaning waiting-children job ${job?.id} on ${queueName}`, jobError);
                        }
                    }
                } catch (err) {
                    logger.error(`[${this.type}] Error retrieving waiting-children jobs for ${queueName}`, err);
                } finally {
                    if (createdTemporaryQueue) {
                        try {
                            await queueRef.close();
                        } catch (closeError) {
                            logger.error(`[${this.type}] Error closing temporary queue ${queueName}`, closeError);
                        }
                    }
                }
            }
        } finally {
            this.sweepingWaitingChildren = false;
        }

        return result;
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
        logger.debug(`Checking if  ${jobId} cancelled `, isCancelled )
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
            await this.initializeActiveQueues(); 
            const now = Date.now();
            for (const queueName in this.queues) {
                const { activeCount, lastActivity } = await this.getQueueActivity(queueName);
                if (activeCount === 0 && lastActivity && now - lastActivity > this.idleTimeBeforePurge) {
                    logger.info(`Purging queue for timeout`)
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

    async getQueue(workspaceId, opts = {}) {
        const queueName = `${workspaceId}-${this.type}`;
        

        if (!this.queues[queueName]) {
            logger.info(`Creating queue ${queueName}`)
            this.queues[queueName] = new Queue(queueName, { connection: this.connection });
            await this.markQueueActive(workspaceId);

            if( this.processCallback ){
                this.workers[queueName] = [];
                for (let i = 0; i < this.numWorkersPerQueue; i++) {
                
                    logger.debug(`Creating queue worker in main thread for ${queueName}`)
                    
                    this.workers[queueName].push(new Worker(queueName, async job => {
                        await this.setQueueActivity(queueName, true);
                        
                        const extendJob = async ()=>{
                            logger.debug(`Job still active`)

                            try{
                                await job.updateProgress(1); 
                            }catch(e){
                                logger.error(`ERROR EXTENDING LOCK FOR JOB ${job.id}`);
                                logger.error(e)
                            }

                        }
                        // Process job here
                        logger.info(`Processing job ${job.name}`);
                        let result
                        let rescheduled = false
                        if( this.processCallback ){
                            result = await this.processCallback( job, ()=>this.checkIfJobCancelled(job.name), extendJob )
                            if( result?.reschedule ){
                                logger.info(`Job asked to be rescheduled`)
                                rescheduled = true
                                const state = await job.getState();
                                await result.reschedule()
                            }
                        }
                        await this.resetCancelJob(job.name)
                        if( !rescheduled ){
                            await this.setQueueActivity(queueName, false);
                        }
                        return true
                        
                    }, { 
                        connection: this.connection, 
                        ...this.settings 
                    }));
                }
            }else{
                const threadCount = this.workerThreads?.length ?? 0;
                logger.debug(`Notifying ${threadCount} ${this.type} workers for ${queueName}`)
                // Always notify local workers if present
                if (threadCount > 0) {
                    for (const worker of this.workerThreads) {
                        try { worker.postMessage({ type: 'watch', queueName }); } catch {}
                    }
                }
                // Also broadcast cross-service unless suppressed
                if (!opts.suppressControl) {
                    try {
                        const payload = { cmd: 'watch', queueType: this.type, queueName, workspaceId: String(workspaceId), source: this.controlSource, sourceId: this.controlInstanceId };
                        await this.redis.publish(CONTROL_CHANNEL, JSON.stringify(payload));
                        logger.info(`Published watch for ${queueName} on ${CONTROL_CHANNEL} (src=${this.controlSource} / ${this.controlInstanceId})`);
                    } catch (e) {
                        logger.error('Failed to publish watch message', e);
                    }
                }
            }
        }
        return this.queues[queueName];
    }
    async getJobStatus(workspaceId, jobData) {
        const jobId = jobData.id + "-" + jobData.mode 
        const queue = await this.getQueue(workspaceId);
        const jobs = (await queue.getJobs(['waiting', 'waiting-children', 'active', 'delayed', 'completed', 'failed'])).filter(Boolean);

        const filteredJobs = jobs.filter(job => job.id.startsWith(jobId));
        return filteredJobs
    }

    async addJob(workspaceId, jobData, options = {}) {
        try {
            const queueName = `${workspaceId}-${this.type}`;
            let jobId = jobData.id + "-" + jobData.mode + (jobData.scope ? "-" + jobData.scope : "") + (options.reschedule ? `:t${Date.now()}` : "");
            const queue = await this.getQueue(workspaceId);
            let existing = await queue.getJob(jobId);
            if (existing) {
                try {
                    let status = await existing.getState();
                    let removedExisting = false;

                    if (status === "completed") {
                        await existing.remove();
                        removedExisting = true;
                    } else if (status === "waiting-children") {
                        const cleanupResult = await this.cleanupWaitingChildrenJob(queueName, existing, { reason: 'enqueue-inspection' });
                        removedExisting = cleanupResult?.removed === true;
                    }

                    if (removedExisting) {
                        existing = await queue.getJob(jobId);
                        if (existing) {
                            status = await existing.getState();
                        } else {
                            status = undefined;
                        }
                    }

                    if (existing) {
                        if (jobData.mode === "run_flow_instance") {
                            if (options.nextStep) {
                                jobId += `:t${Date.now()}`;
                                logger.debug(`Got request to re-run flow instance for next step`);
                            } else {
                                let retry = options.retry ?? 0;
                                logger.debug(`Got request to re-run flow instance but present in queue (status=${status}) - assuming last iteration is in cleanup - trying again (${retry})`);
                                if (retry < 3) {
                                    const manager = this;
                                    setTimeout(async () => {
                                        logger.debug(`Scheduled re-check for ${jobId}`);
                                        try {
                                            await manager.addJob(workspaceId, jobData, { ...options, retry: retry + 1 });
                                        } catch (err) {
                                            logger.error(`Retry addJob failed for ${jobId}`, err);
                                        }
                                    }, 100);
                                    return;
                                }
                                logger.info(`Job already present - skipping ${jobId} (status=${status})`);
                                return;
                            }
                        } else {
                            logger.info(`Job already present - skipping ${jobId} (status=${status})`);
                            return;
                        }
                    }
                } catch (inspectionError) {
                    logger.error(`Error inspecting existing job ${jobId} on ${queueName}`, inspectionError);
                }
            }
            logger.info(`Adding job ${jobId} on ${workspaceId}-${this.type}`)
            await queue.add(jobId, jobData, {
                removeOnFail: true,
                removeOnComplete: { age: 180},
                waitChildren: true,
                jobId: jobId, 
                // Enable retries by default; caller may override via options.attempts/backoff
                attempts: (options && typeof options.attempts === 'number') ? options.attempts : 3,
                backoff: options?.backoff ?? {
                    type: 'exponential', // Use exponential backoff
                    delay: 60 * 1000, // Initial delay: 1 minute
                },
                ...options 
            });
            await this.updateQueueActivity(`${workspaceId}-${this.type}`);

            try {
                const j = await queue.getJob(jobId);
                const st = j ? (await j.getState()) : 'missing';
                const counts = await queue.getJobCounts('waiting','active','waiting-children','delayed','failed','completed');
                logger.info(`[post-add] ${workspaceId}-${this.type} job=${jobId} state=${st} counts waiting=${counts.waiting||0} active=${counts.active||0} wchildren=${counts['waiting-children']||0} delayed=${counts.delayed||0} failed=${counts.failed||0} completed=${counts.completed||0}`);
            } catch (e) {
                logger.warn(`[post-add] error inspecting ${workspaceId}-${this.type} ${jobId}: ${e?.message || e}`)
            }

            return jobId
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

    // Mirror-only cleanup for subscribers that just want to drop local state
    // without mutating shared Redis or BullMQ state (authoritative service handles that).
    async mirrorStop(workspaceId, qn) {
        const queueName = qn ?? `${workspaceId}-${this.type}`;
        if (queueName && !workspaceId) {
            workspaceId = queueName.split('-')[0];
        }
        try {
            if (this.queues[queueName]) {
                delete this.queues[queueName];
            }
            logger.info(`Mirror-stop removed local queue reference for ${queueName}`)
        } catch (error) {
            console.error(`Error in mirrorStop for ${queueName}: ${error}`);
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
    async purgeQueue(workspaceId, qn, opts = {}) {
        if (this.controlSource === "worker") {
            console.log(`----- Suppressing purge on serivce of ${workspaceId}`);
            return;
        }
        if (this.processCallback) {
            return this.purgeQueueLegacy(workspaceId, qn);
        }
        const queueName = qn ?? `${workspaceId}-${this.type}`;
        if (queueName && !workspaceId) {
            workspaceId = queueName.split('-')[0];
        }
        if (!queueName) {
            logger.warn(`Unable to purge queue without name for workspace ${workspaceId}`);
            return;
        }

        logger.info(`Purging queue: ${queueName}`);

        const threadCount = this.workerThreads?.length ?? 0;
        if (threadCount > 0) {
            for (const worker of this.workerThreads) {
                try { worker.postMessage({ type: 'stop', queueName }); } catch (err) { console.error(`Error terminating worker thread for queue: ${queueName}`, err); }
            }
        }

        if (!opts.suppressControl) {
            try {
                const payload = { cmd: 'stop', queueType: this.type, queueName, workspaceId: String(workspaceId), source: this.controlSource, sourceId: this.controlInstanceId };
                await this.redis.publish(CONTROL_CHANNEL, JSON.stringify(payload));
                logger.info(`Published stop for ${queueName} on ${CONTROL_CHANNEL} (src=${this.controlSource} / ${this.controlInstanceId})`);
            } catch (e) {
                logger.error('Failed to publish stop message', e);
            }
        }

        if (this.queues[queueName]) {
            try { await this.teminateJobsInQueue(workspaceId); } catch (err) { logger.error(`Error terminating jobs for ${queueName}`, err); }
            if (this.workers[queueName]) {
                for (const worker of this.workers[queueName]) {
                    try { await worker.close(); } catch (err) { console.error(`Error closing worker for queue: ${queueName}`, err); }
                }
                delete this.workers[queueName];
            }
        }

        let queueRef = this.queues[queueName];
        let createdTemporaryQueue = false;
        if (!queueRef) {
            queueRef = new Queue(queueName, { connection: this.connection });
            createdTemporaryQueue = true;
        }

        try {
            await queueRef.pause();
        } catch (err) {
            console.error(`Error pausing queue: ${queueName}`, err);
        }

        try {
            await queueRef.obliterate({ force: true });
            logger.info(`Queue obliterated: ${queueName}`);
        } catch (err) {
            console.error(`Error obliterating queue: ${queueName}`, err);
        }

        await this.redis.del(`${queueName}-activeCount`);
        await this.redis.del(`${queueName}-lastActivity`);
        await this.markQueueInactive(workspaceId);

        if (this.queues[queueName]) {
            try { await this.queues[queueName].close?.(); } catch (err) { logger.error(`Error closing queue reference for ${queueName}`, err); }
            delete this.queues[queueName];
        }

        if (createdTemporaryQueue) {
            try { await queueRef.close(); } catch (err) { logger.error(`Error closing temporary queue ${queueName}`, err); }
        }
    }

    async status() {
        let aggregateList = [];

        for (const queueName in this.queues) {
            try {
                const queue = this.queues[queueName];
                const jobs = await queue.getJobs(['waiting', 'waiting-children', 'active', 'completed', 'failed', 'delayed']);
                const workerStatuses = this.workers[queueName]?.map((worker, index) => ({
                    workerId: index + 1,
                    threadId: worker.threadId,
                    isTerminated: worker.threadId === null,
                })) || [];

                const mappedJobs = []
                for(const job of jobs){
                    mappedJobs.push({
                        id: job.id,
                        name: job.name,
                        status: await job.getState(),
                        children: await job.getChildrenValues(),
                        data: job.data,
                        attemptsMade: job.attemptsMade,
                        failedReason: job.failedReason
                    })
                }

                const { activeCount, lastActivity } = await this.getQueueActivity(queueName);

                aggregateList.push({
                    queue: queueName,
                    jobs: mappedJobs,
                    activeCount,
                    lastActivity,
                    workers: workerStatuses,
                })
            } catch (error) {
                console.error(`Error retrieving status for queue ${queueName}: ${error}`);
            }
        }

        return aggregateList;
    }
}

export default QueueManager;
