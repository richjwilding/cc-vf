import { executeConcurrently } from "./SharedFunctions"

/*
export async function fetchLinksFromWebDDGQuery(query, withNextPage = false, attempt = 3){
    console.log(`go`)
    try{
        let qp = `q=${query}`
        if( withNextPage instanceof Object  ){
            qp = new URLSearchParams(withNextPage).toString()
        }
        console.log(qp)
            const bUrl = `https://chrome.browserless.io/scrape?token=${process.env.BROWSERLESS_KEY}`
            const response = await fetch(bUrl,{
                method: 'POST',
                headers: { 
                    'Cache-Control': 'no-cache' ,
                    'Content-Type': 'application/json' 
                },
                body:JSON.stringify({
                    "url": `https://html.duckduckgo.com/html/?${qp}`,
                    "elements": [
                    {
                        "selector": ".result__body > .result__title",
                    },
                    {
                        "selector": ".result__body > .result__extras > .result__extras__url > .result__url"
                    },
                    {
                        "selector": ".result__body > .result__snippet"
                    },
                        {
                            "selector": '.nav-link > form > [type="hidden"]'
                        }
                    ]
                })
            })

        const results = await response.json();
        if( results && results.data?.[0]?.results){
            const links = results.data[0].results.map((d, idx)=>{
                    return {
                        title: d.text,
                        snippet: results.data?.[2]?.results?.[idx]?.text?.trim(),
                        url: "https://" + results.data?.[1]?.results?.[idx]?.text?.trim()
                    }
                })
                if( links.length === 0){
                    console.log("GOT NO RESULTS")
                    console.log(results)
                    if( attempt > 0){
                        console.log("retry")
                        return await  fetchLinksFromWebQuery(query, withNextPage, attempt--) 
                    }
                }
            if( withNextPage ){
                const attributes = results.data?.[3]?.results?.map(d=>d.attributes)
                const query = attributes.reduce((a,c)=>{
                    a[c.find(d=>d.name === "name")?.value] = c.find(d=>d.name === "value")?.value
                    return a
                }, {})
                return {
                    nextPageQuery: query,
                    links: links
                }
            }else{
                return links
            }
        }
        return []
    }catch(error){
        console.log(`Error in fetchLinksFromQebQuery`)
        console.log(error)
    }
    return undefined
}*/
export async function fetchLinksFromWebDDGQuery(query, options , attempts = 3){
    try{
        

        const params = { 
            "api_key": process.env.SERPAPI_KEY,
            "q": query,
            engine: "duckduckgo"
        }
        if( options.page ){
            params.start = options.page
        }
        if( options.timeFrame ){
            params.time_period = options.timeFrame
        }
        
        const url = `https://serpapi.com/search?${new URLSearchParams(params).toString() }`
        console.log(url)
        
        const response = await fetch(url,{
            method: 'GET',
        });
        
        if( response.status !== 200){
            console.log(`Error from serpapi`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data?.organic_results ){
            let source = data.organic_results
            
            const mapped = source?.map(d=>{
                return {
                    title: d.title,
                    url: d.link,
                    snippet: d.snippet
                }
            })
            console.log(mapped)

            const offset = data.serpapi_pagination?.next?.match(/start=(\d+)/)?.[1]
            const next = isNaN(offset) ? undefined : parseInt(offset) + (options.page ?? 0)
            return {
                links: mapped,
                nextPage: next
            }

        }
    }catch(error){
        console.log(`Error in fetchLinksFromWebQuery`)
        console.log(error)
        if( attempts > 0){
            await new Promise(r => setTimeout(r, 2000));                    
            console.log(`retry....${attempts}`)
            await fetchLinksFromWebQuery(query, options, attempts - 1)
        }
    }
    
}