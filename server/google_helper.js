import { google } from "googleapis";
import { Storage } from '@google-cloud/storage';
import Primitive from "./model/Primitive";
import { PDFExtract } from "pdf.js-extract";
import moment from 'moment';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { htmlToText } from "html-to-text";
import puppeteer from "puppeteer-core";
import { promisify } from "util";
import PDFDocument from 'pdfkit';
import MemoryStream from 'memory-streams';
import Embedding from "./model/Embedding";
import { encode } from "gpt-3-encoder";
import { buildEmbeddings } from "./openai_helper";


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
export async function ensureDocumentEmbeddingsExist(id, req){
    const embeddings = await Embedding.find({foreignId: id, type: "content"}, "_id")
    const count = embeddings.length
    if( count > 0){
        return true
    }
    return await buildDocumentEmbedding(id,req)

}
export async function fetchDocumentEmbeddings(id, force, req){
    if( !force ){

        const embeddings = await Embedding.find({foreignId: id, type: "content"})
        const count = embeddings.length
        if( count > 0){
            return embeddings
        }
    }
    return false
  // await buildDocumentEmbedding(id,req)
   //return await Embedding.find({foreignId: id, type: "content"})
}
export async function buildDocumentEmbedding(id, req){
    const maxTokens = 8000
    console.log(`Building content embeddings for ${id}`)
    let embeddings = await Embedding.deleteMany({foreignId: id, type: "content"})
    const content = (await getDocumentAsPlainText(id, req))
    const text = content?.plain
    if( id === "6511c742249568f6acaa716f")
    {
        console.log(`here`)
    }
    if( text ){

    const splitWords = (text)=>{
        let words = text.split(" ")
        console.log(`Got ${words.length} words`)
        words = words.filter(w=>w && w.length >0)
        console.log(`Got ${words.length} words`)
        const sections = []
        let current = ""
        let count = 0
        while( words.length > 0){
            const thisWord = words.shift()
            const last = current
            current = current + thisWord + " "

            const tokens = encode( thisWord ).length
            count += tokens

            if( count > maxTokens ){
                sections.push( last )
                current = thisWord + " "
                count = tokens
            }
        }
        if( current.length > 0){
            sections.push( current )
        }
        return sections
    }

        let sections = text.split(`\n\n`)
        sections = sections.map(current=>{
            const tokens = encode( current).length
            if( tokens > maxTokens ){
                console.log(`need to split paras`)
                return splitWords( current )
            }
            return current
        }).flat()
        console.log(`>>> GOT ${sections.length} sections`)


        let section = 0
        for(const fragment of sections){
            //console.log(`>>>>> ${fragment}`)
            const response = await buildEmbeddings(fragment)
            if( response.success){
                const dbUpdate = await Embedding.findOneAndUpdate({
                    type: "content",
                    section:section,
                    foreignId: id
                },{
                    embeddings: response.embeddings
                },{upsert: true, new: true})
                section++
            }
        }
        return true
    }
    return false

    

}

