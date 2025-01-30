import express, { query } from 'express';
import User from '../model/User';
import Company from '../model/Company';
import AssessmentFramework from '../model/AssessmentFramework';
import Workspace from '../model/Workspace';
import Contact from '../model/Contact';
import Category from '../model/Category';
import Primitive from '../model/Primitive';
import PrimitiveParser from '../PrimitivesParser';
import { Storage } from '@google-cloud/storage';
import { buildEmbeddingsForPrimitives, getDocument, getDocumentAsPlainText, importGoogleDoc, locateQuote, removeDocument, replicateURLtoStorage } from '../google_helper';
import {createPrimitive, flattenPath, doPrimitiveAction, removeRelationship, addRelationship, removePrimitiveById, dispatchControlUpdate, euclideanDistance, primitiveChildren, primitiveDescendents, cosineSimilarity, primitiveOrigin, queueStatus, queueReset, updateFieldWithCallbacks, fetchPrimitive, recoverPrimitive, doPurge, fetchPrimitives, DONT_LOAD, executeConcurrently, DONT_LOAD_UI} from '../SharedFunctions'
import { encode } from 'gpt-3-encoder';
import QueueDocument from '../document_queue';
import Embedding from '../model/Embedding';
import { unpack, pack } from 'msgpackr';
import { buildPage } from '../htmlexporter';

var ObjectId = require('mongoose').Types.ObjectId;

const parser = PrimitiveParser()
var router = express.Router();

async function userCanAccessPrimitive(primitive, req, res){
    if( typeof(primitive) === "string"){
        const realPrim = await fetchPrimitive(primitive, {workspaceId: {$in: req?.user?.workspaceIds ?? []}})
        if( realPrim === undefined ){
            res.status(401).json({message: "Permission denied"})
            return false
        }
        return true
    }
    if( req.user ){
        if( req.user.workspaceIds ){
            if( req.user.workspaceIds.includes(primitive.workspaceId)){
                return true
            }
        }
    }
    res.status(401).json({message: "Permission denied"})
    return false
}

