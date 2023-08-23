import MainStore from "./MainStore"
import {PrimitiveTable} from './PrimitiveTable';
import CardGrid from './CardGrid';
import GoogleHelper from './GoogleHelper';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Panel from './Panel';
import { useEffect, useState } from "react";
import { ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, ListBulletIcon, RectangleGroupIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import PrimitiveExplorer from "./PrimitiveExplorer";
import HierarchyView from "./HierarchyView";
import { HeroIcon } from "./HeroIcon";
import TooggleButton from "./ToggleButton";
import ProximityView from "./ProximityView";

const allViews = ["cluster", "explore", "cards","table", "list", "proximity" ]
const icons = {
    "explore": <RectangleGroupIcon className="w-5 h-5"/>,
    "cluster": <HeroIcon icon='Nest' className="w-5 h-5"/>,
    "table": <TableCellsIcon className="w-5 h-5"/>,
    "list": <ListBulletIcon className="w-5 h-5"/>,
    "cards": <HeroIcon icon='LargeGrid' className="w-5 h-5"/>,
}

export default function CollectionViewer({primitive, category, ...props}){
    const mainstore = MainStore()
    const [descend, setDescend] = useState(category ? category.descend : undefined)
    const [page, setPage] = useState(0)
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
                                "name": "Item"
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

    const active = Object.keys(category.views.options || {}) 
    let allowed = (props.permittedViews || allViews).filter((d)=>active.includes(d) && (!props.excludeViews || !props.excludeViews.includes(d) ))

    let clusters = primitive.primitives.allView.filter((d)=>d.referenceParameters?.target  === (category.id !== undefined ? `results.${category.id}` : "evidence") )

    if( clusters.length === 0 )
    {
        allowed = allowed.filter((d)=>d !== "cluster" && d !== "proximity")   
    }
    
    
    const pickDefault = ()=>{
        const view = props.defaultWide ? category.views.options?.defaultWide : category.views.options?.default
        return view || allowed[0] || "cards"
    }

    const [view, setView] = useState( pickDefault() )

    useEffect(()=>{
        setView( pickDefault() )
    }, [primitive.id, category?.id])

    useEffect(()=>{
        setPage(0)
    }, [view, descend])

    let cardConfig = category?.views.options?.[view] || {fields: ['title']}

    let list
    if( props.nested ){
        list = primitive.primitives.descendants
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
                    list = primitive.primitives.results.descendants.filter((d)=>d.referenceId === category.resultCategoryId)
                }else if( category.type ){
                    list = primitive.primitives.descendants.filter((d)=>d.type === category.type)
                }
                if( list ){
                    list = list.filter((d,i,a)=>a.findIndex((d2)=>d2.id === d.id) === i)
                }

            }else{
                list = primitive.primitives.results ? primitive.primitives.results[category.id].map((d)=>d) : []
            }
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
        const newObj = await mainstore.createPrimitive({
            parent: primitive,
            type: resultCategory?.primitiveType ?? category.type ?? "result",
            title: options.title || `New ${category.title}`,
            categoryId: resultCategory?.id,
            referenceParameters: options.referenceParameters
        })
        if(open && props.onPreview){
            props.onPreview( newObj )
        }

    }

    let title = category.plurals
    let createButtons

    if( resultCategory && !props.hidePanel ){
        title = (resultCategory.openai || resultCategory.doDiscovery) 
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
                
                createButtons = [{title:"Create new", action: ()=>createResult(undefined, true)}]
                if( resultCategory.parameters.notes ){
                    createButtons.push( {title: "Create from document", action: ()=>createNewResultFromDocument()} )
                }
                
                (primitive.metadata.actions || []).forEach((d)=>{
                    if( d.canCreate && d.resultCategory === resultCategory.id){
                        createButtons.push( {title: d.title, action: async ()=>await mainstore.doPrimitiveAction(primitive, d.key, {path: `results.${category.id}`})})
                    }
                })
    }

    const pageItems = view ==="table" && !props.defaultWide ? 25 : 100
    const pages = Math.ceil( list.length / pageItems)
    const showPagination = ["table", "list", "cards"].includes(view)

    const showBar = (showPagination && pages > 1) || (allowed.length > 1 || props.closeButton) && !["explore", "cluster"].includes(view)
    const buttons = <>
                {props.closeButton && <Panel.MenuButton icon={<ArrowsPointingInIcon className='w-4 h-4 -mx-1'/>} action={props.closeButton}/> }
                {allowed.length > 1 && category.views?.options && Object.keys(category.views.options).map((d)=>{
                    return  allowed.includes(d) && category.views.options[d] ? <Panel.MenuButton title={icons[d] || d} onClick={()=>setView(d)}/> : undefined
                })}
                {showDescend && <TooggleButton enabled={descend} setEnabled={setDescend} title={`Include ${category ? category.plurals : "items"} from children`}/>}
                {showPagination && <Panel.MenuButton narrow icon={<ChevronLeftIcon className='w-4 h-4 '/>} className='!ml-auto mr-1' action={()=>setPage(page > 0 ? page - 1 : page)}/>}
                {showPagination && <p className="bg-white border border-gray-300 flex place-items-center px-2 rounded-md shadow-sm text-gray-600 text-sm">{page + 1} / {pages}</p>}
                {showPagination && <Panel.MenuButton narrow icon={<ChevronRightIcon className='w-4 h-4'/>} className='mr-1' action={()=>setPage(page < (pages - 1) ? page + 1 : pages - 1)}/>}
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

    const content = <>
            {showBar && <div className={`flex w-full p-2  space-x-2  ${props.defaultWide ? "bg-gray-50 sticky top-0 z-20 rounded-t-lg border-b border-gray-200" : ""}`}>
                {buttons}
            </div>}
            {(list === undefined || list.length === 0)  
            ? <div className='w-full p-2'>
                    <button
                        type="button"
                        onClick={()=>createResult(undefined, true)}
                        className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                    <span className="mt-2 block text-sm font-semibold text-gray-900">Create a new {category.title}</span>
                    </button>
                </div>
            : <>
                {
                view === "table" && 
                    <PrimitiveTable 
                        onDoubleClick={props.onNavigate} 
                        onEnter={previewFromList} 
                        columns={cardConfig.fields} 
                        page={page}
                        pageItems={pageItems}
                        onClick ={props.onShowInfo}
                        onInnerCardClick ={props.onInnerShowInfo}
                        primitives={list} className='w-full min-h-[24em] bg-white'/> 
                }
                {view === "explore" &&
                    <PrimitiveExplorer 
                        primitive={primitive}
                        list={list}
                        category={category?.id !== undefined ? category : undefined}
                        fields={[cardConfig.fields, "top", "important"].flat()}
                        onClick ={props.onShowInfo}
                        onInnerCardClick ={props.onInnerShowInfo}
                        allowedCategoryIds={list.map((d)=>d.referenceId).filter((d,idx,a)=>a.indexOf(d)===idx)} 
                        buttons={buttons} 
                    />
                }
                {view === "list" && <CardGrid 
                    key="card_list"
                    primitive={primitive}
                    category={category?.id !== undefined ? category : undefined}
                    selectedItem={props.selected}
                    onCardClick ={props.onShowInfo}
                    onInnerCardClick ={props.onInnerShowInfo}
                    onEnter={previewFromList}
                    onDoubleClick={props.onNavigate}
                    page={page}
                    pageItems={pageItems}
                    list={list} 
                    showDetails={true}
                    className='p-2'
                    columnConfig={{"sm":1}}
                    />}
                {view === "cards" && <CardGrid  
                    key="card_grid"
                    primitive={primitive}
                    category={category?.id !== undefined ? category : undefined}
                    selectedItem={props.selected}
                    onCardClick ={props.onShowInfo}
                    onInnerCardClick ={props.onInnerShowInfo}
                    onEnter={previewFromList}
                    onDoubleClick={props.onNavigate}
                    page={page}
                    pageItems={pageItems}
                    list={list} 
                    className='p-2'
                    columnConfig={
                        cardConfig?.wide
                            ? {"xl":2, "6xl":3, "9xl":4, "11xl":5}
                            : {"md":2, "xl":3, "2xl":4}
                    }
                    />}

                {view === "cluster" && 
                    <HierarchyView 
                        buttons={buttons} 
                        primitive={clusters[0]}
                />}
                {view === "proximity" && 
                    <ProximityView primitive={clusters[0]}
                />}
            </>
        }
     </>

    
    return props.hidePanel 
        ? <div className={`@container  ${props.className} flex flex-col relative`}>{content}</div>
        : <Panel className='@container' expandButton={props.onExpand} key={category.title} count={list.length} title={title} titleButton={createButtons} titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true}>
            {content}
        </Panel>
    

}