export async function getDocumentAsPlainText(id, req){

    const primitive =  await Primitive.findOne({_id:  new ObjectId(id)})
    const bucketName = 'cc_vf_document_plaintext'
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
      });

    const bucket = storage.bucket(bucketName);
    let file = bucket.file(id)

    let notes = primitive.referenceParameters?.notes
    let url = primitive.referenceParameters?.url
    let fecthFromPdf = primitive.referenceParameters?.sourceType === "video"
    if(url?.slice(-3)==="pdf"){
        fecthFromPdf = true
    }

    if( fecthFromPdf || !((await file.exists())[0]) ){
        if( notes || fecthFromPdf ){
            console.log(`----- EXTRACT FROM PDF`)
            return await extractPlainTextFromPdf( id, req )
        }
        if( url ){
            if( url.match(/^https?:\/\/(www\.)?facebook\.com\/[^\/]+\/posts\/[A-Za-z0-9_-]+/)){
                console.log(`Fetch pdf of facebok post`)
                await grabUrlAsPdf( url, id, req )
                console.log(`--- now text`)
                const text = (await extractPlainTextFromPdf( id, req ))?.plain
                await writeTextToFile(id, text, req)
                return {plain: text}
            }            

            let html

            try{

                const extResult = await fetch( url );
                html = await extResult.text();
            }catch(error){
                console.log(`Error - couldnt fetch ${url} in getDocumentAsPlainText `)
                return undefined
            }

            const extractOptions = {
                baseElements:{
                    selectors : ['article'],
                    returnDomByDefault: true
                },
                selectors: [
                { selector: 'a', format: 'skip' },
                { selector: 'input', format: 'skip' },
                { selector: 'img', format: 'skip' },
                { selector: 'button', format: 'skip' },
                { selector: '[class*=nav]', format: 'skip' }
                ]
            }
            console.log(`Importing URL as text`)
            let text = htmlToText(html, extractOptions);
            if( text.match(/incapsula incident/i) ){
                console.log(`Blocked - fallback to pdf`)
                await grabUrlAsPdf( url, id, req )
                console.log(`--- now text`)
                text = (await extractPlainTextFromPdf( id, req ))?.plain
            }

            if( text.match(/enable javascript/i) ){
                return undefined
            }
            await writeTextToFile(id, text, req)
            return {plain: text}
        }
        return undefined
    }
    const contents = (await file.download())[0]
    return {plain: contents.toString()}
}
export async function extractPlainTextFromPdf(id, req){
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
                const textSegment = firstPage?.str.slice(0, firstPage.str.length * 0.8)
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
            const result = await importDocument(id, req)
            if( !result ){
                throw "Not found"
            }
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
    let url = primitive.referenceParameters?.url
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
                    result = new Date()
                    primitive.referenceParameters.notes.lastFetched = result
                    primitive.markModified('referenceParameters.notes.lastFetched')
                    await primitive.save()
                }
                return result
            }
        }else if(url){
            try{

                console.log(`Importing URL as PDF`)
                await grabUrlAsPdf( url, id, req )
                return true
            }catch(error){
                console.log(`Error extracting from ${url}`)
                console.log(error)
            }

        }
    }catch(err){
        console.log(err)
        console.log(err.message)
    }
    return undefined
}
export async function writeTextToFile(id, text, req){
    const bucketName = 'cc_vf_document_plaintext'

    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
      });

    const bucket = storage.bucket(bucketName);
    let file = bucket.file(id)

    if( (await file.exists())[0] ){
        await file.delete()
    }

    await file.save(text, {
        metadata: {
        contentType: 'text/plain'
        }
    });
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

export async function replicateURLtoStorage(url, id, bucketName){
    try{

        console.log(`replicating`)
        if(!url || !id || !bucketName){return false}
        if( url.slice(0,4) !== "http"){return false}
        const storage = new Storage({
            projectId: process.env.GOOGLE_PROJECT_ID,
        });
        
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(id)
        if( (await file.exists())[0] ){
            await file.delete()
        }
        const stream = file.createWriteStream()
        
        
        const response = await fetch(url)
        await finished(Readable.fromWeb(response.body).pipe(stream));
    }catch(error){
        console.log(`Error on replicateURLtoStorage`, url, id, bucketName)
    }
    return true

}

