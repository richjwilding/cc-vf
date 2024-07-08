import {executeConcurrently} from './SharedFunctions'
import moment from "moment";
import puppeteer from "puppeteer-core";
import { replicateURLtoStorage } from './google_helper';
import { storeDocumentEmbeddings } from './DocumentSearch';
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, 'p_templates/ad_helper_processad.js');
const processAdScript = fs.readFileSync(scriptPath, 'utf8');

export async function queryMetaAds(keywords, options = {}){

    if( !keywords && options.prefix ){
        keywords = " "
    }
    if( keywords ){
        let cancelled = false, count = 0, total = 0

        for( const d of keywords.split(",")){
            count = 0
            const term = d.trim()
            const fullTerm = ((options.prefix ? options.prefix + " " : "") + term).trim()
            const thisSearch = options.quoteKeywords ? '"' + fullTerm + '"' : fullTerm

            await findMetaAds(thisSearch, {
                max: options.count,
                ignoreIds: options.ignoreIds,
                add: async (items)=>{
                    let thisCount = 0
                    const processItem = async (item)=>{
                        let filterData = {text: item.adHeader, snippet: item.adHeader, term: term}

                        if( options.filterPre && !(await options.filterPre( filterData )) ){
                            return
                        }
                        if( options.existingCheck  ){
                            const exists = await options.existingCheck(item)
                            if( exists ){
                                return
                            }
                        }
                        
                        if( options.filterMid && !(await options.filterMid( filterData )) ){
                            return
                        }
                        if( options.filterPost && !(await options.filterPost(filterData )) ){
                            return
                        }
                        
                        const image = item.videos?.[0] ? item.videos[0].image : item.images?.[0]
                        
                        const r = {
                            title: item.adHeader.split(/[.\n]/)[0],
                            referenceParameters:{
                                id: item.id,
                                sponsorName: item.sponsorName,
                                sponsorUrl: item.sponsorUrl,
                                sponsorLogo: item.sponsorLogo,
                                platforms: item.platforms,
                                variants: item.variants,
                                url: item.url,
                                cta: item.cta,
                                date_start: item.date_start,
                                date_end: item.date_end,
                                source: "Meta ad search - " + fullTerm,
                                imageUrl: image,
                                imageUrls: item.images,
                                videos: item.videos,
                                hasImg: image ? true : false,
                                description: item.adHeader
                            }
                        }
                        thisCount++
                        count++
                        if( options.createResult ){
                            const newPrim = await options.createResult( r )
                            if( newPrim ){
                                if( r.referenceParameters.imageUrl ){
                                    await replicateURLtoStorage(r.referenceParameters.imageUrl, newPrim._id.toString(), "cc_vf_images")
                                }
                                if( filterData.embeddedFragments){
                                    await storeDocumentEmbeddings( newPrim, filterData.embeddedFragments)
                                }
                            }
                        }
                    }
                    console.log(`Filter ${items.length} ads`)
                    if( items.length > 0){
                        let exec = await executeConcurrently( items, processItem, options.cancelCheck, ()=> count >= options.count)
                    }
                    return thisCount
                },
                cancelCheck: options.cancelCheck
            })
            
            if( cancelled ){
                console.log(`Ad search cancelled`)
                break
            }
        }
    }
}

