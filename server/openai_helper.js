import {Configuration, OpenAIApi} from "openai"
import {encode, decode} from 'gpt-3-encoder'

export async function consoldiateAxis( json, options = {}){
    if( json === undefined ){
        return {success: true, output: []}
    }
    let type = options.type || "segment"
    let opener = `Here is a json object containing a set of axis used to understand market segments. Each entry has a field called 'id' to identify the axis, a field called 'title' as a label for the axis, and an array containing a set of values for the axis.`
    let prompt =  `Look for duplicate axis and combine them into a single new axis containing a consolidated set of values.  `
    let output = `Provide the result as a json object  with an array called axis containing any consolidated axis with entry containing a "title" field set to a suggested title for the new axis (which must not include the word consolidated), a "original' field set to an array containing the ids of the original axis that have been consolidated, and a 'values' field set to an array with each entry being a field with a 'v' field set to the new field value and a 'o' field set to distinct consolidated values from the original axis that have been  combined to create the new value - do not included repeated values in the 'o' field and omit the 'o' filed entirely if no values have been combined.  Do not include axis that have not been consolidated.  Do not put anything other than the raw json object in the response .`

    const interim = await executeAI( [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener},
                {"role": "user", "content": json},
                {"role": "user", "content": prompt},
                {"role": "user", "content": output}
            ],
            {engine: "gpt4", ...options})
    
        if( options.debug ){
            console.log( interim)
        }

    if( interim.success ){
        return {success: true, output: interim?.response?.axis}
    }

        return {success: false, output: interim}

}
export async function extractAxisFromDescriptionList( list, options = {}){
    if( list === undefined || list.length === 0){
        return {success: true, output: []}
    }
    let type = options.type || "segment"
    let opener = `Here is a list of ${type}s:`
    let prompt =  `These ${type}s are to be plotted on a market map to help understand the space. Provide a list of 4-6 suggested axis, together with a set of non-overlapping values for the axis, that will help compare and contrast the ${type}s. For each suggested axis, assign each ${type} into no more than one value.`
    let output = `Provide the result as a json object  with an array called 'axis' with each entry containing a "title" field set to the suggested title of the axis, and a 'values' field set to an array with each entry containing a "value" field set to the suggested value and a "ids" field set to an array containing the ids of the ${type}s assigned to it. `

    const interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": output}

            ],
            {field: "axis", engine: "gpt4", markPass: true, ...options})


    return {success: true, output: interim}
}
export async function extractFeautures( list, options = {}){
    if( list === undefined || list.length === 0){
        return {success: true, output: []}
    }
    let opener = `Here is a list of description about organizations:`
    let prompt =  `For each item in the list analyze the details of the organization to determine a) its target customer or markets, b) the offerings it provides to customers - but without detailing who the customers are, c) the technology the organization uses, and d) the organizations name.  Use only the information provided to form your response and be as specific as possible in your response by using the adjectives and qualifiers used in the description`
    let output = `Provide the result as a json object with an array called 'results' with each entry having an "id" field containing the number of the organization in the original list, an "offerings" field containing a list of offerings , a "customers" field containing a list of customers, a "technology" fields containing a list of technologies, and a "name" field containing the name of the company.  Set the appropriate field to "NONE" if there are no relevant keywords. Do not put anything other than the raw json object in the response`    


    const interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": output}

            ],
            {field: "results", ensureSameSize: true, ...options})
    
            
    return {success: true, output: interim}
}

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
            {field: "summary", debug: false, engine: options.engine, ...options })


    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
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
            {field: "summary"})

        if( Object.hasOwn(result, "success")){
            return result
        }else{
            final = result
        }
        console.log(`done`)
        console.log(final)

        return {success: true, summary: final[0], interim: interim, engine: options.engine }
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
            {field: "summary"})


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
            {field: "summary"})

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
export async function simplifyHierarchy(pathList, list, options = {} ){
    const types = options.types || 'problem statement'
    const subTypes = options.subTypes || "sub-problems"
    const path = pathList.map((d,idx)=>`${idx}} ${d}`).join('\n')

    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `You are processing a data set representing a hierarchy of clusters. Here are the labels associated with the path to the current cluster: ${path}`},
                {"role": "user", "content": `And here are the labels of sub-clusters within the current cluster:`}],
            [
                {"role": "user", "content": `Produce a new set of labels which makes clear the differences between sub clusters, the context of the current path, and does not repeat information from labels in the path`},
                {"role": "user", "content": `Provide the response in a json object with an array called "output" with each entry having a field called 'label' set to the new label, a field called 'description' providing mode details about the sub-cluster, and a field called 'id' set to the original numbered subcluster. Do not put anything other than the raw json object in the response`},
            ],
            {field: "output", engine: options.engine, debug: true, debug_content: true})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    if( interim.length !== list.length){
        return {success: false, summaries: interim, list: list}
    }

    return {success: true, summaries: interim}
}
export async function OLDsimplifyHierarchy(top, list, options = {} ){
    const types = options.types || 'problem statement'
    const subTypes = options.subTypes || "sub-problems"
    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `Here is a ${types} '${top}'`},
                {"role": "user", "content": `And here is a list of numbered ${subTypes} related to the ${types}:`}],
            [
                {"role": "user", "content": `Replace each numbered ${subTypes} with a single shorter summary of no more than 15 words which makes clear the difference between the other numbered ${subTypes}`},
                {"role": "user", "content": `Provide the response in a json object with an array called "output" with each entry having a field called 'summary' set to the new summary, and a field called 'id' set to the original numbered ${subTypes}. Do not put anything other than the raw json object in the response`},
            ],
            {field: "output", engine: options.engine, debug: true, debug_content: true})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    if( interim.length !== list.length){
        return {success: false, summaries: interim, list: list}
    }

    return {success: true, summaries: interim}
}
export async function buildKeywordsFromList(list, options = {} ){
    let purpose = options.purpose || `Built a list of ${options.count || 10} domain and market related search terms that can be used with an online database to find similar ${options.types || "items"}. The search only works with direct lookups (single or multi words).`
    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `Here are a list of numbered ${options.types || "items"}: `}],
            [
                {"role": "user", "content": purpose},
                {"role": "user", "content": `Provide the result as a json object with an array called "terms" with each entry being a string containing a suggested search term. Do not put anything other than the raw json object in the response .`},
            ],
            {field: "terms",  engine: options.engine, debug: true})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }

    return {success: true, keywords: interim}
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
            {field: options.themes ? "summaries" : "categories", engine: options.engine})
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
            {field: "categories", engine: options.engine})

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

    const scoreMap = {
        "strongly": 4, 
        "clearly": 3,
        "somewhat": 2, 
        "hardly": 1, 
        "not at all": 0}
    
    let opener = `Here is a ${type}: `
    let prompt =  options.prompt || `Assess how strongly the ${type} relates to ${single ? "the topic of" : "one or more of the following topics:"} ${topics}. Use one of the following assessments: "strongly", "clearly","somewhat", "hardly", "not at all" as your response`

    let interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": `Provide the result as a json object with an array called 'result' which contains an object with the following fields: an 'i' field containing the number of the ${type}, and a "s" field containing your assessment as a string.`}

            ],
            {field: "result",  no_num: true, ...options})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    interim = interim.map((d)=>{return {...d, s: scoreMap[d.s] ?? 0}})
    const final_score = interim.reduce((a,c)=>c.s > a ? c.s : a, 0)
    return {success: true, output: final_score}
}
export async function analyzeListAgainstItems( list, overview, options = {}){
    const type = options.type || "description"
    
    let opener = `Here is a list of ${options.plural ? options.plural : `${type}s`}: `
    let prompt =  options.prompt || `Here is a description of an offering: ${overview}\nEND OF DESCRIPTION`

    let interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": options.prompt2},
                {"role": "user", "content": options.response}

            ],
            {field: "result", ...options})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    return {success: true, output: interim}
}
/*export async function analyzeItemAgainstTopics( text, topics, options = {}){
    const list = text.split(`\n`)
    const single = topics.split(",").length == 1 
    const type = options.type || "description"
    const scoreMap = {
        "strongly": 4, 
        "clearly": 3,
        "somewhat": 2, 
        "hardly": 1, 
        "not at all": 0}
    
    let opener = `Here is a ${options.plural ? options.plural : `${type}s`}: `
    let prompt =  options.prompt || `Assess the degree to which the ${type} relates to ${single ? "the topic of" : "one or more of the following topics:"} ${topics}. Use one of the following assessments: "strongly", "clearly","somewhat", "hardly", "not at all" as your response`

    let interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": `Provide the result as a json object with an array called 'result' which contains an object with the following fields: a "s" field containing your assessment as a string ${options.rationale ? "and " + options.rationale  : ""}`}

            ],
            {field: "result", ...options})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    if( options.asScore ){
        interim = interim.map((d)=>{return {...d, s: scoreMap[d.s] ?? 0}})
    }

    return {success: true, output: interim}
}*/
export async function buildRepresentativeItemssForHypothesisTest( hypothesis, options = {}){
    const type = options.type || "problem statement"
    
    let opener = `Here is a hypothesis: `
    let prompt =  `I have a large list of problem statements and user quotes from interviews which i can filter with embeddings.  You must produce a list of new statements i can use to find similar items from the list: 5 problem statements in the form "It stinks that..." which validate the hypothesis, 5 quotes from an interviewee which validate the hypothesis, 5 problem statements in the form "It stinks that..." which invalidate the hypothesis, and 5 quotes from an interviewee which invalidate the hypothesis. You must ignore any mention of a target entity in your response. Limit each item to 20 words`

    let interim = await processInChunk( [hypothesis],
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": `Provide the result as a json object with an array called 'result' containing your responses as a single list of strings`}

            ],
            {field: "result", ...options})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }

    return {success: true, output: interim}
}
export async function analyzeEvidenceAgainstHypothesis( list, hypothesis, options = {}){
    const type = options.type || "problem statement"
    const scoreMap = {
        "strongly": 4, 
        "clearly": 3,
        "somewhat": 2, 
        "hardly": 1, 
        "not at all": 0}
    
    let opener = `Here is a list of ${options.plural ? options.plural : `${type}s`}: `
    let prompt =  options.prompt || `Assess the degree to which each ${type} speaks to the following hypothesis '${hypothesis}'.\n\n Use one of the following assessments: "strongly", "clearly","somewhat", "hardly", "not at all" as your response`

    let interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": `Provide the result as a json object with an array called 'result' which contains an object with the following fields: an 'i' field containing the number of the ${type},${options.rationale ? options.rationale + ", " : ""}, a "s" field containing your assessment as a string, a boolean "validates" field indicating if the evidence validates or supports the hypothesis, and a boolean "invalidates" field indicating if the evidence contradicts or invalidates the hypothesis.`}

            ],
            {field: "result", ...options})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    interim = interim.map((d)=>{return {...d, s: scoreMap[d.s] ?? 0}})

    return {success: true, output: interim}
}
export async function analyzeListAgainstTopics( list, topics, options = {}){
    const single = topics.split(",").length == 1 
    const type = options.type || "description"
    const scoreMap = {
        "strongly": 4, 
        "clearly": 3,
        "somewhat": 2, 
        "hardly": 1, 
        "not at all": 0}
    
    let opener = `Here is a list of ${options.plural ? options.plural : `${type}s`}: `
    let prompt =  options.prompt || `Assess the degree to which each ${type} relates to ${single ? "the topic of" : "one or more of the following topics:"} ${topics}. Use one of the following assessments: "strongly", "clearly","somewhat", "hardly", "not at all" as your response`

    let interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": `Provide the result as a json object with an array called 'result' which contains an object with the following fields: an 'i' field containing the number of the ${type},${options.rationale ? options.rationale + ", " : ""} and a "s" field containing your assessment as a string.`}

            ],
            {field: "result", ...options})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    if( options.asScore ){
        interim = interim.map((d)=>{return {...d, s: scoreMap[d.s] ?? 0}})
    }

    return {success: true, output: interim}
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
    if( options.topics ){
        prompt = prompt.replace('{topic}', options.topics)
    }
    const output = options.output || `Provide the result as a json object  with an array called results. Each entry in the array must have a \"quote\" field containing the original text and a \"${extractType}\" field containing the ${extractType} you identify ${transformPrompt}. If there is are no ${extractType}s then set the results field to an empty array.`

    const interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": output}

            ],
            {field: "results", no_num: true, ...options})
    return {success: true, output: interim}
}


