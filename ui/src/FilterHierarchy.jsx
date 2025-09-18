import React, { useEffect, useMemo, useState } from 'react'
import MainStore from './MainStore'
import { HeroIcon } from './HeroIcon'
import CollectionUtils from './CollectionHelper'
import PrimitiveConfig from './PrimitiveConfig'
import HierarchyNavigator from './HierarchyNavigator'
import Popup from './Popup'
import clsx from 'clsx'

function FilterBadge({ label, value }){
  if (value === undefined || value === null) return null
  let text = Array.isArray(value) ? (value.length === 0 ? '[]' : value.join(', ')) : String(value)
  if (typeof value === 'object' && !Array.isArray(value)) {
    try { text = JSON.stringify(value) } catch(e){ text = String(value) }
  }
  return (
    <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
      <span className="uppercase text-[9px] text-slate-500 mr-1">{label}</span>{text}
    </span>
  )
}

function valueToLabel(v){
  if (v === undefined || v === null) return 'null'
  if (typeof v === 'string'){
    if (v.toLowerCase && v.toLowerCase() === 'uncategorized') return 'Uncategorized'
    return v
  }
  if (typeof v === 'number' || typeof v === 'boolean'){
    return String(v)
  }
  // Object handling
  // 1) Ranges
  const gte = v.gte ?? v.min_value
  const lte = v.lte ?? v.max_value
  if (gte !== undefined || lte !== undefined){
    if (gte !== undefined && lte !== undefined) return `${gte} – ${lte}`
    if (gte !== undefined) return `>= ${gte}`
    if (lte !== undefined) return `<= ${lte}`
  }
  // 2) Category-like objects
  if (v.category_title) return String(v.category_title)
  if (v.title) return String(v.title)
  if (v.name) return String(v.name)
  // 3) Try category lookup by id
  try{
    const cat = MainStore().category?.(v.id)
    if (cat?.title) return cat.title
  }catch(e){ /* ignore */ }
  // 4) Fallback JSON
  try { return JSON.stringify(v) } catch(e){ return String(v) }
}

function ValuesChips({ values, tone = 'default' }){
  if (values == null) return null
  const arr = Array.isArray(values) ? values : [values]
  const toLabel = (v) => valueToLabel(v)
  const shown = arr.slice(0, 3)
  const more = Math.max(0, arr.length - shown.length)
  const toneClass = tone === 'include' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : tone === 'exclude' ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((v, i) => (
        <span key={i} className={"inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border " + toneClass}>
          {toLabel(v)}
        </span>
      ))}
      {more > 0 && (
        <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">+{more} more</span>
      )}
    </div>
  )
}

function toArray(val){
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}


function FilterRow({ f }){
  // Support multiple shapes (legacy and normalized)
  const type = f.type || f.originalType
  const param = f.parameter || f.param
  const parentCatTitle = f.categorization ? f.categorization?.title : undefined
  // Gather include/exclude value sources
  const includeVals = [
    ...toArray(f.include_value),
    ...toArray(f.include_values),
    ...toArray(f.include_categories),
    ...toArray(f.include)
  ]
  const excludeVals = [
    ...toArray(f.exclude_value),
    ...toArray(f.exclude_values),
    ...toArray(f.exclude_categories),
    ...toArray(f.exlude_categories),
    ...toArray(f.exlude_values),
    ...toArray(f.exclude)
  ]
  // Fallbacks: legacy fields
  const legacyValues = f.values ?? f.check
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap items-center gap-2">
        {param && <FilterBadge label="param" value={param} />}
        {parentCatTitle && <FilterBadge label="cat" value={parentCatTitle} />}
        {f.invert !== undefined && <FilterBadge label="invert" value={f.invert ? 'true' : 'false'} />}
        {f.includeNulls !== undefined && <FilterBadge label="nulls" value={f.includeNulls ? 'include' : 'exclude'} />}
        {f.sourcePrimId && <FilterBadge label="source" value={f.sourcePrimId} />}
        {!parentCatTitle && f.relationship && <FilterBadge label="rel" value={Array.isArray(f.relationship) ? f.relationship.join('.') : f.relationship} />}
        {f.pivot !== undefined && <FilterBadge label="pivot" value={f.pivot} />}
        {includeVals.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] uppercase text-emerald-700 font-semibold">include</span>
            <ValuesChips values={includeVals} tone="include" />
          </span>
        )}
        {excludeVals.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="text-[10px] uppercase text-rose-700 font-semibold">exclude</span>
            <ValuesChips values={excludeVals} tone="exclude" />
          </span>
        )}
        {includeVals.length === 0 && excludeVals.length === 0 && legacyValues !== undefined && (
          <ValuesChips values={legacyValues} />
        )}
      </div>
    </div>
  )
}