router.get('/', async function(req, res, next) {
    res.json({up: true})
})
router.get('/image/:id', async function(req, res, next) {
    const id = req.params.id


    /*
    const primitive = await fetchPrimitive(id, {workspaceId: {$in: req?.user?.workspaceIds ?? []}})
    if( !primitive ){
        res.status(401).json({message: "Permission denied"})
        return
    }*/

    const bucketName = 'cc_vf_images'
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
      });
    try{

        const bucket = storage.bucket(bucketName);
        const file = bucket.file(id)
        const remoteReadStream = file.createReadStream()
                                    .on('error', function(err) {
                                        res.status(404)
                                        .set('Cache-Control', 'no-cache, no-store, must-revalidate')
                                        .set('Pragma', 'no-cache')
                                        .set('Expires', '0')
                                        .send('Resource not found');
                                        return
                                    });
        res.set('Cache-Control', 'public, max-age=31557600');
        remoteReadStream.pipe(res);
    }catch(error){
        res.status(501).json({message: "Error", error: error})
    }
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
        res.status(501).json({message: "Error", error: error})
    }
})
/*router.get('/enrichContact', async function(req, res, next) {
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
                contact.avatarPresent = await replicateURLtoStorage( data.profile_pic_url, contact.id, 'bucket-profiles-vf-cc' )
                contact.avatarUrl = false
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
                    contact.avatarPresent = await replicateURLtoStorage( data.tmp_profile_pic_url, contact.id, 'bucket-profiles-vf-cc' )
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

})*/
router.get('/users', async function(req, res, next) {

    try {
        const results = await User.find({})
        res.json(results)
      } catch (err) {
        res.json({error: err})
      }

})
router.get('/frameworks', async function(req, res, next) {
    try {
        const results = await AssessmentFramework.find({})
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
router.get('/workspaces', async function(req, res, next) {

    try {
        const results = await Workspace.find({})
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
/*
    router.post('/primitive/:id/addImport', async function(req, res, next) {
        try {
            const primitiveId = req.params.id
            const target = req.body.target
            const filters = req.body.filters

            console.log(`GOT ADD IMPORT`)
            await addImport( primitiveId, target, filters)



            res.json({success: true})
        }catch(err){
            console.log(err)
            res.json({error: err})
        }

    })*/
    router.get('/purge/:count', async function(req, res, next) {
        try {
            const count = req.params.count
            await doPurge(count)
            res.json({success: true})
        }catch(err){
            console.log(err)
            res.json({error: err})

        }
    })
    router.get('/primitive/:id/recover', async function(req, res, next) {
        const primitiveId = req.params.id
        try {
            await recoverPrimitive(primitiveId)
            res.json({success: true})
        }catch(err){
            console.log(err)
            res.json({error: err})

        }
    })
    router.post('/primitive/:id/getDistances', async function(req, res, next) {
    const primitiveId = req.params.id
    const field = 'param.offerings'
    try {
        const list = req.body.ids

        const pE = await Embedding.findOne({foreignId: primitiveId, type: field })
        const distances = []
        if( pE){
            const compares = await Embedding.find({foreignId: {$in: list}, type: field})
            const distances = compares.map((d)=>{
                return {
                    id: d.foreignId,
                    distance: euclideanDistance( pE.embeddings, d.embeddings)
                }
            })

            res.json({success: true, distances: distances})
        }else{
            res.json({success: false, error: `Couldnt find target ${primitiveId} / ${field}`})
        }
    }catch(err){
        console.log(err)
        res.json({error: err})

    }
})

router.get('/primitives', async function(req, res, next) {
    let workspaceId = req.query.workspace
    const owns = req.query.owns

    try {
        const user = await User.findOne({email: req.user.email})
        const workspaces = user.workspaces || []
      //  const results = await Primitive.find({})
      let query = {$and: [
                    { workspaceId: { $in: workspaces }},
                    { type: { $in: ['activity','experiment','venture', 'board','working'] }},
                    { deleted: {$exists: false}}
                ]}
    
        if( owns !== undefined ){
            let primitive
            try{
                primitive = await Primitive.findOne({"_id": new ObjectId(owns)})
            }catch{
                primitive = await Primitive.findOne({"plainId": parseInt(owns)})
            }
            workspaceId = primitive?.workspaceId

        }

        if( !workspaces.includes(workspaceId)){
            workspaceId = undefined
        }

        
      if( workspaceId !== undefined){
        query = {
            $and: [
                {$or: [
                    {workspaceId: workspaceId},
                    query
                ]},
                { deleted: {$exists: false}}
            ]
                
        }
        if( workspaceId === "all"){
            query = { 
                $and: [
                    {workspaceId: { $in: workspaces }},
                    { deleted: {$exists: false}}
                ]
            }
        }
      }
        
        
        //const results = await Primitive.find(query,{crunchbaseData: 0, linkedInData: 0, checkCache:0})
        console.log(`Doing fetch....`)
        let results
        if( workspaceId ){
            console.time(`multi`)
            if( true ){
                async function getData(hexChar){
                    if( hexChar === "-"){
                        let query = {$and: [
                            { workspaceId: { $in: workspaces.filter(d=>d !== workspaceId) }},
                            { type: { $in: ['activity','experiment','venture', 'board','working'] }},
                            { deleted: {$exists: false}}
                        ]}
                        return await Primitive.find(query, DONT_LOAD_UI)
                    }
//                    return await fetchPrimitives(undefined, { "_id": { "$regex": `[${hexChar}]$`}, "workspaceId": workspaceId }, DONT_LOAD)
                    const set = await Primitive.aggregate([
                        { "$match": { "workspaceId": workspaceId,  "deleted": {$exists: false}} },
                        { "$addFields": { "_idStr": { "$toString": "$_id" } } },
                        { "$match": { "_idStr": { "$regex": `${hexChar}$` } } },
                        { "$project": DONT_LOAD_UI }
                    ])
                    return set
                }
                const {results:data} = await executeConcurrently(["-",0,1,2,3,4,5,6,7,8,9,"a","b","c","d","e","f"], getData, undefined, undefined, 8)

                results = data.flat()
                

            }else{
                const ids = (await Primitive.find(query,{_id: 1})).map(d=>d.id)
                const chunks = [], chunkCount = 2000, len = ids.length
                for(let i = 0; i < len; i+= chunkCount){
                    chunks.push(ids.slice(i, i + chunkCount))
                }
                console.log(`Got ${ids.length} - split to ${chunks.length}`)
                async function getData(ids){
                    return await fetchPrimitives(ids, undefined, DONT_LOAD)
                }
                const {results:data} = await executeConcurrently(chunks, getData, undefined, undefined, 10)
                results = data.flat()
            }
            console.log(`Back with ${results.length}`)
            console.timeEnd(`multi`)
        }else{
            results = await Primitive.find(query,{crunchbaseData: 0, linkedInData: 0, checkCache:0, financialData: 0, action_tracker: 0})
        }

        console.log(`Packing....`)
        //res.json(results)

        res.setHeader('Content-Type', 'application/msgpack');
        res.send(pack(results));

      } catch (err) {
        console.log(err)
        res.json({error: err})
      }

})
/*

router.post('/remove_metric', async function(req, res, next) {
    let data = req.body
    console.log(`remove`)
    console.log(data)

    try {
        await Primitive.findOneAndUpdate(
            {
                "_id": new ObjectId(data.primitive),
                "metrics.id": data.id,
            }, 
            {
                $pull:{"metrics": {id: data.id}},
                $unset:{[`primitives.metrics.${data.id}`]: true}
            })
        res.json({success: true, id: data.id })
      } catch (err) {
        res.json(400, {error: err.message})
    }
})
router.post('/update_metric', async function(req, res, next) {
    let data = req.body
    try {
        await Primitive.findOneAndUpdate(
            {
                "_id": new ObjectId(data.primitive),
                "metrics.id": data.id,
            }, 
            {
                $set:{
                    "metrics.$": {
                        id: data.id,
                        title: data.title, 
                        type: data.type, 
                        targets: data.targets,
                        path: data.type === "conversion" ? {results: 0} : {metrics: data.id}
                    }
                }
            })
        res.json({success: true, id: data.id })
      } catch (err) {
        res.json(400, {error: err.message})
    }
})

router.post('/add_metric', async function(req, res, next) {
    let data = req.body

    try {

            Primitive.findOneAndUpdate(
                { _id: data.primitive },
                [
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

router.post('/primitive/:id/set_user', async function(req, res, next) {
    const primitiveId = req.params.id
    let data = req.body
    console.log(data)
    const userId = data.userId
    const mode = data.mode
    let success = false

    try {

        if( mode === "add"){
            await Primitive.findOneAndUpdate(
                {
                    "_id": new ObjectId(primitiveId),
                    'users.other': {$nin: [userId]},
                }, 
                {
                    $push: { 'users.other': userId},
                })
            success = true
        }
        if( mode === "remove"){
            await Primitive.findOneAndUpdate(
                {
                    "_id": new ObjectId(primitiveId),
                    'users.other': {$in: [userId]},
                }, 
                {
                    $pull: { 'users.other': userId},
                })
            success = true
        }
        res.json({success: success})
      } catch (err) {
        res.json(400, {error: err.message})
    }
})*/

router.post('/set_field', async function(req, res, next) {
    let data = req.body
    console.log(`${data.receiver} - ${data.field} = ${data.value}`)
    let result

    if( !await userCanAccessPrimitive(data.receiver, req, res) ){
        return
    }


    try {
        await updateFieldWithCallbacks( data.receiver, data.field, {decode: true, value: data.value, modify: data.modify}, req )

        res.json({success: true, result: result})
      } catch (err) {
        res.json(400, {error: err.message})
    }
})
router.post('/move_relationship', async function(req, res, next) {
    let data = req.body
    if( !await userCanAccessPrimitive(data.receiver, req, res) ){
        return
    }

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
            res.json({success: true})
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



router.post('/remove_primitive', async function(req, res, next) {
    let data = req.body
    if( !await userCanAccessPrimitive(data.id, req, res) ){
        return
    }
    console.log(`API: remove_primitive ${data.id}`)

    try {

        const removedIds = await removePrimitiveById(data.id)

        res.json({success: true, result: removedIds})
      } catch (err) {
        console.log(`Error deleting`)
        console.log(err)
        res.status(400).json({error: err.message})
    }
})
router.post('/add_primitive', async function(req, res, next) {
    let data = req.body

    try {
        const newPrimitive = await createPrimitive( data, false, req  )        
        if( newPrimitive === undefined ){
            throw new Error("No primitive created")
        }
        const newId = newPrimitive._id.toString()
        res.json({success: true, result: newPrimitive })
      } catch (err) {
        res.status(400).json({error: err.message})
    }
})



router.post('/set_relationship', async function(req, res, next) {
    let data = req.body
    if( !await userCanAccessPrimitive(data.receiver, req, res) ){
        return
    }

    try {
        const path = flattenPath( data.path )
        
        if( data.set ){
           try{
               await addRelationship( data.receiver, data.target, path)
           }catch(error){
            throw error
           }

        }else{
           try{
               await removeRelationship( data.receiver, data.target, path)
           }catch(error){
            throw error
           }

        }
        res.json({success: true})
    } catch (err) {
        res.status(400).json( {error: err.message})
    }

})
router.get('/queue/reset', async function(req, res, next) {
    const status = await queueReset()
    res.json({success: true, result: status})

})
router.get('/queue/status', async function(req, res, next) {
    const status = await queueStatus()
    res.json({success: true, result: status})

})
router.post('/primitive/:id/action/:action', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    const action = req.params.action
    const options = req.body
    console.log( primitiveId, action, options)
    try{
        let result
        const primitive = await fetchPrimitive(primitiveId)

        if( !await userCanAccessPrimitive(primitive, req, res) ){
            return
        }

        if( primitive){
            try{
                result = await doPrimitiveAction(primitive, action, options, req)
            }catch(e){
                console.log(`Error in doPrimitiveAction ${primitiveId} ${action}`, options)
                console.log(e)
            }
        }
        if( result && result.error ){
            res.json({success: false, error: result.error})
        }else{
            res.json({success: true, result: result})
        }
    }catch(error){
        console.log(error)
        res.status(501).json({message: "Error", error: error})
    }

})
router.get('/primitive/:id/queryPrimitives', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    const limit = req.query.limit ?? 10
    const value = req.query.value
    const parentId = req.query.parent
    const types = [req.query.types].flat().filter(d=>d)
    const threshold = req.query.threshold

    try{
        let result = []
        if( value && value.trim() > ""){

            let list = []
            const primitive = await fetchPrimitive(primitiveId)
            if( !await userCanAccessPrimitive(primitive, req, res) ){
                return
            }
            const parent = parentId && await await fetchPrimitive(parentId)
            if( parent ){
                list = await primitiveDescendents(parent, types)
            }else{
                if(primitive){
                    list = await Primitive.find({
                        $and:[
                            {"workspaceId": primitive.workspaceId},
                            {type: types.length === 0 ? {$ne: ""} : {$in: types}},
                            { deleted: {$exists: false}}
                        ]
                    },"_id title parentPrimitives")
                }            
            }
            const validOrigins = await Primitive.find({
                $and:[
                    {"workspaceId": primitive.workspaceId},
                    {referenceId: {$in: [9,22]}},
                    { deleted: {$exists: false}}
                ]
            },"_id title referenceId")
            const validIds = validOrigins.map(d=>d.id)

            console.log(`QUERY got ${list.length} items / ${validIds.length} origins`)
            const e_list = []

                for( const d of list){
                    const oId = primitiveOrigin( d )
                    if( validIds.includes( oId ) ){
                        e_list.push( d )
                    }
                }
            console.log(`Filterd to ${e_list.length} items`)
            
            const embedding = await buildEmbeddings( value)
            if( embedding.success ){
                console.log(`Got embedding`)
                const e_embeddings = await buildEmbeddingsForPrimitives( e_list, "title", false )
                
                console.log(`Scoring`)
                result = e_embeddings.map(d=>{
                    return {
                        id: d.foreignId,
                        score: cosineSimilarity( embedding.embeddings, d.embeddings )
                    }
                }).sort((a,b)=>b.score-a.score).slice(0, limit)
                console.log(`back`)
                if( threshold ){
                    result = result.filter(d=>d.score >= threshold)
                }
                
            }
        }

        res.json({success: true, result: result.map(d=>d.id)})
    }catch(error){
        console.log(error)
        res.status(501).json({message: error})
    }

})

router.get('/primitive/:id/getDocument', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    if( !await userCanAccessPrimitive(primitiveId, req, res) ){
        return
    }
    console.log( primitiveId )
    try{
        const remoteReadStream = await getDocument( primitiveId, req )

        res.set('Cache-Control', 'public, max-age=31557600');
        remoteReadStream.pipe(res);
    }catch(error){
        res.status(501).json({message: error})
    }

})
router.get('/primitive/:id/getDocumentTokenCount', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    console.log( primitiveId )
    if( !await userCanAccessPrimitive(primitiveId, req, res) ){
        return
    }
    try{
        const result = await getDocumentAsPlainText( primitiveId, req )

        const encoded = encode(result?.plain)

        res.json({success: true, result: encoded})
    }catch(err){
        res.status(400).json( {error: err.message})
        return
    }
})
router.get('/primitive/:id/getDocumentAsPlainText', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    const force = req.query.force
    console.log( primitiveId )
    if( !await userCanAccessPrimitive(primitiveId, req, res) ){
        return
    }
    try{
        const result = await getDocumentAsPlainText( primitiveId, req, undefined, undefined, force )
        res.json({success: true, result: result?.plain, encoded: result?.data})
    }catch(err){
        res.status(400).json( {error: err.message})
        return
    }
})
router.post('/primitive/:id/findQuote', async function(req, res, next) {
    const primitiveId = req.params.id
    const quote = req.body.quote
    console.log( primitiveId, quote )
    if( !await userCanAccessPrimitive(primitiveId, req, res) ){
        return
    }
    try{
        const extract = await getDocumentAsPlainText( primitiveId, req, undefined, true )
        const highlights = extract.data ? locateQuote(quote, extract.data) : undefined
        res.json({success: true, result: highlights})
    }catch(err){
        res.status(400).json( {error: err.message})
        return
    }
})
router.get('/primitive/:id/discover', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    let success = true
    if( !await userCanAccessPrimitive(primitiveId, req, res) ){
        return
    }

    try{
        const prim = await Primitive.findOne({_id:  new ObjectId(primitiveId)})
        const result = await QueueDocument().documentDiscovery( prim, req )
        res.json({success: success})
    }catch(err){
        console.log(err)
        res.status(400).json( {error: err.message})
        return
    }

})
router.get('/primitive/:id/analyzeQuestions', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    const qIds = req.query.questionIds ? [req.query.questionIds].flat() : undefined
    let out = []
    if( !await userCanAccessPrimitive(primitiveId, req, res) ){
        return
    }
    try{
        const prim = await Primitive.findOne({_id:  new ObjectId(primitiveId)})
        await QueueDocument().processQuestions(prim, {qIds: qIds}, req)
        res.json({success: true})
    }catch(err){
        console.log(err)
        res.status(400).json( {error: err.message})
    }
    
})



export default router;