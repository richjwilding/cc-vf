import Primitive from './model/Primitive';
import Category from './model/Category';
import Counter from './model/Counter';
import PrimitiveConfig from "./PrimitiveConfig";
import AssessmentFramework from './model/AssessmentFramework';
import {enrichCompanyFromLinkedIn, pivotFromLinkedIn, extractUpdatesFromLinkedIn} from './linkedin_helper'
import { extractArticlesFromCrunchbase, pivotFromCrunchbase } from './crunchbase_helper';
import {buildCategories, categorize, summarizeMultiple, processPromptOnText} from './openai_helper';
import PrimitiveParser from './PrimitivesParser';
import { getDocumentAsPlainText } from './google_helper';
var ObjectId = require('mongoose').Types.ObjectId;

const parser = PrimitiveParser()

export async function getNextSequenceValue(sequenceName) {
    try {
        // Find the counter document with the specified sequence name
        const counter = await Counter.findOneAndUpdate(
          { name: sequenceName },
          { $inc: { sequence_value: 1 }},
          { new: true, upsert: true }
        );
        
        // Return the updated sequence value
        return counter.sequence_value;
      } catch (error) {
        throw error
      }
}

async function doRemovePrimitiveLink(receiver, target, path){
    console.log(`SF: doRemovePrimitiveLink ${receiver} ${target} ${path}`)
    await Primitive.findOneAndUpdate(
        {
                "_id": new ObjectId(receiver),                    
                [path]: {$in: [target]}
        }, 
        {$pull: { [path]: target }},
        {new: true})
}
export async function removeRelationship(receiver, target, path){
    console.log(`SF: removeRelationship ${receiver} ${target} ${path}`)
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
                [parentPath]: {$in: [path]}
            }, 
            {$pull: { [parentPath]: path }})

            doRemovePrimitiveLink(receiver, target, path)
    }
    catch(error){
        console.log(error)
        throw new Error("Couldn't find target")
    }
}
export async function addRelationship(receiver, target, path){
    console.log(`SF: addRelationship ${receiver} ${target} ${path}`)
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
            //TODO: OPTIMIZE AND MAKE BELOW OPTIONS
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

    const check = await Primitive.find({"_id": new ObjectId(target)})
    if( check.length === 0){
        doRemovePrimitiveLink( receiver, target, path )
        throw new Error("Couldn't find target")
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
                [`parentPrimitives.${primitive._id.toString()}.0`]: path
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
export async function primitiveDescendents(primitive, types){
    let out = []
    const a = Array.isArray(types) ? types : [types]
    const list = await primitiveChildren( primitive)
    for( const d of list){
        //console.log(`adding ${d.plainId} - ${d.type}`)
        out.push(d)
        if( !a.includes(d.type) ){
            out = out.concat( await primitiveDescendents(d, a ))
        }
    }
    return out


}

export async function getDataForAction(primitive, action, options = {}){
    let startList = options.list 
    let list = []
    const target = options.target || action.target || "children"
    const referenceId = options.referenceId || action.referenceId
    const type = options.type || action.type

    const parameter = options.parameter ? options.parameter : (options.field ? undefined : action.parameter)
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
    if(target === "children"){
        list = startList || await primitiveChildren(primitive)
    }
    if(target === "level2"){
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
    
    return [list, list.map((d) => {
        if (parameter && d.referenceParameters) {
            return d.referenceParameters[parameter]
        }
        if (field) {
            return d[field]
        }

    }).filter((d)=>d)]

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
                    out.push({
                        type: "add_relationship",
                        id: primitive._id.toString(), 
                        target: targetId,
                        path: "ref"
                    })
                }
            }
        }
    }
    return out
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


                const [targets] = await getDataForAction(primitive, action)
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

                        const output = await processPromptOnText(text?.plain, {title: title, prompt: options.prompt || action.prompt, type: action.dataType ,extractNoun: action.extractNoun, transformPrompt: action.transformPrompt})
                        if( output && output.success && output.output){
                            console.log(output)
                            const items = []
                            for( const item of output.output){
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
            if( primitive.type === "entity" ){
                if( command === "enrich"){
                    result = await enrichCompanyFromLinkedIn(primitive, true)
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
                        result = [{
                            type: "new_primitives",
                            data: await pivotFromCrunchbase(primitive),
                        }]
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
            if( primitive.type === "activity" || primitive.type === "task" ){
                if( command === "categorize" || command === "mark_categories"){
                    const source = await Primitive.findById(options.source)
                    const dataOptions = {
                        type: source.referenceParameters?.type, 
                        target: source.referenceParameters?.target, 
                        referenceId: source.referenceParameters?.referenceId,
                        parameter: source?.referenceParameters?.field ? undefined : (source?.referenceParameters?.parameter || action.parameter),
                        field: source.referenceParameters?.field
                    }

                    const [list, data] = await getDataForAction(primitive, action, dataOptions)
                    console.log(`got ${list.length}`)
                    if( list !== undefined){
                        
                        if( command === "categorize"){
                            const catData = await buildCategories( data, {count: options.count || action.count || 15, types: options.dataTypes || action.dataTypes, themes: options.theme || action.theme} )
                            if( catData.success && catData.categories){
                                const items = []
                                for( const title of catData.categories){
                                    items.push( await createPrimitive({
                                        workspaceId: primitive.workspaceId,
                                        parent: options.parent || primitive.id,
                                        paths: ['origin'],
                                        data:{
                                            type: "category",
                                            referenceId: action.resultCategory,
                                            title: title
                                        }

                                    }))
                                    done = true
                                }
                                result = [{
                                    type: "new_primitives",
                                    data: items
                                }]
                            }
                        }
                        if( command === "mark_categories" ){
                            const catOptions = await primitiveChildren( source, "category")
                            const categoryList = catOptions.map((d)=>d.title)
                            const categoryIds = catOptions.map((d)=>d._id.toString())

                            result = []

                            for( const item of list ){
                                if( item.parentPrimitives ){
                                    const parents = Object.keys(item.parentPrimitives ).filter((d)=>categoryIds.includes(d) )
                                    if( parents.length > 0){
                                        for( const parent of parents){
                                            for( const path of item.parentPrimitives[parent]){
                                                await removeRelationship( parent, item._id.toString(), path )
                                                result.push({
                                                        type: "remove_relationship",
                                                        id: parent,
                                                        target: item._id,
                                                        path: path.replace("primitives.", "")
                                                })
                                            }
                                        }
                                    }
                                }
                            }
                            
                            const categoryAlloc = await categorize(data, categoryList)
                            console.log(categoryAlloc)

                            if( Object.hasOwn(categoryAlloc, "success")){
                                console.log("Error on mark_categories")
                                return categoryAlloc
                            }else{
                                for(const item of categoryAlloc){
                                    let cat
                                    if( typeof(item.category === "number")){
                                        cat = catOptions[ item.category ]
                                    }else{
                                        const newId = categoryList.findIndex((d)=>d.title === item.category)
                                        console.log(`   => ${item.category} > ${newId}`)
                                        cat = catOptions[ newId ]
                                    }
                                    if( cat ){
                                        console.log(`${item.id} -> ${list[item.id].plainId} : ${cat.title}`)
                                        await addRelationship( cat._id.toString(), list[item.id]._id.toString(), "ref")
                                        result.push({
                                                type: "add_relationship",
                                                id: cat._id.toString(), 
                                                target: list[item.id]._id.toString(),
                                                path: "ref"
                                        })
                                    }else{
                                        console.log(`Couldnt find category '${item.category}' for ${item.id})`)
                                    }
                                }
                                done = true
                            }
                        }
                    }
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
        
        const type = data.data.type
        if( !PrimitiveConfig.types.includes( type )) {
            throw new Error(`Type '${type} not recognized`)
        }
        const config = PrimitiveConfig.typeConfig[type]
        
        if( config ){
            if( config.needParent && data.parent === undefined){
                throw new Error(`Cant create '${type}' without a parent`)
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
        
        const paths = data.paths.map((p)=>flattenPath( p ))
        if( data.parent ){
            data.data.parentPrimitives = {[data.parent]: paths}
        }
        data.data.plainId = await getNextSequenceValue("base")
        
        let newPrimitive = await Primitive.create(data.data)
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