import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import Primitive from "./model/Primitive";
import { dispatchControlUpdate, primitiveOrigin, primitiveParentPath, primitiveRelationship } from "./SharedFunctions";
import { enrichCompanyFromLinkedIn } from "./linkedin_helper";
import { findOrganizationsFromCB, pivotFromCrunchbase } from "./crunchbase_helper";


let instance

export default function EnrichPrimitive(){    
    if( instance ){
        return instance
    }
    
    instance = new Queue("enrichQueue", {
        connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT },
    });

    instance.searchCompanies = (primitive, options )=>{
        console.log("here")
        if( primitive.type === "activity"){
            const field = "processing.search_company"
            dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date()})
            instance.add(`search_topcics_${primitive.id}` , {id: primitive.id, target: "entity", mode: "search_company", options: options})
        }
    }
    instance.enrichCompany = (primitive, source, force)=>{
        if( primitive.type === "entity"){
            dispatchControlUpdate(primitive.id, "processing.enrich", {state: "active", started: new Date(), targetFields: ['title', 'referenceParameters.url', 'referenceParameters.description', 'referenceParameters.industry']})
            instance.add(`enrich_${primitive.id}_from_${source}` , {id: primitive.id, source: source, target: "entity", mode: "enrich", force: force})
        }
    }
    instance.pivotCompany = (primitive, source, req)=>{
        if( primitive.type === "entity"){
            
            const parentId = primitiveOrigin(primitive)
            const resultSet = primitiveParentPath(primitive, "result", parentId, true)?.[0]
            if( resultSet !== undefined){
                const field = `processing.expanding.${resultSet}`
                console.log(parentId)
                console.log(resultSet)
                if( parentId ){
                    dispatchControlUpdate(parentId, field, {status: "pending", node: primitive.id})
                }
                dispatchControlUpdate(primitive.id, "processing.pivot" , {status: "pending"}, {user: req?.user?.id, track: primitive.id, text:"Finding similar companies"})
                instance.add(`pivot_${primitive.id}_from_${source}` , {id: primitive.id, source: source, target: "entity", mode: "pivot", parentId: parentId, field: field})
            }
        }
    }
    
    
    new Worker('enrichQueue', async job => {
        const primitive = await Primitive.findOne({_id: job.data.id})
        if( primitive){
            if( job.data.mode === "search_company" ){
                console.log(`search_company ${primitive.id} ${primitive.referenceParameters?.topics}`)
                if( primitive.referenceParameters?.topics){
                    await findOrganizationsFromCB( primitive, primitive.referenceParameters?.topics, job.data.options )
                }
            }
            if( job.data.mode === "enrich" ){
                console.log(`Processing enrichment for ${primitive.id}`)
                if( job.data.target === "entity" ){
                    if( job.data.source === "linkedin" ){
                        const result = await enrichCompanyFromLinkedIn( primitive, job.data.force)
                        SIO.notifyPrimitiveEvent( primitive, result)
                    }
                }
                dispatchControlUpdate(primitive.id, "processing.enrich", null)
            }
            if( job.data.mode === "pivot" ){
                try{
                    console.log(`Processing pviot for ${primitive.id}`)
                    if( job.data.target === "entity" ){
                        if( job.data.source === "crunchbase" ){
                            const newPrims = await pivotFromCrunchbase(primitive)
                        }
                    }
                }catch(error){
                    console.log(`Error in enrichQueue.pivot `)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, "processing.pivot" , null, {track: primitive.id})
                if( job.data.parentId ){
                    dispatchControlUpdate(job.data.parentId, job.data.field, null)
                }
            }
        }
        
    },
    {connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
    return instance
}
