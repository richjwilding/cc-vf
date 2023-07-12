import {Configuration, OpenAIApi} from "openai"
import {encode, decode} from 'gpt-3-encoder'

export async function summarizeMultiple(list, options = {} ){
    if(options.asList){
        return await summarizeMultipleAsList(list, options)
    }    

    let listIntro = `Here are a list of ${options.types || "items"}: `

    const interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": listIntro}],
            [
                {"role": "user", "content":  options.prompt ? options.prompt.replaceAll("{title}", options.title) : `Produce a single summary covering all ${options.types || "items"} ${options.themes ? `in terms of ${[options.themes].flat().join(", ")}` : ""}.`},
                {"role": "user", "content": `Provide the result as a json object with a single field called 'summary' with conatins "a string with your summary. Do not put anything other than the raw json object in the response .`},
            ],
            {field: "summary", temperature: 0.3})


    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    console.log(interim)

    let final = []

    if( interim.length > 1 ){
        const result = await processInChunk( interim, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `Here is a list of summaries:`}],
            [
                {"role": "user", "content":  options.aggregatePrompt ?  options.aggregatePrompt.replaceAll("{title}", options.title) : `Rationalize these summaries into a single summary.`                    
                            },
                {"role": "user", "content": `Provide the result as a json object with an single field called 'summary' with conatins a string with your summary. Do not put anything other than the raw json object in the response .`},
            ],
            {field: "summary", temperature: 0.3})

        if( Object.hasOwn(result, "success")){
            return result
        }else{
            final = result
        }
        console.log(`done`)
        console.log(final)

        return {success: true, summary: final[0], interim: interim}
    }
    return {success: true, summary: interim[0]}

}
export async function summarizeMultipleAsList(list, options = {} ){

    let listIntro = `Here are a list of ${options.types || "items"}: `

    const interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": listIntro}],
            [
                {"role": "user", "content":  options.prompt ? options.prompt.replaceAll("{title}", options.title) : `Produce a single summary covering all ${options.types || "items"} ${options.themes ? `in terms of ${[options.themes].flat().join(", ")}` : ""}.`},
                {"role": "user", "content": `Provide the result as a json object with a single field called 'summary' with conatins an array of results with each entry being an object with  two fields - 1) a field called 'summary' with your summary and 2) a separate field called 'ids' containing an array with the numbers of the original problem statements contritbuting to the summary. Do not put anything other than the raw json object in the response .`},
            ],
            {field: "summary", temperature: 0.3})


    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    console.log(interim)

    let final = []

    if( interim.length > (options.asList || 1) ){
        const result = await processInChunk( interim.map((d)=>d.summary), 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `Here is a list of summaries:`}],
            [
                {"role": "user", "content":  options.aggregatePrompt ?  options.aggregatePrompt.replaceAll("{title}", options.title) : `Rationalize these summaries into ${options.asList} new summaries, or as close to that number as possible, such that all similar summaries are grouped together`},
                {"role": "user", "content": `Provide the result as a json object with an single field called 'summary' with conatins an array of new summaries with each entry bein an object with a field called 'summary' with your summary and a field called 'ids' containing an array with wth the numbers of the original summaries you have merged. Do not put anything other than the raw json object in the response .`},
            ],
            {field: "summary", temperature: 0.3})

        if( Object.hasOwn(result, "success")){
            return result
        }else{
            final = result
        }
        console.log(`done`)
        console.log(final)

        return {success: true, summary: options.asList ? final : final[0], interim: interim}
    }
    return {success: true, summary: options.asList ? interim : interim[0]}

}
export async function buildCategories(list, options = {} ){
    let theme = options.themes
    if( theme === ""){
        theme = undefined
    }
    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `Here are a list of numbered ${options.types || "items"}: `}],
            [
                options.themes 
                    ? {"role": "user", "content": `Summarize the ${options.themes} of each item in no more than 3 words`}
                    : {"role": "user", "content": `Categorize each item into one of no more than ${options.count || 10} categories which covers the full list. Each category should be no more than 3 words.`},
                options.themes 
                    ? {"role": "user", "content": `Provide the result as a json object with an array called "summaries" with each  summary as a string. Do not put anything other than the raw json object in the response .`}
                    : {"role": "user", "content": `Provide the result as a json object with an array called "categories" with each entry being a string containing the category. Do not put anything other than the raw json object in the response .`},
            ],
            {field: options.themes ? "summaries" : "categories", temperature: 0.3})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }

    if( options.themes){
        console.log(`Have ${interim.length} items `)
        console.log(interim)
        interim = interim.filter((d,idx,a)=>a.indexOf(d)===idx)
        console.log(`---- ${interim.length} items `)
    }


    let final = []

    if( interim.length > 0){

        const result = await processInChunk( interim, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `Here is a list of categories: `}],
            [
                {"role": "user", "content": `Rationalize this list into no more than ${options.count  || 10} items. Each category should be no more than 3 words.`},
                {"role": "user", "content": `Provide the result as a json object  with an array of categories with each entry being a string containing the category. Do not put anything other than the raw json object in the response.`},
            ],
            {field: "categories", temperature: 0.3})

        if( Object.hasOwn(result, "success")){
            return result
        }else{
            final = result
        }

    }

    return {success: true, categories: final, interim: interim}
}
export async function analyzeTextAgainstTopics( text, topics, options = {}){
    if( !text || text === ""){return {success:false}}
    const list = text.split(`\n`)
    const single = topics.split(",").length > 1 
    const type = options.type || "description"
    
    let opener = `Here is a ${type}: `
    let prompt =  options.prompt || `Determine how strongly the ${type} relates to ${single ? "the topic of" : "one or more of the following topics:"} ${topics}. Use one of the following assessment scores: "strongly", "clearly","somewhat", "hardly", "not at all"`

    const interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": `Provide the result as a json object with a single field called 'result' containing your assessment.`}

            ],
            {field: "result", temperature: 0.3, no_num: true})
    return {success: true, output: interim[0]}
}

