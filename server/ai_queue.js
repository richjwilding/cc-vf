import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import { addRelationship, createPrimitive, dispatchControlUpdate, getDataForProcessing, primitiveChildren, removeRelationship } from "./SharedFunctions";
import Primitive from "./model/Primitive";
import { buildCategories, categorize } from "./openai_helper";


let instance

export default function QueueAI(){

    if( instance ){
        return instance
    }
    
    instance = new Queue("aiQueue", {
        connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT },
    });

    instance.markCategories = (primitive, target, action, req)=>{
        if( primitive.type === "category"){
            const field = `processing.ai.mark_categories`
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Assign to categories"})
            dispatchControlUpdate(target.id, field , {status: "pending"})
            instance.add(`mark_${primitive.id}` , {id: primitive.id, action: action, targetId: target.id, mode: "mark_categories", field: field})
        }
    }
    instance.categorize = (primitive, target, action, req)=>{
        if( primitive.type === "category"){
            const field = `processing.ai.categorize`
            if(primitive.processing?.ai?.categorize && (new Date() - new Date(primitive.processing.ai.categorize.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Looking for categories"})
            dispatchControlUpdate(target.id, field , {status: "pending"})
            instance.add(`mark_${primitive.id}` , {id: primitive.id, action: action, targetId: target.id, mode: "categorize", field: field})
        }
        return true
    }
    
    new Worker('aiQueue', async job => {

        console.log('AI QUEUE GOT JOB')
        const primitive = await Primitive.findOne({_id: job.data.id})
        if( primitive){
            if( job.data.mode === "mark_categories" || job.data.mode === "categorize" ){
                try{
                    
                    const source = await Primitive.findOne({_id: job.data.targetId})
                    const [list, data] = await getDataForProcessing(primitive, job.data.action, source)

                    console.log(`got ${list.length} / ${data.length} from ${source.id} - ${source.title}`)
                    if( list !== undefined && data.length > 0){
                        if( job.data.mode === "categorize" ){
                            try{
                                const action = job.data.action

                                const catData = await buildCategories( data, {count: primitive.referenceParameters?.count || action.count || 15, types: primitive.referenceParameters?.dataTypes || action.dataTypes, themes: primitive.referenceParameters?.theme || action.theme} )
                                if( catData.success && catData.categories){
                                    console.log(catData.categories)
                                    for( const title of catData.categories){
                                        await createPrimitive({
                                            workspaceId: primitive.workspaceId,
                                            parent: primitive.id,
                                            paths: ['origin'],
                                            data:{
                                                type: "category",
                                                referenceId: primitive.referenceParameters?.resultCategory || action.resultCategory,
                                                title: title
                                            }
                                            
                                        })
                                    }
                                    console.log("Done")
                                }
                            }catch(error){
                                console.log(`Error in aiQueue.categorize `)
                                console.log(error)
                            }
                        }

                        if( job.data.mode === "mark_categories" ){
                            try{

                                const catOptions = await primitiveChildren( primitive, "category")
                                const categoryList = catOptions.map((d)=>d.title)
                                const categoryIds = catOptions.map((d)=>d._id.toString())
                                
                                for( const item of list ){
                                    if( item.parentPrimitives ){
                                        const parents = Object.keys(item.parentPrimitives ).filter((d)=>categoryIds.includes(d) )
                                        if( parents.length > 0){
                                            for( const parent of parents){
                                                for( const path of item.parentPrimitives[parent]){
                                                    await removeRelationship( parent, item._id.toString(), path )
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                const categoryAlloc = await categorize(data, categoryList)
                                //console.log(categoryAlloc)
                                
                                if( Object.hasOwn(categoryAlloc, "success")){
                                    console.log("Error on mark_categories")
                                    console.log(categoryAlloc)
                                }else{
                                    for(const item of categoryAlloc){
                                        let cat
                                        if( typeof(item.category === "number")){
                                            cat = catOptions[ item.category ]
                                        }else{
                                            const newId = categoryList.findIndex((d)=>d.title === item.category)
                                          //  console.log(`   => ${item.category} > ${newId}`)
                                            cat = catOptions[ newId ]
                                        }
                                        if( cat ){
                                         //   console.log(`${item.id} -> ${list[item.id].plainId} : ${cat.title}`)
                                            await addRelationship( cat._id.toString(), list[item.id]._id.toString(), "ref")
                                        }else{
                                            console.log(`Couldnt find category '${item.category}' for ${item.id})`)
                                        }
                                    }
                                }
                            }catch(error){
                                console.log(`Error in aiQueue.mark_categories `)
                                console.log(error)
                            }
                        }
                    }
                }catch(error){
                    console.log(`Error in aiQueue`)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
                dispatchControlUpdate(job.data.targetId, job.data.field , null)
            }
        }
        
    },
    {connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
    return instance
    
}
