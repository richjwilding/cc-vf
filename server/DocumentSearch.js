import { encode } from "gpt-3-encoder";
import { getDocumentAsPlainText } from "./google_helper";
import Category from "./model/Category";
import ContentEmbedding from "./model/ContentEmbedding";
import { buildEmbeddings } from "./openai_helper";
import nlp from "compromise/three";
import { PorterStemmer } from "natural";
import { executeConcurrently } from "./SharedFunctions";


export async function retrieveDocumentFromSearchCache( primitiveId){
    const fragments = await ContentEmbedding.find({foreignId: primitiveId },{foreignId:1, part:1, text: 1})
    if( fragments.length > 0 ){
        const text = fragments.sort((a,b)=>a.part - b.part).map(d=>d.text).join("\n")
        return text
    }
    return undefined

}
export async function indexDocument( primitive, {force, fetch} = {}, req){
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
        if( primitiveCategory && !primitiveCategory.ai?.process?.contextAsContent){
            const field = Object.keys(primitiveCategory.parameters ?? {}).find(d=>primitiveCategory.parameters[d].useAsContent)
            text = primitive.referenceParameters?.[field]
        }
        
        if( !text ){
            text = (await getDocumentAsPlainText( primitive.id, req, undefined, false, fetch ))?.plain
            //text = (await getDocumentAsPlainText( primitive.id, req ))?.plain
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

export async function buildDocumentTextEmbeddings( text, limit ){
    if( !text || text.length === 0){
        return
    }
    const keywords = extractSentencesAndKeywords(text.replace(/[\s\t\n]+/g, ' '));
    const groupedSentences = groupNeighboringSentences(keywords);
    let final = combineGroupsToChunks(groupedSentences)
    let truncating = false

    if( limit && limit < final.length){
        console.log(`Will limit embeddings to first ${limit} of ${final.length}`)
        final = final.slice(0, limit)
        truncating = true
    }
    if( final.length > 900){
        console.log(`WARNING: limit embeddings to first 1500 sections of document`)
        final = final.slice(0, 900)
    }
    

    console.log(`Processing as ${final.length} (from ${groupedSentences.length})`)
    
    let part = 0
    async function encode(segment, part){
        segment = segment.trim()
        if( segment.length > 0 ){
            const response = await buildEmbeddings( segment)
            console.log(`-- part ${part} back`)
            if( response?.success){
                return { part: part, segment: segment, embeddings: response.embeddings}
            }  
            return undefined
        }
    }
    let {results, _} = await executeConcurrently( final, encode, undefined, undefined, 10)
    results = results.filter(d=>d)

    console.log(`< Embeddings done`)
    if( limit !== undefined ){
        return {truncated: truncating, results: results}        
    }
    return results
}
export function combineGroupsToChunks(groups, maxWords = 120) {
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

function __extractSentencesAndKeywords(text) {
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

export function extractSentencesAndKeywords(text) {
    const processChunk = (chunk) => {
        //console.log(`doing chunk ${chunk.length} / ${chunk.slice(0,50)}..`)
        let doc = nlp(chunk);
        let sentences = doc.sentences().out('array');
        let keywords = sentences.map(sentence => {
        let tempDoc = nlp(sentence);
        return {
            sentence: sentence,
            nouns: tempDoc.nouns().out('array').map(noun => {
            noun = noun.toLowerCase();
            const cleaned = noun
                .replace(/^\s*(\d+\.)+\s*(?=\w)/g, '')
                .replace(/\b(the|a|an)\b\s*/gi, '');
            return [cleaned, noun, PorterStemmer.stem(noun), PorterStemmer.stem(cleaned)];
            }).flat(),
            verbs: tempDoc.verbs().out('array').map(verb => [verb.toLowerCase(), PorterStemmer.stem(verb.toLowerCase())]).flat()
        };
        });
        return keywords;
    };
    
    // Function to split the text into smaller chunks
    const chunkText = (text, chunkSize = 10000) => {
        let chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    };
  
  // Main function to extract sentences and keywords from large text
    let chunks = chunkText(text);
    let results = [];
    chunks.forEach(chunk => {
      let chunkResult = processChunk(chunk);
      results = results.concat(chunkResult);
    });
    return results;
  }
export function groupNeighboringSentences(keywords) {
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
    const fragCheck = new Set()

    console.log({
        searchTerms, scanRatio, prompts: prompts.length
    })

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
                    const h = `${d.foreignId}-${d.part}`
                    if( !fragCheck.has(h)){
                        fragments.push( {id: d.foreignId, part: d.part, text: d.text, score: d.score} )
                        fragCheck.add(h)
                    }
                }
            }
        }
        return fragments
    }
    console.log(`DOING LOOKUP`)
    let {results: allFragments, _} = await executeConcurrently( prompts, process )
    console.log(`BACK`)
    
    allFragments = allFragments.flat()
    allFragments = allFragments.filter((d,i,a) => 
        a.findIndex(d2 => d2.id===d.id && d2.part===d.part) === i
    );
    console.log(`have ${allFragments.length} deduped fragments`)
    
    //allFragments = allFragments.filter((d,i,a)=>a.findIndex(d2=>d2.id === d.id && d2.part === d.part)===i).sort((a,b)=>b.score - a.score)
    return sortFragments( allFragments )
}
export function sortFragments( allFragments ){

    const maxScoreById = allFragments.reduce((map, {id, score}) => {
    map[id] = Math.max(map[id] || -Infinity, score ?? 0);
    return map;
    }, {});

    allFragments.sort((a, b) => {
        if (a.id !== b.id) {
            return maxScoreById[b.id] - maxScoreById[a.id];
        }
        return a.part - b.part;
    });
    
    return allFragments

}

export async function expandFragmentsForContext( allFragments, windowSize = 1 ){
    const existingById = allFragments.reduce((map, { id, part }) => {
        if (!map[id]) map[id] = new Set();
        map[id].add(part);
        return map;
      }, {});
      
      const contextQueries = Object.entries(existingById).map(([id, partsSet]) => {
        const want = new Set();
        for (let part of partsSet) {
            for (let offset = -windowSize; offset <= windowSize; offset++) {
                if (offset === 0) continue;
                const ctxPart = part + offset;
                // only positive parts, and not already present
                if (ctxPart > 0 && !partsSet.has(ctxPart)) {
                  want.add(ctxPart);
                }
            }
        }
        // only build a query clause if there are missing parts
        if (want.size) {
          return {
            foreignId: id,
            part: { $in: Array.from(want) }
          };
        }
        return null;
      }).filter(Boolean);
      if( contextQueries.length === 0 ){
        return allFragments
      }
      
      // 3) Fire one query to grab all the missing context fragments
     const missingFragments = await ContentEmbedding.aggregate([
        { 
            $match: { $or: contextQueries } 
        },
        { 
            $project: {
            _id:   0,
            id:    "$foreignId",           // <-- alias here
            text:  1,
            part:  1,
            }
        }
        ]);

      // 4) (Optional) merge them back in and re‐sort if needed
      const allWithContext = [
        ...allFragments,
        ...missingFragments
      ]
      console.log(`Pulled ${missingFragments.length} extra parts for context - now ${allWithContext.length}`);

      return sortFragments( allWithContext )
      
}