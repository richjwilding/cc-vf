import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction, primitiveOrigin, primitiveChildren, dispatchControlUpdate, executeConcurrently, findResultSetForCategoryId, primitivePrimitives} from './SharedFunctions'
import { replicateURLtoStorage, writeTextToFile } from "./google_helper";
import { analyzeListAgainstTopics, analyzeText, analyzeTextAgainstTopics, buildKeywordsFromList } from "./openai_helper";
import Category from "./model/Category";
import Parser from '@postlight/parser';
var ObjectId = require('mongoose').Types.ObjectId;

const rejectWords = ["somewhat","hardly", "not at all"]

async function filterEntitiesByTopics( list, topics){
    if( !topics ){
        return list
    }
    console.log(`Have ${list.length}`)
    //list=list.slice(0,100)
    list = list.filter((d)=>d.properties.description && d.properties.description.trim() !== "" )

    const process = async (list)=>{
    console.log(`Now: ${list.length}`)

        if( list && list.length > 0){
            const result = await analyzeListAgainstTopics(list.map((d)=>d.properties.description.replaceAll("\n",". ")), topics, {prefix: "Organization", type: "organization", maxTokens: 60000, engine: "gpt4p"})
            if( !result.success){
                return undefined
            }
            
            list = list.filter((d,idx)=>{
                const score = result.output.find((d)=>d.i === idx)
                if(score ){
                    d.assessment = score.s
                    return !rejectWords.includes(score.s) 
                }
                return false
            })
            console.log(`Now: ${list.length}`)
        }
        return list
    }
    return await process( list ) 
}

