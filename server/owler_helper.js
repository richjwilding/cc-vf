import { findEntityResourceUrl } from "./entity_resource_capability";

export async function enrichEntityFromOwler(primitive){
    const url = await findEntityResourceUrl("owler", { primitive })
    if( url ){
        enqueueBrightdataQuery( "owler", {url})
    }
}


const asyncQueue = {}

export async function runBrightdataQuery(api, data){
    try{

        if( api === "owler"){
            
            const url = `https://api.brightdata.com/datasets/v3/trigger?dataset_id=gd_l1vilaxi10wutoage7`
            
            console.log(`will call ${url} with `, data)
            
            const response = await fetch(url,{
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.BRIGHTDATA_KEY}`,
                     'Content-Type': 'application/json'
                },
                body:JSON.stringify( data)
            })
            try{
                if( response.status !== 200){
                    console.log(`Error from brightdata`)
                    console.log(response)
                    return {error: response}
                }
                const data = await response.json();
                if( data ){
                    console.log(data)
                }
            }catch(error){
                console.log(`Error in runBrightdataQuery ${api}`)
                console.log(error)
            }
        }else{
            throw `Dont know ${api}`
        }
    }catch(error){
        console.log(`Error in runBrightdataQuery ${api} ${data?.length}`)
        console.log(error)
    }
}
export async function enqueueBrightdataQuery(api, data){
    try{

        if( !asyncQueue[api] ){
            asyncQueue[api] = {
                items: []
            }
        }
        if( asyncQueue[api].timer ){
            clearTimeout(asyncQueue[api].timer )
        }
        asyncQueue[api].items.push( data )
        console.log(`BDG ${api} > ${asyncQueue[api].items.length}`)
        
        asyncQueue[api].timer = setTimeout(()=>{
            const data = asyncQueue[api].items
            runBrightdataQuery( api, data)
            
            asyncQueue[api] = {items:[]}
            
        }, 5000)
    }catch(error){
        console.log(`Error in enqueueBrightdataQuery ${api} ${data}`)
        console.log(error)
    }
}