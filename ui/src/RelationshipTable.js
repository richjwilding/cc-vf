import { HeroIcon, SolidHeroIcon } from './HeroIcon';
import { PrimitiveCard } from './PrimitiveCard'
import { Transition } from '@headlessui/react'
import { motion } from 'framer-motion';
import React from 'react';
import {
  ChevronDownIcon,
  ArrowRightCircleIcon,
  ChevronUpIcon,
} from '@heroicons/react/20/solid'

export function RelationshipTable({relationships, ...props}){
    const [sortColumn, setSortColumn] = React.useState(-1) 
    const [reverseSort, setReverseSort] = React.useState(false) 
    const sort = (list)=>{
        let sorted = list.sort((a,b)=>{

            if( sortColumn == -1){
              let va =  a.item.id.toString()
              let vb =  b.item.id.toString()
                if(props.fields)
                {
                  let sort = props.fields[0]
                  if( sort === "contact"){sort = "contactName"}
                  va = a.item.referenceParameters[sort] || va
                  vb = b.item.referenceParameters[sort] || vb
                }
                return va.localeCompare(vb)
            }
            return (b.relIdx == sortColumn) - (a.relIdx == sortColumn) 
        })
        if( reverseSort){
            return sorted.reverse()
        }
        return sorted
    }

    const sortByColumn = (idx)=>{
        if( idx === sortColumn ){
            setReverseSort(!reverseSort)
            return
        }
        setReverseSort(false)
        setSortColumn(idx)
    }

    const scroll = props.maxHeightClass ? `overscroll-contain overflow-y-scroll ${props.maxHeightClass}` : ""
    return (
         <>
            {props.title && <h3 key='title' className={`${props.major ? "text-lg font-bold" : "mt-6"} font-medium text-gray-900`}>{props.title || 'Signficance'}</h3>}
            <div 
                key='grid'
                id='grid'
                className={`grid ${scroll} ${props.major ? "mt-6 mx-2" : "mt-2"}`}
                style={{gridTemplateColumns: `fit-content(80%) repeat(2, 1fr)`}}
              >
                <div 
                    key='title-p'
                    onClick={props.sortable ? ()=>sortByColumn(-1) : undefined}
                    className={`${props.sortable && sortColumn === -1 ? "text-black" : "text-slate-400"} flex z-10 place-items-center col-start-1 row-start-1 border-b-[1px] border-gray-200 bg-white row-start-1 sticky top-0`}>
                        {props.sortable && sortColumn === -1 && <ChevronDownIcon className={`w-3 h-3 ${reverseSort ? "rotate-180" : ""}`}/>}
                        {props.sortable ? 'Item' : ""}
                </div>
              {
                relationships.map((set, idx)=>(
                  <div 
                    key={`title-${idx}`}
                    onClick={props.sortable ? ()=>sortByColumn(idx ) : undefined}
                    style={{gridColumnStart: idx + 2}}
                    className={`flex ${props.sortable && sortColumn === idx ? "text-black" : "text-slate-400"} z-10 font-medium place-items-center bg-white row-start-1 sticky top-0 z-2 text-sm justify-center px-2 py-px border-b-[1px] border-gray-200`}>
                        {props.sortable && sortColumn === idx && <ChevronDownIcon className={`w-3 h-3 ${reverseSort ? "rotate-180" : ""}`}/>}
                      {set.title}
                      {props.showCounts && 
                        <span className={`ml-2 inline-flex items-center rounded-full px-2 py-px text-xs font-medium bg-${set.bgColor} text-${set.textColor}`}>{set.items.length}</span>
                      }
                  </div>
                ))
              }
              {
                sort(relationships.map((r,idx)=>r.items.map((p)=>({item: p, relIdx: idx, set: r}))).flat()).map((wrapped, row_id)=>{
                  let highlight = props.highlight === wrapped.item.id
                  let max = relationships.length - 1
                  return (
                    <React.Fragment key={`${wrapped.item.id}_${row_id}`}>
                      <div
                        key='card'
                        className={`col-start-1 overflow-x-scroll text-xs p-1 border-b-[1px] border-gray-200 relative`}
                      >
                        {highlight && <div style={{borderborderRadius: "12px 0px 0px 12px", height: 'calc(100% - 4px)'}} className='border-ccgreen-600 border-2 pointer-events-none	 border-r-0 rounded-l-xl col-span-3 left-0 top-[2px] absolute w-full'/>}
                        <PrimitiveCard bg='bg-transparent' className='w-fit' primitive={wrapped.item} fields={props.fields} inline={props.inline} showId={props.inline ? "number" : true} compact={true} disableHover={true} showLink={true}/>
                      </div>
                      {relationships.map((set,idx)=>(
                        <div 
                            key={`c_${idx}`}
                          className='place-items-center justify-center flex w-full h-full border-b-[1px] border-gray-200 relative'
                          style={{gridColumnStart: idx + 2}}
                        >
                            {highlight && <div style={{height: 'calc(100% - 4px)'}} className={`border-ccgreen-600 border-2 pointer-events-none border-l-0 col-span-3 left-0 top-[2px] absolute w-full ${idx === max ? "rounded-r-xl" : "border-r-0 "}`}/>}
                          <div 
                            onClick={props.updateRelationship ? (e)=>{e.stopPropagation();props.updateRelationship(wrapped.item, set)} :undefined} 
                            className='min-w-[1.25em] min-h-[1.25em] relative  p-1 group flex place-items-center justify-center'
                            >
                            {idx === wrapped.relIdx && <HeroIcon icon={wrapped.set.icon} style={{gridColumnStart: wrapped.relIdx + 2}} className={`place-self-center mr-0.5 p-1 max-w-6 w-6 h-6 m-0.5 rounded-[4em] text-${wrapped.set.textColor} bg-${wrapped.set.bgColor}`}/>}
                            {idx !== wrapped.relIdx && <div className={props.updateRelationship ? "max-w-3 w-3 h-3 border-[0.2rem] border-white rounded-[4em] bg-slate-200 group-hover:border-[0.1rem] active:bg-slate-300" : "z-20 max-w-4 w-2 h-2 rounded-[4em] bg-slate-200"}/>}
                          </div>
                        </div>

                      ))}
                    </React.Fragment>
                )})
              }
            </div>
        </>
  )
}