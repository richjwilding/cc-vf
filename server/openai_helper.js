import OpenAI from "openai"
import {encode, decode} from 'gpt-3-encoder'
import { executeConcurrently } from "./SharedFunctions"
import { recordUsage } from "./usage_tracker"

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
            {engine: "gpt4p", ...options})
    
        if( options.debug ){
            console.log( interim)
        }

    if( interim.success ){
        return {success: true, output: interim?.response?.axis}
    }

        return {success: false, output: interim}

}
export async function analyzeForClusterPhrases( list, options = {}){
    if( list === undefined || list.length === 0){
        return {success: true, output: []}
    }
    let type = options.type ?? "problems"
    let focus = options.focus
    let inputType = options.type ?? "problems statement"
    let minC = options.minClusters ?? 2
    let maxC = options.maxClusters ?? 10
    let catTheme = options.catTheme
    let opener = `I am undertaking market research ${options.theme ? `into the theme: ${options.theme}` : ""}.\nI need to understand how to think about the ${type} in this space.\nHere are a list of ${inputType}s\n`
    //let prompt =  `I will undertake a clustering process of several thousand ${inputType}s  based on the distance of the embedding of each ${inputType} to each cluster centroid.  Assess the provided ${inputType}s to first filter out those which are not directly and explicitly relevant to the provided theme, and then analyze the remaining ${inputType}s to identify a consolidated set of phrases which would group similar ${inputType}s together when used to generate embeddings for the centroid of a cluster.  The aim is to group similar ${inputType}s together into between ${minC} and ${maxC} non-overlapping clusters. Ensure that the phrases are as specific and selective as possible, do not overlap with one another, are not a subset of another phrase, are based on only the information in the ${inputType}s i have provided, and are directly and explicitly relevant to the provided theme. If there are no relevant ${inputType}s then return an empty list.    `
    //let output = `Provide your response as a json object called "result" containing an array of objects each with a 'phrase' field containing the proposed phrase, a 'relevance' field containing an explanation for how the proposed phrase is directly relevant to the provided theme in no more than 15 words, a 'score' field with an assessment for how relevant the phrase is to the provided theme on the scale of 'not at all', 'hardly', 'somewhat' , 'clearly', and a 'size' field containing the number of ${inputType}s from the provided list that you estimate to align with this phrase.  Do not provide anything other than the json object in your response`

    let prompt = `i will undertake a clustering process of several thousand ${inputType}s based on the distance of the embedding of each ${inputType} to each cluster centroid. Each cluster must relate to a sub topic of ${focus ? focus : options.theme}. The aim is to group similar ${inputType}s together into between ${minC} and ${maxC} non-overlapping clusters. Assess the provided ${inputType}s to first filter out any which are not directly and explicitly relevant to the provided theme, and then analyze the remaining ${inputType}s to identify a 2-3 candidate phrases per cluster. Ensure that the clusters are as specific and selective as possible, do not overlap with one another, are not a subset of another cluster, are based on only the information in the ${inputType}s i have provided, are directly and explicitly relevant to the provided theme${focus ? ` and are related to ${focus}` : ""}. If there are no relevant ${inputType}s then return an empty list.`
    let output = `Provide your response as a json object called "result" containing an array of objects each with a 'cluster_title' field set a 5 word title of the cluster${focus ? ` which is framed as ${focus}` : ""}, a 'phrase' field containing an array of proposed phrases (each as a string), a 'relevance' field containing an explanation for how the proposed phrase is directly relevant to the provided theme in no more than 15 words, a 'score' field with an assessment for how relevant the phrase is to the provided theme on the scale of 'not at all', 'hardly', 'somewhat' , 'clearly', and a 'size' field containing the number of ${inputType}s from the provided list that you estimate to align with this phrase.  Do not provide anything other than the json object in your response`


    const interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": output}

            ],
            {field: "result", engine: "gpt4p", markPass: true, maxTokens: 100000,...options})


    return {success: true, output: interim}
}
export async function extractAxisFromDescriptionList( list, options = {}){
    if( list === undefined || list.length === 0){
        return {success: true, output: []}
    }
    let type = options.type || "segment"
    let opener = `Here is a list of ${type}s:`

    let prompt = `I need to generate a market map based on the provided information. ${options.theme ? `My area of research is focussed on ${options.theme}` : ""} Please suggest 4-6 appropriate axes ${options.theme ? "releavnt to my are of research " : ""}with as many non-overlapping and unique values necessary to help compare and contrast these ${type}s. 
    Each suggested value should represent at least 3 items and every ${type} must be assigned to each and every applicable value in each axis. 
    Pick axis and values which provide good coverage of as many of the ${type}s i have provided as possible
    
    **Steps**
    1. **Categorize Accurately**: For each axis, categorize the ${type} based on the details described in the provided information${options.theme ? " ensuring they are directly related to my research focus" :""}. In categorizing an ${type} be sure to consider all of the information provided about it and ensure that the assignment doesn't overly focus on any one specific detail (for example is a company operates in healthcare amongst other sectors you must assign it to  all relevant values or to a more generic value that represents the full details). 
    2. **Alignment with Description**: Ensure that the assigned values on each axis accurately reflects the ${type}'s description$ provided in the overview, particularly focusing on the explicitly stated target customers and key capabilities. 
    3.  **Validation Check**: Review your assignments once completed, ensuring no ${type} is misplaced based on its provided overview, and that the categorization clearly aligns with the detailed descriptions.`

    let output = `Provide the result as a json object with the following structure: 
                {'axis': 
                [
                    {
                        id: <<a numerical id for the axis>>, 
                        title:<<Axis title in no more than 5 words>>, 
                        dimension:<<The dimension this axis considers (such as offerings, customers)>>, 
                        description: <<Description of the axis in no more than 25 words, 
                        values: [
                            {
                                title: <<Title of value>>, 
                                description: <<description of value in no more than 25 words>>}
                            },<<remaining values for axis>>
                        ]
                    }
                ]
            }`
    //unassigned: [<<list of ids of organization not assigned to any values in this axis>>]
                                /*assignments: [
                                    {
                                        id: <<id of ${type} as provided by me assigned to this value in this axis>>, 
                                        r: <<rationale for assigning to this value as opposed to others in the axis, in 10 words or less  >>
                                    },<<remaining ${type}s assigned to values in this axis>>
                                ]*/
    const interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": output}

            ],
            {field: "axis", engine: "gpt4p", markPass: true, ...options})


    return {success: true, output: interim}
}
export async function __extractAxisFromDescriptionList( list, options = {}){
    if( list === undefined || list.length === 0){
        return {success: true, output: []}
    }
    let type = options.type || "segment"
    let opener = `Here is a list of ${type}s:`
    let prompt =  `These ${type}s are to be plotted on a market map to help understand the space. Based on the information provided, generate a list of 4-6 suggested axis, together with a set of non-overlapping values for the axis, that will help compare and contrast the ${type}s. For each suggested axis, assign each ${type} into no more than one value based on the information i have provided for it ensuring the value it is assigned is valid and the most appropriate option. Ensure the axis and values are based on data i have provided only and that each suggested value represents at least 10 items.`
    let output = `Provide the result as a json object  with an array called 'axis' with each entry containing a "title" field set to the suggested title of the axis, a 'description' field with upto 25 words describing the axis, and a 'values' field set to an array with each entry containing a "value" field set to the suggested value and a "ids" field set to an array containing the ids of the ${type}s assigned to it. `

    const interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": output}

            ],
            {field: "axis", engine: "gpt4p", markPass: true, ...options})


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

    let listIntro = list.length === 1 ? "Here is some data to process" : `Here are a list of ${options.types || "items"}: `
    let prompt = options.prompt ? options.prompt.replaceAll("{title}", options.title) : `Produce a single summary covering all ${options.types || "items"} ${options.themes ? `in terms of ${[options.themes].flat().join(", ")}` : ""}.`    
    let finalPrompt = prompt
    if( options.focus ){
        if( finalPrompt.includes('{focus}')){
            finalPrompt = finalPrompt.replaceAll('{focus}', options.focus)
        }else{
            finalPrompt =  prompt + `.  Ensure the summary focus mainly on ${options.focus}.`
        }
    }
    if( !options.allow_infer){
        finalPrompt += `\n\nRegardless of any prior instructions, you MUST ONLY use the data I provided to you to write your answer - you MUST NOT use your own knowledge.\nOmit any section where the data i provided is not relevant to task - simply writing  "No relevant data for task" instead`
    }
    const format = options.markdown ? `You can you the following simple markdown in your response (note that the square brackets are delineating placeholders and must not be output in your response):\n${options.heading ? "Header or section titles: **text**\n" :""}indented list item:- text\ndouble indented list item:-- text\ntriple indented list item:--- text\ntable headers: |cell|cell| (ensure you start and finish with a | character - empty cells should be ||)\n               |----|----|\ntable rows: |cell|cell| (ensure you start and finish with a | character - empty cells should be || \n Do not use any other markdown. Ensure you mark the end of paragraphs and list items with a new line character but do not do double newlines as that ruins the formatting. Do not define the markdown format in your response and only include markdown where needed.` : "Format your response as a simple string using any formatting specified above"
    
    let outputFields, wholeResponse = options.wholeResponse
    if( options.output){
        outputFields = options.output
    }else if( options.outputFields) {
        outputFields = `Provide the result as a json object with `
        outputFields += options.outputFields.map(d=>{
            return `a '${d.field}' field containing ${d.prompt}`
        })
        outputFields += `. ${format} Do not put anything other than the raw json object in the response. Do not explicity reference the data, items or text i have (ie avoid 'the data showcases' and similar) and avoid phrases like "a variety of", "a wide range" and similar`
    }else{
        if( options.scored){
            outputFields = `Return your answer in a json field called "scores" - each assessment should have a 'score' field, 'assessment' field and 'relevance' field`
        }else{
            outputFields = `Provide the result as a json object with an single field called 'response' which conatins a string with your response. ${format}. Do not put anything other than the raw json object in the response .`
        }
    }
    
    
    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": listIntro}
            ],
            [
                {"role": "user", "content":  finalPrompt},
                {"role": "user", "content": outputFields},
            ],
            {
                no_num: list.length === 1 , 
                field: wholeResponse ? undefined : (options.field ?? "response"), 
                debug: false, 
                ...options,
                stream: options.stream && !options.batch ? options.stream : undefined
            })


    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    if( options.scored ){
        console.log(`Got scores`)
        console.log(interim?.[0])
        if( interim[0] ){
            const scores = interim[0].scores
            let out = []
            for(const d of Object.keys(scores)){
                console.log(d)
                out.push(`- ${d}: ${scores[d].score} - ${scores[d].assessment}`)
            }
            return {success: true, summary: out.join("\n")}
        }
        return {success: false}
    }
    let final = []
    if( options.batch){
        console.log('need to summarize partials')
        //return {success: true, summary: interim.join("\n")}
    }

    let shouldMerge = false

    if( interim.length > 1){
        if( options.merge === false ){
            shouldMerge = true
        }else{

            let interimOutputFields = outputFields.replaceAll("List the numbers associated with all of the fragments of text used for this section", "List each and every number in the 'ids' field of each of the source summaries which you have rationalized into this new item - you MUST include ALL numbers from the relevant source summaries")
            const result = await processInChunk( interim, 
                [
                    {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                    {"role": "user", "content": `Here is a list of summaries:`}],
                    [
                        {"role": "user", "content":  options.aggregatePrompt ?  options.aggregatePrompt.replaceAll("{title}", options.title) : `Rationalize these summaries into a single response to address this original prompt. Be careful to note which summaries you are merging together. If asked to include quotes use a selection of the quotes stated in the interim results.  ${prompt}`                    
                    },
                    {"role": "user", "content": interimOutputFields},
                ],
                {
                    field: wholeResponse ? undefined : (options.field ?? "response"),
                    ...options,
                    debug: true,
                    debug_content: true
                })
                
            if( Object.hasOwn(result, "success")){
                return result
            }else{
                final = result
            }
            console.log(`done`)
            console.log(final)
            
            return {success: true, summary: final[0], interim: interim, engine: options.engine }
        }
    }
    if( options.outputFields) {
        interim = interim.map(d=>{
            return options.outputFields.map(f=>f.header ? `**${d[f.field]}**` : d[f.field]).join('\n')
        })
    }

    return {success: true, shouldMerge, summary: (shouldMerge && options.merge === false) ? interim : interim[0]}

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
            {field: "summary", ...options})


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
export async function simplifyAndReduceHierarchy(pathList, list, options = {} ){
    const types = options.types || 'problem statement'
    const subTypes = options.subTypes || "sub-problems"
    const path = pathList.map((d,idx)=>`${idx}} ${d}`).join('\n')

    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `You are processing a data set representing a hierarchy of clusters. Here are the labels associated with the path to the current cluster: ${path}`},
                {"role": "user", "content": `And here are the labels of sub-clusters within the current cluster:`}],
            [
                {"role": "user", "content": `Analyze the labels to assess the differences between the sub clusters and to identify any sub clusters that should be merged together.  If any sub cluster should be merged, identify which is the most suitable resulting sub cluster. Produce a new set of labels which makes clear the differences between sub clusters, the context of the current path, and does not repeat information from labels in the path.`},
                {"role": "user", "content": `Provide the response in a json object with an array called "output" for each of the remaining sub clusters with each entry having a field called 'label' set to the new label, a field called 'description' providing mode details about the sub-cluster, a field called 'id' set to the original numbered subcluster, and a 'merge_with' field set to the ids of any other subclusters that should be merged with this one. Do not put anything other than the raw json object in the response`},
            ],
            {field: "output", engine: options.engine, debug: true, debug_content: true})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }

    return {success: true, summaries: interim}
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
    let count = options.count ?? 10
    let doAll = false
    if( count === 0){
        doAll = true
        count = "as many as possbile"
    }
    let theme = options.themes
    if( theme === ""){
        theme = undefined
    }
    let interim = await processInChunk( list, 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `Here are a list of numbered ${options.types || "items"}: `}],
            [
                {"role": "user", "content": options.literal 
                        ? `I am building a categorization map of these items.  Generate a set of ${count} distinct and non overlapping categories which can be used as an axis to compare and contrast the list. ${options.themes ? `\nFirst, review the list and filter out any items which do not have information about '${options.themes}', then for each remainining items assess the '${options.themes}' for the item, grouping items based upon string similarity, allowing for abbreviates and short hand` : `Identify categories by grouping items based upon string similarity, allowing for abbreviates and short hand`}. Each category should be no more than 3 words and should have a clear defintion. A group can contain just one item. The categories must not overlap - ensure you follow MECE pricnciples. ${doAll ? "Ensure you capture each and every relevant category - i want as many as possible." : ""}`
                        : `I am building a categorization map of these items.  Generate a set of ${count} distinct and non overlapping categories which can be used as an axis to compare and contrast the list. ${options.themes ? `\nFirst, review the list and filter out any items which are not relevant to theme of: **${options.themes}**, then for each remainining items consider how it relates to the theme when building the categories, grouping items based upon semantic similarity` : `Identify categories by grouping items based upon semantic similarity`}. Each category should be no more than 3 words and should have a clear defintion. The categories must not overlap - you must follow MECE pricnciples`
                    },
                {"role": "user", "content": `Provide the result as a json object with an array called "categories" with each entry being an object with a 't' field containing the title and a 'd' field containing the definition in no more than 20 words. Do not put anything other than the raw json object in the response .`}
            ],
            {field: "categories", engine: options.engine, markPass: true,...options})
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


    let final = interim
    const passes = interim.map(d=>d._pass).filter((d,i,a)=>a.indexOf(d)===i).length
    if( passes > 1 && !options.literal){

        const result = await processInChunk( interim.map(d=>`${d.t}: ${d.d}`), 
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": `Here is a list of categories: `}],
            [
                {"role": "user", "content": `Rationalize this list into no more than ${count} categories being careful to not lose any nuance or detail, and ensuring the new categories do not overlap . Each category should be no more than 3 words and should have a clear defintion.`},
                {"role": "user", "content": `Provide the result as a json object  with an array of categories with each entry being an object with a 't' field containing the title and a 'd' field containing the definition in no more than 20 words.. Do not put anything other than the raw json object in the response.`},
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
    const single = options.single ?? topics.split(",").length > 1 
    const type = options.type || "description"

    const scoreMap = {
        "strongly": 4, 
        "clearly": 3,
        "somewhat": 2, 
        "hardly": 1, 
        "not at all": 0}
    
    let opener = `Here is the text: `
    let prompt =  options.prompt || `I will provide you text detailing ${type}. Assess how strongly the ${type} relates to ${single ? "the topic of" : "one or more of the following topics:"} ${topics}. Use one of the following assessments: "strongly", "clearly","somewhat", "hardly", "not at all" as your response`

    if( options.stopAtOrAbove ){
        let chunkCount = 0
        options.chunkCallback = (chunk)=>{
            //console.log(`Got`, chunk)
            chunkCount++
            if( options.stopChunk ){
                //console.log(`Check count ${chunkCount} vs ${options.stopChunk}`)
                if(chunkCount > options.stopChunk){
                    return false
                }
            }
            let chunkScores = chunk.map((d)=>scoreMap[d.s] ?? 0)
            let highestScore = chunkScores.reduce((a,c)=>c> a ? c : a, 0)
            console.log( highestScore)
            return highestScore < options.stopAtOrAbove
        }
    }

    let interim = await processInChunk( list,
            [
                //{"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "system", "content": prompt},
                {"role": "user", "content": opener}],
            [
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
    
    let opener = options.opener || `Here is a list of ${options.plural ? options.plural : `${type}s`}: `
    let prompt =  options.prompt || `Here is an overview of ${options.descriptionType ?? "an offering"} ${overview}`

    let interim = await processInChunk( list,
            [
                {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
                {"role": "user", "content": opener}],
            [
                {"role": "user", "content": prompt},
                {"role": "user", "content": options.prompt2},
                {"role": "user", "content": options.response}

            ].filter(d=>d.content),
            {field: "result", ...options})
    if( Object.hasOwn(interim, "success")){
        console.log(interim)
        return interim
    }
    return {success: true, output: interim}
}
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

export async function processAsSingleChunk(text, options = {}){

    let maxTokens = tokensForModel( options.engine )
    const currentTokens = encode(text)
    if( currentTokens > maxTokens){
        return {success: false, error: `too many tokens ${currentTokens} vs ${maxTokens}`}
    }

    
    let output = options.output || `Provide the result as a json object  with an array called results.`

    if( options.outputFields){
        let lastField = options.outputFields.pop()
        let field_list = options.outputFields.length > 0 ? options.outputFields.join(", ") + `, and ${lastField}` : lastField

        output += ` Each entry in the array must have ${field_list}.`
    }
    output += "Do not include anything other than the json object in your response"
    

    let messages = [
        {"role": "system", "content": "You are analysing data for a computer program to process.  Responses must be in json format"},
        {"role": "user", "content": text},
        {"role": "user", "content": output},
    ]
    if( options.debug){
        console.log(messages)
    }
    
    const result = await executeAI( messages, {...options} )
    if( result.success && result.response ){
        return {success: true, results: result.response.results ?? result.response}
    }
    return result
    
}

export async function processPromptOnText( text, options = {}){
    if( !text || text === ""){return {success:false}}
    const list = Array.isArray(text) ? text : text.split(`\n`)
    const type = options.type || "document"
    const extractType = options.extractNoun || "problem"
    const transformPrompt = options.transformPrompt || "" 
    let opener = options.opener ?? `Here is a ${type}: `
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
            {field: options.field ?? "results", no_num: true, ...options})
    return {success: true, output: interim}
}

function tokensForModel(model){
    let defaultTokens = 90000
    if( model === "gpt4" ){
        defaultTokens = 5000
    }else if( model === "gpt4p" ){
        defaultTokens = 80000
    }else if( model === "gpt4o" ){
        defaultTokens = 80000
    }else if( model === "o3-mini" ){
        defaultTokens = 120000
    }else if( model === "o4-mini" ){
        defaultTokens = 120000
    }else if( model === "gpt-41" ){
        defaultTokens = 800000
    }else if( model === "gpt3" || model === "gpt3t"){
        defaultTokens = 12000
    }
    return defaultTokens 
}

export async function processInChunk( list, pre, post, options = {} ){
    list = list.map(d=>{
        if( typeof(d) === "object" ){
            return JSON.stringify(d)
        }            
        return d
    })

    const field = options.wholeResponse ? undefined : (options.field ?? "answer")
    let pass = 0
    let tokensProcessed = 0

    let defaultTokens = tokensForModel( options.engine )

    let maxTokens = options.maxTokens || defaultTokens
    const fullContent = options.inBatch ? list : list.map((d, idx)=>{
        const start = options.no_num ? "" : (options.prefix ?  `${options.prefix} ${idx}: ` :`${idx}). `)
        let text = (d instanceof Object ? d.content : d)
        if( text && !options.keepLineBreaks ){
            text = text.replaceAll(/\n|\r/g,". ")
        }
        return `${start}${text}`
    })

    const maxIdx = fullContent.length - 1

    if( options.batch && fullContent.length > options.batch){
        const concurrency = 10
        const batchData = []
        const batchStart = []
        for(let idx = 0; idx <= maxIdx; idx += options.batch)
        {
            batchData.push( fullContent.slice(idx, idx + options.batch))
            batchStart.push(idx)
        }
        console.log(`Will split ${fullContent.length} into batches of ${options.batch} - concurrency = ${concurrency}`)
        let back = 0
        const {results, cancelled} = await executeConcurrently( batchData, 
                                                                (d, idx)=>processInChunk(d, 
                                                                                    pre, 
                                                                                    post, 
                                                                                    {
                                                                                        ...options,
                                                                                        inBatch: true,
                                                                                        batch: undefined,
                                                                                        batchStartOffset: batchStart[idx]
                                                                                    }),
                                                                                    undefined,
                                                                                    undefined,
                                                                                    concurrency,
                                                                                    (backIdx)=>{
                                                                                        back++
                                                                                        console.log(`Batch ${backIdx} (${back} total) of ${batchData.length} completed`)
                                                                                        if( options.notify ){
                                                                                            options.notify(`Processed ${back * options.batch} of ${maxIdx + 1}`)
                                                                                        }
                                                                                        if(options.progressCallback){
                                                                                            options.progressCallback({completed: back, total: batchData.length})
                                                                                        }
                                                                                    }
                                                                                )
        const allResults = results.flat()
        console.log(`Got ${results.length} batches back = ${allResults.length}`)
        /*if( allResults.length !== fullContent.length ){
            throw `WARN: Mismtach on batch response ${allResults.length} !== ${fullContent.length} `
        }*/
        return allResults
    }


    let interim = []
    let startIdx = 0
    let endIdx = startIdx

    let content = ""
    let currentCount = 0
    let lastTokensCount = maxTokens
    let targetMaxTokens = maxTokens
    let isReducing = false
    let truncateIdx, truncateCount
    
    do{
        let leave
        let numberInBatch = 0
        do{
            leave = true
            let text = fullContent[endIdx] + (options.joiner ?? "\n")
            let thisTokens = encode( text ).length
            if( ( thisTokens + currentCount ) < maxTokens ){
                numberInBatch++
                leave = false
                content += text
                currentCount += thisTokens
                endIdx++
                if( options.batch && numberInBatch >= options.batch ){
                    leave = true
                }
            }
        }while(!leave && endIdx <= maxIdx)
        endIdx--

        if(startIdx > endIdx ){
            console.log( encode( fullContent[startIdx] ).length)
            console.log("Cant processes chunk - response too large?")
            if( truncateIdx !== startIdx ){
                truncateIdx = startIdx
                truncateCount = 0 
            }
            if( truncateCount < 3){
                truncateCount ++
                console.log(`-- Will try truncating by 10% (attempt ${truncateCount})`)
                fullContent[startIdx]= fullContent[startIdx].slice(0, fullContent[startIdx].length * 0.9)
                endIdx = startIdx
                continue
            }
            startIdx++
            endIdx = startIdx
            maxTokens = targetMaxTokens
            console.log(`Truncation failed - skipping`)
            continue
        }

        lastTokensCount = currentCount
        console.log(`Sending ${startIdx} -> ${endIdx} (${currentCount})`)
        content = (options.contentPrefix ? options.contentPrefix : "") + content + (options.postfix ? "\n" + options.postfix : "")
        if( options.markup){
            content = `<${options.markup}>\n${content}\n</${options.markup}>`
        }
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
            maxTokens = lastTokensCount / 2
            console.log(`----- HIT MAX LIMIT, REDUCING TO ${maxTokens}`)
            if( maxTokens < 40 ){
                throw "Token limit too low - something went wrong"
            }
            endIdx = startIdx
            isReducing = true
        }else{
            if(isReducing){
                console.log(`-- resetting target size post successful process`)
                isReducing = false
                maxTokens = targetMaxTokens
            }

            tokensProcessed += currentCount
            
            if( result.success && result.response ){
                if( options.debug ){
                    console.log(result.response)
                    console.log(field)
                }
                let values = field ? result.response[field] : result.response
                if( values ){
                    if( !Array.isArray(values)){
                        values = [values]
                    }
                    if( options.markPass ){
                        values.forEach((d)=>{
                            if( typeof(d) === "object" ){
                                d._pass = options.inBatch ? options.batchStartOffset + "-" + pass : pass
                            }
                        })
                    }
                    if( options.idField){
                        console.log(`Check ID field ${options.idField} bounds`)
                        values.forEach((d,idx)=>{
                            const sIdx = startIdx + (options.batchStartOffset ?? 0)
                            const eIdx = endIdx + (options.batchStartOffset ?? 0)
                            if( (parseInt(d[options.idField]) < sIdx) || (parseInt(d[options.idField]) > eIdx )){
                                console.log(`FOR CONTENT`)
                                console.log(content)
                                console.log(`-- record has out of bounds id field ${d[options.idField]} vs ${startIdx} ${sIdx} - >${endIdx} / ${eIdx}`)
                            }
                        })

                    }
                    if( options.ensureSameSize){
                        if(values.length !== endIdx - startIdx + 1){
                            console.log(result)
                            console.log( messages)
                            //throw "Mismatch in responze size"
                        }
                    }
                    interim = interim.concat( values )
                    if( options.chunkCallback ){
                        let doNextChunk = options.chunkCallback( values )
                        if( !doNextChunk ){
                            console.log(`Stopping early at current chunk`)
                            return interim
                        }
                    }
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
        if( options.maxTokensToSend ){
            if( currentCount > options.maxTokensToSend){
                console.log(`Stopping for max token limit`)
                return interim
            }

        }
    }while(endIdx < maxIdx )

    return interim

}

async function __executeAI(messages, options = {}){
    const openai = new OpenAI({apiKey: process.env.OPEN_API_KEY})
    let response
    let err
    let sleepBase = 20000
    
    
    //let model = "gpt-4o"
    //let output = 4096

    let model = "gpt-4o-2024-08-06"
    let output = 16384
    let response_format = options.schema ? { "type": "json_schema", "json_schema": options.schema } : { type: "json_object" }

    if( options.engine === "gpt4o-mini" ){
        model = "gpt-4o-mini"
        output = 16384
    }
    if( options.engine === "o3-mini" ){
        model = "o3-mini"
        output = 80000
        response_format = { type: "json_object" }
    }else if( options.engine === "gpt4" ){
        model = "gpt-4-0613"
        output = 4096
    }else if( options.engine === "gpt4t" ){
        model = "gpt-4-turbo-2024-04-09"
        output = 4096
        response_format = { type: "json_object" }
    }else if( options.engine === "gpt3" || options.engine === "gpt3t"){
        model = "gpt-3.5-turbo"
        response_format = undefined
        output = 1536
    }else if( options.engine === "o4-mini" ){
        output = 80000
        response_format = { type: "json_object" }
    }else if( options.engine === "gpt-41" ){
        model = "gpt-4.1"
        output = 32768
        response_format = { type: "json_object" }
    }
    console.log(`Executing ${model}`)
    const request = async ()=>{
        try{
            response = await openai.chat.completions.create({
                model: model,
                response_format,
                temperature: options.temperature || 0.7,
                messages: messages,
                max_tokens: output
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
                await new Promise(r => setTimeout(r, sleepBase * count ));                    
            }else{
                console.log(`++++++ FAILED ++++++`)
            }
        }
    }
    if( response == undefined){
        return {success: false, status: err?.response?.status, error: "UNKNOWN", instructions: messages}
    }

    if( response.status === 200){                
        recordUsage( {workspace: options.workspaceId, functionName: options.functionName, usageId: options.usageId, api: "open_ai", data: response.data})
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
async function executeAI(messages, options = {}){
    const openai = new OpenAI({apiKey: process.env.OPEN_API_KEY})
    let response
    let err
    let sleepBase = 20000
    
    

    let model = "gpt-4o-2024-08-06"
    let output = 16384
    let response_format = options.schema ? { "type": "json_schema", "json_schema": options.schema } : { type: "json_object" }
    let max_tokens = "max_tokens"

    let temperature = options.temperature || 0.7
    if( options.engine === "gpt4o-mini" ){
        model = "gpt-4o-mini"
        sleepBase = 20000
        output = 16384
    }else if( options.engine === "gpt4" ){
        model = "gpt-4-0613"
        response_format = undefined
        sleepBase = 20000
        output = 4096
    }else if( options.engine === "gpt4t" ){
        model = "gpt-4-turbo-2024-04-09"
        output = 4096
        sleepBase = 20000
        response_format = { type: "json_object" }
    }else if( options.engine === "gpt3" || options.engine === "gpt3t"){
        model = "gpt-3.5-turbo"
        sleepBase = 2000
        response_format = undefined
        output = 1536
    }else if( options.engine === "o3-mini" || options.engine === "o4-mini"){
        model = options.engine
        sleepBase = 20000
        output = 80000
        temperature = undefined
        max_tokens = "max_completion_tokens"
        response_format = { type: "json_object" }
        messages = messages.map(d=>{
            return {
                ...d,
                role: d.role === "system" ? "developer" : d.role
            }
        })
    }else if( options.engine === "gpt-41" ){
        model = "gpt-4.1"
        output = 32768
        response_format = { type: "json_object" }
    }
    console.log(`Executing ${model}`)
    

    try {
        // Directly call the OpenAI API method with built-in retry logic

        if( options.stream){
            const stream = await openai.chat.completions.create({
                model: model,
                temperature,
                messages: messages,
                stream: true,
                [max_tokens]: output,
            });
            let buffer = ""
            for await (const chunk of stream) {
                const delta = chunk.choices[0].delta;
                buffer += (delta.content || '');
                options.stream(delta.content)
            }
            response = {
                choices: [
                    { 
                        role: "assistant",
                        message: {content: buffer},
                    }
                ]
            }
        }else{
            response = await openai.chat.completions.create({
                model: model,
                temperature,
                messages: messages,
                response_format: response_format,
                [max_tokens]: output,
            });
        }
    } catch (thisErr) {
        err = thisErr; // Capture the error for returning meaningful information
    }
    
    // Handle the final response or error
    if (!response) {
        return {
            success: false,
            status: err?.response?.status || 500,
            error: err?.response?.data?.error?.message ?? err?.error?.message ??  "UNKNOWN",
            instructions: messages,
        };
    }
    
    // Handle successful responses
    if (response.choices?.[0]?.finish_reason === "length") {
        return { error: true, token_limit: true };
    }
    recordUsage( {workspace: options.workspaceId, functionName: options.functionName, usageId: options.usageId, api: "open_ai", data: response})

    let answers = response.choices?.[0]?.message?.content;
    
    // Extract the content from the response
    try {
        if( answers.startsWith("```json")){
            answers = answers.slice(7, -3)
        }
        const parsedContent = JSON.parse(answers);
    
        return {
            success: true,
            response: parsedContent,
            instructions: messages[2],
            raw: answers,
        };
    } catch (error) {
        console.error("Failed to parse JSON:", error.message);
        console.error("Answers:", answers);
    
        return {
            success: false,
            error: "Couldn't parse JSON",
            raw: answers,
            instructions: messages,
        };
    }

}

export  async function categorize(list, categories, options = {} ){
    if( options.batch && options.batch > 1){
        return __categorize(list,categories, options)
    }
    const targetType = options.types || "item"
    const match = options.matchPrompt ?? `here is some information about a ${options.longType ?? targetType}. Assess how well the item aligns with the candidate categories based on ${options.literal ? "a string similarirty" : "conceptual similarity"}.`
    const scoreMap = ["Not", "Hardly", "Somewhat", "Likely", "Clear"]

    let instructions = `
    Assessment Scale:\n
    - 0: No ${options.literal ? "string" : "conceptual"} alignment.
    - 1: Minimal ${options.literal ? "string" : "conceptual"} similarity.
    - 2: Some ${options.literal ? "string aignment" : "conceptual elements shared"}.
    - 3: Significant ${options.literal ? "string" : "conceptual"} alignment.
    - 4: Perfect ${options.literal ? "string" : "conceptual"} alignment.
    
    Steps:\n
    1. Carefully analyze the provided information 
    2. Compare the item to each and every category in turn - considering only the information that has been provided${(options.literal && options.theme) ? ` Ensure you specifically focus on the '${options.theme}'` : ""}
    3. Assign an assessment score for every category using the provided scale 
    4. Review and correct mistakes`

    if( options.complex){
        instructions += `Return your results in a JSON object with the following structure:{a:[{c: <<category id as provided to you - e.g 0>>,s: <<assessment score of item for this category>>,r:<<5 word rationale for the score for this category>>},...<<assessments for each and every remaining category - there should be ${categories.length} in total>>] }`
    }else{
        instructions += `Return your results in a JSON object with the following structure: {a:[{c: <<id of category, as provided to you, with highest score>>,s: <<assessment score associated with the catgeory with the highest score>,r:<<15 word rationale for score for winning category>>}]}`
    }
    const interim = await processInChunk( list, 
            [
                {"role": "system", "content": match},
                {"role": "user", "content": `Here is the list of numbered ${options.longType ?? targetType}s: `}
            ],
            [
                {"role": "user", "content": `And here are a list of numbered categories:\n ${categories.map((d,idx)=>`${idx}. ${d}`).join("\n")}`},
                {"role": "user", "content": instructions}
            ],
            {wholeResponse: true, engine:  options.engine, batch: 1, temperature: 0.6, ...options})

    let remap
    if( options.numerical ){
        remap = interim.map((d,idx)=>{
            return {id: idx, a: d.a?.map((d,i)=>({c: d.c, r:d.r, s: d.s}))}
        })
    }else{
        remap = interim.map((d,idx)=>{
            return {id: idx, a: d.a?.map((d,i)=>({c: d.c, r:d.r, s: scoreMap[d.s]}))}
        })
    }
        
    return remap
}

export  async function __categorize(list, categories, options = {} ){
    const targetType = options.types || "item"
    let match = options.matchPrompt ?? `I am categorizing a list of numbered ${options.longType ?? targetType}s. Assess how well each item aligns with the candidate categories based on ${options.literal ? "a string similarirty" : "conceptual similarity"}`
    if( options.theme){
        if( options.literal ){
            match += `. When undertaking you assessment consider ${options.theme} of each item.`
        }
        else{
            match += `. The theme for categorization is ${options.theme}.`
        }
    } 
    const scoreMap = ["Not", "Hardly", "Somewhat", "Likely", "Clear"]

    let instructions = `
    Assessment Scale:\n
    - 0: No ${options.literal ? "string" : "conceptual"} alignment.
    - 1: Minimal ${options.literal ? "string" : "conceptual"} similarity.
    - 2: Some ${options.literal ? "string aignment" : "conceptual elements shared"}.
    - 3: Significant ${options.literal ? "string" : "conceptual"} alignment.
    - 4: Perfect ${options.literal ? "string" : "conceptual"} alignment.
    
    Steps:
    1. Each item has been numbered with all data for that item on a single line following the number
    2. Compare each and every item to each and every category in turn - considering only the information that has been provided for this specific item.${(options.literal && options.theme) ? ` Ensure you specifically focus on the '${options.theme}' of the item` : ""}
    3. Assign an assessment score for each item for every category using the provided scale 
    4. Review and correct mistakes
    5. Do this for every item`

    if( options.complex){
        instructions += `
        
        Return your results in a JSON object called results with the following structure:
        [
            {
                id: <<id for this item as provided to you>>,
                a:[ 
                    {
                        c: <<category id as provided to you - e.g 0>>,
                        s: <<assessment score of item for this category>>,
                        r:<<15 word rationale for the score for this item for this category>>,
                    },
                    ...<<assessments for each and every remaining category - there should be ${categories.length} in total>>
                ] 
            },
            ...<<entries for each and every remmaining item>>
        ]`
    }else{
        instructions += `
        
        Return your results in a JSON object called results with the following structure:
        [
            {
                id: <<item id as provided to you>>,
                a:[ 
                    {
                        c: <<id of category, as provided to you, with highest score>>,
                        s: <<assessment score for item associated with the catgeory with the highest score>,
                        r:<<5 word rationale for score for winning category>>
                    }
                ] 
            },
            ...<<entries for each and every remmaining item>>
        ]`
    }
    const interim = await processInChunk( list, 
            [
                {"role": "system", "content": match},
                {"role": "user", "content": `Here is the list of numbered ${options.longType ?? targetType}s: `}
            ],
            [
                {"role": "user", "content": `And here are a list of numbered categories:\n ${categories.map((d,idx)=>`${idx}. ${d}`).join("\n")}`},
                {"role": "user", "content": instructions}
            ],
            {field: "results", engine:  options.engine, batch: 30, temperature: 0.6, ...options})

    const remap = options.numerical ? interim : interim.map(d=>{
        return {id: d.id, a: d.a?.map((d,i)=>({c: d.c, r:d.r, s: scoreMap[d.s]}))}
    })
        
    return remap
}
function repackLongText( text, options ){
    let list = text.split(`\n`)
    let maxTokens = tokensForModel(options.engine)
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

        if( singlePrompt ){            responseInstructions = `Return your results in a json object with a `
        }else{
            responseInstructions = `Return your results in a json object with a field for each task which contains a `
        }
        
        //responseInstructions += `field called 'answered' set to the number of ${responseQualifier}, and an 'answers' field which is an array of problems for that task (if any), with each entry being an object with the following fields: a 'quote' field containing no more than the first 30 words of the exact text from the article used to produce the answer without correcting bad spelling or grammar or altering the text in anyway,  and a '${field}' field containing the problems you identify in the form 'It sucks that...'.Do not put anything other than the raw JSON in the response `
        //responseInstructions += `field called 'answered' set to the number of ${responseQualifier}, and an 'answers' field which is an array of ${field}s for that task (if any), with each entry being an object with the following fields: a 'quote' field containing no more than the first 30 words of the exact text from the article used to produce the answer without correcting bad spelling or grammar or altering the text in anyway${fieldList}.Do not put anything other than the raw JSON in the response `
        responseInstructions += `field called 'answered' set to the number of ${responseQualifier}, and an 'answers' field which is an array of ${field}s for that task (if any), with each entry being an object with the following fields:  a 'quote' field citing the full portion of the text used to produce this specific answer without correcting bad spelling or grammar or altering the text in anyway other than limiting it to the first 100 words of the used text${fieldList}.Do not put anything other than the raw JSON in the response `

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
export async function generateImage(prompt, options = {}, tries = 3){
    if( !prompt || prompt.length === 0){
        return {success: false}
    }

    const openai = new OpenAI({
        apiKey: process.env.OPEN_API_KEY
    })

    const sizes = {
    }

    let size = {"wide": "1792x1024", "square":"1024x1024", "tall":"1024x1792"}[options.size] 
    
    try{
        let fullprompt = "I NEED to test how the tool works with extremely simple prompts. DO NOT add any detail, just use it AS-IS:" + prompt
        console.log(`Build image `, fullprompt)

        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: fullprompt,
            size: size,
            response_format: "b64_json"
        });
        console.log(response?.data)

        if( response && response.data){

            const parsedJson = response.data[0].b64_json
            const base64Image = parsedJson.split(';base64,').pop();
            const imageBuffer = Buffer.from(base64Image, 'base64');

            const newPrompt = response.data[0].revised_prompt ?? fullprompt

            return {success: true, data: imageBuffer, prompt:  newPrompt, updatedPrompt: newPrompt !== fullprompt}
        }
        return {success: false}
    }catch(error){
        console.log(`error in generateImage`)
        console.log(error)
        if( tries > 0){
            console.log(`open_ai_helper: got error - sleep and will retry`)
            await new Promise(r => setTimeout(r, 2000));                    
            return await generateImage( prompt, options, tries - 1)
        }
        return {success: false}
    }
    
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
        
        //responseInstructions += `an 'answered' field set to true if you found an answer to the specific ${promptType} - otherwise set to false${skipQuote ? "" : `, a 'quote' field containing no more than the first 30 words of the exact text${options.sourceType ? ` from the ${options.sourceType}` : ""} used to produce the answer without correcting bad spelling or grammar or altering the text in anyway`}${fieldList}.Do not put anything other than the raw JSON in the response .`        
        responseInstructions += `an 'answered' field set to true if you found an answer to the specific ${promptType} - otherwise set to false${skipQuote ? "" : `, a 'quote' field citing the entirety of the text used to produce this specific answer without correcting bad spelling or grammar or altering the text in anyway other than limiting it to the first 100 words of the text${options.sourceType ? ` from the ${options.sourceType}` : ""} used to produce the answer without correcting bad spelling or grammar or altering the text in anyway`}${fieldList}.Do not put anything other than the raw JSON in the response .`        
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
export async function buildEmbeddings( text, attempt = 3 ){
    if( !text ){
        return {success: true, embeddings: undefined}
    }
    text = typeof(text) === "string" ? text.trim() : `${text}`
    if( !text ){
        return {success: true, embeddings: undefined}
    }

    try{
        
        const openai = new OpenAI({
            apiKey: process.env.OPEN_API_KEY,
            timeout: 5000,
            maxRetries: 3
        })

        const response = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: text,
        });
        if( response.data?.[0]?.object === "embedding"){
            return {success: true, embeddings: response.data[0].embedding}
        }
        return {success: false, raw: response}
    }catch(error){
        console.log('Error in buildEmbeddings')
        console.log(error)
        if( attempt > 0){
            console.log(`Retry ${attempt}`)
            return await  buildEmbeddings( text, attempt - 1)

        }
    }
}