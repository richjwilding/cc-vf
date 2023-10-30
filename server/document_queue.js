import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import { getDocumentAsPlainText, importDocument, locateQuote, removeDocument } from "./google_helper";
import Primitive from "./model/Primitive";
import { addRelationship, createPrimitive, dispatchControlUpdate, getNestedValue, primitiveChildren, primitiveOrigin, primitivePrimitives, primitiveTask, removePrimitiveById } from "./SharedFunctions";
import Category from "./model/Category";
import { analyzeText, analyzeText2, summarizeMultiple, summarizeMultipleAsList } from "./openai_helper";
import Contact from "./model/Contact";


let instance

async function processQuestions( data ){
    try{

        console.log(`Answering questions for ${data.id}`)
        const primitive = await Primitive.findOne({_id: data.id})
        //const origin = await Primitive.findOne({_id: primitiveOrigin(primitive) })
        //let questions = await primitiveChildren(origin, "question")
        const task = await primitiveTask( primitive )
        let questions = await primitiveChildren(task, "question")

        if( data.qIds ){
            console.log(`Filter ${questions.length} questions`)
            questions = questions.filter((d)=>data.qIds.includes(d.id))
        }
        console.log(`Got ${questions.length} questions from for ${task.id}`)

        
        const groups = {}
        for(const question of questions){
            const prompts = await primitiveChildren(question, "prompt")
            for(const prompt of prompts){

                let oldEvidence =  await primitivePrimitives(prompt, 'primitives.auto', "evidence" )
                oldEvidence = oldEvidence.filter((d)=>d.parentPrimitives[data.id]?.includes('primitives.origin'))
                console.log( `----> got ${oldEvidence.length} to remove`)
                for( const old of oldEvidence){
                    await removePrimitiveById( old.id )
                }

                const category = await Category.findOne({id: prompt.referenceId})
                if( category ){
                    groups[prompt.referenceId] = groups[prompt.referenceId] || {
                        category: category,
                        id: prompt.referenceId,
                        prompts: [],
                    }
                    let out
                    const isEmpty = (prompt.allowInput === false) || prompt.title === undefined || prompt.title === null || prompt.title.trim() === "" 
                    if( isEmpty ){
                        out = category.empty
                    }else{
                        out = category.base.replace("${t}", prompt.title)
                        out = out.replace("${pt}", primitive.title)
                        if( out.indexOf("${ot}") > -1 ){
                            const parent = await Primitive.findOne({_id: await primitiveOrigin(primitive) })
                            out = out.replace("${ot}", parent.title)
                        }
                        if( out.indexOf("${oot}") > -1 ){
                            const p = await Primitive.findOne({_id: await primitiveOrigin(primitive) })
                            const parent = await Primitive.findOne({_id: await primitiveOrigin(p) })
                            out = out.replace("${oot}", parent.title)
                        }
                    }
                    if( out ){
                        out = out.replace("${n}", prompt.referenceParameters?.count || category.parameters?.count?.default) 
                        groups[prompt.referenceId].prompts.push( {
                            id: prompt.id,
                            text: out
                        } )
                    }
                }
            }

        }
        const extract = await getDocumentAsPlainText( primitive.id, data.req )

        const text = extract.plain
        for( const group of Object.values(groups)){
            const resultField = group.category.openai.field || "problem"


            let result 
            if( group.category.openai.newProcess ){
                result = await analyzeText2( text, {
                    opener: group.category.openai.opener,
                    descriptor: group.category.openai.descriptor,
                    responseInstructions: group.category.openai.responseInstructions,
                    responseFields: group.category.openai.responseFields,
                    promptType: group.category.openai.promptType,
                    sourceType: group.category.openai.sourceType,
                    prompts: group.prompts.map((p)=>p.text),
                    engine: group.category.openai.engine,
                    prefix: group.category.openai.prefix,
                    postfix: group.category.openai.postfix,
                    responseQualifier: group.category.openai.responseQualifier,
                    temperature: group.category.openai.temperature,
                })
                // remap
                console.log(result.response)
                if( result.success){
                    result.response = Object.keys(result.response).map((k)=>{
                        if( result.response[k].answered > 0 ){
                            result.response[k].answers = result.response[k].answers.map((a)=>{return {...a, id:k, answered: true}})
                        }else{
                            result.response[k].answers = {answered: 0, answers: []}
                        }
                        return result.response[k].answers
                    }).flat()
                }
                console.log(result.response)


            }else{
                result = await analyzeText( text, {
                    opener: group.category.openai.opener,
                    descriptor: group.category.openai.descriptor,
                    responseInstructions: group.category.openai.responseInstructions,
                    responseFields: group.category.openai.responseFields,
                    promptType: group.category.openai.promptType,
                    sourceType: group.category.openai.sourceType,
                    prompts: group.prompts.map((p)=>p.text),
                    engine: group.category.openai.engine,
                    prefix: group.category.openai.prefix,
                    postfix: group.category.openai.postfix,
                    temperature: group.category.openai.temperature,
                })

            }

            
            if( result.success && result.response ){
                for( const answer of result.response ){
                    const idx = (answer.id && isNaN(answer.id)) ? answer.id.match(/\d+/) : answer.id
                    if( idx !== undefined ){
                        const prompt =  group.prompts[idx]
                        let process = true
                        prompt.uTrack = prompt.uTrack  || {}
                        if( group.category.unique){
                            console.log(`Filter for unique`)
                            if( prompt.uTrack[ answer[resultField] ]){
                                process = false
                            }
                            prompt.uTrack[ answer[resultField] ] = true
                        }
                        if( group.category.openai.regex ){
                            if( !(new RegExp(group.category.openai.regex ).test(answer[resultField]))){
                                console.log('-- Fail regex')
                                process = false
                            }
                        }
                        if( process && answer.answered && answer[resultField] && answer[resultField] !== null   ){
                            const highlights = extract.data ? locateQuote(answer.quote, extract.data) : undefined
                            let params = {}
                            if( group.category.openai.responseFields ){
                                params = Object.keys( group.category.openai.responseFields ).reduce((o,k)=>{o[k]=answer[k]; return o}, {})
                            }
                            const newData = {
                                workspaceId: primitive.workspaceId,
                                parent: primitive.id,
                                data:{
                                    type: "evidence",
                                    referenceId: group.category.openai.resultCategory,
                                    title: Array.isArray(answer[resultField]) ? answer[resultField].map((d,idx)=>`${idx+1}) ${d}`).join(" ") : answer[resultField],
                                    referenceParameters:{
                                        ...params,
                                        quoted: true,
                                        quote: answer.quote,
                                        highlightAreas: highlights
                                    }
                                    //extraFields: {source: "openai", quoted: true, quote: response.quote}
                                }
                            }
                            if( highlights === undefined ){
                                console.log(`>>> cant find`)
                                console.log( answer.quote )
                            }
                            const newPrim = await createPrimitive( newData )
                            if( newPrim ){
                                await addRelationship(prompt.id, newPrim.id, "auto" )
                            }
                        }
                    }
                }
            }
        }
    }catch(error){
        console.log('Error in processQuestions')
        console.log(error)
    }
}

