import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction} from './SharedFunctions'
import moment from 'moment';
import { replicateURLtoStorage } from './google_helper';
var ObjectId = require('mongoose').Types.ObjectId;

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

        await Primitive.findOneAndUpdate(
            {"_id": primitive._id},
            {
                'referenceParameters.url': linkedInData.website,
                'referenceParameters.industry': linkedInData.industry,
                'referenceParameters.description': linkedInData.description,
                'title': linkedInData.name,
                linkedin_done: true
            }

        )
        
        if( linkedInData.profile_pic_url ){
            replicateURLtoStorage(linkedInData.profile_pic_url, primitive._id.toString(), "cc_vf_images")
        }
        if( linkedInData.background_cover_image_url ){
            replicateURLtoStorage(linkedInData.background_cover_image_url, primitive._id.toString() + "-background", "cc_vf_images")
        }

        return linkedInData
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