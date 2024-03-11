import { encode } from "gpt-3-encoder";
import { getDocumentAsPlainText } from "./google_helper";
import Category from "./model/Category";
import ContentEmbedding from "./model/ContentEmbedding";
import { buildEmbeddings } from "./openai_helper";

export async function indexDocument( primitive, {force} = {}){
    try{
        if( force ){
            await ContentEmbedding.deleteMany({
                foreignId: primitive.id,
                workspaceId: primitive.workspaceId
            })
            
        }else{
            const existing = await ContentEmbedding.findOne({
                foreignId: primitive.id,
                workspaceId: primitive.workspaceId
            }, {foreignId: 1})
            if( existing ){
                console.log("Already exists - skipping")
                return
            }
        }
        let text
        const primitiveCategory = await Category.findOne({id: primitive.referenceId})
        if( primitiveCategory ){
            const field = Object.keys(primitiveCategory.parameters ?? {}).find(d=>primitiveCategory.parameters[d].useAsContent)
            text = primitive.referenceParameters?.[field]
        }
        
        if( !text ){
            text = (await getDocumentAsPlainText( primitive.id ))?.plain
        }
        if( !text || text.length === 0){
            console.log(`Nothing to process`)
        }

        const embedded = await buildDocumentTextEmbeddings( text )
        await storeDocumentEmbeddings( primitive, embedded )
    }catch(error){
        console.log("Error in indexDocument")
        console.log(error)
    }
}

export async function buildDocumentTextEmbeddings( text ){
    if( !text || text.length === 0){
        return
    }
    text = text.replace(/\n+/g, '\n');
    text = text.replace(/ +/g, ' ');
    let paras = text.split("\n")
    const max = 2000

    console.log(`Got ${paras.length} paragraphs`)
    
    let segments = []
    const targetWordCount = 200
    let current = ""
    let cWords = 0
    for(const para of paras){
        const words = para.split(" ").length

        current += (cWords === 0 ? "" : "\n") + para 
        cWords += words

        if( cWords >= targetWordCount ){
            segments.push( current )
            current = ""
            cWords = 0
        }
    }
    if( cWords > 0 ){
        segments.push( current )
    }
    console.log(`Processing as ${segments.length}`)

    const checkAndSplitInTwo = ( text )=>{
        let thisTokens = encode( text ).length
        if( thisTokens > max ){
            const words = text.split(" ")
            const length = words.length
            let partA, partB
            if( length === 1){
                const half =  text.length / 2
                partA = text.slice(0, half)
                partB = text.slice(half)

            }else{
                const half =  length / 2
                partA = words.slice(0, half).join(" ")
                partB = words.slice(half).join(" ")
            }
            return [ checkAndSplitInTwo( partA ), checkAndSplitInTwo( partB ) ].flat(Infinity)
        }
        return text
    }

    segments = segments.map(segment=>{
        return checkAndSplitInTwo( segment )
    }).flat(Infinity)

    console.log(`Processing as ${segments.length}`)
    
    const out = []
    let part = 0
    for(let segment of segments){
        segment = segment.trim()
        if( segment.length > 0 ){
            console.log(`-- part ${part}`)
            const response = await buildEmbeddings( segment)
            if( response.success){
                out.push({ part: part, segment: segment, embeddings: response.embeddings})
            }  
            part++
        }
    }
    return out
}
export async function storeDocumentEmbeddings( primitive, embedded ){
    try{
        for( const {part, segment, embeddings} of embedded){
            console.log(`Storing ${part} for ${primitive.id}`)
            await ContentEmbedding.findOneAndUpdate({
                part: part,
                foreignId: primitive.id,
                workspaceId: primitive.workspaceId,
                text: segment
            },{
                embeddings: embeddings
            },{upsert: true, new: true})
        }    
    }catch(error){
        console.log("Error in storeDocumentEmbeddings")
        console.log(error)
    }
}