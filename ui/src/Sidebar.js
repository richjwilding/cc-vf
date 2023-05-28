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

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Sidebar({primitive, ...props}) {
    const [showDeletePrompt, setShowDeletePrompt] = useState(false)
    if( primitive === undefined ){
        return(<></>)
    }
    let metadata = primitive.metadata
    let task = primitive.originTask
    let origin = task && (primitive.originId !== task.id) ? primitive.origin : undefined


    const promptDelete = ()=>{
      setShowDeletePrompt( `Are you sure you want to remove ${primitive.displayType} #${primitive.plainId}` )
     // setPrimitive(null)
    }

    const handleDelete = ()=>{
      MainStore().removePrimitive( primitive )
      setShowDeletePrompt( null )
      props.setOpen(false)
    }

    return (
        <>
    {showDeletePrompt && <ConfirmationPopup title="Confirm deletion" message={showDeletePrompt} confirm={handleDelete} cancel={()=>setShowDeletePrompt(false)}/>}
    <Transition.Root 
            show={props.open}
            appear={true}
            as='aside'
            enter="transition-[min-width,width] ease-in-out duration-[200ms]"
            leave="transition-[min-width,width] ease-in-out duration-[200ms] "
            enterFrom="min-w-0 w-0"
            enterTo="min-w-[24rem] sm:min-w-[28rem] w-[24rem] sm:w-[28rem]"
            leaveFrom="min-w-[24rem] sm:min-w-[28rem] w-[24rem] sm:w-[28rem]"
            leaveTo="min-w-0 w-0"
            className={`${props.overlay ? "absolute right-0 z-50 h-screen": ""} overflow-y-auto border-l border-gray-200 bg-white max-h-screen`}>
        <div className='min-w-max'>
        <div className='max-w-[24rem] sm:max-w-[28rem]'>
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
        <div className="pb-2 pl-4 pr-4 pt-4">
            <PrimitiveCard primitive={primitive}  showDetails={true} showLink={false} major={true} showEdit={true} className='mb-6'/>
            {primitive.type === "evidence" && <Panel title="Significance" collapsable={true} open={true} major>
                <PrimitiveCard.EvidenceHypothesisRelationship primitive={primitive} title={false} />
            </Panel>}
            {origin &&
                <div className='mt-6 mb-3'>
                    <h3 className="mb-2 text-md text-gray-400 pt-2">Source</h3>
                    <PrimitiveCard primitive={origin} showState={true} showLink={true} showDetails="panel"/>
                </div>
            }
            {task && <div className='mt-6 mb-3'>
                <h3 className="mb-2 text-md text-gray-400  pt-2">Related {task.type}</h3>
                <PrimitiveCard primitive={task}  showState={true} showDetails="panel" showUsers="panel" showLink={true}/>
            </div>}
        </div>
        <div className="flex-shrink-0 justify-between space-y-2 p-4 mt-1">
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
                Delete
            </button>
        </div>

    </div>
    </div>
    </Transition.Root>
        </>
    )
}
