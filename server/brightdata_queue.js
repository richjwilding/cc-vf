import QueueManager from './base_queue'; 
import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import Primitive from "./model/Primitive";
import { addRelationship, cosineSimilarity, createPrimitive, dispatchControlUpdate, executeConcurrently, fetchPrimitive, fetchPrimitives, findResultSetForCategoryId, getDataForProcessing, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentPath, primitiveParentsOfType, primitiveRelationship, primitiveTask } from "./SharedFunctions";
import Category from "./model/Category";
import { buildDocumentTextEmbeddings } from './DocumentSearch';
import { handleCollection } from './brightdata';


let instance
let _queue

export async function enrichmentDuplicationCheck( primitive, valueToCheck, config ){
    const referenceId = config.resultCategory
    
    console.log(`Will check ${valueToCheck} ${referenceId}`)

    const match = await fetchPrimitives([],{
        workspaceId: primitive.workspaceId,
        referenceId: referenceId,
        "referenceParameters.url": valueToCheck
    }, {_id: 1})
    
    if( match.length > 0){
        console.log(`already present - linking`)
        if( config?.asParent ){
            console.log(`link as parent ${match[0].id}`)
            const rel = typeof(config.asParent) === "string" ? config.asParent : "link"
            await addRelationship( match[0].id, primitive.id, rel )
        }else{
            await addRelationship( primitive.id, match[0].id, "auto" )
            await addRelationship( primitive.id, match[0].id, "alt_origin" )
        }
        return true
    }
    return false
}

export default function BrightDataQueue(){    
    if( instance ){
        return instance
    }
    
    const processQueue = async (job, cancelCheck) => {
        try{
            const {id: primitiveId, field, ...data} = job.data
            const primitive = await Primitive.findOne({_id: primitiveId})
            if( primitive){
                if( data.mode === "collect" ){
                    console.log(`Check...`)
                    dispatchControlUpdate(primitiveId, field , {status: "Checking for results"}, {...data, track: primitiveId})
                    return await handleCollection( primitive, data )
                }else if( data.mode === "enrich"){
                    console.log(`check for enrich...`)
                    const result = await handleCollection( primitive, data, false)

                    if( result?.reschedule ){
                        return result
                    }
                    const sourceCategory = await Category.findOne({id: primitive.referenceId})
                    if( sourceCategory){
                        const [_, api, endpoint] = data.api.split(/(.+?)_(.*)/)
                        const action = sourceCategory.actions.find(d=>d.api === api && d.endpoint === endpoint)
                        const createConfig = action.create

                        const addNewAsParent = createConfig.asParent

                        const addItem = async (data)=>{
                            if( action.create?.checkDuplicatePost ){
                                if( await enrichmentDuplicationCheck( primitive, data.referenceParameters.url, createConfig )){
                                    return
                                }
                                console.log("not found")
                            }

                            const newData = {
                                workspaceId: primitive.workspaceId,
                                paths: addNewAsParent ? undefined : ['origin', 'auto'],
                                parent: addNewAsParent ? undefined : primitive.id,
                                data:{
                                    type: "result",
                                    referenceId: 63,
                                    ...data
                                }
                            }
                            
                            try{
                                const newPrim = await createPrimitive( newData )
                                if( addNewAsParent ){
                                    const rel = typeof(addNewAsParent) === "string" ? addNewAsParent : "link"
                                    await addRelationship( newPrim.id, primitive.id, rel )
                                }
                            }catch(error){
                                console.log(`Error creating primitive for BD result`)
                                console.log(newData)
                                console.log(error)
                            }
                        }
                        await executeConcurrently( result, addItem, undefined, undefined, 10)
                    }
                }
            }
        }catch(error){
            console.log(`Error in queryQueue`)
            console.log(error)
        }
        
    }

    instance = {} 
    instance.scheduleCollection = (primitive, options, reschedule )=>{
        const primitiveId = primitive.id
        const workspaceId = primitive.workspaceId
        //const field = "processing.bd.collect"
        const api = options.api
        const field = `processing.bd.${api}.status`
        const data = {
            mode: options.callopts?.enrich ? "enrich" : "collect", 
            api,
            field, 
            text:"Awaiting results", 
            ...options
        }
        const delay = (reschedule ? 45 : 2) * 1000

        console.log(`Schedule checkin in ${delay / 1000}s`)
        _queue.addJob(workspaceId, {id: primitiveId, ...data, field}, { delay, reschedule })
        dispatchControlUpdate(primitiveId, field , {status: "pending"}, {...data, track: primitiveId})
    }
    instance.pending = async ()=>{
        return await _queue.status();
    }
    instance.purge = async (workspaceId)=>{
        if( workspaceId ){
            return await _queue.purgeQueue(workspaceId);
        }else{
            return await _queue.purgeAllQueues();

        }
    }
    
    _queue = new QueueManager("brightdata", processQueue, 1 );
    
    instance.myInit = async ()=>{
        console.log("Brightdata")
        const jobCount = await _queue.status();
        console.log( jobCount, " jobs in queue (Brightdata)")
    }
    
    return instance
}
