import { Queue } from "bullmq";
import { Worker } from 'bullmq'
import { SIO } from './socket';
import { addRelationship, createPrimitive, dispatchControlUpdate, getDataForProcessing, primitiveChildren, removeRelationship } from "./SharedFunctions";
import Primitive from "./model/Primitive";
import { buildCategories, buildEmbeddings, categorize, simplifyHierarchy, summarizeMultiple } from "./openai_helper";
import Embedding from "./model/Embedding";
import { agnes } from "ml-hclust";


let instance


async function rollup( primitive, target, action ){
    let [list, data] = await getDataForProcessing(primitive, action)
    if(data){
        if( data.length !== list.length){
            console.log(`Mismatch on data vs list size`)
        }else{
            let embeddings = await Embedding.find({foreignId: {$in: list.map((d)=>d.id)}})
            const missingIdx = list.map((d, idx)=>embeddings.find((e)=>e.foreignId === d.id) ? undefined : idx).filter((d)=>d  !== undefined)
            console.log( `missingIdx = ${missingIdx.join(", ")}`)
            for(const idx of missingIdx){
                console.log(`Embeddings for ${idx} - ${list[idx].id}`)
                const response = await buildEmbeddings(data[idx])
                if( response.success){
                    const dbUpdate = await Embedding.findOneAndUpdate({
                        type: "primitive.title",
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
            const tree = agnes(toProcess, {
                method: 'ward2',
            });
            const flattenTree = (node)=>{
                if( node.isLeaf ){
                    node.primitiveId = list[node.index].id
                }else{
                    for(const c of node.children){
                        flattenTree(c)
                    }
                }
            }
            flattenTree(tree)

            const clusters = await treeToCluster( tree, target )
            const summarized = await summarizeClusters( clusters, target )

            await dispatchControlUpdate(target.id, "clusters", summarized )
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
    instance.rollUp = (primitive, target, action, req)=>{
        if( primitive.type === "experiment" || primitive.type === "activity"){
            const field = `processing.ai.rollup`
            if(primitive.processing?.ai?.mark_categories && (new Date() - new Date(primitive.processing.ai.mark_categories.started)) < (5 * 60 *1000) ){
                console.log(`Already active - exiting`)
                return false
            }
            dispatchControlUpdate(primitive.id, field , {status: "pending", started: new Date()}, {user: req?.user?.id,  track: primitive.id, text:"Assign to categories"})
            dispatchControlUpdate(target.id, field , {status: "pending"})
            instance.add(`mark_${primitive.id}` , {id: primitive.id, action: action, targetId: target.id, mode: "rollup", field: field})
        }
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
            if( job.data.mode === "rollup" ){
                try{
                    const target = await Primitive.findOne({_id: job.data.targetId})
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
                    nodes[parent].primitives.push( node.primitiveId)
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
                        nodes[node.id] = {primitives: [node.primitiveId], id: node.id, wasLeaf: true}
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
                targetH *= 0.8
            }while( (maxIter-- > 0) && (clusterCount < minClusters ))
        }
        console.log( `For target ${minClusters} got ${clusterCount} clusters at height ${targetH}`)
        return nodes
    }
    console.log(`Got ${nodeCount} total`)
    let targetCount = (nodeCount > 500 ? [0.02, 0.015, 0.01,0.0025, 0.0012] : [0.4, 0.1,  0.02]).map((d)=>Math.round(d * nodeCount))
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

    let lastNodes 
    let nodes = {}
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
            mapP = (d)=>d?.referenceParameters?.[param]
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
                    
                    const titles = list.map((d)=>mapP(d))
                    
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
                        
                        
                        let attempts = 3
                        let updates 
                        do{
                            console.log(`Preparing summaries - attempt ${attempts}`)
                            updates = await simplifyHierarchy( node.summary, summaries, {types: primitive.referenceParameters?.summaryType, subTypes: primitive.referenceParameters?.subTypes, engine: "gpt4"} )
                            console.log( updates)
                            attempts--
                        }while( attempts > 0 && updates.success !== true)
                        if( updates.success ){
                            node.children.forEach((d,idx)=>{
                                if( idx === parseInt(updates.summaries[idx].id)){

                                    nodes[d].short = updates.summaries[idx].summary
                                }else{
                                    console.log(`mismatch ${idx}`, updates.summaries[idx])
                                }
                            })
                            console.log(node.children)
                        }

                    }


                }
                console.log(node.summary)
                idx++    
            }
        }
    }while(needSummary.length > 0 && needSummary.length !== lastNeed)
    return nodes

}