export async function processPromptOnText( text, options = {}){
    if( !text || text === ""){return {success:false}}
    const list = text.split(`\n`)
    const type = options.type || "document"
    const extractType = options.extractNoun || "problem"
    const transformPrompt = options.transformPrompt || "" 
    let opener = `Here is a ${type}: `
    let prompt =  options.prompt || `Extract a series of ${extractType}s referred to in the ${type}.  Do not create ${extractType}s that are not mentioned in the ${type}`
    if( options.title ){
        opener = opener.replace('{title}', options.title)
        prompt = prompt.replace('{title}', options.title)
    }

    const interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": `Provide the result as a json object  with an array called results. Each entry in the array must have a \"quote\" field containing the original text and a \"${extractType}\" field containing the ${extractType} you identify ${transformPrompt}. If there is are no ${extractType}s then set the results field to an empty array.`}

            ],
            {field: "results", temperature: 0.3, no_num: true, debug:true, debug_content: false})
    return {success: true, output: interim}
}


async function processInChunk( list, pre, post, options = {} ){

    const field = options.field || "answer"

    const maxTokens = options.maxTokens || 12000
    const fullContent = list.map((d, idx)=>{
        const start = options.no_num ? "" : `${idx}). `
        return `${start}${(d instanceof Object ? d.content : d).replaceAll('\n'," ")}`
    })
    const maxIdx = fullContent.length - 1
    let interim = []
    let startIdx = 0
    let endIdx = startIdx

    let content = ""
    let currentCount = 0

    do{
        let leave
        do{
            leave = true
            let text = fullContent[endIdx] + "\n"
            let thisTokens = encode( text ).length
            if( ( thisTokens + currentCount ) < maxTokens ){
                leave = false
                content += text
                currentCount += thisTokens
                endIdx++
            }
        }while(!leave && endIdx <= maxIdx)
            endIdx--

        console.log(`Sending ${startIdx} -> ${endIdx} (${currentCount})`)
        const messages = [
            pre,
            {"role": "user", "content": content},
            post
        ].flat()


        if( options.debug){
            console.log(`-----------------------`)
            console.log(pre)
            console.log(options.debug_content ? content: "[...]")
            console.log(post)
            console.log(`-----------------------`)

        }
        const result = await executeAI( messages, options )

        if( result.success && result.response ){
            if( options.debug ){
                console.log(result.response)
                console.log(field)
            }
            if( result.response[field]){
                interim = interim.concat(result.response[field])
            }else{
                if( Object.keys( result.response ).length > 0 ){
                    interim = interim.concat(result.response)
                    if( options.debug ){
                        console.log(`${field} not present but have data - returning that`)
                    }
                }
            }
        }else{
            return result
        }
        
        endIdx += 1
        startIdx = endIdx
        content = ""
        currentCount = 0
    }while(endIdx < maxIdx )

    return interim

}

