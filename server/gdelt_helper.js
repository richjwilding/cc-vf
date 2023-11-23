import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction, primitiveOrigin, primitiveChildren, primitiveMetadata} from './SharedFunctions'
import { replicateURLtoStorage, writeTextToFile } from "./google_helper";
import { analyzeListAgainstTopics, analyzeText, analyzeTextAgainstTopics, buildKeywordsFromList } from "./openai_helper";
import { filterEntitiesByTopics } from "./SharedFunctions";
import Parser from "@postlight/parser";

function formatAsGDelt(date) {
    const pad = (number) => number.toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1); // getMonth() returns 0-11
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());

    return `${year}${month}${day}${hour}${minute}${second}`;
}

const convertGdeltTime = (dateString) =>{
    let out = new Date(dateString).getTime()
    if( isNaN(out)){
        const year = parseInt(dateString.substr(0, 4), 10);
        const month = parseInt(dateString.substr(4, 2), 10) - 1;
        const day = parseInt(dateString.substr(6, 2), 10);
        const hours = parseInt(dateString.substr(9, 2), 10);
        const minutes = parseInt(dateString.substr(11, 2), 10);
        const seconds = parseInt(dateString.substr(13, 2), 10);
        out =  new Date(Date.UTC(year, month, day, hours, minutes, seconds)).getTime()
    }
    return out

}

export async function fetchArticlesFromGdelt(keywords, options = {}){
        let count = 0
        let lastEndDate
    const doLookup = async  (term, attempts = 3, endDateTime)=>{
        try{

            console.log(term)

            const excludeList = ["wkrb13.com", "modernreaders.com", "etfdailynews.com", "themarketsdaily.com", "tickerreport.com"]
            
            const excludeEncoded = excludeList.filter(d=>d.length > 15).map(d=>` -domain:${d}`).join("")
            
            const query = { 
                "query": term + " " + excludeEncoded,
                "mode": "artlist",
                "maxrecords": 250,
                "format": "json",
                "sort":"DateDesc"
            }
            if( endDateTime ){
                const endDate = new Date( endDateTime )
                const startDate = new Date( endDateTime )
                startDate.setMonth(startDate.getMonth() - 2);
                query.STARTDATETIME = formatAsGDelt(startDate)
                query.ENDDATETIME = formatAsGDelt(endDate)
            }
            
            const url = `https://api.gdeltproject.org/api/v2/doc/doc?${new URLSearchParams(query).toString() }`
            console.log(url)

            
            console.log(options)
            const response = await fetch(url,{
                method: 'GET',
            });
            
            if( response.status !== 200){
                console.log(`Error from gdelt`)
                console.log(response)
                return {error: response}
            }
            const data = await response.json();
            if( data && Array.isArray(data.articles) ){
                let pending = []
                let articleFilter = []
                for( const article of data.articles){
                    if( count >= options.count ){
                        continue
                    }
                    console.log(`check ${article.url}`)
                    if( excludeList.includes(article.domain) ){
                        continue
                    }
                    if( !article.url ){
                        continue
                    }
                    if( options.existingCheck  ){
                        const exists = await options.existingCheck(article)
                        if( exists ){
                            continue
                        }
                    }

                    console.log(`Fetching text for filter ${article.url}`)
                    try{
                        const result = await Parser.parse(article.url, {
                            contentType: 'text',
                        })
                        if( result?.content){                    
                            article.content = result.content
                            article.description = result.content.split(" ").slice(0,400).join(" ")
                            article.image = result.lead_image_url ?? article.image ?? result.socialimage 
                            article.posted_on = result.date_published ?? convertGdeltTime(article.seendate)
                        }else{
                            continue
                        }
                        if( result.word_count < 50 ){
                            continue
                        }
                        
                    }catch(error){
                        console.log(`Error in fetching text for ${article.url}`)
                        console.log(error)
                    }
                    
                    if( options.filterPre && !(await options.filterPre({text: article.content, term: term})) ){
                        continue
                    }

                    if( options.filterPost && !(await options.filterPost({text: article.content, term: term})) ){
                        continue
                    }

                    const newData = {
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
                    const newPrim = await options.createResult( newData )

                    if( newPrim ){
                        count++
                        await writeTextToFile( newPrim._id.toString(), article.content)
                        if( article.image ){
                            await replicateURLtoStorage(article.image, newPrim._id.toString(), "cc_vf_images")
                        }
                    }
                }
                if( count < options.count ){
                    const dateOfLast = data.articles.slice(-1)[0]?.seendate
                    console.log(`HAVENT FOUND ENOUGH - DOING NEXT PAGE ENDING AT ${dateOfLast}`)
                    if( dateOfLast ){
                        if( lastEndDate !== dateOfLast ){
                            await doLookup( term, attempts, convertGdeltTime(dateOfLast)  )
                        }
                        lastEndDate = dateOfLast
                    }
                }
            }
        }catch(error){
            console.log(`Error in fetchArticlesFromGdelt`)
            console.log(error)
            if( attempts > 0){
                await new Promise(r => setTimeout(r, 2000));                    
                console.log('retry....')
                await doLookup(term, attempts--)
            }
        }
    }


    if(keywords === 'undefined'){
        keywords = undefined
    }
    if( keywords ){

        const set = keywords.split(/,|\sor\s|\sand\s/)
        for(let keyword of set){
            let count = 0
            await doLookup( '"' + keyword.trim() + '"', 0 )
        }
    }
}