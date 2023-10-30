import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import { addRelationship, createPrimitive, dispatchControlUpdate, findPrimitiveOriginParent, getDataForProcessing, primitiveChildren, primitiveDescendents, primitivePrimitives, primitiveTask, removePrimitiveById, removeRelationship } from "./SharedFunctions";
import Primitive from "./model/Primitive";
import { analyzeListAgainstItems, analyzeListAgainstTopics, buildCategories, buildEmbeddings, categorize, consoldiateAxis, extractAxisFromDescriptionList, extractFeautures, processPromptOnText, simplifyHierarchy, summarizeMultiple } from "./openai_helper";
import Embedding from "./model/Embedding";
import { Cluster, agnes } from "ml-hclust";
import DBSCAN from "@cdxoo/dbscan";
import Category from "./model/Category";
import PrimitiveParser from "./PrimitivesParser";
import { buildDocumentEmbedding, ensureDocumentEmbeddingsExist, fetchDocumentEmbeddings, getDocumentAsPlainText } from "./google_helper";
import DocumentSearch, { checkForIndex, indexDocument, searchFiles } from "./DocumentSearch";
import agglo from "agglo";
import { distance } from "agglo/lib/metrics";


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


  function cosineSimilarity(vectorA, vectorB) {
    // Calculate dot product
    const dotProduct = vectorA.reduce((acc, val, index) => acc + val * vectorB[index], 0);
  
    // Calculate magnitudes
    const magnitudeA = Math.sqrt(vectorA.reduce((acc, val) => acc + val * val, 0));
    const magnitudeB = Math.sqrt(vectorB.reduce((acc, val) => acc + val * val, 0));
  
    // Avoid division by zero
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
  
    // Calculate cosine similarity
    const similarity = dotProduct / (magnitudeA * magnitudeB);
  
    return similarity;
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
    let axis = primitive.axis
    const [list, data] = await getDataForProcessing(primitive, action)
    if( true || !axis || axis.length === 0){

        console.log(`Fetching suggested axis`)

        const result = await extractAxisFromDescriptionList( data, {type: action.type} )
        //const result = {success: true, output: axis}

        if( result.success ){
            await dispatchControlUpdate(primitive.id, `axis`, result.output)
            axis = result.output

            const passCheck = axis.map((d)=>d._pass || 0).filter((d,i,a)=>a.indexOf(d)===i)
            if( passCheck.length > 1){
                let newAxis
                console.log(`NEED TO CONSOLIDATE AXIS`)
                const forConsolidation = axis.map((d,idx)=>{return {id: idx, title: d.title, values: d.values.map((d2)=>d2.value)}})
                if( forConsolidation ){

                    console.log( forConsolidation )
                    const result = await consoldiateAxis( JSON.stringify(forConsolidation), {debug:true, debug_content: true})
                    console.log(result.success)
                    console.log(result.output)
                    if( result.success ){
                        newAxis = result.output.map((d)=>{
                            console.log(`Combing ${d.original.join(", ")}`)
                            const originalAxis = d.original.map((idx)=>axis[idx].values).flat()
                            const out = {
                                title: d.title,
                                values: d.values.map((v)=>{
                                    const ids = originalAxis.map((d)=>{
                                        let originalValues = [v.value]
                                        if( v.o && v.o.length > 0 ){
                                            originalValues = v.o
                                        }
                                        const match = originalValues.includes(d.value)
                                        if( match){
                                            d.matched = true
                                            return d.ids
                                        }
                                    }).flat().filter((d)=>d)
                                    return {
                                        value: v.v,
                                        ids: ids
                                    }
                                })
                            }
                            const unmatched = originalAxis.filter((d)=>!d.matched)
                            if( unmatched.length > 0){
                                console.log(`couldnt match ${unmatched.length} entries`)
                                console.log(unmatched)
                            }
                            console.log(out)
                            return out
                        })
                        console.log(newAxis)
                    }
                    if( newAxis ){
                        axis = newAxis
                        console.log(`Finished consolidating`)
                        await dispatchControlUpdate(primitive.id, `axis`, axis)
                    }
                    else{
                        console.log(`Error consolidating`)
                        return
                    }
                }
            }
        }
    }
    if( axis ){
        for( const a of axis ){
            if( a.title && a.values && a.values.length ){
                const newPrim = await createPrimitive({
                    workspaceId: primitive.workspaceId,
                    parent: primitive.id,
                    data:{
                        type: "category",
                        title: a.title,
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
                                title: v.value,
                            }
                        })
                        if( valuePrim ){
                            for( const s of v.ids){
                                const segment = list[s]
                                await addRelationship( valuePrim.id, segment.id, 'ref')
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

async function rollup( primitive, target, action ){
    console.log(`Rollup ${primitive.id} starting`)
    let list, data
    let redo = []

    if( ["param.aggregateFeatures","param.technology","param.offerings","param.customers"].includes(action.field) ){
        [list, data] = await getDataForProcessing(primitive, {...action, referenceId: target.referenceParameters?.referenceId, constrainId: target.referenceParameters?.constrainId, field: "param.description"})
        console.log(`-- back ${list.length} / ${data.length}`)
        let idx = 0
        while(idx < list.length){
            console.log(`Extracting capabilities in batches of 50 - ${idx}`)
            const field  = action.field.split(".").slice(-1)
            
            const tempList = list.slice(idx, idx+50).filter((d)=>d.referenceParameters?.[field] === undefined || d.referenceParameters?.[field] === null)
            if( tempList.length > 0){
                const featureList = await extractFeautures( tempList.map((d)=>d.referenceParameters.description.replaceAll(/\n|\r/g,". ")), {engine:"gpt4", debug:true, debug_content: true})
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
            let embeddings = await Embedding.find({foreignId: {$in: list.map((d)=>d.id)}, type: action.field})
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
                        type: action.field,
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

    if( instance ){
        return instance
    }
    
    instance = new Queue("aiQueue", {
        connection: { 
            host: process.env.QUEUES_REDIS_HOST, 
            port: process.env.QUEUES_REDIS_PORT,
            maxStalledCount: 0,
            stalledInterval:300000


        },
    });
    instance.myInit = async ()=>{
        console.log("AI Queue")
        const jobCount = await instance.count();
        console.log( jobCount + " jobs in queue (AI)")
        await instance.obliterate({ force: true });
        const newJobCount = await instance.count();
        console.log( newJobCount + " jobs in queue (AI)")
    }
    instance.defineAxis = (primitive, action, req)=>{
        //if( primitive.type === "segment" || primitive.type === "activity"){
            const field = `processing.ai.define_axis`
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Analyzing for axis"})
            instance.add(`axis_${primitive.id}` , {id: primitive.id, action: action, mode: "define_axis", field: field})
        //}
    }
    instance.rollUp = (primitive, target, action, req)=>{
            const field = `processing.ai.rollup`
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Building clusters"})
            dispatchControlUpdate(target.id, field , {status: "pending"})
            instance.add(`rollup_${primitive.id}` , {id: primitive.id, action: action, targetId: target.id, mode: "rollup", field: field})
    }
    instance.aggregateDuplicatedInSegment = (primitive, action, req)=>{
            const field = `processing.ai.aggregate_duplicated_in_segment`
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Looking for duplicates"})
            instance.add(`aggregate_duplicated_in_segment${primitive.id}` , {id: primitive.id, action: action, mode: "aggregate_duplicated_in_segment", field: field})
    }

    instance.markCategories = (primitive, target, action, req)=>{
        if( primitive.type === "category"){
            const field = `processing.ai.mark_categories`
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Assign to categories"})
            dispatchControlUpdate(target.id, field , {status: "pending"})
            instance.add(`mark_${primitive.id}` , {id: primitive.id, action: action, targetId: target.id, mode: "mark_categories", field: field})
        }
    }
    instance.categorize = (primitive, target, action, req)=>{
        if( primitive.type === "category"){
            const field = `processing.ai.categorize`
            if(primitive.processing?.ai?.categorize && (new Date() - new Date(primitive.processing.ai.categorize.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Looking for categories"})
            dispatchControlUpdate(target.id, field , {status: "pending"})
            instance.add(`mark_${primitive.id}` , {id: primitive.id, action: action, targetId: target.id, mode: "categorize", field: field})
        }
        return true
    }
    
    new Worker('aiQueue', async job => {
//"gpt4"
        console.log('AI QUEUE GOT JOB')
        const action = job.data.action
        const primitive = await Primitive.findOne({_id: job.data.id})
        if( primitive){
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
                    
                    const source = await Primitive.findOne({_id: job.data.targetId})
                    const [list, data] = await getDataForProcessing(primitive, job.data.action, source)
                    
                    console.log(`got ${list.length} / ${data.length} from ${source.id} - ${source.title}`)
                    if( list !== undefined && data.length > 0){
                        if( job.data.mode === "categorize" ){
                            try{

                                const catData = await buildCategories( data, {count: primitive.referenceParameters?.count || action.count || 8, types: primitive.referenceParameters?.dataTypes || action.dataTypes, themes: primitive.referenceParameters?.theme || action.theme, engine:  primitive.referenceParameters?.engine || action.engine} )
                                if( catData.success && catData.categories){
                                    console.log(catData.categories)
                                    for( const title of catData.categories){
                                        await createPrimitive({
                                            workspaceId: primitive.workspaceId,
                                            parent: primitive.id,
                                            paths: ['origin'],
                                            data:{
                                                type: "category",
                                                referenceId: primitive.referenceParameters?.resultCategory || action.resultCategory,
                                                title: title
                                            }
                                            
                                        })
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

                                const categoryList = catOptions.map((d)=>d.title)
                                const categoryIds = catOptions.map((d)=>d._id.toString())
                                
                                for( const item of list ){
                                    if( item.parentPrimitives ){
                                        const parents = Object.keys(item.parentPrimitives ).filter((d)=>categoryIds.includes(d) )
                                        if( parents.length > 0){
                                            for( const parent of parents){
                                                for( const path of item.parentPrimitives[parent]){
                                                    await removeRelationship( parent, item._id.toString(), path )
                                                }
                                            }
                                        }
                                    }
                                }
                                const scoreMap = {
                                    "strongly": 4, 
                                    "clearly": 3,
                                    "somewhat": 2, 
                                    "hardly": 1, 
                                    "not at all": 0}
                                let categoryAlloc
                                let resultMap
                                if( pCategory?.mapMode === "content" ){
                                    const search = []
                                    const toProcess = list//.slice(0,10)

                                    const missing = toProcess.filter(d=>!d.indexReady)
//                                    const missing = await DocumentSearch().checkForIndex(ids, primitive.workspaceId)
                                    console.log(`${missing.length} to add to index first`)
                                    let left = missing.length
                                    for(const d of missing ){
                                        const id = d._id.toString()
                                        let mark = true
                                        console.log(`indexing ${left--}`)
                                        const text = (await getDocumentAsPlainText(id))?.plain
                                        if( text && text.length > 0){
                                            mark = await DocumentSearch().indexDocument(id, text ?? "", primitive.workspaceId)
                                        }
                                        if( mark ){
                                            await Primitive.updateOne({_id: id},{$set:{indexReady: true}})
                                        }
                                    }

                                    for(const category of catOptions){
                                        const result = await DocumentSearch().searchFiles(category.title, primitive.workspaceId)
                                        console.log(category.title, result)
                                        if( result ){
                                            for(const id of result){
                                                await addRelationship( category._id.toString(), id, "ref")
                                            }
                                        }
                                    }
                                    categoryAlloc = false

                                }else if( pCategory?.mapMode === "children" ){
                                    categoryAlloc = []
                                    resultMap = {}
                                    //const thisData = data//[data[71]]//.slice(-1)
                                    const [list, thisData] = await getDataForProcessing(primitive, {...job.data.action, field: 'param.aggregateFeatures'}, source)
                                    console.log(`MAP BY CHILDREN`)
                                    let catId = 0
                                    
                                    for(const category of catOptions){
                                        const title = categoryList[catId]
                                        console.log(`Checking for ${category.plainId} - ${title}`)
                                        const directs = await primitivePrimitives(category, "ref", "evidence")
                                        const directLength = directs.length
                                        console.log(`-- have ${directs.length} children`)
                                        
                                        let itemId = 0
                                        for(const d of thisData){
                                            console.log(`Test ${itemId} [${list[itemId].plainId}] - ${d.slice(0,12)}....`)
                                            
                                            let result = await analyzeListAgainstItems( directs.map((d)=>d.title), d, {
                                                type:"Jobs to be Done statement",
                                                engine:  primitive.referenceParameters?.engine || action.engine,
                                                prompt2: `For each Job to be done in the list, determine if it applies to the company in the overview, if it applies to customers of the company as stated in overview, or if it is not applicable to the company or the customers of the company as stated in the overview, and if the job to be done is solved by the company based on what is stated in the overview.`,
                                                response: `Provide the result as a json object with an array called 'result' which contains an object with the following fields: an 'i' field containing the number of the Jobs to be done, a boolean 'internal' indicating if it applies to the company, a 'customer' field indicating if applies to the stated customers of the company, a 'neither' field indicating if it is applicable to neither, a 'solved' field indicating if the company solves the job to be done, and a 'reason' field explaining your rationale in 10 words or less.`,
                                                postfix: "END OF LIST",
                                                asScore: true,
                                                // engine: 'gpt4',
                                                debug: true, debug_content: true
                                            } )
                                            
                                            if( result.success && result.output){
                                                console.log(result.output)
                                                const filtered = result.output.filter(d=>d.solved && d.customer && !d.internal)
                                                const both = result.output.filter(d=>d.solved && d.customer && d.internal)
                                                const passed = filtered.length
                                                console.log(`met ${filtered.length} (vs ${both.length}) vs ${directLength}`)
                                                const threshold = directLength > 3 ? directLength / 2 : 0
                                                if( passed > threshold ){
                                                    resultMap[itemId] = resultMap[itemId] || {}
                                                    resultMap[itemId][catId] = resultMap[itemId][catId] || []
                                                    
                                                    resultMap[itemId][catId] = filtered.map(d=>{
                                                        if( directs[d.i] === undefined || directs[d.i]?.title === undefined){
                                                            console.log(`GOT NULL`)
                                                            return undefined
                                                        }
                                                        return directs[d.i]?.title
                                                    }).filter(d=>d)

                                                }
                                            }
                                            itemId++
                                        }
                                        catId++
                                    }
                                    //resultMap = {}
                                    
                                    console.log(resultMap)
                                    //throw "STOP"
                                    const remapped = {}
                                    for( const dataId of Object.keys(resultMap)){
                                        const remap = Object.keys(resultMap[dataId]).map((catId)=>{
                                            return resultMap[dataId][catId].map(d=>{return {title: d, catId: catId}}).filter(d=>d.title)
                                        }).flat()
                                        
                                        
                                        let result = await analyzeListAgainstItems( remap.map((d)=>d.title), thisData[dataId], {
                                            type:"Jobs to be Done statement",
                                            engine:  primitive.referenceParameters?.engine || action.engine,
                                            prompt2: `Assess which Job to Done from the list is most directly addressed by the offering`,
                                            response: `Provide the result as a json object with an array called 'result' which contains an object with the following fields: an 'i' field containing the number of the selected Job to be Done,  a 'user' field set to the end user, a boolean 'direct' field set to true if the stated user of the selected Job to be Done is a direct end customer of the offering - or set to false if the offering would be most likely used by a third party to deliver value indirectly, and a 'reason' field with a explanation of your rationale in no more than 6 words`,
                                            asScore: true,
                                             engine: 'gpt4',
                                            debug: true, debug_content: true
                                        } )
                                        console.log(result.output)
                                        if(result.success && result.output){
                                            const winner = result.output[0]
                                            if(winner){
                                                const category = remap[winner.i]
                                                if( category ){
                                                    console.log(`${dataId} - > ${winner.i} / ${category.catId} = ${winner.direct}`)
                                                    if(winner.direct){
                                                        remapped[dataId] = {[category.catId]: 5}
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    resultMap = remapped
                                    console.log(resultMap)
                                }
                                else if( primitive.referenceParameters?.categorizeByTopic ){
                                    categoryAlloc = []
                                    resultMap = {}
                                    let catId = 0
                                    for(const category of categoryList){
                                        console.log(`Checking for ${category}`)
                                        let result = await analyzeListAgainstTopics( data, category, {
                                            type:"description",
                                            engine:  primitive.referenceParameters?.engine || action.engine,
                                            prompt: `Assess how strongly the description addresses ${category}. Use one of the following assessments: "strongly", "clearly","somewhat", "hardly", "not at all" as your response`,
                                            debug: true, debug_content: false
                                        } )
                                        if( result.success && result.output){
                                            result.output.forEach(d=>{
                                                const score = scoreMap[d.s] ?? 0
                                                resultMap[d.i] = resultMap[d.i] || {}
                                                //resultMap[d.i][category] = score
                                                resultMap[d.i][catId] = score > 3 ? score : 0
                                            })
                                        }
                                        catId++
                                    }
                                }else{
                                    categoryAlloc = await categorize(data, categoryList, {
                                        matchPrompt:primitive.referenceParameters?.matchPrompt, 
                                        evidencePrompt:primitive.referenceParameters?.evidencePrompt, 
                                        engine:  primitive.referenceParameters?.engine || action.engine,
                                        debug: true
                                    })
                                }

                                if( resultMap ){

                                    console.log(resultMap)
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
                                    for(const item of categoryAlloc){
                                        let cat
                                        if( typeof(item.category === "number")){
                                            cat = catOptions[ item.category ]
                                        }else{
                                            const newId = categoryList.findIndex((d)=>d.title === item.category)
                                            cat = catOptions[ newId ]
                                        }
                                        if( cat ){
                                         //   console.log(`${item.id} -> ${list[item.id].plainId} : ${cat.title}`)
                                            await addRelationship( cat._id.toString(), list[item.id]._id.toString(), "ref")
                                        }else{
                                            console.log(`Couldnt find category '${item.category}' for ${item.id})`)
                                        }
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
                dispatchControlUpdate(job.data.targetId, job.data.field , null)
            }
        }
        
    },
    {
        connection: { 
            host: process.env.QUEUES_REDIS_HOST, 
            port: process.env.QUEUES_REDIS_PORT 
        }
    });
    return instance
    
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
                    
                    let summary = await summarizeMultiple( titles, {types: primitive.referenceParameters?.types ||  "problem statements", prompt: primitive.referenceParameters?.prompt ||  "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'", engine: "gpt4"})
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
                    const overall = await summarizeMultiple( summaries, {types: primitive.referenceParameters?.types ||   "problem statements", prompt: primitive.referenceParameters?.combinePrompt ?? primitive.referenceParameters?.prompt ??  "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'", engine: "gpt4"})
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
            const rewrites = await simplifyHierarchy( thisPath, childLabels, {engine: "gpt4"})
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