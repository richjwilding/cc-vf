import mongoose from "mongoose";
import { DONT_LOAD, executeConcurrently, uniquePrimitives } from "../SharedFunctions";
import { inspect } from 'node:util';
import Primitive from "../model/Primitive";
const LeanPrimitiveResolved = mongoose.connection.collection("lean_primitives_resolved");

// Build a Mongo/Mongoose filter object from bucket signature + filters
function makePostJoinFilterQuery(sigObj, filters = []) {

  const { type, referenceId } = sigObj || {};
  const query = [];

  if (type !== undefined) query.push({type: type})
  if (referenceId !== undefined) {
    query.push({referenceId: Array.isArray(referenceId) ? { $in: referenceId } : referenceId})
  }

  const byField = new Map();

  for (const f of filters || []) {
    if (!f) continue;

    let op = "nin"
    const filterType = f.type;
    const field = f.parameter ? String(f.parameter) : '';

    const raw = f.value ?? f.filter;
    const val = [raw].flat()

    function addParentPrimitiveCheck( items ){
        if(items.length > 1){
            if( f.invert ){
                query.push({$or: items.map(d=>({[`parentPrimitives.${d}.0`]: { $exists: true }}))})
            }else{
                query.push({$and: items.map(d=>({[`parentPrimitives.${d}.0`]: { $exists: false }}))})
            }
        }else if(items.length == 1){                
            query.push({[`parentPrimitives.${items[0]}.0`]: { $exists: f.invert ? true : false }})
        }
    }

    switch( filterType ){
        case 'category':
            if( val.includes( null )){
                query.push({$or: f.sourcePrimOrigin.map(d=>({[`parentPrimitives.${d}.0`]: { $exists: true }}))})
            }
            addParentPrimitiveCheck( val.filter(Boolean) )
            continue;
        case "parent":
            addParentPrimitiveCheck( val.filter(Boolean) )
            continue
        case "parameter":
            console.log(f, val)
            if( val[0]?.gte ){
                query.push({[`referenceParameters.${field}`]: {$gte: val[0].gte}})
                continue
            }
            if( f.invert ){
                query.push({[`referenceParameters.${field}`]: {$in: val}})
            }else{
                query.push({[`referenceParameters.${field}`]: {$nin: val}})
            }
            continue
    }

    console.log(f)
    throw "Unsupported filter"
}

  return query.length > 0 ? {$and: query} : {};
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => JSON.stringify(k)+':'+stableStringify(obj[k])).join(',')}}`;
}

function normalizeFilters(filters) {
  if (!Array.isArray(filters) || filters.length === 0) return [];
  return filters.map(f => {
    const {track, treatment, ...out} = { ...f };
    if (Array.isArray(out.value)) out.value = [...out.value].sort();
    return out;
  }).sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
}

function extractSigParts(refParams = {}, nodeType, sourcePrimOrigins) {
  const { type, referenceId, explore } = refParams || {};
  const base = { type, referenceId };
  let normalizedFilters = [];
  if (nodeType === 'view' && explore && Array.isArray(explore.filters)) {
    normalizedFilters = normalizeFilters(explore.filters);
    base.explore = { filters: normalizedFilters };
  }
  return { sigObj: base, normalizedFilters };
}


function isViewNoop(node, normalizedFilters) {
  const p = node.referenceParameters || {};
  return node.type === 'view' && !p.referenceId && !p.type && normalizedFilters.length === 0;
}

function isViewFilter(node, normalizedFilters) {
  const p = node.referenceParameters || {};
  return node.type === 'view' && normalizedFilters.length > 0;
}

function nodeViewFilters(node) {
  const { normalizedFilters } = extractSigParts(node.referenceParameters, node.type);
  return normalizedFilters;
}
function importFilters(node) {
    if( node.referenceParameters?.importConfig ){
        return node.referenceParameters.importConfig.reduce((a,d)=>{
            a[d.id] = normalizeFilters(d.filters).map(d=>({...d, invert: true}))
            return a
        }, {})
    }
    return {}
}

function mergeFilterArrays(a = [], b = []) {
  // AND semantics: concatenate then normalize+dedupe deterministically
  return normalizeFilters([...(a || []), ...(b || [])]);
}

function computeIncomingViewFilterGroups(chain) {
  const byId = new Map(chain.map(n => [String(n._id), n]));
  const importsMap = new Map(chain.map(n => [String(n._id), (n.importsIds || []).map(String)]));

  // Seeds: depth==0 are the sinks/consumers (the starting node(s) of your fetch).
  // If depth isn’t present, you can also find sinks as nodes that are not imported by anyone.
  const minDepth = Math.min(...chain.map(n => n.depth ?? 0));
  const sinks = chain.filter(n => (n.depth ?? 0) === minDepth).map(n => String(n._id));

  const incoming = new Map(); // nodeId -> Array<filters[]>
  const seen = new Set();     // memoize by (nodeId|signatureOfAccFilters)

  const pushIncoming = (nodeId, filtersArr) => {
    const sig = stableStringify(filtersArr);
    const key = `${nodeId}|${sig}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!incoming.has(nodeId)) incoming.set(nodeId, []);
    incoming.get(nodeId).push(filtersArr);
  };

  // DFS upstream carrying cumulative filters
  function dfsUpstream(curId, accFilters) {
    const node = byId.get(curId);
    if (!node) return;

    // If this node is a view with filters, add them to the accumulator (A ∧ B ∧ ...)
    const vFilters = nodeViewFilters(node);
    const acc2 = isViewFilter(node, vFilters) ? mergeFilterArrays(accFilters, vFilters) : accFilters;

    const impFilters = importFilters(node)
    // Propagate to its imports (producers)
    const parents = importsMap.get(curId) || [];
    for (const parentId of parents) {
      // The parent’s outputs will later pass through acc2 worth of filters
      const thisImportFilters = impFilters[parentId]
      const acc3 = thisImportFilters ? mergeFilterArrays(acc2, thisImportFilters) : acc2

      pushIncoming(parentId, acc3);
      dfsUpstream(parentId, acc3);
    }

  }

  // Start from each sink with an empty accumulator
  for (const sinkId of sinks) {
    dfsUpstream(sinkId, []); // no filters yet at the sink boundary
  }

  return incoming;
}
export function buildLookups(chain) {
  const out = []
  const incomingGroups = computeIncomingViewFilterGroups(chain); // NEW

  for (const n of chain) {
    const hasImports = Array.isArray(n.importsIds) && n.importsIds.length > 0;
    const hasPrimAll = n.hasPrimitiveIds;

    if (hasImports || !hasPrimAll) {
      continue;
    }
    const { sigObj, normalizedFilters: ownFilters } = extractSigParts(n.referenceParameters, n.type, n.sourcePrimOrigins);

    //if (isViewNoop(n, ownFilters)) continue;

    const nodeId = String(n._id);
    const groups = incomingGroups.get(nodeId) || [[]]; // at least one empty group

    try{
        for (const incoming of groups) {
            const combinedFilters = mergeFilterArrays(ownFilters, incoming);
            out.push(
                {
                    parentId: nodeId,
                    query: {
                        deleted: { $exists: false },
                        ...makePostJoinFilterQuery(sigObj, combinedFilters)
                    }
                }
            )
        }
    }catch(e){
        console.log(`Error building fast path filter for ${nodeId}`)
        throw e
    }
  }

  return out;
}