async function executeAI(messages, options = {}){
    const configuration = new Configuration({
        apiKey: process.env.OPEN_API_KEY,
      });
    const openai = new OpenAIApi(configuration)
    let response
    let err
    console.log(`open_ai_helper: Sending OpenAi request`)
    const request = async ()=>{
        try{
            response = await openai.createChatCompletion({
                model:"gpt-3.5-turbo-16k",
              //  model:"gpt-4-0613",
                temperature: options.templerature || 0.7,
                messages: messages
            });
        }catch(error){
            console.log(error)
            console.log(response)
            throw error
        }
    }
    let count = 3
    let done = false
    while( count >0 && !done){
        try{
            await request();
            console.log('open_ai_helper: back')
            done = true
        }catch(thisErr){
            err = thisErr
            count--
            if( count > 0){
                console.log(`open_ai_helper: got error - sleep and will retry`)
                await new Promise(r => setTimeout(r, 2000));                    
            }
        }
    }
    if( response == undefined){
        return {success: false, status: err?.response?.status, error: "UNKNOWN", instructions: messages}
    }

    if( response.status === 200){                
        const answers = response.data?.choices[0]?.message?.content
        try{
            const p1 = answers.replace(/,([\s\n\r]*[}\]])/g, '$1')
            const regex = /\{[\s\S]*\}/;
            const match = p1.match(regex);
            if( match ){
                const unpack = JSON.parse(match[0])
                return {response: unpack, success: true, instructions: messages[2], raw: answers}
            }
            return {success: false, instructions: messages[2], raw: answers}

        }catch(error){
            console.log(error)
            console.log(response.data)
            console.log(answers)
            return {error: "Couldnt parse JSON", success: false, raw: answers, instructions: messages}
        }
    }
    if( this.response.status === 400 ){
        return {success: false, status: 400, error: "UNKNOWN", instructions: messages}
    }
    return {success: false, status: 400, error: "UNKNOWN", instructions: messages}

}

