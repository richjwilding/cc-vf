import { addRelationship, addRelationshipToMultiple, buildContext, cosineSimilarity, createPrimitive, decodePath, dispatchControlUpdate, doPrimitiveAction, executeConcurrently, expandPrimitiveLiterals, fetchPrimitive, fetchPrimitives, findParentPrimitivesOfType, findPrimitiveOriginParent, getConfig, getConfigParent, getConfigParentForTerm, getDataForImport, getDataForProcessing, getPrimitiveInputs, multiPrimitiveAtOrginLevel, primitiveChildren, primitiveDescendents, primitiveListOrigin, primitiveOrigin, primitiveParentsOfType, primitivePrimitives, primitiveTask, removePrimitiveById, removeRelationship, removeRelationshipFromMultiple } from "./SharedFunctions";
import Primitive from "./model/Primitive";
import { analyzeForClusterPhrases, analyzeListAgainstItems, analyzeListAgainstTopics, buildCategories, buildEmbeddings, categorize, consoldiateAxis, extractAxisFromDescriptionList, extractFeautures, processAsSingleChunk, processPromptOnText, simplifyAndReduceHierarchy, simplifyHierarchy, summarizeMultiple } from "./openai_helper";
import Embedding from "./model/Embedding";
import DBSCAN from "@cdxoo/dbscan";
import Category from "./model/Category";
import PrimitiveParser from "./PrimitivesParser";
import { buildDocumentEmbedding, buildEmbeddingsForPrimitives, ensureDocumentEmbeddingsExist, fetchDocumentEmbeddings, getDocumentAsPlainText } from "./google_helper";
import agglo from "agglo";
import { BaseQueue } from './base_queue';
import { comapreToPeers, getItemsForQuery, hasMeaningfulContent, oneShotQuery, summarizeWithQuery } from "./task_processor";
import { reviseUserRequest } from "./prompt_helper";
import { getLogger } from './logger.js';

const logger = getLogger('ai_queue'); // Debug level for moduleA


const parser = PrimitiveParser()
let instance

function calculateCentroid(vectors) {
    if (!vectors || vectors.length === 0) {
      throw new Error("Invalid input. The 'vectors' parameter should be a non-empty array of multidimensional vectors.");
    }
  
    const dimension = vectors[0].length;
    const numberOfVectors = vectors.length;
  
    // Initialize an array to store the sum of values for each dimension
    const sumByDimension = new Array(dimension).fill(0);
  
    // Calculate the sum of values for each dimension across all vectors
    for (const vector of vectors) {
      if (vector.length !== dimension) {
        throw new Error("All vectors must have the same dimension.");
      }

      for (let i = 0; i < dimension; i++) {
        sumByDimension[i] += vector[i];
      }
    }
  
    // Calculate the centroid by dividing the sum by the number of vectors
    const centroid = sumByDimension.map(sum => sum / numberOfVectors);
  
    return centroid;
  }


  

function euclideanDistance(point1, point2) {
    if (point1.length !== point2.length) {
      throw new Error("Both points must have the same dimensionality.");
    }
  
    let sum = 0;
    for (let i = 0; i < point1.length; i++) {
      sum += Math.pow(point1[i] - point2[i], 2);
    }
 
    const r = Math.sqrt(sum)
    return r;
  }

async function defineAxis( primitive, action ){
 //   let axis = primitive.axis

        let axis 
        console.log(`Fetching suggested axis`)

        const [list, data] = await getDataForProcessing(primitive, action)
        const category = await Category.findOne({id: list[0]?.referenceId})
        const type = category?.plural ?? category.title ?? list[0]?.type ?? action.type
        const task = await primitiveTask( primitive )
        const result = await extractAxisFromDescriptionList( data, {
            type: type, 
            batch: 150, 
            theme: task?.referenceParameters?.topics,
            debug: true, 
            debug_content: true
        })
        if( result?.success ){
            await dispatchControlUpdate(primitive.id, `axis`, result.output)
            axis = result.output
        }

        if( axis ){
            const passCheck = axis.map((d)=>d._pass || 0).filter((d,i,a)=>a.indexOf(d)===i)
            if( passCheck.length > 1){
                console.log(`NEED TO CONSOLIDATE AXIS`)
                const forConsolidation = axis.map((d,idx)=>{return {
                    id: idx, 
                    title: d.title, 
                    dimension: d.dimension, 
                    description: d.description,
                    values: d.values.map((d)=>{
                        return {
                            title: d.title,
                            description: d.description,
                          //  assignments: d.assignments.map(d=>d.id)
                        }
                    })
                }})
                console.log(forConsolidation)

                let prompt = `Combine any and all axes which are addressing the same focus and dimension by merging the values structures of those axes.
                **Steps:**
                1. Compare each axis with every other axis based on their titles, descriptions, AND values. Consider axes that have similar topics or coverage areas even if titles, descriptions or dimensions differ slightly so long as they are conceptually the same
                2. Merge axes that have conceptually related or overlapping content by combining their respective values structures. Ensure each value retains its key details.
                3. Consolidate similar values within the new axis based on their title and description, combining the titles and descriptions where necessary to retain nuance.
                4. Add a 'combined' field to the new axis containing an array of ids that were merged.`

                let output = `Provide the result as a json object called 'results' with the following structure: 
                {
                    'not_combined': [<<list of axis ids which have not been combined with others>>],
                    'new_axis': 
                [   <<list of new combined axis with following sturcture>>
                    { 
                        title:<<New title for the combined axis in no more than 5 words>>, 
                        dimension:<<The dimension this combined axis considers (such as offerings, customers)>>, 
                        description: <<Description of the combined axis in no more than 25 words, 
                        values: [
                            {
                                title: <<Title of value>>, 
                                description: <<description of value in no more than 25 words>>},
                                combined_values: [<<list of titles from the original values that are being merged into this value>>],
                                rationale: <<a short description of why these values have been combined, or why they have not>>,
                            },<<remaining values from the original axis or combined values from those axis>>>
                        ],
                        combined: [<<list of axis ids from orignal list that have been combined into this axis>>],
                    },<<remaining combined axis only>
                ],
            }`

            const instructions = `Here is a set of axis:\n${JSON.stringify(forConsolidation)}\n\n${prompt}`
        

            const result = await processAsSingleChunk(instructions,{
                output: output,
                temperature: 1,
                debug: true,
                debug_content:true
            })
            if(result?.success && result?.results?.new_axis){
                console.log(result.results.new_axis)
                console.log(result.results.not_combined)

                let outIdx = axis.length + 1
                const newAxis = result.results.new_axis.map(d=>{
                    outIdx++
                    const {values, combined, ...xform} = d

                    console.log(`Combining ${combined.join(", ")}`)
                    const originalAxisSet = combined.map(d=>axis[d])

                    if( combined.length === 1 ){
                        const {_pass, ...out} = originalAxisSet[0]
                        return {id: outIdx, ...out}
                    }
                    
                    const originalValues = originalAxisSet.map(d=>d.values).flat()

                    xform.values = values.map(d=>{
                        const {combined_values, rationale, ...xform} = d
                        //xform.assignments = originalValues.filter(d=>combined_values.includes(d.title)).map(d=>d.assignments).flat()
                        return xform
                    })

                    return {id: outIdx, ...xform}
                }) 
                console.log(`----- New axis set`)
                axis = [...result.results.not_combined.map(d=>axis[d]), ...newAxis]
                console.log(newAxis)
                
            }
        }
                
        for( const a of axis ){
            if( a.title && a.values && a.values.length ){
               // const coverage = Math.floor((a.values.map(d=>d.assignments.length).reduce((a,c)=>a + c,0) ?? 0) * 100 / list.length)
                const newPrim = await createPrimitive({
                    workspaceId: primitive.workspaceId,
                    parent: primitive.id,
                    data:{
                        type: "category",
                        title: a.title,
                        referenceParameters: {
                            field: primitive.referenceParameters?.field ?? action.field ?? "title",
                            description: a.description,
                            dimension: a.dimension
                        }
                    }
                })
                if( newPrim ){
                    console.log(a.title)
                    for( const v of a.values ){
                        const valuePrim = await createPrimitive({
                            workspaceId: primitive.workspaceId,
                            parent: newPrim.id,
                            referenceId: action.resultCategory,
                            data:{
                                type: "category",
                                title: v.title,
                                referenceParameters: {
                                    description: v.description,
                                }
                            }
                        })
                        if( false && valuePrim ){
                            for( const s of v.assignments){
                                const prim = list[s?.id]
                                if( prim ){
                                    await addRelationship( valuePrim.id, prim.id, 'ref')
                                }
                            }
                        }
                    }
                }
            }
        }        
    }

}
async function aggregateDuplicatedInSegment( primitive, action ){
    console.log('CHECKING FOR DUP')
    
    const [list, data] = await getDataForProcessing(primitive, action )
    let embeddings = await Embedding.find({foreignId: {$in: list.map((d)=>d.id)}, type: action.field})
    const toProcess = embeddings.map((d)=>d.embeddings)
    
    console.log(`Got back ${embeddings.length} embeddings`)

    const clusterSet = DBSCAN({
        dataset: toProcess,
        epsilon: 0.05,
        distanceFunction: euclideanDistance
    });
    if( clusterSet && clusterSet?.clusters){
        for(const cluster of clusterSet.clusters){
            console.log(`Similar = ${cluster.join(",")}`)
            if( cluster.length > 1 ){

                const item = list.find((d)=>d.id === embeddings[cluster[0]].foreignId)
                console.log(  'KEEP: ' + item.id + " - " + item.title)
                for(const ids of cluster.slice(1) ){
                    const item = list.find((d)=>d.id === embeddings[ids].foreignId)
                    console.log(  'FLAG: ' + item.id + " - " + item.title)
                    await dispatchControlUpdate(item.id, `referenceParameters.duplicate`, true )
                }
            }
        }
    }

}