async function createPrimitiveFromCBData( entity, referenceId, parent, paths ){
    const properties = entity?.properties
    if( !(entity && properties) ){
        return false
    }
    if( parent && parent.referenceParameters?.topics){
        
    }

    if(properties.website_url){
        const url = properties.website_url.replace(/^(https?:\/\/)?([^\/]+)\/?$/, "$2");
        const existing = await Primitive.findOne({
            "workspaceId": parent.workspaceId,
            deleted: {$exists: false},
            "referenceParameters.url": {$in: [
                url,
                `https://${url}`,
                `https://${url}/`,
                `http://${url}`,
                `http://${url}/`]}
            })
        if( existing ){
            console.log(`-- SKIP for ${properties.name}`)
            return false
        }
    }else{
        return false
    }
    console.log(`--- Adding ${properties.name}`)
    const newData = {
        workspaceId: parent.workspaceId,
        parent: parent.id,
        paths: paths || ['origin'],
        data:{
            type: "entity",
            referenceId: referenceId,
            title: properties.name,
            referenceParameters:{
                url: properties.website_url,
                hasImg: properties.image_url,
                description: properties.description,
                assessment: entity?.assessment,
                location: entity.properties.location_identifiers?.find(d=>d.location_type === "country")?.value || entity.properties.location_identifiers?.[0]?.value
            }
        }
    }
    const newPrim = await createPrimitive( newData )
    if( newPrim ){
        const store = {
            id: entity.uuid,
            name: entity.properties.name,
            description: entity.properties.description,
            short_description: entity.properties.short_description,
            image_url:entity.properties.image_url,
            website_url: entity.properties.website_url,
            categories: entity.properties.categories?.map((d)=>{return {uuid: d.uuid, value: d.value}}),
            locations: entity.properties.location_identifiers
            
        }
        newPrim.set("crunchbaseData", store)
        newPrim.markModified("crunchbaseData")
        await newPrim.save()
        if( properties.image_url ){
            replicateURLtoStorage(entity.properties.image_url, newPrim._id.toString(), "cc_vf_images")
        }
    }
    return newPrim
}
async function createOrganizationByUUID( uuid, parent, options ){
    try{
        
        const category = options.category || await Category.findOne({id: parent.referenceId})
        const resultSet =  options.resultSet || (category && category.resultCategories.find((d)=>d.resultCategoryId == options.referenceId)?.id)
        if( !category || resultSet === undefined ){
            return
        }
        const query = new URLSearchParams({ 
                "field_ids": [
                "identifier",
                "categories",
                "location_identifiers",
                "short_description",
                "website_url",
                "image_url",
                "name",
                "description",
                "rank_org"

                ]
            }).toString()
        console.log(`Doing Crunchbase query`)
        const url = `https://api.crunchbase.com/api/v4/entities/organizations/${uuid}?${query}`
        const response = await fetch(url,{
            method: 'GET',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            }
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
        }
        const data = await response.json();
        if( data ){
            if( data.properties ){
                await createPrimitiveFromCBData( {properties: data.properties}, options.referenceId, parent, ['origin', `results.${resultSet}`])
            }
        }

    }catch(error){
        console.log(`Error on findOrganizationsFromCB`)
        console.log(error)
    }

}
export async function queryCrunchbaseOrganizationArticles(keywords, options = {}){
    let count = 0
    let totalCount = 0
    let target = options.count ?? 20
    let results = []
    if( options.primitive === undefined){
        return undefined
    }

    const doLookup = async (term, nextPage )=>{
        try{
            const primitive = options.primitive
            let data = primitive.crunchbaseData
            if(!data ){
                data = await fetchCompanyDataFromCrunchbase(primitive)
                if( data.error ){
                    return {error: data.error}
                }
            }
            let articles = data.articles

            if( articles === undefined){
                articles = await fetchCompanyArtcilesFromCrunchbase(primitive, data.id)
                
            }
            if( articles === undefined ){
                return {error: "no_data"}
            }
            if( data.error ){
                return {error: data.error}
            }


            for(const update of articles){
                if( count < target ){
                    let description = update.title.replaceAll("\n", ". ")
                    console.log(description)

                    if( options.filterPre && !(await options.filterPre({text: description, term: term})) ){
                        continue
                    }
                    // convert domain
                    if( options.existingCheck  ){
                        const exists = await options.existingCheck(update)
                        if( exists ){
                            continue
                        }
                    }

                    let fullText
                    const articleContent = await Parser.parse(update.url, {
                        contentType: 'text',
                    })
                    if( articleContent && articleContent.content ){
                        if( articleContent.word_count < 50 ){
                            continue
                        }
                        fullText = articleContent.content
                        update.image = articleContent.lead_image_url ?? articleContent.image 
                        update.description = fullText.split(" ").slice(0,400).join(" ")
                        update.posted_on = articleContent.date_published ?? update.posted_on
                    }else{
                        continue
                    }

                    if( options.filterPost && !(await options.filterPost({text: fullText, term: term})) ){
                        continue
                    }
                    const r = {
                        title: update.title,
                        type: "result",
                        referenceParameters:{
                            url: update.url,
                            posted: update.posted_on,
                            source:"Crunchbase Profile",
                            imageUrl: update.image,
                            hasImg: update.image ? true : false,
                            description: update.description
                        }
                    }
                    if( options.createResult ){
                        const newPrim = await options.createResult( r )
                        if( newPrim ){
                            await writeTextToFile(newPrim.id.toString(), fullText)
                            if( update.image ){
                                await replicateURLtoStorage(update.image, newPrim._id.toString(), "cc_vf_images")
                            }
                        }
                    }else{
                        results.push(r)
                    }
                    count++
                    totalCount++
                }
            }
        }
        catch(error){
            console.log("Error in searchPosts")
            console.log(error)
        }
    }
    if( keywords === undefined){
        await doLookup( undefined )
    }else{
        for( const d of keywords.split(",")){
            const thisSearch = '"' + d.trim() + '"'
            await doLookup( thisSearch )
        }
    }

    return options.createResult ? totalCount : results

}
export async function queryCBPersonRelatedOrganizations(first, last, options = {}){
    if( !first || first.length < 2){
        return
    }
    if( !last || last.length < 2){
        return
    }
    if(first.length === 1 || (first.length === 2 && first.slice(-1)===".")){
        console.log(`Skip ${first} ${last}`)
        return
    }
    let sleep = 200
    const doLookup = async (attempts = 5 )=>{
        const params = JSON.stringify(
            {
                "field_ids": [
                  "first_name","last_name","description"
                ],
                "query": [
                  {
                    "type": "predicate",
                    "field_id": "first_name",
                    "operator_id": "eq",
                    "values": [first]
                  },
              {
                    "type": "predicate",
                    "field_id": "last_name",
                    "operator_id": "eq",
                    "values": [last]
                  },options.contains ? {
                    "type": "predicate",
                    "field_id": "description",
                    "operator_id": "contains",
                    "values": [options.contains]
                  } : undefined
                ].filter(d=>d)
                
              })
        const url = `https://api.crunchbase.com/api/v4/searches/people`
        console.log(params)
        const response = await fetch(url,{
            method: 'POST',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            },
            body:params
        });
        
        if( response.status !== 200){
            if( response.status === 429){
                if( attempts > 0){
                    console.log(`Sleeping ${sleep}`)
                    await new Promise(r => setTimeout(r, sleep ));                    
                    sleep *= 2
                    
                    return await doLookup(attempts - 1)
                }else{
                    return
                }
            }
            console.log(`Error from crunchbase`)
            console.log(response)
            return
        }
        const data = await response.json();
        if( data ){
            if( data.entities ){
                for(const entity of data.entities){
                    console.log(entity)
                }
            }
        }
    }
    await doLookup()
}
export async function queryCrunchbaseOrganizations(terms, options = {}){

    let totalCount = 0
    let count = 0
    let target = options.count ?? 20
    let results = []
    let cancelled = false
    let timeFrame = "last_year"

    const doLookup = async (allTerms, nextPage )=>{
        const term = allTerms.keyword

        const region_maps = {
            "usa": ["f110fca2-1055-99f6-996d-011c198b3928"],
            "united states": ["f110fca2-1055-99f6-996d-011c198b3928"],
            "south america": ["dc5ba49f-731c-c510-b669-6a1641aee660"],
            "central america":["118dc7e0-e391-4d72-bda3-4ea51151bf19"],
            "latin america":["dc8ffe02-9def-4cb3-a14c-5d37458b1507"],
            "sea": ["5d13489b-bd49-4d3c-850b-500df5975192"],
            "south east asia": ["5d13489b-bd49-4d3c-850b-500df5975192"],
            "india":["44048bf7-db64-0d7a-db20-fd3c1ebf47b0"]
        }
         
        const query = Object.keys(allTerms).map((k)=>{
            if( !allTerms[k] ){
                return
            }
            if( k === "keyword"){
                return {
                    "type": "predicate",
                    "field_id": "description",
                    "operator_id": "contains",
                    "values": [
                        allTerms[k]
                    ]
                }
            }else if( k === "ipo"){
                if( k !== undefined){
                    return {
                        "type": "predicate",
                        "field_id": "ipo_status",
                        "operator_id": "eq",
                        "values": ["public"]
                    }
                }
            }else if( k === "headquaters"){
                const values = region_maps[allTerms[k].toLowerCase()] ?? [allTerms[k]]
                if( values ){
                    return {
                        "type": "predicate",
                        "field_id": "location_identifiers",
                        "operator_id": "includes",
                        "values": values
                    }
                }
            }else if( k === "exit_year"){
                return {
                    "type": "predicate",
                    "field_id": "exited_on",
                    "operator_id": "gte",
                    "values": [{value:`${allTerms[k]}-01-01`}]
                  }
            }else{
                console.log(`Cant map ${k} for CB lookup`)
            }
        }).filter(d=>d)
        if( query.length === 0){
            return false
        }
        console.log(query)

        try{
            if( nextPage === undefined){
                count = 0
            }
            let hasResults = false
            let lastId
            const url = `https://api.crunchbase.com/api/v4/searches/organizations`

            const po = {
                    "field_ids": [
                    "identifier",
                    "categories",
                    "location_identifiers",
                    "short_description",
                    "website_url",
                    "image_url",
                    "name",
                    "description",
                    "stock_symbol",
                    "ipo_status",
                    "exited_on"

                    ],
                    "order": [
                    {
                        "field_id": "rank_org",
                        "sort": "asc"
                    }
                    ],
                    query,
                    "limit": options.lookupCount || 500 
            }
            if( nextPage ){
                po.after_id = nextPage
            }
            const params = JSON.stringify(po)
            const response = await fetch(url,{
                method: 'POST',
                headers: {
                    'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
                },
                body:params
            });
            
            if( response.status === 200){
                
                const lookup = await response.json();
                console.log(lookup)
                if( lookup && lookup.entities ){
                    console.log(`Got ${lookup.entities.length} candidates`)
                    lastId = lookup.entities[ lookup.entities.length -1 ]?.uuid

                    const process = async function (item){
                        if( !item ){
                            console.log("IS NULL")
                            return
                        }
                        if( count < target ){
                            let description = item.properties.description?.replaceAll("\n", ". ")
                            if( !description || description.length === 0){
                                return
                            }
                            console.log(description)

                            if( options.filterPre && !(await options.filterPre({text: description, term: term})) ){
                                return
                            }
                            // convert domain
                            if( item.properties.website_url ){
                                item.properties.website_url = item.properties.website_url.trim()
                                item.website_url = item.properties.website_url
                            }
                            item.domain = item.properties.website_url?.replace(/^(https?:\/\/)?([^\/]+)\/?$/, "$2");
                            
                            if( options.existingCheck  ){
                                const exists = await options.existingCheck(item)
                                if( exists ){
                                    return
                                }
                            }
                            if( options.filterPost && !(await options.filterPost({text: description, term: term})) ){
                                return
                            }
                            const r = {
                                title: item.title,
                                type: "entity",
                                title: item.properties.name,
                                referenceParameters:{
                                    url: item.properties.website_url,
                                    domain: item.domain,
                                    hasImg: item.properties.image_url,
                                    description: item.properties.description,
                                    stock_symbol: item.properties.stock_symbol?.value,
                                    ipo: item.properties.ipo_status,
                                    exited_at: item.properties.exited_on?.value,
                                    location: item.properties.location_identifiers?.find(d=>d.location_type === "country")?.value || item.properties.location_identifiers?.[0]?.value
                                }
                            }
                            if( options.createResult ){
                                const newPrim = await options.createResult( r, true )
                                if( newPrim ){
                                    const store = {
                                        id: item.uuid,
                                        name: item.properties.name,
                                        description: item.properties.description,
                                        short_description: item.properties.short_description,
                                        image_url:item.properties.image_url,
                                        website_url: item.properties.website_url,
                                        domain: item.properties.website_url?.replace(/^(https?:\/\/)?([^\/]+)\/?$/, "$2"),
                                        source: "Crunchbase search " + term,
                                        categories: item.properties.categories?.map((d)=>{return {uuid: d.uuid, value: d.value}}),
                                        locations: item.properties.location_identifiers,
                                        ipo: item.properties.ipo_status,
                                    exited_at: item.properties.exited_on?.value,
                                        stock_symbol: item.properties.stock_symbol?.value
                                        
                                    }
                                    newPrim.set("crunchbaseData", store)
                                    newPrim.markModified("crunchbaseData")
                                    await newPrim.save()
                                    if( item.properties.image_url ){
                                        replicateURLtoStorage(item.properties.image_url, newPrim._id.toString(), "cc_vf_images")
                                    }
                                }
                            }else{
                                results.push(r)
                            }
                            count++
                            totalCount++
                        }
                    }
                    hasResults = true
                    let exec = await executeConcurrently( lookup.entities, process, options.cancelCheck, ()=> count >= target, 1 )
                    cancelled = exec?.cancelled
                }
            }else{
                console.log(`Got error from CB`)
                console.log(response)
            }
            console.log(`Finish cycle = `, hasResults, count, totalCount, target)
            if( hasResults && totalCount < target ){
                if( lastId){
                    console.log(`----------------`)
                    console.log(nextPage)
                    return await doLookup( allTerms, lastId)
                }else{
                }
            }
        }
        catch(error){
            console.log("Error in searchPosts")
            console.log(error)
        }
    }

    const searchItems = (terms.keyword?.split(",") ?? []).map(d=>({keyword: d ? '"' + d.trim() + '"' : undefined, ...(terms.searchTerms ?? {})}))

    for( const d of searchItems){
        let cancelled = await doLookup( d )
        if( cancelled ){
            break
        }
    }
    return options.createResult ? totalCount : results

}

