
import { fetchLinksFromWebQuery } from "../google_helper"
import { baseURL, getBaseDomain } from "./SharedTransforms"
import { processPromptOnText } from "../openai_helper"
import { dispatchControlUpdate, getConfig } from "../SharedFunctions"
import { registerAction } from "../action_helper"

registerAction("find_trustpilot_url", {type: "categoryId", id: 29}, async (primitive, action, options, req)=>{
    const url = await findTrustPilotURL( primitive )

    dispatchControlUpdate(primitive.id, "referenceParameters.trustpilot", url)
})
async function findTrustPilotURL(primitive){
    return await findTrustPilotURL({
        title: primitive.title,
        description: primitive.referenceParameters?.description,
        url: primitive.referenceParameters?.url,
        workspaceId: primitive.workspaceId
    })
}


export async function findTrustPilotURLFromDetails({title, description, url, workspaceId}){
    async function doLookup(title, parts, single = true){
        let out = []
        const result = await fetchLinksFromWebQuery(`site:trustpilot.com ${title}`, {count:5, timeFrame: ""})
        if( result?.links ){
            const matchOrder = new Array(parts.length).fill(0).map((d,i)=>parts.slice(0, i + 1).join(" ")).reverse()
            for(const pass of matchOrder ){
                let matches = result.links.filter(d=>(d.title.toLowerCase().match(pass) || d.snippet.toLowerCase().match(pass)))
                for(const match of matches){
                    if( match){
                        if( match.url.includes("trustpilot.com/categories/")){
                            console.log(`Skip category results page`)
                            continue
                        }
                        if( single ){return match}
                        out.push( match )
                    }
                }
            }            
        }
        return out.length > 0 ? out : undefined
    }
    const parts = (title ?? "").toLowerCase().split(" ")  
    let result

    if( url ){
        try{
            if( !url.includes("linkedin.com/company/")){
                const realUrl = new URL(baseURL(url))
                if( realUrl.pathname !== "/"){
                    console.log(`Skipping with path - should have config option for this`)
                }else{
                    const base = getBaseDomain(realUrl.hostname)
                    result = url && await doLookup(base, [base])
                }
            }
        }catch(e){
            console.log(e)
        }
        if( result ){
            try{
                const b = new URL(result.url)
                return b.protocol + "//" + b.hostname + b.pathname
            }catch(e){
                return 
            }
        }
    }
    result = await doLookup( title, parts, false)
    if( result ){

        const filtered = []
        
        let data = result.map((d,i )=>`${i}) ${d.title} . ${d.snippet}`).join("\n")
        const response = await processPromptOnText( `<previews>\n${data}\n</previews>`, {
            workspaceId: workspaceId,
            functionName:"trustpilot_assessurl",
            opener: "Here are a list of search result previews",
            prompt: `Review each item and assess the liklehood that it is about this company: <company>${title}\n${description}</company>\nEsnure you consider and compare the details about what a company does - not just relying on the mention of the name`,
            output: "Provide the result as a json object with an array called 'results' with the following structure: [{id: [id of preview], score: [assessment score on a scale of 1-5 with 1 being very unlikely and 5 being very likely], r: [a 10 word rationale for your score]}]",
            engine: "gpt4o"
        })
        if( response.success){
            const scored = response.output.filter(d=>d.score >= 4).sort((a,b)=>b.score - a.score)
            for(const d of scored){
                try{
                    const b = new URL(result[d.id]?.url)
                    filtered.push(b.protocol + "//" + b.hostname + b.pathname)
                }catch(e){
                    console.log(e)
                    
                }
            }
            return filtered[0]
        }
    }
}