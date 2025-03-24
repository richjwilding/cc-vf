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

    const prompt = `I am preparing a task to send to an ai, i don't want you to answer it - instead i want you to define a json structure for the output based on this request honouring any format that is specified in the task.   Focus only on the core outputs requested by the task and factor in any requests for content length and formatting for a specific section or the overall response - for example, if a section needs to have both a summary and a list then your output structure for that section should have 2 subsections defined - one for the summary and one for the list.  

Each section of the of the output should be an element of an array. If a section contain multiple parts then encapsulate these in a nested array. You do not need to decompose the rows or cells of tables into subsections - just use the description.  Use nested subsections where necessary to fulfil the requests

                    Each section of the structure must have one of the following formats

                    If the section has subsections:
                    {
                        heading: a short heading that can be used when formatting the response (if this element is top level section - otherwise omit this field), 
                        content: If the user has requested a title for this section, then an instruction to the AI on how to generate a title (and then omit the title from following subsections). Note that fragment IDs must not referenced / included in this field, otherwise omit this field
                        subsections: an array containing any the subsections 
                    } 

                    If the section does not have any subsections:
                    {
                        heading: a short heading that can be used when formatting the response (if this section is the top level section, or if the filed adds no additional value to the reader, then you should omit this field), 
                        content: the description of what will be placed in the field by the AI included specific length or formatting instructions aligned to requests in the task if present - or your view of best practice if requests are not present. Note that fragment IDs must not referenced / included in this field, 
                        type: what format the content should be (one of markdown formatted bullet list, markdown formatted string, number, boolean, markdown formatted table),
                    } 

                    Take note of any instructions from the user about what constitutes a single part of your answer and / or what to group , and ensure the structure aligns to it by nesting items where appropriate 
                   

                    Here is the future task::`.replaceAll(/\s+/g," ")

    const structureResult = await processPromptOnText( request, {
        opener: prompt,
        prompt: "End of future task",
        engine: options.engine ?? "gpt4o",
        wholeResponse: true,
        debug:true,
        output: "Return just the json structure in the following format: {structure: [array of section objects]}",
        debug_content: true
    })
    let structure
    if( structureResult?.output?.[0]){
        structure = structureResult.output[0]
    }
    augmentEntries(structure, "content", "ids", "List the numbers associated with all of the fragments of text used for this section.")
    console.log(structure)

    const prompt2 = `I am preparing a task to send to an ai, i don't want you to answer it - instead i want you to update the task to remove any mention of the output format or sturcture - i will be appending an updated format myself.  
                    The update task should include all aspects of the original task with the output format removed.                
                   
                    Here is the future task:`.replaceAll(/\s+/g," ")

    const taskResult = await processPromptOnText( request, {
        opener: prompt2,
        prompt: "End of future task",
        wholeResponse: true,
        engine: options.engine ?? "gpt4o",
        output: "Provide your output in a json object with a field called 'task' containing the updated task as a string.",
        debug:true,
        debug_content: true
    })
    console.log(taskResult)
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
    let output = "Provide your output in a JSON object with this structure:\n" + JSON.stringify(structure) + "\nYou must not include any fragemnt IDs in any of the content fields"
    console.log(`STRUCTURE:\n\n`, structure.structure)

    return {task: `### Task\n\n${task}`,
            structure: structure.structure,
            output:JSON.stringify(output)
    }
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
export function modiftyEntries(obj, entry, callback) {
    if( !callback ){
        return obj
    }
    // Check if the object has a 'heading' key and delete it
    if (obj.hasOwnProperty(entry)) {
        const result = callback( obj )
        obj[entry] = result
    }
    
    // Loop through each key-value pair in the object
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (Array.isArray(obj[key])) {
                // If the value is an array, loop through its items
                obj[key].forEach(item => {
                if (typeof item === 'object') {
                    modiftyEntries(item, entry, callback)
                }
                });
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                // If the value is an object, recurse into it
                modiftyEntries(obj[key], entry, callback)
            }
        }
    }
    return obj
 }