export async function findOrganizationsFromCB(parent, options){
    let totalCount = 0
    try{
        const url = `https://api.crunchbase.com/api/v4/searches/organizations`
        const maxCreation = 25
        
        console.log(options)
        const keywords = options.keywords 
        const category = await Category.findOne({id: parent.referenceId})
        const resultSet =  category && category.resultCategories.find((d)=>d.resultCategoryId == options.referenceId)?.id
        if( !category || resultSet === undefined || !keywords || keywords.trim() === ""){
            return totalCount
        }
        const lookup = async ( keyword) => {
            const params = JSON.stringify(
                {
                    "field_ids": [
                    "identifier",
                    "categories",
                    "location_identifiers",
                    "short_description",
                    "website_url",
                    "image_url",
                    "name",
                    "description",
                    "rank_org"

                    ],
                    "order": [
                    {
                        "field_id": "rank_org",
                        "sort": "asc"
                    }
                    ],
                    "query": [
                        {
                            "type": "predicate",
                            "field_id": "description",
                            "operator_id": "contains",
                            "values": [
                                keyword
                            ]
                        }
                    ],
                    "limit": options.lookupCount || 500 
            })
            console.log(`Doing Crunchbase query`)
            const response = await fetch(url,{
                method: 'POST',
                headers: {
                    'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
                },
                body:params
            });
            
            if( response.status !== 200){
                console.log(`Error from crunchbase`)
                console.log(response)
                return totalCount
            }
            const data = await response.json();
            if( data ){
                if( data.entities ){
                    console.log(`For ${keyword} for ${data.entities.length}`)
                    let count = 0
                    const filteredList = await filterEntitiesByTopics(data.entities, parent.referenceParameters?.topics)
                    for( const entity of filteredList){
                        if( count < maxCreation){
                            if( await createPrimitiveFromCBData( entity, options.referenceId, parent, ['origin', `results.${resultSet}`])){
                                count++
                            }
                        }
                    }
                    totalCount += count
                }
            }
        }

        const set = keywords.split(/,|\sor\s|\sand\s/)
        console.log(set)

        for(let keyword of set){
            await lookup( keyword.trim() )
        }
    }catch(error){
        console.log(`Error on findOrganizationsFromCB`)
        console.log(error)
    }
    console.log(totalCount)
    return totalCount
}

