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

export function PrimitiveTable(props) {
    const [showLink, setShowLink] = useState(false)
    const [showNew, setShowNew] = useState(false)
    const [extraPrimitives, setExtraPrimitives] = useState([false])

    const nullInfo = {isResizingColumn: false,
        startOffset: null,
        startSize: null,
        deltaOffset: null,
        deltaPercentage: null,
        columnSizingStart: [],}

    const ids = props.primitives.map((d)=>d.id)

    const linkTo = async (picked)=>{
        if( picked ){
            if( showLink.target ){
                showLink.target.addRelationship(picked, showLink.path)
            }else{
                setExtraPrimitives([...extraPrimitives, picked] )
            }
        }
    }
    
    const mapRows = (rows, columns) =>{
        return rows.map((d)=>{
            const metadata = d.metadata
            return columns.reduce((r, c)=>{
                if( c.field === 'title')
                {
                    r[c.field] = d.title                    
                }else if( c.field === "referenceName"){
                    r[c.field] = d.metadata?.title
                }else if( c.field === "id" || c.field === "plainId"){
                    r[c.field] = d.plainId
                }else{

                    r[c.field] = (d.referenceParameters ? d.referenceParameters[c.field] : undefined) || metadata?.parameters?.[c.field]?.default
                }
                return r
            },{primitive: d})
        })
    }
    const mapColumns = (columns) =>{
        const columnHelper = createColumnHelper()

        const fixed = columns.map((d)=>{
            const width = (props.wide ? (d.wideWidth ?? d.width) : d.width) ?? 100
                          
            if(d.magic){
                if( d.magic === "addresses_components"){
                    return columnHelper.accessor(d.magic,
                        {
                            export: info => info.row.original.primitive.addresses_components.map((d)=>`VF${d.order + 1}: ${d.title}`).join('<br>'),
                            cell: info => {
                                const list = info.row.original.primitive.addresses_components?.map((d)=><p className={`flex justify-center place-items-center px-1 py-0.5 m-0.5 rounded-full text-xs whitespace-nowrap bg-${d.lens.base}-200 text-${d.lens.base}-800`}>VF{d.order + 1}: {d.title}</p>)
                                return <div className="flex overflow-hidden flex-wrap place-items-start h-fit">
                                    {list}
                                </div>
                            },
                            header: () => d.name || d.title,
                            sortingFn: (a,b,idx)=>{
                                        return (a.original.primitive.addresses_components?.map((d)=>d.order).join("-") || "").localeCompare(b.original.primitive.addresses_components?.map((d)=>d.order).join("-") || "") || 0
                                    },
                            startSize: width,
                            minSize: width
                        })
                        
                }
                if( d.magic === "row" || d.magic === "column"){
                    if( props.primitive?.referenceParameters?.explore?.axis?.[d.magic]?.type === "category" ){
                        const rowPrim = props.primitive?.primitives.axis[d.magic].allItems[0]
                        const categories = rowPrim.primitives.allCategory
                        if( rowPrim){
                            return columnHelper.accessor(d.field,
                                {
                                    export: info => {
                                        const primitive = info.row.original.primitive
                                        const aligned = primitive.parentPrimitiveIds
                                        const matched = categories.filter(d=>aligned.includes(d.id))
                                        console.log(`Access for categor export ${categories.length}`)
                                        return matched.map(d=>d.title).join(", ")
                                    },
                                    cell: info => {
                                        const primitive = info.row.original.primitive
                                        const aligned = primitive.parentPrimitiveIds
                                        const matched = categories.filter(d=>aligned.includes(d.id))
                                        return <p className={d.wrap ? "" :"truncate"}>{matched.map(d=>d.title).join(", ")}</p>
                                    },
                                    header: () => d.name || d.title,
                                    sortingFn: "basic"
                                })
                            }
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
                    }
                if( d.magic === "relationship"){
                    return columnHelper.accessor(d.magic + d.resultId,
                        {
                            export: info =>{
                                const primitive = info.row.original.primitive
                                const items = primitive.primitives.results[d.resultId]?.allItems
                                return items.map((d)=>`${d.metadata?.title ?? d.type} #${d.plainId} - ${d.title}`).join('<br>')
                            }, 
                            cell: info => {
                                const primitive = info.row.original.primitive
                                const items = primitive.primitives[d.relationship]?.allItems
                                const list = items.map((d)=>
                                    <PrimitiveCard.RelationshipItem
                                        key={d.id ?? d.plainId}
                                        primitive={d}
                                        parent={primitive}
                                        onSelect={props.onClick}
                                    />
                                )
                                return <div className="flex flex-wrap w-full  place-items-start group">
                                    {list}
                                </div>
                            },
                            header: () => d.name || d.title,
                            sortingFn: (a,b,idx)=>{
                                        return (a.original.primitive.addresses_components?.map((d)=>d.order).join("-") || "").localeCompare(b.original.primitive.addresses_components?.map((d)=>d.order).join("-") || "") || 0
                                    },
                            startSize: width,
                            minSize: width
                        })
                        
                    }
                if( d.magic === "results"){
                    return columnHelper.accessor(d.magic + d.resultId,
                        {
                            export: info =>{
                                const primitive = info.row.original.primitive
                                const items = primitive.primitives.results[d.resultId]?.allItems
                                return items.map((d)=>`${d.metadata?.title ?? d.type} #${d.plainId} - ${d.title}`).join('<br>')
                            }, 
                            cell: info => {
                                const primitive = info.row.original.primitive
                                const items = primitive.primitives.results[d.resultId]?.allItems
                                const category = primitive.metadata?.resultCategories?.[ d.resultId ]
                                const list = items.map((d)=>
                                    <PrimitiveCard.RelationshipItem
                                        key={d.id ?? d.plainId}
                                        primitive={d}
                                        parent={primitive}
                                        onSelect={props.onClick}
                                    />
                                )
                                return <div className="flex flex-wrap w-full  place-items-start group">
                                    {list}
                                    <div className="flex w-full invisible group-hover:visible">
                                        <button 
                                            onClick={(e)=>{e.stopPropagation();setShowNew({target: primitive, type:category?.type, referenceId: category?.resultCategoryId})}}
                                            className='flex justify-center place-items-center py-1 px-1 shrink-0 grow-0 self-center rounded-full border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                                            <PlusCircleIcon className='w-4 h-4 align-center'/>
                                        </button>
                                        <button 
                                            onClick={(e)=>{e.stopPropagation();setShowLink({target: primitive, path: `results.${d.resultId}`, type:category?.type, referenceId: category?.resultCategoryId})}}
                                            className='flex justify-center place-items-center py-1 px-1 shrink-0 grow-0 self-center rounded-full border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                                            <MagnifyingGlassIcon className='w-4 h-4 align-center'/>
                                        </button>
                                    </div>
                                </div>
                            },
                            header: () => d.name || d.title,
                            sortingFn: (a,b,idx)=>{
                                        return (a.original.primitive.addresses_components?.map((d)=>d.order).join("-") || "").localeCompare(b.original.primitive.addresses_components?.map((d)=>d.order).join("-") || "") || 0
                                    },
                            startSize: width,
                            minSize: width
                        })
                        
                    }
            }else{
                
                if( !d.type){
                    if( d.field === "revenue"){
                        d.type = "currency"
                    }
                }

                if( d.field === "contact"){
                    return columnHelper.accessor(d.field,
                        {
                            cell: info => <PrimitiveCard.RenderItem compact={true} item={{type:'contact', value: info.getValue() }}/>,
                            header: () => d.name || d.title,
                            sortingFn: (a,b,idx)=>{
                                        return (a.original.primitive.referenceParameters?.contactName || "None Specified").localeCompare((b.original.primitive.referenceParameters?.contactName || "None Specified")) || 0
                                    },
                            startSize: width,
                            minSize: width
                        })

                }
                else if( d.field === "logo_title"){
                    return columnHelper.accessor(d.field,
                        {
                            export: info => info.row.original.primitive.title,
                            cell: info => <>
                                                <VFImage className="object-cover w-8 h-8 mr-2" src={`/api/image/${info.row.original.primitive.id}`}/>
                                                <p className="text-md text-color-800 truncate">{info.row.original.primitive.title}</p>
                                            </>,
                            header: () => d.name || d.title,
                            sortingFn: (a,b,idx)=>{
                                        return (a.original.primitive.title || "None Specified").localeCompare((b.original.primitive.title || "None Specified")) || 0
                                    },
                            startSize: width,
                            minSize: width
                        })

                }else if(d.type === 'boolean'){
                    return columnHelper.accessor(d.field,
                        {
                            cell: info => <p className={d.wrap ? "" :"truncate"}>{info.getValue() ? <FlagIcon className="w-4 h-4 text-indigo-600"/> : ""}</p>,
                            header: () => d.name || d.title,
                            sortingFn: (a,b)=>{
                                console.log(a.getValue(d.field));
                                return (a.getValue(d.field) ? 1 : 0) - (b.getValue(d.field) ? 1 : 0) },
                            startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                            startSize: width,
                            minSize: width
                        })
                }else if(d.type === 'currency'){
                    return columnHelper.accessor(d.field,
                        {
                            cell: info => <p className={d.wrap ? "" :"truncate"}>{roundCurrency(info.getValue())}</p>,
                            header: () => d.name || d.title,
                            sortingFn: "basic",
                            startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                            startSize: width,
                            minSize: width
                        })
                }else if(d.type === 'state'){
                    return columnHelper.accessor(d.field,
                        {
                            cell: info => {
                                return <PrimitiveCard.RenderItem compact={true} primitive={info.row.original.primitive} item={{type:'state', value: info.getValue() }}/>
                            },
                            header: () => d.name || d.title,
                            sortingFn: (a,b)=>{
                                console.log(a.getValue(d.field));
                                return (a.getValue(d.field) ? 1 : 0) - (b.getValue(d.field) ? 1 : 0) },
                            startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                            startSize: width,
                            minSize: width
                        })
                }else if(d.field === 'metadataInfo'){
                    return columnHelper.accessor(d.field,
                        {
                            cell: info => <PrimitiveCard.SmallMeta inline primitive={info.row.original.primitive} />,
                            header: () => d.name || d.title,
                            sortingFn: (a,b)=>{
                                return a.original.primitive?.metadata?.title.localeCompare(b.original.primitive?.metadata?.title)
                            },
                            startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                            startSize: width,
                            minSize: width
                        })

                }else if(d.field === 'id'){
                    return columnHelper.accessor(d.field,
                        {
                            cell: info => <p className={d.wrap ? "" :"truncate"}>{info.getValue()}</p>,
                            header: () => d.name || d.title,
                            sortingFn: "basic",
                            startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                            startSize: width,
                            minSize: width
                        })
                }else{

                    return columnHelper.accessor(d.field,
                        {
                            cell: info => <p className={d.wrap ? "" :"truncate"}>{info.getValue()}</p>,
                            header: () => d.name || d.title,
                            sortingFn: "alphanumeric",
                            startSize: d.width ?? (d.field === "id" ? 100 : undefined),
                            startSize: width,
                            minSize: width
                        })
                    }
                }
        })
        if(props.config.columns){
            const plain = props.primitives.map((d)=>d.primitives.results[props.config.columns.resultId]?.allItems).flat().filter((d,i,a)=>a.findIndex((d2)=>d2.id === d.id) === i)
            const category = props.primitives[0]?.metadata.resultCategories[props.config.columns.resultId]
            const items = [plain, extraPrimitives].flat().filter((d)=>d)
            const lastItem = items.length - 1
            const dynamic = items.map((d, idx)=>{
                const width = (props.wide ? 200  : 100) 

                console.log(category)

                return columnHelper.accessor(d.id,
                    {
                        cell: info => {
                            const primitive = info.row.original.primitive
                            const path = `results.${props.config.columns.resultId}`
                            
                            return(<div className="flex h-6 items-center w-full justify-center">
                                <input
                                    aria-describedby="comments-description"
                                    type="checkbox"
                                    checked={d.parentPrimitiveIds.includes(primitive.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                                    onClick={(e)=>e.stopPropagation()}
                                    onChange={(e)=>{
                                        console.log(e.nativeEvent)
                                        e.nativeEvent.stopPropagation()
                                        if( d.parentPrimitiveIds.includes(primitive.id) ){
                                            primitive.removeRelationship(d, path)
                                        }else{
                                            primitive.addRelationship(d, path)
                                        }
                                    }

                                    }
                                />
                            </div>)
                        },
                        header: () => {
                            return (<div className="flex w-full">
                                <PrimitiveCard.RelationshipItem
                                    primitive={d}
                                    className='w-full'
                                    onSelect={props.onClick}
                                />
                            </div>)
                        },
                        sortingFn: (a,b,idx)=>{
                                    return (a.original.primitive.addresses_components?.map((d)=>d.order).join("-") || "").localeCompare(b.original.primitive.addresses_components?.map((d)=>d.order).join("-") || "") || 0
                                },
                        startSize: width,
                        minSize: width
                    })
                    
            })
            dynamic.push(
                columnHelper.accessor("add",
                    {
                        cell: info => {},
                        header: () => {
                            return (<div className="flex flex-col w-fit">
                                        <button 
                                            onClick={(e)=>{e.stopPropagation();setShowNew({type:category?.type, referenceId: category?.resultCategoryId})}}
                                            className='flex justify-center place-items-center py-1 px-1 shrink-0 grow-0 self-center rounded-full border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                                            <PlusCircleIcon className='w-4 h-4 align-center'/>
                                        </button>
                                        <button 
                                            onClick={(e)=>{e.stopPropagation();setShowLink({type:category?.type, referenceId: category?.resultCategoryId})}}
                                            className='flex justify-center place-items-center py-1 px-1 shrink-0 grow-0 self-center rounded-full border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                                            <MagnifyingGlassIcon className='w-4 h-4 align-center'/>
                                        </button>
                            </div>)
                        },
                        startSize: 20,
                        minSize: 20
                    })
            )
            return [fixed, dynamic].flat()
        }
        return fixed
    }

    const [totalWidth, setTotalWidth] = useState( null )
    const [selected, setSelected] = useState( null )
    const [focus, setFocus] = useState( null )
    const [sorting, setSorting] = useState([])
    const [count, forceUpdate] = useReducer( (x)=>x+1, 0)
    const gridRef = useRef()
    const columns = useMemo( ()=>mapColumns(props.config.fields), [props.primitive, extraPrimitives.map((d)=>d.id).join('-')] )
    const data = useMemo( ()=>mapRows(props.primitives, props.config.fields), [ids.join("_"), count] )
    useDataEvent('set_title set_parameter relationship_update', ids, forceUpdate)


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
            setTotalWidth(parentWidth)
            Array.from(gridRef.current.children).slice(1, columns.length).forEach((el, idx)=>{
                eWidths[columns[idx].accessorKey] = columns[idx].startSize ? (columns[idx].startSize < 1 ? columns[idx].startSize * parentWidth : columns[idx].startSize) : parentWidth / columns.length 
                console.log(columns[idx].accessorKey, columns[idx].startSize,parentWidth,eWidths[columns[idx].accessorKey])
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
        console.log('click')
       /* setTimeout(()=>{
        switch (e.detail) {
          case 1:*/
            setSelected(primitive.id)
            if( props.onClick ){
                props.onClick( e, primitive )
            }
           /* break;
          case 2:
            if(props.onDoubleClick){
                const list = table.getRowModel().rows.map((d)=>d.original.primitive)
                props.onDoubleClick(e,primitive, list, list.findIndex((d)=>d.id === primitive.id)) 
            }
            break;
        }
        },props.onDoubleClick ? 200 : 0)*/
      };


      const handleHeaderClick = (e, column)=>{
        if( e.target.classList.contains('myheader') ){
            column.getToggleSortingHandler()(e)
        }
      }

      const alignTop = props.config.align === "top"

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
            data-test={count}
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
                                className={`p-2 py-3 border-b group-hover:bg-gray-100 border-gray-100 outline-none flex ${alignTop ? "" : "place-items-center"} ${selected === primId ? "bg-ccgreen-100" : ""}`}
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
        {showLink && <PrimitivePicker target={showLink.target} callback={linkTo} setOpen={setShowLink} type={showLink.type} referenceId={showLink.resultCategoryId} />}
        {showNew && <NewPrimitive parent={showNew.target} category={showNew.referenceId} title={showNew.type} type={showNew.type} done={(d)=>{setShowNew(false);if(!showNew.target){setExtraPrimitives([...extraPrimitives, d])}}} cancel={()=>setShowNew(false)}/>}
        </>
   )
}
