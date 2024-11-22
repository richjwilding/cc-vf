import { createClient } from 'redis';
import { parentPort, workerData } from 'worker_threads';
import { Worker } from 'bullmq';
import mongoose from 'mongoose';

let isTerminating = false;


parentPort.on('message', (message) => {
    if (message === 'terminate') {
        console.log(`[Worker] Termination requested for queue: ${workerData.queueName}`);
        isTerminating = true;

        mongoose.connection.close(() => {
            console.log(`[Worker] MongoDB connection closed for queue: ${workerData.queueName}`);
            process.exit(0);
        });
    }
});
// Dynamically load the appropriate processing function based on queue type
async function getProcessFunction(type) {
    switch (type) {
        case 'document_queue':
            return (await import('./document_queue')).processQueue;
        case 'ai_queue':
            return (await import('./ai_queue')).processQueue
        case 'enrich_queue':
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

    mongoose.set('strictQuery', false);
    mongoose.connect(process.env.MONGOOSE_URL)
    console.log(`[Worker] Connected to MongoDB`);
    
    const redisClient = createClient({ socket: { host: workerData.redisOptions.host, port: workerData.redisOptions.port } });
    await redisClient.connect();
    //const queue = new Queue(workerData.queueName, { connection: workerData.redisOptions });
    // Load the processing function for this queue type
    const processQueue = await getProcessFunction(workerData.type);
    async function processJob(job) {
        if (isTerminating) {
            console.log(`[Worker] Skipping job ${job.id} due to termination.`);
            return;
        }

        const isCancelled = await redisClient.get(`job:${job.id}:cancel`);
        if (isCancelled === 'true') {
            parentPort.postMessage({ result: 'cancelled', jobId: job.id });
            return;
        }
        try {
            console.log(`Thread running for ${workerData.queueName}`)
            console.log(processQueue)
            const result = await processQueue(job, () => redisClient.get(`job:${job.id}:cancel`) === 'true');
            parentPort.postMessage({ result, jobId: job.id });
        } catch (error) {
            parentPort.postMessage({ error: error.message, jobId: job.id });
        }
    }
    console.log(`New worker thread for ${workerData.queueName}`)
    const worker = new Worker(workerData.queueName, async job => await processJob(job), {
        connection: workerData.redisOptions
    });
    worker.on('completed', job => parentPort.postMessage({ result: job.returnvalue, jobId: job?.id }));
    worker.on('failed', (job, error) => parentPort.postMessage({ error: error.message, jobId: job?.id }));

})();