export async function pivotFromCrunchbaseCategories(primitive, options = {}, force = false){
    let data = primitive.crunchbaseData
    let count = 0

    if(force || !data ){
        data = await fetchCompanyDataFromCrunchbase(primitive)
        if( data.error ){
            return {error: data.error}
        }
    }

    const categoryList = data.categories

    if( categoryList === undefined ){
        return 
    }
    const parent = await Primitive.findOne({_id: primitiveOrigin( primitive )}) 
    
    const maxVariants = options.maxVariants || 10
    if( categoryList.length < minMatch ){
        return {error: `Category information is too small or missing`}
    }
      
      function calculateTotalCombinations(n, minK) {
        let totalCombinations = 0;
        
        for (let k = minK; k <= n; k++) {
          totalCombinations += calculateCombination(n, k);
        }
        
        return totalCombinations;
      }
      
      function calculateCombination(n, k) {
        return factorial(n) / (factorial(k) * factorial(n - k));
      }
      
      function factorial(num) {
        if (num === 0 || num === 1) {
          return 1;
        } else {
          let result = 1;
          for (let i = 2; i <= num; i++) {
            result *= i;
          }
          return result;
        }
      }
      
      
    const items = categoryList;

    if( items === undefined ){
        return 
    }

    const minMatch = options.minMatch || 2
    const maxCreation = options.maxCreation || 50
    const maxRuns = options.maxRuns || 40
    console.log(`Minimum set to ${minMatch}`)

    function generateCombinations(items) {
        const combinations = [];
      
        function backtrack(currentCombination, start) {
          if (currentCombination.length >= minMatch) {
            combinations.push([...currentCombination]);
          }
      
          for (let i = start; i < items.length; i++) {
            currentCombination.push(items[i]);
            backtrack(currentCombination, i + 1);
            currentCombination.pop();
          }
        }
      
        backtrack([], 0);
      
        return combinations;
      }


      async function doLookup(categoryList){
        const url = `https://api.crunchbase.com/api/v4/searches/organizations`
        console.log(url)
        
        const options = JSON.stringify(
            {
                "field_ids": [
                  "identifier",
                  "categories",
                  "location_identifiers",
                  "short_description",
                  "website_url",
                  "image_url",
                  "name",
                  "description",
                  "rank_org"

                ],
                "order": [
                  {
                    "field_id": "rank_org",
                    "sort": "asc"
                  }
                ],
                "query": [
                  {
                    "type": "predicate",
                    "field_id": "categories",
                    "operator_id": "includes_all",
                    "values": categoryList.map((d)=>d.uuid)
                  }
                ],
                "limit": 20
        })
        console.log(`Doing Crunchbase query`)
        console.log(options)
        const response = await fetch(url,{
            method: 'POST',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            },
            body:options
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data ){
            if( data.entities ){
                const filteredList = await filterEntitiesByTopics(data.entities, parent.referenceParameters?.topics)
                for( const entity of filteredList){
                    if( count < maxCreation){
                        const paths = primitive.parentPrimitives[parent.id].map((d)=>d.replace('primitives.', ''))
                        if( await createPrimitiveFromCBData( entity, primitive.referenceId, parent, paths)){
                            count++
                        }
                    }
                }
            }
        }

      }

    let runs = 0

    let threshold = items.length > 5 ? parseInt( items.length * 0.66) : items.length
    for(const combo of generateCombinations(items).sort((a,b)=>b.length - a.length)){
        if( count >= maxCreation || runs > maxRuns ){
            break
        }
        if( combo.length > threshold){
            console.log(`skipping - ${combo.length} items of ${items.length}`)
            continue
        }
        console.log(`Run ${runs} (${count} created - got ${combo.length} categories`)
        await doLookup( combo )
        runs++
    }
    return count
}
export async function pivotFromCrunchbase(primitive, options = {}, force = false){
    let count = 0
    let targetCount = 20

    
    console.log(`-- Checking by description`)

    count += await pivotFromCrunchbaseDescription( primitive, options )
    console.log(count)
    if( primitive.type === "entity"){
        if( count < targetCount){
            console.log(`-- Checking articles`)
            count += await pivotFromCrunchbaseArticles( primitive, options )
        }
        if( count < targetCount){
            console.log(`-- Checking by category`)
            count += await pivotFromCrunchbaseCategories( primitive, options )
        }
    }
}
export async function pivotFromCrunchbaseDescription(primitive, options = {}){
    let parent = primitive
    let list =  [primitive.referenceParameters?.description]
    let keywordCount = 5
    let referenceId
    console.log(`pivot from Description`, options)

    if( primitive.type === "activity"){
        keywordCount = 10
        list = (await primitiveChildren(parent, "entity")).map((d)=>d?.referenceParameters?.description).filter((d)=>d)
        referenceId = options.referenceId
    }else{
        parent = await Primitive.findOne({_id: primitiveOrigin( primitive )}) 
        referenceId = primitive.referenceId
    }

    let count = 0
    if( list && list.length > 0){
        const keywords = await buildKeywordsFromList(list, {types: "organizations", count: keywordCount })
        console.log(keywords)
        if( keywords.success && keywords.keywords.length > 0){
            count += await findOrganizationsFromCB(parent, {keywords: keywords.keywords.join(", "), referenceId: referenceId, lookupCount: options.lookupCount })
        }
    }
    return count
}
export async function enrichFromCrunchbase( primitive, options = {}){
    try{

        let data = primitive.crunchbaseData
        let count = 0
        
        if(true || !data ){
            data = await fetchCompanyDataFromCrunchbase(primitive)
            if( data.error ){
                return {error: data.error}
            }
        }
        if( data ){
            let properties = data
            const newParams = {
                ...primitive.referenceParameters,
                url: properties.website_url,
                hasImg: properties.image_url,
                description: properties.description ?? properties.short_description,
                domain: properties.website_url?.replace(/^(https?:\/\/)?([^\/]+)\/?$/, "$2"),
                location: properties.location_identifiers?.find(d=>d.location_type === "country")?.value || properties.location_identifiers?.[0]?.value,
                stock_symbol: properties.stock_symbol,
                ipo: properties.ipo,
                exited_at: properties.exited_at,
            }
            if( properties.image_url ){
                replicateURLtoStorage(properties.image_url, primitive._id.toString(), "cc_vf_images")
            }
            dispatchControlUpdate( primitive.id, `title`, properties.name)
            dispatchControlUpdate( primitive.id, `referenceParameters`, newParams)
        }
    }catch(error){
        console.log(`Error in enrichFromCrunchbase`)
        console.log(error)
    }
}

