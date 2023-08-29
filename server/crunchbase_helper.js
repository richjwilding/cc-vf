import Primitive from "./model/Primitive";
import {createPrimitive, flattenPath, doPrimitiveAction, primitiveOrigin, primitiveChildren, dispatchControlUpdate} from './SharedFunctions'
import { replicateURLtoStorage } from "./google_helper";
import { analyzeListAgainstTopics, analyzeText, analyzeTextAgainstTopics, buildKeywordsFromList } from "./openai_helper";
import Category from "./model/Category";
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
            const result = await analyzeListAgainstTopics(list.map((d)=>d.properties.description.replaceAll("\n",". ")), topics, {prefix: "Organization", type: "organization", maxTokens: 6000})
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
    return await process( await process( list ) )
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
                assessment: entity?.assessment
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
            categories: entity.properties.categories?.map((d)=>{return {uuid: d.uuid, value: d.value}})
            
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
export async function enrichCompanyFunding( primitive, options = {}){
    let data = primitive.crunchbaseData
    let count = 0

    if(!data ){
        data = await fetchCompanyDataFromCrunchbase(primitive)
        if( data.error ){
            return {error: data.error}
        }
    }
    let funding// = data.raised_investments
    
    if( funding === undefined){
        funding = await fetchCompanyFundingFromCrunchbase(primitive, data.id)
        
    }
    if( funding && !funding.error ){
        const uniqueRounds = funding.map((d)=>[d.funding_round_money_raised?.value_usd,d.funding_round_identifier?.uuid] ).filter((d,i,a)=>a.findIndex((d2)=>d2[1]==d[1]) === i)
        const totalRaised = uniqueRounds.reduce((a,c)=>a+(c[0] || 0),0)
        
        const investors = funding.map((d)=>d.investor_identifier?.value).filter((c,i,a)=>a.indexOf(c)===i)
        let rounds = funding.map((d)=>[d.funding_round_identifier?.value, d.announced_on, d.funding_round_money_raised?.value]).filter((c,i,a)=>a.findIndex((d)=>d[0] == c[0] && d[1] === c[1])===i).map((d)=>{return {title: d[0].split(' - ')[0], amount: d[2],annouced: new Date(d[1])}}).sort((a,b)=>a.annouced - b.annouced)
        
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
export async function fetchCompanyDataFromCrunchbase( primitive ){
    try{

        const targetURL = primitive.referenceParameters.url
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
                    categories: rawData.properties.categories?.map((d)=>{return {uuid: d.uuid, value: d.value}})

                }
                primitive.set("crunchbaseData", store)
                primitive.markModified("crunchbaseData")
                await primitive.save()
                return store
            }
            return data
        }else{
            return {error: "no data"}
        }
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
                primitive.set("crunchbaseData.raised_investments", store)
                primitive.markModified("crunchbaseData.raised_investments")
                await primitive.save()
                return store
            }
        }
        return {error: "no data"}
    }catch(error){
        return {error: error}
    }

    
}