import Primitive from './model/Primitive';
import Category from './model/Category';
import Counter from './model/Counter';
import PrimitiveConfig from "./PrimitiveConfig";
import AssessmentFramework from './model/AssessmentFramework';
import {enrichCompanyFromLinkedIn, pivotFromLinkedIn, extractUpdatesFromLinkedIn} from './linkedin_helper'
import { extractArticlesFromCrunchbase, pivotFromCrunchbase } from './crunchbase_helper';
import {buildCategories, categorize, summarizeMultiple, processPromptOnText, buildEmbeddings, simplifyHierarchy, analyzeListAgainstTopics} from './openai_helper';
import PrimitiveParser from './PrimitivesParser';
import { getDocumentAsPlainText, removeDocument } from './google_helper';
import { SIO } from './socket';
import EnrichPrimitive from './enrich_queue';
import QueueAI from './ai_queue';
import QueueDocument from './document_queue';
import Embedding from './model/Embedding';
import DBSCAN from '@cdxoo/dbscan';
import { kmeans } from 'ml-kmeans';
import skmeans from 'skmeans';
//import silhouetteScore from '@robzzson/silhouette';
import { agnes } from 'ml-hclust';
import { localeData } from 'moment';

var ObjectId = require('mongoose').Types.ObjectId;

const parser = PrimitiveParser()

export async function getNextSequenceValue(sequenceName) {
    try {
        const counter = await Counter.findOneAndUpdate(
          { name: sequenceName },
          { $inc: { sequence_value: 1 }},
          { new: true, upsert: true }
        );
        
        return counter.sequence_value;
      } catch (error) {
        throw error
      }
}

async function doRemovePrimitiveLink(receiver, target, path){
    await Primitive.updateOne(
        {
            "_id": new ObjectId(receiver),
            [path]: {$in: [target]},
            [`${path}.1`]: { "$exists": true }
        },
        {
            $pull: { [path]: target }
        })

    await Primitive.updateOne(
        {
            "_id": new ObjectId(receiver),
            [path]: {$in: [target]},
            [`${path}.1`]: { "$exists": false }
        },
        {
            $unset: {[path]: ""}
        })
}
const removeParentReference = async (target, parentId)=>{
    if( !(target instanceof Object)){
        target = await Primitive.findOne({"_id": new ObjectId(target)})
    }


    try{
        const updates = target.parentPrimitives[parentId].reduce((o,pp)=>{
            o[pp] = {$function: {
                    body: `function(arr){ return arr ? arr.filter((p)=>p != '${target.id}') : undefined;}`,
                    args: [`$${pp}`],
                    lang: "js"
                }}
            return o
        }, {})

        await Primitive.findOneAndUpdate(
            {
                "_id": new ObjectId(parentId),
            }, 
            [{
                $set: updates
            }]
        )
    }catch(err){
        throw err
    }

}
export async function removePrimitiveById( primitiveId, removedIds = [], start = true ){
    try{
        const removed = //await Primitive.findOneAndDelete({"_id": new ObjectId(data.id)})
                await Primitive.findOneAndUpdate(
                    {
                        "_id": new ObjectId(primitiveId),
                    }, 
                    {
                        $set: {deleted: true}
                    })
        removedIds.push( primitiveId )
    
        if( removed.referenceParameters?.notes || removed.referenceParameters?.url ){
            await removeDocument( primitiveId )
        }
        if( removed.parentPrimitives ){
            for( const parentId of Object.keys(removed.parentPrimitives) ){
                await removeParentReference( removed, parentId)
            }
        }
        if( removed.primitives ){
            const pp = new Proxy(removed.primitives, parser)
            const cascadeIds = [pp.origin.uniqueAllIds, pp.auto.uniqueAllIds].flat()
            const childPrimitiveIds = pp.uniqueAllIds

            for( const childId of childPrimitiveIds ){
                await Primitive.findOneAndUpdate(
                    {
                        "_id": new ObjectId(childId),
                    }, 
                    {
                        $unset: { [`parentPrimitives.${removed.id}`]:"" }
                    })
            }
            for( const childId of cascadeIds){
                await removePrimitiveById( childId, removedIds, false)
            }
        }
        if( start ){
            SIO.notifyPrimitiveEvent(removed.workspaceId, {data: [{type: "remove_primitives", primitiveIds: removedIds}]})            
        }
    }catch(err){
        console.log(`Error deleting - inner`)
        console.log(err)
        throw err
    }
    return removedIds
}

