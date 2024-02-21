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
import Parser from '@postlight/parser';
import csv from 'csv-parser';
import { dispatchControlUpdate, executeConcurrently } from "./SharedFunctions";
import { storeDocumentEmbeddings } from "./DocumentSearch";
import * as cheerio from 'cheerio';



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

export async function getDocumentAsPlainText(id, req, override_url, forcePDF){

    const primitive =  await Primitive.findOne({_id:  new ObjectId(id)})
    const bucketName = 'cc_vf_document_plaintext'
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
      });

    const bucket = storage.bucket(bucketName);
    let file = bucket.file(id)

    let notes = primitive.referenceParameters?.notes
    let url = override_url || primitive.referenceParameters?.url
    let fecthFromPdf = primitive.referenceParameters?.sourceType === "video"
    if(url?.slice(-3)==="pdf"){
        fecthFromPdf = true
    }

    if( forcePDF || fecthFromPdf || !((await file.exists())[0]) ){
        if( notes || fecthFromPdf || forcePDF){
            console.log(`----- EXTRACT FROM PDF`)
            const result = await extractPlainTextFromPdf( id, req )
            if( result && result.plain){
                await writeTextToFile(id, result.plain, req)
            }
            return result
        }
        if( url ){
            if( url.match(/^https?:\/\/(www\.)?facebook\.com\/[^\/]+\/posts\/[A-Za-z0-9_-]+/)){
                console.log(`Fetch pdf of facebok post`)
                await grabUrlAsPdf( url, id )
                console.log(`--- now text`)
                const text = (await extractPlainTextFromPdf( id, req ))?.plain
                await writeTextToFile(id, text, req)
                return {plain: text}
            }            
            if( url.match(/^https?:\/\/(www\.)?linkedin\.com\/posts\//)){
                console.log(`Fetch LinkedIn post`)
                const result = await Parser.parse(url, {
                    contentType: 'text',
                })
                if( result && result.content ){
                    const text = result.content
                    await writeTextToFile(id, text, req)
                    return {plain: text}

                }
            }

            let html

            try{

                const extResult = await fetch( url );
                html = await extResult.text();
            }catch(error){
                console.log(error)
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
                await grabUrlAsPdf( url, id )
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
export async function extractPlainTextFromPdf(id, req, inline){
    const pdfExtract = new PDFExtract();
    let contents
    if( inline ){
        contents = inline
    }else{
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
        contents = (await file.download())[0]
    }


    const options = {}; /* see below */
    return await new Promise((resolve, reject) => {
        try{

            pdfExtract.extractBuffer(contents, options, (err, data) => {
                if (err){
                    reject(err)
                    return
                }
                try{

                    const pages = data.pages
                    // look for header / footer
                    const firstPage = pages.find(d=>d.content?.length > 0)?.content?.[0]
                    if( firstPage ){

                        const textSegment = firstPage?.str.slice(0, firstPage.str.length * 0.8) ?? ""
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
                }catch(err){
                    reject(err)
                }
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
export async function readCSVFromGoogleDrive(fileId, req) {
    let data = []

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: req.user.accessToken });
        
        const drive = google.drive({ version: 'v3', auth });
  
        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'stream' });
  
        await new Promise((resolve, reject) => {
            response.data
              .pipe(csv())
              .on('data', (row) => data.push(row))
              .on('end', resolve)
              .on('error', reject);
          });
    
    } catch (err) {
        console.error('Error streaming file.', err);
    }
    return data
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
                }else if( notes.mimeType === "text/csv"){
                    result = await readCSVFromGoogleDrive( notes.id, req)
                    if( result ){
                        await writeTextToFile( id, JSON.stringify(result) )
                    }

                }else{
                    console.log("will attempt export to pdf and plaintext")
                    result = await importGoogleDoc(id, notes.id, req)
                }
                if( result ){
                    const updateDate = new Date()
                    primitive.referenceParameters.notes.lastFetched = updateDate
                    primitive.markModified('referenceParameters.notes.lastFetched')
                    await primitive.save()
                }
                return result
            }
        }
        if(url){
            try{
                console.log(`Importing URL as PDF`)
                await grabUrlAsPdf( url, id )
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

export async function decodeBase64ImageToStorage(data, id, bucketName){
    
    try{

        console.log(`decoding` ,id, bucketName )
        if(!id || !bucketName){
            return false
        }
        const storage = new Storage({
            projectId: process.env.GOOGLE_PROJECT_ID,
        });

        const dataPrefix = 'data:image/jpeg;base64,';
        const base64Data = data.replace(dataPrefix, '');

        const buffer = Buffer.from(base64Data, 'base64');
        
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(id)
        if( (await file.exists())[0] ){
            await file.delete()
        }
        
        await file.save(buffer, {
            metadata: { contentType: 'image/jpeg' },
        });
        console.log('Upload successful');
    }catch(error){
        console.log(error)
        console.log(`Error on decodeBase64ImageToStorage`, data.slice(0,100), id, bucketName)
    }
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

export async function fetchLinksFromWebQuery(query, options , attempts = 3){
    try{
        
        const page = options?.page ?? 1

        const params = { 
            "api_key": process.env.SCALESERP_KEY,
            time_period: "last_month",
            page: page,
            "gl": options.country ?? "us",
            "q": query,
            "output":"json",
            "include_fields": "pagination,request_info,news_results,organic_results,video_results,search_information"
        }
        if( options.search_type ){
            params.search_type = options.search_type
        }
        if( options.timeFrame ){
            params.time_period = options.timeFrame
        }
        
        const url = `https://api.scaleserp.com/search?${new URLSearchParams(params).toString() }`
        console.log(url)
        
        const response = await fetch(url,{
            method: 'GET',
        });
        
        if( response.status !== 200){
            console.log(`Error from GNews`)
            console.log(response)
            return {error: response}
        }
        const data = await response.json();
        if( data?.request_info?.success ){
            let source = data.organic_results
            if( options.search_type === "news"){
                source = data.news_results
            }else if( options.search_type === "videos"){
                source = data.video_results
            }
            
            const mapped = source?.map(d=>{
                return {
                    title: d.title,
                    url: d.link,
                    snippet: d.snippet,
                    image: d.image
                }
            })
            console.log(mapped)
            return {
                links: mapped,
                nextPage: page + 1
            }

        }
    }catch(error){
        console.log(`Error in fetchLinksFromWebQuery`)
        console.log(error)
        if( attempts > 0){
            await new Promise(r => setTimeout(r, 2000));                    
            console.log(`retry....${attempts}`)
            await fetchLinksFromWebQuery(query, options, attempts - 1)
        }
    }
    
}

export async function fetchLinksFromWebDDGQuery(query, withNextPage = false, attempt = 3){
    console.log(`go`)
    try{
        let qp = `q=${query}`
        if( withNextPage instanceof Object  ){
            qp = new URLSearchParams(withNextPage).toString()
        }
        console.log(qp)
            const bUrl = `https://chrome.browserless.io/scrape?token=${process.env.BROWSERLESS_KEY}`
            const response = await fetch(bUrl,{
                method: 'POST',
                headers: { 
                    'Cache-Control': 'no-cache' ,
                    'Content-Type': 'application/json' 
                },
                body:JSON.stringify({
                    "url": `https://html.duckduckgo.com/html/?${qp}`,
                    "elements": [
                    {
                        "selector": ".result__body > .result__title",
                    },
                    {
                        "selector": ".result__body > .result__extras > .result__extras__url > .result__url"
                    },
                    {
                        "selector": ".result__body > .result__snippet"
                    },
                        {
                            "selector": '.nav-link > form > [type="hidden"]'
                        }
                    ]
                })
            })

        const results = await response.json();
        if( results && results.data?.[0]?.results){
            const links = results.data[0].results.map((d, idx)=>{
                    return {
                        title: d.text,
                        snippet: results.data?.[2]?.results?.[idx]?.text?.trim(),
                        url: "https://" + results.data?.[1]?.results?.[idx]?.text?.trim()
                    }
                })
                if( links.length === 0){
                    console.log("GOT NO RESULTS")
                    console.log(results)
                    if( attempt > 0){
                        console.log("retry")
                        return await  fetchLinksFromWebQuery(query, withNextPage, attempt--) 
                    }
                }
            if( withNextPage ){
                const attributes = results.data?.[3]?.results?.map(d=>d.attributes)
                const query = attributes.reduce((a,c)=>{
                    a[c.find(d=>d.name === "name")?.value] = c.find(d=>d.name === "value")?.value
                    return a
                }, {})
                return {
                    nextPageQuery: query,
                    links: links
                }
            }else{
                return links
            }
        }
        return []
    }catch(error){
        console.log(`Error in fetchLinksFromQebQuery`)
        console.log(error)
    }
    return undefined
}

export async function extractTextFromFacebookPost(url){
    if( !url && !url.match(/^(https?:\/\/)?(www\.)?(facebook|fb)\.com\//)){
        return undefined
    }

    const fetchFromFB = async (attempts = 0)=>{
        console.log(`Awaiting  page`)
        const browser = await puppeteer.connect({
            browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_KEY}&stealth`,
        });
        
        const page = await browser.newPage()
        let out = []
        await page.goto(url);

        const thread = await page.$('ul')
        console.log(thread)
        if( thread ){
            console.log('Got conversation thread')
            
            const parent = await page.evaluateHandle(el => el.parentNode, thread);
            const main = await page.evaluateHandle(el => el.parentNode?.parentNode?.parentNode?.previousSibling, parent);
            if( main.toString() != "JSHandle:undefined"){
                out.push( await main.evaluate(el => el?.textContent) )
                const title = await page.evaluateHandle(el => el.previousSibling, main);
                if( title.toString() != "JSHandle:undefined"){
                    const date = await page.evaluateHandle(el => el.querySelector('[id=":rd:"]'), title);
                    out.push( await date.evaluate(el => el?.textContent) )
                }
            }

            const more = await parent.evaluateHandle(parent => {
                const moreButton = Array.from(parent.querySelectorAll('span'))
                    .find(el => el.textContent.includes('View ') && el.textContent.includes('more'));
                
                return moreButton 
            });
            const previous = await parent.evaluateHandle(parent => {
                const prevButton = Array.from(parent.querySelectorAll('span'))
                    .find(el => el.textContent.includes('View ') && el.textContent.includes('previous'));
                
                return prevButton || undefined; 
            });


            let doWait = false
            if( more.toString() != "JSHandle:undefined"){
                console.log(`found more - clicking`)
                await more.evaluate(el => el.click())
                doWait = true
            }
            if( previous.toString() != "JSHandle:undefined"){
                console.log(`found previous - clicking`)
                await previous.evaluate(el => el.click())
                doWait = true
            }
            if( doWait ){
                try{
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 2000 })
                }catch(error){
                    console.log(`TIimeout - assume done`)
                }
            }
        
            const text = await page.evaluate((ul) => {


                const getTextWithPrefix = (element, stopAtElement) => {
                    let count = 0;
                    let currentElement = element;
            
                    // Traverse up the DOM tree and count 'ul' parents, stopping at 'stopAtElement'
                    while (currentElement && currentElement !== stopAtElement) {
                        if (currentElement.tagName === 'UL') {
                            count++;
                        }
                        currentElement = currentElement.parentElement;
                    }
            
                    // Create the prefix based on the count of 'ul' parents
                    
                    const prefix = count > 1 ? '-'.repeat(count - 1) : "";
                    return `${prefix}${element.textContent.trim()}`;
                };

                const elements = Array.from(ul.querySelectorAll('span ~ div'));
                //return elements.map(element => element.textContent.trim());
                return elements.map(element => getTextWithPrefix(element, ul.parentNode));
            }, thread);
            out = out.concat(text)
        
            // elementsText is an array containing the text content of each element
        
/*            await expand.evaluate(el => el.click())
            const button = await page.$('[slot="extra-content"] [aria-label="Show transcript"]')
            if(button ){
                console.log('Transcript clicked')
                await button.evaluate(el => el.click())
            }
            
            await new Promise(r => setTimeout(r, 1000));                    
            
            const func = `() => {
                const elements = document.querySelectorAll('div[class="segment style-scope ytd-transcript-segment-renderer"] yt-formatted-string');
                const textContentArray = [];
                for (const element of elements) {
                    textContentArray.push(element.textContent);
                }
                return textContentArray;
            }`

            console.log(`Start eval`)
            out = (await page.evaluate(eval(func)))?.join(" ")
            console.log(`Done eval - ${out.length}`)*/
        }
        if( !out || out.length === 0){
            if( attempts > 0){
                console.log(`Retry ${attempts}`)
                await page.close();
                await browser.close()
                return await fetchFromFB( attempts - 1 )
            }
        }
        await page.close();
        await browser.close()
        return out
    }
    const out = await fetchFromFB()

    return out
        
}
export async function extractTranscriptFromVideo(url){
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
            await new Promise(r => setTimeout(r, 500));                    
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
            
            await new Promise(r => setTimeout(r, 1000));                    
            
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
  

export async function grabUrlAsPdf(url, id, text_only = false){
    const isYoutube = url && url.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([a-zA-Z0-9_-]+)/)
    let pdfBuffer
    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
    });
    
    const bucketName = 'cc_vf_documents' 
    let file
    let bucket
    if( id ){
        bucket = storage.bucket(bucketName);
        file =  bucket.file(id)
        if( (await file.exists())[0] ){
            await file.delete()
        }
    }
    try{

        if( isYoutube ){
            const primitive =  await Primitive.findOne({_id:  new ObjectId(id)})
            const transcript = await extractTranscriptFromVideo(url)
            const text = "#" + primitive.plainId + "\n\n" + primitive.title + "\n\n" + primitive.referenceParameters?.description + "\n\n" + transcript
            await createAndUploadPDF( text, file)
        }else{
            console.log(`Awaiting  page`)
            let response
            if( url.slice(-4) === ".pdf"){
                await replicateURLtoStorage(url, id, bucketName)
                return 
            }else{
                const browserlessEndpoint = `https://chrome.browserless.io/function?token=${process.env.BROWSERLESS_KEY}&stealth`;
                
                response = await fetch(browserlessEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: "module.exports=async({page:a,context:b})=>{const{url:c}=b;await a.goto(c);await a.evaluate(() => {document.querySelectorAll('a').forEach(a => {const text = document.createTextNode(a.textContent);a.replaceWith(text);});});const d=await a.pdf();return{data:d,type:\"application/pdf\"}};",
                        "context": {
                            "url": url
                        }
                        
                    }),
                });
            }
                
            if (response.ok) {

                const pdfData = await response.arrayBuffer();
                pdfBuffer = Buffer.from(pdfData);
                if( text_only ){
                    const output = await extractPlainTextFromPdf(undefined,undefined, pdfBuffer)
                    return output
                }
                
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
export async function buildEmbeddingsForPrimitives( list, field = "title", fill_missing = true, skip_check = false ){
    let missingIdx
    let embeddings

    let isParam = false
    let parts = field.split(".")
    if( parts.length > 1 ){
        isParam = true
        field = parts[1]
    }
    
    if( skip_check ){
        missingIdx = list.map((_,i)=>i)
        fill_missing = true
        embeddings = []
    }else{
        embeddings = await Embedding.find({foreignId: {$in: list.map((d)=>d.id)}, type: field})
        missingIdx = list.map((d, idx)=>embeddings.find((e)=>e.foreignId === d.id) ? undefined : idx).filter((d)=>d  !== undefined)
        console.log(`Have ${embeddings.length} embeddings - ${missingIdx.length} missing`)
    }
    if( fill_missing ){
        console.log( `Embed ${field} / missingIdx = ${missingIdx.join(", ")}`)
        for(const idx of missingIdx){
            let thisItem = isParam ? list[idx]?.referenceParameters?.[field] : list[idx][field]
            if( thisItem ){
                dispatchControlUpdate(list[idx].id, `embed_${field}`, new Date().toISOString())
            }
        }
        for(const idx of missingIdx){
            let thisItem = isParam ? list[idx]?.referenceParameters?.[field] : list[idx][field]
            if( thisItem){
                console.log(`Embeddings for ${idx} - ${list[idx].id} ${thisItem}`)
                try{
                    
                    const response = await buildEmbeddings(thisItem)
                    if( response.success){
                        const dbUpdate = await Embedding.findOneAndUpdate({
                            type: field,
                            foreignId: list[idx].id,
                            workspaceId: list[idx].workspaceId
                        },{
                            embeddings: response.embeddings
                        },{upsert: true, new: true})
                        embeddings.push( dbUpdate )
                        console.log(`Embeddings done for ${list[idx].id} / ${field}`) 
                        dispatchControlUpdate(list[idx].id, `embed_${field}`, undefined )
                    }else{
                        dispatchControlUpdate(list[idx].id, `embed_${field}`, "error")
                    }
                }catch(error){
                    console.log(`Error in buildEmbeddingsForPrimitives`)
                    console.log(error)
                    dispatchControlUpdate(list[idx].id, `embed_${field}`, "error")
                }
            }
        }
    }
    return embeddings
}


export async function queryFacebookGroup(keywords, options = {}){
    return await queryGoogleSERP(keywords, {title: "Facebook group search", ...options, __override:{url:"https://www.facebook.com/groups/504659276407422/posts/2372112982995366/", snippet: "Fellow homeowners, I'm a new homeowner and have been in my house almost a year. Am I looking to get a decent amount of money back after writing off mortgage ..."}, prefix: ("site:facebook.com/groups/*/posts " + (options.prefix ?? "")).trim()})
}
export async function queryGoogleNews(keywords, options = {}){
    return await queryGoogleSERP(keywords, {...options, search_type: "news", article: true})
}
export async function queryYoutube(keywords, options = {}){
    return await queryGoogleSERP(keywords, {title: "Youtube search",...options, search_type: "videos", prefix: "site:youtube.com"})
}
export async function queryGoogleSERP(keywords, options = {}){
    let cancelled = false
    let totalCount = 0
    let count = 0
    let target = options.count ?? 20
    let maxPage = options.maxPage ?? 8
    let results = []
    let timeFrame = "last_year"

    const doLookup = async (term, lookupOptions )=>{
        try{
            if( lookupOptions === undefined){
                count = 0
            }
            const searchOptions = {timeFrame: timeFrame, ...options, ...(lookupOptions ?? {})}
            let hasResults = false
            let nTerm = (options.titleOnly? "intitle:" : "") + term
            let query = options.prefix ? options.prefix + " " + nTerm  : nTerm
    
            console.log(searchOptions, query)


            let currentIndex = 0;
            let concurrencyLimit = 5
            const activePromises = [];

            const processItem = async (item)=>{
                if( count < target ){

                    if( options.filterPre && !(await options.filterPre({text: item.snippet, term: term})) ){
                        return
                    }
                    
                    if( options.existingCheck  ){
                        const exists = await options.existingCheck(item)
                        if( exists ){
                            return
                        }
                    }

                    const pageContent = await fetchURLPlainText( item.url, options?.article )
                    if( !pageContent ){
                        return
                    }
                    let filterData = {text: pageContent.fullText, snippet: item.snippet, term: term}
                    if( options.filterMid && !(await options.filterMid( filterData )) ){
                        return
                    }


                    if( options.filterPost && !(await options.filterPost(filterData )) ){
                        return
                    }

                    const r = {
                        title: pageContent.title ?? item.title,
                        referenceParameters:{
                            snippet: item.snippet,
                            url: item.url,
                            posted: pageContent.posted_on,
                            source:"Google News - " + term,
                            imageUrl: pageContent.image,
                            hasImg: (item.image || pageContent.image) ? true : false,
                            description: pageContent.description
                        }
                    }
                    if( options.createResult ){
                        const newPrim = await options.createResult( r )
                        if( newPrim ){
                            await writeTextToFile(newPrim.id.toString(), pageContent.fullText)
                            if( pageContent.image ){
                                await replicateURLtoStorage(pageContent.image, newPrim._id.toString(), "cc_vf_images")
                            }else if( item.image ){
                                if( item.image.match(/https?:\/\// )){
                                    await replicateURLtoStorage(item.image, newPrim._id.toString(), "cc_vf_images")
                                }else{
                                    await decodeBase64ImageToStorage(item.image, newPrim._id.toString(), "cc_vf_images")
                                }
                            }
                            if( filterData.embeddedFragments){
                                await storeDocumentEmbeddings( newPrim, filterData.embeddedFragments)
                            }
                        }
                    }else{
                        results.push(r)
                    }
                    count++
                    totalCount++
                }
            }


            let lookup = options.override ? {links: [{title:"test", snippet: options.override.snippet, url: options.override.url}]} : (await fetchLinksFromWebQuery(query, searchOptions))
            if( lookup && lookup.links ){
                let exec = await executeConcurrently( lookup.links, processItem, options.cancelCheck, ()=> count >= target)
                cancelled = exec?.cancelled
            }
            console.log(hasResults, count, target)
            if( !cancelled && (hasResults && count < target) ){
                if( lookup.nextPage){
                    console.log('Do next page check', lookup.nextPage)
                    if( lookup.nextPage < maxPage){
                        await doLookup( term, {page:lookup.nextPage, timeFrame: timeFrame})
                    }
                }
            }
        }
        catch(error){
            console.log("Error in searchPosts")
            console.log(error)
        }
        return cancelled
    }

    if( !keywords && options.prefix ){
        keywords = " "
    }
    if( keywords ){

        for( const d of keywords.split(",")){
            const thisSearch = options.quoteKeywords ? '"' + d.trim() + '"' : d.trim()
            const cancelled = await doLookup( thisSearch )
            if( cancelled ){
                break
            }
        }
    }
    return options.createResult ? totalCount : results

}
function isRelativeUrl(url) {
    return !/^[a-z][a-z0-9+.-]*:/.test(url);
}

export async function extractURLsFromPage( baseUrl, options = {} ){
    try{
        const bUrl = `https://chrome.browserless.io/scrape?token=${process.env.BROWSERLESS_KEY}&stealth`
        const bOptions = {
            "url": baseUrl,
            "elements": [
            {
                "selector": "a",
            }
            ]
        }
        if( options.waitFor ){
            bOptions.waitFor = options.waitFor 
        }
        const response = await fetch(bUrl,{
            method: 'POST',
            headers: { 
                'Cache-Control': 'no-cache' ,
                'Content-Type': 'application/json' 
            },
            body:JSON.stringify(bOptions)
        })


        
        let domain
        try{
            domain = new URL(baseUrl).host
        }catch(error)
        {
            domain = baseUrl
        }
        const fwd = baseUrl?.slice(-1) === "/" ? "" : "/"
        const results = await response.json();
        if( results && results.data?.[0]?.results){
            const urlList = results.data?.[0]?.results.map(d=>{
                let url = d.attributes.find(d=>d.name === "href")?.value
                if( !url ){
                    return undefined
                }
                url = url.trim()
                if( url.length === 0){
                    return undefined 
                }
                if(url === baseUrl || (url + "/") === baseUrl){
                    return undefined 
                }
                if( isRelativeUrl(url)){
                    if( (options.markers === false)){
                        url = url.replace(/#.*$/, "")
                    }
                    if( url[0] === "/"){
                        url = url?.slice(1)
                    }
                    url = fwd + url
                }
                if( url && options.otherDomains === false){
                    if( url.indexOf(domain) === -1){
                        return undefined 
                    }
                }
                return {text: d.text?.trim()?.replaceAll(/[\n|\r|\t]+/g,". "), url: url}

            })
            const filtered = urlList.filter(d=>d && d.url)
            if( filtered.length === 0){
                console.log(`NO URLS found`)
                if( !bOptions.waitFor ){
                    console.log('try with wait')
                    return await extractURLsFromPage( baseUrl, {...options, waitFor: 10000} )
                }
                console.log(results)
                throw ""
            }
            return filtered
        }
        return []
    }catch(error){
        console.log(`Error in extractURLsFromPage`)
        console.log(error)
    }

}

export async function fetchURLAsText( baseUrl, options = {} ){
    try{
        const bUrl = `https://chrome.browserless.io/scrape?token=${process.env.BROWSERLESS_KEY}&stealth`
        const bOptions = {
            "url": baseUrl,
            "elements": [
                {
                    "selector": "title",
                },
                {
                    "selector": "html",
                }
            ],
            "waitFor": 2000
        }
        const response = await fetch(bUrl,{
            method: 'POST',
            headers: { 
                'Cache-Control': 'no-cache' ,
                'Content-Type': 'application/json' 
            },
            body:JSON.stringify(bOptions)
        })

        const results = await response.json();
        if( results && results.data?.[0]?.results){
            const text = results.data?.[1]?.results.map(d=>d.text?.trim()?.replaceAll(/[\n|\r|\t]+/g,". ")).join(". ")
            if( text.split(" ").length < (options.threshold ?? 50) ){
                return undefined
            }
            return{
                title: results.data?.[0]?.results.map(d=>d.text?.trim()).join(""),
                fullText: text, 
                description: text?.split(" ").slice(0,400).join(" ")
            }
        }
    }catch(error){
        console.log(`Error in fetchURLAsText`)
        console.log(error)
    }

}
export async function fetchURLAsArticle( url, threshold = 50){
    try{

        const item = {}
        const articleContent = await Parser.parse(url, {
            contentType: 'text',
        })
        console.log(articleContent)
        if( articleContent && articleContent.content ){
            if( articleContent.content.split(" ").length < threshold ){
                return false
            }
            item.fullText = articleContent.content
            item.title = articleContent.title
            item.image = articleContent.lead_image_url ?? articleContent.image 
            item.description = articleContent.content.split(" ").slice(0,400).join(" ")
            item.posted_on = articleContent.date_published ?? item.posted_on
            return item
        }
    }catch(error){
        console.log(`Error in fetchURLAsArticle`)
        console.log(error)
        return undefined
    }

}
export async function extractURLsFromPageAlternative( baseUrl, options = {}, fetch_options = {},  ){

        const params = 
            {
                'url': baseUrl,
                'apikey': process.env.ZENROWS_KEY,
                ...fetch_options
            }

        const cUrl = `https://api.zenrows.com/v1/?${new URLSearchParams(params).toString() }`
        const response = await fetch(cUrl,{
            method: 'GET'
        })
        try{
            if(response.status !== 200){
                return undefined
            }
            const html = await response.text();
            if(!html || html.length === 0){
                return undefined
            }

            const $ = cheerio.load(html);
            let links = []

            $('a').each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text();
                links.push( {text: text, url: href})
            });
            
            const fwd = baseUrl?.slice(-1) === "/" ? "" : "/"
            let domain
            try{
                domain = new URL(baseUrl).host
            }catch(error)
            {
                domain = baseUrl
            }
            links = links.map(d=>{
                let url = d.url
                if( !url ){
                    return undefined
                }
                url = url.trim()
                if( url.length === 0){
                    return undefined 
                }
                if( isRelativeUrl(url)){
                    if( (options.markers === false)){
                        url = url.replace(/#.*$/, "")
                    }
                    if( url[0] === "/"){
                        url = url?.slice(1)
                    }
                    url = baseUrl + fwd + url
                }
                if(url === baseUrl || (url + "/") === baseUrl){
                    return undefined 
                }
                if( url && options.otherDomains === false){
                    if( url.indexOf(domain) === -1){
                        return undefined 
                    }
                }
                return {text: d.text?.trim()?.replaceAll(/[\n|\r|\t]+/g,". "), url: url}
            }).filter(d=>d && d.url)
            return links?.length > 0 ? links : undefined

        }catch(error){
            console.log(`Error in extractURLsFromPageAlternative`)
            console.log(error)
        }
        return undefined
    

}
export async function fetchURLAsTextAlternative( url, options = {} ){

        const params = 
            {
                'url': url,
                'apikey': process.env.ZENROWS_KEY,
                ...options
            }

        const cUrl = `https://api.zenrows.com/v1/?${new URLSearchParams(params).toString() }`
        const response = await fetch(cUrl,{
            method: 'GET'
        })
        try{
            if(response.status !== 200){
                return undefined
            }
            const results = await response.text();
            if( results){
                const extractOptions = {
                    baseElements:{
                        selectors : ['title', 'body'],
                        returnDomByDefault: false
                    },
                    selectors: [
                        { selector: 'a', format: 'skip' },
                        { selector: 'input', format: 'skip' },
                        { selector: 'img', format: 'skip' },
                        { selector: 'button', format: 'skip' },
                        //{ selector: '[class*=nav]', format: 'skip' }
                    ]
                }
                const text = htmlToText(results, extractOptions);
                if( text ){
                    let parts = text.split('\n').filter(d=>d && d.length > 0)
                    let title = parts.shift()
                    let fullText = parts.join("\n").replaceAll(/\[\s*(https?:\/\/[^\]]+)\s*\]/g,"")
                    fullText = fullText.replace(/ +/g, ' ');
                    fullText = fullText.replace(/\n+/g, '\n');
                    if( fullText.length < 25){
                        return undefined
                    }
                    return{
                        title: title,
                        fullText: fullText, 
                        description: fullText?.split(" ").slice(0,400).join(" ")
                    }
                }
            }

        }catch(error){
            console.log(`Error in fetchURLAsTextAlternative`)
            console.log(error)
        }
        return undefined
    

}

export async function fetchURLPlainText( url, asArticle = false ){
    try{

        console.log(url)
        if( url && url.match(/^(https?:\/\/)?(www\.)?(facebook|fb)\.com\//)){
            console.log(`Processes facebook url`)
            
            const text = await extractTextFromFacebookPost( url )
            if( text){
                const item = {}
                item.fullText = text.join("\n")
                item.description = item.fullText.split(" ").slice(0,400).join(" ")
                console.log(item.description)
                return item
            }
            return undefined
        }
        const isYoutube = url && url.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([a-zA-Z0-9_-]+)/)
        if( isYoutube ){
            console.log(`Fetch YT transcript`)
            const transcript = await extractTranscriptFromVideo(url)
            if( transcript){
                const item = {}
                item.fullText = transcript
                item.description = transcript.split(" ").slice(0,400).join(" ")
                console.log(item.description)
                return item
            }
            return undefined
            
        }
        let text 

        let result
        const attempts = [
            //{title: "Article", exec: asArticle ? async ()=>await fetchURLAsArticle( url ) : undefined},
            //{title: "Browserless", exec: async ()=>await fetchURLAsText( url )},
            {title: "zenRows 1", exec: async ()=>await fetchURLAsTextAlternative( url )},
            {title: "zenRows 2", exec: async ()=>await fetchURLAsTextAlternative( url,{
                        'js_render': 'true',
                    } )},
            {title: "zenRows 3", exec: async ()=>await fetchURLAsTextAlternative( url,{
                        'js_render': 'true',
                        'premium_proxy': 'true',
                        'proxy_country': 'us',
                    } )},
            {title: "Artcile", exec: !asArticle ? async ()=>await fetchURLAsArticle( url ) : undefined},
            {title: "PDF", exec: async ()=> await grabUrlAsPdf( url, undefined, true )}
        ].filter(d=>d.exec)

        for(const attempt of attempts){
            console.log("Trying " + attempt.title)
            result = await attempt.exec()
            if( result ){
                console.log("Success " + attempt.title)
//                console.log(result)
                return result
            }
        }

    }catch(error){
        console.log(`Error in fetchURLPlainText`)
        console.log(error)
    }
}