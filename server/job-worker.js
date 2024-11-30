import { createClient } from 'redis';
import { parentPort, workerData } from 'worker_threads';
import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { getLogger } from './logger';


const logger = getLogger('job-worker', 'debug'); // Debug level for moduleA

let isTerminating = false;
let queueWorkers = {}

const messageHandler = {}

parentPort.on('message', ({type, ...data}) => {
    if( messageHandler[type]){
        messageHandler[type](data)
    }else{
        logger.info(`No handler for ${message}`, { type: workerData.type });
    }
})

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
            Logger.info(`Worker thread not watching ${queueName}`, { type: workerData.type });
            return        
        }
        (async ()=>{
            logger.info(`Stopping watching ${queueName}`, { type: workerData.type });
            await queueWorkers[queueName ].close();
            delete queueWorkers[queueName ]
            logger.info(`Worker thread stopped watching ${queueName}`, { type: workerData.type });
        })()
}

// Dynamically load the appropriate processing function based on queue type
async function getProcessFunction(type) {
    switch (type) {
        case 'document':
            return (await import('./document_queue')).processQueue;
        case 'ai':
            return (await import('./ai_queue')).processQueue
        case 'enrich':
            return (await import('./enrich_queue')).processQueue;
        case 'query':
            return (await import('./query_queue')).processQueue;
        case 'brightdata_queue':
            return (await import('./brightdata_queue')).processQueue;
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
    async function processJob(job, queueName) {
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
            logger.info(`Thread running for ${workerData.queueName}`, {  type: workerData.type });
            parentPort.postMessage({ type: "startJob", queueName, jobId: job.id });

            const extendLockInterval = 50000; 
            const lockExtension = setInterval(() => {
                try{
                    job.updateProgress(1); 
                }catch(e){
                    logger.info(`ERROR EXTENDING LOCK FOR JOB ${job.id}`, {  type: workerData.type });
                }
            }, extendLockInterval)


            let result
            try {
                result = await processQueue(job, () => redisClient.get(`job:${job.id}:cancel`) === 'true');
            }catch(e){
                logger.info(`Error in ${workerData.type} queue`, {  type: workerData.type });          
                logger.info(e, {  type: workerData.type });
            }finally{
                clearInterval(lockExtension); // Clear the lock extension intervalnn
            }
            
            logger.info(`===> Sending endJob messaged ${job.id}`, {  type: workerData.type });
            parentPort.postMessage({ result, type: "endJob", queueName, jobId: job.id });
        } catch (error) {
            parentPort.postMessage({ error: error.message, queueName, jobId: job.id });
        }
    }
    messageHandler['watch'] = async ({queueName})=>{
        if( queueWorkers[queueName ]){
            logger.info(`Worker thread already watching ${queueName}`, {  type: workerData.type });
            return        
        }
        logger.info(`Worker thread watching ${queueName}`, {  type: workerData.type });
        const worker = new Worker(queueName, async job => await processJob(job, queueName), {
            connection: workerData.redisOptions,
                maxStalledCount: 0,
                removeOnFail: true,
                stalledInterval:300000,
                lockDuration: 10 * 60 * 1000, // Set lock duration to 10 minutes
            });
        worker.on('completed', job => parentPort.postMessage({ result: job.returnvalue, queueName, jobId: job?.id }));
        worker.on('failed', (job, error) => parentPort.postMessage({ error: error.message, queueName, jobId: job?.id }));
        queueWorkers[queueName ] = worker
    }
    parentPort.postMessage({ type: "ready"});


})();
