import MainStore from "./MainStore"
import {PrimitiveTable} from './PrimitiveTable';
import CardGrid from './CardGrid';
import GoogleHelper from './GoogleHelper';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Panel from './Panel';
import { useEffect, useState } from "react";
import { ArrowLeftCircleIcon, ArrowPathIcon, ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, ListBulletIcon, PencilIcon, PlayIcon, RectangleGroupIcon, TableCellsIcon, TrashIcon } from '@heroicons/react/24/outline';
import PrimitiveExplorer from "./PrimitiveExplorer";
import HierarchyView from "./HierarchyView";
import { HeroIcon } from "./HeroIcon";
import TooggleButton from "./ToggleButton";
import ProximityView from "./ProximityView";
import {PlusCircleIcon, MagnifyingGlassIcon} from "@heroicons/react/24/outline";
import NewPrimitive from "./NewPrimitive";
import PrimitiveConfig from "./PrimitiveConfig";
import PrimitivePicker from "./PrimitivePicker";
import { PrimitiveCard } from "./PrimitiveCard";
import { InputPopup } from './InputPopup';
import ViewBase from "./ViewBase";
import DropdownButton from "./DropdownButton";

export default function MapViewer({primitive,...props}){
    const mainstore = MainStore()
    const [showViewerPick, setShowViewerPick] = useState(true)
    const [viewerPick, setViewerPick] = useState( props.viewSelf ? primitive : undefined )
    const [manualInputPrompt, setManualInputPrompt] = useState(false)
    const [filters, setFilters] = useState(false)

    const list = primitive.primitives.origin.allUniqueView

    const createView = async( action = {} )=>{
        if(!action?.key){
            console.error("NOT IMPLEMENETED")
            return
        }
        setManualInputPrompt({
            primitive: primitive,
            fields: action.actionFields,
            confirm: async (inputs)=>{
            const actionOptions = {
                ...inputs
            }
            console.log(action.key , actionOptions)
            await MainStore().doPrimitiveAction(primitive, action.key , actionOptions)
            },
        })
    }

    const action = primitive.metadata?.actions?.find(d=>d.key === "build_generic_view")

    return <>
        {manualInputPrompt && <InputPopup key='input' cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
        <div 
            //  style={{gridTemplateColumns: "9rem calc(100% - 9rem)"}}
            className={`w-full flex min-h-[40vh] h-full bg-white rounded-md`}
        >
        {showViewerPick &&
            <div className={[
                    "w-48 p-2",
                    "border-r shrink-0 max-h-[inherit] flex flex-col place-content-between"
                ].join(" ")}>
                <div className="overflow-y-scroll space-y-2 p-1">
                    {list.map((d)=><PrimitiveCard variant={false} primitive={d} compact onClick={()=>setViewerPick(d)} showExpand onEnter={()=>mainstore.sidebarSelect(d)} className={d === viewerPick ? "!bg-ccgreen-100 !border-ccgreen-200 !border" : "!border !border-gray-50"}/>)}
                </div>
                {action && <div className='shrink-0 grow-0'>
                    <Panel.MenuButton title="New map" className='w-full' action={()=>createView(action)}/>
                </div>}
            </div>
        }
        <div 
            style={showViewerPick ? {width: `calc(100% - 12rem)`} : {}}
            className="w-full flex flex-col grow-0 max-h-[inherit]">
            <div className='flex overflow-y-scroll flex-col h-full relative'>
                <div key='category_toolbar' className={`flex space-x-3 absolute z-50 left-4 top-4 p-0.5 place-items-start `}>
                    <div key='category_toolbar' className={`flex bg-white rounded-md shadow-lg border-gray-200 border p-0.5 place-items-start `}>
                        <DropdownButton noBorder icon={showViewerPick ? <ChevronLeftIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>} onClick={()=>setShowViewerPick(!showViewerPick)} flat className={`!px-0.5 hover:text-ccgreen-800 hover:shadow-md`}/>
                    </div>
                </div>
                {viewerPick && <ViewBase primitive={viewerPick} closeButton={props.closeButton} isExpanded={showViewerPick} setExpanded={setShowViewerPick}/>}
            </div>
        </div>
    </div>
    </>
}