import { modiftyEntries } from "./actions/SharedTransforms"
import { processPromptOnText } from "./openai_helper"

export function fieldListToPromptOutput( list ){
    function unpackList(list){

    }

}

export async function assessContextForPrompt( request, options = {}){
    const opener = `here is a task i am going to give to an ai:

                    <task>`.replaceAll(/\s+/g," ")
    const prompt = `</task>

                    I want you to undertake the following :
                    1) I am going to search an embeddings store for relevant fragments of information to help answer this task. Assess if the tasks' preamble specifies and constraints to the target of the query (ie specific companies, regions, products, users, and similar) that i should use as a context filter when fetching suitable documents . 
                        a) Only look for things where the task says "focus on" or "specifically" etc - do not include the broader task and output request in this assessment. 
                        b) IF the task is asking for a comparison to another thing (company, product, person etc) that the fragments do not need to mention that specific thing explictly - mention of defined properties, characterictics, features etc is sufficient. In such a case provide enough context from the original prompt in your answer so taht the AI can make an informed the comaprison and DO NOT mention the name of the thing.
                    2) assess any requested output formats, constraints, or length 
                    `.replaceAll(/\s+/g," ")
    
        const output =   `Analyze the task and provide your output in a field called "context" with the following structure:
                    {
                        context_filter:[a nested object containing the context filter with keys being the type of constraints and the values being the constraint variants as an array of strings]
                        context_prompt: [this field should be a 100 word summary of the context filter i can give to an AI to have it evaluate the suitability of a document i give it starting with "Assess if the document specifically...." ] 
                        length: [the desired length of the output]
                        format. [the requested output format, if specified]
                    }
                    Use only the information in the task`.replaceAll(/\s+/g," ")
    
    const result = await processPromptOnText( request, {
            opener,
            prompt,
            output,
            engine: options.engine ?? "gpt4o",
            field: "context",
            debug:true,
            debug_content: true
        })
    return result?.output?.[0]
}

