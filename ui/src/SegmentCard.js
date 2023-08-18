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
import { roundCurrency } from "./RenderHelpers";
import { ReactECharts } from "./React-ECharts";
import { VFImage } from "./VFImage";


function SegmentGraph({items, ...props}){


    const imgHash = items.reduce((o,d)=>{
        o[d.id] = {
            height:20,
            width:20,
            backgroundColor: {image: `http://localhost:3000/api/image/${d.id}`}
        }
        return o
    },{})  

    console.log(imgHash)

    const projectData = (d, axis)=>{
        if( props[axis].parameter ){
            return d?.referenceParameters?.[props[axis].parameter]
        }
        else{
            return d?.[props[axis].field]
        }
    }
    
    const option = {
        grid: {
            top: 0,
            bottom: 20,
          left: "200",
          right: "0%",
        },
        xAxis: {
          type: "value",
        },
        yAxis: {
            type: "category",
            data: items.sort((a,b)=>a.referenceParameters.funding - b.referenceParameters.funding).map((d)=>d.id + "|" +projectData(d, "y-axis")),
            axisLabel: {
                interval:0,
                margin:10,
                fontSize:12,
                lineHeight:25,
                show: true,
                formatter: function (value) {
                    return `{${value.split("|")[0]}|} ` + value.split("|")[1]
                },
                rich: imgHash
                },
        },
        series: [
          {
            type: "bar",
            data: items.map((d)=>projectData(d, "x-axis")),
          },
        ],
      }
    return (
        <div style={props.style} className={props.className}>
            <ReactECharts option={option} />
        </div>
    )
}

export default function SegmentCard({primitive, ...props}){
    useDataEvent("set_parameter set_field relationship_update", [primitive.id, primitive.primitives.uniqueAllIds].flat())
    const [showAll, setShowAll] = useState(false)
    const ring = !props.disableHover

    const nestedItems = props.directOnly ? primitive.primitives.ref.allItems : primitive.nestedItems
    let nestedTypes = nestedItems.map((d)=>d.metadata?.plurals ?? (d.metadata?.title ? d.metadata?.title + "s" : undefined) ?? d.type).filter((v,i,a)=>a.indexOf(v)===i)

    const itemLimit = props.itemLimit || (props.hideDetails  ? nestedItems.length : 10)
    const moreToShow = Math.max(0, nestedItems.length - itemLimit)
    const wide = itemLimit > 10//0

    const mainContent = <>
            <p key='title' className={`${props.hideDetails ? "text-xl font-light mb-4" : "text-sm font-semi mb-2"} text-gray-800  `}>{primitive.title}</p>
            {!props.hideDetails && <p key='description' className='text-xs text-gray-600 mb-2'>{primitive.referenceParameters.description}</p>}
            {props.showGrid  && props.hideDetails  && <div style={{gridTemplateColumns: `repeat(${wide ? 10 : 5}, minmax(0, 1fr))`}} className="grid place-items-center gap-1">
                {(showAll ? nestedItems : nestedItems.slice(0,itemLimit)).map((d)=>(
                    <PrimitiveCard 
                        primitive={d}
                        micro={!props.hideDetails}
                        hideMenu={props.hideDetails}
                        fixedSize={!props.hideDetails ? undefined : "3rem"}
                        imageOnly={props.hideDetails}
                        compact={props.hideDetails}
                        onClick={props.onInnerCardClick ? (e,p)=>{e.stopPropagation(); console.log(props.onInnerCardClick);props.onInnerCardClick(e, p, primitive)} : undefined}
                        />
                ))}
            </div>}
            {props.showGrid && !props.hideDetails && <CardGrid 
                list={showAll ? nestedItems : nestedItems.slice(0,itemLimit)}
                onClick={props.onInnerCardClick ? (e,p)=>{e.stopPropagation(); console.log(props.onInnerCardClick);props.onInnerCardClick(e, p, primitive)} : undefined}
                cardProps={
                    {micro:true}
                }
                columnConfig={{xs:2, md: 3}}
            />}
            {props.showGrid && !showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`+ ${moreToShow} items`} onClick={()=>setShowAll(true)}/>}
            {props.showGrid && showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`Show less`} onClick={()=>setShowAll(false)}/>}
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
        </>

    return (
        <>
        <div 
            key={primitive.id}
            onClick={props.onClick ? (e)=>props.onClick(e,primitive) : undefined }
            className={
                ["relative py-3 pl-3 pr-4 group bg-white p-1 rounded-lg",
                    props.overlay ? "@container" : "",
                    props.flatBorder ? '' : 'rounded-lg',
                    ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-${props.ringColor || 'slate'}-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
                    "shadow ",
                    !props.graph && wide ? 'min-w-[48rem]' : 'min-w-[24rem]',
                    props.graph  ? 'min-w-[36rem]' : '',
                    props.className
                ].join(" ")}
            >
            {mainContent}
            {props.overlay && <div className="absolute top-0 left-0 w-full h-full backdrop-blur-sm bg-gray-50/90 rounded-lg  ">
                <p style={{fontSize: "min(24cqh, 6cqw)"}} className="px-2 py-1 font-semi text-gray-500">{nestedItems.length} {nestedTypes}</p>
                {
                    props.details && props.details.map((d)=>{
                        const items = nestedItems.map((d2)=>d.parameter ? d2.referenceParameters?.[d.parameter] : d2[d.field])
                        let value
                        if( d.action === "sum"){
                            value = items.reduce((a,c)=>a + (c||0),0)
                        }
                        if( value ){
                            let formatted = value
                            if( d.formatter === "currency"){
                                formatted = roundCurrency( value )
                            }
                            return <p style={{fontSize: "min(30cqh, 10cqw)"}} className="px-2 py-1 font-bold">{formatted}</p>
                        }
                        return <></>
                    })
                }
                <p style={{fontSize: "min(12cqh, 4cqw)"}} className="px-2 py-1 font-light text-gray-500">{primitive.title}</p>

            </div> }
            {props.graph && <SegmentGraph 
                style={{height: (100 + (nestedItems.length * 20)) + "px"}}
                items={nestedItems} {...props.details} 
                />}
            
            
        </div>
    </>
    )
}