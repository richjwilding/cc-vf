import { HttpsProxyAgent } from "https-proxy-agent";
import http from "http"
import axios from 'axios';
import moment from "moment";
import { addRelationship, createPrimitive, dispatchControlUpdate, executeConcurrently, fetchPrimitives } from "./SharedFunctions";
import BrightDataQueue from "./brightdata_queue";
import { promises as fs } from 'fs';


async function linkToPrimitiveViaSearchPath( primitive ){
    const [oId, candidatePaths] = Object.keys(primitive.parentPrimitives ?? {})?.map(d=>primitive.parentPrimitives[d].map(d2=>[d,d2])).flat()?.find(d=>d[1].indexOf("primitives.search.") === 0) ?? []
    const addToOrigin = candidatePaths?.length > 0
    const resultPath = addToOrigin ? candidatePaths.replace(".search.",".results.") : undefined
    return {linkId: oId, linkPath: resultPath}
}

async function baseExcludeByReferenceId(referenceId, primitive, idField = "id"){
    const q = {_id: {$exists: true}, workspaceId: primitive.workspaceId, referenceId}
    const existing = await fetchPrimitives([],q, {_id: 1, referenceParameters: 1})
    return existing.map(d=>d.referenceParameters?.[idField])
}

function instagramPostData(data){
    const date = moment(data.date_posted).format('DD MMM YY')
    return {
        title: `Post by ${data.user_posted} on ${date}`,
        referenceId: 122,
        referenceParameters:{
            url: data.url,
            id: data.post_id,
            api_source: "bd_instagram",
            username: data.user_posted,
            userProfile: data.profile_url,
            overview: data.description,
            imageUrl: data.photos?.[0] ?? data.thumbnail,
            source: "Instagram",
            location: data.location,
            posts_count: data.posts_count,
            posted: data.date_posted,
            likes: data.likes,
            coauthor_producers: data.coauthor_producers,
            tagged_users: data.tagged_users,
            engagement_score_view: data.engagement_score_view,
            company: data.is_paid_partnership ? data.partnership_details?.username : undefined,
            video_view_count: data.video_view_count,
            followers: data.followers,
            hashtags: data.hashtags,
            post_content: data.post_content,
            latest_comments: data.latest_comments
        }
    }
}


