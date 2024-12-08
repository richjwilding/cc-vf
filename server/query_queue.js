import QueueManager from './queue_manager'; 
import Primitive from "./model/Primitive";
import { addRelationship, cosineSimilarity, createPrimitive, dispatchControlUpdate, fetchPrimitive, findResultSetForCategoryId, getDataForProcessing, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentPath, primitiveParentsOfType, primitiveRelationship, primitiveTask } from "./SharedFunctions";
import { findCompanyLIPage, queryPosts, searchLinkedInJobs } from "./linkedin_helper";
import { queryCrunchbaseOrganizationArticles, queryCrunchbaseOrganizations } from "./crunchbase_helper";
import Category from "./model/Category";
import { fetchArticlesFromGdelt } from "./gdelt_helper";
import { analyzeTextAgainstTopics, buildEmbeddings } from "./openai_helper";
import { queryFacebookGroup, queryGoogleNews, queryGoogleSERP, queryGoogleScholar, queryYoutube } from "./google_helper";
import { buildDocumentTextEmbeddings } from './DocumentSearch';
import { queryMetaAds } from './ad_helper';
import { queryGlassdoorReviewWithBrightData, queryInstagramWithBrightData, queryLinkedInCompanyPostsBrightData, queryRedditWithBrightData, queryTiktokWithBrightData } from './brightdata';
import { queryInstagramPostsByRapidAPI } from './rapid_helper';


