import MainStore from "./MainStore";

const { Configuration, OpenAIApi } = require("openai");

export default function OpenAIAnalysis(options){
    const configuration = new Configuration({
        apiKey: MainStore().env.OPEN_API_KEY,
      });
    
    let obj = {
        text: options.text,
        prompts: options.prompts,
        asQuestion: options.asQuestion,
        openai: new OpenAIApi(configuration),
        questions: [],

        parseResponse(response){
            let active
            let activePrompt 
            let errors = []
            let out = []
            let letterStart = false
            response.split(`\n`).filter((d)=>d && d!== "").forEach((t)=>{
                let m = t.match(/(Q|^)(\d+)\.\s*(.*)/)
                let parseNext = true
                if( m ){
                    if( m[1] === "Q"){
                        letterStart = true
                    }
                    if( letterStart && m[1] !== "Q"){
                        parseNext = true
                    }else{
                        parseNext = false

                        const idx = m[2]
                        activePrompt = this.prompts[idx - 1]
                        let response = m[3]?.trim() 
                        if( response.slice(-1) === "."){
                            response = response.substring(0, response.length - 1)
                        }
                        if( activePrompt ){
                            active = {id: activePrompt.id, categoryId: activePrompt.categoryId, tags: activePrompt.tags, response: response }
                            out.push(active)
                        }else{
                            console.warn(`couldnt parsefind prompt for ${idx}`, t)
                            debugger
                        }
                    }
                }
                if(parseNext){
                    if( active ){
                        active.details = active.details || []
                        const m = t.match(/(A|\d+)\.(.*)/)
                        if( m ){
                            t = m[2]
                        }
                        const m2 = t.match(/[\":\'](.+)[\":\']/)
                        if( m2 ){
                            t = m2[1]
                            active.quotes = true
                        }
                        if( t[0]==="-" ){ 
                            t = t.slice(1)
                        }
                        t = t.trim()
                        if( t.slice(-1) === "."){
                            t = t.substring(0, t.length - 1)
                        }
                        if( t.length > 0 && t.slice(0, "UNCLEAR".length) !== "UNCLEAR"){
                            active.details.push( t )
                        }
                    }else{
                        errors = errors || []
                        errors.push(t)
                    }
                }
            })
            out = out.filter((d)=>(d.details && (d.details.length > 1 || d.details[0] !== "UNCLEAR")) || (!d.details && d.response))

            return out 
        },
        process: async function(){
            if( this.text === undefined ){
                console.warn('No text set')
                return
            }
            if( this.prompts === undefined ){
                console.warn('No prompts set')
                return
            }
            let messages = [
                {"role": "user", "content": `${options.intro || 'here is a document:'} ${this.text}`},
            ]

            const prompts = this.prompts.map((p, idx)=>{
                let base = p.prompt.trim()
                if( this.asQuestion ){
                    if( base.slice(-1) !== "?"){
                        base += "?"
                    }
                }
                return `Q${idx+1}. ${base}`
            })
            if( options.setup ){
                    messages.push( 
                        {"role": "user", "content": `${options.setup}: ${prompts.join("\n")}`},
                        )

            }else{
                if(options.setup){
                    messages.push( 
                        {"role": "user", "content": `${options.setup}: ${prompts.join("\n")}`},
                        )
                }else{

                    if( options.asQuestion ){
                        messages.push( 
                            {"role": "user", "content": `Provide brief answers to the following questions. Answer 'UNCLEAR' if you cant answer the question: ${prompts.join("\n")}`},
                            )
                    }else{
                        messages.push( 
                            {"role": "user", "content": `Answer the following prompts. Provide answers as a list - or if the document doesnt include an answer state "UNCLEAR" without further details. Include the prompt number in the response but not the prompt itself. Do not provide any other explanation or justification. Do not repeat answers already given in earlier prompts. Prompts: ${prompts.join("\n")}`},
                            )
                    }
                }
            }
            console.log(messages)
                        
            const request = async ()=>{
                try{
                   this.response = await this.openai.createChatCompletion({
                        model:"gpt-3.5-turbo",
                        temperature: 0.6,
                        messages: messages
                    });
                    console.log('back')
                }catch(error){
                    if( error.message === "Request failed with status code 400"){
                        console.log(error)
                        this.response = {status: 400}
                        return
                    }
                }
            }
            let count = 3
            try{
                await request();
                    console.log('back2')
            }catch{
                count--
                if( count > 0){
                    console.log(`got error - sleep and will retry`)
                    await new Promise(r => setTimeout(r, 2000));                    
                    await request()
                }
            }
            console.log(this.response)

            if( this.response.status === 200){                
                this.answers = this.response.data?.choices[0]?.message?.content
                if( options.raw ){
                    return this.answers 
                }
                let active = undefined
                if( this.answers ){
                    this.answers = this.parseResponse( this.answers )
                    if( this.answers.length === 0){
                        console.warn(`no answers parsed`)
                    }
                }
                if( this.response.data.usage.total_tokens === 4097 ){
                    return {response: this.answers, status: "token_limit"}
                }
                return {response: this.answers, status: "ok"}
            }
            if( this.response.status === 400 ){
                return 400
            }
            return "ERROR"            
        }        
    }    

    const tests = [
        {
            status: 200,
            data: {choices: [{message:{content:
                `Q1. 5 user needs, in the form of "Need to...."\n1. Need to understand how errors occur as data is processed, handled, and transformed across multiple internal and external sources.\n2. Need to identify pain points in day to day processes and the impact of those errors.\n3. Need to increase the level of confidence in incoming/outgoing data.\n4. Need to identify areas of disconnect and the opportunity that solving those disconnects may provide.\n5. Need to better meet organizations’ needs related to data error.\n \nQ2. Up to 10 detailed quotes from the document about problems the user has\n1. "One challenge in particular is trying to unify a specific record about an individual."\n2. "Everyone has a slightly different view of headcount for the organization."\n3. "Because the way our data is stored is siloed, any changes I make won’t carry through to other members of the department."\n4. "The data quality issue is the most impactful."\n5. "None of these data sets are really joined up."\n6. "You kind of assume that there is lot more connection between data sets and data sources than their actually are."\n7. "It is a problem across government, private, etc…"\n8. "Things that stray into legal questions are very complicated, maybe steer clear of those."\n9. "For pii it wasn’t a good solution for us."\n10. "Trying to implement consistency and drive data quality."\n\nQ3. 5 problems related to entity resolution, in the form "It sucks that..."\n1. It sucks that trying to unify a specific record about an individual is challenging.\n2. It sucks that everyone has a slightly different view of headcount for the organization.\n3. It sucks that the way data is stored is siloed, making it difficult to carry changes through to other departments.\n4. It sucks that there is a lack of connection between data sets and sources.\n5. It sucks that reconciling data to a single individual is a problem across government and private sectors.\n\nQ4. 5 problems related to data schemas and mapping, in the form "It sucks that..."\n1. It sucks that everyone has their own version of the truth, making it difficult to transform data.\n2. It sucks that there is a lack of consistency in data sets across the organization.\n3. UNCLEAR\n4. UNCLEAR\n5. UNCLEAR\n\nQ5. 5 problems related to data granularity or provenance, in the form "It sucks that..."\n1. It sucks that there are issues with data quality and completeness.\n2. It sucks that there are disconnects between different data sets and sources.\n3. UNCLEAR\n4. UNCLEAR\n5. UNCLEAR\n\nQ6. 5 problems related to knowledge management, in the form "It sucks that..."\n1. It sucks that there is a lack of understanding and retention of data stored and utilized through human interactions.\n2. It sucks that there are challenges with sharing data between government departments.\n3. UNCLEAR\n4. UNCLEAR\n5. UNCLEAR`
            }}]}
        },
        {
            status: 200,
            data: {choices: [{message:{content:
                `Q1.\n1. Need to track users and understand if they achieve goals on the government website\n2. Need to embed data science techniques into government services\n3. Need to share data and create APIs between government departments\n4. Need to implement consistency and drive data quality\n5. Need to have one single view of standardized data sets\n\nQ2.\n1. "Teams are primarily working on how they can track users, and try to understand whether they achieve the goals they set out to achieve on the government website"\n2. "Trying to implement consistency and drive data quality"\n3. "One challenge in particular is trying to unify a specific record about an individual. They might be represented in different ways throughout different systems"\n4. "Everyone has a slightly different view of headcount for the organization"\n5. "Because the way our data is stored is siloed, any changes I make won’t carry through to other members of the department"\n6. "The data quality issue is the most impactful"\n7. "None of these data sets are really joined up"\n8. "You kind of assume that there is lot more connection between data sets and data sources than their actually are"\n9. "It is a problem across government, private, etc..."\n10. "Things that stray into legal questions are very complicated, maybe steer clear of those"\n\nQ3.\n1. It sucks that a specific record about an individual might be represented in different ways throughout different systems\n2. It sucks that there is no connection between data sets and data sources\n3. It sucks that different versions of the truth exist in different systems\n4. It sucks that changes made to data won't carry through to other members of the department\n5. It sucks that reconciling data to a single individual is a problem across government and private sectors\n\nQ4.\n1. It sucks that there is no single view of standardized data sets\n2. It sucks that a data marketplace can't be used for PII\n3. UNCLEAR\n4. UNCLEAR\n5. UNCLEAR\n\nQ5.\n1. It sucks that none of the data sets are really joined up\n2. It sucks that there is no connection between data sets and data sources\n3. UNCLEAR\n4. UNCLEAR\n5. UNCLEAR\n\nQ6.\n1. It sucks that a specific record about an individual might be represented in different ways throughout different systems\n2. It sucks that there is no connection between data sets and data sources\n3. It sucks that different versions of the truth exist in different systems\n4. It sucks that changes made to data won't carry through to other members of the department\n5. It sucks that reconciling data to a single individual is a problem across government and private sectors`
            }}]}
        }
    ]

    return obj
}