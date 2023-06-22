import MainStore from "./MainStore"
import {PrimitiveTable} from './PrimitiveTable';
import CardGrid from './CardGrid';
import GoogleHelper from './GoogleHelper';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Panel from './Panel';
import { useEffect, useState } from "react";
import { ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import PrimitiveExplorer from "./PrimitiveExplorer";


export default function CollectionViewer({primitive, category, ...props}){
    const mainstore = MainStore()
    const active = Object.keys(category.views.options || {})
    const allowed = (props.permittedViews || ["table","cards","explore","list"]).filter((d)=>active.includes(d) && (!props.excludeViews || !props.excludeViews.includes(d) ))

    const pickDefault = ()=>{
        const view = props.defaultWide ? category.views.options?.defaultWide : category.views.options?.default
        return view || allowed[0] || "cards"
    }

    const [view, setView] = useState( pickDefault() )

    useEffect(()=>{
        console.log(`resetting ${category.id}`)
        setView( pickDefault() )
    }, [primitive.id, category.id])

    let cardConfig = category.views.options?.[view] || {fields: ['title']}

    let list = primitive.primitives.results ?  primitive.primitives.results[category.id].map((d)=>d) : []

    const resultCategory = mainstore.category(category.resultCategoryId)

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
            type: resultCategory?.primitiveType || "result",
            title: options.title || `New ${category.title}`,
            categoryId: resultCategory.id,
            referenceParameters: options.referenceParameters
        })
        if(open && props.onPreview){
            props.onPreview( newObj )
        }

    }


    const title = (resultCategory.openai || resultCategory.doDiscovery) 
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

    let createButtons = [{title:"Create new", action: ()=>createResult(undefined, true)}]
    if( resultCategory.parameters.notes ){
        createButtons.push( {title: "Create from document", action: ()=>createNewResultFromDocument()} )
    }
    
    (primitive.metadata.actions || []).forEach((d)=>{
        if( d.canCreate && d.resultCategory === resultCategory.id){
            createButtons.push( {title: d.title, action: async ()=>await mainstore.doPrimitiveAction(primitive, d.key, {path: `results.${category.id}`})})
        }
    })

    const showBar = (allowed.length > 1 || props.closeButton) && view !== "explore"
    const buttons = <>
                {props.closeButton && <Panel.MenuButton icon={<ArrowsPointingInIcon className='w-4 h-4 -mx-1'/>} action={props.closeButton}/> }
                {allowed.length > 1 && category.views?.options && Object.keys(category.views.options).map((d)=>{
                    return  allowed.includes(d) && category.views.options[d] ? <Panel.MenuButton title={d} onClick={()=>setView(d)}/> : undefined
                })}
            </>

    const content = <>
            {showBar && <div className="flex w-full p-2 space-x-2">
                {buttons}
            </div>}
            {(list === undefined || list.length === 0) && 
                <div className='w-full p-2'>
                    <button
                        type="button"
                        onClick={()=>createResult(undefined, true)}
                        className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                    <span className="mt-2 block text-sm font-semibold text-gray-900">Create a new {category.title}</span>
                    </button>
                </div>
            }
            {
            view === "table" && <div key="table" className="p-2 bg-white rounded-md h-[60vh]">
                <PrimitiveTable 
                    onDoubleClick={props.onPreviewFromList} 
                    columns={cardConfig.fields} 
                    primitives={list} className='w-full min-h-[24em] bg-white'/> 
            </div>
            }
            {view === "explore" &&
                <PrimitiveExplorer 
                    primitive={primitive}
                    types='entity'
                    renderProps={{
                        hideCover: true,
                        urlShort: true,
                        fixedSize: "16rem"
                    }}
                    onCardClick ={props.onShowInfo}
                    buttons={buttons} 
                />
            }
            {view === "list" && <CardGrid 
                key="card_list"
                primitive={primitive}
                category={category}
                selectedItem={props.selected}
                cardClick={(e)=>e.currentTarget.focus()}
                onEnter={props.onPreviewFromList}
                onDoubleClick={props.onNavigate}
                list={list} 
                showDetails={true}
                columnClass='mt-2'
                />}
            {view === "cards" && <CardGrid  
                key="card_grid"
                primitive={primitive}
                category={category}
                selectedItem={props.selected}
                cardClick={(e)=>e.currentTarget.focus()}
                onEnter={props.onPreviewFromList}
                onDoubleClick={props.onNavigate}
                list={list} 
                columnClass={
                    cardConfig?.wide 
                        ? `@xl:columns-2 @[70rem]:columns-3 @[95rem]:columns-4 @[120rem]:columns-5`
                        : `@md:columns-2 @xl:columns-3 @2xl:columns-4`
                }
                />}
            </>

    
    return props.hidePanel 
        ? <div className={`@container p-1 ${props.className}`}>{content}</div>
        : <Panel className='@container' expandButton={props.onExpand} key={category.title} count={list.length} title={title} titleButton={createButtons} titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true}>
            {content}
        </Panel>
    

}