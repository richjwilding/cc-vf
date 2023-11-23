import express, { query } from 'express';
import mongoose from 'mongoose';
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
import analyzeDocument, { buildEmbeddings } from '../openai_helper';
import {createPrimitive, flattenPath, doPrimitiveAction, removeRelationship, addRelationship, removePrimitiveById, dispatchControlUpdate, euclideanDistance, primitiveChildren, primitiveDescendents, cosineSimilarity, primitiveOrigin} from '../SharedFunctions'
import { encode } from 'gpt-3-encoder';
import { SIO } from '../socket';
import QueueAI from '../ai_queue';
import QueueDocument from '../document_queue';
import Embedding from '../model/Embedding';

var ObjectId = require('mongoose').Types.ObjectId;

const parser = PrimitiveParser()
var router = express.Router();

router.get('/', async function(req, res, next) {
    res.json({up: true})
})
router.get('/image/:id', async function(req, res, next) {
    const id = req.params.id
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

})
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
                    { type: { $in: ['activity','experiment','venture'] }},
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
        
        const results = await Primitive.find(query)
        res.json(results)
      } catch (err) {
        console.log(err)
        res.json({error: err})
      }

})


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
})
router.post('/set_field', async function(req, res, next) {
    let data = req.body
    console.log(`${data.receiver} - ${data.field} = ${data.value}`)
    let result


    try {

        const prim = await Primitive.findOneAndUpdate(
            {
                    "_id": new ObjectId(data.receiver),
            }, 
            {
                $set: { [data.field]: data.value },
            },
            {new: true})
        
            if( data.field === 'referenceParameters.notes'){                
                console.log(`Queue purging of old document for ${data.receiver}`)
               // removeDocument(data.receiver)
                QueueDocument().add(`doc_refresh_${data.receiver}`, 
                    {
                        command: "refresh", 
                        id: data.receiver, 
                        value: data.value, 
                        req: {user: {accessToken: req.user.accessToken, refreshToken: req.user.refreshToken}}
                    })
            }

        const category = await Category.findOne({id: prim.referenceId})
        if( category && category.actions ){
            for(const action of category.actions){
                if( action.onUpdate ){
                    const lastField = data.field.split('.').slice(-1)?.[0]
                    if( action.onUpdate === true || (Array.isArray(action.onUpdate) && action.onUpdate.includes(lastField) )){
                        result = await doPrimitiveAction(prim, action.key, undefined, req)
                    }else{

                        console.log('wont do ')
                    }
                }
            }
        }
        

        SIO.notifyPrimitiveEvent(prim, [
            {
                type: "set_fields",
                primitiveId: data.receiver,
                fields:{[data.field]:data.value}
            }
        ])

        res.json({success: true, result: result})
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
        const newPrimitive = await createPrimitive( data, req )        
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
    console.log(data)

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
router.post('/primitive/:id/action/:action', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    const action = req.params.action
    const options = req.body
    console.log( primitiveId, action, options)
    try{
        let result
        const primitive = await Primitive.findOne({_id:  new ObjectId(primitiveId)})

        if( primitive){
            result = await doPrimitiveAction(primitive, action, options, req)
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
                const primitive = await Primitive.findOne({"_id": new ObjectId( primitiveId)})
            const parent = parentId && await Primitive.findOne({"_id": new ObjectId(parentId)})
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
    console.log( primitiveId )
    try{
        const result = await getDocumentAsPlainText( primitiveId, req )
        res.json({success: true, result: result?.plain, encoded: result?.data})
    }catch(err){
        res.status(400).json( {error: err.message})
        return
    }
})
router.get('/primitive/:id/discover', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    let success = true

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
    try{
        const prim = await Primitive.findOne({_id:  new ObjectId(primitiveId)})
        await QueueDocument().processQuestions(prim, qIds, req)
        res.json({success: true})
    }catch(err){
        console.log(err)
        res.status(400).json( {error: err.message})
    }
    
})
router.get('/primitive/:id/_analyzeQuestions', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    const qIds = req.query.questionIds
    let out = []

    try{
        let success = false
        let result 
        const origin = await Primitive.findOne({["primitives.origin"]: {$in: [primitiveId]}})
        const prim = await Primitive.findOne({_id:  new ObjectId(primitiveId)})
        if( origin && prim ){
            //const questions = new Proxy(origin.primitives, parser).allQuestion
            const questions = await Primitive.find({[`parentPrimitives.${origin._id}.0`]: 'primitives.origin', type: 'question'})
           
            const groups = {}

            for(const question of questions){
                if( qIds && !qIds.includes( question.id ) ){
                    console.log('skipping')
                    continue
                }
                const cPrompts = await Primitive.find({[`parentPrimitives.${question._id}.0`]: 'primitives.origin', type: 'prompt'})
                for( const prompt of cPrompts){
                    const category = await Category.findOne({id: prompt.referenceId})
                    groups[prompt.referenceId] = groups[prompt.referenceId] || {
                        category: category,
                        id: prompt.referenceId,
                        prompts: [],
                    }
                    if( category ){
                        let out
                        const isEmpty = (prompt.allowInput === false) || prompt.title === undefined || prompt.title === null || prompt.title.trim() === "" 
                        if( isEmpty ){
                            out = category.empty
                        }else{
                            out = category.base.replace("${t}", prompt.title)
                        }
                        if( out ){
                            out = out.replace("${n}", prompt.referenceParameters?.count || category.parameters?.count?.default) 
                            groups[prompt.referenceId].prompts.push( {
                                id: prompt.id,
                                text: out
                            } )
                        }
                    }
                }
            }


            const extract = await getDocumentAsPlainText( primitiveId, req )

            const text = extract.plain
            for( const group of Object.values(groups)){
                const resultField = group.category.openai.field || "problem"
                result = await analyzeDocument( {
                    opener: group.category.openai.opener,
                    descriptor: group.category.openai.descriptor,
                    responseInstructions: group.category.openai.responseInstructions,
                    text: text, 
                    prompts: group.prompts.map((p)=>p.text)
                })


                if( result ){
                    success = true
                    if( result.success ){
                        if( group.prompts.length == 1 && Array.isArray(result.response) ){
                            result.response = {
                                "T1": Object.values( result.response )
                            }
                        }
                        result = {
                            result: Object.values(result.response).map((d, idx)=>{
                                let results = Array.isArray(d) ? d : Object.values(d)
                                console.log(results.length)
                                if( results.length === 1 ){
                                    console.log((results[0] instanceof Object) , Object.keys(results[0]).length === 1 , Array.isArray(Object.values(results[0])))
                                    if( results.length === 1 && Array.isArray(results[0]) ){
                                        console.log(`Aligning to nested array`)
                                        console.log(results)
                                        results = Object.values(results[0])
                                    }
                                }
                                if( !results.forEach){
                                    console.log(results)
                                    throw new Error("UNEXPECT DATA TYPE FOR RESU")
                                }
                                results.forEach((p)=>{
                                    if( p.quote ){
                                        if( (p[resultField] == undefined) || (p[resultField] === "none") || (p.quote === 'none')){
                                            return;
                                        }
                                        p.highlightAreas = locateQuote(p.quote, extract.data)
                                    }
                                })
                                return group.prompts[idx]
                                    ?    {
                                            id: group.prompts[idx].id,
                                            results: results
                                        }
                                    : {id: "error"}
                            }),
                            instructions: result.instructions,
                            raw: result.raw,
                            categoryId: group.id
                        }
                    }else{
                        result = {raw: result.raw, instructions: result.instructions, categoryId: group.id, parseFail: true}
                    }
                    out.push(result)
                }
            }
        }
        res.json({success: success, result: out})
    }catch(err){
        console.log(err)
        res.status(400).json( {error: err.message})
        return
    }

})



export default router;