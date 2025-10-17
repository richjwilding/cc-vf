import express, { query } from 'express';
import { once } from 'events';
import { PassThrough } from 'stream';
import { pipeline as pipelineAsync } from 'node:stream/promises';
import * as zlib from 'node:zlib'; // namespace import works best in Node ESM
const { constants: zlibConstants, createBrotliCompress, createGzip } = zlib;
import { performance } from 'perf_hooks';
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
import {createPrimitive, flattenPath, doPrimitiveAction, removeRelationship, addRelationship, removePrimitiveById, dispatchControlUpdate, euclideanDistance, primitiveChildren, primitiveDescendents, cosineSimilarity, primitiveOrigin, queueStatus, queueReset, updateFieldWithCallbacks, fetchPrimitive, recoverPrimitive, doPurge, fetchPrimitives, DONT_LOAD, executeConcurrently, DONT_LOAD_UI, createWorkspace, updateWorkspace, getOrganizationsWithSubscriptionPlans} from '../SharedFunctions'
import { encode } from 'gpt-3-encoder';
import QueueDocument from '../document_queue';
import Embedding from '../model/Embedding';
import axios from 'axios';
import { pack } from 'msgpackr';
import { findCompanyURL } from '../company_discovery';
import { compareTwoStrings } from '../actions/SharedTransforms';
import { replicateWorkflow } from '../workflow';
import Organization from '../model/Organization';
import SubscriptionPlan from '../model/SubscriptionPlan';
import { handleChat } from '../agent/agent.js';
import { getRedisBase } from '../redis.js';
import { getQueue } from '../queue_registry.js';
import { runRepresentationPass } from '../representation/representationPass.js';

var ObjectId = require('mongoose').Types.ObjectId;

const parser = PrimitiveParser()
var router = express.Router();

function normalizeId(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value?.toString) {
    return value.toString();
  }
  return undefined;
}

function sanitizeSlackConfig(slack) {
  if (!slack) {
    return {
      teamId: null,
      resultsBaseUrl: null,
      runAsUserId: null,
      enabledWorkflows: [],
    };
  }
  const enabledWorkflows = Array.isArray(slack.enabledWorkflows)
    ? slack.enabledWorkflows
        .map((value) => normalizeId(value))
        .filter(Boolean)
    : [];
  const runAsUserId = normalizeId(slack.runAsUserId) ?? null;
  const resultsBaseUrl = slack.resultsBaseUrl ?? null;
  const teamId = slack.teamId ?? null;

  return {
    teamId,
    resultsBaseUrl,
    runAsUserId,
    enabledWorkflows,
  };
}

function findOrganizationMembership(organization, userId) {
  if (!organization || !userId) {
    return null;
  }
  const members = organization.members ?? [];
  return members.find((member) => normalizeId(member.user) === normalizeId(userId)) ?? null;
}

function canManageOrganizationSlack(role) {
  return role === 'owner' || role === 'admin';
}

async function userCanAccessPrimitive(primitive, req, res){
    if( typeof(primitive) === "string"){
        const realPrim = await fetchPrimitive(primitive, {workspaceId: {$in: req?.user?.workspaceIds ?? []}})
        if( realPrim === undefined ){
            res.status(401).json({message: "Permission denied"})
            return false
        }
        return realPrim
    }
    if( req.user ){
        if( req.user.workspaceIds ){
            if( req.user.workspaceIds.includes(primitive.workspaceId)){
                return primitive
            }
        }
    }
    res.status(401).json({message: "Permission denied"})
    return false
}

function parseBullJobKey(jobKey){
    if( !jobKey || typeof jobKey !== "string"){
        return {}
    }
    if( jobKey.startsWith("bull:") ){
        const [, queueName, ...rest] = jobKey.split(":")
        if( !queueName || rest.length === 0 ){
            return {}
        }
        return { queueName, jobId: rest.join(":") }
    }
    return {}
}

router.get('/', async function(req, res, next) {
    res.json({up: true})
})

