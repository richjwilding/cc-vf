import { encode } from "gpt-3-encoder";
import { getDocumentAsPlainText } from "./google_helper";
import Category from "./model/Category";
import ContentEmbedding from "./model/ContentEmbedding";
import { buildEmbeddings } from "./openai_helper";
import nlp from "compromise/three";
import { PorterStemmer } from "natural";
import { executeConcurrently } from "./SharedFunctions";

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
    /*
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
    }).flat(Infinity)*/

    const keywords = extractSentencesAndKeywords(text.replace(/[\s\t\n]+/g, ' '));
    const groupedSentences = groupNeighboringSentences(keywords);
    const final = combineGroupsToChunks(groupedSentences)
    

    console.log(`Processing as ${final.length} (from ${groupedSentences.length})`)
    
    let part = 0
    async function encode(segment, part){
        segment = segment.trim()
        if( segment.length > 0 ){
            console.log(`-- part ${part}`)
            const response = await buildEmbeddings( segment)
            if( response.success){
                return { part: part, segment: segment, embeddings: response.embeddings}
            }  
            return undefined
        }
    }
    let {results, _} = await executeConcurrently( final, encode, undefined, undefined, 10)
    results = results.filter(d=>d)
    return results
}
function combineGroupsToChunks(groups, maxWords = 120) {
    let chunks = [];
    let currentChunk = [];
    let currentWordCount = 0;

    groups.forEach(group => {
        let groupWords = group.join(' ').split(/\s+/).length; // Count words in the current group
        if (currentWordCount + groupWords > maxWords) {
            // If adding this group would exceed the max word count, start a new chunk
            chunks.push(currentChunk.join(' '));
            currentChunk = [];  // Reset the current chunk
            currentWordCount = 0;  // Reset the word count
        }
        // Add the group to the current chunk
        currentChunk = currentChunk.concat(group);
        currentWordCount += groupWords;
    });

    // Don't forget to add the last chunk if it's not empty
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
    }

    return chunks;
}

function extractSentencesAndKeywords(text) {
    let doc = nlp(text);
    let sentences = doc.sentences().out('array');
    let keywords = sentences.map(sentence => {
        let tempDoc = nlp(sentence);
        return {
            sentence: sentence,
           // nouns: tempDoc.nouns().out('array').map(noun => noun.toLowerCase()),
           // verbs: tempDoc.verbs().out('array').map(verb => verb.toLowerCase())
            nouns: tempDoc.nouns().out('array').map(noun => {
                noun = noun.toLowerCase()
                const cleaned = noun
                                .replace(/^\s*(\d+\.)+\s*(?=\w)/g, '')
                                .replace(/\b(the|a|an)\b\s*/gi, '') 
                return [cleaned, noun, PorterStemmer.stem(noun), PorterStemmer.stem(cleaned)]
            }).flat(),
            verbs: tempDoc.verbs().out('array').map(verb => [verb.toLowerCase(), PorterStemmer.stem(verb.toLowerCase())]).flat()
        };
    });
    return keywords;
}
function groupNeighboringSentences(keywords) {
    let groups = [];
    let currentGroup = [keywords[0]];

    for (let i = 1; i < keywords.length; i++) {
        const current = keywords[i];
        let matched = false;  // Flag to check if current sentence matches with any in the group

        // Compare current sentence with all in the current group for common nouns or verbs
        for (let j = 0; j < currentGroup.length; j++) {
            const groupItem = currentGroup[j];
            const commonNouns = current.nouns.filter(noun => groupItem.nouns.includes(noun));
            const commonVerbs = current.verbs.filter(verb => groupItem.verbs.includes(verb));
            if (commonNouns.length > 0 || commonVerbs.length > 0) {
                currentGroup.push(current);
                matched = true;
                break;  // No need to check further if already matched
            }
        }

        // If no match found, start a new group
        if (!matched) {
            groups.push(currentGroup.map(item => item.sentence));  // Save the current group
            currentGroup = [current];  // Start a new group
        }
    }

    // Don't forget to add the last group
    if (currentGroup.length > 0) {
        groups.push(currentGroup.map(item => item.sentence));
    }

    return groups
}

export async function storeDocumentEmbeddings( primitive, embedded ){
    async function store({part, segment, embeddings}){
        try{
                console.log(`Storing ${part} for ${primitive.id}`)
                await ContentEmbedding.findOneAndUpdate({
                    part: part,
                    foreignId: primitive.id,
                    workspaceId: primitive.workspaceId,
                    text: segment
                },{
                    embeddings: embeddings
                },{upsert: true, new: true})
        }catch(error){
            console.log("Error in storeDocumentEmbeddings")
            console.log(error)
        }
    }
    await executeConcurrently( embedded, store, undefined, undefined, 10)
}
export async function fetchFragmentsForTerm(prompts, {serachScope = undefined, searchTerms = 1000, scanRatio = 0.15, threshold_seek = 0.005, threshold_min = 0.85}){
    prompts = [prompts].flat()

    async function process(prompt){
        let fragments = []
        const emb = await buildEmbeddings( prompt )
        if( emb.success ){
            let matches = await ContentEmbedding.aggregate([
                {"$vectorSearch": {
                    "queryVector": emb.embeddings,
                    "path": "embeddings",
                    "filter": serachScope ? {$and: serachScope} : undefined,
                    "numCandidates": Math.min(searchTerms * 15, 10000),
                    "limit": searchTerms,
                    "index": "content_index",
                    }
                },
                {
                    "$project": {
                        "_id": 0,
                        "foreignId": 1,
                        "text": 1,
                        "part": 1,
                        "score": { $meta: "vectorSearchScore" }
                    }
                }
            ])
            const totalMatches = matches.length
            console.log(`-- got ${totalMatches} matches`)

            if( totalMatches > 0){
                let threshold = 1
                const targetMatches = totalMatches * scanRatio
                let amount
                do{
                    threshold -= threshold_seek
                    amount = matches.reduce((a,c)=>a + (c.score > threshold ? 1 : 0),0)
                }while( threshold > threshold_min && amount < targetMatches )

                
                matches = matches.filter(d=>d.score > threshold).sort((a,b)=>b.score - a.score)
                console.log(`-- got ${matches.length} matches`)
                for( const d of matches){
                    fragments.push( {id: d.foreignId, part: d.part, text: d.text, score: d.score} )
                }
            }
        }
        return fragments
    }
    let {results: allFragments, _} = await executeConcurrently( prompts, process )
    
    allFragments = allFragments.flat()
    console.log(`have ${allFragments.length} fragments`)
    allFragments = allFragments.filter((d,i,a)=>a.findIndex(d2=>d2.id === d.id)===i).sort((a,b)=>b.score - a.score)
    
    return allFragments

}