import express from 'express';
import mongoose from 'mongoose';
import User from '../model/User';
import Company from '../model/Company';
import Contact from '../model/Contact';
import Category from '../model/Category';
import Primitive from '../model/Primitive';
import PrimitiveParser from '../PrimitivesParser';
import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

var ObjectId = require('mongoose').Types.ObjectId;

const parser = PrimitiveParser()
var router = express.Router();

router.get('/', async function(req, res, next) {
    res.json({up: true})
})
router.get('/avatarImage/:id', async function(req, res, next) {
    const contactId = req.params.id
    const bucketName = 'bucket-profiles-vf-cc'
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
      });
    try{

        const bucket = storage.bucket(bucketName);
        const file = bucket.file(contactId)
        const remoteReadStream = file.createReadStream()
                                    .on('error', function(err) {
                                        console.log(err)
                                        res.status(501).json({message: "Not found"})
                                        return
                                    });
        res.set('Cache-Control', 'public, max-age=31557600');
        remoteReadStream.pipe(res);
    }catch(error){
        res.status(501).json({message: "Error"})
    }
})
router.get('/enrichContact', async function(req, res, next) {
    const contactId = req.query.contactId
    try {
        const contact = await Contact.findOne({_id:  new ObjectId(contactId)})

        if( !contact.profile ){
            const company = req.query.company
            if( company ){
                let [first_name, last_name, other] = contact.name.split(" ")
                if( other ){
                    first_name = last_name
                    last_name = other
                }
                console.log(first_name)
                console.log(last_name)
                console.log(company)
                    const query = new URLSearchParams({ 
                        'enrich_profile': "skip",
                        'company_domain': company,
                        'first_name': first_name,
                        'lasst_name': last_name
                    }).toString()
                    const url = `https://nubela.co/proxycurl/api/linkedin/profile/resolve?${query}`
                    const response = await fetch(url,{
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${process.env.PROXYCURL_KEY}`
                        },
                    });
                
                console.log('send')
                console.log(query)
                const data = await response.json();
                if( data.url ){
                    contact.profile = data.url
                    contact.markModified("profile")
                    await contact.save()
                }else{
                    res.json({success: false, reason: "No profile url and no company url found"})
                    return
                }

            }else{
                res.json({success: false, reason: "No profile url or company name"})
                return
            }
        }
        if( !contact.profileInfo && contact.profile){
            try{
                
                const query = new URLSearchParams({ 
                    url: contact.profile,
                    fallback_to_cache: 'on-error',
                    'use_cache':'if-present',
                    'skills':'include',
                    'inferred_salary':'include',
                    'personal_email':'include',
                    'personal_contact_number':'include',
                    'twitter_profile_id':'include',
                    'facebook_profile_id':'include',
                    'github_profile_id':'include',
                    'extra':'include'
                }).toString()
                const url = `https://nubela.co/proxycurl/api/v2/linkedin?${query}`
                const response = await fetch(url,{
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${process.env.PROXYCURL_KEY}`
                    },
                });
                
                const data = await response.json();
                console.log(data)
                res.json({result: data})
                contact.profileInfo = data
                contact.avatarPresent = await replicateURLtoStorage( data.profile_pic_url, contact.id )
                contact.avatarUrl = avatarUrl
                contact.markModified("profileInfo")
                contact.markModified("avatarUrl")
                contact.markModified("avatarPresent")
                await contact.save()
                return
            }catch(error){
                console.log(error)    
                res.json({success: false, reason: error.message})
                return
            }
        }
        if( !contact.avatarUrl){
            try{
                
                const query = new URLSearchParams({ linkedin_person_profile_url: contact.profile  }).toString()
                const url = `https://nubela.co/proxycurl/api/linkedin/person/profile-picture?${query}`
                const response = await fetch(url,{
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${process.env.PROXYCURL_KEY}`
                    },
                });
                
                const data = await response.json();
                console.log(data)
                if( data.tmp_profile_pic_url ){
                    contact.avatarPresent = await replicateURLtoStorage( data.tmp_profile_pic_url, contact.id )
                    contact.markModified("avatarPresent")
                    await contact.save()
                }
                res.json({result: data})
                return
            }catch(error){
                console.log(error)    
                res.json({success: false, reason: error.message})
                return
            }
        }
            
    } catch (err) {
        res.json({error: err.message})
    }

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

    try {
        const paths = data.paths.map((p)=>flattenPath( p ))

        if( data.parent ){
            data.data.parentPrimitives = {[data.parent]: paths}
        }
        
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


async function replicateURLtoStorage(url, id, bucketName){
    console.log(`replicating`)
    if(!url || !id){return false}
    if( url.slice(0,4) !== "http"){return false}
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
      });

    bucketName = 'bucket-profiles-vf-cc'

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(id)
    if( await file.exists()[0] ){
        await file.delete()
    }
    const stream = file.createWriteStream()


    const response = await fetch(url)
    await finished(Readable.fromWeb(response.body).pipe(stream));
    return true

}


export default router;