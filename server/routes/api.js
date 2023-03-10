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
router.post('/move_relationshipOLD', async function(req, res, next) {
    let data = req.body

    try {
        let primitive = await Primitive.findById(data.receiver)
        if( primitive !== null ){
            let relationships = new Proxy(primitive.primitives || [], parser)
            if( relationships.move( data.target, data.from, data.to) ){
                primitive.markModified('primitives')
                primitive.save()
                res.json({success: true})
            }
        }else{
            throw new Error(`Couldnt update title for ${data.receiver}`)
        }
      } catch (err) {
        res.json(400, {error: err.message})
    }
})
router.post('/move_relationship', async function(req, res, next) {
    let data = req.body

    try {
        const fromPath = flattenPath( data.from )
        const toPath = flattenPath( data.to )
        Primitive.findOneAndUpdate(
            {
                    "_id": new ObjectId(data.receiver),
                    [fromPath]: {$in: [data.target]},
                    [toPath]: {$nin: [data.target]}
            }, 
            {
                $pull: { [fromPath]: data.target },
                $push: { [toPath]: data.target }
            },
            {new: true},
            (err,doc)=>{
                console.log(`remove`)
                console.log(err)
                console.log(doc?.primitives?.metrics)
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
router.post('/add_primitive', async function(req, res, next) {
    let data = req.body

    try {
        let newPrimitive = await Primitive.create(data.data)
        const newId = newPrimitive._id.toString()

        const paths = data.paths.forEach((pathObj)=>{
            const path = flattenPath( pathObj )
            Primitive.findOneAndUpdate(
                {
                        "_id": new ObjectId(data.parent),
                }, 
                {
                    $push: { [path]: newId }
                },
                {new: true},
                (err,doc)=>{
                    if( err !== null){
                        res.json(400, {error: err})
                    }
                }
            )
        })
        res.json({success: true, id: newId})
      } catch (err) {
        res.json(400, {error: err.message})
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

    try {
        const path = flattenPath( data.path )
        console.log(data)
        console.log(path)
        if( data.set ){
            Primitive.findOneAndUpdate(
                {
                     "_id": new ObjectId(data.receiver),
                     [path]: {$nin: [data.target]}
                }, 
                {$push: { [path]: data.target }},
                {new: true},
                (err,doc)=>{
                    if( err !== null){
                        res.json(400, {error: err})
                    }
                })
        }else{
            Primitive.findOneAndUpdate(
                {
                     "_id": new ObjectId(data.receiver),
                     [path]: {$in: [data.target]}
                }, 
                {$pull: { [path]: data.target }},
                {new: true},
                (err,doc)=>{
                    if( err !== null){
                        res.json(400, {error: err})
                    }
                })
        }
        res.json({success: true})
    } catch (err) {
        res.json(400, {error: err.message})
    }

})

export default router;