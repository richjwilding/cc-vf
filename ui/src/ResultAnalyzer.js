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
        aiProcessSummary:function(){
            let evidenceList = primitive.primitives.allEvidence
            let origin = primitive.origin
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
                processed: promptList.map((p)=>primitive.ai_prompt_track && primitive.ai_prompt_track[p.id] ? p.id : undefined ).filter((d)=>d),
                unprocessed: promptList.map((p)=>primitive.ai_prompt_track && primitive.ai_prompt_track[p.id] ? undefined : p.id ).filter((d)=>d),
                byPrompt: reduce(byPrompt),
                byQuestion: reduce(byPrompt.map((p)=>{
                    return {
                        prompt: p.prompt.origin,
                        evidence: p.evidence,
                    }
                }))
            }
        },
        aiGeneratedEvidence:function( questionFilter = undefined){
            let evidenceList = primitive.primitives.allEvidence
            let origin = primitive.origin
            let questions = origin.primitives.allQuestion
            if( questionFilter ){
                const ids = questionFilter.map((d)=>d.id)
                questions = questions.filter((d)=>ids.includes(d.id))
            }
            let promptList = questions.map((d)=>d.primitives.allPrompt).flat()

            return evidenceList.filter((p)=>{
                return promptList.filter((p2)=>p.parentRelationship(p2) !== undefined).length > 0
            })

        },
        analyzeQuestions:async function(clearFirst = true, questionFilter = undefined){
            const mainstore = MainStore()
            if( clearFirst ){
                const existing = this.aiGeneratedEvidence( questionFilter )
                console.warn(`Removing existing evidence associated with current question set - may not be all`)
                for(const p of existing){
                    await mainstore.removePrimitive(p)
                }
            }
            const ids = questionFilter ? questionFilter.map((d)=>d.id) : undefined
            primitive.setField("ai_processing", {state: "underway", started: new Date})

            const response = await primitive.doQuestionsAnalysis( ids )
            console.log(response)
            const promptTracker = {}
            if( response && response.success ){
                for( const set of response.result){
                    console.log(`Got set of results for category ${set.categoryId}`)
                    for( const promptSet of set.result ){
                        const prompt = mainstore.primitive(promptSet.id)
                        if( prompt ){
                            const resultField= prompt.metadata?.openai?.field || "problem"
                            promptTracker[ prompt.id ] = true
                            console.log(`--- got ${promptSet.results?.length} results for ${prompt.plainId}`)
                            for( const response of promptSet.results ){
                                console.log(`${resultField} = ${response[resultField]}`)
                                console.log(response.quote)
                                if( (response[resultField] == undefined) || (response[resultField] === "none") || (response.quote === 'none')){
                                    continue;
                                }
                                const newPrim = await mainstore.createPrimitive({
                                    parent: primitive,
                                    type: "evidence",
                                    title: response[resultField],
                                    categoryId: prompt.metadata?.openai?.resultCatgeory,
                                    referenceParameters: {highlightAreas: response.highlightAreas, scale: response.scale},
                                    extraFields: {source: "openai", quoted: true, quote: response.quote}
                                })
                                if( newPrim ){
                                    prompt.addRelationship(newPrim )
                                } 
                            }
                        }
                    }
                }
                primitive.setField("ai_prompt_track", promptTracker)
                primitive.setField("ai_processing", null)
            }

        },
    }
    return obj
}