export async function removeRelationship(receiver, target, path){
    try{
        if( path.slice(0, 11 ) != "primitives."){
            path = "primitives." + path
        }
        const parentPath = `parentPrimitives.${receiver}`
        if( path === true ){
            console.log(`WILL DO ALL PATHS`)
        }
        
        await Primitive.findOneAndUpdate(
            {
                "_id": new ObjectId(target),
                [parentPath]: {$in: [path]},
                [`${parentPath}.1`]: { "$exists": true }
            }, 
            {
                $pull: { [parentPath]: path },
            }
        )
        await Primitive.findOneAndUpdate(
            {
                "_id": new ObjectId(target),
                [parentPath]: {$in: [path]},
                [`${parentPath}.1`]: { "$exists": false }
            }, 
            {
                $unset: { [parentPath]: "" },
            }
        )

        await doRemovePrimitiveLink(receiver, target, path)
        const receiverPrim =  await Primitive.findOne(
                                                            {
                                                                    "_id": new ObjectId(receiver)
                                                            })
        SIO.notifyPrimitiveEvent( receiverPrim,
                                            [{
                                                type: "remove_relationship",
                                                id: receiver, 
                                                target: target,
                                                path:  path
                                            }])
    }
    catch(error){
        console.log(error)
        throw new Error("Couldn't find target")
    }
}
export async function addRelationship(receiver, target, path){
    try{
        if( path.slice(0, 11 ) != "primitives."){
            path = "primitives." + path
        }
        const parentPath = `parentPrimitives.${receiver}`
        await Primitive.findOneAndUpdate(
            {
                "_id": new ObjectId(target),
                [parentPath]: {$exists: false}
            }, 
            {$set: { [parentPath]: [path] }})
        await Primitive.findOneAndUpdate(
            {
                "_id": new ObjectId(target),
                [parentPath]: {$nin: [path]}
            }, 
            {$push: { [parentPath]: path }})
    }
    catch{
        throw new Error("Couldn't find target")
    }
    await Primitive.findOneAndUpdate(
        {
                "_id": new ObjectId(receiver),
                [path]: {$nin: [target]}
        }, 
        {$push: { [path]: target }})

    const receiverPrim =  await Primitive.findOne(
                                            {
                                                    "_id": new ObjectId(receiver)
                                            })

    const check = await Primitive.find({"_id": new ObjectId(target)})
    if( check.length === 0){
        await doRemovePrimitiveLink( receiver, target, path )
        throw new Error("Couldn't find target")
    }else{
        SIO.notifyPrimitiveEvent( receiverPrim,
                                            [{
                                                type: "add_relationship",
                                                id: receiver, 
                                                target: target,
                                                path:  path
                                            }])
    }
}
export async function primitiveChildren(primitive, types){
    return await primitivePrimitives(primitive, 'primitives.origin', types )
}

