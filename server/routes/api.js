import express from 'express';
import mongoose from 'mongoose';
import User from '../model/User';
import Company from '../model/Company';
import Contact from '../model/Contact';
import Category from '../model/Category';
import Primitive from '../model/Primitive';
import PrimitiveParser from '../PrimitivesParser';
var ObjectId = require('mongoose').Types.ObjectId;


const parser = PrimitiveParser()
var router = express.Router();

router.get('/', async function(req, res, next) {
    res.json({up: true})
})
router.get('/users', async function(req, res, next) {

    try {
        const results = await User.find({})
        res.json(results)
      } catch (err) {
        res.json({error: err})
      }

})
router.get('/companies', async function(req, res, next) {

    try {
        const results = await Company.find({})
        res.json(results)
      } catch (err) {
        res.json({error: err})
      }

})
router.get('/contacts', async function(req, res, next) {

    try {
        const results = await Contact.find({})
        res.json(results)
      } catch (err) {
        res.json({error: err})
      }

})
router.get('/categories', async function(req, res, next) {

    try {
        const results = await Category.find({})
        res.json(results)
      } catch (err) {
        res.json({error: err})
      }

})
router.get('/primitives', async function(req, res, next) {

    try {
        const results = await Primitive.find({})
        res.json(results)
      } catch (err) {
        res.json({error: err})
      }

})
router.post('/set_field', async function(req, res, next) {
    let data = req.body

    try {

        Primitive.findOneAndUpdate(
            {
                    "_id": new ObjectId(data.receiver),
            }, 
            {
                $set: { [data.field]: data.value },
            },
            {new: true},
            (err,doc)=>{
            })
        res.json({success: true})
      } catch (err) {
        res.json(400, {error: err.message})
    }
})
router.post('/move_relationship', async function(req, res, next) {
    let data = req.body

    try {
        const fromPath = flattenPath( data.from )
        const toPath = flattenPath( data.to )
        try{
            await Primitive.findOneAndUpdate(
                {
                    "_id": new ObjectId(data.target),
                }, 
                [{$set: { 
                    [`parentPrimitives.${data.receiver}`]: 
                        {$function: {
                            body: `function(arr){ arr = (arr || []).filter((p)=>(p != '${fromPath}') && (p != '${toPath}') ); arr.push('${toPath}'); return arr }`,
                            args: [`$parentPrimitives.${data.receiver}`],
                            lang: "js"
                        }}
                    }
                }]
            )
        }
        catch(err){
            throw new Error(err)
        }
        await Primitive.findOneAndUpdate(
            {
                    "_id": new ObjectId(data.receiver),
                    [fromPath]: {$in: [data.target]},
                    [toPath]: {$nin: [data.target]}
            }, 
            {
                $pull: { [fromPath]: data.target },
                $push: { [toPath]: data.target }
            })
      } catch (err) {
        res.json(400, {error: err.message})
    }
})
router.post('/add_contact', async function(req, res, next) {
    let data = req.body
    console.log(data)

    try {
        let newPrimitive = await Contact.create(data.data)
        const newId = newPrimitive._id.toString()
        res.json({success: true, id: newId})
      } catch (err) {
        res.json(400, {error: err.message})
    }
})


const removeParentReference = async (target, parentId)=>{
    if( !(target instanceof Object)){
        target = await Primitive.findOne({"_id": new ObjectId(target)})
    }
    const targetId = target.id

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

router.post('/remove_primitive', async function(req, res, next) {
    let data = req.body

    try {
        const removed = await Primitive.findOneAndDelete({"_id": new ObjectId(data.id)})

        try{
            if( removed.parentPrimitives ){
                for( const parentId of Object.keys(removed.parentPrimitives) ){
                    await removeParentReference( removed, parentId)
                }
            }
            console.log(removed.primitives)
            if( removed.primitives ){
                const childPrimitiveIds = new Proxy(removed.primitives, parser).uniqueAllIds
                for( const childId of childPrimitiveIds ){
                    await Primitive.findOneAndUpdate(
                        {
                            "_id": new ObjectId(childId),
                        }, 
                        {
                            $unset: { [`parentPrimitives.${removed.id}`]:"" }
                        })
                }
            }
        }catch(err){
            throw err
        }
        res.json({success: true})
      } catch (err) {
        res.status(400).json({error: err.message})
    }
})
router.post('/add_primitive', async function(req, res, next) {
    let data = req.body
    console.log(data)

    try {
        const paths = data.paths.map((p)=>flattenPath( p ))

        console.log( paths )
        data.data.parentPrimitives = {[data.parent]: paths}
        
        let newPrimitive = await Primitive.create(data.data)
        const newId = newPrimitive._id.toString()

        try{
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
        }catch(err){
            throw err
        }
        res.json({success: true, id: newId})
      } catch (err) {
        res.status(400).json({error: err.message})
    }
})


const flattenPath = (path)=>{
    let out = ['primitives']
    const nest = (node)=>{
        if( node instanceof Object ){
            const k = Object.keys(node)[0]
            out.push(k)
            nest( node[k] )
            return out
        }
        out.push(node)
        return out
    }
    return nest( path).join(".")
}

router.post('/set_relationship', async function(req, res, next) {
    let data = req.body
    console.log(data)

    const doRemove = async (path)=>{
        await Primitive.findOneAndUpdate(
            {
                    "_id": new ObjectId(data.receiver),
                    [path]: {$in: [data.target]}
            }, 
            {$pull: { [path]: data.target }},
            {new: true})
    }

    try {
        const path = flattenPath( data.path )
        const parentPath = `parentPrimitives.${data.receiver}`
        
        if( data.set ){
            try{
                await Primitive.findOneAndUpdate(
                    {
                        "_id": new ObjectId(data.target),
                        [parentPath]: {$nin: [path]}
                    }, 
                    {$push: { [parentPath]: path }})
            }
            catch{
                throw new Error("Couldn't find target")
            }
            await Primitive.findOneAndUpdate(
                {
                     "_id": new ObjectId(data.receiver),
                     [path]: {$nin: [data.target]}
                }, 
                {$push: { [path]: data.target }})

            const check = await Primitive.find({"_id": new ObjectId(data.target)})
            if( check.length === 0){
                doRemove( path )
                throw new Error("Couldn't find target")
            }

        }else{
            try{

                await Primitive.findOneAndUpdate(
                    {
                        "_id": new ObjectId(data.target),
                        [parentPath]: {$in: [path]}
                    }, 
                    {$pull: { [parentPath]: path }})
            }
            catch{
                throw new Error("Couldn't find target")
            }
           doRemove(path)
        }
        res.json({success: true})
    } catch (err) {
        res.status(400).json( {error: err.message})
    }

})

export default router;