async function rollup2(primitive, target, action ){
    try{

        console.log(`Rollup version 2 ${primitive.id} starting`)
        
        const task = await primitiveTask( primitive)


        async function buildCluster( list, data , segmentTarget){
            const result = await analyzeForClusterPhrases( data, {
                theme: (primitive.referenceParameters?.theme && primitive.referenceParameters?.theme.trim().length > 0 ? primitive.referenceParameters?.theme : undefined ) ?? action?.theme ?? task?.referenceParameters?.topics,
                focus: action?.focus,
                type: primitive.referenceParameters?.types ?? action.aiConfig?.[action.field]?.types ??  "problem statements",
                debug_content:true,
                debug: true} )
            console.log(result)
            let parent = segmentTarget

            if( result.success){
                const groups = result.output 
                const assignments = await assignPrimitivesByPhrase( list, action.field, groups)
                if( assignments ){
                    if( segmentTarget ){
                        // need to remove existing links
                    }
                    const mappedGroups = {}
                    for(const primitiveId in assignments){
                        const d = assignments[primitiveId]
                        if( !mappedGroups[d.idx]){
                            mappedGroups[d.idx] = {ids: [], fragments: [], title: groups[d.idx].cluster_title, phrases: [groups[d.idx].phrase].flat()}
                        }
                        const listIdx = list.findIndex(d=>d.id === primitiveId )
                        const fragment = data[listIdx]
                        if( fragment ){
                            mappedGroups[d.idx].fragments.push( fragment )
                        }else{
                            throw "Couldnt fetch fragment"
                        }
                        mappedGroups[d.idx].ids.push( primitiveId )
                    }
                    if(Object.keys(mappedGroups).length > 0){
                        if( !segmentTarget ){
                            segmentTarget = await createPrimitive({
                                workspaceId: primitive.workspaceId,
                                parent: primitive.id,
                                paths: ['origin'],
                                data:{
                                    type: "segment",
                                    title: "New clustering",
                                    referenceId: action.resultCategory,
                                    referenceParameters:{
                                        field: action.field,
                                        resultCategory: action.resultCategory,
                                        ...action.aiConfig?.[action.field]
                                    }
                                }
                            })
                        } 
                        if( !segmentTarget ){
                            throw "Couldnt create segment target"
                        }
                        for( const idx in mappedGroups){
                            const segmentObj = mappedGroups[idx]
                            const types = primitive.referenceParameters?.types ?? action.aiConfig?.[action.field]?.types ??  "problem statements"
                            const prompt = primitive.referenceParameters?.prompt ?? action.aiConfig?.[action.field]?.prompt ??  "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'"
                            let summary = await summarizeMultiple( segmentObj.fragments, {types, prompt, engine: "gpt4p", debug:true, debug_content: true})
                            segmentObj.summary = summary?.success ? summary.summary : undefined
                        }

                        const rewrites = await simplifyAndReduceHierarchy( ["Problems in the market"], Object.values(mappedGroups).map(d=>d.summary), {engine: "gpt4o", debug: true, debug_content: true})
                        if( rewrites.success){
                            const merged = []
                            const remap = Object.keys(mappedGroups)
                            for(const r of rewrites.summaries){
                                const id = remap[r.id]
                                const target = mappedGroups[id]
                                if( target ){
                                    target.title = r.label
                                    target.summary = r.description
                                    if( r.merge_with){
                                        for( const _id of r.merge_with ){
                                            const mergeId = remap[_id]
                                            console.log(`Merging with ${mergeId}`)
                                            const mergeTarget = mappedGroups[mergeId]
                                            if( mergeTarget ){
                                                target.ids = target.ids.concat( mergeTarget.ids)
                                                target.fragments = target.fragments.concat( mergeTarget.fragments)
                                                delete mappedGroups[mergeId]
                                                merged.push(mergeId)
                                            }else{
                                                console.log(`Couldnt find merge target`)
                                            }
                                        }
                                    }
                                }else{
                                    if( !merged.includes(id) ){
                                        console.log(`Couldn't find ${id} / ${r.id}`)
                                    }
                                }
                            }
                        }

                        for( const idx in mappedGroups){
                            const segmentObj = mappedGroups[idx]

                            segmentObj.segment = await createPrimitive({
                                workspaceId: primitive.workspaceId,
                                parent: segmentTarget.id,
                                paths: ['origin'],
                                data:{
                                    type: "segment",
                                    title: segmentObj.title,
                                    referenceId: action.resultCategory,
                                    referenceParameters:{
                                        root: segmentTarget.id,
                                        phrases: segmentObj.phrases,
                                        overview: segmentObj.summary 
                                    }
                                }
                            })
                            for( const primitiveId of segmentObj.ids){
                                console.log(`setting ${primitiveId} to ${segmentObj.segment.id}`)
                                await addRelationship( segmentObj.segment.id, primitiveId, "ref")
                                if( parent ){
                                    console.log(`Remove from parent`)
                                    await removeRelationship( parent.id, primitiveId, "ref")
                                }
                                
                            }
                        }
                        for( const idx in mappedGroups){
                            const segmentObj = mappedGroups[idx]
                            if( segmentObj.ids.length !== segmentObj.fragments.length ){
                                console.log(`Fragment / ids mismatch ${segmentObj.ids.length} / ${segmentObj.fragments.length}`)
                                throw "Error in rollup2"
                            }
                            if( segmentObj.ids.length > 10 ){
                                console.log(`Doing nested cluster of ${segmentObj.ids.length} length`)
                                await buildCluster( segmentObj.ids.map(d=>fullList.find(d2=>d2.id === d)), segmentObj.fragments, segmentObj.segment ) 
                            }
                        }
                    }
                }
            }
        }
        
        let [fullList, fullData] = await getDataForProcessing(primitive, {...action, referenceId: target.referenceParameters?.referenceId, constrainId: target.referenceParameters?.constrainId})
        //let segmentTarget = target?.type === "segment" ? target : undefined

        await buildCluster( fullList, fullData )
        
        console.log("fetch done")
    }catch(error){
        console.log('Error in rollup2')
        console.log(error)
    }
}
async function assignPrimitivesByPhrase( list, field, phraseGroups, options = {} ){

    console.log(`Process by embeddings`)
    const searchTerms = 500 
    const scores = {}
    const threshold = options.threshold ?? 0.9
    const workspaceId = list[0]?.workspaceId

    field = field.split(".").slice(-1)[0]


    let candidateIdx  = 0
    for( const candidate of phraseGroups ){
        console.log(`Semantic query: ${candidate.cluster_title}`)
        let phraseIdx = 0
        for( const phrase of [candidate.phrase].flat() ){
            const response = await buildEmbeddings(phrase)
            if( response.success){
                console.log(`Semantic query: ${phrase}`)
                let idx = 0, batch = 1000
                do{
                    const scope = list.slice(idx, idx + batch).map(d=>d.id)
                    const searchTerms = Math.min(scope.length * 2, 10000) 
                    console.log(`Doing in batches of ${batch} from ${idx}`)
                    const matches = await Embedding.aggregate([
                        {"$vectorSearch": {
                        "queryVector": response.embeddings,
                        "path": "embeddings",
                        "filter": {$and: [
                                {
                                    type: field
                                },{
                                    foreignId: {$in: scope}
                                }
                        ]},
                        "numCandidates": Math.min(searchTerms * 15, 10000),
                        "limit": searchTerms,
                        "index": "vector_index",
                            }
                        },
                        {
                        "$project": {
                            "_id": 0,
                            "foreignId": 1,
                            "score": { $meta: "vectorSearchScore" }
                        }
                        }
                    ])
                    console.log(`-- got ${matches.length} matches`)
                    for(const result of matches){
                        if( result.score > threshold ){
                            console.log(result.foreignId, result.score, scores[result.foreignId], phrase.slice(0,20))
                            if( (scores[result.foreignId] === undefined) || (result.score > scores[result.foreignId].score) ){
                                scores[result.foreignId] = {score: result.score, idx: candidateIdx, phraseIdx: phraseIdx}
                            }
                        }
                    }
                    idx += batch
                }while(idx < list.length)

                /*
                const matches = await Embedding.aggregate([
                    {"$vectorSearch": {
                        "queryVector": response.embeddings,
                        "path": "embeddings",
                        "filter": {$and: [
                            {
                                workspaceId: workspaceId
                            },{
                                type: field
                            },{
                                foreignId: {$in: scopeIds}
                            }
                        ]},
                        "numCandidates": searchTerms * 15,
                        "limit": searchTerms,
                        "index": "vector_index",
                        }
                    },
                    {
                        "$project": {
                        "_id": 0,
                        "foreignId": 1,
                        "score": { $meta: "vectorSearchScore" }
                        }
                    }
                ])
                for(const result of matches){
                    if( result.score > threshold){
                        //if( scopeIds.includes(result.foreignId) ){
                            console.log(result.foreignId, result.score, scores[result.foreignId], candidate.cluster_title?.slice(0,20))
                            if( (scores[result.foreignId] === undefined) || (result.score > scores[result.foreignId].score) ){
                                scores[result.foreignId] = {score: result.score, idx: candidateIdx, phraseIdx: phraseIdx}
                            }
                        //}
                    }
                }*/
            }
            phraseIdx++
        }
        candidateIdx++
    }
    return scores
}

