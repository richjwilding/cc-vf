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
import useDataEvent from "./CustomHook";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { min } from "date-fns";
import { VFImage } from "./VFImage";
  

const ExpandArrow = function(props) {
  return (
      <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path clipRule="evenodd" fillRule="evenodd" d="M15 3.75a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0V5.56l-3.97 3.97a.75.75 0 11-1.06-1.06l3.97-3.97h-2.69a.75.75 0 01-.75-.75zM9.53 14.47A.75.75 0 019.53 15.53L5.56 19.5h2.69a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75v-4.5a.75.75 0 011.5 0v2.69l3.97-3.97a.75.75 0 011.06 0z" />
      </svg>
  
  );
}

    const mapColumns = (columns) =>{
        const columnHelper = createColumnHelper()

        return columns.map((d)=>{

            if( d.field === "contact"){
                return columnHelper.accessor(d.field,
                    {
                        cell: info => <PrimitiveCard.RenderItem compact={true} item={{type:'contact', value: info.getValue() }}/>,
                        header: () => d.name || d.title,
                        sortingFn: (a,b,idx)=>{
                                    return (a.original.primitive.referenceParameters?.contactName || "None Specified").localeCompare((b.original.primitive.referenceParameters?.contactName || "None Specified")) || 0
                                },
                        minSize: 100,
                    })

            }
            if( d.field === "logo_title"){
                return columnHelper.accessor(d.field,
                    {
                        cell: info => <>
                                            <VFImage className="object-cover w-8 h-8 mr-2" src={`/api/image/${info.row.original.primitive.id}`}/>
                                            <p className="text-md text-color-800 truncate">{info.row.original.primitive.title}</p>
                                        </>,
                        header: () => d.name || d.title,
                        sortingFn: (a,b,idx)=>{
                                    return (a.original.primitive.title || "None Specified").localeCompare((b.original.primitive.title || "None Specified")) || 0
                                },
                        minSize: 100,
                    })

            }
            return columnHelper.accessor(d.field,
                {
                    cell: info => <p className="truncate">{info.getValue()}</p>,
                    header: () => d.name || d.title,
                    sortingFn: "text",
                    startSize: d.field === "id" ? 100 : undefined,
                    minSize: 100,
                })
        })
    }

export function PrimitiveTable(props) {

    const nullInfo = {isResizingColumn: false,
        startOffset: null,
        startSize: null,
        deltaOffset: null,
        deltaPercentage: null,
        columnSizingStart: [],}

    const ids = props.primitives.map((d)=>d.id)
    
    const mapRows = (rows, columns) =>{

        return rows.map((d)=>{
            const metadata = d.metadata
            return columns.reduce((r, c)=>{
                if( c.field === 'title')
                {
                    r[c.field] = d.title                    
                }else if( c.field === "referenceName"){
                    r[c.field] = d.metadata?.title
                }else if( c.field === "id"){
                    r[c.field] = d.plainId
                }else{

                    r[c.field] = (d.referenceParameters ? d.referenceParameters[c.field] : undefined) || metadata?.parameters?.[c.field]?.default
                }
                return r
            },{primitive: d})
        })
    }

    const [totalWidth, setTotalWidth] = useState( null )
    const [selected, setSelected] = useState( null )
    const [focus, setFocus] = useState( null )
    const [sorting, setSorting] = useState([])
    const [count, forceUpdate] = useReducer( (x)=>x+1, 0)
    const gridRef = useRef()
    const columns = useMemo( ()=>mapColumns(props.columns) )
    const data = useMemo( ()=>mapRows(props.primitives, props.columns), [ids.join("_"), count] )
    useDataEvent('set_title set_parameter', ids, forceUpdate)


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
            const eWidths = {}
            const style = window.getComputedStyle(gridRef.current.parentElement)
            const parentWidth = parseInt(style.width) - parseInt(style.paddingLeft) - parseInt(style.paddingRight) - 20
            console.log(`set to ${parentWidth}`)
            console.log(gridRef.current)
            setTotalWidth(parentWidth)
            Array.from(gridRef.current.children).slice(1, columns.length).forEach((el, idx)=>{
                eWidths[columns[idx].accessorKey] = columns[idx].startSize || parentWidth / columns.length 
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
        let index = selected ? rows.findIndex((d)=>d.original.primitive.id === selected) : 0

        if( delta === 0){
            if( props.onEnter ){
                props.onEnter(rows[index].original.primitive)
            }
            return
        }

        index += delta
        if( index < 0){index = 0}
        if( index >= rows.length){index = rows.length - 1}
        const newId = rows[index]?.original.primitive.id
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
        updateFocus()
    },[selected])

    const handleClick = (e, primitive) => {
        setTimeout(()=>{
        switch (e.detail) {
          case 1:
            setSelected(primitive.id)
            if( props.onClick ){
                props.onClick( e, primitive )
            }
            break;
          case 2:
            if(props.onDoubleClick){
                const list = table.getRowModel().rows.map((d)=>d.original.primitive)
                props.onDoubleClick(e,primitive, list, list.findIndex((d)=>d.id === primitive.id)) 
            }
            break;
        }
        },props.onDoubleClick ? 200 : 0)
      };


      const handleHeaderClick = (e, column)=>{
        if( e.target.classList.contains('myheader') ){
            column.getToggleSortingHandler()(e)
        }
      }

    return (
        <div key="table" className={`p-2 bg-white rounded-md overflow-y-scroll `}>
        <div 
            ref={gridRef}
            data-test={count}
            style={{
                gridTemplateColumns: `20px ${Object.values(gridWidths).join(" ")}`
            }}
            onKeyDown={keyHandler}
            className="grid text-sm w-full overflow-x-auto relative max-h-full">
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
                        : <p>{flexRender(header.column.columnDef.header,header.getContext())}</p>
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
                const primitive = row.original.primitive
                const primId = primitive.id
                return (
                    <>
                    <div className="contents group">
                    <div                         
                        onClick={(e)=>{e.stopPropagation();props.onEnter(primitive)}}
                        className={`group-hover:bg-gray-100 flex justify-center place-items-center pl-1 cursor-pointer text-gray-200 group-hover:text-gray-400 hover:text-gray-600 border-b border-gray-100 outline-none ${selected === primId ? "bg-ccgreen-100" : ""}`}>
                        <ExpandArrow className='w-4 h-4 '/>
                    </div>
                    {row.getVisibleCells().map(cell => {
                        return (
                            <>
                            {selected === primId && focus &&
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
                                id={`r_${primId}`}
                                onClick={(e)=>handleClick(e, primitive)}
                                onBlur={updateFocus}
                                //onDoubleClick={props.onDoubleClick ? ()=>props.onDoubleClick(prim) : undefined}
                                className={`p-2 py-3 border-b group-hover:bg-gray-100 border-gray-100 outline-none flex place-items-center ${selected === primId ? "bg-ccgreen-100" : ""}`}
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
   )
}
