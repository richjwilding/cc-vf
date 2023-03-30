import MainStore from './MainStore';
import React, { useEffect, useReducer } from 'react';
import DropdownButton from './DropdownButton';
import {
  ArrowTopRightOnSquareIcon,
  PencilIcon,
  CheckIcon,
  UserIcon,
  PaperClipIcon,
} from '@heroicons/react/20/solid'
import { HeroIcon, SolidHeroIcon } from './HeroIcon';
import { Link } from "react-router-dom";
import useDataEvent from './CustomHook';
import { PrimitiveCard } from './PrimitiveCard';
import html2canvas from 'html2canvas';
import MiroExporter from './MiroExporter'; 

const mainstore = MainStore()
window.html2canvas = html2canvas
window.miroExporter = MiroExporter()

export default function EvidenceExplorer({relatedTask, ...props}){
    const [filters, setFilters] = React.useState([(d)=>d.referenceId === 10 ])//&& d.referenceParameters.scale > 5 && d.referenceParameters.specificity > 5])
  // const [filters, setFilters] = React.useState([(d)=>d.referenceId === 3])// && d.referenceParameters.specificity > 5 ] )
    const [scale, setScale] = React.useState(100)
    const [colSelection, setColSelection] = React.useState("area")
    const [rowSelection, setRowSelection] = React.useState("interviewee")
    const canvas = React.useRef(null)

    const group = (d)=>d.referenceParameters?.category
    let fields = ["title", "scale", "specificity","category"]
    let originFields = [{contact: "contactName"}]

    const pickProcess = ( mode )=>{
        if( mode === "area"){
            return (d)=>d.tags ? d.tags[0] : undefined
        }else if( mode === "interviewee"){
            originFields = undefined
            return (d)=>d.origin.referenceParameters?.contactName
        }else if( mode === "function"){
            return (d)=> d.origin.referenceParameters?.function
        }else if( mode === "category"){
            fields = fields.filter((d)=>d!=="category")
            return (d)=> d.referenceParameters?.category
        }else if( mode === "scale"){
            fields = fields.filter((d)=>d!=="scale")
            return (d)=> d.referenceParameters?.scale
        }else if( mode === "intext"){
            return (d)=> d.origin.referenceParameters.company.search(/Munich Re/i) ? "Munich Re" : "External"
        }else if( mode === "specificity"){
            fields = fields.filter((d)=>d!=="specificity")
            return (d)=> d.referenceParameters?.specificity
        }
    }

    const column = pickProcess( colSelection )
    const row = pickProcess( rowSelection )

  let list = React.useMemo(()=>{
    let evidence = props.evidenceList || relatedTask?.primitives.allUniqueResult.map((d)=>d.primitives.allUniqueEvidence).flat()
        return evidence.filter((d)=>filters.map((f)=>f(d)).reduce((r,c)=>r && c, true)).map((p)=>{
            return {
                column: column(p),
                row: row(p),
                group: group(p),
                primitive: p
            }
        })
    },[relatedTask.id, colSelection, rowSelection])

  const columnExtents = React.useMemo(()=>list.map((d)=>d.column).filter((v,idx,a)=>a.indexOf(v)===idx).sort(),[relatedTask.id, colSelection, rowSelection])
  const rowExtents = React.useMemo(()=>list.map((d)=>d.row).filter((v,idx,a)=>a.indexOf(v)===idx).sort(),[relatedTask.id, colSelection, rowSelection])

  if( list === undefined || list.length === 0){return <></>} 


  const colors = ["rose","ccgreen","ccpurple","amber","cyan","fuchsia", "ccblue"] 

  const handleScale = (e)=>{
    const s = e.target.value
    setScale(s)
  }

  const columnColumns = columnExtents.map((col)=>{
      return Math.max(...Object.values(list.filter((d)=>d.column == col).reduce((o, d)=>{o[d.row] = (o[d.row] || 0) + 1;return o},{})))
    })

const options = <><option value="area">Focus area (defined by experiment)</option>
                    <option value="interviewee">Interviewee name</option>
                    <option value="category">Categories (auto extracted)</option>
                    <option value="scale">Scale of Problem</option>
                    <option value="function">Interviewee function</option>
                    <option value="intext">Internal / External</option>
                    <option value="specificity">Specificity of problem</option>)</> 

  return (
        <div className='w-full h-full overflow-x-scroll overflow-y-scroll overscroll-contain'>
            <div key='control' className='z-20 bg-white w-full p-2 sticky top-0 left-0'>
                <input key='zoom' type="range" min="10" max="200" value={scale} step='10' className="range" onChange={handleScale}/>
                <select key='cols' id="cols" value={colSelection} onChange={(e)=>setColSelection(e.target.value)}>{options}</select>
                <select key='rows' id="rows" value={rowSelection} onChange={(e)=>setRowSelection(e.target.value)}>{options}</select>
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
                    <p></p>{columnExtents.map((col,idx)=>(<p key={`rt${idx}`} className='vfbgtitle z-[2] font-bold text-lg text-center p-2 text-4xl self-center'>{col}</p>))}
                    { rowExtents.map((row, rIdx)=>{
                        return <React.Fragment>
                            {<p key={`ct${rIdx}`} className='vfbgtitle z-[2] font-bold text-sm text-center p-2 text-4xl self-center'>{row?.split('/').join(" ")}</p>}
                            {columnExtents.map((column, cIdx)=>{
                                let subList = list.filter((item)=>item.column === column && item.row === row).sort((a,b)=>a.primitive.referenceParameters.scale - b.primitive.referenceParameters.scale).reverse()
                                return <div style={{columns: Math.floor(Math.sqrt(columnColumns[cIdx] ))}} className='z-[2] w-fit m-4 p-2 gap-0 overflow-y-scroll max-h-[inherit] no-break-children'>
                                        {subList.map((wrapped)=>{
                                            let item = wrapped.primitive
                                            let color = 'ccblue'
                                            let sz = Math.floor((parseInt(item.referenceParameters.scale ** 2) / 81) * 6) + 0.5
                                            if( item.origin.referenceParameters.company.search(/Munich Re/i)){
                                                color = 'ccpurple'
                                            }
                                            return <div style={{width: `${sz}em`, height: `${sz}em`, borderRadius:`${sz}em`}} className={`bg-${color}-400 border-4 border-white shade-lg m-1`}></div>
                                            return <PrimitiveCard key={item.id} noEvents={true} showAsSecondary={"small"} fieldsInline={false} primitive={item} compact={true} border={true} showOriginInfo={originFields} fields={fields} className='min-w-[16em] max-w-[16em] m-2'/>
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