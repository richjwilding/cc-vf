import GoogleHelper from "./GoogleHelper"
import MainStore from "./MainStore"
import OpenAIAnalysis from "./OpenAIAnalysis"
export default function ResultAnalyzer(primitive){
    let obj ={
        buildPath:function(id){
            const last = (id !== undefined) ? {openai: id} : "openai"
            return {processed: last}
        },
        init(){
            return obj
        },
        doDiscovery:async function(options = {force: false}){
            if( primitive.discoveryDone && !options.force){return}
            //primitive.setField("openai_token_limit", true)
            const mainstore = MainStore()

            let hasError = false
//            primitive.setField( "discoveryDone", null )
  //          primitive.setField("ai_processing", {state: "underway", process:"discovery", started: new Date})
            const response = await primitive.doDiscovery()
            console.log(response)

            if( response && response.success ){
                for( const key of Object.keys(response.result.response) ){
                    const answer = response.result.response[key]?.answer
                    if( key === "name"){
                        if( !["[name]", "none", "unknown", "n/a", "unspecified", "na"].includes(answer.toLowerCase())){

                            let contact = mainstore.contacts().find((c)=>c.name === answer)
                            if( contact === undefined ){
                                contact = await mainstore.createContact({name: answer})
                            }
                            primitive.setParameter( "contactId", contact ? contact.id : null)
                        }
                    }else if( key === "summary"){
                        primitive.setField( key, answer)
                    }else{
                        primitive.setParameter( key, answer)
                    }
                }
             //   primitive.setField( "discoveryDone", true )
            }
         //   primitive.setField("ai_processing", hasError ? {state: "error"}  : null)
        },
        aiProcessSummary:function(){
            let origin = primitive.origin
            if( origin === undefined){return undefined}
            let evidenceList = primitive.primitives.allEvidence
            let questions = origin.primitives.allQuestion
            let promptList = questions.map((d)=>d.primitives.allPrompt).flat()

            const reduce = (set)=>{
                return set.reduce((o, c)=>{
                    if( c.evidence && c.evidence.length > 0){
                        if( o[c.prompt.id] ){
                            o[c.prompt.id] = o[c.prompt.id].concat(c.evidence)
                        }else{
                            o[c.prompt.id] = c.evidence
                        }
                    }
                    return o
                }, {})
            }

            const byPrompt = promptList.map((p)=>{
                return {
                    prompt: p,
                    evidence: evidenceList.filter((e)=>e.parentRelationship(p) !== undefined)
                }})

            return {
                processed: promptList.map((p)=>primitive.ai_prompt_track && primitive.ai_prompt_track[p.id] ? p.id : undefined ).filter((d)=>d).reduce((a,c)=>{a[c]=1;return a},{}),
                unprocessed: promptList.map((p)=>primitive.ai_prompt_track && primitive.ai_prompt_track[p.id] ? undefined : p.id ).filter((d)=>d).reduce((a,c)=>{a[c]=1;return a},{}),
                byPrompt: reduce(byPrompt),
                byQuestion: reduce(byPrompt.map((p)=>{
                    return {
                        prompt: p.prompt.origin,
                        evidence: p.evidence,
                    }
                }))
            }
        },
        promptList:function( questionFilter = undefined){
            let origin = primitive.origin
            let questions = origin.primitives.allQuestion
            if( questionFilter ){
                const ids = questionFilter.map((d)=>d.id)
                questions = questions.filter((d)=>ids.includes(d.id))
            }
            
            return questions.map((d)=>d.primitives.allPrompt).flat() 
        },
        aiGeneratedEvidence:function( questionFilter = undefined){
            let evidenceList = primitive.primitives.allEvidence
            const promptList = this.promptList( questionFilter )
            return evidenceList.filter((p)=>{
                return promptList.filter((p2)=>p.parentRelationship(p2) !== undefined).length > 0
            })

        },
        analyzeQuestions:async function(clearFirst = true, questionFilter = undefined){
            const mainstore = MainStore()
            if( clearFirst ){
                const existing = this.aiGeneratedEvidence( questionFilter )
                console.warn(`Removing existing evidence (${existing.length}) associated with current question set - may not be all`)
                for(const p of existing){
                    await mainstore.removePrimitive(p)
                }
            }
            const ids = questionFilter ? questionFilter.map((d)=>d.id) : undefined
            for( const p of this.promptList(questionFilter)){
                await primitive.setField(`ai_prompt_track.${p.id}`, null)
            }
            primitive.setField("ai_processing", {state: "underway", process:"questions", started: new Date})

            let hasError = false
            let errors = []
            const response = await primitive.doQuestionsAnalysis( ids )
            console.log(response)
            const promptTracker = {}
            if( response && response.success ){
                for( const set of response.result){
                    console.log(`Got set of results for category ${set.categoryId}`)
                    if( set.result === undefined ){
                        hasError = true
                        errors.push(`Error - no results for categry ${set.categoryId}`)
                    }else{
                        for( const promptSet of set.result ){
                            const prompt = mainstore.primitive(promptSet.id)
                            if( prompt ){
                                const resultField= prompt.metadata?.openai?.field || "problem"
                                promptTracker[ prompt.id ] = true
                                console.log(`--- got ${promptSet.results?.length} results for ${prompt.plainId}`)
                                if( promptSet.results === undefined ){
                                    hasError = true
                                    errors.push(`Error - no results for ${promptSet.results?.length} for ${prompt.plainId}`)
                                }else{
                                    for( const response of promptSet.results ){
                                        console.log(`${resultField} = ${response[resultField]}`)
                                        console.log(response.quote)
                                        if( (response[resultField] == undefined) || (response[resultField] === "none") || (response.quote === 'none')){
                                            continue;
                                        }
                                        const newPrim = await mainstore.createPrimitive({
                                            parent: primitive,
                                            type: "evidence",
                                            title: Array.isArray(response[resultField]) ? response[resultField].map((d,idx)=>`${idx+1}) ${d}`).join(" ") : response[resultField],
                                            categoryId: prompt.metadata?.openai?.resultCatgeory,
                                            referenceParameters: {highlightAreas: response.highlightAreas, scale: response.scale},
                                            extraFields: {source: "openai", quoted: true, quote: response.quote}
                                        })
                                        if( newPrim ){
                                            prompt.addRelationship(newPrim, "auto" )
                                        } 
                                    }
                                }
                            }
                        }
                    }
                }
                for(const p of Object.keys(promptTracker)){
                    await primitive.setField(`ai_prompt_track.${p}`, promptTracker[p])
                }
                primitive.setField("ai_processing", hasError ? {state: "error", errors: errors}  : null)
            }

        },
    }
    return obj
}