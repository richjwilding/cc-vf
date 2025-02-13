import { useEffect, useLayoutEffect, useRef, useState, useMemo, useReducer } from "react"
import { PrimitiveCard } from "./PrimitiveCard";
import { useReactTable, 
        flexRender, 
        createColumnHelper,
        getSortedRowModel,
        SortingState,
        getCoreRowModel, 
        getPaginationRowModel} from '@tanstack/react-table'
import MainStore from "./MainStore";
import { ClipboardDocumentIcon, FlagIcon, MagnifyingGlassIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import useDataEvent from "./CustomHook";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { min } from "date-fns";
import { VFImage } from "./VFImage";
import PrimitivePicker from "./PrimitivePicker";
import NewPrimitive from "./NewPrimitive";
import { roundCurrency } from "./SharedTransforms";
import UIHelper from "./UIHelper";
  

const ExpandArrow = function(props) {
  return (
      <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path clipRule="evenodd" fillRule="evenodd" d="M15 3.75a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0V5.56l-3.97 3.97a.75.75 0 11-1.06-1.06l3.97-3.97h-2.69a.75.75 0 01-.75-.75zM9.53 14.47A.75.75 0 019.53 15.53L5.56 19.5h2.69a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75v-4.5a.75.75 0 011.5 0v2.69l3.97-3.97a.75.75 0 011.06 0z" />
      </svg>
  
  );
}

function copyToClipboard( table ){

    const headers = '<thead><tr>' + table.getHeaderGroups().map((headerGroup)=>{
        return headerGroup.headers.map((header,idx) => {
            let val = header.column.columnDef.header()
            val = val ?? ""
            return `<th style='font-weight:900;background:#eee'>${val}</th>`
        }).join("")
    }).join("") + '</tr></thead>'
    const rows = table.getCoreRowModel().rows.map((row,idx) => {
        const primitive = row.original.primitive
        const primId = primitive.id
        return '<tr>' + row.getVisibleCells().map(cell => {
            let val = cell.column.columnDef.export ? cell.column.columnDef.export(cell) : cell.getValue() 
            val = val ?? ""
            return `<td>${val}</td>`
        }).join("") + '</tr>'
    }).join("")


        const textarea = document.createElement('template');
        const htmlData = `<table>${headers}<tbody>${rows}</tbody></text>`
        textarea.innerHTML = htmlData.trim()
        const el = textarea.content.childNodes[0]
        document.body.appendChild(el);
        const range = document.createRange();
        const sel = window.getSelection();
        sel.removeAllRanges();
        try {
            range.selectNodeContents(el);
            sel.addRange(range);
        } catch (e) {
            range.selectNode(el);
            sel.addRange(range);
        }
        document.execCommand('copy');
        document.body.removeChild(el);

}

export function Table(props) {

    const nullInfo = {isResizingColumn: false,
        startOffset: null,
        startSize: null,
        deltaOffset: null,
        deltaPercentage: null,
        columnSizingStart: [],}

    const ids = props.primitives.map((d)=>d.id)

    const mapRows = (rows) =>{
        return rows.map((d)=>{
            return columns.reduce((r, c)=>{
                r[c.accessorKey] = d[c.accessorKey]
                return r
            },{data: d.data, id: d.id})
        })
    }
    const mapColumns = (columns) =>{
        const columnHelper = createColumnHelper()

        const fixed = columns.map((d)=>{
            const width = d.width ?? 100

            if(d.callback){
                return columnHelper.accessor(d.field,
                    {
                        cell: info => {
                            return <UIHelper.Button 
                                    outline 
                                    icon={d.icon} 
                                    title={d.icon ? undefined : "Action"} 
                                    onClick={()=>{
                                        d.callback(info.row.original[info.column.id] ?? info.row.original.id)
                                    }}/>
                        },
                        header: () => d.name || d.title,
                        sortingFn: (a,b)=>{return 0},
                        startSize: 20,
                        minSize: 20
                    })
                }

            return columnHelper.accessor(d.field,
                {
                    cell: info => <p className={d.wrap ? "" :"truncate"}>{info.getValue()}</p>,
                    header: () => d.name || d.title,
                    sortingFn: "alphanumeric",
                    startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                    startSize: width,
                    minSize: width
                })
        })
        return fixed
    }

    const [totalWidth, setTotalWidth] = useState( null )
    const [selected, setSelected] = useState( null )
    const [focus, setFocus] = useState( null )
    const [sorting, setSorting] = useState([])
    const [count, forceUpdate] = useReducer( (x)=>x+1, 0)
    const gridRef = useRef()
    const columns = useMemo( ()=>mapColumns(props.columns), [props.columns.map(d=>d.id).join("-")])
    const data = useMemo( ()=>mapRows(props.data) , [props.data.map(d=>d.id).join("-")])
    //useDataEvent('set_title set_parameter relationship_update', ids, forceUpdate)

    console.log('REDO TAV')

     const table = useReactTable({
                                columns,
                                data,
                                columnResizeMode: "onChange",
                                state: {
                                    sorting,
                                    pagination:{
                                        pageIndex: props.page,
                                        pageSize: props.pageItems
                                    }
                                  },
                                onSortingChange: setSorting,
                                getCoreRowModel: getCoreRowModel(),
                                getPaginationRowModel: getPaginationRowModel(),
                                getSortedRowModel: getSortedRowModel(),
                            });
 
    useEffect(()=>{
        console.log('update PAGES')
        table.setPagination({
            pageIndex: props.page,
            pageSize: props.pageItems
        })    
    }, [props.page, props.pageItems])

    useLayoutEffect(()=>{
        if( gridRef.current ){
        /*    const eWidths = {}
            const style = window.getComputedStyle(gridRef.current.parentElement)
            const parentWidth = parseInt(style.width) - parseInt(style.paddingLeft) - parseInt(style.paddingRight) - 20
            setTotalWidth(parentWidth)
            Array.from(gridRef.current.children).slice(1, columns.length).forEach((el, idx)=>{
                eWidths[columns[idx].accessorKey] = columns[idx].startSize ? (columns[idx].startSize < 1 ? columns[idx].startSize * parentWidth : columns[idx].startSize) : parentWidth / columns.length 
                console.log(columns[idx].accessorKey, columns[idx].startSize,parentWidth,eWidths[columns[idx].accessorKey])
            })

            table.setColumnSizing( eWidths )
         */   
        }
    },[])
    const widths = table.options.state.columnSizing
    let gridWidths = columns.map((d)=>{
        const newWidths = widths[d.accessorKey] ? widths[d.accessorKey] : undefined
        return newWidths
    })
    const total = Object.values(gridWidths).reduce((r,c)=>r+c,0)
    if( total < totalWidth ){
        gridWidths[gridWidths.length - 1] +=  totalWidth - total
    }

    gridWidths = gridWidths.map((d)=>d ? `${d}px` : '1fr')

    const navigate = (delta)=>{
        let rows = table.getRowModel().rows
        let index = selected ? rows.findIndex((d)=>d.original.id === selected) : 0

        if( delta === 0){
            if( props.onEnter ){
                props.onEnter(rows[index].original.data.primitive)
            }
            return
        }

        index += delta
        if( index < 0){index = 0}
        if( index >= rows.length){index = rows.length - 1}
        const newId = rows[index]?.original.id
        setSelected( newId )
        if( gridRef.current ){
            const target = gridRef.current.querySelector(`#r_${newId}`)
            if( target ){
                target.focus()
            }
        }
    }
    const keyHandler = (e)=>{
        if(e.key == "ArrowUp"){
            navigate(-1)
            e.stopPropagation()
            e.preventDefault()
        }
        if(e.key == "ArrowDown"){
            navigate(1)
            e.stopPropagation()
            e.preventDefault()
        }
        if(e.key == "Enter"){
            navigate(0)
            e.stopPropagation()
            e.preventDefault()
        }
    }
    const updateFocus = (e)=>{
        setFocus( gridRef.current && gridRef.current.querySelector(':focus') )
    } 
    useLayoutEffect(()=>{
        //updateFocus()
    },[selected])

    const handleClick = (e, id) => {
        console.log('click')
        setSelected(id)
      };


      const handleHeaderClick = (e, column)=>{
        if( e.target.classList.contains('myheader') ){
            column.getToggleSortingHandler()(e)
        }
      }

      const alignTop = true

    return (
        <>
        <div key="table" className={`p-2 rounded-md overflow-y-scroll relative text-sm  ${props.className}`}>
            <button 
                onClick={()=>copyToClipboard(table)}
                className="absolute top-4" style={{zIndex:10000}}>
                <ClipboardDocumentIcon className="w-5 h-5 text-gray-200 hover:text-gray-800"/>
            </button>
        <div 
            ref={gridRef}
            style={{
                gridTemplateColumns: `20px ${Object.values(gridWidths).join(" ")}`
            }}
            onKeyDown={keyHandler}
            className="grid w-full overflow-x-auto relative max-h-full">
            {table.getHeaderGroups().map(headerGroup => (
                <>
                <div
                    className="relative px-2 sticky top-0 z-10 bg-white border-b border-gray-200 py-2 font-semibold"
                ></div>
                {headerGroup.headers.map((header,idx) => {
                    const last = idx === columns.length - 1
                    return (
                    <div 
                        key={header.id}
                        onClick={(e)=>handleHeaderClick(e, header.column)}
                        className={`myheader flex place-items-center space-x-2 relative px-2 sticky top-0 z-10 bg-white border-b border-gray-200 py-2 font-semibold`}
                        >
                    {header.isPlaceholder
                        ? null
                        : <div className="myheader select-none">{flexRender(header.column.columnDef.header,header.getContext())}</div>
                    }
                        {
                            {
                                "asc": <ChevronDownIcon className='w-4 h-4'/>,
                                "desc": <ChevronUpIcon className='w-4 h-4'/>,
                            }[ header.column.getIsSorted() ] ?? null}
                        <div
                            onMouseDown ={header.getResizeHandler()}
                            onTouchStart = {header.getResizeHandler()}
                            className = {`h-full absolute ${last ? "right-0 pl-1.5" : "px-1.5 -right-2"} top-0 group z-10 cursor-ew-resize`}
                            style={{
                                userSelect: "none",
                                touchAction: "none",
                                transform: "translateX(-2px)"
                            }}
                        ><div className="bg-gray-200 group-hover:bg-gray-700 w-px h-full"/>
                        </div>
                    </div>
                )})}
                </>
            ))}
            {table.getRowModel().rows.map((row,idx) => {
                const id = row.original.id
                const primitive = row.original.data.primitive
                return (
                    <>
                    <div className="contents group">
                    <div                         
                        onClick={(e)=>{e.stopPropagation();props.onEnter(primitive)}}
                        className={`group-hover:bg-gray-100 flex justify-center place-items-center pl-1 cursor-pointer text-gray-200 group-hover:text-gray-400 hover:text-gray-600 border-b border-gray-100 outline-none ${selected === id ? "bg-ccgreen-100" : ""}`}>
                        <ExpandArrow className='w-4 h-4 '/>
                    </div>
                    {row.getVisibleCells().map(cell => {
                        return (
                            <>
                            {selected === id && focus &&
                            <div 
                                style={{
                                    gridColumnStart: 1,
                                    gridColumnEnd: columns.length + 2,
                                    gridRowStart: idx + 2,
                                    gridRowEnd: idx + 2,
                                    pointerEvents: 'none'
                                }}
                                className="w-full h-full border border-ccgreen-600 absolute"
                            ></div>}
                            <div 
                                tabIndex={0}
                                id={`r_${id}`}
                                onClick={(e)=>handleClick(e, id)}
                                onBlur={updateFocus}
                                className={`p-2 py-3 border-b group-hover:bg-gray-100 border-gray-100 outline-none flex ${alignTop ? "" : "place-items-center"} ${selected === id ? "bg-ccgreen-100" : ""}`}
                                key={cell.id}
                                >
                                    {flexRender(cell.column.columnDef.cell,cell.getContext())}
                            </div>
                        </>
                    )})}
                            </div>
                </>
            )})}
        </div>
        </div>
        </>
   )
}
