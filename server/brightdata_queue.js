import Primitive from "./model/Primitive.js";
import { addRelationship, cosineSimilarity, createPrimitive, dispatchControlUpdate, executeConcurrently, fetchPrimitive, fetchPrimitives, findResultSetForCategoryId, getDataForProcessing, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentPath, primitiveParentsOfType, primitiveRelationship, primitiveTask } from "./SharedFunctions";
import Category from "./model/Category.js";
import { setBrightdataScheduler, handleCollection as handleBrightDataCollection } from './brightdata.js';
import { handleCollection as handleCoresignalCollection } from './coresignal.js';
import { handleBrightDataCollector } from "./brightdata_collectors.js";
import BaseQueue from "./base_queue.js";


let instance

export async function processQueue(job, cancelCheck){
    try{
        const {id: primitiveId, field, ...data} = job.data
        const primitive = await Primitive.findOne({_id: primitiveId})
        if( primitive){
            if( data.mode === "collect" ){
                console.log(`Check...`)
                dispatchControlUpdate(primitiveId, field , {status: "Checking for results"}, {...data, track: primitiveId})
                const provider = data.provider ?? "brightdata"
                let handler
                if( provider === "coresignal" ){
                    handler = handleCoresignalCollection
                }else if( provider === "brightdata_collector" ){
                    handler = handleBrightDataCollector
                }else{
                    handler = handleBrightDataCollection
                }
                const result = await handler( primitive, data )
                if( result?.reschedule ){
                    return result
                }

                const collectedCount = Array.isArray(result) ? result.length : Number(result?.collected ?? 0)
                dispatchControlUpdate(primitiveId, field , {status: "Collected", date: new Date(), count: collectedCount}, {...data, track: primitiveId})

                if( primitive.processing?.query?.collecting ){
                    const updatedPrimitive = await fetchPrimitive( primitiveId )
                    const totalCount = Object.values(updatedPrimitive.primitives?.origin ?? {}).length
                    await dispatchControlUpdate(primitiveId, "processing.query" , {status: "complete", scanned: collectedCount, totalCount, message: `Collected ${collectedCount} new items (total ${totalCount})`})
                }

                return result
            }else if( data.mode === "enrich"){
                console.log(`check for enrich...`)
                const result = await handleBrightDataCollection( primitive, data, false)
                let collected = 0

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
                            collected++
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
                    dispatchControlUpdate(primitiveId, field , {status: "Collected", date: new Date()}, {...data, track: primitiveId})
                    if( primitive.processing?.query ){
                        dispatchControlUpdate(primitiveId, "processing.query" , {status: "complete", scanned: collected, totalCount: collected, message: `Collected ${collected} items`})
                    }
                }
            }
        }
    }catch(error){
        console.log(`Error in queryQueue`)
        console.log(error)
    }
    
}
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
    if (!instance) {
        instance = new BDQueueClass();
        instance.myInit();
    }
    return instance;
}

class BDQueueClass extends BaseQueue{
    constructor() {
        super('brightdata', undefined, 1)
    }

    async scheduleCollection(primitive, options, reschedule ){
        const primitiveId = primitive.id
        const workspaceId = primitive.workspaceId
        //const field = "processing.bd.collect"
        const api = options.api
        const provider = options.provider ?? "brightdata"
        const fieldPrefix = provider === "coresignal" ? "processing.coresignal" : "processing.bd"
        const field = `${fieldPrefix}.${api}.status`
        const data = {
            mode: options.callopts?.enrich ? "enrich" : "collect",
            api,
            provider,
            field,
            text:"Awaiting results",
            ...options
        }
        const delay = (reschedule ? 45 : 0.5) * 1000

        console.log(`Schedule checkin in ${delay / 1000}s`)
        await this.addJob(workspaceId, {id: primitiveId, ...data, field}, { delay, reschedule, parent: options.parent })
    }
}
