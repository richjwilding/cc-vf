import { useState } from "react";
import CreateButton from "./CreateButton";
import useDataEvent from "./CustomHook";
import MainStore from "./MainStore";
import MapViewer from "./MapViewer";
import Panel from "./Panel";
import { PrimitiveCard } from "./PrimitiveCard";
import QueryCard from "./QueryCard";
import GridLayout from 'react-grid-layout';
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import DropdownButton from "./DropdownButton";

export default function AnalysisPage({primitive, ...props}){
    useDataEvent('relationship_update',primitive.id)
    const [showSources, setShowSources] = useState(false)
    const [showQuery, setShowQuery] = useState(true)

    const queryCategory = MainStore().categories().filter(d=>d.primitiveType === "query")?.[0]
    const showSidebar = !showQuery || !showSources

    return <div 
            style={{gridTemplateColumns: [showSidebar ? "2.5rem" : undefined,showSources ? "480px" : undefined, showQuery ? "1fr" : undefined, "2fr"].filter(d=>d).join(" ")}}
            className="w-full grow max-h-[calc(100vh_-_5em)] h-[calc(100vh_-_5em)] min-w-full max-w-full grid gap-2 p-2">
        {showSidebar && <div className="flex flex-col w-full max-h-[inherit] p-0.5 space-y-2">
            {!showSources && <DropdownButton noBorder icon={showSources ? <ChevronLeftIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>} onClick={()=>setShowSources(!showSources)} flat className={`ml-auto`}/>}
            {!showQuery && <DropdownButton noBorder icon={showQuery ? <ChevronLeftIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>} onClick={()=>setShowQuery(!showQuery)} flat className={`ml-auto`}/>}
        </div>}
        {showSources && <div className="flex flex-col w-full max-h-[inherit] bg-white sm:rounded-lg shadow p-4 space-y-2">
            <DropdownButton noBorder icon={showSources ? <ChevronLeftIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>} onClick={()=>setShowSources(!showSources)} flat className={`ml-auto`}/>
                <PrimitiveCard primitive={primitive} showEdit={true} hideTitle={true} major={true}/>
                <div className="border-gray-200 py-5 w-full">
                    <p className="text-gray-500 font-medium">Details</p>
                    <dl className={`mt-2 divide-y divide-gray-200 border-t border-b border-gray-200 relative`}>
                        <PrimitiveCard.Parameters primitive={primitive} editing={true} fullList={true}/>
                    </dl>
                </div>
        </div>}
        {showQuery &&<div className="flex flex-col w-full max-h-[inherit] bg-gray-50 sm:rounded-lg shadow p-4 space-y-4 @container">
            <DropdownButton noBorder icon={showQuery ? <ChevronLeftIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>} onClick={()=>setShowQuery(!showQuery)} flat className={`ml-auto`}/>
                <div className="w-full justify-end flex">
                    <CreateButton title="New Query" parent={primitive} resultCategory={queryCategory}/>
                </div>
                <div className="w-full overflow-y-scroll space-y-4 p-1">
                {primitive.primitives.allUniqueQuery.map(d=><QueryCard primitive={d}/>)}
                </div>
        </div>}
        <div className="flex w-full max-h-[inherit] @container">
            <MapViewer primitive={primitive}/>
        </div>
    </div>

}