export async function fetchPerBucket({workspaceId, buckets, options = {withParentPrimitives: false, withPrimitives: false }}) {
  const data = await executeConcurrently( buckets, async ({query, parentId})=>{
    
    console.log(`Will for ${parentId}`)

    console.time(`Fetch_${parentId}`)

    let pipeline = [
        {
            $match: {
                workspaceId,
                [`parentPrimitives.${parentId}`]: "primitives.origin"
            }
        },
        {
            $limit: 1000000000,

        },
        {
            $match: query
        }
    ]
    let projection = [
      { $project: {
            ...DONT_LOAD, 
            ...(options.withPrimitives ? {} : {primitives:  0} ), 
            ...(options.withParentPrimitives ? {} : {parentPrimitives:  0} ), 
            processing: 0, 
            comments: 0, 
            workspaceId: 0
        }}
      ]
    if( options.pipelineSteps ){
      pipeline.push(...options.pipelineSteps)
      if( options.pipelineSteps.at(-1).$project){
        console.log(`Last step is custom projection`)
        projection = []
      }
    }

    const res = await Primitive.aggregate([
      ...pipeline,
      ...projection        
    ]).hint("workspaceId_1_parentPrimitives.$**_1") ?? []
    console.timeEnd(`Fetch_${parentId}`)

    return res
  }, undefined, undefined, 5)
  
  if( !Array.isArray(data.results) ){
    throw "No data returned"
  }
  return uniqueLeanPrimitives( data?.results.flat() )
}
function uniqueLeanPrimitives(list){
    let ids = {}
    return list.filter((p)=>{
        if( ids[p._id] ){return false}
        ids[p._id] = true
        return p
    })
}

