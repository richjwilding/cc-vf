import yahooFinance from "yahoo-finance2"
import Primitive from "./model/Primitive";
import { SIO } from "./socket";
import { dispatchControlUpdate } from "./SharedFunctions";

export async function fetchFinancialData( symbol, attempts = 3 ){
    if( !symbol){
        return
    }
    const queryOptions = { modules: ['summaryDetail','financialData', 'incomeStatementHistory'] }; // defaults
    let result
    try{
        result = await yahooFinance.quoteSummary(symbol, queryOptions, { validateResult: false });
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
export async function lookupTicker( primitive ){
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
            ticker = lookup.quotes.find(d=>d.shortname.toLowerCase().match(primitive.title.toLowerCase()))?.symbol
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


    return ticker
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

    const currency = data.summaryDetail?.currency
    
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
    const signals = {
        cash,
        marketCap,
        currency,
        fiftyDayAverage,
        previousClose,
        below_1: previousClose < 1,
        below_5: previousClose < 5,
        below_cash: marketCap < cash,
        below_400_100: marketCap < 400000000 && cash >= 100000000,
        revenue_qoq_decline: quaterlyIncome?.map(d=>d.totalRevenue).map((d,i,a)=>a[i+1] ? d - a[i+1] :0).reduce((a,c)=>a+c,0) < 0,
        preincome_qoq_decline: quaterlyIncome?.map(d=>d.netIncome).map((d,i,a)=>a[i+1] ? d - a[i+1] :0).reduce((a,c)=>a+c,0) < 0
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
            
    SIO.notifyPrimitiveEvent(primitive.id, fields.flat())
    }catch(error){
        console.log(`Error computeFinanceSignals`)
        console.log(error)
    }

}