import HierarchyView from "./HierarchyView"
import MainStore from "./MainStore"
import PrimitiveExplorer from "./PrimitiveExplorer"
import ProximityView from "./ProximityView"
import { PrimitiveCard } from './PrimitiveCard';
import { useEffect, useMemo, useRef, useState } from "react";
import DropdownButton from "./DropdownButton";
import { HeroIcon } from "./HeroIcon";
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, DocumentArrowDownIcon, MinusCircleIcon, PlusCircleIcon, PlusIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { InputPopup } from "./InputPopup";
import Panel from "./Panel";
import PrimitiveReport from "./PrimitiveReport";
import { exportKonvaToPptx } from "./PptHelper";



export default function PrimtiveReportViewer({primitive, ...props}){
    const [showViewerPick, setShowViewerPick] = useState(true)
    const [selectedElement, setSelectedElement] = useState(true)
    const report = useRef()

    const mainstore = MainStore()
    //const list = primitive.task?.primitives.allUniqueQuery

    //const list = [252416,252434,252435].map(d=>mainstore.primitive(d).primitives.uniqueAllItems.filter(d=>d.referenceId===82)).flat()

    const targetResultCategoryId = primitive.referenceParameters?.resultCategoryId ?? 86
    console.log(`targetResultCategoryId `,targetResultCategoryId )
    let  list = primitive.task?.primitives.descendants.filter(d=>d.referenceId===  targetResultCategoryId).flat()


    if( targetResultCategoryId === 54){
        list = list.filter(d=>d.parentPrimitiveIds.includes('65a17a43a8d6241e3c3b6134'))
    }
    if( targetResultCategoryId === 37){
        list = list.filter(d=>d.parentPrimitiveIds.includes('659f99bee8f1243ff4d97fa6'))
    }

    const [viewerPick, setViewerPick] = useState(list?.[0])
    
    async function changeFontSize(increase = true){
        if( selectedElement ){
            let fontSize = selectedElement.render?.fontSize ?? 16
            if( fontSize > 10 ){
                fontSize  += increase ? 1 : -1
            }else{
                fontSize  += increase ? 0.25 : -0.25
            }
            selectedElement.setField('render.fontSize', fontSize)
        }
    }

    async function addElement(){

        const newElement = await MainStore().createPrimitive({
            title: "New Element",
            type: "element",
            parent: primitive
        })
    }

    const showPicker = (showViewerPick || props.viewSelf)

    return <div 
            //  style={{gridTemplateColumns: "9rem calc(100% - 9rem)"}}
            className={`w-full flex min-h-[40vh] h-full bg-white rounded-md`}
        >
        {showPicker &&
            <div className={[
                    "w-48 p-2",
                    "border-r shrink-0 max-h-[inherit] flex flex-col place-content-between"
                ].join(" ")}>
                <div className="overflow-y-scroll space-y-2 p-1">
                    {list.map((d)=><PrimitiveCard variant={false} primitive={d} compact onClick={()=>setViewerPick(d)} showExpand onEnter={()=>mainstore.sidebarSelect(d)} className={d === viewerPick ? "!bg-ccgreen-100 !border-ccgreen-200 !border" : "!border !border-gray-50"}/>)}
                </div>
                <div className='shrink-0 grow-0'>
                    <Panel.MenuButton title="Create new" className='w-full'/>
                </div>
            </div>
        }
        <div 
            style={showPicker ? {width: `calc(100% - 12rem)`} : {}}
            className="w-full flex flex-col grow-0 max-h-[inherit]">
            <div className='flex overflow-y-scroll flex-col h-full relative'>
                <div key='category_toolbar' className={`flex space-x-3 absolute z-50 left-4 top-4 p-0.5 place-items-start `}>
                    <div key='category_toolbar' className={`flex bg-white rounded-md shadow-lg border-gray-200 border p-0.5 place-items-start `}>
                        <DropdownButton noBorder icon={showViewerPick ? <ChevronLeftIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>} onClick={()=>setShowViewerPick(!showViewerPick)} flat className={`!px-0.5 hover:text-ccgreen-800 hover:shadow-md`}/>
                    </div>
                </div>
                <div key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 top-32 p-1.5 flex flex-col place-items-start space-y-2'>
                    {<DropdownButton noBorder icon={<PlusIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>addElement()} className={`hover:text-ccgreen-800 hover:shadow-md`}/>}
                    {selectedElement && <DropdownButton noBorder icon={<PlusCircleIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>changeFontSize(true)} className={`hover:text-ccgreen-800 hover:shadow-md`}/>}
                    {selectedElement && <DropdownButton noBorder icon={<MinusCircleIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>changeFontSize(false)} className={`hover:text-ccgreen-800 hover:shadow-md`}/>}
                </div>
                <div key='export' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 bottom-4 p-0.5 flex flex-col place-items-start space-y-2'>
                    <DropdownButton noBorder icon={<ArrowUpTrayIcon className='w-5 h-5 '/>} 
                    items={[
                        {'title': "Export to PPTX", icon: <DocumentArrowDownIcon className='w-5 h-5 mx-1'/>, action: ()=> report.current ? report.current.exportToPptx() : undefined },
                    ]} 
                    flat placement='left-end' portal className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                </div>
                {viewerPick && <PrimitiveReport ref={report} primitive={primitive} source={viewerPick} setSelectedElement={setSelectedElement}/>}
                
            </div>
        </div>
    </div>
}