export async function reviseUserRequest( request, options = {} ){

    /*const prompt = `I am preparing a task to send to an ai, i don't want you to answer it - instead i want you to define a json structure for the output based on this request honouring any format that is specified in the task.   Focus only on the core outputs requested by the task and factor in any requests for content length and formatting for a specific section or the overall response - for example, if a section needs to have both a summary and a list then your output structure for that section should have 2 subsections defined - one for the summary and one for the list.  

Each section of the of the output should be an element of an array. If a section contain multiple parts then encapsulate these in a nested array. You do not need to decompose the rows or cells of tables into subsections - just use the description.  Use nested subsections where necessary to fulfil the requests

                    Each section of the structure must have one of the following formats

                    If the section has subsections:
                    {
                        heading: a short heading that can be used when formatting the response (if this element is top level section - otherwise omit this field), 
                        content: If the user has requested a title for this section, then an instruction to the AI on how to generate a title (and then omit the title from following subsections), otherwise omit this field. Do not repease the heading field in this field
                        subsections: an array containing any the subsections 
                    } 

                    If the section does not have any subsections:
                    {
                        heading: if the content of the subsection is about a different topic (ie not just a formatting change such as a list vs summary), then include a short heading that can be used when formatting the response, otherwise omit this field (also omit this field if this is the  top level section of the response),
                        content: the description of what will be placed in the field by the AI included specific length or formatting instructions aligned to requests in the task if present - or your view of best practice if requests are not present. Do not repease the heading field in this field
                        type: what format the content should be (one of markdown formatted bullet list, markdown formatted string, number, boolean, markdown formatted table),
                    } 

                    Favour concise summaries with the minimal number of sections and subsections to deliver on the requested task
                    Take note of any instructions from the user about what constitutes a single part of your answer and / or what to group , and ensure the structure aligns to it by nesting items where appropriate 

                    Do not mention the type of formatting requested in the content fields (ie do not say "Here is the markdown formatted response" or similar)
                   

                    Here is the future task::`.replaceAll(/\s+/g," ")*/

    const placeholders = request.match(/\{[^}]+\}/g) 

    const prompt = `
                    You are *only* to output a JSON schema describing how to structure the answer to the following task. 
                    Do **not** answer the task itself, and do **not** output any plain text, headings or explanation—your entire response must be valid JSON (a single array).
                    
                    #### Schema specification:
                    
                    Each element of the top-level array is a Section object with exactly these keys:

                    • "heading": string  
                    A human-readable title for this section (what will actually be printed).

                    Then **either**:

                    1. **Container section**  
                    • "subsections": [ Section, Section, … ]  
                        An array of nested Section objects.

                    2. **Leaf section**  
                    • "content": string  
                        Instructions for the AI on what format of markdown string to generate here (include any length or formatting rules).  
                    • "type": "bullet list as markdown formatted string" | "markdown formatted string" | "table as markdown formatted string" | "number" | "boolean"  
                    
                    Do **not** include any other keys.  

                    Favour concise summaries with the minimal number of sections and subsections to deliver on the requested task
                    Take note of any instructions from the user about what constitutes a single part of your answer and / or what to group , and ensure the structure aligns to it by nesting items where appropriate 

                    Do not mention the type of formatting requested in the content fields (ie do not say "Here is the markdown formatted response" or similar)
                    
                    Here is an exmaple
                    [
                        {
                            "heading": "Summarize the report’s main insights",
                            "subsections": [
                            {
                                "heading": "High-Level Summary",
                                "content": "Write a 2–3 sentence overview of the report’s key findings.",
                                "type": "string"
                            },
                            {
                                "heading": "Detailed Themes",
                                "content": "Provide a bullet list in a markdown formatted string of the top recurring themes, each with a 1–2 sentence explanation.",
                                "type": "markdown formatted bullet_list"
                            }
                            ]
                        },
                        {
                            "heading": "Overall Recommendation Score",
                            "content": "Give a number from 1–10 indicating how strongly you endorse the recommendations.",
                            "type": "number"
                        }
                    ]
                    ${placeholders ? `Note that ${placeholders.join(", ")} are placeholders that will be filled in later - do not constrain the structure based on those terms` : ""}
                    Do not include any sections about word count or format compliance
                    Here is the user’s task:
                    `.replaceAll(/\s+/g," ")


    const prompt2 = `I am preparing a task to send to an ai, i don't want you to answer it - instead i want you to update the task to remove any mention of the output format or sturcture - i will be appending an updated format myself.  
                    The update task should include all aspects of the original task with the output format removed.                
                    ${options.expansive ? "Augment the query to fetch additional relevant context and information to give the user a rich answer" : ""}
                    ${placeholders ? `Note that ${placeholders.join(", ")} are placeholders that will be filled in later - do not define the tasks based on those terms` : ""}
                    Do not include any sections about word count or format compliance
                    Here is the future task:`.replaceAll(/\s+/g," ")

    const structurePromise = processPromptOnText( request, {
        opener: prompt,
        prompt: "End of future task",
        engine: options.engine ?? "gpt4o",
        wholeResponse: true,
        debug:true,
        output: "Return just the json structure in the following format: {structure: [array of section objects]}",
        debug_content: true
    })


    const taskPromise = processPromptOnText( request, {
        opener: prompt2,
        prompt: "End of future task",
        wholeResponse: true,
        engine: options.engine ?? "gpt4o",
        output: "Provide your output in a json object with a field called 'task' containing the updated task as a string.",
        debug:true,
        debug_content: true
    })

    const [structureResult, taskResult] = await Promise.all([structurePromise, taskPromise]);

    let structure
    if( structureResult?.output?.[0]){
        structure = structureResult.output[0]
    }
    
    modiftyEntries(structure, "content", (d)=>{
        // Force reorder of schema
        //const content = d.content
        //delete d["content"]
        return `${d.content}. Note that fragment IDs must not referenced / included in this field. If there is no relevant infromation in the data provided simply return "No relevant data" - you MUST NOT use your own knowledge`
    })
    augmentEntries(structure, "content", "ids", options.id_limit ? `A json array containing the provided unique id numbers associated with up to ${options.id_limit} of the fragments of text used for this section - DO NOT INCLUDE MORE THAN ${options.id_limit}.` : "A json array containing the provided unique id numbers associated with each and every one of the input fragments which informed your response in the content field of this section (this includes contextual information as well as quotes / phrases / facts you have used). This IS A MUST - the task FAILS if a you miss any ids.")
    augmentEntries(structure, "content", "quote", "A json array containing verbatim quotes from the source data (aligned to the ids you have selected) which evidences what you have written. Limit this to 20 words per quote and 5 quotes")


    let task
    if( taskResult?.output?.[0]){
        task = taskResult.output[0].task
    }
    
    
    console.log(`TASK:\n\n`, task)
    if( structure.structure.length === 1){
        if(structure.structure[0].subsections?.length > 0){
            console.log("--- Structure has one section, unwrapping")
            structure.structure = structure.structure[0].subsections
        }
        
    }


    let output = "Provide your output in a JSON object with this structure:\n" + JSON.stringify(structure)
    console.log(`STRUCTURE:\n\n`, structure.structure)

    return {task: `### Task\n\n${task}`,
            structure: structure.structure,
            output
    }
}

