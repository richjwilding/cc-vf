import GoogleHelper from "./GoogleHelper"
import MainStore from "./MainStore"
import OpenAIAnalysis from "./OpenAIAnalysis"
export default function ExperimentAnalyzer(primitive){
    let obj ={
        init:function(){
            if( this._init ){return obj}
            this.evidenceAggregate = primitive.evidenceAggregate.map((ea)=>{
                return {
                    ...ea,
                    items: (ea.items || []).map((d)=>{
                        return {
                            ...d,
                            matcher: new RegExp(`.*${d.field}:?\\s?(\\d+).*`, "i")
                        }
                    }),
                    primitives: primitive.primitives.allUniqueResult.map((d)=>d.primitives.allUniqueEvidence).flat().filter((d)=>ea.categoryIds.includes(d.referenceId) )
                    
                }
            })
            this._init = true
            return obj
        },
        aggregate:async function(options = {force: false}){
            this.init()
            let tags = [
                "Entity resolution",
                "Mastering",
                "Granularity",
                "Instituional Knowledge",
                "Context"
            ]
            tags = [0, 1, 2]
            let fullList = []
            let shortList = []
            const ea = this.evidenceAggregate[1]
            
            for( const pass of ea.category ? [0, 1] : [0]){
                for( const tag of tags){

                    let list = ea.primitives
                    if( typeof(tag) === "number" ){
                        let stepper = list.length / (Math.max(...tags) + 1)
                        list = list.slice( tag * stepper, (tag + 1) * stepper)

                    }else{
                        list = list.filter((d)=>tag === undefined ||  d.tags.includes(tag))            
                    }
                    const text = list.map((d)=>d.title).map((d,idx)=>`P${idx}. ${d}`).join('\\n')
                    const listCheck = list.map((d)=>d)
                    console.log(`Got ${list.length} items`)
                    if( list.length === 0){
                        debugger
                    }

                    let result 
                    if( ea.category ){
                        if( pass == 0){
                            result = await this.prompt( [{prompt:"", id:0, categoryId:"category"}], {
                                intro: "Here are a set of problem statements", 
                                //setup: `Summarize the type of problem into no more than 4 categories that best describe the problem - put the category first followed by the statement numbers in the response only.  Each category must be no more than 3 words long and must avoid the topic of ${tag}. `,
//                                setup: `Summarize the type of problem into no more than 5 categories that best describe the problem - put the category first followed by the statement numbers in the response only.  Each category must be no more than 3 words long and must not directly include the word "Data", in particular to not use Data Quality, Data Management, Data Accuracy, Data Analysis, or Data Integration as a category`,
                                //setup: `Summarize the type of problem into no more than 5 sets that best describe the problem. Put the set description first followed by the statement numbers in the response only.  The set description must not include the word "data" or be one of: "Data Management", "Data Quality", "Data Integration"`,
                                setup: `Summarize the type of problem into no more than 5 sets that best describe the problem. Put the set description first followed by the statement numbers in the response only.`,
                                text: text,
                            })
                        }else{
                            console.log(`============`)
                            console.log(`============`)
                            console.log(`============`)

                            result = await this.prompt( [{prompt:"", id:0, categoryId:"category"}], {
                                intro: "Here are a set of problem statements", 
                                setup: `Assign each statement to one of the following categories: (${shortList.map((t,idx)=>`C${idx}. ${t}`).join(", ")})  - put the category first followed by the statement numbers in the response only.`,
                                text: text,
                            })
                        }
                        if( result ){
                            result.split('\n').forEach((t)=>{
                                t = t.trim()
                                if( t === ""){return}
                                console.log(t)
                                let m = t.match(/(.+)\s-\s(.+)/)
                                if( !m ){
                                    m = t.match(/(.+)\s\((.+)\)/) 
                                }
                                if( !m ){
                                    m = t.match(/(.+):\s(.+)/)
                                }

                                if( m ){
                                    let category = m[1]
                                    if( pass == 0){
                                        console.log(category)
                                        fullList.push( category )
                                    }else{
                                        let cm = category.match(/C(\d+)/)
                                        if( cm ){
                                            category = shortList[cm[1]]
                                            m[2].split(",").map((t)=>{
                                                const idx = parseInt(t.trim().slice(1))
                                                const primitive = list[idx]
                                                if( primitive ){
                                                    console.log(primitive.plainId, category)
                                                    primitive.setParameter( "category", category)
                                                    listCheck[idx] = undefined
                                                }
                                            })
                                        }
                                    }

                                }
                            })
                        }
                        
                        if( pass === 1){
                            listCheck.forEach((p)=>{
                                if( p ){
                                    console.log(primitive.plainId, 'CLEAR')
                                    p.setParameter( "category", null)
                                }
                            })
                        }
                    }else{
                        const prompts = ea.items.map((d)=>{return {id: d.id, prompt: `Question: "${d.prompt}". Keyword: "${d.field}".`, categoryId: d.field}})
                        
                        result = await this.prompt( prompts, {
                            intro: "Here are a set of problem statements", 
                            setup: "For each of the following questions provide an assessment for each problem statement using the question keyword and the score only. Use the full range of scores. Provide no further information on the score:",
                            text: text,
                        })

                        if( result ){
                            result.split('\n').forEach((t)=>{
                                t = t.trim()
                                if( t === ""){return}
                                let m = t.match(/P(\d+)\.*\s*(.*)/)
                                if( m ){
                                    const primitive = list[m[1]]
                                    if( primitive ){
                                        ea.items.forEach((d)=>{
                                            const val = d.matcher.exec( m[2] )
                                            console.log(d.field, val)
                                            if( val ){
                                                primitive.setParameter( d.field, val[1])
                                            }
                                        })
                                    }else{
                                        console.warn(`Can't find primitive ${t}`)
                                    }
                                }else{
                                    console.warn(`Can't parse ${t}`)
                                }
                            })
                        }
                    }
                }
                if( pass == 0 && ea.category){
                    console.log( fullList )
                    console.log(`Got full ${fullList.length}`)

                    const text = fullList.map((d,idx)=>`P${idx}. ${d}`).join('\\n')
                    const result = await this.prompt( [{prompt:"", id:0, categoryId:"category"}], {
                        intro: "Here are a list of categories", 
                        setup: "Consolidate these into a smaller list of no more than 6 new categories - put the new category followed by the orignal category number in the response only.  Each new category must be no more than 3 words long and must not explicity mention the word 'Data'",
                        text: text,
                    })
                    result.split('\n').forEach((t)=>{
                        t = t.trim()
                        if( t === ""){return}
                        //Q5. Data Standardization (P6)
                        let m = t.match(/\D\d+\.\s+(.+)\(.+\)$/)
                        if( !m ){
                            //"3. Communication (P2, P12, P13)"
                            m = t.match(/\d+\.\s+(.+)\(.+\)$/)    
                        }
                        if( !m ){
                            //"Data Standardization (P7, P14)"
                            m = t.match(/(.+)\(.+\)$/)    
                        }
                        if( !m ){
                            //Data Governance - P12
                            m = t.match(/(.+)-.+$/)    
                        }
                        if( m ){
                            shortList.push(m[1].trim())
                        }
                    })
                    console.log('--------')
                    console.log(shortList)
                }

            }
        },
        prompt:async function(prompts, options ){
            let rawText = options.text
            console.log(options)
            console.log(prompts)
            const go = async ()=>{

                const oa =  OpenAIAnalysis({
                    text: rawText,
                    prompts: prompts,
                    raw: true,
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