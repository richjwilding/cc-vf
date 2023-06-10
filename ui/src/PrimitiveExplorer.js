import MainStore from './MainStore';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import { PrimitiveCard } from './PrimitiveCard';
//import html2canvas from 'html2canvas';
//import MiroExporter from './MiroExporter'; 
import Panel from './Panel';
import {useGesture, usePinch} from '@use-gesture/react'
import { useLayoutEffect } from 'react';
import useDataEvent from './CustomHook';


const mainstore = MainStore()
//window.html2canvas = html2canvas
//window.miroExporter = MiroExporter()

export default function PrimitiveExplorer({primitive, ...props}){
    const [filters, setFilters] = React.useState(props.categoryIds ? [(d)=>props.categoryIds.includes(d.referenceId)] : [])
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    useDataEvent("relationship_update", primitive.id, forceUpdate)

    
    let items = React.useMemo(()=>{
        const types = [props.types].flat()
        return(props.list || primitive.primitives.uniqueAllItems.filter((d)=>types.includes(d.type) )).filter((d)=>filters.map((f)=>f(d)).reduce((r,c)=>r && c, true))
    },[primitive.id, update])

    const axisOptions = useMemo(()=>{

        function txParameters(p, access){
            const out = []
            const catIds = p.map((d)=>d.referenceId).filter((v,idx,a)=>a.indexOf(v)=== idx)
            catIds.forEach((id)=>{
                const category = MainStore().category(id)
                const parameters = category.parameters
                if( parameters ){
                    Object.keys(parameters).forEach((parameter)=>{
                        console.log(parameter)
                        const type = parameters[parameter].type
                        if( parameters[parameter].excludeFromAggregation ){
                            return
                        }
                        if( type === "url" ){
                            return
                        }
                        if(  type === "contact"){
                            out.push( {type: 'parameter', parameter: "contactName", title: `${category.title} - ${parameters[parameter].title}`, access: access})
                        }else{
                            out.push( {type: 'parameter', parameter: parameter, title: `${category.title} - ${parameters[parameter].title}`, access: access})
                        }
                    })
                }
            })

            return out.filter((filter)=>{
                return p.map((d)=>["number","string"].includes(typeof(d.referenceParameters[filter.parameter]))).filter((d)=>d).length > 0
            })
        }

        let out = [{type: "none", title: "None"}]

        if( items ){
            out = out.concat( txParameters( items ) )
            
            if( !props.excludeOrigin ){
                out = out.concat( txParameters( items.map((d)=>d.origin  === primitive ? undefined : d.origin).filter((d)=>d), "origin"  ) )
            }
        }
        
        out = out.concat(primitive.primitives.allUniqueCategory.map((d)=>{
            const options = d.primitives.allUniqueCategory
            return {
                type: "category",
                id: d.id,
                order: [undefined,options.map((d)=>d.id)].flat(),
                values: ["None", options.map((d)=>d.title)].flat(),
                title: `By ${d.title}`
            }
        }))
        
        return out
    }, [primitive.id, update])

    const [colSelection, setColSelection] = React.useState(0)
    const [rowSelection, setRowSelection] = React.useState(axisOptions.length > 1 ? 1 : 0)

    const pickProcess = ( mode )=>{
        const option = axisOptions[mode]
        if( option ){
            if( option.type === "category"){
                return (p)=>option.values[Math.max(0,...p.parentPrimitiveIds.map((d)=>option.order.indexOf(d)).filter((d)=>d !== -1 ))]
            }
            if( option.type === "interviewee"){
                return (d)=>d.origin.referenceParameters?.contactName
            }else if( option.type === "parameter"){
                return (d)=> {
                    let item = d
                    if( option.access === "origin"){
                        item = item.origin
                    }
                    return item.referenceParameters[option.parameter]
                }
            }else if( option.type === "specificity"){
                fields = fields.filter((d)=>d!=="specificity")
                return (d)=> d.referenceParameters?.specificity
            }
        }
        return (p)=>""
    }

    const column = pickProcess( colSelection )
    const row = pickProcess( rowSelection )
    const group = (d)=>d.referenceParameters?.category

    let list = React.useMemo(()=>{
        return items.map((p)=>{
            return {
                column: column(p),
                row: row(p),
                group: group(p),
                primitive: p
            }
        })
        },[primitive.id, colSelection, rowSelection, update])

    let fields = ["title", "scale", "specificity","category"]
    let originFields = [{contact: "contactName"}]


    const targetRef = useRef()
    const gridRef = useRef()

    const restoreState = ()=>{
        const [translateX = 0, translateY = 0] = gridRef.current.style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
        const [scale = 1] = gridRef.current.style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
        return [parseFloat(translateX),parseFloat(translateY),parseFloat(scale)]
    }

    const [scale, setScale] = useState(1)
    useLayoutEffect(()=>{
        if( gridRef.current){

            gridRef.current.style.transform = `scale(1)`
            const toolbarHeight = 56
            const gbb = {width: gridRef.current.offsetWidth , height:gridRef.current.offsetHeight }
            const tbb = targetRef.current.getBoundingClientRect()

            const border = 20
            const tw = tbb.width
            const th = tbb.height 

            const scale = Math.min(Math.min( (tbb.width - border) / gbb.width, (tbb.height - border - toolbarHeight) / gbb.height),1) 
            const x =  -((gbb.width/2)-(tw / 2))
            const y =  -((gbb.height/2)-(th / 2)) - (toolbarHeight * scale)

            gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${scale})`
            setScale(scale)
        }

    }, [gridRef.current, primitive.id, colSelection, rowSelection])
  
    useGesture({

        onWheel: (state) => {
            if( !state.ctrlKey ){
                const [translateX, translateY, initialScale] = restoreState()

                const x = translateX - ((state.delta[0] ) * 3)
                const y = translateY - ((state.delta[1] )  * 3)
                gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${initialScale})`
                state.event.preventDefault()
            }
        },
        onPinch: (state) => {
            let memo = state.memo
            const ox = state.origin[0]
            const oy = state.origin[1]

            if (state.first) {
                const [translateX, translateY, initialScale] = restoreState()

                const { width, height, x, y } = gridRef.current.getBoundingClientRect()
                const tx = ox - (x + width / 2)
                const ty = oy - (y + height / 2)
                memo = [translateX, translateY, tx, ty, initialScale]
            }
            const ms = state.offset[0] / memo[4]
            const x = memo[0] - (ms - 1) * memo[2]
            const y = memo[1] - (ms - 1) * memo[3]


            const thisScale = memo[4] * ms

            gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${thisScale})`
            setScale(thisScale)

            return memo
        }
    }, {
        target: targetRef,
        pinch: {
            from: ()=>[scale,scale],
            scaleBounds: { min: 0.03, max: 8 },
        },
        eventOptions: { 
            passive: false,
            preventDefault: true,
         }
        }
    )



  const columnExtents = React.useMemo(()=>list.map((d)=>d.column).filter((v,idx,a)=>a.indexOf(v)===idx).sort(),[primitive.id, colSelection, rowSelection, update])
  const rowExtents = React.useMemo(()=>list.map((d)=>d.row).filter((v,idx,a)=>a.indexOf(v)===idx).sort(),[primitive.id, colSelection, rowSelection, update])

  if( list === undefined || list.length === 0){return <></>} 


  const colors = ["rose","ccgreen","ccpurple","amber","cyan","fuchsia", "ccblue"] 


  const columnColumns = columnExtents.map((col)=>{
      return Math.max(...Object.values(list.filter((d)=>d.column == col).reduce((o, d)=>{o[d.row] = (o[d.row] || 0) + 1;return o},{})))
    })

    const options = axisOptions.map((d, idx)=>(
        <option value={idx}>{d.title}</option>
    ))

    const hasColumnHeaders = (columnExtents.length > 1)
    const hasRowHeaders = (rowExtents.length > 1)
    


  return (
        <div ref={targetRef} className='touch-none w-full h-full overflow-x-hidden overflow-y-hidden overscroll-contain'>
            <div key='control' className='z-20 bg-white w-full p-2 sticky top-0 left-0 space-x-3 place-items-center flex'>
                {props.closeButton && <Panel.MenuButton icon={<ArrowsPointingInIcon className='w-4 h-4 -mx-1'/>} action={props.closeButton}/> }
                {props.buttons}
                <p>{list?.length} items</p>
                <select className='border rounded-sm' key='cols' id="cols" value={colSelection} onChange={(e)=>setColSelection(e.target.value)}>{options}</select>
                <select className='border rounded-sm' key='rows' id="rows" value={rowSelection} onChange={(e)=>setRowSelection(e.target.value)}>{options}</select>
            </div>
                <div 
                    key='grid'
                    ref={gridRef}
                    style = {{
//                        transformOrigin: "top left",
                        gridTemplateColumns: `${hasRowHeaders ? "15em" : ""} repeat(${columnExtents.length}, min-content)`,
                        gridTemplateRows: `${hasColumnHeaders ? "5em" : ""} repeat(${rowExtents.length}, min-content)`
                    }}
                    className='vfExplorer grid relative gap-8 w-fit h-fit'>
                    {!hasColumnHeaders && !hasRowHeaders && <div key={`croot`} className={`vfbgshape z-0 absolute w-full h-full top-0 left-0 bg-${colors[0] || "slate"}-200/20 border-2 border-${colors[0] || "slate"}-200/40`}></div>}
                    {hasColumnHeaders && columnExtents.map((col, cIdx)=>(<div key={`c${cIdx}`} style={{gridColumnStart:cIdx + (hasRowHeaders ? 2 : 1), gridColumnEnd:cIdx + (hasRowHeaders ? 3 : 2)}} className={`vfbgshape z-0 absolute w-full h-full top-0 left-0 bg-${colors[cIdx] || "slate"}-200/20 border-2 border-${colors[cIdx] || "slate"}-200/40`}></div>))}
                    {hasRowHeaders && rowExtents.map((col, cIdx)=>(<div key={`r${cIdx}`} style={{gridRowStart:cIdx + (hasColumnHeaders ? 2 : 1), gridRowEnd:cIdx + (hasColumnHeaders ? 3 : 2)}} className={`vfbgshape z-0 absolute w-full h-full top-0 left-0 bg-slate-200/40 border-2 border-slate-200/50`}></div>))}
                    {hasColumnHeaders && <>
                        {hasRowHeaders && <p></p>}
                        {columnExtents.map((col,idx)=>(<p key={`rt${idx}`} className='vfbgtitle z-[2] font-bold text-lg text-center p-2 text-2xl self-center'>{col}</p>))}
                        </>}

                    { rowExtents.map((row, rIdx)=>{
                        return <React.Fragment>
                            {hasRowHeaders && <p key={`ct${rIdx}`} className='vfbgtitle z-[2] font-bold text-sm text-center p-2 text-2xl self-center'>{row && typeof(row) === "string" ? row?.split('/').join(" ") : row}</p>}
                            {columnExtents.map((column, cIdx)=>{
                                let subList = list.filter((item)=>item.column === column && item.row === row).sort((a,b)=>a.primitive.referenceParameters.scale - b.primitive.referenceParameters.scale).reverse()
                                return <div style={{columns: Math.floor(Math.sqrt(columnColumns[cIdx] ))}} className='z-[2] w-fit m-4 p-2 gap-0 overflow-y-scroll max-h-[inherit] no-break-children'>
                                        {subList.map((wrapped, idx)=>{
                                            let item = wrapped.primitive
                                            let size = props.asSquare ? {fixedSize: '16rem'} : {fixedWidth:'16rem'}
                                            let sz = Math.floor((parseInt(item.referenceParameters.scale ** 2) / 81) * 6) + 0.5
                                            const staggerScale = scale  + (scale / 200 * (idx % 20))
                                            if( props.render ){
                                                return props.render( item, staggerScale)
                                            }
                                            return <PrimitiveCard key={item.id} primitive={item} scale={staggerScale} fields={fields} {...size} className='m-2' {...props.renderProps} onClick={props.onCardClick ? ()=>props.onCardClick(item) : undefined}/>
                                        })}
                                    </div>
                        })}
                        </React.Fragment>
                    })}
                </div>
        </div>
  )
}