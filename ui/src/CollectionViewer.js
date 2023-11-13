import MainStore from "./MainStore"
import {PrimitiveTable} from './PrimitiveTable';
import CardGrid from './CardGrid';
import GoogleHelper from './GoogleHelper';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Panel from './Panel';
import { useEffect, useState } from "react";
import { ArrowLeftCircleIcon, ArrowPathIcon, ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, ListBulletIcon, PencilIcon, PlayIcon, RectangleGroupIcon, TableCellsIcon, TrashIcon } from '@heroicons/react/24/outline';
import PrimitiveExplorer from "./PrimitiveExplorer";
import HierarchyView from "./HierarchyView";
import { HeroIcon } from "./HeroIcon";
import TooggleButton from "./ToggleButton";
import ProximityView from "./ProximityView";
import {PlusCircleIcon, MagnifyingGlassIcon} from "@heroicons/react/24/outline";
import NewPrimitive from "./NewPrimitive";
import PrimitiveConfig from "./PrimitiveConfig";
import PrimitivePicker from "./PrimitivePicker";
import { PrimitiveCard } from "./PrimitiveCard";
import { InputPopup } from './InputPopup';
import ViewBase from "./ViewBase";
import AIProcessButton from "./AIProcessButton";
import EditableTextField from "./EditableTextField";
import { Menu } from "@headlessui/react";
import { Float } from "@headlessui-float/react";

const allViews = ["cards","cluster", "explore", "table","table_grid", "list", "proximity" ]
const icons = {
    "explore": <RectangleGroupIcon className="w-5 h-5 -mx-1"/>,
    "cluster": <HeroIcon icon='Nest' className="w-5 h-5 -mx-1"/>,
    "proximity": <HeroIcon icon='FABullseye' className="w-5 h-5 -mx-1"/>,
    "table": <TableCellsIcon className="w-5 h-5 -mx-1"/>,
    "table_grid": <TableCellsIcon className="w-5 h-5 -mx-1"/>,
    "list": <ListBulletIcon className="w-5 h-5 -mx-1"/>,
    "cards": <HeroIcon icon='LargeGrid' className="w-5 h-5 -mx-1"/>,
}

