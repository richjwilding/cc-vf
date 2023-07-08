import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import { getDocumentAsPlainText, importDocument, removeDocument } from "./google_helper";
import Primitive from "./model/Primitive";
import { dispatchControlUpdate } from "./SharedFunctions";


let instance

export default function QueueDocument(){    
    if( instance ){
        return instance
    }
    
    instance = new Queue("documentQueue", {
        connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT },
    });
    
    new Worker('documentQueue', async job => {
        console.log(job.data)
        console.log(job.data.command)
        if( job.data.command === "refresh" ){
            console.log(`Purging existing document for ${job.data.id}`)
            const primitive = await Primitive.findOne({_id: job.data.id})
            
            dispatchControlUpdate(job.data.id, "processing.document_refresh", "true")

            try{

                await removeDocument(job.data.id)
                console.log(`Purge done for ${job.data.id}`)
                //SIO.getIO().emit("message", [{type: "document_cleared", id: job.data.id}])            
                SIO.notifyPrimitiveEvent(primitive, [{type: "document_cleared", id: job.data.id}])            
            }catch(error){
                console.log(`Error in documentQueue.refresh - purge`)
                console.log(error)
            }


            try{

                const importRes = await importDocument(job.data.id, job.data.req)
                
                dispatchControlUpdate(job.data.id, "referenceParameters.notes.lastFetched", importRes)
                
                if( importRes ){
                    console.log(`documentQueue.refresh - imported ${job.data.id}`)
                    const res = await getDocumentAsPlainText(job.data.id, job.data.req)
                    if( res ){
                        console.log(`documentQueue.refresh - plain text imported ${job.data.id}`)
                    }else{
                        console.log(`Plain text import failed for ${job.data.id}`)
                    }
                }else{
                    console.log(`Document import failed for ${job.data.id} ${job.data.value}`)
                }
            }catch(error){
                console.log(`Error in documentQueue.refresh - import`)
                console.log(error)
            }
            
            dispatchControlUpdate(job.data.id, "processing.document_refresh", undefined)

        }
        
    });
    return instance
}