export function parseOutputSchemaFromPrompt(output){
    if( typeof(output) !== "string" ){
        return
    }
    const start = output.indexOf("{")
    if( start === -1 ){
        return
    }
    try{
        const schema = JSON.parse(output.slice(start))
        const prefix = output.slice(0, start)
        return {prefix, schema}
    }catch(err){
        console.warn("Unable to parse structured output schema for subquery planning", err)
    }
}

export function shouldSplitIntoSubqueries(structure){
    if( !Array.isArray(structure) || structure.length < 2 ){
        return false
    }
    return structure.every(section => !section || !Array.isArray(section.subsections) || section.subsections.length === 0)
}

function cloneStructureSection(section){
    return JSON.parse(JSON.stringify(section))
}

async function rewriteTaskForSection(baseTask, heading, section, options = {}){
    if( !baseTask ){
        return undefined
    }
    const engine = options.engine ?? "gpt4o"
    const doubleWordcount = options.doubleWordcount ?? true
    const sectionJson = JSON.stringify(section ?? {}, null, 2)
    const requirements = [
        "- Preserve every piece of contextual framing, constraints, and tone from the original task.",
        "- Keep any placeholder tokens such as {example} exactly as they appear.",
        "- Remove or adjust references to other sections so the request is solely about this section.",
        doubleWordcount
            ? "- Maintain the same overall structure (including headings like \"### Task\") except where changes are needed to limit the scope, and double any explicit word-count or length constraints requested for this section so the model can provide richer content."
            : "- Maintain the same overall structure (including headings like \"### Task\") except where changes are needed to limit the scope, and keep any explicit word-count or length constraints unchanged." ,
        "- The rewritten task must still be a complete prompt ready to send to the model."
    ].join("\n")

    const promptLines = [
        `Rewrite the original task so it only requests the deliverable for the section titled "${heading}".`,
        "",
        "Requirements:",
        requirements,
        "",
        "Existing section schema (JSON) that defines the expected output for this section:",
        sectionJson
    ]

    if( doubleWordcount ){
        promptLines.push(
            "",
            "Update the schema so that any explicit word-count limits are doubled while preserving its shape, keys, and descriptive text. Only adjust numeric values (e.g. \"150 words\" becomes \"300 words\").",
            "If no explicit word-count limit exists, return the schema unchanged.",
            "Respond with a JSON object containing:",
            "- \"rewrite\": the full rewritten task string.",
            "- \"structure\": the updated section schema JSON object with doubled word-count limits.",
            "Do not include additional commentary or fields."
        )
    }else{
        promptLines.push(
            "",
            "Respond with a JSON object containing a field named \"rewrite\" whose value is the full rewritten task string. Do not include additional fields."
        )
    }

    try{
        const requestOptions = {
            opener: "You are rewriting a structured summarisation task prompt. Here is the original task:",
            prompt: promptLines.join("\n"),
            output: doubleWordcount
                ? 'Provide your answer as a JSON object with fields "rewrite" and "structure". Do not include any other keys or text.'
                : 'Return the rewritten task in a json object with a single field "rewrite" whose value is the full prompt string.',
            engine,
            keepLineBreaks: true
        }

        if( doubleWordcount ){
            requestOptions.wholeResponse = true
        }else{
            requestOptions.field = "rewrite"
        }

        const rewriteResult = await processPromptOnText([baseTask], requestOptions)
        if(rewriteResult?.success){
            const candidate = rewriteResult.output?.[0]
            if( doubleWordcount ){
                if(candidate && typeof candidate === "object" ){
                    const rewrite = typeof candidate.rewrite === "string" ? candidate.rewrite : undefined
                    const updatedStructure = candidate.structure
                    if( rewrite && rewrite.trim() ){
                        return {rewrite, structure: updatedStructure}
                    }
                }
                if(typeof candidate === "string" && candidate.trim()){
                    try{
                        const parsed = JSON.parse(candidate)
                        if(parsed?.rewrite){
                            return {rewrite: parsed.rewrite, structure: parsed.structure}
                        }
                    }catch(err){
                        // fallthrough to undefined
                    }
                }
            }else{
                if(typeof candidate === "string" && candidate.trim()){
                    return {rewrite: candidate}
                }
                if(candidate && typeof candidate.rewrite === "string" && candidate.rewrite.trim()){
                    return {rewrite: candidate.rewrite}
                }
            }
        }
    }catch(err){
        console.warn(`Failed to rewrite task for subquery section "${heading}"`, err)
    }
    return undefined
}