router.get('/companyDetails', async (req, res) => {
    const name = req.query.name;
    let domain = req.query.domain;
    let key = process.env.LOGODEV_KEY

  
    try {
        if( name ){
            const data = await findCompanyURL( name, {withDescriptions: true} )
            res.json( data )
        }else{
            res.json( {} )
        }
    } catch (error) {
      console.error('Error fetching image:', error.message);
      res.status(500).send('Error fetching image');
    }
  });


router.get('/companyLogo', async (req, res) => {
    const name = req.query.name;
    let domain = req.query.domain;
    let key = process.env.LOGODEV_KEY_PK

    if(!domain && !name) {
      return res.status(400).send('Missing name and domain');
    }
  
    try {
        if( !domain ){

            const { data } = await axios.get('https://api.logo.dev/search', {
                params: { q: name },
                headers: {
                    'Authorization': `Bearer ${process.env.LOGODEV_KEY}`
                }
            });
            const scored  = data.map(d=>[d, compareTwoStrings(d.name.toLowerCase(), name.toLowerCase())]).sort((a,b)=>b[1] - a[1])
            const sorted = scored.filter(d=>d[0].domain)
            
            const winner = sorted[0][0]
            if( winner?.domain  ){                
                domain = winner.domain
                key = process.env.LOGODEV_KEY_PK
            }else{
                return res.status(400).send('Couldnt find a match');
            }
        }
        
        const response = await axios({
            method: 'get',
            url: `https://img.logo.dev/${domain}?token=${key}`,
            responseType: 'stream'
          });

      // Set CORS header so the image can be used on your frontend
      res.set('Access-Control-Allow-Origin', '*');
      
      // Forward the content-type header from the remote response
      res.set('Content-Type', response.headers['content-type']);
      res.set('Cache-Control', 'public, max-age=86400');
      
      // Pipe the remote image stream directly to the response
      response.data.pipe(res);
    } catch (error) {
      console.error('Error fetching image:', error.message);
      res.status(500).send('Error fetching image');
    }
  });
router.get('/remoteImage', async (req, res) => {
    try {
        let imageUrl = req.query.url;

        if(imageUrl.startsWith("https://img.logo.dev/")){
            imageUrl += `?token=${process.env.LOGODEV_KEY_PK}`
        }

        if (!imageUrl) {
        return res.status(400).send('Missing image URL');
        }
  
      const response = await axios({
        method: 'get',
        url: imageUrl,
        responseType: 'stream'
      });
      
      // Set CORS header so the image can be used on your frontend
      res.set('Access-Control-Allow-Origin', '*');
      
      // Forward the content-type header from the remote response
      res.set('Content-Type', response.headers['content-type']);
      res.set('Cache-Control', 'public, max-age=86400');
      
      // Pipe the remote image stream directly to the response
      response.data.pipe(res);
    } catch (error) {
      console.error('Error fetching image:', error.message);
      res.status(500).send('Error fetching image');
    }
  });

