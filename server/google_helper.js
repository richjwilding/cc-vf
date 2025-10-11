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
import { buildContext, dispatchControlUpdate, executeConcurrently, fetchPrimitive } from "./SharedFunctions";
import { buildDocumentTextEmbeddings, retrieveDocumentFromSearchCache, storeDocumentEmbeddings } from "./DocumentSearch";
import * as cheerio from 'cheerio';
import { fetchLinksFromWebDDGQuery } from "./ddg_helper";
import ContentEmbedding from "./model/ContentEmbedding";
import Category from "./model/Category";
import { HttpsProxyAgent } from "https-proxy-agent";
import { fetchRedditThreadAsText } from "./reddit_helper.js";
import { fetchSERPViaBrightData, fetchViaBrightDataProxy } from "./brightdata.js";
import parse from "node-html-parser";
import { env } from "process";

const TurndownService = require('turndown');
let turndownService = new TurndownService();

function extractSemantic(html, selectors = ['main','article']) {
    const root = parse(html);
    for (let sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el.innerHTML;
    }
    return root.querySelector('body')?.innerHTML ?? html;
  }


turndownService.addRule('skipJunk', {
    filter: ['input', 'img', 'button','script', 'style', 'iframe', 'header'],
    replacement: () => ""
  });
export function extractMarkdown(html, fullHTML = false) {
    function extractTitle(html) {
        const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        return match ? match[1].trim() : '';
      }
    
    const semanticHtml = fullHTML ? html  : extractSemantic(html) 
    let fullText = turndownService.turndown( semanticHtml );

    if (fullText) {
        let title = extractTitle(html)
        // Optional: remove bare URLs in brackets [ https://... ]
        fullText = fullText.replace(/\[\s*(https?:\/\/[^\]]+)\s*\]/g, '');

        // Clean up spacing
        fullText = fullText.replace(/ +/g, ' ');
        fullText = fullText.replace(/\n+/g, '\n');

        if (fullText.length < 25) {
            return undefined;
        }

        return {
            title: title,
            fullText: fullText,
            description: fullText.split(" ").slice(0, 400).join(" ")
        };
    }
}

function normalizeFetchedContent(input, resolvedOverride, originalUrl){
    if( !input || typeof input !== 'object' ){
        return input
    }
    const resolved = resolvedOverride ?? input.resolvedUrl ?? originalUrl
    const out = {...input}
    if( resolved ){
        out.resolvedUrl = resolved
    }
    const text = typeof out.fullText === 'string'
        ? out.fullText
        : (typeof out.plain === 'string' ? out.plain : undefined)
    if( text && typeof out.fullText !== 'string' ){
        out.fullText = text
    }
    if( text && (typeof out.description !== 'string' || out.description.length === 0) ){
        out.description = text.split(" ").slice(0,400).join(" ")
    }
    return out
}

function makeAbsoluteUrl(candidate, baseUrl){
    if( typeof candidate !== 'string' ){
        return undefined
    }
    let text = candidate.trim()
    if( !text ){
        return undefined
    }
    if( text.includes('$') ){
        text = text.split('$')[0]
    }
    if( text.startsWith('//') ){
        text = `https:${text}`
    }
    try{
        const absolute = new URL(text, baseUrl)
        return absolute.toString()
    }catch(err){
        return undefined
    }
}

