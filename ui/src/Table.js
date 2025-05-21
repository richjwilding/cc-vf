import { useEffect, useLayoutEffect, useRef, useState, useMemo, useReducer } from "react"
import { PrimitiveCard } from "./PrimitiveCard";
import { useReactTable, 
        flexRender, 
        createColumnHelper,
        getFilteredRowModel,
        getSortedRowModel,
        SortingState,
        getCoreRowModel, 
        usePagination,
        getPaginationRowModel} from '@tanstack/react-table'
import MainStore from "./MainStore";
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardDocumentIcon} from "@heroicons/react/24/outline";
import useDataEvent from "./CustomHook";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { min } from "date-fns";
import { VFImage } from "./VFImage";
import PrimitivePicker from "./PrimitivePicker";
import NewPrimitive from "./NewPrimitive";
import { roundCurrency } from "./SharedTransforms";
import UIHelper from "./UIHelper";
import { Dropdown } from "./@components/dropdown";
import { Combobox, ComboboxLabel, ComboboxOption } from "./@components/combobox";
import { Input } from "./@components/input";
import PrimitiveConfig from "./PrimitiveConfig";
  

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
                    filterFn: 'includesString',
                    accessorFn: d.accessorFn,
                    fromStructure: d.fromStructure,
                    startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                    startSize: width,
                    minSize: width
                })
        })
        return fixed
    }

    const [globalFilter, setGlobalFilter] = useState('')

    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: 20,
      })    
      

    const [totalWidth, setTotalWidth] = useState( null )
    const [selected, setSelected] = useState( null )
    const [focus, setFocus] = useState( null )
    const [sorting, setSorting] = useState([])
    const [count, forceUpdate] = useReducer( (x)=>x+1, 0)
    const gridRef = useRef()


    function buildDynamicFieldsForPrimitiveList( data, getData = (r)=>r ){
        let dynamic = [
            {field: 'plainId', title: "ID", width: 80},
            {field: 'title', title: "Title"},
        ]
        if(data){
            const hasColumn = "column" in data[0] 
            const hasRow = "row" in data[0] 
            const activeColumn = hasColumn && data.find(d=>d.column)
            const activeRow = hasRow && data.find(d=>d.row)
            
            if(  hasColumn || hasRow ){
                dynamic = buildDynamicFieldsForPrimitiveList( data.map(d=>d.primitive), (r)=>r.primitive )
                if( activeRow || activeColumn){
                    dynamic.splice(2, 0,
                        ...[ activeColumn && {field: 'column', title: "Column", width: 180, accessorFn: (r)=>{
                            return Array.isArray(r.column) ? (r.column?.map(d=>props.axisData?.column[d]?.label).filter(d=>d).join(", ") ?? "") : props.axisData?.column[r.column]?.label ?? ""
                        }},
                        activeRow && {field: 'row', title: "Row", width: 180, accessorFn: (r)=>{
                            return Array.isArray(r.row) ? (r?.row.map(d=>props.axisData?.row[d]?.label).filter(d=>d).join(", ") ?? "") : props.axisData?.row[r.row]?.label ?? ""
                        }}].filter(d=>d),
                    )
                }

               return dynamic 
            }
        }
        const metadata = data.find(d=>d?.metadata)?.metadata
        if( metadata?.id === PrimitiveConfig.Constants.GENERIC_SUMMARY){
            dynamic = [{field: 'plainId', title: "ID", width: 80}]
            const seen = new Set()
            data.forEach(d=>{
                if( d.referenceParameters?.structured_summary ){
                    d.referenceParameters.structured_summary.forEach(d=>{
                        if( !seen.has(d.heading)){
                            seen.add(d.heading)
                            dynamic.push({
                                field: d.heading, 
                                title: d.heading,
                                accessorFn: (r)=>getData(r).referenceParameters?.structured_summary?.find(d2=>d2.heading === d.heading)?.content
                            })
                        }
                    })
                }else{
                    if( !seen.has("summary")){
                        seen.add("summary")
                        dynamic.push({field: `summary`, title: "Summary"})
                    }
                }
            })

        }else{
            if( metadata?.renderConfig?.table?.fields){
                dynamic =metadata.renderConfig.table.fields.map(d=>{
                    return {
                        ...d,
                        accessorFn: (d.field === "plainId" || d.field === "id" || d.field === "title") ? (r)=>getData(r)?.[d.field] : (r)=>getData(r)?.referenceParameters?.[d.field]
                    }
                })
            }
        }
        return dynamic.map(d=>({
            ...d,
            accessorFn: d.accessorFn ?? ((r)=>getData(r)?.[d.field])
        }))
    }

    const columns = useMemo( ()=>{
        if(props.columns){
            mapColumns(props.columns)
        }else{
            let dynamic = []
            if( props.data?.length > 0){
                if( typeof(props.data[0] === "object") ){
                    dynamic = buildDynamicFieldsForPrimitiveList( props.data )
                }
            }
            return mapColumns( dynamic )
        }
    }, [props.columns?.map(d=>d.id).join("-")])
    //const data = useMemo( ()=>mapRows(props.data) , [props.data.map(d=>d.id).join("-")])

     const table = useReactTable({
                                columns,
                                data: props.data,
                                columnResizeMode: "onChange",
                                globalFilterFn: 'includesString',
                                state: {
                                    sorting,
                                    pagination,
                                    globalFilter
                                  },
                                  onGlobalFilterChange: setGlobalFilter,
                                  onPaginationChange: setPagination,
                                onSortingChange: setSorting,
                                getCoreRowModel: getCoreRowModel(),
                                getPaginationRowModel: getPaginationRowModel(),
                                getFilteredRowModel: getFilteredRowModel(),
                                getSortedRowModel: getSortedRowModel(),
                            });
 

    useLayoutEffect(()=>{
        if( gridRef.current ){
           const eWidths = {}
            const style = window.getComputedStyle(gridRef.current.parentElement)
            const parentWidth = parseInt(style.width) - parseInt(style.paddingLeft) - parseInt(style.paddingRight) - 20
            setTotalWidth(parentWidth)
            Array.from(gridRef.current.children).slice(1, columns.length).forEach((el, idx)=>{
                eWidths[columns[idx].accessorKey] = columns[idx].startSize ? (columns[idx].startSize < 1 ? columns[idx].startSize * parentWidth : columns[idx].startSize) : parentWidth / columns.length 
            })

            table.setColumnSizing( eWidths )
          
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

      const pageOptions = [10,20,50,100].map(d=>({id: d, title: d}))
      window.table = table
      // Number of rows that pass your filters (but before you slice into pages)
    const filteredCount = table.getFilteredRowModel().rows.length;
    const totalCount = table.getPreFilteredRowModel().rows.length;

    return (
        <>
        <UIHelper.DelayedInput
          value={globalFilter ?? ''}
          onChange={value => setGlobalFilter(value)}
          placeholder="Search table..."
        />
        <div key="table" className={`my-2 rounded-md border overflow-y-scroll relative text-sm  ${props.className}`}>
            <button 
                onClick={()=>copyToClipboard(table)}
                className="absolute top-2" style={{zIndex:10000}}>
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
                const id = row.original.primitive?.id
                const primitive = row.original.primitive
                return (
                    <>
                    <div className="contents group">
                    <div                         
                        onClick={props.onExpand ? (e)=>{e.stopPropagation();props.onExpand(primitive)} : undefined}
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
        <div className="w-full flex space-x-4 place-items-center text-sm justify-between pl-4">
            {filteredCount === totalCount && <p className="flex shrink-0 text-gray-500 font-semibold">{totalCount} items</p>}
            {filteredCount !== totalCount && <p className="flex shrink-0 text-gray-500 font-semibold">{totalCount} filtered to {filteredCount} items</p>}
            <div className="flex space-x-6 place-items-center text-sm ">
                <div className="flex space-x-4 w-48 place-items-center">
                    <p className="flex shrink-0 text-gray-500 font-semibold">Rows per page</p>
                    <UIHelper.OptionList name="rows_per_page" options={pageOptions} value={pagination.pageSize} onChange={d=>table.setPageSize(d)} zIndex={50} />
                </div>
                <div className="flex space-x-2 place-items-center">
                    <p className="flex shrink-0 text-gray-500 font-semibold">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() }</p>
                    <UIHelper.Button disabled={!table.getCanPreviousPage()} icon={<ChevronDoubleLeftIcon className="size-4 my-1 -mx-1"/>} action={()=>table.setPageIndex(0)}/>
                    <UIHelper.Button disabled={!table.getCanPreviousPage()} icon={<ChevronLeftIcon className="size-4 my-1 -mx-1"/>} action={()=>table.previousPage()}/>
                    <UIHelper.Button disabled={!table.getCanNextPage()} icon={<ChevronRightIcon className="size-4 my-1 -mx-1"/>} action={()=>table.nextPage()}/>
                    <UIHelper.Button disabled={!table.getCanNextPage()} icon={<ChevronDoubleRightIcon className="size-4 my-1 -mx-1"/>} action={()=>table.setPageIndex( table.getPageCount() - 1)}/>
                </div>
            </div>
        </div>
        </>
   )
}
