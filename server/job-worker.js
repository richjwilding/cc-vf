import { parentPort, workerData, isMainThread, threadId } from 'node:worker_threads';
//import { WaitingChildrenError, Worker } from 'bullmq';
//import mongoose from 'mongoose';
//import { getLogger } from './logger.js';
//import { getRedisBase } from './redis.js';
//import asyncLocalStorage from './asyncLocalStorage';



process.on('uncaughtException', (err) => {
  try { parentPort?.postMessage({ type: 'error', error: { message: err.message, stack: err.stack } }); } catch {}
  process._rawDebug(`[worker:${threadId}] uncaughtException: ${err.stack || err}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason?.stack || reason?.message || String(reason);
  try { parentPort?.postMessage({ type: 'error', error: { message: msg } }); } catch {}
  process._rawDebug(`[worker:${threadId}] unhandledRejection: ${msg}`);
  process.exit(1);
});

if (isMainThread || !parentPort) {
    process.exit(1);
}
console.log(`Worker ${workerData.type} init`)

const noop = new Proxy({}, { get: () => () => {} });
let logger = noop;  // ← use this until the real logger is created

let Worker, WaitingChildrenError, Queue;
let mongoose, getRedisBase, asyncLocalStorage;
let redisClient, queueObject;
const queueWorkers = {};
let isTerminating = false;

const messageHandler = {}

process.on('uncaughtException', (err) => {
    parentPort.postMessage({
        type: 'error',
        error: { message: err.message, stack: err.stack },
    });
    process.exit(1); // Exit the worker thread after handling the error
});

process.on('unhandledRejection', (reason) => {
    parentPort.postMessage({
        type: 'error',
        error: { message: reason?.message || reason, stack: reason?.stack || null },
    });
    process.exit(1); // Exit the worker thread after handling the rejection
});

parentPort.on('message', ({type, ...data}) => {
    logger.debug(`Worker for message ${type}`, data)
    if( messageHandler[type]){
        messageHandler[type](data)
    }else{
        logger.info(`No handler for ${type}`, { type: workerData.type });
    }
})

messageHandler['endJobResponse'] = async (message)=>{
    if( queueObject ){
        logger.debug(`Forwarding endJob response ${message.requestId} to ${message.queueType} from ${workerData.type}`)
        const q = (workerData.type === message.queueType) ? queueObject : await getQueueObject(message.queueType)
        if( q.default().endJobResponse ){
            q.default().endJobResponse(message)
        }
    }
}
messageHandler['addJobResponse'] = async (message)=>{
    if( queueObject ){
        logger.debug(`Forwarding addJob response to ${message.queueType} from ${workerData.type}`)
        const q = (workerData.type === message.queueType) ? queueObject : await getQueueObject(message.queueType)
        if( q.default().addJobResponse ){
            q.default().addJobResponse(message)
        }
    }
}
messageHandler['terminate'] = async ()=>{
        logger.info(`[Worker] Termination requested for queue: ${workerData.queueName}`, {  type: workerData.type });
        isTerminating = true;

        try { await mongoose.connection.close() } catch {}
        logger.info(`[Worker] MongoDB connection closed for queue: ${workerData.queueName}`, { type: workerData.type });
        try { await redisClient.quit() } catch {}
        logger.info(`[Worker] Redis closed: ${workerData.queueName}`, { type: workerData.type });
        process.exit(0);

        mongoose.connection.close(() => {
            process.exit(0);
        });
}
messageHandler['stop'] = async ({queueName})=>{
        if( !queueWorkers[queueName ]){
            logger.info(`Worker thread not watching ${queueName}`, { type: workerData.type });
            return        
        }
        (async ()=>{
            logger.info(`Stopping watching ${queueName}`, { type: workerData.type });
            await queueWorkers[queueName ].close();
            delete queueWorkers[queueName ]
            logger.info(`Worker thread stopped watching ${queueName}`, { type: workerData.type });
        })()
}

// Heartbeat: report counts for queues this thread is watching
messageHandler['heartbeat'] = async () => {
        try {
            const reports = [];
            for (const [qname, _w] of Object.entries(queueWorkers)) {
                try {
                    const q = new Queue(qname, { connection: workerData.redisOptions });
                    const counts = await q.getJobCounts('waiting','active','waiting-children','delayed','failed','completed');
                    await q.close();
                    reports.push({ queue: qname, counts });
                } catch (e) {
                    reports.push({ queue: qname, error: e?.message || String(e) });
                }
            }
            parentPort.postMessage({ type: 'heartbeat', data: { threadId, type: workerData.type, reports } });
        } catch (e) {
            parentPort.postMessage({ type: 'heartbeat', data: { threadId, type: workerData.type, error: e?.message || String(e) } });
        }
}

async function getProcessFunction(type) {
    queueObject = await getQueueObject(type)
    // Ensure queue side effects (like scheduler registration) run inside this
    // worker thread before jobs execute. Most queue modules expose their
    // singleton via a default export with the required setup.
    if (queueObject?.default && typeof queueObject.default === 'function') {
        queueObject.default();
    }
    return queueObject.processQueue
}
// Dynamically load the appropriate processing function based on queue type
async function getQueueObject(type) {
    switch (type) {
        case 'document':
            return (await import('./document_queue.js'))
        case 'ai':
            return (await import('./ai_queue.js'))
        case 'enrich':
            return (await import('./enrich_queue.js'))
        case 'query':
            return (await import('./query_queue.js'))
        case 'brightdata':
            return (await import('./brightdata_queue.js'))
        case 'flow':
            return (await import('./flow_queue.js'))
        default:
            throw new Error(`Unknown queue type: ${type}`);
    }
}
(async () => {

    const { getLogger } = await import('./logger.js');    
    ({ Worker, WaitingChildrenError, Queue } = await import('bullmq'));
    mongoose = (await import('mongoose')).default;
    ({ getRedisBase } = await import('./redis.js'));

    ({ default: asyncLocalStorage } = await import('./asyncLocalStorage.js'));

    logger = getLogger('job-worker', 'debug'); // Debug level for moduleA

    let connection
    try{

        mongoose.set('strictQuery', false);
        
        mongoose.connection.on('connecting', () => logger.info('mongo connecting'));
        mongoose.connection.on('connected', () => logger.info('mongo connected'));
        mongoose.connection.on('error', err => logger.error('mongo error', err));

        connection = await mongoose.connect(process.env.MONGOOSE_URL,{
            maxPoolSize: 10
        })
        logger.info(`[Worker] ${workerData.type} connected to MongoDB`, {type: workerData.type });
    }catch(e){
        logger.info(`Couldnt connection mongo`, {  type: workerData.type });
        logger.info(e, { type: workerData.type });
    }

    await import("./action_register.js")

    redisClient = getRedisBase(`worker-${workerData.type}`)

    const processQueue = await getProcessFunction(workerData.type);
    async function processJob(job, queueName, token) {
        if (isTerminating) {
            logger.info(`[Worker] Skipping job ${job.id} due to termination.`, {  type: workerData.type });
            return;
        }

        const parentMeta = job.parent ? { id: job.parent.id, queueName: job.parent.queueKey.slice(5) } : null;

        const isCancelled = await redisClient.get(`job:${job.id}:cancel`);
        if (isCancelled === 'true') {
            parentPort.postMessage({ result: 'cancelled', queueName, jobId: job.id });
            return;
        }
        try {
            logger.info(`\n\nThread running for ${workerData.queueName}`, {  type: workerData.type, attemptsMade: job.attemptsMade, token });
            // If this job previously moved to waiting-children and is now resuming, finalize without redoing work
            if (job?.data?.awaitingChildren === true) {
                logger.debug(`===> Sending endJob message B ${job.id} (resumed after children completed)`, { type: workerData.type });
                try { await job.updateData({ ...(job.data || {}), awaitingChildren: false }); } catch {}
                await queueObject.default().endJob({ success: true, queueType: workerData.type, queueName, jobId: job.id, notify: job.data.notify, token: token, parent: parentMeta })
                return
            }
            parentPort.postMessage({ type: "startJob", queueName, jobId: job.id, token: token });

            const extendLockInterval = 5000; 
            let resetErrors = 0
            const lockExtension = setInterval(async () => {
                try{
                    await job.updateProgress(1); 
                }catch(e){
                    logger.info(`ERROR EXTENDING LOCK FOR JOB ${job.id}`, {  type: workerData.type });
                    logger.info(e)
                    resetErrors++
                    if( resetErrors > 10){
                        logger.info(`Temrinating lock refresh for ${job.id} after ${resetErrors}`, {  type: workerData.type });
                        clearInterval(lockExtension);

                    }
                }
            }, extendLockInterval)


            await asyncLocalStorage.run(new Map(), async () => {
                /*if(queueObject.default().resetChildWaiting){
                    children = await queueObject.default().resetChildWaiting(queueName, job.id)
                }*/
                const store = asyncLocalStorage.getStore();
                store.set('parentJob', job);
                logger.debug(`---- ${queueName} set parentJob to ${job.id}`)
    
                let result, success
                try {
                    result = await processQueue(job, () => redisClient.get(`job:${job.id}:cancel`) === 'true', ()=>{logger.info("!!! extend job in thread"); job.updateProgress(1)});
                    logger.debug(`Workload for ${job.id} completed`)
                    success = true
                } catch (e) {
                    logger.debug(`Error in ${workerData.type} queue during job processing: ${e.stack}`, { type: workerData.type });
                    logger.debug(e.stack)
                    await queueObject.default().endJob({ result, success: false, error: e, queueType: workerData.type, queueName, jobId: job.id, notify: job.data.notify, token: token, parent: parentMeta })
                    throw e;
                } finally {
                    clearInterval(lockExtension);
                }
                clearInterval(lockExtension); // <— stop keepalive BEFORE moving state

                // Ask BullMQ to park if there are outstanding deps.
                // v4.2 returns a boolean: true => parent was moved to waiting-children.
                logger.debug(`calling moveToWait for ${job.id}`)
                const shouldWait = await job.moveToWaitingChildren(token);

                if (shouldWait) {
                    // Mark that we parked in waiting-children so the next pass can finalize quickly
                    try { await job.updateData({ ...(job.data || {}), awaitingChildren: true }); } catch {}
                    // IMPORTANT: do not call your endJob here — the worker will handle rescheduling.
                    logger.debug(`shouldWait -> throwing ${job.id}`)
                    throw new WaitingChildrenError();
                }
                logger.debug(`continuing to finish ${job.id}`)

                const reschedule = result?.reschedule
                if( reschedule ){
                    if( job.parent ){
                        const parentQueueName = job.parent.queueKey.slice(5)
                        logger.info(`Job requested reschedule ${job.id} of parent ${job.parent.id} / ${parentQueueName}`);
                        await result.reschedule( {id: job.parent.id, queueName: parentQueueName})
                    }else{
                        logger.info(`Job requested reschedule ${job.id} without parent`);
                        await result.reschedule({id: undefined, queueName: undefined})
                    }
                    result = "Reschedule requested"
                }
                logger.debug(`===> Sending endJob message A ${job.id}`, { type: workerData.type });
                await queueObject.default().endJob({ success: true, error: result?.error, queueType: workerData.type, queueName, jobId: job.id, notify: job.data.notify, token: token, parent: parentMeta })
                try { await job.updateData({ ...(job.data || {}), awaitingChildren: false }); } catch {}

//                parentPort.postMessage({ /*result,*/ success: true, error: result?.error, type: "endJob", queueName, jobId: job.id, notify: job.data.notify, token: token });
            });
            
        } catch (error) {
            if (error instanceof WaitingChildrenError) {
                throw error
            } else {
                logger.error(`Job ${job.id} failed with error: ${error.message}`);
                logger.error(error.stack)
                throw error; // Let BullMQ retry or fail the job
            }
        }

    }
    messageHandler['watch'] = async ({queueName})=>{
        if( queueWorkers[queueName ]){
            logger.info(`Worker thread ${threadId} already watching ${queueName}`, {  type: workerData.type });
            return        
        }
        logger.info(`Worker thread ${threadId} watching ${queueName}`, {  type: workerData.type });
        const worker = new Worker(queueName, async (job,token) => await processJob(job, queueName, token), {
            connection: workerData.redisOptions,
                maxStalledCount: 1,
                concurrency: 5,
                removeOnFail: true,
                waitChildren: true, 
                removeOnComplete: false, 
                stalledInterval: 1 * 60 * 1000,
                lockDuration: 5 * 60 * 1000, // Set lock duration to 10 minutes
            });
        // Add visibility into BullMQ worker lifecycle for this queue
        worker.on('waiting', (jobIdOrJob) => {
            const id = jobIdOrJob?.id ?? jobIdOrJob;
            logger.info(`[worker_${workerData.type}] ${threadId} waiting ${queueName} ${id}`);
        });
        worker.on('active', (job) => {
            logger.info(`[worker_${workerData.type}] ${threadId} active ${queueName} ${job?.id}`);
        });
        worker.on('completed', (job) => {
            logger.info(`[worker_${workerData.type}] ${threadId} completed ${queueName} ${job?.id}`);
        });
        worker.on('failed', async (job, error) =>{
            console.log(`failed`, error)
            logger.info(`===> Sending failed message ${job?.id}`, { type: workerData.type});
            parentPort.postMessage({ error: error.message, queueName, jobId: job?.id })}
        );
        queueWorkers[queueName ] = worker
    }
    messageHandler['invoke_job'] = async ({data, parentJob, requestId, options})=>{
        logger.info(`Worker thread got invoke request`)
        if( !options.workspaceId ){
            logger.error("No workspaceId provided - skipping")
            return
        }
        if( queueObject ){
            await queueObject.default().addJob( options.workspaceId, data, {...options, parent: parentJob})
        }
        parentPort.postMessage({ type: "invoke_job_response", requestId,...data });
    }
    process._rawDebug(`[worker ${threadId}] ${workerData.type} - sending ready`)
    parentPort.postMessage({ type: "ready"});


})();