const bdExtractors = {
    "linkedin_post":{
        datasetId: "gd_lyy3tktm25m4avu764",
        id: (data)=>data.id,
        excludeIds:async ()=>{},
    //    limit: 100,
        linkConfig:linkToPrimitiveViaSearchPath,
        queryParams: "&type=discover_new&discover_by=company_url",
        data:  (data)=>{
            const date = moment(data.date_posted).format('DD MMM YY')

            return {
                title: data.title,
                referenceId: 123,
                referenceParameters:{
                    url: data.url,
                    id: data.id,
                    api_source: "bd_linkedin_post",
                    username: data.user_id,
                    userProfile: data.use_url,
                    overview: data.headline,
                    imageUrl: data.images?.[0],
                    likes: data.num_likes,
                    source: "LinkedIn",
                    location: data.location,
                    posts_count: data.user_posts,
                    followers: data.user_followers,
                    description: data.post_text,
                    hashtags: data.hashtags,
                    account_type: data.account_type
                }
            }
        }
    },
    "reddit_post":{
        datasetId: "gd_lvz8ah06191smkebj4",
        id: (data)=>data.post_id,
       // excludeIds:async (primitive)=>baseExcludeByReferenceId(125, primitive, "post_id"),
    //    limit: 100,
        linkConfig:linkToPrimitiveViaSearchPath,
        queryParams: "&type=discover_new&discover_by=keyword",
        data:  (data)=>{
            const date = moment(data.date_posted).format('DD MMM YY')
            const {title, ...referenceParameters} = data
            return {
                title,
                referenceId: 125,
                referenceParameters
            }
        }
    },
    "instagram_author_lookup":{
        datasetId: "gd_l1vikfch901nx3by4",
        enrich: true,
        queryParams: "",
        buildInput:async (primitive, options)=>{
            return {
                url: primitive.referenceParameters[options.field]
            }
        },
        id: (data)=>data.id,
        data:  (data)=>{
            return {
                title: data.profile_name,
                referenceId: 124,
                referenceParameters:{
                    api_source: "bd_instagram_profile",
                    source: "Instagram",
                    ...data
                }
            }
        }

    },
    "instagram_posts_from_author":{
        datasetId:  "gd_lk5ns7kz21pck8jpis",
        data: instagramPostData,
        id: (data)=>data.id,
        buildInput:async (primitive, options)=>{
            const q = {
                _id: {$exists: true}, 
                workspaceId: primitive.workspaceId, 
                [`parentPrimitives.${primitive.id}`]: {$exists: true},
                referenceId: 122
            }
            const existing = await fetchPrimitives([],q, {_id: 1, referenceParameters: 1})
            return {
                url: primitive.referenceParameters[options.field],
                num_of_posts: 100,
                posts_to_not_include: existing.map(d=>d.referenceParameters.id)
            }
        },
        queryParams: "&type=discover_new&discover_by=url",
    },
    "instagram_posts":{
        datasetId: "gd_lk5ns7kz21pck8jpis",
        id: (data)=>data.post_id,
        data: instagramPostData
    },
    "instagram":{
        datasetId: "gd_lk5ns7kz21pck8jpis",
        id: (data)=>data.post_id,
        queryParams: "&type=discover_new&discover_by=keyword",
        /*excludeIds:async (primitive)=>{
            const q = {_id: {$exists: true}, workspaceId: primitive.workspaceId, [`parentPrimitives.${primitive.id}`]: {$exists: true},referenceId: 122}
            const existing = await fetchPrimitives([],q, {_id: 1, referenceParameters: 1})
            return existing.map(d=>d.referenceParameters.id)
        },*/
        //filter: (data)=>data.filter(d=>d.referenceParameters.location),
        data: instagramPostData
    },"tiktok":{
        datasetId: "gd_lu702nij2f790tmv9h",
        id: (data)=>data.post_id,
        queryParams: "&type=discover_new&discover_by=keyword",
        data:  (data)=>{
            return {
                referenceId: 63,
                referenceParameters:{
                    url: data.url,
                    id: data.post_id,
                    api_source: "bg_tiktok",
                    username: data.profile_username,
                    userProfile: data.profile_url,
                    overview: data.description,
                    imageUrl: data.preview_image,
                    source: "TikTok",
                    location: data.location,
                    posted: data.create_time,
                    digg_count: data.digg_count,
                    share_count: data.share_count,
                    collect_count: data.collect_count,
                    play_count: data.play_count,
                    comment_count: data.comment_count,
                    hashtags: data.hashtags,
                }
            }
        }
    }
}

export async function enrichPrimitiveViaBrightData( primitive, options = {} ){
    const configName = options.api + "_" + options.endpoint
    console.log(`Enrich ${primitive.id} / ${primitive.plainId} via ${configName}`)
    const config = bdExtractors[configName]

    if( !config.buildInput ){
        throw `Cant build input for ${configName}`
    }
    let input = await config.buildInput( primitive, options )

    console.log(input)

    await triggerBrightDataCollection(input, configName, primitive, undefined, options.create ?? {})
}

export async function queryLinkedInCompanyPostsBrightData( primitive, company_url, terms, callopts){
    const input = [{        
        url: company_url,
        start_date: moment().subtract(2, "years").format("YYYY-MM-DD")
    }]
    if( primitive.processing?.bd?.collectionId){
        console.log(`Not redoing LI fetch`)
        return 
    }

    await triggerBrightDataCollection(input, "linkedin_post", primitive, terms,callopts)
}
export async function queryRedditWithBrightData( primitive, terms, callopts){
    const individualTerms = terms.split(",").map(d=>d.trim())
    const config = bdExtractors["reddit_post"]
    
    const input = individualTerms.map(d=>({
        keyword: d,
    }))
    await triggerBrightDataCollection(input, "reddit_post", primitive, terms, {...callopts, limit_count: callopts.count})
}
export async function queryTiktokWithBrightData( primitive, terms, callopts){
    const individualTerms = terms.split(",").map(d=>d.trim())
    console.log(`-- ${individualTerms.join(", ")}`)
    if( individualTerms > 1){
        throw "1 term max for now"
    }
    let excludeList = undefined
    const config = bdExtractors["tiktok"]
    if( config?.excludeIds ){
        excludeList = await config.excludeIds( primitive )
    }
    
    const input = individualTerms.map(d=>({
        search_keyword: d,
        num_of_posts: callopts.count,
    }))
    if( excludeList){
        input.posts_to_not_include = excludeList
    }
    await triggerBrightDataCollection(input, "tiktok", primitive, terms,callopts)
}

