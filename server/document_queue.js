import { SIO } from './socket';
import { getDocumentAsPlainText, importDocument, locateQuote, removeDocument } from "./google_helper";
import Primitive from "./model/Primitive";
import { addRelationship, buildContext, createPrimitive, dispatchControlUpdate, executeConcurrently, fetchPrimitive, fetchPrimitives, findResultSetForCategoryId, findResultSetForType, getConfig, getDataForImport, getDataForProcessing, getFilterName, getNestedValue, getPrimitiveInputs, getPrimitiveOutputs, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentsOfType, primitivePrimitives, primitiveTask, removePrimitiveById, removeRelationship, updateFieldWithCallbacks } from "./SharedFunctions";
import Category from "./model/Category";
import { analyzeText, analyzeText2, buildEmbeddings, processPromptOnText, summarizeMultiple, summarizeMultipleAsList } from "./openai_helper";
import ContentEmbedding from "./model/ContentEmbedding";
import PrimitiveParser from "./PrimitivesParser";
import { fetchFragmentsForTerm } from "./DocumentSearch";
import { BaseQueue } from './base_queue';
import { assessContextForPrompt, reviseUserRequest } from './prompt_helper';
import { getLogger } from './logger.js';
import { compareTwoStrings } from './actions/SharedTransforms.js';
import { registerAction } from './action_helper.js';
import { getAhrefsTrafficReportFromRapidAPI } from './rapid_helper.js';
import { flattenStructuredResponse } from './PrimitiveConfig.js';
import { extractFlatNodes } from './task_processor.js';

const logger = getLogger('document_queue', "debug"); // Debug level for moduleA

const parser = PrimitiveParser()




function unpackParams(params, limitSet, type){
    Object.keys(params).forEach((p)=>{
        let target = limitSet.find(d2=>d2.word_limit === params[p].word_limit)
        if( !target ){
            target = {word_limit: params[p].word_limit, items: []}
            limitSet.push(target)
        }
        if( (type === undefined || params[p].promptType === type) || (params[p].promptType === undefined && type === "question")){
            if( params[p].prompt){
                target.items.push({key: p, ...params[p]})
            }
        }
    })
}

