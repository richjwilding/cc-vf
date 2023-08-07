import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { PrimitiveCard} from "./PrimitiveCard";
import { PencilIcon, ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import GenericEditor from './GenericEditor';
import MainStore from "./MainStore";
import ConfirmationPopup from "./ConfirmationPopup";
import EditableTextField from "./EditableTextField";
import AIProcessButton from "./AIProcessButton";
import useDataEvent from "./CustomHook";
import { default as CategoryCard, CategoryCardPill } from "./CategoryCard";
import CardGrid from "./CardGrid";


export default function SegmentCard({primitive, ...props}){
    useDataEvent("set_parameter set_field relationship_update", [primitive.id, primitive.primitives.uniqueAllIds].flat())
    let aiSummary = props.aiProcessSummary
    const ring = !props.disableHover
    const [editPrompt, setEditPrompt] = useState(null)

    const segmentItems = (node)=>{
        return node.primitives.uniqueAllItems.map((d)=>{
            if( d.type === "segment" ){
                return segmentItems( d )
            }else{
                return d
            }
        }).flat()
    } 


    return (
        <>
        <div 
            key={primitive.id}
            className={
                [" py-3 pl-3 pr-4 group w-full  bg-white p-1 rounded-lg",
                    props.flatBorder ? '' : 'rounded-lg',
                    ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-${props.ringColor || 'slate'}-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
                    props.border ? "shadow border-[1px]" : '',
                ].join(" ")}
            >
        <Panel 
            key='panel'
            collapsable={true} 
            className='!mt-0 w-full'
            editButton={(e)=>{e.stopPropagation();setEditPrompt(primitive)}}
            title={<div key='title' className="flex place-items-center w-full" >
                    <p>{primitive.title}</p>
                    {primitive.primitives.allCategory.length > 0 && 
                        <AIProcessButton 
                            active="mark_categories"
                            markOnProcess
                            primitive={primitive} 
                            process={async ()=>await MainStore().doPrimitiveAction(primitive, "summarize_problem", {source: primitive.id})}
                            />
                    }
                    </div>}>
            {!props.showDetails && 
                primitive.primitives.allSegment.length > 0 && 
                        <div className='py-2 flex flex-wrap'>
                            {primitive.primitives.allCategory.map((category)=>{
                                return <PrimitiveCard key={category.plainId} primitive={category}/>

                            })}
                        </div>
            }
            {props.showDetails && 
                primitive.primitives.allSegment.length > 0 && 
                        <div className='py-2 flex flex-col grid' style={{gridTemplateColumns: '1fr 3fr'}}>
                            {primitive.primitives.allSegment.map((segment)=>{
                                const innerSet = segmentItems( segment )
                                return <>
                                        <div className="flex flex-col  p-2 border-t border-gray-200 text-sm space-y-2">
                                            {segment.title}
                                            <PrimitiveCard.Title compact primitive={segment} className='mt-1'/>

                                        </div> 
                                        <div className="flex flex-col p-2 border-t border-gray-200">
                                            <div className="flex flex-col">
                                                <p className="grow text-gray-600 text-sm ">{segment.referenceParameters.description || "None"}</p>
                                                {segment.referenceParameters.problemOverview && <p className="grow text-gray-400 mt-2 text-sm ">{segment.referenceParameters.problemOverview instanceof Object ?  segment.referenceParameters.problemOverview.map((d)=>d.summary).join('\n') : segment.referenceParameters.problemOverview}</p>}

                                            <AIProcessButton 
                                                active="summarize"
                                                markOnProcess
                                                small
                                                primitive={segment} 
                                                process={async ()=>MainStore().doPrimitiveAction(segment, "summarize_problem", {source: segment.task.id})}
                                                />
                                            </div>
                                            <Panel 
                                                key='panel'
                                                collapsable={true} 
                                                className='w-full @container'
                                                titleClassName='flex font-medium place-items-center text-gray-500 text-sm w-full'
                                                title={`${innerSet.length} items`}>
                                                    <CardGrid 
                                                        cardClick={(undefined,p)=>MainStore().sidebarSelect(p)}
                                                        list={innerSet}
                                                        />
                                            </Panel>
                                        </div>
                                     </>

                            })}
                        </div>
            }
        </Panel>
        <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </div>
        {editPrompt && <GenericEditor target={primitive.task} actions={primitive.task?.metadata?.actions ? primitive.task.metadata.actions.filter((d)=>d.key === "categorize") : undefined} set={(p)=>p.primitives.allCategory} listType='category_pill' options={MainStore().categories().filter((d)=>d.primitiveType === "category")} primitive={primitive} setOpen={()=>setEditPrompt(null)}/> }
        </>
    )
}
CategoryCard.Pill = CategoryCardPill