let instance
let _queue
export async function processQueue(job, cancelCheck){
        try{

            const primitive = await Primitive.findOne({_id: job.data.id})
            if( primitive){
                if( job.data.mode === "query" ){
                    let embeddedTopic
                    console.log(`GOT QUERY JOB ${primitive.id} / ${primitive.plainId}`)
                    const category = await Category.findOne({id: primitive.referenceId})
                    if( category === undefined){
                        throw `Cant find category ${primitive.referenceId} for ${primitive.id}`
                    }

                    const asTitle = !primitive.referenceParameters?.useTerms && !primitive?.referenceParameters.hasOwnProperty("terms") && primitive.title
                    let baseTerms = asTitle ? primitive.title : primitive.referenceParameters?.terms

                    let origin
                    
//                    const oId = primitiveOrigin( primitive )

                    const [oId, candidatePaths] = Object.keys(primitive.parentPrimitives ?? {})?.map(d=>primitive.parentPrimitives[d].map(d2=>[d,d2])).flat()?.find(d=>d[1].indexOf("primitives.search.") === 0) ?? []
                    console.log(`Using ${oId} for origin`)
                    const addToOrigin = candidatePaths?.length > 0
                    const resultPath = addToOrigin ? candidatePaths.replace(".search.",".results.") : undefined

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
                    if( parentSearch ){
                        const asTitle = !parentSearch.referenceParameters?.useTerms && !parentSearch?.referenceParameters.hasOwnProperty("terms") && parentSearch.title
                        baseTerms = asTitle ? parentSearch.title : parentSearch.referenceParameters?.terms
                        //baseTerms = parentSearch.title
                        console.log(`OVERRIDE WITH PARENT SEARCH TERMS`)
                    }
                    console.log(config)

                    const nestCandidates = category.nestedSearch
                    if( nestCandidates && ! parentSearch ){
                        const nestedReferenceCategoryId = nestCandidates.referenceCategoryId
                        origin = origin ?? await Primitive.findOne({_id: oId})
                        if( origin.referenceId !== nestedReferenceCategoryId ){
                            let parentForNestedSearch = ["view","segment","query"].includes(origin.type) ? origin : (await Primitive.findOne({_id: await primitiveTask( primitive ) }))

                            const nestedSearches = await primitiveChildren( primitive, "search")
                            const nestedCategory = await Category.findOne({id: nestedReferenceCategoryId})
                            const nestedSet = nestedCategory.resultCategories.find((d)=>d.searchCategoryIds?.includes(primitive.referenceId))
                            console.log(`Found ${nestedSet?.id} for ${primitive.referenceId} in ${nestedCategory.title}`)

                            if( nestedSet && parentForNestedSearch ){
                                const [items, _] = await getDataForProcessing(parentForNestedSearch, {referenceId: nestedReferenceCategoryId})

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
                    let topic = primitive.referenceParameters?.topic?.trim()
                    if( parentSearch ){
                        topic = parentSearch.referenceParameters?.topic?.trim()
                    }
                    if( !topic  ){
                        const realOrigin = await fetchPrimitive(primitiveOrigin( parentSearch ?? primitive ) )
                        if( realOrigin?.type === "board" ){
                            topic = realOrigin.referenceParameters?.topics?.trim()
                        }
                    }
                    if( !topic ){
                        console.log(`Fetching topic from task`)
                        const task = await Primitive.findOne({_id: await primitiveTask( primitive ) })
                        if( task ){
                            topic = task.referenceParameters?.topics?.trim()
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
                                queryCount: 0,
                                checkCache: cache
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
                                let inCache = false
                                
                                if( cache.items.length > 0){
                                    if(cache.items.includes(item[source.primaryField])){
                                        console.log(` --- already scanned this resource`)
                                        inCache = true
                                    }
                                }

                                cache.items.push( item[source.primaryField] )
                                if( !inCache ){
                                    await Primitive.updateOne(
                                        {
                                            "_id": primitive.id,
                                        },
                                        {
                                            $inc: { queryCount: 1 },
                                            $push :{["checkCache.items"]: item[source.primaryField]}
                                        })
                                }
                                        
                                    
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
                                    "referenceId": source.resultCategoryId,
                                    $and:[{
                                        ...checks,
                                    }],
                                    deleted: {$exists: false},
                                }
                                
                                let existing = await Primitive.find(query, {_id: 1, plainId: 1, parentPrimitives: 1})
                                
                                if( existing.length > 0 ){
                                    console.log( `--- Existing = ${existing.length}`)
                                    for(const d of existing){
                                        if( Object.keys(d.parentPrimitives).includes(primitive.id)){
                                            console.log(`Already linked to this search primitive`)
                                        }else{
                                            console.log(` - Add alt_origin to ${d.id} / ${d.plainId}`)
                                            await addRelationship( primitive.id, d.id, "auto")
                                            await addRelationship( primitive.id, d.id, "alt_origin")
                                        }
                                    }
                                }
                                return inCache || (existing.length > 0)
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
                                    return true
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
                                    const result = await analyzeTextAgainstTopics(data.text, topic, {
                                        maxTokens: 2000, 
                                        maxTokensToSend: 10000, 
                                        stopChunk: 300, 
                                        stopAtOrAbove: threshold,
                                        single:true, 
                                        type: resultCategory?.title, 
                                        engine: "gpt4o-mini" ?? primitive.referenceParameters?.engine})
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
                            
                            if( newPrim && addToOrigin){
                                await addRelationship( oId, newPrim.id, resultPath )
                            }
                            return newPrim
                        }

                        const callopts = {
                            site: config.site,
                            quoteKeywords: config.phrase, 
                            countPerTerm: config.countPerTerm, 
                            timeFrame: config.timeFrame, 
                            count: config.count ?? 50, 
                            existingCheck, 
                            filterPre: mapFilter(source.filterPre), 
                            filterMid: mapFilter(source.filterMid), 
                            filterPost: mapFilter(source.filterPost), 
                            createResult: createResult, 
                            prefix: prefix, 
                            cancelCheck: cancelCheck
                        }

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
                        if( source.platform === "tiktok" ){
                            await queryTiktokWithBrightData( primitive, terms, callopts) 
                        }
                        if( source.platform === "reddit" ){
                            await queryRedditWithBrightData( primitive, terms, callopts) 
                        }
                        if( source.platform === "glassdoor" ){
                            //await queryInstagramWithBrightData( primitive, terms, callopts) 
                            await queryGlassdoorReviewWithBrightData( primitive, terms, callopts)
                        }
                        if( source.platform === "instagram" ){
                            //await queryInstagramWithBrightData( primitive, terms, callopts) 
                            await queryInstagramPostsByRapidAPI( primitive, terms, callopts)
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
                        if( source.platform === "linkedin_company" ){
                            if( oId ){
                                origin = origin ?? await Primitive.findOne({_id: oId})

                                let targetProfile = origin.referenceParameters.linkedIn
                                if( !targetProfile ){
                                    targetProfile = await findCompanyLIPage( origin )
                                    if( targetProfile ){
                                        await dispatchControlUpdate( origin.id, "referenceParameters.linkedIn", targetProfile)
                                    }
                                }
                                console.log(targetProfile)
                                if( targetProfile ){
                                    await queryLinkedInCompanyPostsBrightData( primitive, targetProfile, terms, callopts)
                                }
                            }
                        }
                        /*if( source.platform === "linkedin_ddg" ){
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
                        }*/
                        if( source.platform === "crunchbase" ){
                            if( source.type === "organization" ){

                                const allTerms = {
                                    keyword: terms,
                                    searchTerms:{
                                        ...config,
                                        count: undefined,
                                        phrase: callopts.quoteKeywords,
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
                    console.log(`Finished ${primitive.id} / ${primitive.plainId}`)
                }
            }
        }catch(error){
            console.log(`Error in queryQueue`)
            console.log(error)
        }
        
    }

export default function QueryQueue(){    
    if( instance ){
        return instance
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
    
    _queue = new QueueManager("query", /*processQueue*/ undefined, 1);
    
    instance.myInit = async ()=>{
        console.log("Query Queue v2")
    }
    instance.getJob = async function (...args) {
        return await _queue.getJob.apply(_queue, args);
    };
    
    instance.addJob = async function (...args) {
        return await _queue.addJob.apply(_queue, args);
    };
    instance.addJobResponse = async function (...args) {
        return await _queue.addJobResponse.apply(_queue, args);
    };
    instance.getChildWaiting = async function (...args) {
        return await _queue.getChildWaiting.apply(_queue, args);
    };
    instance.resetChildWaiting = async function (...args) {
        return await _queue.resetChildWaiting.apply(_queue, args);
    };

    
    return instance
}
