import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction, findResultSetForCategoryId} from './SharedFunctions'
import moment from 'moment';
import { fetchLinksFromWebQuery, replicateURLtoStorage } from './google_helper';
import { htmlToText } from "html-to-text";
import Category from "./model/Category";
import Parser from '@postlight/parser';

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


export async function searchPosts(primitive, options = {}, action = {}){

    let totalCount = 0
    let count = 0
    let target = options.count ?? action.count ?? 100

    const doLookup = async (term, nextPage )=>{
        try{
            if( nextPage === undefined){
                count = 0
            }
            let hasResults = false
            let query = "site:linkedin.com/posts " + term

            const resultCategory = options.resultCategory || action.resultCategory
            let lookup = await fetchLinksFromWebQuery(query, nextPage ? nextPage : true)
            if( lookup && lookup.links ){
                let out = lookup.links
                console.log(`got ${out.length}`)
                const outputPath = await findResultSetForCategoryId(primitive, resultCategory)
                if( outputPath !== undefined ){
                    if( out ){
                        if( action.limit ){
                            out = out.slice(0, action.limit)
                        }
                        for(const item of out){
                            hasResults = true
                            const xSnippet = item.snippet?.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '');
                            const xTerm = term?.toLowerCase().replace(/[^a-zA-Z0-9\s]/g, '');
                            if( !xSnippet || !xTerm){
                                continue
                            }
                            if( xSnippet.indexOf(xTerm) === -1 ){
                                continue
                            }
                            const existing = await Primitive.findOne({
                                "workspaceId": primitive.workspaceId,
                                "referenceParameters.url": item.url,
                                [`parentPrimitives.${primitive.id}`]: {$in: ['primitives.origin']},
                                deleted: {$exists: false},
                            })
                            if( existing ){
                                continue
                            }
                            const postText = await fetchLIPost( item.url )
                            if( postText ){
                                const newData = {
                                    workspaceId: primitive.workspaceId,
                                    paths: ['origin', `results.${outputPath}`],
                                    parent: primitive.id,
                                    data:{
                                        type: "result",
                                        referenceId: resultCategory,
                                        title: item.title,
                                        referenceParameters:{
                                            url: item.url,
                                            snippet: item.snippet,
                                            source:`Web query "${query}"`,
                                            text: postText,
                                        }
                                    }
                                }
                                const newPrim = await createPrimitive( newData )
                                count++
                                totalCount++
                            }
                        }
                    }
                }
            }
            console.log(hasResults, count, target)
            if( hasResults && count < target ){
                if( Object.keys(lookup.nextPageQuery).length > 0 ){
                    console.log(' -- fetch next page')
                    console.log(lookup.nextPageQuery)
                    await doLookup( term, lookup.nextPageQuery)
                }else{
                    console.log(' -- no next page')
                }
            }
        }
        catch(error){
            console.log("Error in searchPosts")
            console.log(error)
        }
    }

    await doLookup( '"green build"' )
    await doLookup( '"greenbuild"' )
    await doLookup( '"sustainable material"' )
    await doLookup( '"embodied carbon"' )
    await doLookup( '"embodiedcarbon"' )

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

        const targetProfile = primitive.referenceParameters.linkedIn
        if( targetProfile === undefined || targetProfile === ""){
            return {error: "no_profile"}
        }
        
        const query = new URLSearchParams({ 
            "resolve_numeric_id":false,
            "categories": "no",
            "funding_data": "no",
            "extra":"no",
            "exit_data":"no",
            "acquisitions":"no",
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