export async function primitivePrimitives(primitive, path, types){
    if( path.slice(0, 11 ) != "primitives."){
        path = "primitives." + path
    }
    
    let list = await Primitive.find({
        $and:[
            {
                [`parentPrimitives.${primitive._id.toString()}`]: {$in: [path]}
            },
            { deleted: {$exists: false}}
        ]
    })
    if( types ){
        const a = [types].flat()
        list = list.filter((d)=>a.includes(d.type))
    }
    return list
} 
export async function primitiveRemovalCandidates(primitive, types){
}
export async function primitiveDescendents(primitive, types, options={}){
    let out = []
    let list
    
    const fullDocument = options.fullDocument === undefined ? true : options.fullDocument
    const paths = options.paths === undefined ? ["origin", "auto"] : options.paths
    const unique = options.unique === undefined ? true : options.unique
    const fields = fullDocument ? undefined :"_id primitives type" 

    const a = Array.isArray(types) ? types : [types]


    function getAllIds(obj) {
        const ids = [];
        
        const unpack = (item)=>{
            if( Array.isArray(item) ){
                ids.push(item)
                return
            }
            if( item ){
                Object.values(item).forEach((value)=>{
                    unpack(value)
                })
            }
        }
        unpack( obj)
        
        return ids.flat().filter((c,idx,a)=>a.indexOf(c)===idx);
    }
    
    const getIds = paths.length > 0
        ? (p)=>paths.map((path)=>p && p.primitives && p.primitives[path]).flat().filter((d)=>d)
        : (p)=> getAllIds( p.primitives)

    let ids = getIds(primitive)
    let checked = {}

    do{
         list = await Primitive.find({
            $and:[
                {_id: {$in: ids}},
                { deleted: {$exists: false}}
            ]
        }, fields)
        
        out = out.concat(list)

        ids = list.map((d)=>{
            if(!types || !a.includes(d.type) ){
                return getIds(d)
            }
            return undefined
        }).flat().filter((d)=>d && !checked[d])
        ids.forEach((d)=>checked[d]=true)
    }while(list.length > 0)

    if( types ){
        out = out.filter((d)=>a.includes(d.type))
    }

    if( unique){
        const fc = {}
        return  out.filter((d)=>{
            const id = d._id.toString()
            if( fc[id]){
                return false
            }
            fc[id] = true
            return true
        })
    }

    return out
}
export function primitiveOrigin(primitive ){
    return primitiveWithRelationship(primitive, "origin")
}
export async function primitiveTask(primitive ){
    const origin = await Primitive.findOne({_id:  primitiveWithRelationship(primitive, "origin") })
    if( origin ){
        if( ["activity", "task", "experiment"].includes(origin.type) ){
            return origin
        }
        return primitiveTask( origin )
    }
    return undefined
}
export function primitiveWithRelationship(primitive, relationship){
    const match = `primitives.${relationship}`
    return Object.keys(primitive.parentPrimitives).filter((parentId)=>{
        return primitive.parentPrimitives[parentId].includes(match)
    })[0]
}
export function primitiveParentPath(primitive, relationship, parentId, getId ){
    const match = `primitives.${relationship}`
    let list = primitive.parentPrimitives[parentId].filter((d)=>d.slice(0,match.length) === match)

    if( getId){
        if( getId ){
            list = list.map((d)=>d.split(".").pop())
        }
    }
    return list
}
export async function getDataForProcessing(primitive, action, source, options = {}){
    let startList = options.list 
    let list = []

    if(source === undefined){
        source = primitive
    }

    let type = primitive.referenceParameters?.type || action.type
    const target = primitive.referenceParameters?.target || action.target || "children"
    const referenceId = primitive.referenceParameters?.referenceId || action.referenceId
    const field = primitive.referenceParameters?.field || action.field

    if(target === "descend"){
        if( startList ){
            list = []
            for(const d of startList){
                list = list.concat( await primitiveDescendents(d, type) )
            }
            console.log(`used startList of ${startList.length} to find ${list.length}`)
        }else{
            list = await primitiveDescendents(source, type)
        }
    }else if(target === "children"){
        list = startList || await primitiveChildren(source)
    }else if(target === "evidence"){
        list = startList || await primitiveDescendents(source, undefined, {fullDocument:true})
        type = "evidence"
        console.log(`GOT ${list.length}`)
    }else if(target === "level2" ){
        list = startList || await primitiveChildren(source)
        list = (await Promise.all(list.map(async (d)=>await primitiveChildren(d)))).flat()
    }else if( target.slice(0,8) === "results."){
        console.log(`FETCHING DATA FROM RESULTS SET ${target}`)
        list = await primitivePrimitives(source, target )
        console.log(`GOT ${list.length}`)

    }

    if( type ){
        list = list.filter((d)=>d.type === type)
    }
    if( referenceId ){
        list = list.filter((d)=>d.referenceId === referenceId)
    }
    if( options.childPrimitiveIds ){
        list = list.filter((d)=>options.childPrimitiveIds.includes(d._id.toString()))
    }

    if( list === undefined){
        return []
    }
    
    if( field){

        const param = field.slice(0,6) === "param." ? field.slice(6) : undefined
        
        const oldSize = list.length
        list = list.filter((d)=>{
            return (param ? d.referenceParameters?.[param] : d[field]) 
        })
        if( oldSize !== list.length){
            console.log(`+++++ HAD ${oldSize} now ${list.length} +++++`)
        }
        
        
        return [list, 
            (param 
                ? list.map((d) => d.referenceParameters?.[param])
                : list.map((d) => d[field])
                )]
    }
    return [list]
}

export async function getDataForAction(primitive, action, options = {}){
    let startList = options.list 
    let list = []
    const target = options.target || action.target || "children"
    const referenceId = options.referenceId || action.referenceId
    const type = options.type || action.type
    const field = options.field || action.field

    if(target === "descend"){
        if( startList ){
            list = []
            for(const d of startList){
                list = list.concat( await primitiveDescendents(d, type) )
            }
            console.log(`used startList of ${startList.length} to find ${list.length}`)
        }else{
            list = await primitiveDescendents(primitive, type)
        }
    }
    if(target === "children" || target === "results.0"){
        list = startList || await primitiveChildren(primitive)
    }
    if(target === "level2" || target === "evidence"){
        list = startList || await primitiveChildren(primitive)
        list = (await Promise.all(list.map(async (d)=>await primitiveChildren(d)))).flat()
    }
    if( type ){
        list = list.filter((d)=>d.type === type)
    }
    if( referenceId ){
        list = list.filter((d)=>d.referenceId === referenceId)
    }
    if( options.childPrimitiveIds ){
        list = list.filter((d)=>options.childPrimitiveIds.includes(d._id.toString()))
    }

    if( list === undefined){
        return []
    }
    
    const param = field.slice(0,6) === "param." ? field.slice(6) : undefined

    return [list, 
            (param 
            ? list.map((d) => d.referenceParameters?.[param])
            : list.map((d) => d[field])
            ).filter((d)=>d)]
}