export default function QueueDocument(){    
    if( instance ){
        return instance
    }
    
    instance = new Queue("documentQueue", {
        connection: { 
            host: process.env.QUEUES_REDIS_HOST, 
            port: process.env.QUEUES_REDIS_PORT,
            maxStalledCount: 0,
            stalledInterval:300000
        },
    });
    instance.myInit = async ()=>{
        console.log("Document Queue")
        const jobCount = await instance.count();
        console.log( jobCount + " jobs in queue (document)")
        await instance.obliterate({ force: true });
        const newJobCount = await instance.count();
        console.log( newJobCount + " jobs in queue (document)")
    }
    
    instance.documentDiscovery = async ( primitive, req )=>{
        if( primitive.type === "result"){
            const category = await Category.findOne({id: primitive.referenceId})
            const parent = await Primitive.findOne({_id: await primitiveOrigin(primitive) })

            const paramList = []
            unpackParams( category.parameters, paramList)
            if( parent && parent.childParameters){
                unpackParams( parent.childParameters, paramList)
            }
            const fieldList = paramList.map((d)=>d.onRoot ? d.key : "referenceParameters." + d.key)


            const field = `processing.ai.document_discovery`
            if(primitive.processing?.ai?.document_discovery && (new Date() - new Date(primitive.processing.ai.document_discovery.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date(), targetFields: fieldList}, {user: req?.user?.id, track: primitive.id, text:"Parsing document"})
            instance.add(`discovery_${primitive.id}` , {id: primitive.id, mode: "discovery", field: field, req: {user: {accessToken: req.user.accessToken, refreshToken: req.user.refreshToken}}})
        }
        return true
    }
    instance.processQuestions = async ( primitive, qIds, req )=>{
        try{

            if( primitive.type === "result"){
                const field = `processing.ai.document_questions`
                if(primitive.processing?.ai?.document_questions && (new Date() - new Date(primitive.processing.ai.document_questions.started)) < (5 * 60 *1000) ){
                    console.log(`Already active - exiting`)
                }
                dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date(), subset: qIds}, {user: req?.user?.id, track: primitive.id, text:"Processing document"})
                instance.add(`questions_${primitive.id}` , {id: primitive.id, mode: "questions", field: field, qIds: qIds, req: {user: {accessToken: req.user.accessToken, refreshToken: req.user.refreshToken}}})
            }
        }catch(error){
            console.log(`Error in processQuestions`)
            console.log(error)
            return false
        }
        return true
    }

    const unpackParams = (params, target, type)=>{
        Object.keys(params).forEach((p)=>{
            if( (type === undefined || params[p].promptType === type) || (params[p].promptType === undefined && type === "question")){
                if( params[p].prompt){
                    target.push({key: p, ...params[p]})
                }
            }
        })

    }



    new Worker('documentQueue', async job => {
        console.log(job.data)
        if( job.data.mode === "questions" ){
            //console.log('skip')
            await processQuestions( job.data )
            dispatchControlUpdate(job.data.id, job.data.field , null, {track: job.data.id})
        }
        if( job.data.command === "refresh" ){
            console.log(`Purging existing document for ${job.data.id}`)
            const primitive = await Primitive.findOne({_id: job.data.id})
            
            dispatchControlUpdate(job.data.id, "processing.document_refresh", "true")

            try{

                await removeDocument(job.data.id)
                console.log(`Purge done for ${job.data.id}`)
                //SIO.getIO().emit("message", [{type: "document_cleared", id: job.data.id}])            
                SIO.notifyPrimitiveEvent(primitive, [{type: "document_cleared", id: job.data.id}])            
            }catch(error){
                console.log(`Error in documentQueue.refresh - purge`)
                console.log(error)
            }


            try{

                const importRes = await importDocument(job.data.id, job.data.req)
                
                dispatchControlUpdate(job.data.id, "referenceParameters.notes.lastFetched", importRes)
                
                if( importRes ){
                    console.log(`documentQueue.refresh - imported ${job.data.id}`)
                    const res = await getDocumentAsPlainText(job.data.id, job.data.req)
                    if( res ){
                        console.log(`documentQueue.refresh - plain text imported ${job.data.id}`)
                    }else{
                        console.log(`Plain text import failed for ${job.data.id}`)
                    }

                    console.log(`-- Chaining discovery`)
                    await instance.documentDiscovery( primitive, job.data.req)
                }else{
                    console.log(`Document import failed for ${job.data.id} ${job.data.value}`)
                }
            }catch(error){
                console.log(`Error in documentQueue.refresh - import`)
                console.log(error)
            }
            
            dispatchControlUpdate(job.data.id, "processing.document_refresh", undefined)
        }

        if( job.data.mode === "discovery" ){

            const primitiveId = job.data.id
            try{
                const primitive = await Primitive.findOne({_id:  primitiveId})
                const category = await Category.findOne({id: primitive.referenceId})
                const extract = await getDocumentAsPlainText( primitiveId, job.data.req)
                if( extract ){
                    const text = extract.plain
                    const parent = await Primitive.findOne({_id: await primitiveOrigin(primitive) })


                    const fields = {}
                    const processResponses = async (result, prompts)=>{
                        if( result.success && result.response){
                            console.log(result.response)
                            for( const res of result.response){
                                if( res.answered){
                                    let p = prompts[res.id]
                                    if( p === undefined){
                                        p = prompts[res.id.match(/\d+/)]
                                    }
                                    if( p ){
                                        console.log(res.id, p.key, res.answer)
                                        let value = res.answer
                                        const key = p.onRoot ? p.key : `referenceParameters.${p.key}`
                                        if( p.type === "string" || p.type === "long_string" )
                                        {
                                            if(p.summarize){
                                                fields[key] = fields[key] || {summarize: true, items: [], theme: p.value}
                                                fields[key].items.push(value)                                         

                                            }else{
                                                fields[key] = value                                         
                                            }
                                        }else if(p.type === "number"){
                                            const number = isNaN(value) ? value.match(/[-+]?[0-9]*\.?[0-9]+/) : value
                                            console.log(number)
                                            if( number ){
                                                fields[key] = number[0]
                                            }
                                        }else if(p.type === "contact"){
                                            let contact = await Contact.findOne({name: value})
                                            if( !contact ){
                                                contact = await Contact.create({name: value})
                                            }
                                            if( contact ){
                                                console.log(`Found contact ${value} at ${contact._id.toString()}`)
                                                fields[`${key}Id`] = contact._id.toString()
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    const transformQuestions = (list, parent)=>{
                        return list.map((d)=>{
                            if( d.type === "number"){
                                return {...d, prompt: `${d.prompt}. Provide your answer as a number without any other text`}
                            }
                            if( d.promptParentModifier){
                                const value = getNestedValue( parent, d.promptParentModifier)
                                console.log(`--- nESTED ${value}`)
                                if( value ){
                                    return {...d, prompt: d.prompt.replaceAll('{t}', value), value: value}
                                }else{
                                    return {...d, prompt: d.promptBlank}
                                }
                            }
                            return d
                        })
                    }

                    let questionList = []
                    unpackParams( category.parameters, questionList, "question")
                    if( parent && parent.childParameters){
                        unpackParams( parent.childParameters, questionList, "question")
                    }
                    

                    if( questionList.length > 0){
                        let result = await analyzeText(text, {
                            opener: category.openai.opener,
                            descriptor: category.openai.descriptor,
                            text: text, 
                            prompts: transformQuestions(questionList, parent)
                        })
                        await processResponses( result, questionList)
                    }


                    
                    let taskList = []
                    unpackParams( category.parameters, taskList, "task")
                    if( parent && parent.childParameters){
                        unpackParams( parent.childParameters, taskList, "task")
                    }

                    if( taskList.length > 0){

                        let result = await analyzeText(text, {
                            opener: category.openai.opener,
                            descriptor: "Complete the following tasks:",
                            text: text, 
                            skipQuote: true,
                            promptType: "task",
                            prompts: transformQuestions(taskList, parent)
                        })
                        processResponses( result, taskList)
                    }

                    if( Object.keys(fields).length > 0 ){
                        for(const k of Object.keys(fields)){
                            if( fields[k].summarize){
                                fields[k] = (await summarizeMultiple(fields[k].items, {themes: fields[k].value}))?.summary ?? null
                            }
                        }
                        try{

                            await Primitive.findOneAndUpdate(
                                {
                                    "_id": primitiveId,
                                }, 
                                {
                                    $set: fields,
                                })
                        }catch(error){
                            console.log('Error updating db for discovery')
                            console.log( fields)
                            console.log(error)
                        }
                        SIO.notifyPrimitiveEvent(primitive, {data: [{type: "set_fields", primitiveId: primitiveId, fields: fields}]})            
                    }
                }

            }catch(error){
                console.log(`Error in documentQueue.discovery `)
                console.log(error)
            }
            dispatchControlUpdate(primitiveId, job.data.field , null, {track: primitiveId})
        }
        
    },
    {connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
    return instance
}
