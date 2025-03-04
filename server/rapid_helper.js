import axios from 'axios';
import moment from 'moment';
import { fetchInstagramPosts } from './brightdata';
import { executeConcurrently } from './SharedFunctions';

export async function queryInstagramPostsByRapidAPI( primitive, terms, callopts){
    const individualTerms = terms.split(",").map(d=>{
        let out = d.trim()
        if( out.length === 0){return undefined}
        if( out[0] === "#"){
            //return out.slice(1)
        }
        return out
    }).filter(d=>d)

    if( individualTerms.length === 0){
        return
    }

    console.log(`-- ${individualTerms.join(", ")}`)

    const doQuery = async (term, nextPage )=>{//}= "%7Bend_cursor%7D", page = "%7Bnext_page%7D")=>{
        let t = term.trim().toLowerCase()

        console.log(term, nextPage)

        const options = {
            method: 'GET',
            url: 'https://instagram-realtimeapi.p.rapidapi.com/instagram/search',
            params: {
                query: t,
            },
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'instagram-realtimeapi.p.rapidapi.com'
            }
          };

        if( nextPage ){
            options.params = {
                ...options.params,
                ...nextPage
            }
        }
        console.log(options)
        
        try {
            const response = await axios.request(options);
            console.log("back")
            return response.data
        } catch (error) {
            console.log(`Error`)
            console.error(error);
        }
        return
    }

    const targetCount = callopts.count
    
    let urls = []

    const today = moment()
    let start_date
    if( callopts.timeFrame === "last_year"){
        start_date = today.subtract(1, "year")
    }else if( callopts.timeFrame === "last_month"){
        start_date = today.subtract(1, "month")
    }else if( callopts.timeFrame === "last_week"){
        start_date = today.subtract(1, "week")
    }
    let total = 0
    let emptyCountMax = 5
    let emptyCount = emptyCountMax
    for( const term of individualTerms){
        total = 0
        let cursor, nextPage
        let exit = false
        do{
            let doDelay = false
            const result = await doQuery(term, nextPage)
            if( result && result.media_grid){

                //temp1.media_grid.sections[0].layout_content.one_by_two_item.clips.items.map(d=>({code:d.media.code, caption: d.media.caption}))

                //const posts = result.data.items
                const posts = result.media_grid.sections.map(d=>[d.layout_content?.one_by_two_item?.clips?.items.map(d=>({code:d.media.code, caption: d.media.caption})), d.layout_content?.fill_items?.map(d=>({code:d.media.code, caption:d.media.caption}))]).flat(Infinity).filter(d=>d)

                let countThisTime = 0
                
                for(const d of posts){
                    if(d.code){
                        if( d.caption?.created_at ){
                            const date = moment(new Date( d.caption?.created_at * 1000 ))
                            if( start_date ){
                                if( date.diff(start_date) < 0){
                                    console.log(`Post posted too early ${date.toString()}  < ${start_date.toString()}`)
                                    exit = true
                                    break
                                }
                                
                            }
                        }
                        const url = `https://www.instagram.com/p/${d.code}`
                        if( !urls.includes(url )){
                            urls.push( url )
                            total++
                            countThisTime++
                            emptyCount = emptyCountMax
                            console.log(` - Got post ${d.code} (${total} of ${targetCount})`)
                        }else{
                            console.log(`Got duplicate`)
                            doDelay = true
                        }
                    }
                }
                if( countThisTime === 0){
                    emptyCount--
                    console.log(`Didnt get any new items, will check ${emptyCount} more pages`)
                    if( emptyCount === 0){
                        exit = true
                    }
                }
                if( !exit && (result.media_grid.rank_token || result.media_grid.reels_max_id || result.media_grid.next_max_id)){
                    console.log(`More results available ${total} vs ${targetCount} fetched`)
                    if( total < targetCount ){
                        nextPage = {
                            rank_token: result.media_grid.rank_token,
                            reels_max_id: result.media_grid.reels_max_id,
                            next_max_id: result.media_grid.next_max_id
                        }
                        console.log("Will try next page")
                        if( doDelay ){
                            console.log("delay before next page")
                            await new Promise(resolve => setTimeout(resolve, 8000));
                        }
                    }
                }else{
                    exit = true
                }
            }else{
                exit = true
            }
            
            if(callopts.extendJob){
                callopts.extendJob()
            }
        }while( (total < targetCount) && !exit)
    }
   
    console.log( urls )
    if(urls.length > 0){
        console.log(`Now fetching`)
        await fetchInstagramPosts( primitive, urls )
    }
    
}
export async function queryLinkedInCompaniesByRapidAPI( primitive, terms, callopts){

    const individualTerms = terms.split(",").map(d=>{
        let out = d.trim()
        if( out.length === 0){return undefined}
        if( out[0] === "#"){
            //return out.slice(1)
        }
        return out
    }).filter(d=>d)

    if( individualTerms.length === 0){
        return
    }

    async function fetchItems(urls){
        console.log(`Now fetching`)
        const batchData = []
        const batchSize = 25
        for(let idx = 0; idx <= urls.length; idx += batchSize)
        {
            const thisBatch = urls.slice(idx, idx + batchSize)

            const options = {
                method: 'POST',
                url: 'https://linkedin-bulk-data-scraper.p.rapidapi.com/companies',
                headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                  'x-rapidapi-host': 'linkedin-bulk-data-scraper.p.rapidapi.com',
                  'Content-Type': 'application/json',
                //  'x-rapidapi-user': 'usama'
                },
                data: {
                  links: thisBatch
                }
            };
    
            console.log(options)
            
            try {
                const response = await axios.request(options);
                const results = response.data
                if( results?.success && results?.data){
                    for(const outer of results.data){
                        const d = outer.data
                        if( d ){
                            const data = {
                                title: d.companyName,
                                type: "entity",
                                referenceParameters:{
                                    description: d.description,
                                    url: d. websiteUrl,
                                    employee_count: d.employeeCount,
                                    location: d.headquarter?.country
                                }
                            }
                            const newPrim = callopts.createResult( data, true )
                        }
                    }
                }
            } catch (error) {
                console.log(`Error`)
                console.error(error);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

    }

    console.log(`-- ${individualTerms.join(", ")}`)

    const doQuery = async (term, nextPage, retries = 5 )=>{//}= "%7Bend_cursor%7D", page = "%7Bnext_page%7D")=>{
        let t = term.trim().toLowerCase()

        console.log(term, nextPage)

        const options = {
            method: 'POST',
            url: 'https://linkedin-bulk-data-scraper.p.rapidapi.com/search_company_with_filters',
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY,
              'x-rapidapi-host': 'linkedin-bulk-data-scraper.p.rapidapi.com',
              'Content-Type': 'application/json'
            },
            data: {
              keyword: t,
              page: nextPage,
              company_size_list: '',
              hasJobs: false,
              location_list: '',//103644278',
              industry_list: ''
            }
          };

        console.log(options)
        
        try {
            const response = await axios.request(options);
            console.log("back")
            return response.data
        } catch (error) {
            if (error.response) {
                if (error.response.status === 429) {
                    console.error("----------------------------\n----------------------------\nError 429: Too Many Requests - hit rate limit.");
                    if(retries > 0){
                        console.log(`Will retry`)
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        return await doQuery(term, nextPage, retries - 1)
                    }
                    // Add any retry logic or handling code here
                } else {
                    console.error(`Error ${error.response.status}: ${error.response.statusText}`);
                }
            } else if (error.request) {
                console.error("No response received:", error.request);
            } else {
                console.error("Error setting up request:", error.message);
            }
        }
        return
    }

    const targetCount = callopts.count
    
    let urls = []

    const emptyMax = 5
    const maxPage = 50
    let total = 0, empty = 0, scanned = 0, allTerms = 0

    for( const term of individualTerms){
        if( callopts.countPerTerm ){
            total = 0
        }
        let nextPage = 1
        let exit = false
        do{
            const result = await doQuery(term, nextPage)
            if( result?.success && result?.data?.length > 0){
                let someAdded = false
                const processItem = async (d)=>{
                    if( d.companyName && d.summary){
                        scanned++
                        const check = d.companyName + "\n" + d.primarySubtitle + "\n" + d.summary
                        if( callopts.progressUpdate){
                            await callopts.progressUpdate({totalCount: allTerms + 1, scanned: scanned, term: term})
                        }
                        if( callopts.filterPre && !(await callopts.filterPre({text: check, term: term})) ){
                            return
                        }
                        total++
                        allTerms++
                        urls.push( d.navigationUrl )
                        someAdded = true
                    }else{
                        console.log(`---- Skip EMPTY`)
                        console.log(d)
                    }
                }
                await executeConcurrently( result.data, processItem)
                
                if( someAdded ){
                    empty = 0
                }else{
                    if(empty >= emptyMax ){
                        console.log(`Havent found any matches after ${emptyMax} pages - bailing`)
                        exit = true
                    }
                }
                nextPage++
            }else{
                exit = true
            }
            
            if(callopts.extendJob){
                callopts.extendJob()
            }
            if( nextPage >= maxPage ){
                exit = true
            }
            if( urls.length > 20 ){
                await fetchItems(urls)
                urls = []
            }
        }while( (total < targetCount) && !exit)
    }
   
    console.log( urls )
    if(urls.length > 0){
        await fetchItems(urls)
    }
    
}
