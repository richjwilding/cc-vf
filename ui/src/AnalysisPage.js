import { useState } from "react";
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

export default function AnalysisPage({primitive, ...props}){

    const targetFlow = MainStore().primitive(941815)

    useDataEvent('relationship_update',primitive.id)
    const inputSource = targetFlow?.primitives.imports.allUniqueItems[0]    
    const inputPrimitives = (inputSource?.itemsForProcessing ?? []).sort((a,b)=>b.plainId - a.plainId)

    function createNewInstance(){
        MainStore().doPrimitiveAction(targetFlow, "new_flow_instance", {
            type: inputPrimitives[0]?.type,
            referenceId: inputPrimitives[0]?.referenceId,
        })
    }

    let steps = [], flowInstances = []
    targetFlow?.primitives.origin.allUniqueItems.forEach(d=>{
        if(d.type === "flowinstance"){
            flowInstances.push(d)
        }else{
            steps.push(d)
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

    return <div 
            className={`w-full relative p-6 overflow-y-scroll`}
        >
        <div className="mb-2 max-w-[1600px] mx-auto">
            <div className="w-full flex flex-col py">
                <span className="text-2xl font-bold text-gray-500">Flow details</span>
                <DescriptionList>
                    <DescriptionTerm>Flow</DescriptionTerm>
                    <DescriptionDetails>{targetFlow.title}</DescriptionDetails>
                    <DescriptionTerm>Flow customization</DescriptionTerm>
                    <DescriptionDetails>None</DescriptionDetails>
                </DescriptionList>
            </div>
            <div className="text-2xl font-bold text-gray-500 mt-8 mb-2 flex place-items-center space-x-2">
                <p>{flowInstances.length} flow instances</p>
                <UIHelper.Button 
                    title="Add new"
                    action={createNewInstance}
                />
            </div>
        </div>
        <div className="rounded-md bg-white px-5 py-2 @container max-w-[1600px] mx-auto">
            <div className="grid grid-cols-[250px_1fr_35px] @4xl:grid-cols-[350px_1fr_200px_35px] grid-row-[1.5rem_auto] w-full gap-y-[1px] overflow-y-scroll bg-gray-200">
                <div className={`p-2 text-sm text-gray-500 bg-white font-semibold`}>Instance</div>
                <div className={`p-2 text-sm text-gray-500 bg-white font-semibold hidden @4xl:block`}>Progress</div>
                <div className={`p-2 text-sm text-gray-500 bg-white font-semibold`}>Status</div>
                <div className={`p-2 text-sm text-gray-500 bg-white font-semibold`}></div>
                
                {inputPrimitives.map(input=>{
                    const flowInstance = flowInstances.find(d=>d.itemsForProcessing.map(d=>d.id).includes(input.id))
                    return <FlowInstanceInfo primitive={flowInstance} inputPrimitive={input} steps={steps} hideProgressAt="@4xl"/>
                })}
            </div>
        </div>
    </div>
}