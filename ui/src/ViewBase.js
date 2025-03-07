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
    const loadSegmentView = (view, overload)=>{
        if( view=== "cards"){
            return undefined
        }else{
            if( (overload ?? primitive.referenceParameters?.segmentView) === "imports" ){
                const importedSegments = primitive.primitives.imports.allSegment
                if( importedSegments.length > 0){
                    return {picked: primitive, list: importedSegments }
                }
                return undefined
            }else{
                const list = primitive.primitives.allSegment
                const picked = list.find(d=>d.id === (overload ?? primitive.referenceParameters.segmentView)) ?? list[0]
                return {picked: picked } 
            }
        }

    }
    const closeButton = <div key='close_toolbar' className={`flex space-x-4 bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 top-4 p-1.5 flex flex-col place-items-start space-y-2`}>
                            <DropdownButton noBorder icon={<ArrowsPointingInIcon className="w-5 h-5"/>} onClick={props.closeButton} flat className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                        </div>

    const [showViewPane, setShowViewPane] = useState(false)
    const [view, setView] = useState( primitive?.referenceParameters?.viewMode ?? "cards")
    const [segmentView, setSegmentView] = useState(loadSegmentView(primitive?.referenceParameters?.viewMode ?? "cards") )
    const [manualInputPrompt, setManualInputPrompt] = useState(false)

    useEffect(()=>{
        setSegmentView( loadSegmentView( view ) )
    },[primitive?.id])

    const content = useMemo(()=>{
        console.log(`REDO CONTENT ${view} ${primitive?.plainId}`)
        console.log(segmentView)
        setView( primitive?.referenceParameters?.viewMode ?? "cards" )


        return <>
                {view === "cards" &&
                    <PrimitiveExplorer
                        key='explore_cards'
                        closeButton={closeButton}
                        primitive={primitive}
                    />
                }
                {view === "explore" && segmentView?.picked &&
                    <PrimitiveExplorer
                        key='explore'
                        closeButton={closeButton}
                        list={segmentView.list}
                        primitive={segmentView.picked}
                        asSegment={segmentView.list !== undefined}
                    />
                }
                {view === "cluster" && segmentView?.picked && 
                    <HierarchyView
                        key='cluster'
                        list={segmentView.list}
                        primitive={segmentView.picked}
                />}
                {view === "proximity" && segmentView?.picked && 
                    <ProximityView
                        key='priximity'
                        list={segmentView.list}
                        primitive={segmentView.picked}
                />}
        </>

    }, [view, primitive?.id, segmentView?.picked, segmentView?.list])




    const segmentOptions = useMemo(()=>{
        const segemnts = primitive.primitives.origin.allSegment

        const importedSegments = primitive.primitives.imports.allSegment
        if( importedSegments.length > 0){
            segemnts.unshift({
                title: "Imported segments",
                id:"imports"
            })
        }

        const segmentCategory = primitive.metadata?.resultCategories?.find(d=>MainStore().category(d.resultCategoryId)?.primitiveType === "segment")?.resultCategoryId 

        return [
            {title: "Create new hierarchy", icon: <PlusCircleIcon className="w-5 h-5"/>, action: ()=>buildSegment()},
            {title: "Create new hierarchy (alt)", icon: <PlusCircleIcon className="w-5 h-5"/>, action: ()=>buildSegment2()},
            {title: "Add new segment", icon: <PlusCircleIcon className="w-5 h-5"/>, action: async ()=>{
                    const parentSegment = await MainStore().createPrimitive({
                        title: "New Segment",
                        type: "segment",
                        categoryId: segmentCategory,
                        parent: primitive
                    })
                    console.log('CREATED PARENT ' + parentSegment.plainId )
//                    setSegmentView( parentSegment )
                    setSegmentView( loadSegmentView( view, parentSegment.id ) )
            }},
            ...segemnts.map((d,idx)=>{
                return {
                    id: d.id, title: d.title ?? `Segment view ${idx}`, action: ()=>selectSegmentView(d)
                }
            })
        ]

    }, [view, primitive?.id, segmentView?.id ])

    const selectSegmentView = (d)=>{
        setSegmentView( loadSegmentView( view, d.id ) )
        primitive.setField(`referenceParameters.segmentView`, d.id)
    }

    const selectView = (view)=>{
        setView(views[view].id)
        primitive.setField(`referenceParameters.viewMode`, views[view].id)
        loadSegmentView( views[view].id )
    }

    const buildSegment2 = ()=>{
        const action = primitive.metadata?.actions?.find(d=>d.key === "cluster2")
        console.log(primitive)
            setManualInputPrompt({
                primitive: primitive,
                fields: action.actionFields,
                confirm: async (inputs)=>{
                    console.log(action.key, inputs)
                    await MainStore().doPrimitiveAction(primitive, action.key, inputs)
                },
            })
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
                    {views && <div key='view_select' className={`flex bg-white rounded-md shadow-lg border-gray-200 border p-0.5 place-items-start `}>
                        <DropdownButton showTick placement='bottom-start' portal setSelectedItem={selectView} selectedItemIdx={selectedIdx} noBorder icon={views[selectedIdx]?.icon} items={views} flat className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                    </div>}
                    {view !== "cards" && <div key='segment_menu' className={`flex bg-white rounded-md shadow-lg border-gray-200 border p-0.5 place-items-start max-w-[45cqw]`}>
                        <DropdownButton showTick placement='bottom-start' title={segmentOptions?.[segmentIdx === -1 ? 0 : segmentIdx].title} portal noBorder selectedItemIdx={segmentIdx > -1 ? segmentIdx : undefined} items={segmentOptions} flat className={`!px-1.5`}/>
                    </div>}
                </div>
                {props.closeButton && !views.find(d=>d.id === view)?.embed_close && closeButton}
                {content}
            </div>
}