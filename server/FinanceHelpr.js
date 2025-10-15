import yahooFinance from "yahoo-finance2"
import Primitive from "./model/Primitive";
import { SIO } from "./socket";
import { dispatchControlUpdate } from "./SharedFunctions";
import { fecthUSDFXRate } from "./google_helper";
import moment from "moment";
import { compareTwoStrings } from "./actions/SharedTransforms";


let fxRateCache = {}

export async function fetchFinancialData( symbol, attempts = 3 ){
    if( !symbol){
        return
    }
    //const queryOptions = { modules: ['summaryDetail','financialData', 'incomeStatementHistory'] }; // defaults
    let result
    try{
      //  result = await yahooFinance.quoteSummary(symbol, queryOptions, { validateResult: false });
        let endDate = moment()
        let startDate = moment().subtract(1, "Q")
        result = await yahooFinance.chart( symbol, {period1: startDate.toDate(), period2: endDate.toDate()} )
    }catch(error){
        console.log(`Error on fetch - attempts remaining ${3}`)
        console.log(error)
        if (error instanceof yahooFinance.errors.HTTPError) {
            // Probably you just want to log and skip these
            if( attempts > 0){
                await new Promise(r => setTimeout(r, 500 ));                    
                result = await fetchFinancialData( symbol, attempts - 1)
            }else{
                return undefined
            }
        }
        return undefined
    }
    return result
}
export async function lookupTicker( primitive, fuzzy = false ){
    let ticker
    let query
    let update
    const queryOptions = {
        newsCount: 0,
        enableFuzzyQuery: false,	
        enableCb:false,
        enableNavLinks:false,
    }
    async function doLookup(query){
        console.log(`Looking for stock = ${query}` )
        const lookup = await yahooFinance.search(query, queryOptions );
        if( lookup && lookup.quotes){
            const scored = lookup.quotes.map(d=>{
                return [d,Math.max(compareTwoStrings(d.shortname ?? "", primitive.title),compareTwoStrings(d.longname ?? "", primitive.title))]
            }).sort((a,b)=>b[1]-a[1])
            const winner = scored[0]?.[0]
            ticker = winner?.symbol
            if( ticker ){
                update = true
                dispatchControlUpdate(primitive.id, `referenceParameters.stock_symbol`, ticker)
                console.log(`NEW TICKER - ${ticker}`)
            }
        }
        return ticker
    }

    if( primitive.referenceParameters?.stock_symbol ){
        ticker = await doLookup( primitive.referenceParameters?.stock_symbol )
    }
    if( !ticker ){
        ticker = await doLookup( primitive.title )
    }
    if( !ticker ){
        ticker = await doLookup( primitive.title, true )
    }


    return ticker
}

export async function getFxRate(currency){
    let fxRate = fxRateCache[currency]

    if( fxRate && moment().subtract(fxRate.expiry, "s").format("X") < 0 ){
        console.log(`===> FX from cache ${currency}`)
    }else{
        console.log(`===> GETTING FX ${currency}`)
        fxRate = {
            expiry: moment().add( 1000 * 60 * 60).format("X"),
            rate: await fecthUSDFXRate( currency )
        }
        fxRateCache[currency] = fxRate
    }
    return fxRate.rate
}

