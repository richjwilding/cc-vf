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



router.get('/restore', async function(req, res, next) {
    const data = {
        type: 'experiment',
        state: 'active',
        referenceId: 7,
        users: { owner: [ null ], other: [] },
        title: 'EFD interviews',
        plainId: 99571,
        comments: [],
        primitives: {
          origin: [
            '641acc149a2ba1ffa3e5a53c',
            '641aff479a2ba1ffa3e5aa74',
            '641b05859a2ba1ffa3e5abba',
            '641b05859a2ba1ffa3e5abb8',
            '641b05859a2ba1ffa3e5abbc',
            '641b05859a2ba1ffa3e5abc3',
            '641b05859a2ba1ffa3e5abc6',
            '641b05859a2ba1ffa3e5abc8',
            '641b05859a2ba1ffa3e5abd5',
            '641b05859a2ba1ffa3e5abd7',
            '641b05859a2ba1ffa3e5abd9',
            '641b05859a2ba1ffa3e5abdf',
            '641b05859a2ba1ffa3e5abe6',
            '641b05859a2ba1ffa3e5abeb',
            '641b05859a2ba1ffa3e5abf1',
            '641b05859a2ba1ffa3e5abf3',
            '641b05859a2ba1ffa3e5abf5',
            '641b05859a2ba1ffa3e5abf9',
            '641b05859a2ba1ffa3e5ac11',
            '641b05859a2ba1ffa3e5ac0d',
            '641b05859a2ba1ffa3e5ac17',
            '641b05859a2ba1ffa3e5ac1e',
            '641b05859a2ba1ffa3e5ac09',
            '641b05859a2ba1ffa3e5ac0b',
            '641b05859a2ba1ffa3e5ac0f',
            '641b05859a2ba1ffa3e5ac23'
          ],
          results: { '0': {
                completed: ['641acc149a2ba1ffa3e5a53c',
                '641aff479a2ba1ffa3e5aa74',
                '641b05859a2ba1ffa3e5abba',
                '641b05859a2ba1ffa3e5abb8',
                '641b05859a2ba1ffa3e5abbc',
                '641b05859a2ba1ffa3e5abc3',
                '641b05859a2ba1ffa3e5abc6',
                '641b05859a2ba1ffa3e5abc8',
                '641b05859a2ba1ffa3e5abd5',
                '641b05859a2ba1ffa3e5abd7',
                '641b05859a2ba1ffa3e5abd9',
                '641b05859a2ba1ffa3e5abdf',
                '641b05859a2ba1ffa3e5abe6',
                '641b05859a2ba1ffa3e5abeb',
                '641b05859a2ba1ffa3e5abf1',
                '641b05859a2ba1ffa3e5abf3',
                '641b05859a2ba1ffa3e5abf5',
                '641b05859a2ba1ffa3e5abf9',
                '641b05859a2ba1ffa3e5ac11',
                '641b05859a2ba1ffa3e5ac0d',
                '641b05859a2ba1ffa3e5ac17',
                '641b05859a2ba1ffa3e5ac1e',
                '641b05859a2ba1ffa3e5ac09',
                '641b05859a2ba1ffa3e5ac0b',
                '641b05859a2ba1ffa3e5ac0f',
                '641b05859a2ba1ffa3e5ac23']

          } },
          outcomes: [
            '641b2e379a2ba1ffa3e5c1d8',
            '641b2e379a2ba1ffa3e5c1d4',
            '641b2e379a2ba1ffa3e5c1cb',
            '641b2e379a2ba1ffa3e5c1ba',
            '641b2e379a2ba1ffa3e5c1f2',
            '641b2e379a2ba1ffa3e5c1fa',
            '641b2e379a2ba1ffa3e5c22a',
            '641b3b439a2ba1ffa3e5c80e',
            '641b3b439a2ba1ffa3e5c80b',
            '641b3b439a2ba1ffa3e5c801',
            '641b2e379a2ba1ffa3e5c1f4',
            '641b2e489a2ba1ffa3e5c566',
            '641b2e489a2ba1ffa3e5c581',
            '641b2e489a2ba1ffa3e5c576',
            '642402c076b46b0ccca1cdc0',
            '642402c076b46b0ccca1cdc4',
            '641b2e2d9a2ba1ffa3e5bed8',
            '641b2e2e9a2ba1ffa3e5bf79',
            '641b2e2e9a2ba1ffa3e5bf91',
            '641b2e2e9a2ba1ffa3e5bf71',
            '641b2e2e9a2ba1ffa3e5bf6f',
            '641b2e2e9a2ba1ffa3e5bf95',
            '641b2e2e9a2ba1ffa3e5bfbf',
            '641b2e2f9a2ba1ffa3e5bffe',
            '641b2e2f9a2ba1ffa3e5bffa',
            '641b2e2f9a2ba1ffa3e5c002',
            '641b2e2f9a2ba1ffa3e5c004',
            '641b2e2f9a2ba1ffa3e5bfca',
            '641b2e2f9a2ba1ffa3e5bfd7',
            '641c024d9a2ba1ffa3e5cd91',
            '641c024d9a2ba1ffa3e5cd89',
            '641c024d9a2ba1ffa3e5cd71',
            '641c024d9a2ba1ffa3e5cd87',
            '641c024d9a2ba1ffa3e5cdb2',
            '641c024d9a2ba1ffa3e5cded',
            '641c024d9a2ba1ffa3e5cde1',
            '641c024d9a2ba1ffa3e5cdc2',
            '641c024d9a2ba1ffa3e5cdbe',
            '642402c076b46b0ccca1cdd1',
            '642402c076b46b0ccca1cdf0',
            '642402c076b46b0ccca1cdfa',
            '642402c076b46b0ccca1ce1a',
            '642402c076b46b0ccca1ce18',
            '642402c076b46b0ccca1ce14',
            '642402c076b46b0ccca1ce0f',
            '641b3b009a2ba1ffa3e5c73a',
            '641b3b009a2ba1ffa3e5c72c',
            '641b3b009a2ba1ffa3e5c72a',
            '641b3b009a2ba1ffa3e5c71c',
            '641b3b009a2ba1ffa3e5c76d',
            '641b3b009a2ba1ffa3e5c76f',
            '641b3b009a2ba1ffa3e5c755',
            '641b3b009a2ba1ffa3e5c795',
            '641b3b009a2ba1ffa3e5c798',
            '641b3b009a2ba1ffa3e5c784',
            '641b3b009a2ba1ffa3e5c786',
            '641b3b009a2ba1ffa3e5c769',
            '641b3b009a2ba1ffa3e5c76b',
            '641b2e2e9a2ba1ffa3e5bf21',
            '641b2e2e9a2ba1ffa3e5bf23',
            '641b2e2e9a2ba1ffa3e5bf09',
            '641b2e2e9a2ba1ffa3e5bf27',
            '641b2e2e9a2ba1ffa3e5bf29',
            '641b2e2e9a2ba1ffa3e5bf2f',
            '641b2e2e9a2ba1ffa3e5bf3e',
            '641b3b439a2ba1ffa3e5c83a',
            '641b2e2e9a2ba1ffa3e5bf47',
            '641b3b439a2ba1ffa3e5c85f',
            '641b3b439a2ba1ffa3e5c83e',
            '641b2e319a2ba1ffa3e5c01d',
            '641b2e319a2ba1ffa3e5c055',
            '641b2e319a2ba1ffa3e5c04f',
            '641b2e319a2ba1ffa3e5c03d',
            '641b2e299a2ba1ffa3e5bd3d',
            '641b2e299a2ba1ffa3e5bd37',
            '641b2e299a2ba1ffa3e5bd2d',
            '641b3b3b9a2ba1ffa3e5c7b0',
            '641b3b3c9a2ba1ffa3e5c7b2',
            '641b3b3c9a2ba1ffa3e5c7ba',
            '641b3b3c9a2ba1ffa3e5c7b6',
            '641b3b3c9a2ba1ffa3e5c7cd',
            '641b3b3c9a2ba1ffa3e5c7cb',
            '641b3b3c9a2ba1ffa3e5c7d2',
            '641b3b3c9a2ba1ffa3e5c7d6',
            '641b3b3c9a2ba1ffa3e5c7b8',
            '641b2e279a2ba1ffa3e5bcd0',
            '641b2e279a2ba1ffa3e5bcea',
            '641b3b499a2ba1ffa3e5c8f0',
            '641b3b499a2ba1ffa3e5c92b',
            '641b3b499a2ba1ffa3e5c8ea',
            '641b3b499a2ba1ffa3e5c8e6',
            '641b3b499a2ba1ffa3e5c903',
            '641b3b499a2ba1ffa3e5c8e4',
            '641b3b499a2ba1ffa3e5c91e',
            '641b3b499a2ba1ffa3e5c92d',
            '641b2e419a2ba1ffa3e5c3e3',
            '641b2e419a2ba1ffa3e5c3fb',
            '641b2e419a2ba1ffa3e5c3f4',
            '641b2e419a2ba1ffa3e5c413',
            '641b2e419a2ba1ffa3e5c46c',
          ]
        },
        evidencePrompts: [
          {
            id: 0,
            prompt: '5 user needs, in the form of "Need to...."',
            categoryId: 4
          },
          {
            id: 1,
            prompt: 'Up to 10 detailed quotes fromm the document about problems the user has',
            categoryId: 3,
            isQuote: true
          },
          {
            id: 2,
            prompt: '5 problems related to entity resolution, in the form "It sucks that..."',
            categoryId: 10,
            tags: ["Resolution"]
          },
          {
            id: 3,
            prompt: '5 problems related to data schemas and mapping, in the form "It sucks that..."',
            categoryId: 10,
            tags: ["Mastery"]
          },
          {
            id: 5,
            prompt: '5 problems related to data granularity or provenance, in the form "It sucks that..."',
            categoryId: 10,
            tags: ["Granularity"]
          },
          {
            id: 4,
            prompt: '5 problems related to knowledge management, in the form "It sucks that..."',
            categoryId: 10,
            tags: ["ArraInstitutional knowledge"]
          },
          {
            id: 5,
            prompt: '5 problems related to context of data, in the form "It sucks that..."',
            categoryId: 10,
            tags: ["Contact"]
          }
        ],
        metrics:[
            {id: 5, data:"1212"},
            {id: 11, data:"1212"}
        ],
        doDiscovery: true,
        evidenceAggregate: [
          { categoryIds: [10], items: [{id: 0, field: "scale", type: "scale", prompt: "Score the severity of each problem statement on scale of 0 to 9 with 0 being low and 9 being high"}, {id: 1, field: "specificity", type: "scale", prompt: "Score how specific each problem statement is on scale of 0 to 9 with 0 being low and 9 being high"}] },
          { categoryIds: [10], category: true },
          { category: true, categoryIds: [3] },
          { categoryIds: [3], items: [{id: 0, field: "specificity", type: "scale", prompt: "Score how specific each problem statement is on scale of 0 to 9 with 0 being low and 9 being high"}] }
        ]
    }
    const prim = await Primitive.findOne({_id:  new ObjectId("641aab679a2ba1ffa3e59781")})
    Object.keys(data).forEach((k)=>{
        prim[k] = data[k]
        console.log(prim[k])
        prim.markModified( k )
    })
    await prim.save()
    res.json({success:true})
})


