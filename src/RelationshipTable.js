import { HeroIcon, SolidHeroIcon } from './HeroIcon';
import { PrimitiveCard } from './PrimitiveCard'
import { Transition } from '@headlessui/react'
import React from 'react';

export function RelationshipTable({relationships, ...props}){
    const [sortColumn, setSortColumn] = React.useState(-1) 
    const sort = (list)=>{
        return list.sort((a,b)=>{

            if( sortColumn == -1){
                if(props.fields)
                {
                    let va = a.item.refereceParameters[props.fields[0]]
                    let vb = b.item.refereceParameters[props.fields[0]]
                    if( va && vb ){
                        return va.localeCompare(vb)
                    }
                }
                return a.item.id - b.item.id
            }
            return (b.relIdx == sortColumn) - (a.relIdx == sortColumn) 
        })
    }
    const scroll = props.maxHeightClass ? `overflow-y-scroll ${props.maxHeightClass}` : ""
    return (
         <>
            <h3 key='title' className={`${props.major ? "text-lg font-bold" : "mt-6"} font-medium text-gray-900`}>{props.title || 'Signficance'}</h3>
            <div 
                key='grid'
                id='grid'
                className={`grid ${scroll} ${props.major ? "mt-6 mx-2" : ""}`}
                style={{gridTemplateColumns: `100% repeat(${relationships.length},minmax(min-content, '1fr') mt-2`}}
              >
                <div 
                    key='title-p'
                    onClick={props.sortable ? ()=>setSortColumn(-1) : undefined}
                    className={`${props.sortable && sortColumn === -1 ? "text-black" : "text-slate-400"} col-start-1 row-start-1 border-b-[1px] border-gray-200 bg-white row-start-1 sticky top-0`}>
                        {props.sortable ? 'Item' : ""}
                </div>
              {
                relationships.map((set, idx)=>(
                  <div 
                    key={`title-${idx}`}
                    onClick={props.sortable ? ()=>setSortColumn(idx ) : undefined}
                    style={{gridColumnStart: idx + 2}}
                    className={`flex ${props.sortable && sortColumn === idx ? "text-black" : "text-slate-400"} font-medium place-items-center bg-white row-start-1 sticky top-0 z-2 text-sm justify-center px-2 py-px border-b-[1px] border-gray-200`}>
                      {set.title}
                      {props.showCounts && 
                        <span className={`ml-2 inline-flex items-center rounded-full px-2 py-px text-xs font-medium bg-${set.bgColor} text-${set.textColor}`}>{set.items.length}</span>
                      }
                  </div>
                ))
              }
              {
                sort(relationships.map((r,idx)=>r.items.map((p)=>({item: p, relIdx: idx, set: r}))).flat()).map((wrapped, row_id)=>(
                    <React.Fragment key={`${wrapped.item.id}_${row_id}`}>
                      <div
                        key='card'
                        className='col-start-1 text-xs p-1 border-b-[1px] border-gray-200'
                      >
                        <PrimitiveCard primitive={wrapped.item} fields={props.fields} inline={props.inline} showId={props.inline ? "number" : true} compact={true} disableHover={true} showLink={true}/>
                      </div>
                      {relationships.map((set,idx)=>(
                        <div 
                            key={`c_${idx}`}
                          className='place-items-center justify-center flex w-full h-full border-b-[1px] border-gray-200'
                          style={{gridColumnStart: idx + 2}}
                        >
                          {idx === wrapped.relIdx && <HeroIcon icon={wrapped.set.icon} style={{gridColumnStart: wrapped.relIdx + 2}} className={`place-self-center mr-0.5 p-1 max-w-6 w-6 h-6 m-0.5 rounded-[4em] bg-${wrapped.set.bgColor} text-${wrapped.set.textColor}`}/>}
                          {idx !== wrapped.relIdx && <div className={`max-w-2 w-2 h-2 rounded-[4em] bg-slate-200`}/>}
                        </div>

                      ))}
                    </React.Fragment>
                ))
              }
            </div>
        </>
  )
}