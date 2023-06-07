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
            return
                      
        }        
    }    

    return obj
}