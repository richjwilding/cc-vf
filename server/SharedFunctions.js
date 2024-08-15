import Primitive from './model/Primitive';
import Category from './model/Category';
import Counter from './model/Counter';
import PrimitiveConfig from "./PrimitiveConfig";
import AssessmentFramework from './model/AssessmentFramework';
import {enrichCompanyFromLinkedIn, pivotFromLinkedIn, extractUpdatesFromLinkedIn, findPeopleFromLinkedIn, fetchLinkedInProfile, addPersonFromProxyCurlData, searchPosts, liPostExtractor, updateFromProxyCurlData, fetchCompanyHeadcount, extractPostsFromProfile} from './linkedin_helper'
import { enrichCompanyFunding, extractAcquisitionsFromCrunchbase, extractArticlesFromCrunchbase, lookupCompanyByName, pivotFromCrunchbase, resolveAndCreateCompaniesByName, resolveCompaniesByName, resolveCompanyByNames } from './crunchbase_helper';
import {buildCategories, categorize, summarizeMultiple, processPromptOnText, buildEmbeddings, simplifyHierarchy, analyzeListAgainstTopics, analyzeEvidenceAgainstHypothesis, buildRepresentativeItemssForHypothesisTest, buildKeywordsFromList, processAsSingleChunk, generateImage} from './openai_helper';
import PrimitiveParser from './PrimitivesParser';
import { buildEmbeddingsForPrimitives, decodeBase64ImageToStorage, extractURLsFromPage, fetchLinksFromWebQuery, fetchURLAsTextAlternative, fetchURLPlainText, fetchURLScreenshot, getDocumentAsPlainText, getGoogleAdKeywordIdeas, getGoogleAdKeywordMetrics, removeDocument, replicateURLtoStorage, uploadDataToBucket, writeTextToFile } from './google_helper';
import { SIO } from './socket';
import EnrichPrimitive from './enrich_queue';
import QueueAI from './ai_queue';
import QueueDocument, { extractEvidenceFromFragmentSearch, mergeDataQueryResult } from './document_queue';
//import silhouetteScore from '@robzzson/silhouette';
import { localeData } from 'moment';
import Parser from '@postlight/parser';
import QueryQueue from './query_queue';
import { buildDocumentTextEmbeddings, indexDocument, storeDocumentEmbeddings } from './DocumentSearch';
import ContentEmbedding from './model/ContentEmbedding';
import { computeFinanceSignals, fetchFinancialData } from './FinanceHelpr';
import Embedding from './model/Embedding';
import { buildPage } from './htmlexporter';
import { aggregateItems, checkAndGenerateSegments, compareItems, extractor, getSegemntDefinitions, iterateItems, queryByAxis, replicateFlow, resourceLookupQuery, runProcess } from './task_processor';
import { loopkupOrganizationsForAcademic, resolveNameTest } from './entity_helper';

Parser.addExtractor(liPostExtractor)
var ObjectId = require('mongoose').Types.ObjectId;

const parser = PrimitiveParser()
export const DONT_LOAD = {crunchbaseData: 0, linkedInData: 0, financialData: 0, action_tracker: 0, checkCache:0}

export function uniquePrimitives(list){
    let ids = {}
    return list.filter((p)=>{
        if(p=== undefined){console.warn(`undefined prim`)}
        if( ids[p.id] ){return false}
        ids[p.id] = true
        return p
    })
}
export async function findResultSetForType(primitive, type){
    const category = await Category.findOne({id: primitive.referenceId})
    if( category ){
        return category.resultCategories.find((d)=>d.type == type)?.id
    }
}
export async function findResultSetForCategoryId(primitive, id){
    const category = await Category.findOne({id: primitive.referenceId})
    if( category ){
        return category.resultCategories.find((d)=>d.resultCategoryId == id)?.id
    }
}
export async function queueReset(){

    try{

        return [
            await QueryQueue().purge(),
            await EnrichPrimitive().purge()
        ]
    }catch(error){
        console.log(`Error resetting queue`)
    }
}
export async function queueStatus(){

    try{

        return [
            ...(await QueryQueue().pending()),
            ...(await EnrichPrimitive().pending())
        ]
    }catch(error){
        console.log(`Error fetching queue status`)
    }
}
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
export function getNestedValue(primitive, path){
    const keys = path.split('.');
    let value = primitive;
  
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined; // Path not found in the object structure
      }
    }
  
    return value;
}

