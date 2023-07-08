import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction} from './SharedFunctions'
import { replicateURLtoStorage } from "./google_helper";
var ObjectId = require('mongoose').Types.ObjectId;

export async function pivotFromCrunchbase(primitive, options = {}, force = false){
    let data = primitive.crunchbaseData
    let out = []

    if(force || !data ){
        data = await fetchCompanyDataFromCrunchbase(primitive)
        if( data.error ){
            return {error: data.error}
        }
    }

    const categoryList = data.categories

    if( categoryList === undefined ){
        return out
    }
    
    const maxVariants = options.maxVariants || 10
    if( categoryList.length < minMatch ){
        return {error: `Category information is too small or missing`}
    }
      
      function calculateTotalCombinations(n, minK) {
        let totalCombinations = 0;
        
        for (let k = minK; k <= n; k++) {
          totalCombinations += calculateCombination(n, k);
        }
        
        return totalCombinations;
      }
      
      function calculateCombination(n, k) {
        return factorial(n) / (factorial(k) * factorial(n - k));
      }
      
      function factorial(num) {
        if (num === 0 || num === 1) {
          return 1;
        } else {
          let result = 1;
          for (let i = 2; i <= num; i++) {
            result *= i;
          }
          return result;
        }
      }
      
      
    const items = categoryList;

    if( items === undefined ){
        return out
    }

    const minMatch = options.minMatch || 2
    const maxCreation = options.maxCreation || 4
    const maxRuns = options.maxRuns || 100
    console.log(`Minimum set to ${minMatch}`)

    function generateCombinations(items) {
        const combinations = [];
      
        function backtrack(currentCombination, start) {
          if (currentCombination.length >= minMatch) {
            combinations.push([...currentCombination]);
          }
      
          for (let i = start; i < items.length; i++) {
            currentCombination.push(items[i]);
            backtrack(currentCombination, i + 1);
            currentCombination.pop();
          }
        }
      
        backtrack([], 0);
      
        return combinations;
      }


      async function doLookup(categoryList){
        const url = `https://api.crunchbase.com/api/v4/searches/organizations`
        console.log(url)
        
        const options = JSON.stringify(
            {
                "field_ids": [
                  "identifier",
                  "categories",
                  "location_identifiers",
                  "short_description",
                  "website_url",
                  "image_url",
                  "name",
                  "description",
                  "rank_org"

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
                    "field_id": "categories",
                    "operator_id": "includes_all",
                    "values": categoryList.map((d)=>d.uuid)
                  }
                ],
                "limit": 50
        })
        console.log(`Doing Crunchbase query`)
        console.log(options)
        const response = await fetch(url,{
            method: 'POST',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            },
            body:options
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data ){
//            console.log(`-- got ${data.count} back`)
            if( data.entities ){
                for( const entity of data.entities){
                    if( out.length < maxCreation){

                        const properties = entity.properties
                        const url = properties.website_url.replace(/^(https?:\/\/)?([^\/]+)\/?$/, "$2");
                        const existing = await Primitive.findOne({
                            "workspaceId": primitive.workspaceId,
                            "referenceParameters.url": {$in: [
                                url,
                                `https://${url}`,
                                `https://${url}/`,
                                `http://${url}`,
                                `http://${url}/`]}
                        })
                        if( existing ){
//                            console.log(`-- SKIP for ${properties.name}`)
                        }else{
  //                          console.log(`-- creating entry for ${properties.name}`)
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
                                        title: properties.name,
                                        referenceParameters:{
                                            url: properties.website_url,
                                            hasImg: properties.image_url,
                                            description: properties.description
                                        }
                                    }
                                }
                                const newPrim = await createPrimitive( newData )
                                if( newPrim ){

                                    const store = {
                                        id: entity.uuid,
                                        name: entity.properties.name,
                                        description: entity.properties.description,
                                        short_description: entity.properties.short_description,
                                        image_url:entity.properties.image_url,
                                        website_url: entity.properties.website_url,
                                        categories: entity.properties.categories?.map((d)=>{return {uuid: d.uuid, value: d.value}})
                                        
                                    }
                                    newPrim.set("crunchbaseData", store)
                                    newPrim.markModified("crunchbaseData")
                                    await newPrim.save()
                                    if( properties.image_url ){
                                        replicateURLtoStorage(entity.properties.image_url, newPrim._id.toString(), "cc_vf_images")
                                    }
                                    out.push(newPrim)
                                }
                            }
                        }
                    }
                }
            }
        }

      }

    let runs = 0

    let threshold = items.length > 5 ? parseInt( items.length * 0.66) : items.length
    for(const combo of generateCombinations(items).sort((a,b)=>b.length - a.length)){
        if( out.length >= maxCreation || runs > maxRuns ){
            break
        }
        if( combo.length > threshold){
            console.log(`skipping - ${combo.length} items of ${items.length}`)
            continue
        }
        console.log(`Run ${runs} (${out.length} created - got ${combo.length} categories`)
        await doLookup( combo )
        runs++
    }
    return out


}
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
            if( newPrim ){
                out.push(newPrim)
            }
        }
    }
    console.log(`created ${out.length} articles`)
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
                    "image_url",
                    "website_url",
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
                    website_url: rawData.properties.website_url,
                    image_url:rawData.properties.image_url,
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