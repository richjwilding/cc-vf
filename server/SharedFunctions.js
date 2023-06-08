import Primitive from './model/Primitive';
import Category from './model/Category';
import Counter from './model/Counter';
import PrimitiveConfig from "./PrimitiveConfig";
import AssessmentFramework from './model/AssessmentFramework';
import {enrichCompanyFromLinkedIn, pivotFromLinkedIn} from './linkedin_helper'
import {buildCategories, categorize} from './openai_helper';
var ObjectId = require('mongoose').Types.ObjectId;

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
    await Primitive.findOneAndUpdate(
        {
                "_id": new ObjectId(receiver),                    
                [path]: {$in: [target]}
        }, 
        {$pull: { [path]: target }},
        {new: true})
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
    try{
        if( path.slice(0, 11 ) != "primitives."){
            path = "primitives." + path
        }
        const parentPath = `parentPrimitives.${receiver}`
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
    let list = await Primitive.find({[`parentPrimitives.${primitive._id.toString()}.0`]: 'primitives.origin'})
    if( types ){
        const a = [types].flat()
        list = list.filter((d)=>a.includes(d.type))
    }
    return list
} 
export async function doPrimitiveAction(primitive, actionKey, options){
    const category = await Category.findOne({id: primitive.referenceId})
    let done = false
    let result
    if( category && category.actions ){
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
            
            if( primitive.type === "entity" ){
                if( command === "enrich"){
                    result = await enrichCompanyFromLinkedIn(primitive, true)
                    done = true
                }
                if( command === "pivot"){
                    result = [{
                        type: "new_primitives",
                        data: await pivotFromLinkedIn(primitive),
                    }]
                    done = true
                }
            }
            if( primitive.type === "activity" || primitive.type === "task" ){
                if( command === "categorize" || command === "mark_categories"){
                    let list
                    let data
                    if(action.target === "children"){
                        list = await primitiveChildren(primitive)
                    }
                    if(action.target === "level2"){
                        list = await primitiveChildren(primitive)
                        list = (await Promise.all(list.map(async (d)=>await primitiveChildren(d)))).flat()
                    }
                    if( action.type ){
                        list = list.filter((d)=>d.type === action.type)
                    }
                    if( action.referenceId ){
                        list = list.filter((d)=>d.referenceId === action.referenceId)
                    }
                    if( list !== undefined){
                        data = list.map((d)=>{
                            if( action.parameter && d.referenceParameters){
                                return d.referenceParameters[action.parameter]
                            }
                            if( action.field ){
                                return d[action.field]
                            }

                        }).filter((d)=>d)
                        
                        if( command === "categorize"){
                            const catData = await buildCategories( data, {count: options.count || action.count || 15, type: options.dataType || action.dataType, themes: options.theme || action.theme} )
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
                            console.log(options.source)
                            const catOptions = await primitiveChildren( await Primitive.findById(options.source), "category")
                            const categoryList = catOptions.map((d)=>d.title)
                            const categoryIds = catOptions.map((d)=>d._id.toString())

                            for( const item of list ){
                                if( item.parentPrimitives ){
                                    const parents = Object.keys(item.parentPrimitives ).filter((d)=>categoryIds.includes(d) )
                                    if( parents.length > 0){
                                        for( const parent of parents){
                                            for( const path of item.parentPrimitives[parent]){
                                                console.log(`${item._id.toString()} - ${parent} at ${path}`)
                                                await removeRelationship( parent, item._id.toString(), path )
                                            }
                                        }
                                    }
                                }
                            }
                            
                            result = await categorize(data, categoryList)
                            console.log(result)

                            if( Object.hasOwn(result, "success")){
                                console.log("Error on mark_categories")
                                return result
                            }else{
                                for(const item of result){
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
        }
    }
    return done ? result : false
}

export async function createPrimitive( data ){
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
        
        const paths = data.paths.map((p)=>flattenPath( p ))
        if( data.parent ){
            data.data.parentPrimitives = {[data.parent]: paths}
        }
        data.data.plainId = await getNextSequenceValue("base")
        
        let newPrimitive = await Primitive.create(data.data)
        const newId = newPrimitive._id.toString()

        for( const path of paths){
            console.log(path)
            await Primitive.findOneAndUpdate(
                {
                    "_id": new ObjectId(data.parent),
                }, 
                {
                    $push: { [path]: newId }
                })
        }

        const category = await Category.findOne({id: newPrimitive.referenceId})
        if( category && category.actions){
            let changed = false
            for( const action of category.actions){
                if( action.onCreate ){
                    const res = await doPrimitiveAction( newPrimitive, action.key )
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