async function doRemovePrimitiveLink(receiver, target, path){
    await Primitive.updateOne(
        {
            "_id": new ObjectId(receiver),
            [path]: {$in: [target]},
        },
        {
            $pull: { [path]: target }
        })

    await Primitive.updateOne(
        {
            "_id": new ObjectId(receiver),
            [path]: { "$exists": true, $eq: [] }
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
export async function getConfig(primitive, category){
    let out = {}
    if( !category ){
        category = await Category.findOne({id: primitive.referenceId})
    }
    if( category ){
        for(const p of Object.keys(category.parameters)){
            if( category.parameters[p].default ){
                out[p] = category.parameters[p].default
            }
        }
    }
    const configParentId = Object.keys(primitive.parentPrimitives ?? {}).filter(d=>primitive.parentPrimitives[d].includes("primitives.config"))
    if( configParentId ){
        const configParent = await fetchPrimitive( configParentId )
        if( configParent ){
            out = {
                ...out,
                ...((await getConfig(configParent)) ?? {})
            }
        }
        console.log(`Config import from parent`)
        console.log(out)
    }

    return {
        ...out,
        ...(primitive.referenceParameters ?? {})
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
        console.time("t3")
        if( removed.parentPrimitives ){
            for( const parentId of Object.keys(removed.parentPrimitives) ){
                if( parentId ){
                    await removeParentReference( removed, parentId)
                }
            }
        }
        console.timeEnd("t3")
        if( removed.primitives ){
            const pp = new Proxy(removed.primitives, parser)
            const cascadeIds = [pp.origin.uniqueAllIds, pp.auto.uniqueAllIds].flat().filter((d, i, a)=>a.indexOf(d)===i)
            const childPrimitiveIds = pp.uniqueAllIds

            const toRemove = childPrimitiveIds.filter(d=>!cascadeIds.includes(d))

            const result = await Primitive.updateMany(
                {
                    "_id": {$in: toRemove},
                    "workspaceId": removed.workspaceId,
                    deleted: {$exists: false}
                }, 
                {
                    $unset: { [`parentPrimitives.${removed.id}`]:"" }
                })
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

export async function removeRelationshipFromMultiple(receiver, targetIds, path, workspaceId){
    if( !targetIds || targetIds.length === 0){
        return
    }
    try{
        if( path.slice(0, 11 ) != "primitives."){
            path = "primitives." + path
        }
        const parentPath = `parentPrimitives.${receiver}`
        if( path === true ){
            console.log(`WILL DO ALL PATHS`)
        }
        
        console.log(`for ${receiver} ${path} ${targetIds.length} items`)
        const r= await Primitive.updateMany(
            {
                "_id": {$in: targetIds},
                [parentPath]: { $in: [path] }
            },
            {
                $pull: { [parentPath]: path }
            }
        );
    
        const r2 = await Primitive.updateMany(
            {
                "_id": {$in: targetIds},
                [parentPath]: { "$exists": true, $eq: [] }
            },
            {
                $unset: { [parentPath]: "" }
            }
        );


        console.log(`Now receiver`)
        const r3 = await Primitive.updateOne(
        {
            "_id": new ObjectId(receiver),
        },
        {
            $pull: { [path]: {$in: targetIds} }
        })

        const r4 = await Primitive.updateOne(
        {
            "_id": new ObjectId(receiver),
            [path]: { "$exists": true, $eq: [] }
        },
        {
            $unset: {[path]: ""}
        })

        const removeUpdate = targetIds.map(d=>({
                                                    type: "remove_relationship",
                                                    id: receiver, 
                                                    target: d,
                                                    path:  path
                                                }))
        SIO.notifyPrimitiveEvent( workspaceId, removeUpdate)
    }
    catch(error){
        console.log(error)
        throw new Error("Couldn't find target")
    }
}
export async function removeRelationship(receiver, target, path, skip_notify = false){
    try{
        if( path.slice(0, 11 ) != "primitives."){
            path = "primitives." + path
        }
        const parentPath = `parentPrimitives.${receiver}`
        if( path === true ){
            console.log(`WILL DO ALL PATHS`)
        }
        
        await Primitive.updateOne(
            {
                "_id": new ObjectId(target),
                [parentPath]: { $in: [path] }
            },
            {
                $pull: { [parentPath]: path }
            }
        );
    
        await Primitive.updateOne(
            {
                "_id": new ObjectId(target),
                [parentPath]: { "$exists": true, $eq: [] }
            },
            {
                $unset: { [parentPath]: "" }
            }
        );

        await doRemovePrimitiveLink(receiver, target, path)
        if( !skip_notify ){
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
    }
    catch(error){
        console.log(error)
        throw new Error("Couldn't find target")
    }
}

export async function addRelationshipToMultiple(receiver, targetIds, path, workspaceId){
    if( !targetIds || targetIds.length === 0){
        return
    }
    try{
        console.time(`m1`)
        if( path.slice(0, 11 ) != "primitives."){
            path = "primitives." + path
        }
        const parentPath = `parentPrimitives.${receiver}`

        await Primitive.updateMany(
            {
                "_id": {$in: targetIds},
            },{
                "$addToSet": {
                    [parentPath]: path
                }
            })
    }
    catch(error){
        console.log(`Error in addRelationshipToMultiple ${receiver} ${path}`)
        console.log(error)
        throw new Error("Couldn't find target")
    }
    await Primitive.updateOne(
        {
            "_id": new ObjectId(receiver),
        },{
            "$addToSet": {
                [path]: { $each: targetIds}
            }
        })

    const checkItems = await Primitive.find({
            "_id": {$in: targetIds},
            deleted: {$exists: false}
        },{
            _id: 1, workspaceId: 1
        })
    
    const checkIds = checkItems.map(d=>d.id)
    const missing = targetIds.filter(d=>!checkIds.includes(d))

    console.log(`${checkIds.length} / ${missing.length}`)
    if( missing.length > 0){
        for(const d of missing){
            await doRemovePrimitiveLink( receiver, d, path )
            console.log(`target ${d} removed during add relationship`)
        }
    }
    console.timeEnd(`m1`)

    const removeUpdate = checkIds.map(d=>({
                                                type: "add_relationship",
                                                id: receiver, 
                                                target: d,
                                                path:  path
                                            }))
    SIO.notifyPrimitiveEvent( workspaceId, removeUpdate)
}
export async function addRelationship(receiver, target, path, skipParent = false){
    if( !skipParent ){
        try{
            console.time(`${receiver}-${target}`)
            if( path.slice(0, 11 ) != "primitives."){
                path = "primitives." + path
            }
            const parentPath = `parentPrimitives.${receiver}`

            await Primitive.updateOne(
                {
                    "_id": new ObjectId(target),
                },{
                    "$addToSet": {
                        [parentPath]: path
                    }
                })
        }
        catch(error){
            console.log(`Error in addRelationship ${receiver} ${target} ${path}`)
            console.log(error)
            throw new Error("Couldn't find target")
        }
    }
    await Primitive.updateOne(
        {
            "_id": new ObjectId(receiver),
        },{
            "$addToSet": {
                [path]: target
            }
        })

    const check = await Primitive.findOne({
            "_id": new ObjectId(target),
            deleted: {$exists: false}
        },{
            _id: 1, workspaceId: 1
        })
    if( !check){
        await doRemovePrimitiveLink( receiver, target, path )
        //throw new Error(`Couldn't find target ${receiver} -> ${target}`)
        console.log(`target removed during add relationship`)
        return
    }
    SIO.notifyPrimitiveEvent( check.workspaceId,
                                        [{
                                            type: "add_relationship",
                                            id: receiver, 
                                            target: target,
                                            path:  path
                                        }])
}
export async function primitiveChildren(primitive, types){
    return await primitivePrimitives(primitive, 'primitives.origin', types )
}
export async function fetchPrimitives(ids, queryOptions, projection){
    ids = [ids].flat()

    let query = [
            {_id: {$in: ids}},
            { deleted: {$exists: false}}
    ]
    if(queryOptions){
        query = [...query, ...[queryOptions].flat()]   
    }

    return (await Primitive.find(
        {
            $and:query
        }, 
        projection)) ?? []
}
export async function fetchPrimitive(id){
    return (await fetchPrimitives(id))?.[0]
}

export async function primitivePrimitives(primitive, path, types, deleted = false){
    if( path.slice(0, 11 ) != "primitives."){
        path = "primitives." + path
    }
    let node = primitive
    let notPresent = false
    for( const hop of path.split(".") ){
        if( node === undefined){
            notPresent = true
            break
        }
        node = node[hop]
    }
    if( notPresent ){
        return []
    }

    let list = await Primitive.find({
        $and:[
            {_id: {$in: node}},
            { deleted: {$exists: deleted}}
        ]}, DONT_LOAD) ?? []

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
    
    let paths = options.paths === undefined ? ["origin", "auto","link"] : options.paths
    const lookThrough = options.through ?? false
    const filterAtStep = options.filterAtStep ?? false

    if( options.allPaths ){
        paths = undefined
    }
    const unique = options.unique === undefined ? true : options.unique
    let fields = `_id primitives type referenceId ${options.fields ?? ""}`.trim()

    if(options.fullDocument ){
        fields = DONT_LOAD
    }
    console.log(fields)

    const a = Array.isArray(types) ? types : [types]


    function getAllIds(obj) {
        const ids = [];
        
        const unpack = (item)=>{
            if( Array.isArray(item) ){
                ids.push(item)
                return
            }
            if( item ){
                Object.keys(item).forEach((key)=>{
                    if( key === "imports"){
                        console.log(`NOT FOLLOWING IMPORTS`)
                    }else{
                        const value = item[key]
                        unpack(value)
                    }
                })
            }
        }
        unpack( obj)
        
        return ids.flat().filter((c,idx,a)=>a.indexOf(c)===idx);
    }
    
    const getIds = paths && paths.length > 0
        ? (p)=>paths.map((path)=>p && p.primitives && p.primitives[path]).flat().filter((d)=>d)
        : (p)=> getAllIds( p.primitives)


    let ids = [primitive].flat().map(d=>getIds(d)).flat()
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
            if( filterAtStep){
                if(types && !a.includes(d.type)){
                    return undefined
                }
            }
            if(lookThrough || !types || !a.includes(d.type) ){
                const nextIds = getIds(d)
                return nextIds
            }
            return undefined
        }).flat().filter((d)=>d && !checked[d])
        ids.forEach((d)=>checked[d]=true)
    }while(list.length > 0 && !options.first)

    if( types ){
        out = out.filter((d)=>a.includes(d.type))
    }
    if( options?.referenceId ){
        out = out.filter((d)=>d.referenceId === options.referenceId)
    }
    console.log(`RUN UNIQUE`)

    if( unique){
        return uniquePrimitives(out)
        /*
        const fc = {}
        return  out.filter((d)=>{
            const id = d._id.toString()
            if( fc[id]){
                return false
            }
            fc[id] = true
            return true
        })*/
    }

    return out
}
export async function primitiveMetadata(primitive ){
    return await Category.findOne({id: primitive.referenceId})
}
export function primitiveOrigin(primitive ){
    return primitiveWithRelationship(primitive, "origin")
}
export async function findPrimitiveOriginParent(primitive, type ){
    const origin = await Primitive.findOne({_id:  primitiveWithRelationship(primitive, "origin") })
    if( origin ){
        if( origin.type == type ){
            return origin
        }
        return findPrimitiveOriginParent( origin, type )
    }
    return undefined
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
export function allPrimitivesWithRelationship(primitive, relationship){
    if( !relationship ){
        return []
    }
    if( relationship.indexOf("_") > -1 ){
        const multi = relationship.split("_").map(d=>`primitives.${d}`)
        return Object.keys(primitive.parentPrimitives ?? {}).filter((parentId)=>{
            return multi.filter(d=>{
                if( d === "primitives.result"){
                    return primitive.parentPrimitives[parentId].filter(d=>d.match(/\.results\.\d+/)).length > 0
                }else{
                    return primitive.parentPrimitives[parentId].includes(d)
                }            
            }).length > 0
        })
    }
    const match = `primitives.${relationship}`
    return Object.keys(primitive.parentPrimitives ?? {}).filter((parentId)=>{
        return primitive.parentPrimitives[parentId].includes(match)
    })
}
export function primitiveWithRelationship(primitive, relationship){
    return allPrimitivesWithRelationship(primitive, relationship)[0]
}
export async function primitiveParentsOfType(primitive, types = [] ){
    const out = []
    types = [types].flat()
    const parentIds = Object.keys(primitive.parentPrimitives)
    const primitives = await fetchPrimitives(parentIds)
    for( const parent of primitives){
        if( types.includes( parent.type) ){
            out.push( parent )
        }
    }
    /*for( const pId of parentIds){
        const parent = await Primitive.findOne({_id:  pId })
        if( types.includes( parent.type) ){
            out.push( parent )
        }
    }*/
    return out
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
export async function nestedItems(primitive){
    if( primitive.type === "view"){
        const list = await primitiveDescendents(primitive, "segment", {allPaths: true, first: true, fullDocument:true} )
        console.log(`view has ${list.length} segments`)
        let out = []
        for( const segment of list){
            out = out.concat( await nestedItems( segment))
        }
        return uniquePrimitives( out )
    }
    if( primitive.type === "segment"){
        const segmentItems = async (node)=>{
            const list = await primitiveDescendents(node, undefined, {allPaths: true, first: true, fullDocument:true} )
            let out = []
            for( const item of list){
                if( item.type === "segment" ){
                    out = out.concat( await segmentItems( item ) )
                }else{
                    out = out.concat( item )
                }
            }
            return out
        } 
        return uniquePrimitives( await segmentItems( primitive) ) 
    }
    return []
}
export async function multiPrimitiveAtOrginLevel( list, level, relationship = "origin"){
    const cache = {}
    if( level === 0 || level === undefined){
        return list.map(d=>[d])
    }
    function decodeRelationship(relationship){
        if(!relationship){
            return [undefined, undefined]
        }
        let [rel, rId] = relationship.split(":")
        if( rId !== undefined){
            rId = parseInt(rId)
        }
        return [rel, rId]
    }

    let inc = 1
    let dec = level
    let ids
    let isArray = Array.isArray(relationship)
    const [rel, rId] = decodeRelationship(isArray ? relationship[0] : relationship)
    let thisRefFilter = rId
    
    
    
    const startIds = list.map(d=>allPrimitivesWithRelationship(d, rel))
    console.log(`Got ${startIds.length} for first level check (${rel} / ${rId})`)

    do{        
        console.log(`Fetch level ${inc}`)
        const parents = await Primitive.find({
            $and:[
                {_id: {$in: (ids ?? startIds).flat().filter((d,i,a)=>a.indexOf(d)===i)}},
                { deleted: {$exists: false}}
            ]
        }, inc === level ? {} : {_id: 1, parentPrimitives: 1,referenceId:1})
        ids = []
        for( const p of parents ){
            if( thisRefFilter !== undefined){
                if( p.referenceId !== thisRefFilter){
                    delete cache[p.id]
                    console.log(`REMOVING ${p.id} ${p.referenceId} vs ${rId}`)
                    continue
                }
            }
            const [rel, rId] = decodeRelationship(isArray ? relationship[inc] : relationship)

            const next = allPrimitivesWithRelationship(p, rel )
            if( !cache[p.id] ){
                cache[p.id] = next.length > 0 ? next.map(d=>({next: d, level: inc})) : [{level: inc}]
                if( inc === level ){
                    cache[p.id].forEach(d=>d.primitive = p)
                }
                //ids.push( next )
                ids = [...ids, ...next]
            }
        }
        const tempR =  decodeRelationship(isArray ? relationship[inc] : relationship)
        console.log(`Got ${ids.length} for next level check (${tempR[0]} / ${tempR[1]})`)
        thisRefFilter = tempR[1]
        inc++
    }while(dec--)

    const resolve = list.map((d,idx)=>{
        let pId = [startIds[idx]].flat()

        let next
        do{            
            next = pId.map(d=>cache[d]).flat().filter(d=>d)
            let out = [], found = false
            let nextPass = []
            for(const n of next){
                if( n && (n.level === level)){
                    found = true
                    out.push(n.primitive)
                }
                nextPass = nextPass.concat(n.next)
            }
            if( found ){
                return out
            }
            pId = nextPass
        }while( pId.length )
        return []
        /*
        let pId = startIds[idx]        

        let next
        do{
            next = cache[pId]
            if( next && (next.level === level)){
                return next.primitive
            }
            pId = next?.next
        }while( pId && next)
        return undefined*/
    })

    return resolve

}
async function filterItems(list, filters){
    let thisSet = undefined
    for(const filter of filters ){
        
        let {resolvedFilterType, pivot, relationship, check, includeNulls, skip, isRange} = PrimitiveConfig.commonFilterSetup( filter )
        if( skip){
            continue
        }
        const setToCheck = (thisSet || list)

        let lookups = await multiPrimitiveAtOrginLevel( setToCheck, pivot, relationship)

        let scope
        if( filter.type === "parent"){
            if( filter.sourcePrimId ){
                const sourcePrim = await fetchPrimitive(filter.sourcePrimId)
                let node = new Proxy(sourcePrim.primitives, parser)
                scope = node.allIds
                //scope = obj.primitive(filter.sourcePrimId).primitives.allIds
            }
        }else if( filter.subtype === "question"){
            //const prompts = uniquePrimitives(setToCheck.map(d=>d.findParentPrimitives({type: "prompt"})).flat())
            const prompts = await primitiveListOrigin( setToCheck, 1, ["prompt"], "ALL")
            scope = prompts.map(d=>d.id)
            check = check.map(d=>prompts.filter(d2=>Object.keys(d2.parentPrimitives ?? {}).includes(d))).flat().map(d=>d.id)
        }else if( filter.subtype === "search"){
            if( includeNulls){
                //scope = uniquePrimitives(setToCheck.map(d=>d.findParentPrimitives({type: "search"})).flat()).map(d=>d.id)
                const searches = await primitiveListOrigin( setToCheck, 1, ["search"], "ALL")
                scope = uniquePrimitives(searches).map(d=>d.id)
            }
        }else if(filter.type === "not_category_level1"){
            includeNulls = true
            check = []
            if( filter.sourcePrimId ){
                //scope = obj.primitive(filter.sourcePrimId).primitives.allIds
                const sourcePrim = await fetchPrimitive(filter.sourcePrimId)
                let node = new Proxy(sourcePrim.primitives, parser)
                scope = node.allIds
            }
        }
            
        
        thisSet = PrimitiveConfig.doFilter( {resolvedFilterType, filter, setToCheck, lookups, check, scope, includeNulls, isRange}, {parentIds:(primitive)=>Object.keys(primitive.parentPrimitives ?? {})})
    }
    return thisSet || list
}

async function __OLD__filterItems(list, filters){
    let thisSet = undefined
    for(const filter of filters ){
        console.log(filter)
        const invert = filter.invert ?? false
        let doCat1Check = false
        
        if( filter.type === "title" || filter.type === "parameter" || filter.type === "type"){
            if( filter.value !== undefined){
                const temp = []

                const check = [filter.value].flat()
                const setToCheck = (thisSet || list)
                console.log(`Filter ref type `, check, invert)
                let lookups = await multiPrimitiveAtOrginLevel( setToCheck, filter.pivot, filter.relationship)
                
                let idx = 0
                for(const d of setToCheck){
                    let data
                    if( filter.type === "title"){
                        data = lookups[idx].map(d=>d.title)
                    }
                    else if( filter.type === "parameter"){
                        data = lookups[idx].map(d=>d.referenceParameters?.[filter.param]).filter(d=>d)
                    }else if( filter.type === "type"){
                        data = lookups[idx].map(d=>d.referenceId)
                    }
                    if( invert ){
                        if( !data.reduce((a,d)=>a && check.includes(d), true) ){
                            temp.push( d )
                        }
                    }else{
                        if( data.reduce((a,d)=>a || check.includes(d), false) ){
                            temp.push( d )
                        }
                    }
                    idx++
                }
                thisSet = temp
            }
        }
        /*
        if( filter.type === "type"){
            const temp = []
            if( filter.map !== undefined){
                const check = [filter.map].flat()
                const setToCheck = (thisSet || list)
                console.log(`Filter ref type `, check, invert)
                let lookups = await multiPrimitiveAtOrginLevel( setToCheck, filter.pivot)
                
                let idx = 0
                for(const d of setToCheck){
                    //if( invert ^ check.includes( lookups[idx]?.[0]?.referenceId) ){
                    if( invert ^ lookups[idx].reduce((r,d)=>r || check.includes(d.referenceId), false)){
                        temp.push( d )
                    }
                    idx++
                }
            }
            thisSet = temp
        }
        if( filter.type === "parameter"){
            const setToCheck = (thisSet || list)
            let lookups = await multiPrimitiveAtOrginLevel( setToCheck, filter.pivot, filter.relationship)

            if( filter.is_range){
                const ranges = [filter.value].flat()

                const temp = []
                let idx = 0
                for(const d of setToCheck){
                    const values = lookups[idx].map(d=>d.referenceParameters?.[filter.param]).filter(d=>d)

                    if( values.length){
                        let pass = false
                        for( const range of ranges){
                            pass ||= values.reduce((a,c)=>a || (c >= (range.min_value ?? -Infinity) && c <= (range.max_value ?? Infinity)), false)
                        }
                        if( invert ^ pass) {
                            temp.push(d)
                        }
                    }
                    idx++
                }
                thisSet = temp
            }else{
                const temp = []
                let idx = 0
                let toCheck = filter.value

                let isArray = Array.isArray( toCheck )
                if( isArray ){
                    toCheck = filter.value.map(d=>d === null ? undefined : d)
                }
                if( toCheck === undefined){
                    toCheck = [undefined, null]
                    isArray = true
                }
                toCheck = [toCheck].flat()

                for(const d of setToCheck){
                    const titles = lookups[idx].map(d=>d.referenceParameters?.[filter.param])
                    if( invert ){
                        if( !titles.reduce((a,d)=>a && toCheck.includes(d), true) ){
                            temp.push( d )
                        }
                    }else{
                        if( titles.reduce((a,d)=>a || toCheck.includes(d), false) ){
                            temp.push( d )
                        }
                    }
                    idx++
                }
                thisSet = temp
            }
        }*/
        if( filter.type === "parent" ){


            const temp = []
            let hitList = [filter.value].flat()
            if( hitList.includes(undefined) || hitList.includes(null)){
                hitList = hitList.filter(d=>d !== undefined && d !== null )
                doCat1Check = true
            }
            const setToCheck = (thisSet || list)

            let lookups = await multiPrimitiveAtOrginLevel( setToCheck, filter.pivot, filter.relationship)
            
            let idx = 0
            if( filter.sourcePrimId){
                for(const d of setToCheck){
                    if (invert ^ lookups[idx].some(item => Object.keys(item?.parentPrimitives ?? {}).some(key => hitList.includes(key)))) {
                        temp.push( d )
                    }
                    idx++
                }
            }else{
                for(const d of setToCheck){
                    if (invert ^ lookups[idx].some(item => hitList.includes(item.id))) {
                        temp.push( d )
                    }
                    idx++
                }
            }
            thisSet = temp
        }
        if( filter.type === "not_category_level1" || doCat1Check){
            const hits = doCat1Check ? [filter.sourcePrimId] : [filter.value].flat()
            let l1Hits = []
            for( const d of hits){
                l1Hits = l1Hits.concat( (await primitiveChildren(await Primitive.findOne({_id: d}), "category") ).map(d=>d.id))
            }


            const setToCheck = (thisSet || list)

            let lookups = await multiPrimitiveAtOrginLevel( setToCheck, filter.pivot, filter.relationship)

            const temp = []
            let idx = 0
            for(const d of setToCheck){
                let allParents = lookups[idx].map(d=>Object.keys(d.parentPrimitives ?? {})).flat()
                let found =  allParents.filter(d=>l1Hits.filter(d2=>d2===d).length > 0).length === 0
                if( invert ^ found){
                    temp.push( d )
                }
                idx++
            }
            thisSet = temp
        }
        if( filter.type === "question"){
            const temp = []
            const promptCache = {}
            const questionCache = {}
            const serachCache = {}

            const setToCheck = (thisSet || list)
            let lookups = await multiPrimitiveAtOrginLevel( setToCheck, filter.pivot, filter.relationship)
            console.log(`Set = ${setToCheck.length} / Lookups = ${lookups.length}`)

            let idx = 0
            for(const d of (thisSet || list)){
                //let item = lookups[idx]?.[0]
                //if( item ){
                let pass = false
                for(const item of lookups[idx]){
                    let add = false
                    if( filter.subtype == "question"){
                        let promptId, prompt
                        const pCheck = Object.keys(item.parentPrimitives).map(d=>promptCache[d] ? d : undefined).filter(d=>d)
                        if(pCheck.length > 0 ){
                            promptId = pCheck[0]
                        }else{
                            prompt = (await primitiveParentsOfType(item, "prompt"))?.[0]
                            promptId = prompt?.id
                            promptCache[promptId] = true
                        }
                        if( promptId ){
                            let question = questionCache[promptId]
                            if( question === undefined ){
                                question = (await primitiveParentsOfType(prompt, "question"))?.[0]
                                questionCache[promptId] = {id: question.id}
                            }
                        
                            if( question ){
                                if( filter.map.includes( question.id)){
                                    add = true
                                }
                            }
                            
                        }
                    }
                    if( filter.subtype == "search"){
                        let search = Object.keys( item.parentPrimitives ?? {}).filter(d=>serachCache[d])?.[0]
                        let id = search
                        if( !search){
                            search = (await primitiveParentsOfType(item, "search"))?.[0]
                            id = search?.id
                        }
                        if( search ){
                            serachCache[id] = true
                            if( filter.map.includes( id )){
                                add = true
                            }
                        }
                    }
                    pass ||= add
                }
                if( invert ^ pass ){
                    temp.push(d)
                }
                idx++
            }
            thisSet = temp
        }
        console.log(`-- This set has ${thisSet.length} items for ${filter.type}`)
    }
    return thisSet || list
}

export async function getDataForImport( source, cache = {}, forceImportForQuery = false ){
    let fullList = []

    if(source.type === "query" && !forceImportForQuery){
        let node = new Proxy(source.primitives, parser)

        const nonImportIds = Object.keys(source.primitives).filter(d=>d !== "imports" && d !== "params").map(d=>node[d].uniqueAllIds).flat().filter((d,i,a)=>a.indexOf(d)===i)
        let list = await fetchPrimitives( nonImportIds, undefined, DONT_LOAD)

        const viewFilters = getBaseFilterForView( source ).map(d=>{
            if( d.type === "parameter" && (d.value?.[0].min_value !== undefined  || d.value.min_value !== undefined || d.value.max_value !== undefined  || d.value?.[0].max_value !== undefined )){
                return {
                    ...d,
                    is_range: true
                }
            }
            return d
        })
        if( viewFilters.length > 0 ){
            list = await filterItems( list, viewFilters)
        }

        const params = await getConfig( source) 
        if( params.extract ){
            const check = [params.extract].flat()
            list = list.filter(d=>check.includes(d.referenceId))
        }
        list = list.filter(d=>!["segment","category","query"].includes(d.type))
        
        console.log(`Import from query = ${list.length} direct items`)
        return list
    }

    console.log(`Importing from other sources of ${source.plainId} / ${source.id}`)
    const sources = await primitivePrimitives(source, 'primitives.imports')

    for( const imp of sources){
        console.log(`Doing source ${imp.id}`)
        let list = []
        if( Object.keys(imp.primitives).includes("imports")   ){
            if( cache[imp.id]){
                list = cache[imp.id]
            }else{
                list = list.concat( await getDataForImport( imp, cache ))
                cache[imp.id] = list
            }
        }else{
            let node = new Proxy(imp.primitives, parser)
            if( source.referenceParameters?.path ){
                console.log(`---- ${source.referenceParameters?.path}`)
                node = node.fromPath(source.referenceParameters?.path)
            }
            let ids

            if( !source.referenceParameters?.path && imp.type === "segment"){
                list = await nestedItems( imp )
            }else{
                ids = node.allIds
                list = await fetchPrimitives(ids, undefined, DONT_LOAD)
                console.log(`loaded leaves`)
            }
        }
        const params = await getConfig( source) 
        if( params.descend ){
            list = uniquePrimitives([list, await primitiveDescendents( list, undefined, {fullDocument:true} )].flat())
        }
        if( params.referenceId ){
            list = list.filter(d=>d.referenceId === params.referenceId) 
        }
        if( params.type ){
            list = list.filter(d=>d.referenceId === params.type) 
        }
        const config = source.referenceParameters?.importConfig?.filter(d=>d.id === imp.id)
        if( config && config.length > 0){
            let filterOut
            console.log(`GOT ${config.length} configs to scan`)
            for(const set of config ){
                if( set.filters ){
                    let thisSet = await filterItems( list, set.filters)
                    filterOut = (filterOut ?? []).concat( thisSet ?? list)
                }
            }
            list = filterOut ?? list
            for(const set of config ){
                if( set.referenceId ){
                    const prev = list.length
                    list = (await Promise.all(list.map(async (d)=>await primitiveDescendents(d, undefined, {allPaths: true, first: true, referenceId: set.referenceId, fullDocument:true} ) ))).flat()
                }
            }
        }
        console.log(`Import pivot = ` + source.referenceParameters?.pivot )
        if( source.referenceParameters?.pivot){
            if(typeof(source.referenceParameters.pivot ) === "number"){
                list = await primitiveListOrigin( list, source.referenceParameters.pivot, ["result", "entity"])
            }else{
                list = uniquePrimitives((await multiPrimitiveAtOrginLevel( list, source.referenceParameters.pivot.length, source.referenceParameters.pivot)).flat())
            }
        }
        fullList = fullList.concat(list)
    }

    if(source.type === "view" ){
        const viewFilters = getBaseFilterForView( source ).map(d=>{
            if( d.type === "parameter" && (d.value?.[0].min_value !== undefined  || d.value.min_value !== undefined || d.value.max_value !== undefined  || d.value?.[0].max_value !== undefined )){
                return {
                    ...d,
                    is_range: true
                }
            }
            return d
        })
        fullList = await filterItems( fullList, viewFilters)
    }
    
    let out = uniquePrimitives(fullList)
    console.log(`IMPORT FROM ${source.plainId} = ${out.length}`)
    return out
}
export function getBaseFilterForView( primitive){
    return [
            "column",
            "row",
            (primitive.referenceParameters?.explore?.filters ?? []).map((d,i)=>i)
        ].flat().map(d=>primitiveAxis(primitive,d)).filter(d=>d).map(d=>PrimitiveConfig.encodeExploreFilter(d, d.filter, true)).filter(d=>d)
}
function primitiveAxis( primitive, axisName){
    let axis 
    if( axisName === "column" || axisName === "row"){
        axis = primitive.referenceParameters?.explore?.axis?.[axisName]
    }else{
        axis = primitive.referenceParameters?.explore?.filters?.[ axisName]
    }
    if( axis ){
        if( ["question", "parameter", "title", "type"].includes(axis.type)){
            return {filter: [],...axis, passType: PrimitiveConfig.passTypeMap[axis.type] ?? "raw"}
        }
        const connectedPrim = isNaN(axisName) ? primitive.primitives?.axis?.[axisName]?.[0] : primitive.referenceParameters?.explore.filters?.[axisName]?.sourcePrimId            
        if( connectedPrim ){
            return {filter: [], ...axis, primitiveId: connectedPrim}
        }
    }
    return {type: "none", filter: []}

}
export async function primitiveOriginAtLevel( primitive, pivot ){
    let node = primitive

    for( let idx = 0; idx < pivot ; idx++){
        const oId = primitiveOrigin( node )
        node = await Primitive.findOne({_id: oId}) 
    }
    return node
}
export async function primitiveListOrigin( list, pivot, parentTypes = undefined, relationship = "origin", referenceId ){
    let stopOnMatch = false
    if( pivot === "hierarchy" && (parentTypes || referenceId)){
        pivot = 100
        stopOnMatch = true
    }
    for( let idx = 0; idx < pivot; idx++ ){
        let originIds 
        
        if( relationship = "ALL"){
            originIds = list.map(d=>{
                return d.parentPrimitives ? Object.keys(d.parentPrimitives) : undefined
            }).flat(Infinity).filter((d,i,a)=>d && a.indexOf(d)===i)
        }else{
            originIds = list.map(d=>{
                return (Object.keys(d.parentPrimitives ?? {})).filter((k)=>d.parentPrimitives[k].includes("primitives." + relationship))[0]
            }).filter((d,i,a)=>a.indexOf(d)===i)
        }
        console.log(`ids = ${originIds.length}`)

        const query = {$and:[
            {
                _id:  {$in: originIds}
            },
            { deleted: {$exists: false}}
        ]}
        list = await Primitive.find(query )
        
        console.log( `unique = `, list.length)

        if( stopOnMatch ){
            let match = list.filter(d=>referenceId ? d.referenceId === referenceId  : parentTypes.includes(d.type))
            console.log(`match = ${match.length}`)
            if( match.length > 0){
                return match
            }
        }else{
            if( parentTypes ){
                list = list.filter(d=>parentTypes.includes(d.type))
                console.log( `filtered = `, list.length)
            }
        }
    }
    if( stopOnMatch ){
        return []
    }
    return list
}

export async function getDataForProcessing(primitive, action, source, options = {}){
    let startList = options.list 
    let list = []

    if(source === undefined){
        source = primitive
    }

    const category = await Category.findOne({id: primitive.referenceId})

    let type = primitive.referenceParameters?.type || action.type //|| category.type
    let target = primitive.referenceParameters?.target || action.target || (typeof(category) === "string" ? category?.target : undefined) || (Object.keys(source?.primitives ?? {}).includes("imports") ? "items" : "children") || (source.type === "category" ? "items" : undefined)
    //let target = primitive.referenceParameters?.target || action.target || category?.target || "children"
    let referenceId = primitive.referenceParameters?.referenceId || action.referenceId || category?.referenceId
    let field = primitive.referenceParameters?.field || action.field || "title"

    if( action.action_override){
        if( action.target){
            target = action.target
        }
        if( action.type){
            type = action.type
        }
        if( action.referenceId){
            referenceId = action.referenceId
        }
    }

    if(target === "descend"){
        if( startList ){
            list = []
            for(const d of startList){
                list = list.concat( await primitiveDescendents(d, type) )
            }
            console.log(`used startList of ${startList.length} to find ${list.length}`)
        }else{
            //list = await primitiveDescendents(source, type)
            list = await primitiveDescendents(source, type, {fullDocument:true})
        }
    }else if(target === "all_descend"){
        list = await primitiveDescendents(source, type, {fullDocument:true, paths: ["origin", "auto", "ref", "link"]})
    }else if(target === "link"){
        list = await primitiveDescendents(source, type, {fullDocument:true, paths: ["link"]})
    }else if(target === "children"){
        list = startList || await primitiveChildren(source)
    }else if(target === "evidence"){
        list = startList || await primitiveDescendents(source, undefined, {fullDocument:true})
        type = "evidence"
        console.log(`GOT for evidence ${list.length}`)
    }else if(target === "level2" ){
        list = startList || await primitiveChildren(source)
        list = (await Promise.all(list.map(async (d)=>await primitiveChildren(d)))).flat()
    }else if( target.slice(0,8) === "results."){
        list = await primitivePrimitives(source, target )
        console.log(`GOT for result ${list.length}`)
    }else if( target === "ref"){
        list = await primitivePrimitives(source, 'ref')
        console.log(`GOT for ref ${list.length}`)
    }else if( target === "instance_peer"){
        list = await primitivePrimitives(primitive, "ref" )
        const instance = await fetchPrimitive( options.instance )
        if( instance ){
            const data = list.map(d=>instance?.computeCache?.[d.id])
            return [list.filter((_,idx)=>data[idx]), data.filter(d=>d)]
        }else{
            return [[],[]]
        }
    }else if( target === "items"){
        list = await getDataForImport( source )
        console.log(`TOTAL IMPORT = ${list.length}`)
    }else if( target === "parents"){
        list = await primitiveListOrigin( [source], 1)
        console.log(`TOTAL parents = ${list.length}`)
    }else if( target === "hierarchy"){
        list = await primitiveListOrigin( [source], "hierarchy", undefined, "ALL", referenceId)
        console.log(`TOTAL parents = ${list.length}`)
    }else if( target === "items_parent_descend"){
        list = await getDataForImport( source )
        console.log(`TOTAL Stage 1 = ${list.length}`)
        
        const pivot = primitive.referenceParameters.pivot ?? 1
        list = await primitiveListOrigin( list, pivot, undefined, primitive.referenceParameters.pivotBy)
        console.log(`TOTAL Stage 2 = ${list.length}`)
        
        let out = []
        for( const d of list){
            out.push( await primitiveDescendents(d, type, {fullDocument:true, paths: ["origin", "auto", "ref"]}))
        }
        list = uniquePrimitives( out.flat(Infinity) )
        console.log(`TOTAL Stage 3  = ${list.length}`)

    }
    if( primitive.referenceParameters?.pivot && primitive.referenceParameters.pivot > 0){            
        console.log(`Primitive pivot = ${primitive.referenceParameters.pivot} / ${primitive.referenceParameters.pivotBy}`)
        list = await primitiveListOrigin( list, primitive.referenceParameters.pivot, ["result", "entity", "evidence"], primitive.referenceParameters.pivotBy)
    }
    if( action.constrainId ){
        console.log(`Filtering ${list.length} for constraint ${action.constrainId} -- QUESTION OVERRIDE`)

        let questions = await primitiveChildren(primitive, "question")
        console.log(`Got ${questions.length} from task ${primitive.id}`)
        let prompts = []
        for(const q of questions){
            prompts.push( (await primitiveChildren(q, "prompt")).map((d)=>d.id) )
        }
        prompts = prompts.flat()

        console.log(`Got ${prompts.length}`)
        list = list.filter((d)=>Object.keys(d.parentPrimitives).filter((d)=>prompts.includes(d)).length > 0)
        console.log(`Filtered to ${list.length} items`)

    }

    if( type ){
        list = list.filter((d)=>d.type === type)
    }
    if( referenceId ){
        if( Array.isArray(referenceId)){
            list = list.filter((d)=>referenceId.includes(d.referenceId ))
        }else{
            list = list.filter((d)=>d.referenceId === referenceId)
        }
    }
    if( options.childPrimitiveIds ){
        list = list.filter((d)=>options.childPrimitiveIds.includes(d._id.toString()))
    }
    if( primitive.referenceParameters?.postPivot && primitive.referenceParameters.postPivot > 0){            
        console.log(`Post Primitive pivot = ${primitive.referenceParameters.postPivot} / ${primitive.referenceParameters.postPivotBy}`)
        list = await primitiveListOrigin( list, primitive.referenceParameters.postPivot, ["result", "entity"], primitive.referenceParameters.postPivotBy)
    }

    if( list === undefined){
        return []
    }
    
    if( field){
        if( field === "context" ){
            const hasContext = list.filter(d=>d.referenceParameters?.context).length > 0
            if( !hasContext ){
                const out = [], listOut = []
                for(const d of list){
                    const context = await buildContext(d)
                    if( context ){
                        listOut.push(d)
                        out.push( context )
                    }
                }
                console.log(`+++++ For context HAD ${list.length} now ${listOut.length} +++++`)
                return [listOut, out]
            }

        }
        if( field === "full_content" ){
            const out = [], listOut = []
            let c = 0
            for(const d of list){
                let fragmentList = await ContentEmbedding.find({foreignId: d.id},{foreignId:1, part:1, text: 1})
                let content
                if( fragmentList && fragmentList.length > 0){
                    content = fragmentList.map(d=>d.text).join(". ")
                    console.log(`Fetched content from embbeding store ${c}`)
                }else{
                    content = (await getDocumentAsPlainText( d.id ))?.plain
                    console.log(`Fetched content from bucket ${c}`)
                }
                if( content ){
                    listOut.push(d)
                    out.push( content )
                }
                c++
                /*if( c > 100){
                    console.log(`STOP FOR DEBUG`)
                    break
                }*/
            }
            console.log(`+++++ For content HAD ${list.length} now ${listOut.length} +++++`)
            return [listOut, out]
        }

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


export async function updateFieldWithCallbacks(id, field, value, req = {}){
    let result

    try {

        const prim = await Primitive.findOneAndUpdate(
            {
                    "_id": new ObjectId(id),
            }, 
            {
                $set: { [field]: value },
            },
            {new: true})
        
            if( field === 'referenceParameters.notes'){                
                console.log(`Queue purging of old document for ${id}`)
                QueueDocument().add(`doc_refresh_${id}`, 
                    {
                        command: "refresh", 
                        id: id, 
                        value: value, 
                        req: {user: {accessToken: req.user.accessToken, refreshToken: req.user.refreshToken}}
                    })
            }

        if( prim){
            const lastField = field.split('.').slice(-1)?.[0]
            const category = await Category.findOne({id: prim.referenceId})
            if( category && category.actions ){
                for(const action of category.actions){
                    if( action.onUpdate ){
                        if( action.onUpdate === true || (Array.isArray(action.onUpdate) && action.onUpdate.includes(lastField) )){
                            result = await doPrimitiveAction(prim, action.key, undefined)
                        }
                    }
                }
            }
            if( category ){
                const parameter = category.parameters[lastField]
                if( parameter?.embed && prim.referenceParameters?.[lastField]){
                    buildEmbeddingsForPrimitives([prim], `param.${lastField}`, true, true)
                }
            }
            const config = PrimitiveConfig.typeConfig[prim.type]
            if( config?.embed){
                if( config.embed.includes(field)){
                    buildEmbeddingsForPrimitives([prim], field, true, true)
                }
            }
            
            
            SIO.notifyPrimitiveEvent(prim, [
                {
                    type: "set_fields",
                    primitiveId: id,
                    fields:{[field]: value}
                }
            ])
        }else{
            console.log(`Couldnt find ${id} for update of ${field}`)
        }

      } catch (err) {
        console.log(`Error in updateFieldWithCallbacks`)
        console.log(err)
    }
}

export async function dispatchControlUpdate(id, controlField, status, flags = {}){
    try{
        let primitive 
        //console.log(`${id} = ${controlField} : ${status}`)

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
export async function getFilterName( scopeNode ){
    if( scopeNode?.referenceParameters?.importConfig ){
        const idsToLookup = []
        scopeNode.referenceParameters.importConfig.forEach(d=>{
            return d.filters.forEach( d=>{
                if( d.type === "parent"){
                    idsToLookup.push(d.value)
                }
            })
        })
        if( idsToLookup.length > 0){
            const parents = await fetchPrimitives(idsToLookup)
            const fargments = []
            for(const d of parents){
                let name = d.title
                if( d.type === "segment"){
                    const parentName = await getFilterName( d)
                    if( parentName && parentName !== "New segment"){
                        name = parentName
                    }
                }
                fargments.push( name )
            }
            const segmentName = fargments.join(", ")
            return segmentName
        }
    }
}


export async function primitiveParents(primitive, path){
    let ids 
    if( path ){
        ids = Object.keys(primitive.parentPrimitives).filter((d)=>primitive.parentPrimitives[d].includes(`primitives.${path}`))
    }else{
        ids = Object.keys(primitive.parentPrimitives).filter((d)=>{
            return primitive.parentPrimitives[d].filter(d=>d !== `primitives.imports`).length > 0
        })
    }
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

export async function createSegmentQuery(primitive, queryData, importData){
    let interimSegment
    let needsSegment = true
    if( queryData.referenceId === 113 || queryData.referenceId === 112 || queryData.referenceParameters?.useAxis){
        needsSegment = false
    }

    if( needsSegment){
        const candidates = await primitiveChildren( primitive, "segment")
        interimSegment = candidates.find(d=>PrimitiveConfig.checkImports( d, primitive.id, importData?.[0]?.filters ))
        if( !interimSegment ){
            const segmentData = {
                parent: primitive.id,
                workspaceId: primitive.workspaceId,
                data:{
                    type: "segment",
                    title: "New segment",
                    referenceParameters:{
                        importConfig: importData
                    }
                }
            }
            
            interimSegment = await createPrimitive(segmentData)
            await addRelationship( interimSegment.id, primitive.id, "imports")
        }
    }
    const newPrimitiveData = {
        data: queryData,
        parent: interimSegment ?? primitive,
        workspaceId: primitive.workspaceId,
        referenceParameters: {"target":"items"} 
    }

    let newPrimitive = await createPrimitive(newPrimitiveData)
    
    await addRelationship( newPrimitive.id, interimSegment ? interimSegment.id : primitive.id, "imports")
    
    newPrimitive = await fetchPrimitive(newPrimitive.id)

    if( newPrimitive.type === "query"){
        doPrimitiveAction(newPrimitive, "custom_query")
    }else if( newPrimitive.type === "summary"){
        doPrimitiveAction(newPrimitive, "rebuild_summary")
    }

    return {primitiveId: newPrimitive.id, segment: interimSegment?.id}
}
export async function doPrimitiveAction(primitive, actionKey, options, req){

    if( primitive.type === "search" ){
        return await QueryQueue().doQuery(primitive, options)
    }
    if( actionKey === "d_test"){
        const ids = options.ids

        console.time(`Fetching base`)
        const prims = await fetchPrimitives( ids, undefined, {_id: 1, referenceId:1} )
        console.timeEnd(`Fetching base`)
        console.time(`descend`)
        const items = [prims.filter(d=>d.type==="result"), await primitiveDescendents( prims, "result", false)].flat()
        console.timeEnd(`descend`)
        return

    }
    if( actionKey === "new_query"){
        return await createSegmentQuery(primitive, options.queryData, options.importData)
    }
    if( actionKey === "refetch_source"){
        await removeDocument( primitive.id )
        await ContentEmbedding.deleteMany({foreignId: primitive.id})
        const text = (await getDocumentAsPlainText(primitive.id ))?.plain
        if( text ){
            const embedded = await buildDocumentTextEmbeddings( text )
            await storeDocumentEmbeddings( primitive, embedded )
        }
        return
    }
    if( actionKey === "auto_cascade" && options.ids && options.cascade_key){
        for(const id of options.ids ){
            const p = await  Primitive.findOne({_id:  new ObjectId(id)})



            await doPrimitiveAction(p, options.cascade_key, {...options, ids: undefined, cascadeKey: undefined}, req)
        }
        return
    }

    try{
        if( actionKey == "quick_query" ){
            const text = await getDocumentAsPlainText(primitive.id)

            if( text.plain ){
                const response = await processPromptOnText(text.plain,
                    {
                        type: "article",
                        prompt: `Provide a sumamry of how ${options.lookup} are disucssed in this article`,
                        output: `Provide the result as a json object  with a field called "results" containing your summary`,
                        debug: true,
                        debug_content: true

                    }
                )
                console.log(response)
                if( response.success ){
                    return response.output
                }                

            }
            return

        }
        if( actionKey === "merge_query_results"){
            return await mergeDataQueryResult( primitive, options)
        }
        if( actionKey === "shallow_clone"){
            const oId = primitiveOrigin( primitive )
            const paths = primitive.parentPrimitives[ oId ].filter(d=>d!='primitives.origin')
            const newPrim = await createPrimitive( {
                workspaceId: primitive.workspaceId,
                paths: ['origin'],
                parent: oId,
                data:{
                    type: primitive.type,
                    referenceId: primitive.referenceId,
                    title: `Copy of ${primitive.title}`,
                    referenceParameters: primitive.referenceParameters
                }
            } )
            if( newPrim ){
                for( const path of paths){
                    console.log(`Adding ${path}`)
                    await  addRelationship(oId, newPrim.id, path)
                }
            }
        }
        if( actionKey === "combine"){
            const otherIds = options.ids 
            if( otherIds ){
                let others = await Primitive.find({_id: {$in: otherIds}})
                const fields = options.fields ?? ["title","referenceId"]
                console.log(`Attempting to merge ${others.length} primitives`)
                others = others.filter(d=>(d.id !== primitive.id) && fields.reduce((a,field)=>{
                    let result
                    if( field.includes(".") ){          
                        throw "NOT IMPLEMENTED"
                    }
                    result = d[field] === primitive[field]
                    return result && a
                },true)
                )
                console.log(`Combining ${others.length} post filter`)
                for(const other of others){
                    let pp = new Proxy(other.primitives ?? {}, parser)
                    let childIds = pp.uniqueAllIds
                    console.log("Children", childIds)
                    for(const childId of childIds){
                        const paths = pp.paths( childId ).map(d=>"primitives"+d)
                        for(const path of paths){
                            //console.log(`Remove ${childId} from ${other.id} at ${path}`)
                            //console.log(`Add ${childId} to ${primitive.id} at ${path}`)
                            await removeRelationship( other.id, childId, path  )
                            await addRelationship( primitive.id, childId, path  )
                        }
                    }
                    const parentIds = Object.keys(other.parentPrimitives ?? {})
                    console.log("Parents ", parentIds)
                    for(const parentId of parentIds){
                        for(let path of other.parentPrimitives[parentId]){
                            if( path !== "primitives.origin" && path !== "primitives.auto"){
                                //console.log(`Remove ${other.id} from ${parentId} at ${path}`)
                                //console.log(`Add ${primitive.id} to ${parentId} at ${path}`)
                                await removeRelationship( parentId, other.id, path  )
                                await addRelationship( parentId, primitive.id, path  )
                            }else{
                                console.log(`Skip ${path}`)
                            }
                        }
                    }
                    console.log("")
                    await removePrimitiveById( other.id )
                }
            }
            return
        }
            if( actionKey === "zfat_test"){
                console.log(`Testing ${options.url}`)
                const result = await fetchURLPlainText(options.url, false, options.preferPdf)
                if( result ){
                    console.log( result.title)
                    console.log( result.description)
                }else{
                    console.log(`Nothing returned`)
                }
                return
            }
            if( actionKey === "segment_test"){
                const target = options.parent ? (await primitiveParentsOfType(primitive, ["working", "view", "segment", "query"]))?.[0] : primitive

                const segments = await getSegemntDefinitions( target )
                for(const d of segments){
                    console.log(d)
                }
                console.log(segments.length, " segments")
                return
            }
    if( actionKey === "run_process"){
        await runProcess( primitive )
        return
    }
    if( actionKey === "auto_extract" || actionKey === "auto_summarize"){
        console.log(options)
        const source = options.source ? await fetchPrimitive( options.source ) : undefined
        const [items, toSummarize] = await getDataForProcessing(primitive, {...(category?.openai?.summarize?.source ?? options ?? {})}, source, {instance: options?.instance} )
        console.log(items.length, "items")
        if( items.length > 0){

            const evidenceCategory = await Category.findOne({id: items[0].referenceId})
            let config = evidenceCategory?.ai?.summarize?.[ options.summary_type ?? "summary"] ?? {}
            if( options.summary_type === "custom" && options.prompt){
                config.prompt = options.prompt

                const segmentSource = primitive.primitives?.imports?.[0]
                if( segmentSource ){
                    console.log(`getting ${segmentSource}`)
                    const segment = await fetchPrimitive( segmentSource )
                    if( segment ){
                        const name = (await getFilterName(segment)) ?? segment.title
                        config.prompt = config.prompt.replaceAll('{focus}', name)
                        config.prompt = config.prompt.replaceAll('{segment}', name)
                    }
                }
            }
            
            let summary
            const toProcess = toSummarize.map(d=>Array.isArray(d) ? d.join(", ") : d)
            if( actionKey === "auto_extract" ){
                summary = await processPromptOnText(toProcess, {
                    ...config, 
                    focus: options.focus, 
                    output:`Provide the result as a json object  with an array called results. Each entry in the array should be a string containing one of the results`,
                    debug: true, 
                    debug_content:true})

                if( summary && summary.output ){
                    let list = summary.output
                    if( primitive.referenceParameters?.lookup == "organization"){
                        const task = await primitiveTask( primitive )
                        console.log(`Extracted ${list.length}`)
                        list = list.map(d=>{
                            return [d,d.replace(/\binc\b/i,"").trim()]
                        }).flat().filter((d,i,a)=>a.indexOf(d)===i)
                        console.log(list)
                      //  list = list.filter(d=>!["HSBC", "Wells Fargo", "Goldman Sachs","Citi", "JP Morgan", "JPMorgan Chase", "Bank of America", "BNP Paribas"].includes(d))
                        list = (await resolveAndCreateCompaniesByName(list, task, 29, undefined, false, true )).map(d=>d.id).filter((d,i,a)=>a.indexOf(d)===i)
                        console.log(` - Resolved to ${list.length}`)

                    }
                    
                    return list
                }
            }
            if( actionKey === "auto_summarize"){
                let result
                if( primitive.referenceParameters?.content?.group){
                    const major = (await primitiveChildren( source, "category"))?.[0]
                    if( major ){
                        console.log(`Got major category = ${major.title}`)
                        const segments = await primitiveChildren(major, "category")
                        for( const segment of segments){
                            const idxList = items.map((d,i)=>Object.keys(d.parentPrimitives).includes(segment.id) ? i : undefined).filter(d=>d)
                            const set = idxList.map(d=>toProcess[d])
                            console.log(`-- ${segment.title} : ${idxList.length} of ${items.length}`)
                            if( set.length > 0){
                                summary = await summarizeMultiple( set, {...config, focus: segment.title, debug: true, debug_content:true})
                                if( summary && summary.summary ){
                                    let part = summary.summary
                                    part = part.replace(/\\n/g, '\n');
                                    part = part.replace(/\n+/g, '\n');
                                    part = part.replace(/^\s*\d+\)?\.?\s*/gm, '');

                                    result ||= ""
                                    result += `${segment.title}\n${part}\n\n`
                                }
                            }

                        }
                    }
                    if(result){
                        const streamline = await processPromptOnText(result,{
                            opener: "here is a summary i had an AI produce, i like the headline but some of the content is repetitive.",
                            prompt: "Produce a new coherent summary with each section being a similar length to the original but remove any duplication from the sections - ensuring content is aligned only to the most relevant section. Keep the original headlines and ensuring no nuance is lost",
                            output: "Provid the output as a json object with a field called 'results' containing the new sumamry as a string with suitable linebreaks to deliniate sections",
                            engine: "gpt4p",
                            debug: true,
                            debug_content:true
                        })
                        if( streamline && streamline.output){
                            result = streamline.output?.[0]
                        }
                    }
                }else{
                    summary = await summarizeMultiple( toProcess, {
                                                            ...config, 
                                                            focus: options.focus, 
                                                            batch: toProcess.length > 1000 ? 100 : undefined,
                                                            temperature: options.temperature ?? primitive.referenceParameters?.temperature,
                                                            allow_infer: true,
                                                            markdown: options.markdown, 
                                                            heading: options.heading,
                                                            outputFields: options.summary_type === "custom" ? undefined : [
                                                                {field:"headline", prompt:"a short overview", header: true},
                                                                {field:"main", prompt: "the main summary", formatted: true},
                                                                {field:"noteworthy", prompt: "a list of the top 5 most noteworthy insights as a single string in markdown format.", formatted: true},
                                                            ],
                                                            debug: true, 
                                                            debug_content:true
                                                        })
                    if( summary && summary.summary ){
                        result = summary.summary

                        await addRelationshipToMultiple(primitive.id, items.map(d=>d.id), "ref", primitive.workspaceId)

                        if( !options.markdown){
                            result = result.replace(/\\n/g, '\n');
                            result = result.replace(/\n+/g, '\n');
                            result = result.replace(/^\s*\d+\)?\.?\s*/gm, '');
                            result = result.trim().replace(/\n/g, '\n\n');                 
                        }
                    }
                }
                return result
            }
        }
        return undefined
    }
    if( actionKey === "replicate_flow"){
        await replicateFlow( primitive, options.target )
        return

    }

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

        let action = category.actions.find((d)=>d.key === actionKey)
        if( action ){
            const command = action?.command || actionKey
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
                    const thisSet = (action.cascadeKey || []).filter((d)=>options.forceCascade || !child.action_tracker || !child.action_tracker[d])
                    console.log(`Now doing  ${thisSet.join(", ")}`)
                    for( const a of thisSet){
                        console.log(`-- ${a}:`)
                        const sub = await doPrimitiveAction(child, a, options, req)
                        if( sub ){
                            result = result.concat( sub  )
                        }
                    }
                }
                done = true
            }
            if( command === "extractor"){
                await extractor( primitive, action )
                return
            }
            if( command === "link_related_evidence"){
                let category = await Category.findOne({id: primitive.referenceId})
                const context = await buildContext( primitive, category )
                if( !context || context.length === 0){
                    throw "No context"
                }


                let opener = action.opener ?? `I am undertaking market research into an idea.  Here is a summary of a ${category.title}:`
                let prompt = action.prompt ?? `I have a database with hundreds of articles about the topic which i can run a semantic query on.  Provide a list of search keywords (multiword is okay) suitable for a semantic query which would find relevant evidence to support or contradict this ${category.title}. `

                const process = `${opener}\n${context}\n\n${action.prompt}`

                const result = await processAsSingleChunk( process, {
                    output: `Provide your response as a json array called results with each entry being a string containing one of the suggested queries.`,
                    debug: true
                } )
                if( result.success ){
                    const list = await Primitive.find({
                        workspaceId: primitive.workspaceId,
                        referenceId: action.referenceId,
                        deleted: {$exists: false}
                    })
                    console.log(`Have ${list.length} in scope`)
                    let idx = 0, batch = 1000
                    const threshold = primitive.referenceParameters?.threshold ?? 0.92
                    let field = "title"
                    let targetList = []

                    for(const term of result.results){
                        console.log(`Doing for ${term}`)

                        const query = await buildEmbeddings(term)
                        if( query.success ){
                            const scope = list.slice(idx, idx + batch).map(d=>d.id)
                            const searchTerms = Math.min(scope.length * 2, 10000) 
                            const matches = await Embedding.aggregate([
                                {
                                    "$vectorSearch": {
                                        "queryVector": query.embeddings,
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
                                    console.log(result.foreignId, result.score)
                                    targetList.push(result.foreignId)
                                }
                            }
                        }
                    }
                    targetList = targetList.filter((d,i,a)=>a.indexOf(d)===i)
                    for(const d of targetList){
                        await addRelationship( primitive.id, d, 'link')
                    }
                }
            }
        if( command === "dedupe_organization"){
            const [targets, data] = await getDataForProcessing(primitive, action)
            console.log(`Got ${targets.length} to dedupe`)
            
            const map = {}

            for(let idx = 0; idx < targets.length; idx++){
                map[data[idx]] ||= []
                map[data[idx]].push(targets[idx])
            }
            console.log(`Grouped into ${Object.keys(map).length} sets`)
            for(const d of Object.keys(map)){
                if( map[d].length > 1){
                    console.log(`${d} -> ${map[d].length} : ${map[d].map(d=>d.title).join(", ")}`)
                    const target = map[d].shift()
                    const ids = map[d].map(d=>d.id)
                    console.log(`${target.id} < ${ids.join(", ")}`)
                    await doPrimitiveAction( target, "combine", {ids})
                }
            }
            

        }
            if(command === "build_generic_view" ){
                const referenceId = (options.referenceId === "undefined") ? undefined : ((options.referenceId !== undefined ? parseInt( options.referenceId ) : undefined )|| action.referenceId)
                const baseId = action.baseCategoryId || PrimitiveConfig.typeConfig["view"].defaultReferenceId 
                
                if(  referenceId === undefined ){
                    //throw `Cant add view to ${primitive.id}`
                }

                const paths = ['origin']
                const newPrim = await createPrimitive({
                    workspaceId: primitive.workspaceId,
                    parent: primitive.id,
                    paths: paths,
                    data:{
                        type: "view",
                        referenceId: baseId,
                        title: "New view",
                        referenceParameters:{
                            target: "items",
                            referenceId: referenceId,
                            descend: referenceId !== undefined ? true : false,
                            self: true
                        }
                    }
                })
                if( newPrim ){
                    await addRelationship(newPrim.id, primitive.id, "imports")

                    console.log(`Check circular child ${newPrim.id}`)
                    const check = await Primitive.findOne({_id:  primitive._id})
                    await primitiveDescendents(check, undefined, {paths: []})
                    console.log(`Check circular parent`)
                    const check2 = await Primitive.findOne({_id:  newPrim._id})
                    await primitiveParents( check2 )
                    console.log(`DONE CHECKS`)
                }
            }
            if(command === "keyword_metrics"){
                //const result = await getGoogleAdKeywordMetrics(options.keywords, req)
                let data
                const result = await getGoogleAdKeywordMetrics(primitive.title, req)
                if( result.success){
                    data = result.results[0]
                    let updated  = {
                        "avg_monthly": data.monthly ? parseInt(data.monthly.reduce((a,c)=>a+c,0) / 12) : 0,
                        "last_12_mo":data.monthly,
                        "competition": data.competition,
                        "bid_high": data.highBid,
                        "bid_low": data.lowBid
                    }
                    await dispatchControlUpdate(primitive.id, "referenceParameters", updated)
                    console.log(updated)
                }
            }
            if( command === "screenshot"){
                if( primitive.referenceId === 100){
                    const protocol = "https"//req.protocol;
                    const host = "venture-fundamentals.ue.r.appspot.com"//req.get('host'); // Includes hostname and port if applicable
                    const url = `${protocol}://${host}/published/renderPage/${primitive.id}`;
                    const result = await fetchURLScreenshot( url )
                    if( result ){
                        if( result.data){
                            await decodeBase64ImageToStorage(result.data, primitive.id, "cc_vf_images", result.type)
                        }
                    }
                }
            }
            if( command === "generate"){

                function convertParam(category,source,d){
                    if( d === "title"){
                        return source.title
                    }
                    if( category.parameters[d]){
                        if( source.referenceParameters[d]?.length > 0 ){
                            return `${category.parameters[d].title}: ${source.referenceParameters[d]}`
                        }
                    }
                }

                const title = primitive.title
                const category = await Category.findOne({id: primitive.referenceId})
                const resultCategory = await Category.findOne({id: action.resultCategoryId})
                const context = action.useContext ? (await buildContext(primitive, category)) : action.context_fields?.map(d=>convertParam(category, primitive, d)).filter(d=>d).join("\n")
                const resultSet = category.resultCategories?.find((d2)=>d2.resultCategoryId == action.resultCategoryId)?.id

                if( !category || (action.updateSelf !== true && !resultCategory) || (action.updateSelf !== true && resultSet === undefined)){
                    if( action.test ){
                        console.log(`Action would fail....`)
                        console.log( `Generate is missing details ${category !== undefined} ${resultCategory !== undefined} ${resultSet !== undefined}`)

                    }else{
                        throw `Generate is missing details ${category === undefined} ${resultCategory === undefined} ${action.updateSelf !== true}  ${resultSet === undefined}`
                    }
                }

                let info = ""
                let active_fields = []
                let id_map = {}
                for(const d of action.inputs){
                    const inputCategory = await Category.findOne({id: d.referenceId})
                    //const resultSet = category.resultCategories.find((d2)=>d2.resultCategoryId == d.referenceId)?.id

                    id_map[d.plural] = []
                    const [items, _] = await getDataForProcessing( primitive, {target: d.target ?? "all_descend", referenceId: d.referenceId, action_override: true})
                    let idx = 0
                    let context = ""
                    for(const d2 of items){
                        let current
                        if( d.fields ){
                            current = d.fields.map(d=>convertParam(inputCategory, d2, d)).filter(d=>d).join("\n")
                        }else if(d.useContext){
                            current = await buildContext(d2, inputCategory)
                        }
                        if( current && current.length > 0){
                            context += `${d.type} ${idx}\n${current}\n`
                            id_map[d.plural].push(d2.id)
                            idx++
                        }
                    }
                    if( idx > 0){
                        active_fields.push(d.plural)
                    }
                    if( context && context.length > 0){
                        info += d.title + ":\n" + context + "\n"
                    }
                    if( d.consolidate){
                        console.log(`===== NEED TO CONSOLIDATE`)
                    }
                }
                let process = action.generator
                if(  process){


                    const trackFields = active_fields.map(d=>`a '${d}_ids' field containing an array listing the numerical ids of all ${d}s factored into this item`)

                    let lastField = active_fields.pop()
                    let field_list = active_fields.length > 0 ? active_fields.join(", ") + `, and ${lastField}` : lastField

                    process = process.replaceAll('{title}', primitive.title)
                    if( context?.length > 0){
                        process = process.replaceAll('{context}', context)
                    }
                    if( info?.length > 0){
                        process = process.replaceAll('{information}', info)
                    }
                    if( primitive.referenceParameters?.focus?.length > 0){
                        process = process.replaceAll('{focus}', primitive.referenceParameters?.focus)
                    }
                    process = process.replaceAll('{field_list}', field_list)

                    
                    let outputFields = Object.keys(action.resultFields).map(d=>`a '${d}' field containing ${action.resultFields[d].prompt}`)
                    console.log(process)
                    console.log(outputFields)

                    let preprocess
                    let result
                    if(action.preGenerator ){
                        let preProcess = action.preGenerator
                        if( context?.length > 0){
                            preProcess = preProcess.replaceAll('{context}', context)
                        }
                        let preFields = Object.keys(action.preFields).map(d=>`a '${d}' field containing ${action.preFields[d].prompt}`)
                        const preResult = await processAsSingleChunk( preProcess, {
                            outputFields: preFields,
                            debug:true
                        } )
                        if( !preResult.success){
                            console.log(preResult)
                            throw `Couldnt do pre-process`
                        }
                        preprocess = preResult.results.map((d,i)=>`Stage ${i+1}. ${d.title}: ${d.description}`).join("\n") + "\n\n"
                        console.log(preprocess)
                        
                        result = {
                            success: true,
                            results: []
                        }

                        for(const thisStage of preResult.results){
                            if( result.results.length > 0){continue}
                            const thisProcess = process.replaceAll('{preprocess}', `${thisStage.title} - ${thisStage.description}`)
                            const thisResult = await processAsSingleChunk( thisProcess, {
                                outputFields: outputFields.concat(trackFields),
                                output:  `Provide the result as a json object with an array called results${action.resultPrefix ? " " + action.resultPrefix : ""}.`, 
                                debug:true
                            } )
                            if( thisResult.success ){
                                console.log(thisResult.results[0])
                                result.results = result.results.concat( thisResult.success )
                            }
                        }
                    }else{
                        result = await processAsSingleChunk( process, {
                            outputFields: outputFields.concat(trackFields),
                            output:  `Provide the result as a json object with an array called results${action.resultPrefix ? " " + action.resultPrefix : ""}.`, 
                            debug:true
                        } )
                    }
                    if( action.test ){
                        console.log(result?.results)
                        throw "Test done"
                    }
                    if( result?.success){
                        for(const d of result.results){
                            console.log(d)
                            const newData = {
                                referenceParameters:{}, 
                                referenceId: action.resultCategoryId,
                                type: resultCategory?.primitiveType,
                                title: `New ${resultCategory?.title}`
                            }

                            let primsToLink = []

                            const nestObjects = []

                            for(const p of Object.keys(d)){
                                if( p.slice(-4) === "_ids"){
                                    const inputs = p.slice(0,-4)
                                    console.log( `need to link in ${d[p].join(", ")}`)
                                    if( !id_map[inputs]){
                                        console.log(`Cant decode ${p} in generator`)
                                        continue
                                    }
                                    const indexes = d[p].map(idx=>typeof(idx) === "string" ? parseInt(idx.match(/\d+/)?.[0] ) : idx).filter(d=>isNaN(d) ? undefined : d)
                                    let ids = indexes.map(idx=>id_map[inputs][idx])
                                    console.log(ids)
                                    primsToLink = primsToLink.concat(ids)
                                }else if(action.resultFields[p].nest){
                                    console.log(`Need to nest`)

                                    let value = d[p]
                                    /*if( typeof(value) === "object" && !Array.isArray(value)){
                                        value = JSON.stringify(value)
                                    }*/
                                    for(const d of [value].flat()){
                                        nestObjects.push( {
                                            resultCategoryId: action.resultFields[p].resultCategoryId,
                                            title: d
                                        })
                                    }
                                }else{
                                    let node = newData
                                    let target = action.resultFields[p].target ?? p
                                    let parts = target.split(".")
                                    if( parts.length === 1){
                                        if( target !== "title"){
                                            parts = ['referenceParameters', target]
                                        }
                                    }
                                    let lastField = parts.pop()
                                    for( const d of parts){
                                        if( node ){
                                            node = node[d]
                                        }
                                    }
                                    if( !node ){
                                        console.log(`Cant decode ${target} in generator`)
                                        continue
                                    }
                                    let value = d[p]
                                    /*if( typeof(value) === "object" && !Array.isArray(value)){
                                        value = JSON.stringify(value)
                                    }*/
                                    node[lastField] = value
                                }
                            }

                            let newPrim
                            if( action.updateSelf ){
                                console.log(`will do update now`)
                                console.log( newData)
                                await dispatchControlUpdate(primitive.id, "referenceParameters", {...(primitive.referenceParameters ?? {}), ...newData.referenceParameters})
                            }else{

                                const newPrim = await createPrimitive({
                                    workspaceId: primitive.workspaceId,
                                    paths:['origin', `results.${resultSet}`],
                                    parent: primitive.id,
                                    data: newData
                                })
                                if( newPrim ){
                                    
                                    for( const d of primsToLink){
                                        if( d ){
                                            await addRelationship(d, newPrim.id, "link")
                                        }
                                    }
                                    for(const d of nestObjects){
                                        const resultSet = 0
                                        console.log(`SHOULD CHECK NEST POSITION`)
                                        await createPrimitive({
                                            workspaceId: primitive.workspaceId,
                                            paths:['origin', `results.${resultSet}`],
                                            parent: newPrim.id,
                                            data: {
                                                type: "evidence",
                                                referenceId: d.resultCategoryId,
                                                title: d.title
                                            }
                                        })
                                        
                                    }
                                }
                            }
                        }
                    }

                }
            }
            if( command === "export_page"){
                const result = await buildPage( primitive )
                console.log(result)
            }


            if( command === "rebuild_summary"){
                //let options =  {source: primitive.id, ...primitive.referenceParameters}

                const config = await getConfig(primitive)
                console.log(config)

                const result = await doPrimitiveAction(primitive, "auto_summarize", {...config, action_override: true})
                dispatchControlUpdate( primitive.id, "referenceParameters.summary", result)

            }
            if( command === "normalize_paper_authors" ){
                const [papers, authors] = await getDataForProcessing(primitive, {...action})
                console.log(papers.length)
                //await resolveNameTest(authors.flat())
                for(const d of papers){
                    await loopkupOrganizationsForAcademic(d)
                }
                return
            }
            if( command === "create_summary"){
                const newData = {
                    workspaceId: primitive.workspaceId,
                    paths: ['origin'],
                    parent: primitive.id,
                    data:{
                        type: "summary",
                        title: "New summary",
                        referenceId: PrimitiveConfig.Constants.GENERIC_SUMMARY,
                        referenceParameters:{
                            "field": options.field,
                            "target":"items",
                            "summary_type":  options.summary_type,
                             "prompt": options.prompt
                        }
                    }
                }
                const newPrim = await createPrimitive( newData )
                if( newPrim ){
                    await addRelationship( newPrim.id, primitive.id, "imports")

                    
                    const result = await doPrimitiveAction(newPrim, "auto_summarize", {source: newPrim.id, ...newPrim.referenceParameters})
                    console.log(result)
                    dispatchControlUpdate( newPrim.id, "referenceParameters.summary", result)
                }
            }
            if( command === "build_image"){
                const concept = (await primitiveListOrigin( [primitive], "hierarchy", undefined, "ALL", PrimitiveConfig.Constants["CONCEPT"]))?.[0]
                
                const style = concept?.referenceParameters?.image_style ?? primitive.referenceParameters?.image_style ?? action.image_style ?? "Create a high-contrast abstract image with a fluid, dynamic pattern from a single geomteric shapes in various shades of high contrast green and #00d967 as the accent color on a dark background, intended for use as a website hero image. The design should be modern and elegant, not too busy, suitable for a professional service website, evoking a sense of expert knowledge and precision. The image should be clean and not too busy"

                let value = decodePath(primitive,action.field ?? "title")
                if( action.asList ){
                    value = (Array.isArray(value) ? value : value.split("\n")).map((d,i)=>`${i+1}). ${d}`).join("\n")
                }
                let doMulti = Array.isArray(value)
                if( doMulti ){
                    value = value.map(d=>d.image_prompt)
                }
                
                let idx = 0
                for(const value of [value].flat()){
                    const prompt = style + value
                    const response = await generateImage( prompt, {size: action.aspect ?? primitive.referenceParameters?.aspect })
                    if( response.success ){
                        let tag = action.image_tag ?? primitive.referenceParameters?.image_tag ?? ""
                        if( doMulti ){
                            tag += "_" + idx
                        }
                        console.log(`Got image data`)
                        await uploadDataToBucket( response.data, primitive.id, 'published_images', tag)
                        console.log(`done`, primitive.id + tag)
                        idx++
                    }
                }
            }
            if( command === "finance_signals"){
                if( true || !primitive.financialData || options?.force ){
                    await computeFinanceSignals( primitive )
                }
                done = true
            }

            if( command === "summarize_results"){
                if( primitive.type === "query"){
                    const list = await primitiveChildren(primitive, "result")
                    const summary = list.map(d=>`${d.title}\n${"-".repeat(d.title.length)}\n${d.referenceParameters.description}`).join("\n\n")

                    let opener = action.opener ?? `Here is a set of analyses:`
                    let prompt = action.prompt ?? `Produce a consolidated analysis of the following text by combining topics and reducing duplication without losing any nuance or detail and without using any information other than what i have provided. Avoid hyperbole and overtly salesy language.`
                    prompt = "Produce a 3 section report from these analyses with the first providing a general overview and without any compnay or offering specifics, the second providing a summary of each company that is mentioned each in a separate paragraph, and the third providing a conclusion"

                    const process = `${opener}\n${summary}\n\n${prompt}`

                    const result = await processAsSingleChunk( process, {
                        output: `Provide your response as a json array called 'results' with an entry for each section of your analyses and with each entry having a 'title' field of up to 10 words and an array called 'para' containing each paragraph of the section as a plain string. `,
                        debug: true
                    } )
                    if( result.success ){
                        console.log( result.results )
                    }
                }
            }
            if( command == "document_discovery"){
                const result = await QueueDocument().documentDiscovery( primitive, req )
            }
            if( command === "entity_jbtd"){
                await EnrichPrimitive().generateJTBD(primitive, {...action, ...options}, req)
            }
            if( command === "site_discovery_short"){
                await EnrichPrimitive().siteDiscoveryShort(primitive, {...action, ...options}, req)
            }
            if( command === "site_discovery"){
                await EnrichPrimitive().siteDiscovery(primitive, {...action, ...options}, req)
            }
            if( command === "process_resource_as_detail"){
                await EnrichPrimitive().fromURL(primitive, {...action, ...options}, req)
            }
            if( command === "site_summarize"){
                await EnrichPrimitive().siteSummarize(primitive, {...action, ...options}, req)
            }
            if( command === "fetch_social_content"){
                if( primitive.referenceParameters.url){
                    const pageContent = await fetchURLPlainText( primitive.referenceParameters.url  )
                    if( pageContent ){
                        const title = pageContent.title ?? primitive.title
                        const params = {
                            ...(primitive.referenceParameters ?? {}),
                            imageUrl: pageContent.image,
                            hasImg: pageContent.image ? true : false,
                            description: pageContent.description,
                            posted: pageContent.posted_on,
                        }
                        await writeTextToFile(primitive.id, pageContent.fullText)
                        if( pageContent.image ){
                            await replicateURLtoStorage(pageContent.image, primitive.id, "cc_vf_images")
                        }
                        dispatchControlUpdate(primitive.id, "referenceParameters", params)
                        dispatchControlUpdate(primitive.id, "title", title)

                    }

                }
            }
            if( command === "summarize"){
                const category = await Category.findOne({id: action.referenceCategoryId})
                const source = options.source ? await fetchPrimitive( options.source ) : undefined

                let items, toSummarize

                if(action.field === 'content'){
                    toSummarize = (await getDocumentAsPlainText( primitive.id ))?.plain
                    if( toSummarize ){
                        toSummarize = toSummarize.split("\n")                        
                    }
                    console.log(`GOT CONTENT TO SUMAMRIZE`)
                }else{
                    [items, toSummarize] = await getDataForProcessing(primitive, {...(action ?? {}), source, ...(category?.openai?.summarize?.source || {})} )
                }
                
                let summary
                if( action.prompt ){
                    summary = await summarizeMultiple( toSummarize, {type: action.dataTypes, prompt: action.prompt, engine: action.engine, debug:true})
                }else{
                    summary = await summarizeMultiple( toSummarize, {...(category?.openai?.summarize?.execute || {}), debug: true})
                }
                console.log(summary)
                if( summary && summary.summary ){
                    let result = summary.summary
                    if( action.targetIsList ){
                        result = result.split("\n")
                        if( result.length < 2){
                            result = summary.summary.split(/\d+\) /).filter(Boolean);
                        }
                    }
                    dispatchControlUpdate( primitive.id, `referenceParameters.${action.targetParameter ?? "description"}`, result)
                }
            }
            if( command === "build_keywords"){
                let items = (options.ids && options.ids.length > 0) ? (await Primitive.find({_id: {$in: options.ids} })) : [primitive]

                console.log(`Build keywords from ${items.length} items`)
                const [_, toSummarize] = await getDataForProcessing(primitive, {...action}, undefined, {list: items} )
                const keywords = await buildKeywordsFromList(toSummarize, {types: action.types ?? "organizations", count: action.count ?? 10, ...(action.ai ?? {}) })
                
                if( keywords.success){
                    result = {keywords: keywords.keywords, command: command, key: action.key}
                    
                    const origin = await primitiveTask( primitive )
                    if( origin ){
                        const resultSet = await findResultSetForCategoryId( origin, primitive.referenceId )
                        const originCategory = await Category.findOne({id: origin.referenceId})
                        const searchCategoryIds = originCategory.resultCategories.find(d=>d.id === resultSet)?.searchCategoryIds
                        if( searchCategoryIds ){
                            const selectedSearchCategoryId = searchCategoryIds[0]
                            if( searchCategoryIds.length > 0){
                                console.log(`WARNING - Selecting first search category by default`)
                            }
                            const searchCategory = await Category.findOne({id: selectedSearchCategoryId})
                            console.log(`WILL CREATE NEW SERACH ITEM AT `, resultSet, searchCategory)

                            const newData = {
                                workspaceId: origin.workspaceId,
                                paths: ['origin', `search.${resultSet}`],
                                parent: origin.id,
                                data:{
                                    type: "search",
                                    referenceId: selectedSearchCategoryId,
                                    title: result.keywords?.join(", "),
                                }
                            }
                            const newPrim = await createPrimitive( newData )
                            result.searchPrimitive = newPrim?.id
                        }
                    }
                    

                    done = true
                }

            }
            if( command === "extract_evidence_new"){
                const resultMapping = primitive.referenceParameters?.evidenceCategoryMapping ?? options.evidenceCategoryMapping ?? action.evidenceCategoryMapping
                let keepItems = options.remove_first === false 

                if( !keepItems){
                    let oldEvidence =  await primitivePrimitives(primitive, 'primitives.origin', "evidence" )
                    console.log( `----> got ${oldEvidence.length} to remove`)
                    for( const old of oldEvidence){
                        await removePrimitiveById( old.id )
                    }
                }

                const resultPathCache = {}
                const resultCache = {}
                const task = await primitiveTask( primitive )
                if( !resultMapping ){
                    throw "Not result map defined"
                }
                const processEntry = async (node, entry, parent, root)=>{
                    if( !node ){
                        return
                    }
                    if(!root){
                        root = parent
                    }
                    const resultCategoryId = entry.resultCategoryId
                    const type = entry.type ?? "string"
                    let parts = entry.field.split(".")
                    let lastField = parts.pop()

                    console.log(parts.join(" > "), lastField)

                    for(const p of parts){
                        node = node[p]
                        if(!node){
                            console.log(`Cant access ${p} for field ${entry.field}`)
                            return undefined
                        }
                    }
                    let value = entry.field === "main_title" ? root.title : node[lastField]
                    if( resultCategoryId ){
                        let resultCategory = resultCache[resultCategoryId]
                        if( !resultCategory){
                            resultCache[resultCategoryId] = await Category.findOne({id: resultCategoryId})
                            resultCategory = resultCache[resultCategoryId]
                        }
                        let thisValue = value
                        if( entry.idx !== undefined){
                            thisValue = value?.[entry.idx]
                        }
                        for( const d of [thisValue].flat()){
                            if( entry.type === "entity"){
                                if( !resultPathCache[resultCategoryId]){
                                    resultPathCache[resultCategoryId] = await findResultSetForCategoryId( task, resultCategoryId)
                                }
                                const resultSet = resultPathCache[resultCategoryId]

                                const organization = (await resolveAndCreateCompaniesByName([d], task, resultCategoryId, resultSet, true))?.[0]
                                if (organization) {
                                    console.log(`Retrieved -- ${organization.id} / ${organization.title} / ${resultSet} / ${entry.relationship}`);
                                    await addRelationship( organization.id, parent.id, entry.relationship ?? 'link')
                                } else {
                                    console.log(`Company not found ${d} to ${parent.id}`);
                                }
                            }else{
                                const title = entry.major ? (d instanceof Object ? d[entry.major ?? "title"] : d) : root.title
                                const newPrim = await createPrimitive( {
                                                        workspaceId: primitive.workspaceId,
                                                        paths: [entry.path ?? 'origin'],
                                                        parent: parent.id,
                                                        data:{
                                                            type: resultCategory.primitiveType,
                                                            referenceId: resultCategoryId,
                                                            title: title,
                                                        }
                                                    })
                                if( entry.base ){
                                    for(const nest of entry.base ){
                                        await processEntry( node, nest, newPrim, root)
                                    }
                                }
                                if( entry.nested ){
                                    for(const nest of entry.nested ){
                                        await processEntry( d, nest, newPrim, root)
                                    }
                                }
                            }
                        }
                    }else{
                        let target = entry.target ?? lastField
                        const prefix = "referenceParameters."
                        if( target.slice(0, prefix.length !== prefix)){
                            target = prefix + target
                        }
                        const final = Array.isArray( value ) ? value.join(",") : value
                        updateFieldWithCallbacks( parent.id, target, final )
                    }
                }
                
                for( const entry of resultMapping){
                    await processEntry(primitive.referenceParameters, entry, primitive )
                    /*
                    let organizations = undefined
                    const entityCategoryId = config.entityCategoryId
                    
                    const searchList = primitive.referenceParameters?.organizations
                    if( searchList && searchList.length > 0){
                        const target = await primitiveTask( primitive )
                        if( target && entityCategoryId){
                            organizations = await resolveAndCreateCompaniesByName( searchList, target, entityCategoryId)
                        }
                    }
                    console.log(`Will attach evidence to ${organizations?.length ?? 0} entities`)
                    const resultCategory = await Category.findOne({id: resultCategoryId})
                    if( !keepItems){
                        let oldEvidence =  await primitivePrimitives(primitive, 'primitives.origin', "evidence" )
                        console.log( `----> got ${oldEvidence.length} to remove`)
                        for( const old of oldEvidence){
                            await removePrimitiveById( old.id )
                        }
                    }
                    if( primitive.referenceParameters[field] ){
                        for( const d of [primitive.referenceParameters[field]].flat()){
                            const newData = {
                                workspaceId: primitive.workspaceId,
                                paths: ['origin'],
                                parent: primitive.id,
                                data:{
                                    type: resultCategory.primitiveType,
                                    referenceId: resultCategoryId,
                                    title: d,
                                }
                            }
                            const newPrim = await createPrimitive( newData )
                            if( newPrim && organizations){
                                for(const org of organizations){
                                    await addRelationship( org.id, newPrim.id, 'link')
                                }
                                console.log(`created ${newPrim.plainId}`)
                            }
                        }
                    }*/

                }
            }
            if( command === "extract_evidence"){
                const resultMapping = primitive.referenceParameters?.evidenceCategoryMapping ?? options.evidenceCategoryMapping ?? action.evidenceCategoryMapping
                const entityCategoryId = primitive.referenceParameters?.entityCategoryId ?? options.entityCategoryId ?? action.entityCategoryId
                let organizations = undefined
                let keepItems = options.remove_first === false 

                if( !resultMapping ){
                    throw "Not result map defined"
                }
                
                const searchList = primitive.referenceParameters?.organizations
                if( searchList && searchList.length > 0){
                    const target = await primitiveTask( primitive )
                    if( target && entityCategoryId){
                        organizations = await resolveAndCreateCompaniesByName( searchList, target, entityCategoryId)
                    }
                }
                console.log(`Will attach evidence to ${organizations?.length ?? 0} entities`)
                for( const {field, resultCategoryId} of resultMapping){
                    const resultCategory = await Category.findOne({id: resultCategoryId})
                    if( !keepItems){
                        let oldEvidence =  await primitivePrimitives(primitive, 'primitives.origin', "evidence" )
                        console.log( `----> got ${oldEvidence.length} to remove`)
                        for( const old of oldEvidence){
                            await removePrimitiveById( old.id )
                        }
                    }
                    if( primitive.referenceParameters[field] ){
                        for( const d of [primitive.referenceParameters[field]].flat()){
                            const newData = {
                                workspaceId: primitive.workspaceId,
                                paths: ['origin'],
                                parent: primitive.id,
                                data:{
                                    type: resultCategory.primitiveType,
                                    referenceId: resultCategoryId,
                                    title: d,
                                }
                            }
                            const newPrim = await createPrimitive( newData )
                            if( newPrim && organizations){
                                for(const org of organizations){
                                    await addRelationship( org.id, newPrim.id, 'link')
                                }
                                console.log(`created ${newPrim.plainId}`)
                            }
                        }
                    }

                }
            }
            if( command === "embed_content"){
                await indexDocument( primitive, {force:options.force} )
            }
            if( command === "custom_query"){
                const thisCategory = await Category.findOne({id: primitive.referenceId})
                const parentForScope = (await primitiveParentsOfType(primitive, ["working", "view", "segment", "query"]))?.[0] ?? primitive

                if( thisCategory.type === "aggregator"){
                    await aggregateItems( parentForScope, primitive )
                }else if( thisCategory.type === "comparator"){
                    await compareItems( parentForScope, primitive )
                }else if( thisCategory.type === "iterator"){
                    await iterateItems( parentForScope, primitive )
                }else  if( thisCategory.type === "lookup"){
                    await resourceLookupQuery( parentForScope, primitive )
                }else if( primitive.referenceParameters.useAxis && !options?.scope){
                    await queryByAxis( parentForScope, primitive )                
                }else{
                    await QueueDocument().doDataQuery( primitive, {...action, ...options, primitive})
                }
            }
            if( command === "evidence_from_query"){
                //await QueueDocument().extractEvidenceFromFragmentSearch( primitive, {...action, ...options})
                await extractEvidenceFromFragmentSearch( primitive, {...action, ...options})
            }
            if( primitive.type === "result" ){
                if( command === "questions"){
                    const qIds = options.questionIds ? [options.questionIds].flat() : undefined
                    await QueueDocument().processQuestions(primitive, {qIds: qIds, remove_first: options.remove_first}, req)
                    done = true
                }
                if( command === "fetch_web"){
                    const urls = action.sources.map(d=>primitive.referenceParameters?.[d]).filter(d=>d)
                    console.log(`Got `, urls)
                    for( const url of urls){
                        try{
                            let skip = false
                            let article ={}
                            const result = await Parser.parse(url, {
                                contentType: 'text',
                            })
                            console.log(result)
                            if( result?.content){                    
                                article.content = result.content
                                article.description = result.content.split(" ").slice(0,400).join(" ")
                                article.image = result.lead_image_url ?? article.image ?? result.socialimage 
                                article.posted_on = result.date_published ?? article.seendate
                            }else{
                                skip = true
                            }
                            if( result.word_count < 50 ){
                                console.log(`ARTICLE TOO SHORT TO BE INTERESTING`)
                                const alt = await getDocumentAsPlainText(primitive.id, undefined, url)
                                if( alt ){
                                    article.content = alt.plain
                                }else{
                                    skip = true
                                }
                            }

                            if( !skip ){
                                const newData = {
                                    workspaceId: primitive.workspaceId,
                                    parent: primitive.id,
                                    paths: ['origin','results.0'],
                                    data:{
                                        type: "result",
                                        referenceId: options.resultCategory || action.resultCategory,
                                        title: result.title,
                                        referenceParameters:{
                                            url: url,
                                            imageUrl: article.image,
                                            hasImg: article.image ? true : false,
                                            source: article.domain,
                                            description: article.excerpt,
                                            posted: article.posted_on
                                        }
                                    }
                                }
                                const newPrim = await createPrimitive( newData )
                                if( newPrim ){
                                    await writeTextToFile( newPrim._id.toString(), article.content)
                                    if( article.image ){
                                        await replicateURLtoStorage(article.image, newPrim._id.toString(), "cc_vf_images")
                                    }
                                }
                            }
                            
                        }catch(error){
                            console.log(`Error in fetching text for ${url}`)
                            console.log(error)
                        }
                    }
                }
                if( command === "extract"){
                  //  if( actionKey === "extract_problems_addressed") {
                    let text
                    try{

                        text = await getDocumentAsPlainText( primitive._id.toString(), req )
                    }catch(error){
                        console.log(`error on Extract`)
                        console.log(error)
                        throw error
                    }

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
                                const result = await analyzeListAgainstTopics(extracted.map((d)=>d[action.extractNoun].replaceAll("\n",". ")), topics, {prefix: "Problem", type: "problem", maxTokens: 3000, engine: "gpt4"})
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
            //if( primitive.type === "segment" || primitive.type === "activity" ){
                    if(command === "define_axis" ){
                        QueueAI().defineAxis( primitive, action )
                    }
            //}
            if( primitive.type === "segment" ){
                    if(command === "dedupe" ){
                        QueueAI().aggregateDuplicatedInSegment( primitive, action )
                    }
                    if(command === "roll_up" ){
                        const target = primitive

                        QueueAI().rollUp( primitive, target, action )
                        done = true
                    }
            }
            if( primitive.type === "view" ){

                if(command === "cluster2" ){
                    const send_action = {...action, ...options}
                    console.log(send_action)
                    QueueAI().rollUp( primitive, primitive, send_action, true )
                    done = true
                }
                if(command === "roll_up_view" ){
                    const send_action = {...action, ...options}
                    console.log(send_action)
                    QueueAI().rollUp( primitive, primitive, send_action )
                    done = true
                }
            }
            if( primitive.type === "activity" ){
                if( command === "find_articles"){
                    result = await EnrichPrimitive().findArticles( primitive, {resultCategory: action.resultCategory, keywords: options.keywords} )
                    done = true
                }
                if( command === "find_posts"){
                    result = await EnrichPrimitive().findPosts( primitive, {resultCategory: action.resultCategory, keywords: options.keywords} )
                    done = true
                }
                if( command === "search"){
                        result = await EnrichPrimitive().searchCompanies( primitive, {referenceId: action.referenceId, keywords: options.keywords} )
                        done = true
                }
                    if(command === "pivot_cb" ){
                        result = EnrichPrimitive().pivotCompany(primitive, "crunchbase", action)
                        done = true
                    }
                    if(command === "build_view" ){
                        const path = options.path || action.path
                        const types = options.types || action.types
                        const referenceId = (options.referenceId === "undefined") ? undefined : ((options.referenceId !== undefined ? parseInt( options.referenceId ) : undefined )|| action.referenceId)
                        const referenceCategoryId = (options.referenceCategoryId !== undefined ? parseInt( options.referenceCategoryId ) : undefined )|| action.referenceCategoryId
                        const baseId = primitive.referenceParameters?.baseCategory || action.baseCategory || PrimitiveConfig.typeConfig["view"].defaultReferenceId || referenceId
                        const self = true
                        let category
                        let sourcePath 
                        if( referenceId ){
                            category = await Category.findOne({id: referenceId})
                        }else if( referenceCategoryId ){
                            const resultRef = primitive.resultCategories[ referenceCategoryId ]?.resultCategoryId
                            category = await Category.findOne({id: resultRef})
                        }

                            const paths = ['origin']
                            if( path ){
                                paths.push(path)
                            }
                            if( referenceCategoryId ){
                                sourcePath = `results.${referenceCategoryId}`
                            }
                            const newPrim = await createPrimitive({
                                workspaceId: primitive.workspaceId,
                                parent: primitive.id,
                                paths: paths,
                                data:{
                                    type: "view",
                                    referenceId: baseId,
                                    title: category ? `View - ${category.title}` : "New view",
                                    referenceParameters:{
                                        types:types,
                                        target: "items",
                                        referenceId: referenceId,
                                        descend: options.descend || action.descend,
                                        path: sourcePath,
                                        self: self
                                    }
                                }
                            })
                            if( newPrim && self && category){
                                await addRelationship(newPrim.id, primitive.id, "imports")

                                console.log(`Check circular child ${newPrim.id}`)
                                const check = await Primitive.findOne({_id:  primitive._id})
                                await primitiveDescendents(check, undefined, {paths: []})
                                console.log(`Check circular parent`)
                                const check2 = await Primitive.findOne({_id:  newPrim._id})
                                await primitiveParents( check2 )
                                console.log(`DONE CHECKS`)
                            }
                    }
                    if(command === "roll_up" ){
                        const target = options.target || action.target
                        const field = options.field || action.field
                        const path = options.path || action.path
                        let types = options.types || action.types
                        const subTypes = options.subTypes || action.subTypes
                        const summaryType = options.summaryType || action.summaryType
                        let prompt = options.prompt || action.prompt
                        const referenceId = (options.referenceId !== undefined ? parseInt( options.referenceId ) : undefined )|| action.referenceId
                        const referenceCategory = primitive.referenceParameters?.resultCategory || action.resultCategory || PrimitiveConfig.typeConfig["view"].defaultReferenceId
                        const baseId = primitive.referenceParameters?.baseCategory || action.baseCategory || PrimitiveConfig.typeConfig["view"].defaultReferenceBaseId || referenceCategory
                        const constrainedSource = options.keywords
                        const category = await Category.findOne({id: referenceId})
                        if( category ){
                            if( types === undefined){
                                types = category.plural || category.title + "s"
                            }
                            if( prompt === undefined){
                                prompt = category.plural || category.title + "s"
                                prompt = `State the underlying ${category.title} that the ${types} have in common in more more than 30 words in the form '${types} related to...'`
                            }
                        }

                        if( target && field ){
                            const paths = ['origin']
                            if( path ){
                                paths.push(path)
                            }
                            let existing = (await primitiveChildren( primitive, "view")).find((d)=>d.referenceId === referenceId && d.referenceParameters?.target === target && d.referenceParameters?.field === field && d.referenceParameters?.constrainId === constrainedSource)
                            if( ! existing ){
                                console.log(`Creating new cluster source`)
                                existing = await createPrimitive({
                                    workspaceId: primitive.workspaceId,
                                    parent: primitive.id,
                                    paths: paths,
                                    data:{
                                        type: "view",
                                        referenceId: baseId,
                                        title: category ? `Clusters - ${category.title}` : "New view",
                                        referenceParameters:{
                                            target: target,
                                            field: field,
                                            types:types,
                                            subTypes:subTypes,
                                            summaryType: summaryType,
                                            prompt: prompt,
                                            referenceId: referenceId,
                                            constrainId: constrainedSource
                                        }
                                    }
                                })
                            }
                            if( existing ){
                                QueueAI().rollUp( primitive, existing, action )
                                done = true
                            }
                            
                        }
                    }
            }
            if( command === "assess_hypotheses" ){
                const h_list = (await primitiveDescendents(primitive, "hypothesis")).filter(d=>d.referenceParameters?.important)
                const workspaceId = primitive.workspaceId
                const full_e_list = await Primitive.find({
                    $and:[
                        {
                            workspaceId: workspaceId,
                            type: "evidence"
                        },
                        { deleted: {$exists: false}}
                    ]
                })
                console.log(`Got ${h_list.length} hypothesis`)
                console.log(`Got ${full_e_list.length} candidate evidence`)

                const e_list = []
                const typeMap = {}
                for( const d of full_e_list){
                    const oId = primitiveOrigin( d )
                    let ref = typeMap[oId]
                    if( ref === undefined ){
                        const origin = await Primitive.findOne({_id: oId })
                        if( origin ){
                            typeMap[oId] = origin.referenceId
                            ref = typeMap[oId]
                        }
                    }
                    if( [9, 22].includes( ref ) ){
                        e_list.push( d )
                    }
                }

                console.log(`Got ${e_list.length} evidence`)


                const h_embeddings = await buildEmbeddingsForPrimitives( h_list )
                const e_embeddings = await buildEmbeddingsForPrimitives( e_list )
                console.log(`DONE EMBEDDINGS`)

                for(const h_test of h_embeddings ){
                    const hypothesis = h_list.find(d=>d.id === h_test.foreignId)

                    const count = e_list.length > 1000 ? e_list.length * 0.01 : e_list.length > 500 ? e_list.length * 0.05 : e_list.length * 0.12
                    
                    let scores = []
                    if( hypothesis ){
                        console.log(`Testing ${hypothesis?.plainId}`)
                        
                        const buildExamples = await buildRepresentativeItemssForHypothesisTest( hypothesis.title, {engine: "gpt4", debug:true, debug_content: true})

                        const embeddingsToTest = [h_test]
                        if( buildExamples.success && buildExamples.output){
                            console.log(`Examples `)
                            console.log(buildExamples)
                            for( const example of buildExamples.output){
                                const embedding = await buildEmbeddings( example )
                                console.log(example, embedding.embeddings.length)
                                embeddingsToTest.push( embedding )
                            }
                        }
                        
                        for( const h of embeddingsToTest ){
                            const thisScores = e_embeddings.map(d=>{
                                return {
                                    foreignId: d.foreignId,
                                    score: cosineSimilarity( h.embeddings, d.embeddings )
                                }
                            }).sort((a,b)=>b.score-a.score).slice(0, count * 10)
                            scores = scores.concat(thisScores)
                            
                        }
                    }
                    scores = scores.sort((a,b)=>b.score-a.score).filter((d,i,a)=>a.findIndex(d2=>d2.foreignId === d.foreignId) === i).slice(0, count)


                    for(const r of ['primitives.positive','primitives.negative','primitives.maybe_positive','primitives.maybe_negative','primitives.candidate']){
                        console.log(`Removing ${r}`)
                        const currentChildren = await primitivePrimitives(hypothesis, r, "evidence" )
                        for( const child of currentChildren ){
                            await removeRelationship( hypothesis.id, child.id, r)
                        }

                    }
                    for( const item of scores ){
                        await addRelationship( hypothesis.id, item.foreignId, "candidate")
                    }
                }

            }

            
            if( command === "enrich_employee_count" ){
                await fetchCompanyHeadcount(primitive, options, action)
            }
            if( command === "find_staff" ){
                await findPeopleFromLinkedIn(primitive, options, action)

            }
            if( command === "fetch_company_from_person" ){
                const task = await primitiveTask( primitive )
                const resultCategory = action.resultCategory
                const resultSet = await findResultSetForCategoryId( task, resultCategory)
                
                const targetCatgeory = await Category.findOne({id: resultCategory})
            
                const linkSet = targetCatgeory?.resultCategories.find((d)=>d.resultCategoryId == primitive.referenceId)?.id

                if( linkSet !== undefined && resultSet !== undefined ){
                    if( primitive.referenceParameters.experiences){
                        let idx = 0
                        let found = false
                        let headline = primitive.referenceParameters.headline ?? primitive.referenceParameters.role
                        if( headline ){
                            let cIdx = 0
                            for(const candidate of primitive.referenceParameters.experiences){
                                let candidate_company = candidate.company?.trim()
                                if( candidate_company ){
                                    candidate_company = candidate_company.replaceAll(/\binc\b/gi,"")
                                    candidate_company = candidate_company.replaceAll(/\binc\.\b/gi,"")
                                    candidate_company = candidate_company.replaceAll(/\bltd\b/gi,"")
                                    candidate_company = candidate_company.replaceAll(/\blimited\b/gi,"")

                                    if( candidate_company.length > 0){
                                        if( headline.toLowerCase().indexOf(candidate_company.toLowerCase()) > -1){
                                            if( candidate.company_linkedin_profile_url ){
                                                idx = cIdx
                                                console.log(`Found headline company at ${cIdx}`)
                                            }
                                        }
                                    }
                                }
                                cIdx++
                            }
                            let selected = primitive.referenceParameters.experiences[idx]
                            if( !found ){
                                let candidates = primitive.referenceParameters.experiences.filter(d=>d.date_from && d.url)
                                if( candidates.length > 0){
                                    candidates = candidates.sort((a,b)=>b.date_from - a.date_from)
                                    console.log(`using most recent expereince ${candidates[0].date_from}`)
                                    selected = candidates[0]
                                }
                            }
                            if( selected ){
                                const url = selected.company_linkedin_profile_url ?? selected.url
                                let existing = await Primitive.findOne({
                                    "workspaceId": primitive.workspaceId,
                                    [`parentPrimitives.${task.id}`]: {$in: ['primitives.origin']},
                                    deleted: {$exists: false},
                                    "referenceParameters.linkedIn": url
                                })
                                if( existing ){
                                    console.log(url, " already exists")
                                }else{
                                    console.log(`Will created from ${url}`)
                                    existing = await createPrimitive({
                                        workspaceId: task.workspaceId,
                                        parent: task.id,
                                        paths: ['origin', `results.${resultSet}`],
                                        data:{
                                            type: "entity",
                                            referenceId: resultCategory,
                                            referenceParameters:{
                                                linkedIn: url
                                            }
                                        }
                                    })
                                }
                                if( existing ){
                                    await addRelationship( existing.id, primitive.id, `results.${linkSet}`)
                                    await addRelationship( existing.id, primitive.id, `link`)
                                }
                            }
                        }
                    }
                }
            }
            if( command === "fetch_company_from_post" ){
                const task = await primitiveTask( primitive )
                const resultCategory = action.resultCategory
                const resultSet = await findResultSetForCategoryId( task, resultCategory)
                
                const targetCatgeory = await Category.findOne({id: resultCategory})
            
                const linkSet = targetCatgeory?.resultCategories.find((d)=>d.resultCategoryId == primitive.referenceId)?.id

                if( primitive.referenceParameters.company){
                    if( resultSet !== undefined ){
                        const organization = (await resolveAndCreateCompaniesByName([primitive.referenceParameters.company], task, resultCategory, resultSet, false))?.[0]
                        if( organization){
                            if( linkSet){
                                await addRelationship( organization.id, primitive.id, `results.${linkSet}`)
                            }
                            await addRelationship( organization.id, primitive.id, `link`)
                        }
                    }
                }
            }
            if( command === "refresh_profile" ){
                await updateFromProxyCurlData( primitive )
            }
            if( command === "lookup_author" ){
                const task = await primitiveTask( primitive )
                const resultCategory = action.resultCategory
                const resultSet = await findResultSetForCategoryId( task, resultCategory)
                console.log(`adding to ${task.id} / results.${resultSet}`)
                if( resultSet !== undefined ){
                    const m = primitive.referenceParameters.url.match(/\S+.linkedin.com\/posts\/(.+?)_/)
                    if( m ){
                        const profileUrl = "https://www.linkedin.com/in/" + m[1]
                        console.log(`${profileUrl} <- ${primitive.referenceParameters.url}}`)

                        let existing = await Primitive.findOne({
                            "workspaceId": primitive.workspaceId,
                            [`parentPrimitives.${primitive.id}`]: {$in: ['primitives.origin']},
                            deleted: {$exists: false},
                            "referenceParameters.profile": profileUrl
                        })
                        if( existing ){
                            console.log(url, " already exists")
                        }else{
                            try{
                                const profile_data = await fetchLinkedInProfile(profileUrl)
                                if( profile_data ){
                                    existing = await addPersonFromProxyCurlData( profile_data, profileUrl, resultCategory, task, resultSet)
                                }
                            }catch(error){
                                console.log(`Couldnt fetch person profile`)
                            }
                        }
                        if( existing ){
                            const oId = primitiveOrigin( primitive )
                            if( oId ){
                                await removeRelationship( oId, primitive.id, `origin` )
                            }
                            await addRelationship( existing.id, primitive.id, `origin` )
                            const resultSet = await findResultSetForCategoryId( existing, primitive.referenceId)
                            console.log(`-- Will link existing post at results.${resultSet}`)
                            if( resultSet !== undefined ){
                                await addRelationship( existing.id, primitive.id, `results.${resultSet}` )
                            }
                        }
                    }

                }

            }
            if( command === "test_li" ){
                const postResult = await Parser.parse(
                             //   'https://www.linkedin.com/posts/jody-friend-shrm-scp-she-her-hers-865570_green-construction-services-activity-6905535239238860800-9m0C'
                             'https://www.linkedin.com/posts/claudio-tadeu-leite_boeing-and-airbus-sustainable-material-aluminium-activity-7122940669010018304-_K4S'
                                , {
                                contentType: 'text',
                            })
                console.log(postResult)
            }
            if( command === "convert_activities" ){
                if( primitive.linkedInData ){
                    const resultCategory = action.resultCategory
                    const resultSet = await findResultSetForCategoryId( primitive, resultCategory)
                    console.log(`Unpack ${primitive.linkedInData.activities?.length} items to results.${resultSet}`)
                            const remap = {
                                "Liked": "Liked",
                                "Shared": "Shared",
                                "Consigliato": "Shared"
                            }
                    if( resultSet !== undefined ){
                        for( const activity of primitive.linkedInData.activities){
                            const existing = await Primitive.findOne({
                                "workspaceId": primitive.workspaceId,
                                [`parentPrimitives.${primitive.id}`]: {$in: ['primitives.origin']},
                                deleted: {$exists: false},
                                "referenceParameters.url": activity.link
                            })
                            if( existing ){
                                continue
                            }
                            
                            let prefix = activity.activity_status?.split(" ")?.[0]
                            let activityType = remap[prefix] ?? prefix

                            const postResult = await Parser.parse(activity.link, {
                                contentType: 'text',
                            })
                            let text
                            if( postResult && postResult.content ){
                                text = postResult.content
                                const m = text.match(/^.*?\d+(w|mo|y)\s{2,}(.*)/)
                                if( m ){
                                    text = m[2]
                                }
                                if( text.match(/LinkedIn and 3rd parties use essential and non-essential cookies to provide, secure/)){
                                    text = activity.title
                                }
                            }

                            
                            const newData = {
                                workspaceId: primitive.workspaceId,
                                parent: primitive.id,
                                paths: ['origin', `results.${resultSet}`],
                                data:{
                                    type: action.type,
                                    referenceId: resultCategory,
                                    title: activity.title,
                                    referenceParameters:{
                                        url: activity.link,
                                        status: activityType,
                                        text: text,
                                        source: "LinkedIn"
                                    }
                                }
                            }
                            const newPrim = await createPrimitive( newData )
                            if( newPrim && text){
                                await writeTextToFile(newPrim.id, text)
                            }
                            
                        }
                    }
                }

            }
            if( command === "test_li_profile_posts"){
                await extractPostsFromProfile( primitive, options, action )
            }
            if( command === "query_linkedin_posts" ){
                const result = await searchPosts( primitive, options, action )
            }
            if( command === "fetch_articles_from_query" ){
                let query = action.query
                if( action.autoQuery && query){
                    const parent = await Primitive.findOne({_id: primitiveOrigin( primitive )}) 
                    query = query.replaceAll(/{t}/g, primitive.title)
                    
                    query = query.replaceAll(/{pt}/g, parent.title)
                }
                if( query ){
                    console.log(query)

                    const resultCategory = options.resultCat
                    let out = await fetchLinksFromWebQuery(query)
                    const outputPath = await findResultSetForCategoryId(primitive, resultCategory)
                    if( outputPath !== undefined ){
                        if( out ){
                            if( action.limit ){
                                out = out.slice(0, action.limit)
                            }
                            for(const item of out){
                                const newData = {
                                    workspaceId: primitive.workspaceId,
                                    paths: ['origin', `results.${outputPath}`],
                                    parent: primitive.id,
                                    data:{
                                        type: "result",
                                        referenceId: resultCategory,
                                        title: item.title,
                                        referenceParameters:{
                                            url: item.url,
                                            tag: action.tag,
                                            snippet: item.snippet,
                                            source:`Web query "${query}"`,
                                        }
                                    }
                                }
                                const newPrim = await createPrimitive( newData )
                            }
                        }
                    }
                }
            }
            if( command === "mark_child" ){
                const [list,_] = await getDataForProcessing(primitive, action)
                const candidates = list.filter(d=>d?.referenceParameters?.role && d?.referenceParameters?.degree_end_year)
                const query = candidates.map((d)=>`${d.referenceParameters.role.trim()} - working since ${d.referenceParameters.degree_end_year}`).join('\n')
                const result = await processPromptOnText(query, {
                        type: "list of staff in a business",
                        prompt: "Determing the most senior person involved in marketing activities, considering both the job title and length of time in employment. Also provide a one line explanation for your choice.",
                        output: `Provide the result as a json object with a field called results, which contains a 'id' field indicating the number of the selected person and a 'rationale' field containing your explanation in 10 words or less`,
                        no_num: false, 
                        })
                if( result.success && result.output?.[0] ){
                    const winnerIdx = result.output[0]?.id
                    const winner = candidates[ winnerIdx ]
                    await addRelationship( primitive.id, winner.id, "marked")
                }

            }
            if( primitive.type === "entity" ){
                if( command === "enrich"){
                    result = EnrichPrimitive().enrichCompany( primitive, "linkedin", true )
                    done = true
                }
                if( command === "enrich_cb"){
                    result = EnrichPrimitive().enrichCompany( primitive, "crunchbase", true )
                    done = true
                }
                if( command === "enrich_investment"){
                    const output = await enrichCompanyFunding(primitive)
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
                if( command === "fetch_acq") {
                    const path = options.path || `results.${findResultPathFor(options.resultCategory  || action.resultCategory)}`
                    await extractAcquisitionsFromCrunchbase(primitive, {path: path, type: options.type || action.type, referenceId: options.resultCategory || action.resultCategory})
                    done = true
                }
                if( command === "extract"){
                    const path = options.path || `results.${findResultPathFor(options.resultCategory  || action.resultCategory)}`
                    if( path ){

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
                            console.log(options)

                            const set = await findResultSetForCategoryId(primitive, action.resultCategory)
                            if( set !== undefined){
                                if(Object.keys(primitive.primitives?.search?.[set] || {}).length > 0){
                                    const list = await primitiveChildren( primitive, "search")
                                    console.log(`Item ${primitive.id} already has an article search (${list.length})`)
                                    for( const d of list){
                                        const hasResults = false//Object.keys(d.primitives || {}).length > 0
                                        if( hasResults ){
                                            console.log(`Will not refresh for ${d.id} / ${d.plainId}`)
                                        }else{
                                            console.log(`Doing for empty ${d.id} / ${d.plainId}`)
                                            await doPrimitiveAction( d, action.queryActionKey ?? "query")
                                        }
                                    }

                                }else{
                                    const category = await Category.findOne({id: primitive.referenceId})
                                    if( category ){
                                        const searchCategoryIds = category.resultCategories?.[set]?.searchCategoryIds
                                        if( searchCategoryIds){
                                            
                                            console.log(`Found category - ${set} ${searchCategoryIds}`)
                                            const selectedSearchCategoryId = searchCategoryIds[0]
                                            
                                            const newData = {
                                                workspaceId: primitive.workspaceId,
                                                paths: ['origin', `search.${set}`],
                                                parent: primitive.id,
                                                data:{
                                                    title: options.keywords,
                                                    type: "search",
                                                    referenceId: selectedSearchCategoryId,
                                                }
                                            }
                                            const newPrim = await createPrimitive( newData )
                                            if( newPrim ){
                                                console.log(`added ${newPrim.plainId}`)
                                                await doPrimitiveAction( newPrim, action.queryActionKey ?? "query")
                                            }
                                        }
                                    }
                                }
                            }

                            /*const output = await extractArticlesFromCrunchbase(primitive, {path: path, type: options.type || action.type, referenceId: options.resultCategory || action.resultCategory})
                            if( output.error === undefined){
                                result = [{
                                    type: "new_primitives",
                                    data: output
                                }]
                                done = true
                            }*/
                        }
                    }
                }
            }
            if( command === "categorize"){
                const source = await Primitive.findById(options.source)
                QueueAI().categorize( source, primitive, {...options, ...action},req )
            }

            if( command === "mark_categories" ){
                const source = await Primitive.findById(options.source)
                QueueAI().markCategories( source, primitive, {...action, ...options},req )
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

export async function createPrimitive( data, skipActions, req, options={} ){
    try{
        let parentPrimitive
        if( data.parent ){
            parentPrimitive = typeof(data.parent) === "string" ? await Primitive.findOne({_id:  new ObjectId(data.parent)}) : data.parent
        }
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
            if( config.defaultReferenceId ){
                if( data.data.referenceId === undefined){
                    data.data.referenceId = config.defaultReferenceId
                }
            }
            if( config.needParent ){
                if( data.data.referenceId === undefined){
                    throw new Error(`Cant create '${type}' without a category`)
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
        if( config?.createAtWorkspace){
            data.paths = data.paths.filter((p)=>p !== 'origin')
            console.log(data.paths)
        }
        
        data.data.parentPrimitives = {}
        const paths = data.paths.map((p)=>flattenPath( p ))
        if( data.parent ){
            data.data.parentPrimitives = {[parentPrimitive.id]: paths}
        }
        
        const category = options.category ?? (await Category.findOne({id: data.data.referenceId}))

        data.data.plainId = await getNextSequenceValue("base")
        data.data.title =  data.data.title ?? `New ${category?.title ?? data.data.type}`
        
        let newPrimitive = await Primitive.create(data.data)
        
        SIO.notifyPrimitiveEvent( newPrimitive,
                                [{
                                    type: "new_primitives",
                                    data: [newPrimitive]
                                }])
        
        const newId = newPrimitive._id.toString()

        for( const path of paths){
            await addRelationship(parentPrimitive.id, newId, path, true)
        }

        if( !skipActions && category && category.actions){
            let changed = false
            for( const action of category.actions){
                if( action.onCreate ){
                    const res = await doPrimitiveAction( newPrimitive, action.key, undefined )
                    if( res ){
                        changed = true
                    }
                }
            }
            newPrimitive = await Primitive.findOne({_id:  newPrimitive._id})
        }
        if( category ){
            for( const key of Object.keys(category.parameters ?? {})){
                const parameter = category.parameters[key]
                if( parameter.embed && newPrimitive.referenceParameters?.[key]){
                    buildEmbeddingsForPrimitives([newPrimitive], `param.${key}`, true, true)
                }
            }
        }
        if( config?.embed){
            for( const field of config.embed ){
                buildEmbeddingsForPrimitives([newPrimitive], field, true, true)
            }
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

  export function cosineSimilarity(vectorA, vectorB) {
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


const _euclideanCache = {}

export function euclideanDistance(point1, point2) {
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

export async function filterEntitiesByTopics( list, topics, key = "description"){
    const rejectWords = ["somewhat","hardly", "not at all"]
    list = list.filter((d)=>d[key] && d[key].trim() !== "" )
    const test = list.map((d)=>`${d.title ? d.title + ". " : ""}${d[key]}`.replaceAll("\n",". "))
    console.log(`Now: ${list.length}`)
    console.log(test)

    if( list && list.length > 0){
        const result = await analyzeListAgainstTopics(test, topics, {prefix: "Article", type: "article", maxTokens: 6000})
        if( !result.success){
            return undefined
        }
        console.log(result)
        list = list.filter((d,idx)=>{
            const score = result.output.find((d)=>d.i === idx)
            d.assessment = score.s
            return !rejectWords.includes(score.s) 
        })
        console.log(`Now: ${list.length}`)
    }
    return list
}

export async function buildContext(primitive, category){
    category = category ?? await Category.findOne({id: primitive.referenceId})
    if( !category || !category.ai?.process?.context){
        if( primitive.type === "evidence"){
            if( primitive.referenceParameters?.quote){
                return `${category.title}: ${primitive.title}\nQuote:"${primitive.referenceParameters?.quote.replaceAll(/\n/g,". ")}"`
            }
            const origin = await primitiveOriginAtLevel( primitive, 1 )
            if( origin.referenceId === PrimitiveConfig.Constants.QUERY_RESULT ){                                
                const parts = [
                    origin.referenceParameters?.description ? `Context:${origin.referenceParameters?.description.replaceAll(/\n/g,". ")}` : undefined, 
                    origin.referenceParameters?.quote ? `Quote:${origin.referenceParameters?.quote.replaceAll(/\n/g,". ")}` : undefined
                ].filter(d=>d)
                if( parts.length > 0){
                    return `${category.title}: ${primitive.title}\n${parts.join("\n")}`
                }
            }
            return primitive.title

        }
        return undefined
    }

    let out = ""
    const lookupSet = Object.values(category.ai.process.context.fields ?? {}).filter(d=>d instanceof Object).map(d=>({referenceId: d.referenceId, agg: (d.target ?? "children") + "-" + (d.field ?? "title"), target: d.target ?? "children", field: d.field ?? "title"}))
    let batches = {}
    if( lookupSet.length > 0 ){
        const unique = lookupSet.map(d=>d.agg).filter((d,i,a)=>a.indexOf(d) === i)
        for(const key of unique){
            const thisSet = lookupSet.filter(d=>d.agg === key)
            const refIds = thisSet.map(d=>d.referenceId).flat()
            const [children, content] = await getDataForProcessing( primitive, {referenceId: refIds, target: thisSet[0].target , field: thisSet[0].field })
            batches[unique] = {
                children,
                content
            }
            
        }
    } 
    for(const d of Object.keys(category.ai.process.context.fields ?? [])){
        const source = category.ai?.process?.context.fields[d]
        if( source instanceof Object){
            let header = source.title
            const key = (source.target ?? "children") + "-" + (source.field ?? "title")
            const children = batches[key].children
            const content = batches[key].content
            //const [children, content] = await getDataForProcessing( primitive, {referenceId: source.referenceId, target: source.target ?? "children", field: source.field ?? "title"})
            const showCount = false//children.length > 1
                            if( children && children.length > 0){
                                if( out.length > 0){
                                    out += ".\n"
                                }
                                out += (header?.length > 0 ? `${header}:` : "") + children.map((d,i)=>{
                                    let interim = `${(source.prefix + " ") ?? ""}${showCount ? i + " - " : ""} ${d.title}`
                                    for(const p of Object.keys(d.referenceParameters ?? {})){
                                        const val = [d.referenceParameters[p]].flat().filter(d=>d)
                                        if( val.length > 0){
                                            interim += `\n${p}: ${val.join(", ")}`
                                        }
                                    }
                                    return interim
                                }).join("\n") + "\n"
                            }else{
                                if( source.fallback){
                                    const param = source.fallback.slice(7)
                                    if( primitive.referenceParameters?.[param] ){
                                        out += (header?.length > 0 ? `${header}: ` : "") + primitive.referenceParameters[param] + "\n"
                                    }
                                }
                            }
          /*  if( false &&  children && children.length > 0){
                if( out.length > 0){
                    out += ". "
                }
                out += (header?.length > 0 ? `**${header}**: ` : "") + children.map((d,i)=>`${(source.prefix + " ") ?? ""}${showCount ? i + " - " : ""} ${content[i] ?? d.title}`).join("\n")
            }else{
                if( source.fallback){
                    const param = source.fallback.slice(7)
                    if( primitive.referenceParameters?.[param] ){
                        out += (header?.length > 0 ? `**${header}**: ` : "") + primitive.referenceParameters[param] + "\n"
                    }
                }
            }*/
            
        }else{
            if( d === "title"){
                out += source?.length > 0 ? `${source}: ${primitive.title}\n` : `${primitive.title}\n`
            }else{
                if( primitive.referenceParameters?.[d] ){
                    let header = source
                    out += header?.length > 0 ? `**${header}**: ${primitive.referenceParameters[d]}\n` : `${primitive.referenceParameters[d]}\n`
                }
            }
        }
    }
    return out.length === 0 ? undefined : out
}

export async function executeConcurrently(list, process, cancelCheck, stopCheck, concurrencyLimit = 5 ){
    let currentIndex = 0;
    let activePromises = []
    let cancelled = false
    let stopped = false
    let results = [] 
    if( !list || list.length === 0){
        return {results: undefined, cancelled}
    }
    const next = async () => {
        if (currentIndex < list.length) {
            if(stopCheck && (await stopCheck())){
                console.log("Stopped")
                stopped = true
                return {results, cancelled, stopped}
            }
            if(cancelCheck && (await cancelCheck())){
                console.log("Cancelled")
                cancelled = true
                return {results: undefined, cancelled, stopped}
            }
            const thisIndex = currentIndex++
            const item = list[thisIndex];
            if( item){
                try{
                    const result = await process(item, thisIndex);
                    results[thisIndex] = result
                }catch(error){
                    console.log(`Error in concurrent thread`) 
                    console.log(error)
                }
            }
            await next();
        }
    };

    for (let i = 0; i < concurrencyLimit; i++) {
        activePromises.push(next());
    }
    await Promise.all(activePromises);

    return {results, cancelled, stopped}
}

export function decodePath(node, path){
    const parts = path.split(".")
    const last = parts.pop()
    for(const d of parts){
        node = node[d]
        if(!node){
            return undefined
        }
    }
    return node[last]
}
export async function recoverPrimitive( id, level = 0 ){
    const primitive = await Primitive.findOne({_id: id})    

    
    if( primitive ){
        console.log(`Restore ${primitive.id} / ${primitive.plainId}`)

        const prim = await Primitive.findOneAndUpdate(
            {
                    "_id": new ObjectId(id),
            }, 
            {
                $unset: { deleted: "" },
            },
            {new: true})
        if( !prim ){
            throw "Recover failed - stopping"
        }
            
        if( level === 0){
            for(const parent of Object.keys( primitive.parentPrimitives ?? {})){
                for( const path of primitive.parentPrimitives[parent]){
                    console.log(`Will restore node to ${parent} at ${path}`)
                    await addRelationship( parent, id, path )
                }
            }
        }

        const children = await primitivePrimitives(primitive, 'primitives.origin', undefined, true)

        console.log(`got ${children.length} to recover`)
        for(const child of children){
            console.log(`${"-".repeat(level + 1)} Recover child ${child.id}`)
            await recoverPrimitive(child.id, level + 1)
            await addRelationship( id, child.id, "origin" )
        }

        for(const rel of ["auto","ref","link"]){
            const items = await primitivePrimitives(primitive, `primitives.${rel}`, undefined, false)
            console.log(`For ${rel} for ${items.length}`)
            for(const d of items){
                console.log(`${"-".repeat(level + 1)} Will restore '${rel}' to ${d.id}`)
                await addRelationship( id, d.id, rel )
            }
        }
        
    }
}
export async function doPurge(count ){
    const targets = await Primitive.find({
        deleted: true,
    },{_id:1,plainId:1}).limit(count ?? 10)
    console.log(`Got ${targets.length} items `)

    for(const d of targets){
        console.log('Remove from buckets')
        let count = (await removeDocument( d.id))
        count += (await removeDocument( d.id + "-background", "cc_vf_images"))
        console.log(` -- removed ${count}`)
        
        {

          const result = await Embedding.deleteMany({
              foreignId: d.id,
            })
            console.log(`Deleted ${result.deletedCount} embeddings to remove for ${d.plainId}`)
        }
        {
            const result = await ContentEmbedding.deleteMany({
                foreignId: d.id,
            })
            console.log(`Deleted ${result.deletedCount} content embeddings to remove for ${d.plainId}`)
        }
        const result = await Primitive.deleteMany({
            deleted: true,
            _id: d.id})
        console.log(`Deleted ${result.deletedCount} primitives ${d.plainId}`)
    }


}