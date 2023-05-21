import { google } from "googleapis";
import { Storage } from '@google-cloud/storage';
import Primitive from "./model/Primitive";
import { PDFExtract } from "pdf.js-extract";
import moment from 'moment';
var ObjectId = require('mongoose').Types.ObjectId;

let _ghState = undefined

export function setRefreshTokenHandler( handler ){
    _ghState = handler
}

export async function refreshToken(req){
    if (!req.user ){
        return undefined
    }
    if (!req.user.refreshToken ){
      return undefined
    }
    let user = req.user
    console.log(user.expiry_date)

    try{

        return await new Promise((resolve, reject) => {
            _ghState.requestNewAccessToken('google', user.refreshToken, function(err, accessToken, refreshToken) {
                if (err || !accessToken){
                    reject( err )
                } 
                console.log("refreshed")
                req.user.accessToken = accessToken
                req.user.checksum = "TESTING"
                req.user.expiry_date = moment().add( 1000 * 60 * 60 * 24 * 7).format("X")
                resolve(accessToken)
            })
        })
    }catch(err){
        return undefined
    }
}
function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

export async function getDocumentAsPlainText(id, req){
    const pdfExtract = new PDFExtract();

    const bucketName = 'cc_vf_documents'
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
      });

    const bucket = storage.bucket(bucketName);
    let file = bucket.file(id)

    if( !((await file.exists())[0]) ){
        console.log(`file doesnt exist - fetching pdf version`)
        const fetched = await importDocument(id, req)
        if( !fetched){
            console.log(`Import failed for ${id}`)
            return
        }
    }
    const contents = (await file.download())[0]


    const options = {}; /* see below */
    return await new Promise((resolve, reject) => {
        try{

            pdfExtract.extractBuffer(contents, options, (err, data) => {
                if (err){
                    reject(err)
                    return
                }
                const pages = data.pages
                // look for header / footer
                const firstPage = pages[0].content[0]
                const textSegment = firstPage.str.slice(0, firstPage.str.length * 0.8)
                console.log(`looking for ${textSegment}`)
                const sameCount = pages.filter((p)=>{
                    const thisPage = p.content[0]
                    if( thisPage ){
                        if( thisPage.str.slice(0, textSegment.length) === textSegment ){
                            if( ((thisPage.y - firstPage.y ) / firstPage.y ) < 0.01 ){
                                return true
                            }
                        }
                    }
                    return false
                }).length
                if( sameCount > (pages.length / 2) && (pages.length > 1) ){
                    console.log(`got same at ${sameCount} out of ${pages.length} - marking as header / footer fo exclusion`)
                    pages.forEach((page)=>{
                        page.content.forEach((d)=>{
                            if( Math.abs((d.y - firstPage.y ) / firstPage.y ) < 0.01 ){
                                d.ignore = true
                            }
                        })
                    })
                }

                // find section breaks
                const breaks = {}
                const round = (val)=>Math.round(val * 1000)/1000
                pages.forEach((page)=>{
                    let last = undefined
                    page.content.forEach((d)=>{
                        if( last !== undefined ){
                            const diff = round(round(d.y) - last)
                            if( diff > 0 ){
                                breaks[diff] = (breaks[diff] || 0 ) + 1
                            }
                        }
                        last = round(d.y)
                    })
                })
                const std = Object.keys(breaks).sort((a,b)=>breaks[b]-breaks[a])[0]

                pages.forEach((page)=>{
                    let last = undefined
                    page.content.forEach((d)=>{
                        if( last !== undefined ){
                            const diff = round(round(d.y) - last)
                            if( diff > std ){
                                d.str = '\n' + d.str
                                d.sectionBreak = true
                            }
                        }
                        last = round(d.y)
                    })
                })


                //resolve(data)
                resolve({plain: data.pages.map((p)=>p.content.map((c)=>c.ignore ? "" : c.str).join(" ")).join(" "), data: data})
            })
        }catch(err){
            reject(err)
        }
    })
}
export async function removeDocument(id, bucket ){
    const buckets = bucket ? [bucket] : ['cc_vf_documents', 'cc_vf_document_plaintext'];
    const storage = new Storage({projectId: process.env.GOOGLE_PROJECT_ID})
    try{
        for( const bucketName of buckets){
            console.log(`removing document from ${bucketName}`)
            const bucket = storage.bucket(bucketName);
            if( bucket ){
                const file = bucket.file(id);
                if( file ){
                    await file.delete({ignoreNotFound: true})
                    console.log(`deleted`)
                }
            }
        }
    }catch(error){
        console.log(error)
        return undefined
    }
}