async function processInChunk( list, pre, post, options = {} ){

    const field = options.field ?? "answer"
    let pass = 0

    let maxTokens = options.maxTokens || (options.engine === "gpt4" ? 5000 : 12000)
    const fullContent = list.map((d, idx)=>{
        const start = options.no_num ? "" : (options.prefix ?  `${options.prefix} ${idx}: ` :`${idx}). `)
        return `${start}${(d instanceof Object ? d.content : d).replaceAll(/\n|\r/g,". ")}`
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
            let text = fullContent[endIdx] + (options.joiner ?? "\n")
            let thisTokens = encode( text ).length
            if( ( thisTokens + currentCount ) < maxTokens ){
                leave = false
                content += text
                currentCount += thisTokens
                endIdx++
            }
        }while(!leave && endIdx <= maxIdx)
        endIdx--

        if(startIdx > endIdx ){
            console.log( encode( fullContent[startIdx] ).length)
            throw "Cant processes chunk"
        }

        console.log(`Sending ${startIdx} -> ${endIdx} (${currentCount})`)
        content = (options.contentPrefix ? options.contentPrefix : "") + content + (options.postfix ? "\n" + options.postfix : "")
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
        if( result.error && result.token_limit ){
            maxTokens = maxTokens / 2
            console.log(`----- HIT MAX LIMIT, REDUCING TO ${maxTokens}`)
            if( maxTokens < 100 ){
                throw "Token limit too low - something went wrong"
            }
            endIdx = startIdx
        }else{

            
            if( result.success && result.response ){
                if( options.debug ){
                    console.log(result.response)
                    console.log(field)
                }
                const values = field ? result.response[field] : result.response
                if( values ){
                    if( options.markPass ){
                        values.forEach((d)=>d._pass = pass)
                    }
                    if( options.ensureSameSize){
                        if(values.length !== endIdx - startIdx + 1){
                            console.log(result)
                            console.log( messages)
                            //throw "Mismatch in responze size"
                        }
                    }
                    interim = interim.concat( values )
                }
                pass++
            }else{
                return result
            }
            
            endIdx += 1
            startIdx = endIdx
        }
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
//    console.log(`open_ai_helper: Sending OpenAi request`)
    if( options.engine === "gpt4" ){
        console.log(`--- GPT 4`)
    }
    const request = async ()=>{
        try{
            response = await openai.createChatCompletion({
                model: options.engine === "gpt4" ? "gpt-4-0613" : "gpt-3.5-turbo-16k",
                temperature: options.temperature || 0.7,
                messages: messages
            });
        }catch(error){
            console.log(error)
            console.log(response)
            throw error
        }
    }
    let maxCount = 3
    let count = 0
    let done = false
    while( count  < maxCount && !done){
        try{
            await request();
            console.log('open_ai_helper: back')
            done = true
        }catch(thisErr){
            err = thisErr
            count++
            if( count < maxCount ){
                console.log(`open_ai_helper: got error - sleep and will retry`)
                await new Promise(r => setTimeout(r, options.engine === "gpt4" ? 20000 * count: 2000));                    
            }else{
                console.log(`++++++ FAILED ++++++`)
            }
        }
    }
    if( response == undefined){
        return {success: false, status: err?.response?.status, error: "UNKNOWN", instructions: messages}
    }

    if( response.status === 200){                
        if( response.data?.choices[0]?.finish_reason === 'length' ){
           return {error: true, token_limit: true} 
        }
        const answers = response.data?.choices[0]?.message?.content
        try{
            let unpack
            const p1 = answers.replace(/,([\s\n\r]*[}\]])/g, '$1')
            if( p1[0] === "[" && p1[p1.length - 1] === "]"){
                unpack = p1
            }else{
                const regex = /\{[\s\S]*\}/;
                const match = p1.match(regex);
                if( match ){
                    unpack = JSON.parse(match[0])
                }
            }
            if( unpack ){
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
    const targetType = options.types || "item"
    const match = options.matchPrompt || `For each ${targetType} you must assess the best match with a category from the supplied list, or determine if there is a not a strong match.`
    const interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format only"},
                {"role": "user", "content": `Here are a list of numbered ${targetType}s: `}
            ],
            [
                {"role": "user", "content": `And here are a list of numbered categories: ${categories.map((d,idx)=>`${idx}. ${d}`).join("\n")}`},
                {"role": "user", "content": `${match} If there is a strong match assign the ${targetType} to the most suitable category number - otherwise assign it -1`} ,
                {"role": "user", "content": `Return your results in an object with an array called "results" which has an entry for each numbered ${targetType}. Each entry should be an object with a 'id' field set to the number of the item and a 'category' field set to the assigned number or label. Do not put anything other than the raw JSON in the response .`}
                //{"role": "user", "content": `Return your results in an object with an array called "results" which has an entry for each numbered ${targetType}. Each entry should be an object with a 'id' field set to the number of the item and a 'category' field set to the assigned number or label, and a 'rationale' field containing the reason for your choice in no more than 8 words. Do not put anything other than the raw JSON in the response .`}
            ],
            {field: "results", maxTokens: (options.engine === "gpt4" ? 2000 : 12000), engine:  options.engine, ...options})
    return interim
}