export  async function categorize(list, categories, options = {} ){
    const targetType = options.types || "items"
    const interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format only"},
                {"role": "user", "content": `Here are a list of numbered ${targetType}: `}
            ],
            [
                {"role": "user", "content": `And here are a list of numbered categories: ${categories.map((d,idx)=>`${idx}. ${d}`).join("\n")}`},
                {"role": "user", "content": `For each ${targetType} you must assess the best match with a category from the supplied list, or determine if there is a not a strong match.   If there is a strong match assign the ${targetType} to the category number - otherwise assign it -1`} ,
                {"role": "user", "content": `Return your results in an object with an array called "results" which has an entry for each numbered ${targetType}. Each entry should be an object with a 'id' field set to the number of the item and a 'category' field set to the assigned number or label. Do not put anything other than the raw JSON in the response .`}
            ],
            {field: "results", temperature: 0.3, maxTokens: 8000})
    return interim
}
export async function analyzeText(text, options = {}){
    if( !text || text === "" || !options.prompts || options.prompts.length === 0){return {success:false}}
    const list = text.split(`\n`)

    const promptType = options.promptType || "question"
    const opener = options.opener || 'Here is an input document: '
    let responseInstructions = options.responseInstructions
    const descriptor = options.descriptor || ''
    const skipQuote = options.skipQuote
    
    //const responseInstructions = options.responseInstructions || 


    const prompts = options.prompts.map((d,idx)=>{
        return `${promptType === "task" ? "T" : "Q"}${idx}. ${d instanceof Object ? d.prompt : d}`
    })

    const singlePrompt = prompts.length === 1

    if( singlePrompt ){
        prompts.push(promptType === "task" ? "End of tasks." : "End of questions")
    }

    if( responseInstructions === undefined ){
        let fieldList = ""
        if( options.responseFields ){
            const fieldSet = Object.keys(options.responseFields).map((d)=>`a ${d} field containing the ${options.responseFields[d]}`)
            const lastField = fieldSet.pop()
            fieldList = `, ${fieldSet.join(", ")}and ${lastField}`
        }else{
            fieldList = `, a 'answer' field set to the answer`
        }

        if( singlePrompt ){
            responseInstructions = `Return your results in a json object with an array called "results". Each entry should be an object with the following fields: `
        }else{
            responseInstructions = `Return your results in a json object with a field called "results" which in an object with a field for each ${promptType} containing an array for responses to that ${promptType}.  Each entry in the array should be an object with the following fields: `
        }
        
        responseInstructions += `an 'answered' field set to true if you found an answer to the specific ${promptType} - otherwise set to false${skipQuote ? "" : ", a 'quote' containing the exact text used to prodece the answer"}${fieldList}.Do not put anything other than the raw JSON in the response .`        
    }

    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format only"},
                {"role": "user", "content": opener}
            ],
            [
                {"role": "user", "content": descriptor},
                {"role": "user", "content": prompts.join("\n")},
                {"role": "user", "content": responseInstructions}
            ],
            {field: "results", temperature: 0.3, no_num: true, debug: false })
        
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    if( singlePrompt ){
        interim = interim.map((d)=>{return {id: 0, ...d}})
    }else{
        interim = interim.map((inner)=>{
            return Object.keys(inner).map((key)=>{
                if( inner[key] ){
                    return inner[key].map((d)=>{return {id: key, ...d}})
                }
            }).flat()
        }).flat().filter((d)=>d)
    }
    /*if( options.normalize){
        interim = interim.reduce((o, c)=>{
            Object.keys(c).forEach((k)=>{
                o[k] = (o[k] || []).concat( c[k] )
            })
            return o
        }, {})
    }*/
    return {success: true, response: interim}
}
export default async function analyzeDocument(options = {}){
    let text = options.text

    text = text.replace('Hi, I’m [NAME] and I am an entrepreneur in residence with a venture studio called Co-Created.  We explore new ideas and we’re currently looking into climate goals among businesses. We’re  excited to learn more about your company', "")

    const prompts = options.prompts
    const opener = options.opener || 'here is a transcript of an interview:'
    const descriptor = options.descriptor || 'You must extract a series of problems which are explicitly stated by the interviewee.  Assume any sentence ending in a question mark is from the interviewer and should be ignored when extracting problems'
    const responseInstructions = options.responseInstructions || 'Your response must be a json object only and should include each task with the key set to the task number and with an array of results. Each entry in the array must have a "quote" field containing the original text, a "problem" field containing the problem you identify in the form "It sucks that...", and a "scale" field which describes the severity of the problem based on the transcript on a scale of 0-9 where 0 is low and 9 is high. If there is no result for a specific question set the "quote" field to "none" and exclude the "problem" field.'
    if( text === undefined || text.length === 0 || prompts === undefined || prompts.length === 0){
        return undefined
    }    
    const configuration = new Configuration({
        apiKey: process.env.OPEN_API_KEY,
      });
    const openai = new OpenAIApi(configuration)
    
    const promptsToSend = prompts.map((p,idx)=>{
        if( p instanceof Object ){
            let lead = `T${idx}. `
            if( p.type === "question"){
                lead = `Q${idx}. `
            }else if(p.type === "instruction"){
                lead = ''
            }
            return `${lead}${p.prompt || p.text}`
        }
        return `T${idx}. ${p}`
    }).join("\n")
    const messages = [
            {"role": "system", "content": "You are analysing interview transcripts for a computer program to process.  Responses must be in json format"},
            {"role": "user", "content": opener + text},
            {"role": "user", "content": descriptor + '\n' + promptsToSend + '\n' + responseInstructions},

    ]
    console.log('open_ai_helper: prompts:')
    console.log(promptsToSend)

    let response
    let err
    console.log(`open_ai_helper: Sending OpenAi request`)
    const request = async ()=>{
        try{
            response = await openai.createChatCompletion({
                model:"gpt-3.5-turbo-16k",
                temperature: 0.7,
                messages: messages
            });
        }catch(error){
            throw error
        }
    }
    let count = 3
    let done = false
    while( count >0 && !done){

        try{
            await request();
            console.log('open_ai_helper: back')
            done = true
        }catch(thisErr){
            err = thisErr
            count--
            if( count > 0){
                console.log(`open_ai_helper: got error - sleep and will retry`)
                await new Promise(r => setTimeout(r, 2000));                    
            }
        }
    }
    if( response == undefined){
        return {success: false, status: err?.response?.status, error: "UNKNOWN", instructions: messages[2]}
    }

    if( response.status === 200){                
        const answers = response.data?.choices[0]?.message?.content
        try{

            const p1 = answers.replace(/,([\s\n\r]*[}\]])/g, '$1')
            const regex = /\{[\s\S]*\}/;
            const match = p1.match(regex);
            if( match ){
                const unpack = JSON.parse(match[0])
                return {response: unpack, success: true, instructions: messages[2], raw: answers}
            }
                return {success: false, instructions: messages[2], raw: answers}
        }catch(error){
            return {error: "Couldnt parse JSON", success: false, raw: answers, instructions: messages[2]}
        }
    }
    if( this.response.status === 400 ){
        return {success: false, status: 400, error: "UNKNOWN", instructions: messages[2]}
    }
    return {success: false, status: 400, error: "UNKNOWN", instructions: messages[2]}
}