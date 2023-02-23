import { motion, AnimatePresence } from "framer-motion"
import {Fragment} from 'react';
import { Tab } from '@headlessui/react'
import { PrimitiveCard } from './PrimitiveCard'
import {
  XMarkIcon
} from '@heroicons/react/20/solid'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}


export function PrimitivePopup({contextOf, selected, setSelected, ...props}){
  const Overlay = ({ isSelected }) => {
      
      return (<motion.div
        initial={{opacity: 0}}
        animate={{ opacity: 1}}
        exit={{opacity: 0}}
        onClick={()=>setSelected(null)}
        className="overlay h-screen w-full absolute left-0 top-0 backdrop-blur-sm bg-gray-500/30  z-20"
      >
      </motion.div>)
  };
  if( !selected ){return <></>}
    let id = selected.id
    if( selected.primitive ){
        id = selected.id 
        console.log(`was ${id}`, selected)
       selected = selected.primitive
    }
    return (
        <AnimatePresence>
            {selected && 
            <>
        <Overlay key='overlay' isSelected={selected}/>
        <motion.div 
            key='frame' 
            layoutId={id} 
            className='grid place-items-center absolute z-30 w-[100vw] h-[100vh] top-0 left-0 sm:w-[90vw] sm:h-[90vh] sm:top-[5vh] sm:left-[5vw]  md:w-[80vw] md:h-[80vh] md:top-[10vh] md:left-[10vw] lg:w-[70vw] lg:h-[70vh] lg:top-[15vh] lg:left-[15vw]'
            >
                    <div className='p-4 bg-white rounded-2xl shadow-xl w-full '>
                        <button className="flex ml-auto text-gray-400 hover:text-gray-500" onClick={() => setSelected(null)} ><XMarkIcon className="h-6 w-6" aria-hidden="true" /></button>
                            <PrimitiveCard.Banner primitive={selected} small={true}/>
                            <PrimitiveCard primitive={selected} disableHover={true} showLink={true} showId={false}/>
                            <Tab.Group>
                                <Tab.List className="-mb-px flex space-x-8 border-b border-gray-200" aria-label="Tabs">
                                <Tab as={Fragment}>
                                    {({ selected }) => ( 
                                    <button
                                    className={classNames(
                                    selected
                                    ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                                    'w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm ring-offset-0 focus:outline-none focus:ring-2')}
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
                                    'w-1/4 py-4 px-1 text-center border-b-2 font-medium text-sm ring-offset-0 focus:outline-none focus:ring-2'
                                    )}
                                    aria-current={selected ? 'page' : undefined}
                                    >
                                    Details
                                    </button>)}
                                    </Tab>
                                </Tab.List>
                                <Tab.Panels>
                                    <Tab.Panel>
                                        <PrimitiveCard.EvidenceList relationshipTo={contextOf} relationshipMode="presence" primitive={selected} hideTitle={true} className='max-h-[40vh] h-[40vh]' frameClassName='sm:columns-2 md:columns-3 xl:columns-4'/>
                                    </Tab.Panel>
                                    <Tab.Panel>
                                        <PrimitiveCard.Details primitive={selected} hideTitle={true} />
                                    </Tab.Panel>
                                </Tab.Panels>
                            </Tab.Group>
                    <div className="flex flex-shrink-0 justify-end pt-4 border-t border-gray-200 mt-1">
                        <button
                            type="button"
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            onClick={() => setSelected(null)}
                        >
                            Close
                        </button>
                        </div>
                    </div>
        </motion.div>
        </>}
        </AnimatePresence>
    )
}