import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction, findResultSetForCategoryId, executeConcurrently, dispatchControlUpdate} from './SharedFunctions'
import moment from 'moment';
import { fetchLinksFromWebQuery, replicateURLtoStorage, writeTextToFile } from './google_helper';
import { htmlToText } from "html-to-text";
import Category from "./model/Category";
import Parser from '@postlight/parser';
import { buildDocumentTextEmbeddings, storeDocumentEmbeddings } from "./DocumentSearch";
import { findEntityResourceUrl } from "./entity_resource_capability";

export const liPostExtractor = {
    domain: 'www.linkedin.com',
    
    title: {
        selectors: ['.article-title', 'h1'],
    },
    
    author: {
        selectors: [
        'main > section > div > section  > article > [data-test-id="main-feed-activity-card__entity-lockup"] > div > div > a'
        ],
    },
    
    date_published: {
        selectors: [
        '.base-main-card__metadata',
        ['time[itemprop="datePublished"]', 'datetime'],
        ],
    
        timezone: 'America/Los_Angeles',
    },
    
    dek: {
        selectors: [
        // enter selectors
        ],
    },
    
    lead_image_url: {
        selectors: [['meta[name="og:image"]', 'value']],
    },
    
    content: {
        selectors: [
            'main > section > div > section  > article > article > .attributed-text-segment-list__container', //shared post
        'main > section > div > section  > article > .attributed-text-segment-list__container'  //post
        ],
    
        // Is there anything in the content you selected that needs transformed
        // before it's consumable content? E.g., unusual lazy loaded images
        transforms: {},
    
        // Is there anything that is in the result that shouldn't be?
        // The clean selectors will remove anything that matches from
        // the result
        clean: ['.entity-image'],
    },
}
Parser.addExtractor(liPostExtractor)
var ObjectId = require('mongoose').Types.ObjectId;

export async function fetchLIPost(url){
    try{

        const postResult = await Parser.parse(url, {
            contentType: 'text',
        })
        let text
        if( postResult && postResult.content ){
            text = postResult.content
            const m = text.match(/^.*?\d+(w|mo|y)\s{2,}(.*)/)
            if( m ){
                text = m[2]
            }
            if( text.match(/LinkedIn and 3rd parties use essential and non-essential cookies to provide, secure/)){
                return undefined
            }
        }
        return text
    }catch(error){
        console.log(`error in fetchLIPost`)
        console.log(error)
        return undefined
    }
}


export async function queryPosts(keywords, options = {}){

    let totalCount = 0
    let count = 0
    let target = options.count ?? 20
    let timeFrame = "last_year"

    const doLookup = async (term, nextPage )=>{
        let cancelled = false
        try{
            if( nextPage === undefined){
                count = 0
            }
            let hasResults = false
            let query = "site:linkedin.com/posts " + term 

            let lookup = await fetchLinksFromWebQuery(query, nextPage ? nextPage : true)
            if( lookup && lookup.links ){
                hasResults = true
                const process = async function(item){
                    if( count < target ){
                        if( options.filterPre && !(await options.filterPre({text: item.snippet, term: term})) ){
                            return
                        }
                        
                        if( options.existingCheck  ){
                            const exists = await options.existingCheck(item)
                            console.log(exists)
                            if( exists ){
                                return
                            }
                        }
                        const postText = await fetchLIPost( item.url )
                        if( options.filterPost && !(await options.filterPost({text: postText, term: term})) ){
                            return
                        }
                        if( postText ){
                            const r = {
                                title: item.title,
                                referenceParameters:{
                                    url: item.url,
                                    snippet: item.snippet,
                                    text: postText,
                                }
                            }
                            if( options.createResult ){
                                await options.createResult( r )
                            }
                            count++
                            totalCount++
                        }
                    }
                }
                let exec = await executeConcurrently( lookup.links, process, options.cancelCheck)
                console.log(exec)
                cancelled = exec.cancelled
            }
            console.log(hasResults, count, target)
            if( hasResults && count < target ){
                if( lookup.nextPage && !cancelled){
                    console.log(lookup.nextPage)
                    cancelled = await doLookup( term, {page:lookup.nextPage, timeFrame: timeFrame})
                }
            }
        }
        catch(error){
            console.log("Error in searchPosts")
            console.log(error)
        }
        return cancelled
    }

    if(keywords){

        for( const d of keywords.split(",")){
            const thisSearch = options.quoteKeywords ? '"' + d.trim() + '"' : d.trim()
            const cancelled = await doLookup( thisSearch )
            if( cancelled ){
                break
            }
        }
    }
    return totalCount

}