export async function processQueue(job, cancelCheck){
        if( job.data.mode === "traffic_report" ){
            const primitiveId = job.data.id
            console.log(`!!!TRAFFIC REPORT for ${primitiveId}`)
            try{
                const primitive = await Primitive.findOne({_id:  primitiveId})
                if( primitive.referenceParameters.url ){
                    const result = await getAhrefsTrafficReportFromRapidAPI( primitive.referenceParameters.url )
                    if( result ){
                        const update = {
                            ...primitive.referenceParameters,
                            traffic: result.page.traffic,
                            domain_traffic: result.domain.traffic,
                            domain_rank: result.domain.ahrefsRank
                            
                        }
                        await dispatchControlUpdate( primitive.id, "referenceParameters", update)
                    }
                    return result
                }
            }catch(e){
                logger.error("Error in traffic_report" ,e)
            }
        }
        if( job.data.mode === "data_query" ){
            try{
                await doDataQuery(job.data)
            }catch(error){
                console.log(`Error in doDataQuery`)
                console.log(error)
            }
            console.log(`FINISHED QUERY - CLAER DCU`)
            dispatchControlUpdate(job.data.id, job.data.field , null, {track: job.data.id})
        }
        if( job.data.mode === "questions" ){
            await processQuestions( job.data )
            console.log(`FINISHED QUESTIONS - CLEAR DCU`)
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

                    if( primitive.referenceId === 9){
                        console.log(`-- Chaining discovery`)
                        await instance.documentDiscovery( primitive, job.data.req)
                    }
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
                if( category.isCSV ){
                    console.log("Starting CSV")
                    let data = await getDocumentAsPlainText(job.data.id, job.data.req)
                    if( data ){
                        data = JSON.parse(data.plain)
                    }
                    console.log("Got data")
                    
                    const targetPath = 0
                    const addId = category.resultCategories?.[targetPath]?.resultCategoryId
                    const detailCategory = await Category.findOne({id: addId})
                    const evidenceId = detailCategory.resultCategories?.[0]?.resultCategoryId
                    const evidenceCategory = await Category.findOne({id: evidenceId})
                    const evidenceTargetPath = detailCategory.resultCategories?.[0]?.id

                    if( detailCategory && evidenceCategory ){
                        console.log("Processing")
                        if( data && data.length > 0){
                            const params = {}
                            const evidence = []
                            const headers = Object.keys(data[0])
                            console.log(headers)
                            for(const d of headers){
                                if( d.match(/\d+/)){
                                    evidence.push(d)
                                }else{
                                    if(d === "createdAt"){
                                        continue
                                    }
                                    if(isNaN(data[0][d])){
                                        params[d]={title:d, type:"string"}
                                    }else{
                                        params[d]={title:d, type:"number"}
                                    }
                                }
                            }
                            if( Object.keys(params).length > 0){
                                primitive.set(`childParameters`, params)
                                primitive.markModified("childParameters")
                                await primitive.save()
                                
                                const old = await primitiveChildren( primitive, "detail")
                                if( old.length > 0){
                                    console.log(`Clearing out old items - ${old.length} items`)
                                    for( const d of old ){
                                        await removePrimitiveById(d.id)
                                    }
                                }
                                let record = 0
                                for( const item of data ){
                                    console.log(`adding record`, record)
                                    record++
                                    const newData = {
                                        workspaceId: primitive.workspaceId,
                                        paths: ['origin', `results.${targetPath}`],
                                        parent: primitive,
                                        data:{
                                            type: "detail",
                                            referenceId: addId,
                                            childParameters:{question:{title:"Question",type:"string"}},
                                            title: `Record ${record}`,
                                            referenceParameters: Object.keys(params).reduce((a,d)=>{a[d] = item[d];return a}, {})
                                        }
                                    }
                                    const newPrim = await createPrimitive( newData )
                                    console.log(`added`, newPrim?.id)
                                    if( newPrim ){
                                        const queue = []
                                        for( const answer of evidence){
                                            console.log(`Parsing `, answer)
                                            const answerData = {
                                                workspaceId: primitive.workspaceId,
                                                paths: ['origin', `results.${evidenceTargetPath}`],
                                                parent: newPrim,
                                                data:{
                                                    type: "evidence",
                                                    referenceId: evidenceId,
                                                    title: item[answer],
                                                    referenceParameters: {
                                                        question: answer
                                                    }
                                                }
                                            }
                                            queue.push( createPrimitive( answerData ) )
                                        }
                                        console.log(`Waiting for all`)
                                        await Promise.all(queue);
                                        console.log(`Waiting for all - done`)
                                    }
                                }
                            }
                        }
                        console.log(`done`)
                    }
                    return
                }
                const extract = await getDocumentAsPlainText( primitiveId, job.data.req)
                if( extract ){
                    const text = extract.plain
                    const parent = await Primitive.findOne({_id: primitiveOrigin(primitive) })


                    const fields = {}
                    const processResponses = async (result, prompts)=>{
                        if( result.success && result.response){
                            console.log(result.response)
                            const listTrack = new Set()
                            for( const res of result.response){
                                if( res.answered){
                                    let p = prompts[res.id]
                                    if( p === undefined){
                                        p = prompts[res.id.match(/\d+/)]
                                    }
                                    if( p ){
                                        console.log(res.id, p.key, res.answer)
                                        let value = res.answer

                                        if( typeof(value) === "object" && p.prompt_output){
                                            if( typeof(p.prompt_output) === "string"){
                                                value = value[p.prompt_output]
                                                console.log(`--> Mapped to ${value}`)
                                            }else{
                                                throw "Prompt output as struct not implemented"
                                            }
                                        }

                                        const key = p.onRoot ? p.key : `referenceParameters.${p.key}`
                                        if( p.type === "string" || p.type === "long_string" )
                                        {
                                            if(p.summarize){
                                                fields[key] = fields[key] || {summarize: true, items: [], theme: p.value}
                                                fields[key].items.push(value)                                         

                                            }else{
                                                fields[key] = value                                         
                                            }
                                        }else if(p.type === "list"){
                                                if( listTrack.has(key)){
                                                    fields[key] = [fields[key],value].flat()
                                                }else{
                                                    listTrack.add(key)
                                                    fields[key] = [value].flat()
                                                }
                                        }else if(p.type === "number"){
                                            const number = isNaN(value) ? value.match(/[-+]?[0-9]*\.?[0-9]+/) : value
                                            console.log(number)
                                            if( number ){
                                                fields[key] = number[0]
                                            }
                                        /*}else if(p.type === "contact"){
                                            let contact = await Contact.findOne({name: value})
                                            if( !contact ){
                                                contact = await Contact.create({name: value})
                                            }
                                            if( contact ){
                                                console.log(`Found contact ${value} at ${contact._id.toString()}`)
                                                fields[`${key}Id`] = contact._id.toString()
                                            }*/
                                        }
                                    }
                                }
                            }
                        }
                    }

                            
                    const transformQuestions = (list, parent)=>{
                        return list.map((d)=>{
                            let item = d
                            if( d.type === "number"){
                                item = {...d, prompt: `${d.prompt}. Provide your answer as a number without any other text`}
                            }
                            if( d.promptParentModifier){
                                const value = getNestedValue( parent, d.promptParentModifier)
                                if( value ){
                                    item = {...d, prompt: d.prompt.replaceAll('{t}', value), value: value}
                                }else{
                                    item = {...d, prompt: d.promptBlank}
                                }
                            }
                            if( d.prompt_structure){
                                const structure = "{" + Object.keys(d.prompt_structure).map(f=>`${f}:<${d.prompt_structure[f]?.description ?? d.prompt_structure[f]}>`).join(", ") + "}"
                                if( d.type === "list"){
                                    item.prompt += `. Each entry should have the structure ${structure}`
                                }else{
                                    item.prompt += `. Use the following structure for your answer ${structure}`
                                }
                            }
                            return item
                        })
                    }

                    let questionList = []
                    unpackParams( category.parameters, questionList, "question")
                    if( parent && parent.childParameters){
                        unpackParams( parent.childParameters, questionList, "question")
                    }
                    

                    if( questionList.length > 0){
                        for( const set of questionList ){
                            let thisText = text
                            if( set.word_limit ){
                                thisText = text.split(" ").slice(0, set.word_limit).join(" ")
                            }

                            let result = await analyzeText(thisText, {
                                opener: category.openai.opener,
                                descriptor: category.openai.descriptor,
                                temperature: 1,
                                prompts: transformQuestions(set.items, parent)
                            })
                            await processResponses( result, set.items)
                        }
                    }


                    
                    let taskList = []
                    unpackParams( category.parameters, taskList, "task")
                    if( parent && parent.childParameters){
                        unpackParams( parent.childParameters, taskList, "task")
                    }

                    if( taskList.length > 0){
                        for( const set of taskList ){
                            let thisText = text
                            if( set.word_limit ){
                                thisText = text.split(" ").slice(0, set.word_limit).join(" ")
                                console.log(`LIMITED ${thisText.length} vs ${text.length}`)
                            }
                            let result = await analyzeText(thisText, {
                                opener: category.openai.opener,
                                descriptor: "Complete the following tasks:",
                                skipQuote: true,
                                promptType: "task",
                                temperature: 1,
                                prompts: transformQuestions(set.items, parent)
                            })
                            processResponses( result, set.items)
                        }
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
}


export const MAX_QUOTE_TEXT_DISTANCE_THRESHOLD = 0.2

let instance

export async function mergeDataQueryResult( primitive, {ids = [], descriptionRewrite = true, ...options} = {}){
    const origin = await fetchPrimitive( primitiveOrigin( primitive ) )
    if( !origin ){
        throw `Cant find origin for ${primitive.id}`
    }

    let combine = await fetchPrimitives(  ids )
    combine = combine.filter(d=>d.id !== primitive.id && primitiveOrigin(d) === origin.id && d.referenceId === primitive.referenceId)
    console.log(`Got ${ids.length} - filtered to ${combine.length}`)

    let newDescription = primitive.referenceParameters?.description
    let newTitle = primitive.title

    if( descriptionRewrite ){

        const descList = [primitive, combine].flat().map(d=>d.referenceParameters?.description).filter(d=>d)
        
        const newDescriptionResult = await processPromptOnText( descList,{
            opener: `Here are a list of descriptions related to different results that have been extracted from a large data set.`,
            prompt: `Write a new description which encompassess the common elements of the underlying problem being addressed and the proposed solution of the originals but without mentioning outlier nuances, specific company names or solution names.  The new description should ${options.focus ? `focus on ${options.focus} and ` : ""} be about 150-250 words in length.`,
            output: `Return the result in a json object called "result" with a field called 'description' containing the new descripton, and an 'overview' field containing a summary of new description in no more than 20 words`,
            engine: "gpt4p",
            debug: true,
            debug_content: true,
            field: "result"
        })
        console.log(newDescriptionResult)
        newDescription = newDescriptionResult?.output?.[0]?.description
        newTitle = newDescriptionResult?.output?.[0]?.overview
    }

    if( newDescription && newTitle){
        let newObject = {
            ...primitive.referenceParameters,
            description : newDescription}
        

        for(const source of combine ){
            const keys = Object.keys( source.referenceParameters ?? {}).filter(d=>!["description"].includes(d))
            for(const k of keys){
                newObject[k] = [newObject[k], source.referenceParameters[k]].flat(Infinity).filter((d,i,a)=>d && a.indexOf(d)===i)
                if( newObject[k].length < 2){
                    newObject[k] = newObject[k][0]
                }
            }

            let pp = new Proxy(source.primitives, parser)
            let childIds = pp.uniqueAllIds
            console.log(childIds)
            for(const childId of childIds){
                const paths = pp.paths( childId ).map(d=>"primitives"+d)
                for(const path of paths){
                    await removeRelationship( source.id, childId, path  )
                    await addRelationship( primitive.id, childId, path  )
                }
            }
            await removePrimitiveById( source.id )
        }
        console.log(`should remove ${combine.map(d=>d.id).join(", ")}`)

        if( descriptionRewrite ){
            await updateFieldWithCallbacks( primitive.id, 'title', newTitle )
        }
        const keys = Object.keys( newObject )
        for(const k of keys){
            await updateFieldWithCallbacks( primitive.id, `referenceParameters.${k}`, newObject[k] )
        }
    }


}

async function doDataQuery( options ) {
        const primitive = await Primitive.findOne({_id: options.id})
        const thisCategory = await Category.findOne({id: primitive.referenceId})

        const progress = async (progress)=>{
            await dispatchControlUpdate(primitive.id, options.field , progress)
        }

                const parentForScope = options.parentForScope //(await primitiveParentsOfType(primitive, "working"))?.[0]

                const config = await getConfig( primitive )

                const doingExtracts = config?.extract


                const resultCategoryId =  doingExtracts ? config?.extract : options.resultCategoryId 
                const resultSet = doingExtracts ?  (await findResultSetForType( primitive, "evidence")) : (await findResultSetForCategoryId( primitive, resultCategoryId))
                if( resultSet === undefined ){
                    throw "No resultCategoryId specified"
                }
                const extractTargetCategory = doingExtracts ? (await Category.findOne({id: resultCategoryId}))?.toJSON() : undefined
                
                
                let items, scopeNode, itemsFromInputPin
                const serachScope = [{workspaceId: primitive.workspaceId}]

                const importId = Object.keys(primitive?.primitives ?? {}).includes("imports") ? primitive.primitives.imports[0] : undefined
                if( importId ){
                    const importPrimitive = await fetchPrimitive( importId )
                    const outputs = Object.entries( importPrimitive.primitives?.outputs ?? {})
                    const forPrimitive = outputs.filter(d=>d[1].includes(primitive.id))
                    console.log(forPrimitive)
                    const forImport = forPrimitive.find(d=>d[0].endsWith("_impin"))
                    if( forImport ){
                        let pinData
                        const sourcePin = forImport[0].split("_")[0]
                        if( importPrimitive.type === "flowinstance" && primitive.parentPrimitives[importPrimitive.id].includes("primitives.origin")){
                            logger.debug(`Import for ${primitive.id} comes from an input pin (${sourcePin}) of parent flowinstance ${importPrimitive.id} - redirecting`)
                            pinData = await getPrimitiveInputs( importPrimitive )
                        }else{
                            logger.debug(`Import for ${primitive.id} comes from an output pin (${sourcePin}) of ${importPrimitive.id} - redirecting`)
                            pinData = await getPrimitiveOutputs( importPrimitive )
                        }
                        if( pinData[sourcePin]?.config === "primitive"){
                            itemsFromInputPin = pinData[sourcePin].data
                        }
                    }
                }
                
                const scope = options.scope ?? primitive.primitives?.params?.scope?.[0] ?? parentForScope?.primitives?.params?.scope?.[0] ?? (Object.keys(parentForScope?.primitives ?? {}).includes("imports") ? parentForScope.id : importId)
                
                const referenceCategoryFilter = options.referenceCategoryFilter ?? config?.referenceCategoryFilter ?? parentForScope?.referenceParameters?.referenceCategoryFilter

                if( scope  ){
                    let validTypes = ["result", "summary"]
                    const node = await fetchPrimitive( scope )
                    scopeNode = node
                    if( options.doingIter ){
                        logger.debug(`Fetching iteration prim ${options.doingIter} (for scope ${node.id})`)
                        const iter = await fetchPrimitive( options.doingIter )
                        items = [iter, ...(await primitiveDescendents( iter, validTypes))]
                    }else{

                        if( node.type === "view" || node.type === "working" || node.type === "query" || node.type === "segment" ){                            
                            let interim = itemsFromInputPin

                            if( !interim ){
                                if( Object.keys(node?.primitives ?? {}).filter(d=>d !== "imports").length > 0){
                                    interim = await getDataForImport(node)
                                }else if(Object.keys(primitive?.primitives ?? {}).includes("imports")){
                                    interim = await getDataForImport(node, undefined, true)
                                }else{
                                    interim =  await getDataForImport(primitive, undefined, true) 
                                }
                            }
                            
                            
                            if( config.group || thisCategory.type === "iterator" ){
                                console.log(`Will go via groups - have ${interim.length} to do`)
                                if( config.onlyNew ){
                                    const existing = await primitiveChildren(primitive)
                                    const linked = existing.flatMap(d=>[d.primitives?.link, d.primitives?.source]).flat().filter((d,i,a)=>d && a.indexOf(d)===i)
                                    interim = interim.filter(d=>!linked.includes(d.id) )
                                }
                                
                                if( interim.length > 0){
                                    await executeConcurrently(interim, async (d, idx)=>{
                                        console.log(`++ Doing iter ${idx} for ${d.plainId} / ${d.title}`)
                                        //await doDataQuery({...options, inheritValue: d.title, inheritField: "scope", group: undefined, scope: d.id, linkAsChild: false, doingIter: true})
                                        await doDataQuery({...options, inheritValue: d.title, inheritField: "scope", group: undefined, linkAsChild: false, doingIter: d.id})
                                        return
                                    }, undefined, undefined, 10)
                                }
                                console.log(`Groups all done - leaving`)
                                return
                            }
                            
                            console.log(`Got ${interim.length} for view `)
                            items = [interim.filter(d=>validTypes.includes(d.type)), await primitiveDescendents( interim, validTypes, {fields: "referenceId"})].flat()
                            console.log(`BACK FROM DESCEND`)
                        }else{
                            items = [node, ...(await primitiveDescendents( node, validTypes))]
                        }
                    }
                    
                }
                
                if( referenceCategoryFilter ){
                    const asArray = [referenceCategoryFilter].flat().map(d=>parseInt(d)).filter(d=>!isNaN(d))
                    if(!items ){
                        const query = {
                            workspaceId: primitive.workspaceId,
                            referenceId: {$in: asArray},
                            deleted: {$exists: false}
                        }

                        items = await Primitive.find(query)
                        console.log(`Looked up ${items.length}`)
                    }else{
                        items = items?.filter(d=>asArray.includes(d.referenceId))
                    }
                }
                if( config.onlyNew ){
                    console.log(`Filtering for only new items on ${primitive.plainId} (${items.length})`)
                    const existing = await primitiveChildren(primitive)
                    const linked = existing.flatMap(d=>[d.primitives?.link, d.primitives?.source]).flat().filter((d,i,a)=>d && a.indexOf(d)===i)
                    console.log(`Have ${existing.length} existing / ${linked.length}`)
                    items = items.filter(d=>!linked.includes(d.id) )
                    console.log(`Filtered scepe to ${items.length} without results`)
                }
                if(items){
                    let ids = items?.map(d=>d.id)
                    serachScope.push({foreignId: {$in: ids}})
                    console.log(`Constrained to ${ids.length} items`)
                    if( ids.length === 0){
                        return
                    }
                }
                
                let keepItems = !options.remove_first

                if( !keepItems ){
                    let oldEvidence =  await primitiveChildren(primitive, "result")
                    for( const old of oldEvidence){
                        await removePrimitiveById( old.id )
                    }
                }
                let query = config.query 
                console.log(`GOT QUERY ${query}`)

                
                let parentInputs = {}
                const configParentId = Object.keys(primitive.parentPrimitives ?? {}).filter(d=>primitive.parentPrimitives[d].includes("primitives.config"))?.[0]
                if( configParentId ){
                    const configParent = await fetchPrimitive( configParentId )
                    parentInputs = await getPrimitiveInputs( configParent )
                }

                const primitiveInputs = await getPrimitiveInputs( primitive )
                const mergedInputs = {
                    ...parentInputs,
                    ...primitiveInputs
                }

                if( mergedInputs ){
                    for(const inp of Object.keys(mergedInputs)){
                        query = query.replaceAll(`{${inp}}`, mergedInputs[inp].data)
                    }
                }

                if( scope ){
                    if( scopeNode?.type === "segment"){
                        console.log(`WILL GET FROM SEGMENT ${scopeNode.plainId}`)
                        if( query.includes("{segment}")){
                           const segmentName = await getFilterName( scopeNode) ?? scopeNode.title
                           console.log(`-- Segment = ${segmentName}`)
                           if( segmentName ){
                                query = query.replaceAll("{segment}", segmentName)
                           }
                        }
                    }
                }

                let contextCheck
                if( config.contextCheck){
                    contextCheck = await assessContextForPrompt( query )
                }

                let metadata
                if( doingExtracts){
                    console.log(`Will extract ${extractTargetCategory.title}`)
                    if( !extractTargetCategory ){
                        throw `Couldn't fetch category ${resultCategoryId}`
                    }
                    if( extractTargetCategory.ai?.extract){
                        metadata = {}
                        for(const k of Object.keys(extractTargetCategory.ai.extract.responseFields) ){
                            const field = extractTargetCategory.ai.extract.responseFields[k].target ?? k
                            metadata[field] = `a ${field} field containing ${extractTargetCategory.ai.extract.responseFields[k].prompt}`
                        }
                    }else{
                        throw `No extraction config for category ${resultCategoryId}`
                    }

                }
                else if( config?.sections){
                    metadata = config?.sections.reduce((a,d )=>{
                        const [key,value] = d.split(":")
                        a[key] = `a ${key} field containing ${value}`
                        return a
                    },{})
                }
                console.log(metadata)
                let results
                if( query && query.trim().length > 0 ){

                    if( config.fullText && !config.contextCheck){
                        console.log(`Will use full text`)
                        results = {success: true, allItems: true }

                    }else{
                        progress(`Building lookup terms...`)
                        results = await processPromptOnText( query,{
                            workspaceId: primitive.workspaceId,
                            functionName: "query-terms",
                            opener: `You have access to a database of many thousands of text fragments and must answer questions or complete tasks using information in the database.  Fragments have been encoded with embeddings and can be retrieved with appropriate keywords or phrases. Here is a task or question:`,
                            prompt: `Build a list of ${config?.lookupCount ?? ""} keywords and phrases that will retrieve information from the database which can answer this task or question.`,
                            output: `Return the result in a json object called "result" with a field called 'prompts' containing the keyword and phrases list as an array`,
                            engine: config.engine ?? "gpt-4o",
                            debug: false,
                            debug_content: false,
                            field: "result"
                        })
                        progress(`Got ${results.length} terms...`)
                    }
                }else{
                    if( doingExtracts ){
                        query = extractTargetCategory.ai?.extract?.prompt ?? `Analyze each numbered item i have provided to generate an assessment of the messaging content, structure and style.  You must produce an assessment for each and every item and return each as a seperate part of your answer.`
                        results = {success: true, allItems: true }
                    }
                }


                if( results?.success ){
                    let metadataItems = doingExtracts ? Object.keys(metadata) : results.output?.[0]?.metadata ?? []
                    let parts = doingExtracts ? Object.values(metadata).join(", ") : metadataItems.filter(d=>metadata[d]).map(d=>metadata[d].prompt ?? metadata[d]).join(", ")?.trim() 
                    let extraFields = parts.length > 0 ? " for each part of your answer also include " + parts : ""

                    if( config.extracts ){
                        extraFields = " for each part of your answer also include "
                        extraFields += config.extracts.map(extract=>
                            `a '${extract.field}' field containing ${extract.prompt}`
                        ).join(", ") + "."
                        metadataItems = config.extracts.map(d=>d.field)
                    }
                    const prompts = results.output?.[0]?.prompts
                    console.log(prompts)
                    let asStructure = false
                    if( prompts || results.allItems){
                        let fragmentList

                        const quote = config?.quote ?? true
                        //const targetWords = doingExtracts ? "no more than 30 words" : config?.words ?? "3 paragraphs each of 100-200 words and in a plain string format with appropriately escaped linebreaks"
                        
                        const includeBasicFields = !doingExtracts

                        let outPrompt
                        if(config.single_response){
                            outPrompt = [
                                `Return the result in a json object called "answer" which is an array containing a single entry with your full response.  The response must have a boolean 'answered' field indicating if it contains an answer or if no answer was found`,
                                includeBasicFields ? `, an 'overview' field containing a summary of the part in no more than 20 words, an 'answer' field containing the full part of the answer as a raw markdown formatted string **without** any triple-backtick fences` : undefined,
                                quote ? `, a 'quote' field containing text used from the fragments (verbatim and in full so i have the complete context)` : undefined,
                                `, a 'ids' field containing the id numbers of every text fragment(s) (as given to you) used to produce this specific part of the answer.`,
                                (extraFields ?? "").length > 0 ? extraFields : undefined
                            ].filter(d=>d).join("") + "."
                        }else{
                            outPrompt = [
                                `Return the result in a json object called "answer" which is an array containing every part of your answer.  Each part must have a boolean 'answered' field indicating if this part contains an answer or if no answer was found`,
                                includeBasicFields ? `, an 'overview' field containing a summary of the part in no more than 20 words, an 'answer' field containing the full part of the answer in a raw markdown formatted string **without** any triple-backtick fences` : undefined,
                                quote ? `, a 'quote' field containing text used from the fragments (verbatim and in full so i have the complete context)` : undefined,
                                `, a 'ids' field containing the id numbers of every text fragment(s) (as given to you) used to produce this specific part of the answer.`,
                                (extraFields ?? "").length > 0 ? extraFields : undefined
                            ].filter(d=>d).join("") + "."
                        }
                        if( !doingExtracts ){
                            const revised = await reviseUserRequest( query, config)
                            if( revised.structure ){
                                asStructure = true
                                const answerStructure = (revised.structure.length === 1 && revised.structure[0].subsections) ? revised.structure[0].subsections : revised.structure
                                const fullStructure = {
                                    parts:[{
                                            answered: "a boolean indicating if this part contains an answer or if no answer was found",
                                            answer: answerStructure
                                        }
                                    ]
                                }
                                query = revised.task
                                outPrompt = "Provide your output in a JSON object with this structure:\n" + JSON.stringify(fullStructure) +`\n\nDo not include the "answer" field at all when "answered" is false. If "answered" is true, the "answer" array must contain all required sections with their respective ids and quote arrays.`

                            }
                            console.log(revised)
                        }

                        if( prompts ){
                            const threshold_min = config?.thresholdMin ?? 0.85
                            const threshold_seek = config?.thresholdSeek ?? 0.005
                            const searchTerms = config?.candidateCount ?? 1000
                            const scanRatio = config?.scanRatio ?? 0.15
                            let fragments = await fetchFragmentsForTerm(prompts, {searchTerms, scanRatio, threshold_seek, threshold_min, serachScope}, progress)
                            const oldCount = fragments.length
                            fragments = fragments.filter((d,i,a)=>a.findIndex(d2=>d2.id === d.id && d2.part === d.part)===i)
                            console.log(`have ${oldCount} -> ${Object.keys(fragments).length} fragments`)

                            fragmentList = Object.values( fragments )

                        }else{
                            console.log(`Fetching all fragments`)
                            fragmentList = await ContentEmbedding.find({$and: serachScope},{foreignId:1, part:1, text: 1})
                            fragmentList = fragmentList.sort((a,b)=>a.part - b.part).map(d=>({...d.toJSON(), id: d.foreignId}))
                            if( fragmentList.length === 0){
                                logger.info(`No fragemnts - will revert to context`)
                                for(const d of items){
                                    const context = await buildContext( d )
                                    if(context && context.trim().length > 0){
                                        fragmentList.push({
                                            id: d.id, text: context
                                        })
                                    }
                                }
                            }
                        }

                        
                        if( contextCheck ){
                            logger.info(`Need to check context of documents with filter:\n${contextCheck.context_prompt}`)
                            const sourceInfo = fragmentList.reduce((a,c)=>{
                                a[c.id] ||= {parts: new Set()}
                                a[c.id].parts.add( c.part)
                                return a
                            }, {})

                            const partCount = await ContentEmbedding.aggregate([
                                { 
                                  $match: { foreignId: { $in: Object.keys(sourceInfo) } }
                                },
                                { 
                                  $group: { 
                                    _id: "$foreignId", 
                                    maxPart: { $max: "$part" } 
                                  } 
                                }
                              ]);
                            partCount.forEach(d=>{
                                if( sourceInfo[d._id]){
                                    sourceInfo[d._id].maxPart = d.maxPart + 1
                                    if( sourceInfo[d._id].maxPart === 1){
                                        sourceInfo[d._id].mode = "keep"
                                    }else{
                                        if( sourceInfo[d._id].maxPart > 10 ){
                                            sourceInfo[d._id].mode = 10
                                        }else{
                                            sourceInfo[d._id].mode = "full"
                                        }
                                    }
                                }
                            })

                            logger.debug(`${Object.keys(sourceInfo).length} documents for ${fragmentList.length} fragments`)
                            async function inspectForContext( id ){
                                let sourceFragments = await ContentEmbedding.find({foreignId: id},{foreignId:1, part:1, text: 1})
                                let fragmentsForScan = sourceInfo[id].mode === "start" ? sourceFragments.filter(d=>d.part < sourceInfo[id].mode) : sourceFragments
                                let source  = fragmentsForScan.sort((a,b)=>a.part - b.part).map(d=>d.text).join("\n")
                                console.log(`${id} => ${sourceFragments.length} / ${fragmentsForScan.length} / ${source.length}`)

                                const relevanceCheck = await processPromptOnText( source,{
                                    workspaceId: primitive.workspaceId,
                                    functionName: "query-context",
                                    opener: `here is some data from a docuemnt: <document>`,
                                    prompt: `</document>\n${contextCheck.context_prompt}`,
                                    output: `Return your response in a json object called 'assessment' with the following structure:
                                        {
                                            relevance:[how relevant the document is - one of: high, medium-high, medium, medium-low, or low]
                                            rationale:[a 30 word summary of your assessment]
                                        }`.replaceAll(/\s+/g," "),
                                    engine: "gpt4o-mini",
                                    debug: false,
                                    debug_content: false,
                                    field: "assessment"
                                })
                                if( config.fullText ){
                                    sourceInfo[id].fragments = sourceFragments.sort((a,b)=>a.part - b.part)
                                }

                                if( relevanceCheck.success ){
                                    sourceInfo[id].relevance = relevanceCheck.output[0]?.relevance
                                    sourceInfo[id].rationale = relevanceCheck.output[0]?.rationale
                                }
                            }
                            const forInspection = config.fullText ? Object.keys(sourceInfo) : Object.keys(sourceInfo).filter(d=>sourceInfo[d].mode !== "keep")
                            console.log(`Inspecting ${forInspection.length}`)

                            await executeConcurrently( forInspection, inspectForContext)
                            
                            Object.keys(sourceInfo).forEach(d=>{
                                logger.debug(`${d} => ${sourceInfo[d].parts.size} parts used of ${sourceInfo[d].maxPart} [${sourceInfo[d].mode}] ${sourceInfo[d].relevance} ${sourceInfo[d].rationale}`)
                            })
                            for(const score of ["low", "medium-low","medium","medium-high","high"]){
                                logger.debug(`${score}: ${Object.values(sourceInfo).filter(d=>d.relevance === score).length}`)
                            }
                            const toRemove = ["low", "medium-low","medium"]
                            const removeIds = new Set(forInspection.filter(d=>toRemove.includes(sourceInfo[d].relevance)))
                            logger.info(`Will remove ${removeIds.size} documents`)


                            if( config.fullText ){
                                const sourceIds = Object.keys(sourceInfo).filter(d=>!removeIds.has(d) )
                                console.log(`For full doc, will construct ${sourceIds.length} documents`)
                                fragmentList = sourceIds.map(id=>{
                                    if( sourceInfo[id].mode === "full" || sourceInfo[id].mode === "keep"){
                                        const text = sourceInfo[id].fragments.map(d=>d.text).join("\n").replaceAll("\n"," ").replaceAll(/\s+/g," ")
                                        return {
                                            id: id,
                                            text
                                        }
                                    }else{
                                        const BZ = 5
                                        const fragmentSets = Object.values([...(new Set(sourceInfo[id].parts))].reduce((a,c)=>{
                                            let startId = Math.max(Math.floor((c - BZ) / BZ) * BZ,0)
    
                                            if (startId > BZ && (c - startId < (BZ / 2))) {
                                                startId -= BZ;
                                            }
                                        
                                            if(!a[startId]){
                                                const s = startId
                                                a[startId]=[s, s + (BZ * 2)- 1]
                                            }
                                            return a
                                        },{}))
                                        console.log(fragmentSets)
                                        return fragmentSets.map(bracket=>{
                                            const text = sourceInfo[id].fragments.slice(bracket[0], bracket[1]).map(d=>d.text).join("\n").replaceAll("\n"," ").replaceAll(/\s+/g," ")
                                            return {
                                                id: id,
                                                text
                                            }
                                        })

                                        
                                    }
                                }).flat(Infinity)
                                console.log(`Rebuilt fragment list to full doc`)

                            }else{
                                fragmentList = fragmentList.filter(d=>!removeIds.has(d.id) )
                                console.log(`Filtered to ${fragmentList.length} for relevance`)
                            }
                        }
                        const fragmentText = fragmentList.map(d=>d.text)


                        let batchSize = config.batchSize ?? undefined
                        if( batchSize === 0){
                            batchSize = doingExtracts ? 20 : undefined
                        }
                        const results = await processPromptOnText( fragmentText,{
                            workspaceId: primitive.workspaceId,
                            functionName: "query-runquery",
                            opener:  doingExtracts ? "Here is a list of numbered items to process" : `Here is a list of numbered text fragments to help answer a task. And here is the task i will ask you to perform:<task>${query}</task>\n<fragments>`,
                            prompt: `</fragments>\nInstructions:\n1) Review the provided data and filter out anything that is not relevant to the task\n2) Using only the information explicitly provided in the filtered text fragments answer the complete the task above. Ensuring you use all relevant information i've provided to give a comprehensive answer`,
                            output: outPrompt,
                            no_num: false,
                            maxTokens: 40000,
                            temperature: 1,
                            markPass: true,                            
                            batch: batchSize,
                            engine: config.engine ?? "gpt-4o",
                            idField: "ids",
                            debug: false,
                           debug_content: false,
                            field: asStructure ? "parts" : "answer"
                        })
                        console.log(`For ${options.inheritValue} for ${results.output?.length} for ${fragmentList.length}`)
                        if( results.success && Array.isArray(results.output)){
                            results.output = results.output.filter(d=>d.answered)
                            let final = results.output

                            for( const d of final){
                                let newData, ids 
                                console.log(`--- Consolidating`)
                                console.log(d)
                                if( asStructure ){
                                    const summary = flattenStructuredResponse( d.answer)
                                    ids = extractFlatNodes(d.answer).flatMap(d=>d.ids)
                                    console.log(summary, ids)
                                    newData = {
                                        workspaceId: primitive.workspaceId,
                                        parent: primitive.id,
                                        paths: ['origin',`results.${resultSet}`],
                                        data:{
                                            type: extractTargetCategory?.primitiveType ?? "result",
                                            referenceId: resultCategoryId,
                                            title: summary.split(" ").slice(0,15).join(" "),
                                            referenceParameters: {
                                                structured_summary: d.answer,
                                                description: summary,
                                                ...d.answer.reduce((a,c)=>{a[`EXT_${c.heading}`] = c.content; return a}, {})
                                            },
                                            source: ids?.map(d=>{return {primitive: d.id, part: d.part}})
                                        }
                                    }
                                }else{
                                    const {title, ...extracts} = metadataItems.reduce((a,c)=>{a[metadata[c]?.field ?? c] = d[metadata[c]?.field ?? c]; return a},{})
                                    if( options.inheritField ){
                                        extracts[options.inheritField] = options.inheritValue
                                    }
                                    ids = typeof(d.ids) === "string" ? d.ids.split(",").map(d=>parseInt(d.trim())) : d.ids?.map(d=>d)
                                    newData = {
                                        workspaceId: primitive.workspaceId,
                                        parent: primitive.id,
                                        paths: ['origin',`results.${resultSet}`],
                                        data:{
                                            type: extractTargetCategory?.primitiveType ?? "result",
                                            referenceId: resultCategoryId,
                                            title: title ?? d.overview,
                                            referenceParameters: {
                                                description: d.answer,
                                                ...extracts,
                                                quote:d.quote
                                            },
                                            source: ids?.map(d=>{return {primitive: d.id, part: d.part}})
                                        }
                                    }

                                }
                                const newPrim = await createPrimitive( newData )
                                if( newPrim ){
                                    if(options.addToScope && scopeNode){
                                        console.log(`added ${newPrim.id} / ${newPrim.plainId} to scopeNode ${scopeNode.id} / ${scopeNode.plainId}`)
                                        await addRelationship(scopeNode.id, newPrim.id, "auto")

                                    }
                                    if( ids ){

                                        const primitiveIds = ids.map(idx=>fragmentList[idx]?.id).filter((d,i,a)=>a.indexOf(d) === i )
                                        console.log(`need to link in ${primitiveIds.join(", ")} as ${options.linkAsChild ? "child" : "parent"}`)
                                        for(const id of primitiveIds){
                                            if( options.linkAsChild ){
                                                try{
                                                    await addRelationship(id, newPrim.id, 'auto')
                                                }catch(error){
                                                    console.log(`Couldnt link in ${id} - >${newPrim.id} auto`)
                                                }
                                            }else{
                                                try{
                                                    await addRelationship(newPrim.id, id, 'source')
                                                }catch(error){
                                                    console.log(`Couldnt link in ${newPrim.id} - >${id} source`)
                                                }
                                            }
                                        }
                                    }
                                }
                                
                            }
                        }


                    }
                }

}

async function processQuestions( data ){
    try{

        console.log(`Answering questions for ${data.id}`)
        const primitive = await Primitive.findOne({_id: data.id})
        const primitiveCategory = await Category.findOne({id: primitive.referenceId})
        //const origin = await Primitive.findOne({_id: primitiveOrigin(primitive) })
        //let questions = await primitiveChildren(origin, "question")
        const task = await primitiveTask( primitive )
        let questions = await primitiveChildren(task, "question")
        let keepItems = data.remove_first === false

        if( data.qIds ){
            console.log(`Filter ${questions.length} questions`)
            questions = questions.filter((d)=>data.qIds.includes(d.id))
        }
        console.log(keepItems ? "Will keep existing" : "Will remove existing")
        console.log(`Got ${questions.length} questions from for ${task.id}`)

        
        const groups = {}
        for(const question of questions){
            const prompts = await primitiveChildren(question, "prompt")
            for(const prompt of prompts){

                if( !keepItems ){
                    let oldEvidence =  await primitivePrimitives(prompt, 'primitives.auto', "evidence" )
                    oldEvidence = oldEvidence.filter((d)=>d.parentPrimitives[data.id]?.includes('primitives.origin'))
                    console.log( `----> got ${oldEvidence.length} to remove`)
                    for( const old of oldEvidence){
                        await removePrimitiveById( old.id )
                    }
                }

                const category = await Category.findOne({id: prompt.referenceId})
                if( category ){
                    const targetId = question.id // prompt.referenceId
                    groups[targetId] = groups[targetId] || {
                        category: category,
                        id: prompt.referenceId,
                        prompts: [],
                    }
                    if( question.referenceParameters?.engine){
                        groups[targetId].engine = question.referenceParameters?.engine                        
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
                        groups[targetId].prompts.push( {
                            id: prompt.id,
                            text: out
                        } )
                    }
                }
            }

        }
        let extract
        if( primitiveCategory ){
            const field = Object.keys(primitiveCategory.parameters ?? {}).find(d=>primitiveCategory.parameters[d].useAsContent)
            if( field ){
                extract = {plain: primitive.referenceParameters?.[field] ?? ""}
            }
        }
        
        if( !extract ){
            extract = await getDocumentAsPlainText( primitive.id, data.req, null, true )
        }

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
                    engine: group.engine ?? group.category.openai.engine,
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
                    engine: group.engine ?? group.category.openai.engine,
                    prefix: group.category.openai.prefix,
                    postfix: group.category.openai.postfix,
                    temperature: group.category.openai.temperature,
                })

                console.log(result.response)
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
    if (!instance) {
        instance = new DocumentQueueClass();
        instance.myInit();
    }
    return instance;
}

class DocumentQueueClass extends BaseQueue{
    constructor() {
        super('document', undefined, 5)
    }
    async doDataQuery( primitive, options ){
        const workspaceId = primitive.workspaceId
        const field = `processing.ai.data_query`

        if(primitive.processing?.ai?.data_query && (new Date() - new Date(primitive.processing.ai.data_query.started)) < (5 * 60 *1000) ){
            console.log(`Already active on ${primitive.id} / ${primitive.plainId} - exiting`)
            return false
        }
        
        const data = {id: primitive.id, mode: "data_query", field: field, ...options}
        dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date()}, {track: primitive.id, text:"Parsing document"})
        await this.addJob(workspaceId, {id: primitive.id, ...data, field})
    }
    async trafficReport( primitive, options ){
        const workspaceId = primitive.workspaceId
        const field = `processing.ai.traffic_report`

        if(primitive.processing?.ai?.traffic_report && (new Date() - new Date(primitive.processing.ai.traffic_report.started)) < (5 * 60 *1000) ){
            console.log(`Already active on ${primitive.id} / ${primitive.plainId} - exiting`)
            return false
        }
        
        const data = {id: primitive.id, mode: "traffic_report", field: field, ...options}
        dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date()}, {track: primitive.id, text:"Looking up traffic report"})
        await this.addJob(workspaceId, {id: primitive.id, ...data, field})
    }
    
    async documentDiscovery( primitive, req ){
        if( primitive.type === "result"){
            const workspaceId = primitive.workspaceId
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
            const data = {
                mode: "discovery", 
                req: {user: {accessToken: req.user.accessToken, refreshToken: req.user.refreshToken}}
            }
            await  this.addJob(workspaceId, {id: primitive.id, ...data, field: field})
            dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date(), targetFields: fieldList}, {user: req?.user?.id, track: primitive.id, text:"Parsing document"})
        }
        return true
    }
        
    async processQuestions( primitive, options, req ){
        try{
            const workspaceId = primitive.workspaceId
            const field = `processing.ai.document_questions`

            if( primitive.type === "result"){
                if(primitive.processing?.ai?.document_questions && (new Date() - new Date(primitive.processing.ai.document_questions.started)) < (5 * 60 *1000) ){
                    console.log(`Already active - exiting`)
                }
                const data  ={
                    mode: "questions", ...options, 
                    req: {user: {accessToken: req.user.accessToken, refreshToken: req.user.refreshToken}}
                }
                if(await this.addJob(workspaceId, {id: primitive.id, ...data, field: field}) ){
                    console.log(`Added - updating control flag`)
                    dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date(), subset: options?.qIds}, {user: req?.user?.id, track: primitive.id, text:"Processing document"})
                }
            }
        }catch(error){
            console.log(`Error in processQuestions`)
            console.log(error)
            return false
        }
        return true
    }

}

