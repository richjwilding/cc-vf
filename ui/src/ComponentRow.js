import React, { useMemo } from 'react';
import { ArrowsPointingInIcon, CheckIcon,EllipsisVerticalIcon, EyeIcon, MagnifyingGlassIcon, PlusCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Transition } from '@headlessui/react'
import { SummaryCard } from './SummaryCard';
import { EvidenceCard } from './EvidenceCard';
import { PrimitiveCard } from './PrimitiveCard';
import NewPrimitive from './NewPrimitive';
import MainStore from './MainStore';
import PrimitivePicker from './PrimitivePicker';
import { motion, AnimatePresence } from "framer-motion"
import useDataEvent from './CustomHook';
import { HeroIcon } from './HeroIcon';



function ChevronRightIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}


  const relationshipConfig =  {
      "negative":{
          key: "negative",
          icon: "HandThumbDownIcon",
          color: 'amber',
      },
      "positive":{
          key: "positive",
          icon: "HandThumbUpIcon",
          color: 'green',
      }
    }


export function ComponentRow(props) {
    const c = props.component
    const currentPhaseId = props.primitive.referenceParameters?.phase
    const levels = (c && c.levels ? Object.values(c.levels).sort((a,b)=>a.order - b.order) : [])
    const color = props?.primitive?.framework?.lenses && props.primitive.framework.lenses[c.lens] || {base: "slate",
      background: 'white',
      header: "linear-gradient(90deg, rgb(212 212 212) 40%, rgb(217 217 223) 100%)"
      }


    const [expand, setExpand] = React.useState(false)
    const gridRef = React.useRef()
    const shadowRef = React.useRef()
    const [showNew, setShowNew] = React.useState(false)
    const [showPicker, setShowPicker] = React.useState(false)
    const [targetLevel, setTargetLevel] = React.useState(false)
    const [targetHypothesis, setTargetHypothesis] = React.useState(false)
    const [currentLevelId, setCurrentLevelId] = React.useState( ((props.primitive &&  props.primitive.referenceParameters.levels ? props.primitive.referenceParameters.levels[c.id] : undefined) || levels[0].id))
    const [renderContent, setRenderContent] = React.useState(true)
    
    let current_level = c.levels[currentLevelId]
    let current_level_idx = levels.findIndex((d)=>d.id === currentLevelId)
    const showStats = props.showStats

    const [fullTextIdx, setFullTextIdx] = React.useState(current_level_idx)

    const handleScroll =(e)=>{
      let opacity = Math.min((e.target.scrollLeft / e.target.scrollWidth) * 20, 1)
      shadowRef.current.style.opacity = opacity
    }
    useDataEvent("set_parameter", props.primitive?.id, ()=>{
      if(props.primitive){
        setCurrentLevelId(props.primitive.referenceParameters.levels[c.id] || 0)
      }
    })

    React.useEffect(() => {
      gridRef.current.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        if( gridRef.current ){
          gridRef.current.removeEventListener('scroll', handleScroll);
        }
      };
  }, [gridRef.current]);

    React.useLayoutEffect(()=>{
      if( shadowRef.current && gridRef.current ){
        shadowRef.current.style.height = `${gridRef.current.offsetHeight}px`
      }
    }, [])
    React.useLayoutEffect(()=>{
      setProgress(currentLevelId)
    }, [currentLevelId])
    
    const setProgress = ( id )=>{
      if( gridRef.current ){
        const newIdx = levels.findIndex((d)=>d.id === id)
        const elements = [...gridRef.current.querySelectorAll(`.ccheaderrow`)]
        const pads = [...gridRef.current.querySelectorAll(`.ccheaderrow .mytest`)]
        elements.shift()
        if( newIdx !== undefined && elements ){
          if(elements[ newIdx]){
            const newSpacer = pads[newIdx]
            const widths = pads.map((n)=>parseInt(n.style.minWidth) )
            const minW = Math.min(...widths)
            if( newSpacer ){
              const newW = elements[newIdx].offsetWidth 
              
              pads.forEach((pad, idx)=>{
                if( idx === newIdx){
                  pad.style.minWidth = `${newW}px`
                }else{
                  pad.style.minWidth = `${minW}px`
                }
              })
            }


          }
        }
      }
    }


    const setTarget = ( id )=>{
      if( id != currentLevelId ){
        props.primitive.setParameter(`levels.${c.id}`, id)
        setProgress(id)
        setCurrentLevelId(id)
      }
    }

    const mini = true
    const compact = props.compact 
    const editable = (!props.compact && props.primitive)
    const hypothesis_list = ((!props.compact || showStats )&& props.primitive) ? props.primitive.primitives.hfc[c.id].allUniqueHypothesis : []//
    const hypothesis_count = hypothesis_list.length
    const activity_count = showStats ? hypothesis_list.map((d)=>d.primitives.allActivity).flat().filter((d,i,a)=>a.findIndex((d2)=>d2.id===d.id)===i).length : undefined

    useDataEvent("relationship_update", hypothesis_list.map((d)=>d.id) )


                              
    const pickHypothesis = async ()=>{
      setShowPicker({type:'hypothesis', action:async (pick)=>{
        if( pick && props.primitive){
          await props.primitive.addRelationship(pick, {hfc: c.id})
        }
      }})
    }
    const pickEvidence = async (hypothesis, level)=>{
      setShowPicker({type:'evidence', action:async (pick)=>{
        if( pick && hypothesis && level ){
          await hypothesis.addRelationship(pick, {assessment: {[props.primitive.id]: {component: {[c.id]: {levels: {[level.id]: "positive"}} }}}})
          console.log({assessment: {[props.primitive.id]: {component: {[c.id]: {levels: {[level.id]: "positive"}} }}}})
          await props.primitive.addRelationship(pick, {component: {[c.id]: {hypothesis: {[hypothesis.id]:{levels: level.id} }}}})
        }
      }})
    }

    const unlinkEvidence = async (p,hypothesis, level)=>{
      if( p && hypothesis && level && props.primitive){
          const root = `assessment.${props.primitive.id}.component.${c.id}.levels.${level.id}`
          const rel = p.parentPaths(hypothesis).find((d)=>d.substr(0, root.length) == root)
          if( rel ){
            await hypothesis.removeRelationship( p, rel)
            await props.primitive.removeRelationship(p, {component: {[c.id]: {hypothesis: {[hypothesis.id]:{levels: level.id} }}}})
          }
      }
    }

    const unlinkHypothesis = async (p)=>{
      if( p && props.primitive){
          for( const d of (p.primitives.fromPath(`assessment.${props.primitive.id}.component.${c.id}`)?.uniqueAllItems || [])){
            const paths = d.parentPaths(p)
            for(const path of paths){
              //console.log(`remove h link ${d.plainId} @ ${path}`)
              await p.removeRelationship(d, path)
            }
          }

          for( const d of (props.primitive.primitives.fromPath(`component.${c.id}.hypothesis.${p.id}`)?.uniqueAllItems || [])){
            const paths = d.parentPaths(props.primitive)
            for(const path of paths){
//              console.log(`remove a link ${d.plainId} @ ${path}`)
              if( path === "origin"){
                await MainStore().removePrimitive( d )
              }
              await props.primitive.removeRelationship(d, path)
            }
          }
          await props.primitive.removeRelationship(p, {hfc: c.id})
      }
    }

    const createHypothesis = async ()=>{
      if( props.primitive === undefined || c === undefined){return}
      await MainStore().createPrimitive({type: "hypothesis", parent: props.primitive, parentPath:{hfc: c.id}})
    }
    const createEvidence = (hypothesis, level)=>{
      setTargetHypothesis( hypothesis )
      setTargetLevel( level )
      setShowNew( true )
    }
    const handleCreate = async (newPrim)=>{
      console.log(newPrim)
      if( newPrim && targetHypothesis && targetLevel ){
        await targetHypothesis.addRelationship(newPrim, {assessment: {[props.primitive.id]: {component: {[c.id]: {levels: {[targetLevel.id]: "positive"}} }}}})
        await props.primitive.addRelationship(newPrim, {component: {[c.id]: {hypothesis: {[targetHypothesis.id]:{levels: targetLevel.id} }}}})
      }
      setShowNew(null)
    }

    let last_index = levels.length - 1

    const expandIdx = props.showFullText ? fullTextIdx : current_level_idx
    let columnMap
    if( compact ){
      columnMap = `8em repeat(${last_index}, 1fr) 0.5fr ${showStats ? 'min-content' : ''}`
    }else{
      const mainColumn = props.showFullText ? `calc(100% - ${(18 + (levels.length - 1) * 2.5)}rem)` : "4fr"
      columnMap = `18em repeat(${levels.length }, min-content)`
    }

    return (<>
        {showPicker && <PrimitivePicker  type={showPicker.type} callback={showPicker.action} setOpen={()=>setShowPicker(null)} />}
        {showNew && <NewPrimitive title='New Evidence' type='evidence' parent={props.primitive} done={(data)=>handleCreate(data)} cancel={()=>setShowNew(false)}/>}
        <li key={c.id} 
          onClick={props.onClick}
          className={[compact ? "cursor-pointer" :"",
                      showStats ? "" : 'pr-4',
                      "@container group duration-200 bg-white flex ",
                      compact ? `${mini ? 'pb-3' : 'pt-3 pb-3'}` : "pt-6 pb-5 h-full",
                      props.showFullText ? "" : `hover:bg-${color.base}-50`,
                      `active:bg-white border border-transparent border-b-gray-200 hover:border-${color.base}-500 active:border-${color.base}-600 hover:border-[1px]`
                    ].join(" ")}
        >
        <div  key='grid' ref={gridRef} 
              className={`relative grid scrollbar-hide w-full overflow-x-auto ${compact ? "overflow-y-hidden" : "overflow-y-auto"} transition-[min-height] duration-[300ms] min-h-[3.5em] `} 
                style={{
                  gridTemplateRows: compact ? undefined : `repeat(${hypothesis_count + 1}, min-content) max-content` , 
                  gridTemplateColumns: columnMap 
                }}
          >
          <div key='header' className={`ccheaderrow col-start-1 row-start-1 pl-4 bg-white left-0 top-0 sticky z-[25] relative w-full} ${(props.compact && props.showInfo) ? "min-h-[6rem]" : "" }`}>
            <p className={`text-sm px-2 ${mini ? `mt-6 text-${color.base}-50 bg-${color.base}-600 py-0 font-bold` : `py-1 text-${color.base}-900`}`}>VF{c.order + 1}:{c.title}</p>
            {!mini && <div className='-mt-1 h-5 w-full' style={{background: color.header}}></div>}
            {(!compact || props.showInfo) && 
                <p 
                  className={`ccleveltitle current mt-1 px-2 py-1 uppercase text-sm font-light leading-6 text-${color.base}-900 ${(props.compact && props.showInfo) ? "fixed" : "" }` }>{c.description}</p>
              }
            {!compact && 
              <span 
                onClick={(e)=>{
                  if( !compact ){
                    setExpand(!expand)
                    e.stopPropagation()
                  }
                }}
                className={`inline-flex items-center rounded-full active:bg-${color.base}-300  bg-${color.base}-200 py-px pl-2 pr-0.5 my-2 text-xs font-medium text-${color.base}-900 right-0 transition-opacity opacity-0  group-hover:opacity-50 hover:!opacity-100 `}
              >
                {expand ? "Update"  : "Select level"}
                <ChevronRightIcon strokeWidth='2.5' className={`w-3 mx-1 h-3 text-${color.base}-900 ${expand ? 'rotate-180' : ''}`}/>
              </span>
            }
            {!compact && 
            <div key='shadow'
              ref = {shadowRef}
              className={`absolute top-4 -right-6 w-6 h-full block pointer-events-none`}
              style={{
                background: 'radial-gradient(at left center, rgb(205 205 205 / 68%), rgba(97, 97, 97, 0) 74%)',
                opacity: 0,
                zIndex: 10
              }}
              ></div>
              }
          </div>
              {!compact && hypothesis_list.map((h)=>(
                <div key={h.id} className="bg-white col-start-1 sticky z-10 left-0 px-4 py-1">
                  <PrimitiveCard primitive={h} fields={["title","important"]} bigMargin={true} ringColor={color.base} compact={true}  onClick={props.selectPrimitive ? ()=>props.selectPrimitive(h, {unlink:(p)=>unlinkHypothesis(p)}) : undefined}/>
                </div>
              ))
            }
            {
              <div key='base' className={`bg-white h-11 top-0 sticky z-10  row-start-1 left-0 w-full`} style={{gridColumn: `2 / span ${levels.length}`}}>
                <div className={`bg-${color.base}-200 h-5 mt-6  w-full rounded-r-full`}/>
              </div>
            
            }
            {<motion.div 
                  key='progress' 
                  id='progress' 
                  layout='size'
                  className={`absolute bg-${color.base}-600 h-5 top-6 sticky z-20 row-start-1 col-start-2`} 
                  style={{
                    width: 'calc(100% - 2px)',
                    gridColumnStart: 2,
                    gridColumnEnd: 3 + current_level_idx}}
                    />}
            {<motion.div 
                  key='progress2' 
                  id='progress2' 
                  layout='size'
                  className={`top-6 h-5 sticky z-20 row-start-1 col-start-2 w-full`} 
                  style={{
                    gridColumnStart: 2 + current_level_idx,
                    gridColumnEnd: 2 + current_level_idx}}
                    >
                      <div
                        className={`absolute ${current_level_idx === last_index ? "bg-white" : `bg-${color.base}-200`} h-5 top-0 row-start-1 col-start-2  ${(!compact && !expand && (current_level_idx === last_index && expandIdx !== last_index)) ? "right-0 w-2" : "left-1/2 w-1/2"}`} 
                      />
              </motion.div>}
            { 
              levels.map((l, idx) => {
              let ticked = currentLevelId == undefined ? false :   l.score < current_level.score 
              let current = currentLevelId  === undefined ? idx === 0 : currentLevelId == l.id
//              let currentTarget = l.target && levels.filter((l)=>l.target && l.score >= (current_level?.score || 0))[0]?.id === l.id
              let currentTarget =  currentPhaseId !== undefined && l.target && l.phaseId === currentPhaseId
              let last_item = idx === levels.length - 1
              let push_last_item = last_item && (compact || (!expand && fullTextIdx !== idx) )
              return (
              <div 
                key={`level_${idx}`} 
                id={`level_${idx}`} 
                style={{
                  gridColumn: idx + 2,
                  transitionProperty: 'width',
                  transitionDuration: '300ms',
                  width: compact ? "" : (expand ? "20rem" : (expandIdx !== idx ? "1.75rem" : `calc(100cqw - ${18 + (1.75 * (levels.length - (compact ? 0 : 0.3)))}rem`)),
                }} 
                className={`ccheaderrow  top-6 sticky z-20 group/level row-start-1 text-sm text-center px-0 mt-6 relative flex ${push_last_item ? "justify-end" : "justify-center"} relative`}>
                  <div 
                      style={{height: 'calc(100% - 1.4em)'}}
                    className={[
                      `absolute top-5 w-full`,
                      props.showFullText && !expand && expandIdx === idx ? `bg-${color.base}-100` : "bg-white",
                    ].join(" ")}/>
                
                  <div key='marker' className={`shrink-0 text-gray-900 flex absolute ${currentTarget && current? "-top-1.5 z-20" : "" } min-w-8`}>
                    {!currentTarget && ticked  && !current && <div className={`h-2 w-2 mt-1.5 mx-auto ${l.target ? `bg-${color.base}-200` : `bg-${color.base}-700`} rounded-full`}></div>}
                    {!currentTarget && current && <div className={`h-5 w-5 mx-auto border-${color.base}-600 bg-${color.base}-600 rounded-[50%] border-2 place-items-center	flex`}><ChevronRightIcon strokeWidth='2.5' className={`w-6 h-6 text-${color.base}-100`}/></div>}
                    {!currentTarget && !(ticked  || current) && <div className={`h-2 w-2 mt-1.5 mx-auto  ${l.target ? `bg-${color.base}-50` : `bg-${color.base}-300`} rounded-full place-items-center	flex ${last_item ? "mr-1.5" : ""}`}></div>}
                    {currentTarget && !current && <div className={`h-5 w-5 mx-auto ${`bg-${color.base}-50`} rounded-[50%] border-4 border-${color.base}-600`} />}  
                    {currentTarget && current && <div className={`h-8 w-8 mx-auto ${`bg-${color.base}-50`} rounded-[50%] border-4 border-${color.base}-600 flex place-items-center justify-center`} ><CheckIcon strokeWidth='2.5' className={`w-5 h-5 text-${color.base}-600`}/></div>}  
                  </div>
                <Transition
                  className='absolute flex justify-center transition-opacity '
                  key='description'
                  appear={true}
                  show={!compact && (expand || expandIdx === idx)}
                  enter="delay-20 duration-[300ms] "
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="duration-[200ms] delay-[100ms]"
                  leaveFrom="opacity-75"
                  leaveTo="opacity-0"
                  afterLeave={function(){
                    if( compact ){
                        return
                    }
                  }}
                  beforeLeave={function(){
                    this.beforeEnter(true)}
                    }
                  beforeEnter={(min = false)=>{
                    if( !expand || idx == levels.length - 1 ){
                      let height = (min ? [...gridRef.current.querySelectorAll(`.ccheaderrow .ccleveltitle.current`)] : [...gridRef.current.querySelectorAll(`.ccheaderrow .ccleveltitle`)]).map((n)=>n.offsetHeight + 85 + (props.showFullText ? 20 : 0 ))
                      let max_h = height.reduce((a,b)=>b > a ? b : a, 0)
                      gridRef.current.style.setProperty('grid-template-rows', `${max_h}px repeat(${hypothesis_count}, min-content) max-content`, 'important')
                      
                    }
                  }}
                >
                  <div onClick={()=>setTarget(l.id)} className={`pt-8 pb-2 ${currentLevelId === l.id ? 'current' : ''} ${expand  ? '' : '-ml-8em -mr-8em' }  text-${color.base}-900 w-[20em] absolute`}>
                    {!current && <div className={`w-12 h-12 scale-50 invisible opacity-00 group-hover/level:visible group-hover/level:scale-100 group-active/level:scale-125 group-hover/level:opacity-100 transition-opacity transition-transform absolute rounded-full -translate-x-1/2 left-1/2 -top-[1.1em] border-4 text-${color.base}-600 border-${color.base}-600 bg-white p-2`}><ArrowsPointingInIcon/></div>}
                    <p className={['ccleveltitle cursor-pointer ',current ? "current" : ''].join(" ")} >{l.title}</p>
                    {!current && <p className={`mt-1 border-t-2 border-${color.base}-600 uppercase text-${color.base}-950 text-xs invisible group-hover/level:visible`}>Set current level</p>}
                  </div>
                </Transition>
                {props.showFullText && !expand && 
                  <p 
                    onClick={()=>{
                      setRenderContent(false);
                      setFullTextIdx(idx);setTimeout(() => {
                        setRenderContent(true)
                      }, 240)
                    }}
                    className={[
                      idx === fullTextIdx ? "" : "invisible group-hover/level:visible opacity-20 hover:opacity-100",
                      'absolute bottom-0  text-gray-800'
                      ].join(" ")}>
                      <HeroIcon icon='FAUpRightAndDownLeftArrow' className='w-3 h-3 mb-3'/>
                  </p>
                }
              </div>
            )})}
            {showStats && compact && <div className='px-2 bg-white flex flex-col p-1 justify-evenly	'>
                <div className={`rounded-full ${hypothesis_count !== 0 ? `bg-${color.base}-50 text-gray-500` : `bg-${color.base}-100 text-gray-700`} shadow-sm w-max  text-[0.65rem] px-1 py-0.5`}>{hypothesis_count} {hypothesis_count === 1 ? "Hypothesis" : "Hypotheses"}</div>
                <div className={`rounded-full ${activity_count !== 0 ? `bg-${color.base}-50 text-gray-500` : `bg-${color.base}-100 text-gray-700`}  shadow-sm w-max  text-[0.65rem] px-1 py-0.5`}>{activity_count} {activity_count === 1 ? "Activity" : "Activities"}</div>
              </div>}
            { !compact && hypothesis_list && levels.map((l, idx) => {
                return hypothesis_list.map((h, row)=>{
                  const thisLevel = l.id === currentLevelId
//                  let evidence = em ? em[l.id] : undefined

                  const root = `assessment.${props.primitive.id}.component.${c.id}.levels.${l.id}`
                  const evidence = h.primitives.fromPath(root)?.allItems || []

                  let id = `ev_${row}_${idx}`
                  return (<div 
                    key={`${idx}_${row}`}
                      style={{
                        gridColumnStart: idx + 2,
                        gridRowStart: row + 2,
                      }}
                      className='flex border-b-[1px] border-gray-100 p-0.5 flex flex-col @container group/box'
                    >
                    {props.showFullText && <>
                        <div 
                          className={[
                            `ccevblock w-full justify-start h-[calc(100%_-_1em)] place-items-center mb-3 pt-3 `,
                            idx === fullTextIdx ? "@lg:columns-2 @xl:columns-3 @2xl:columns-4 h-fit no-break-children space-y-3" : ""
                            ].join(" ")}>
                          {renderContent && evidence && (idx === fullTextIdx || expand) && evidence.map((d, idx)=>
                            <PrimitiveCard 
                              key={d.id}
                              primitive={d}
                              compact={true}
                              titleAtBase
                              ringColor={color.base} 
                              relationshipId={h.id}
                              relationship={d.parentRelationship(h, root)[0]}
                              relationships={relationshipConfig}
                              onClick={props.selectPrimitive ? (e)=>{
                                props.selectPrimitive(d,
                                  {
                                    unlinkText: `${h.displayType} #${h.plainId} / Level ${l.score}`,
                                    unlink:(p)=>unlinkEvidence(p,h,l)
                                  });
                                  e.stopPropagation()
                                } : undefined} 
                              border={false}
                              showMeta='small-top'
                              bg={`bg-${color.base}-25`}
                              />
                            )}
                        {evidence && !expand && (idx !== fullTextIdx || !renderContent) && (evidence.length > 0) && 
                          <div className={`mt-2 h-6 w-6 mx-auto ${`bg-${color.base}-50`} rounded-full border-2 text-${color.base}-600 border-${color.base}-200 flex place-items-center justify-center text-sm`} >
                            {evidence.length}
                          </div>}
                        </div>
                      </>}
                    {!props.showFullText && <div className={`group-hover:bg-${color.base}-50 justify-start h-[calc(100%_-_1em)] place-items-center w-full`}>
                      {evidence && !expand && !thisLevel && (evidence.length > 0) && 
                        <div className={`mt-2 h-6 w-6 mx-auto ${`bg-${color.base}-50`} rounded-full border-2 text-${color.base}-600 border-${color.base}-600 flex place-items-center justify-center text-sm`} >
                          {evidence.length}
                        </div>}
                      {evidence && (expand || thisLevel) && evidence.map((d, idx)=>
                        <EvidenceCard 
                          key={d.id}
                          onClick={props.selectPrimitive ? (e)=>{props.selectPrimitive(d,{unlink:(p)=>unlinkEvidence(p,h,l)}); e.stopPropagation()} : undefined} 
                          evidence={d} 
                          details={false}//props.evidenceDetail} 
                          sentiment={d.parentRelationship(h.id)[0]} bgColor={`${color.base}-200`} iconColor={`${color.base}-900`}/>
                        )}
                      </div>}
                        {editable && ((props.showFullText && (expand || fullTextIdx === idx)) || (!props.showFullText && (expand || thisLevel))) && 
                          <div className='flex justify-center justify-self-center place-items-center space-x-2 opacity-0 transition-opacity group-hover/box:opacity-100 mt-2'>
                              <button 
                                onClick={()=>createEvidence(h, l) }
                                className='flex justify-center place-items-center py-2 px-2 shrink-0 grow-0 self-center rounded-full border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                                <PlusCircleIcon className='w-6 h-6 align-center'/>
                              </button>
                              <button 
                                onClick={()=>pickEvidence(h, l) }
                                className='flex justify-center place-items-center py-2 px-2 shrink-0 grow-0 self-center rounded-full border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                                <MagnifyingGlassIcon className='w-6 h-6 align-center'/>
                              </button>
                          </div>
                        }
                    </div>
                  )
                })
              })
            }
            {editable &&
            <>
              <div className='p-4 space-y-3 sticky left-0'>
                  <button 
                    onClick={createHypothesis}
                    className='flex justify-center place-items-center py-2 px-2 shrink-0 grow-0 self-center rounded-md border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                    <PlusCircleIcon className='w-6 h-6 align-center mr-2'/>
                    <span className="text-sm">Create a new hypothesis</span>
                  </button>
                  <button 
                    onClick={pickHypothesis}
                    className='flex justify-center place-items-center py-2 px-2 shrink-0 grow-0 self-center rounded-md border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                    <MagnifyingGlassIcon className='w-6 h-6 align-center mr-2'/>
                    <span className="text-sm">Select existing hypothesis</span>
                  </button>
              </div>
            </>
            }
          </div>
        </li>
        </>)
}