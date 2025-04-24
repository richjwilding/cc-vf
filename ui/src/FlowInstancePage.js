import { useReducer, useState } from "react";
import useDataEvent from "./CustomHook";
import MainStore from "./MainStore";
import Panel from "./Panel";
import { PrimitiveCard } from "./PrimitiveCard";
import EditableTextField from "./EditableTextField";
import FeedList from "./@components/Feed";
import { HeroIcon } from "./HeroIcon";
import {DescriptionList, DescriptionTerm, DescriptionDetails} from './@components/description-list'
import { FlowInstanceInfo } from "./FlowInstanceInfo";
import UIHelper from "./UIHelper";
import { FlowInstanceOutput } from "./FlowInstanceOutput";
import clsx from "clsx";
import { VFImage } from "./VFImage";

export default function FlowInstancePage({primitive, ...props}){
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [showOutput, setShowOutput ]= useState(false)

    const targetFlow = primitive.origin

    useDataEvent('relationship_update set_field set_parameter',primitive.id, ()=>{
        console.log("hello")
        forceUpdate()
    })
    const inputSource = targetFlow?.primitives.imports.allUniqueItems[0]    

    let steps = [], flowInstances = []
    targetFlow?.primitives.origin.allUniqueItems.forEach(d=>{
        if(d.type === "flowinstance"){
            flowInstances.push(d)
        }else{
            if( d.type !== "view" && d.type !== "page"){
                steps.push(d)
            }
        }
    })
    
    const stepOrder = targetFlow?.stepOrder ?? []
    steps = steps.sort((a,b)=>{
        if(stepOrder[a.id] === stepOrder[b.id]){
            return (a.title ?? "").localeCompare(b.title ?? "")
        }
        return stepOrder[a.id] - stepOrder[b.id]
    })
    
    if(!targetFlow){
        return <></>
    }

    const inputs = primitive.itemsForProcessing
    const color = targetFlow.workspace?.color || "slate"
    const showImage = targetFlow.referenceParameters?.hasImg

    return <div className={clsx([
            "flex h-[calc(100vh_-_4rem)] w-full relative",
            showOutput ? "bg-white" : "bg-gray-50"
        ])}>
                <div className={clsx([
                    "w-full min-w-[30em] font-['Poppins'] @container",
                    showOutput ? "w-[25vw] max-w-4xl p-6 " : "mx-auto max-w-6xl px-9 py-6 shadow-xl bg-white"
                ])}>
                    <div className={clsx([
                        "flex relative shadow-md",                    
                        showOutput ? "min-h-32 -mx-6 -mt-6 mb-0 overflow-hidden" : "min-h-64 -mx-9 -mt-6",
                        ])}>
                        {showImage && <VFImage 
                                            src={`/api/image/${targetFlow.id}`} 
                                            className={clsx([
                                                'w-full object-cover',
                                                showOutput ? "max-h-32" : "max-h-64"
                                            ])}
                                        />}
                        {!showImage && <div className={clsx([
                            "w-full",
                            `pattern-isometric pattern-${color}-600 pattern-bg-${color}-500 pattern-opacity-20 pattern-size-8`
                        ])}/>}

                        <div className={
                            clsx([
                                "grow bottom-0 absolute py-2 px-3",
                                showImage && "bg-gradient-to-t from-black to-transparent from-20% w-full text-white/90 pt-4"
                            ])}>
                            <UIHelper.PrimitiveField primitive={targetFlow} field="title" major submitOnEnter={true} update={update} editable={false}/>
                            <PrimitiveCard.Title primitive={targetFlow} major={true}/>
                        </div>
                    </div>
                    {!showOutput && <div className="flex place-items-center py-3 justify-end">
                        <UIHelper.Button title="Results >" color='green' onClick={()=>setShowOutput(true)}/>
                    </div>}
                    <PrimitiveCard.InputPins primitive={primitive}/>
                </div>
                {showOutput && <div className="w-full h-full flex ">
                    <div className="w-full h-full flex bg-[#fefefe] overflow-hidden shadow-lg relative">
                        <FlowInstanceOutput primitive={primitive} inputPrimitives={inputs} steps={steps} hideProgressAt="@4xl"/>
                        <div className="absolute top-2 left-2">
                            <UIHelper.Button title="Close" onClick={()=>setShowOutput(false)}/>
                        </div>
                    </div>
                </div>}
    </div>
}