export async function enrichCompanyFunding( primitive, options = {}){
    let data = primitive.crunchbaseData
    let count = 0

    if(!data ){
        data = await fetchCompanyDataFromCrunchbase(primitive)
        if( data.error ){
            return {error: data.error}
        }
    }
    let funding, overview
    
    if( funding === undefined){
        [funding, overview] = await fetchCompanyFundingFromCrunchbase(primitive, data.id)
        
    }
    if( funding && !funding.error ){
        const uniqueRounds = funding.map((d)=>[d.funding_round_money_raised?.value_usd,d.funding_round_identifier?.uuid] ).filter((d,i,a)=>a.findIndex((d2)=>d2[1]==d[1]) === i)
        const totalRaised = overview?.funding_total ?? uniqueRounds.reduce((a,c)=>a+(c[0] || 0),0)
        
        const investors = funding.map((d)=>d.investor_identifier?.value).filter((c,i,a)=>a.indexOf(c)===i)
        let rounds = funding.map((d)=>[d.funding_round_identifier?.value, d.announced_on, d.funding_round_money_raised?.value_usd]).filter((c,i,a)=>a.findIndex((d)=>d[0] == c[0] && d[1] === c[1])===i).map((d)=>{return {title: d[0].split(' - ')[0], amount: d[2],annouced: new Date(d[1])}}).sort((a,b)=>a.annouced - b.annouced)
        
        let earliest = funding.founded ? new Date(funding.founded?.value) : undefined

        rounds.forEach((d, idx, a)=>{
            if( !earliest || (d.annouced < earliest)){
                earliest = d.annouced
            }
            if( d.annouced ){
                if( idx === 0){
                    d.timeSinceLast = d.annouced - earliest
                }else{
                    d.timeSinceLast = d.annouced - a[idx - 1].annouced
                }
            }
        })
        rounds.forEach((d, idx, a)=>{
            if( d.annouced ){
                d.timeSinceFounded = d.annouced - earliest
            }
        })
        const selectedRounds = [
            "Angel Round",
            "Pre Seed Round",
            "Seed Round",
            "Series A",
            "Series B",
            "Series C",
            "Series D",
            "Series E"]

        dispatchControlUpdate( primitive.id, "referenceParameters.valuation", overview?.valuation?.value)
        dispatchControlUpdate( primitive.id, "referenceParameters.valuation_date", overview?.valuation?.date)
        dispatchControlUpdate( primitive.id, "referenceParameters.funding", totalRaised)
        dispatchControlUpdate( primitive.id, "referenceParameters.investors", investors)
        dispatchControlUpdate( primitive.id, "referenceParameters.fundingRounds", rounds.map((d)=>d.title))
        dispatchControlUpdate( primitive.id, "referenceParameters.allFundingRoundInfo", rounds)
        dispatchControlUpdate( primitive.id, "referenceParameters.fundingRoundInfo", rounds.filter((d)=>selectedRounds.includes(d.title)))
    }
}
export async function pivotFromCrunchbaseArticles(primitive, options = {}, force = false){
    let data = primitive.crunchbaseData
    let count = 0

    if(force || !data ){
        data = await fetchCompanyDataFromCrunchbase(primitive)
        if( data.error ){
            return {error: data.error}
        }
    }
    let articles = data.articles

    if( articles === undefined){
        articles = await fetchCompanyArtcilesFromCrunchbase(primitive, data.id)
        
    }
    if( articles === undefined ){
        return {error: "no_data"}
    }
        if( data.error ){
            return {error: data.error}
        }

    let out = []
    const parent = await Primitive.findOne({_id: primitiveOrigin( primitive )}) 
    
    if( parent && articles){
        const paths = primitive.parentPrimitives[parent.id].map((d)=>d.replace('primitives.', ''))
        let lookups = []
        for( const update of articles){
            if( update.activity_entities ){
                for( const entity of update.activity_entities){
                    const existing = await Primitive.findOne({
                        "workspaceId": parent.workspaceId,
                        [`parentPrimitives.${parent.id}`]: {$in: ['primitives.origin']},
                        deleted: {$exists: false},
                        "crunchbaseData.id": entity.uuid
                    })
                    
                    if( existing){
                    }else{
                        lookups.push(entity.uuid)
                    }
                }
            }
            
        }
        console.log(`Got list of ${lookups.length} companies to check`)
        while( lookups.length > 0){
            const thisCheck = lookups.slice(0,100)
            lookups = lookups.slice(100)
            console.log(`checking ${thisCheck.length}`)

            const url = `https://api.crunchbase.com/api/v4/searches/organizations`
            const options = JSON.stringify(
                {
                    "field_ids": [
                    "identifier",
                    "categories",
                    "location_identifiers",
                    "short_description",
                    "website_url",
                    "image_url",
                    "name",
                    "description",
                    "rank_org"

                    ],
                    "order": [
                    {
                        "field_id": "rank_org",
                        "sort": "asc"
                    }
                    ],
                    "query": [
                    {
                        "type": "predicate",
                        "field_id": "uuid",
                        "operator_id": "includes",
                        "values": lookups
                    }
                    ],
                    "limit": 100
            })
            console.log(`Doing Crunchbase query`)
            console.log(options)
            const response = await fetch(url,{
                method: 'POST',
                headers: {
                    'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
                },
                body:options
            });
            
            if( response.status !== 200){
                console.log(`Error from crunchbase`)
                console.log(response)
                return {error: response}
            }
            const data = await response.json();
            if( data ){
                if( data.entities ){
                    const filteredList = await filterEntitiesByTopics(data.entities, parent.referenceParameters?.topics)
                    for( const entity of filteredList){
                        await createPrimitiveFromCBData( entity, primitive.referenceId, parent, paths)
                        count++
                    }
                }
            }
        }
    }
    return count
}
export async function extractAcquisitionsFromCrunchbase(primitive, options = {}, force = false){

    let data = primitive.crunchbaseData
    if( !options.path || !options.type || !options.referenceId){
        console.log(`Extract failed - params not set`)
        console.log(options)
        return undefined
    }

    if(force || !data ){
        data = await fetchCompanyDataFromCrunchbase(primitive)
        if( data.error ){
            return {error: data.error}
        }
    }
    let acquisitionData = data.acquisitions

    if( acquisitionData === undefined){
        acquisitionData = await fetchAcquisitionFromCrunchbase(primitive, data.id)
        
    }
    if( acquisitionData === undefined ){
        return {error: "no_data"}
    }
        if( data.error ){
            return {error: data.error}
        }

    let out = []

    if( acquisitionData){
        const id = primitive._id.toString()
        const category = await Category.findOne({id: primitive.referenceId})
        const resultSet =  category && category.resultCategories.find((d)=>d.resultCategoryId == options.referenceId)?.id
        for( const acquisition of acquisitionData){

            if( acquisition?.identifier?.uuid){
                await createOrganizationByUUID( acquisition?.identifier?.uuid, primitive, {...options, category: category, resultSet: resultSet})
            }
        }
    }
    return out
}
export async function extractArticlesFromCrunchbase(primitive, options = {}, force = false){

    let data = primitive.crunchbaseData
    if( !options.path || !options.type || !options.referenceId){
        console.log(`Extract failed - params not set`)
        console.log(options)
        return undefined
    }

    if(force || !data ){
        data = await fetchCompanyDataFromCrunchbase(primitive)
        if( data.error ){
            return {error: data.error}
        }
    }
    let articles = data.articles

    if( articles === undefined){
        articles = await fetchCompanyArtcilesFromCrunchbase(primitive, data.id)
        
    }
    if( articles === undefined ){
        return {error: "no_data"}
    }
        if( data.error ){
            return {error: data.error}
        }

    let out = []

    if( articles){
        const id = primitive._id.toString()
        for( const update of articles){
            let full_text
            let extract_error = false

            const newData = {
                workspaceId: primitive.workspaceId,
                paths: ['origin', options.path, `extract.${id}`],
                parent: id,
                data:{
                    type: options.type,
                    referenceId: options.referenceId,
                    title: update.title,
                    referenceParameters:{
                        url: update.url,
                        posted: update.posted_on,
                        source:"Crunchbase Profile",
                        fullText: undefined
                    }
                }
            }
            const newPrim = await createPrimitive( newData )
            if( newPrim ){
                out.push(newPrim)
            }
        }
    }
    console.log(`created ${out.length} articles`)
    return out
}

