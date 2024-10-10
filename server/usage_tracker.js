export async function recordUsage(options = {}){
    try{

        let {
            workspace = "uWorkspace", 
            functionName = "uFunction", 
            usageId = "uId",
            api = "Unknown", 
            data = {} } = options
            
            if( api === "open_ai" && data?.usage){
                const id = data.id
                const prompt_tokens = data.usage.prompt_tokens
                const completion_tokens = data.usage.completion_tokens
                const model = data.model
                const trackId = `${workspace}-${functionName}-${usageId}`
                addToAIBuffer( trackId, {
                    workspace,
                    usageId,
                    functionName,
                    prompt_tokens,
                    completion_tokens,
                    total: prompt_tokens + completion_tokens,
                    model,
                    api
                })
                //console.log(`Workspace ${workspace} called ${functionName} (${id}) used ${prompt_tokens} + ${completion_tokens} = ${prompt_tokens + completion_tokens} on ${model}`)
            }
    }catch(e){
        console.log(`Failed to recordUsage`, options)
        console.log(e)
    }
}

let aiBufferSet = [{}, {}]
let activeAIBuffer =0

setInterval(()=>{
    const currentBuffer = activeAIBuffer
    const aiBuffer = aiBufferSet[activeAIBuffer]
    activeAIBuffer = 1 - activeAIBuffer

    for(const tId of Object.keys(aiBuffer)){
        for(const mk of Object.keys(aiBuffer[tId])){
            const item = aiBuffer[tId][mk]
            console.log(`       ${tId} (${mk}) used ${item.prompt_tokens} + ${item.completion_tokens} = ${item.total}`)
            console.log(item)
            delete aiBuffer[tId][mk]
        }
        delete aiBuffer[tId]
    }
}, 15000)


function addToAIBuffer( trackId, data ){
    const aiBuffer = aiBufferSet[activeAIBuffer]
    let mk = `${data.api}-${data.model}`
    aiBuffer[trackId] ||= {}
    aiBuffer[trackId][mk] ||= {
        mk, 
        prompt_tokens: 0, 
        completion_tokens: 0, 
        total: 0,
        workspace: data.workspace,
        function: data.functionName,
        usageId: data.usageId
    }
    aiBuffer[trackId][mk].prompt_tokens += data.prompt_tokens
    aiBuffer[trackId][mk].completion_tokens += data.completion_tokens
    aiBuffer[trackId][mk].total += data.total
}