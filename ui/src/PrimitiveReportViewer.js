import HierarchyView from "./HierarchyView"
import MainStore from "./MainStore"
import PrimitiveExplorer from "./PrimitiveExplorer"
import ProximityView from "./ProximityView"
import { PrimitiveCard } from './PrimitiveCard';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import DropdownButton from "./DropdownButton";
import { HeroIcon } from "./HeroIcon";
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, DocumentArrowDownIcon, MinusCircleIcon, PlusCircleIcon, PlusIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { InputPopup } from "./InputPopup";
import Panel from "./Panel";
import PrimitiveReport from "./PrimitiveReport";
import { exportKonvaToPptx } from "./PptHelper";
import pptxgen from "pptxgenjs";
import CollectionUtils from "./CollectionHelper";



export default function PrimtiveReportViewer({primitive, ...props}){
    const [showViewerPick, setShowViewerPick] = useState(true)
    const [selectedElement, realSetSelectedElement] = useState(true)
    const [autoExport, setAutoExport] = useState(undefined)
    const report = useRef()

    const mainstore = MainStore()
    //const list = primitive.task?.primitives.allUniqueQuery

    //const list = [252416,252434,252435].map(d=>mainstore.primitive(d).primitives.uniqueAllItems.filter(d=>d.referenceId===82)).flat()

    const targetResultCategoryId = primitive.referenceParameters?.referenceId ?? primitive.referenceParameters?.resultCategoryId ?? 86
    console.log(`targetResultCategoryId `,targetResultCategoryId )
    let  list = primitive.task?.primitives.descendants.filter(d=>d.referenceId===  targetResultCategoryId).flat()
    
    if( primitive.plainId === 262816){
        list = primitive.task?.primitives.descendants.filter(d=>d.referenceId === 54).flat()
    }
    if( primitive.plainId === 273341){
        list = mainstore.primitive("65cc980a98d8dcc176818703").primitives.allCategory
    }else {
        if( primitive.primitives.params.source?.length> 0 ){
            const source = primitive.primitives.params.source.allItems[0] 
            list = source.itemsForProcessing
        }else{
            const source = primitive.primitives.params.source?.length > 0 ? primitive.primitives.params.source.allItems[0] : primitive.task
            list = source ? source.primitives.descendants.filter(d=>d.referenceId === targetResultCategoryId) : []
        }
    }

    function setSelectedElement(e){
        MainStore().sidebarSelect( e)
        realSetSelectedElement(e)
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

    function exportAll(){
            let pptx = new pptxgen();
            
            let widthInInches = 10 * 4
            let heightInInches = 5.625 * 4
            
            pptx.defineLayout({ name:'VF_CUSTOM', width: widthInInches, height: heightInInches });
            pptx.layout = 'VF_CUSTOM'
            
            
            const count = list.length
            let idx = 0

            setViewerPick( list[idx])
            setAutoExport( {idx: 0, pptx: pptx} )

    }
    useLayoutEffect(()=>{
        async function doExport(){

            if( autoExport.idx < list.length){
                await new Promise(r => setTimeout(r, 2000));                    
                console.log(`EXPORT ${autoExport.idx}`)
                report.current.exportToPptx(autoExport.pptx)
                
                let idx= autoExport.idx + 1
                if( idx < list.length){
                    setViewerPick( list[idx])
                    setAutoExport( {idx: idx, pptx: autoExport.pptx} )
                }else{
                    console.log(`SAVING`)
                    autoExport.pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
                    setAutoExport( undefined )
                }
            }
        }
        if( autoExport && report.current){
            doExport()
        }
    }, [autoExport?.idx])
        
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
                    <Panel.MenuButton title="Export" className='w-full' action={exportAll}/>
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