import GoogleHelper from "./GoogleHelper"
import MainStore from "./MainStore"
import OpenAIAnalysis from "./OpenAIAnalysis"
export default function ResultAnalyzer(primitive){


/*

The text is a transcript including questions and responses.  Update the transcript to demarcate questions and answers. 

The text is a transcript including questions and responses - ignore questions when answering prompts. Here are some prompts: Q1. A maximum  of4 problems related to data granularity, in the form "It sucks that..."
Q2. A maximum of 4 problems related to data provenance, in the form "It sucks that..."
Q3. A maximum of 4  problems related to the weather, in the form "It sucks that..."

Provide the response in json format where each prompt contains an array of results and with each result having a "quote" field containing the original text and a "problem" field containing the problem you identify.  If there is no result for a specific question set the "quote" field to "none" and omit the "problem" field


The text is a transcript including questions and responses.  Here are some prompts: Q1. A maximum  of 10 problems related to data granularity, in the form "It sucks that..."
Q2. A maximum of 10 problems related to data provenance, in the form "It sucks that..."
Q3. A maximum of 10 problems related to the weather, in the form "It sucks that..."

Provide the response in json format where each the key for each prompt is the prompt number and each prompt contains an array of results and with each result having a "quote" field containing the original text and a "problem" field containing the problem you identify.  If there is no result for a specific question set the "quote" field to "none" and omit the "problem" field.  Do not use text from questions in the transcript when forming your response.
*/

    let obj ={
        buildPath:function(id){
            const last = (id !== undefined) ? {openai: id} : "openai"
            return {processed: last}
        },
        init:function(){
            const origin = primitive.origin
            if( !origin ){
                throw new Error("Couldnt retrieve origin")
            }
            this.questions = origin.primitives.allQuestion
            console.log(this.questions)
            this.evidencePrompts = this.questions.map((d)=>{
                return d.primitives.allPrompt.map((d)=>{
                    const config = d.metadata
                    let prompt
                    if( config === undefined ){return}
                    if( d.title ){
                        prompt = config.base.replace("${t}", d.title)
                    }else{
                        prompt = config.empty
                    }
                    prompt = prompt.replace("${n}", d.referenceParameters?.count || d.metadata?.parameters?.count?.default)
                    return {
                        id: d.id, 
                        prompt: prompt,
                        resultCategoryId: d.referenceParameters.category
                    }
                })
            }).filter((d)=>d).flat()
            this.openai = OpenAIAnalysis
            return obj
        },
        fetchText:async function(){
            if( primitive.referenceParameters.notes.type === "google_drive"){
                return await GoogleHelper().getDocument( primitive.referenceParameters.notes, "text/plain")
            }
            return undefined
        },
        text:async function(){
            if( !this._text ){
                this._text = (await this.fetchText()).replaceAll('"', "'")
            }
            return this._text
        },
        discoverDetails:async function(){
            const prompts = [
                "What is the name of the person (or main person) being interviewed?",
                "What is the role of the person (or main person) being interviewed?",
                "Which company of organisation does the person being interviewed work for?",
                "Now produce a single paragraph summary of the interviewees responses, for this prompt you can ignore the previous instruction about UNCLEAR",
            ].map((d, idx)=>{return {id: ["name","role","company","summary"][idx], prompt: d}})
            const result = await this.prompt( prompts, {intro: "Here is a transcript of an interview. A question is numbered followed by the interviewee response.  Ignore text that doesnt belong to a question or answer:"} )
            return result
        },
        doDiscovery:async function(options = {force: false}){
            if( primitive.discoveryDone && !options.force){return}

            const response = await this.discoverDetails()

                if(response.status === "token_limit"){
                    primitive.setField("openai_token_limit", true)
                }else{
                    if( primitive.openai_token_limit){
                        primitive.setField("openai_token_limit", null)
                    }
                }                    
            const details = response.response
            const mainstore = MainStore()
            if( details ){

                for( const d of details){
                    const response = (d.details && d.details[0] && d.details[0].length > 0) ? d.details[0] : d.response
                    console.log(d.id, response)
                    if( response ){
                        if( d.id === "name"){
                            let contact = mainstore.contacts().find((c)=>c.name === response)
                            if( contact === undefined ){
                                contact = await mainstore.createContact({name: response})
                            }
                            primitive.setParameter( "contactId", contact ? contact.id : null)
                        }else if( d.id === "summary"){
                            primitive.setField( d.id, response)
                        }else{
                            primitive.setParameter( d.id, response)
                        }
                    }
                }
                primitive.setField( "discoveryDone", true )
            }
        },
        unresolvedEvidencePrompts:function(options){
            const evidence = primitive.primitives.fromPath(obj.buildPath())
            let inscope = this.evidencePrompts
            if(evidence){
                const present = Object.keys( evidence )
                inscope = inscope.filter((d)=> options.force || (!present.includes(`${d.id}`) || (evidence[d.id].allIds.length === 0)))
            }
            return inscope
        },
        evidence:async function(options = {force: false, complete: true, commit: true}){
            if( this.evidencePrompts === undefined){return undefined}
            const inscope = this.unresolvedEvidencePrompts(options)

            
            console.log(`${inscope.length} prompts incomplete`)

            if( (inscope.length > 0 && options.complete) || (inscope.length === this.evidencePrompts.length )){ 
                let response = await this.prompt( inscope )
                if( typeof(response) !== "object"){return undefined}

                let result = response.response
                if(response.status === "token_limit"){
                    primitive.setField("openai_token_limit", true)
                }else{
                    if( primitive.openai_token_limit){
                        primitive.setField("openai_token_limit", null)
                    }
                }                    
                

                console.log(result)
                const mainstore = MainStore()

                if( options.commit ){
                    result.forEach(async (d,idx)=>{
                        const path = obj.buildPath(d.id)
                        if( !d.details ){
                            if( d.response && d.response !== "UNCLEAR"){
                                d.details = [d.response]
                            }
                        }
                        if( d.details ){
                            await d.details.forEach(async (item, idx)=>{
                                await mainstore.createPrimitive({
                                    parent: primitive,
                                    type: "evidence",
                                    parentPath: path,
                                    title: item,
                                    categoryId: d.categoryId,
                                    extraFields: {source: "openai", quoted: d.quotes, tags: d.tags}
                                })
                            })
                        }
                    })
                    primitive.setField("raw_evidence", result)
                }else{
                    return result
                }
            }

            return primitive.primitives.fromPath({processed: "openai"})
        },
        prompt:async function(prompts, options ){
            let rawText = await this.text()

            const go = async ()=>{

                const oa =  OpenAIAnalysis({
                    text: rawText,
                    prompts: prompts,
                    ...options
                })
                return await oa.process()
            }
            
            let responses = await go()
            let count = 5
            let didTruncate = false
            while( responses === 400 && count > 0 ){
                console.log(`Text too long - truncating`)
                count --
                rawText = rawText.substring(0, rawText.length * 0.75 )
                didTruncate = true

                responses = await go()
            }
            if( didTruncate && responses ){
                responses.status = "token_limit"
            }
            console.log(responses)
            return responses
        }
    }
    return obj
}