router.post('/representationPass', async (req, res) => {
    try {
        const result = await runRepresentationPass(req.body ?? {});
        res.json(result);
    } catch (error) {
        console.error('representationPass error', error);
        const status = /required/i.test(error?.message ?? '') ? 400 : 500;
        res.status(status).json({ message: error?.message ?? 'Failed to process representation pass' });
    }
});

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
router.get('/templates', async function(req, res, next) {

    const publicWorkflowQuery ={
                                $and: [
                                    { type: 'flow'},
                                    { "published.public":  true},
                                    { deleted: {$exists: false}}
                                ]
                            }
    try {
        const results = await Primitive.find(publicWorkflowQuery,{brightdataDiscovery: 0, crunchbaseData: 0, linkedInData: 0, checkCache:0, financialData: 0, action_tracker: 0})
        res.json(results)
      } catch (err) {
        res.json({error: err})
      }

})
router.get('/users', async function(req, res, next) {

    try {
        const workspaces = req.user.workspaceIds
        const results = await User.find({$or:[
            {_id: req.user._id},
            {workspaces: {$in: workspaces}}
        ]}, "avatarUrl email id googleId name external permissions workspaces _id")
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
        const user = await User.findOne({_id: req.user?._id})
        let results 
        if( user ){
            const workspaces = user.workspaces ?? []
            results = await Workspace.find({_id: workspaces})
        }
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
router.post('/workspace/:id/update/', async function(req, res, next) {
        try {
            const workspaceId = req.params.id
            const user = req.user._id
            const data = req.body

            const ownerUser = await User.findOne({_id: user, workspaces: {$in: workspaceId}})

            if( ownerUser?.permissions?.manageWorkspaces){
                const result = await updateWorkspace( workspaceId, data )
                res.json({success: true, result})
            }else{
                res.json({success: false, error: "Permission denied"})
            }

        }catch(err){
            console.log(err)
            res.json({error: err})
        }
})
router.post('/workspace/new/', async function(req, res, next) {
        try {
            const owner = req.user._id
            const {organizationId, ...data} = req.body
            const organizationWithPlan = (await getOrganizationsWithSubscriptionPlans( owner )).find(d=>d.id === organizationId)
            if( !organizationId ){
                throw `User ${owner} not a member of ${organizationId}`
            }
            const canCreate = !organizationWithPlan.activePlan?.limitProjects
            //if( ownerUser?.permissions?.manageWorkspaces || ownerUser.workspaces?.length === 0 ){
            if( canCreate ){
                const result = await createWorkspace( data, owner, {organizationId})
                res.json({success: true, result})
            }else{
                res.json({success: false, error: "Permission denied"})
            }
        }catch(err){
            console.log(err)
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

// --- route (unchanged logic, ESM-safe) ---
router.get('/primitives', async function(req, res, next) {
  let workspaceId = req.query.workspace;
  const owns = req.query.owns;

  try {
    const workspaces = req.user.workspaceIds ?? [];
    const ownedWorkspaceIds = workspaces.map(d => `${d}`);

    if (owns !== undefined) {
      let primitive;
      try {
        primitive = await Primitive.findOne({ "_id": new ObjectId(owns) });
      } catch (err) {
        primitive = await Primitive.findOne({ "plainId": parseInt(owns) });
      }
      workspaceId = primitive?.workspaceId;
    }

    if (workspaceId && !ownedWorkspaceIds.includes(`${workspaceId}`)) {
      workspaceId = undefined;
    }

    const loadFromOtherWorkspaces = workspaceId !== undefined;
    const projection = workspaceId !== undefined
      ? DONT_LOAD_UI
      : { brightdataDiscovery: 0, crunchbaseData: 0, linkedInData: 0, checkCache: 0, financialData: 0, action_tracker: 0 };

    const batchSize = Math.max(1, Math.min(parseInt(req.query.batchSize, 10) || 500, 2000));

    // ---- byte target for each frame ----
    let targetBytes = parseInt(req.query.targetBytes ?? '', 10);
    if (Number.isNaN(targetBytes)) targetBytes = parseInt(process.env.PRIMITIVE_STREAM_TARGET_BYTES ?? '', 10);
    if (Number.isNaN(targetBytes)) targetBytes = 4 * 1024 * 1024; // 4 MB default
    targetBytes = Math.max(128 * 1024, Math.min(targetBytes, 64 * 1024 * 1024));

    // ---- metrics ----
    const debugMode = req.query.debug === '1' || req.query.debug === 'true';
    const metrics = debugMode ? {
      start: performance.now(),
      bytesQueued: 0,
      writeCalls: 0,
      drains: 0,
      drainWaitMs: 0,
      cpuPackMs: 0,
      maxBuffered: 0,
      batchSize,
      targetBytes
    } : null;

    const accessibleTypes = ['activity','experiment','venture','board','working'];
    let countsDuration = 0;

    const workspaceQuery = workspaceId !== undefined ? {
      workspaceId,
      deleted: { $exists: false }
    } : undefined;

    const otherWorkspaceIds = loadFromOtherWorkspaces
      ? ownedWorkspaceIds.filter(d => `${d}` !== `${workspaceId}`)
      : ownedWorkspaceIds;

    const otherWorkspaceQuery = otherWorkspaceIds.length > 0 ? {
      workspaceId: { $in: otherWorkspaceIds },
      type: { $in: accessibleTypes },
      deleted: { $exists: false }
    } : undefined;

    // ---- codec negotiation (override via ?codec=br|gzip|none) ----
    const accept = (req.headers['accept-encoding'] || '').toLowerCase();
    const supportsBrotli = /\bbr\b/.test(accept);
    const supportsGzip   = /\bgzip\b/.test(accept);
    let codec = (req.query.codec || process.env.PRIMITIVE_STREAM_CODEC || 'gzip').toLowerCase();
    if (codec === 'br' && !supportsBrotli) codec = supportsGzip ? 'gzip' : 'none';
    if (codec === 'gzip' && !supportsGzip) codec = supportsBrotli ? 'br' : 'none';
    if (!['br','gzip','none'].includes(codec)) codec = 'none';

    let brotliQuality = parseInt(process.env.PRIMITIVE_STREAM_BROTLI_QUALITY ?? '', 10);
    if (Number.isNaN(brotliQuality)) brotliQuality = 4;
    const brotliOverride = parseInt(req.query.brotliQuality ?? '', 10);
    if (!Number.isNaN(brotliOverride)) {
      brotliQuality = Math.max(0, Math.min(brotliOverride, 11));
    }
    if (metrics) {
      metrics.codec = codec;
      metrics.brotliQuality = brotliQuality;
    }

    // ---- headers ----
    res.setHeader('Content-Type', 'application/msgpack');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('X-Accel-Buffering', 'no');   // ask Nginx not to buffer



    if (codec === 'br') res.setHeader('Content-Encoding', 'br');
    if (codec === 'gzip') res.setHeader('Content-Encoding', 'gzip');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    // ---- stream pipeline ----
    let isClosed = false;

    const highWaterMarkMB = Math.max(1, Math.min(parseInt(req.query.highWaterMark, 10) || 16, 128));

    const passThrough = new PassThrough({ highWaterMark: highWaterMarkMB << 20 }); // 8 MB buffer

    let finalStream = null;
    if (codec === 'br') {
      finalStream = createBrotliCompress({
        chunkSize: 1 << 20,
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: brotliQuality,
          [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_GENERIC,
        }
      });
    } else if (codec === 'gzip') {
      finalStream = createGzip({ chunkSize: 1 << 20 });
    }

    let compressedBytes = 0;
    if (finalStream) {
      finalStream.on('data', (chunk) => { compressedBytes += chunk.length; });
    }

    if (res.socket && res.socket.setNoDelay) res.socket.setNoDelay(true);

    // use promise-based pipeline
    pipelineAsync(
      passThrough,
      ...(finalStream ? [finalStream, res] : [res])
    ).catch((err) => {
      if (!isClosed) console.warn('Primitive stream pipeline error', err);
    });

    res.on('close', () => {
      isClosed = true;
      passThrough.destroy();
      finalStream?.destroy();
    });

    // ---- counts & partitioning (unchanged) ----
    let workspaceStats;
    let workspaceTotal = 0;
    if (workspaceQuery) {
      const countStart = performance.now();
      const [stats] = await Primitive.aggregate([
        { $match: workspaceQuery },
        {
          $facet: {
            first:  [{ $sort: { _id:  1 } }, { $limit: 1 }, { $project: { _id: 1 } }],
            last:   [{ $sort: { _id: -1 } }, { $limit: 1 }, { $project: { _id: 1 } }],
            totals: [{ $count: 'count' }]
          }
        },
        {
          $project: {
            minId: { $first: '$first._id' },
            maxId: { $first: '$last._id' },
            totalCount: { $ifNull: [{ $first: '$totals.count' }, 0] }
          }
        },
        {
          $project: {
            _id: 0,
            totalCount: 1,
            minSeconds: { $cond: [{ $ifNull: ['$minId', false] }, { $toInt: { $divide: [{ $toLong: { $toDate: '$minId' } }, 1000] } }, null] },
            maxSeconds: { $cond: [{ $ifNull: ['$maxId', false] }, { $toInt: { $divide: [{ $toLong: { $toDate: '$maxId' } }, 1000] } }, null] }
          }
        }
      ]);
      countsDuration += performance.now() - countStart;
      workspaceStats = stats;
      workspaceTotal = stats?.totalCount ?? 0;
    }

    let otherWorkspaceTotal = 0;
    if (otherWorkspaceQuery) {
      const otherCountStart = performance.now();
      otherWorkspaceTotal = await Primitive.countDocuments(otherWorkspaceQuery);
      countsDuration += performance.now() - otherCountStart;
    }

    const totalItems = workspaceTotal + otherWorkspaceTotal;
    if (metrics) {
      metrics.countsMs = Math.round(countsDuration);
      metrics.workspaceTotal = workspaceTotal;
      metrics.otherWorkspaceTotal = otherWorkspaceTotal;
      metrics.totalItems = totalItems;
    }

    let streamConcurrency = Math.max(1, Math.min(parseInt(process.env.PRIMITIVE_STREAM_CONCURRENCY, 10) || 8, 16));
    const streamOverride = parseInt(req.query.streams ?? req.query.streamConcurrency ?? '', 10);
    if (!Number.isNaN(streamOverride)) streamConcurrency = Math.max(1, Math.min(streamOverride, 32));
    if (metrics) metrics.streamConcurrency = streamConcurrency;

    let partitionCount = Math.max(1, Math.min(parseInt(process.env.PRIMITIVE_STREAM_PARTITIONS, 10) || 16, 64));
    const partitionOverride = parseInt(req.query.partitions ?? '', 10);
    if (!Number.isNaN(partitionOverride)) partitionCount = Math.max(1, Math.min(partitionOverride, 256));
    if (metrics) metrics.partitionCount = partitionCount;

    let timePartitionStarts;
    if (workspaceQuery && typeof workspaceStats?.minSeconds === 'number' && typeof workspaceStats?.maxSeconds === 'number') {
      const span = Math.max(1, workspaceStats.maxSeconds - workspaceStats.minSeconds + 1);
      const step = Math.max(1, Math.ceil(span / partitionCount));
      timePartitionStarts = [];
      for (let idx = 0; idx < partitionCount; idx++) {
        const start = workspaceStats.minSeconds + idx * step;
        if (start > workspaceStats.maxSeconds) break;
        timePartitionStarts.push(start);
      }
    }
    const partitionIndices = timePartitionStarts?.length ? timePartitionStarts.map((_, idx) => idx) : [0];
    if (metrics) metrics.partitionBuckets = timePartitionStarts?.length ?? 1;

    const normalisePrimitive = (doc) => {
      if (doc == null) return doc;
      if (doc._id && typeof doc._id !== 'string') doc._id = doc._id.toString();
      if (!doc.id) doc.id = doc._id;
      if (doc.__v !== undefined) delete doc.__v;
      return doc;
    };

    // ---- writer (serialize writes, track CPU vs drain) ----
    let pendingDrain;
    const writeTarget = passThrough;

    const writeFrame = async (payload) => {
      if (isClosed) return;

      const t0 = performance.now();
      let frame = pack(payload, { useRecords: false });
      if (!Buffer.isBuffer(frame)) frame = Buffer.from(frame);
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32BE(frame.length, 0);
      const out = Buffer.concat([header, frame]);
      if (metrics) metrics.cpuPackMs += (performance.now() - t0);

      try {
        if (metrics) {
          metrics.writeCalls += 1;
          metrics.bytesQueued += out.length;
        }
        const canContinue = writeTarget.write(out);
        if (metrics) {
          metrics.maxBuffered = Math.max(metrics.maxBuffered, writeTarget.writableLength ?? 0);
        }
        if (canContinue === false) {
          let waitStart;
          if (metrics) {
            waitStart = performance.now();
            metrics.drains += 1;
          }
          if (!pendingDrain) {
            pendingDrain = once(writeTarget, 'drain').finally(() => { pendingDrain = undefined; });
          }
          await pendingDrain;
          if (metrics) metrics.drainWaitMs += (performance.now() - waitStart);
        }
      } catch (err) {
        isClosed = true;
        throw err;
      }
    };

    // ---- send meta ----
    if (metrics) metrics.sendStart = performance.now();
    await writeFrame({ type: 'meta', total: totalItems });

    const makePartitionQuery = (partitionIndex) => {
      if (!workspaceQuery) return undefined;
      const partitionQuery = { ...workspaceQuery };
      if (!timePartitionStarts?.length) return partitionQuery;
      const startSeconds = timePartitionStarts[partitionIndex];
      if (startSeconds === undefined) return partitionQuery;
      const startId = ObjectId.createFromTime(startSeconds);
      const nextStartSeconds = timePartitionStarts[partitionIndex + 1];
      if (nextStartSeconds !== undefined) {
        const endId = ObjectId.createFromTime(nextStartSeconds);
        partitionQuery._id = { $gte: startId, $lt: endId };
      } else {
        partitionQuery._id = { $gte: startId };
      }
      return partitionQuery;
    };

    const cursorFactories = [];
    if (otherWorkspaceQuery) {
      cursorFactories.push(() => Primitive.find(otherWorkspaceQuery, projection).lean().cursor({ batchSize }));
    }
    if (workspaceQuery) {
      for (const partitionIndex of partitionIndices) {
        cursorFactories.push(() => {
          const partitionQuery = makePartitionQuery(partitionIndex);
          if (!partitionQuery) return undefined;
          return Primitive.find(partitionQuery, projection).lean().cursor({ batchSize });
        });
      }
    }

    const processCursor = async (cursorPromise) => {
      if (isClosed) return;
      const cursor = await cursorPromise;
      if (!cursor) return;

      let batch = [];
      let batchBytes = 0;
      const estimateItemBytes = (item) => {
        try { return Buffer.byteLength(JSON.stringify(item), 'utf8'); }
        catch { return 2048; }
      };
      const flushPending = async () => {
        if (batch.length === 0) return;
        const payload = batch;
        batch = [];
        await writeFrame({ type: 'batch', items: payload });
        if (metrics) metrics.flushedBatches = (metrics.flushedBatches ?? 0) + 1;
        batchBytes = 0;
      };

      try {
        for await (let doc of cursor) {
          if (isClosed) break;
          doc = normalisePrimitive(doc);
          if (!doc) continue;
          batch.push(doc);
          batchBytes += estimateItemBytes(doc);
          if (batchBytes >= targetBytes) {
            await flushPending();
          }
        }
      } finally {
        if (typeof cursor.close === 'function') {
          await cursor.close().catch(() => {});
        }
      }

      if (!isClosed && batch.length > 0) {
        await flushPending();
      }
    };

    const runWithConcurrency = async (factories, limit) => {
      const queue = [...factories];
      let error;
      const workers = new Array(Math.min(limit, queue.length)).fill(null).map(async () => {
        while (!isClosed) {
          const factory = queue.shift();
          if (!factory) return;
          try {
            const cursorPromise = factory();
            await processCursor(cursorPromise);
          } catch (err) {
            error = err;
            isClosed = true;
            return;
          }
        }
      });
      await Promise.all(workers);
      if (error) throw error;
    };

    // ---- drive the read → send ----
    const dbReadStart = performance.now();
    await runWithConcurrency(cursorFactories, streamConcurrency);
    if (metrics) metrics.dbReadMs = Math.round(performance.now() - dbReadStart);

    if (!isClosed) {
      await writeFrame({ type: 'end', total: totalItems, loaded: totalItems });
      passThrough.end();
    }

    // wait for the actual flush to the client
    await once(res, 'finish');

    // compressed size & throughput
    if (metrics) {
      if (!finalStream && res.socket?.bytesWritten != null) {
        compressedBytes = res.socket.bytesWritten;
      }
      metrics.compressedBytes = compressedBytes;
      const now = performance.now();
      metrics.sendMs = Math.round(now - (metrics.sendStart ?? now));
      metrics.totalMs = Math.round(now - metrics.start);
      metrics.avgWrite = metrics.writeCalls ? Math.round(metrics.bytesQueued / metrics.writeCalls) : 0;
      metrics.bytesQueued = Math.round(metrics.bytesQueued);
      metrics.maxBuffered = Math.round(metrics.maxBuffered);
      metrics.drainWaitMs = Math.round(metrics.drainWaitMs);
      metrics.mbps = metrics.sendMs > 0
        ? +(((compressedBytes / (1024 * 1024)) / (metrics.sendMs / 1000))).toFixed(2)
        : null;

      console.log('[stream totals]', metrics);
    }

  } catch (err) {
    console.error(err);
    if (res.headersSent) {
      try { res.end(); } catch {}
    } else {
      res.status(500).json({ error: err?.message ?? err });
    }
  }
});
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
    let primitive = await userCanAccessPrimitive(data.receiver, req, res) 

    if( !primitive ){
        return
    }
    if( primitive.replication ){
        if( req.user._id !== "63f87c50efae38c774194e7d"){
            res.status(501).json({message: "Permission denied"})
            return
        }
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
    try{
        const workspaceId = req.query.workspaceId;
        const status = await queueStatus(workspaceId ? { workspaceId } : undefined);
        res.json({success: true, result: status})
    }catch(error){
        console.log(error)
        res.status(500).json({success: false, error: error?.message || "Unable to fetch queue status"})
    }

})
router.get('/queues/:workspaceId/status', async function(req, res) {
    const workspaceId = req.params.workspaceId;
    if( !req.user?.workspaceIds?.includes(workspaceId)){
        return res.status(403).json({success: false, error: "Permission denied"})
    }
    try{
        const status = await queueStatus({ workspaceId })
        res.json({success: true, result: status})
    }catch(error){
        console.log(error)
        res.status(500).json({success: false, error: error?.message || "Unable to fetch queue status"})
    }
})
router.post('/queues/:workspaceId/cancel', async function(req, res) {
    const workspaceId = req.params.workspaceId;
    if( !req.user?.workspaceIds?.includes(workspaceId)){
        return res.status(403).json({success: false, error: "Permission denied"})
    }
    try{
        const { jobKey, queueName: bodyQueueName, jobId: bodyJobId, reason } = req.body || {}
        let queueName = bodyQueueName
        let jobId = bodyJobId
        if( jobKey ){
            const parsed = parseBullJobKey(jobKey)
            queueName = queueName ?? parsed.queueName
            jobId = jobId ?? parsed.jobId
        }
        if( !queueName || !jobId ){
            return res.status(400).json({success: false, error: "Missing job identifier"})
        }
        if( !queueName.startsWith(`${workspaceId}-`) ){
            return res.status(400).json({success: false, error: "Workspace mismatch for job"})
        }
        const queueType = queueName.slice(queueName.lastIndexOf('-') + 1)
        const queue = await getQueue(queueType)
        if( !queue?.cancelJobTree ){
            return res.status(400).json({success: false, error: `Unsupported queue type ${queueType}`})
        }
        let job
        try{
            job = await queue._queue.getJobFromQueue({ queueName, id: jobId })
        }catch(error){
            console.log(`Error fetching job ${queueName} / ${jobId}`, error)
        }
        if( !job ){
            return res.status(404).json({success: false, error: "Job not found"})
        }
        if( job.data?.id ){
            const primitive = await userCanAccessPrimitive(job.data.id, req, res)
            if( !primitive ){
                return
            }
        }
        const result = await queue.cancelJobTree({
            queueName,
            jobId,
            reason: reason || 'user-request',
            initiator: req.user?._id?.toString()
        })
        res.json({success: true, result})
    }catch(error){
        console.log(error)
        res.status(500).json({success: false, error: error?.message || "Unable to cancel job"})
    }
})
router.get('/primitive/:id/fetch', async function(req, res, next) {
    const primitiveId = req.params.id
    console.log( primitiveId)
    try{
        const primitive = await fetchPrimitive(primitiveId, undefined, DONT_LOAD_UI)

        if( primitive.published !== true || !await userCanAccessPrimitive(primitive, req, res) ){
            return
        }
        res.json({success: true, result: primitive})
    }catch(error){
        console.log(error)
        res.status(501).json({message: "Error", error: error})
    }
})
router.post('/primitive/:id/agent', async function(req, res, next) {
    const primitiveId = req.params.id
    const action = req.params.action
    const options = req.body.options ?? {}
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // GFE/NGINX: disable buffering
    try{
        let result
        const ids = [primitiveId]
        if( options.parentId ){
            ids.push(options.parentId)
        }
        const primitives = await fetchPrimitives(ids, undefined, {...DONT_LOAD_UI, frames: 0})
        const primitive = primitives.find(d=>d.id === primitiveId)
        const parent = options.parentId && primitives.find(d=>d.id === options.parentId)
        

        if( !await userCanAccessPrimitive(primitive, req, res) ){
            return
        }

        if( primitive){
            handleChat(primitive, {parent, ...options},req, res)
        }
    }catch(error){
        console.log(error)
        res.status(501).json({message: "Error", error: error})
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
router.post('/workflow/:id/import/:sourceId', async function(req, res, next) {

    let data = req.body
    const targetWorkspaceId = req.params.id
    const sourceFlowId = req.params.sourceId
    const options = req.body
    try{
        let result
        const user = await User.findOne({_id: req.user?._id, workspaces: {$in: targetWorkspaceId}})
        if( !user ){
            throw "Permission denied"
        }
        const primitive = await fetchPrimitive(sourceFlowId)
        if( !primitive?.published?.public){
            throw "Permission denied 2a"
        }
        
        try{
            const workspace = await Workspace.findOne({_id: targetWorkspaceId })
            if( workspace ){
                console.log(`clone ${primitive.id} to ${targetWorkspaceId}`)
                result = await replicateWorkflow( primitive, workspace)
            }
        }catch(e){
            console.log(`Error cloning workflow ${primitive.id} to ${targetWorkspaceId}`, e)
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
router.get('/organizations', async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(401).json({ message: "Permission denied" });

  try {
    const orgs = await getOrganizationsWithSubscriptionPlans( userId )

    res.json(orgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error", error: err });
  }
});

router.get('/organizations/:id/slack/workflows', async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid organization id' });
    }

    const organization = await Organization.findById(id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const membership = findOrganizationMembership(organization, userId);
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ slack: sanitizeSlackConfig(organization.slack) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load Slack configuration' });
  }
});

router.put('/organizations/:id/slack/workflows', async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid organization id' });
    }

    const organization = await Organization.findOne({_id: id});
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const membership = findOrganizationMembership(organization, userId);
    if (!membership) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!canManageOrganizationSlack(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { enabledWorkflowIds, teamId, resultsBaseUrl, runAsUserId } = req.body ?? {};

    organization.slack ||= {};

    if (teamId !== undefined) {
      const trimmed = typeof teamId === 'string' ? teamId.trim() : '';
      organization.slack.teamId = trimmed || undefined;
    }

    if (resultsBaseUrl !== undefined) {
      const trimmed = typeof resultsBaseUrl === 'string' ? resultsBaseUrl.trim() : '';
      organization.slack.resultsBaseUrl = trimmed || undefined;
    }

    if (runAsUserId !== undefined) {
      if (!runAsUserId) {
        organization.slack.runAsUserId = undefined;
      } else if (ObjectId.isValid(runAsUserId) && findOrganizationMembership(organization, runAsUserId)) {
        organization.slack.runAsUserId = new ObjectId(runAsUserId);
      } else {
        return res.status(400).json({ error: 'Invalid runAsUserId' });
      }
    }

    if (enabledWorkflowIds !== undefined) {
      const workflowIds = Array.isArray(enabledWorkflowIds)
        ? enabledWorkflowIds
        : enabledWorkflowIds ? [enabledWorkflowIds] : [];

      const uniqueIds = [...new Set(workflowIds)]
        .map((value) => normalizeId(value))
        .filter(Boolean);

      const validIds = uniqueIds.filter((value) => ObjectId.isValid(value))

      let allowedFlows = [];
      if (validIds.length > 0) {
        allowedFlows = await fetchPrimitives(validIds, {
          type: 'flow',
          workspaceId: { $in: organization.workspaces.map(d=>d.toString()) ?? [] },
        }, {
          _id: 1,
        }) ?? [];
      }

      organization.slack.enabledWorkflows = allowedFlows.map((flow) => flow._id);
    }

    await organization.save();

    res.json({ slack: sanitizeSlackConfig(organization.slack) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update Slack configuration' });
  }
});



export default router;
