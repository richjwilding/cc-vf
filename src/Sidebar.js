import { PrimitiveCard } from './PrimitiveCard'
import { Transition } from '@headlessui/react'
import {
  PlusIcon as PlusIconOutline,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { HeroIcon } from './HeroIcon'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Sidebar({primitive, ...props}) {
    if( primitive === undefined ){
        props.setOpen(false)
        return(<></>)
    }
    let metadata = primitive.metadata
    let task = primitive.originTask
    let origin = task && (primitive.originId !== task.id) ? primitive.origin : undefined

    return (
    <Transition.Root show={props.open} 
            as='aside'
            enter="transition-[min-width] ease-in-out duration-200"
            enterFrom="min-w-0"
            enterTo="min-w-[28rem]"
            leave="transition-[min-width] ease-in-out duration-200"
            leaveFrom="min-w-[28rem]"
            leaveTo="min-w-0"
            className="overflow-y-auto border-l border-gray-200 bg-white min-w-[28rem] w-0 max-h-screen">
        <div className='min-w-max'>
        <div className='max-w-md'>
            <div className="border-b-gray-100 px-4 py-4 shadow-md  sticky top-0 bg-white">
                <div className="flex items-start justify-between space-x-3">
                    <div className='flex place-items-center'>
                        <HeroIcon icon={metadata.icon} className='w-20 h-20'/>
                        <div className='ml-2'>
                            <p className="text-sm font-medium text-gray-900 ">{metadata.title}</p>
                            <p className="text-xs text-gray-500">{metadata.description}</p>
                        </div>
                    </div>
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
            <PrimitiveCard primitive={primitive}  showDetails={true} showLink={false} major={true} showRelationships={true} showEdit={true} className='mb-6'/>
            {origin &&
                <div className='mt-4 mb-3'>
                    <h3 className="mb-1 font-medium text-gray-900">Source</h3>
                    <PrimitiveCard primitive={origin} showState={true} showLink={true} showDetails={true}/>
                </div>
            }
            {task && <div className='mt-4 mb-3'>
                <h3 className="mb-2 font-medium text-gray-900">Related {task.type}</h3>
                <PrimitiveCard primitive={task}  showState={true} showDetails={true} showUsers={true} showLink={true}/>
            </div>}
        </div>
    </div>
    </div>
    </Transition.Root>
    )
}
