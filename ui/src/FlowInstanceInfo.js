import { Bars3Icon } from "@heroicons/react/20/solid";
import { HeroIcon } from "./HeroIcon";
import { PrimitiveCard } from "./PrimitiveCard";
import { classNames } from "./SharedTransforms";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import UIHelper from "./UIHelper";
import MainStore from "./MainStore";
import FeedList from "./@components/Feed";

export function FlowInstanceInfo({primitive, inputPrimitive, steps,...props}){
    const [expand, setExpand] = useState(false)
    const [showFeed, setShowFeed] = useState(true)

    const bg = props.bg ?? "bg-white"
    const ring = bg.replace("bg-", "ring-")
    const activeList = []
    const padding = props.padding ?? "p-4"

    const flowOutputPins = primitive?.origin?.outputPins ?? []
    const outputPins = Object.keys(primitive?.primitives.outputs ?? {})
    const outputs = outputPins.reduce((a,c)=>{
        const [pinSource, pinInput] = c.split("_")
        a[c] = {
            id: c,
            name: flowOutputPins[pinInput].name ?? pinInput,
            items: primitive.primitives.outputs[c].allUniqueItems
        }
        return a}, {})
    
    const [selectedOutputPin, setSelectedOutputPin] = useState(outputPins[0])

    console.log(outputs)
    if( !primitive || !inputPrimitive || !steps){
        return <></>
    }
    let runningProgress = []

    const stepsToProcess = steps.map(step=>{
        let status = "Pending"
        let iconBackground = 'bg-gray-300'
        let icon = <HeroIcon icon='FAHand' className='text-white w-4 h-4'/>
        let progress
        let message
        const stepForInstance = primitive?.primitives.origin.allItems.find(d=>d.configParent?.id === step.id)
        if(stepForInstance && stepForInstance?.processing?.flow?.flowStarted === primitive?.processing?.flowStarted){
            message = stepForInstance?.processing?.query?.message
            if( stepForInstance?.processing?.flow?.status === "complete" ){
                status = "Done"
                icon = <HeroIcon icon='FACheck' className='text-white w-4 h-4'/>
                iconBackground = 'bg-green-500'
            }else if( stepForInstance?.processing?.flow?.status === "running" ){
                status = "Running"
                activeList.push( step.title)
                icon = <HeroIcon icon='FASpinner' className='text-ccgreen-600 w-4 h-4 animate-spin'/>
                iconBackground = 'bg-white'
                progress = stepForInstance.processing.query?.progress?.message
            }
        }
        return {
            status, iconBackground, icon, progress, message, title: step.title, primitive: stepForInstance
        }
    })
    console.log(stepsToProcess)
    

    return (<>
        <div className={`${bg} ${padding}`}>
            <span>Flow instance for {inputPrimitive.title}</span>
            <PrimitiveCard.Title primitive={inputPrimitive} compact={true}/>
            <PrimitiveCard.Title primitive={primitive} compact={true}/>
        </div>
        <div className={`${bg} ${padding} w-full ${props.hideProgressAt ? `hidden @4xl:flex flex-col` : ""}`}>
            <div className={`justify-between w-full relative h-min flex ${bg} `}>
                <span aria-hidden="true" className={`absolute top-[50%] w-full h-0.5 bg-gray-200 z-0`} />
                {stepsToProcess.map(step=>{
                    return (
                        <span
                            className={classNames(
                            step.iconBackground,
                            'flex size-6 items-center justify-center rounded-full ring-8 z-10',
                            ring
                            )}
                        >
                            {step.icon}
                        </span>
                    )
                })}
            </div>
            <div className={`${bg} mt-3 text-xs text-gray-600`}>
                {(()=>{
                    let runningInfo
                    if( activeList.length === 1){
                        runningInfo = `Running ${activeList}...`
                    }else if(activeList.length === 2){
                        runningInfo = `Running ${activeList.join(", ")}...`
                    }else if(activeList.length > 2){
                        runningInfo = `Running ${activeList.slice(0,2).join(", ")} and ${activeList.length - 2} other(s)...`
                    }
                    return <div>
                            <strong>{runningInfo}</strong>
                            {runningProgress.map(d=><p>{d}</p>)}
                        </div>
                })()}
            </div>
        </div>
        <div className={`${bg} ${padding} text-sm text-gray-600`}>
            <span>
              {activeList.length == 0 ? "Not running" : "Running..."}
            </span>
        </div>
        <div className={`${bg} ${padding}`}>
            <ChevronDownIcon className={`size-5 text-gray-400 hover:text-gray-800 ${expand ? "rotate-180" : ""}`} onClick={()=>setExpand(!expand)}/> 
        </div>
        {expand && <div className={
            classNames(
                `p-6 ${props.hideProgressAt ? `col-span-3 @4xl:col-span-4` : "col-span-4"}`,
                "bg-gray-50 -mt-1 p-6 grid",
                showFeed ? "@4xl:grid-cols-[2fr_3fr_2fr] gap-6": "@4xl:grid-cols-[2fr_3fr] gap-6"
            )}>
            <div className={classNames(
                "flex space-x-2 justify-end",
                showFeed ? "col-span-3" : "col-span-2"
                )}>
                <UIHelper.Button 
                    title="Run"
                    action={()=>{
                        MainStore().doPrimitiveAction( primitive, "run_flow_instance")
                    }}
                />
            </div>
            <div className={`flex flex-col space-y-2 p-2 rounded-lg p-4 ${bg}`}>
                <span className="text-gray-500 font-semibold text-sm">Input item</span>
                <PrimitiveCard.Parameters primitive={inputPrimitive} fullList={true}/>
            </div>
            <div className={`flex flex-col space-y-2 p-2 rounded-lg p-4 ${bg}`}>
                <span className="text-gray-500 font-semibold text-sm">Outputs</span>
                {outputs[selectedOutputPin].items.map(d=><PrimitiveCard primitive={d}/>)}
            </div>
            {showFeed && <div className={`flex flex-col space-y-2 p-4 rounded-lg p-4 ${bg}`}>
                <FeedList items={stepsToProcess.map(d=>({...d, content: d.title, secondary: d.message, onClick:()=>MainStore().sidebarSelect(d.primitive, {forFlow: true})}))}/>
            </div>}
        </div>
        }
    </>)
}
