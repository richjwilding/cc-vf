import express from 'express';
import mongoose from 'mongoose';
import User from '../model/User';
import Company from '../model/Company';
import Contact from '../model/Contact';
import Category from '../model/Category';
import Primitive from '../model/Primitive';


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
router.get('/migrate', async function(req, res, next) {
    const prims = await Primitive.find({})
    const pm = prims.reduce((o,d)=>{o[d.plainId]=d._id.toHexString(); return o},{})

    const remap = ((node)=>{
        if( node instanceof Array){
            return node.map((d)=>{
                if( d instanceof Object ){
                    return remap(d)
                }
                return pm[d]
            })
        }else{
            return Object.keys(node).reduce((o, k)=>{
                o[k] = remap(node[k])
                return o
            }, {})
        }
    })

    prims.forEach((p)=>{
        if( p.primitives ){

            console.log(` Starting --- ${p.plainId}`)
            console.log( p.primitives )
            let remapped = remap(p.primitives)
            console.log( remapped )

            p.primitives = remapped
            p.markModified('primitives')
            p.save()
        }
    })

    res.json(pm)

})

export default router;