export default function CollectionViewer({primitive, category, ...props}){
    const mainstore = MainStore()
    const [descend, setDescend] = useState(category ? category.descend : undefined)
    const [page, setPage] = useState(0)
    const [showNew, setShowNew] = useState(false)
    const [showLink, setShowLink] = useState(false)
    const [showSearch, setShowSearch] = useState(false)
    const [showViewerPick, setShowViewerPick] = useState(true)
    const [viewerPick, setViewerPick] = useState( props.viewSelf ? primitive : undefined )
    const [manualInputPrompt, setManualInputPrompt] = useState(false)
    const [filters, setFilters] = useState(false)
    const asViewer = category?.views?.options?.viewer || props.viewSelf
    let showDescend = category?.views?.options?.descend

    if( category === undefined){
        category = {
            views: {
                options: {
                    cluster: {},
                    explore:{},
                    cards:{
                        "fields":["title"]
                    },
                    table: {
                        fields: [
                            {
                                "field": "id",
                                "name": "Id"
                            },
                            {
                                "field": "title",
                                "name": "Item",
                                "width": 0.7
                            },
                            {
                                "field": "referenceName",
                                "name": "Type"
                            }
                        ],
                    },
                   // defaultWide: 'table'                
                }
            },
        }
    }
    let viewCategory = category
    if( asViewer ){
        viewCategory = mainstore.category(category.resultCategoryId).resultCategories[0]
    }
    if( viewCategory?.viewsFromtarget){
        viewCategory = mainstore.category(viewCategory.resultCategoryId).resultCategories[0]
    }
    
    const active = Object.keys(viewCategory.views.options || {}) 
    let allowed = (props.permittedViews || allViews).filter((d)=>active.includes(d) && (!props.excludeViews || !props.excludeViews.includes(d) ))
    
    
    const pickDefault = ( )=>{
        if( asViewer ){
            if( viewerPick ){
                if( viewerPick.referenceParameters?.viewSelection ){
                    return viewerPick.referenceParameters?.viewSelection
                }
            }
        }
        const view = props.defaultWide ? viewCategory.views.options?.defaultWide : viewCategory.views.options?.default
        return view || allowed[0] || "cards"
    }


    const processFromClipboard = async (field)=>{
        if (navigator.clipboard) {
            // Attempt to read text from the clipboard
            const text = await navigator.clipboard.readText()
              
                // `text` variable now contains the text from the clipboard
                const items = text.split(',')
                if( window.confirm(`Create ${items.length} from:\n${items.slice(0,10).join('\n')}`) ){
                   for( const url of items){
                        await createResult({referenceParameters: {[field]: url}})
                   } 
                }
              
          } else {
            // Clipboard API is not supported
            console.error("Clipboard API is not supported in this browser.");
          }
    }


    const [view, setView] = useState( pickDefault() )

    useEffect(()=>{
        setViewerPick( list?.[0] )
    }, [primitive.id, category?.id, viewCategory?.id])

    useEffect(()=>{
        setView( pickDefault( ) )
    }, [primitive.id, category?.id, viewerPick])

    const pickView = (view)=>{
        if( asViewer && viewerPick ){
            viewerPick.setField('referenceParameters.viewSelection', view)
        }
        setView( view)
    }

    useEffect(()=>{
        setPage(0)
    }, [view, descend])

    let cardConfig = viewCategory?.views.options?.[view] || {fields: ['title']}

    let list
    if(props.viewSelf ){
        list = [primitive]
    }else{
        if( props.nested ){
            list = primitive.type === "activity" ? primitive.primitives.results.descendants : primitive.primitives.descendants
            if( props.nestedTypes ){
                const types = [props.nestedTypes].flat()
                list = list.filter((d)=>types.includes( d.type ) )
            }
            if( props.nestedReferenceIds ){
                const ids = [props.nestedReferenceIds].flat()
                list = list.filter((d)=>ids.includes( d.referenceId ) )
            }
        }else{        
            if( descend ){
                if( category.resultCategoryId ){
                    list = primitive.primitives.descendants.filter((d)=>d.referenceId === category.resultCategoryId)
                }else if( category.type ){
                    list = primitive.primitives.descendants.filter((d)=>d.type === category.type)
                }
                if( list ){
                    list = MainStore().uniquePrimitives( list )
                }
                
            }else{
                list = primitive.primitives.results ? primitive.primitives.results[category.id].map((d)=>d) : []
            }
        }     
        if( filters && filters.length > 0){
            let postFilter = []
            for(const filter of filters){
                if( filter.type === "parent"){
                    postFilter = postFilter.concat( list.filter(d=>d.parentPrimitiveIds.includes(filter.id)) )
                }
            }
            list = postFilter
        }
    }
    let clusters = props.viewSelf ? [primitive] : [] //primitive?.primitives.allView.filter((d)=>!props.nestedTypes || d.referenceParameters.target === props.nestedTypes) // list.filter((d)=>d.type === "view" )
    //let clusters = props.viewSelf ? [primitive] : list.filter((d)=>d.type === "view" )


    clusters = primitive?.primitives?.allView

    if( !props.viewSelf && !asViewer && clusters.length === 0 )
    {
        allowed = allowed.filter((d)=>d !== "cluster" && d !== "proximity")   
    }

    const resultCategory = category.resultCategoryId ? mainstore.category(category.resultCategoryId) : undefined

    const createNewResultFromDocument = async( )=>{
        GoogleHelper().showPicker({}, async (items)=>{
        for( const item of items){
            await createResult( {
                title: item.name,
                referenceParameters: {
                    notes: {type: "google_drive", id: item.id, mimeType: item.mimeType, name: item.name}
                }
            })
            }
        })
    }

    const createResult = async( options = {}, open = false )=>{
        if( options.actionFields){
            if(!options.action?.key){
                console.error("NOT IMPLEMENETED")
                return
            }
                setManualInputPrompt({
                  primitive: primitive,
                  fields: options.actionFields,
                  confirm: async (inputs)=>{
                    const actionOptions = {
                        ...options.action,
                        path: `results.${category.id}`,
                        ...inputs
                    }
                    console.log(options.action.key , actionOptions)
                    await MainStore().doPrimitiveAction(primitive, options.action.key , actionOptions)
                  },
                })
            return
        }
        const type = resultCategory?.primitiveType ?? category.type ?? "result"

        if( PrimitiveConfig.typeConfig[type]?.needCategory && !resultCategory){
            setShowNew( type )
            return
        }
        const newObj = await mainstore.createPrimitive({
            parent: primitive,
            type: type,
            title: options.title || `New ${category.title}`,
            categoryId: resultCategory?.id,
            referenceParameters: options.referenceParameters
        })
        if(open && props.onPreview){
            props.onPreview( newObj )
        }

    }
    const linkTo = async (picked)=>{
        console.log(`got `, picked)
    }

    let title = category.plurals
    let createButtons

    if(  !props.hidePanel ){
        title = resultCategory && (resultCategory.openai || resultCategory.doDiscovery) 
        ? <div className='flex place-items-center'>
                    {category.plurals || category.title}
                    <button
                    type="button"
                    onClick={props.setShowAIPopup ? (e)=>{e.stopPropagation();props.setShowAIPopup({category:resultCategory, path: category.id})} : undefined}
                    className="text-xs ml-2 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full text-gray-400 font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                        <FontAwesomeIcon icon="fa-solid fa-robot" />
                    </button>
                    </div>
                : category.plurals || category.title
                
                if( !props.hideCreate ){

                    const defaultCreateOptions = category?.views?.create?.default

                    createButtons = [{title:"Create new", action: ()=>createResult(defaultCreateOptions, true)}]
                    if( category?.views?.options?.showLink ){
                        createButtons.push( {title: "Link existing", action: ()=>setShowLink(true)} )
                        
                    }
                    if( category?.views?.options?.createFromPaste ){
                        category?.views?.options?.createFromPaste.forEach(p=>{
                            createButtons.push( {title: `Create fom clipboard (${p.title})`, action: async ()=>await processFromClipboard(p.field)} )
                        })
                    }
                    if( resultCategory){
                        
                        if( resultCategory.parameters.notes ){
                            createButtons.push( {title: "Create from document", action: ()=>createNewResultFromDocument()} )
                        }
                        
                        (primitive.metadata.actions || []).forEach((d)=>{
                            if( d.canCreate && d.resultCategory === resultCategory.id){
                                createButtons.push( {title: d.title, action: async ()=>await mainstore.doPrimitiveAction(primitive, d.key, {path: `results.${category.id}`})})
                            }
                        })
                    }
                }
    }

    const toggleFilter = (item)=>{
        let found = false
        const newFilters = (filters || []).filter(d=>{
            if( d.type === item.type && d.id === item.id){
                found = true
                return false
            }
            return true
        })
        if( !found ){
            newFilters.push( item )
        }
        setFilters(newFilters)
    }

    let actionMenu = false
    if(resultCategory?.actions ){
        const items = resultCategory.actions.filter(d=>d.menu)
        if( items.length > 0){
            actionMenu = <PrimitiveCard.CardMenu 
                            icon={<PlayIcon className="w-4 h-4 m-[0.45rem]"/>} 
                            custom={items.map(d=>{
                                return {
                                    ...d,
                                    action: async ()=>await MainStore().doPrimitiveAction( primitive, "auto_cascade", {cascade_key: d.key, ids: list?.map(d=>d.id)})
                                }
                            })} 
                            size={10}
                        />

        }

    }

    const pageItems = view ==="table" && !props.defaultWide ? 25 : 100
    const pages = Math.ceil( list.length / pageItems)
    const showPagination = ["table", "list", "cards"].includes(view) && pages > 1
    const showSearchButton = category?.searchCategoryIds

    const showBar = (showDescend || showPagination  || (allowed.length > 1 || props.closeButton)) //&& !["explore", "cluster"].includes(view)
    const buttons = <>
                {allowed.length > 1 && viewCategory.views?.options && Object.keys(viewCategory.views.options).map((d)=>{
                    return  allowed.includes(d) && viewCategory.views.options[d] ? <Panel.MenuButton title={icons[d] || d}  onClick={()=>pickView(d)} className={view === d ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}/> : undefined
                })}
                {showDescend && <TooggleButton enabled={descend} setEnabled={setDescend} title={`Include nested ${category ? category.plurals : "items"}`}/>}
                <div className="grow"></div>
                
                {showPagination && <div className="flex w-fit space-x-1">
                    <Panel.MenuButton narrow icon={<ChevronLeftIcon className='w-4 h-4 '/>} className='mr-1' action={()=>setPage(page > 0 ? page - 1 : page)}/>
                    <p className="bg-white border border-gray-300 flex place-items-center px-2 rounded-md shadow-sm text-gray-600 text-sm mr-1">{page + 1} / {pages}</p>
                    <Panel.MenuButton narrow icon={<ChevronRightIcon className='w-4 h-4'/>} className='mr-1' action={()=>setPage(page < (pages - 1) ? page + 1 : pages - 1)}/>
                </div>}
                {actionMenu && actionMenu}
                {showSearchButton && <Panel.MenuButton icon={<MagnifyingGlassIcon className='w-4 h-4 -mx-1'/>}  action={()=>setShowSearch(!showSearch)}/> }
                {props.closeButton && <Panel.MenuButton icon={<ArrowsPointingInIcon className='w-4 h-4 -mx-1'/>}  action={props.closeButton}/> }
            </>

            const previewFromList = (p)=>{
                if( p && props.onPreviewFromList){
                    const idx = list.findIndex((d)=>p.id === d.id)
                    if( idx > -1){
                        props.onPreviewFromList(undefined, undefined, list, idx)
                    }
                }
            }

            
    if( !allowed.includes(view)){
        return <></>
    }


    const buttonBar = showBar && <div className={`flex w-full p-2  space-x-4 w-full ${(props.defaultWide || asViewer) ? "bg-gray-50 sticky top-0 z-20 rounded-t-lg bg-gray-50 border-b border-gray-200 " : ""}`}>
                {buttons}
            </div>
    let searchPane = <></>
    if( showSearch && category){
        const searches = primitive.primitives.search?.[category.id] 
        const searchCategoryId = [category?.searchCategoryIds].flat()?.[0] 

        const createSearch = async ()=>{
            const path = `search.${category.id}`
            console.log(`Will add to ${path}`)
            const newPrim = await MainStore().createPrimitive({type: 'search', parent: primitive, categoryId: searchCategoryId, parentPath: path})
    }
        searchPane = <div className="py-2 bg-slate-50 border m-2 rounded-lg divide-y divide-gray-200 border-b border-gray-300">
                {(!searches || searches.length === 0) && <button
                type="button"
                onClick={createSearch}
                className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    <span className="mt-2 block text-sm font-semibold text-gray-900">{'Create a new query'}</span>
                </button>}
                {searches && searches.length > 0 && <>
                    {searches.map(d=>{
                    let action = false, active = false, error = false
                    let title = <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                    return (
                    <div className="group w-full py-2 px-4 space-y-1  hover:bg-gray-50 hover:subtle-shadow-bottom">
                        <div className="w-full flex space-x-2 min-h-16">
                            <div className="flex place-items-center w-full mb-1 text-slate-500">
                                <MagnifyingGlassIcon className="w-5 h-5 mr-1"/>
                                <PrimitiveCard primitive={d} compact titleAtBase hideTitle showEdit disableHover editing className='w-full place-items-center !bg-transparent'/>
                            </div>
                            <div className="flex w-fit shrink-0 ">
                                <div
                                    type="button"
                                    onClick={()=>toggleFilter({type: "parent", id: d.id})}
                                    className={[
                                    'text-xs ml-2 py-0.5 px-1.5 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                                        filters && filters.find(d2=>d2.type === "parent" && d2.id === d.id) ? "bg-ccgreen-100 border-ccgreen-600 text-ccgreen-800 border" : "bg-white text-gray-400"
                                    ].join(" ")}
                                    >
                                    {d.primitives.uniqueAllIds.length} items
                                </div>
                                <div
                                    type="button"
                                    className={[
                                    'text-xs ml-2 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                                        active ? "bg-ccgreen-100 border-ccgreen-600 text-ccgreen-800 border" : 
                                        error ? "bg-red-100 border-red-600 text-red-800 border" : "bg-white text-gray-400"
                                    ].join(" ")}
                                    onClick={()=>mainstore.doPrimitiveAction(d, "query")}>
                                {title}</div>
                                <div
                                    type="button"
                                    className={[
                                        'text-xs ml-0.5 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                                        "bg-white text-gray-400"
                                    ].join(" ")}
                                    onClick={()=>mainstore.promptDelete({prompt: "Remove search and all results?", handleDelete: ()=>mainstore.removePrimitive(d)})}>
                                    {<TrashIcon className="h-4 w-4" aria-hidden="true" />}</div>
                            </div>
                        </div>
                        <Panel collapsable open={false}>
                            <div className="w-full flex-col text-xs my-2 space-y-1">
                                <PrimitiveCard.Parameters primitive={d} editing leftAlign compactList className="text-xs text-slate-500" fullList fields={Object.keys(d.metadata.parameters ?? {}).filter(d=>d !== "sources")}/>
                                {false && <div className="w-full space-x-1 flex-wrap">
                                    <span className="text-slate-500">Keywords:</span>{
                                    (d.referenceParameters?.keywords?.split(",") || []).map(d=>(
                                        <span className="inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-xs text-green-700 ring-1 ring-inset ring-green-600/20">{d}</span>
                                    ))
                                }</div>}
                            </div>
                            <span className="text-gray-400 text-xs">#{d.plainId}  {d.metadata.title ?? "Search"}</span>
                        </Panel>
                    </div>
                )}) }
                <div className="px-4 pt-2">
                    <Panel.MenuButton small title={<><MagnifyingGlassIcon className="h-4 mr-1"/>New Search</>} action={createSearch} className='flex place-items-center'/>
                </div>
                </>
                }
            </div>
    }

    const content = ()=><>
            {(list === undefined || list.length === 0)  
            ? <div className='w-full p-2'>
                    {!category?.views?.options?.showLink && <button
                        type="button"
                        onClick={()=>createResult(undefined, true)}
                        className="relative flex place-items-center justify-center w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-gray-400 hover:text-gray-600"
                    >
                        <PlusCircleIcon className='w-6 h-6 align-center mr-2'/>
                        <span className="text-sm font-semibold ">Create a new {category.title}</span>
                    </button>}
                    {category?.views?.options?.showLink && <div
                        className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-8 flex justify-center"
                    >
                        <div className='w-fit'>
                            <button 
                                onClick={()=>createResult(undefined, true)}
                                className='flex justify-center place-items-center py-2 px-2 shrink-0 grow-0 self-center rounded-md border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                                <PlusCircleIcon className='w-6 h-6 align-center mr-2'/>
                                <span className="text-sm">Create a new {category.title}</span>
                            </button>
                            <button 
                                onClick={()=>setShowLink(true)}
                                className='flex justify-center place-items-center py-2 px-2 shrink-0 grow-0 self-center rounded-md border border-transparent hover:border-gray-300 font-medium text-gray-400 hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2'>
                                <MagnifyingGlassIcon className='w-6 h-6 align-center mr-2'/>
                                <span className="text-sm">Link existing {category.title}</span>
                            </button>
                        </div>
                    </div>}
                </div>
            : asViewer
            ? <ViewBase primitive={viewerPick} closeButton={props.closeButton} isExpanded={showViewerPick} setExpanded={setShowViewerPick}/>
            : <>
                {view === "table" && 
                    <PrimitiveTable 
                        onDoubleClick={props.onNavigate} 
                        onEnter={previewFromList} 
                        config={cardConfig} 
                        page={page}
                        pageItems={pageItems}
                        onClick ={props.onShowInfo}
                        wide={props.defaultWide}
                        onInnerCardClick ={props.onInnerShowInfo}
                        primitives={list} className='w-full min-h-[24em] bg-white'/> 
                }
                {view === "table_grid" && 
                    <PrimitiveTable 
                        onDoubleClick={props.onNavigate} 
                        onEnter={previewFromList} 
                        config={cardConfig} 
                        page={page}
                        pageItems={pageItems}
                        onClick ={props.onShowInfo}
                        wide={props.defaultWide}
                        onInnerCardClick ={props.onInnerShowInfo}
                        primitives={list} className='w-full min-h-[24em] bg-white'/> 
                }
                {view === "list" && <CardGrid 
                    key="card_list"
                    primitive={asViewer ? viewerPick : primitive}
                    category={category?.id !== undefined ? category : undefined}
                    selectedItem={props.selected}
                    onCardClick ={props.onShowInfo}
                    onInnerCardClick ={props.onInnerShowInfo}
                    onEnter={previewFromList}
                    onDoubleClick={props.onNavigate}
                    page={page}
                    pageItems={pageItems}
                    list={asViewer ? undefined : list} 
                    showDetails={true}
                    className='p-2'
                    columnConfig={{"sm":1}}
                    />}
                {view === "cards" && <CardGrid  
                    key="card_grid"
                    primitive={asViewer ? viewerPick : primitive}
                    category={category?.id !== undefined ? category : undefined}
                    selectedItem={props.selected}
                    onCardClick ={props.onShowInfo}
                    onInnerCardClick ={props.onInnerShowInfo}
                    onEnter={previewFromList}
                    onDoubleClick={props.onNavigate}
                    page={page}
                    pageItems={pageItems}
                    list={asViewer ? undefined : list} 
                    className='p-2'
                    columnConfig={
                        cardConfig?.wide
                            ? {"xl":2, "6xl":3, "9xl":4, "11xl":5}
                            : {"md":2, "xl":3, "2xl":4}
                    }
                    />}
                {view === "explore" &&
                    <PrimitiveExplorer 
                        primitive={asViewer ? (props.viewSelf ? primitive : viewerPick ) : primitive}
                        //list={asViewer ? (props.viewSelf ? undefined : viewerPick?.primitives.allItems ) : list}
                        list={asViewer ? undefined : list}
                        compare={category?.views?.options?.explore?.compare}
                        category={
                            asViewer 
                            ? viewCategory
                            : category?.id !== undefined ? category : undefined
                        }
                        fields={[cardConfig.fields, "top", "important","duplicate"].flat()}
                        onClick ={props.onShowInfo}
                        onInnerCardClick ={props.onInnerShowInfo}
                        allowedCategoryIds={asViewer ? undefined : list.map((d)=>d.referenceId).filter((d,idx,a)=>a.indexOf(d)===idx)} 
                    />
                }
                {view === "cluster" && 
                    <HierarchyView 
                        primitive={asViewer ? viewerPick : clusters[0]}
                />}
                {view === "proximity" && 
                    <ProximityView 
                        primitive={asViewer ? viewerPick : clusters[0]}
                />}
            </>
        }
        {showNew && <NewPrimitive parent={primitive} title={showNew} type={showNew} done={()=>setShowNew(false)} cancel={()=>setShowNew(false)}/>}
        {showLink && <PrimitivePicker callback={linkTo} setOpen={setShowLink} type={category?.type} referenceId={category?.resultCategoryId} />}
     </>

    let mainContent 
    /*if( props.viewSelf || (asViewer && !showViewerPick) ){
        mainContent = ()=><div 
                className={`w-full min-h-[40vh] h-full bg-white rounded-md flex ${props.hidePanel ? "" : "max-h-[80vh]"}`}
            >
            <div className="w-full flex flex-col grow-0 max-h-[inherit]">
                {viewerPick && content()}
            </div>
        </div>

    }else */
    if( asViewer ){
        const showPicker = (showViewerPick || props.viewSelf)
        mainContent = ()=><div 
              //  style={{gridTemplateColumns: "9rem calc(100% - 9rem)"}}
                className={`w-full flex min-h-[40vh] h-full bg-white rounded-md  ${props.hidePanel ? "" : "max-h-[80vh]"}`}
            >
            {showPicker &&
                <div className={[
                        props.defaultWide ? "w-48 p-2" : "w-36 p-1 ",
                        "border-r shrink-0 max-h-[inherit] flex flex-col place-content-between"
                    ].join(" ")}>
                    <div className="overflow-y-scroll space-y-2 p-1">
                        {list.map((d)=><PrimitiveCard primitive={d} compact onClick={()=>setViewerPick(d)} showExpand onEnter={()=>mainstore.sidebarSelect(d)} className={d === viewerPick ? "!bg-ccgreen-100 !border-ccgreen-200 !border" : "!border !border-gray-50"}/>)}
                    </div>
                    <div className='shrink-0 grow-0'>
                        <Panel.MenuButton title="Create new" className='w-full'/>
                    </div>
                </div>
            }
            <div 
                style={showPicker ? {width: `calc(100% - ${props.defaultWide ? "12" : "9"}rem)`} : {}}
                className="w-full flex flex-col grow-0 max-h-[inherit]">
                {viewerPick && <div className='flex overflow-y-scroll flex-col h-full'>{content()}</div>}
            </div>
        </div>
    }else{
        mainContent = ()=><>
            {buttonBar}
            {searchPane}
            {content()}
        </>
    }
    
    const maxHeight = !asViewer && !props.hidePanel && view === "explore" && list?.length > 0 ? "relative max-h-[80vh] flex-col flex bg-white" : ""

    return <>
        {manualInputPrompt && <InputPopup cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
        {props.hidePanel 
        ? <div className={`@container  ${props.className} flex flex-col relative`}>{mainContent()}</div>
        : <Panel 
            panelClassName={`@container ${maxHeight} bg-gray-50 border`} 
            expandButton={props.onExpand} 
            key={category.title} 
            count={list.length} 
            title={title} 
            titleButton={createButtons} 
            titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' 
            open={props.open} 
            collapsable={true}>
            {()=>mainContent()}
        </Panel>}
     </>
    

}