export async function resolveAndCreateCompaniesByName( list, target, resultCategoryId, defaultResultSet, createBlank = false, create = true){    
    const resultSet = defaultResultSet ?? await findResultSetForCategoryId( target, resultCategoryId)
    if( resultSet === undefined){
        throw "Cant find result set for link_organizations"
    }
    const resultCategory = await Category.findOne({id: resultCategoryId})
    const existingOrgs = await primitivePrimitives(target, `results.${resultSet}`)
    const entityList = await resolveCompaniesByName( list, existingOrgs )

    const final = []
    console.log(`Need to create ${entityList.filter(d=>d.new).length} items`)
    if( entityList.length == 0 && createBlank){
        for(const name of list ){
            entityList.push( {new: true, title: name, referenceParameters: {}} )
            console.log(`-- Will create placeholder for ${name}`)
        }
    }
    for( const item of entityList ){
        if( item.new){
            if(!create){
                continue
            }
            const newData = {
                workspaceId: target.workspaceId,
                paths: ['origin', `results.${resultSet}`],
                parent: target.id,
                data:{
                    type: resultCategory.primitiveType,
                    referenceId: resultCategoryId,
                    title: item.title,
                    referenceParameters:{
                        url: item.referenceParameters?.url
                    }
                }
            }
            const newPrim = await createPrimitive( newData )
            if( newPrim ){
                final.push(newPrim)
            }else{
                console.log(`Couldnt create organization for ${item.name}`)
            }
        }else{
            final.push(item)
        }
    }

    return final
}
export async function resolveCompaniesByName( list, existingOrgs ){
    console.log(`Got ${existingOrgs.length} existing organizations`)
    const out = []
    for(const name of list){
        const nName = name.trim().toLowerCase()
        let candidates = existingOrgs.filter(d=>(d.title)?.trim()?.toLowerCase() === nName)
        console.log(name, candidates.length, "existing candidates")
        if( candidates.length === 0){
            let result = await lookupCompanyByName( name )
            if( result ){
                console.log(`Got ${result.length} companies from lookup ${result.map(d=>d.name).join(", ")}`)
                const candidateURLs = result.map(d=>d.website_url)
                const matchByURL = existingOrgs.find(d=>d.referenceParameters?.url && candidateURLs.includes(d.referenceParameters?.url))
                if( matchByURL ){
                    console.log(`Found existing by URL of candidate rather than name ${name} vs ${matchByURL.title}`)
                    candidates = [matchByURL]
                }else{
                    candidates = result.map(d=>({new: true, title: d.name, referenceParameters: {url: d.website_url}}))
                }
            }
        }
        if( candidates.length > 0){
            candidates = candidates.sort((a,b)=>Math.abs((a.title.length - nName.length) - (b.title.length - nName.length)) )
            out.push( candidates?.[0] )
        }
    }
    return out
}

