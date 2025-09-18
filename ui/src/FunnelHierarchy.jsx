import React, { useMemo } from 'react'
import clsx from 'clsx'
import MainStore from './MainStore'

function toArray(v){ return v == null ? [] : (Array.isArray(v) ? v : [v]) }

function valueToLabel(v){
  if (v === undefined || v === null) return 'null'
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  const gte = v.gte ?? v.min_value; const lte = v.lte ?? v.max_value
  if (gte !== undefined || lte !== undefined){
    if (gte !== undefined && lte !== undefined) return `${gte} – ${lte}`
    if (gte !== undefined) return `>= ${gte}`
    if (lte !== undefined) return `<= ${lte}`
  }
  if (v.category_title) return String(v.category_title)
  if (v.title) return String(v.title)
  if (v.name) return String(v.name)
  try{ const cat = MainStore().category?.(v.id); if (cat?.title) return cat.title }catch(e){}
  try { return JSON.stringify(v) } catch(e){ return String(v) }
}

function gatherFilters(node){
  const out = []
  if (Array.isArray(node.filters)) out.push(...node.filters)
  const fObj = node.filters
  if (fObj && !Array.isArray(fObj)){
    if (Array.isArray(fObj.explore?.filters)) out.push(...fObj.explore.filters)
    if (fObj.axis?.column) out.push({ originalType:'axis', ...fObj.axis.column })
    if (fObj.axis?.row) out.push({ originalType:'axis', ...fObj.axis.row })
  }
  return out
}

function MiniFilter({ f }){
  const param = f.parameter || f.param
  const includeVals = [
    ...toArray(f.include_value), ...toArray(f.include_values), ...toArray(f.include_categories), ...toArray(f.include)
  ]
  const excludeVals = [
    ...toArray(f.exclude_value), ...toArray(f.exclude_values), ...toArray(f.exclude_categories), ...toArray(f.exlude_categories), ...toArray(f.exlude_values), ...toArray(f.exclude)
  ]
  const legacy = f.values ?? f.check
  const toChips = (vals, tone)=>{
    const arr = vals.slice(0,3)
    const more = Math.max(0, vals.length - arr.length)
    const toneClass = tone==='inc' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
    return (
      <>
        {arr.map((v,i)=>(<span key={i} className={"inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border " + toneClass}>{valueToLabel(v)}</span>))}
        {more>0 && <span className='inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200'>+{more} more</span>}
      </>
    )
  }
  return (
    <div className='flex flex-wrap items-center gap-2 text-[11px]'>
      {param && <span className='inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 border border-slate-200'>param: {param}</span>}
      {includeVals.length>0 && <span className='inline-flex items-center gap-1'><span className='uppercase text-emerald-700 font-semibold'>include</span>{toChips(includeVals,'inc')}</span>}
      {excludeVals.length>0 && <span className='inline-flex items-center gap-1'><span className='uppercase text-rose-700 font-semibold'>exclude</span>{toChips(excludeVals,'exc')}</span>}
      {includeVals.length===0 && excludeVals.length===0 && legacy !== undefined && toChips(toArray(legacy), 'inc')}
    </div>
  )
}

function isDataSource(n){
  const sc = n?.sourceCounts || {}
  return (sc.import ?? 0) === 0 && ((sc.origin ?? 0) > 0 || (sc.alt_origin ?? 0) > 0)
}

function collectBranches(node, path = [], out = []){
  const next = [...path, node]
  if (isDataSource(node) || !Array.isArray(node.children) || node.children.length===0){
    out.push(next)
    return out
  }
  for(const child of node.children){ collectBranches(child, next, out) }
  return out
}

export default function FunnelHierarchy({ root }){
  const { layers, branchCount } = useMemo(()=>{
    if(!root) return []
    const paths = collectBranches(root).map(p=>p.slice().reverse())
    const maxLen = Math.max(0, ...paths.map(p=>p.length))
    const out = []
    for(let li=0; li<maxLen; li++){
      const map = new Map()
      paths.forEach((p, bIdx)=>{
        const n = p[li]
        if(!n) return
        const id = n.primitive?.id ?? n.node?.id ?? `${li}-${bIdx}`
        if(!map.has(id)) map.set(id, { node: n, from: [] })
        map.get(id).from.push(bIdx)
      })
      out.push(Array.from(map.values()))
    }
    return { layers: out, branchCount: paths.length }
  }, [root])

  if (!root) return null

  return (
    <div className='w-full overflow-x-auto'>
      <div className='flex flex-col gap-5 min-w-full'>
        {layers.map((row, ri)=> (
          <div key={ri}
               className='grid gap-3 items-start'
               style={{ gridTemplateColumns: `repeat(${Math.max(branchCount,1)}, minmax(16rem, 1fr))` }}>
            {row.map((entry, ci)=>{
              const n = entry.node
              const isSource = isDataSource(n)
              const title = n.primitive?.title ?? n.node?.title ?? `#${n.primitive?.plainId ?? ''}`
              const filters = gatherFilters(n)
              const inputs = entry.from.length
              // compute column span from covered branches
              const start = Math.min(...entry.from) + 1
              const end = Math.max(...entry.from) + 2
              return (
                <div key={ci}
                     className={clsx('rounded-lg border p-2 shadow-sm', isSource ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200') }
                     style={{ gridColumn: `${start} / ${end}` }}>
                  <div className='flex items-center justify-between'>
                    <div className={clsx('text-sm font-semibold truncate', isSource ? 'text-amber-900' : 'text-slate-700')}>
                      {isSource ? 'Source: ' : ''}{title}
                    </div>
                    <div className='text-[11px] text-slate-500 flex items-center gap-2'>
                      {ri>0 && <span>in: <span className='font-semibold text-slate-700'>{inputs}</span></span>}
                      <span>out: <span className='font-semibold text-slate-700'>{n.count}</span></span>
                    </div>
                  </div>
                  {!isSource && filters.length>0 && (
                    <div className='mt-1 space-y-1'>
                      {filters.map((f, fi)=>(<MiniFilter key={fi} f={f} />))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
