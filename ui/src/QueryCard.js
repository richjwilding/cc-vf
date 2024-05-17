import { useState } from "react";
import { ExpandArrow, PrimitiveCard } from "./PrimitiveCard";
import Panel from "./Panel";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import AIProcessButton from "./AIProcessButton";
import MainStore from "./MainStore";
import useDataEvent from "./CustomHook";
export default function QueryCard({primitive, ...props}){
    useDataEvent('relationship_update',primitive.id)
    const results = primitive.primitives.uniqueAllItems
    const [expanded, setExpanded] = useState( false )//results.length > 0)
    const [expandedChildren, setExpandedChildren] = useState({})

    return  <div className="w-full bg-white rounded-md shadow flex flex-col p-2">
                <div className="flex justify-between place-items-center">
                    <PrimitiveCard primitive={primitive} compact showEdit disableHover editing className='w-full place-items-center !bg-transparent'/>
                </div>
                <Panel collapsable open={false} className="!mt-0 ml-1">
                    <div className="w-full flex-col text-xs my-2 space-y-1 shrink-0">
                        <PrimitiveCard.Parameters primitive={primitive} editing leftAlign compactList className="text-xs text-slate-500" fullList />
                    </div>
                </Panel>
                <div className="w-full flex space-x-2 justify-end">
                    <AIProcessButton active='data_query' actionKey='custom_query' primitive={primitive} />
                    {results.length > 0 && <p onClick={()=>setExpanded(!expanded)} className="bg-gray-100 border grow-0 px-1 px-2 py-0.5 rounded-full shrink-0 text-slate-600 text-xs flex">{results.length} items <ChevronDownIcon className={`ml-1 w-4 h-4 ${expanded ? "rotate-180" : ""}`}/></p>}
                </div>
                {expanded && results.length > 0 && <div className="rounded-lg my-2 bg-gray-50 p-4 text-sm space-y-2">
                    {results.map(d=>{
                        const showToggle = d.referenceParameters.description.length > 200
                        const short = showToggle ? d.referenceParameters.description.slice(0, 200) : d.referenceParameters.description
                        const showShort = !expandedChildren[d.id]
                        const display = showShort ? short : d.referenceParameters.description
                        const toggleButton = <p onClick={()=>{
                                                        if(showShort){
                                                            setExpandedChildren({...expandedChildren,[d.id]: true})
                                                        }else{
                                                            setExpandedChildren({...expandedChildren,[d.id]: undefined})
                                                        }
                                                    }}
                                                    className="cursor-pointer bg-gray-200 hover:bg-gray-300 border grow-0 px-1 px-0.5 ml-1 inline-block rounded-full shrink-0 text-slate-600 text-[8px] leading-[11px]">{showShort ? "More..." : "Less..."}</p>
                        return <div className="p-2 rounded-md group hover:shadow hover:ring-2 ring-ccgreen-500">
                            <div className="flex justify-between">
                                <p className="font-semibold text-slate-500">{d.title}</p>
                                <ExpandArrow className='shirnk-0 grow-o w-4 h-4 text-gray-200 group-hover:text-gray-400 hover:!text-gray-800' onClick={()=>MainStore().sidebarSelect(d)}/>
                            </div>
                            <p className="ml-1 pl-2 mt-1.5 border-l-2 border-gray-200   text-slate-600">{display}{showToggle ? toggleButton : <></>}</p>
                        </div>})}
                </div>}

        </div>
}