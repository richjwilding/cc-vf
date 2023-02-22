
import React from 'react';
import { Transition } from '@headlessui/react'
import { HeroIcon } from './HeroIcon';
import {
  ChevronRightIcon,
  CheckIcon
} from '@heroicons/react/20/solid'
import { PrimitiveCard } from './PrimitiveCard';
import { motion } from "framer-motion"

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}


const Item = function(props){
  return (
    <div>
    <div className={
        classNames(
          'relative',
          props.wide ? "px-4 py-3" : "px-4 py-5",
          props.wide && props.color ? `bg-${props.color}-50/30` : ''
        )
      }>
      {props.wide && <div className={`${props.open ? 'shadow-md' : ''} bg-${props.color}-200/30 absolute bottom-0 w-full left-0 `} style={{height: `${props.target ? (props.count / props.target * 100) : 100 }%`}}/>}
      <dt>
        <p className={`truncate ${props.wide ? 'text-xs uppercase' : 'text-md'} font-medium text-${props.color ? `${props.color}-800` : "gray-500"}`}>
          {props.title}
          {props.list && props.wide && 
            <span className={`ml-2 inline-flex items-center rounded-full bg-${props.color}-300/50 px-2 py-px text-xs font-medium text-gray-800`}>
              {props.list.length}
            </span>}
          </p>
      </dt>
      <dd className="mt-1 flex items-baseline justify-between  relative">
        <div className={`flex items-baseline text-2xl font-semibold text-${props.color ? `${props.color}-600` : "indigo-600"}`}>
          {props.count}
          {props.target && <span className={`ml-2 text-sm font-medium text-${props.color ? `${props.color}-800/50` : "gray-500"}`}>out of {props.target}</span>}
        </div>
        {props.met &&
          <CheckIcon
            className="-ml-1 mr-0.5 h-5 w-5 flex-shrink-0 self-center text-green-500"
            aria-hidden="true"
          />
        }
      </dd>
      </div>
      <Transition.Root 
        show={props.open} 
        as='div'
        enter="ease-in-out duration-200"
        enterFrom="max-h-0"
        enterTo="max-h-[40vh]"
        leave="ease-in-out duration-200"
        leaveFrom="max-h-[40vh]"
        leaveTo="max-h-0"
        afterLeave={()=>props.txCallback(props.open)}
        className={classNames(
            "w-full flex h-full",
          )}
         >
          <List list={props.list} color={props.color} onCardClick={props.onCardClick} txPrefix={props.txPrefix}/>
           
      </Transition.Root>
    </div>
  )
}
const List = function(props){

  const wrap = (id, d)=>{
    if( props.onCardClick ){
      return <motion.div key={id} layoutId={id}>{d}</motion.div>
    }
    return d
  }

  return (
    <div className={
        classNames(
          'w-full flex flex-col space-y-1 px-2 py-2 overflow-y-scroll divide-y',
          props.color ? `bg-${props.color}-50/30` : ''
        )
      }>
        {props.list && props.list.length > 0 && props.list.map((p)=>{
          let selectId = props.txPrefix ? `${props.txPrefix}_${p.id}` : p.id
          return  (wrap(
          selectId, <PrimitiveCard 
            key={p.id}
            primitive={p} 
            layoutId={p.id}
            compact={true} 
            flatBorder={true}
            onClick={props.onCardClick ? ((e)=>{e.stopPropagation(); props.onCardClick({primitive: p, id: selectId})}) : undefined}
            fields={['contact','company']} 
            bg='hover:bg-white'/>
          ))})}
        {!props.list || (props.list && props.list.length === 0) && <div className='place-items-center justify-center border-2 border-dashed flex w-full h-full'><p className='text-xs uppercase text-gray-500/50'>None</p></div>}
    </div>
  )
}

export function MetricCard({primitive, metric, ...props}) {
  
  let value = metric.value
  let target 
  let wide = false
  let count = value
  let subgridConfig = {}
  let mainTitle

  const [open, setOpen] = React.useState(false)
  const [fully, setFully] = React.useState(false)

  const toggleExpand =()=>{
    let state = !open
    setOpen(state)
    if( state ){
      setFully(state)
    }
  }

  if( value instanceof(Array) ){
    if( value.length > 1){
      wide = true
      subgridConfig = {gridTemplateColumns: `repeat(${value.length}, 1fr)`}
      mainTitle = metric.title

      value = value.map((v)=>({...v, id: metric.id, title: v.relationshipConfig?.title || v.relationship, color: v.relationshipConfig?.color}))
    }else{
      value = value.map((v)=>({...v, id: metric.id, title: metric.title}))
    }
  }else{
    value = [{...value, id: metric.id, title: metric.title, met: metric.met}]
  }
  return (
    <div
      key={metric.id}
      onClick={props.onClick ? ()=>props.onClick(metric.id) : undefined}
      className={classNames(
        "relative overflow-hidden md:rounded-lg bg-white shadow border-[1px]",
        "",
        wide ? "w-full md:divide-gray-200 divide-y col-start-1 col-span-2 md:col-start-1 md:col-span-3" : ''
      )}
    >
      {mainTitle && 
        <p 
          onClick={toggleExpand}
          className={
            classNames(
              "truncate text-md font-medium text-gray-500 px-4 py-5 w-full flex place-items-center",
            )
          }
        >{mainTitle}
              <ChevronRightIcon strokeWidth={2} className={`ml-1 w-5 h-5 ${open ? '-rotate-90 transform' : ''}`}/>
        </p>
      }

      <div
        className={classNames(
          "divide-y divide-gray-200 md:divide-y-0 md:divide-x md:grid grid-flow-col",
          wide ? "col-start-1 col-span-2 md:col-start-1 md:col-span-3" : ''
        )}
        style={subgridConfig}

      >
        {value.map((metric,idx)=>(<Item key={metric.title} open={open} txPrefix={`${primitive.id}_${metric.id}`} txCallback={setFully} onCardClick={props.onCardClick} title={metric.title} count={metric.count} met={metric.met} target={metric.target} color={metric.color} wide={wide} list={metric.list}/>))}
      </div>
    </div>
  )
}
