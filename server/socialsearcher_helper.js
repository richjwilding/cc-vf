import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction, primitiveOrigin, primitiveChildren, primitiveMetadata} from './SharedFunctions'
import { replicateURLtoStorage, writeTextToFile } from "./google_helper";
import { filterEntitiesByTopics } from "./SharedFunctions";




export async function fetchPostsFromSocialSeracher(primitive, options = {}){
    if( !options.resultCategory ){
        console.log(`Error in fetchPostsFromSocialSeracher: no resultCategory`, options)
        return
    }
    let count = 0
    const topics = primitive.referenceParameters?.topics || options.keywords
    const keywords = options.keywords || primitive.referenceParameters?.topics
    const paths = ['origin']
    const category = await primitiveMetadata( primitive )
    const targetResultSet =  category.resultCategories?.find((d)=>d.resultCategoryId === options.resultCategory)
    if( targetResultSet ){
        paths.push(`results.${targetResultSet.id}`)
    }

    console.log(paths)
    
    const doLookup = async  (keywords, page = 0, network = "web", attempts = 3)=>{
        let added = 0
        try{
            const query = new URLSearchParams({ 
                "q": keywords,
                "limit": 100,
                "page": page,
                "network": network,
              //  "type": link,
                "key": process.env.SOCIALSEARCHER_KEY
            }).toString()
            console.log(keywords)
            
            const url = `https://api.social-searcher.com/v2/search?${query}`
            
            console.log(options)
            const response = await fetch(url,{
                method: 'GET',
            });
            
            if( response.status !== 200){
                console.log(`Error from SocialSearcher`)
                console.log(response)
                return {error: response}
            }
            const data = await response.json();
            console.log(data)
            debugger
            if( data.meta.http_code === 200 && Array.isArray(data.posts) ){

                let pending = []
                for( const post of data.posts){
                    console.log(`check ${post.url}`)
                    if( post.url ){
                        const existing = await Primitive.findOne({
                            "workspaceId": primitive.workspaceId,
                            [`parentPrimitives.${primitive.id}`]: {$in: ['primitives.origin']},
                            deleted: {$exists: false},
                            "referenceParameters.url": post.url
                        })
                        if( existing ){
                            console.log(`Skip - already exists`)
                        }else{
                            pending.push( post )
                        }
                    }
                }
                console.log(`GOT ${pending.length} to consider`)
                pending = await filterEntitiesByTopics( pending, topics, "text") 
                if( pending ){
                    console.log(`NOW ${pending.length} to add`)
                    for( const post of pending ){
                        const newData = {
                            workspaceId: primitive.workspaceId,
                            parent: primitive.id,
                            paths: paths ,
                            data:{
                                type: "result",
                                referenceId: options.resultCategory,
                                title: post.title ?? post.text,
                                referenceParameters:{
                                    url: post.url,
                                    posted: post.posted,
                                    sentiment: post.sentiment,
                                    imageUrl: post.image,
                                    sourceType: post.type,
                                    userName: post.user?.name,
                                    userURL: post.user?.url,
                                    hasImg: post.image ? true : false,
                                    description: post.text,
                                },
                                socialSearcherData: post
                            },
                        }
                        const newPrim = await createPrimitive( newData )
                        added++
                        if( newPrim ){
                            await writeTextToFile( newPrim._id.toString(), post.content)
                            if( post.image ){
                                await replicateURLtoStorage(post.image, newPrim._id.toString(), "cc_vf_images")
                            }
                        }
                    }
                }
            }
        }catch(error){
            console.log(`Error in fetchPostsFromSocialSeracher`)
            console.log(error)
            if( attempts > 0){
                await new Promise(r => setTimeout(r, 2000));                    
                console.log('retry....')
                await doLookup(keywords, page, network, attempts--)
            }
        }
        return added
    }

    //const sources = ["web", "reddit","youtube","dailymotion", "facebook", "instagram"]
    const sources = ["web", "reddit","youtube","dailymotion"]

    if( keywords ){
        console.log( keywords )
        const set = keywords.split(/,|\sor\s|\sand\s/)
        console.log(`Will run lookup for ${set.length} keywords`)
        for(let keyword of set){
           for( let n of sources){
               for( let page = 0; page < 3; page++){
                   const back = await doLookup( keyword.trim().replaceAll( /\b(\w+-\w+)\b/g, '"$1"').replaceAll( /\b(\w+\s+w+)\b/g, '"$1"'), page, n)
                   console.log(`Page ${page} got ${back}`)
                   if( back > 0){
                       break
                    }
                }
            }
        }
    }
}