export async function extractUpdatesFromLinkedIn(primitive, options = {}, force = false){
    let linkedInData = primitive.linkedInData
    if( !options.path || !options.type || !options.referenceId){
        console.log(`Extract failed - params not set`)
        console.log(options)
        return undefined
    }

    if(force || !primitive.linkedin_done ){
        linkedInData = await enrichCompanyFromLinkedIn(primitive)
        if( linkedInData.error ){
            return {error: linkedInData.error}
        }
    }

    if( !linkedInData === undefined ){
        return {error: "no_data"}
    }

    let out = []

    if( linkedInData.updates){
        const id = primitive._id.toString()
        for( const update of linkedInData.updates){
            let full_text
            let extract_error = false

            const newData = {
                workspaceId: primitive.workspaceId,
                paths: ['origin', options.path, `extract.${id}`],
                parent: id,
                data:{
                    type: options.type,
                    referenceId: options.referenceId,
                    title: update.text,
                    referenceParameters:{
                        url: update.article_link,
                        source:"LinkedIn Profile Page",
                        fullText: full_text,
                        extractStatus: extract_error ? "ERROR" : "Done",
                        imageUrl: update.image
                    }
                }
            }
            const newPrim = await createPrimitive( newData )
            out.push(newPrim)
        }
    }
    return out

}
export async function pivotFromLinkedIn(primitive, force = false){
    let linkedInData = primitive.linkedInData

    if(force || !primitive.linkedin_done ){
        linkedInData = await enrichCompanyFromLinkedIn(primitive)
        if( linkedInData.error ){
            return {error: linkedInData.error}
        }
    }

    if( !linkedInData === undefined ){
        return {error: "no_data"}
    }

    let out = []

    if( linkedInData.similar_companies){
        for( const similar of linkedInData.similar_companies){
            const link = similar.link
            console.log(`Check ${link}`)
            const existing = await Primitive.findOne({
                "workspaceId": primitive.workspaceId,
                "referenceParameters.linkedIn": link
            })
            if( existing ){
                console.log("-- SKIP")
            }else{
                console.log(`-- creating entry for ${similar.name}`)
                const parent = Object.keys(primitive.parentPrimitives).find((d)=>primitive.parentPrimitives[d].includes('primitives.origin'))
                const paths = primitive.parentPrimitives[parent].map((d)=>d.replace('primitives.', ''))
                if( paths && parent ){
                    const newData = {
                        workspaceId: primitive.workspaceId,
                        paths: paths,
                        parent: parent,
                        data:{
                            type: primitive.type,
                            referenceId: primitive.referenceId,
                            title: similar.name,
                            referenceParameters:{
                                linkedIn: link,
                                industry: similar.industry
                            }
                        }
                    }
                    const newPrim = await createPrimitive( newData )
                    out.push(newPrim)
                    
                }
            }

        }
    }
    return out

}

