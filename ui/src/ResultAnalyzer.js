import GoogleHelper from "./GoogleHelper"
import MainStore from "./MainStore"
import OpenAIAnalysis from "./OpenAIAnalysis"
export default function ResultAnalyzer(primitive){
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
            this.evidencePrompts = origin.evidencePrompts
            this.questionPrompts = origin.questions
            this.openai = OpenAIAnalysis
            return obj
        },
        fetchText:async function(){
            if( primitive.referenceParameters.notes.type === "google_drive"){
                return await GoogleHelper().getFileAsPdf( primitive.referenceParameters.notes.id, "text/plain")
            }
            return undefined
        },
        text:async function(){
            if( !this._text ){
                this._text = await this.fetchText()
            }
            return this._text
        },
        evidence:async function(options = {force: false, complete: true}){
            if( this.evidencePrompts === undefined){return undefined}
            const evidence = primitive.primitives.fromPath(obj.buildPath())
            let inscope = this.evidencePrompts

            if(evidence){
                const present = Object.keys( evidence )
                inscope = inscope.filter((d)=> options.force || !present.includes(`${d.id}`) )
            }
            
            console.log(`${inscope.length} prompts incomplete`)

            if( (inscope.length > 0 && options.complete) || (inscope.length === this.evidencePrompts.length )){ 
                const result = await this.prompt( inscope )
                const mainstore = MainStore()
                console.log(result)

                result.forEach(async (d,idx)=>{
                    const path = obj.buildPath(d.id)
                    await d.details.forEach(async (item, idx)=>{
                        await mainstore.createPrimitive({
                            parent: primitive,
                            type: "evidence",
                            parentPath: path,
                            title: item,
                            categoryId: d.categoryId,
                        })
                    })
                })
            }

            return primitive.primitives.fromPath({processed: "openai"})
        },
        prompt:async function(prompts, asQuestions = false ){
            const rawText = await this.text()
            const oa =  OpenAIAnalysis({
                text: rawText,
                prompts: prompts
            })
            const responses = await oa.process()
            return responses
        }
    }
    return obj
}