async function rollup( primitive, target, action ){
    console.log(`Rollup ${primitive.id} starting`)
    let list, data
    let redo = []

    if( false && ["param.aggregateFeatures","param.technology","param.offerings","param.customers"].includes(action.field) ){
        [list, data] = await getDataForProcessing(primitive, {...action, referenceId: target.referenceParameters?.referenceId, constrainId: target.referenceParameters?.constrainId, field: "param.description"})
        console.log(`-- back ${list.length} / ${data.length}`)
        let idx = 0
        while(idx < list.length){
            console.log(`Extracting capabilities in batches of 50 - ${idx}`)
            const field  = action.field.split(".").slice(-1)
            
            const tempList = list.slice(idx, idx+50).filter((d)=>d.referenceParameters?.[field] === undefined || d.referenceParameters?.[field] === null)
            if( tempList.length > 0){
                const featureList = await extractFeautures( tempList.map((d)=>d.referenceParameters.description.replaceAll(/\n|\r/g,". ")), {engine:"gpt4p", debug:true, debug_content: true})
                if( featureList.success && featureList.output.length === tempList.length ){
                    for(const result of featureList.output){
                        const p = tempList[ result.id ]
                        redo.push( p.id )
                        const agg = []
                        for( const field of ["technology", "offerings","customers", "name"]){
                            let res = result[field]
                            if( res && res !== "NONE" ){
                                if( Array.isArray(res) ){
                                    res = res.filter(d=>d!=='NONE')
                                    res = res.join(", ")
                                }
                                await dispatchControlUpdate(p.id, `referenceParameters.${field}`, res )
                                //console.log(`updated ${field} on ${p.id}`)
                                agg.push(res)
                            }
                        }
                        if( agg.length > 0){
                            await dispatchControlUpdate(p.id, `referenceParameters.aggregateFeatures`, agg.join(". ") )
                        }
                    }
                }
            }
            idx += 50
        }
        [list, data] = await getDataForProcessing(primitive, {...action, referenceId: target.referenceParameters?.referenceId, constrainId: target.referenceParameters?.constrainId} )

    }else{
        [list, data] = await getDataForProcessing(primitive, {...action, referenceId: target.referenceParameters?.referenceId, constrainId: target.referenceParameters?.constrainId})
    }
    
    if(data){
        if( data.length !== list.length){
            console.log(`Mismatch on data vs list size`)
        }else{
            let lastField = action.field.split(".").slice(-1)[0]
            let embeddings = await Embedding.find({foreignId: {$in: list.map((d)=>d.id)}, type: lastField})
            console.log(`Have ${embeddings.length}`)
            embeddings = embeddings.filter(d=>!redo.includes(d.foreignId))
            console.log(`Noe ${embeddings.length} after checking for redo`)

            const missingIdx = list.map((d, idx)=>embeddings.find((e)=>e.foreignId === d.id) ? undefined : idx).filter((d)=>d  !== undefined)
            console.log( `missingIdx = ${missingIdx.join(", ")}`)
            for(const idx of missingIdx){
                console.log(`Embeddings for ${idx} - ${list[idx].id}`)
                let thisItem = data[idx]
                if( Array.isArray(thisItem) ){
                    thisItem = thisItem.join(", ")
                }
                const response = await buildEmbeddings(thisItem)
                if( response.success){
                    const dbUpdate = await Embedding.findOneAndUpdate({
                        type: lastField,
                        workspaceId: list[idx].workspaceId,
                        foreignId: list[idx].id
                    },{
                        embeddings: response.embeddings
                    },{upsert: true, new: true})
                    embeddings.push( dbUpdate )
                }
            }
            console.log(`fetched`)
            const ids = list.map((d)=>d.id)
            list = list.sort((a,b)=>a.id.localeCompare(b.id))
            embeddings = embeddings.filter((d)=>ids.includes(d.foreignId))
            embeddings = embeddings.sort((a,b)=>a.foreignId.localeCompare(b.foreignId))
            const ensureOrder = list.map((d,idx)=>d.id === embeddings[idx].foreignId).reduce((o,a)=>o && a, true)
            if( !ensureOrder ){
                throw new Error(`Items out of order`)
            }
            console.log(`build cache`)
            const toProcess = embeddings.map((d)=>d.embeddings)

            console.log("START")
            const levels = agglo(embeddings,
                {
                distance: (a,b)=>1 - cosineSimilarity(a.embeddings,b.embeddings)
            })
            console.log("Done")

            const targetClusterSize = levels.length > 5000 ? (levels.length / 100) : levels.length > 1000 ? 10 : levels.length > 500 ? 8 : levels.length > 250 ? 4 : levels.length > 150 ? 3 : 2
            let maxClusters 
            let testSize = targetClusterSize
            let levelDensity
            let count
            do{
                levelDensity = levels.map(d=>d.clusters.filter(d=>d.length > testSize ).length)
                count = levelDensity.filter(d=>d > 0 ).length
                console.log(`- For test of ${testSize} got ${count}`)
                testSize--
            }while( testSize > 1 && count === 0)
            maxClusters= levelDensity.reduce((a,c)=>a > c ? a : c, 0)
            const maxIdx = levelDensity.findIndex(d=>d === maxClusters)
            console.log( `found ${maxClusters} at ${maxIdx} / ${targetClusterSize}`)
            

            const slice = 5
            const steps = (levels.length - maxIdx) / (slice - 1) 
            const extract = new Array(slice - 1).fill(0).map((_,idx)=>Math.floor(idx  * steps) - 1 + maxIdx)
            while(levels.length - extract[extract.length - 1] > 10 ){
                const newItem = Math.floor(levels.length - ((levels.length - extract[extract.length - 1]) * 0.6))
                console.log(newItem)
                extract.push(newItem)
            }
            const totalLevels = extract.length
            console.log(extract)
            extract.push(levels.length - 1)
            const nodes = []
            let nId = 0

            extract.forEach((idx, layer)=>{
                const temp = levels[idx].clusters.filter(d=>d.length > 1)
                const set = temp.map(d=>d.map(d=>d.foreignId))
                for( const primIds of set){
                    const node ={
                        id: nId,
                        layer: layer,
                        primIds: [...primIds],
                        shortList: [...primIds]
                    }
                    if(layer === 0 ){
                        nodes.push( node )
                        nId++
                    }else{
                        const overlaps = nodes.filter(d=>(d.layer === layer - 1) && (d.primIds.filter(d=>primIds.includes(d)).length >0 ))
                        let addNode = true
                        if( overlaps.length > 0 ){
                            for(const findLast of overlaps){
                                //console.log(`Found in ${findLast.id}`)
                                if(findLast.primIds.length === primIds.length ){
                                    //  console.log(`-- no chnages`)
                                    findLast.layer = layer
                                    addNode = false
                                }else{
                                    node.children = node.children || []
                                    findLast.parent = node
                                    node.children.push( findLast )
                                    node.shortList = node.shortList.filter(d=>!findLast.primIds.includes(d))
                                }
                            }
                            if( addNode ){
                                if( node.children && node.children.length === 1 && node.shortList.length > 0 && node.shortList.length < 3){
                                    const child = node.children[0]
                                    child.layer = layer
                                    child.parent = undefined
                                    child.primIds = node.primIds
                                    child.shortList = child.shortList.concat( node.shortList ).filter((d,i,a)=>a.indexOf(d)===i)
                                }else{
                                    nodes.push( node )
                                    nId++
                                }
                            }
                        }else{
                            nodes.push( node )
                            nId++
                        }
                    }
                }
            })
            let clusters = nodes.reverse()
            if( clusters[0].shortList?.length > 0 ){
                const newNode = {
                    layer: clusters[0].layer - 1,
                    parent: clusters[0],
                    shortList: clusters[0].shortList
                }
                clusters[0].shortList = []
                clusters[0].children = clusters[0].children || [] 
                clusters[0].children.push(newNode)
                clusters.push(newNode)
            }

            let changed = false
            const primCount = clusters.map(d=>d.shortList.length).flat(2).reduce((a,c)=>a+c)
            console.log(`TOTAL PRIMS = ${primCount}`)
            do{
                changed = false
                const targets = clusters.filter(d=>!d.cleared && d.layer < (totalLevels - 1) && (!d.children || d.children.length === 0) &&d.shortList && d.shortList.length > 0 && d.shortList.length < (testSize/2))
                console.log(`Min size check - have ${targets.length}`)
                for( const target of targets){
                    if( !target.cleared && !target.parent.processed && target.parent.children){
                        target.parent.processed = true
                        //const subChildren = target.parent.children.map(d=>d.children ? d.children.length : 0).reduce((a,c)=>a+c,0)
                        //if(subChildren === 0)
                        {
                            for(const child of target.parent.children){
                                if( child.cleared ){
                                    throw "ERROR"
                                }
                                target.parent.shortList = (target.parent.shortList || []).concat(child.shortList)
                                target.parent.newChildren = (target.parent.newChildren || []).concat(child.children).filter(d=>d && !d?.cleared)
                                target.parent.newChildren.forEach(child=>{
                                    child.parent = target.parent
                                    child.layer++
                                })

                                child.cleared = true
                                console.log(`Extending ${target.parent.id} to ${target.parent.shortList.length}`)
                                changed = true
                            }
                            const thisCount = clusters.filter(d=>!d.cleared).map(d=>d.shortList.length).flat(2).reduce((a,c)=>a+c)
                            if( thisCount !== primCount ){
                                debugger
                            }
                            target.parent.children = target.parent.newChildren 
                        }
                    }
                }
            }while(changed)
            clusters = clusters.filter(d=>!d.cleared)


            for(const node of clusters ){
                node.primitives = node.shortList.map(id=>list.find(d=>d.id === id))
            }
            console.log(extract)

            for(let idx = 0; idx < extract.length; idx++){
                console.log(`L${idx} => ${nodes.filter(d=>d.layer === idx).length} ${levels[extract[idx]].clusters.filter(d=>d.length>1).length}`)
            }
            console.log(`TOTAL PRIMS = ${clusters.map(d=>d.shortList.length).flat(2).reduce((a,c)=>a+c)}`)
            
            let segmentBase
            if( target.type === "segment"  ){
                segmentBase = target                
                throw "NOT IMPLEMENTED - NEED TO WALK TO ROOT"
            }else{
                console.log(`Creating base segment with config`)
                const parts = action.field.split('.')
                const segmentTitle = parts.length === 1 ? parts : parts[parts.length - 1]
                
                segmentBase = await createPrimitive({
                    workspaceId: target.workspaceId,
                    parent: target.id,
                    paths: ['origin'],
                    data:{
                        type: "segment",
                        title: "Segmentation by " + segmentTitle,
                        referenceId: action.resultCategory,
                        referenceParameters:{
                            field: action.field,
                            resultCategory: action.resultCategory,
                            ...action.aiConfig?.[action.field]
                        }
                    }
                })

            }
            if( segmentBase ){
                
                const summarized = await summarizeClusters( clusters, segmentBase )
                
                const revert = summarized
                
                // convert clusters to segment objects
               /* const oldPrims = (await primitiveDescendents( target, "segment")).map((d)=>d.id)
                console.log(`Need to remove ${oldPrims.length} old segments`)
                
                for(const id of oldPrims){
                    console.log(`-- remove segment ${id}`)
                    await removePrimitiveById( id )
                }*/
                
                const convertList = async ( set, parent, root) => {
                    for( const node of set ){
                        //const node = revert[nodeId]
                        const newPrim = await createPrimitive({
                            workspaceId: target.workspaceId,
                            parent: parent.id,
                            paths: ['origin'],
                            data:{
                                type: "segment",
                                title: node.label ? node.label : node.summary,
                                referenceId: action.resultCategory,
                                referenceParameters:{
                                    root: root,
                                    short: node.short,
                                    description: node.summary,
                                }
                            }
                        })
                        if( newPrim ){
                            if( node.primitives ){
                                for(const primId of node.primitives){
                                    console.log(`adding ${primId.id}`)
                                    await addRelationship(newPrim.id, primId.id, "ref")
                                }
                            }
                            if( node.children ){
                                await convertList( node.children, newPrim, root?.id || newPrim?.id )
                            }
                        }
                        
                    }
                }
                console.log('Converting structure to segments')
                if( target.type === "segment"){
                    await convertList( revert[0].children, target)
                    // remove old links
                    for(const oldPrim of list){
                        await removeRelationship( target.id, oldPrim.id, 'ref')
                    }
                }else{
                    await convertList( revert[0].children, segmentBase)
                    //await convertList( [revert[0]], target)
                }
            }
            console.log('Converstion complete')
        }
    }
    console.log(`Rollup ${primitive.id} done`)
}

