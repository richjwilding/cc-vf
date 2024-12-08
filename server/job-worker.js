import { createClient } from 'redis';
import { parentPort, workerData } from 'worker_threads';
import { WaitingChildrenError, Worker } from 'bullmq';
import mongoose from 'mongoose';
import { getLogger } from './logger';
import "./action_register"
const asyncLocalStorage = require('./asyncLocalStorage');

const logger = getLogger('job-worker', 'debug'); // Debug level for moduleA

let queueObject
let isTerminating = false;
let queueWorkers = {}

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

messageHandler['addJobResponse'] = async (message)=>{
    if( queueObject ){
        console.log(`Forwarding addJob response to ${message.queueType} from ${workerData.type}`)
        const q = (workerData.type === message.queueType) ? queueObject : await getQueueObject(message.queueType)
        if( q.default().addJobResponse ){
            q.default().addJobResponse(message)
        }
    }
}
messageHandler['terminate'] = async ()=>{
        logger.info(`[Worker] Termination requested for queue: ${workerData.queueName}`, {  type: workerData.type });
        isTerminating = true;

        mongoose.connection.close(() => {
            logger.info(`[Worker] MongoDB connection closed for queue: ${workerData.queueName}`, { type: workerData.type });
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

async function getProcessFunction(type) {
    queueObject = await getQueueObject(type)
    return queueObject.processQueue
}

// Dynamically load the appropriate processing function based on queue type
async function getQueueObject(type) {
    switch (type) {
        case 'document':
            return (await import('./document_queue'))
        case 'ai':
            return (await import('./ai_queue'))
        case 'enrich':
            return (await import('./enrich_queue'))
        case 'query':
            return (await import('./query_queue'))
        case 'brightdata':
            return (await import('./brightdata_queue'))
        case 'flow':
            return (await import('./flow_queue'))
        default:
            throw new Error(`Unknown queue type: ${type}`);
    }
}
(async () => {

    let connection
    try{

        mongoose.set('strictQuery', false);
        connection = mongoose.connect(process.env.MONGOOSE_URL,{
            maxPoolSize: 2
        })
        logger.info(`[Worker] ${workerData.type} connected to MongoDB`, {type: workerData.type });
    }catch(e){
        logger.info(`Couldnt connection mongo`, {  type: workerData.type });
        logger.info(e, { type: workerData.type });
    }
    
    const redisClient = createClient({ socket: { host: workerData.redisOptions.host, port: workerData.redisOptions.port } });
    await redisClient.connect();
    //const queue = new Queue(workerData.queueName, { connection: workerData.redisOptions });
    // Load the processing function for this queue type
    const processQueue = await getProcessFunction(workerData.type);
    async function processJob(job, queueName, token) {
        if (isTerminating) {
            logger.info(`[Worker] Skipping job ${job.id} due to termination.`, {  type: workerData.type });
            return;
        }

        const isCancelled = await redisClient.get(`job:${job.id}:cancel`);
        if (isCancelled === 'true') {
            parentPort.postMessage({ result: 'cancelled', queueName, jobId: job.id });
            return;
        }
        try {
            logger.info(`\n\nThread running for ${workerData.queueName}`, {  type: workerData.type, attemptsMade: job.attemptsMade, token });
            if( job.attemptsMade > 1 ){
                logger.info(`===> Sending endJob message ${job.id}`, { type: workerData.type });
                parentPort.postMessage({ result: true, success: true, type: "endJob", queueName, jobId: job.id, notify: job.data.notify, token: token });
                return
            }
            parentPort.postMessage({ type: "startJob", queueName, jobId: job.id, token: token });

            const extendLockInterval = 5000; 
            const lockExtension = setInterval(() => {
                try{
                    job.updateProgress(1); 
                }catch(e){
                    logger.info(`ERROR EXTENDING LOCK FOR JOB ${job.id}`, {  type: workerData.type });
                }
            }, extendLockInterval)


            await asyncLocalStorage.run(new Map(), async () => {
                if(queueObject.default().resetChildWaiting){
                    children = await queueObject.default().resetChildWaiting(queueName, job.id)
                }
                const store = asyncLocalStorage.getStore();
                store.set('parentJob', job);
                console.log(`---- ${queueName} set parentJob to ${job.id}`)
    
                let result, success
                try {
                    result = await processQueue(job, () => redisClient.get(`job:${job.id}:cancel`) === 'true');
                    success = true
                } catch (e) {
                    logger.debug(`Error in ${workerData.type} queue during job processing: ${e.stack}`, { type: workerData.type });
                    parentPort.postMessage({ result, success: false, error: e, type: "endJob", queueName, jobId: job.id, notify: job.data.notify, token: token });
                    throw e;
                } finally {
                    clearInterval(lockExtension);
                }
                let children
                if(queueObject.default().getChildWaiting){
                    children = await queueObject.default().getChildWaiting(queueName, job.id)
                    console.log(`Got children count`, children)
                }
                if( children && children > 0){
                    await job.moveToWaitingChildren(token);
                    console.log(`Move to waiting for children`)
                    throw new WaitingChildrenError();
                }
                logger.info(`===> Sending endJob message ${job.id}`, { type: workerData.type });
                parentPort.postMessage({ result, success: true, type: "endJob", queueName, jobId: job.id, notify: job.data.notify, token: token });
            });
            
        } catch (error) {
            if (error instanceof WaitingChildrenError) {
                throw error
            } else {
                console.error(`Job ${job.id} failed with error: ${error.message}`);
                throw error; // Let BullMQ retry or fail the job
            }
        }

    }
    messageHandler['watch'] = async ({queueName})=>{
        console.log(`WATCH ${queueName}`)
        if( queueWorkers[queueName ]){
            logger.info(`Worker thread already watching ${queueName}`, {  type: workerData.type });
            return        
        }
        logger.info(`Worker thread watching ${queueName}`, {  type: workerData.type });
        const worker = new Worker(queueName, async (job,token) => await processJob(job, queueName, token), {
            connection: workerData.redisOptions,
                maxStalledCount: 0,
                removeOnFail: true,
                waitChildren: true, 
                removeOnComplete: false, 
                stalledInterval:300000,
                lockDuration: 10 * 60 * 1000, // Set lock duration to 10 minutes
            });
        worker.on('failed', async (job, error) =>{
            console.log(`failed`, error)
            logger.info(`===> Sending failed message ${job?.id}`, { type: workerData.type});
            parentPort.postMessage({ error: error.message, queueName, jobId: job?.id })}
        );
        queueWorkers[queueName ] = worker
    }
    parentPort.postMessage({ type: "ready"});


})();