export async function enrichCompanyFromLinkedIn(primitive, force = false){
        let linkedInData = primitive.linkedInData
        if(force || !primitive.linkedin_done ){
            linkedInData = await fetchCompanyProfileFromLinkedIn(primitive)
            if( linkedInData.error ){
            return {error: linkedInData.error}
            }
        }
        if( !linkedInData === undefined ){
            return {error: "no_data"}
        }

        const prim = await Primitive.findOneAndUpdate(
            {"_id": primitive._id},
            {
                'referenceParameters.url': linkedInData.website,
                'referenceParameters.industry': linkedInData.industry,
                'referenceParameters.description': linkedInData.description,
                'referenceParameters.domain': linkedInData.website?.replace(/^(https?:\/\/)?([^\/]+)\/?$/, "$2"),
                'title': linkedInData.name,
                linkedin_done: true
            }, {new: true}

        )
        
        if( linkedInData.profile_pic_url ){
            replicateURLtoStorage(linkedInData.profile_pic_url, primitive._id.toString(), "cc_vf_images")
        }
        if( linkedInData.background_cover_image_url ){
            replicateURLtoStorage(linkedInData.background_cover_image_url, primitive._id.toString() + "-background", "cc_vf_images")
        }
        const result = [
            {
                type:"set_fields",
                primitiveId: primitive._id.toString(),
                fields:{
                    'referenceParameters.url': linkedInData.website,
                    'referenceParameters.industry': linkedInData.industry,
                    'referenceParameters.description': linkedInData.description,
                    'referenceParameters.hasImg': linkedInData.profile_pic_url,
                    'referenceParameters.hasBgImg': linkedInData.background_cover_image_url,
                    'referenceParameters.domain': linkedInData.website?.replace(/^(https?:\/\/)?([^\/]+)\/?$/, "$2"),
                    'title': linkedInData.name,
                }
            }
        ]

        return result
}
export async function findPeopleFromLinkedIn( primitive, options, action ){
    
    const resultCategoryId = options.resultCategory || action.resultCategory
    
    const category = options.category || await Category.findOne({id: primitive.referenceId})
    const resultSet =  options.resultSet || (category && category.resultCategories.find((d)=>d.resultCategoryId == resultCategoryId)?.id)
    console.log(resultSet, category?.title)
    const maxCount = 100
    let count 
    
    const lookup = async ( role, nextUrl )=>{
        try{
            
            let query
            let url

                if( nextUrl || primitive.type !== "entity" || options.broad ){
                    const qs = { 
                        role: role,
                        // page_size: 100,
                        current_company_employee_count_min: 5,
                        country: "US",
                        current_role_title: `(?i)${role}`,
                        //summary:"(?i)(?:sustainable construction|durable construction|green construction|embodied carbon|low carbon)+",
                        //summary:"(?i)(?:sustainable construction|durable construction|green construction|embodied carbon|low carbon|sustainability)+",
                        summary:"(?i)(?:greenbuild|sustainable construction|carbon footprint|green build)+",
                        enrich_profiles: "enrich"
                    }
                    if( nextUrl ){
                        qs.next_token = nextUrl 
                    }
                    query = new URLSearchParams(qs).toString()
                    
                    url = `https://nubela.co/proxycurl/api/search/person/?${query}`
                }else{
                    query = new URLSearchParams({ 
                        company_name: primitive.title,
                        role: role,
                        // enrich_profile: "enrich"
                    }).toString()
                    url = `https://nubela.co/proxycurl/api/find/company/role/?${query}`
                }
            
            console.log(`Doing proxycurl query`)
                    console.log(url)
            const response = await fetch(url,{
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${process.env.PROXYCURL_KEY}`
                },
            });
            
            if( response.status !== 200){
                console.log(`Error from proxycurl`)
                console.log(response)
                return {error: response}
            }
            const profileResult = await response.json();
            console.log(profileResult)


            if( profileResult && (profileResult.linkedin_profile_url || profileResult.results)){
                let data = profileResult
                if( !profileResult.results && !profileResult.profile ){
                        
                    data = {profile: (await fetchLinkedInProfile(profileResult.linkedin_profile_url, "if-recent") )};
                        
                    if( data && data.profile && !data.profile.occupation){
                        console.log(`====> Empty occupation, refreshing`)
                        const response = await fetch(url,{
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${process.env.PROXYCURL_KEY}`
                            },
                        });
                        data = {profile: (await response.json())};
                    }
                    console.log(data)
                    data.results = [{profile: data.profile, linkedin_profile_url: profileResult.linkedin_profile_url}]
                }

                if( data && data.results ){
                    for( const set of data.results ){
                       if( await addPersonFromProxyCurlData( set.profile, set.linkedin_profile_url, resultCategoryId, primitive, resultSet,  {targetRole: role}) ) 
                
                        count++
                    }
                }
                if( profileResult.next_page && count < maxCount ){
                    console.log(`GETTING NEXT PAGE`)
                    const token = profileResult.next_page.match(/next_token=(.*)/)
                    if( token ){
                        console.log(token[1])
                        await lookup(role, token[1])
                    }
                }
            }
        }catch(error){
            console.log(`Error in findPeopleFromLinkedIn`)
            console.log(error)
            return {error: error}
        }
    }

    if(primitive.title && category && resultSet !== undefined){
        for(const role of options.roles || action.roles || []){
            count = 0
            console.log(`Looking up ${role} on ${primitive.title}`)
            await lookup( role )
        }
    }
}
export async function searchLinkedInJobs(keywords, options = {}){
    const target = options.count ?? 50
    let maxPage = options.maxPage ?? 8
    let totalCount = 0

    // UK : 101165590
    // US : 103644278
    // Denmark: 104514075
    // Italy : 103350119
    const searchOptions = {
        geoId: options.geoId ?? 103644278,
        when: options.when ?? "past-month"
    }
    async function doLookup( keyword, url ){
        let cancelled = false
        if( url === undefined){
            const query = new URLSearchParams({ 
                ...searchOptions,
                keyword: keyword
            }).toString()
            url = `https://nubela.co/proxycurl/api/v2/linkedin/company/job?${query}`
        }
        
        console.log(`Doing proxycurl search for jobs`)
        const response = await fetch(url,{
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.PROXYCURL_KEY}`
            },
        });
        
        if( response.status !== 200){
            console.log(`Error from proxycurl`)
            console.log(response)
            return {error: response}
        }
        const results = await response.json()
        const processItem = async (item)=>{
                if( options.existingCheck  ){
                    const exists = await options.existingCheck(item)
                    if( exists ){
                        return
                    }
                }
                let pageContent = {}
                
                const params = {
                        'url': item.job_url,
                        'apikey': process.env.ZENROWS_KEY,
                        'js_render': 'true',
                        'premium_proxy': 'true',
                        'proxy_country': 'us',
                        'css_extractor': `{"top":".top-card-layout","main":".decorated-job-posting__details"}`,
                    }

                const cUrl = `https://api.zenrows.com/v1/?${new URLSearchParams(params).toString() }`
                const response = await fetch(cUrl,{
                    method: 'GET'
                })
                if(response.status === 200){
                    const results = await response.json();
                    if( results ){
                        console.log(results)
                        let text = results.top + "\n" + results.main
                        text = text.replace(/ +/g, ' ');
                        text = text.replace(/\n+/g, '\n');
                        pageContent = {
                            description: text.split(" ").slice(0,400).join(" "),
                            fullText: text                   
                        }
                    }

                }else{
                    console.log(`LI Job fetch failed`)
                    console.log(response)
                    return undefined
                }

                if( pageContent ){
                    const r = {
                        title: item.company + " - " + item.job_title,
                        referenceParameters:{
                            url: item.job_url,
                            posted: item.list_date,
                            company: item.company,
                            location: item.location,
                            company_linkedin: item.company_url,
                            source:"LinkedIn - " + keyword,
                            description: pageContent.description
                        }
                    }
                    
                    const embeddedFragments = await buildDocumentTextEmbeddings( pageContent.fullText )
                    
                    const newPrim = await options.createResult( r )
                    if( newPrim ){
                        await writeTextToFile(newPrim.id.toString(), pageContent.fullText)
                        await storeDocumentEmbeddings( newPrim, embeddedFragments)
                    }
                    totalCount++
                }
        }
        if(results && results.job){
            let exec = await executeConcurrently( results.job, processItem, options.cancelCheck, ()=> totalCount >= target)
            cancelled = exec?.cancelled

            if( !cancelled && (totalCount < target) ){
                if( results.next_page_api_url){
                    console.log(`Do next page check ${results.next_page_no}`, results.next_page_api_url)
                    if( results.next_page_no < maxPage){
                        await doLookup( keyword, results.next_page_api_url)
                    }
                }
            }
        }
    }
    if( keywords ){
        for( const d of keywords.split(",")){
            const thisSearch = options.quoteKeywords ? '"' + d.trim() + '"' : d.trim()
            const cancelled = await doLookup( thisSearch )
            if( cancelled ){
                break
            }
        }
    }
    return totalCount
}
export async function fetchLinkedInProfile( linkedin_profile_url, use_cache = "if-present" ){
    const query = new URLSearchParams({ 
        linkedin_profile_url: linkedin_profile_url,
        use_cache: use_cache
    }).toString()
    const url = `https://nubela.co/proxycurl/api/v2/linkedin?${query}`
    
    console.log(`Doing 2nd proxycurl query - ${linkedin_profile_url}`)
    const response = await fetch(url,{
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${process.env.PROXYCURL_KEY}`
        },
    });
    
    if( response.status !== 200){
        console.log(`Error from proxycurl`)
        console.log(response)
        return {error: response}
    }
    return await response.json()
}

export async function findLinkedinCompanyPage(primitive, options = {}) {
    try {
        const url = await findEntityResourceUrl("linkedin", { primitive, options });
        if (url && /linkedin\.com\/company\//i.test(url)) {
            return url;
        }
    } catch (error) {
        console.log(error);
    }
    return undefined;
}

export async function updateFromProxyCurlData( primitive ){
    const profileUrl = primitive.referenceParameters.profile
    if( profileUrl ){
        const profile = await fetchLinkedInProfile(profileUrl)
    
        
        const oldestDegree = profile.education?.filter(d=>d.degree_name).reverse()[0]
        const referenceParameters = {
                role: profile.occupation,
                headline: profile.headline,
                summary: profile.summary,
                summary: profile.summary,
                profile_pic_url: profile.profile_pic_url,
                degree: oldestDegree?.degree_name,
                degree_end_year: oldestDegree?.ends_at?.year,
                location: [profile.city, profile.state, profile.country].filter(d=>d).join(", "),
                profile: profileUrl,
                experiences: profile.experiences}
        
        await dispatchControlUpdate( primitive.id, "referenceParameters", referenceParameters)
        await dispatchControlUpdate( primitive.id, "title", profile.full_name)
        if(profile.profile_pic_url){
            await replicateURLtoStorage( profile.profile_pic_url, primitive.id, 'cc_vf_images' )
        }
    }
}
export async function addPersonFromProxyCurlData( profile, url, resultCategoryId, primitive, resultSet, extra = {} ){
    const existing = await Primitive.findOne({
        "workspaceId": primitive.workspaceId,
        [`parentPrimitives.${primitive.id}`]: {$in: ['primitives.origin']},
        deleted: {$exists: false},
        "referenceParameters.profile": url
    })
    if( existing ){
        console.log(url, " already exists")
        return false
    }

    if( !profile.full_name || profile.full_name.trim().length === 0 ){
        console.log(url, " not a person profile")
        return false
    }
    const oldestDegree = profile.education?.filter(d=>d.degree_name).reverse()[0]
    const newData = {
        workspaceId: primitive.workspaceId,
        parent: primitive.id,
        paths: ['origin', `results.${resultSet}`],
        data:{
            type: "entity",
            referenceId: resultCategoryId,
            title: profile.full_name,
            referenceParameters:{
                role: profile.occupation,
                headline: profile.headline,
                summary: profile.summary,
                summary: profile.summary,
                profile_pic_url: profile.profile_pic_url,
                degree: oldestDegree?.degree_name,
                degree_end_year: oldestDegree?.ends_at?.year,
                location: [profile.city, profile.state, profile.country].filter(d=>d).join(", "),
                profile: url,
                experiences: profile.experiences,
                ...extra
            },
            linkedInData: profile
        }
    }
    const newPrim = await createPrimitive( newData )
    if( newPrim ){
        if(profile.profile_pic_url){
            await replicateURLtoStorage( profile.profile_pic_url, newPrim.id, 'cc_vf_images' )
        }
    }
    return newPrim
}

export async function fetchCompanyProfileFromLinkedIn( primitive ){
    try{

        let targetProfile = primitive.referenceParameters.linkedIn.trim()
        if( targetProfile === undefined || targetProfile === ""){
            return {error: "no_profile"}
        }
        if( targetProfile.slice(0,8)!=="https://"){
            targetProfile = "https://" + targetProfile
        }
        
        const query = new URLSearchParams({ 
            "resolve_numeric_id":false,
            "categories": "exclude",
            "funding_data": "include",
            "extra":"exclude",
            "exit_data":"exclude",
            "acquisitions":"exclude",
            "url": targetProfile,
            "use_cache":"if-present"
        }).toString()
        const url = `https://nubela.co/proxycurl/api/linkedin/company?${query}`
        
        console.log(`Doing proxycurl query`)
        const response = await fetch(url,{
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.PROXYCURL_KEY}`
            },
        });
        
        if( response.status !== 200){
            console.log(`Error from proxycurl`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data ){
            console.log(data)
            const linkedInData = {
                name: data.name,
                description: data.description,
                company_size: data.company_size,
                website: data.website,
                similar_companies: data.similar_companies,
                company_size: data.company_size,
                profile_pic_url: data.profile_pic_url,
                background_cover_image_url: data.background_cover_image_url,
                categories: data.categories,
                locations: data.locations,
                industry: data.industry,
                updates: data.updates,
                funding_data:data.funding_data,
                tagline: data.tagline
            }
            primitive.set("linkedInData", linkedInData)
            primitive.markModified("linkedInData")


            await primitive.save()
            return linkedInData
        }else{
            return {error: "no data"}
        }
    }catch(error){
        return {error: error}
    }

    
}