/*
Find a maximum of 5  specific, concrete problems that are explicitly discussed in the article which relate to challenges to growth
Return your results in a json object with a field called 'answered' set to the number of specific and concrete problems were discussed in the article, and an 'answers' field which is an array of problems (if any), with each entry being an object with the following fields: a 'quote' field containing no more than the first 30 words of the exact text from the article used to produce the answer without correcting bad spelling or grammar or altering the text in anyway,  and a problem field containing the problems you identify in the form 'It sucks that...'.Do not put anything other than the raw JSON in the response
*/
function repackLongText( text, options ){
    let list = text.split(`\n`)
    let maxTokens = options.maxTokens || (options.engine === "gpt4" ? 5000 : 12000)
    list.push("")
    list = list.map((d)=>{
        if( encode(d).length > maxTokens ){
            const temp = []
            let split = d.split("  ")
            if( split.length === 1){
                split = d.split(" ")
            }
            console.log(`split into ${split.length}`)

            let count = 0
            let current = ""
            
            while(split.length > 0){
                const t = split.shift()
                const tt = encode(t).length
                if( (count + tt) > maxTokens){
                    temp.push(current)
                    current = ""
                    count = 0
                }
                count += tt
                current = current + " " + t
            }
            temp.push(current)
            console.log(`Reformed into ${temp.length}`)
            return temp
        }
        return d
    }).flat()
    return list
}
export async function analyzeText2(text, options = {}){
    if( !text || text === "" || !options.prompts || options.prompts.length === 0){return {success:false}}

    const promptType = options.promptType || "question"
    const opener = options.opener || 'Here is an input document: '
    let responseInstructions = options.responseInstructions
    const responseQualifier = options.responseQualifier || "responses"
    const descriptor = options.descriptor 
    const field = options.field ?? "problem"
    const skipQuote = options.skipQuote
    const list = repackLongText(text, options)
    
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
            fieldList = `, ${fieldSet.join(", ")} and ${lastField}`
        }else{
            fieldList = `, a 'answer' field set to the answer`
        }

        if( singlePrompt ){
            responseInstructions = `Return your results in a json object with a `
        }else{
            responseInstructions = `Return your results in a json object with a field for each task which contains a `
        }
        
        //responseInstructions += `field called 'answered' set to the number of ${responseQualifier}, and an 'answers' field which is an array of problems for that task (if any), with each entry being an object with the following fields: a 'quote' field containing no more than the first 30 words of the exact text from the article used to produce the answer without correcting bad spelling or grammar or altering the text in anyway,  and a '${field}' field containing the problems you identify in the form 'It sucks that...'.Do not put anything other than the raw JSON in the response `
        responseInstructions += `field called 'answered' set to the number of ${responseQualifier}, and an 'answers' field which is an array of ${field}s for that task (if any), with each entry being an object with the following fields: a 'quote' field containing no more than the first 30 words of the exact text from the article used to produce the answer without correcting bad spelling or grammar or altering the text in anyway${fieldList}.Do not put anything other than the raw JSON in the response `

    }

    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format only"},
                opener ? {"role": "user", "content": opener} : undefined,
            ],
            [
                descriptor ? {"role": "user", "content": descriptor} : undefined, 
                {"role": "user", "content": prompts.join("\n")},
                {"role": "user", "content": responseInstructions}
            ].filter((d)=>d),
            {field: false, contentPrefix: options.prefix, postfix: options.postfix, temperature: options.temperature, no_num: true, engine: options.engine, debug:true, debug_content:true })
        
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }

    if( singlePrompt ){
        interim = interim.map((d)=>{
            return {
                0: d,
            }
        })
    }

    const out = interim.reduce((o,c)=>{
            Object.keys(c).forEach((k)=>{
                o[k] = o[k] || {answered:0, answers: []}
                if( c[k].answered > 0){
                    o[k].answered += c[k].answered
                    o[k].answers = o[k].answers.concat( c[k].answers )
                    
                }
            })
            return o
        }, {})

    return {success: true, response: out}
}
export async function analyzeText(text, options = {}){
    if( !text || text === "" || !options.prompts || options.prompts.length === 0){return {success:false}}

    const promptType = options.promptType || "question"
    const opener = options.opener || 'Here is an input document: '
    let responseInstructions = options.responseInstructions
    const descriptor = options.descriptor 
    const skipQuote = options.skipQuote
    const list = repackLongText(text, options)
    
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
            fieldList = `, ${fieldSet.join(", ")} and ${lastField}`
        }else{
            fieldList = `, a 'answer' field set to the answer`
        }

        if( singlePrompt ){
            responseInstructions = `Return your results in a json object with an array called "results". Each entry should be an object with the following fields: `
        }else{
            responseInstructions = `Return your results in a json object with a field called "results" which in an object with a field for each ${promptType} containing an array for responses to that ${promptType}.  Each entry in the array should be an object with the following fields: `
        }
        
        responseInstructions += `an 'answered' field set to true if you found an answer to the specific ${promptType} - otherwise set to false${skipQuote ? "" : `, a 'quote' field containing no more than the first 30 words of the exact text${options.sourceType ? ` from the ${options.sourceType}` : ""} used to produce the answer without correcting bad spelling or grammar or altering the text in anyway`}${fieldList}.Do not put anything other than the raw JSON in the response .`        
    }

    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format only"},
                opener ? {"role": "user", "content": opener} : undefined,
            ],
            [
                descriptor ? {"role": "user", "content": descriptor} : undefined, 
                {"role": "user", "content": prompts.join("\n")},
                {"role": "user", "content": responseInstructions}
            ].filter((d)=>d),
            {field: "results", contentPrefix: options.prefix, postfix: options.postfix, temperature: options.temperature, no_num: true, engine: options.engine, debug:true, debug_content:true })
        
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
export async function buildEmbeddings( text ){
    if( !text ){
        return {success: true, embeddings: undefined}
    }
    text = text.trim()
    if( !text ){
        return {success: true, embeddings: undefined}
    }

    try{

        const configuration = new Configuration({
            apiKey: process.env.OPEN_API_KEY,
        });
        const openai = new OpenAIApi(configuration);
        const response = await openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: text,
        });
        if( response.data?.data?.[0]?.object === "embedding"){
            return {success: true, embeddings: response.data.data[0].embedding}
        }
        return {success: false, raw: response.data}
    }catch(error){
        console.log('Error in buildEmbeddings')
        console.log(error)
    }
}