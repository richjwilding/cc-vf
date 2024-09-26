import puppeteer from "puppeteer-core";
import {clickButton} from "./remote_helper.js";

const sleep = async(ms)=>await new Promise(r => setTimeout(r, ms ?? 1000));

const findShadowButtonByTextAndClick = async (page, buttonText) => {
    await page.evaluate((buttonText) => {
        const findButton = (root, text) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
                acceptNode: (node) => {
                    if (node.shadowRoot || node.textContent.trim() === text) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            });

            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (node.shadowRoot) {
                    const result = findButton(node.shadowRoot, text);
                    if (result) {
                        return result;
                    }
                } else if (node.textContent.trim() === text) {
                    return node;
                }
            }
            return null;
        };
        const button = findButton(document, buttonText);
        if (button) {
            button.click();
        } else {
            console.log('Button not found');
        }
    }, buttonText);
};

const scrollAndExpand = async (page, target, attempts = 3) => {
    try{

        const scrollDelay = 1000; 
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

            await clickAllButtons(page, "View more comments")

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
            await scrollAndExpand( page, target, attempts - 1)
        }
    }
};
const expandAllMessages = async (page) => {
    await clickAllButtons(page)
}

const fetchPostAndComments = async (page)=>{
    console.log("doing fetch")
    const data = await page.evaluate(`(async () => {

        const upvotes = document.querySelector('shreddit-post')?.shadowRoot?.querySelector('faceplate-number')?.textContent
        const post = {
            community: document.querySelector('[noun="community"]')?.innerText?.trim(),
            subreddit: document.querySelector('.subreddit-name')?.innerText?.trim(),
            when: document.querySelector('faceplate-timeago')?.textContent.trim(),
            user: document.querySelector('[noun="user_profile"]')?.textContent.trim(),
            title: document.querySelector('[slot="title"]')?.textContent.trim(),
            upvotes: isNaN(upvotes) ? undefined : parseInt(upvotes)

        }

        const list = [...document.querySelectorAll('shreddit-comment')]
        let depthTrack = []

        const out = []
        let lastDepth
        list.forEach(d=>{
            const header = d.querySelector('[slot="commentMeta"]')?.innerText.replaceAll("\\n","").split("•")
            const depth = parseInt(d.getAttribute("depth") ?? 0)
            const content = d.querySelector('[slot="comment"]')?.innerText.trim()
            const upvotes = d.querySelector('shreddit-comment-action-row')?.shadowRoot?.querySelector('faceplate-number')?.textContent

            const data = {
                user: header[0],
                when: header[1],
                edited: header[2],
                upvotes: isNaN(upvotes) ? undefined : parseInt(upvotes),
                depth: depth,
                content
            }
            if( depth === 0){
                out.push(data)
                depthTrack = [data]
            }else{
                depthTrack[depth] = data
                const parent = depthTrack[depth - 1]
                if( parent ){
                    parent.children = parent.children ?? []
                    parent.children.push( data )
                }
            }
            lastDepth = depth
        })
        post.comments = out
        return post
    })()`);
    return data

}
const clickAllButtons = async (page, message) => {
    let buttonsClicked, maxLoops = 10;

    do {
        buttonsClicked = await page.evaluate(`(async () => {
            const message = ${message ? `"${message}"` : undefined}
            const buttons = [...document.querySelectorAll('button')];
            const moreRepliesButtons = buttons.filter(button =>message 
                ? message === button.textContent.trim()
                : /\d+ more repl(?:y|ies)/.test(button.textContent.trim())
            )

            moreRepliesButtons.forEach(button => button.click());
            return moreRepliesButtons.length;
        })()`);

        // Give some time for the new replies to load
        await page.waitForTimeout(2000); 

    } while (buttonsClicked > 0 && maxLoops--);
};