export async function extractTranscriptFromVideo(url, id, req){
    const isYoutube = url && url.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([a-zA-Z0-9_-]+)/)

    if( isYoutube ){
        const fetchFromYT = async (attempts = 3)=>{
            console.log(`Awaiting  page`)
            const browser = await puppeteer.connect({
                browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_KEY}&stealth`,
            });
            
            const page = await browser.newPage()
            await page.goto(url);
            console.log(`back`)
            await new Promise(r => setTimeout(r, 1000));                    
            console.log(`continue`)

            const expand = await page.$('[id="above-the-fold"] [id="expand"]')
            if( expand ){
                console.log('Expand clicked')
                await expand.evaluate(el => el.click())
                const button = await page.$('[slot="extra-content"] [aria-label="Show transcript"]')
                if(button ){
                    console.log('Transcript clicked')
                    await button.evaluate(el => el.click())
                }
            }
            
            /*
            const menu = await page.$('[id="above-the-fold"] [id="menu"] button[aria-label="More actions"]')
            if( menu ){
                const text = await menu.evaluate(el=>el.textContent)
                if( menu[0]){
                    console.log('Menu clicked')
                    await menu[0].evaluate(el => el.click())
                }else{
                    console.log('Menu clicked')
                    await menu.evaluate(el => el.click())
                }

            }else{
                console.log("couldnt find menu")
            }

            const elements = await page.$$('ytd-menu-service-item-renderer');
        
            for (const element of elements) {
              const textContent = await element.evaluate(el => el.textContent);
              if( textContent && textContent.match(/Show transcript/)){
                console.log('Show transcript clicked')
                await element.evaluate(el => el.click());
              }
            }
            */

            
            await new Promise(r => setTimeout(r, 2000));                    
            
            const func = `() => {
                const elements = document.querySelectorAll('div[class="segment style-scope ytd-transcript-segment-renderer"] yt-formatted-string');
                const textContentArray = [];
                for (const element of elements) {
                    textContentArray.push(element.textContent);
                }
                return textContentArray;
            }`
            console.log(`Start eval`)
            const out = (await page.evaluate(eval(func)))?.join(" ")
            console.log(`Done eval - ${out.length}`)
            if( out.length === 0){
                if( attempts > 0){
                    console.log(`Retry ${attempts}`)
                    await page.close();
                    await browser.close()
                    return await fetchFromYT( attempts - 1 )
                }
            }
            await page.close();
            await browser.close()
            return out
        }
        const out = await fetchFromYT()

        return out
        
    }
    return undefined
}

const createAndUploadPDF = async (text, file) => {
    return new Promise(async (resolve, reject) => {
        const doc = new PDFDocument();
    
        doc.fontSize(12).text(text, 100, 100);
    
        const pdfBuffer = [];
    
        doc.on('data', (chunk) => {
          pdfBuffer.push(chunk);
        });
    
        doc.on('end', async () => {
          const completePDFBuffer = Buffer.concat(pdfBuffer);
    
          file.save(completePDFBuffer, (err) => {
            if (err) {
              reject(err);
            } else {
              console.log(`PDF uploaded`);
              resolve();
            }
          });
        });
    
        // Finalize the document to trigger the 'end' event
        doc.end();
      });
  };
  

export async function grabUrlAsPdf(url, id, req){
    const isYoutube = url && url.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([a-zA-Z0-9_-]+)/)
    let pdfBuffer
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
    });
    
    const bucketName = 'cc_vf_documents' 
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(id)
    if( (await file.exists())[0] ){
        await file.delete()
    }
    try{

        if( isYoutube ){
            const primitive =  await Primitive.findOne({_id:  new ObjectId(id)})
            const transcript = await extractTranscriptFromVideo(url, id, req)
            const text = "#" + primitive.plainId + "\n\n" + primitive.title + "\n\n" + primitive.referenceParameters?.description + "\n\n" + transcript
            await createAndUploadPDF( text, file)
        }else{

            const bUrl = `https://chrome.browserless.io/pdf?token=${process.env.BROWSERLESS_KEY}`
            
            
            const response = await fetch(bUrl,{
                method: 'POST',
                headers: { 
                    'Cache-Control': 'no-cache' ,
                    'Content-Type': 'application/json' 
                },
                body:JSON.stringify({
                    "url": url,
                })
            })
            
            if (response.ok) {
                const pdfData = await response.arrayBuffer();
                pdfBuffer = Buffer.from(pdfData);
                
                // Use Promisify to convert callback to Promise
                const savePromise = promisify(file.save).bind(file);
                
                await savePromise(pdfBuffer, {
                    contentType: 'application/pdf',
                    resumable: false, // Adjust as needed
                });
                
                await waitForFileToExit(id, bucket)
                console.log('PDF saved to Google Cloud Storage.');
            }else{
                if(url.slice(-3)==="pdf"){
                    await replicateURLtoStorage(url, id, bucketName)
                }
            }
        }
    }catch(error){
        console.log(`Error on processing URL to PDF ${url}`)
        console.log(error)
    }

}
export function locateQuote(oQuote, document){
    const quote = oQuote.toLowerCase().replaceAll(/\./g," ").replaceAll(/\s+/g," ").replace(/[`’]/g, "'").trim()
    let startPage = 0
    let endPage = 0
    let startIdx = 0
    let endIdx = 0
    let terminate = false
    let _test = 1
    const subset = (fwd)=>{
        const final = (data)=>{
            return data.join(" ").toLowerCase().replaceAll(/\./g," ").replaceAll(/\s+/g," ").replace(/[`’]/g, "'").trim()
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