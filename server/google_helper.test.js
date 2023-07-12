import { getDocumentAsPlainText, locateQuote } from "./google_helper"
import * as dotenv from 'dotenv' 
import mongoose, { mongo } from 'mongoose';

dotenv.config()
beforeAll(async ()=>{
    mongoose.set('strictQuery', false);
    mongoose.connect(process.env.MONGOOSE_TEST_URL)
})


describe("quote_extract", () => {
    test('test 1', async () => {
        console.log(`Start`)
        //const quote = 'So, right. So, this one was actually batch processing in a way that we received files of data that had to adhere to a certain spec that was written.'
       // const quote = 'How does your company ensure the quality of data obtained from external data sources?'
       //const quote = `So again, that's a problem. I think that you can get better. You can get better, you will never solve it just because it's always going to be. I always say like if you have three people, you have four opinions, right? And it's the same with systems. You have three systems, you probably have four different types of representation of the same data and it doesn't just look right, for example.` 
       //const extract = await getDocumentAsPlainText( "64895e86d357c8325117fff5" )
       
       const quote = "DOE hasn't put a mandate here yet, but they see it coming down the pipeline"
       const extract = await getDocumentAsPlainText( "646cbdcec1ea2ce40fa4721b" )
        const result = locateQuote( quote, extract.data)
    
        console.log(result)
    
    }, 10000)
})
afterAll(async ()=>{
    await mongoose.disconnect()
})



