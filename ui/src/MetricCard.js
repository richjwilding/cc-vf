
import React, { Fragment } from 'react';
import { Transition } from '@headlessui/react'
import { HeroIcon } from './HeroIcon';
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  EyeIcon,
  ChevronDoubleRightIcon,
  Cog6ToothIcon,
  CheckIcon
} from '@heroicons/react/20/solid'
import { PrimitiveCard } from './PrimitiveCard';
import { motion } from "framer-motion"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import {
  closestCorners,
  pointerWithin,
  DndContext, 
  useDroppable,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import MainStore from './MainStore';
import useDataEvent from './CustomHook';
import { createPortal } from 'react-dom';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}


const Item = function(props){
  return (
    <div key={props.id} id={`item_${props.id}`}>
      <div key="header" className={
          classNames(
            'relative',
            props.title ? (props.wide ? "px-4 py-3" : "px-4 py-5") : 'px-4 pb-4',
            props.wide && props.color ? `bg-${props.color}-50/30` : ''
          )
        }>
        {props.wide && <div className={`${props.open ? 'shadow-md' : ''} bg-${props.color}-200/30 absolute bottom-0 w-full left-0 `} style={{height: `${props.target ? Math.min(100,(props.count / props.target * 100)) : 100 }%`}}/>}
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
            {props.target && <span className={`ml-2 text-sm font-medium ${props.color ? `text-${props.color}-800/50 group-hover:text-${props.color}-800/80` : "text-gray-500 group-hover:text-gray-700"} truncate mr-1`}>vs target of {props.target}</span>}
            {!props.wide && 
              <ChevronDoubleRightIcon 
                className='w-5 h-5 ml-1 pb-1 self-end text-slate-400 invisible group-hover:visible hover:text-slate-600'/>
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
        enterFrom="max-h-0 h-0"
        enterTo="max-h-[40vh] h-[22em]"
        leave="ease-in-out duration-200"
        leaveFrom="max-h-[40vh] h-[22em]"
        leaveTo="max-h-0 h-0"
        afterLeave={()=>props.txCallback(props.open)}
        className={classNames(
            "w-full flex h-full",
          )}
         >
          <List key='list' id={props.id} list={props.list} color={props.color} onCardClick={props.onCardClick} txPrefix={props.txPrefix}/>
           
      </Transition.Root>
    </div>
  )
}
const SortableItem = function(props) {
  let {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({id: props.id})//primitive.plainId});
  
  const style = {
    transform: CSS.Translate.toString(transform),
   transition: "200ms ease"
  };

  attributes = {...attributes, tabIndex: undefined}

  return (
    <SortablePrimitive key={props.primitive.plainId} ref={setNodeRef} style={style} {...attributes} {...listeners} primitive={props.primitive} isDragging={isDragging} onEnter={props.onEnter} selectId={props.selectId}/>
  );

}


  const SortablePrimitive = React.forwardRef(({primitive, isDragging, selectId, onEnter,...props}, ref) => {
    const categories = primitive.origin?.metadata?.resultCategories
    const thisCategory = categories.find((d)=>d.resultCategoryId === primitive.referenceId )
    let fields = thisCategory ? thisCategory.views.list.cards : []

    return (
      <div id={primitive.plainId} ref={ref} {...props} className={`px-2 py-1 ${isDragging ? "opacity-25" : ""}`}>
      <motion.div key={selectId} layoutId={selectId} 
            onDoubleClick={onEnter ? ()=>onEnter({primitive: primitive, plainId: selectId}) : undefined}>
        <PrimitiveCard 
            primitive={primitive} 
            compact={true} 
            flatBorder={true}
            showExpand={true}
            showAsSecondary={true}
            fields={fields} 
            className='border-b-[1px] border-gray-200 '
            onEnter={onEnter ? ()=>onEnter({primitive: primitive, plainId: selectId}) : undefined}
            onClick={(e)=>e.currentTarget.focus()}
            bg='hover:bg-white focus:bg-white'/>
                </motion.div>
      </div>
    )
  });

const List = function(props){
  
  const { setNodeRef } = useDroppable({
    id: props.id
  });
      
  return (
        <SortableContext 
          id={props.id}
          items={props.list.map((d)=>d.plainId)}
          strategy={verticalListSortingStrategy}
        >
        <div 
          ref = {setNodeRef} 
          className={
            classNames(
              'w-full flex flex-col overflow-y-scroll overflow-x-hidden',
              props.color ? `bg-${props.color}-50/30` : ''
            )
          }>
            {props.list && props.list.length > 0 && props.list.map((p)=>{
              let selectId = props.txPrefix ? `${props.txPrefix}_${p.plainId}` : p.plainId
              return (
                <SortableItem id={p.plainId} key={p.plainId} primitive={p} selectId={selectId} onEnter={props.onCardClick}/>
              )
            })}
            {!props.list || (props.list && props.list.length === 0) && <div className='p-2 w-full h-full'><div className='place-items-center justify-center border-2 border-dashed flex w-full h-full'><p className='text-xs uppercase text-gray-500/50'>None</p></div></div>}
        </div>
      </SortableContext>)
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

  const [open, setOpen] = React.useState(false)
  const [fully, setFully] = React.useState(false)

  let analysis = open ? metric.analysis : undefined

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
    if( metric.type === "sum"){
        let val = value
        let unit = ""
        if( val > 1000 ){
          val = val / 1000
          unit = "K"
        }
        if( val > 1000 ){
          val = val / 1000
          unit = "M"
        }

      value = [{count: `$${val}${unit}`, id: metric.id, title: undefined, met: metric.met}]
    }else{
      value = [{...value, id: metric.id, title: undefined, met: metric.met}]
    }
  }

  const initList = ()=>{
    return value.reduce((o, v,idx)=>{
      o[v.relationship] = v.list
      return o 
    }, {})
  }

  const [items, setItems] = React.useState(initList())

  const [activeDragId, setActiveDragId] = React.useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor,{
      activationConstraint: {
        delay: 120,
        tolerance: 15,
      },
    }),
  );
  useDataEvent("relationship_update", primitive.id, ()=>{
    value = metric.value
    setItems( initList() )
  })


  function handleDragStart(event) {
    const {active} = event;
    setActiveDragId(active.id);
  }

  const activeDrag = activeDragId ? value.map((v)=>v.list || []).flat().find((d)=>d.plainId === activeDragId) : undefined
  
  function handleDragEnd(event) {
    const {active, over} = event;
    if( over ){
      const oldSlot = value.find((v)=>v.list.map((d)=>d.plainId).includes(active.id))?.relationship
      const newSlot = findContainer(over.id)

      if( oldSlot !== newSlot ){
        //primitive.primitives.move( activeDrag.id, {results: {[metric.id]:oldSlot}}, {results: {[metric.id]:newSlot}})
        primitive.moveRelationship( activeDrag, MainStore().extendPath(metric.path, oldSlot), MainStore().extendPath(metric.path, newSlot))
      }
    }
    
    setActiveDragId(null);
  }



  function findContainer(id) {
    if (id in items) {
      return id
    }
    return Object.keys(items).find((key) => items[key].findIndex((d)=>d.plainId === id) > -1)
  }

  function handleDragOver(event) {
    const { active, over, draggingRect } = event;
    const { id } = active;
    if( over === null){
      return
    }
    const { id: overId } = over;

    // Find the containers
    const activeContainer = findContainer(id);
    const overContainer = findContainer(overId);
    if (
      (activeContainer === undefined) ||
      (overContainer === undefined) ||
      (activeContainer === overContainer)
    ) {
      return;
    }
    setItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];

      // Find the indexes for the items
      const activeIndex = activeItems.findIndex((p)=>p.plainId === id);
      const overIndex = overItems.findIndex((p)=>p.plainId === overId);

      let newIndex;
      if (overId in prev) {
        newIndex = overItems.length + 1;
      } else {
        newIndex = overIndex >= 0 ? overIndex : overItems.length + 1;
      }

      return {
        ...prev,
        [activeContainer]: [
          ...prev[activeContainer].filter((item) => item.plainId !== active.id)
        ],
        [overContainer]: [
          ...prev[overContainer].slice(0, newIndex),
          items[activeContainer][activeIndex],
          ...prev[overContainer].slice(newIndex, prev[overContainer].length)
        ]
      };
    });
  }

  return (
    <div
      id={`m_${metric.id}`}
      key={metric.id}
      className={classNames(
        "relative overflow-hidden md:rounded-lg bg-white shadow border-[1px] flex flex-col justify-between group",
        props.className,
        wide ? `w-full md:divide-gray-200 divide-y col-start-1 ${props.wideSizeClasses}` : ''
      )}
    >
      {props.editMetric && <Cog6ToothIcon
        className='w-5 h-5 absolute z-10 right-2 top-2 invisible group-hover:visible text-gray-300 hover:text-gray-900'
        onClick={()=>props.editMetric(metric)}
        />}
      {mainTitle && 
        <p
          key='title' 
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

      <DndContext 
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
      <div
        key="detail"
        className={classNames(
          "divide-y divide-gray-200 md:divide-y-0 md:divide-x @xl:grid grid-flow-col",
          wide ? `col-start-1 col-span-2 md:col-start-1 md:col-span-3` : ''
        )}
        style={subgridConfig}

      >
        
        {value.map((metric,idx)=>(<Item id={metric.relationship} key={`${metric.id}_${idx}`} list={items[metric.relationship]} onClick={props.onClick}  clickId={metric.id} open={wide && open} txPrefix={`${primitive.plainId}_${metric.id}`} txCallback={setFully} onCardClick={props.onCardClick} title={metric.title} count={metric.count} met={metric.met} target={metric.target} color={metric.color} wide={wide} />))}
          </div>
          {createPortal(
        <DragOverlay style={{border: "unset"}}>
          <div className='px-2 py-1' style={{cursor: "grab"}}>
          {activeDragId && <PrimitiveCard 
              key={activeDrag.plainId}
              primitive={activeDrag} 
              compact={true} 
              fields={['contact','company']} 
              dragShadow={true}
              //bg='hover:bg-white'
              />}
              </div>
        </DragOverlay>,document.body)}
      </DndContext>
      {(open && analysis && !wide) && <HBar onClick={props.onClick} clickId={metric.id} primitive={primitive} metric={metric} analysis={analysis}/>}
    </div>
  )
}
