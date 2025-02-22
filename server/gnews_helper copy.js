import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction, primitiveOrigin, primitiveChildren, primitiveMetadata} from './SharedFunctions'
import { replicateURLtoStorage, writeTextToFile } from "./google_helper";
import { analyzeListAgainstTopics, analyzeText, analyzeTextAgainstTopics, buildKeywordsFromList } from "./openai_helper";
import { filterEntitiesByTopics } from "./SharedFunctions";



export async function fetchArticlesFromGNews(primitive, options = {}){
    if( !options.resultCategory ){
        console.log(`Error in fetchArticlesFromGNews: no resultCategory`, options)
        return
    }
    let count = 0
    const keywords = options.keywords || primitive.referenceParameters?.topics
    const paths = ['origin']
    const category = await primitiveMetadata( primitive )
    const targetResultSet =  category.resultCategories?.find((d)=>d.resultCategoryId === options.resultCategory)
    if( targetResultSet ){
        paths.push(`results.${targetResultSet.id}`)
    }

    console.log(paths)
    

        
    const doLookup = async  (keywords, page = 1, attempts = 3)=>{
        try{


            const query = new URLSearchParams({ 
                "q": keywords,
                "expand": "content",
                "max": 25,
                "page": page,
                "apikey": process.env.GNEWS_KEY
            }).toString()
            console.log(keywords)
            
            const url = `https://gnews.io/api/v4/search?${query}`
            
            console.log(options)
            const response = await fetch(url,{
                method: 'GET',
            });
            
            if( response.status !== 200){
                console.log(`Error from GNews`)
                console.log(response)
                return {error: response}
            }
            const data = await response.json();
            if( data && Array.isArray(data.articles) ){
                let pending = []
                let articleFilter = []
                for( const article of data.articles){
                    console.log(`check ${article.url}`)
                    if( article.url ){
                        if( articleFilter.includes(article.description) || articleFilter.includes(article.title) ){
                            console.log(`skipping duplicate`)
                            continue
                        }
                        articleFilter.push(article.description)
                        articleFilter.push(article.title)
                        const existing = await Primitive.findOne({
                            "workspaceId": primitive.workspaceId,
                            [`parentPrimitives.${primitive.id}`]: {$in: ['primitives.origin']},
                            deleted: {$exists: false},
                            "referenceParameters.url": article.url
                        })
                        if( existing ){
                            console.log(`Skip - already exists`)
                        }else{
                            pending.push( article )
                        }
                    }
                }
                console.log(`GOT ${pending.length} to consider`)
                pending = await filterEntitiesByTopics( pending, keywords) 
                if( pending ){
                    console.log(`NOW ${pending.length} to add`)
                    for( const article of pending ){
                        const newData = {
                            workspaceId: primitive.workspaceId,
                            parent: primitive.id,
                            paths: paths ,
                            data:{
                                type: "result",
                                referenceId: options.resultCategory,
                                title: article.title,
                                referenceParameters:{
                                    url: article.url,
                                    imageUrl: article.image,
                                    hasImg: article.image ? true : false,
                                    description: article.description,
                                }
                            }
                        }
                        const newPrim = await createPrimitive( newData )
                        if( newPrim ){
                            await writeTextToFile( newPrim._id.toString(), article.content)
                            if( article.image ){
                                await replicateURLtoStorage(article.image, newPrim._id.toString(), "cc_vf_images")
                            }
                        }
                    }
                }
            }
        }catch(error){
            console.log(`Error in fetchArticlesFromGNews`)
            console.log(error)
            if( attempts > 0){
                await new Promise(r => setTimeout(r, 2000));                    
                console.log('retry....')
                await doLookup(keywords, page, attempts--)
            }
        }
    }

    if( keywords ){
        console.log( keywords )
        const set = keywords.split(/,|\sor\s|\sand\s/)
        for(let keyword of set){
            for( let page = 1; page < 4; page++){
                await doLookup( keyword.trim().replaceAll( /\b(\w+-\w+)\b/g, '"$1"'), page )
            }

        }
    }
}