import axios from 'axios';
import moment from 'moment';
import { fetchInstagramPosts } from './brightdata';

export async function queryInstagramPostsByRapidAPI( primitive, terms, callopts){
    const individualTerms = terms.split(",").map(d=>{
        let out = d.trim()
        if( out.length === 0){return undefined}
        if( out[0] === "#"){
            return out.slice(1)
        }
        return out
    }).filter(d=>d)

    if( individualTerms.length === 0){
        return
    }

    console.log(`-- ${individualTerms.join(", ")}`)

    const doQuery = async (term, cursor = "%7Bend_cursor%7D", page = "%7Bnext_page%7D")=>{
        let t = term.trim().toLowerCase()

        let url = `https://instagram243.p.rapidapi.com/tagposts_recent/${encodeURIComponent(t)}/${cursor}/${page}`
        console.log(term, cursor, page)
        
        const options = {
            method: 'GET',
            url,
            headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'instagram243.p.rapidapi.com'
            }
        };
        
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
    for( const term of individualTerms){
        total = 0
        let cursor, nextPage
        let exit = false
        do{
            const result = await doQuery(term, cursor, nextPage)
            if( result && result.status === "success"){
                const posts = result.data.recent_posts
                
                for(const d of posts){
                    if(d.code){
                        const date = moment(new Date( d.caption?.created_at * 1000 ))
                        if( start_date ){
                            if( date.diff(start_date) < 0){
                                console.log(`Post posted too early ${date.toString()}  < ${start_date.toString()}`)
                                exit = true
                                break
                            }
                            
                        }
                        urls.push( `https://www.instagram.com/p/${d.code}`)
                        total++
                        console.log(` - Got post ${d.code} (${total} of ${targetCount})`)
                    }
                }
                if( result.data.more_available){
                    console.log(`More results available ${total} vs ${targetCount} fetched`)
                    if( total < targetCount ){
                        cursor = result.data.end_cursor
                        nextPage = result.data.next_page
                        console.log("Will try next page")
                    }
                }else{
                    exit = true
                }
            }else{
                exit = true
            }
            
        }while( (total < targetCount) && !exit)
    }
   
    console.log( urls )
    if(urls.length > 0){
        console.log(`Now fetching`)
        await fetchInstagramPosts( primitive, urls )
    }
    
}