import { motion, AnimatePresence } from "framer-motion"
import { Dialog, Transition } from '@headlessui/react'
import {Fragment, useEffect, useState} from 'react';
import { Tab } from '@headlessui/react'
import { PrimitiveCard } from './PrimitiveCard'
import ContactCard from "./ContactCard";
import { useMeasure } from "./MeasureHook";
import { HeroIcon, SolidHeroIcon } from './HeroIcon';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon
} from '@heroicons/react/20/solid'
import MainStore from "./MainStore";
import ConfirmationPopup from "./ConfirmationPopup";

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}


export function PrimitivePopup({contextOf, primitive, setPrimitive, ...props}){
  const [showDeletePrompt, setShowDeletePrompt] = useState(false)
  const [activeTab, setActveTab] = useState(props.editing ? 1 : 0)
    let id = primitive?.plainId
    let selectedList
    let selectedIdx
    if(  primitive && primitive.primitive ){
        id = primitive.plainId 
       primitive = primitive.primitive
    }
    if( !primitive ){ return <></>}
    if( primitive.list ){
      selectedList = primitive.list
      selectedIdx = primitive.idx
      primitive = selectedList[ selectedIdx ]
    }

    const results = primitive?.origin?.metadata?.resultCategories
    const summary = results ? results[0].views?.list?.summary : undefined
    const contact = primitive?.referenceParameters?.contact

    const mainstore = MainStore()

    const keyHandler = (e)=>{
        console.log(e.key)
      if( e.key === "Escape"){
        console.log('escpe here')
        setPrimitive(null)
      }
    }
    
    const childrenForDeletion = ()=>{

    }

    const promptDelete = ()=>{
      setShowDeletePrompt( true )
    }

    const handleDelete = ()=>{
      mainstore.removePrimitive( primitive )
      setShowDeletePrompt( null )
      setPrimitive(null)
    }


    const widths = [
      'w-full max-w-[80vw] lg:max-w-[70vw]',
      'w-full max-w-full md:w-[48rem]',
      'w-[110em] h-[62em] overflow-y-hidden',
    ]

    return (
    <>
    {showDeletePrompt && <ConfirmationPopup title="Confirm deletion" confirm={handleDelete} cancel={()=>setShowDeletePrompt(false)}/>}
    <Transition.Root show={primitive !== undefined} as={Fragment}  appear>
      <Dialog as="div" className="relative z-50" onClose={()=>{}/*()=>setPrimitive(null)*/} >
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
                className={`flex z-30  top-0 mx-auto ${widths[activeTab]}`}
                >
                    <div className='p-4 bg-white rounded-2xl shadow-xl w-full' >
                      <div className='flex ml-auto pb-1 w-fit space-x-2'>
                        {selectedList && 
                          <>
                            <button key='prev' disabled={selectedIdx === 0} className="flex ml-auto text-gray-400  hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl disabled:bg-transparent disabled:text-gray-200" onClick={() => setPrimitive({list: selectedList, idx: selectedIdx - 1})} ><ChevronLeftIcon className="h-6 w-6" aria-hidden="true" /></button>
                            <button key='next' disabled={selectedIdx === (selectedList.length  - 1) } className="flex ml-auto text-gray-400  hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-xl disabled:bg-transparent disabled:text-gray-200" onClick={() => setPrimitive({list: selectedList, idx: selectedIdx + 1})} ><ChevronRightIcon className="h-6 w-6" aria-hidden="true" /></button>
                          </>
                        }
                        <button className="flex ml-auto text-gray-400  hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={() => setPrimitive(null)} ><XMarkIcon className="h-6 w-6" aria-hidden="true" /></button>
                      </div>
                            <motion.div 
                                layoutId={id} 
                                transition ={{duration: 0.3} }
                                className='bg-white'
                                >
                                <PrimitiveCard.Banner primitive={primitive} small={true} showLink={true}/>
                                <PrimitiveCard variant={false} primitive={primitive} disableHover={true} showEdit={true} hideTitle={true} hideMenu hideCover/>
                            </motion.div>
                            <Tab.Group
                                onChange={(idx)=>setActveTab(idx)}
                                defaultIndex={activeTab}
                                >
                                {({ selectedIndex }) => {
                                  return ( 
                                  <>
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
                                      <div className={widths[selectedIndex]}>
                                        <Tab.Panel>
                                            <PrimitiveCard.EvidenceList relationshipTo={contextOf} relationshipMode="presence" primitive={primitive} hideTitle={true} className={`${widths[0]}  max-h-[40vh] h-[40vh]`} frameClassName='sm:columns-2 md:columns-3 xl:columns-4'/>
                                        </Tab.Panel>
                                        <Tab.Panel>
                                            {primitive.summary && 
                                              <ul role="list" className={`divide-y divide-gray-200 rounded-md border border my-3 bg-gray-50 rounded-md ${widths[1]}`}>
                                                <p className="p-2 italic text-gray-600 font-light">{primitive.summary}</p>
                                              </ul>
                                            }
                                            <PrimitiveCard.Details primitive={primitive} hideTitle={true} editing={props.editing} className={widths[1]} />
                                        </Tab.Panel>
                                        </div>
                                    </Tab.Panels>
                                  </>)}}
                            </Tab.Group>
                    <div className="flex flex-shrink-0 justify-between space-x-2 pt-4 mt-1">
                      <button
                      type="button"
                      className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:ml-3 sm:w-auto"
                      onClick={promptDelete}
                    >
                      Delete
                    </button>
                        <button
                            type="button"
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            onClick={() => setPrimitive(null)}
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
    </>
    )
}