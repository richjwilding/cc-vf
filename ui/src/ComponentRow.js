import React from 'react';
import { CheckIcon,EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { Transition } from '@headlessui/react'
import { SummaryCard } from './SummaryCard';
import { EvidenceCard } from './EvidenceCard';
import { PrimitiveCard } from './PrimitiveCard';



function ChevronRightIcon(props) {
  return (
    <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}


const colors = [{
    base: "ccgreen",
    background: 'white',//'linear-gradient(hsl(146deg 70% 97%) 20%, rgb(251, 254, 252) 60%)',
    header: "linear-gradient(90deg, rgb(187 243 212) 40%, rgb(0 217 103) 100%)"
    },{
    base: "ccblue",
    background: 'white',//"linear-gradient(rgb(245 250 255) 20%, rgb(251, 251, 254) 60%)",
    header: "linear-gradient(90deg, rgb(194 227 255) 40%, rgb(6 148 255) 100%)"
    },{
    base: "ccpurple",
    background: 'white',//'linear-gradient(#fdfaff 20%, hwb(276deg 98% 0%) 60%)',
    header: "linear-gradient(90deg, #e9ceff 40%, rgb(199 129 255) 100%)"
    }]
export function ComponentRow(props) {

    const [expand, setExpand] = React.useState(false)
    const [reveal, setReveal] = React.useState(true)
    const gridRef = React.useRef()
    const shadowRef = React.useRef()

    const handleScroll =(e)=>{
      let opacity = Math.min((e.target.scrollLeft / e.target.scrollWidth) * 20, 1)
      shadowRef.current.style.opacity = opacity
    }

    React.useEffect(() => {
      if( props.compact ){
        setExpand(false)
        setReveal(false)
      }
    }, [props.compact])
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
    }, [reveal])

    const mini = true
    const c = props.component
    const compact = props.compact 
    const lens = Math.floor(c.order / 4)
    const color = colors[lens]
    const hypothesis_list = c.primitives.hypothesis
    let current_level_idx = c.levels.findIndex((d)=>d.id === c.currentLevel)
    let current_level = c.levels[current_level_idx]
    let last_index = c.levels.length - 1
    return (
        <li key={c.id} 
          onClick={()=>{
              if( !compact ){
                setReveal(!reveal)
              }
          }}
          className={`flex ${compact ? `${mini ? 'pb-5' : 'pt-4 pb-5'}` : "pt-6 pb-5 min-h-[8em]"} group duration-200 bg-white hover:bg-${color.base}-50 active:bg-white  hover:bg-${color.base}-50 border-0 border-[1px] border-transparent border-b-gray-200 hover:border-${color.base}-500 active:border-${color.base}-600 hover:border-[1px]`}
        >
        <div  key='grid' ref={gridRef} 
              className={`grid scrollbar-hide w-full pr-4 overflow-x-auto overflow-y-hidden transition-[min-height] duration-[300ms] min-h-[3em] `} 
              //style={{gridTemplateColumns: `${compact ? "8em" : "18em"} repeat(${c.levels.length - 1}, minmax(min-content,1fr)) minmax(min-content,0.5fr)`}}
             // style={{gridTemplateColumns: `${compact ? "8em" : "18em"} ${current_level_idx > 1 ? `repeat(${current_level_idx - 1}, minmax(min-content,1fr))` : ''} 4fr ${current_level_idx < last_index ? `${repeat(${c.levels.length - 1}, minmax(min-content,1fr))` : ''} minmax(min-content,0.5fr)`}}
                style={{gridTemplateColumns: `${compact ? "8em" : "18em"} ${current_level_idx > 0 ? `repeat(${current_level_idx }, minmax(min-content,1fr))` : ''} minmax(min-content,${compact ? "1fr" : "4fr"}) ${current_level_idx < last_index ? `repeat(${last_index - current_level_idx}, minmax(min-content,1fr))` : ''}`}}
          >
          <div key='header' className={`col-start-1 row-start-1 pl-4 bg-white left-0 sticky z-10 relative w-full}`}>
            <p className={`text-sm px-2 ${mini ? `mt-6 text-${color.base}-50 bg-${color.base}-600 py-0 font-bold` : `py-1 text-${color.base}-900`}`}>VF{c.order + 1}:{c.title}</p>
            {!mini && <div className='-mt-1 h-5 w-full' style={{background: color.header}}></div>}
            {!compact && 
                <p className={`mt-1 px-2 py-1 uppercase text-sm font-light leading-6 text-${color.base}-900` }>{c.description}</p>
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
              className={`absolute top-4 -right-6 w-6 h-full block`}
              style={{
                background: 'radial-gradient(at left center, rgb(205 205 205 / 68%), rgba(97, 97, 97, 0) 74%)',
                opacity: 0,
                zIndex: 10
              }}
              ></div>}
          </div>
            { reveal && 
              hypothesis_list.map((h)=>(
                <div key={h.id} className="bg-white col-start-1 sticky z-10 left-0 px-4 py-1">
                  <PrimitiveCard primitive={h} bigMargin={true} ringColor={color.base} compact={true}/>
                </div>
              ))
            }
            { 
              c.levels.map((l, idx) => {
              let ticked = c.currentLevel == undefined ? false :   l.score < current_level.score 
              let current = c.currentLevel  === undefined ? idx === 0 : c.currentLevel == l.id
              let currentTarget = l.target && c.levels.filter((l)=>l.target && l.score >= (current_level?.score || 0))[0]?.id === l.id
              let last_item = idx === c.levels.length - 1
              let push_last_item = last_item && (compact || (!expand && current_level !== l) )
              return (
              <div key={`level_${idx}`} className={`row-start-1 text-sm text-center px-0 mt-6 relative flex ${push_last_item ? "justify-end" : "justify-center"} relative ${!compact && (c.currentLevel === l.id) ? 'min-w-[12em]' : ''}`}>
                <div key='left' className={`${(ticked || current) ? `bg-${color.base}-600` :`bg-${color.base}-200`} h-5 absolute ${push_last_item ? "w-full mr-[0.625em]" : "w-[50%] left-0 "}`}/>
                {!last_item && 
                 <div key='right' className={`${ticked ? `bg-${color.base}-600` :`bg-${color.base}-200 `}  h-5 absolute w-[50%] right-0`}/>}
                <Transition
                    key='frame'
                  className='mytest'
                  appear={true}
                  show={expand}
                  beforeEnter={()=>{
                    if( idx == 0){
                      gridRef.current.querySelectorAll(`div > .mytest`).forEach((node)=>{
                        node.style.minWidth = `${node.parentNode.offsetWidth}px`
                      })
                    }
                  }}
                  beforeLeave = {()=>{
                    if( idx == 0){
                      gridRef.current.scrollTo({
                            left: 0,
                            behavior: 'smooth'
                          })
                    }
                  }}
                  afterEnter = {()=>{
                    if( idx == 0){
                      let parent = gridRef.current
                      let target = gridRef.current.querySelector(`div > div > p.current`)
                      if( target ){
                        let p_bb = parent.getBoundingClientRect()
                        let t_bb = target.getBoundingClientRect()
                        if( !(t_bb.x>= p_bb.x && t_bb.right < p_bb.right)){
                          let scroll = (t_bb.left - p_bb.left) - Math.max(((p_bb.width - t_bb.width) / 2),0)
                          parent.scrollTo({
                            left: scroll,
                            behavior: 'smooth'
                          })
                        }
                      }
                    }

                  }}
                  enter="duration-[300ms]"
                  enterTo='!min-w-[20em]'
                  leave="duration-[300ms] delay-[350ms]"
                  leaveFrom='!min-w-[20em]'
                >
                </Transition>
                  <div key='marker' className={`shrink-0 text-gray-900 flex absolute ${currentTarget && current? "-top-2" : "" } min-w-8`}>
                    {!currentTarget && ticked  && !current && <div className={`h-5 w-5 mx-auto border-${color.base}-600 ${l.target ? `bg-${color.base}-200` : `bg-${color.base}-700`} rounded-[50%] border-[6px]  place-items-center	flex`}></div>}
                    {!currentTarget && current && <div className={`h-5 w-5 mx-auto border-${color.base}-600 bg-${color.base}-600 rounded-[50%] border-2 place-items-center	flex`}><ChevronRightIcon strokeWidth='2.5' className={`w-6 h-6 text-${color.base}-100`}/></div>}
                    {!currentTarget && !(ticked  || current) && <div className={`h-5 w-5 mx-auto border-${color.base}-200 ${l.target ? `bg-${color.base}-50` : `bg-${color.base}-300`} rounded-[50%] border-[6px]  place-items-center	flex`}></div>}
                    {currentTarget && !current && <div className={`h-5 w-5 mx-auto ${`bg-${color.base}-50`} rounded-[50%] border-4 border-${color.base}-600`} />}  
                    {currentTarget && current && <div className={`h-8 w-8 mx-auto ${`bg-${color.base}-50`} rounded-[50%] border-4 border-${color.base}-600 flex place-items-center justify-center`} ><CheckIcon strokeWidth='2.5' className={`w-5 h-5 text-${color.base}-600`}/></div>}  
                  </div>
                <Transition
                  className='absolute flex justify-center transition-opacity '
                  key='description'
                  appear={true}
                  show={!compact && (expand || c.currentLevel === l.id)}
                  enter="delay-20 duration-[300ms] "
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="duration-[200ms] delay-[100ms]"
                  leaveFrom="opacity-75"
                  leaveTo="opacity-0"
                  afterLeave={function(){
                    if( compact ){
                        gridRef.current.style.setProperty('min-height', '')
                        return
                    }
                    }}
                  beforeLeave={function(){
                    this.beforeEnter(true)}
                    }
                  beforeEnter={(min = false)=>{
                    if( !expand || idx == c.levels.length - 1 ){
                      let height = (min ? [...gridRef.current.querySelectorAll(`div > div > p.current`)] : [...gridRef.current.querySelectorAll(`div > div > p`)]).map((n)=>n.offsetHeight + 24 )
                      let max_h = height.reduce((a,b)=>b > a ? b : a, 0)
                      gridRef.current.style.setProperty('min-height', `${max_h}px`, 'important')
                    }
                  }}
                >
                  <p className={`pt-8 pb-2 ${c.currentLevel === l.id ? 'current' : ''} ${expand  ? '' : '-ml-8em -mr-8em' }  text-${color.base}-900 w-[20em] absolute`}>{l.title}</p>
                </Transition>
              </div>
            )})}
            { reveal && hypothesis_list && c.levels.map((l, idx) => {
                return hypothesis_list.map((h, row)=>{
                  let levels = h.primitives.levels
                  let evidence = levels ? levels[`${l.id}`]?.allEvidence : undefined
                  return (<div 
                    key={`${idx}_${row}`}
                      style={{
                        gridColumnStart: idx + 2,
                        gridRowStart: row + 2
                      }}
                      className={`flex border-b-[1px] border-gray-100 p-0.5 flex w-full`}
                    >
                    <div className={`group-hover:bg-${color.base}-25 justify-start h-[calc(100%_-_1em)] place-items-center w-full`}>
                    {evidence &&  evidence.map((d, idx)=>
                      <EvidenceCard 
                        key={d.id}
                        onClick={(e)=>{props.selectPrimitive(d); e.stopPropagation()}} 
                        evidence={d} 
                        details={props.evidenceDetail} 
                        sentiment={d.parentRelationship(h.id)[0]} bgColor={`${color.base}-200`} iconColor={`${color.base}-900`}/>
                    )}</div></div>
                  )
                })
              })
            }
          </div>
        </li>
        )
}