router.post('/add_metric', async function(req, res, next) {
    let data = req.body

    try {
        /*
        Primitive.findByIdAndUpdate(
            ObjectId(data.primitive),
            { $push: { metrics: { id: { $max: "$metrics.id" } + 1, title: data.title, type: data.type, path: data.type === "conversion" ? {results: 0} : {metrics: { $max: "$metrics.id" } + 1} } } },
            {new: true},
            (err,doc)=>{
                if( err ){
                    throw err
                }
                console.log(doc)

                res.json({success: true})

            })*/

            Primitive.findOneAndUpdate(
                { _id: data.primitive },
                [
                  //{ "$project": { "maxIndex": { "$max": "$metrics.id" } } },
                  { "$addFields": { "newIndex": { "$add": [ { "$max": "$metrics.id" }, 1 ] } } },
                  { "$set": { "metrics": { 
                        "$concatArrays": [ 
                            {$ifNull: ["$metrics", []]}, 
                            [{ 
                                "id": {$ifNull: ["$newIndex",0]}, 
                                title: data.title, 
                                type: data.type, 
                                targets: data.targets,
                                path: data.type === "conversion" ? {results: 0} : {metrics: {$ifNull: ["$newIndex",0]}}
                            }] ] } } },
                  { "$unset": "newIndex"},
                //  { "$replaceRoot": { "newRoot": { "_id": "$_id", "metrics": "$metrics" } } },
                ],
                { new: true, upsert: false },
                (err, doc) => {
                  if (err) {
                    console.log(err);
                  } else {
                    console.o
                    const newId = Math.max(...doc.metrics.map((d)=>d.id))
                    res.json({success: true, id: newId })
                  }
                }
              );

      } catch (err) {
        res.json(400, {error: err.message})
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