function gatherFilters(node){
  const out = []
  // Example shape: node.filters is array
  if (Array.isArray(node.filters)) out.push(...node.filters)
  // Normalized shape put under .filters.explore/.filters.axis
  const fObj = node.filters
  if (fObj && !Array.isArray(fObj)){
    if (Array.isArray(fObj.explore?.filters)) out.push(...fObj.explore.filters)
    if (fObj.axis?.column) out.push({ originalType:'axis', ...fObj.axis.column })
    if (fObj.axis?.row) out.push({ originalType:'axis', ...fObj.axis.row })
  }
  return out
}

function isDataSourceNode(node){
  const sc = node?.sourceCounts || {}
  const imp = sc.import ?? 0
  const org = sc.origin ?? 0
  const alt = sc.alt_origin ?? 0
  return imp === 0 && (org > 0 || alt > 0)
}

function nodeIdPart(node, fallback){
  if (!node) return fallback
  if (node.node?.id !== undefined) return node.node.id
  if (node.node?.plainId !== undefined) return node.node.plainId
  return fallback
}

function buildNodeKey(node, parentKey, index){
  const suffix = nodeIdPart(node, `idx-${index}`)
  if (!parentKey) return `root-${suffix}`
  return `${parentKey}.${suffix}`
}

function formatSourceBadge(node, keyBase, idx){
  const badgeKey = `${keyBase}::source::${nodeIdPart(node, idx)}`
  const title = node?.node?.title ?? `#${node?.node?.plainId ?? ''}`
  const count = node?.count ?? 0
  return { key: badgeKey, title, count }
}

function computeLayout(node, expandedKeys, parentKey = null, index = 0){
  if (!node) return null
  const key = buildNodeKey(node, parentKey, index)
  const expanded = expandedKeys.has(key)
  const children = Array.isArray(node.children) ? node.children : []
  const localFilters = gatherFilters(node)

  const directSources = children.filter(isDataSourceNode)
  const normalChildren = children.filter((c)=>!isDataSourceNode(c))
  const directSourceBadges = directSources.map((ds, idx)=>formatSourceBadge(ds, key, idx))
  const childLayouts = normalChildren.map((child, childIdx)=>computeLayout(child, expandedKeys, key, childIdx)).filter(Boolean)

  const aggregatedSources = [
    ...directSourceBadges,
    ...childLayouts.flatMap((child)=>child.allSources)
  ]

  const descendantFilterCount = childLayouts.reduce((sum, child)=>sum + child.totalFilterCount, 0)
  const totalFilterCount = localFilters.length + descendantFilterCount

  const incomingExpanded = children.reduce((acc, child)=>acc + (child?.count ?? 0), 0)
  const directSourcesInput = directSources.reduce((acc, child)=>{
    //const scImport = child?.sourceCounts?.import
    //if (typeof scImport === 'number') return acc + scImport
    return acc + (child?.count ?? 0)
  }, 0)
  const childCollapsedInput = childLayouts.reduce((sum, child)=>sum + (child.collapsedIncomingCount ?? child.expandedIncomingCount), 0)
  const hasChildren = children.length > 0
  const fallbackImport = node?.sourceCounts?.import ?? incomingExpanded
  const collapsedIncomingCount = hasChildren ? (directSourcesInput + childCollapsedInput) : fallbackImport

  return {
    key,
    node,
    expanded,
    localFilters,
    expandedIncomingCount: incomingExpanded,
    collapsedIncomingCount,
    outCount: node?.count ?? 0,
    directSources: directSourceBadges,
    allSources: aggregatedSources,
    descendantFilterCount,
    totalFilterCount,
    children: childLayouts
  }
}

