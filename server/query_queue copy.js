import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import Primitive from "./model/Primitive";
import { addRelationship, createPrimitive, dispatchControlUpdate, primitiveOrigin, primitiveParentPath, primitiveRelationship, primitiveTask } from "./SharedFunctions";
import { queryPosts } from "./linkedin_helper";
import { queryCrunchbaseOrganizationArticles, queryCrunchbaseOrganizations } from "./crunchbase_helper";
import Category from "./model/Category";
import { fetchArticlesFromGdelt } from "./gdelt_helper";
import { analyzeTextAgainstTopics } from "./openai_helper";
import { queryFacebookGroup, queryGoogleNews, queryYoutube } from "./google_helper";


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
       /* 
        await instance.obliterate({ force: true });
        const newJobCount = await instance.count();
        console.log( newJobCount + " jobs in queue  (query)")
        */
    }

    instance.doQuery = (primitive, options )=>{
        queueJob( primitive.id, "processing.ai.query", {mode: "query", text:"Running query", ...options})
    }
    instance.pending = async ()=>{
        return await instance.getJobs();
    }
    
    const processQueue = async job => {
        try{

            const primitive = await Primitive.findOne({_id: job.data.id})
            if( primitive){
                if( job.data.mode === "query" ){
                    console.log(`GOT QUERY JOB`)
                    const category = await Category.findOne({id: primitive.referenceId})
                    if( category === undefined){
                        throw `Cant find category ${primitive.referenceId} for ${primitive.id}`
                    }

                    let baseTerms = primitive.title

                    let origin
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
                    let cache = primitive.checkCache 
                    let resetCache = false
                    if( cache ){
                        if( !(cache.topic === topic && cache.keywords === baseTerms) ){
                            resetCache = true
                            console.log(`RESETTING CACHE`)
                        }else{
                            console.log(`CACHE KEPT`)
                        }
                    }else{
                        resetCache = true
                    }
                    if( resetCache){
                        cache = {topic: topic, keywords: baseTerms, items: []}
                        await Primitive.updateOne(
                            {
                                "_id": primitive.id,
                            },
                            {
                                ["checkCache"]: cache
                            })
                    }

                    for( const source of config.sources ){
                        const resultCategory = await Category.findOne({id: source.resultCategoryId})
                        
                        let prefix = source.prefix
                        let terms = (baseTerms ?? "").trim()
                        if( prefix ){
                            if(prefix.indexOf('{ot}') > -1){
                                origin = origin ?? await Primitive.findOne({_id: oId})
                                if( origin ){
                                    prefix = prefix.replace(/{ot}/g, origin.title)
                                    console.log("DO PREFIX ", prefix)
                                }
                            }
                        }
                        console.log(`Query source ${source.id} ${source.platform} ${source.type} - ${terms}`)

                        const existingCheck = source.primaryField ? async (item)=>{
                            if( item ){

                                // checkCache
                                if( cache.items.length > 0){
                                    if(cache.items.includes(item[source.primaryField])){
                                        console.log(` --- already scanned this resource`)
                                        return true
                                    }
                                }
                                cache.items.push( item[source.primaryField] )
                                await Primitive.updateOne(
                                    {
                                        "_id": primitive.id,
                                    },
                                    {
                                        $push :{["checkCache.items"]: item[source.primaryField]}
                                    })


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
                                
                                const existing = await Primitive.findOne(query, {_id: 1})
                                const results = existing !== null
                                //console.log( `--- Existing = ${results}`)
                                return results
                            }
                            return false
                        } : undefined

                        const mapFilter = (filter) => filter ? async (data)=>{
                            const type = filter.type ?? filter
                            if( type === "snippet" ){
                                console.log(`CHECKING FOR SNIPPET`)
                                const xSnippet = data.snippet?.toLowerCase().trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/^\.*|\.*$/g, '').replaceAll(/\n|\r/g," ").replaceAll(/\s+/g, ' ')
                                const xText = data.text?.toLowerCase().trim().replace(/[^a-zA-Z0-9\s]/g, '').replaceAll(/\n|\r/g," ").replaceAll(/\s+/g, ' ')
                                if( xText.indexOf(xSnippet ) === -1 ){
                                    console.log(`CANT FIND SNIPPET`)
                                    return false
                                }
                                    console.log(`FOUND SNIPPET`)
                                return true
                            }
                            if( type === "keyword" ){
                                const xTerm = data.term?.toLowerCase().trim().replace(/[^a-zA-Z0-9\s]/g, '');
                                if( xTerm === undefined || xTerm.length === 0){
                                    return true
                                }
                                const xSnippet = data.text?.toLowerCase().trim().replace(/[^a-zA-Z0-9\s]/g, '');

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
                                    const result = await analyzeTextAgainstTopics(data.text, topic, {single:true, debug: true, type: resultCategory?.title, engine: primitive.referenceParameters?.engine ?? "gpt4p"})
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
                                await queryPosts( terms, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix} ) 
                            }
                        }
                        if( source.platform === "gdelt" ){
                            await fetchArticlesFromGdelt( terms, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix} ) 
                        }
                        if( source.platform === "facebook_group" ){
                            await queryFacebookGroup( terms, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix} ) 
                        }
                        if( source.platform === "youtube" ){
                            await queryYoutube( terms, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix} ) 
                        }
                        if( source.platform === "google_news" ){
                            await queryGoogleNews( terms, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix} ) 
                        }
                        if( source.platform === "crunchbase" ){
                            if( source.type === "organization" ){
                                await queryCrunchbaseOrganizations( terms, {count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix} ) 
                            }
                            if( source.type === "article" ){
                                await queryCrunchbaseOrganizationArticles( terms, {primitive: await Primitive.findOne({_id: oId}), count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix} ) 
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
        
    }
    
    new Worker('queryQueue', processQueue ,{connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
    new Worker('queryQueue', processQueue ,{connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
    return instance
}
