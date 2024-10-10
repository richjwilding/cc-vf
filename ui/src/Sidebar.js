import { PrimitiveCard } from './PrimitiveCard'
import { Transition } from '@headlessui/react'
import { useEffect, useState } from 'react'
import {
    PlayIcon,
  PlusIcon as PlusIconOutline,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { HeroIcon } from './HeroIcon'
import ConfirmationPopup from "./ConfirmationPopup";
import MainStore from './MainStore'
import Panel from './Panel'
import PrimitiveConfig from './PrimitiveConfig'
import PrimitivePicker from './PrimitivePicker'
import { VFImage } from './VFImage'
import useDataEvent from './CustomHook'
import CardGrid from './CardGrid'
import { InputPopup } from './InputPopup'
import QueryCard from './QueryCard'
import SummaryCard from './SummaryCard'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Sidebar({primitive, ...props}) {
    const [manualInputPrompt, setManualInputPrompt] = useState(false)
    const [showDeletePrompt, setShowDeletePrompt] = useState(false)
    const [showUnlinkPrompt, setShowUnlinkPrompt] = useState(false)
    const [showLink, setShowLink] = useState(false)
    const [fulltext, setFullText] = useState()
    
    useDataEvent('set_field relationship_update', Array.isArray(primitive) ?  primitive.map(d=>d?.id) : primitive?.id )

    let infoPane = props.infoPane
    let isMulti = false
    let commonMultiType 
    
    if( Array.isArray(primitive) ){
        if(primitive.length === 1){
            primitive = primitive[0]
        }else{
            primitive = primitive.map((d)=> d instanceof Object ? d : MainStore().primitive(d)).filter((d)=>d)
            isMulti = true
        }
    }
    if( primitive && !(primitive instanceof Object) ){
        primitive = MainStore().primitive(primitive)
    }

    useEffect(()=>{
        setFullText()
    }, [primitive?.id, isMulti])

    if( primitive === undefined ){
        return(<></>)
    }
    let metadata = primitive.metadata
    let task = primitive.originTask
    let origin = task && (primitive.originId !== task.id) ? primitive.origin : undefined
    let showSource = metadata?.sidebar?.showSource ?? PrimitiveConfig.sidebar[primitive.type]?.source ?? true
    let showAddToResult = metadata?.sidebar?.addToResult ?? PrimitiveConfig.sidebar[primitive.type]?.addToResult ?? false



    const promptDelete = ( deleteNested )=>{
        let nestedPrompt = deleteNested ? `, and ${nestedCount} nested items.\nWARNING: This will removed nested items entirely, not just from this itemt` : ""
        if( isMulti ){
            setShowDeletePrompt( {prompt: `Are you sure you want to remove ${primitive.length} items${nestedPrompt}`, deleteNested: deleteNested} )
        }else{

            setShowDeletePrompt( {prompt: `Are you sure you want to remove ${primitive.displayType} #${primitive.plainId}${nestedPrompt}`, deleteNested: deleteNested} )
        }
     // setPrimitive(null)
    }

    const handleDelete = async ()=>{
        
        if( isMulti ){
            for( const p of primitive ){
                if( showDeletePrompt.deleteNested ){
                    await p.removeChildren(true)
                }
                await MainStore().removePrimitive( p )
            }
        }else{
            if( showDeletePrompt.deleteNested ){
                await primitive.removeChildren(true)
            }
            MainStore().removePrimitive( primitive )
        }
      setShowDeletePrompt( null )
      props.setOpen(false)
    }

    const linkTo = async (picked)=>{
        const list = isMulti ? primitive : [primitive]

        for( const p of list){
            if( picked.metadata && picked.metadata.resultCategories ){
                const target = picked.metadata.resultCategories.filter((d)=>d.resultCategoryId === p.referenceId)[0]
                let relationship
                if( target ){
                    relationship = `results.${target.id}`
                }else{
                    if( picked.metadata.resultCategories ){
                        relationship = `results.0`
                    }
                }
                if( relationship ){
                    console.log(`additng ${p.plainId} at ${relationship}`)
                    await picked.addRelationship(p, relationship)
                }
            }
            console.log(`cant add ${p.id} - no suitable result section`)
        }
    }
    
    let thisType = primitive.type
    if( isMulti ){
        const types = primitive.map((d)=>d.type).filter((v,i,a)=>a.indexOf(v)===i)
        commonMultiType = types.length === 1 ? types[0] : undefined
        thisType = commonMultiType
    }

    let resultIds = metadata?.sidebar?.addToItems ?? PrimitiveConfig.sidebar[thisType]?.addToItems
    if(resultIds){
        showAddToResult = resultIds.length > 1 ? "item" : MainStore().category( resultIds[0] )?.title
    }else{
        resultIds = [primitive.referenceId]
        if( isMulti ){
            showAddToResult = metadata?.sidebar?.addToResult ?? PrimitiveConfig.sidebar[commonMultiType]?.addToResult ?? false 
            resultIds = primitive.map((d)=>d.referenceId).filter((v,i,a)=>a.indexOf(v)===i)
        }
    }
    let showButtons = !isMulti || (isMulti && commonMultiType)
    let showUnlinkFromScope = false 
    console.log('here!!', resultIds)

    if( props.scope ){
        showUnlinkFromScope = true
        const list = isMulti ? primitive : [primitive]
        for( const p of list){
            console.log(`check`, props.scope, p, p.origin?.id === props.scope.id, !p.parentPaths( props.scope ))
            if( p.origin?.id === props.scope.id || !p.parentPaths( props.scope )){
                showUnlinkFromScope = false
            }
        }
    }
    let unlinkText = showUnlinkFromScope ? `${props.scope.metadata?.title} #${props.scope.plainId}` || props.scope.plainId : undefined

    const unlinkFromScope = async ()=>{
        const paths = primitive.parentPaths( props.scope ).filter((d)=>d !== 'origin')
        for(const path of paths){
            await props.scope.removeRelationship( primitive, path)
        }
        setShowUnlinkPrompt(false)
    }

    const nestedCount = props.allowRemoveChildren ? [primitive].flat().map(d=>d.primitives.allIds.length)?.reduce((a,c)=>a+c,0) : undefined
    let summaryList = (primitive.type === "view" && !infoPane) ? primitive.primitives.origin.allSegment.map(d=>d.primitives.allSummary).flat() : undefined

    let infoPaneContent 
    if( infoPane ){
        let segmentOriginId = primitive.id
        let allSegments = primitive.primitives.allSegment
        if( primitive.type === "query"){
            if( primitive.metadata.type === "aggregator"){
                const parentForScope = primitive.findParentPrimitives({type: "working"})[0]
                if( parentForScope ){
                    //list = parentForScope.itemsForProcessingWithParams({descend: true, ...primitive.referenceParameters})
                    allSegments = parentForScope.primitives.allSegment
                    segmentOriginId = parentForScope.id
                }
            }
        }
        let segment = allSegments.find(d=>d.doesImport( segmentOriginId, infoPane.filters))
        if( segment ){
            summaryList = segment.primitives.origin.allSummary 
            console.log(`FOUND SEGEMNT `, segment.plainId, segment.itemsForProcessing.length)
        }
        let segmentCategory = primitive.metadata?.resultCategories?.find(d=>MainStore().category(d.resultCategoryId)?.primitiveType === "segment")?.resultCategoryId 

        const items = segment ? segment.itemsForProcessing : primitive.itemsForProcessingWithFilter(infoPane.filters)
        const categories = items.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d) === i)
        if( categories.length === 1){
            console.log(`Single category of items selected ${categories[0]}`)
            const candidates = MainStore().categories().filter(d=>d.primitiveType === 'segment' && d.holds?.includes(categories[0]))
            if( candidates.length > 0){
                if( candidates.length > 1){
                    console.log(`Found ${candidates.length} candidate segments for items, picking first = ${candidates[0].id}`)
                }
                segmentCategory = candidates[0].id
            }
        }
        console.log(` Will created as ${segmentCategory}`)

        const addSegment = async ()=>{
            const newPrim = await MainStore().createPrimitive({
                title: "New Segment",
                type: "segment",
                categoryId: segmentCategory ?? 36,
                parent: primitive,
                referenceParameters:{
                    "target": "items",
                    "importConfig": [{filters: infoPane.filters,id: primitive.id}]
                }
            })
            console.log(newPrim)
            if( newPrim ){
                await newPrim.addRelationship(primitive, "imports")
            }
            return newPrim
        }
        
        const categoryType = items.map(d=>d.metadata).filter((d,i,a)=>d&& a.findIndex(d2=>d2.id==d.id) ===i)
        const nestedActions = categoryType.map(d=>d.actions?.filter(d=>d.collectionAction || d.showInCollection)).flat() ?? []
        const callbackProcessor = ()=>{}

        infoPaneContent = <div className='p-4 space-y-2'>
            <p className='text-lg'>{items.length} items</p>
            {segment && <>
                    {primitive.metadata?.actions && <div className='w-full flex'>
                        <PrimitiveCard.CardMenu primitive={segment} 
                            custom={nestedActions.map(d=>{
                                return {
                                    ...d,
                                    action: async ()=>await MainStore().doPrimitiveAction( primitive, "auto_cascade", {cascade_key: d.key, ids: items?.map(d=>d.id)})
                                }
                            })} 
                        className='ml-auto m-2'/>
                    </div>}
                    <PrimitiveCard primitive={segment} showDetails="panel" panelOpen={true} showLink={true} major={true} showEdit={true} editing={true} className='mb-6'/>
                </> 
            }
            {nestedActions.length > 0&& <PrimitiveCard.CardMenu 
                            icon={<PlayIcon className="w-4 h-4 m-[0.45rem]"/>} 
                            custom={nestedActions.map(d=>{
                                const doAction = async (options)=>{
                                    await MainStore().doPrimitiveAction( 
                                        d.collectionAction ? items[0] : primitive, 
                                        d.collectionAction ? d.key : "auto_cascade", 
                                        {cascade_key: d.collectionAction ?  undefined : d.key, ids: items?.map(d=>d.id), ...options},
                                        callbackProcessor
                                        )
                                }
                                return {
                                    ...d,
                                    action: async ()=>{
                                        if( d.actionFields){
                                            setManualInputPrompt({
                                                primitive: primitive,
                                                fields: d.actionFields,
                                                confirm: async (inputs)=>await doAction( inputs )
                                            })
                                        }else{
                                            await doAction()
                                        }

                                    }
                                }
                            })} 
                            size={10}
                        />

            }
            {summaryList?.length > 0 && 
                <Panel title="Summaries" collapsable={true} open={true} major>
                    <CardGrid   
                        list={summaryList} 
                        className='p-2'
                        columnConfig={{"sm":1}}
                        cardProps={{
                            showDetails:"panel",
                            compact: true,
                            border:false,
                            showExpand: false,
                            titleAtBase: true, 
                            showMenu: true,
                            variant: true
                        }}
                    />
                </Panel>
            }
            {!segment && <button
                type="button"
                className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                onClick={addSegment}
                >
                Create as segment
            </button>}
            {!segment && <button
                type="button"
                className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                onClick={async ()=>{
                    setShowLink({
                        root: primitive.task,
                        exclude: [primitive],
                        resultCategoryId: primitive.referenceId,
                        callback: async (d)=>{
                            const newSegment = await addSegment()
                            await d.addRelationship( newSegment, "imports" )
                        }
                    })
                }}
                >
                    Create as segment and add to a different View
                </button>}
            {!segment && <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 "
                    onClick={()=>MainStore().promptDelete({
                        prompt: `Remove ${items.length} items from this segment?`,
                        handleDelete: async ()=>{
                            for(const d of items){
                                await MainStore().removePrimitive( d )
                            }
                        }
                    })}
                >
                    Delete items
            </button>}
            {segment && <button
                type="button"
                className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                onClick={async ()=>{
                    setShowLink({
                        root: primitive.task,
                        exclude: [primitive],
                        resultCategoryId: primitive.referenceId,
                        callback: (d)=>{
                            d.addRelationship( segment, "imports" )
                        }
                    })
                }}
                >
                    Add segment to a different View
                </button>}
        </div>
    }

    return (
        <>
    {manualInputPrompt && <InputPopup key='input' cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
    {!infoPane && showLink && <PrimitivePicker target={isMulti ? primitive : [primitive]} root={isMulti ? primitive[0].task : primitive.task} path='results' callback={linkTo} setOpen={setShowLink} referenceId={resultIds} />}
    {infoPane && showLink && <PrimitivePicker setOpen={setShowLink} {...showLink} />}
    {showUnlinkPrompt && <ConfirmationPopup title="Confirm unlink" message={showUnlinkPrompt} confirmColor='indigo' confirmText='Unlink' confirm={unlinkFromScope} cancel={()=>setShowUnlinkPrompt(false)}/>}
    {showDeletePrompt && <ConfirmationPopup title="Confirm deletion" message={showDeletePrompt.prompt} confirm={handleDelete} cancel={()=>setShowDeletePrompt(false)}/>}
    <Transition.Root 
            show={props.open}
            appear={true}
            as='aside'
            enter="transition-[min-width,width] ease-in-out duration-[200ms]"
            leave="transition-[min-width,width] ease-in-out duration-[200ms] "
            enterFrom="min-w-0 w-0"
            enterTo="min-w-[24rem] sm:min-w-[28rem] w-[24rem] sm:w-[28rem] 5xl:min-w-[48rem] 5xl:w-[48rem]"
            leaveFrom="min-w-[24rem] sm:min-w-[28rem] w-[24rem] sm:w-[28rem] 5xl:min-w-[48rem] 5xl:w-[48rem]"
            leaveTo="min-w-0 w-0"
//            className={`${props.overlay ? "absolute right-0 z-50 h-screen": ""} overflow-y-auto border-l border-gray-200 bg-white max-h-screen shadow-2xl`}>
            className={`absolute right-0 z-50 h-screen overflow-y-auto border-l border-gray-200 bg-white max-h-screen shadow-2xl 4xl:relative 4xl:shadow-none `}>
        <div className='min-w-max'>
        <div className='max-w-[24rem] sm:max-w-[28rem] 5xl:min-w-[48rem]'>
            <div className="border-b-gray-100 px-4 py-4 shadow-md  sticky z-50 top-0 bg-white">
                <div className="flex items-start justify-between space-x-3">
                    {metadata && <div className='flex place-items-center'>
                        <HeroIcon icon={metadata.icon} className='w-20 h-20'/>
                        <div className='ml-2'>
                            <p className="text-sm font-medium text-gray-900 ">{metadata.title}</p>
                            <p className="text-xs text-gray-500">{metadata.description}</p>
                        </div>
                    </div>}
                    <div className="flex h-7 items-center">
                        <button
                            type="button"
                            className="text-gray-400 hover:text-gray-500"
                            onClick={() => props.setOpen(false)}
                        >
                            <span className="sr-only">Close panel</span>
                            <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>
            {infoPane && infoPaneContent}
            {!infoPane && isMulti && !commonMultiType && <div className="pb-2 pl-4 pr-4 pt-4">Cant inspect selection</div> }            
            {!infoPane && isMulti && commonMultiType && <div className="pb-2 pl-4 pr-4 pt-4">{primitive.length} items selected</div> }
            {!infoPane && !isMulti && (primitive.referenceParameters?.hasImg || primitive.metadata?.actions) && <div className='w-full flex'>
                {primitive.referenceParameters?.hasImg  &&  <VFImage className="w-8 h-8 mx-2 object-contain my-auto" src={`/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`} />}
                {primitive.metadata?.actions && <PrimitiveCard.CardMenu primitive={primitive} className='ml-auto m-2'/> }            
            </div>}
            {!infoPane && !isMulti && primitive.type === "query" && <div className="pb-2 pl-4 pr-4 pt-4">
                <QueryCard primitive={primitive} showDetails={true}/>
            </div>}
            {!infoPane && !isMulti && primitive.type === "summary" && <div className="pb-2 pl-4 pr-4 pt-4">
                <SummaryCard primitive={primitive} showDetails={true}/>
            </div>}
            {!infoPane && !isMulti && primitive.type !== "summary" && primitive.type !== "query" && <div className="pb-2 pl-4 pr-4 pt-4">
                <PrimitiveCard primitive={primitive} showQuote editState={primitive.type==="hypothesis"} showDetails="panel" panelOpen={true} showLink={true} major={true} showEdit={true} editing={true} className='mb-6'/>
                {primitive.type === "result" && !fulltext && primitive.referenceParameters?.url && <Panel.MenuButton title='View text' onClick={async ()=>setFullText((await primitive.getDocumentAsText())?.split(" ").slice(0,5000).join(" "))}/>}
                {primitive.type === "result" && fulltext && <div className='p-3 border rounded-md text-sm'>{fulltext}</div>}
                {primitive.type === "evidence" && (primitive.parentPrimitives.filter((d)=>d.type === 'hypothesis').length > 0) && 
                    <Panel title="Significance" collapsable={true} open={true} major>
                        <PrimitiveCard.EvidenceHypothesisRelationship primitive={primitive} title={false} />
                    </Panel>
                }
                {summaryList?.length > 0 && 
                    <Panel title="Summaries" collapsable={true} open={true} major>
                        <CardGrid   
                            list={summaryList} 
                            className='p-2'
                            columnConfig={{"sm":1}}
                            cardProps={{
                                showDetails:"panel",
                                compact: true,
                                border:false,
                                showExpand: false,
                                titleAtBase: true, 
                                showMenu: true,
                                variant: true
                            }}
                        />
                    </Panel>
                }
                {Object.keys(primitive.primitives || {}).includes("imports") &&
                    <Panel title="Input segments" collapsable={true} open={false} major>
                        <PrimitiveCard.ImportList primitive={primitive}/>
                    </Panel>
                }
                {primitive.primitives.allUniqueEvidence.length > 0 && 
                    <Panel title="Evidence" collapsable={true} open={true} major>
                        <PrimitiveCard.EvidenceList primitive={primitive} hideTitle relationshipMode="none"/>
                    </Panel>
                }

                {(metadata?.sidebar?.showRefs || PrimitiveConfig.sidebar[primitive.type]?.showRefs) && (primitive.primitives.ref?.allIds.length + primitive.primitives.link?.allIds.length)> 0 && 
                    <Panel title="References" collapsable={true} open={true} major>
                        <CardGrid   
                            list={MainStore().uniquePrimitives( [...primitive.primitives.ref.allItems, ...primitive.primitives.link.allItems])} 
                            className='p-2'
                            columnConfig={{"sm":1}}
                            cardProps={{
                                showDetails:"panel",
                                compact: true,
                                border:false,
                                showExpand: false,
                                titleAtBase: true, 
                                showMenu: true
                            }}
                        />
                    </Panel>
                }
                {primitive.primitives.results?.[0].allIds.length > 0 && 
                    <Panel title={primitive.metadata?.resultCategories?.find(d=>d.id === 0)?.title ?? "Items"} collapsable={true} open={true} major>
                        <CardGrid   
                            list={primitive.primitives.results[0].allItems} 
                            className='p-2'
                            columnConfig={{"sm":1}}
                            cardProps={{
                                showDetails:"panel",
                                compact: true,
                                border:false,
                                showExpand: false,
                                titleAtBase: true, 
                                showMenu: true
                            }}
                        />
                    </Panel>
                }
                {primitive.parentPrimitiveRelationships["link"] && showSource &&
                    <div className='mt-6 mb-3 border-t'>
                        <h3 className="mb-2 text-md text-gray-400 pt-2">Linked to</h3>
                        <PrimitiveCard primitive={primitive.parentPrimitiveRelationships["link"][0]} showState={true} showLink={true} showDetails="panel"/>
                    </div>
                }
                {origin && showSource &&
                    <div className='mt-6 mb-3 border-t'>
                        <h3 className="mb-2 text-md text-gray-400 pt-2">Source</h3>
                        <PrimitiveCard primitive={origin.type === "search" ? origin.origin : origin} showState={true} showLink={true} showDetails="panel"/>
                    </div>
                }
                {task && <div className='mt-6 mb-3 border-t'>
                    <h3 className="mb-2 text-md text-gray-400  pt-2">Related {task.type}</h3>
                    <PrimitiveCard primitive={task}  showState={true} showDetails="panel" showUsers="panel" showLink={true}/>
                </div>}
            </div>}
            {!infoPane && showButtons && <div className="flex-shrink-0 justify-between space-y-2 p-4 mt-1">
                {showUnlinkFromScope && <button
                    type="button"
                    className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={()=>setShowUnlinkPrompt(`Unlink from ${unlinkText}?`)}
                >
                    Unlink from {unlinkText}
                </button>}
                { showAddToResult && <button
                    type="button"
                    className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={()=>setShowLink(true)}
                >
                    Link {isMulti ? `${primitive.length} items ` : ""}to another {typeof(showAddToResult) === "string" ? showAddToResult : "result"}
                </button>}
                {props.unlink && <button
                    type="button"
                    className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={()=>{props.unlink(primitive);props.setOpen(false)}}
                >
                    Remove from {props.unlinkText ? props.unlinkText : 'item'}
                </button>}
                    {primitive.type === "segment" && <button
                        type="button"
                        className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        onClick={async ()=>{
                            await MainStore().createPrimitive({
                                title: "New Segment",
                                type: "segment",
                                categoryId: primitive.referenceId,
                                parent: primitive
                            })
                        }}
                    >
                        Create sub segment
                </button>}
                {nestedCount > 0 && props.allowRemoveChildren && <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 "
                    onClick={()=>promptDelete(true)}
                >
                    {(isMulti ? `Delete ${primitive.length} items` : 'Delete this') + ` and ${nestedCount} nested items`}
                </button>}
                <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 "
                    onClick={()=>promptDelete()}
                >
                    {isMulti ? `Delete ${primitive.length} items` : 'Delete'}
                </button>
            </div>}
    </div>
    </div>
    </Transition.Root>
        </>
    )
}
