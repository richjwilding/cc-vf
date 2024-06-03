import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import Primitive from "./model/Primitive";
import { addRelationship, createPrimitive, dispatchControlUpdate, executeConcurrently, fetchPrimitive, primitiveChildren, primitiveDescendents, primitiveOrigin, primitiveParentPath, primitiveRelationship, removePrimitiveById, updateFieldWithCallbacks } from "./SharedFunctions";
import { enrichCompanyFromLinkedIn } from "./linkedin_helper";
import { enrichFromCrunchbase, fetchCompanyDataFromCrunchbase, findOrganizationsFromCB, pivotFromCrunchbase } from "./crunchbase_helper";
import Category from "./model/Category";
//import { fetchArticlesFromGNews } from "./gnews_helper";
import { fetchPostsFromSocialSeracher } from "./socialsearcher_helper";
import Parser from "@postlight/parser";
import { extractURLsFromPage, extractURLsFromPageAlternative, fetchURLPlainText } from "./google_helper";
import { categorize, processPromptOnText } from "./openai_helper";


let instance

export default function EnrichPrimitive(){    
    if( instance ){
        return instance
    }
    
    instance = new Queue("enrichQueue", {
        connection: { 
            host: process.env.QUEUES_REDIS_HOST, 
            port: process.env.QUEUES_REDIS_PORT,
            maxStalledCount: 0,
            stalledInterval:300000
        },
    });
    instance.myInit = async ()=>{
        console.log("Enrich Queue")
        const jobCount = await instance.count();
        console.log( jobCount + " jobs in queue (enrich)")
        await instance.obliterate({ force: true });
        const newJobCount = await instance.count();
        console.log( newJobCount + " jobs in queue  (enrich)")
    }

    instance.addToQueue = (primitive, name, description, options)=>{
            const field = `processing.${name}`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text: description})
            instance.add(`search_articles_${primitive.id}` , {id: primitive.id, mode: name, options: options, field: field})
    }
    instance.fromURL = (primitive, options )=>{
        instance.addToQueue( primitive, "url_as_detail", "Examining url", options )
    }

    instance.findArticles = (primitive, options )=>{
        if( primitive.type === "activity"){
            const field = `processing.articles`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Finding articles"})
            instance.add(`search_articles_${primitive.id}` , {id: primitive.id, mode: "find_articles", options: options, field: field})
        }
    }
    instance.siteDiscovery = (primitive, options )=>{
        if( primitive.type === "entity"){
            const field = `processing.site`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Examining url"})
            instance.add(`search_posts_${primitive.id}` , {id: primitive.id, mode: "site_discovery", options: options, field: field})
        }
    }
    instance.generateJTBD = (primitive, options )=>{
        if( primitive.type === "entity"){
            const field = `processing.site`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Examining website"})
            instance.add(`search_posts_${primitive.id}` , {id: primitive.id, mode: "generate_jtbd", options: options, field: field})
        }
    }
    instance.siteDiscoveryShort = (primitive, options )=>{
        if( primitive.type === "entity"){
            const field = `processing.site`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Examining website"})
            instance.add(`search_posts_${primitive.id}` , {id: primitive.id, mode: "site_discovery_short", options: options, field: field})
        }
    }
    instance.siteSummarize = (primitive, options )=>{
        if( primitive.type === "entity"){
            const field = `processing.site`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Examining url"})
            instance.add(`search_posts_${primitive.id}` , {id: primitive.id, mode: "site_summarize", options: options, field: field})
        }
    }
    instance.findPosts = (primitive, options )=>{
        if( primitive.type === "activity"){
            const field = `processing.posts`
            dispatchControlUpdate(primitive.id, field , {status: "pending"}, {track: primitive.id, text:"Finding posts"})
            instance.add(`search_posts_${primitive.id}` , {id: primitive.id, mode: "find_posts", options: options, field: field})
        }
    }
    instance.searchCompanies = (primitive, options )=>{
        if( primitive.type === "activity"){
            const field = `processing.expanding.0`
            dispatchControlUpdate(primitive.id, field, {state: "active", started: new Date()})
            instance.add(`search_topcics_${primitive.id}` , {id: primitive.id, target: "entity", mode: "search_company", options: options})
        }
    }
    instance.enrichCompany = (primitive, source, force)=>{
        if( primitive.type === "entity"){
            dispatchControlUpdate(primitive.id, "processing.enrich", {state: "active", started: new Date(), targetFields: ['title', 'referenceParameters.url', 'referenceParameters.description', 'referenceParameters.industry']})
            instance.add(`enrich_${primitive.id}_from_${source}` , {id: primitive.id, source: source, target: "entity", mode: "enrich", force: force, field: "processing.enrich"})
        }
    }
    instance.pivotCompany = async (primitive, source, action)=>{
        if( primitive.type === "entity" || primitive.type === "activity"){
            
            const parentId = primitive.type === "entity" ?  primitiveOrigin(primitive) : primitive.id
            let resultSet
            if( primitive.type === "entity"){
                resultSet = primitiveParentPath(primitive, "result", parentId, true)?.[0]
            }else{
                const category = await Category.findOne({id: primitive.referenceId})
                if( category ){
                    resultSet = category.resultCategories && category.resultCategories.find((d)=>d.resultCategoryId === action.referenceId)?.id
                }
            }

            if( resultSet !== undefined){
                const field = `processing.expanding.${resultSet}`
                console.log(parentId)
                console.log(resultSet)
                if( parentId ){
                    dispatchControlUpdate(parentId, field, {status: "pending", node: primitive.id})
                }
                dispatchControlUpdate(primitive.id, "processing.pivot" , {status: "pending"}, {track: primitive.id, text:"Finding similar companies"})
                instance.add(`pivot_${primitive.id}_from_${source}` , {id: primitive.id, action: action, source: source, target: "entity", mode: "pivot", parentId: parentId, field: field})
            }
        }
    }


    async function fetchDetails(primitive, options){
        const sourceCategory = await Category.findOne({id: options.referenceId})
        const fullList = await primitiveDescendents( primitive, "detail", {referenceId: options.referenceId})
        const childList = []
        const processList = []
        for( const d of fullList ){
            if( primitiveOrigin(d) === primitive.id ){
                childList.push( d)
            }else{
                processList.push( d)
            }
        }

        let toProcess = (options.direct ? childList : processList).map((d,idx)=>{
            let out = `Item ${idx + (options.baseIdx ?? 0)}\nTitle:${d.title ?? "Unknown"}\n`
            for( const p in sourceCategory.parameters){
                const v = d.referenceParameters?.[p]
                if( v ){
                    if( Array.isArray(v)){
                        out += `${p}:${v.map(d=>(d ?? "").replaceAll(/\n|\r/g,". ")).join(". ")}\n`
                    }else{
                        out += `${p}:${(v ?? "").replaceAll(/\n|\r/g,". ")}\n`
                    }
                }
            }
            return out
        })
        return [processList, childList, toProcess]
    }
    async function summarize_details(primitive){
        const primitiveCategory = await Category.findOne({id: primitive.referenceId}) 

        if( !primitiveCategory ){
            return
        }

        
        const params = Object.keys(primitiveCategory.parameters ?? {}).filter(d=>primitiveCategory.parameters[d].detailId)
        for( const paramKey of params){
            console.log(paramKey)
            const referenceId = primitiveCategory.parameters[paramKey].detailId
            let toProcess = ""
            const allIds = [referenceId].concat( primitiveCategory.parameters[paramKey].secondaryIds ?? [] )
            console.log(`Will scan ${allIds.length} detail types `)
            let baseIdx = 0
            for(  const thisId of allIds){
                const [_, childList, thisProcess] = await fetchDetails( primitive, {referenceId: thisId, direct: true, baseIdx: baseIdx} )
                baseIdx += childList.length
                toProcess += thisProcess
            }
            console.log(toProcess)
            const sourceCategory = await Category.findOne({id: referenceId})

            if( baseIdx > 0 ){
                console.log(`- Process list is ${baseIdx}`)
                if( sourceCategory){
                    const aspect = sourceCategory.ai?.extraction?.field//"industries"// "benefits"
                    const plural = sourceCategory.plural ?? (sourceCategory.title + "s")
                    const singluar = sourceCategory.title
                    const opener = `Here is some information about offerings and capabilities from a company called ${primitive.title ?? "Unknown"}.  Each numbered item includes a title plus zero or more aspects.`
                    const instructions = `Summarize the ${aspect} asepcts of these items (where present) as a list of up to 10 terms of the most distingushing and differentiated ${aspect}.`
                    let fields = "Return your results as a JSON object with a 'result' containing an array which each item being a term from the summary"
                    
                    const results = await processPromptOnText( toProcess,{
                        opener: opener,
                        prompt: instructions,
                        output: fields,
                        engine: "gpt4p",
                        field: "result",
                        maxTokens: 100000,
                        "debug": true
                    })
                    
                    if( results.success ){
                        console.log(aspect + " -> " + paramKey)
                        console.log(results.output)
                        await dispatchControlUpdate( primitive.id, `referenceParameters.${paramKey}`, results.output.join(", ") )
                    }
                }
            }
        }
    }

    async function consolidate_details(primitive, options){
        const sourceCategory = await Category.findOne({id: options.referenceId})
        const primitiveCategory = await Category.findOne({id: primitive.referenceId}) 
        const extractor = sourceCategory.ai?.extraction
        const detailResultSet = primitiveCategory.resultCategories?.find(d=>d.type === "detail")


        if( !sourceCategory || !extractor ){
            return
        }
        
        const [processList, childList, toProcess] = await fetchDetails( primitive, options )
        if( processList.length === 0 ){
            return undefined
            
        }
        if( childList.length > 0 ){
            for(const child of childList){
                await removePrimitiveById( child.id )
            }    
        }
        
        console.log(` got full list of ${processList.length} / ${childList.length}`)

//        console.log(toProcess.join("\n"))
        const plural = sourceCategory.plural ?? (sourceCategory.title + "s")
        const singluar = sourceCategory.title
        const opener = `Here are a list of numbered ${plural} from a company called ${primitive.title ?? "Unknown"}.  Each numbered item includes a title plus zero or more aspects of the ${singluar}`
        const instructions = `Consolidate this list into a shorter set of ${plural} by grouping similar ${plural} together. If there is a unique aspects in the initial ${singluar}, ensure they are preserved in the new item descriptions.  Each new item must include an "Items" field containing the item number from the original list which have been included in the new item.  Each original item must be included in at least one new item.`
        const fieldAsArray = extractor.extracts?.map(d=>d.fields?.join(","))
        let fields = "Return your results as a JSON object with the following fields:\n" + extractor.primary?.fields?.join(", ") + fieldAsArray.join(", ") + ", items: containing an array containing the item numbers from the original list which have been included in the new item"
  
        const results = await processPromptOnText( toProcess,{
            opener: opener,
            prompt: instructions,
            output: fields,
            engine: "gpt4p",
            field: extractor.field,
            maxTokens: 100000,
            "debug": true
        })

        if( results.success ){
            const buildAndCreate = async function( result, category, descend = true){
                const entry = {}
                let children = []
                for(const key in result){
                    if(  result[key] === undefined ||  result[key] === null){
                        continue
                    }
                    if( Array.isArray(result[key]) ){
                        if( result[key].length === 0 ){
                            continue
                        }
                    }else{
                        if(  result[key].trim && result[key].trim().length === 0 ){
                            continue
                        }
                    }
                    if( key === "title"){
                        entry.title = result[key]
                    }else if( key === "items"){
                        console.log(`--- ITEMS HERE `, result[key].join(", "))
                        children = result[key].map(d=>processList[d])
                        console.log(children.map(d=>d.plainId))
                    }else{
                        if( category.parameters[key]){
                            entry.referenceParameters = entry.referenceParameters ?? {} 
                            entry.referenceParameters[key] = result[key]
                        }                        
                    }
                }
                if( Object.keys(entry).length > 0 ){
                    console.log(`will create : `)
                    console.log(entry)
                    console.log(`${children.length} children`)

                    const newData = {
                        workspaceId: primitive.workspaceId,
                        parent: primitive.id,
                        paths: ['origin', `results.${detailResultSet.id}`],
                        data:{
                            ...entry,
                            type: "detail",
                            referenceId: category.id
                        }
                    }
                    const newPrim = await createPrimitive( newData )
                    console.log(`created ${newPrim?.plainId} / ${newPrim?.id}`)
                    if( newPrim && children ){
                        for(const child of children){
                            await addRelationship( newPrim.id, child.id, 'ref')
                        }
                    }
                    return newPrim
                }else{
                    console.log('NOT CREATING')
                }
            }
            for(const result of results.output){
                await buildAndCreate(result, sourceCategory.toJSON())
            }
        }

        
    }
    async function generate_jtbd(primitive, options){
        try{
            if( !options?.resultCategoryId ){
                throw "No referenceId provided"
            }
            let text = "Company name: " + primitive.title
            for(const field of ["description", "offerings", "customers","capabilities","markets"]){
                if( primitive.referenceParameters?.[field]){
                    text += "\n" + field + ": " + primitive.referenceParameters?.[field]
                }
            }
                const results = await processPromptOnText( text,{
                    opener: `here is an overview about a company`,
                    prompt: `Using only the information provided in the overview produce a list of key jobs to be done (JTBD) that the company is meeting for its customers. Ensure that the JTBD is meaningful, concrete and specific and addresses the core underlying concern and need of the cutsomer..`,
                    output: `Return the result in a json object called "result" containing an array of candidtae JTBDs with each entry being an object with the following fields: a 'job' field containing the JTBD in the form 'As [customer of the company] I want to [motivation of customer] to allow [desired outcome of the customer]', a score field containing how well the company can undertake this job on the scale of 'not at all', 'possibly', 'easily', and a 'ranking' field which ranks the generated JTBD from best to worse - with 1 being the best.  Do not put anything other than the JSON object in your output. `,
                    engine: "gpt4p",
                    debug:true,
                    debug_content:true,
                    field: "result"
                })
                if( results?.success && results.output){
                    for(const item of results.output){
                        const newData = {
                            workspaceId: primitive.workspaceId,
                            parent: primitive.id,
                            paths: ['origin'],
                            data:{
                                title: item.job,
                                type: "evidence",
                                referenceId: options.resultCategoryId
                            }
                        }
                        const newPrim = await createPrimitive( newData )
                    }
                }
        }catch(error){
            console.log("Error in generate_jtbd")
            console.log(error)
        }
    }

    async function processURLAsDetail(primitive, url, thisCategory, {resultCategoryId, detailPrimitive, resultSet, detailResultSet}, pageCache = {}){
        console.log(`Processing page as ${thisCategory.id} - ${thisCategory.title} : ${url}`)
        if( thisCategory?.ai === undefined ){
            console.log(`Cant process category `, thisCategory)
            return 
        }
        let pageResult = pageCache[url]
        if( pageResult === undefined){
            pageResult 
            pageCache[url] = await fetchURLPlainText( url )
            pageResult = pageCache[url]
        }else{
            console.log("REUSING PAGE FROM CHCHE")
        }
        if( pageResult ){
            let pagePrimitive = detailPrimitive
            const packExtractor = (extractor, primary = true)=>{
                let extracts = ""
                if( primary ){
                    extracts = extractor.primary?.type + " (" + extractor.primary?.description + ")\nFor each " + extractor.primary?.type + " a descrption"
                }else{
                    extracts = extractor.primary?.type + ": A nested object detailing " + extractor.primary?.description  + " which contains the information included in these parenthesis ["
                    
                }
                
                if( extractor.extracts?.length > 0){

                    extracts += " and also the following details where included: \n"
                    extracts += extractor.extracts.map(d=>d.type + ": " + d.description).join("\n")
                }


                const fieldAsArray = extractor.extracts?.map(d=>d.fields?.join(","))
                if( fieldAsArray ){

                    let fields = "{" + (primary ? extractor.primary?.fields?.join(", ") : "")
                    if(fieldAsArray.length > 1){
                        let last
                        if( !(extractor.nestedExtracts?.length > 0) ){
                            last = fieldAsArray.pop()
                        }
                        fields += (primary ? " and the following subfields: " : "") + fieldAsArray.join(" - set this field to null if no relevant information is found,\n") 
                        if( last ){
                            fields += ",\n and " + last
                        }
                    }else{
                        fields += (primary ? " and a field called " : "") + fieldAsArray[0] 
                    }
                    if( !primary ){
                        extracts += "]"
                    }
                    return {extracts: extracts, fields: fields}
                }
                return undefined 
            }

            const pageText = pageResult.fullText
            
            const extractor = thisCategory.ai?.extraction
            if( extractor ){

                let packed
                try{

                    packed = packExtractor( extractor )
                }catch(error){
                    console.log("Error in processing ")
                    console.log(error)
                }
                if( packed ){
                    let extracts = extractor.opener + packed.extracts
                    let fields = packed.fields
                    
                    if( extractor.nestedExtracts ){
                        for( const nestedId of extractor.nestedExtracts){
                            const nested = categories[nestedId]?.ai?.extraction
                            if( nested ){
                                const packedNested = packExtractor( nested, false )
                                if( packedNested ){
                                    extracts += "\n" + packedNested.extracts + "\n"
                                    fields += ",\n'" + nested.field + "' containing an object with the fields within the following parenthesis " + packedNested.fields + "}"
                                }
                            }
                        }
                    }
                    fields += "}"
                    
                    const company = primitive.title
                    const results = await processPromptOnText( pageText,{
                        opener: `here is the text from a webpage which details products from a company called ${company}:`,
                        prompt: extracts,
                        output: extractor.closer + "\n" + fields,
                        engine: "gpt4p",
                        field: extractor.field,
                        "debug": true
                    })

                    if( results.success ){
                        const buildAndCreate = async function( result, category, descend = true){
                            const entry = {}
                            const children = []
                            for(const key in result){
                                if(  result[key] === undefined ||  result[key] === null){
                                    continue
                                }
                                if( Array.isArray(result[key]) ){
                                    if( result[key].length === 0 ){
                                        continue
                                    }
                                }else{
                                    if(  result[key].trim && result[key].trim().length === 0 ){
                                        continue
                                    }
                                }
                                if( key === "title"){
                                    entry.title = result[key]
                                }else{
                                    if( category.parameters[key]){
                                        entry.referenceParameters = entry.referenceParameters ?? {} 
                                        entry.referenceParameters[key] = result[key]
                                    }else{
                                        if( descend ){

                                            console.log(`NO KEY MATCH ${key} - check nested`)
                                            if( extractor.nestedExtracts ){
                                                for( const nestedId of extractor.nestedExtracts){
                                                    const nested = categories[nestedId]
                                                    if( key === nested?.ai?.extraction?.field){
                                                        console.log(`FOUND`)
                                                        const child = await buildAndCreate( result[key], nested, false)
                                                        if( child ){
                                                            children.push( child )
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if( Object.keys(entry).length > 0 ){
                                console.log(`will create : `)
                                console.log(entry)
                                console.log(`${children.length} children`)

                                if( pagePrimitive === undefined){
                                    const newData = {
                                        workspaceId: primitive.workspaceId,
                                        parent: primitive.id,
                                        paths: ['origin', `results.${resultSet.id}`],
                                        data:{
                                            title: pageResult.title ?? "Web page",
                                            referenceParameters:{
                                                url: url
                                            },
                                            type: "result",
                                            referenceId: resultCategoryId
                                        }
                                    }
                                    pagePrimitive = await createPrimitive( newData )
                                    if( pagePrimitive === undefined ){
                                        console.log( newData )
                                        throw "Couldnt add page reaource"
                                    }
                                }

                                const newData = {
                                    workspaceId: primitive.workspaceId,
                                    parent: pagePrimitive.id,
                                    paths: ['origin', `results.${detailResultSet.id}`],
                                    data:{
                                        ...entry,
                                        type: "detail",
                                        referenceId: category.id
                                    }
                                }
                                const newPrim = await createPrimitive( newData )
                                console.log(`created ${newPrim?.plainId} / ${newPrim?.id}`)
                                if( newPrim && children ){
                                    for(const child of children){
                                        await addRelationship( newPrim.id, child.id, 'ref')
                                    }
                                }
                                return newPrim
                            }else{
                                console.log('NOT CREATING')
                            }
                        }
                        
                        for(const result of results.output){
                            await buildAndCreate(result, thisCategory)
                        }
                    }
                }
                if( pagePrimitive === undefined ){
                    console.log(`-- Processed URL did not trigger an extract ${url}`)
                }
            }else{
                console.log("COULDNT GET PAGE")
            }
        }

    }

    async function site_discovery_short(primitive, options){
        try{
            if( primitive.referenceParameters?.capabilities && options?.force !== true){
                console.log(`Skipping discovery fro ${primitive.id}`)
                return
            }
            let urls = await site_discovery(primitive, {...options, onlyURLs: true, limit: options.count ?? 6})
            if( !urls || urls.length === 0 ){
                return
            }
            urls = urls.map(d=>d.url).filter((d,i,a)=>a.indexOf(d)===i)
            console.log(`Have ${urls.length} for quick discovery`)

            const textFetch = async function(url){return (await fetchURLPlainText(url))?.fullText}


            let pageTexts = await executeConcurrently( urls, textFetch ) 
            console.log(pageTexts)

            let text = pageTexts?.results?.join("\n")
            console.log(text)

            if( text.length > 50 ){
                const company = primitive.title
                const results = await processPromptOnText( text,{
                    opener: `here is the text from the webpage of a company called ${company}:`,
                    prompt: `Produce a summary of the companies offerings, target customers, markets and capabilities using only information explicity mentioned in the text i have provided.`,
                    output: `Return the result in a json object called "result" with a field called 'description' containing a summary of the company in no more than 100 words (if present), an 'offerings' field containing an array of offerings with each array entry being no more than 10 words  (if present), a 'customers' field containing an array of target customers with each array entry being no more than 10 words (if present), a 'capabilities' field containing an array of capabilities with each array entry being no more than 10 words (if present),`,
                    //output: `Return the result in a json object called "result" with a field called 'description' containing a summary of the company in no more than 100 words (if present), an 'offerings' field containing an array of offerings with each array entry being no more than 10 words  (if present), a 'markets' field containing an array of geographical markets the company operates in with each array entry being no more than 10 words (if present), an 'customers' field containing an array of target customers with each array entry being no more than 10 words (if present), a 'capabilities' field containing an array of capabilities with each array entry being no more than 10 words (if present),`,
                    engine: "gpt4p",
                    field: "result"
                })
                console.log(results)
                if( results.success ){
                    console.log("here")
                    for(const field of ["description","offerings", "customers", "capabilities"]){
                        const v = results.output?.[0]?.[field]
                        if(v){
                            console.log(`update ${field}`, v)
                            updateFieldWithCallbacks(primitive.id, `referenceParameters.${field}` , [v].flat().join(", "))
                        }
                    }

                }
            }
        }catch(error){
            console.log("Error in site_discovery_short")
            console.log(error)
        }
        
    }

    async function site_discovery(primitive, options){
                const param = options.parameter ?? "url"
                let url = primitive.referenceParameters?.[param]
                if( !url ){
                    return
                }
                console.log(param, url)
                if( !url.match(/^\D+:\/\// )){
                    url = "https://" + url
                }
                const list = await primitiveChildren( primitive, "result")
                if( list.length > 0){
                    console.log(`Item ${primitive.id} already has site_discovery data - skipping`)
                    return 
                }
                
                const primitiveCategory = await Category.findOne({id: primitive.referenceId}) 
                const resultCategory = await Category.findOne({id: options.resultCategoryId})


                if( resultCategory && primitiveCategory && resultCategory.detailCategoryIds){
                    const resultSet = primitiveCategory.resultCategories?.find(d=>d.resultCategoryId === options.resultCategoryId)
                    const detailResultSet = resultCategory.resultCategories?.find(d=>d.type === "detail")
                    if( resultSet !== undefined && detailResultSet !== undefined){
                        const categories = (await Category.find({id: {$in: resultCategory.detailCategoryIds}})).map(d=>d.toJSON()).reduce((a,c)=>{a[c.id]=c;return a},{})
                        const catList = Object.values(categories)

                        let urlsToParse = []
                        if( primitiveCategory.detailCategoryIds ){
                            for( const id of primitiveCategory.detailCategoryIds){
                                urlsToParse.push({url: url, categoryId: id})
                            }
                        }
                        let urlList //= await extractURLsFromPage( url, {otherDomains: false, markers: false} )
                        urlList = urlList ?? (await extractURLsFromPageAlternative( url, {otherDomains: false, markers: false} ))
                        urlList = urlList ?? (await extractURLsFromPageAlternative( url, {otherDomains: true, markers: false} ))
                        urlList = urlList ?? (await extractURLsFromPageAlternative( url, {otherDomains: false, markers: false}, {'js_render': 'true'} ))
                        urlList = urlList ?? (await extractURLsFromPageAlternative( url, {otherDomains: true, markers: false}, {'js_render': 'true'} ))
                        urlList = urlList ?? (await extractURLsFromPageAlternative( url, {otherDomains: false, markers: false}, {'js_render': 'true','premium_proxy': 'true','proxy_country': 'us'} ))
                        urlList = urlList ?? (await extractURLsFromPageAlternative( url, {otherDomains: true, markers: false}, {'js_render': 'true','premium_proxy': 'true','proxy_country': 'us'} ))
                        
                        if( categories && urlList && urlList.length > 0){
                                urlList = urlList.filter((d,i,a)=>a.findIndex(d2=>d2.url === d.url && d2.text === d.text) === i)
                                urlList = urlList.filter(d=>{
                                    const postfix = d.url.match(/\.[^\/\s^\.]+$/)
                                    if( postfix){
                                        if( postfix[0] && postfix[0].length === 4){
                                            return false

                                        }
                                    }
                                    return true

                                })
                                
                                const urlMap = urlList.map(d=>`URL: ${d.url} Text: ${d.text?.replaceAll(/\n|\r/g,". ")}`)
                                console.log(`Sending ${urlMap.length} candidates`)
                                
                                const result = await categorize( urlMap, catList.map(d=>d.description),{
                                    longType: "items containing two fieds - a url of a weblink and the descriptive text for the link",
                                    matchPrompt: `For each item you must assess the best match with a category from the supplied list using information from the weblink and/or descriptive text, or determine if there is a not a strong match. Ignore any links that are most likely about shopping, purchasing, delivery, ecommerce listing or other ecommerce activities`,
                                    engine: "gpt4p",
                                   // maxTokens: 80000,
                                    debug_content: true,
                                    debug: true
                                })
                                if( result ){
                                    for(const d of result){
                                        console.log( urlMap[d.id] + " - " + d.category)
                                        if( d.category > -1){
                                            const category = catList[d.category]?.id
                                            if( category ){
                                                if( urlsToParse.find(d2=>d2.url === urlList[d.id].url && d2.categoryId !== category) === undefined ){
                                                    urlsToParse.push( {url:urlList[d.id].url, categoryId: category })
                                                }
                                            }else{
                                                console.log(`Couldnt find matching category ${d.category}`)
                                            }
                                        }
                                    }
                                }
                        }
                        
                        console.log(`done - now have ${urlsToParse.length} urls`)
                        const limit = options.limit ?? 25
                        if( urlsToParse.length > limit ){
                            console.log(`TRUNCATING TO FIRST ${limit} URLs`)
                            urlsToParse = urlsToParse.slice(0,limit)
                        }
                        if( options.onlyURLs ){
                            return urlsToParse
                        }

                        const pageCache = {}
                        console.log("here")
                        
                        for( const item of urlsToParse){
                            try{                                
                                await processURLAsDetail( primitive, item.url, categories[item.categoryId], {resultCategoryId: resultCategoryId, resultSet: resultSet, detailResultSet: detailResultSet}, pageCache )
                            }catch( error ){
                                console.log(`Error processing for site_discovery ${url}`)
                                console.log(error)
                            }
                        }
                        console.log("done")
                    }
                }
    }
    
    
    new Worker('enrichQueue', async job => {
        let primitive = await Primitive.findOne({_id: job.data.id})
        const options = job.data.options
        if( primitive){
            try{
                if( job.data.mode === "site_discovery" ){
                        await site_discovery( primitive, options)
                }else if( job.data.mode === "generate_jtbd" ){
                        await generate_jtbd( primitive, options)
                }else if( job.data.mode === "site_discovery_short" ){
                        await site_discovery_short( primitive, options)
                }else if( job.data.mode === "url_as_detail" ){
                    const pageCategory = await Category.findOne({id: primitive.referenceId})
                    const parent = await fetchPrimitive( primitiveOrigin(primitive) )
                    const category = (await Category.findOne({id: options.referenceId})).toJSON()
                    const url = primitive.referenceParameters?.url
                    console.log(`Entity = `, parent.plainId)
                    console.log(`Primitive = `, primitive.plainId)
                    console.log(`URL = `, url)
                    console.log(`Cat = `, category)
                    
                    const detailResultSet = pageCategory?.resultCategories?.find(d=>d.type === "detail")
                    
                    if( parent && category && url){
                        await processURLAsDetail( parent, url, category, {detailPrimitive: primitive, detailResultSet: detailResultSet} )
                    }
                }else if( job.data.mode === "site_summarize" ){
                        const primitiveCategory = await Category.findOne({id: primitive.referenceId}) 
                        const params = Object.keys(primitiveCategory.parameters ?? {}).filter(d=>primitiveCategory.parameters[d].detailId)
                        for( const paramKey of params){
                            const param = primitiveCategory.parameters[paramKey]
                            await consolidate_details( primitive, {referenceId: param.detailId})
                        }
                        primitive = await Primitive.findOne({_id: job.data.id})
                        await summarize_details( primitive )
                }else if( job.data.mode === "find_articles" ){
                    throw "DEPRECATED!!"
                }else if( job.data.mode === "find_posts" ){
                    await fetchPostsFromSocialSeracher( primitive, job.data.options )
                }else if( job.data.mode === "search_company" ){
                    await findOrganizationsFromCB( primitive, options )
                }else if( job.data.mode === "enrich" ){
                    console.log(`Processing enrichment for ${primitive.id}`)
                    if( job.data.target === "entity" ){
                        if( job.data.source === "linkedin" ){
                            const result = await enrichCompanyFromLinkedIn( primitive, true)
                            SIO.notifyPrimitiveEvent( primitive, result)
                        }
                        if( job.data.source === "crunchbase" ){
                            const result = await enrichFromCrunchbase( primitive, true)
                            SIO.notifyPrimitiveEvent( primitive, result)
                        }
                    }
                }else if( job.data.mode === "pivot" ){
                        console.log(`Processing pviot for ${primitive.id}`)
                        if( job.data.target === "entity" ){
                            if( job.data.source === "crunchbase" ){
                                const newPrims = await pivotFromCrunchbase(primitive, job.data.action)
                            }
                        }
                }
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})

                if( job.data.parentId ){
                    dispatchControlUpdate(job.data.parentId, job.data.field, null)
                }
            }catch(error){
                console.log(`error in ${job.data.mode}`)
                console.log(error)
            }
/*
            if( job.data.mode === "site_discovery" ){
                try{
                    await site_discovery( primitive, options)
                }catch(error){
                    console.log(`error in site_discovery`)
                    console.log(error)
                }

                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "generate_jtbd" ){
                try{
                    await generate_jtbd( primitive, options)
                }catch(error){
                    console.log(`error in generate_jtbd`)
                    console.log(error)
                }

                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "site_discovery_short" ){
                try{
                    await site_discovery_short( primitive, options)
                }catch(error){
                    console.log(`error in site_discovery_short`)
                    console.log(error)
                }

                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "site_summarize" ){
                try{
                    const primitiveCategory = await Category.findOne({id: primitive.referenceId}) 
                    const params = Object.keys(primitiveCategory.parameters ?? {}).filter(d=>primitiveCategory.parameters[d].detailId)
                    for( const paramKey of params){
                        const param = primitiveCategory.parameters[paramKey]
                        await consolidate_details( primitive, {referenceId: param.detailId})
                    }
                    primitive = await Primitive.findOne({_id: job.data.id})
                    await summarize_details( primitive )
                }catch(error){
                    console.log(`error in site_discovery`)
                    console.log(error)
                }

                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "find_articles" ){
                console.log(`find_articles ${primitive.id} ${primitive.referenceParameters?.topics}`)
                throw "DEPRECATED!!"
  //              await fetchArticlesFromGNews( primitive, job.data.options )
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "find_posts" ){
                console.log(`find_posts ${primitive.id} ${primitive.referenceParameters?.topics}`)
                await fetchPostsFromSocialSeracher( primitive, job.data.options )
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "search_company" ){
                console.log(`search_company ${primitive.id} ${primitive.referenceParameters?.topics}`)
                await findOrganizationsFromCB( primitive, options )
                dispatchControlUpdate(primitive.id, `processing.expanding.0`, null)
            }
            if( job.data.mode === "enrich" ){
                console.log(`Processing enrichment for ${primitive.id}`)
                if( job.data.target === "entity" ){
                    if( job.data.source === "linkedin" ){
                        const result = await enrichCompanyFromLinkedIn( primitive, true)
                        SIO.notifyPrimitiveEvent( primitive, result)
                    }
                    if( job.data.source === "crunchbase" ){
                        const result = await enrichFromCrunchbase( primitive, true)
                        SIO.notifyPrimitiveEvent( primitive, result)
                    }
                }
                dispatchControlUpdate(primitive.id, "processing.enrich", null)
            }
            if( job.data.mode === "pivot" ){
                try{
                    console.log(`Processing pviot for ${primitive.id}`)
                    if( job.data.target === "entity" ){
                        if( job.data.source === "crunchbase" ){
                            const newPrims = await pivotFromCrunchbase(primitive, job.data.action)
                        }
                    }
                }catch(error){
                    console.log(`Error in enrichQueue.pivot `)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, "processing.pivot" , null, {track: primitive.id})
                if( job.data.parentId ){
                    dispatchControlUpdate(job.data.parentId, job.data.field, null)
                }
            }
            */
        }
        
    },
    {connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
    return instance
}