export async function fetchInstagramPosts( primitive, urls ){
    const input = urls.map(d=>({
        url: d
    }))

    const config = bdExtractors["instagram_posts"]

    await triggerBrightDataCollection(input, "instagram_posts", primitive, undefined, {})

}
export async function queryInstagramWithBrightData( primitive, terms, callopts){
    const individualTerms = terms.split(",").map(d=>d.trim())
    console.log(`-- ${individualTerms.join(", ")}`)
    if( individualTerms > 1){
        //throw "1 term max for now"
    }
    let excludeList = undefined

    const today = moment()
    let start_date
    if( callopts.timeFrame === "last_year"){
        start_date = today.subtract(1, "year")
    }else if( callopts.timeFrame === "last_month"){
        start_date = today.subtract(1, "month")
    }else if( callopts.timeFrame === "last_week"){
        start_date = today.subtract(1, "week")
    }

    if( start_date){
        input.start_date = start_date
    }
    

    const input = individualTerms.map(d=>({
        keyword: d,
        num_of_posts: callopts.count,
     //   post_type: "post",
        start_date: "2024-08-01"
    }))

    const config = bdExtractors["instagram"]
    if( config?.excludeIds ){
        input.posts_to_not_include = await config.excludeIds( primitive )
    }

    await triggerBrightDataCollection(input, "instagram", primitive, terms,callopts)

}
export async function triggerBrightDataCollection( input, api, primitive, terms, callopts = {}){
    console.log(`Will trigger collection from BD for API: ${api}`)
    const config = bdExtractors[api]

    let url = `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${config.datasetId}${config.queryParams ?? ""}`
    if( config.limit ){
        url += `&limit_per_input=${config.limit}`
    }else if( callopts.limit_count ){
        url += `&limit_per_input=${callopts.limit_count}`
    }


    console.log(url)
    console.log(input)
    try {
        const response = await axios.post(url, input, {
            headers: {
                'Authorization': `Bearer ${process.env.BRIGHTDATA_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        const data = response.data
        // Log the response from the API
        console.log('Data collection triggered successfully:', data);
        dispatchControlUpdate(primitive.id, `processing.bd.${api}.collectionId` , data?.snapshot_id)

        BrightDataQueue().scheduleCollection( primitive, {input, api, terms, callopts: {enrich: config.enrich, ...callopts}})
        
    } catch (error) {
        console.error('Error triggering data collection:', error.response ? error.response.data : error.message);
    }
}

export async function restartCollection( primitive, {api, callopts} = {} ){
    if( !api ){
        throw "No API defined for collection"
    }
    const config = bdExtractors[api]
    BrightDataQueue().scheduleCollection( primitive, {api, callopts: {enrich: config.enrich, ...callopts}})

}

export async function handleCollection(primitive, {input, api, terms, callopts} = {}, doCreation = true){
    if( !api ){
        throw "No API defined for collection"
    }
    const snapshot_id = primitive.bd?.[api]?.collectionId
    if( !snapshot_id ){
        console.log(`No snapshot id for ${primitive.id} / ${primitive.plainId}`)
        return {data: undefined}
    }
    console.log(`Check status of ${snapshot_id}`)
    const url = `https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}?format=json`;

    try {
        
        const response = await axios.get(url, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.BRIGHTDATA_KEY}`,
            },
        });
        if( !Array.isArray(response.data)){
            if( response.data.status === "running" || response.data.status === "building"){
                console.log(`still running - retry`)
                return {
                    reschedule: ()=>BrightDataQueue().scheduleCollection( primitive, {input, api, terms, callopts}, true )
                }
            }
            console.log(response.data)
            return
        }
       
            /*
        const data = await fs.readFile('/Users/richardwilding/Downloads/snap_m2ng0s5e25u10ms7o0.json', 'utf8');
        const response = {data: JSON.parse(data)}*/
    
        api = api ?? primitive.bd.api
        const config = bdExtractors[api]
        

        console.log(`Got ${response.data.length} results back`)
        let toProcess = [], out = []
        for(const d of response.data){
            const id = config.id( d )
            const data = config.data( d )
            console.log(id)
            toProcess.push( data )
        }

        
        if( config.filter ){
            console.log(`Have ${toProcess.length} pre-filter`)
            toProcess = config.filter( toProcess )
            console.log(`Have ${toProcess.length} post-filter`)
        }


        let linkData = config.linkConfig ? await config.linkConfig( primitive ) : undefined
        console.log(linkData)
        
        if( doCreation ){
            let idx = 0
            const addItem = async (data)=>{
                console.log(idx, data.referenceParameters.id)
                const newData = {
                    workspaceId: primitive.workspaceId,
                    paths: ['origin', 'auto'],
                    parent: primitive.id,
                    data:{
                        type: "result",
                        referenceId: 63,
                        ...data
                    }
                }
                try{
                    const newPrim = await createPrimitive( newData )
                    if( linkData){
                        await addRelationship( linkData.linkId, newPrim.id, linkData.linkPath )
                    }
                    out.push( newPrim )
                }catch(error){
                    console.log(`Error creating primitive for BD result`)
                    console.log(newData)
                    console.log(error)
                }
                idx++
            }
            await executeConcurrently( toProcess, addItem, undefined, undefined, 10)
            return out
        }
        return toProcess
    } catch (error) {
        console.error('Error fetching data from snapshot:', error.response ? error.response.data : error.message);
    }

}