export async function buildStoredSubqueriesForRevised(revised, options = {}){
    if( !revised ){
        return undefined
    }
    if( !shouldSplitIntoSubqueries(revised.structure) ){
        return undefined
    }
    const schemaInfo = parseOutputSchemaFromPrompt(revised.output)
    if( !schemaInfo ){
        return undefined
    }
    const baseTask = revised.task
    const engine = options.engine ?? "gpt4o"
    const doubleWordcount = options.doubleWordcount ?? true
    const stored = []
    for(let index = 0; index < revised.structure.length; index++){
        const section = revised.structure[index]
        const heading = section?.heading ?? `Section ${index + 1}`
        const structureClone = cloneStructureSection(section)
        const rewriteOutcome = await rewriteTaskForSection(baseTask, heading, structureClone, {engine, doubleWordcount})
        let rewrittenTask
        let updatedStructure
        if( typeof rewriteOutcome === "string" ){
            rewrittenTask = rewriteOutcome
        }else if( rewriteOutcome ){
            rewrittenTask = typeof rewriteOutcome.rewrite === "string" ? rewriteOutcome.rewrite : undefined
            updatedStructure = rewriteOutcome.structure
        }

        if( typeof updatedStructure === "string" ){
            try{
                updatedStructure = JSON.parse(updatedStructure)
            }catch(err){
                updatedStructure = undefined
            }
        }

        if( updatedStructure && typeof updatedStructure === "object" ){
            updatedStructure = cloneStructureSection(updatedStructure)
        }else{
            updatedStructure = undefined
        }

        if( !rewrittenTask ){
            const focusInstruction = `\n\nFocus exclusively on fulfilling the section titled "${heading}". Do not generate any other sections.`
            rewrittenTask = `${baseTask}${focusInstruction}`
            if( doubleWordcount ){
                updatedStructure = updatedStructure ?? structureClone
            }
        }

        const structureForOutput = updatedStructure ?? structureClone
        const schemaClone = JSON.parse(JSON.stringify(schemaInfo.schema))
        schemaClone.structure = [structureForOutput]
        stored.push({
            index,
            heading,
            task: rewrittenTask,
            output: `${schemaInfo.prefix}${JSON.stringify(schemaClone)}`,
            structure: [structureForOutput]
        })
    }
    return stored
}

export async function buildRuntimeSubqueries(subqueries, substituteFn){
    if( !Array.isArray(subqueries) || subqueries.length === 0 ){
        return undefined
    }
    const runtime = []
    for(const sub of subqueries){
        const clone = JSON.parse(JSON.stringify(sub))
        if( typeof substituteFn === "function" ){
            clone.task = await substituteFn(clone.task)
            clone.output = await substituteFn(clone.output)
        }
        runtime.push(clone)
    }
    return runtime
}

export function findEntries(obj, entry, out = []) {
    // Check if the object has a 'heading' key and delete it
    if (obj.hasOwnProperty(entry)) {
        out.push(obj[entry]);
    }
    
    // Loop through each key-value pair in the object
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
        if (Array.isArray(obj[key])) {
            // If the value is an array, loop through its items
            obj[key].forEach(item => {
            if (typeof item === 'object') {
                findEntries(item, entry, out);
            }
            });
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            // If the value is an object, recurse into it
            findEntries(obj[key], entry, out);
        }
        }
    }
    return out
}

export function removeEntries(obj, entry) {
    // Check if the object has a 'heading' key and delete it
    if (obj.hasOwnProperty(entry)) {
        delete obj[entry];
    }
    
    // Loop through each key-value pair in the object
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
        if (Array.isArray(obj[key])) {
            // If the value is an array, loop through its items
            obj[key].forEach(item => {
            if (typeof item === 'object') {
                removeEntries(item, entry);
            }
            });
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            // If the value is an object, recurse into it
            removeEntries(obj[key], entry);
        }
        }
    }
 }
export function augmentEntries(obj, entry, newEntry, neewValue) {
    // Check if the object has a 'heading' key and delete it
    if (obj.hasOwnProperty(entry)) {
        obj[newEntry] = neewValue
    }
    
    // Loop through each key-value pair in the object
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
        if (Array.isArray(obj[key])) {
            // If the value is an array, loop through its items
            obj[key].forEach(item => {
            if (typeof item === 'object') {
                augmentEntries(item, entry, newEntry, neewValue);
            }
            });
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            // If the value is an object, recurse into it
            augmentEntries(obj[key], entry, newEntry, neewValue);
        }
        }
    }
 }
