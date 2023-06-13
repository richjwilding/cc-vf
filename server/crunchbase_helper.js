import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction} from './SharedFunctions'
var ObjectId = require('mongoose').Types.ObjectId;

export async function extractArticlesFromCrunchbase(primitive, options = {}, force = false){

    let data = primitive.crunchbaseData
    if( !options.path || !options.type || !options.referenceId){
        console.log(`Extract failed - params not set`)
        console.log(options)
        return undefined
    }

    if(force || !data ){
        data = await fetchCompanyDataFromCrunchbase(primitive)
        if( data.error ){
            return {error: data.error}
        }
    }
    let articles = data.articles

    if( articles === undefined){
        articles = await fetchCompanyArtcilesFromCrunchbase(primitive, data.id)
        
    }
    if( articles === undefined ){
        return {error: "no_data"}
    }
        if( data.error ){
            return {error: data.error}
        }

    let out = []

    if( articles){
        const id = primitive._id.toString()
        for( const update of articles){
            let full_text
            let extract_error = false

            const newData = {
                workspaceId: primitive.workspaceId,
                paths: ['origin', options.path, `extract.${id}`],
                parent: id,
                data:{
                    type: options.type,
                    referenceId: options.referenceId,
                    title: update.title,
                    referenceParameters:{
                        url: update.url,
                        source:"Crunchbase Profile",
                        fullText: undefined
                    }
                }
            }
            const newPrim = await createPrimitive( newData )
            out.push(newPrim)
        }
    }
    return out
}
export async function fetchCompanyDataFromCrunchbase( primitive ){
    try{

        const targetURL = primitive.referenceParameters.url
        if( targetURL === undefined || targetURL === ""){
            return {error: "no_url"}
        }
        
        const url = `https://api.crunchbase.com/api/v4/searches/organizations`
        console.log(url)
        
        console.log(`Doing Crunchbase query`)
        const response = await fetch(url,{
            method: 'POST',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            },
            body:JSON.stringify({
                "field_ids": [
                    "categories",
                    "description",
                    "name",
                    "short_description",
                  ],
                  "order": [
                    {
                      "field_id": "rank_org",
                      "sort": "asc"
                    }
                  ],
                  "query": [
                    {
                      "type": "predicate",
                      "field_id": "website_url",
                      "operator_id": "domain_eq",
                      "values": [
                        targetURL
                      ]
                    }
                  ],
                  "limit": 10
            })
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data ){
            console.log(data)
            if( data.count > 0){
                const rawData = data.entities[0]
                console.log(rawData)

                const store = {
                    id: rawData.uuid,
                    name: rawData.properties.name,
                    description: rawData.properties.description,
                    short_description: rawData.properties.short_description,
                    categories: rawData.properties.categories?.map((d)=>{return {uuid: d.uuid, value: d.value}})

                }
                primitive.set("crunchbaseData", store)
                primitive.markModified("crunchbaseData")
                await primitive.save()
                return store
            }
            return data
        }else{
            return {error: "no data"}
        }
    }catch(error){
        return {error: error}
    }

    
}
export async function fetchCompanyArtcilesFromCrunchbase( primitive, cbId ){
    try{

        const uuid = cbId || primitive.crunchbaseData?.id
        const query = new URLSearchParams({ 
            "card_ids":["press_references"]
        }).toString()
        
        const url = `https://api.crunchbase.com/api/v4/entities/organizations/${uuid}?${query}`
        console.log(url)
        
        console.log(`Doing Crunchbase query`)
        const response = await fetch(url,{
            method: 'GET',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            }
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data ){
            if( data.cards?.press_references){
                const store = data.cards?.press_references.map((d)=>{
                    return {
                        url: d.url?.value,
                        published: d.publisher,
                        title: d.title,
                        posted_on: d.posted_on
                    }
                })
                primitive.set("crunchbaseData.articles", store)
                primitive.markModified("crunchbaseData.articles")


                await primitive.save()
                return store
            }
        }
        return {error: "no data"}
    }catch(error){
        return {error: error}
    }

    
}