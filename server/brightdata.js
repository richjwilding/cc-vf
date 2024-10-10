import { HttpsProxyAgent } from "https-proxy-agent";
import http from "http"
import axios from 'axios';


export async function fetchViaBrightDataProxy(url, options = {}) {
    try{

        // Parse the URL to determine if it's HTTP or HTTPS
        const parsedUrl = new URL(url);
        const proxyUrl = options.proxy ?? process.env.BRIGHTDATA_DC_PROXY
        const parsedProxy = new URL(proxyUrl);


        if( options.useAxios ){
            const response = await axios.get(url, { 
                proxy:{
                    host: parsedProxy.hostname,
                    port: parsedProxy.port,
                    auth: {
                        username: parsedProxy.username,
                        password: parsedProxy.password,
                    },
                    protocol: parsedProxy.protocol,
                }
            });
            return response.data
        }
            
        let agent;

        // Choose the correct proxy agent based on protocol
        if (parsedUrl.protocol === 'https:') {
            agent = new HttpsProxyAgent(proxyUrl);
        } else if (parsedUrl.protocol === 'http:') {
            agent = new http.Agent({
                host: parsedProxy.hostname,
                port: parsedProxy.port
            });
        } else {
            throw new Error('Unsupported protocol');
        }


        const timeout = options.timeout || 30000; // Default timeout of 5 seconds
        const controller = new AbortController(); // Create an AbortController
        const timeoutId = setTimeout(() => {
            controller.abort(); // Abort the fetch request after timeout
        }, timeout);

        const response = await fetch(url, { 
                                            agent,
                                            signal: controller.signal
                                        });
        clearTimeout(timeoutId);
        return response
    }
    catch(error){
        if (error.name === 'AbortError') {
            console.error(`Fetch request timed out after ${options.timeout || 30000}ms`);
        } else {
            console.log(`Error in fetchViaBrightDataProxy`)
            console.log(error)
        }
        return {status: 500} 
    }
}
//BRIGHTDATA_SERP
export async function fetchSERPViaBrightData( query, options = {}){
    const PER_PAGE = 20


    const time = {
        "last_week": "qdr:w",
        "last_month": "qdr:m",
        "last_year": "qdr:y",
        "none": undefined
    }

    const bdParams = {
        q: query,
        tbm: {
            "news": "nws",
            "shopping": "shop",
            "tmb": "isch",
            "videos": "vid",
        }[options.search_type],
        num: PER_PAGE,
        start: (options.page - 1) * PER_PAGE,
        gl: options. gl,
        tbs: time[options.time_period],
        brd_json:1
    }

    console.log(bdParams)
    for( const k of Object.keys(bdParams)){
        if( bdParams[k] === undefined ){
            delete bdParams[k]
        }
    }

    const bdUrl = `https://www.google.com/search?${new URLSearchParams(bdParams).toString() }`

    const response = await fetchViaBrightDataProxy( bdUrl, {proxy: process.env.BRIGHTDATA_SERP, useAxios: true})

    const general = response.general
    const pagination = response.pagination

    if( general?.results_cnt === 0 ){
        console.log(`NO RESULTS`)
        return {}
    }

    const mapped = {
        nextPage: pagination?.next_page
    }
    if( options.search_type === "news"){
        mapped.links = response.news?.map(d=>({
            title: d.title,
            url: d.link,
            source: d.source,
            snippet: d.description,
            image: d.source_logo
        }))
    }else{
        mapped.links = response.organic?.map(d=>({
            title: d.title,
            url: d.link,
            snippet: d.description,
            image: d.image
        }))

    }

    return mapped

}