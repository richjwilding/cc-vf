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

        parseRessponse(response){
            let active
            let activePrompt 
            let errors = []
            let out = []
            response.split(`\n`).filter((d)=>d && d!== "").forEach((t)=>{
                let m = t.match(/Q(\d+)\.(.*)/)
                if( m ){
                    const idx = m[1]
                    activePrompt = this.prompts[idx - 1]
                    active = {id: activePrompt.id, categoryId: activePrompt.categoryId, response: m[2]?.trim() }
                    out.push(active)
                }else{
                    if( active ){
                        active.details = active.details || []
                        const m = t.match(/\d+\.(.*)/)
                        if( m ){
                            t = m[1]
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
                        if( t.length > 0){
                            active.details.push( t )
                        }
                    }else{
                        errors = errors || []
                        errors.push(t)
                    }
                }
            })
            out = out.filter((d)=>d.details && (d.details.length > 1 || d.details[0] !== "UNCLEAR"))

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
                {"role": "user", "content": `here is a document: ${this.text}`},
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
            if( options.asQuestion ){
                messages.push( 
                    {"role": "user", "content": `Provide brief answers to the following questions. Answer 'UNCLEAR' if you cant answer the question: ${prompts.join("\n")}`},
                )
            }else{
                messages.push( 
                    {"role": "user", "content": `Answer the following prompts. Provide answers as a list - or if the document doesnt include an answer state "UNCLEAR" without further details. Include the prompt number in the response but not the prompt itself. Do not provide any other explanation or justification. Prompts: ${prompts.join("\n")}`},
                )
            }

            console.log("ready")
            this.response = await this.openai.createChatCompletion({
                model:"gpt-3.5-turbo",
                temperature: 0.6,
                messages: messages
                });
            console.log("back")
            
            if( this.response.status === 200){
                this.answers = this.response.data?.choices[0]?.message?.content
                console.log(this.answers)
                let active = undefined
                if( this.answers ){
                    this.answers = this.parseRessponse( this.answers )
                }
                return this.answers
            }
            return "ERROR"            
        }        
    }    
    return obj
}