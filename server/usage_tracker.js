import TrackUsage from "./model/TrackUsage"


const cost_map = {
    "open_ai":{
        "o3-2025-04-16":{
            "prompt_tokens": 2 / 1000000,
            "completion_tokens": 8 / 1000000
        },
        "o4-mini-2025-04-16":{
            "prompt_tokens": 1.1 / 1000000,
            "completion_tokens": 4.4 / 1000000
        },
        "o3-mini-2025-01-31":{
            "prompt_tokens": 1.1 / 1000000,
            "completion_tokens": 4.4 / 1000000
        },
        "gpt-4o-2024-08-06":{
            "prompt_tokens": 2.5 / 1000000,
            "completion_tokens": 10 / 1000000
        },
        "gpt-4o-mini-2024-07-18":{
            "prompt_tokens": 0.15 / 1000000,
            "completion_tokens": 0.6 / 1000000
        },
        "gpt-4.1-2025-04-14":{
            "prompt_tokens": 2 / 1000000,
            "completion_tokens": 8 / 1000000
        },
        "gpt-4.1-mini-2025-04-14":{
            "prompt_tokens": 0.4 / 1000000,
            "completion_tokens": 1.6 / 1000000
        }
    }
}

function getCost(provider, resource, unit, value){
    const multipler = cost_map[provider]?.[resource]?.[unit]
    if( !multipler){
        console.log(`---- USAGE ERROR - couldn't find cost for `, provider, resource, unit, value)
    }
    return value * multipler
}

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
    try{

        const currentBuffer = activeAIBuffer
        const aiBuffer = aiBufferSet[activeAIBuffer]
        activeAIBuffer = 1 - activeAIBuffer
        
        for(const tId of Object.keys(aiBuffer)){
            for(const mk of Object.keys(aiBuffer[tId])){
                const item = aiBuffer[tId][mk]
                console.log(`       ${tId} (${mk}) used ${item.prompt_tokens} + ${item.completion_tokens} = ${item.total}`)
                console.log(item)
                
                TrackUsage.create({
                    workspaceId: item.workspace,
                    usageId: tId,
                    resource: mk,
                    usage: item.total,
                    units: "tokens",
                    data:{
                        function: item.function,
                        prompt_tokens: item.prompt_tokens,
                        completion_tokens: item.completion_tokens,
                        cost: item.cost
                    }
                })
                
                delete aiBuffer[tId][mk]
            }
            delete aiBuffer[tId]
        }
    }catch(error){
        console.log(`Error in usage tracker`)   
        console.log(error)
    }
}, 15000)


function addToAIBuffer( trackId, data ){
    const aiBuffer = aiBufferSet[activeAIBuffer]
    let mk = `${data.api}-${data.model}`

    const cost = getCost( data.api, data.model, "prompt_tokens", data.prompt_tokens) + getCost( data.api, data.model, "completion_tokens", data.completion_tokens)

    aiBuffer[trackId] ||= {}
    aiBuffer[trackId][mk] ||= {
        mk, 
        prompt_tokens: 0, 
        completion_tokens: 0, 
        total: 0,
        workspace: data.workspace,
        function: data.functionName,
        usageId: data.usageId,
        cost
    }
    aiBuffer[trackId][mk].prompt_tokens += data.prompt_tokens
    aiBuffer[trackId][mk].completion_tokens += data.completion_tokens
    aiBuffer[trackId][mk].total += data.total
}