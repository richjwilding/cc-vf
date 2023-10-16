import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction} from './SharedFunctions'
import moment from 'moment';
import { replicateURLtoStorage } from './google_helper';
import { htmlToText } from "html-to-text";
import Category from "./model/Category";
var ObjectId = require('mongoose').Types.ObjectId;



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
    
    const lookup = async ( role )=>{
        try{
            
            const query = new URLSearchParams({ 
                company_name: primitive.title,
                role: role,
               // enrich_profile: "enrich"
            }).toString()
            const url = `https://nubela.co/proxycurl/api/find/company/role/?${query}`
            
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
            const profileResult = await response.json();


            if( profileResult && profileResult.linkedin_profile_url){
                const query = new URLSearchParams({ 
                    linkedin_profile_url: profileResult.linkedin_profile_url,
                    use_cache: "if-recent"
                // enrich_profile: "enrich"
                }).toString()
                const url = `https://nubela.co/proxycurl/api/v2/linkedin?${query}`
                
                console.log(`Doing 2nd proxycurl query - ${profileResult.linkedin_profile_url}`)
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
                let data = {profile: (await response.json())};
                
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

                if( data && data.profile ){

                    const oldestDegree = data.profile.education?.filter(d=>d.degree_name).reverse()[0]

                    const newData = {
                        workspaceId: primitive.workspaceId,
                        parent: primitive.id,
                        paths: ['origin', `results.${resultSet}`],
                        data:{
                            type: "entity",
                            referenceId: resultCategoryId,
                            title: data.profile.full_name,
                            referenceParameters:{
                                role: data.profile.occupation,
                                headline: data.profile.headline,
                                summary: data.profile.summary,
                                targetRole: role,
                                profile_pic_url: data.profile.profile_pic_url,
                                degree: oldestDegree?.degree_name,
                                degree_end_year: oldestDegree?.ends_at?.year,
                                profile: profileResult.linkedin_profile_url
                            },
                            linkedInData: data
                        }
                    }
                    const newPrim = await createPrimitive( newData )
                    /*if( newPrim ){
                        if(data.profile.profile_pic_url){
                            await replicateURLtoStorage( data.profile.profile_pic_url, newPrim.id, 'cc_vf_images' )
                        }
                    }*/
                }
            }
        }catch(error){
            console.log(`Error in findPeopleFromLinkedIn`)
            console.log(error)
            return {error: error}
        }
    }

    if(primitive.title && category && resultSet){
        for(const role of options.roles || action.roles || []){
            console.log(`Looking up ${role} on ${primitive.title}`)
            await lookup( role )
        }
    }

    
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