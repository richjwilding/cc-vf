import { PrimitiveCard } from './PrimitiveCard'
import { Transition } from '@headlessui/react'
import { useState } from 'react'
import {
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

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Sidebar({primitive, ...props}) {
    const [showDeletePrompt, setShowDeletePrompt] = useState(false)
    const [showUnlinkPrompt, setShowUnlinkPrompt] = useState(false)
    const [showLink, setShowLink] = useState(false)

    let isMulti = false
    let commonMultiType 
    if( primitive === undefined ){
        return(<></>)
    }
    
    if( Array.isArray(primitive) ){
        if(primitive.length === 1){
            primitive = primitive[0]
        }else{
            primitive = primitive.map((d)=> d instanceof Object ? d : MainStore().primitive(d)).filter((d)=>d)
            isMulti = true
        }
    }
    if( !(primitive instanceof Object) ){
        primitive = MainStore().primitive(primitive)
    }
    if( primitive === undefined ){
        return(<></>)
    }
    let metadata = primitive.metadata
    let task = primitive.originTask
    let origin = task && (primitive.originId !== task.id) ? primitive.origin : undefined
    let showSource = metadata?.sidebar?.showSource ?? PrimitiveConfig.sidebar[primitive.type]?.source ?? true
    let showAddToResult = metadata?.sidebar?.addToResult ?? PrimitiveConfig.sidebar[primitive.type]?.addToResult ?? false



    const promptDelete = ()=>{
        if( isMulti ){
            setShowDeletePrompt( `Are you sure you want to remove ${primitive.length} items` )
        }else{

            setShowDeletePrompt( `Are you sure you want to remove ${primitive.displayType} #${primitive.plainId}` )
        }
     // setPrimitive(null)
    }

    const handleDelete = async ()=>{
        if( isMulti ){
            for( const p of primitive ){
                await MainStore().removePrimitive( p )
            }
        }else{
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

    return (
        <>
    {showLink && <PrimitivePicker target={isMulti ? primitive : [primitive]} root={isMulti ? primitive[0].task : primitive.task} path='results' callback={linkTo} setOpen={setShowLink} referenceId={resultIds} />}
    {showUnlinkPrompt && <ConfirmationPopup title="Confirm unlink" message={showUnlinkPrompt} confirmColor='indigo' confirmText='Unlink' confirm={unlinkFromScope} cancel={()=>setShowUnlinkPrompt(false)}/>}
    {showDeletePrompt && <ConfirmationPopup title="Confirm deletion" message={showDeletePrompt} confirm={handleDelete} cancel={()=>setShowDeletePrompt(false)}/>}
    <Transition.Root 
            show={props.open}
            appear={true}
            as='aside'
            enter="transition-[min-width,width] ease-in-out duration-[200ms]"
            leave="transition-[min-width,width] ease-in-out duration-[200ms] "
            enterFrom="min-w-0 w-0"
            enterTo="min-w-[24rem] sm:min-w-[28rem] w-[24rem] sm:w-[28rem] 5xl:min-w-[36rem] 5xl:w-[36rem]"
            leaveFrom="min-w-[24rem] sm:min-w-[28rem] w-[24rem] sm:w-[28rem] 5xl:min-w-[36rem] 5xl:w-[36rem]"
            leaveTo="min-w-0 w-0"
//            className={`${props.overlay ? "absolute right-0 z-50 h-screen": ""} overflow-y-auto border-l border-gray-200 bg-white max-h-screen shadow-2xl`}>
            className={`absolute right-0 z-50 h-screen overflow-y-auto border-l border-gray-200 bg-white max-h-screen shadow-2xl 4xl:relative 4xl:shadow-none `}>
        <div className='min-w-max'>
        <div className='max-w-[24rem] sm:max-w-[28rem] 5xl:min-w-[36rem]'>
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
            {isMulti && !commonMultiType && <div className="pb-2 pl-4 pr-4 pt-4">Cant inspect selection</div> }            
            {isMulti && commonMultiType && <div className="pb-2 pl-4 pr-4 pt-4">{primitive.length} items selected</div> }
            {!isMulti && (primitive.referenceParameters?.hasImg || primitive.metadata?.actions) && <div className='w-full flex'>
                {primitive.referenceParameters?.hasImg  &&  <VFImage className="w-8 h-8 mx-2 object-contain my-auto" src={`/api/image/${primitive.id}`} />}
                {primitive.metadata?.actions && <PrimitiveCard.CardMenu primitive={primitive} className='ml-auto m-2'/> }            
            </div>}
            {!isMulti && <div className="pb-2 pl-4 pr-4 pt-4">
                <PrimitiveCard primitive={primitive} showQuote showDetails="panel" panelOpen={true} showLink={true} major={true} showEdit={true} editing={true} className='mb-6'/>
                {primitive.type === "result" && primitive.referenceParameters?.url && <Panel.MenuButton title='View text' onClick={async ()=>alert(await primitive.getDocumentAsText())}/>}
                {primitive.type === "evidence" && (primitive.parentPrimitives.filter((d)=>d.type === 'hypothesis').length > 0) && 
                    <Panel title="Significance" collapsable={true} open={true} major>
                        <PrimitiveCard.EvidenceHypothesisRelationship primitive={primitive} title={false} />
                    </Panel>
                }
                {primitive.primitives.allUniqueEvidence.length > 0 && 
                    <Panel title="Evidence" collapsable={true} open={true} major>
                        <PrimitiveCard.EvidenceList primitive={primitive} hideTitle relationshipMode="none"/>
                    </Panel>
                }
                {origin && showSource &&
                    <div className='mt-6 mb-3 border-t'>
                        <h3 className="mb-2 text-md text-gray-400 pt-2">Source</h3>
                        <PrimitiveCard primitive={origin} showState={true} showLink={true} showDetails="panel"/>
                    </div>
                }
                {task && <div className='mt-6 mb-3 border-t'>
                    <h3 className="mb-2 text-md text-gray-400  pt-2">Related {task.type}</h3>
                    <PrimitiveCard primitive={task}  showState={true} showDetails="panel" showUsers="panel" showLink={true}/>
                </div>}
            </div>}
            {showButtons && <div className="flex-shrink-0 justify-between space-y-2 p-4 mt-1">
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
                <button
                    type="button"
                    className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 "
                    onClick={promptDelete}
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
