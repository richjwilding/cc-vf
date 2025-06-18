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
export async function queryLinkedInCompanyPostsByRapidAPI( primitive, terms, callopts){

    const individualTerms = terms.split(",").map(d=>{
        let out = d.trim()
        if( out.length === 0){return undefined}
        return out
    }).filter(d=>d)

    if( individualTerms.length === 0){
        return
    }

    console.log(`-- ${individualTerms.join(", ")}`)

    const doQuery = async (term, nextPage, retries = 5 )=>{
        let t = term.trim()

        console.log(term, nextPage)

        const options = {
            method: 'GET',
            url: 'https://linkedin-bulk-data-scraper.p.rapidapi.com/company_updates',
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY,
              'x-rapidapi-host': 'linkedin-bulk-data-scraper.p.rapidapi.com',
              'Content-Type': 'application/json'
            },
            params: {
                company_url: t,
              page: nextPage,
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
    const maxPage = 50
    let total = 0
    

    for( const term of individualTerms){
        if( callopts.countPerTerm ){
            total = 0
        }
        let nextPage = 1
        let exit = false
        do{
            const result = await doQuery(term, nextPage)
            if( result?.success && result?.posts?.length > 0){
                const processItem = async (d)=>{
                    let title = (d.postText.match(/^(.*?[.!?])(?=\s|$)/)?.[1] ?? d.postText)
                    if( title.length > 100 ){
                        const words = title.split(/\s+/)
                        title = ""
                        for(const word of words){
                            title += word + " "
                            if( title.length > 100){
                                break
                            }
                        }
                        if( title === ""){
                            title = words.join(" ").slice(0,100) + "..."
                        }
                    }
                    const data = {
                        title,
                        referenceId: 123,
                        type: "result",
                        referenceParameters:{
                            url: d.postLink,
                            api_source: "rapid_linkedin_post",
                            username: d.actor?.actorName,
                            userProfile: d.actor?.actorLink,
                            imageUrl: d.imageComponent?.[0] ?? d.linkedInVideoComponent?.thumbnail,
                            likes: d.numLikes,
                            source: "LinkedIn",
                            date_posted: d.postedAt,
                            description: d.postText,
                            hashtags: d.postText?.match(/#[A-Za-z0-9_]+/g) ,
                            account_type: "company"
                        }
                    }
                    const newPrim = callopts.createResult( data, true )
                    total++
                }
                await executeConcurrently( result.posts, processItem)
                
                nextPage++
            }else{
                exit = true
            }
            if( total === result.pagination?.total){
                exit = true
            }
            
            if(callopts.extendJob){
                callopts.extendJob()
            }
            if( nextPage >= maxPage ){
                exit = true
            }
        }while( (total < targetCount) && !exit)
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

export async function queryQuoraByRapidAPI(terms, callopts){
    const totalTargetAnswerCount = 200
    const targetAnswerCount = 10
    const targetCommentCount = 30


    async function findQuestions(term, endCursor){
        if( !term){
            return
        }
        const options = {
            method: 'GET',
            url: 'https://quora-scraper.p.rapidapi.com/search_questions',
            params: {
                query: term,
                language: 'en',
                time: 'all_times',
                cursor: endCursor
            },
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY,
              'x-rapidapi-host': 'quora-scraper.p.rapidapi.com'
            }
          };
        return await wrapRequest( options )
    }
    async function processAnswersFromQuestion(question){
        if( !question.url){
            return
        }
        if( !question.answers ){
            return
        }
        const options = {
            method: 'GET',
            url: 'https://quora-scraper.p.rapidapi.com/question_answers',
            params: {
              url: question.url,
              sort: 'upvote_sorted_equiv'
            },
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY,
              'x-rapidapi-host': 'quora-scraper.p.rapidapi.com'
            }
          };
        const answerList = []
        let leave = false
        do{
            leave = true
            const answerData = await wrapRequest( options )
            if( answerData ){
                for(const answer of answerData.data){
                    const {question, author, ...other} = answer
                    answerList.push({
                        authorName: `${author?.name ?? ""} ${author?.surname ?? ""}`,
                        authorProfile: author.url,
                        authorProfileImage: author.profileImage,
                        ...other
                    })
                }
                console.log(`Got ${answerData.data.length} items`)
                if( answerData.pageInfo?.hasNextPage ){
                    leave = false
                    options.params.cursor = answerData.pageInfo.endCursor
                    console.log(`-- Will fetch next page from ${options.params.cursor}`)
                }
            }
        }while(!leave && answerList.length < targetAnswerCount)
        console.log(`Got ${answerList.length} total answers`)
        question.answerData = answerList
        return question
    }
    async function processCommentsForAnswers(answer){
        if( !answer.url || !answer.comments ){
            return
        }
        const options = {
            method: 'GET',
            url: 'https://quora-scraper.p.rapidapi.com/answer_comments',
            params: {
              url: answer.url,
            },
            headers: {
              'x-rapidapi-key': process.env.RAPIDAPI_KEY,
              'x-rapidapi-host': 'quora-scraper.p.rapidapi.com'
            }
          };
        const commentList = []
        let leave = false
        do{
            leave = true
            const commentData = await wrapRequest( options )
            if( commentData ){
                for(const comment of commentData.data){
                    const {author, ...other} = comment
                    commentList.push({
                        authorName: `${author?.name ?? ""} ${author?.surname ?? ""}`,
                        authorProfile: author.url,
                        authorProfileImage: author.profileImage,
                        ...other
                    })
                }
                console.log(`Got ${commentData.data.length} items`)
                //console.log(answerData.data.map(d=>`- ${d.creationTimestamp} ${d.author?.name}`).join("\n"))
                if( commentData.pageInfo?.hasNextPage ){
                    leave = false
                    options.params.cursor = commentData.pageInfo.endCursor
                    console.log(`-- Will fetch next page from ${options.params.cursor}`)
                }
            }
        }while(!leave && commentList.length < targetCommentCount)
        console.log(`Got ${commentList.length} total comments`)
        answer.commentData = commentList
    }
    async function saveQuestion(question, createPrimitive){
        let title = question.title
        if(title.length > 100){
            title = title.split(" ").reduce((a, w) => (a.length + w.length <= 100 ? a + (a ? ' ' : '') + w : a), '');
        }
        const data = {
            title: title,
            type: "result",
            referenceId: 143,
            referenceParameters:{
                "description": question.title,
                "url":question.url,
                "date_posted": question.creationDate,
                "num_followers":question.followers,
                "answers": question.answerData
            }
        }
        return createPrimitive( data, true )
    }
    async function processTerm(term){

        let totalAnswers = 0
        let endCursor
        do{
            console.log(`Querying Quora for ${term} `)
            const questionsData = await findQuestions(term, endCursor)
            if( questionsData ){
                if( questionsData.pageInfo?.hasNextPage ){
                    endCursor = questionsData.pageInfo.endCursor
                    console.log(`-- Will fetch next page of questions from ${endCursor}`)
                }
                const questions = questionsData.data
                console.log(`Got ${questions} in this batch`)
                if( questions ){
                    await executeConcurrently(questions, processAnswersFromQuestion)
                    const thisAnswers = questions.flatMap(d=>d.answerData).filter(d=>d)
                    console.log(`---> Got ${thisAnswers.length} to get comments for`)
                    await executeConcurrently(thisAnswers, processCommentsForAnswers)
                    const thisComments = thisAnswers.flatMap(d=>d.commentData).filter(d=>d)
                    console.log(`---> Got ${thisComments.length} total comments`)
                    totalAnswers += thisAnswers.length
                    console.log(`Have ${totalAnswers} vs target of ${totalTargetAnswerCount}`)
                    if( callopts.createResult){
                        console.log(`-- Saving`)
                        await executeConcurrently(questions, (d)=>saveQuestion(d,callopts.createResult))
                        
                    }
                    
                }else{
                    console.log( questionsData)
                }
            }
        }while(false)
    }
    const individualTerms = terms.split(",").map(d=>{
        let out = d.trim()
        if( out.length === 0){return undefined}
        if( out[0] === "#"){
            //return out.slice(1)
        }
        return out
    }).filter(d=>d)
    for(const term of individualTerms){
        await processTerm(term)
    }
}


async function wrapRequest( options, retryCount = 3 ){
    async function doRequest( retries = retryCount ){
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
                        await new Promise(resolve => setTimeout(resolve, 5000 * (4 - retries)));
                        return await doRequest(retries - 1)
                    }
                } else {
                    console.error(`Error ${error.response.status}: ${error.response.statusText}`);
                }
            } else if (error.request) {
                console.error("No response received:", error.request);
            } else {
                console.error("Error setting up request:", error.message);
            }
        }
    }
    return await doRequest()
}