export async function fetchRedditThreadAsText(url, options= {}){
    const data = await fetchRedditThread( url, options)

    function unpackComment(d){
        let prefix = `${"-".repeat(d.depth + 1)} `
        let content = d.content ?? ""
        
        out += `${prefix}[user ${d.user} replied ${d.when}${d.upvotes ? `- ${d.upvotes} upvotes` : ""}]: `
        out += `${content.replaceAll("\n"," ").replaceAll(/\s+/g," ")}\n`
        if( d.children ){
            for(const d2 of d.children){
                unpackComment(d2)
            }
        }
    }

    if( !data ){
        return undefined
    }
    let out = `User:${data.user ?? "Unknown"} posted ${data.when} ${data.community ? `in '${data.community}'` : ""}\n${data.upvotes ? `Upvotes:${data.upvotes}\n` : ""}${data.title}\n`
    if( data.comments && data.comments.length >1 ){
        for(const d of data.comments){
            unpackComment(d)
        }
    }
    console.log(out)
    return out
}
const LOCATIONS = Object.freeze({
    amsterdam: { lat: 52.377956, lon: 4.897070 },
    london: { lat: 51.509865, lon: -0.118092 },
    new_york: { lat: 40.730610, lon: -73.935242 },
    paris: { lat: 48.864716, lon: 2.349014 },
});

export async function fetchRedditThread(url, options= {}){
    /*const token = process.env.BROWSERLESS_KEY
    const timeout = 30 * 60 * 1000;
    const proxy = 'residential';
    const proxyCountry = 'gb';
    const proxySticky = true;

    
    const queryParams = new URLSearchParams({
      timeout,
      proxy,
      proxyCountry,
      proxySticky,
        blockAds: false,
      token,
    }).toString();*/


    const AUTH = 'brd-customer-hl_2e56962b-zone-sense_browser-country-us:ux5aevhcir8a';  
    const SBR_WS_ENDPOINT = `wss://${AUTH}@brd.superproxy.io:9222`;  

    const { lat, lon } = LOCATIONS["amsterdam"];

    
    /*
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
    };*/

    let page, browser
    try{
        if( page ){
            await page.close();
        }
        if( browser ){
            await browser.close()
        }

        /*

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
        });*/
        console.log(`Doing Reddit via bright data`)
        browser = await puppeteer.connect({  
            browserWSEndpoint: SBR_WS_ENDPOINT,  
        });  

        page = await browser.newPage()
        await page.setRequestInterception(true);

        page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i){
                const d = msg.args()[i].toString().replace("JSHandle:", "")
                console.log(`REM ${i}: ${msg.args()[i]}`);
            }
        });

        page.on('request', (request) => {
            const url = new URL(request.url());
            if (request.resourceType() === 'image' || url.pathname.endsWith('png') || url.pathname.endsWith('jpg') || url.pathname.endsWith('jpeg')
                || url.pathname.includes('png?') || url.pathname.includes('jpg?') || url.pathname.includes('jpeg?')
            
            ) {
                request.abort();  // Block image requests
              } else {
                request.continue();  // Allow other requests
              }
        });

        let totalDataTransferred = 0;

        // Listen for 'response' events to capture network traffic
        page.on('response', async (response) => {
            try {
            const headers = response.headers();
            // 'content-length' header gives the size of the body in bytes
            let len = "-"
            if (headers['content-length']) {
                totalDataTransferred += parseInt(headers['content-length'], 10);
             //   len = parseInt(headers['content-length'], 10)
            }
            //const url = new URL(response.url());
            //console.log(url?.href, len)
            } catch (err) {
            console.error(`Error capturing response size: ${err}`);
            }
        });
        
        await page.setViewport({
            width: 1920, 
            height: 1080 
        });
        
        await page.goto(url, {waitUntil: "networkidle2"});
        
        /*
        page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i){
                console.log(`REM ${i}: ${msg.args()[i]}`);
            }
        });*/

        await findShadowButtonByTextAndClick(page, "Reject non-essential")

        await scrollAndExpand(page)

        await expandAllMessages(page)

        const thread = await fetchPostAndComments(page)

        console.log(`Total Data Transferred: ${totalDataTransferred} bytes`);

        return thread

    }catch(error){
        console.log(`Error in fetchRedditThread ${url}`)
        console.log(error)
    }finally{
        if( page ){
            await page.close();
        }
        if( browser ){
            await browser.close()
        }
    }
}


//await fetchRedditThreadAsText("https://www.reddit.com/r/UKFrugal/comments/1cemqf/how_do_i_get_just_the_internet_for_cheap_it_seems/")
//await fetchRedditThreadAsText("https://www.reddit.com/r/UKFrugal/comments/1dxglv4/whos_your_tv_and_broadband_provider_how_much_do/")
//await fetchRedditThreadAsText("https://www.reddit.com/r/nyc/comments/1awbm1v/1_in_4_new_york_city_children_now_lives_in/")