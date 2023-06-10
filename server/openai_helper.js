import {Configuration, OpenAIApi} from "openai"
import {encode, decode} from 'gpt-3-encoder'

export async function summarizeMultiple(list, options = {} ){

    let listIntro = `Here are a list of ${options.types || "items"}: `

    const interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer programe to process.  Responses must be in json format"},
                {"role": "user", "content": listIntro}],
            [
                {"role": "user", "content":  options.prompt ? options.prompt.replaceAll("{title}", options.title) : `Produce a single sumamry covering all ${options.types || "items"} ${options.themes ? `in terms of ${[options.themes].flat().join(", ")}` : ""}.`},
                {"role": "user", "content": `Provide the result as a json object with an single field called 'summary' with conatins a string with your summary. Do not put anything other than the raw json object in the response .`},
            ],
            {field: "summary", temperature: 0.3})


    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }

    let final = []

    if( interim.length > 0){
        const result = await processInChunk( interim, 
            [
                {"role": "system", "content": "You are analysing data for a computer programe to process.  Responses must be in json format"},
                {"role": "user", "content": `Here is a list of summaries:`}],
            [
                {"role": "user", "content":  options.aggregatePrompt ?  options.aggregatePrompt.replaceAll("{title}", options.title) : `Rationalize these summaries into a single summary.`},
                {"role": "user", "content": `Provide the result as a json object with an single field called 'summary' with conatins a string with your summary. Do not put anything other than the raw json object in the response .`},
            ],
            {field: "summary", temperature: 0.3})

        if( Object.hasOwn(result, "success")){
            return result
        }else{
            final = result
        }

        return {success: true, summary: final[0], interim: interim}
    }
    return {success: true, summary: interim[0]}

}
export async function buildCategories(list, options = {} ){
    const interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer programe to process.  Responses must be in json format"},
                {"role": "user", "content": `Here are a list of numbered ${options.types || "items"}: `}],
            [
                {"role": "user", "content": `Categorize each item into one of no more than ${options.count || 10} categories ${options.themes ? `related to ${[options.themes].flat().join(", ")}` : ""} which covers the full list. Each category should be no more than 3 words.`},
                {"role": "user", "content": `Provide the result as a json object with an array of categories with each entry being a string containing the category. Do not put anything other than the raw json object in the response .`},
            ],
            {field: "categories", temperature: 0.3})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }

    let final = []

    if( interim.length > 0){

        const result = await processInChunk( interim, 
            [
                {"role": "system", "content": "You are analysing data for a computer programe to process.  Responses must be in json format"},
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

async function processInChunk( list, pre, post, options = {} ){

    const field = options.field || "answer"

    const maxTokens = 3200
    const fullContent = list.map((d, idx)=>`${idx}). ${(d instanceof Object ? d.content : d).replaceAll('\n'," ")}`)
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


        const result = await executeAI( messages, options )

        if( result.success && result.response ){
            if( result.response[field]){
                interim = interim.concat(result.response[field])
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
                model:"gpt-3.5-turbo",
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

            const unpack = JSON.parse(answers.replace(/,([\s\n\r]*[}\]])/g, '$1'))
            return {response: unpack, success: true, instructions: messages[2], raw: answers}
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
                {"role": "system", "content": "You are analysing data for a computer programe to process.  Responses must be in json format only"},
                {"role": "user", "content": `Here are a list of numbered ${targetType}: `}
            ],
            [
                {"role": "user", "content": `And here are a list of numbered categories: ${categories.map((d,idx)=>`${idx}. ${d}`).join("\n")}`},
                {"role": "user", "content": `For each ${targetType} you must assess the best match with a category from the supplied list, or determine if there is a not a strong match.   If there is a strong match assign the ${targetType} to the category number - otherwise assign it the label "NOMATCH'`} ,
                {"role": "user", "content": `Return your results in an object with an array called "results" which has an entry for each numbered ${targetType}. Each entry should be an object with a 'id' field set to the number of the item and a 'category' field set to the assigned number or label. Do not put anything other than the raw JSON in the response .`}
            ],
            {field: "results", temperature: 0.3})
    return interim
}
export default async function analyzeDocument(options = {}){
    const text = options.text
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
            {"role": "system", "content": "You are analysing interview transcripts for a computer programe to process.  Responses must be in json format"},
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
                model:"gpt-3.5-turbo",
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

            const unpack = JSON.parse(answers.replace(/,([\s\n\r]*[}\]])/g, '$1'))
            return {response: unpack, success: true, instructions: messages[2], raw: answers}
        }catch(error){
            return {error: "Couldnt parse JSON", success: false, raw: answers, instructions: messages[2]}
        }
    }
    if( this.response.status === 400 ){
        return {success: false, status: 400, error: "UNKNOWN", instructions: messages[2]}
    }
    return {success: false, status: 400, error: "UNKNOWN", instructions: messages[2]}
}