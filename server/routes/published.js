import { DONT_LOAD_UI, fetchPrimitive } from "../SharedFunctions";
import express, { query } from 'express';
import { buildPage } from "../htmlexporter";
import { Storage } from "@google-cloud/storage";
import path from 'path'


var router = express.Router();
router.get('/new_instance/:id', async function(req, res, next) {
    try{
        const prim = await fetchPrimitive( req.params.id, {type: "flow"}, "_id published" )
        if( prim.published ){
            if (process.env.NODE_ENV === 'production') {
                res.sendFile(path.resolve('dist-server', 'ui', 'build', 'index.html'), { etag: false})
            }else {
                next('route')
            }
            return
        }
        res.status(404).json({message: "Not found"})
    }catch(error){
        res.status(501).json({message: "Error", error: error})
    }
})
router.get('/fetch/:id', async function(req, res, next) {
    try{
        //const prim = await fetchPrimitive( req.params.id, {published: true}, {...DONT_LOAD_UI, aLog: 0, processing: 0, frames: 0, primitives: 0, parentPrimitives: 0})
        const prim = await fetchPrimitive( req.params.id, {published: true}, {_id: 1, plainId: 1, title: 1, published: 1, referenceParameters: 1, type: 1, referenceId: 1, workspaceId: 1})
        if( prim?.published ){
            res.json({success: true, result: prim})
            return
        }
        res.status(404).json({message: "Not found"})
    }catch(error){
        res.status(501).json({message: "Error", error: error})
    }
})

router.get('/image/:id', async function(req, res, next) {
    const id = req.params.id
    const bucketName = 'published_images'
    try{
        const storage = new Storage({
            projectId: process.env.GOOGLE_PROJECT_ID,
        });

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
export default router;