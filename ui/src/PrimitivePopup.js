import { motion, AnimatePresence } from "framer-motion"
import { Dialog, Transition } from '@headlessui/react'
import {Fragment, useEffect, useRef} from 'react';
import { Tab } from '@headlessui/react'
import { PrimitiveCard } from './PrimitiveCard'
import { useMeasure } from "./MeasureHook";
import {
  XMarkIcon
} from '@heroicons/react/20/solid'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}


export function PrimitivePopup({contextOf, selected, setSelected, ...props}){
    let id = selected?.plainId
    if(  selected && selected.primitive ){
        id = selected.plainId 
       selected = selected.primitive
    }


    const keyHandler = (e)=>{
        console.log(e.key)
      if( e.key === "Escape"){
        console.log('escpe here')
        setSelected(null)
      }
    }
    if( !selected ){ return <></>}

    return (
    <Transition.Root show={selected !== undefined} as={Fragment}  appear>
      <Dialog as="div" className="relative z-50" onClose={()=>setSelected(null)} >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-25 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-50 overflow-y-auto sm:py-24 ">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel 
                className='flex z-30 w-max max-w-[100vw] top-0 mx-auto '
                >
                    <div className='p-4 bg-white rounded-2xl shadow-xl w-full' >
                        <button className="flex ml-auto text-gray-400 hover:text-gray-500" onClick={() => setSelected(null)} ><XMarkIcon className="h-6 w-6" aria-hidden="true" /></button>
                            <motion.div 
                                layoutId={id} 
                                transition ={{duration: 0.3} }
                                className='bg-white'
                                >
                                <PrimitiveCard.Banner primitive={selected} small={true} showLink={true}/>
                                <PrimitiveCard primitive={selected} disableHover={true} showEdit={true} hideTitle={true}/>
                            </motion.div>
                            <Tab.Group
                                defaultIndex={props.editing ? 1 : 0}
                                >
                                <Tab.List className="-mb-px flex space-x-8 border-b border-gray-200" aria-label="Tabs">
                                <Tab as={Fragment}>
                                    {({ selected }) => ( 
                                    <button
                                    className={classNames(
                                    selected
                                    ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                                    'w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm ring-offset-0 focus:outline-none focus:ring-2 mt-0.5')}
                                    aria-current={selected ? 'page' : undefined}
                                    >
                                    Evidence
                                    </button>)}
                                    </Tab>
                                <Tab as={Fragment}>
                                    {({ selected }) => ( 
                                    <button
                                    className={classNames(
                                    selected
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                                    'w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm ring-offset-0 focus:outline-none focus:ring-2 mt-0.5'
                                    )}
                                    aria-current={selected ? 'page' : undefined}
                                    >
                                    Details
                                    </button>)}
                                    </Tab>
                                </Tab.List>
                                <Tab.Panels>
                                    <Tab.Panel>
                                        <PrimitiveCard.EvidenceList relationshipTo={contextOf} relationshipMode="presence" primitive={selected} hideTitle={true} className='w-full max-w-[80vw] lg:max-w-[70vw] max-h-[40vh] h-[40vh]' frameClassName='sm:columns-2 md:columns-3 xl:columns-4'/>
                                    </Tab.Panel>
                                    <Tab.Panel>
                                        <PrimitiveCard.Details primitive={selected} hideTitle={true} editing={props.editing} className='w-full max-w-full md:w-[48rem]' />
                                    </Tab.Panel>
                                </Tab.Panels>
                            </Tab.Group>
                    <div className="flex flex-shrink-0 justify-end pt-4 mt-1">
                        <button
                            type="button"
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            onClick={() => setSelected(null)}
                        >
                            Close
                        </button>
                        </div>
                    </div>
                </Dialog.Panel>
            </Transition.Child>
            </div>
        </Dialog>
    </Transition.Root>
    )
}