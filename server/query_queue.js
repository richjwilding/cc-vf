import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import Primitive from "./model/Primitive";
import { addRelationship, createPrimitive, dispatchControlUpdate, primitiveOrigin, primitiveParentPath, primitiveRelationship, primitiveTask } from "./SharedFunctions";
import { enrichCompanyFromLinkedIn, queryPosts, searchPosts } from "./linkedin_helper";
import { findOrganizationsFromCB, pivotFromCrunchbase, queryCrunchbaseOrganizations } from "./crunchbase_helper";
import Category from "./model/Category";
import { fetchArticlesFromGNews, fetchArticlesFromGdelt } from "./gdelt_helper";
import { fetchPostsFromSocialSeracher } from "./socialsearcher_helper";
import Parser from "@postlight/parser";
import { analyzeTextAgainstTopics } from "./openai_helper";


let instance

function queueJob( id, field, data ){
    if( data.mode === undefined ){
        console.log(`No mode on QueryQueue - queueJob`)
        return
    }
    dispatchControlUpdate(id, field , {status: "pending"}, {...data, track: id})
    instance.add(`query_${data.mode}_${id}` , {id: id, ...data, field})
}

export default function QueryQueue(){    
    if( instance ){
        return instance
    }
    
    instance = new Queue("queryQueue", {
        connection: { 
            host: process.env.QUEUES_REDIS_HOST, 
            port: process.env.QUEUES_REDIS_PORT,
            maxStalledCount: 0,
            stalledInterval:300000
        },
    });
    instance.myInit = async ()=>{
        console.log("Query Queue")
        const jobCount = await instance.count();
        console.log( jobCount + " jobs in queue (query)")
        await instance.obliterate({ force: true });
        const newJobCount = await instance.count();
        console.log( newJobCount + " jobs in queue  (query)")
    }

    instance.doQuery = (primitive, options )=>{
        queueJob( primitive.id, "processing.ai.query", {mode: "query", text:"Running query", ...options})
    }
    
    
    new Worker('queryQueue', async job => {
        try{

            const primitive = await Primitive.findOne({_id: job.data.id})
            if( primitive){
                if( job.data.mode === "query" ){
                    console.log(`GOT QUERY JOB`)
                    const category = await Category.findOne({id: primitive.referenceId})
                    if( category === undefined){
                        throw `Cant find category ${primitive.referenceId} for ${primitive.id}`
                    }

                    const oId = primitiveOrigin( primitive )
                    const candidatePaths = primitive.parentPrimitives[oId]?.filter(d=>d.indexOf("primitives.search.") === 0)
                    if( candidatePaths.length === 0){
                        throw "Cant find result path"
                    }
                    if( candidatePaths.length > 1){
                        console.log(`INFO: Too many candidate paths - picking first`)
                    }
                    const resultPath = candidatePaths[0].replace(".search.",".results.")
                    
                    const config = primitive.referenceParameters || {}
                    Object.keys(category.parameters).forEach((k)=>{
                        if(config[k] === undefined ){
                            config[k] = category.parameters[k].default
                        }
                        if( config[k] && category.parameters[k].type === "options"){
                            config[k] = config[k].map(d=>category.parameters[k].options.find(d2=>d2.id === d))
                        }
                    })
                    console.log(config)
                    
                    
                    // Get query results
                    let topic = primitive.referenceParameters?.topic
                    if( topic === undefined ){
                        console.log(`Fetching topic from task`)
                        const task = await Primitive.findOne({_id: await primitiveTask( primitive ) })
                        if( task ){
                            topic = task.referenceParameters?.topics
                        }
                    }

                    for( const source of config.sources ){
                        console.log(`Query source ${source.id} ${source.platform} ${source.type}`)
                        const resultCategory = await Category.findOne({id: source.resultCategoryId})

                        
                        const existingCheck = source.primaryField ? async (item)=>{
                            if( item ){
                                let checks = {[source.importField ?? source.primaryField]:  item[source.primaryField]}
                                if( source.additionalDuplicateCheck ){
                                    checks = {$or: [
                                            checks,
                                            source.additionalDuplicateCheck.map(d=>({[d[0]]:item[d[1]]}))
                                        ].flat()
                                    }
                                }
                                const query = {
                                    "workspaceId": primitive.workspaceId,
                                    $and:[{
                                        ...checks,
                                    },{

                                        $or: [
                                            {[`parentPrimitives.${primitive.id}`]: {$in: ['primitives.origin']}},
                                            {[`parentPrimitives.${oId}`]: {$in: [resultPath]}},
                                        ]
                                    }],
                                    deleted: {$exists: false},
                                }
                                
                                const existing = await Primitive.findOne(query)
                                const results = existing !== null
                                //console.log( `--- Existing = ${results}`)
                                return results
                            }
                            return false
                        } : undefined

                        const mapFilter = (filter) => filter ? async (data)=>{
                            const type = filter.type ?? filter
                            if( type === "keyword" ){
                                const xSnippet = data.text?.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '');
                                const xTerm = data.term?.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '');
                                if( !xSnippet || !xTerm){
                                    return false
                                }
                                if( xSnippet.indexOf(xTerm) === -1 ){
                                    return false
                                }
                                return true
                            }
                            if( type === "topic" ){
                                if( topic ){
                                    const result = await analyzeTextAgainstTopics(data.text, topic, {type: resultCategory?.title, engine: primitive.referenceParameters?.engine ?? "gpt4p"})
                                    const threshold = filter.threshold ?? 3
                                    if( result.output >= threshold){
                                        return true
                                    }
                                    return false
                                }
                                return true
                            }

                            return false
                        } : undefined

                        const createResult = async (d)=>{
                            const newData = {
                                workspaceId: primitive.workspaceId,
                                paths: ['origin', 'auto'],
                                parent: primitive.id,
                                data:{
                                    type: "result",
                                    ...d,
                                    referenceId: source.resultCategoryId ,
                                }
                            }
                            const newPrim = await createPrimitive( newData )
                            if( newPrim ){
                                await addRelationship( oId, newPrim.id, resultPath )
                            }
                            return newPrim
                        }

                        if( source.platform === "linkedin" ){
                            if( source.type === "posts" ){
                                await queryPosts( primitive.title, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterPost: mapFilter(source.filterPost), createResult: createResult} ) 
                            }
                        }
                        if( source.platform === "gdelt" ){
                            await fetchArticlesFromGdelt( primitive.title, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterPost: mapFilter(source.filterPost), createResult: createResult} ) 
                        }
                        if( source.platform === "crunchbase" ){
                            if( source.type === "organization" ){
                                await queryCrunchbaseOrganizations( primitive.title, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterPost: mapFilter(source.filterPost), createResult: createResult} ) 
                            }
                        }
                    }


                    dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
                }
            }
        }catch(error){
            console.log(`Error in queryQueue`)
            console.log(error)
        }
        
    },
    {connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
    return instance
}
