import mongoose from "mongoose";
import { DONT_LOAD, executeConcurrently, uniquePrimitives } from "../SharedFunctions";
import Primitive from "../model/Primitive";
const LeanPrimitiveResolved = mongoose.connection.collection("lean_primitives_resolved");

// --- helpers ---------------------------------------------------------------

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

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

    if (filterType === 'category') {
        if( val.includes( null )){
            console.log(`Null needs `)
            query.push({$or: f.sourcePrimOrigin.map(d=>({[`parentPrimitives.${d}.0`]: { $exists: true }}))})
        }
        const cleaned = val.filter(Boolean)
        if(cleaned.length > 0){
            query.push({$and: cleaned.map(d=>({[`parentPrimitives.${d}.0`]: { $exists: false }}))})
        }
      continue;
    }
    if( val[0]?.gte ){
        query.push({[`referenceParameters.${field}`]: {$gte: val[0].gte}})
    }
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
    if (typeof out.op === 'string') out.op = out.op.toLowerCase();
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

    // Propagate to its imports (producers)
    const parents = importsMap.get(curId) || [];
    for (const parentId of parents) {
      // The parent’s outputs will later pass through acc2 worth of filters
      pushIncoming(parentId, acc2);
      dfsUpstream(parentId, acc2);
    }
  }

  // Start from each sink with an empty accumulator
  for (const sinkId of sinks) {
    dfsUpstream(sinkId, []); // no filters yet at the sink boundary
  }

  return incoming;
}
export function buildDepthBuckets(chain) {
  const byDepth = new Map();
  const incomingGroups = computeIncomingViewFilterGroups(chain); // NEW

  for (const n of chain) {
    const hasImports = Array.isArray(n.importsIds) && n.importsIds.length > 0;
    const hasPrimAll = n.hasPrimitiveIds;

    const { sigObj, normalizedFilters: ownFilters } = extractSigParts(n.referenceParameters, n.type);

    if (isViewNoop(n, ownFilters)) continue;

    if (hasImports || !hasPrimAll) {
      continue;
    }

    const nodeId = String(n._id);
    const groups = incomingGroups.get(nodeId) || [[]]; // at least one empty group

    for (const incoming of groups) {
      const combinedFilters = mergeFilterArrays(ownFilters, incoming);
      
      const sigStr = nodeId //stableStringify({sigObj,incomingViewFilters: combinedFilters});
        
        console.log(`${nodeId} - ${sigStr}`)
      let depthMap = byDepth.get(n.depth);
      if (!depthMap) {
        depthMap = new Map();
        byDepth.set(n.depth, depthMap);
      }

      let bucket = depthMap.get(sigStr);
      if (!bucket) {
        bucket = {
          sigObj,
          parentIds: new Set(),
          childIds: new Set(),
          filters: combinedFilters,
          postJoinFilterQuery: makePostJoinFilterQuery(sigObj, combinedFilters),
        };
        depthMap.set(sigStr, bucket);
      }
      bucket.parentIds.add(nodeId);
    }
  }

  return byDepth;
}
export function buildLookups(chain) {
  const out = []
  const incomingGroups = computeIncomingViewFilterGroups(chain); // NEW

  for (const n of chain) {
    const hasImports = Array.isArray(n.importsIds) && n.importsIds.length > 0;
    const hasPrimAll = n.hasPrimitiveIds;

    const { sigObj, normalizedFilters: ownFilters } = extractSigParts(n.referenceParameters, n.type, n.sourcePrimOrigins);

    // If it’s a pure noop view with no own filters, it only propagates; skip creating a bucket
    // (If it has own filters but no ref/type, it still qualifies as a view filter source handled upstream)
    if (isViewNoop(n, ownFilters)) continue;

    if (hasImports || !hasPrimAll) {
      continue;
    }

    // figure out how many incoming filter groups this node should receive
    const nodeId = String(n._id);
    const groups = incomingGroups.get(nodeId) || [[]]; // at least one empty group

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
  }

  return out;
}


export async function fetchPerBucket({workspaceId, buckets}) {
  const data = await executeConcurrently( buckets, async ({query, parentId})=>{
    
    console.log(`Will for ${parentId}`)

    console.time(`Fetch_${parentId}`)
    const res = await Primitive.aggregate([
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
        },
        { $project: {...DONT_LOAD, primitives: 0, parentPrimitives: 0, processing: 0, comments: 0, workspaceId: 0}}
    ]).hint("workspaceId_1_parentPrimitives.$**_1") ?? []
    console.timeEnd(`Fetch_${parentId}`)

    return res
  }, undefined, undefined, 5)
  
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
 /*   const pipeline =  [
    { $match: { _id: sourceId, workspaceId, deleted: { $exists: false } } },
    {
      $graphLookup: {
        from: "lean_primitives_resolved",
        startWith: "$_id",
        connectFromField: "importsIds",
        connectToField: "_id",
        as: "chain",
        depthField: "depth",
        restrictSearchWithMatch: { workspaceId, deleted: { $exists: false } },
      },
    },
    {
      $project: {
        chain: {
         _id: 1,
          depth: 1,
          type: 1,
          referenceId: 1,
          importsIds: 1,
          hasPrimitiveIds: 1,
          referenceParameters: 1,
          parentPrimitives: 1
        },
      },
    },
  ]*/

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

export async function getDataForImportDB(source, { forceImport = false } = {}) {
  if (
    (!forceImport && (["query", "summary", "search"].includes(source.type))) ||
    ((["actionrunner", "action"].includes(source.type)) &&
      !Object.keys(source.primitives ?? {}).includes("imports") &&
      !forceImport)
  ) {
    return null;
  }

  const workspaceId = source.workspaceId;
  const sourceId = new mongoose.Types.ObjectId(source.id);

  console.time("Chain")
  const chain = await fetchImportChainIds({ sourceId, workspaceId });
  console.timeEnd("Chain")

  for(const d of chain){
    console.log(`Checking ${d._id.toString()} ${d.type}`)
    if( d.referenceParameters?.importConfig ){
        console.log(`Fast path not supported for importConfig on ${d._id.toString()}`)
        //return
    }
    if( d.referenceParameters?.explore?.filters ){
        for(const filter of d.referenceParameters.explore.filters){
            let supported = false
            if( filter.type === "parameter"){
                supported = true
            }else if( filter.type === "category" && (!filter.access || filter.access === 0) ){
                supported = true
            }
            if( !supported ){
                console.log(`Fast path not supported for filter ${filter.type} ${filter.access} on ${d._id.toString()}`)
                return undefined
            }
        }
    }

  }

  let results
  console.time("Buckets")
  const buckets = buildLookups( chain )
  console.timeEnd("Buckets")
  console.log(buckets)

    console.time("Fetch")
    results = await fetchPerBucket({workspaceId, buckets})
    console.timeEnd("Fetch")

  return results;
}