export default function QueueAI(){
    if (!instance) {
        instance = new AIQueueClass();
        instance.myInit();
    }
    return instance;
}

class AIQueueClass extends BaseQueue{
    constructor() {
        super('ai', undefined, 2)
    }


    async runPromptOnPrimitive(primitive, action){
        const workspaceId = primitive.workspaceId
        const field = `processing.run_prompt`
        const data = {id: primitive.id, action: action, mode: "run_prompt", field}

        await this.addJob(workspaceId, data)
    }
    async rebuildSummary(primitive, action, req){
        const workspaceId = primitive.workspaceId
        const field = `processing.rebuild_summary`
        const data = {id: primitive.id, action: action, mode: "rebuild_summary", field}

        await this.addJob(workspaceId, data)
    }
    async defineAxis(primitive, action, req){
        const workspaceId = primitive.workspaceId
        const field = `processing.define_axis`
        if(primitive.processing?.define_axis && (new Date() - new Date(primitive.processing.define_axis.started)) < (5 * 60 *1000) ){
            console.log(`Already active - exiting`)
            return false
        }
        const data = {id: primitive.id, action: action, mode: "define_axis", field}
        await this.addJob(workspaceId, data)
    }
    async rollUp(primitive, target, action, req){
            const field = `processing.rollup`
            const workspaceId = primitive.workspaceId
            if(primitive.processing?.rollup && (new Date() - new Date(primitive.processing.rollup.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            await this.addJob(workspaceId, {id: primitive.id, action: action, targetId: target.id, mode: action.alternate ? "rollup2" : "rollup", field: field})
    }
    async aggregateDuplicatedInSegment(primitive, action, req){
            const field = `processing.ai.aggregate_duplicated_in_segment`
            const workspaceId = primitive.workspaceId
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Looking for duplicates"})
            await this.addJob(workspaceId,  {id: primitive.id, action: action, mode: "aggregate_duplicated_in_segment", field: field})
    }

    async markCategories(primitive, target, action = {}, req){
        //if( primitive.type === "category"){
            const workspaceId = primitive.workspaceId
            const field = `processing.mark_categories`
            if(primitive.processing?.mark_categories && (new Date() - new Date(primitive.processing.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            //dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Assign to categories"})
            //dispatchControlUpdate(target.id, field , {status: "pending"})
            await this.addJob(workspaceId, {id: primitive.id, action: action, targetId: target.id, mode: "mark_categories", field: field})
        //}
    }
    async categorize(primitive, target, action, req){
        //if( primitive.type === "category"){
            const workspaceId = primitive.workspaceId
            const field = `processing.categorize`
            if(primitive.processing?.categorize && (new Date() - new Date(primitive.processing.categorize.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            //dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Looking for categories"})
            //dispatchControlUpdate(target.id, field , {status: "pending"})
            await this.addJob(workspaceId, {id: primitive.id, action: action, targetId: target.id, mode: "categorize", field: field})
        //}
        return true
    }
}

async function treeToCluster( tree, primitive){
    let id = 0
    let nodeCount = 0
    const lookup = {}
    const labelTree = (node, parent )=>{
        node.id = id
        if( parent){
            node.parent = parent            
        }
        lookup[node.id] = node
        id++
        if( node.isLeaf){
            nodeCount++
        }else{
            for(const c of node.children){
                labelTree(c, node)
            }
        }
    }
    const run = (targetH) => {
        let latch = false
        const nodes = {}
        const flattenTree = (node, parent, unpack)=>{

            if( unpack ){
                if(!nodes[parent]){
                    nodes[parent] = {primitives: [], id: parent}
                }
                if( node.isLeaf ){
                    //nodes[parent].primitives.push( node.primitiveId)
                    nodes[parent].primitives = nodes[parent].primitives.concat( node.primitiveIds)
                }else{
                    for(const c of node.children){
                        flattenTree(c, parent, true)
                    }
                }
            }else{
                if( node.height > targetH ){
                    for(const c of node.children){
                        flattenTree(c, undefined, false)
                    }
                }else{
                    if( node.isLeaf){
                        nodes[node.id] = {primitives: node.primitiveIds, id: node.id, wasLeaf: true}
                    }else{
                        for(const c of node.children){
                            flattenTree(c, node.id, true)
                        }
                    }
                }
            }
        }
        flattenTree(tree)
        return nodes
    }

    labelTree( tree )

    const alignTree = (minClusters)=>{

        let nodes
        let clusterCount
        let singletonClusters
        let nodeCount
        let layer1Heights = [...tree.children.map((d)=>d.height)].filter((d)=>d)
        let targetH
        if( layer1Heights.length > 0){
            targetH = layer1Heights.reduce((a,c)=>a+c,0) / layer1Heights.length
            let maxIter = 20
            do{
                nodes = run(targetH)
                clusterCount = Object.keys(nodes).length
                nodeCount = Object.values(nodes).map((d)=>d.length).reduce((a,c)=>a+c,0)

                singletonClusters = Object.values(nodes).filter((d)=>d.primitives && d.primitives.length === 1).length
                targetH *= 0.95
            }while( (maxIter-- > 0) && (clusterCount < minClusters ) && singletonClusters === 0 )
            if( singletonClusters > 0){
                console.log(`backing up`)
                targetH /= 0.95
                nodes = run(targetH)
                clusterCount = Object.keys(nodes).length

            }
        }
        console.log( `For target ${minClusters} got ${clusterCount} clusters at height ${targetH}`)
        return nodes
    }
    console.log(`Got ${nodeCount} total`)
    let targetCount = (nodeCount > 500 ? [0.02, 0.015, 0.01,0.0025, 0.0012] : [0.7, 0.3,  0.02]).map((d)=>Math.round(d * nodeCount))
    targetCount = targetCount.map((d)=>d < 3 ? 3 : d).filter((d,idx,a)=>a.indexOf(d)===idx)
    console.log(targetCount)

    const findRoutes = (node, targets, found = [], depth = 0)=>{
        if( targets.includes(node.id) ){
            found.push( node.id )
            return found
        }
        if( !node.isLeaf ){
            for( const c of node.children){
                found = findRoutes( c, targets, found, depth + 1)
            }                        
        }
        return found
    }

    //const leaves = Object.values(lookup).filter((d)=>d.isLeaf).reduce((a,c)=>{a[c.id]=c;return a},{})
    const leaves = Object.values(lookup).filter((d)=>d.isLeaf && d.primitiveIds.length > 1).map((d)=>d.id)

    let nodes = {}
    let lastNodes = nodeCount > 200 ? undefined : leaves
    if( lastNodes ){
        for(const k of lastNodes){
            const starting = lookup[k]
            nodes[k] = {primitives: starting.primitiveIds, id: k, wasLeaf: true}
        }
    }
    
    targetCount.forEach((target)=>{
        const newNodes = alignTree( target )
        if( newNodes ){
            if( lastNodes ){
                let targets = lastNodes
                for(const cid of Object.keys(newNodes)){
                    const node = lookup[cid]
                    if( node ){
                        const found = findRoutes(node, targets)
                        if( found.length > 0){
                            for(const tid of found){
                                if( tid !== newNodes[cid].id ){
                                    newNodes[cid].children = newNodes[cid].children || []
                                    newNodes[cid].children.push(tid)
                                    nodes[tid].parent = node.id
                                    if( newNodes[cid].primitives){
                                        const source = newNodes[cid].sparsePrimitives ? newNodes[cid].sparsePrimitives : newNodes[cid].primitives
                                        newNodes[cid].sparsePrimitives = source.filter((d)=>!nodes[tid].primitives.includes(d))
                                    }
                                }
                            }
                            targets = targets.filter((d)=>!found.includes(d))
                        }
                    }
                }
            }
            lastNodes = Object.keys(newNodes).map((d)=>parseInt(d))
            for(const k of Object.keys(newNodes)){
                nodes[k] = {...(nodes[k] || {}), ...newNodes[k]}
            }
        }
    })
    Object.values(nodes).forEach((node)=>{
        if( node.sparsePrimitives){
            node.primitives = node.sparsePrimitives
            delete node["sparsePrimitives"]
        }
    })
    
    nodes[0] = {
        id: 0,
        primitives:[],
        children: Object.values(nodes).filter((d)=>d.parent === undefined).map((d)=>d.id)
    }

    console.log(Object.values(nodes).map((d)=>d.sparsePrimitives ? d.sparsePrimitives.length : (d.primitives?.length  || 0)).reduce((a,c)=>a+c,0))
    console.log(nodeCount)

    return nodes

}
async function summarizeClusters( nodes, primitive ){
    let needSummary, lastNeed
    console.log(`Do summary...`)
    

    let mapP = (d)=>d.title
    if( primitive && primitive.referenceParameters?.field ){
        const field = primitive.referenceParameters?.field
        if( field.slice(0,6) === "param." ){
            const param = field.slice(6)
            mapP = (d)=>{
                let temp = d?.referenceParameters?.[param]
                    if( Array.isArray(temp) ){
                        temp = temp.join(", ")
                    }
                    return temp
            }
        }else{
            mapP = (d)=>d?.[field]
        }

    }

    do{
        lastNeed = needSummary?.length
        needSummary = Object.values(nodes).filter((d)=>!d.summary)
        if( needSummary.length > 0 && needSummary.length !== lastNeed){
            console.log(`${needSummary.length} nodes need a summary (${lastNeed})`)
            const toProcess = needSummary.filter((d)=>(d.primitives && !d.children) || (d.children && d.children.reduce((a, d)=>a && (d.summary ? true : false), true)))
            let idx = 0
            for(const node of toProcess){
                console.log(node.parent, node.primitives?.length)
                
                const items = node.primitives
                console.log(`Cluster ${idx} / ${toProcess.length} = ${node.id} : ${items?.length} items`)
                if( items && items.length > 0){
                    
                    const list = (await Primitive.find({_id: {$in: items}}))
                    
                    let titles = list.map((d)=>mapP(d))
                    
                    let summary = await summarizeMultiple( titles, {types: primitive.referenceParameters?.types ||  "problem statements", prompt: primitive.referenceParameters?.prompt ||  "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'", engine: "gpt4p"})
                    if( summary.success ){
                        node.summary = summary.summary
                    }
                }
                if( node.children && node.children.length > 0){
                    console.log(`Need to combine with others`)
                    const summaries = node.children.map((d)=>d.summary)
                    if( node.summary ){
                        summaries.push( node.summary )
                    }
                    const overall = await summarizeMultiple( summaries, {types: primitive.referenceParameters?.types ||   "problem statements", prompt: primitive.referenceParameters?.combinePrompt ?? primitive.referenceParameters?.prompt ??  "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'", engine: "gpt4p"})
                    if( overall.success ){
                        console.log(`GOT BACK SUMMARY OF SUMMARY`)
                        node.summary = overall.summary
                        

                    }


                }
                console.log(node.summary)
                idx++    
            }
        }
    }while(needSummary.length > 0 && needSummary.length !== lastNeed)
    
    // traverse back down
    const rewriteLabels = async ( node, path = [])=>{
        if( node.children && node.children.length > 1){
            const childLabels = node.children.map((d)=>d.summary )
            const currentLabel = node.short || node.summary
            const thisPath = [...path, currentLabel]

            console.log(`----- depth = ${thisPath.length}`)
            console.log( thisPath )
            console.log(childLabels)
            const rewrites = await simplifyHierarchy( thisPath, childLabels, {engine: "gpt4p"})
            console.log(rewrites)
            if( rewrites.success){
                for(const r of rewrites.summaries){
                    const childNode = node.children[ r.id ]
                    if( childNode ){
                            childNode.label = r.label
                            childNode.short = r.description
                        await rewriteLabels( childNode, thisPath )
                    }
                }
            }
            
        }
    }

    await rewriteLabels( nodes["0"])


    return nodes
}
export async function processQueue(job){
        console.log('AI QUEUE GOT JOB')
        const action = job.data.action
        console.log(action)
        const primitive = await Primitive.findOne({_id: job.data.id})
        console.log(action, primitive.id)
        if( primitive){
            if( job.data.mode === "run_prompt"){
                const config = await getConfig(primitive)
                //const [items, toSummarize] = await getDataForProcessing(primitive, {}, undefined, {config})
                const items = await getDataForImport( primitive, undefined, true)
                let data 
                if( items.length === 0 ){
                    data =["No data - just look at the prompt"]
                }else{
                    if( config.field === "context" || !config.field){
                        data = []
                        for(const d of items){
                            data.push( await buildContext(d))
                        }
                    }else{
                        if( config.field === "title"){
                            data = items.map(d=>d.title)
                        }else{
                            let field = config.field?.startsWith("param.") ? config.field.slice(6) : config.field
                            data = items.map(d=>decodePath(d.referenceParameters, field))
                        }
                    } 
                }
                let prompt = config.prompt

                if( prompt.match(/{.+}/)){
                    const primitiveInputs = await getPrimitiveInputs( primitive )
                    for(const inp of Object.keys(primitiveInputs)){
                        if( primitiveInputs[inp].data){
                            prompt = prompt.replaceAll(`{${inp}}`, primitiveInputs[inp].data)
                        }
                    }
                }

                let response
                
                if( config.local ){
                    response = {
                        success: true,
                        output: [prompt]
                    }
                    console.log(`Prompt evaluated locally`, prompt)
                }else{
                    response = await processPromptOnText( data, {
                        opener: "Here is some data i will give you instructions about",
                        prompt: prompt,
                        output: "Provide the result as a json object with an array called 'results' which has a string entry for each complete part of your answer",
                        engine: config.engine ?? "gpt4o"
                    })
                }
                if( response?.success && response.output){
                    dispatchControlUpdate( primitive.id, "referenceParameters.structured_summary", response.output)
                    dispatchControlUpdate( primitive.id, "referenceParameters.result", response.output.join("\n"))
                }else{
                    throw "Couldnt process prompt"
                }
            }
            if( job.data.mode === "rebuild_summary"){
                    const config = await getConfig(primitive)

                    const parent = await fetchPrimitive( primitiveOrigin( primitive ) )
                    const thisCategory = await Category.findOne({id: parent.referenceId})
                    let result
                    
                    if( thisCategory?.type === "comparator"){
                        if( config.compare_type == "streamline"){
                            console.log(`Need to re-run parent`)
                            await doPrimitiveAction(parent, "custom_query", {force: true})
                            done = true
                        }else{
                            const segment = (await primitiveParentsOfType(primitive, "segment"))?.[0]
                            if( segment ){
                                const parentForScope = (await primitiveParentsOfType(segment, ["working", "view", "segment", "query"]))?.[0] ?? segment
                                result = await comapreToPeers( parentForScope, segment, primitive, config)
                                if( typeof(result) === "object"){
                                    dispatchControlUpdate( primitive.id, "referenceParameters.structured_summary", result.structured)
                                    result = result.plain
                                }
                            }else{
                                console.log(`Couldnt get parent segment for ${primitive.id} / ${primitive.plainId} in compare_to_peers`)
                            }
                        }
                    }else if( thisCategory?.type === "one_shot_query"){
                        let result = await oneShotQuery( primitive, config)
                        console.log(result)
                        if( result ){
                            if( result.length > 1){
                                console.log(`GOT MULTIPLE - NOT HANDLED, DEFUALTING TO FIRST`)
                            }
                            result = result[0]
                            if( result){
                                dispatchControlUpdate( primitive.id, "referenceParameters.structured_summary", result.structured)
                                const linkIds = result.sourceIds ?? []
                                const existingLinks = primitive.primitives.source ?? []
                                const toRemove = existingLinks.filter(d=>!linkIds.includes(d))
                                const toAdd = linkIds.filter(d=>!existingLinks.includes(d))
                                
                                if( toRemove.length > 0 ){
                                    await removeRelationshipFromMultiple( primitive.id, toRemove, "source", primitive.workspaceId)
                                }
                                if( toAdd.length > 0 ){
                                    await addRelationshipToMultiple( primitive.id, toAdd, "source", primitive.workspaceId)
                                }
                                dispatchControlUpdate( primitive.id, "referenceParameters.summary", result.plain)
                                if( !hasMeaningfulContent(result.structured) ){
                                    dispatchControlUpdate( primitive.id, "referenceParameters.contentNotRelevant", true)
                                }
                                return
                            }
                        }
                    }else{
                        if( config.verify || config.structure){
                            try{

                                if( config.revised_query && config.revised_query.cache === config.prompt){
                                    logger.debug(`Using structure cache for rebuild_summary of ${primitive.id}`)
                                }else{
                                    const configParent = await getConfigParentForTerm(primitive, "prompt")
                                    if( configParent ){
                                        const revised = await reviseUserRequest(config.prompt, config)
                                        const toStore = {
                                            structure: revised,
                                            cache: config.prompt
                                        }
                                        await dispatchControlUpdate( configParent.id, "referenceParameters.revised_query", toStore)
                                        logger.debug(`Rebuilt structure cache for rebuild_summary of ${primitive.id}`)
                                    }
                                }

                                result = await summarizeWithQuery(primitive)
                                if( !result || result.error ){
                                    console.log(`========= RESTURNING ERROR ${result.error}`)
                                    return result
                                }else{
                                    if( result.length > 1){
                                        const primitiveParentId = primitiveOrigin(primitive)
                                        const segments = await findParentPrimitivesOfType(primitive, ["segment"])
                                        const segment = segments[0]
                                        console.log(segment)
                                        let created = false
                                        if( primitiveParentId && segment ){
                                            for(const section of result){
                                                const newData = {
                                                    workspaceId: primitive.workspaceId,
                                                    parent: primitiveParentId,
                                                    //paths: primitive.parentPrimitives[primitiveParentId].map(d=>d.replace(/^primitives./,"")),
                                                    paths: ['origin'],
                                                    data:{
                                                        type: primitive.type,
                                                        title: section.heading ?? "Summary",
                                                        referenceParameters: {
                                                            summary: section.plain,
                                                            structured_summary: section.structured
                                                        }
                                                    }
                                                }
                                                const newPrim = await createPrimitive( newData )
                                                if( newPrim ){
                                                    created = true
                                                    await addRelationship( segment.id, newPrim.id, "auto")
                                                    
                                                    if( section.sourceIds?.length > 0 ){
                                                        await addRelationshipToMultiple( newPrim.id, section.sourceIds, "source", primitive.workspaceId)
                                                    }
                                                }
                                            }
                                            if(created ){
                                                await removePrimitiveById(primitive.id)
                                            }
                                        }

                                        return

                                    }else{
                                        result = result[0]
                                        if( result){

                                            dispatchControlUpdate( primitive.id, "referenceParameters.structured_summary", result.structured)
                                            const linkIds = result.sourceIds ?? []
                                            const existingLinks = primitive.primitives.source ?? []
                                            const toRemove = existingLinks.filter(d=>!linkIds.includes(d))
                                            const toAdd = linkIds.filter(d=>!existingLinks.includes(d))
                                            
                                            if( toRemove.length > 0 ){
                                                await removeRelationshipFromMultiple( primitive.id, toRemove, "source", primitive.workspaceId)
                                            }
                                            if( toAdd.length > 0 ){
                                                await addRelationshipToMultiple( primitive.id, toAdd, "source", primitive.workspaceId)
                                            }
                                            dispatchControlUpdate( primitive.id, "referenceParameters.summary", result.plain)

                                            if( !hasMeaningfulContent(result.structured) ){
                                                dispatchControlUpdate( primitive.id, "referenceParameters.contentNotRelevant", true)
                                            }
                                            return
                                        }
                                    }
                                }

                            }catch(error){
                                console.log(`error in summarizeWithQuery call`)
                                console.log(error)
                                result = result?.plain
                            }
                        }else{
                            result = await doPrimitiveAction(primitive, "auto_summarize", {...config, action_override: true})
                        }
                    }
                    if( typeof(result) === "string"){
                        dispatchControlUpdate( primitive.id, "referenceParameters.summary", result)
                    }
            }
            if( job.data.mode === "define_axis" ){
                try{
                    await defineAxis( primitive, action )
                }catch(error){
                    console.log(`Error in aiQueue.defineAxis `)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "aggregate_duplicated_in_segment" ){
                try{
                    console.log(`----- STARTING DUPLICATAION CHECK -------`)
                    await aggregateDuplicatedInSegment( primitive, action )
                }catch(error){
                    console.log(`Error in aiQueue.aggregate_duplicated_in_segment `)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
            }
            if( job.data.mode === "rollup2" ){
                try{
                    const target = await Primitive.findOne({_id: job.data.targetId})
                    console.log(`----- STARTING ROLLUP -------`)
                    await rollup2( primitive, target, action )
                }catch(error){
                    console.log(`Error in aiQueue.rollup `)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
                dispatchControlUpdate(job.data.targetId, job.data.field , null)
            }
            if( job.data.mode === "rollup" ){
                try{
                    const target = await Primitive.findOne({_id: job.data.targetId})
                    console.log(`----- STARTING ROLLUP -------`)
                    await rollup( primitive, target, action )
                }catch(error){
                    console.log(`Error in aiQueue.rollup `)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
                dispatchControlUpdate(job.data.targetId, job.data.field , null)
            }
            if( job.data.mode === "mark_categories" || job.data.mode === "categorize" ){
                try{

                    const primitiveConfig = await getConfig(primitive)

                    const sources = await fetchPrimitives(job.data.targetId)
                    if( !sources.length === 0  ){
                        return
                    }
                    let scope = job.data.action.scope

                    if( primitiveConfig?.pivot){
                        const scopePrims = await fetchPrimitives( scope )
                        scope = []
                        for( const d of scopePrims){
                            const p = await primitiveListOrigin( [d], primitiveConfig.pivot, undefined, "ALL")
                            if( p ){
                                scope.push( p)
                            }
                        }
                        //scope = await multiPrimitiveAtOrginLevel( await fetchPrimitives( scope ), primitiveConfig.pivot, "ALL")
                        console.log(`Shifted scope by pivot to ${scope.length}`)
                        scope = scope.flat().map(d=>d.id)
                    }
                    let list = [], data = [], redoContext = false
                    for(const source of sources){
                        const action = job.data.action ?? {}
                        let configSource
                        if( job.data.action.scope ){
                            configSource = await getConfig(primitive)
                            if( configSource.field === "context"){

                                logger.debug(`Override context field for scope`)
                                configSource.field = "title"
                                redoContext = true
                            }
                        }
                        let [_list, _data] = await getDataForProcessing(primitive, action, source, {config: configSource})
                        console.log(`got ${list.length} / ${data.length} from ${source.id} - ${source.title}`)
                        list = list.concat(_list)
                        data = data.concat(_data)
                    }

                    if( job.data.action.scope ){
                        data = data.filter((d,i)=>scope.includes(list[i].id))
                        list = list.filter((d,i)=>scope.includes(d.id))
                        if( data.length !== list.length ){
                            throw "MISMATCH ON FILTER FOR SCOPE"
                        }
                        console.log(`Filtered to ${list.length} for scope`)
                        if( redoContext ){
                            data = []
                            const refIds = list.map(d=>d.referenceId)
                            const refCats = await Category.find({id: {$in: refIds}})
                            logger.debug(`Building context for ${list.length} items / ${refCats.length} categories`)
                            for(const d of list){
                                data.push(await buildContext(d, refCats.find(d2=>d2.id === d.referenceId)))
                            }
                        }
                    }
                    const targetCatIds = list.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i)
                    if( targetCatIds.length > 1){
                        console.log(`Multiple referenceIds - using first ${targetCatIds[0]}`)
                    }
                    const targetCatgeory = await Category.findOne({id: targetCatIds[0]})
                    let targetConfig
                    if( targetCatgeory ){
                        const parts = primitiveConfig?.field?.split(".") ?? ["title"]
                        const lastField = parts.pop()
                        targetConfig = targetCatgeory.ai?.categorize?.[lastField]
                    }


                    
                    if( list !== undefined && data.length > 0){
                        if( job.data.mode === "categorize" ){
                            try{
                                let catData
                                let itemType
                                if( targetCatgeory ){
                                    if( primitiveConfig?.field ){
                                        const field = primitiveConfig?.field?.match(/param\.(.+)/)?.[1]
                                        if( field && targetCatgeory.parameters[field] ){
                                            itemType = targetCatgeory.parameters[field].description
                                        }
                                    }else{
                                        itemType = targetCatgeory.title
                                    }
                                    console.log(`Type = ${itemType}`)
                                }
                                let literal = primitiveConfig?.literal
                                if( action.alternative){
                                    let types = itemType ?? primitiveConfig?.types ?? action.aiConfig?.[primitiveConfig?.field]?.types ??  "problem statement"
                                    const task = await primitiveTask( primitive)
                                    const theme = (primitiveConfig?.cat_theme && primitiveConfig?.cat_theme.trim().length > 0 ? primitiveConfig?.cat_theme : undefined ) ?? action?.theme ?? task?.referenceParameters?.topics
                                    const minClusters = primitiveConfig?.count || action.count || 8
                                    const result = await analyzeForClusterPhrases( data, {
                                        //type:primitiveConfig?.listType, 
                                        type: types,
                                        focus: primitiveConfig?.cat_theme,
                                        batch: 500,
                                        theme: theme,
                                        literal,
                                        minClusters,
                                        maxClusters: Math.round(minClusters * 1.2),
                                        debug_content: true,
                                        debug: true} )
                                    if( result.success ){
                                        const categories =  result.output.map(d=>({t: d.cluster_title}))
                                        catData = { 
                                            success: true,
                                            categories
                                        }
                                    }
                                }else{                            
                                    
                                    
                                    let types = itemType ?? targetConfig?.build?.type ?? primitiveConfig?.dataTypes ?? action.dataTypes
                                    let theme = primitiveConfig?.cat_theme ?? targetConfig?.build?.theme ?? action.theme
                                    
                                    catData = await buildCategories( data, {
                                        count: primitiveConfig?.count ,
                                        types: types, 
                                        themes: theme, 
                                        literal,
                                        batch: 500,
                                        engine:  primitiveConfig?.engine || action.engine,
                                        debug: true,
                                        debug_content: true}
                                        )
                                }
                                if( catData.success && catData.categories){
                                    console.log(catData.categories)
                                    if(job.data.action.textOnly){
                                        console.log(`Storing text only`)
                                        catData.categories = catData.categories.map(d=>({title:d.t, description:d.d}))
                                        await dispatchControlUpdate(primitive.id, "referenceParameters.categories", catData.categories)
                                    }else{

                                        for( const cat of catData.categories){
                                            await createPrimitive({
                                                workspaceId: primitive.workspaceId,
                                                parent: primitive.id,
                                                paths: ['origin'],
                                                data:{
                                                    type: "category",
                                                    referenceId: primitiveConfig?.resultCategory || action.resultCategory,
                                                    title: cat.t,
                                                    referenceParameters:{
                                                        description: cat.d
                                                    }
                                                }
                                                
                                            })
                                        }
                                    }
                                    console.log("Done")
                                }
                            }catch(error){
                                console.log(`Error in aiQueue.categorize `)
                                console.log(error)
                            }
                        }

                        if( job.data.mode === "mark_categories" ){
                            try{

                                let catOptions
                                const pCategory = await Category.findOne({id: primitive.referenceId})
                                
                                if( pCategory?.subCategories === "inherit" ){
                                    catOptions = []
                                    console.log(`Will inherit categories`)
                                    const parser = PrimitiveParser()
                                    const pp = new Proxy(primitive.primitives, parser)
                                    const sourceId = pp.params.source?.[0]
                                    if( sourceId ){
                                        const source = await Primitive.findOne({_id: sourceId})
                                        if( source ){
                                            console.log(source.plainId)
                                            catOptions = await primitiveChildren( source, "category")
                                            console.log(`Got ${catOptions.length} items from source`)
                                        }
                                    }

                                }else{
                                    catOptions = await primitiveChildren( primitive, "category")
                                }

                                const categoryList = catOptions.map((d)=>`${d.title}${d.referenceParameters?.description ? `: ${d.referenceParameters?.description}` : ""}`)
                                
                                console.log(`Removing existing mappings`)
                                const listIds = list.map(d=>d.id)
                                for(const category of catOptions){
                                    const pp = new Proxy(category.primitives ?? {}, parser)
                                    const toClear = pp.uniqueAllIds.filter(d=>listIds.includes(d))
                                    console.log(`Category ${category.title} -> ${toClear.length}`)
                                    await removeRelationshipFromMultiple( category.id, toClear, "ref", category.workspaceId)
                                    if( category.rationale ){
                                        const rationale = category.rationale
                                        for(const d of toClear){
                                            delete rationale[d]
                                        }
                                        category.rationale =rationale 
                                        dispatchControlUpdate(category.id, "rationale", rationale)
                                    }
                                }
                                console.log("done")

                                let categoryAlloc
                                let resultMap
                                if( pCategory?.mapMode === "evaluate" ){
                                    let opener = "Here is a list of items"
                                    let evaluation = primitiveConfig.evaluation
                                    let primitiveInputs
                                    let configParent
                                    console.log("!!!************!!!")

                                    async function _getConfigParent(){
                                        console.log(`--- > doing deferred configParent fetch`)
                                        if(!configParent){
                                            configParent = await getConfigParent( primitive)
                                        }
                                        return configParent
                                    }
                                    
                                    if( evaluation){
                                        const {text: _evaluation, inputs: _primitiveInputs} = await expandPrimitiveLiterals(_getConfigParent, primitiveConfig.evaluation)
                                        evaluation = _evaluation
                                        primitiveInputs = primitiveInputs
                                    }else{
                                        throw "Nothing to evaluate"
                                    }
                                    if( primitiveConfig.conditions){
                                        const {text: conditions, _primitiveInputs} = await expandPrimitiveLiterals(_getConfigParent, primitiveConfig.conditions, primitiveInputs)
                                        opener = `Here is some context about a task you will perform: ${conditions}.\n\nAnd here is the information for you to assess.`
                                    }
                                    const categoryLabels = pCategory?.mapMode === "distance" ? ["unclear", "current", "adjacent","middle","far"] : ["not at all", "possibly", "likely", "clearly"]
                                    const missing = categoryLabels.filter(d=>!catOptions.map(d=>d.title).includes(d))

                                    console.log(`Need to create ${missing.join(",")}`)
                                    for(const d of missing){
                                        const newCat = await createPrimitive({
                                            workspaceId: primitive.workspaceId,
                                            parent: primitive.id,
                                            data:{
                                                type: "category",
                                                title: d
                                            }
                                        })
                                        if( newCat ){
                                            catOptions.push(newCat)
                                        }
                                    }


                                    let runInBatch = (primitiveConfig?.field ?? action.field) !== "context"

                                    let prompt
                                    if( runInBatch ){
                                        prompt = `For each numbered item in turn - and using only the information provided for that item - undertake the following evaluation and assess the likelihood of it being true on the scale of ${categoryLabels.map(d=>`"${d}"`).join(", ")}: ${evaluation}`
                                    }else{
                                        prompt = `Using only the information provided, undertake the following evaluation and assess the likelihood of it being true on the scale of ${categoryLabels.map(d=>`"${d}"`).join(", ")}: ${evaluation}`
                                    }
                                
                                    console.log(evaluation)
                                    console.log(opener)
                                    console.log(prompt)
                                   // throw "done"

                                                                                    
                                    const raw_result = await processPromptOnText( data, {
                                        workspaceId: primitive.workspaceId,
                                        functionName:"categorize_evaluate",
                                        opener,
                                        output: runInBatch ? "Be very careful in your assessment. Provide the result as a json object called 'results' containing an array with each entry being a json object with a field called 'id' set to the number of the item assessed, a 'rationale' field with a 10 word explanation for your assessment, and a field called 'likelihood' set to your assessment for that item.  Do not include anything other than the json object in the response."
                                                            : `Provide the result as a json object called 'results' waith the following structure: 
                                                    {likelihood:<<your assessment for this item using the scale provided>>, rationale:<<10 word explanation for your assessment>>}`,
                                        field: "results",
                                        prompt,
                                        engine: primitiveConfig.engine ?? "gpt4p",
                                        debug: false,
                                        markup: "items",
                                        no_num: !runInBatch,
                                        debug_content: true,
                                        batch: runInBatch ? 50 : 1,
                                        progressCallback:(status)=>{
                                            dispatchControlUpdate(primitive.id, job.data.field + ".progress", status.completed / status.total , {track: primitive.id})
                                        }
                                        //batch: 1
                                    })
                                    const resultCache = catOptions.reduce((a,c)=>{a[c.title] = {ids: [], categoryId: c.id, rationale: c.rationale ?? {}}; return a}, {} )
                                    if( raw_result.success ){
                                        const result = runInBatch ? raw_result.output : raw_result.output.map((d,idx)=>({id: idx, ...d}))

                                        result.forEach((d)=>{
                                            if( !resultCache[d.likelihood] ){
                                                console.log(`no items for ${d.likelihood}`)
                                            }else{
                                                resultCache[d.likelihood].rationale[list[d.id]?.id] = d.rationale
                                            }
                                        })

                                        for(const d of result){
                                            if( d ){
                                                const item = list[d.id]
                                                if( item ){
                                                    let category = resultCache[d.likelihood]
                                                    if(!d.rationale){
                                                        console.log(`No rationale for ${item.id}`)
                                                        console.log(d)
                                                    }
                                                    if( !category ){
                                                        console.log(`WARN: couldnt align`, d)
                                                    }
                                                    if( item && category){
                                                        category.ids.push(item.id)
                                                    }
                                                }else{
                                                    logger.warn(`Couldnt find item in list for ${d.id}`, d)
                                                }
                                            }else{
                                                console.log(`Got empty result`)
                                            }
                                        }
                                    }
                                    for( const d of Object.keys(resultCache)){
                                        console.log(`Setting ${d} -> ${resultCache[d].ids.length} items`)
                                        await addRelationshipToMultiple(resultCache[d].categoryId, resultCache[d].ids, 'ref', primitive.workspaceId)
                                        if( primitiveConfig.rationale ){
                                            dispatchControlUpdate(resultCache[d].categoryId, "rationale", resultCache[d].rationale)
                                        }
                                    }
                                    return
                                }else{
                                console.log("here")
                                    const config = await getConfig(primitive)


                                    let types = targetConfig?.mark?.type
                                    let literal = config?.literal
                                    const complex = config?.complex ?? action.complex ?? false
                                    const theme = (config?.cat_theme && config?.cat_theme.trim().length > 0 ? config?.cat_theme : undefined ) ?? action?.theme 
                                    
                                    console.log(`Compexity = ${complex} (${config?.complex} / ${action.complex})`)

                                    let field = (config?.field ?? action.field) 
                                    let runInBatch = field !== "context" && field !== "full_content"

                                    categoryAlloc = await categorize(data, categoryList, {
                                        workspaceId: primitive.workspaceId,
                                        usageId: primitive.id,
                                        functionName: complex ? "categorize_complex" : "categorize_basic",
                                        matchPrompt:config?.matchPrompt, 
                                        evidencePrompt:config?.evidencePrompt, 
                                        engine:  config?.engine || action.engine,
                                        complex: complex,
                                        theme,
                                        literal,
                                        numerical : true,
                                        batch: runInBatch ? 50 : 1,
                                        no_num: !runInBatch,
                                        rationale: config?.rationale ?? action.rationale ?? false,
                                        types: types,
                                        debug: true,
                                        debug_content: true,
                                        progressCallback:(status)=>{
                                            dispatchControlUpdate(primitive.id, job.data.field + ".progress", status.completed / status.total , {track: primitive.id})
                                        }

                                    })
                                    
                                    let promiseList = []

                                    const categoryAllocations = {}

                                    const thresholdName = config?.thresholds ?? action.thresholds ?? "standard"
                                    let thresholds ={
                                        "standard": 2,
                                        "high": 3
                                    }[thresholdName]
                                   
                                    if( literal ){
                                        thresholds ={
                                            "standard": 3,
                                            "high": 4,
                                        }[thresholdName]}
                                    
                                    
                                    console.log(`Thresholds to keep >= ${thresholds}`)

                                    for(const entry of categoryAlloc){
                                        const prim = list[entry.id]
                                        if( prim ){
                                            console.log(`${list[entry.id].title} => ${entry.a?.map(d=>`${d.c} = ${d.s}`).join(", ")}`)
                                            if( entry.a){
                                                for(const align of entry.a){
                                                    let idx = align.c
                                                    
                                                    if( catOptions[idx] ){
                                                        //if( d === "Likely" || d === "Clear" || d === "Somewhat"){
                                                        const cId = catOptions[idx].id
                                                        categoryAllocations[cId] = categoryAllocations[cId] || {items:[], rationale: catOptions.find(d=>d.id === cId)?.rationale ?? {}, scores: {}}
                                                        categoryAllocations[cId].rationale[prim.id] = align.r
                                                        categoryAllocations[cId].scores[prim.id] = align.s

                                                        if( align.s >= thresholds ){
                                                            categoryAllocations[cId].items.push( prim.id )
                                                        }
                                                    }else{
                                                        console.log(`Error : Exceeded expected categories ${idx} for ${list[entry.id].title}`)
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    if( promiseList.length > 0 ){
                                        console.log(`last sync`)
                                        await Promise.all( promiseList )
                                    }
                                    for(const d of catOptions){
                                        const items = categoryAllocations[d.id]?.items
                                        if( items ){
                                            console.log( `${d.plainId} ${d.title} -> ${items ? items.length : 0}`)
                                            await addRelationshipToMultiple(d.id, items, "ref", d.workspaceId )
                                            if( primitiveConfig.rationale ){
                                                dispatchControlUpdate(d.id, "rationale", categoryAllocations[d.id].rationale)
                                            }
                                        }
                                    }
                                    dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
                                    if( !Array.isArray(job.data.targetId)){
                                        dispatchControlUpdate(job.data.targetId, job.data.field , null)
                                    }
                                    return
                                }

                                if( resultMap ){
                                    Object.keys(resultMap).forEach(i=>{
                                        const category = Object.keys(resultMap[i]).sort((a,b)=>resultMap[i][b] - resultMap[i][a])?.[0]
                                        if( resultMap[i][category] > 0 ){
                                            console.log(resultMap[i],category)
                                            categoryAlloc.push({
                                                id: i,
                                                category: category
                                            })
                                        }
                                    })
                                }
                                //console.log(categoryAlloc)
                                
                                if( Object.hasOwn(categoryAlloc, "success")){
                                    console.log("Error on mark_categories")
                                    console.log(categoryAlloc)
                                }else if(categoryAlloc){
                                    let promiseList = []
                                    for(const item of categoryAlloc){
                                        console.log(item)
                                        let cat
                                        if( typeof(item.category) === "number" || !isNaN(item.category)){
                                            cat = catOptions[ item.category ]
                                        }else{
                                            const newId = categoryList.findIndex((d)=>d.title === item.category)
                                            cat = catOptions[ newId ]
                                        }
                                        if( cat ){
                                         //   console.log(`${item.id} -> ${list[item.id].plainId} : ${cat.title}`)
                                            promiseList.push( addRelationship( cat._id.toString(), list[item.id]._id.toString(), "ref") )
                                        }else{
                                            console.log(`Couldnt find category '${item.category}' for ${item.id})`)
                                        }
                                        if( promiseList.length > 100 ){
                                            console.log(`Syncing promiss`)
                                            await Promise.all( promiseList )
                                            promiseList = []
                                        }
                                    }
                                    if( promiseList.length > 0 ){
                                        console.log(`last sync`)
                                        await Promise.all( promiseList )
                                    }
                                }
                            }catch(error){
                                console.log(`Error in aiQueue.mark_categories `)
                                console.log(error)
                            }
                        }
                    }
                }catch(error){
                    console.log(`Error in aiQueue`)
                    console.log(error)
                }
                dispatchControlUpdate(primitive.id, job.data.field , null, {track: primitive.id})
                if( !Array.isArray(job.data.targetId)){
                    dispatchControlUpdate(job.data.targetId, job.data.field , null)
                }
            }
    }
        
}