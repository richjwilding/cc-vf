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
const clickAllButtons = async (page, message) => {
    let buttonsClicked, maxLoops = 10;
    console.log(message)

    do {
        buttonsClicked = await page.evaluate((message) => {
            const buttons = [...document.querySelectorAll('button')];
            const moreRepliesButtons = buttons.filter(button =>message 
                ? message === button.textContent.trim()
                : /\d+ more repl(?:y|ies)/.test(button.textContent.trim())
            )

            console.log(message)
                console.log(buttons)

            console.log(moreRepliesButtons)
            moreRepliesButtons.forEach(button => button.click());
            return moreRepliesButtons.length;
        }, message);

        // Give some time for the new replies to load
        await page.waitForTimeout(2000); 

    } while (buttonsClicked > 0 && maxLoops--);
};

export async function fetchRedditThread(url, options= {}){

    let page, browser
    try{
        if( page ){
            await page.close();
        }
        if( browser ){
            await browser.close()
        }

        browser = await puppeteer.launch({
            executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
 //           args: [`--proxy-server=pr.oxylabs.io:7777`],
            headless: false
        })

        page = await browser.newPage()
        
        await page.setViewport({
            width: 1920, 
            height: 1080 
        });
        
        await page.goto(url, {waitUntil: "networkidle2"});
        
        page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i){
                console.log(`REM ${i}: ${msg.args()[i]}`);
            }
        });

        await findShadowButtonByTextAndClick(page, "Reject non-essential")

        await scrollAndExpand(page)

        await expandAllMessages(page)

        await sleep(100000)

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

await fetchRedditThread("https://www.reddit.com/r/philadelphia/comments/okjb68/who_is_your_favorite_dj_in_philly_and_why/")