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
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, ChevronLeftIcon, ChevronRightIcon, ClipboardDocumentIcon, ExclamationTriangleIcon} from "@heroicons/react/24/outline";
import useDataEvent from "./CustomHook";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { min } from "date-fns";
import { VFImage } from "./VFImage";
import PrimitivePicker from "./PrimitivePicker";
import NewPrimitive from "./NewPrimitive";
import { roundCurrency } from "./SharedTransforms";
import UIHelper from "./UIHelper";
import { Combobox, ComboboxLabel, ComboboxOption } from "./@components/combobox";
import { Input } from "./@components/input";
import PrimitiveConfig from "./PrimitiveConfig";
import { Badge } from "./@components/badge";
import { Temporal } from "@js-temporal/polyfill";
import clsx from "clsx";
import { Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Select, SelectItem } from "@heroui/react";
import {Icon} from "@iconify/react"  


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
    const [isPopped, setIsPopped] = useState(false);
    const tableRef = useRef()

    const mapColumns = (columns) =>{
        const columnHelper = createColumnHelper()

        const fixed = columns.map((d)=>{
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
            if(d.renderType){
                switch(d.renderType){
                    case "title_with_error":
                        return columnHelper.accessor(d.title,
                            {
                                cell: info => <div className="flex space-x-1 place-items-center">
                                        {info.row.original.error && <ExclamationTriangleIcon className="text-red-600 size-4"/>}
                                        <p>{info.row.original.title}</p>
                                    </div>,
                                header: () => d.name || d.title,
                                sortingFn: "alphanumeric",
                                filterFn: 'includesString',
                                accessorFn: d.accessorFn,
                                fromStructure: d.fromStructure,
                                startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                                minSize: d.minWidth ?? d.width,
                                size: d.width ?? d.minWidth
                            })
                    case "numbered_title":
                        return columnHelper.accessor(d.title,
                            {
                                cell: info => {
                                    return <div className="flex flex-col space-y-1">
                                        <span className="text-slate-700 text-md">{info.row.original?.title ?? ""}</span>
                                        <span className="text-slate-600 font-light text-[0.75em]">W-{info.row.original?.plainId ?? ""}</span>
                                    </div>
                                },
                                header: () => d.title,
                                accessorFn:(info)=>info.plainId + " - " + info.title,
                                export:(info)=>info.row.original?.plainId + " - " + info.row.original?.title,
                                startSize: d.width,
                                minSize:d.minWidth ?? d.width,
                                size: d.width ?? d.minWidth

                            })
                    case "react":
                        return columnHelper.accessor(d.title,
                            {
                                cell: info => {
                                    const data = info.row.original?.[d.field] 
                                    return data
                                },
                                header: () => d.title,
                                accessorFn: (info)=>info[d.field]?.text,
                                //export:(info)=>info.row.original?.[d.field]?.text,
                                startSize: d.width,
                                minSize: d.minWidth ?? d.width,
                                size: d.width ?? d.minWidth
                            })
                    case "pill":
                        return columnHelper.accessor(d.title,
                            {
                                cell: info => {
                                    const data = [info.row.original?.[d.field]].flat().filter(Boolean)
                                    return data.map(d=><Chip variant="flat" size="sm">{d}</Chip>)
                                },
                                header: () => d.title,
                                accessorFn: (info)=>[info[d.field]].flat().filter(Boolean).join(","),
                                export:(info)=>info.row.original?.[d.field]?.text,
                                startSize: d.width,
                                minSize: d.minWidth ?? d.width,
                                size: d.width ?? d.minWidth
                            })
                    case "date":
                        return columnHelper.accessor(d.title,
                            {
                                cell: info => {
                                    const data = info.row.original?.[d.field]
                                    if( data instanceof Temporal.Instant || data instanceof Temporal.PlainDate || data instanceof Temporal.ZonedDateTime ){
                                        const justDate = data.toPlainDate().toLocaleString("en-US", {
                                            day:   "numeric",
                                            month: "long",
                                            year:  "numeric"
                                          });
                                        return <p>{justDate}</p>
                                    }
                                    return data
                                },
                                accessorFn: (info)=>info[d.field]?.toString(),
                                header: () => d.title,
                                export:(info)=>info.row.original?.[d.field]?.toString(),
                                startSize: d.width,
                                minSize: d.minWidth ?? d.width,
                                size: d.width ?? d.minWidth
                            })
                    case "actions":
                        return columnHelper.accessor(d.title,
                            {
                                cell: info => {
                                    const data = d.field ? info.row.original?.[d.field] : info.row.original
                                    return <div className="flex space-x-2">{
                                        d.actions.map(d=>{
                                            if( typeof(d) === "function" ){
                                                const res = d( data )                                        
                                                if( !res ){
                                                    return <></>
                                                }
                                                d = res
                                            }
                                            return <UIHelper.IconButton  icon={d.icon} action={()=>d.action(data)}/>
                                        })
                                    }</div>
                                },
                                accessorFn: (info)=>"",
                                header: () => d.title,
                                export:(info)=>undefined,
                                startSize: d.width,
                                minSize: d.minWidth ?? d.width,
                                size: d.width ?? d.minWidth
                            })
                }
            }
            return columnHelper.accessor(d.field ?? d.title,
                {
                    cell: info => <p className={d.wrap ? "" :"truncate"}>{info.getValue()}</p>,
                    header: () => d.name || d.title,
                    sortingFn: "alphanumeric",
                    filterFn: 'includesString',
                    accessorFn: d.accessorFn,
                    fromStructure: d.fromStructure,
                    startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                    minSize: d.minWidth ?? d.width,
                    size: d.width ?? d.minWidth,
                    allocSpace: d.allocSpace !== false
                })
        })
        return fixed
    }

    const [globalFilter, setGlobalFilter] = useState('')

    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: 20,
      })    
      

    const [selected, setSelected] = useState( null )
    const [focus, setFocus] = useState( null )
    const [sorting, setSorting] = useState([])
    const [count, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [columnSizing, setColumnSizing] = useState({});
    const gridRef = useRef()
    const hasLeftAction = props.onExpand || props.enableCopy !== false 
    

    function buildDynamicFieldsForPrimitiveList( data, getData = (r)=>r ){
        let dynamic = [
            {field: 'plainId', title: "ID", width: 100, allocSpace: false},
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
        if( props.primitive.type === "search" && props.primitive.metadata.actingOn){
            const contentParentCategoryId = props.primitive.metadata.actingOn
            dynamic.push(
                {
                    field: 'parent',
                    title: "Related to", 
                    width: 180, 
                    accessorFn: (r)=>{
                            return r.findParentPrimitives({referenceId:[contentParentCategoryId],first:true})?.[0]?.title
                    }
                })
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
            return mapColumns(props.columns)
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
                                enableColumnResizing: true,
                                columnResizeMode: "onChange",
                                defaultColumn: { 
                                    minSize: 50
                                },
                                globalFilterFn: 'includesString',
                                state: {
                                    sorting,
                                    pagination,
                                    globalFilter,
                                    columnSizing
                                  },
                                  onColumnSizingChange: (updaterOrObject) => {
                                    setColumnSizing(prev => {
                                      const rawSizing = typeof updaterOrObject === "function" ? updaterOrObject(prev) : updaterOrObject;
                                      const clamped = {};
                                      table.getAllLeafColumns().forEach(col => {
                                        const requested = rawSizing[col.id];
                                        if (typeof requested !== "number") return; // skip if not set
                                        const min = col.columnDef.minSize ?? 50;
                                        clamped[col.id] = Math.max(requested, min);
                                      });
                                
                                      return { ...prev, ...clamped };
                                    });
                                  },
                                  onGlobalFilterChange: setGlobalFilter,
                                  onPaginationChange: setPagination,
                                onSortingChange: setSorting,
                                getCoreRowModel: getCoreRowModel(),
                                getPaginationRowModel: getPaginationRowModel(),
                                getFilteredRowModel: getFilteredRowModel(),
                                getSortedRowModel: getSortedRowModel(),
                            });
 


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

      window.table = table
    const filteredCount = table.getFilteredRowModel().rows.length;
    const totalCount = table.getPreFilteredRowModel().rows.length;

    

    const didInit = useRef(false);
    useLayoutEffect(() => {
      if (didInit.current) return;
      didInit.current = true;
  
      if (!gridRef.current) return;
      const parent = gridRef.current.parentElement;
      if (!parent) return;
      const style = window.getComputedStyle(parent);
      const parentWidth =
        parent.clientWidth -
        parseFloat(style.paddingLeft || 0) -
        parseFloat(style.paddingRight || 0);
  
      // Grab every visible leaf column
      const leafColumns = table.getVisibleLeafColumns();
  
      let sumMin = 0, colsToShare= 0
      leafColumns.forEach((col) => {
        const declaredMin = col.columnDef.minSize || 50;
        sumMin += declaredMin;
        if( col.columnDef.allocSpace){
            colsToShare++
        }
      });
  
      const extra = Math.max(0, parentWidth - sumMin);
      const perColumnExtra = extra > 0 ? extra / leafColumns.length : 0;
  
      const initialSizing = {};
      leafColumns.forEach((col) => {
        if( col.columnDef.allocSpace ){
            const declaredMin = col.columnDef.minSize || 50;
            initialSizing[col.id] = Math.floor(declaredMin + perColumnExtra);
        }
      });
  
      table.setColumnSizing(initialSizing);
    }, [table]);
  
    const leafColumns = table.getVisibleLeafColumns();
    const sizing = table.getState().columnSizing || {};

    useEffect(()=>{
        if( tableRef?.current ){
            const el = tableRef.current
            const vh = window.innerHeight;
            const eh = el.offsetHeight;

            // compute the top/left so element’s center matches viewport’s center
            el.style.top  = `${(vh - eh) / 2}px`;
        }

    }, [isPopped, tableRef?.current, pagination?.pageSize])
  
    const templateColsArray = [];
    if (hasLeftAction) {
      templateColsArray.push("min-content");
    }
    leafColumns.forEach((col, idx) => {
        const raw = sizing[col.id];
      
        const widthPx = typeof raw === "number" ? raw: (col.columnDef.minSize || 50);
      
        if (idx < leafColumns.length - 1) {
          templateColsArray.push(`${widthPx}px`);
        } else {
          templateColsArray.push(`minmax(${widthPx}px, 1fr)`);
        }
      });
  
    // Join them into one string for CSS:
    const templateColumns = templateColsArray.join(" ");
    
    const tableContent = <div className="flex flex-col @container">
        <div className="flex space-x-1 place-items-center">
            {props.popout && <Button onPress={()=>setIsPopped(!isPopped)} size="sm" variant="light" isIconOnly>
                        <Icon icon={isPopped ? "ri:collapse-diagonal-line" : "ri:expand-diagonal-line"} className="w-5 h-5 text-slate-500"/>
            </Button>}

            <UIHelper.DelayedInput
            value={globalFilter ?? ''}
            onChange={value => setGlobalFilter(value)}
            placeholder="Search table..."
            />
        </div>
        <div key="table" className={`my-2 rounded-md border overflow-y-scroll relative ${props.className} `}>
        <div 
            ref={gridRef}
            style={{
                gridTemplateColumns: templateColumns
            }}
            onKeyDown={keyHandler}
            className={clsx(
                "grid w-full overflow-x-auto relative max-h-full",
                isPopped ? "max-h-[85vh]" : ""
            )}>
            {table.getHeaderGroups().map(headerGroup => (
                <>
                {hasLeftAction && <div className="flex place-items-center relative sticky top-0 z-10 mx-0.5 bg-white border-b border-gray-200 shrink-0">
                    {props.enableCopy && <UIHelper.IconButton icon={ClipboardDocumentIcon} onClick={()=>copyToClipboard(table)}/>}
                </div>}
                {headerGroup.headers.map((header,idx) => {
                    const last = idx === columns.length - 1
                    return (
                    <div 
                        key={header.id}
                        onClick={(e)=>handleHeaderClick(e, header.column)}
                        className={`myheader flex place-items-center space-x-2 relative px-2 sticky top-0 z-10 bg-white border-b border-gray-200 py-2 font-bold uppercase text-slate-500 text-[0.75em]`}
                        >
                    {header.isPlaceholder
                        ? null
                        : <div className="myheader select-none">{header.column.columnDef.header()}</div>
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
                const id = row.original.primitive?.id ?? row.original.data?.primitive?.id ?? row.original.id
                const primitive = row.original.primitive
                return (
                    <>
                    <div className="contents group">
                    {hasLeftAction && !props.onExpand && <div></div>}
                    {props.onExpand && 
                        <div                         
                            onClick={props.onExpand ? (e)=>{e.stopPropagation();props.onExpand(primitive ?? id)} : undefined}
                            className={`group-hover:bg-gray-100 flex justify-center place-items-center pl-1 cursor-pointer text-gray-300 group-hover:text-gray-400 hover:text-gray-600 border-b border-gray-100 outline-none ${selected === id ? "bg-ccgreen-100" : ""}`}>
                            <Icon icon="ri:expand-diagonal-line" className="w-4 h-4"/>
                        </div>
                    }
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
                                className={`place-items-center p-2 py-3 border-b group-hover:bg-gray-100 border-gray-100 outline-none flex ${alignTop ? "" : "place-items-center"} ${selected === id ? "bg-ccgreen-100" : ""}`}
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
        <div className="w-full flex space-y-2 @xl:space-y-0 @xl:space-x-4 flex-col @xl:flex-row @xl:justify-between place-items-center text-sm">
                <div className="flex space-x-4 place-items-center justify-between w-full">
                    {filteredCount === totalCount && <p className="flex shrink-0 text-gray-500 font-semibold">{totalCount} items</p>}
                    {filteredCount !== totalCount && <p className="flex shrink-0 text-gray-500 font-semibold">{totalCount} filtered to {filteredCount} items</p>}
                    <div className="flex grow-0 shrink-0 place-items-center space-x-2 w-min-content">
                        <Select 
                            variant="bordered" 
                            classNames={{
                                mainWrapper:"min-w-20" 
                            }}
                            label="Rows per page" 
                            labelPlacement="outside-left" 
                            selectedKeys={[`${pagination.pageSize}`]}
                            onChange={e=>table.setPageSize(parseInt(e.target.value))}>
                                {["10","20","50","100"].map(d=><SelectItem textValue={d} key={d}>{d}</SelectItem>)}
                        </Select>
                    </div>
                </div>
                <div className="flex space-x-2 place-items-center justify-between w-full">
                    <p className="flex shrink-0 text-gray-500 font-semibold">Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() }</p>
                    <div className="flex space-x-2">
                        <UIHelper.Button disabled={!table.getCanPreviousPage()} icon={<ChevronDoubleLeftIcon className="size-4 my-1 -mx-1"/>} action={()=>table.setPageIndex(0)}/>
                        <UIHelper.Button disabled={!table.getCanPreviousPage()} icon={<ChevronLeftIcon className="size-4 my-1 -mx-1"/>} action={()=>table.previousPage()}/>
                        <UIHelper.Button disabled={!table.getCanNextPage()} icon={<ChevronRightIcon className="size-4 my-1 -mx-1"/>} action={()=>table.nextPage()}/>
                        <UIHelper.Button disabled={!table.getCanNextPage()} icon={<ChevronDoubleRightIcon className="size-4 my-1 -mx-1"/>} action={()=>table.setPageIndex( table.getPageCount() - 1)}/>
                    </div>
                </div>
        </div>
        </div>
    if(props.popout){
        return (
                <div
                className={clsx(
                    isPopped ? "fixed inset-0 z-100" : ""
                )}
                >
                <div
                    className={clsx(
                    "absolute inset-0 bg-black bg-opacity-30 backdrop-blur-sm",
                    isPopped ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                    onClick={() => setIsPopped(false)}
                />

                <div
                    ref={tableRef}
                    className={clsx(
                    "toolbar-wrapper",  
                    isPopped && "absolute left-8 right-8 p-4 bg-white rounded-lg shadow-xl overflow-auto"
                    )}
                    onClick={e => e.stopPropagation()}
                >
                    {tableContent}
                </div>
                </div>
            );

    }
   return tableContent 
}
