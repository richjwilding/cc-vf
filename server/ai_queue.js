import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import { addRelationship, createPrimitive, dispatchControlUpdate, findPrimitiveOriginParent, getDataForProcessing, primitiveChildren, primitiveDescendents, primitivePrimitives, primitiveTask, removePrimitiveById, removeRelationship } from "./SharedFunctions";
import Primitive from "./model/Primitive";
import { buildCategories, buildEmbeddings, categorize, consoldiateAxis, extractAxisFromDescriptionList, extractFeautures, processPromptOnText, simplifyHierarchy, summarizeMultiple } from "./openai_helper";
import Embedding from "./model/Embedding";
import { Cluster, agnes } from "ml-hclust";
import DBSCAN from "@cdxoo/dbscan";


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
        const oldPrims = (await primitiveDescendents( primitive, "category")).map((d)=>d.id)
        console.log(`Need to remove ${oldPrims.length} old categories`)

        for(const id of oldPrims){
            await removePrimitiveById( id )
        }

       /* for( const segment of list ){
            const descriptionList = []
            const nodes = [segment, await primitiveDescendents( segment, "segment")].flat()
            for( const subseg of nodes ){
                const leaves = await  primitivePrimitives(subseg, 'ref'  )
                for( const leaf of leaves ){
                    descriptionList.push( (leaf.referenceParameters?.description || leaf.title).replaceAll(/\n|\r/g,"") )
                }
            }
            console.log(`for ${segment.id} got ${descriptionList.length}`)
            const insights = await processPromptOnText( descriptionList.join('\n'), {
                prompt: "Extract the 3 most significant problems referred to in the descriptions.  Do not create problems that are not mentioned in the descriptions and do not mention specific companies  or specific regions, countries or geographies", 
                type: "list of company descriptions", 
                output: `Provide the result as a json object  with an array called results. Each entry in the array must have a "problem" field containing the problem you identify . If there is are no problems then set the results field to an empty array`,
                engine: 'gpt4',
                extractNoun: "problem", 
                debug: true, 
                debug_content: true} )
            console.log(insights.output)
            
            if( insights.success){
                await dispatchControlUpdate(segment.id, `insights`, insights.output)
            }
        }*/


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

