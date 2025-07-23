import QueueManager from './queue_manager'; 
import Primitive from "./model/Primitive";
import { addRelationship, cosineSimilarity, createPrimitive, decodePath, dispatchControlUpdate, executeConcurrently, fetchPrimitive, findResultSetForCategoryId, getConfig, getDataForProcessing, getPrimitiveInputs, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentPath, primitiveParents, primitiveParentsOfType, primitiveRelationship, primitiveTask } from "./SharedFunctions";
import { findCompanyLIPage, queryPosts, searchLinkedInJobs } from "./linkedin_helper";
import { queryCrunchbaseOrganizationArticles, queryCrunchbaseOrganizations } from "./crunchbase_helper";
import Category from "./model/Category";
import { fetchArticlesFromGdelt } from "./gdelt_helper";
import { analyzeTextAgainstTopics, buildEmbeddings } from "./openai_helper";
import { queryFacebookGroup, queryGoogleNews, queryGoogleSERP, queryGoogleScholar, queryYoutube } from "./google_helper";
import { buildDocumentTextEmbeddings } from './DocumentSearch';
import { queryMetaAds } from './ad_helper';
import { fetchInstagramPostsFromProfile, queryChatGPTViaBD, queryGlassdoorReviewWithBrightData, queryInstagramWithBrightData, queryLinkedInCompanyPostsBrightData, queryLinkedInCompanyProfilePostsBrightData, queryLinkedInUserPostsBrightData, queryPerplexityViaBD, queryRedditWithBrightData, queryReviewsIO, querySubredditWithBrightData, queryTiktokWithBrightData, queryTrustPilotForCompanyReviewsBrightData } from './brightdata';
import { queryInstagramPostsByRapidAPI, queryLinkedInCompaniesByRapidAPI, queryLinkedInCompanyPostsByRapidAPI, queryQuoraByRapidAPI, queryTwitterProfilePostsByRapidAPI } from './rapid_helper';
import { BaseQueue } from './base_queue';
import { cleanURL, getBaseDomain } from './actions/SharedTransforms';
import { findTrustPilotURLFromDetails } from './actions/trustpilot_helper';
import { getLogger } from './logger';
import { queryMoneySavingExpertForums } from './scrapers/moneysavingexpert';

const logger = getLogger('query_queue', "debug"); // Debug level for moduleA

