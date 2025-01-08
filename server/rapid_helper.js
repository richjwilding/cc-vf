import axios from 'axios';
import moment from 'moment';
import { fetchInstagramPosts } from './brightdata';

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

/*

        
        let url = `https://instagram243.p.rapidapi.com/tagposts_recent/${encodeURIComponent(t)}/${cursor}/${page}`
        
        const options = {
            method: 'GET',
            url,
            headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'instagram243.p.rapidapi.com'
            }
        };*/

        const options = {
            method: 'GET',
            url: 'https://instagram-realtimeapi.p.rapidapi.com/instagram/search',
            params: {
                query: t,
            },
            headers: {
              'x-rapidapi-key': '0afe947a64msh3817e76fec4702fp14cee9jsn34b15b8e9397',
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