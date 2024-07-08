import QueueManager from './base_queue'; 
import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import Primitive from "./model/Primitive";
import { addRelationship, cosineSimilarity, createPrimitive, dispatchControlUpdate, findResultSetForCategoryId, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentPath, primitiveParentsOfType, primitiveRelationship, primitiveTask } from "./SharedFunctions";
import { findCompanyLIPage, queryPosts, searchLinkedInJobs } from "./linkedin_helper";
import { queryCrunchbaseOrganizationArticles, queryCrunchbaseOrganizations } from "./crunchbase_helper";
import Category from "./model/Category";
import { fetchArticlesFromGdelt } from "./gdelt_helper";
import { analyzeTextAgainstTopics, buildEmbeddings } from "./openai_helper";
import { queryFacebookGroup, queryGoogleNews, queryGoogleSERP, queryGoogleScholar, queryYoutube } from "./google_helper";
import { buildDocumentTextEmbeddings } from './DocumentSearch';
import { queryMetaAds } from './ad_helper';


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
                    //const oId = primitiveOrigin( primitive )


                    const [oId, candidatePaths] = Object.keys(primitive.parentPrimitives ?? {})?.map(d=>primitive.parentPrimitives[d].map(d2=>[d,d2])).flat()?.find(d=>d[1].indexOf("primitives.search.") === 0)
                    console.log(`Using ${oId} for origin`)
                    if( candidatePaths.length === 0){
                        throw "Cant find result path"
                    }
                    if( candidatePaths.length > 1){
                        console.log(`INFO: Too many candidate paths - picking first`)
                    }
                    const resultPath = candidatePaths.replace(".search.",".results.")

                    const parentSearch = (await primitiveParentsOfType( primitive, "search"))?.[0]

                    const config = primitive.referenceParameters || {}
                    Object.keys(category.parameters).forEach((k)=>{
                        if(config[k] === undefined && k !== "title"){
                            config[k] = category.parameters[k].default
                        }
                        if( parentSearch ){
                            if( parentSearch.referenceParameters?.[k] !== undefined){
                                config[k] = parentSearch.referenceParameters?.[k]      
                            }
                        }
                        if( config[k] && category.parameters[k].type === "options"){
                            config[k] = config[k].map(d=>category.parameters[k].options.find(d2=>d2.id === d))
                        }
                    })
                    console.log(config)

                    const nestCandidates = category.nestedSearch
                    if( nestCandidates && ! parentSearch ){
                        const nestedReferenceCategoryId = nestCandidates.referenceCategoryId
                        origin = origin ?? await Primitive.findOne({_id: oId})
                        if( origin.referenceId !== nestedReferenceCategoryId ){
                            const task = await Primitive.findOne({_id: await primitiveTask( primitive ) })
                            const nestedSearches = await primitiveChildren( primitive, "search")

                            const nestedCategory = await Category.findOne({id: nestedReferenceCategoryId})
                            const nestedSet = nestedCategory.resultCategories.find((d)=>d.searchCategoryIds?.includes(primitive.referenceId))
                            console.log(`Found ${nestedSet?.id} for ${primitive.referenceId} in ${nestedCategory.title}`)

                            if( nestedSet && task ){
                                const items = await primitiveDescendents(task, undefined, {referenceId: nestedReferenceCategoryId})
                                console.log(`Got ${items.length} items and ${nestedSearches.length} nested searches of ${nestedReferenceCategoryId}`)
                                for(const target of items){
                                    let nestedSearchForItem = nestedSearches.find(d=>Object.keys(d.parentPrimitives ?? {}).includes(target.id) )
                                    if( !nestedSearchForItem ) {
                                        console.log(`Need to created nested search for ${target.id} / ${target.plainId}`)
                                        nestedSearchForItem = await createPrimitive({
                                                                                workspaceId: primitive.workspaceId,
                                                                                paths: ['origin'],
                                                                                parent: primitive.id,
                                                                                data:{
                                                                                    type: "search",
                                                                                    referenceId: primitive.referenceId
                                                                                }})
                                        if(nestedSearchForItem){
                                            await addRelationship(target.id, nestedSearchForItem.id, `primitives.search.${nestedSet.id}`)
                                            await addRelationship(target.id, nestedSearchForItem.id, `link`)
                                        }
                                    }else{
                                        console.log(`Found existing nested search for ${target.id} / ${target.plainId} = ${nestedSearchForItem.id}`)
                                    }
                                    if( nestedSearchForItem ){
                                        console.log(`Initiating query - ${nestedSearchForItem.id}`)
                                        await QueryQueue().doQuery(nestedSearchForItem, {})
                                    }
                                }
                            }
                            return
                        }
                    }
                    
                    
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
                                    return d.parentPrimitives?.[primitive.id]?.includes('primitives.origin') || d.parentPrimitives?.[oId]?.includes(resultPath)
                                })
                                console.log(`Post filter = ${existing.length}`)

                                const results = existing.length > 0
                                if( results ){
                                    console.log( `--- Existing = ${results.length}`)
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
                                const {truncated, results: embeddedFragments} = await buildDocumentTextEmbeddings( data.text, 300 )
                                if( embeddedFragments ){
                                    const scores  = embeddedFragments.map(d=>cosineSimilarity( d.embeddings, embeddedTopic ))
                                    const threshold = config.threshold ?? 0.75
                                    const match = scores.filter(d=>d>=threshold).length > 0
                                    if( match ){
                                        if( truncated ){
                                            console.log(`Was truncated - will need to refetch`)
                                            data.embeddedFragments = await buildDocumentTextEmbeddings( data.text )
                                        }else{
                                            data.embeddedFragments = embeddedFragments
                                        }
                                    }
                                    return match
                                }
                                return false
                            }
                            if( type === "topic" ){
                                if( topic ){
                                    const threshold = filter.threshold ?? 3
                                    const result = await analyzeTextAgainstTopics(data.text, topic, {maxTokens: 2000, maxTokensToSend: 10000, stopChunk: 300, stopAtOrAbove: threshold,single:true, type: resultCategory?.title, engine: primitive.referenceParameters?.engine})
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

                        const callopts = {site: config.site ,quoteKeywords: config.phrase, timeFrame: config.timeFrame, count: config.count ?? 50, existingCheck, filterPre: mapFilter(source.filterPre), filterMid: mapFilter(source.filterMid), filterPost: mapFilter(source.filterPost), createResult: createResult, prefix: prefix, cancelCheck: cancelCheck}

                        if( source.platform === "linkedin" ){
                            if( source.type === "posts" ){
                                await queryPosts( terms,  callopts) 
                            }
                            if( source.type === "jobs" ){
                                await searchLinkedInJobs( terms,  callopts) 
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
                        if( source.platform === "google_scholar" ){
                            await queryGoogleScholar( terms, callopts) 
                        }
                        if( source.platform === "google" ){
                            await queryGoogleSERP( terms, callopts) 
                        }
                        if( source.platform === "meta_ads" ){
                            callopts.ignoreIds = primitive.checkCache?.items
                            await queryMetaAds( terms, callopts) 
                        }
                        if( source.platform === "linkedin_ddg" ){
                            origin = origin ?? await Primitive.findOne({_id: oId})
                            //const company = origin.referenceParameters?.linkedIn?.match(/linkedin\.com\/company\/(.+)\//i)?.[1]
                            let company = origin.referenceParameters?.linkedIn?.match(/linkedin\.com\/company\/([^\/]+)(?=\/|$)/i)?.[1]
                            if( !company ){
                                console.log(`Looking up company`)
                                let url = await findCompanyLIPage( origin )
                                company = url.match(/linkedin\.com\/company\/([^\/]+)(?=\/|$)/i)?.[1]
                                console.log(`Got ${company}`)
                            }
                            console.log(`company = `, company)
                            if( company ){
                                const query = `site:linkedin.com/posts ${company}`
                                const url = `linkedin.com/posts/${company}`
                                await queryGoogleSERP( "", {...callopts, prefix: query,engine: "ddg", urlFilter: url}) 
                            }
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