export async function getDocument(id, req){
    const bucketName = 'cc_vf_documents';
    const fileName = id;

    try{
        const storage = new Storage({projectId: process.env.GOOGLE_PROJECT_ID})

        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);

        if( !(await file.exists())[0] ){
            await importDocument(id, req)
        }

        const remoteReadStream = file.createReadStream()
                                    .on('error', function(err) {
                                        console.log(err)
                                        return undefined
                                    });
        return remoteReadStream
    }catch(error){
        return undefined
    }
}
export async function importDocument(id, req){
    const primitive =  await Primitive.findOne({_id:  new ObjectId(id)})
    let notes = primitive.referenceParameters?.notes
    try{
        if( notes ){
            if( typeof(notes) === "string"){
                const regex = /(?:d|document|spreadsheets|presentation)\/(?:u\/\d\/)?(?:[^/]+\/)?(?<id>[a-zA-Z0-9-_]+)/;
                const match = notes.match(regex);
                if (match) {
                    console.log(`converting url to google drive id`)
                    const documentId = match.groups.id;
                    notes = {
                        type: "google_drive",
                        id: documentId
                    }
                } 
            }
            if( notes.type === "google_drive"){
                let result
                if( notes.mimeType === "application/pdf"){
                    
                    result = await copyGoogleDriveFile(id, notes.id, req)
                }else{
                    console.log("will attempt export to pdf and plaintext")
                    result = await importGoogleDoc(id, notes.id, req)
                }
                console.log(result)
                if( result ){
                    primitive.referenceParameters.notes.lastFetched = new Date()
                    primitive.markModified('referenceParameters.notes.lastFetched')
                    await primitive.save()
                console.log('saved')
                }
                return result
            }
        }
    }catch(err){
        console.log(err)
        console.log(err.message)
    }
    return undefined
}
export async function copyGoogleDriveFile(id, fileId, req){
    if(!fileId || !id){return false}

    const bucketName = 'cc_vf_documents';
    const fileName = id;

    const storage = new Storage({projectId: process.env.GOOGLE_PROJECT_ID})

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    if( (await file.exists())[0] ){
        await file.delete()
    }
    

    const doRequest = async function(retry = 3){
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: req.user.accessToken });
        
        const drive = google.drive({ version: 'v3', auth });
        
        try {
            return await drive.files.get({ fileId,  alt: 'media' }, { responseType: 'stream' });
        }catch(err){        
            if( err.response?.status === 401){
                if( retry > 0){
                    if(await refreshToken( req )){
                        return await doRequest( retry-- )
                    }
                }
                throw new Error("NOT AUTHROIZED")
            }
        }
        return undefined
    }

    let response = await doRequest()
    if( response === undefined){
        return
    }

    await new Promise((resolve, reject) => {
        response.data
          .on('error', err => reject(`Error exporting file: ${err}`))
          .on('end', () => {
            resolve();
          })
          .pipe(file.createWriteStream())
          .on('error', err => reject(`Error uploading file: ${err}`));
      });

      await waitForFileToExit(id, bucket)

      return true
}
async function waitForFileToExit(id, bucket, retry = 10, pause = 200){
    do{
        const file = bucket.file(id)
        if( !((await file.exists())[0]) ){
            console.log(retry)
            sleep(pause)
            retry--
        }else{
            retry = 0
        }
    }while(retry > 0)

}
export async function importGoogleDoc(id, fileId, req, pdf = true){
    if(!fileId || !id){return false}

    const mimeType = pdf ? 'application/pdf' : "text/plain"
    const bucketName = pdf ? 'cc_vf_documents' : 'cc_vf_document_plaintext'
    const fileName = id;


    const storage = new Storage({projectId: process.env.GOOGLE_PROJECT_ID})

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(fileName);

    if( (await file.exists())[0] ){
        await file.delete()
    }

    const doRequest = async function(retry = 3){
        const auth = new google.auth.OAuth2();
        console.log(req.user.accessToken)
        auth.setCredentials({ access_token: req.user.accessToken });
        
        const drive = google.drive({ version: 'v3', auth });
        
        try {
            return await drive.files.export({ fileId, mimeType}, { responseType: 'stream' });
        }catch(err){        
            if( err.response?.status === 401){
                if( retry > 0){
                    if(await refreshToken( req )){
                        return await doRequest( retry-- )
                    }
                }
                throw new Error("NOT AUTHROIZED")
            }
        }
        return undefined
    }

    let response = await doRequest()
    if( response === undefined){
        return
    }

    await new Promise((resolve, reject) => {
        response.data
          .on('error', err => reject(`Error exporting file: ${err}`))
          .on('end', () => {
            resolve();
          })
          .pipe(file.createWriteStream())
          .on('error', err => reject(`Error uploading file: ${err}`));
      });
      await waitForFileToExit(id, bucket)
      return true
}