function TreeNode({ layout, depth = 0, onToggle }){
  const { node, expanded, expandedIncomingCount, collapsedIncomingCount, outCount, directSources, allSources, localFilters, descendantFilterCount, children, key } = layout
  const incomingCount = expanded ? expandedIncomingCount : collapsedIncomingCount
  const filters = localFilters
  const mainstore = MainStore()
  const primitiveId = node?.node?.id
  const prim = node?.primitive ?? mainstore.primitive?.(primitiveId)
  const title = prim?.title ?? node?.node?.title ?? `#${prim?.plainId ?? node?.node?.plainId ?? ''}`
  const nodeTypes = node.nodeTypes || {}
  const nodeTypeKeys = Object.keys(nodeTypes)
  const [showEditor, setShowEditor] = useState(false)
  const canExpand = children.length > 0

  const noteDescendantFilterCount = expanded ? 0 : descendantFilterCount

  const nestedFilterMessage = expanded ? "" : descendantFilterCount === 0
              ? 'No nested filters applied deeper'
              : descendantFilterCount === 1
                ? '1 nested filter applied deeper'
                : `${descendantFilterCount} nested filters applied deeper` 

  return (
    <div className={clsx('pl-2', depth > 0 && 'border-l border-slate-200 ml-2')}>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
        <button className="flex w-full items-center justify-between text-left" disabled={!canExpand} onClick={() => onToggle(key)}>
          <div className="flex items-center gap-2 truncate">
            <span className={clsx('inline-block h-3 w-3 rounded-sm', expanded ? 'bg-emerald-500' : 'bg-slate-300')} />
            <span className="text-sm font-semibold text-slate-700 truncate">{title}</span>
          </div>
          <div className="text-[11px] text-slate-500 ml-2 shrink-0 flex items-center gap-2">
            <span>in: <span className="font-semibold text-slate-700">{incomingCount}</span></span>
            <span>out: <span className="font-semibold text-slate-700">{outCount}</span></span>
          </div>
          <div className="right-2 top-2">
            <button className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50" onClick={(e)=>{e.stopPropagation(); setShowEditor(true)}}>
              Edit
            </button>
          </div>
        </button>
        <div className="mt-2 space-y-2">
          {nodeTypeKeys.length > 0 &&  (
            <div className="flex flex-wrap gap-2">
              {nodeTypeKeys.map((rid) => {
                const info = nodeTypes[rid] || {}
                let icon = undefined
                try{
                  icon = mainstore.category?.(rid)?.icon
                }catch(e){ icon = undefined }
                return (
                  <span key={rid} className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[11px] text-slate-700 border border-slate-200">
                    {icon && <HeroIcon icon={icon} className="h-3.5 w-3.5 text-slate-500"/>}
                    <span className="font-medium">{info.type ?? rid}</span>
                    <span className="text-slate-500">({info.count ?? 0})</span>
                  </span>
                )
              })}
            </div>
          )}
          {filters.length > 0 ? <>
            {filters.map((f, i) => (<FilterRow key={i} f={f} />)) }
            <div className="text-[11px] text-slate-500">
              {nestedFilterMessage}
            </div>
            </> : (
            <div className="text-[11px] text-slate-500">{noteDescendantFilterCount === 0 ? "No filters" : `No filters at this stage, ${nestedFilterMessage}`}</div>
          )}
          {expanded ? (
            directSources.length > 0 && children.length === 0 && (
              <div className="flex flex-col gap-1">
                {directSources.map((source) => (
                  <div key={source.key} className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900 border border-amber-200">
                    <span className="inline-flex items-center rounded bg-amber-200 px-1 py-0.5 text-[10px] font-semibold text-amber-900">SOURCE</span>
                    <span className="font-medium truncate">{source.title}</span>
                    <span className="text-amber-800">({source.count})</span>
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              {allSources.length > 0 && (
                <div className="flex flex-col gap-1">
                  {allSources.map((source) => (
                    <div key={source.key} className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900 border border-amber-200">
                      <span className="inline-flex items-center rounded bg-amber-200 px-1 py-0.5 text-[10px] font-semibold text-amber-900">SOURCE</span>
                      <span className="font-medium truncate">{source.title}</span>
                      <span className="text-amber-800">({source.count})</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {showEditor && (
        <Popup showCancel={true} setOpen={setShowEditor} title={`Edit filters — ${title}`} width="max-w-3xl">
          {() => <FilterEditor primitive={prim} onClose={()=>setShowEditor(false)} />}
        </Popup>
      )}
      {expanded && children.length > 0 && (
        <div className="mt-1 space-y-1">
          {children.map((childLayout) => (
            <TreeNode key={childLayout.key} layout={childLayout} depth={depth + 1} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterEditor({ primitive, onClose }){
  const mainstore = MainStore()
  const items = primitive.itemsForProcessingWithFilter(undefined, { ignoreFinalViewFilter: true })
  const columnAxis = CollectionUtils.primitiveAxis(primitive, 'column', items)
  const rowAxis = CollectionUtils.primitiveAxis(primitive, 'row', items)
  const colFilter = PrimitiveConfig.decodeExploreFilter(primitive.referenceParameters?.explore?.axis?.column?.filter)
  const rowFilter = PrimitiveConfig.decodeExploreFilter(primitive.referenceParameters?.explore?.axis?.row?.filter)
  const axisOptions = CollectionUtils.axisFromCollection(items, primitive).map(d=>{
    const out = { ...d }
    if (d.relationship){ out.relationship = [d.relationship].flat(); out.access = out.relationship.length }
    return out
  })
  const localFilters = CollectionUtils.getExploreFilters(primitive, axisOptions)
  const viewFilters = primitive.referenceParameters?.explore?.filters?.map((_, i)=>CollectionUtils.primitiveAxis(primitive, i, items)) ?? []
  const { extents } = CollectionUtils.mapCollectionByAxis(items, columnAxis, rowAxis, viewFilters, [], primitive.referenceParameters?.explore?.viewPivot)

  const sets = [
    { selection: 'column', mode: 'column', title: 'Columns', list: colFilter, axis: columnAxis },
    { selection: 'row', mode: 'row', title: 'Rows', list: rowFilter, axis: rowAxis },
    ...localFilters.map((d, idx)=>({ axis: axisOptions[d.option], selection: `filterGroup${idx}`, title: `Filter by ${axisOptions[d.option]?.title}`, deleteIdx: idx, treatment: d.treatment, mode: idx, list: d.filter }))
  ]

  const addViewFilter = (item)=>{
    const axis = axisOptions[item]
    if (!axis) return
    const local = primitive.referenceParameters?.explore?.filters ?? []
    const track = (primitive.referenceParameters?.explore?.filterTrack ?? 0) + 1
    const newFilter = { track, sourcePrimId: axis.primitiveId, type: axis.type, subtype: axis.subtype, parameter: axis.parameter, relationship: axis.relationship, treatment: 'filter', access: axis.access, value: undefined }
    local.push(newFilter)
    primitive.setField('referenceParameters.explore.filters', local)
    primitive.setField('referenceParameters.explore.filterTrack', track)
  }

  const filterList = CollectionUtils.buildFilterPane(sets, extents, {
    mainstore,
    updateAxisFilter: (item, mode, setAll, axisExtents)=>{
      let currentFilter
      if (mode === 'row') currentFilter = rowFilter
      else if (mode === 'column') currentFilter = colFilter
      else currentFilter = PrimitiveConfig.decodeExploreFilter(primitive.referenceParameters?.explore?.filters?.[mode]?.filter)
      CollectionUtils.updateAxisFilter(primitive, mode, currentFilter, item, setAll, axisExtents)
    },
    deleteViewFilter: (idx)=>{
      const filter = viewFilters[idx]
      let filters = primitive.referenceParameters?.explore?.filters
      filters = filters.filter(d=>d.track !== filter.track)
      primitive.setField('referenceParameters.explore.filters', filters)
    }
  })

  return (
    <div className="flex flex-col gap-2">
      <div className='w-full px-1 py-2 text-sm flex place-items-center justify-between text-gray-600 font-normal'>
        <HierarchyNavigator noBorder portal icon={<HeroIcon icon='FunnelPlus' className='w-5 h-5 ' />} items={CollectionUtils.axisToHierarchy(axisOptions)} flat placement='left-start' action={(d)=>addViewFilter(d.id)} dropdownWidth='w-64' className='ml-auto hover:text-ccgreen-800 hover:shadow-md' />
      </div>
      <div className='w-full p-2 text-sm space-y-2 max-h-[60vh] overflow-y-auto'>
        {filterList}
      </div>
    </div>
  )
}

export default function FilterHierarchy({ root }){
  const rootKey = useMemo(() => root ? buildNodeKey(root, null, 0) : null, [root])
  const [expandedKeys, setExpandedKeys] = useState(() => {
    if (!rootKey) return new Set()
    return new Set([rootKey])
  })

  useEffect(() => {
    if (!rootKey){
      setExpandedKeys(new Set())
    }else{
      setExpandedKeys(new Set([rootKey]))
    }
  }, [rootKey])

  const layout = useMemo(() => {
    if (!root) return null
    return computeLayout(root, expandedKeys, null, 0)
  }, [root, expandedKeys])

  const handleToggle = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)){
        next.delete(key)
      }else{
        next.add(key)
      }
      return next
    })
  }

  if (!layout) return null

  return (
    <div className="space-y-1">
      <TreeNode layout={layout} onToggle={handleToggle} />
    </div>
  )
}
