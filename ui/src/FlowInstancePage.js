import { useEffect, useReducer, useState } from "react";
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
import { useLocation, useParams } from "react-router-dom";

export default function FlowInstancePage({primitive, ...props}){
    const { id } = useParams();
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const isEmbedded = query.get("embed")

    if (!primitive && id) {
        primitive = MainStore().primitive(id)
    }
    useEffect(() => {
        if( !primitive ){
            MainStore().fetchPrimitive(id)
        }
      }, [primitive]);

    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [showOutput, setShowOutput ]= useState(false)
    const [dataForNewInstance, setDataForNewInstance ]= useState({})
    
    const [errors, setErrors ]= useState({})
    const [missing, setMissing ]= useState({})

    useDataEvent('relationship_update set_field set_parameter',primitive?.id, ()=>{
        forceUpdate()
    })
    if( !primitive){
        return <></>
    }

    const isForNewInstance = primitive.type === "flow"
    const targetFlow = isForNewInstance ? primitive : primitive.origin
    const pins = isEmbedded ? {
        ...primitive.getConfig?.inputPins,
        split1:{split:true, title:"Your details"},
        ext_name:{
            "name": "Your Name",
            "source": "param.ext_name",
            "types": [
              "string"
            ]
        },
        ext_company_name:{
            "name": "Your company",
            "source": "param.ext_company_name",
            "types": [
              "string"
            ]
        },
        ext_email:{
            "name": "Your company email (for report)",
            "source": "param.ext_email",
            "types": [
              "string"
            ]
        }
    }: primitive.getConfig?.inputPins


    function createNewInstance(){
        if( isForNewInstance ){
            MainStore().doPrimitiveAction(targetFlow, "create_flowinstance", dataForNewInstance)
        }
    }

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
    function newInstanceCallback(d,v){
        setDataForNewInstance({
            ...dataForNewInstance,
            [d]: v
        })
        return true
    }

    
    const inputs = primitive.itemsForProcessing
    const color = targetFlow.workspace?.color || "slate"
    const showImage = targetFlow.referenceParameters?.hasImg
    const enableSubmit = [...Object.values(missing), ...Object.values(errors)].filter(d=>d).length === 0

    return <div className={clsx([
            "flex w-full relative flex-1 min-h-0",
            showOutput ? "bg-white" : "bg-gray-50"
        ])}>
                <div className={clsx([
                    "w-full min-w-[30em] font-['Poppins'] @container flex flex-1 flex-col min-h-0",
                    showOutput ? "w-[25vw] max-w-2xl p-6 " : "mx-auto max-w-6xl px-9 bg-white"
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
                    <div className="overflow-y-scroll flex-1">
                        {!showOutput && !isForNewInstance && <div className="flex place-items-center py-3 justify-end">
                            <UIHelper.Button title="Results >" color='green' onClick={()=>setShowOutput(true)}/>
                        </div>}
                        <PrimitiveCard.InputPins 
                            primitive={primitive} 
                            pins={pins} 
                            dataForNewInstance={isForNewInstance ? dataForNewInstance : undefined} 
                            newInstanceCallback={isForNewInstance ? newInstanceCallback : undefined} 
                            updateMissing={isForNewInstance ? setMissing : undefined}
                        />
                        {isForNewInstance&& <div className="flex place-items-center py-3 justify-end space-x-3">
                            {isEmbedded && <UIHelper.Button title="Cancel" onClick={()=>{console.log("send");window.parent.postMessage("close_newflow","*")}}/>}
                            <UIHelper.Button title="Submit" color='green' disabled={!enableSubmit} onClick={createNewInstance}/>
                        </div>}
                    </div>
                </div>
                {showOutput && !isForNewInstance && <div className="w-full h-full flex ">
                    <div className="w-full h-full flex bg-[#fefefe] overflow-hidden shadow-lg relative">
                        <FlowInstanceOutput primitive={primitive} inputPrimitives={inputs} steps={steps} hideProgressAt="@4xl"/>
                        <div className="absolute top-2 left-2">
                            <UIHelper.Button title="Close" onClick={()=>setShowOutput(false)}/>
                        </div>
                    </div>
                </div>}
    </div>
}