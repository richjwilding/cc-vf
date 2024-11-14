import yahooFinance from "yahoo-finance2"
import Primitive from "./model/Primitive";
import { SIO } from "./socket";
import { dispatchControlUpdate } from "./SharedFunctions";
import { compareTwoStrings } from "./document_queue";
import { fecthUSDFXRate } from "./google_helper";
import moment from "moment";


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
export async function computeFinanceSignals( primitive ){
    try{

        let ticker = primitive.referenceParameters?.stock_symbol
        
        if( !ticker ){
            ticker = await lookupTicker( primitive )
            if( !ticker ){
                return undefined
            }
        }

        let data = await fetchFinancialData( ticker )
        if( !data){
            const newTicker = await lookupTicker( primitive )
            if( newTicker && (newTicker !== ticker)){
                data = await fetchFinancialData( newTicker )   
            }

        }
        if( !data){return}

        const toKeep = data.quotes.map(d=>({
            date: d.date,
            low: d.low,
            high: d.high,
            close: d.close
        }))
        dispatchControlUpdate(primitive.id, "financialData.quote_history", toKeep)

    }catch(error){
        console.log(`Error computeFinanceSignals`)
        console.log(error)
    }
}


export async function computeFinanceSignalsOLD( primitive ){
    try{

    let ticker = primitive.referenceParameters?.stock_symbol
    
    if( !ticker ){
        ticker = await lookupTicker( primitive )
        if( !ticker ){
            return undefined
        }
    }

    let data = await fetchFinancialData( ticker )
    if( !data){
        const newTicker = await lookupTicker( primitive )
        if( newTicker && (newTicker !== ticker)){
            data = await fetchFinancialData( newTicker )   
        }

    }
    if( !data){return}

    const currency = data.summaryDetail?.currency


    let fxRate = await getFxRate( currency )
    
    const marketCap = data.summaryDetail?.marketCap
    const fiftyDayAverage = data.summaryDetail?.fiftyDayAverage
    const previousClose = data.summaryDetail?.previousClose
    const priceToSalesTrailing12Months = data.summaryDetail?.priceToSalesTrailing12Months
    const cash = data.financialData?.totalCash
    const revenue = data.financialData?.totalRevenue
    const quaterlyIncome = data.incomeStatementHistory?.incomeStatementHistory?.map(d=>({endDate: d.endDate, totalRevenue: d.totalRevenue, netIncome:d. netIncome}))

    const financialData = {
        date: new Date().toISOString(),
        currency,
        marketCap,
        fiftyDayAverage,
        previousClose,
        priceToSalesTrailing12Months,
        cash,
        revenue,
        quaterlyIncome
    }
    const usedFx = fxRate ?? 1
    const signals = {
        fxRate,
        usedFx,
        cash: cash ? cash / usedFx : undefined,
        marketCap: marketCap ? marketCap / usedFx : undefined,
        currency,
        fiftyDayAverage: fiftyDayAverage ? fiftyDayAverage / usedFx : undefined,
        previousClose: previousClose ? previousClose / usedFx : undefined,
        revenue: revenue ? revenue / usedFx : undefined,
       /* below_1: previousClose < 1,
        below_5: previousClose < 5,
        below_400_100: marketCap < 400000000 && cash >= 100000000,
        below_cash: marketCap < cash,
        revenue_qoq_decline: quaterlyIncome?.map(d=>d.totalRevenue).map((d,i,a)=>a[i+1] ? d - a[i+1] :0).reduce((a,c)=>a+c,0) < 0,
        preincome_qoq_decline: quaterlyIncome?.map(d=>d.netIncome).map((d,i,a)=>a[i+1] ? d - a[i+1] :0).reduce((a,c)=>a+c,0) < 0*/
    }

    console.log(financialData)
    console.log(signals)

    const updateList = {
        "financialData": financialData,
        ...Object.keys(signals).reduce((a,c)=>{a[`referenceParameters.${c}`] = signals[c]; return a},{})        
    } 

    const fields = [
        {
            type: "set_fields",
            primitiveId: primitive.id,
            fields:{"financialData": financialData}
        }
    ].concat( Object.keys(signals).map(d=>({
            type: "set_fields",
            primitiveId: primitive.id,
            fields:{[`referenceParameters.${d}`]: signals[d]}
    })) )

    await Primitive.findOneAndUpdate(
        {
            "_id": primitive.id,
        }, 
        {
            $set: updateList ,
        }
    )
            
    SIO.notifyPrimitiveEvent(primitive, fields.flat())
    }catch(error){
        console.log(`Error computeFinanceSignals`)
        console.log(error)
    }

}