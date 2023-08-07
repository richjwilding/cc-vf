import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { PrimitiveCard} from "./PrimitiveCard";
import { PencilIcon, ArrowPathIcon, TrashIcon, BoltIcon } from "@heroicons/react/24/outline";
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
    const [showAll, setShowAll] = useState(false)
    const ring = !props.disableHover

    const nestedItems = primitive.nestedItems
    let nestedTypes = nestedItems.map((d)=>d.type).filter((v,i,a)=>a.indexOf(v)===i)

    const showGrid = nestedTypes.length === 1 && nestedTypes[0] === "entity"

    const itemLimit = props.itemLimit || 10
    const moreToShow = Math.max(0, nestedItems.length - itemLimit)

    return (
        <>
        <div 
            key={primitive.id}
            onClick={props.onClick ? (e)=>props.onClick(e,primitive) : undefined }
            className={
                [" py-3 pl-3 pr-4 group bg-white p-1 rounded-lg",
                    props.flatBorder ? '' : 'rounded-lg',
                    ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-${props.ringColor || 'slate'}-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
                    "shadow ",
                    
                    'min-w-[24rem]',
                    props.className
                ].join(" ")}
            >
        <p key='title' className='text-sm text-gray-800 font-semi mb-2'>{primitive.title}</p>
        <p key='description' className='text-xs text-gray-600 mb-2'>{primitive.referenceParameters.description}</p>
        {showGrid && <CardGrid 
            list={showAll ? nestedItems : nestedItems.slice(0,itemLimit)}
            onCardClick={props.onClick ? (e,p)=>{e.stopPropagation(); console.log(p.plainId);props.onClick(e, p)} : undefined}
            cardProps={
                {micro:true}
            }
            columnConfig={{xs:2, md: 3}}
        />}
        {showGrid && !showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`+ ${moreToShow} items`} onClick={()=>setShowAll(true)}/>}
        {showGrid && showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`Show less`} onClick={()=>setShowAll(false)}/>}
        {primitive.insights && primitive.insights.length > 0 &&
            <Panel title='Problems' titleClassName='text-xs w-fit flex text-gray-500 flex place-items-center font-medium' collapsable defaultOpen={false}>
            <div 
                className="bg-gray-50 border border-gray-200 font-light p-2 py-4 rounded-md space-y-2 text-gray-600 text-xs mb-2">
                    {primitive.insights.map((insight)=>(
                        <div className="flex place-items-start">
                            <BoltIcon className="h-5 mt-1 mr-1 shrink-0" strokeWidth={1}/>
                            <p>{insight?.problem}</p>
                        </div>
                    ))}
            </div>
            </Panel>
        }
        <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </div>
        </>
    )
}