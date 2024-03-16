import { fetchPrimitive } from "../SharedFunctions";
import express, { query } from 'express';
import { buildPage } from "../htmlexporter";
import { Storage } from "@google-cloud/storage";

var router = express.Router();
router.get('/renderPage/:id', async function(req, res, next) {
    try{
        const prim = await fetchPrimitive( req.params.id )
        if( prim ){
            if( prim.referenceId === 100){
                const text = await buildPage( prim )
                res.send(text)
                return
            }
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