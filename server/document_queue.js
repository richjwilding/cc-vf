import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import { getDocumentAsPlainText, importDocument, locateQuote, removeDocument } from "./google_helper";
import Primitive from "./model/Primitive";
import { addRelationship, buildContext, createPrimitive, dispatchControlUpdate, fetchPrimitive, fetchPrimitives, findResultSetForCategoryId, findResultSetForType, getDataForImport, getDataForProcessing, getNestedValue, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentsOfType, primitivePrimitives, primitiveTask, removePrimitiveById, removeRelationship, updateFieldWithCallbacks } from "./SharedFunctions";
import Category from "./model/Category";
import { analyzeText, analyzeText2, buildEmbeddings, processPromptOnText, summarizeMultiple, summarizeMultipleAsList } from "./openai_helper";
import Contact from "./model/Contact";
import ContentEmbedding from "./model/ContentEmbedding";
import PrimitiveParser from "./PrimitivesParser";
import { searchPosts } from "./linkedin_helper";
import { fetchFragmentsForTerm } from "./DocumentSearch";

const parser = PrimitiveParser()


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


                const doingExtracts = primitive.referenceParameters?.extract


                const resultCategoryId =  doingExtracts ? primitive.referenceParameters?.extract : (options.resultCategoryId ?? action.resultCategoryId)
                const resultSet = doingExtracts ?  (await findResultSetForType( primitive, "evidence")) : (await findResultSetForCategoryId( primitive, resultCategoryId))
                if( resultSet === undefined ){
                    throw "No resultCategoryId specified"
                }
                const extractTargetCategory = doingExtracts ? (await Category.findOne({id: resultCategoryId}))?.toJSON() : undefined
                
                const parentForScope = (await primitiveParentsOfType(primitive, "working"))?.[0]

                const serachScope = [{workspaceId: primitive.workspaceId}]
                
                const scope = options.scope ?? primitive.primitives?.params?.scope?.[0] ?? parentForScope?.primitives?.params?.scope?.[0]
                const referenceCategoryFilter = options.referenceCategoryFilter ?? primitive.referenceParameters?.referenceCategoryFilter ?? parentForScope?.referenceParameters?.referenceCategoryFilter


                let items
                if( scope  ){
                    const node = await fetchPrimitive( scope )
                    if( node.type === "view" ){
                        const interim = await getDataForImport(node)

                        if( primitive.referenceParameters.group){
                            console.log(`Will go via groups - have ${interim.length} to do`)
                            for(const d of interim){
                                console.log(`-- Doing for ${d.plainId} / ${d.title}`)
                               // if( d.plainId === 313195){
                                    await doDataQuery({...options, inheritValue: d.title, inheritField: "scope", group: undefined, scope: d.id})
                                //}
                            }
                            return
                        }

                        console.log(`Got ${interim.length} for view `)
                        items = await primitiveDescendents( interim, "result")
                    }else{
                        items = await primitiveDescendents( node, "result")
                    }
                    
                }
                if( referenceCategoryFilter ){
                    const asNum = parseInt( referenceCategoryFilter)
                    if( !isNaN(asNum) ){
                        if(!items ){
                            items = await Primitive.find({
                                workspaceId: primitive.workspaceId,
                                referenceId: asNum,
                                deleted: {$exists: false}
                            })
                            console.log(`Looked up ${items.length}`)
                        }else{
                            items = items?.filter(d=>d.referenceId === asNum)
                        }
                    }
                }
                if(items){
                    const ids = items?.map(d=>d.id)
                    serachScope.push({foreignId: {$in: ids}})
                    console.log(`Constrained to ${ids.length} items`)
                }
                
                let keepItems = !options.remove_first

                if( !keepItems ){
                    let oldEvidence =  await primitiveChildren(primitive, "result")
                    console.log( `----> got ${oldEvidence.length} to remove`)
                    for( const old of oldEvidence){
                        await removePrimitiveById( old.id )
                    }
                }
                let query = primitive.referenceParameters?.query //|| primitive.title
                console.log(`Got query ${query}`)

                const default_metadata = {
                    "organizations": "an 'organizations' field containing an array of specific and relevant orgnaization name (where specified)", 
                    "organization_type": "an 'organization_type' field containing an array of specific and relevant orgnaization name (where specified)", 
                    "individuals": "an 'individuals' field containing an array of specific and relevant individuals (where specified)", 
                    "solutions": "an 'solutions' field containing an array of the specific key solutions offered to customers (where specified)", 
                    "roles": "a 'roles' field containing an array of specific and relevant roles (where specified)", 
                    "problems": "a 'problems' field containing an array of the specific key problems (where specified)", 
                    "jobs to be done": {field: "jtbd", prompt: "a 'jtbd' field containing an array of specific key jobs to be done (where specified)"}, 
                    "value proposition": {field: "value_proposition", prompt: "a 'value_proposition' field containing an array of value propositions in the format 'helping [person or role with need] to [what they want to accompolish] by [value derlivered]' (where specified)"}, 
                    "needs": "a 'needs' field containing an array of needs and relevant needs (where specified)", 
                    "experience_level": "a 'experience_level' field containing an array of seniority or experience level (where specified or infrerred)", 
                    "responsibilities": "a 'responsibilities' field containing an array of responsiilities the person has (where specified or infrerred)", 
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
                else if( primitive.referenceParameters?.sections){
                    metadata = primitive.referenceParameters?.sections.reduce((a,d )=>{
                        const [key,value] = d.split(":")
                        a[key] = `a ${key} field containing ${value}`
                        return a
                    },{})
                }else{
                    metadata = default_metadata
                }
                console.log(metadata)
                let results
                if( query && query.trim().length > 0 ){

                    results = await processPromptOnText( query,{
                        opener: `You have access to a database of many thousands of text fragments and must answer questions or complete tasks using information in the database.  Fragments have been encoded with embeddings and can be retrieved with appropriate keywords or phrases. Here is a task or question:`,
                        //prompt: `Build a list of ${primitive.referenceParameters?.lookupCount ?? ""} keywords and phrases that will retrieve information from the database which can answer this task or question. The database can also support extraction of different metadata (organizations, organization_type, responsibilities, experience_level, individuals, roles, problems, solutions, jobs to be done, value proposition, and needs), assess which of this meatadata is key to the question or task`,
                        prompt: `Build a list of ${primitive.referenceParameters?.lookupCount ?? ""} keywords and phrases that will retrieve information from the database which can answer this task or question. The database can also support extraction of different metadata (${Object.keys(metadata).join(", ")}), assess which of this meatadata is key to the question or task`,
                        output: `Return the result in a json object called "result" with a field called 'prompts' containing the keyword and phrases list as an array, and a 'metadata' field containing the identified metadata to extract as an array`,
                        engine: "gpt4p",
                        debug: true,
                        debug_content: true,
                        field: "result"
                    })
                }else{
                    if( doingExtracts ){
                        query = `Analyze each numbered item i have provided to generate an assessment of the messaging content, structure and style.  You must produce an assessment for each and every item and return each as a seperate part of your answer.`
                        results = {success: true, allItems: true }
                    }
                }


                if( results?.success ){
                    let metadataItems = doingExtracts ? Object.keys(metadata) : results.output?.[0]?.metadata ?? []
                    let parts = doingExtracts ? Object.values(metadata).join(", ") : metadataItems.filter(d=>metadata[d]).map(d=>metadata[d].prompt ?? metadata[d]).join(", ")?.trim() 
                    let extraFields = parts.length > 0 ? " for each part of your answer also include " + parts : ""

                    if( primitive.referenceParameters.extracts ){
                        extraFields = " for each part of your answer also include "
                        extraFields += primitive.referenceParameters.extracts.map(extract=>
                            `a '${extract.field}' field containing ${extract.prompt}`
                        ).join(", ") + "."
                        metadataItems = primitive.referenceParameters.extracts.map(d=>d.field)
                    }
                    const prompts = results.output?.[0]?.prompts
                    console.log(prompts)
                    if( prompts || results.allItems){
                        let fragmentList

                        const quote = primitive.referenceParameters?.quote ?? true
                        const targetWords = doingExtracts ? "no more than 30 words" : primitive.referenceParameters?.words ?? "3 paragraphs each of 100-200 words and in a plain string format with appropriately escaped linebreaks"

                        const outPrompt = [
                            `Return the result in a json object called "answer" which is an array containing every part of your answer.  Each part must have a boolean 'answered' field indicating if this part contains an answer or if no answer was found, an 'overview' field containing a summary of the part in no more than 20 words, an 'answer' field containing the full part of the answer in ${targetWords}`,
                            quote ? `, a 'quote' field containing up to 50 words of the exact text used from the fragments` : undefined,
                            `, a 'ids' field containing the number of the text fragments containing information used to produce this specific part of the answer (include no more than 10 numbers), and a 'count' field indicating the total number of text fragments used in this part of the answer.`,
                            (extraFields ?? "").length > 0 ? extraFields : undefined
                        ].filter(d=>d).join("") + "."

                        if( prompts ){
                            let fragments = []
                            const threshold_min = primitive.referenceParameters?.thresholdMin ?? 0.85
                            const threshold_seek = primitive.referenceParameters?.thresholdSeek ?? 0.005
                            const searchTerms = primitive.referenceParameters?.candidateCount ?? 1000
                            const scanRatio = primitive.referenceParameters?.scanRatio ?? 0.15
                            for( const prompt of prompts ){
                                console.log(`Fetching for ${prompt}`)
                                fragments = fragments.concat( await fetchFragmentsForTerm(prompt, {searchTerms, scanRatio, threshold_seek, threshold_min, serachScope}) )
                            }
                            console.log(`have ${Object.keys(fragments).length} fragments`)
                            fragments = fragments.filter((d,i,a)=>a.findIndex(d2=>d2.id === d.id)===i)
                            console.log(`have ${Object.keys(fragments).length} fragments`)

                            fragmentList = Object.values( fragments )//.slice(132,270)

                        }else{
                            fragmentList = await ContentEmbedding.find({$and: serachScope},{foreignId:1, part:1, text: 1})
                            fragmentList = fragmentList.map(d=>({...d.toJSON(), id: d.foreignId}))
                        }


                        const fragmentText = fragmentList.map(d=>d.text)
                        const results = await processPromptOnText( fragmentText,{
                            opener:  doingExtracts ? "Here is a list of numbered items to process" : `Here is a list of numbered text fragments you can use to answer a question `,
                            prompt: `Using only the information explcitly provided in the text fragments answer the following question or task: ${query}.\nEnsure you use all relevant information to give a comprehensive answer.`,
                            //output: `Return the result in a json object called "answer" which is an array containing one or more parts of your answer.  Each part must have a 'overview' field containing a summary of the part in no more than 20 words, an 'answer' field containing the full part of the answer in 100-250 words, a 'quote' field containing up to 50 words of the exact text used from the fragments, a 'ids' field containing the number of the text fragments containing information used to produce this specific part of the answer (include no more than 10 numbers), and a 'count' field indicating the total number of text fragments used in this part of the answer.${(extraFields ?? "").length > 0 ? extraFields + ", " : ""}`,
                            output: outPrompt,
                            engine: "gpt4p",
                            no_num: false,
                            maxTokens: 40000,
                            temperature: 1,
                            markPass: true,
                            batch:  doingExtracts ? 10 : undefined, 
                            idField: "ids",
                            debug: true,
                          // debug_content: true,
                            field: "answer"
                        })
                        console.log(results.output)
                        if( results.success && Array.isArray(results.output)){
                            results.output = results.output.filter(d=>d.answered)
                            let final
                            const needsCompact = !doingExtracts && options.compact && results.output.map(d=>d._pass).filter((d,i,a)=>a.indexOf(d)===i).length > 1
                            if( needsCompact ){
                                final = []
                                console.log(`Need to dedupe multi-pass answer`)
                                const toProcess = results.output.map((d,idx)=>JSON.stringify({
                                    id: idx,
                                    title: d.title,
                                    pass: d._pass,
                                    //...metadataItems.reduce((a,c)=>{a[c] = d[c]; return a},{}),
                                    description: d.answer
                                }))

                                const compact = await processPromptOnText( toProcess,{
                                    opener: `here is a json array containing the results from a query.`,
                                    //prompt: `Analyze the entries to identify groups of entries which can be combined together based upon the similarity of the underlying problems being addressed and the solution as detailed in the 'description' field. Combine only those entries that are very similar, ensuring that nuances of different entries are kept.  Only combine entries that have a different 'pass' field and ensure any entry that is combined is combined with the best fitting other entries.`,
                                    prompt: `Analyze the entries to identify groups of entries which can be combined together based upon the similarity of topics as detailed in the 'description' and 'title' fields. Combine only those entries that are very similar, ensuring that nuances of different entries are kept.  Only combine entries that have a different 'pass' field and ensure any entry that is combined is combined with the best fitting other entries.`,
                                    output: `Generate a new json object with a field called 'output' which is an object with a 'existing' field containing an array of ids of the entries that are not being combined, and a 'new' field containing a list of new entries with each entry containing a 'description' field with a new description that combines all of the descriptions of the entries that are being combined to make the new entry, an 'overview' field containing a summary of new description in no more than 20 words, and an 'ids' field containing the ids of the original entries that have been merged into the new entry.  Ensure that all entries from the original list are included in the either the existing field or in one of the new entries.`,
                                    engine: "gpt4p",
                                    no_num: false,
                                    temperature:1,
                                    maxTokens: 80000,
                                    markPass: true,
                                    field: 'output',
                                    debug: true,
                                  debug_content: true,
                                })
                                if( compact.success && compact.output){
                                    const updates = compact.output[0]
                                    if(updates.existing){
                                        for( const id of updates.existing){
                                            final.push( results.output[id] )
                                        }
                                    }
                                    if(updates.new){
                                        for( const remap of updates.new){
                                            if( remap.ids ){
                                                const merge = remap.ids.map(id=>results.output[id] )
                                                let keys = merge.map(d=>Object.keys(d)).flat().filter((d,i,a)=>a.indexOf(d)===i)
                                                keys = keys.filter(d=>metadataItems.includes(d))
                                                keys.push("ids")


                                                const mappedSub = keys.reduce((a,c)=>{
                                                    const allItems = merge.map(d=>d[c]).flat().filter(d=>d)
                                                    a[c] = allItems.filter((d,i,a)=>d instanceof Object ? true : a.findIndex(d2=>isNaN(d) ? d.toLowerCase() === d2.toLowerCase() : d === d2)===i)
                                                    return a
                                                },{})

                                                const item = {
                                                    answer: remap.description,
                                                    overview: remap.overview,
                                                    ...mappedSub
                                                }
                                                final.push( item )
                                            }
                                        }
                                    }
                                    console.log(`Have ${final.length} after merge`)
                                }else{
                                    throw "Error consolidating items"
                                }

                            }else{
                                final = results.output
                            }
                            if( !doingExtracts && options.consolidate){
                                const partials = JSON.stringify(final.filter(d=>d.answered).map(d=>({partial: d.answer, ids: d.ids})))
                                console.log(`Consolidating.....`, partials)
                                const results = await processPromptOnText(partials ,{
                                    opener: `Here is a JOSN structure holding partial responses to a question - each partial includes a 'partal' string and a list of ids in 'ids'`,
                                    prompt: `Consolidate the partial responses based on the questions or topics they are answering to produce an answer to following question or task: ${query}.\nEnsure you use all relevant information to give a comprehensive answer but be concise in your phrasing and the level of detail.`,
                                    output: `Return the result in a json object called "answer" which is an array containing one or more parts of your answer.  Each part must have a boolean 'answered' field indicating if this part contains an answer or if no answer was present in the partials, an 'answer' field containing a consolidated and comprehensive answer from those partials focussed on the same topic in ${targetWords}, an 'overview' field providing a 30-40 word summary of your consolidated answer, and an 'ids' field containing a consolidated list of ids from the partials used to form the consolidated answer`,
                                    engine: "gpt4p",
                                    no_num: false,
                                    maxTokens: 60000,
                                    temperature: 1,
                                    markPass: true,
                                    idField: "ids",
                                    debug: true,
                                //  debug_content: true,
                                    field: "answer"
                                })
                                final = results.output?.filter(d=>d.answered)

                            }

                            for( const d of final){
                                const extracts = metadataItems.reduce((a,c)=>{a[metadata[c]?.field ?? c] = d[metadata[c]?.field ?? c]; return a},{})
                                if( options.inheritField ){
                                    extracts[options.inheritField] = options.inheritValue
                                }
                                const newData = {
                                    workspaceId: primitive.workspaceId,
                                    parent: primitive.id,
                                    paths: ['origin',`results.${resultSet}`],
                                    data:{
                                        type: extractTargetCategory?.primitiveType ?? "result",
                                        referenceId: resultCategoryId,
                                        title: d.overview,
                                        referenceParameters: {
                                            ...extracts,
                                            description: d.answer,
                                            quote:d.quote
                                        },
                                        source: d.ids?.map(d=>{return {primitive: d.id, part: d.part}})
                                    }
                                }
                                const newPrim = await createPrimitive( newData )
                                if( newPrim ){
                                    console.log(`need to link in`)
                                    const primitiveIds = d.ids.map(idx=>fragmentList[idx]?.id).filter((d,i,a)=>a.indexOf(d) === i )
                                    console.log(primitiveIds)
                                    for(const id of primitiveIds){
                                        try{
                                            await addRelationship(newPrim.id, id, 'link')
                                        }catch(error){
                                            console.log(`Couldnt link in ${newPrim.id} - >${id} link`)
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
        let extract
        if( primitiveCategory ){
            const field = Object.keys(primitiveCategory.parameters ?? {}).find(d=>primitiveCategory.parameters[d].useAsContent)
            if( field ){
                extract = {plain: primitive.referenceParameters?.[field] ?? ""}
            }
        }
        
        if( !extract ){
            extract = await getDocumentAsPlainText( primitive.id, data.req )
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
        }
    });
    instance.myInit = async ()=>{
        console.log("Document Queue")
        const jobCount = await instance.count();
        console.log( jobCount + " jobs in queue (document)")
        await instance.obliterate({ force: true });
        const newJobCount = await instance.count();
        console.log( newJobCount + " jobs in queue (document)")
    }
    
    instance.doDataQuery = async ( primitive, options )=>{
        const field = `processing.ai.data_query`
        if(primitive.processing?.ai?.data_query && (new Date() - new Date(primitive.processing.ai.data_query.started)) < (5 * 60 *1000) ){
            console.log(`Already active - exiting`)
            return false
        }
        dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date()}, {track: primitive.id, text:"Parsing document"})
        instance.add(`discovery_${primitive.id}` , {id: primitive.id, mode: "data_query", field: field, ...options})
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
    instance.processQuestions = async ( primitive, options, req )=>{
        try{

            
            if( primitive.type === "result"){
                const field = `processing.ai.document_questions`
                if(primitive.processing?.ai?.document_questions && (new Date() - new Date(primitive.processing.ai.document_questions.started)) < (5 * 60 *1000) ){
                    console.log(`Already active - exiting`)
                }
                dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date(), subset: options?.qIds}, {user: req?.user?.id, track: primitive.id, text:"Processing document"})
                instance.add(`questions_${primitive.id}` , {id: primitive.id, mode: "questions", field: field, ...options, req: {user: {accessToken: req.user.accessToken, refreshToken: req.user.refreshToken}}})
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
        if( job.data.mode === "data_query" ){
            try{
                console.log("go")
                await doDataQuery(job.data)
            }catch(error){
                console.log(`Error in doDataQuery`)
                console.log(error)
            }
            console.log(`resetting`, job.data)
            dispatchControlUpdate(job.data.id, job.data.field , null, {track: job.data.id})
        }
        if( job.data.mode === "questions" ){
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
                const extract = await getDocumentAsPlainText( primitiveId, job.data.req, false, true)
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
    {
        connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT },
        maxStalledCount: 0,
        removeOnFail: true,
        stalledInterval:300000
    });
    return instance
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

function compareTwoStrings(first, second) {
    //https://github.com/aceakash/string-similarity#readme
	first = first.replace(/\s+/g, '')
	second = second.replace(/\s+/g, '')

	if (first === second) return 1; // identical or empty
	if (first.length < 2 || second.length < 2) return 0; // if either is a 0-letter or 1-letter string

	let firstBigrams = new Map();
	for (let i = 0; i < first.length - 1; i++) {
		const bigram = first.substring(i, i + 2);
		const count = firstBigrams.has(bigram)
			? firstBigrams.get(bigram) + 1
			: 1;

		firstBigrams.set(bigram, count);
	};

	let intersectionSize = 0;
	for (let i = 0; i < second.length - 1; i++) {
		const bigram = second.substring(i, i + 2);
		const count = firstBigrams.has(bigram)
			? firstBigrams.get(bigram)
			: 0;

		if (count > 0) {
			firstBigrams.set(bigram, count - 1);
			intersectionSize++;
		}
	}

	return (2.0 * intersectionSize) / (first.length + second.length - 2);
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
            
            let distance = 1 - compareTwoStrings (testString, quote);
            
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