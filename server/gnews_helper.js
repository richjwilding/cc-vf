import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction, primitiveOrigin, primitiveChildren, primitiveMetadata} from './SharedFunctions'
import { replicateURLtoStorage, writeTextToFile } from "./google_helper";
import { analyzeListAgainstTopics, analyzeText, analyzeTextAgainstTopics, buildKeywordsFromList } from "./openai_helper";
import { filterEntitiesByTopics } from "./SharedFunctions";
import Parser from "@postlight/parser";



export async function fetchArticlesFromGNews(primitive, options = {}){
    if( !options.resultCategory ){
        console.log(`Error in fetchArticlesFromGNews: no resultCategory`, options)
        return
    }
    let count = 0
    const topics = primitive.referenceParameters?.topics
    let keywords = options.keywords
    const paths = ['origin']
    const category = await primitiveMetadata( primitive )
    const targetResultSet =  category.resultCategories?.find((d)=>d.resultCategoryId === options.resultCategory)
    if( targetResultSet ){
        paths.push(`results.${targetResultSet.id}`)
    }

    console.log(paths)
    

        
    const doLookup = async  (keywords, attempts = 3)=>{
        try{

            console.log(keywords)

            const excludeList = ["wkrb13.com", "modernreaders.com", "etfdailynews.com", "themarketsdaily.com", "tickerreport.com"]
            
            const excludeEncoded = excludeList.filter(d=>d.length > 15).map(d=>` -domain:${d}`).join("")
            
            const query = new URLSearchParams({ 
                "query": keywords + " " + excludeEncoded,
                "mode": "artlist",
                "maxrecords": 250,
                "format": "json",
            }).toString() 
            
            const url = `https://api.gdeltproject.org/api/v2/doc/doc?${query}`
            console.log(url)

            
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
                    if( excludeList.includes(article.domain) ){
                        console.log(`SKIPPING ${article.domain}}`)
                        continue
                    }
                    if( article.url ){
                        if( articleFilter.includes(article.title) ){
                            console.log(`skipping duplicate`)
                            continue
                        }
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
                for(const article of pending ){
                    console.log(`Fetching text for filter ${article.url}`)
                    try{
                        const result = await Parser.parse(article.url, {
                            contentType: 'text',
                        })
                        if( result?.content){                    
                            article.content = result.content
                            article.description = result.content.split(" ").slice(0,400).join(" ")
                            article.image = result.lead_image_url ?? article.image ?? result.socialimage 
                            article.posted_on = result.date_published ?? article.seendate
                        }else{
                            article.skip = true
                        }
                        if( result.word_count < 50 ){
                            article.skip = true
                            console.log(`ARTICLE TOO SHORT TO BE INTERESTING`)
                        }
                        
                    }catch(error){
                        console.log(`Error in fetching text for ${article.url}`)
                        console.log(error)
                    }
                }
                pending = pending.filter(d=>!d.skip)
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
                                    source: article.domain,
                                    description: article.description,
                                    posted: article.posted_on
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
                await doLookup(keywords, attempts--)
            }
        }
    }

    //const topicTerm = topics ? " (" + topics.split(/,|\sor\s|\sand\s/).map(d=>(d ?? "").trim()).filter(d=>d).map(d=>`"${d}"`).join(" OR ") + ")" : ""

    if( keywords || topics){
        if(keywords === 'undefined'){
            keywords = undefined
        }
        console.log( keywords )
        const topicList = topics.split(/,|\sor\s|\sand\s/).map(d=>(d ?? "").trim()).filter(d=>d).map(d=>`"${d}"`)
        for( const topic of topicList ){
            if( keywords ){

                const set = keywords.split(/,|\sor\s|\sand\s/)
                for(let keyword of set){
                    //await doLookup( keyword.trim().replace(/\b(\w+-\w+(?:-\w+)*)\b/g, '"$1"')+ " " + topic, 0 )
                    await doLookup( '"' + keyword.trim() + '" ' + topic, 0 )
                }
            }else{
                    await doLookup( topic, 0 )
            }
        }
    }
}