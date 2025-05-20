import puppeteer from "puppeteer-core";
import { fetchViaBrightDataProxy, triggerBrightDataCollection } from "../brightdata";
import { fetchAsTextViaProxy } from "../google_helper";
import moment from "moment";
import { getLogger } from "../logger";

const logger = getLogger('scaper_moneysavingexpert', "debug"); // Debug level for moduleA

export async function queryMoneySavingExpertForums(primitive, terms, options) {
    logger.info(`Starting SERP`)
    const serpResults = await fetchMoneySavingExpertSearchResults(terms, {maxPage: 15, ...options})
    logger.info(`SERP got ${serpResults.length}`)
    console.log(serpResults.map(d=>d.url))

    const input = serpResults.map(d=>({
        url: d.url,
        max_comments: 50
     }))

    await triggerBrightDataCollection(input, "mse_post", primitive, terms,options)
}

export async function fetchMoneySavingExpertSearchResults(terms, options) {
    let count = 0, page 
    const links = []
    const individualTerms = terms.split(",")
    for( const term of individualTerms){
        logger.info(`Looking up ${term} page ${page} current ${links.length}`)
        if(options.countPerTerm){
            logger.debug(`Reset count to 0 for next term`)
            count = 0
        }
        let exit
        page = 1
        while(true){
            const thisResult = await moneySavingExpertSERP({
                query: term,
                page,
            })
            if( thisResult ){
                links.push(...thisResult.items)

                if (!thisResult.hasNext) break;

                if (options.count !== undefined && links.length >= options.count) {
                  break;
                }
              
                if (options.maxPage !== undefined && page >= options.maxPage) {
                  break;
                }
              
                page++;

            }
        }
    }
    return links
}
export async function moneySavingExpertSERP({query, page, startDate, endDate}, retries = 3) {
    const cleanedQuery = query && query.trim()
    if( cleanedQuery.length === 0){
        return
    }

    const base = "https://forums.moneysavingexpert.com/search?"
    const params = {
        domain: "all_content",
        scope:"site",
        query,
        source:"community"
    }
    if( page && page > 1){
        params.page = page
    }
    if( startDate){
        params.startDate = moment(startDate).format("YYYY-MM-DD")
    }else{
        params.startDate = moment().subtract(2,"year").format("YYYY-MM-DD")

    }
    if( endDate){
        params.endDate = moment(endDate).format("YYYY-MM-DD")
    }

    const url = base + new URLSearchParams(params).toString()


    const browserWSEndpoint = process.env.BRIGHTDATA_SCRAPER_PUPPETEER
    const browser = await puppeteer.connect({ browserWSEndpoint });
    try {
        console.log(`Connected! Navigating to ${url}...`);
        const page = await browser.newPage();
        const client = await page.target().createCDPSession();
        await page.goto(url, { timeout: 2 * 60 * 1000 });

        await client.send('Runtime.enable');
        await client.send('DOM.enable');
        await client.send('Log.enable'); 

        const {status} = await client.send('Captcha.solve', {detectTimeout: 30*1000});   
        console.log(`Captcha solve status: ${status}`) 
        if( status === "not_detected" || status == "solve_finished"){
              await page.waitForSelector('.pageBoxNoCompat', { timeout: 30000 });

              const items = (await page.evaluate(() => {
                console.log(`Helo from remote`)
                return Array.from(document.querySelectorAll('li.pageBoxNoCompat')).map(box => {
                  const h = box.querySelector('.heading');

                  const details = Array.from(box.querySelectorAll('.css-x4mrtf-ListItem-styles-metasContainer > div')).map(d=>d?.textContent ?? "")
                  if( details[0] == "Closed"){
                    details.shift()
                  }
                  const type = details[0].split(" ")[0]
                  if( type === "Comment"){
                   // return
                  }

                  return {
                    title: h?.textContent.trim() || '',
                    url:   h?.querySelector('a')?.href    || '',
                    user: details[0].replace(/^\S+ by /,""),
                    date:     details[1],
                    category: details[2],
                    other:    details[3],
                    snippet:  box.querySelector('.css-1oxjacp-ListItem-styles-description')?.textContent.trim() || ''
                  };
                });
              })).filter(d=>d);
              const hasNext = await page.evaluate(() => {
                return Array.from(
                  document.querySelectorAll('.css-13606vl-simplePager > button')
                ).some(btn => btn.textContent.trim() === 'Next');
              });
              console.log('Has Next?', hasNext);
              console.log(items, hasNext)
              return {
                hasNext,
                items
              }
              
        }
    }catch(e){
        logger.warn(`Error fetching SERP ${retries}`)
        if( retries > 0){
            return await moneySavingExpertSERP({query, page, startDate, endDate}, retries - 1)
        }
    } finally {
        await browser.close();
    }
    return {}


}