let instance
export async function processQueue(job, cancelCheck, extendJob){
        try{

            const primitive = await Primitive.findOne({_id: job.data.id})
            let errorMessage
            let collectionAsync = false
            if( primitive){
                if( job.data.mode === "query" ){
                    let embeddedTopic
                    const category = await Category.findOne({id: primitive.referenceId})
                    if( category === undefined){
                        throw `Cant find category ${primitive.referenceId} for ${primitive.id}`
                    }

                    const asTitle = !primitive.referenceParameters?.useTerms && !primitive?.referenceParameters.hasOwnProperty("terms") && primitive.title
                    let config = await getConfig( primitive )
                    let baseTerms = asTitle ? primitive.title : config.terms

                    let origin
                    
//                    const oId = primitiveOrigin( primitive )

                    const [oId, candidatePaths] = Object.keys(primitive.parentPrimitives ?? {})?.map(d=>primitive.parentPrimitives[d].map(d2=>[d,d2])).flat()?.find(d=>d[1].indexOf("primitives.search.") === 0) ?? []
                    console.log(`Using ${oId} for origin`)
                    const addToOrigin = candidatePaths?.length > 0
                    const resultPath = addToOrigin ? candidatePaths.replace(".search.",".results.") : undefined

                    const parentSearch = (await primitiveParentsOfType( primitive, "search"))?.[0]

                    //const {topic:topicFromInput, ...inputsForSearch} = await getPrimitiveInputs( primitive )
                    
                   /* if( primitive.referenceParameters ){
                        for(const k of Object.keys(primitive.referenceParameters)){
                            if( primitive.referenceParameters[k] !== undefined){
                                config[k] = primitive.referenceParameters[k]
                            }
                        }
                    }*/
                    let categoryParams = category.parameters
                    const sourceOption = categoryParams.sources
                    let activeConfig = category.parameters.sources.options.find(d=>d.id === config.sources[0])?.config
                    if(  activeConfig ){
                        categoryParams = {
                            sources: sourceOption,
                            ...activeConfig
                        }
                    }

                    
                    for(const k of Object.keys(categoryParams)){
                        /*if(config[k] === undefined && k !== "title"){
                            config[k] = category.parameters[k].default
                        }
                        if( parentSearch ){
                            if( parentSearch.referenceParameters?.[k] !== undefined){
                                config[k] = parentSearch.referenceParameters?.[k]      
                            }
                        }*/
                        if( config[k] && categoryParams[k].type === "options"){
                            config[k] = config[k].map(d=>categoryParams[k].options.find(d2=>d2.id === d))
                        }
                        if(config[k] === undefined || (typeof(config[k]) === "string" && config[k].trim() === "")){
                            if( categoryParams[k].default_process){
                                let source = parentSearch ?? primitive
                                if(categoryParams[k].default_process?.source?.startsWith("parent")){
                                    let [_, rId] = categoryParams[k].default_process?.source.split("_")
                                    let candidates = await primitiveParents( primitive )
                                    if( rId !== undefined){
                                        candidates = candidates.filter(d=>d.referenceId === parseInt(rId))
                                    }
                                    source = candidates[0]
                                }
                                if( source ){
                                    let value = source.title
                                    if( categoryParams[k].default_process.param){
                                        value = decodePath( source.referenceParameters, categoryParams[k].default_process.param)
                                    }
                                    if( categoryParams[k].default_process.process === "domain"){
                                        try{
                                            //let url = new URL(value)
                                            let url = new URL(cleanURL(value))
                                            value = getBaseDomain(url.hostname) + url.pathname
                                        }catch(e){
                                            console.log(`Not valid url - skipping search`)
                                            return
                                        }
                                    }else if( categoryParams[k].default_process.process === "resolve"){
                                        if( categoryParams[k].default_process.fn === "trustpilot_url_from_name"){
                                            console.log(`>>> Will resolce terms from company names`)
                                            async function findURLForTerm(term){
                                                if( term ){

                                                    return await findTrustPilotURLFromDetails({
                                                        title: term,
                                                        description: topic,
                                                        workspaceId: primitive.workspaceId
                                                    })
                                                }
                                                return undefined
                                            }
                                            let urlsForTermsResponse = await executeConcurrently( (config.companies?? "").split(",").map(d=>d.trim()), findURLForTerm)
                                            if( urlsForTermsResponse.results){
                                                value = urlsForTermsResponse.results.filter(d=>d)
                                            }
                                            baseTerms = config.terms.join(", ")
                                            await dispatchControlUpdate(primitive.id, `referenceParameters.${k}`, baseTerms)
                                        }
                                    }
                                    config[k] = value
                                }
                            }
                        }
                    }
                    let missing = []
                    for(const k of Object.keys(categoryParams)){
                        if( categoryParams[k].optional === false ){
                            if( config[k] === undefined || (typeof(config[k])==="string" && config[k].trim().length === 0)){
                                missing.push(k)
                            }
                        }
                    }
                    if( missing.length > 0){
                        console.log(`Missing required parameter(s): ${missing.join(", ")}`)
                        return
                    }
                    console.log(config)
                    /*
                    if( parentSearch ){
                        const asTitle = !parentSearch.referenceParameters?.useTerms && !parentSearch?.referenceParameters.hasOwnProperty("terms") && parentSearch.title
                        baseTerms = asTitle ? parentSearch.title : parentSearch.referenceParameters?.terms
                        //baseTerms = parentSearch.title
                        console.log(`OVERRIDE WITH PARENT SEARCH TERMS`)
                    }
                    if( !baseTerms){
                        baseTerms = inputsForSearch.terms.data.join(",")
                    }*/
                   
                    if( Array.isArray(baseTerms) ){
                        if( baseTerms.length > 1 ){
                            baseTerms = baseTerms.map(d=>d.replaceAll(",", " ").replaceAll(/\s+/g," "))
                        }
                        baseTerms = baseTerms.join(",")
                    }
                   

                    let topic = config.topic?.trim()
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

                    const nestCandidates = category.nestedSearch
                    if( nestCandidates && ! parentSearch ){
                        const nestedReferenceCategoryId = nestCandidates.referenceCategoryId
                        origin = origin ?? await Primitive.findOne({_id: oId})
                        if( origin && origin?.referenceId !== nestedReferenceCategoryId ){
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
                                                                                paths: ['origin', 'config'],
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

                    for( const source of config.sources.filter((d,i,a)=>a.indexOf(d) === i) ){
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

                        const progressUpdate = async (data)=>{
                            data.message = `Found ${data.totalCount} items / scanned ${data.totalScanned}\nCurrently term: ${data.term}`
                            dispatchControlUpdate(primitive.id, job.data.field + ".progress", data , {track: primitive.id})
                        }

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
                                        logger.info(`Filter [${type}] for ${data.dataSource} = ${result.output} vs ${threshold}`)
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
                                    referenceId: source.resultCategoryId,
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
                            progressUpdate,
                            existingCheck, 
                            filterPre: mapFilter(source.filterPre), 
                            filterMid: mapFilter(source.filterMid), 
                            filterPost: mapFilter(source.filterPost), 
                            createResult: createResult, 
                            prefix: prefix, 
                            cancelCheck: cancelCheck,
                            extendJob
                        }

                        if( source.platform === "linkedin" ){
                            if( source.type === "posts" ){
                                await queryPosts( terms,  callopts) 
                            }else if( source.type === "jobs" ){
                                await searchLinkedInJobs( terms,  callopts) 
                            }else if( source.type === "user_posts" ){
                                await queryLinkedInUserPostsBrightData( primitive, terms,  callopts) 
                                collectionAsync = true
                            }else if( source.type === "company_posts" ){
                                //await queryLinkedInCompanyProfilePostsBrightData( primitive, terms,  callopts) 
                                await queryLinkedInCompanyPostsByRapidAPI(primitive, terms, callopts)
                            }

                        }
                        if( source.platform === "gdelt" ){
                            await fetchArticlesFromGdelt( terms, callopts) 
                        }
                        if( source.platform === "moneysavingexpert" ){
                            await queryMoneySavingExpertForums(primitive, terms, callopts)
                        }
                        if( source.platform === "reviewsio" ){
                            await queryReviewsIO(primitive, terms, callopts)
                        }
                        if( source.platform === "facebook_group" ){
                            await queryFacebookGroup( terms, callopts) 
                        }
                        if( source.platform === "tiktok" ){
                            await queryTiktokWithBrightData( primitive, terms, callopts) 
                            collectionAsync = true
                        }
                        if( source.platform === "reddit" ){
                            await queryRedditWithBrightData( primitive, terms, callopts) 
                            collectionAsync = true
                        }
                        if( source.platform === "sub_reddit" ){
                            collectionAsync = true
                            await querySubredditWithBrightData( primitive, terms, callopts) 
                        }
                        if( source.platform === "glassdoor" ){
                            //await queryInstagramWithBrightData( primitive, terms, callopts) 
                            collectionAsync = true
                            await queryGlassdoorReviewWithBrightData( primitive, terms, callopts)
                        }
                        if( source.platform === "trustpilot" ){
                            //await queryInstagramWithBrightData( primitive, terms, callopts) 
                            if( oId ){
                                origin = origin ?? await Primitive.findOne({_id: oId})
                            }
                            let searchedViaCompany = false

                            if( origin ){
                                let targetProfile = origin.referenceParameters.trustpilot
                                if( targetProfile ){
                                    searchedViaCompany = true
                                    await queryTrustPilotForCompanyReviewsBrightData( primitive, [targetProfile], terms, callopts)
                                }
                            }
                            if( !searchedViaCompany ){
                                const urlsForTerms = terms.split(",").map(d=>cleanURL(d.trim())).filter(d=>d)
                                if( urlsForTerms.length > 0){
                                    await queryTrustPilotForCompanyReviewsBrightData( primitive, urlsForTerms, terms, callopts)
                                }
                            }
                            collectionAsync = true
                        }
                        if( source.platform === "instagram_profile" ){
                            await fetchInstagramPostsFromProfile( primitive, terms, callopts)
                            collectionAsync = true
                        }
                        
                        if( source.platform === "instagram" ){
                            await queryInstagramPostsByRapidAPI( primitive, terms, callopts)
                        }
                        if( source.platform === "linkedin_rapid" ){
                            await queryLinkedInCompaniesByRapidAPI( primitive, terms, callopts)
                        }
                        if( source.platform === "twitter_profile_posts" ){
                            await queryTwitterProfilePostsByRapidAPI( primitive, terms, callopts)
                        }
                        if( source.platform === "youtube" ){
                            await queryYoutube( terms, callopts) 
                        }
                        if( source.platform === "google_news" ){
                            await queryGoogleNews( terms, callopts) 
                        }
                        if( source.platform === "webpage" ){
                            await queryGoogleSERP( terms, {...callopts, timeFrame: ""}) 
                        }
                        if( source.platform === "google_scholar" ){
                            await queryGoogleScholar( terms, callopts) 
                        }
                        if( source.platform === "google" ){
                            await queryGoogleSERP( terms, callopts) 
                        }
                        if( source.platform === "quora" ){
                            await queryQuoraByRapidAPI( terms, callopts) 
                        }
                        if( source.platform === "perplexity" ){
                            await queryPerplexityViaBD( primitive, terms, callopts)
                            collectionAsync = true
                        }
                        if( source.platform === "chatgpt" ){
                            await queryChatGPTViaBD( primitive, terms, callopts)
                            collectionAsync = true
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
                                if( targetProfile ){
                                    await queryLinkedInCompanyPostsBrightData( primitive, targetProfile, terms, callopts)
                                    collectionAsync = true
                                }else{
                                    errorMessage = {
                                        message: `Cannot find LinkedIn URL for ${origin.title}`,
                                        type: "no_url",
                                        sourceId: origin.id,
                                        info: "linkedin_profile",
                                        action:"search"
                                    }
                                }
                            }
                        }
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

                    const updatedPrimitive = await fetchPrimitive( primitive.id )
                    const totalCount = Object.values(updatedPrimitive.primitives?.origin ?? []).length

                    let status = updatedPrimitive.processing?.query ?? {}
                    
                    if( collectionAsync ){
                        status = {
                            ...status,
                            status: "running",
                            collecting: true,
                            message: `Running collection`
                        }
                    }else{
                        status = {
                            ...status,
                            status: "complete",
                            totalCount,
                            totalScanned: updatedPrimitive.processing?.query?.progress?.totalScanned,
                            message: `Found ${totalCount} items`
                        }
                    }
                    let throwError = false
                    if( errorMessage ){
                        status.error = errorMessage
                    }else if( totalCount === 0 && config.zeroAsError){
                       status.error ="no results" 
                    }

                    await dispatchControlUpdate(primitive.id, job.data.field , status, {track: primitive.id})
                    if( throwError ){
                        throw `Error returned from query ${errorMessage}`
                    }
                    console.log(`Finished ${primitive.id} / ${primitive.plainId}`)
                    if( status.error ){
                        return {
                            error: status.error
                        }
                    }
                }
            }
        }catch(error){
            console.log(`Error in queryQueue`)
            console.log(error)
        }
        
    }

export default function QueryQueue(){    
    if (!instance) {
        instance = new QueryQueueClass();
        instance.myInit();
    }
    return instance;
}

class QueryQueueClass extends BaseQueue{
    constructor() {
        super('query', undefined, 2)
    }

    async doQuery(primitive, options = {}){
        const primitiveId = primitive.id
        const workspaceId = primitive.workspaceId
        const field = "processing.query"
        const data = {mode: "query", text:"Running query", ...options}

        await this.addJob(workspaceId, {id: primitiveId, ...data, field})
        dispatchControlUpdate(primitiveId, field , {status: "pending"}, {...data, track: primitiveId})
    }
}
