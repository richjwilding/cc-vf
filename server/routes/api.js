import express from 'express';
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
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { getDocument, getDocumentAsPlainText, importGoogleDoc, removeDocument } from '../google_helper';
import analyzeDocument from '../openai_helper';
import {createPrimitive, flattenPath} from '../SharedFunctions'
import { encode } from 'gpt-3-encoder';

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
router.get('/primitives', async function(req, res, next) {
    let workspaceId = req.query.workspace
    const owns = req.query.owns

    try {
        const user = await User.findOne({email: req.user.email})
        const workspaces = user.workspaces || []
      //  const results = await Primitive.find({})
      let query = {$and: [
                    { workspaceId: { $in: workspaces }},
                    { type: { $in: ['activity','experiment','venture'] }}
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
            $or: [
                {workspaceId: workspaceId},
                query
            ]
        }
        if( workspaceId === "all"){
            query = { workspaceId: { $in: workspaces }}
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
        
            if( data.field === 'referenceParameters.notes'){                
                console.log(`purging old doumcent for ${data.receiver}`)
                removeDocument(data.receiver)
            }
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
            let notes = removed.referenceParameters?.notes
            if( notes ){
                await removeDocument( data.id )
            }
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
        const newPrimitive = await createPrimitive( data )        
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

router.get('/primitive/:id/getDocument', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    console.log( primitiveId )
    try{
        const remoteReadStream = await getDocument( primitiveId, req )

        res.set('Cache-Control', 'public, max-age=31557600');
        remoteReadStream.pipe(res);
    }catch(error){
        res.status(501).json({message: "Error"})
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
        res.json({success: true, result: result?.plain})
    }catch(err){
        res.status(400).json( {error: err.message})
        return
    }
})
router.get('/primitive/:id/discover', async function(req, res, next) {
    let data = req.body
    const primitiveId = req.params.id
    let success = false

    try{
        const prim = await Primitive.findOne({_id:  new ObjectId(primitiveId)})
        console.log(`Got origin ${prim.id} - category = ${prim.referenceId}`)
        const category = await Category.findOne({id: prim.referenceId})
        const extract = await getDocumentAsPlainText( primitiveId, req )
        if( extract ){
            const text = extract.plain
            
            let result = await analyzeDocument( {
                opener: category.openai.opener,
                descriptor: category.openai.descriptor,
                responseInstructions: category.openai.responseInstructions,
                text: text, 
                prompts: category.openai.prompts
            })
            
            if( result ){
                success = true
                if( result.success ){
                    const out = {}
                    const fieldMap = category.openai.prompts.filter((p)=>p.type !== "instruction").map((p)=>p.field)
                    Object.values(result.response).forEach((item, idx)=>{
                        let obj = Array.isArray(item) ? item[0] : item
                        if( obj.answer ){
                            if( obj.answer.toLowerCase().indexOf('not specified') === -1){
                                if( fieldMap[idx] ){
                                    out[fieldMap[idx]] = obj
                                }
                            }
                        }
                    })
                    result.response = out
                    prim.set("openai_error", null)
                }else{
                    prim.set("openai_error", result.status)
                }
            }else{
                prim.set("openai_error", "UNKNOWN")
            }
            await prim.save()
            res.json({success: success, result: result})
        }else{
            res.json({success: false, result: "Document not extracted"})
        }

            
    }catch(err){
        console.log(err)
        res.status(400).json( {error: err.message})
        return
    }

})
router.get('/primitive/:id/analyzeQuestions', async function(req, res, next) {
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

            const locateQuote = (oQuote, document)=>{
                const quote = oQuote.toLowerCase().replaceAll(/\./g," ").replaceAll(/\s+/g," ")
                console.log(`looking for ${quote}`)
                let startPage = 0
                let endPage = 0
                let startIdx = 0
                let endIdx = 0
                let terminate = false
                const subset = (fwd)=>{
                    const final = (data)=>{
                        return data.join(" ").toLowerCase().replaceAll(/\./g," ").replaceAll(/\s+/g," ")
                    }
                    let str = []
                    if( startIdx >= document.pages[endPage].content.length ){
                        startIdx = 0
                        startPage++

                    }

                    if( startPage === endPage && startIdx > endIdx){
                        return final(str)
                    }

                    if( fwd && endIdx >= document.pages[endPage].content.length ){
                        const oldIdx = endIdx
                        endIdx = 0
                        endPage++
                        if( endPage === document.pages.length ){
                            terminate = true
                            endPage--
                            endIdx = oldIdx - 1                            
                            return final(str)
                        }
                    }
                    for( let p = startPage; p <= endPage; p++){
                        const start = p === startPage ? startIdx : 0
                        const max = document.pages[p].content.length
                        for( let i = start; i < max; i++){
                            if( (p === endPage) && (i > endIdx)){
                                continue
                            }
                            if( !document.pages[p].content[i].ignore ){
                                str.push( document.pages[p].content[i].str )
                            }
                        }
                    }
                    return final(str)
                }
                // first pass
                while( subset(true).indexOf(quote) === -1 && !terminate){
                    endIdx++
                }
                console.log(`found end page ${endPage} / ${endIdx}`)

                let out = undefined
                if( !terminate ){

                    terminate = false
                
                    while( subset(false).indexOf(quote) !== -1 && !terminate){
                        startIdx++
                    }
                    if(!terminate){
                        if( startIdx === 0 ){
                            startPage--
                            startIdx = document.pages[startPage].content.length - 1

                        }else{
                            startIdx--
                        }
                        console.log(`found start at page ${startPage} / ${startIdx} - ${endPage} / ${endIdx}`)
                        out = []
                        for( let p = startPage; p <= endPage; p++){
                            const start = p === startPage ? startIdx : 0
                            const max = document.pages[p].content.length
                            for( let i = start; i < max; i++){
                                if( (p === endPage) && (i > endIdx)){
                                    continue
                                }
                                const item = document.pages[p].content[i]
                                if( item){

                                    const w = document.pages[p].pageInfo.width / 100
                                    const h = document.pages[p].pageInfo.height / 100
                                    out.push( {
                                        pageIndex:p,
                                        left: item.x / w,
                                        top: (item.y - item.height) / h,
                                        width: item.width / w,
                                        height: item.height / h,
                                    })
                                }
                            }
                        }
                    }
                }
                return out

            }

            const extract = await getDocumentAsPlainText( primitiveId, req )
           /* const out = locateQuote("we as a firm assume the data is wrong coming up with a strategy that helps us to understand the difference in error for example, in commercial real estate, there are a fixed number of vendors who investors rely on for doing their underwriting they all have different approaches to generating a data set e.g. avg rent, price per square foot some do it by surveying owners or tenants some use reits as a way to back out data others leverage partnerships with operators e.g. the greystars", extract.data)
            res.json({success: success, result: out})
            return */

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

               /* result = {
                  //  response: JSON.parse('{\n  "T0": {\n    "results": [\n      {\n        "quote": "Trying to implement consistency and drive data quality",\n        "need": "Consistency and data quality"\n      },\n      {\n        "quote": "The data quality issue is the most impactful",\n        "need": "Data quality"\n      },\n      {\n        "quote": "Having one single view of what our standardized data sets are",\n        "need": "Standardization of data sets"\n      },\n      {\n        "quote": "Trying to apply that model to data sets in your organization",\n        "need": "Data set organization"\n      },\n      {\n        "quote": "Being able to reconcile to a single individual",\n        "need": "Entity resolution"\n      }\n    ]\n  }\n}'),
                    response: {
                        "T0": [
                            {
                                "quote": "Everyone has a slightly different view of headcount for the organization",
                                "problem": "It sucks that there is no centralized version of truth for organization-wide data like headcount.",
                                "scale": 7
                            },
                            {
                                "quote": "Because the way our data is stored is siloed, any changes I make won’t carry through to other members of the department",
                                "problem": "It sucks that changes made to data in one department won't reflect across the entire organization due to silos.",
                                "scale": 8
                            },
                            {
                                "quote": "The surprise would be that none of these data sets are really joined up. You kind of assume that there is a lot more connection between data sets and data sources than there actually are.",
                                "problem": "It sucks that there is a lack of data provenance across the organization, with data sets not being joined up.",
                                "scale": 6
                            }
                        ],
                        "T1": [
                            {
                                "quote": "Trying to implement consistency and drive data quality.",
                                "problem": "It sucks that there are inconsistencies and poor data quality across the organization.",
                                "scale": 6
                            }
                        ],
                        "T2": [
                            {
                                "quote": "None"
                            }
                        ]
                    },
                    success:true}*/
                    

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


async function replicateURLtoStorage(url, id, bucketName){
    console.log(`replicating`)
    if(!url || !id){return false}
    if( url.slice(0,4) !== "http"){return false}
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
      });

    bucketname = 'bucket-profiles-vf-cc'

    const bucket = storage.bucket(bucketname);
    const file = bucket.file(id)
    if( (await file.exists())[0] ){
        await file.delete()
    }
    const stream = file.createWriteStream()


    const response = await fetch(url)
    await finished(Readable.fromWeb(response.body).pipe(stream));
    return true

}


export default router;