export async function lookupCompanyByName( name ){
    try{

        const url = `https://api.crunchbase.com/api/v4/searches/organizations`
        console.log(url)
        
        console.log(`Doing Crunchbase query`)
        const response = await fetch(url,{
            method: 'POST',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            },
            body:JSON.stringify({
                "field_ids": [
                    "name",
                    "website_url",
                  ],
                  "order": [
                    {
                      "field_id": "rank_org",
                      "sort": "asc"
                    }
                  ],
                  "query": [
                    {
                      "type": "predicate",
                      "field_id": "identifier",
                      "operator_id": "contains",
                      "values": [
                        name
                      ]
                    }
                  ],
                  "limit": 20
            })
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data && data.entities){
            return data.entities.map(d=>d.properties)

        }
    }catch(error){
        console.log(`Error in `)
        console.log(error)
    }
}
export async function fetchCompanyDataFromCrunchbase( primitive ){
    try{

        const targetURL = primitive.referenceParameters.url.trim()
        if( targetURL === undefined || targetURL === ""){
            return {error: "no_url"}
        }
        
        const url = `https://api.crunchbase.com/api/v4/searches/organizations`
        console.log(url)
        
        console.log(`Doing Crunchbase query`)
        const response = await fetch(url,{
            method: 'POST',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            },
            body:JSON.stringify({
                "field_ids": [
                    "categories",
                    "description",
                    "name",
                    "short_description",
                    "image_url",
                    "website_url",
                    "stock_symbol",
                    "ipo_status",
                    "exited_on"
                  ],
                  "order": [
                    {
                      "field_id": "rank_org",
                      "sort": "asc"
                    }
                  ],
                  "query": [
                    {
                      "type": "predicate",
                      "field_id": "website_url",
                      "operator_id": "domain_eq",
                      "values": [
                        targetURL
                      ]
                    }
                  ],
                  "limit": 10
            })
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data ){
            console.log(data)
            if( data.count > 0){
                const rawData = data.entities[0]
                console.log(rawData)

                const store = {
                    id: rawData.uuid,
                    name: rawData.properties.name,
                    description: rawData.properties.description,
                    short_description: rawData.properties.short_description,
                    website_url: rawData.properties.website_url,
                    image_url:rawData.properties.image_url,
                    stock_symbol: rawData.properties.stock_symbol?.value,
                    ipo: rawData.properties.ipo_status,
                    exited_at: rawData.properties.exited_on?.value,
                    categories: rawData.properties.categories?.map((d)=>{return {uuid: d.uuid, value: d.value}})

                }
                primitive.set("crunchbaseData", store)
                primitive.markModified("crunchbaseData")
                await primitive.save()
                return store
                return data
            }
            return undefined
        }else{
            return {error: "no data"}
        }
    }catch(error){
        return {error: error}
    }

    
}
export async function fetchAcquisitionFromCrunchbase( primitive, cbId ){
    try{

        const uuid = cbId || primitive.crunchbaseData?.id
        const query = new URLSearchParams({ 
            "card_ids":["acquiree_acquisitions"]
        }).toString()
        
        const url = `https://api.crunchbase.com/api/v4/entities/organizations/${uuid}?${query}`
        console.log(url)
        
        console.log(`Doing Crunchbase query`)
        const response = await fetch(url,{
            method: 'GET',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            }
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data ){
            console.log(data)
            if( data.cards?.acquiree_acquisitions){
                const store = data.cards?.acquiree_acquisitions.map((d)=>{
                    return {
                        name: d.acquiree_identifier?.value,
                        identifier: d.acquiree_identifier,
                        announced_on: d.announced_on,
                        short_description: d.short_description,
                        acquiree_categories: d.acquiree_categories,
                        acquisition_type: d.acquisition_type,
                        acquiree_locations: d.acquiree_locations,
                        acquiree_revenue_range: d.acquiree_revenue_range,
                        acquiree_short_description: d.acquiree_short_description,
                        price: d.price,
                        status: d.status

                    }
                })
                primitive.set("crunchbaseData.acquisitions", store)
                primitive.markModified("crunchbaseData.acquisitions")


                await primitive.save()
                return store
            }
        }
        return {error: "no data"}
    }catch(error){
        return {error: error}
    }

    
}
export async function fetchCompanyArtcilesFromCrunchbase( primitive, cbId ){
    try{

        const uuid = cbId || primitive.crunchbaseData?.id
        const query = new URLSearchParams({ 
            "card_ids":["press_references"]
        }).toString()
        
        const url = `https://api.crunchbase.com/api/v4/entities/organizations/${uuid}?${query}`
        console.log(url)
        
        console.log(`Doing Crunchbase query`)
        const response = await fetch(url,{
            method: 'GET',
            headers: {
                'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
            }
        });
        
        if( response.status !== 200){
            console.log(`Error from crunchbase`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data ){
            if( data.cards?.press_references){
                const store = data.cards?.press_references.map((d)=>{
                    return {
                        url: d.url?.value,
                        published: d.publisher,
                        title: d.title,
                        posted_on: d.posted_on,
                        activity_entities: d.activity_entities
                    }
                })
                primitive.set("crunchbaseData.articles", store)
                primitive.markModified("crunchbaseData.articles")


                await primitive.save()
                return store
            }
        }
        return {error: "no data"}
    }catch(error){
        return {error: error}
    }

    
}
export async function fetchFundingRoundInfoFromCrunchbase( uuid ){
    try{
        let attempts = 3

        const doRequest = async () =>{
            const query = new URLSearchParams({ 
                "card_ids":["organization"]
            }).toString()
            
            const url = `https://api.crunchbase.com/api/v4/entities/funding_rounds/${uuid}?${query}`
            console.log(url)
            
            console.log(`Doing Crunchbase query`)
            const response = await fetch(url,{
                method: 'GET',
                headers: {
                    'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
                }
            });
            
            if( response.status !== 200){
                console.log(`Error from crunchbase - ${attempts--} attempts left`)
                console.log(`-----------------`)
                await new Promise(r => setTimeout(r, 10000));                    
                console.log(response)
                if( attempts > 0){
                    return await doRequest()
                }
            }
            const data = await response.json();
            return data
        }
        const data = await doRequest()
        if( data?.error){
            return data
        }
        if( data ){
            if( attempts !== 3){
                console.log('Had error but recovered')
            }
            return data.cards?.organization?.[0]
                
        }
    }catch(error){
        return {error: error}
    }
}
export async function fetchCompanyFundingFromCrunchbase( primitive, cbId ){
    try{
        let attempts = 3

        const doRequest = async () =>{

            const uuid = cbId || primitive.crunchbaseData?.id
            const query = new URLSearchParams({ 
                "field_ids": "founded_on",
                "card_ids":["raised_investments"]
            }).toString()
            
            const url = `https://api.crunchbase.com/api/v4/entities/organizations/${uuid}?${query}`
            console.log(url)
            
            console.log(`Doing Crunchbase query`)
            const response = await fetch(url,{
                method: 'GET',
                headers: {
                    'X-cb-user-key': `${process.env.CRUNCHBASE_KEY}`
                }
            });
            
            if( response.status !== 200){
                console.log(`Error from crunchbase - ${attempts--} attempts left`)
                console.log(`-----------------`)
                await new Promise(r => setTimeout(r, 10000));                    
                console.log(response)
                if( attempts > 0){
                    return await doRequest()
                }
            }
            const data = await response.json();
            return data
        }
        const data = await doRequest()
        if( data?.error){
            return data
        }
        if( data ){
            if( attempts !== 3){
                console.log('Had error but recovered')
            }
            if( data.cards?.raised_investments){

                const store = data.cards?.raised_investments 
                store.founded = data.properties.founded_on


                const uniqueRounds = store.map((d)=>d.funding_round_identifier?.uuid ).filter((d,i,a)=>d && a.indexOf( d) === i)
                const roundData = []
                for( const roundId of uniqueRounds ){
                    const fullData = await fetchFundingRoundInfoFromCrunchbase(roundId) 
                    roundData.push({
                        funding_total: fullData.funding_total?.value_usd,
                        equity_funding_total: fullData.equity_funding_total?.value_usd,
                        last_funding: {value: fullData.last_funding_total?.value_usd, type: fullData.last_funding_type, date: fullData.last_funding_at},
                        valuation: {value: fullData.valuation?.value_usd, date: fullData.valuation_date},

                    })
                    if( fullData ){
                        break
                    }
                }
                primitive.set("crunchbaseData.raised_investments", store)
                primitive.set("crunchbaseData.investment_overview", roundData[0])
                primitive.markModified("crunchbaseData.raised_investments")
                primitive.markModified("crunchbaseData.investment_overview")
                await primitive.save()
                return [store, roundData[0]]
            }
        }
        return {error: "no data"}
    }catch(error){
        return {error: error}
    }

    
}