export function extractPdfLinksFromHtml(html, baseUrl){
    if( typeof html !== 'string' || html.length === 0 ){
        return []
    }
    let root
    try{
        root = parse(html)
    }catch(error){
        return []
    }
    if( !root ){
        return []
    }
    const results = []
    const seen = new Set()
    const pushCandidate = (url, meta = {})=>{
        const absolute = makeAbsoluteUrl(url, baseUrl)
        if( !absolute ){
            return
        }
        const key = absolute.toLowerCase()
        if( seen.has(key) ){
            return
        }
        seen.add(key)
        const cleanMeta = {...meta}
        if( typeof cleanMeta.label === 'string' ){
            const trimmed = cleanMeta.label.replace(/\s+/g, ' ').trim()
            cleanMeta.label = trimmed.length > 0 ? trimmed : undefined
        }
        if( typeof cleanMeta.context === 'string' ){
            const trimmed = cleanMeta.context.replace(/\s+/g, ' ').trim()
            cleanMeta.context = trimmed.length > 0 ? trimmed.slice(0, 280) : undefined
        }
        results.push({
            url: absolute,
            ...cleanMeta
        })
    }

    const buildContext = (node)=>{
        try{
            const text = node?.parentNode?.textContent ?? node?.textContent ?? ''
            return text ? text.replace(/\s+/g, ' ').trim() : undefined
        }catch(err){
            return undefined
        }
    }

    root.querySelectorAll('object').forEach((node)=>{
        const type = node.getAttribute('type')?.toLowerCase() ?? ''
        if( type.includes('pdf') ){
            const data = node.getAttribute('data')
            if( data ){
                pushCandidate(data, {source: 'object', label: node.getAttribute('title'), context: buildContext(node)})
            }
        }
    })

    root.querySelectorAll('embed').forEach((node)=>{
        const type = node.getAttribute('type')?.toLowerCase() ?? ''
        if( type.includes('pdf') ){
            const src = node.getAttribute('src') ?? node.getAttribute('data')
            if( src ){
                pushCandidate(src, {source: 'embed', label: node.getAttribute('title'), context: buildContext(node)})
            }
        }
    })

    root.querySelectorAll('iframe').forEach((node)=>{
        const src = node.getAttribute('src')
        if( src && (src.toLowerCase().includes('.pdf') || src.toLowerCase().includes('/download')) ){
            pushCandidate(src, {source: 'iframe', context: buildContext(node)})
        }
    })

    const anchorNodes = root.querySelectorAll('a')
    anchorNodes.forEach((node)=>{
        const label = node.innerText || node.textContent
        const hrefCandidates = new Set()
        const href = node.getAttribute('href')
        if( href ){
            hrefCandidates.add(href)
        }
        const originalHref = node.getAttribute('data-uw-original-href')
        if( originalHref ){
            hrefCandidates.add(originalHref)
        }
        const dataHref = node.getAttribute('data-href')
        if( dataHref ){
            hrefCandidates.add(dataHref)
        }
        const uwExternal = node.getAttribute('uw-rm-external-link-id')
        if( uwExternal ){
            hrefCandidates.add(uwExternal)
        }
        const downloadAttr = node.getAttribute('data-download-url') ?? node.getAttribute('data-file')
        if( downloadAttr ){
            hrefCandidates.add(downloadAttr)
        }
        const onclick = node.getAttribute('onclick')
        if( onclick ){
            const directMatches = onclick.match(/['"](https?:[^'"\s]+\.pdf[^'"]*)['"]/gi)
            if( directMatches ){
                directMatches.forEach((match)=>{
                    const cleaned = match.replace(/["']/g, '')
                    hrefCandidates.add(cleaned)
                })
            }
            const clickMatches = onclick.match(/['"](\/[^'"\s]*Click\/[^'"\s]*)['"]/gi)
            if( clickMatches ){
                clickMatches.forEach((match)=>{
                    const cleaned = match.replace(/["']/g, '')
                    hrefCandidates.add(cleaned)
                })
            }
        }

        hrefCandidates.forEach((candidate)=>{
            if( typeof candidate !== 'string' ){
                return
            }
            const lower = candidate.toLowerCase()
            const likelyPdf = lower.includes('.pdf') || lower.includes('/click/') || lower.includes('/download')
            if( !likelyPdf ){
                return
            }
            pushCandidate(candidate, {
                source: 'anchor',
                label,
                context: buildContext(node)
            })
        })
    })

    // Fallback regex for any remaining pdf references
    const genericRegex = /href=["']([^"']+\.pdf[^"']*)["']/gi
    let match
    while( (match = genericRegex.exec(html)) !== null ){
        pushCandidate(match[1], {source: 'regex'})
    }

    const clickRegex = /['"](\/Click\/[^'"\s]+)['"]/gi
    while( (match = clickRegex.exec(html)) !== null ){
        pushCandidate(match[1], {source: 'regex_click'})
    }

    return results
}

export async function fetchPdfLinksFromPage(url, options = {}){
    if( typeof url === 'string' && url.trim().toLowerCase().endsWith('.pdf') ){
        return [{url}]
    }
    try{
        const html = await fetchAsTextViaProxy(url, options)
        if( !html ){
            return []
        }
        return extractPdfLinksFromHtml(html, url)
    }catch(error){
        console.log(`Error in fetchPdfLinksFromPage ${url}`)
        console.log(error)
        return []
    }
}

let adconfig = {}

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

function normalisePrimitiveId(primitiveOrId){
    if( !primitiveOrId){
        return undefined
    }
    if( typeof primitiveOrId === 'string'){
        return primitiveOrId
    }
    if( primitiveOrId?._id ){
        return primitiveOrId._id.toString()
    }
    return primitiveOrId.toString?.()
}

async function loadPrimitiveAndCategory(primitiveOrId){
    if( !primitiveOrId){
        return {}
    }
    if( typeof primitiveOrId === 'object' && primitiveOrId.referenceId){
        const primitive = primitiveOrId
        const category = await Category.findOne({id: primitive.referenceId})
        return { primitive, category }
    }

    const id = normalisePrimitiveId(primitiveOrId)
    if( !id){
        return {}
    }
    const primitive = await Primitive.findOne({_id:  new ObjectId(id)})
    if( !primitive){
        return {}
    }
    const category = await Category.findOne({id:  primitive.referenceId})
    return { primitive, category }
}

async function readCachedPlainText(id){
    if( !id){
        return undefined
    }
    const storage = new Storage({ projectId: process.env.GOOGLE_PROJECT_ID })
    const bucket = storage.bucket('cc_vf_document_plaintext')
    const file = bucket.file(id)
    if( !((await file.exists())[0]) ){
        return undefined
    }
    const [metadata] = await file.getMetadata()
    const fileSize = metadata.size
    if( fileSize === 0 || fileSize === '0'){
        console.log(`Zero length file ${id} - refetching`)
        return undefined
    }
    const contents = (await file.download())[0]
    return contents.toString()
}

async function ensureGoogleDriveContent(id, primitive, req){
    await importDocument(id, req)
    const cached = await readCachedPlainText(id)
    if( cached ){
        return { plain: cached }
    }
    const extracted = await extractPlainTextFromPdf(id, req)
    if( extracted?.plain ){
        await writeTextToFile(id, extracted.plain, req)
    }
    return extracted
}

async function fetchPlainTextFromPdfSources({ id, primitive, req, url }){
    let text
    if( primitive.referenceParameters?.notes ){
        const result = await ensureGoogleDriveContent(id, primitive, req)
        if( result ){
            return result
        }
    }

    if( !url ){
        return undefined
    }

    if( url.match(/^https?:\/\/(www\.)?facebook\.com\/[^\/]+\/posts\/[A-Za-z0-9_-]+/)){
        console.log(`Fetch pdf of facebok post`)
        await grabUrlAsPdf(url, id)
        text = (await extractPlainTextFromPdf(id, req))?.plain
    }else if( url.match(/^https?:\/\/(www\.)?linkedin\.com\/posts\//)){
        console.log(`Fetch LinkedIn post`)
        const result = await Parser.parse(url, { contentType: 'text' })
        if( result?.content ){
            text = result.content
        }
    }else if( url.match(/^(https?:\/\/)?drive\.google\.com\/file\/d\/(.+)\/view\?usp=drive_link/)){
        const result = await ensureGoogleDriveContent(id, primitive, req)
        if( result ){
            return result
        }
    }else{
        const data = await fetchURLPlainText(url, false, true, primitive.referenceParameters?.full_html )
        if( data?.fullText ){
            text = data.fullText
        }
    }

    if( text ){
        await writeTextToFile(id, text, req)
        return { plain: text }
    }
    return undefined
}

async function fetchPlainTextFromUrl({ id, primitive, url, req, preferEmbeddedPdf, fullHTML }){
    if( !url ){
        return undefined
    }
    const data = await fetchURLPlainText(url, false, preferEmbeddedPdf, fullHTML ?? primitive.referenceParameters?.full_html )
    if( data?.fullText ){
        await writeTextToFile(id, data.fullText, req)
        return { plain: data.fullText, ...data }
    }
    return undefined
}

export async function getPrimitiveContentPlainText(primitiveOrId, options = {}){
    const { req, overrideUrl, forcePDF = false, forceRefresh = false, preferEmbeddedPdf = false, fullHTML } = options
    const id = normalisePrimitiveId(primitiveOrId)

    if( id && !forcePDF && !forceRefresh ){
        const text = await retrieveDocumentFromSearchCache(id)
        if( text ){
            return { plain: text }
        }
    }

    const { primitive, category } = await loadPrimitiveAndCategory(primitiveOrId)
    if( !primitive ){
        return undefined
    }

    if( category?.ai?.process?.contextAsContent ){
        return { plain: await buildContext(primitive) }
    }

    const field = Object.keys(category?.parameters ?? {}).find(d => category?.parameters[d].useAsContent)
    if( field ){
        const value = primitive.referenceParameters?.[field]
        if( value ){
            return { plain: value }
        }
    }

    const url = overrideUrl || primitive.referenceParameters?.url
    const preferPdf = forcePDF || Boolean(primitive.referenceParameters?.notes) || primitive.referenceParameters?.sourceType === "video" || url?.toLowerCase?.().endsWith('.pdf')
    let cachedPlaintext
    let attemptedCache = false
    async function loadCached(){
        if( attemptedCache ){
            return cachedPlaintext
        }
        attemptedCache = true
        if( !id ){
            cachedPlaintext = undefined
            return undefined
        }
        cachedPlaintext = await readCachedPlainText(id)
        return cachedPlaintext
    }

    if( id && !forceRefresh && !preferPdf ){
        const cached = await loadCached()
        if( cached ){
            return { plain: cached }
        }
    }

    if( preferPdf || forceRefresh ){
        const result = await fetchPlainTextFromPdfSources({ id, primitive, req, url })
        if( result ){
            cachedPlaintext = result.plain ?? cachedPlaintext
            return result
        }
    }

    if( id && !forceRefresh ){
        const cached = await loadCached()
        if( cached ){
            return { plain: cached }
        }
    }

    const result = await fetchPlainTextFromUrl({ id, primitive, url, req, preferEmbeddedPdf, fullHTML })
    if( result ){
        cachedPlaintext = result.plain ?? cachedPlaintext
        return result
    }

    if( id && !forceRefresh ){
        const cached = await loadCached()
        if( cached ){
            return { plain: cached }
        }
    }

    return undefined
}

export async function getDocumentAsPlainText(id, req, override_url, forcePDF, forceRefresh){
    return await getPrimitiveContentPlainText(id, {
        req,
        overrideUrl: override_url,
        forcePDF,
        forceRefresh
    })
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
    const buckets = bucket ? [bucket] : ['cc_vf_documents', 'cc_vf_document_plaintext', 'cc_vf_images', 'published_images'];
    const storage = new Storage({projectId: process.env.GOOGLE_PROJECT_ID})
    let removed = 0
    try{
        for( const bucketName of buckets){
            console.log(`removing document from ${bucketName}`)
            const bucket = storage.bucket(bucketName);
            if( bucket ){
                const file = bucket.file(id);
                if( file ){
                    /*await file.delete({ignoreNotFound: true})
                    removed++
                    console.log(`deleted`)*/
                    const [response] = await file.delete({ignoreNotFound: true});
                    if (response && response.statusCode === 204) {  // Status code 204 means 'No Content', which indicates successful deletion
                        removed++;
                        console.log('Deleted ', removed);
                        console.log('File not found or already deleted');
                    }
                }
            }
        }
    }catch(error){
        console.log(error)
        return undefined
    }
    return removed
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
export async function readTXTFromGoogleDrive(fileId, req) {
    let data = []

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: req.user.accessToken });
        
        const drive = google.drive({ version: 'v3', auth });
  
        const response = await drive.files.get({ fileId: fileId, alt: 'media' }, { responseType: 'stream' });
  
        let fileContent = ''

        return new Promise((resolve, reject) => {
            response.data
              .on('data', chunk => {
                fileContent += chunk.toString(); // Append each chunk as a string
              })
              .on('end', () => {
                resolve(fileContent); // Resolve with the complete file content
              })
              .on('error', err => {
                console.error('Error reading stream:', err);
                reject(err);
              });
          });
    } catch (err) {
        console.error('Error streaming file.', err);
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


  export async function getGoogleDriveFileMetadata(id, req){
    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: req.user.accessToken });
        
        const drive = google.drive({ version: 'v3', auth });
        const response = await drive.files.get({
            fileId: id,
            fields: 'id, name, mimeType',
            supportsAllDrives: true
        });

        const fileMetadata = response.data;
        console.log(`File ID: ${fileMetadata.id}`);
        console.log(`File Name: ${fileMetadata.name}`);
        console.log(`MIME Type: ${fileMetadata.mimeType}`);
        return fileMetadata
    } catch (error) {
        console.error('Error fetching file metadata:', error.message);
        console.log(error)
    }
  }

export async function importDocument(id, req){
    const primitive =  await Primitive.findOne({_id:  new ObjectId(id)})
    let notes = primitive.referenceParameters?.notes
    let url = primitive.referenceParameters?.url
    if( !notes && url.match(/^(https?:\/\/)?drive\.google\.com\/file\/d\/(.+)\/view\?usp=drive_link/)){
        notes = url
    }
    try{
        if( notes ){
            if( typeof(notes) === "string"){
                const regex = /(?:file|document|spreadsheets|presentation)\/(?:u\/\d\/)?(?:[^/]+\/)?(?<id>[a-zA-Z0-9-_]+)(?:\/view|\/edit|\/preview)?/
                const match = notes.match(regex);
                if (match) {
                    console.log(`converting url to google drive id`)
                    const documentId = match.groups.id;

                    const metadata = (await getGoogleDriveFileMetadata( documentId, req)) ?? {}
                    console.log(metadata)

                    notes = {
                        type: "google_drive",
                        ...metadata
                    }
                } 
            }
            if( notes.type === "google_drive"){
                let result



                if( notes.mimeType === "application/pdf"){
                    result = await copyGoogleDriveFile(id, notes.id, req)
                }else if( notes.mimeType === "text/plain"){
                    result = await readTXTFromGoogleDrive( notes.id, req)
                    if( result ){
                        //await writeTextToFile( id, JSON.stringify(result) )
                        
                        await uploadTextToPDF(result, "cc_vf_documents", id)
                        await waitForFileToExit(id, "cc_vf_documents")

                        
                    }
                }else if( notes.mimeType === "text/csv"){
                    result = await readCSVFromGoogleDrive( notes.id, req)
                    if( result ){
                        await writeTextToFile( id, JSON.stringify(result) )
                        await waitForFileToExit(id, "cc_vf_document_plaintext")
                    }

                }else{
                    console.log("will attempt export to pdf and plaintext")
                    result = await importGoogleDoc(id, notes.id, req)
                }
                if( result && primitive.referenceParameters.notes){
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

export async function uploadTextToPDF(text, bucketName, destinationFileName) {
    // Create a new PDF document.
    const doc = new PDFDocument();
  
    // Create a Google Cloud Storage client.
    // Make sure your environment is set up with the proper credentials, e.g., via the GOOGLE_APPLICATION_CREDENTIALS environment variable.
    const storage = new Storage();
  
    // Reference the bucket and destination file.
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(destinationFileName);
  
    // Create a write stream to the Google Cloud Storage file.
    const stream = file.createWriteStream({
      metadata: {
        contentType: 'application/pdf',
      },
      resumable: false, // For small files, you can disable resumable uploads.
    });
  
    return new Promise((resolve, reject) => {
      // Listen for errors on the storage stream.
      stream.on('error', (err) => {
        console.error('Error uploading PDF to bucket:', err);
        reject(err);
      });
  
      // When the PDF is fully written to the bucket, resolve the promise.
      stream.on('finish', () => {
        console.log(`PDF successfully uploaded to gs://${bucketName}/${destinationFileName}`);
        resolve();
      });
  
      // Pipe the PDF document to the storage write stream.
      doc.pipe(stream);
  
      // Add the text content to the PDF.
      doc.text(text);
  
      // Finalize the PDF file.
      doc.end();
    });
  }


export async function writeTextToFile(id, text, req){
    if( !text ){
        return
    }
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
        if(typeof(bucket) === "string"){
            const storage = new Storage({projectId: process.env.GOOGLE_PROJECT_ID})
            bucket = storage.bucket(bucket);
        }
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
            console.log("Error in importGoogleDoc", id, fileId)
            console.log(err)
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

export async function fecthUSDFXRate(currency){
    const lower = currency.toLowerCase()
    if( lower === "usd"){
        return 1
    }
    const urls = [
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
            "https://latest.currency-api.pages.dev/v1/currencies/usd.min.json",
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
            "https://latest.currency-api.pages.dev/v1/currencies/usd.json"
    ]
    async function lookup(idx = 0){
        const url = urls[idx]
        if( url ){
            try{
                const response = await fetch(url)
                const data = await response.json()
                if( data.usd[lower] ){
                    return data.usd[lower]
                }
                return await lookup( idx + 1)
            }catch(error){
                console.log(error)
                return await lookup(idx + 1)
            }
        }
    }
    return await lookup()
}

export async function getGoogleAdKeywordMetrics(keywords, geo, req, retries = 3){
    const customerId = "3063204472" 

    {
        if( !adconfig.currency ){
            const headers = {
                'Authorization': `Bearer ${req.user.accessToken}`,
                'developer-token': process.env.GOOGLE_AD_DEV,
                'login-customer-id': customerId, // Optional: Set this if you're accessing a client account under a manager
                'Content-Type': 'application/json',
            };
            
            const body = JSON.stringify({
                query: 'SELECT customer.currency_code FROM customer'
            });
            
            const response = await fetch(`https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:search`, {
                method: 'POST',
                headers: headers,
                body: body
            })
            let data = await response.json()
            if(data.error){
                if(data.error.code === 401){
                    if( retries > 0){
                        console.log(`refreshing token`)
                        if(await refreshToken( req )){
                            return await getGoogleAdKeywordMetrics( keywords, geo, req, retries - 1 )
                        }
                    }

                }

            }

            let code = data.results[0].customer.currencyCode
            console.log('Currency Code:', code)
            adconfig.currency = code
            if( ! code ){
                return
            }
        }else{
            console.log(`reuse code`)
        }
    }
    if( !adconfig.fxRate || moment().subtract(adconfig.expiry, "s").format("X") > 0 ){
        console.log(`refetching fx`)
        adconfig.fxRate = await fecthUSDFXRate(adconfig.currency)
        adconfig.expiry = moment().add( 1000 * 60 * 60).format("X")
    }

    if(! adconfig.fxRate ){
        console.log(`fx rate not known, assuming 1`)        
    }



    const url = `https://googleads.googleapis.com/v18/customers/${customerId}:generateKeywordHistoricalMetrics`

    const headers = {
        'Authorization': `Bearer ${req.user.accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': process.env.GOOGLE_AD_DEV
      };
      
      const qopts = {
       // "language": "languageConstants/1000", // This is the criterion ID for English.
        //"geoTargetConstants": ["geoTargetConstants/2840"], // Example criterion ID for the United States.
        "keywordPlanNetwork": "GOOGLE_SEARCH_AND_PARTNERS",
        "aggregateMetrics": 
           {
            "aggregateMetricTypes":["DEVICE"]
           }, 
        historical_metrics_options:{
            include_average_cpc: true,
            year_month_range: {
                start: {month: "March", year: 2021},
                end: {month: "March", year: 2025},
            }
        },
        "keywords": [keywords].flat(),
      }

      if( geo ){
          qopts.geoTargetConstants = [`geoTargetConstants/${geo}`]
          
      }

      const body = JSON.stringify(qopts)
      
      try{
          const response = await fetch(url, {
              method: 'POST',
              headers: headers,
              body: body
            })
            const data = await response.json()
            if(data.error){
                if(data.error.code === 401){
                    if( retries > 0){
                        console.log(`refreshing token`)
                        if(await refreshToken( req )){
                            return await getGoogleAdKeywordMetrics( keywords, geo, req, retries - 1 )
                        }
                    }
                }else if(data.error.code === 429){
                    console.log(`Throttled - sleeping`)
                    await sleep(4500)
                    return await getGoogleAdKeywordMetrics( keywords, geo, req, retries - 1 )
                }
            }
                
            if(data.results){
                return {success: true, 
                    results: data.results.map(d=>{
                        if( d.keywordMetrics === undefined){
                            return d
                        }
                        return {
                            competition: d.keywordMetrics.competition,
                            monthly: d.keywordMetrics.monthlySearchVolumes.map(d=>parseInt(d.monthlySearches)),
                            highBid: d.keywordMetrics.highTopOfPageBidMicros / 1000000 / (adconfig.fxRate ?? 1),
                            lowBid: d.keywordMetrics.lowTopOfPageBidMicros / 1000000 / (adconfig.fxRate ?? 1),
                        }
                    })
                }
            }
            
            return {success: false, error: data.error}
        }catch(error){
            console.log(`error in getGoogleAdKeywordMetrics`)
            console.log(error)
            return {success: false, error: error}
        }
}
export async function getGoogleAdKeywordIdeas(keywords, req){
    const customerId = "7681868607" 
    const url = `https://googleads.googleapis.com/v16/customers/${customerId}:generateKeywordIdeas`

    const headers = {
        'Authorization': `Bearer ${req.user.accessToken}`,
        'Content-Type': 'application/json',
        'developer-token': process.env.GOOGLE_AD_DEV
      };
      
      const body = JSON.stringify({
        "language": "languageConstants/1000", // This is the criterion ID for English.
        "geoTargetConstants": ["geoTargetConstants/2840"], // Example criterion ID for the United States.
        "keywordPlanNetwork": "GOOGLE_SEARCH_AND_PARTNERS",
        "keywordSeed": {
          "keywords": ["market intelligence"],
          //"url": "https://www.example.com"
        }
      });
      
      fetch(url, {
        method: 'POST',
        headers: headers,
        body: body
      })
      .then(response => response.json()) // Parsing the JSON response body
      .then(data => {
        console.log(data.error?.details)
        console.log(data.error?.details?.erros)
        console.log(data)
      }) // Handling the parsed data
      .catch(error => {
        console.error('Error:', error)
    }); // Handling errors
}

export async function decodeBase64ImageToStorage(data, id, bucketName, type = "image/jpeg"){
    
    try{

        console.log(`decoding` ,id, bucketName )
        if(!id || !bucketName){
            return false
        }
        const storage = new Storage({
            projectId: process.env.GOOGLE_PROJECT_ID,
        });

        const dataPrefix = `data:${type};base64,`;
        const base64Data = data.replace(dataPrefix, '');

        const buffer = Buffer.from(base64Data, 'base64');
        
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(id)
        if( (await file.exists())[0] ){
            await file.delete()
        }
        
        await file.save(buffer, {
            metadata: { contentType: type },
        });
        console.log('Upload successful');
    }catch(error){
        console.log(error)
        console.log(`Error on decodeBase64ImageToStorage`, data.slice(0,100), id, bucketName)
    }
    return true

}
export async function uploadDataToBucket(imageBuffer, id, bucketName, postfix){
    try{
        console.log(`storing`)
        if(!id || !bucketName){return false}
        const storage = new Storage({
            projectId: process.env.GOOGLE_PROJECT_ID,
        });
        
        const bucket = storage.bucket(bucketName);

        const fullId = postfix ? `${id}_${postfix}` : id

        const file = bucket.file(fullId)
        if( (await file.exists())[0] ){
            await file.delete()
        }
        
        await storage.bucket(bucketName).file(fullId).save(imageBuffer, {
            metadata: {
              contentType: 'image/png',
            },
          });
        
    }catch(error){
        console.log(`Error on replicateURLtoStorage`, url, fullId, bucketName)
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

        const primitive = await fetchPrimitive(id)
        const imageCount = (primitive.imageCount ?? 0) + 1
        await dispatchControlUpdate(primitive.id, "imageCount", imageCount)
        
        
        const response = await fetch(url)
        await finished(Readable.fromWeb(response.body).pipe(stream));
    }catch(error){
        console.log(`Error on replicateURLtoStorage`, url, id, bucketName)
    }
    return true

}
export async function googleKnowledgeForQuery(query, options , attempts = 3){
    try{
        const response = await fetchSERPViaBrightData(query, {...options, knowledge: true})
        return response
        
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
export async function googleKnowledgeForQueryScaleSERP(query, options , attempts = 3){
    try{
        
        const page = options?.page ?? 1

        const params = { 
            "api_key": process.env.SCALESERP_KEY,
            time_period: options.timeFrame ?? "last_year",
            page: page,
            "gl": options.country ?? "us",
            "q": query,
            "output":"json",
            "include_fields": "pagination,request_info,knowledge_graph,search_information"
        }
        if( options.timeFrame ){
            params.time_period = options.timeFrame
        }
        if( options.search_type ){
            params.search_type = options.search_type
            if( options.search_type === "scholar"){
                delete params["timeFrame"]
                params.scholar_year_min = 2016
            }
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
            return data.knowledge_graph
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

export async function fetchLinksFromWebQuery(query, options , attempts = 3){
    try{
        
        const page = options?.page ?? 1
        let useBD = true

        const params = { 
            "api_key": process.env.SCALESERP_KEY,
            time_period: options.timeFrame ?? "last_year",
            page: page,
            "gl": options.country ?? "us",
            "q": query,
            "output":"json",
            "include_fields": "pagination,request_info,news_results,organic_results,scholar_results,video_results,search_information"
        }
        if( options.timeFrame ){
            params.time_period = options.timeFrame
        }
        if( options.search_type ){
            params.search_type = options.search_type
            if( options.search_type === "scholar"){
                useBD = false
                delete params["time_period"]
                delete params["gl"]
                params.scholar_year_min = 2016
            }
        }
        if( useBD ){
            return await fetchSERPViaBrightData(query, params)
        }
        
        const url = `https://api.scaleserp.com/search?${new URLSearchParams(params).toString() }`
        console.log("HERE")
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
            }else if( options.search_type === "scholar"){
                source = data.scholar_results
            }else if( options.search_type === "videos"){
                source = data.video_results
            }
            if( data.search_information?.original_query_yields_zero_results){
                console.log(`Search returned zero results`)
                console.log( data.search_information?.total_results + " for " + data.search_information?.showing_results_for )
                return {}
            }
            
            const mapped = source?.map(d=>{
                return {
                    title: d.title,
                    url: d.link,
                    snippet: d.snippet,
                    image: d.image
                }
            })
            //console.log(mapped)
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
    return (await fetchYTVideo(url))?.transcript
}
export async function fetchYTVideo(url){
    const isYoutube = url && url.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([a-zA-Z0-9_-]+)/)

    let title
    if( isYoutube ){
        const fetchFromYT = async (attempts = 3)=>{
            console.log(`Awaiting  page`)
            const browser = await puppeteer.connect({
                browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_KEY}&stealth`,
            });
            
            const page = await browser.newPage()
            await page.goto(url);
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
            title = await page.title()
            
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

        const videoId = url.match(/\/watch\?v=([^&]+)/)?.[1]
        return {transcript: out, title: title, thumbnail: `https://img.youtube.com/vi/${videoId}/0.jpg`}
        
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
  

export async function grabUrlAsPdf(url, id, text_only = false, prioritize_embedded_pdf = false){
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
            //let response
            let response = await fetchViaProxy( url, {proxy: process.env.BRIGHTDATA_DC_PROXY, useAxios: true } )
            if( response.status !== 200){
                return
            }
            const contentType = response.headers.get('content-type')

            console.log(`Got content type ${contentType}`)

            if( !contentType.startsWith('application/pdf')){
            }

            const contentDisposition = response.headers.get('zr-content-disposition')
            let filename
            if (contentDisposition && contentDisposition.includes('filename=')) {
                filename = contentDisposition.split('filename=')[1].split(';')[0].replace(/"/g, '');
                } else {
                filename = `Download from ${url}`
            }            


            const data = response.data;
            const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
            const isPdf = data.subarray(0, pdfSignature.length).equals(pdfSignature);
            if(!isPdf){
                console.log(`DIDNT GET PDF for ${url}`)
            }

            // Decode the Base64 string back to a buffer
            const pdfBuffer = Buffer.from(data);
    
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
            /*if( false && url.slice(-4) === ".pdf"){
                await replicateURLtoStorage(url, id, bucketName)
                return 
            }else{
                const browserlessEndpoint = `https://chrome.browserless.io/function?token=${process.env.BROWSERLESS_KEY}&stealth`;

                response = await fetch(browserlessEndpoint, {
                    method: 'POST',
                    debug: true,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: `
                            module.exports = async ({ page, context }) => {
                                const { url, prioritize_embedded_pdf } = context;
                                let pendingRequests = new Set();

                                page.on('request', request => {
                                    pendingRequests.add(request);
                                });

                                // Listen for network responses
                                page.on('requestfinished', request => {
                                    pendingRequests.delete(request);
                                });

                                page.on('requestfailed', request => {
                                    pendingRequests.delete(request);
                                });

                                const waitForNetworkIdle = async (timeout = 5000) => {
                                    return new Promise((resolve) => {
                                        if (pendingRequests.size === 0) {
                                            resolve();
                                        }
                                        const checkInterval = setInterval(() => {
                                            if (pendingRequests.size === 0) {
                                                clearInterval(checkInterval);
                                                resolve();
                                            }
                                        }, 100);
                                        setTimeout(() => {
                                            clearInterval(checkInterval);
                                            resolve();
                                        }, timeout);
                                    });
                                };

                
                                const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
                                let contentType = response.headers()['content-type'];

                                async function fetchPDF( url ){
                                    const pdfContent = await page.evaluate(async (url) => {

                                        function arrayBufferToBase64(buffer) {
                                            const bytes = new Uint8Array(buffer);
                                            const chunkSize = 0x8000; 
                                            let binary = '';
                                            for (let i = 0; i < bytes.length; i += chunkSize) {
                                                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
                                            }
                                            return btoa(binary);
                                          }
    
                                          const response = await fetch(url);
                                          const buffer = await response.arrayBuffer();
                                          return arrayBufferToBase64(buffer);
                                      }, url);
    
                                        return {
                                            data: pdfContent,
                                            type: 'application/json'
                                        }
                                }

            
                                // Check if it's a redirect to a PDF
                                if (contentType && contentType.toLowerCase() === 'application/pdf') {
                                    return await fetchPDF(url)
                                } else {
                                    // If it's HTML, wait for network idle
                                    
                                    await waitForNetworkIdle();

                                    if(prioritize_embedded_pdf){
                                        const embeddedURL = await page.evaluate(() => document.querySelectorAll('object[type="application/pdf"]')?.[0]?.getAttribute("data"))
                                        if( embeddedURL ){
                                            return await fetchPDF(embeddedURL)
                                        }
                                    }

                                    await page.evaluate(() => {
                                        document.querySelectorAll('a').forEach(a => {
                                            const text = a.textContent.trim();
                                            if (text && text.length > 0) {
                                                const textNode = document.createTextNode(text);                                                  
                                                a.parentNode.replaceChild(textNode, a);
                                            }
                                        });
                                    });
                    
                                    const pdf = await page.pdf();
                                    return { data: pdf.toString('base64'), type: 'application/json' };
                                }
                                
                            };
                        `,
                        context: {
                            url: url,
                            prioritize_embedded_pdf                                                        
                        }
                    }),
                });
            }
            if (response.ok) {

                const pdfData = await response.json();

                // Decode the Base64 string back to a buffer
                const pdfBuffer = Buffer.from(pdfData, 'base64');
        
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
                console.log( await response.text())
            }*/
        }
    }catch(error){
        console.log(`Error on processing URL to PDF ${url}`)
        console.log(error)
    }

}
export async function extractTextFromPDFData(pdfData){
    const pdfBuffer = Buffer.from(pdfData);
    const output = await extractPlainTextFromPdf(undefined,undefined, pdfBuffer)
    return output?.plain
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
    //while( compareTwoStrings( subset(true), quote) > 0.1 && !terminate){
        endIdx++
    }

    let out = undefined
    if( !terminate ){

        terminate = false
    
        while( subset(false).indexOf(quote) !== -1 && !terminate){
        //while( compareTwoStrings( subset(false), quote) <= 0.1 && !terminate){
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
        //console.log( `Embed ${field} / missingIdx = ${missingIdx.join(", ")}`)
        for(const idx of missingIdx){
            let thisItem = isParam ? list[idx]?.referenceParameters?.[field] : list[idx][field]
            if( thisItem ){
                dispatchControlUpdate(list[idx].id, `embed_${field}`, new Date().toISOString())
            }
        }
        for(const idx of missingIdx){
            let thisItem = isParam ? list[idx]?.referenceParameters?.[field] : list[idx][field]
            if( thisItem){
                //console.log(`Embeddings for ${idx} - ${list[idx].id} ${thisItem}`)
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
                        //console.log(`Embeddings done for ${list[idx].id} / ${field}`) 
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
    return await queryGoogleSERP(keywords, {title: "Facebook group search", ...options, prefix: ("site:facebook.com/groups/*/posts " + (options.prefix ?? "")).trim()})
}
export async function queryGoogleNews(keywords, options = {}){
    return await queryGoogleSERP(keywords, {...options, search_type: "news", article: true})
}
export async function queryGoogleScholar(keywords, options = {}){
    return await queryGoogleSERP(keywords, {...options, search_type: "scholar", article: false, preferDownload: true})
}
export async function queryYoutube(keywords, options = {}){
    return await queryGoogleSERP(keywords, {title: "Youtube search",...options, search_type: "videos", prefix: "site:youtube.com"})
}
export async function queryGoogleSERP(keywords, options = {}){
    let cancelled = false
    let totalCount = 0
    let totalScanned = 0
    let count = 0
    let target = options.count ?? 20
    let maxPage = options.maxPage ?? 8
    let results = []
    let timeFrame //= "last_year"
    let allSite = options.site

    let webQuery = options.engine === "ddg" ? fetchLinksFromWebDDGQuery : fetchLinksFromWebQuery
    if( options.engine === "ddg" ){
        maxPage = maxPage * 22
        console.log(`maxPage raised to ${maxPage} for ddg`)
    }

    const doLookup = async (term, lookupOptionFull )=>{
        try{
            const {site, ...lookupOptions} = lookupOptionFull
            const searchOptions = {timeFrame: timeFrame, ...options, ...(lookupOptions ?? {})}
            let hasResults = false
            let nTerm = (options.titleOnly? "intitle:" : "") + term
            let query = options.prefix ? options.prefix + " " + nTerm  : nTerm
            if( site ){
                query += ` site:${site}`
            }
    
            console.log(searchOptions, query)

            let scanned = 0
            let currentIndex = 0;
            let concurrencyLimit = 5
            const activePromises = [];

            const processItem = async (item)=>{
                if( count < target ){
                    scanned++
                    totalScanned++
                    if( options.progressUpdate ){
                        await options.progressUpdate({
                            term,
                            count,
                            totalCount,
                            totalScanned,
                            scanned
                        })
                    }

                    if( options.filterPre && !(await options.filterPre({text: item.snippet, term: term, dataSource: item.url})) ){
                        return
                    }
                    
                    if( options.existingCheck  ){
                        const exists = await options.existingCheck(item)
                        if( exists ){
                            return
                        }
                    }

                    const pageContent = await fetchURLPlainText( item.url, options?.article, options?.preferDownload )
                    if( !pageContent ){
                        return
                    }
                    let filterData = {text: pageContent.fullText, snippet: item.snippet, term: term, dataSource: item.url}
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
                            source: [`Google`, searchOptions.search_type ?? "", site ? `site:${site}` :"", term ?? ""].join(" "),
                            discovery:{
                                engine: `Google ${searchOptions.search_type ?? ""}`.trim(),
                                site: site,
                                terms: term
                            },
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
                            if( !filterData.embeddedFragments){
                                console.log(`-> Building embeddings inline`)
                                filterData.embeddedFragments = await buildDocumentTextEmbeddings( pageContent.fullText )
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
                if( options.progressUpdate ){
                    await options.progressUpdate({
                        term,
                        count,
                        totalCount,
                        totalScanned,
                        scanned
                    })
                }
            }


            let lookup = options.override ? {links: [{title:"test", snippet: options.override.snippet, url: options.override.url}]} : (await webQuery(query, searchOptions))
            if( lookup && lookup.links ){
                hasResults = true
                if( options.urlFilter){
                    const oldCount = lookup.links.length
                    lookup.links = lookup.links.filter(d=>d.url.indexOf(options.urlFilter) > -1)
                    console.log(`URLs filtered to ${lookup.links.length} for ${options.urlFilter}`)
                }
                if( lookup.links.length > 1){
                    let exec = await executeConcurrently(lookup.links, processItem, options.cancelCheck, ()=> count >= target)
                    cancelled = exec?.cancelled
                    if( exec.stopped ){
                        console.log(`Stopped for term maximum cancel = ${cancelled}`)
                    }
                }
            }
            console.log(hasResults, count, target)
            if( !cancelled && (hasResults && count < target) ){
                if( lookup.nextPage){
                    console.log('Do next page check', lookup.nextPage)
                    if( lookup.nextPage < maxPage){
                        await doLookup( term, {page:lookup.nextPage, timeFrame: timeFrame, site: site})
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

    if( !keywords && (options.prefix || options.site)){
        keywords = " "
    }
    const sites = options.site ? options.site.split(",").filter(d=>d).map(d=>d?.trim()) : [undefined]
    console.log(sites)
    if( keywords ){
        let cancelled = false
        for( const site of sites){
            for( const d of keywords.split(",")){
                if(options.countPerTerm){
                    console.log(`Reset count to 0 for next term`)
                    count = 0
                }
                const thisSearch = options.quoteKeywords ? '"' + d.trim() + '"' : d.trim()
                cancelled = await doLookup( thisSearch, {site: site} )
                if( cancelled ){
                    break
                }
            }
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
export async function fetchURLAsArticle( data, threshold = 50){
    try{

        let url, html
        if( typeof( data ) === "string"){
            url = data
        }else{
            url = data.url
            html = data.html
        }
        const item = {}
        const articleContent = await Parser.parse(url, {
            html,
            contentType: 'text',
        })
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
export async function getMetaImageFromURL(url) {
    try {
        const finalUrl = url.match(/:\/\//) ? url : "https://" + url
      const response = await fetchAsTextViaProxy(finalUrl);
        const $ = cheerio.load(response);
  
  
      let imageURL = $('meta[property="og:image:secure_url"]').attr('content') //?? $('meta[property="og:image:url"]').attr('content')
  
      if (imageURL && !imageURL.startsWith('http')) {
        const baseUrl = new URL(finalUrl);
        imageURL = `${baseUrl.origin}${imageURL}`;
      }
  
      console.log(`image URL: ${imageURL}`);
      return imageURL;
    } catch (error) {
      console.error(`Error fetching favicon: ${error}`);
    }
  }
export async function getFaviconFromURL(url) {
    try {
        const finalUrl = url.match(/:\/\//) ? url : "https://" + url
        const response = await fetchAsTextViaProxy(finalUrl);
        const $ = cheerio.load(response);
  
      let faviconUrl = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || $('link[rel="apple-touch-icon"]').attr('href');
  
      if (faviconUrl && !faviconUrl.startsWith('http')) {
        const baseUrl = new URL(finalUrl);
        faviconUrl = `${baseUrl.origin}/${faviconUrl}`;
      }
  
      console.log(`Favicon URL: ${faviconUrl}`);
      return faviconUrl;
    } catch (error) {
      console.error(`Error fetching favicon: ${error}`);
    }
  }
export async function getMetaDescriptionFromURL(url) {
    try {
        const finalUrl = url.match(/:\/\//) ? url : "https://" + url
        const response = await fetchAsTextViaProxy(finalUrl);
        const $ = cheerio.load(response);

        const metaDescriptions = [];
        $('meta[name="description"]').each((i, elem) => {
        const content = $(elem).attr('content');
        if (content) {
            metaDescriptions.push(content.trim());
        }
        });

        return metaDescriptions.length > 0 ? metaDescriptions.join(". ") : null;
  
    } catch (error) {
      console.error(`Error fetching meta:`);
      console.log(error)
    }
  }

export async function fetchViaProxy(url, options = {}) {
    return await fetchViaBrightDataProxy(url, options)

}
export async function fetchAsTextViaProxy(url, options = {}) {
    console.log(`Try DC`)
    let result = await tryFetchAsTextViaProxy(url, options) 
    if( !result ){
        console.log(`Try Unlock`)
        result = await tryFetchAsTextViaProxy(url, {...options, proxy: process.env.BRIGHTDATA_UNLOCK_PROXY}) 
    }
    if( !result ){
        console.log(`Try Res`)
        result = await tryFetchAsTextViaProxy(url, {...options, proxy: process.env.BRIGHTDATA_RES_PROXY}) 
    }
    if( !result ){
        throw new Error(`Couldnt fetch from BD Proxies`);
    }
    return result
}
async function tryFetchAsTextViaProxy(url, options = {}) {
  try {
    const response = await fetchViaProxy( url, {...options, useAxios: true, responseType: "stream"})

    if (response.status !== 200) {
        console.log(`Failed - ${response.status}`)
        return undefined
    }

    const stream = response.data; // This is a readable stream
    const decoder = new TextDecoder();
    let results = '';

    // Read the stream in chunks
    for await (const chunk of stream) {
        results += decoder.decode(chunk, { stream: true });
    }

    results += decoder.decode(); // Finalize decoding

    return results;  
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;  
  }
}

export async function extractURLsFromPageUsingScrapingBrowser(pageUrl, options) {
  const SBR_WS_ENDPOINT = process.env.BRIGHTDATA_SCRAPER_PUPPETEER//`wss://brd-customer-${username}-zone-${zone}:${password}@brd.superproxy.io:9222`;
  // Connect to Bright Data’s Scraping Browser via Puppeteer
  const browser = await puppeteer.connect({ browserWSEndpoint: SBR_WS_ENDPOINT });
  try {
    const page = await browser.newPage();

    // Go to target URL (wait until network is idle to ensure JS-rendered links are loaded)
    await page.goto(pageUrl, {
      waitUntil: 'networkidle2',
      timeout: 90000, 
    });
    const mainLinks = await page.$$eval('a', anchors =>
        anchors
          .map(a => ({ url: a.href, text: a.textContent.trim() }))
          .filter(l => l.url)  // drop any empty hrefs
        );
    if (mainLinks.length === 0) {
          // 2) No links on the base page → scrape all child frames
          for (const frame of page.frames()) {
            console.log(`Cheking ${frame.url()}`)
              if (frame === page.mainFrame()) continue;  // skip the main frame
              try {
                await frame.waitForFunction(
                  () => document.readyState === 'complete',
                  { timeout: 10000 }
                );
              } catch (err) {
                console.warn(`Frame ${frame.url()} did not fully load in time, continuing…`);
              }

              const links = await frame.$$eval('a', anchors =>anchors.map(a => ({ url: a.href, text: a.textContent.trim() })).filter(l => l.url));
            if (links.length > 0) {
                links.forEach(l => l.frameUrl = frame.url());
                mainLinks.push(...links);
            }
        }
    }
    
    const finalLinks = cleanupExtractedURLs( mainLinks, pageUrl, options )
  
    return finalLinks;
  } finally {
    await browser.close();
  }
}
function cleanupExtractedURLs( links, baseUrl, options){
    const fwd = baseUrl?.slice(-1) === "/" ? "" : "/"
    let domain
    try{
        domain = new URL(baseUrl).host
        let parts = domain.split('.');
        if (parts.length > 2) {
            parts.shift();  // Remove the first part (like 'www' or other subdomains)
        }
        domain = parts.join('.');
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
        if( url.startsWith("javascript")){
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
    return links
}

export async function extractURLsFromPageAlternative( baseUrl, options = {}, fetch_options = {},  ){
        const finalUrl = baseUrl.match(/:\/\//) ? baseUrl : "https://" + baseUrl
        try{
            const response = await fetchAsTextViaProxy(finalUrl);
            const $ = cheerio.load(response);
            let links = []

            console.log(`loaded - scraping links`)

            $('a').each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text();
                links.push( {text: text, url: href})
            });
            
            links = cleanupExtractedURLs( links, baseUrl, options )
            
            return links?.length > 0 ? links : undefined

        }catch(error){
            console.log(`Error in extractURLsFromPageAlternative`)
            console.log(error)
        }
        return undefined
    

}
export async function downloadURLContentViaProxy(url, options ={}){
    const proxyUrl = 'http://customer-cc_sense_3vFPL-cc-us-sessid-0783178570-sesstime-30:yffxPZcT6S_Z_29@pr.oxylabs.io:7777'; 
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    try{
        console.log(`Proxying request for ${url}`)
        const response = await fetch(url, { agent: proxyAgent })
        if(response.status !== 200){
            console.log(`Failed downloadURLContentViaProxy for ${url}`)
            return undefined
        }
        const data = await response.arrayBuffer();
        let filename
        const contentDisposition = response.headers.get('content-disposition')
        if (contentDisposition && contentDisposition.includes('filename=')) {
            filename = contentDisposition.split('filename=')[1].split(';')[0].replace(/"/g, '');
            } else {
            filename = `Download from ${url}`
        }            

        return await processPDFDownloadBuffer( data )
    }catch(error){
        console.log(`Error in downloadURLContentViaProxy`)
        console.log(error)
    }
}
export async function processPDFDownloadBuffer( data, filename ){
    const dataBuffer = Buffer.from(data);

    const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]); // %PDF-
    const isPdf = dataBuffer.subarray(0, pdfSignature.length).equals(pdfSignature);
    let text = ""
    if( isPdf ){
        console.log('Processing pdf')
        text = await extractTextFromPDFData( dataBuffer )
        //text = await extractTextFromPDFData( data )
    }
    return{
        title: filename ?? "Download",
        fullText: text, 
        description: text?.split(" ").slice(0,400).join(" ")
    }
}
export async function fetchURLAsTextAlternative( url, full_options = {} ){
    const {preferEmbeddedPdf, asArticle, fullHTML, ...options} = full_options
/*
        const params = 
            {
                'url': url,
                'apikey': process.env.ZENROWS_KEY,
                ...options
            }

        const cUrl = `https://api.zenrows.com/v1/?${new URLSearchParams(params).toString() }`*/
        try{
            /*const response = await fetch(cUrl,{
                method: 'GET'
            })*/
           const response = await fetchViaProxy( url, {proxy: options.proxy, useAxios: true } )
            if(response.status !== 200){
                if( response.status === 413 || response.status === 413){
                    // too large or unprocessable
                    return downloadURLContentViaProxy( url )
                }
                return response
            }
            const contentType = response.headers.get('zr-content-type') ?? response.headers.get('content-type')
            if( contentType.startsWith('application/pdf')){
                console.log(`Got content type ${contentType}`)

                const contentDisposition = response.headers.get('zr-content-disposition')
                let filename
                if (contentDisposition && contentDisposition.includes('filename=')) {
                    filename = contentDisposition.split('filename=')[1].split(';')[0].replace(/"/g, '');
                  } else {
                    filename = `Download from ${url}`
                }            


                const data = response.data;
                return await processPDFDownloadBuffer( data, filename )
            }else if( contentType.startsWith('text/html')){
                const results = response.data.toString('utf-8')
    

                if( results){
                    if( asArticle ){
                        return await fetchURLAsArticle({url, html: results})
                    }

                    if( preferEmbeddedPdf ){
                        // Search for embedded pdf in object
                        const elementRegex = /<object ([^>]*)type=["']application\/pdf["']([^>]*)>/gi;
                        let match;

                        const embeddedPdfs = [];
                        while ((match = elementRegex.exec(results)) !== null) {
                            const attributesString = match[1] + match[2];

                            // Regular expression to match individual attributes
                            const attributesRegex = /(\w+)=["']([^"']*)["']/g;
                            let attributeMatch;
                            const attributes = {};

                            while ((attributeMatch = attributesRegex.exec(attributesString)) !== null) {
                                const name = attributeMatch[1];
                                const value = attributeMatch[2];
                                if( name === "data"){
                                    embeddedPdfs.push(value)

                                }
                            }
                        }
                        if( embeddedPdfs.length === 0){
                            const spanElementRegex = /<embed[^>]*type=["']application\/pdf["'][^>]*src=["']([^"']+)["'][^>]*>/gi;
                            while ((match = spanElementRegex.exec(results)) !== null) {
                                const pdfUrl = match[1];
                                embeddedPdfs.push(pdfUrl);
                            }
                        }
                        if( embeddedPdfs.length === 0){
                           /* const spanElementRegex = /<[^>]*data=["']([^"']*)["']/gi;
                            while ((match = spanElementRegex.exec(results)) !== null) {
                                const pdfUrl = match[1];
                                embeddedPdfs.push(pdfUrl);
                            }*/
                        }
                        if( embeddedPdfs.length === 0){
                            const spanElementRegex = /<(?!link\b)[^>]*href=["']([^"']*\.pdf[^"']*)["']/gi;
                            while ((match = spanElementRegex.exec(results)) !== null) {
                                const pdfUrl = match[1];
                                embeddedPdfs.push(pdfUrl);
                            }
                        }
                        if( embeddedPdfs.length === 0){
                            const spanElementRegex = /<[^>]*href=["']([^"']*\/download)["']/gi;
                            while ((match = spanElementRegex.exec(results)) !== null) {
                                const pdfUrl = match[1];
                                embeddedPdfs.push(pdfUrl);
                            }
                        }
                        if( embeddedPdfs.length === 0){
                            const clickLinkRegex = /<a[^>]*href=["']([^"']*\/Click\/[^"']*)["'][^>]*>(.*?)<\/a>/gims
                            let clickMatch
                            while( (clickMatch = clickLinkRegex.exec(results)) !== null ){
                                const rawHref = clickMatch[1]
                                const labelHtml = clickMatch[2] ?? ""
                                const labelText = labelHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                                const uwOriginalMatch = /data-uw-original-href=["']([^"']+)["']/i.exec(clickMatch[0])
                                const externalLinkMatch = /uw-rm-external-link-id=["']([^"']+)["']/i.exec(clickMatch[0])
                                let candidate = externalLinkMatch?.[1] ?? uwOriginalMatch?.[1] ?? rawHref
                                if( !candidate ){
                                    continue
                                }
                                if( candidate.includes('$') ){
                                    candidate = candidate.split('$')[0]
                                }
                                const likelyPdf = /view\s*pdf|annual\s*report|form\s*10k|download/i.test(labelText)
                                if( likelyPdf || /\.pdf/i.test(candidate) ){
                                    embeddedPdfs.push(candidate)
                                }
                            }
                        }
                        if( embeddedPdfs.length > 1 ){
                            const seen = new Set()
                            for(let i = embeddedPdfs.length - 1; i >= 0; i--){
                                const key = embeddedPdfs[i]?.trim().toLowerCase()
                                if( !key ){
                                    embeddedPdfs.splice(i, 1)
                                    continue
                                }
                                if( seen.has(key) ){
                                    embeddedPdfs.splice(i,1)
                                }else{
                                    seen.add(key)
                                }
                            }
                        }
                        if( embeddedPdfs.length > 0){
                            let thisUrl = embeddedPdfs[0]

                            if (!thisUrl.startsWith('http')) {
                                thisUrl = new URL(thisUrl, url).href;
                              }

                            console.log( `Found embedded ${thisUrl} - fetching`)

                            const pdfResult = await grabUrlAsPdf(thisUrl, undefined, true)
                            if( pdfResult?.plain ){
                                const pdfText = pdfResult.plain
                                return normalizeFetchedContent({
                                    title: `Download from ${thisUrl}`,
                                    fullText: pdfText,
                                    description: pdfText.split(" ").slice(0,400).join(" "),
                                    resolvedUrl: thisUrl,
                                    sourceUrl: url,
                                    plain: pdfText
                                }, thisUrl, url)
                            }
                            return normalizeFetchedContent(pdfResult, thisUrl, url)
                        }
                    }

                    const details = extractMarkdown(results, fullHTML)
                    if( !details ){
                        const pattern = /<iframe\b[^>]*\ballowfullscreen\b[^>]*\bsrc=(["'])(.*?)\1/gi;
                        const urls = [];
                        let match;
                        while ((match = pattern.exec(results)) !== null) {
                            const url = match[2]
                            if( url ){
                                console.log(`No content - checking iframe ${url}`)
                                const iframeDetails = await fetchURLAsTextAlternative( url, full_options)
                                if( iframeDetails ){
                                    return iframeDetails
                                }
                            }
                        }
                    }

                    return details
                    /*const extractOptions = {
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
                    }*/
                }else{
                    console.log(`Unknown type ${contentType}`)
                    return {unhandled: true}
                }
            }

        }catch(error){
            console.log(`Error in fetchURLAsTextAlternative ${url}`)
            console.log(error)
        }
        return undefined
    

}

export async function fetchURLScreenshot( url ){
    try {

        const params = 
            {
                'url': url,
                'apikey': process.env.ZENROWS_KEY,
                "js_render": "true",
                "json_response": true,
                "return_screenshot": "true"
            }

        const cUrl = `https://api.zenrows.com/v1/?${new URLSearchParams(params).toString() }`
        const response = await fetch(cUrl,{
            method: 'GET'
        })
        if(response.status !== 200){
            console.log(response)
            return undefined
        }
        const data = await response.json()
        return data?.screenshot
        
    }catch(error){
        console.log(`Error in fetchUrlScreenshot`)
        console.log(error)
    }    
}
export async function extractTextFromGoogleDriveFile( driveId ){


}
export async function fetchURLPlainText( url, asArticle = false, preferEmbeddedPdf = false, fullHTML = false ){
    try{

        console.log(url)
        if( url && url.match(/^(https?:\/\/)?(www\.)?(reddit)\.com\//)){
            const text = await fetchRedditThreadAsText( url )
            if( text){
                const item = {}
                item.fullText = text
                item.description = item.fullText.split(" ").slice(0,400).join(" ")
                return normalizeFetchedContent(item, undefined, url)
            }
            return undefined
        }else if( url && url.match(/^(https?:\/\/)?(www\.)?(facebook|fb)\.com\//)){
            console.log(`Processes facebook url`)
            
            const text = await extractTextFromFacebookPost( url )
            if( text){
                const item = {}
                item.fullText = text.join("\n")
                item.description = item.fullText.split(" ").slice(0,400).join(" ")
                console.log(item.description)
                return normalizeFetchedContent(item, undefined, url)
            }
            return undefined
        }
        const isYoutube = url && url.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?([a-zA-Z0-9_-]+)/)
        if( isYoutube ){
            console.log(`Fetch YT transcript`)
            const videoDetails = await fetchYTVideo(url)
            if( videoDetails){
                const item = {title: videoDetails.title, fullText: videoDetails.transcript, image: videoDetails.thumbnail}
                if( videoDetails.transcript ){
                    item.description = videoDetails.transcript.split(" ").slice(0,400).join(" ")
                }
                return normalizeFetchedContent(item, undefined, url)
            }
            return undefined
            
        }
        let text 

        let result
        const attempts = [
            {title: "BrightData", exec: async ()=>{
                if( url.includes("quora.com") || url.includes(".gov.") || url.endsWith(".gov")){
                    return
                }
                return await fetchURLAsTextAlternative( url,{
                    fullHTML,
                    asArticle,
                    preferEmbeddedPdf,
                    proxy: process.env.BRIGHTDATA_DC_PROXY
                })
            }},
            {title: "BrightData Unlock", exec: async ()=>{
                if( url.includes("quora.com") || url.includes(".gov.") || url.endsWith(".gov")){
                    return
                }
                return await fetchURLAsTextAlternative( url,{
                    fullHTML,
                    asArticle,
                    preferEmbeddedPdf,
                    proxy: process.env.BRIGHTDATA_UNLOCK_PROXY
                })
            }},
            {title: "BrightData RES", exec: async ()=>{
                if( url.includes(".gov.") || url.endsWith(".gov")){
                    return
                }
                const out = await fetchURLAsTextAlternative( url,{
                    fullHTML,
                    asArticle,
                    preferEmbeddedPdf,
                    proxy: process.env.BRIGHTDATA_RES_PROXY
                })
                if( out?.fullText && out?.fullText.length < 200 && out.fullText.match(/enable Javascript/i)){
                    return
                }
                return out
            }},
            {title: "Browserless", exec: async ()=>{
                if( url.endsWith(".pdf") ){
                    return
                }
                return await fetchURLAsText( url )
            }},
            {title: "PDF", exec: async ()=>{
                const data = await grabUrlAsPdf( url, undefined, true, preferEmbeddedPdf )
                console.log("got text")
                if( data?.plain ){
                    return normalizeFetchedContent({
                        title: `Download from ${url}`,
                        fullText: data.plain, 
                        description: data.plain?.split(" ").slice(0,400).join(" "),
                        resolvedUrl: url,
                        plain: data.plain
                    }, url, url)
                }
            }}
           // {title: "Article", exec: !asArticle ? async ()=>await fetchURLAsArticle( url ) : undefined},
        ].filter(d=>d.exec)

        for(const attempt of attempts){
            console.log(`Trying ${attempt.title} : ${url}` )
            result = await attempt.exec()
            if( result){
                if( result.error ){
                    if( result.error?.status === 404 ){
                        console.log( `404 - stopping chain`)
                        return
                    }
                }else{
                    console.log(`Success ${attempt.title} : ${url}`)
                    return normalizeFetchedContent(result, undefined, url)
                }
            }
        }

    }catch(error){
        console.log(`Error in fetchURLPlainText`)
        console.log(error)
    }
}
