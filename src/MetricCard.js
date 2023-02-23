
import React, { Fragment } from 'react';
import { Transition } from '@headlessui/react'
import { HeroIcon } from './HeroIcon';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  EyeIcon,
  ChevronDoubleRightIcon,
  CheckIcon
} from '@heroicons/react/20/solid'
import { PrimitiveCard } from './PrimitiveCard';
import { motion } from "framer-motion"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}


const Item = function(props){
  return (
    <div>
    <div className={
        classNames(
          'relative',
          props.title ? (props.wide ? "px-4 py-3" : "px-4 py-5") : 'px-4 pb-4',
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
      <dd 
          onClick={props.onClick ? ()=>props.onClick(props.clickId) : undefined}
        className={`mt-1 flex items-baseline justify-between  relative ${props.wide ? "" : "group"}`}>
        <div 
          className={`flex items-baseline text-2xl font-semibold ${props.color ? `text-${props.color}-600 group-hover:text-${props.color}-800` : "text-indigo-600 group-hover:text-indigo-800"}`}>
          {props.count}
          {props.target && <span className={`ml-2 text-sm font-medium ${props.color ? `text-${props.color}-800/50 group-hover:text-${props.color}-800/80` : "text-gray-500 group-hover:text-gray-700"}`}>vs target of {props.target}</span>}
          {!props.wide && 
            <ChevronDoubleRightIcon 
              className='w-5 h-5 ml-1 pb-1 self-end text-slate-300 invisible group-hover:visible hover:text-slate-600'/>
            }
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


const HBar = function({primitive, metric, analysis, ...props}){
  const [optionIdx, setOptionidx] = React.useState(0)

  const dataset = analysis[optionIdx]

  if( dataset === undefined ){
    return <div className='flex-grow p-4 bg-gray-50'><div className='place-items-center justify-center border-2 border-dashed flex w-full h-full'><p className='text-xs uppercase text-gray-500/50'>None</p></div></div>
  }


  const title = dataset.title
  const data = dataset.data[0].data
  const count = Object.values(data).flat().length

  const switchItem = (next = false)=>{
    let target = optionIdx + (next ? 1 : -1) 
    if( target == -1){
      target = analysis.length - 1
    }else if( target === analysis.length){
      target = 0
    }
    setOptionidx(target)
  }

  return (
    <div className='p-4 w-full h-full flex flex-col justify-between bg-gray-50'>
      <div 
        style={{gridTemplateColumns: 'fit-content(40%) 1fr'}}
        className='w-gull grid grid-cols-2 gap-2 pb-2'>
        {Object.keys(data).map((k)=>(
          <Fragment key={k}>
            <p title={k} className='text-xs text-slate-500 mr-1 truncate'>{k}</p>
            <div 
              onClick={props.onClick ? ()=>props.onClick(props.clickId) : undefined}
              className={`bg-white w-full  p-px relative group`}>
              <div 
                style={{width: `${parseInt(data[k].length / count * 100)}%`}}
                className={`bg-indigo-200 group-hover:bg-indigo-300 absolute top-0 left-0 h-full p-px`}/>
                <p className='absolute top-0 left-0 w-full text-xs text-slate-800 text-center'>{data[k].length}</p>
            </div>
          </Fragment>
        ))}
      </div>
      <div className='col-span-2 w-full ml-auto border-t border-gray-200 mt-0.5 pt-2 flex justify-end place-items-center'>
        <p className='text-xs uppercase text-slate-500 '>{title}</p>
        <button onClick={(e)=>{e.stopPropagation(); switchItem(true)}} className='mx-1 p-px rounded-sm border-[1px] border-slate-200 hover:border-slate-500'><ChevronLeftIcon className='w-3 h-3'/></button>
        <button onClick={(e)=>{e.stopPropagation(); switchItem(false)}} className='mx-1 p-px rounded-sm border-[1px] border-slate-200 hover:border-slate-500'><ChevronRightIcon className='w-3 h-3'/></button>
      </div>
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
  let analysis = metric.analysis

  const [open, setOpen] = React.useState(false)
  const [fully, setFully] = React.useState(false)

  React.useEffect(()=>{
    if( props.groupOpen !== undefined){
      setOpen(props.groupOpen)
    }
  }, [props.groupOpen])

  const toggleExpand =(e)=>{
    let state = !open
    if( props.groupOpen !== undefined){
      props.groupControl(state)
      return
    }
    e.stopPropagation()
    setOpen(state)
    if( state ){
      setFully(state)
    }
  }

      mainTitle = metric.title
  if( value instanceof(Array) ){
    if( value.length > 1){
      wide = true
      subgridConfig = {gridTemplateColumns: `repeat(${value.length}, 1fr)`}

      value = value.map((v)=>({...v, id: metric.id, title: v.relationshipConfig?.title || v.relationship, color: v.relationshipConfig?.color}))
    }else{
      value = value.map((v)=>({...v, id: metric.id, title: undefined}))
    }
  }else{
    value = [{...value, id: metric.id, title: undefined, met: metric.met}]
  }
  return (
    <div
      key={metric.id}
      className={classNames(
        "relative overflow-hidden md:rounded-lg bg-white shadow border-[1px] flex flex-col justify-between",
        props.className,
        wide ? "w-full md:divide-gray-200 divide-y col-start-1 col-span-2 md:col-start-1 md:col-span-3" : ''
      )}
    >
      {mainTitle && 
        <p 
          onClick={toggleExpand}
          className={
            classNames(
              "truncate shrink-0 text-md font-medium text-gray-500 px-4 pt-5 w-full flex place-items-center hover:text-gray-900",
              wide ? "pb-5" : 'pb-1'
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
        {value.map((metric,idx)=>(<Item key={metric.title} onClick={props.onClick}  clickId={metric.id} open={wide && open} txPrefix={`${primitive.id}_${metric.id}`} txCallback={setFully} onCardClick={props.onCardClick} title={metric.title} count={metric.count} met={metric.met} target={metric.target} color={metric.color} wide={wide} list={metric.list}/>))}
      </div>
      {(open && analysis && !wide) && <HBar onClick={props.onClick} clickId={metric.id} primitive={primitive} metric={metric} analysis={analysis}/>}
    </div>
  )
}
