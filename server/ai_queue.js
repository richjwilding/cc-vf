import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';


let instance

export default function QueueAI(){
    if( instance ){
        return instance
    }
    
    instance = new Queue("aiQueue", {
        connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT },
    });
    
    new Worker('aiQueue', async job => {
        // Will print { foo: 'bar'} for the first job
        // and { qux: 'baz' } for the second.
        console.log("queue data")
        console.log(job.data);
        SIO.getIO().emit("control", job.data)
    });
    return instance
}
