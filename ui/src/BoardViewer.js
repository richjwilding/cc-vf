import MainStore from "./MainStore"
import {PrimitiveTable} from './PrimitiveTable';
import CardGrid from './CardGrid';
import GoogleHelper from './GoogleHelper';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Panel from './Panel';
import { useEffect, useRef, useState } from "react";
import { ArrowLeftCircleIcon, ArrowPathIcon, ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, ListBulletIcon, MinusCircleIcon, PencilIcon, PlayIcon, PlusCircleIcon, PlusIcon, RectangleGroupIcon, TableCellsIcon, TrashIcon } from '@heroicons/react/24/outline';
import { PrimitiveCard } from "./PrimitiveCard";
import { InputPopup } from './InputPopup';
import ViewBase from "./ViewBase";
import DropdownButton from "./DropdownButton";
import InfiniteCanvas from "./InfiniteCanvas";
import PrimitiveExplorer from "./PrimitiveExplorer";
import CollectionUtils from "./CollectionHelper";
import { renderMatrix } from "./RenderHelpers";

export default function BoardViewer({primitive,...props}){
    const mainstore = MainStore()
    const [manualInputPrompt, setManualInputPrompt] = useState(false)
    const canvas = useRef({})
    const myState = useRef({})

    const list = primitive.primitives.allUniqueView

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

    const boards = [292703, 292901, 292902].map(d=>mainstore.primitive(d))

    for(const d of boards){
        console.log(d.id)
        if(!myState[d.id] ){
            myState[d.id] = {}
            const items = d.itemsForProcessing
            const columnAxis = CollectionUtils.primitiveAxis(d, "column")
            const rowAxis = CollectionUtils.primitiveAxis(d, "row")

            let viewFilters = d.referenceParameters?.explore?.filters?.map(d2=>CollectionUtils.primitiveAxis(d, d2.track)) ?? []
            console.log(viewFilters)
            let filterApplyColumns = d.referenceParameters?.explore?.axis?.column?.filter ?? []
            let filterApplyRows = d.referenceParameters?.explore?.axis?.row?.filter ?? []
            let hideNull = false
            let viewPivot = d.referenceParameters?.explore?.viewPivot
            
            let {data, extents} = CollectionUtils.mapCollectionByAxis( items, columnAxis, rowAxis, viewFilters, viewPivot )

            let filtered = CollectionUtils.filterCollectionAndAxis( data, [
                {field: "column", exclude: filterApplyColumns},
                {field: "row", exclude: filterApplyRows},
                ...viewFilters.map((d,i)=>{
                    return {field: `filterGroup${i}`, exclude: d.filter}
                })
            ], {columns: extents.column, rows: extents.row, hideNull})
                        
            myState[d.id].list = filtered.data
            myState[d.id].columns = filtered.columns
            myState[d.id].rows = filtered.rows
        }
    }

    return <>
        {manualInputPrompt && <InputPopup key='input' cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
        <div className={`w-full flex min-h-[40vh] h-full rounded-md`} style={{background:"#fdfdfd"}}>
            <InfiniteCanvas 
                            primitive={primitive}
                            board
                            background="#fdfdfd"
                            ref={canvas}
                            highlights={{
                                "primitive":"border",
                                "cell":"background"
                            }}
                            callbacks={{
                                frameMove: (d)=>{
                                    const prim = MainStore().primitive(d.id)
                                    if(prim){
                                        primitive.setField(`frames.${prim.id}`, {x: d.x, y: d.y})
                                    }
                                }
                            }}
                            selectable={{
                                "frame":{
                                    multiple: false
                                },
                                "primitive":{
                                    multiple: false
                                },
                                "cell":{
                                    multiple: true
                                }
                            }}
                            render={boards.map(d=>{
                                const view = myState[d.id]
                                return {id: d.id, title: `${d.title} - #${d.plainId}`, items: (stageOptions)=>renderMatrix(
                                    d, 
                                    view.list, {
                                        columnExtents: view.columns,
                                        rowExtents: view.rows, 
                                        ...stageOptions
                                    })
                                }
                            })}
                />
                <div key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 top-32 p-1.5 flex flex-col place-items-start space-y-2'>
                    {<DropdownButton noBorder icon={<PlusIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>{}} className={`hover:text-ccgreen-800 hover:shadow-md`}/>}
                    {<DropdownButton noBorder icon={<PlusCircleIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>{}} className={`hover:text-ccgreen-800 hover:shadow-md`}/>}
                    {<DropdownButton noBorder icon={<MinusCircleIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>{}} className={`hover:text-ccgreen-800 hover:shadow-md`}/>}
                </div>
    </div>
    </>
}