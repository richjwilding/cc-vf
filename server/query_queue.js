import QueueManager from './base_queue'; 
import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import Primitive from "./model/Primitive";
import { addRelationship, cosineSimilarity, createPrimitive, dispatchControlUpdate, primitiveOrigin, primitiveParentPath, primitiveRelationship, primitiveTask } from "./SharedFunctions";
import { queryPosts } from "./linkedin_helper";
import { queryCrunchbaseOrganizationArticles, queryCrunchbaseOrganizations } from "./crunchbase_helper";
import Category from "./model/Category";
import { fetchArticlesFromGdelt } from "./gdelt_helper";
import { analyzeTextAgainstTopics, buildEmbeddings } from "./openai_helper";
import { queryFacebookGroup, queryGoogleNews, queryYoutube } from "./google_helper";
import { buildDocumentTextEmbeddings } from './DocumentSearch';


let instance
let _queue

/*
async function main() {

    // Example workspace and job identifiers
    const workspaceId = 'workspace1';
    const jobId = 'job1';

    // Example job data
    const jobData = { task: 'process data', payload: 'some payload data' };

    // Add a job to the queue
    try {
        await queueManager.addJob(workspaceId, jobId, jobData);
        console.log('Job added successfully');
    } catch (error) {
        console.error('Error adding job:', error);
    }

    // Periodically check the status of the queues
    setInterval(async () => {
        const status = await queueManager.status();
        console.log('Queue Status:', status);
    }, 10000); // Check status every 10 seconds

    // Remove a job from the queue (can be triggered based on your application logic)
    try {
        await queueManager.removeJob(workspaceId, jobId);
        console.log('Job removed successfully');
    } catch (error) {
        console.error('Error removing job:', error);
    }
}
*/


export default function QueryQueue(){    
    if( instance ){
        return instance
    }
    

    
    const processQueue = async (job, cancelCheck) => {
        try{

            const primitive = await Primitive.findOne({_id: job.data.id})
            if( primitive){
                if( job.data.mode === "query" ){
                    let embeddedTopic
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
                        if(config[k] === undefined && k !== "title"){
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

                                if( !item[source.primaryField] ){
                                    return false
                                }
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
                                    }],/*{

                                        $or: [
                                            {[`parentPrimitives.${primitive.id}`]: {$in: ['primitives.origin']}},
                                            {[`parentPrimitives.${oId}`]: {$in: [resultPath]}},
                                        ]
                                    }],*/
                                    deleted: {$exists: false},
                                }
                                
                                let existing = await Primitive.find(query, {_id: 1, parentPrimitives: 1})
                                console.log(`Resource check = ${existing.length}`)
                                existing = existing.filter(d=>{
                                    if( !d.parentPrimitives){
                                        debugger
                                    }
                                    return d.parentPrimitives?.[primitive.id]?.includes('primitives.origin') || d.parentPrimitives?.[oId]?.includes(resultPath)
                                })
                                console.log(`Post filter = ${existing.length}`)

                                const results = existing.length > 0
                                if( results ){
                                    console.log( `--- Existing = ${results.length}`)
                                    debugger

                                }
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
                                if( !config.exact){
                                    console.log('skipping keyword check')
                                    return true
                                }
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
                            if( type === "topic_similarity" ){
                                if( !data.text || data.text.length === 0){
                                    return false
                                }
                                if( !topic ){
                                    return false
                                }
                                if(!embeddedTopic){
                                    embeddedTopic = (await buildEmbeddings( topic ))?.embeddings
                                }
                                const embeddedFragments = await buildDocumentTextEmbeddings( data.text )
                                if( embeddedFragments ){
                                    const scores  = embeddedFragments.map(d=>cosineSimilarity( d.embeddings, embeddedTopic ))
                                    const threshold = config.threshold ?? 0.7
                                    const match = scores.filter(d=>d>=threshold).length > 0
                                    data.embeddedFragments = embeddedFragments
                                    return match
                                }
                                return false
                            }
                            if( type === "topic" ){
                                if( topic ){
                                    const result = await analyzeTextAgainstTopics(data.text, topic, {single:true, type: resultCategory?.title, engine: primitive.referenceParameters?.engine ?? "gpt4p"})
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

                        const createResult = async (d, skipActions)=>{
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
                            const newPrim = await createPrimitive( newData, skipActions )
                            if( newPrim ){
                                await addRelationship( oId, newPrim.id, resultPath )
                            }
                            return newPrim
                        }

                        const callopts = {quoteKeywords: config.phrase, count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix, cancelCheck: cancelCheck}

                        if( source.platform === "linkedin" ){
                            if( source.type === "posts" ){
                                await queryPosts( terms,  callopts) 
                            }
                        }
                        if( source.platform === "gdelt" ){
                            await fetchArticlesFromGdelt( terms, callopts) 
                        }
                        if( source.platform === "facebook_group" ){
                            await queryFacebookGroup( terms, callopts) 
                        }
                        if( source.platform === "youtube" ){
                            await queryYoutube( terms, callopts) 
                        }
                        if( source.platform === "google_news" ){
                            await queryGoogleNews( terms, callopts) 
                        }
                        if( source.platform === "google" ){
                            await queryGoogleSERP( terms, callopts) 
                        }
                        if( source.platform === "crunchbase" ){
                            if( source.type === "organization" ){

                                const allTerms = {
                                    keyword: terms,
                                    searchTerms:{
                                        ...config,
                                        count: undefined,
                                        phrase: undefined,
                                        exact : undefined                                   
                                    }
                                }
                                await queryCrunchbaseOrganizations( allTerms, callopts ) 
                            }
                            if( source.type === "article" ){
                                callopts.primitive = await Primitive.findOne({_id: oId})
                                await queryCrunchbaseOrganizationArticles( terms, callopts ) 
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

    instance = {} 
    instance.doQuery = (primitive, options )=>{
        const primitiveId = primitive.id
        const workspaceId = primitive.workspaceId
        const field = "processing.ai.query"
        const data = {mode: "query", text:"Running query", ...options}

        _queue.addJob(workspaceId, {id: primitiveId, ...data, field})
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
    
    _queue = new QueueManager("query", processQueue, 2 );
    
    instance.myInit = async ()=>{
        console.log("Query Queue")
        const jobCount = await _queue.status();
        console.log( jobCount, " jobs in queue (query)")
    }
    
    return instance
}
