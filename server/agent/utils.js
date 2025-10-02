import { modiftyEntries, pickAtRandom } from "../actions/SharedTransforms";
import { DONT_LOAD, fetchPrimitives, getDataForProcessing } from "../SharedFunctions";
import { parser } from "stream-json/Parser";
import { PassThrough } from "stream";
import Assembler from "stream-json/Assembler";
import { get, set } from "lodash";
import { flattenStructuredResponse } from "../PrimitiveConfig";

export const isObjectId = id => /^[0-9a-fA-F]{24}$/.test(id);
export function remapHistoryFraming(funcName, history, framing){
    history.forEach(d=>{
        if( d.resultFor === funcName ){
            d.role = "user"
            d.content = `${framing}: ${JSON.stringify(d.context ?? d.content)}}`
            delete d["context"]
            
        }
        return d
    })

    return history
}
export function mostRecentResult(funcName, history, maxAge = 20){
    const idx = history.findLastIndex(d=>d.resultFor === funcName)
    const highestIdx = Math.max(0, history.length - maxAge)
    if( idx < highestIdx){
      return 
    }
    
    const latest = history[idx]
    return latest

}
export function getConfigId( item ){
    return Object.entries(item._parentPrimitives ?? item.parentPrimitives ?? {}).find(d=>d[1].includes("primitives.config"))?.[0]
}
export function streamingResponseHandler( notify, fragmentList ){
    const pass = {pass: undefined};

    let doc;
    let initialized = false;
    const path = [];            // stack of keys & array-indices
    const typeStack  = [];  // parallel stack: 'object' or 'array'
    let parsingKey = false;     // are we inside a key name?
    let currentKey = "";        // buffer for the key string
    let keyCount = 0
    let jsonParser

    let lastSent = ""
    
    function onData({ name, value }) {
        if (!initialized) {
            if (name === "startObject") {
                doc = {};
                typeStack.push("object");
                initialized = true;
                } else if (name === "startArray") {
                doc = [];
                typeStack.push("array");
                path.push(0);    // enter array at index 0
                initialized = true;
                }
            return;
        }
    
        try {
            switch (name) {
        case "startKey":
            parsingKey = true;
            currentKey = "";
            break;
    
            case "stringChunk":
                if (parsingKey) {
                    currentKey += value;
                } else {
                    // string *value* chunk
                    const existing = get(doc, path, null);
                    set(doc, path, existing  ? existing + value : value);
                }
                break;
            case "endString":
                if (!parsingKey ) {
                    const existing = get(doc, path, null);
                    const topType = typeStack[typeStack.length - 1];
                    if (topType === "array" ) {
                        const arr = get(doc, path.slice(0, -1));
                        path[path.length - 1] = arr.length //- 1
                    }
                }
                break;
    
            case "endKey":
                parsingKey = false;
                // create placeholder and descend
                if( keyCount > 0){
                    path.pop()
                }
                keyCount++
                set(doc, [...path, currentKey], null);
                path.push(currentKey);
                break;
    
            // —— OBJECT STRUCTURE —— 
            case "startObject":
                // if we’re in an array, push a new element
                if (typeStack[typeStack.length - 1] === "array") {
                    const arr = get(doc, path.slice(0, -1));
                    arr.push({});
                    // descend into that new element
                    path[path.length - 1] = arr.length - 1
                }
                // mark new object context
                typeStack.push("object");
                set(doc, path, get(doc, path, {}));
                keyCount = 0
                break;
    
            case "endObject":
                typeStack.pop();
                const was2 = path.pop();
                break;
    
            // —— ARRAY STRUCTURE —— 
            case "startArray":
                // we’re either the value of a key (object) or nested in an array
                const existing = get(doc, path )
                set(doc, path, existing ?? []);
                typeStack.push("array");
                // descend into first slot
                path.push(0);
                break;
        
            case "endArray":
                typeStack.pop();
                const was = path.pop();
                break;
    
            // —— PRIMITIVES —— 
            case "stringValue":
            case "numberValue":
            case "trueValue":
            case "falseValue":
            case "nullValue":
                set(doc, path, value);
                break;
        }
    
        // —— ADVANCE FOR NEXT ARRAY ELEMENT —— 
        // If we’re in an array value context and we just finished
        // a primitive or object, bump the index for the next element.
        const topType = typeStack[typeStack.length - 1];
        if (topType === "array" && ["stringValue","numberValue","trueValue","falseValue","nullValue","endObject"].includes(name)) {
            const arr = get(doc, path.slice(0, -1));
            path[path.length - 1] = arr.length //- 1
        }
        
    

        const nodeResult = doc.structure
        modiftyEntries( nodeResult, "content", entry=>{
            let content = entry.content
            entry._content = content
            let ids = typeof(entry.ids) === "string" ? entry.ids.replaceAll("[","").replaceAll("]","").split(",").map(d=>parseInt(d)).filter(d=>isNaN(d)) 
                                                    : Array.isArray(entry.ids) ? entry.ids.map(d=>parseInt(d)).filter(d=>isNaN(d))
                                                    : entry.ids
            if( ids ){
                let sourceIds = ids.map(d=>{
                    if( fragmentList[d] ){
                        return fragmentList[d].id
                    }else{
                        console.warn(`Cant find referenced fragment ${d} in `, ids, entry.ids, entry)
                    }
                }).filter((d,i,a)=>a.indexOf(d) === i)
                if( sourceIds.length === 0){
                    if( fragmentList.length === 1){
                        content += ` [[id:${fragmentList[0]}]]`
                    }
                }else{
                    content += ` [[id:${sourceIds.join(", ")}]]`
                }
            }
            return content
        } )
        const out = flattenStructuredResponse( nodeResult, nodeResult)
        modiftyEntries( nodeResult, "content", entry=>{
            return entry._content
        })
        let backup = ""
        let startIdx = 0
        if( lastSent.length > 0 ){
            const maxPrefix = Math.min(lastSent.length, out.length)
            let prefixLen = 0
            while( prefixLen < maxPrefix && lastSent[prefixLen] === out[prefixLen]){
                prefixLen++
            }
            if( prefixLen < lastSent.length ){
                const rewindCount = lastSent.length - prefixLen
                backup = `__SC_BK${rewindCount}__`
            }
            startIdx = prefixLen
        }
        const delta = out.slice(startIdx)
        const payload = backup + delta
        if( payload.length > 0 ){
            notify(payload, false)
        }
        lastSent = out

        } catch (err) {
            console.error("Parser handling error:", err);
        }
    }
    
    function resetState() {
        doc         = undefined;
        initialized = false;
        path.length = 0;
        typeStack.length = 0;
        parsingKey  = false;
        currentKey  = "";
        keyCount    = 0;
        lastSent    = "";
    }

    function onError(err) {
        console.error("parse error", err);
    }
    function onEnd() {
        resetState();
        rebuildParser();  
    }

    function rebuildParser() {
        if (jsonParser) {
            pass.pass.unpipe(jsonParser);
            jsonParser.removeAllListeners("data");
            jsonParser.removeAllListeners("error");
            jsonParser.removeAllListeners("end");
        }
        pass.pass = new PassThrough()
        jsonParser = pass.pass.pipe(parser({ packStrings: false }));
        jsonParser.on("data", onData);
        jsonParser.on("error", onError);
        jsonParser.on("end", onEnd);

        pass.write = (...args)=>{
            pass.pass.write(...args)
        }
        pass.end = ()=>{
            pass.pass.end()
        }
    }

    rebuildParser();

    return pass
}
export async function resolveId(id_or_ids, scope){
    const plain = []
    const baseIds = []
    const out = {}

    if(scope){
        scope.cache ||= {}
        scope.cache.primitives ||= {}
    }

    const mappedInput = []
    for(const d of [id_or_ids].flat()){
        const asNum = parseInt(d)
        if( scope?.cache?.primitives[d]){
            const prim = scope?.cache?.primitives[d]
            out[prim.id] = prim
            out[prim.plainId] = prim
            mappedInput.push(prim.id)
        }else{
            if( isObjectId(d) || isNaN(asNum) ){
                baseIds.push(d)
                mappedInput.push(d)
            }else{
                plain.push(asNum)
                mappedInput.push(asNum)
            }
        }
    }
    if( plain.length > 0 || baseIds.length > 0){

        const query = {
            workspaceId: scope.workspaceId,
            $or: [
                plain.length > 0 ? {plainId: {$in: plain}} : undefined,
                baseIds.length > 0 ? {_id: {$in: baseIds}} : undefined,
            ].filter(d=>d)
        }
        const fetched = await fetchPrimitives(undefined, query, scope.projection ?? DONT_LOAD)
        for(const d of fetched){
            if( scope ){
                scope.cache.primitives[d.plainId] = d
                scope.cache.primitives[d.id] = d
            }
            out[d.id] = d
            out[d.plainId] = d
        }
    }
    return mappedInput.map(d=>out[d])
    
}
export async function getDataForAgentAction(params, scope){
    let items = [], toSummarize = []

    const directTypes = new Set(["view", "query", "filter", "search", "summary"]);
    let sourceIds = params.sourceIds;

    if (!sourceIds || sourceIds.length === 0) {
        const connectedIds = new Set();
        const immediate = scope.immediateContext ?? [];

        for (const item of immediate) {
            if (!item) continue;

            if (directTypes.has(item.type) && item.id) {
                connectedIds.add(item.id);
            }

            const importIds = item.primitives?.imports;
            if (Array.isArray(importIds)) {
                importIds.filter(Boolean).forEach((id) => connectedIds.add(id));
            }
        }

        if (connectedIds.size > 0) {
            sourceIds = Array.from(connectedIds);
        }
    }

    if (!sourceIds || sourceIds.length === 0) {
        throw new Error("No connected data sources available. Use get_connected_data or select a view/query (call get_data_sources if nothing is connected).");
    }

    let sources = await resolveId(sourceIds, {...scope, projection: "_id referenceId workspaceId primitives type flowElement"})

    let field = "context"
    if( params.field === "title"){
      field = "title"
    }else if(params.field){
      field = `param.${params.field}`
    }
    for( const source of sources){
        const [_items, _toSummarize] = await getDataForProcessing(source, {field, action_override: true}, undefined, {forceImport: true})
        items.push(..._items)
        toSummarize.push(..._toSummarize)
    }

    if( params.limit ){
        const selectedIds = pickAtRandom( new Array(items.length).fill(0).map((_,i)=>i), params.limit)
        const _items = [], _toSummarize = []
        for(const id of selectedIds){
            _items.push( items[id] )
            _toSummarize.push( toSummarize[id] )
        }
        items = _items
        toSummarize = _toSummarize
    }
    return [items, toSummarize, sources.map(d=>d.id)]
}
export function categoryDetailsForAgent(category){
    const fields = getCategoryParameterNameForAgent( category, {fallback: true})
    const thisInstance = {}
    let add = false
    for(const f of fields){
        if(category.parameters[f].asAxis !== false){
            thisInstance[f] = category.parameters[f]
            add = true
        }
    }
    return add ? thisInstance: undefined
}
export function getCategoryParameterNameForAgent( category, {fallback = false, forSample} = {}){
    const fields = category.parameters
    //let paramsForAgent = Object.keys(fields).filter(d=>forSample ? (fields[d].agent === "sample" || fields[d].agent === true) : fields[d].agent === true) 
    let paramsForAgent = Object.keys(fields).filter(d=>fields[d].agent) 
    if( paramsForAgent.length === 0 && fallback){
        paramsForAgent = Object.keys(fields)
    }
    return paramsForAgent

}
export function mapSearchConfigForPlatform(config, platform){
    const newConfig = {}
    for( const k in config){
        let targetField = k
        if( platform === "reddit" && k === "subreddits"){
            targetField = "terms"
        }else if( k === "number_of_results"){
            targetField = "count"
        }else if( k === "search_sites"){
            targetField = "site"
        }else if( k === "textual_filter"){
            targetField = "topic"
        }
        let value = config[k]
        if( Array.isArray(value)){
            value = value.join(", ")
        }
        newConfig[targetField] = value
    }
    return newConfig
}
