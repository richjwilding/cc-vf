import MainStore from './MainStore';
import React, { useEffect, useMemo, useReducer } from 'react';
import { ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import { PrimitiveCard } from './PrimitiveCard';
//import html2canvas from 'html2canvas';
//import MiroExporter from './MiroExporter'; 
import Panel from './Panel';

const mainstore = MainStore()
//window.html2canvas = html2canvas
//window.miroExporter = MiroExporter()

export default function PrimitiveExplorer({primitive, ...props}){
    const [filters, setFilters] = React.useState(props.categoryIds ? [(d)=>props.categoryIds.includes(d.referenceId)] : [])
    //const [filters, setFilters] = React.useState([(d)=>d.referenceId === 10 ])//&& d.referenceParameters.scale > 5 && d.referenceParameters.specificity > 5])
    const [scale, setScale] = React.useState(100)
    const canvas = React.useRef(null)

    const types = [props.types].flat()

    let items = React.useMemo(()=>{
        return props.list || primitive.primitives.uniqueAllItems.filter((d)=>types.includes(d.type) )
    },[primitive.id])

    const axisOptions = useMemo(()=>{
        let out = []

        if( props.list ){
            const sample = props.list[0]
            if( sample ){
                console.log(sample)
                const parameters = sample.metadata.parameters
                if( parameters ){
                    Object.keys(parameters).forEach((parameter)=>{
                        out.push( {type: 'parameter', parameter: parameter, title: parameters[parameter].title})
                    })
                }
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
    }, [primitive.id])

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
                return (d)=> d.referenceParameters[option.parameter]
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
        return items.filter((d)=>filters.map((f)=>f(d)).reduce((r,c)=>r && c, true)).map((p)=>{
            return {
                column: column(p),
                row: row(p),
                group: group(p),
                primitive: p
            }
        })
        },[primitive.id, colSelection, rowSelection])

    let fields = ["title", "scale", "specificity","category"]
    let originFields = [{contact: "contactName"}]




  const columnExtents = React.useMemo(()=>list.map((d)=>d.column).filter((v,idx,a)=>a.indexOf(v)===idx).sort(),[primitive.id, colSelection, rowSelection])
  const rowExtents = React.useMemo(()=>list.map((d)=>d.row).filter((v,idx,a)=>a.indexOf(v)===idx).sort(),[primitive.id, colSelection, rowSelection])

  if( list === undefined || list.length === 0){return <></>} 


  const colors = ["rose","ccgreen","ccpurple","amber","cyan","fuchsia", "ccblue"] 

  const handleScale = (e)=>{
    const s = e.target.value
    setScale(s)
  }

  const columnColumns = columnExtents.map((col)=>{
      return Math.max(...Object.values(list.filter((d)=>d.column == col).reduce((o, d)=>{o[d.row] = (o[d.row] || 0) + 1;return o},{})))
    })

    const options = axisOptions.map((d, idx)=>(
        <option value={idx}>{d.title}</option>
    ))

  return (
        <div className='w-full h-full overflow-x-scroll overflow-y-scroll overscroll-contain'>
            <div key='control' className='z-20 bg-white w-full p-2 sticky top-0 left-0 space-x-3 place-items-center'>
                {props.closeButton && <Panel.MenuButton icon={<ArrowsPointingInIcon className='w-4 h-4 -mx-1'/>} action={props.closeButton}/> }
                <input key='zoom' type="range" min="10" max="200" value={scale} step='10' className="range" onChange={handleScale}/>
                <select className='border rounded-sm' key='cols' id="cols" value={colSelection} onChange={(e)=>setColSelection(e.target.value)}>{options}</select>
                <select className='border rounded-sm' key='rows' id="rows" value={rowSelection} onChange={(e)=>setRowSelection(e.target.value)}>{options}</select>
            </div>
            <div style = {{
                        width:`${scale}%`,
                        height:`${scale}%`,
                    }}
                    className='p-4'>
                <div 
                    key='grid'
                    style = {{
                        transform:`scale(${scale/100})`,
                        transformOrigin: "top left",
                        gridTemplateColumns: `15em repeat(${columnExtents.length}, min-content)`,
                        gridTemplateRows: `5em repeat(${rowExtents.length}, min-content)`
                    }}
                    className='vfExplorer grid relative gap-8 w-fit h-fit'>
                    {columnExtents.map((col, cIdx)=>(<div key={`c${cIdx}`} style={{gridColumnStart:cIdx + 2, gridColumnEnd:cIdx + 3}} className={`vfbgshape z-0 absolute w-full h-full top-0 left-0 bg-${colors[cIdx] || "slate"}-200/20 border-2 border-${colors[cIdx] || "slate"}-200/40`}></div>))}
                    {rowExtents.map((col, cIdx)=>(<div key={`r${cIdx}`} style={{gridRowStart:cIdx + 2, gridRowEnd:cIdx + 3}} className={`vfbgshape z-0 absolute w-full h-full top-0 left-0 bg-slate-200/40 border-2 border-slate-200/50`}></div>))}
                    <p></p>{columnExtents.map((col,idx)=>(<p key={`rt${idx}`} className='vfbgtitle z-[2] font-bold text-lg text-center p-2 text-2xl self-center'>{col}</p>))}
                    { rowExtents.map((row, rIdx)=>{
                        return <React.Fragment>
                            {<p key={`ct${rIdx}`} className='vfbgtitle z-[2] font-bold text-sm text-center p-2 text-2xl self-center'>{row && typeof(row) === "string" ? row?.split('/').join(" ") : row}</p>}
                            {columnExtents.map((column, cIdx)=>{
                                let subList = list.filter((item)=>item.column === column && item.row === row).sort((a,b)=>a.primitive.referenceParameters.scale - b.primitive.referenceParameters.scale).reverse()
                                return <div style={{columns: Math.floor(Math.sqrt(columnColumns[cIdx] ))}} className='z-[2] w-fit m-4 p-2 gap-0 overflow-y-scroll max-h-[inherit] no-break-children'>
                                        {subList.map((wrapped)=>{
                                            let item = wrapped.primitive
                                            let color = 'ccblue'
                                            let sz = Math.floor((parseInt(item.referenceParameters.scale ** 2) / 81) * 6) + 0.5
                                            if( item.origin.referenceParameters.company?.search(/Munich Re/i)){
                                                color = 'ccpurple'
                                            }
                                            if( props.render ){
                                                return props.render( item )
                                            }
                                            return <PrimitiveCard key={item.id} primitive={item} fields={fields} className='min-w-[16em] max-w-[16em] m-2' {...props.renderProps} onClick={props.onCardClick ? ()=>props.onCardClick(item) : undefined}/>
                                        })}
                                    </div>
                        })}
                        </React.Fragment>
                    })}
                </div>
            </div>
        </div>
  )
}