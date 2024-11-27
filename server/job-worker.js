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
        console.log(`[Worker] Connected to MongoDB`);
    }catch(e){
        console.log(`Couldnt connection mongo`)
        console.log(e)
        console.log(e?.reason)
        console.log(e?.reason?.servers)
        console.log(Object.values(e?.reason?.servers ?? {}))
    }
    
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
            parentPort.postMessage({ type: "startJob", jobId: job.id });

            const extendLockInterval = 50000; 
            const lockExtension = setInterval(() => {
                try{
                    job.updateProgress(1); 
                    console.log(`Lock extended for job ${job.id}`);
                }catch(e){
                    console.log(`ERROR EXTENDING LOCK FOR JOB ${job.id}`)
                }
            }, extendLockInterval)


            let result
            try {
                result = await processQueue(job, () => redisClient.get(`job:${job.id}:cancel`) === 'true');
                console.log("PROCESSING DONE")
            }catch(e){
                console.log(`Error in ${workerData.type} queue`)            
                console.log(e)
            }finally{
                console.log(`Clearing lock renewal`)
                clearInterval(lockExtension); // Clear the lock extension interval
            }
            
            console.log(`===> Sending endJob messaged ${job.id}`)
            parentPort.postMessage({ result, type: "endJob", jobId: job.id });
        } catch (error) {
            parentPort.postMessage({ error: error.message, jobId: job.id });
        }
    }
    console.log(`New worker thread for ${workerData.queueName}`)
    const worker = new Worker(workerData.queueName, async job => await processJob(job), {
        connection: workerData.redisOptions,
        //settings: {
            maxStalledCount: 0,
            removeOnFail: true,
            stalledInterval:300000,
            lockDuration: 10 * 60 * 1000, // Set lock duration to 10 minutes
        //}
    });
    worker.on('completed', job => parentPort.postMessage({ result: job.returnvalue, jobId: job?.id }));
    worker.on('failed', (job, error) => parentPort.postMessage({ error: error.message, jobId: job?.id }));

})();
