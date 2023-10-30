import HierarchyView from "./HierarchyView"
import MainStore from "./MainStore"
import PrimitiveExplorer from "./PrimitiveExplorer"
import ProximityView from "./ProximityView"
import { PrimitiveCard } from './PrimitiveCard';
import { useEffect, useMemo, useState } from "react";
import DropdownButton from "./DropdownButton";
import { HeroIcon } from "./HeroIcon";
import { ArrowDownLeftIcon, ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, PlusCircleIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { InputPopup } from "./InputPopup";


const views = [
    {id: "cards", icon: <HeroIcon icon='LargeGrid' className="w-5 h-5"/>, title: "Explorer view", embed_close:true},
    {id: "explore", icon: <RectangleGroupIcon className="w-5 h-5"/>, title: "Segment view", sNoun: "segment", embed_close:true},
    {id: "cluster", icon: <HeroIcon icon='Nest' className="w-5 h-5"/>, title: "Hierarchy view", sNoun: "hierarchy"},
    {id: "proximity", icon: <HeroIcon icon='FABullseye' className="w-5 h-5"/>, title: "Proximity view", sNoun: "proximity"},
]

export default function ViewBase({primitive, ...props}){
    const loadSegmentView = (view, skip = false)=>{
        if( view=== "cards"){
            if( skip ){
                return undefined
            }
            setSegmentView(undefined)
        }else{
            const list = primitive.primitives.allSegment
            const picked = list.find(d=>d.id === primitive.referenceParameters.segmentView) ?? list[0]
            if( skip ){
                return picked 
            }
            setSegmentView(picked )
        }

    }
    const closeButton = <div key='close_toolbar' className={`flex space-x-4 bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 top-4 p-1.5 flex flex-col place-items-start space-y-2`}>
                            <DropdownButton noBorder icon={<ArrowsPointingInIcon className="w-5 h-5"/>} onClick={props.closeButton} flat className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                        </div>

    const [showViewPane, setShowViewPane] = useState(false)
    const [view, setView] = useState( primitive?.referenceParameters?.viewMode ?? "cards")
    const [segmentView, setSegmentView] = useState(loadSegmentView(primitive?.referenceParameters?.viewMode ?? "cards", true) )
    const [manualInputPrompt, setManualInputPrompt] = useState(false)

    useEffect(()=>{
        loadSegmentView( view )
    },[primitive?.id])

    const content = useMemo(()=>{
        console.log(`REDO CONTENT ${view} ${primitive?.plainId} ${segmentView?.plainId}`)
        setView( primitive?.referenceParameters?.viewMode ?? "cards" )
        return <>
                {view === "cards" &&
                    <PrimitiveExplorer
                        key='explore_cards'
                        closeButton={closeButton}
                        primitive={primitive}
                    />
                }
                {view === "explore" && segmentView &&
                    <PrimitiveExplorer
                        key='explore'
                        closeButton={closeButton}
                        primitive={segmentView}
                    />
                }
                {view === "cluster" && segmentView && 
                    <HierarchyView
                        key='cluster'
                        primitive={segmentView}
                />}
                {view === "proximity" && segmentView && 
                    <ProximityView
                        key='priximity'
                        primitive={segmentView}
                />}
        </>

    }, [view, primitive?.id, segmentView?.id])




    const segmentOptions = useMemo(()=>{
        const segemnts = primitive.primitives.allSegment

        return [
            {title: "Create new hierarhcy", icon: <PlusCircleIcon className="w-5 h-5"/>, action: ()=>buildSegment()},
            {title: "Add new segment", icon: <PlusCircleIcon className="w-5 h-5"/>, action: async ()=>{
                console.warn("HARD CODED TYPE - FIX!")
                    const parentSegment = await MainStore().createPrimitive({
                        title: "New Segment",
                        type: "segment",
                        categoryId: 36,
                        parent: primitive
                    })
                    console.log('CREATED PARENT ' + parentSegment.plainId )
                    setSegmentView( parentSegment )
            }},
            ...segemnts.map((d,idx)=>{
                return {
                    id: d.id, title: d.title ?? `Segment view ${idx}`, action: ()=>selectSegmentView(d)
                }
            })
        ]

    }, [view, primitive?.id, segmentView?.id ])

    const selectSegmentView = (d)=>{
        setSegmentView(d)
        primitive.setField(`referenceParameters.segmentView`, d.id)
    }

    const selectView = (view)=>{
        setView(views[view].id)
        primitive.setField(`referenceParameters.viewMode`, views[view].id)
        loadSegmentView( views[view].id )
    }

    const buildSegment = ()=>{
        const action = primitive.metadata?.actions?.find(d=>d.key === "build_segment")
            setManualInputPrompt({
                primitive: primitive,
                fields: action.actionFields,
                confirm: async (inputs)=>{
                    console.log(action.key, inputs)
                    await MainStore().doPrimitiveAction(primitive, action.key, inputs)
                },
            })
    }
    
    const selectedIdx = views.findIndex(d=>d.id===view)
    const segmentIdx = segmentOptions?.findIndex(d=>d.id === segmentView?.id)


    return <div className="w-full h-full flex flex-col relative">
                {manualInputPrompt && <InputPopup cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
                <div key='category_toolbar' className={`flex space-x-3 absolute z-50 left-4 top-4 p-0.5 place-items-start`}>
                    {props.setExpanded &&
                        <div key='category_toolbar' className={`flex bg-white rounded-md shadow-lg border-gray-200 border p-0.5 place-items-start `}>
                            <DropdownButton noBorder icon={props.isExpanded ? <ChevronLeftIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>} onClick={()=>props.setExpanded(!props.isExpanded)} flat className={`!px-0.5 hover:text-ccgreen-800 hover:shadow-md`}/>
                        </div>
                    }
                    <div key='view_select' className={`flex bg-white rounded-md shadow-lg border-gray-200 border p-0.5 place-items-start `}>
                        <DropdownButton showTick placement='bottom-start' portal setSelectedItem={selectView} selectedItemIdx={selectedIdx} noBorder icon={views[selectedIdx]?.icon} items={views} flat className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                    </div>
                    {view !== "cards" && <div key='segment_menu' className={`flex bg-white rounded-md shadow-lg border-gray-200 border p-0.5 place-items-start max-w-[45cqw]`}>
                        <DropdownButton showTick placement='bottom-start' title={segmentOptions?.[segmentIdx === -1 ? 0 : segmentIdx].title} portal noBorder selectedItemIdx={segmentIdx > -1 ? segmentIdx : undefined} items={segmentOptions} flat className={`!px-1.5`}/>
                    </div>}
                </div>
                {props.closeButton && !views.find(d=>d.id === view)?.embed_close && closeButton}
                {content}
            </div>
}