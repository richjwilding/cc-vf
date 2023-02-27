import { motion, AnimatePresence } from "framer-motion"
import {Fragment} from 'react';
import { Tab } from '@headlessui/react'
import { PrimitiveCard } from './PrimitiveCard'
import {
  XMarkIcon
} from '@heroicons/react/20/solid'
import { RelationshipTable } from "./RelationshipTable";
import React from 'react';
import MainStore from "./MainStore";

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

    const Overlay = ({ isSelected, setSelected }) => {
        return (<motion.div
            initial={{opacity: 0}}
            animate={{ opacity: 1}}
            exit={{opacity: 0}}
            onClick={()=>setSelected(null)}
            className="overlay h-screen w-full absolute left-0 top-0 backdrop-blur-sm bg-gray-500/30  z-20"
        >
        </motion.div>)
    };

export function MetricPopup({contextOf, selected, setSelected, ...props}){
    const [forceUpdate, setForceUpdate] =  React.useState(0)
    if( !selected ){return <></>}
    let id = `m${selected}`

    let metric = contextOf.metrics.find((m)=>m.id === selected)
    if( !metric ){return <></>}
    if( metric.relationships ){
        console.warn("Not implemented")
    }

    let metric_list = [metric.value].flat().map((d)=>d.list || []).flat()
    let included_ids = metric_list.map((d)=>d.id)
    let missing_list = contextOf.primitives.results.allItems.filter((p)=>!included_ids.includes(p.id))
    let category = Object.keys(contextOf.primitives.results)

    if( !category ){return <></>}

    let categoryConfig = contextOf.metadata.resultCategories[category[0]]
    let fields = categoryConfig.views.list[categoryConfig.views.default]

    let relationships =  [
        {
            key: "not_present",
            title: "Negative",
            icon: "HandThumbDownIcon",
            bgColor: 'orange-400',
            textColor: 'white',
            items: missing_list
        },
        {
            key: "present",
            title: "Positive",
            icon: "HandThumbUpIcon",
            bgColor: 'green-100',
            textColor: 'green-800',
            items: metric_list
        },
    ]


    const updateRelationship = (target, set)=>{
        let anchor = contextOf.primitives 
        let path = metric.path
        let targetList = contextOf.primitives.fromPath(path)

        if( ! (targetList instanceof Array) ){
            let k = 'positive' //Object.keys(targetList)[0]
            anchor = targetList[k]
            path = undefined
        }

        const oldRelationship = targetList.includes( target.id )
        if( oldRelationship ){
            anchor.remove( target.id, path ) 
        }else{
            anchor.add( target.id, path ) 
        }
        setForceUpdate(forceUpdate + 1)
    }

    return (
        <AnimatePresence>
            {selected && 
            <>
            <Overlay key='overlay' isSelected={selected} setSelected={setSelected}/>
            <motion.div 
                key='frame' 
                layoutId={id} 
                className='grid place-items-center absolute z-30 w-[100vw] h-[100vh] top-0 left-0 sm:w-[90vw] sm:h-[90vh] sm:top-[5vh] sm:left-[5vw]  md:w-[80vw] md:h-[80vh] md:top-[10vh] md:left-[10vw] lg:w-[70vw] lg:h-[70vh] lg:top-[15vh] lg:left-[15vw]'
                >
                <div className='p-4 bg-white rounded-2xl shadow-xl w-full '>
                    <button className="flex ml-auto text-gray-400 hover:text-gray-500" onClick={() => setSelected(null)} ><XMarkIcon className="h-6 w-6" aria-hidden="true" /></button>
                    <RelationshipTable count={forceUpdate} updateRelationship={updateRelationship} highlight={props.highlight} sortable={true} major={true} title={metric.title} fields={fields} inline={true} relationships={relationships} showCounts={true} maxHeightClass='max-h-[50vh]'/>
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