async function validateSegment( primitive, action, sourceSegment ){
    let out = []
    const validateResult = await validateAndRebuildSegments(primitive) 
    const hasSubsegments = validateResult !== false
    console.log(hasSubsegments)
    if( Array.isArray(validateResult) ){
        out = out.concat(validateResult)
        primitive = await Primitive.findById(primitive._id.toString())
    }
    
    if( hasSubsegments){
        const subsegments = await primitiveChildren( primitive, "segment")
        for(const sub of subsegments){
            console.log(`-- Sub segment ${sub._id.toString()}`)
            await validateSegment( sub, action, sourceSegment || primitive) 
        }
    }else{
        console.log(`Linking to primitives of ${primitive._id.toString()}`)
        sourceSegment = sourceSegment || (await primitiveParents(primitive,'origin'))?.[0]

        const dataOptions = {
            type: sourceSegment?.referenceParameters?.type || action.type, 
            referenceId: sourceSegment?.referenceParameters?.referenceId || action.referenceId,
        }
        console.log(`getting config from ${sourceSegment?.id} (${sourceSegment?.plainId})`)

        const unionParents = Object.keys(primitive.parentPrimitives).filter((d)=>primitive.parentPrimitives[d].includes('primitives.auto'))
        console.log(unionParents)
        
        if( sourceSegment.type === "segment" && unionParents.length > 0 ){
            const queryInner = [
                { deleted: {$exists: false}},
                dataOptions.type ? {type: dataOptions.type} : undefined,
                dataOptions.referenceId ? {referenceId: dataOptions.referenceId} : undefined
            ].filter((d)=>d)

            console.log(queryInner )
            const list = await Primitive.find({
                $and:[
                queryInner,
                    unionParents.map((d)=>{ return {[`parentPrimitives.${d}`]: {$exists: true, $ne: []}}})
                ].flat()
            })
            console.log(`got back ${list.length}`)
            for( const item of list){
                const targetId = item._id.toString()
                if( !primitive.primitives?.ref?.includes(targetId) ){
                    await addRelationship( primitive._id.toString(), targetId, 'ref')
                    /*out.push({
                        type: "add_relationship",
                        id: primitive._id.toString(), 
                        target: targetId,
                        path: "ref"
                    })*/
                }
            }
        }
    }
    return out
}

