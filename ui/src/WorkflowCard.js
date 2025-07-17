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
import Tabs from "./@components/tabs";
import { ClockIcon, SparklesIcon } from "@heroicons/react/24/outline";

const tabs = [
  { name: 'Inputs', id: "input" },
  { name: 'Progress', id: "progress"},
]

export default function WorkflowCard({primitive, className,...props}){
    const color = primitive.workspace?.color || "slate"
    const showImage = primitive.referenceParameters?.hasImg

    return <div onClick={props.onClick} className={clsx([
        "bg-white rounded-lg w-96 h-72 flex flex-col relative shadow-sm border font-['Poppins'] @container flex flex-col min-h-0 overflow-hidden",
        className,
        props.onClick ? "hover:shadow-lg hover:border-gray-300" : ""
    ])}>
                    <div className={clsx([
                        "flex relative mb-4 min-h-48 max-h-48",
                        ])}>
                        {showImage && <VFImage 
                                            src={`/api/image/${primitive.id}`} 
                                            className={clsx([
                                                'w-full object-cover ',
                                            ])}
                                        />}
                        {!showImage && <div className={clsx([
                            "w-full",
                            `pattern-isometric pattern-${color}-600 pattern-bg-${color}-500 pattern-opacity-20 pattern-size-8`
                        ])}/>}

                        <div className={
                            clsx([
                                "grow bottom-0 absolute py-2 px-3",
                                showImage ? "bg-gradient-to-t from-black to-transparent from-20% w-full text-white/80 pt-4" : "text-slate-700"
                            ])}>
                            <UIHelper.PrimitiveField primitive={primitive} field="title" major editable={false}/>
                            <PrimitiveCard.Title primitive={primitive} major={true}/>
                        </div>
                </div>
                <div className="p-2 text-md font-light grow flex text-slate-700">
                    Description of workflow will be here
                </div>
                <div className="px-3 py-2 text-sm grow flex text-xs text-slate-500 justify-between">
                    <div className="flex space-x-1 place-items-center">
                        <SparklesIcon className="w-4 h-4"/>
                        <p className="font-semibold">Credits:</p><p className="text-slate-700">{primitive.referenceParameters.credits}</p>
                    </div>
                    <div className="flex space-x-1 place-items-center">
                        <ClockIcon className="w-4 h-4"/>
                        <p className="text-slate-700">{primitive.referenceParameters.duration}</p>
                    </div>
                </div>
    </div>
}