export async function findMetaAds(query, options){
    
    if( !query){
        throw "No query defined"
    }

    let out = [], added = 0 
    let cancelled = false
    let idTracker = {}
    if(options.ignoreIds ){
        idTracker = options.ignoreIds.reduce((a,c)=>{a[c] = true; return a}, {})
    }

    const defaults = {
        time: "1_year",
        country: "ALL",
        status: "all",
        type: "all",
        max: 1000,
        add: (data)=>{
            out = out.concat(data)
            return data.length
        }
    }
    let config = {...defaults, ...(options ?? {})}

    let startDate
    let startDateString = undefined 
    let endDate = moment()

    if( config.time && config.time !== ""){
        const currentDate = moment()
        let adjusted 

        if( config.time === "last_year"){
            adjusted = currentDate.subtract(1, 'year')
        }else if( config.time === "6_months"){
            adjusted = currentDate.subtract(6, 'month')
        }else if( config.time === "1_month"){
            adjusted = currentDate.subtract(1, 'month')
        }else if( config.time === "1_week"){
            adjusted = currentDate.subtract(1, 'week');
        }
        startDate = adjusted
    }
    
    startDateString = startDate ? startDate.format('YYYY-MM-DD') : undefined
    let endDateString = endDate.format('YYYY-MM-DD')

    //let url = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=55%20television&sort_data[direction]=desc&sort_data[mode]=relevancy_monthly_grouped&search_type=keyword_unordered&media_type=all"



    const token = process.env.BROWSERLESS_KEY
    const timeout = 30 * 60 * 1000;
    const proxy = 'residential';
    const proxyCountry = 'gb';
    const proxySticky = true;

        const fbQuery = new URLSearchParams({
            active_status: "all",
            ad_type: config.type,
            country: config.country,
            q: query,
            "sort_data[direction]":"desc",
            "sort_data[mode]":"relevancy_monthly_grouped",
            "start_date[min]": startDateString,
            "start_date[max]": endDateString,
            search_type:"keyword_unordered",
            media_type:"all"
        }).toString();

        let url = `https://www.facebook.com/ads/library/?${fbQuery}`
    
    const queryParams = new URLSearchParams({
      timeout,
      proxy,
      proxyCountry,
      proxySticky,
        blockAds: false,
      token,
    }).toString();

    
    const unblockURL =
      `https://production-lon.browserless.io/chrome/unblock?${queryParams}`;
    
    const boptions = {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url: url,
        browserWSEndpoint: true,
        cookies: false,
        content: false,
        screenshot: false,
        ttl: timeout,
      }),
    };


    const doQuery = async (attempts = 3)=>{
        let summaryAttempts = 3
        let page, browser, videoList = {}
        try{
            const initConnection = async ()=>{
                if( page ){
                    await page.close();
                }
                if( browser ){
                    await browser.close()
                }

                /*
                browser = await puppeteer.launch({
                    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                    args: [`--proxy-server=pr.oxylabs.io:7777`],
                    headless: false
                })*/

                
                
                
                console.log(`Unblocking ${url}`);
                const response = await fetch(unblockURL, boptions);
                if (!response.ok) {
                    throw new Error(`Got non-ok response:\n` + (await response.text()));
                }
                const { browserWSEndpoint } = await response.json();

                console.log(`Awaiting  page`)
                console.log(`Got OK response! Connecting puppeteer to "${browserWSEndpoint}"...`);
                browser = await puppeteer.connect({
                    browserWSEndpoint: `${browserWSEndpoint}?${queryParams}`
                });
                

               /*browser = await puppeteer.connect({
                   browserWSEndpoint: `wss://chrome.browserless.io/chrome?token=${process.env.BROWSERLESS_KEY}&--proxy-server=pr.oxylabs.io:7777`,
                   //browserWSEndpoint: `wss://production-sfo.browserless.io?token=${process.env.BROWSERLESS_KEY}&proxy=residential&proxyCountry=us&ttl=${timeout}`,
                 });*/

               /* page = await browser.newPage()
                await page.authenticate({
                    username: 'customer-cc_sense_3vFPL-cc-us-sessid-0783178570-sesstime-30',
                    password: 'yffxPZcT6S_Z_29'
                });*/



                page = (await browser.pages())[0]

                await page.reload({
                    waitUntil: 'networkidle2',
                    timeout,
                });

//                page = await browser.newPage()
                
                await page.setViewport({
                    width: 1920, 
                    height: 1080 
                });

                await page.evaluate(() => {
                    function checkForVideoElements(node) {
                        if (node.tagName === 'VIDEO') {
                        processVideoElement(node);
                        }
                        // Recursively check child nodes
                        node.querySelectorAll && node.querySelectorAll('video').forEach(video => {
                        processVideoElement(video);
                        });
                    }
                
                    function processVideoElement(video) {
                        let parent = video;
                        while (parent) {
                        if (parent.textContent && /Library ID: \d+/.test(parent.textContent)) {
                            const libraryIdMatch = parent.textContent.match(/Library ID: (\d+)/);
                            if (libraryIdMatch) {
                            const libraryId = libraryIdMatch[1];
                            const poster = video.getAttribute('poster');
                            const src = video.getAttribute('src');
                            console.log(`Library ID: ${libraryId}, ${poster}, ${src}`);
                            return;
                            }
                        }
                        parent = parent.parentElement;
                        }
                    }
                
                    const observer = new MutationObserver(mutations => {
                        mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            checkForVideoElements(node);
                        });
                        });
                    });
                
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                })

  /*              await page.authenticate({
                    username: 'customer-cc_sense_3vFPL-cc-us-sessid-0783178570-sesstime-30',
                    password: 'yffxPZcT6S_Z_29'
                });*/
                page.on('console', msg => {
                    for (let i = 0; i < msg.args().length; ++i){
                        const d = msg.args()[i].toString().replace("JSHandle:", "")
                        if(d.slice(0, 11) === "Library ID:"){
                            const [id, poster, src] = d.slice(12).split(",").map(d=>d.trim())
                            videoList[id] = {image: poster, src: src}
                        }else{
                            console.log(`REM ${i}: ${msg.args()[i]}`);
                        }
                    }
                });

               await page.setRequestInterception(true);

                const blockedDomains = [
                    /scontent.*.fbcdn.net/,
                    /optimizationguide-pa.googleapis.com/];

                    
                page.on('request', (request) => {
                    const url = new URL(request.url());

                    if (blockedDomains.find(d=>url.hostname.match(d))) {
                        request.abort(); // Abort the request
                    } else {
                    request.continue(); // Continue with the request
                    }
                });

                //await page.goto(url);
                await new Promise(r => setTimeout(r, 2500));                    
                await closePopups()
            }
        
        
            const closePopups = async ()=>{
                const headingsText = await page.$$eval('[role="heading"]', headings => {
                    return headings.map(heading => heading.textContent);
                });
                console.log(headingsText)
                if( headingsText.includes('Turn off ad blocker')){
                    console.log("Ad block message")
                    await clickButton("OK")
                    await new Promise(r => setTimeout(r, 1000));
                }
                await clickButton("Decline optional cookies")
                await new Promise(r => setTimeout(r, 1500));
            }


            const doScroll = async (page, target, attempts = 3) => {
                try{

                    const scrollDelay = 2000; 
                    const maxScrolls = 30; 
                    
                    let previousHeight;
                    for (let i = 0; i < maxScrolls; i++) {
                        previousHeight = await page.evaluate((target) => {
                            return target ? target.scrollHeight : document.body.scrollHeight;
                        }, target);
                        
                        await page.evaluate((target) => {
                            if (target) {
                                target.scrollTop = target.scrollHeight;
                            } else {
                                window.scrollTo(0, document.body.scrollHeight);
                            }
                        }, target);
                        
                        await new Promise(r => setTimeout(r, scrollDelay * (1 + Math.random())));
                        
                        const newHeight = await page.evaluate((target) => {
                            return target ? target.scrollHeight : document.body.scrollHeight;
                        }, target);
                       console.log(newHeight, previousHeight) 
                        if (newHeight === previousHeight) {
                            await new Promise(r => setTimeout(r, scrollDelay * (1 + Math.random())));
                            const newHeight = await page.evaluate((target) => {
                                return target ? target.scrollHeight : document.body.scrollHeight;
                            }, target);
                            console.log(newHeight, previousHeight, " Attempt 2") 
                            if (newHeight === previousHeight) {
                                break; // Exit the loop if no new content has been loaded
                            }
                        }
                    }
                }catch(error){
                    console.log(`Error in doScroll`)
                    console.log(error)
                    if( attempts > 0){
                        await doScroll( page, target, attempts - 1)
                    }
                }
            };
            

            const extractSummaries = async ()=>{
                let interrupted = false
                const elementHandles = await page.evaluateHandle(() => {
                const elements = Array.from(document.querySelectorAll('[role="button"]'));
                    return elements.filter(element => element.textContent.trim() === "See summary details")
                })

                const elements = await elementHandles.getProperties();
                const handles = [];
                for (const element of elements.values()) {
                if (element.asElement()) {
                    handles.push(element.asElement());
                }
                }
                for (let handle of handles) {
                    if( interrupted ){
                        console.log(`Bailing`)
                        break
                    }
                    if( added > config.max ){
                        console.log(`Got maximum`)
                        continue
                    }
                    if(config.cancelCheck && (await config.cancelCheck())){
                        console.log("Cancelled")
                        cancelled = true
                        continue
                    }
                    const text = await page.evaluate(el => el.parentElement.parentElement.textContent, handle)
                    const libraryIdMatch = text.match(/Library ID: (\d+)/)?.[[1]]
                    if( idTracker[libraryIdMatch ]){
                        console.log(`Skipping - already present`)
                        continue
                    }
                    
                    const doOpen = async (attempts = 3)=>{
                        try{
                            await handle.click(); // Example interaction
                        }catch{
                            console.log(`Bailing`)
                            interrupted = true
                            return
                        }
                        await new Promise(r => setTimeout(r, 5000));
                        const elements = await page.evaluateHandle(`(async ()=>{
                            try{
                                const findPrefix = (nodes, match)=>{
                                    const out = []
                                    for(const d of nodes){
                                        const m = d.textContent.match(match)
                                        if( m ){
                                            out.push(d)
                                        }
                                    }
                                    return out
                                }

                                const header = findPrefix(document.querySelectorAll('[role="heading"]'), /Summary data/i)?.[0]
                                const titleBar = header?.parentElement?.parentElement
                                const target = header?.parentElement?.parentElement?.parentElement?.nextSibling
                                const close = titleBar?.nextSibling?.querySelector('[role="button"]')

                                function getScrollParent(element) {
                                    if (!element) return null;
                                    const overflowRegex = /(auto|scroll|hidden)/;
                                
                                    let parent = element;
                                    while (parent) {
                                        const style = window.getComputedStyle(parent);
                                        if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX) && parent.scrollHeight > parent.clientHeight) {
                                        return parent;
                                        }
                                        parent = parent.parentElement;
                                    }
                                }

                                    
                                await new Promise(r => setTimeout(r, 2000));
                                console.log('header = ', header)
                                console.log('titlebar = ', titleBar)
                                console.log('close = ', close)
                                console.log('target = ', target)
                                return [close,target, getScrollParent( target )]
                            }catch(error){
                                console.log("Couldnt parse ad " + id)
                                console.log(error.message)
                            }
                        })()`)
                        
                        const properties = await elements.getProperties();
                        const elementHandles = [];
                        for (const property of properties.values()) {
                            const elementHandle = property.asElement();
                            if (elementHandle) {
                                elementHandles.push(elementHandle);
                            }
                        }
                        const [close, grid, scroll] = elementHandles
                        console.log(close, grid, scroll)
                        if( close === undefined ){
                            if( attempts > 0 ){
                                console.log(`Panel did not open - retrying`)
                                return await doOpen(attempts - 1)
                            }
                        }
                        return [close, grid, scroll]
                    }
                    const [close, grid, scroll] = await doOpen()

                    if( !grid || !close){
                        throw "Couldnt open panel"
                    }
                    
                    if( scroll ){
                        await doScroll( page, scroll )
                    }
                    console.log(grid)
                    console.log(JSON.stringify(grid))
                    const thisSet = await extractAds( grid)

                    console.log(`Got ${thisSet.length} variants`)
                    
                    try{
                        await close.click()
                    }catch(error){
                        console.log(`Couldnt close panel`)
                        interrupted = true
                    }
                    if( !interrupted ){
                        await new Promise(r => setTimeout(r, 4500));
                    }
                }
                return !interrupted
            }

            const extractAds = async (source, attempts = 10)=>{
                const adInfo = (await page.evaluate(`(${processAdScript})(${source ? "true" : "undefined"}, ${JSON.stringify(idTracker)})`)).map(d=>({...d, videos: [videoList[d.id]]}))

                for(const d of adInfo ){
                    idTracker[d.id] = true
                }
                const result = await config.add(adInfo)
                added += result
                return adInfo
        }

            const clickButton = async (text, attempts = 10)=>{
                const elementHandle = await page.evaluateHandle((text) => {
                    const elements = Array.from(document.querySelectorAll('[role="button"]'));
                    return elements.find(element => element.textContent.trim() === text) || null;
                }, text);
                
                if( elementHandle && elementHandle.click){
                    const buttonBox = await elementHandle.boundingBox();
                    await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
                    //console.log(`Found button`)
                    await elementHandle.click( )
                }else{
                    //console.log("No button")
                    if( attempts > 0){
                        await new Promise(r => setTimeout(r, 500));
                        return await clickButton(text, attempts - 1)
                    }
                }
                return elementHandle

            }

            const fetchAdCount = async (attempts = 50)=>{

                const headingsText = await page.$$eval('[role="heading"]', headings => {
                    return headings.map(heading => heading.textContent);
                });
                
                // Extract numbers from the headings text using regex
                const adCount = headingsText.map(text => {
                    const match = text.match(/^~?(\d{1,3}(?:,\d{3})*) results/);
                    return match ? match[1]?.replaceAll(",","") : undefined;
                }).filter(count => count)[0]
                if( (!adCount || parseInt(adCount) === 0)  && attempts > 0){
                   // console.log("Delay and retry")
                    await new Promise(r => setTimeout(r, 500));
                    return await fetchAdCount( attempts - 1)
                }
                return adCount ? parseInt(adCount) : adCount
            }


            const adjustFilter = async (startDate, endDate)=>{
                console.log( startDate, endDate)

                await new Promise(r => setTimeout(r, 1100));
                await clickButton("Filters")
                await new Promise(r => setTimeout(r, 1500));
                const panel = await page.evaluateHandle(`(() => {
                    const elements = Array.from(document.querySelectorAll('[role="heading"]'));
                    const panel = elements.find(element => element.textContent.trim() === "Filters")?.parentElement?.parentElement?.parentElement?.parentElement
                    if( panel ){
                        const start = [...panel.querySelectorAll('[role="heading"]')].find(d => d.textContent.trim()==="From")?.nextSibling?.querySelector('input')
                        const end = [...panel.querySelectorAll('[role="heading"]')].find(d => d.textContent.trim()==="To")?.nextSibling?.querySelector('input')


                        function getScrollParent(element) {
                            if (!element) return null;
                            const overflowRegex = /(auto|scroll|hidden)/;
                        
                            let parent = element;
                            while (parent) {
                                const style = window.getComputedStyle(parent);
                                if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX) && parent.scrollHeight > parent.clientHeight) {
                                return parent;
                                }
                                parent = parent.parentElement;
                            }
                            return document.scrollingElement || document.documentElement;
                        }
                        const scroll = getScrollParent( start )
                        scroll.scrollTop = scroll.scrollHeight

                        return [start, end, panel]
                    }
                })()`)
                const elements = await panel.getProperties();
                const handles = [];
                for (const element of elements.values()) {
                    if (element.asElement()) {
                        handles.push(element.asElement());
                    }
                }

                const setDate = async (field, date)=>{
                    await field.click()
                    await new Promise(r => setTimeout(r, 500));
                    await field.click({ clickCount: 3 })
                    await field.focus()
                    await new Promise(r => setTimeout(r, 500));
                    await page.keyboard.type(date);
                    await new Promise(r => setTimeout(r, 1500));
                    await handles[2]?.click()
                } 
                await setDate( handles[0], startDate)
                await setDate( handles[1], endDate)
                await new Promise(r => setTimeout(r, 1500));
                await clickButton("Apply 1 Filter")

                
                
            }
            await initConnection()

            let daysDiff = endDate.diff(startDate, "days")
            let adCount = await fetchAdCount()
            console.log(adCount)
            console.log(startDate, endDate, daysDiff)

            while( adCount > 300 && daysDiff > 1){

                if (daysDiff > 365) {
                    startDate = endDate.clone().subtract(365, 'days');
                } else if (daysDiff > 180) { // Assuming 6 months is approximately 180 days
                    startDate = endDate.clone().subtract(180, 'days');
                } else if (daysDiff > 30) {
                    startDate = endDate.clone().subtract(30, 'days');
                } else if (daysDiff > 7) {
                    startDate = endDate.clone().subtract(7, 'days');
                } else if (daysDiff > 1) {
                    startDate = endDate.clone().subtract(1, 'day');
                }
                console.log(`Range set to ${endDate.diff(startDate, "years")} / ${endDate.diff(startDate, "months")} / ${endDate.diff(startDate, "days")}`)

                daysDiff = endDate.diff(startDate, "days")
                console.log(startDate, endDate, daysDiff)

                await adjustFilter( startDate.format('DD/MM/YYYY'), endDate.format('DD/MM/YYYY') )
                adCount = await fetchAdCount()
                console.log(adCount)
            }

            await new Promise(r => setTimeout(r, 1500));

            await doScroll( page )

            await extractAds()
            console.log(`Got ${added} from main page`)

            try{
                let completed = false
                while( summaryAttempts > 0 && !completed ){
                    summaryAttempts--
                    completed = await extractSummaries()
                    if( !completed ){
                        console.log(`Did not complete summaries - retry`)
                        console.log(`Have ${Object.keys(idTracker).length} items already and will skip these`)
                        await initConnection()
                        await doScroll( page )
                    }
                }
            }catch(error){
                console.log(`Extract failed`)
                console.log(error)
                throw error
            }
            console.log(`Got ${added} items`)
            console.log(`Got ${added} / ${out.length} total`)


            /*
            if( out.length === 0){
                if( attempts > 0){
                    console.log(`Retry ${attempts}`)
                    await page.close();
                    await browser.close()
                    return await fetch( attempts - 1 )
                }
            }*/
        }catch(error){
            console.log(`Error processing `)
            console.log(error)
            throw error
        }finally{
            if( page ){
                await page.close();
            }
            if( browser ){
                await browser.close()
            }

        }
    }

    try{
        await doQuery()
    }catch(error){
        console.log(`error in doQuery`)
        console.log(error)
    }

    console.log(out.length, " total")
    return cancelled
}