export async function dispatchControlUpdate(id, controlField, status, flags = {}){
    try{
        let primitive 
        console.log(`${id} = ${controlField} : ${status}`)

        if( status === undefined ){
            primitive = await Primitive.findOneAndUpdate(
                {
                    "_id": new ObjectId(id),
                }, 
                {
                    $unset: { [controlField]: "" },
                }
            )

        }else{
            primitive = await Primitive.findOneAndUpdate(
                {
                    "_id": new ObjectId(id),
                }, 
                {
                    $set: { [controlField]: status },
                }
            )
        }
        //SIO.getIO().emit("message", [{type: "set_fields", primitiveId: id, fields: {[controlField]: status === undefined ? null :status}}])            
        SIO.notifyPrimitiveEvent(primitive, {data: [{type: "set_fields", primitiveId: id, fields: {[controlField]: status === undefined ? null :status}}], ...flags})            
    }catch(error){
        console.log(`Error dispatching ${controlField} for ${id}`)
        console.log(error)
    }
}
async function treeToCluster( tree){
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
    let targetCount = [0.02, 0.015, 0.01,0.0025, 0.0012].map((d)=>Math.round(d * nodeCount))
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

    console.log(Object.values(nodes).map((d)=>d.sparsePrimitives ? d.sparsePrimitives.length : (d.primitives?.length  || 0)).reduce((a,c)=>a+c,0))
    console.log(nodeCount)





    return nodes

}
async function summarizeClusters( nodes ){
    let needSummary, lastNeed
    console.log(`Do summary...`)

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
                    
                    const titles = list.map((d)=>d.title)
                    
                    let summary = await summarizeMultiple( titles, {types: "problem statements", prompt: "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'"})
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
                    const overall = await summarizeMultiple( summaries, {types: "problem statements", prompt: "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'"})
                    if( overall.success ){
                        console.log(`GOT BACK SUMMARY OF SUMMARY`)
                        node.summary = overall.summary
                        
                        
                        let attempts = 3
                        let updates 
                        do{
                            console.log(`Preparing summaries - attempt ${attempts}`)
                            updates = await simplifyHierarchy( node.summary, summaries )
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

async function validateAndRebuildSegments( primitive ){
    const axisParents = await Primitive.find({
        $and:[
            
            {[`parentPrimitives.${primitive._id.toString()}.0`]: 'primitives.axis'},
            { deleted: {$exists: false}}
        ]
    })
    if( !axisParents || axisParents.length === 0){
        return false
    }
    const axisOptions = {}
    
    for( const axis of axisParents){
        axisOptions[axis.id] = (await primitiveChildren(axis, "category")).reduce((o, d)=>{o[d._id.toString()]=d; return o},{})   
    }

    function expandSet(set, options){
        if( set.length === 0){
            return Object.keys(options).map((d)=>[d])
        }
        return Object.keys(options).map((d)=>{
            return set.map((s)=>[s,d].flat())
        }).flat()
    }

    let set = []
    Object.values(axisOptions).forEach((d)=>{
        set = expandSet(set, d)
    })

    const keepIds = []
    const currentSegments = await primitiveChildren( primitive, "segment")
    console.log(set)

    const out = []
    for( const segmentId of set ){
        const key = segmentId.join('-')
        const title = segmentId.map((id, idx)=>Object.values(axisOptions)[idx]?.[id]?.title || "Unkowon").join(" / ") 
        
        keepIds.push( key )

        const exists = currentSegments.find((d)=>d.segmentKey === key)
        if( exists ){
            console.log(`segment ${key} found`)
        }
        if( exists === undefined ){
            console.log(`Need to create ${key} `)

            const newData = {
                workspaceId: primitive.workspaceId,
                paths: ["origin"],
                parent: primitive._id.toString(),
                data:{
                    type: "segment",
                    referenceId: primitive.referenceId,
                    title: title,
                    segmentKey: key,
                }
            }
            const newPrim = await createPrimitive( newData )
            for( const axisId of segmentId ){
                await addRelationship( axisId, newPrim._id.toString(), "auto")
            }
            out.push(newPrim)
        }
    }
    const toPurge = currentSegments.filter((d)=>!keepIds.includes(d.segmentKey))
    console.log(`Need to purge ${toPurge.length}`)
    
    if( out.length > 0){

        return [{
            type: "new_primitives",
            data: out
        }]
    }
    return true
}


export async function primitiveParents(primitive, path){
    const ids = Object.keys(primitive.parentPrimitives).filter((d)=>primitive.parentPrimitives[d].includes(`primitives.${path}`))
    console.log(ids)
    if( ids )
    {
        const query = {$and:[
            {
                _id:  {$in: ids.map((d)=>new ObjectId(d) )}
            },
            { deleted: {$exists: false}}
        ]}
        return await Primitive.find(query )

    }
    return []
}

export async function doPrimitiveAction(primitive, actionKey, options, req){


    try{

    const category = await Category.findOne({id: primitive.referenceId})
    let done = false
    let result
    if( category && category.actions ){
    
        const findResultPathFor = (id)=>{
            if( category.resultCategories === undefined){
                return undefined
            }
            return category.resultCategories.findIndex((d)=>d.resultCategoryId === id)


        }

        const action = category.actions.find((d)=>d.key === actionKey)
        if( action ){
            const command = action.command || actionKey
            console.log(action)
            if(action.required){
                console.log(`check ${action.required.join(", ")}`)
                const missing = action.required.filter((d)=>primitive.referenceParameters[d] === undefined)
                if( missing.length > 0 ){
                    return false
                }
            }
            if( command === "cascade"){
                console.log(`Running cascade ------>`)
                result = []

                const pre = (action.requiredAction || []).filter((d)=>!primitive.action_tracker || !primitive.action_tracker[d])
                console.log(`Need to do ${pre.join(", ")}`)
                for( const a of pre){
                    console.log(`-- ${a}:`)
                    const sub = await doPrimitiveAction(primitive, a, {}, req)
                    if( sub ){
                        result = result.concat(sub   )
                    }
                }


                const [targets] = await getDataForProcessing(primitive, action)
                console.log(`got ${targets.length} items`)
                for( const child of targets){
                    console.log(` + ${child._id.toString()}`)
                    const thisSet = (action.cascadeKey || []).filter((d)=>!child.action_tracker || !child.action_tracker[d])
                    console.log(`Now doing  ${thisSet.join(", ")}`)
                    for( const a of thisSet){
                        console.log(`-- ${a}:`)
                        debugger
                        const sub = await doPrimitiveAction(child, a, {}, req)
                        debugger
                        if( sub ){
                            result = result.concat( sub  )
                        }
                    }
                }
                done = true
            }
            
            if( primitive.type === "result" ){
                if( command === "extract"){
                  //  if( actionKey === "extract_problems_addressed") {
                        const text = await getDocumentAsPlainText( primitive._id.toString(), req )

                        let title = primitive.title
                        if( action.titleSource === "origin"){
                            const originId = Object.keys(primitive.parentPrimitives || {}).filter((d)=>primitive.parentPrimitives[d].includes("primitives.origin"))[0]
                        console.log(originId)
                            if( originId ){
                                const origin = await Primitive.findOne({_id:  new ObjectId(originId)})
                                if( origin ){
                                    title = origin.title
                                }
                            }
                        }
                        console.log(title)

                        let topics = options.topics || action.topics
                        if( topics === "{parent_topic}"){
                            const task = await primitiveTask( primitive )
                            if( task ){
                                topics = task.referenceParameters?.topics
                            }
                        }

                        const output = await processPromptOnText(text?.plain, {title: title, topics: topics, prompt: options.prompt || action.prompt, type: action.dataType, extractField: action.extractField ,extractNoun: action.extractNoun, transformPrompt: action.transformPrompt})
                        if( output && output.success && output.output){
                            let extracted = output.output 

                            console.log(output)
                            console.log(output.output?.results)
                            const items = []
                            
                            console.log( `GOT`, extracted)

                            if( topics ){
                                console.log(`DO FILTER CHECK`)
                                const result = await analyzeListAgainstTopics(extracted.map((d)=>d[action.extractNoun].replaceAll("\n",". ")), topics, {prefix: "Problem", type: "problem", maxTokens: 6000})
                                console.log( result.output )
                                if( result.success ){
                                    extracted = extracted.filter((d,idx)=>!(["hardly", "not at all"].includes( result.output[idx].s ) ))
                                }
                                console.log(extracted)
                            }

                            // do filter

                            for( const item of extracted){
                                const title = item[action.extractNoun]
                                if( title ) {
                                    items.push( await createPrimitive({
                                        workspaceId: primitive.workspaceId,
                                        parent: options.parent || primitive.id,
                                        paths: ['origin'],
                                        data:{
                                            type: action.type,
                                            referenceId: action.resultCategory,
                                            title: title,
                                            quote: item.quote,
                                            quoted: item.quote ? "true" : false
                                        }
                                        
                                    }))
                                    done = true
                                }
                            }
                            result = [{
                                type: "new_primitives",
                                data: items
                            }]
                            done = true
                        }
                    }
//                }
            }
            if( primitive.type === "activity" ){
                if( command === "search"){
                        result = await EnrichPrimitive().searchCompanies( primitive, {referenceId: action.referenceId, keywords: options.keywords} )
                        done = true
                }
                    if(command === "pivot_cb" ){
                        result = EnrichPrimitive().pivotCompany(primitive, "crunchbase", action)
                        done = true
                    }
                    if(command === "roll_up" ){
                        if( primitive.tree){
                            if( !primitive.clusters ){
                                const clusters = await treeToCluster( primitive.tree )
                                const summarized = await summarizeClusters( clusters )
                                await dispatchControlUpdate(primitive.id, "clusters", summarized )
                            }else{
                                const topNodes = Object.values(primitive.clusters).filter((d)=>d.parent === undefined)
                                console.log(`got ${topNodes}`)
                            
                                const summaries = topNodes.map((d)=>d.summary)
                                const overall = await summarizeMultiple( summaries, {types: "problem statements", prompt: "State the underlying problem that the problem statements have in common in more more than 30 words in the form 'Problems related to...'"})
                                if( overall.success ){
                                    console.log(`GOT BACK SUMMARY OF SUMMARY`)

                                    const updates = await simplifyHierarchy( overall.summary, summaries )
                                    if( updates.success ){
                                        topNodes.forEach((d,idx)=>{
                                            if( idx === parseInt(updates.summaries[idx].id)){
                                                d.short = updates.summaries[idx].summary
                                            }else{
                                                console.log(`mismatch ${idx}`, updates.summaries[idx])
                                            }
                                        })
                                        await dispatchControlUpdate(primitive.id, "clusters", primitive.clusters )
                                    }

                                }
                            }
                        }else{
                            let [list, data] = await getDataForProcessing(primitive, action)
                            if(data){
                                if( data.length !== list.length){
                                    console.log(`Mismatch on data vs list size`)
                                }else{
                                // list = list.slice(0,200)
                                    //data = data.slice(0,200)
    //                                console.log(data.map((d,idx)=>`${idx}: ${d}`))
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

                                    console.log(`doing calcs`)
                                    let bestClusters, bestScore, bestE

                                    const tree = agnes(toProcess, {
                                        method: 'ward',
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
                                    await dispatchControlUpdate(primitive.id, "tree", tree )
                                }
                            }
                            done = true
                        }
                    }
            }
            if( primitive.type === "entity" ){
                if( command === "enrich"){
                    result = EnrichPrimitive().enrichCompany( primitive, "linkedin", true )
                    done = true
                }
                if( command === "pivot"){
                    if(actionKey === "pivot_li" ){                        
                        result = [{
                            type: "new_primitives",
                            data: await pivotFromLinkedIn(primitive),
                        }]
                        done = true
                    }
                    if(actionKey === "pivot_cb" ){
                        result = EnrichPrimitive().pivotCompany(primitive, "crunchbase", action)
                        done = true
                    }
                }
                if( command === "extract"){
                    const path = options.path || `results.${findResultPathFor(options.resultCategory  || action.resultCategory)}`
                    if( actionKey === "find_articles_linked") {
                        const output = await extractUpdatesFromLinkedIn(primitive, {path: path , type: options.type || action.type, referenceId: options.resultCategory || action.resultCategory})
                        if( output.error === undefined){
                            result = [{
                                type: "new_primitives",
                                data: output
                            }]
                            done = true
                        }
                    }else if( actionKey === "find_articles_crunchbase") {
                        const output = await extractArticlesFromCrunchbase(primitive, {path: path, type: options.type || action.type, referenceId: options.resultCategory || action.resultCategory})
                        if( output.error === undefined){
                            result = [{
                                type: "new_primitives",
                                data: output
                            }]
                            done = true
                        }
                    }
                }
            }
            if( primitive.type === "segment" ){
                                
                const validateResult = await validateSegment( primitive, action )
                const hasSubsegments = primitive.primitives?.axis
                console.log('has segment', hasSubsegments)

                if( command === "summarize" && hasSubsegments){
                    const subsegments = await primitiveChildren( primitive, "segment")
                    for(const sub of subsegments){
                        console.log(`-- Summarize sub segment ${sub._id.toString()}`)
                        await doPrimitiveAction(sub, actionKey, {...options, sourceSegment: options.sourceSegment || primitive}, req)
                    }
                }
                if( command === "summarize" && !hasSubsegments){
                    const sourceSegment = options.sourceSegment || (await primitiveParents(primitive,'origin'))?.[0]
                    console.log(`doing sub`)

                    const dataOptions = {
                        type: sourceSegment?.referenceParameters?.type || action.type, 
                        referenceId: sourceSegment?.referenceParameters?.referenceId || action.referenceId,
                        parameter: sourceSegment?.referenceParameters?.field ? undefined : (sourceSegment?.referenceParameters?.parameter || action.parameter),
                        field: sourceSegment?.referenceParameters?.field || action.field,
                        asList: sourceSegment?.referenceParameters?.asList || action.asList,
                    }

                    const list = await primitivePrimitives(primitive, 'ref')
                    console.log(dataOptions)

                    const [undefined, data] = await getDataForAction(primitive, action, {...dataOptions, list})
                    console.log(`data count = `, data.length)

                    if( data && data.length > 0){
                        const summary = await summarizeMultiple( data, {title: primitive.title, asList: dataOptions.asList, types: options.dataTypes || action.dataTypes, themes: options.themes || action.themes, prompt: options.prompt || action.prompt, aggregatePrompt: options.aggregatePrompt || action.aggregatePrompt} )
                        
                        const targetParam = action.targetParameter || "description"
                        if( summary.success){
                            done = true
                            
                            const prim = await Primitive.findOneAndUpdate(
                                {"_id": primitive._id},
                                {
                                    [`referenceParameters.${targetParam}`]: summary.summary,
                                })
                                
                            result = [{
                                type:"set_fields",
                                primitiveId: primitive._id.toString(),
                                fields:{
                                    [`referenceParameters.${targetParam}`]: summary.summary,
                                }
                            }]
                        }
                    }
                }
            }
            if( primitive.type === "activity" || primitive.type === "task" || primitive.type === "experiment" ){
                const source = await Primitive.findById(options.source)
                if( command === "categorize"){
                    QueueAI().categorize( source, primitive, action,req )
                }
                if( command === "mark_categories" ){
                    QueueAI().markCategories( source, primitive, action,req )
                }
            }
            if( done ){
                primitive.set(`action_tracker.${action.key}`, true)
                primitive.markModified("crunchbaseData")
                await primitive.save()
            }
        }else{
            console.log(`cant find action ${actionKey}`)
            console.log(category)
        }

    }else{
            console.log(`cant find category or has no actions`)
            console.log(category)
        }
    return done ? result : false
    }catch(error){
        console.log(`doPrimitiveAction error ${primitive ? primitive._id.toString() : ""} ${actionKey}`)
        console.log(error)
    }
}

export async function createPrimitive( data, req ){
    try{
        let parentPrimitive = data.parent ? await Primitive.findOne({_id:  new ObjectId(data.parent)}) : undefined
        if( data.parent && parentPrimitive === undefined){
                throw new Error(`Cant find parent`)
        }
        
        const type = data.data.type
        if( !PrimitiveConfig.types.includes( type )) {
            throw new Error(`Type '${type}' not recognized`)
        }
        const config = PrimitiveConfig.typeConfig[type]
        
        if( config ){
            if( config.needParent ){
                if(data.parent === undefined){
                    throw new Error(`Cant create '${type}' without a parent`)
                }
                if( config.allowedParents && !config.allowedParents.includes(parentPrimitive.type)){
                    throw new Error(`Cant create '${type}' with parent of type '${parentPrimitive.type}'`)
                }
            }

        }
        if( type === "assessment" && data.data.frameworkId === undefined){
            data.data.frameworkId = (await AssessmentFramework.findOne({}))?._id.toString()
        }
        if( data.workspaceId === undefined){
            throw new Error(`Cant create without a workspace`)
        }
        data.data.workspaceId = data.workspaceId
        data.data.primitives = data.data.primitives || {}
        
        if( data.paths === undefined ){
            if( data.parent ){
                data.paths = ['origin']
            }else{
                data.paths = []
            }
        }
        
        const paths = data.paths.map((p)=>flattenPath( p ))
        if( data.parent ){
            data.data.parentPrimitives = {[data.parent]: paths}
        }
        data.data.plainId = await getNextSequenceValue("base")
        
        let newPrimitive = await Primitive.create(data.data)
        
        SIO.notifyPrimitiveEvent( newPrimitive,
                                [{
                                    type: "new_primitives",
                                    data: [newPrimitive]
                                }])
        
        const newId = newPrimitive._id.toString()

        for( const path of paths){
            await addRelationship(data.parent, newId, path)
        }

        const category = await Category.findOne({id: newPrimitive.referenceId})
        if( category && category.actions){
            let changed = false
            for( const action of category.actions){
                if( action.onCreate ){
                    const res = await doPrimitiveAction( newPrimitive, action.key, undefined, req )
                    if( res ){
                        changed = true
                    }
                }
            }
            newPrimitive = await Primitive.findOne({_id:  newPrimitive._id})
        }
        if( newPrimitive.referenceParameters?.notes ){
                QueueDocument().add(`doc_refresh_${newPrimitive.id}`, 
                    {
                        command: "refresh", 
                        id: newPrimitive.id, 
                        value: newPrimitive.referenceParameters.notes, 
                        req: {user: {accessToken: req.user.accessToken, refreshToken: req.user.refreshToken}}
                    })
            }
        

        return newPrimitive
    }catch(err){
        throw err
    }
    return undefined
}

export const flattenPath = (path)=>{
    let out = ['primitives']
    const nest = (node)=>{
        if( node instanceof Object ){
            const k = Object.keys(node)[0]
            out.push(k)
            nest( node[k] )
            return out
        }
        out.push((node === undefined || node === '') ? "null" : node)
        return out
    }
    return nest( path).join(".")
}


function cosineSimilarity(A, B) {
    var dotproduct = 0;
    var mA = 0;
    var mB = 0;

    for(var i = 0; i < A.length; i++) {
        dotproduct += A[i] * B[i];
   //     mA += A[i] * A[i];
     //   mB += B[i] * B[i];
    }
    //console.log(mA,mB)

//    mA = Math.sqrt(mA);
  //  mB = Math.sqrt(mB);
  return dotproduct
    var similarity = dotproduct / (mA * mB);

    return similarity;
}

const _euclideanCache = {}

function euclideanDistance(point1, point2) {
    if (point1.length !== point2.length) {
      throw new Error("Both points must have the same dimensionality.");
    }
  
    let sum = 0;
    for (let i = 0; i < point1.length; i++) {
      sum += Math.pow(point1[i] - point2[i], 2);
    }
  
    return Math.sqrt(sum);
  }
  
  function silhouetteScore(data, clusters) {
    let scoreSum = 0;
    let numPoints = 0;

    let clusterMax = Math.max(...clusters) + 1
  
    for (let i = 0; i < data.length; i++) {
      const clusterIdx = clusters[i];
      const clusterPoints = data.filter((_, idx) => clusters[idx] === clusterIdx);
      const a_i = clusterPoints.reduce((sum, point) => sum + euclideanDistance(data[i], point), 0) / clusterPoints.length;
  
      let b_i = Infinity;
      for (let j = 0; j < clusterMax; j++) {
        if( j !== clusterIdx) {
          const otherClusterPoints = data.filter((_, idx) => clusters[idx] === j);
          const avgDist = otherClusterPoints.reduce((sum, point) => sum + euclideanDistance(data[i], point), 0) / otherClusterPoints.length;
          b_i = Math.min(b_i, avgDist);
        }
      }
  
      const silhouette_i = (b_i - a_i) / Math.max(a_i, b_i);
      scoreSum += silhouette_i;
      numPoints++;
    }
  
    return scoreSum / numPoints;
  }
  function silhouetteScoreFast(data, clusters, dist) {
    let scoreSum = 0;
    let numPoints = 0;

    let clusterMax = Math.max(...clusters) + 1
  
    for (let i = 0; i < data.length; i++) {
      const clusterIdx = clusters[i];
      const clusterPoints = data.filter((_, idx) => clusters[idx] === clusterIdx);
      const a_i = data.reduce((sum, point, i2) => sum + (clusters[i2] === clusterIdx ? dist[i][i2] : 0), 0) / clusterPoints.length;
  
      let b_i = Infinity;
      for (let j = 0; j < clusterMax; j++) {
        if( j !== clusterIdx) {
          const otherClusterPoints = data.filter((_, idx) => clusters[idx] === j);
          const avgDist = data.reduce((sum, point,i2) => sum + (clusters[i2] === j ? dist[i][i2] : 0), 0) / otherClusterPoints.length;

          b_i = Math.min(b_i, avgDist);
        }
      }
  
      const silhouette_i = (b_i - a_i) / Math.max(a_i, b_i);
      scoreSum += silhouette_i;
      numPoints++;
    }
  
    return scoreSum / numPoints;
  }