async function fetchImportChainIds({ sourceId, workspaceId }) {
const pipeline = [
  { $match: {
      _id: sourceId,
      workspaceId,
      deleted: { $exists: false }
  }},

  {
    $graphLookup: {
      from: "lean_primitives_resolved",
      startWith: "$_id",
      connectFromField: "importsIds",
      connectToField: "_id",
      as: "chain",
      depthField: "depth",
      restrictSearchWithMatch: {
        workspaceId,
        deleted: { $exists: false }
      }
    }
  },
  { $unwind: { path: "$chain", preserveNullAndEmptyArrays: true } },
  { $replaceRoot: { newRoot: { $mergeObjects: ["$chain", { rootId: "$rootId" }] } } },
  {
    $graphLookup: {
      from: "primitive_config_chain",   
      startWith: "$_id",                 
      connectFromField: "configParentId",
      connectToField: "_id",
      as: "configParentChainAll",
      depthField: "depth",
      maxDepth: 10
    }
  },{
    $set: {
      configParentChain: {
        $sortArray: {
          input: {
            $filter: {
              input: "$configParentChainAll",
              as: "p",
              cond: { $gt: ["$$p.depth", 0] }
            }
          },
          sortBy: { depth: 1 }
        }
      }
    }
  },
  {
    $project: {
      _id: 1,
      depth: 1,
      type: 1,
      referenceId: 1,
      importsIds: 1,
      hasPrimitiveIds: 1,
      referenceParameters: 1,
      parentPrimitives: 1,
      configParentChain: 1,
      rootId: 1
    }
  }]

  return await LeanPrimitiveResolved.aggregate(pipeline).toArray();
}

export async function getDataForImportDB(source, options = { forceImport: false }) {
    console.log(`>>>>> getDataForImportDB`)
  if (
    (!options.forceImport && (["query", "summary", "search"].includes(source.type))) ||
    ((["actionrunner", "action"].includes(source.type)) &&
      !Object.keys(source.primitives ?? {}).includes("imports") &&
      !options.forceImport)
  ) {
    throw "unsupported"
  }

  const workspaceId = source.workspaceId;
  const sourceId = new mongoose.Types.ObjectId(source.id);

  const chain = await fetchImportChainIds({ sourceId, workspaceId });

  let results
  const buckets = buildLookups( chain )
/*for(const d of buckets){
    console.log(inspect(d, { depth: 10, colors: true }))
}*/
  

    console.time("Fetch")
    results = await fetchPerBucket({workspaceId, buckets, options})
    console.timeEnd("Fetch")

  return results;
}