async function rollup( primitive, target, action ){
    let list, data

    if( ["param.aggregateFeatures","param.capabilities","param.offerings","param.customers"].includes(action.field) ){
        [list, data] = await getDataForProcessing(primitive, {...action, field: "param.description"})
        console.log(`-- back ${list.length} / ${data.length}`)
        console.log(list?.[0])
        let idx = 0
        while(idx < list.length){
            console.log(`Extracting capabilities in batches of 50 - ${idx}`)
            
            const tempList = list.slice(idx, idx+50).filter((d)=>d.referenceParameters?.capabilities === undefined)
            if( tempList.length > 0){
                const featureList = await extractFeautures( tempList.map((d)=>d.referenceParameters.description.replaceAll(/\n|\r/g,". ")))
                if( featureList.success && featureList.output.length === tempList.length ){
                    for(const result of featureList.output){
                        const p = tempList[ result.id ]
                        const agg = []
                        for( const field of ["capabilities", "offerings","customers"]){
                            let res = result[field]
                            if( res && res !== "NONE" ){
                                if( Array.isArray(res) ){
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
        [list, data] = await getDataForProcessing(primitive, action )

    }else{
        [list, data] = await getDataForProcessing(primitive, action)
    }
    
    if(data){
        if( data.length !== list.length){
            console.log(`Mismatch on data vs list size`)
        }else{
            let revert //=  target.clusters
            if( !revert ){
                let embeddings = await Embedding.find({foreignId: {$in: list.map((d)=>d.id)}, type: action.field})
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

                let epsilon
                let clusterCount
                let clusterSet
                let iter = 200
                let theta = 1.12
                let maxClusterSize = toProcess.length * 0.2

                const targetClusters = toProcess.length > 1000 ? toProcess.length / 5 : toProcess.length > 200 ? toProcess.length / 3 : toProcess.length / 8
               
                
                do{
                    epsilon = epsilon ? epsilon * theta : 0.01
                    clusterSet = DBSCAN({
                        dataset: toProcess,
                        epsilon: epsilon,
                        distanceFunction: euclideanDistance
                    });
                    const thisCount = clusterSet.clusters?.length
                    const counts = clusterSet.clusters.map((d)=>d.length)
                    const maxCount = Math.max(...counts)
                    console.log('clusters = ', thisCount, clusterSet.noise?.length, targetClusters, maxCount, epsilon)
                    if( thisCount < (clusterCount * 0.75) || maxCount > maxClusterSize){
                        console.log(`backup`)
                        epsilon = epsilon / theta / theta
                        iter = 1
                    }
                    clusterCount = thisCount 
                }while( clusterCount < targetClusters && (iter--) > 0 )
                

                const newSet = [...clusterSet.clusters,...clusterSet.noise.map((d)=>[d])]
                const newProcess = newSet.map((set)=>calculateCentroid(set.map((d)=>toProcess[d])))


                const tree = agnes(newProcess, {
                    method: 'ward2',
                });

                const flattenTree = (node)=>{
                    if( node.isLeaf ){
                        //node.primitiveId = list[node.index].id
                        const set = newSet[node.index]
                        const pIds = set.map((d)=>list[d].id).flat()
                        node.primitiveIds = pIds
                        console.log(pIds)
                    }else{
                        for(const c of node.children){
                            flattenTree(c)
                        }
                    }
                }
                flattenTree(tree)

                const clusters = await treeToCluster( tree, target )

                let configTask = target.type === "segment" ? await findPrimitiveOriginParent( target, "view" ) : target
                if( configTask !== target ){
                    console.log(`USING CONFIG FROM ${configTask.plainId}`)

                }

                const summarized = await summarizeClusters( clusters, configTask )

                //await dispatchControlUpdate(target.id, "clusters", summarized )
                revert = summarized
            }
            // convert clusters to segment objects
            const oldPrims = (await primitiveDescendents( target, "segment")).map((d)=>d.id)
            console.log(`Need to remove ${oldPrims.length} old segments`)

            for(const id of oldPrims){
                await removePrimitiveById( id )
            }

            const convertList = async ( set, parent, root) => {
                for( const nodeId of set ){
                    const node = revert[nodeId]
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
                                await addRelationship(newPrim.id, primId, "ref")
                            }
                        }
                        if( node.children ){
                            await convertList( node.children, newPrim, root || newPrim )
                        }
                    }

                }
            }
            if( target.type === "segment"){
                await convertList( revert[0].children, target)
                // remove old links
                for(const oldPrim of list){
                    await removeRelationship( target.id, oldPrim.id, 'ref')
                }
            }else{
                await convertList( [0], target)
            }
        }
    }
}

export default function QueueAI(){

    if( instance ){
        return instance
    }
    
    instance = new Queue("aiQueue", {
        connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT },
    });
    instance.defineAxis = (primitive, action, req)=>{
        if( primitive.type === "segment" || primitive.type === "activity"){
            const field = `processing.ai.define_axis`
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Analyzing for axis"})
            instance.add(`mark_${primitive.id}` , {id: primitive.id, action: action, mode: "define_axis", field: field})
        }
    }
    instance.rollUp = (primitive, target, action, req)=>{
            const field = `processing.ai.rollup`
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Building clusters"})
            dispatchControlUpdate(target.id, field , {status: "pending"})
            instance.add(`mark_${primitive.id}` , {id: primitive.id, action: action, targetId: target.id, mode: "rollup", field: field})
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
            if( job.data.mode === "rollup" ){
                try{
                    const target = await Primitive.findOne({_id: job.data.targetId})
                    await rollup( primitive, target, action )
                    //console.log("---- SKIP")
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

                                const catOptions = await primitiveChildren( primitive, "category")
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
                                
                                const categoryAlloc = await categorize(data, categoryList, {engine:  primitive.referenceParameters?.engine || action.engine})
                                //console.log(categoryAlloc)
                                
                                if( Object.hasOwn(categoryAlloc, "success")){
                                    console.log("Error on mark_categories")
                                    console.log(categoryAlloc)
                                }else{
                                    for(const item of categoryAlloc){
                                        let cat
                                        if( typeof(item.category === "number")){
                                            cat = catOptions[ item.category ]
                                        }else{
                                            const newId = categoryList.findIndex((d)=>d.title === item.category)
                                          //  console.log(`   => ${item.category} > ${newId}`)
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
    {connection: { host: process.env.QUEUES_REDIS_HOST, port: process.env.QUEUES_REDIS_PORT }});
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
            const toProcess = needSummary.filter((d)=>!d.children || d.children.reduce((a, d)=>a && (nodes[d].summary ? true : false), true))
            let idx = 0
            for(const node of toProcess){
                console.log(node.parent, node.primitives?.length)
                
                const items = node.primitives
                console.log(`Cluster ${idx} / ${toProcess.length} = ${node.id} : ${items?.length} items`)
                if( items.length > 0){
                    
                    const list = (await Primitive.find({_id: {$in: items}}))
                    
                    let titles = list.map((d)=>mapP(d))
                    
                    let summary = await summarizeMultiple( titles, {types: primitive.referenceParameters?.types ||  "problem statements", prompt: primitive.referenceParameters?.prompt ||  "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'", engine: "gpt4"})
                    if( summary.success ){
                        node.summary = summary.summary
                    }
                }
                if( node.children && node.children.length > 0){
                    console.log(`Need to combine with others`)
                    const summaries = node.children.map((d)=>nodes[d].summary)
                    if( node.summary ){
                        summaries.push( node.summary )
                    }
                    const overall = await summarizeMultiple( summaries, {types: primitive.referenceParameters?.types ||   "problem statements", prompt: primitive.referenceParameters?.prompt ||  "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'", engine: "gpt4"})
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
        if( node.children ){
            const childLabels = node.children.map((d)=>nodes[d].summary )
            const currentLabel = node.short || node.summary
            const thisPath = [...path, currentLabel]

            console.log(`----- depth = ${thisPath.length}`)
            console.log( thisPath )
            console.log(childLabels)
            const rewrites = await simplifyHierarchy( thisPath, childLabels, {engine: "gpt4"})
            console.log(rewrites)
            if( rewrites.success){
                for(const r of rewrites.summaries){
                    const childId = node.children[ r.id ]
                    const childNode = nodes[childId]
                    if( childNode ){

                        if( childId !== undefined ){
                            childNode.label = r.label
                            childNode.short = r.description
                        }
                        console.log(childNode)
                        await rewriteLabels( childNode, thisPath )
                    }
                }
            }
            
        }
    }

    await rewriteLabels( nodes["0"])


    return nodes
}