export async function fetchViaBrightDataProxy(url, options = {}) {
    try{

        // Parse the URL to determine if it's HTTP or HTTPS
        const parsedUrl = new URL(url);
        const proxyUrl = options.proxy ?? process.env.BRIGHTDATA_DC_PROXY
        const parsedProxy = new URL(proxyUrl);


        if( options.useAxios ){


            const axiosOptions = { 
                method:'get',
                responseType: options.responseType ?? "arrayBuffer",
                timeout: 30000,
                proxy:{
                    host: parsedProxy.hostname,
                    port: parsedProxy.port,
                    auth: {
                        username: parsedProxy.username,
                        password: parsedProxy.password,
                    },
                    protocol: parsedProxy.protocol,
                }
            }
            const response = await axios.get(url, axiosOptions);

            return response
        }
            
        let agent;

        // Choose the correct proxy agent based on protocol
        if (parsedUrl.protocol === 'https:') {
            agent = new HttpsProxyAgent(proxyUrl);
        } else if (parsedUrl.protocol === 'http:') {
            agent = new http.Agent({
                host: parsedProxy.hostname,
                port: parsedProxy.port
            });
        } else {
            throw new Error('Unsupported protocol');
        }


        const timeout = options.timeout || 30000; // Default timeout of 5 seconds
        const controller = new AbortController(); // Create an AbortController
        const timeoutId = setTimeout(() => {
            console.log('timeout called')
            controller.abort(); // Abort the fetch request after timeout
        }, timeout);

        const response = await fetch(url, { 
                                            agent,
                                            signal: controller.signal
                                        });
        clearTimeout(timeoutId);
            console.log('back')
        return response
    }
    catch(error){
        if (error.name === 'AbortError') {
            console.error(`Fetch request timed out after ${options.timeout || 30000}ms`);
        } else {
            console.log(`Error in fetchViaBrightDataProxy`)
            console.log(error)
        }
        return {status: 500} 
    }
}
//BRIGHTDATA_SERP
export async function fetchSERPViaBrightData( query, options = {}){
    const PER_PAGE = 20


    const time = {
        "last_week": "qdr:w",
        "last_month": "qdr:m",
        "last_year": "qdr:y",
        "none": undefined
    }

    const bdParams = {
        q: query,
        tbm: {
            "news": "nws",
            "shopping": "shop",
            "tmb": "isch",
            "videos": "vid",
        }[options.search_type],
        num: PER_PAGE,
        start: (options.page - 1) * PER_PAGE,
        gl: options. gl,
        tbs: time[options.time_period],
        brd_json:1
    }

    console.log(bdParams)
    for( const k of Object.keys(bdParams)){
        if( bdParams[k] === undefined ){
            delete bdParams[k]
        }
    }

    const bdUrl = `https://www.google.com/search?${new URLSearchParams(bdParams).toString() }`

    const aResponse = await fetchViaBrightDataProxy( bdUrl, {proxy: process.env.BRIGHTDATA_SERP, useAxios: true})
    const response = aResponse.data

    const general = response.general
    const pagination = response.pagination

    if( general?.results_cnt === 0 ){
        console.log(`NO RESULTS`)
        return {}
    }

    const mapped = {
        nextPage: pagination?.next_page
    }
    if( options.search_type === "news"){
        mapped.links = response.news?.map(d=>({
            title: d.title,
            url: d.link,
            source: d.source,
            snippet: d.description,
            image: d.source_logo
        }))
    }else if( options.knowledge){
        let out = {
            knowledge: response.knowledge
        }
        if( options.overview){
            out.overview = response.overview
        }
        return out
    }else{
        mapped.links = response.organic?.map(d=>({
            title: d.title,
            url: d.link,
            snippet: d.description,
            image: d.image
        }))

    }

    return mapped

}