export async function extractEvidenceFromFragmentSearch( primitive, config){
    const prompts = primitive.referenceParameters?.[config?.promptField]
    console.log(prompts)
    let fragments = []
    if(prompts ){
        const resultPaths = ['auto']

        const resultCategoryId = config.resultCategoryId 
        const resultCategory = await Category.findOne({id: resultCategoryId})
        if( !resultCategory){
            throw `Couldnt find resultCategory ${resultCategoryId}`
        }
        if( !resultCategory.ai?.extract){
            throw `resultCategory ${resultCategoryId} missing ai.extract config`
        }
        const resultSet = await findResultSetForCategoryId( primitive, resultCategoryId)
        if( resultSet === undefined && resultCategory.primitiveType !== "evidence"){
            throw "No resultset found"
        }
        if( resultSet !== undefined ){
            resultPaths.push(`results.${resultSet}`)
        }

        const serachScope = [{workspaceId: primitive.workspaceId}]
        const threshold_min = primitive.referenceParameters?.thresholdMin ?? 0.85
        const searchTerms = primitive.referenceParameters?.candidateCount ?? 1000
        const scanRatio = primitive.referenceParameters?.scanRatio ?? 0.15

        if( config.limit){
            const [items, _] = await getDataForProcessing( primitive, {target: config.scope ?? "all_descend"})
            console.log(`Scope limited to ${items.length}`)
            const ids = items.map(d=>d.id)
            serachScope.push({foreignId: {$in: ids}})
            console.log(serachScope)
        }

        
        console.log(`Getting fragments`)
        fragments =  await fetchFragmentsForTerm(prompts, {serachScope,searchTerms, scanRatio, threshold_min}) 
        console.log(`have ${fragments.length} fragments`)

        const context = await buildContext( primitive ) 

        const task = await primitiveTask(primitive)
        let scope = `'${task.referenceParameters.focus} during ${primitive.title}'`// stage of ${task.referenceParameters.topics}`

        function finalizeString(string){
            return string
                        .replaceAll('{scope}', scope)
                        .replaceAll('{focus}', task.referenceParameters.focus)
                        .replaceAll('{topic}', task.referenceParameters.topics)
                        .replaceAll('{task_scope}', "the specified research area and focus")}

        const prompt = finalizeString(resultCategory.ai.extract.prompt)
        let output = `Provide the result as a json object with a field called 'results' containing an array of results with each entry `
        

        let resultFieldNames = []
        if( resultCategory.ai.extract.responseFields ){
            output += " having the following structure \{"
            for(const k of Object.keys(resultCategory.ai.extract.responseFields) ){
                const field = resultCategory.ai.extract.responseFields[k].target ?? k
                output += `${field}: ${finalizeString(resultCategory.ai.extract.responseFields[k].prompt)},`
                resultFieldNames.push(field )
            }
            output += "r: a 6 word justification of how the problem is relavent to the specified focus, i: the number of the text fragment the item was extracted from as an integer}"

        }else{
            output += " being a string with one of the results"
        }


        const result = await processPromptOnText( fragments.map(d=>d.text),{
            opener: `I am researching the following:\nResearch area:${task.referenceParameters.topics}\nSpecific Focus: ${scope}\nHere is a set of text fragments i want you to analyze carefully:`,
            //opener: "Here is a list of text fragments I want you to analyze:",
            prompt: prompt,
            output: output,
            no_num: false,
            engine: "gpt4p",
            batch: 100,
            temperature: 0.7,
            debug:true
        })
        if( result?.success && result.output){
            console.log(result.output)
            for(const entry of result.output){
                const idx = typeof(entry.i) === "string" ? parseInt(entry.i) : entry.i
                const match = findQuoteLocation(fragments[idx].text, entry.quote )
                console.log(match)
                if( match.distance > MAX_QUOTE_TEXT_DISTANCE_THRESHOLD ){
                    console.log(`Couldnt find quote`)
                    console.log(entry.quote)
                    console.log(fragments[idx].text)
                }else{
                    console.log( ` --- ${entry.title}`)

                    const newPrim = await createPrimitive( {
                        workspaceId: primitive.workspaceId,
                        paths: resultPaths,
                        parent: primitive.id,
                        data:{
                            type: resultCategory.primitiveType,
                            referenceId: resultCategoryId,
                            title: entry.title,
                            referenceParameters: {
                                quoted: true,
                                quote: entry.quote,
                                ...resultFieldNames.reduce((a,c)=>{a[c] = entry[c];return a},{})
                            }
                        }
                    } )
                    if( newPrim ){
                        console.log(`Adding ref to ${fragments[idx].id}`)
                        await  addRelationship(fragments[idx].id, newPrim.id, 'origin')
                    }
                }
            }
        }
    }
}


export function findQuoteLocation(originalText, quote) {
    originalText = originalText.trim().toLowerCase();
    quote = quote.trim().toLowerCase();
  
    const words = originalText.split(' ');
  
    let bestMatch = { index: -1, distance: Infinity };
    let window = quote.split(' ').length 
    for(let buffer = 0; buffer < 10; buffer++ ){
        for (let i = 0; i < words.length; i++) {
            if( bestMatch.distance === 0){
                continue
            }
            let testString = words.slice(i, i + window + buffer).join(' ');
            
            let distance = 1 - compareTwoStrings(testString, quote);
            
            if (distance < bestMatch.distance) {
                bestMatch = { index: i, distance };
            }
        }
    }

    if( bestMatch.index >= 0){
        let pos = words.slice(0, bestMatch.index).join(" ").length + 1
        return {index: pos, distance: bestMatch.distance}
    }
    return undefined
  
  }

registerAction("traffic_report", {categoryId: 34}, async (...args)=>{await QueueDocument().trafficReport(...args)})