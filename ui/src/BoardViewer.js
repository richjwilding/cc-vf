import MainStore from "./MainStore"
import { useEffect, useRef, useState } from "react";
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ClipboardDocumentIcon, DocumentArrowDownIcon, FunnelIcon, MagnifyingGlassIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { HeroIcon } from './HeroIcon';
import { InputPopup } from './InputPopup';
import DropdownButton from "./DropdownButton";
import InfiniteCanvas from "./InfiniteCanvas";
import CollectionUtils from "./CollectionHelper";
import { RenderPrimitiveAsKonva, renderMatrix } from "./RenderHelpers";
import HierarchyNavigator from "./HierarchyNavigator";
import PrimitiveConfig from "./PrimitiveConfig";
import FilterPane from "./FilterPane";

export default function BoardViewer({primitive,...props}){
    const mainstore = MainStore()
    const [manualInputPrompt, setManualInputPrompt] = useState(false)
    const canvas = useRef({})
    const myState = useRef({})
    const menu = useRef({})
    const colButton = useRef({})
    const rowButton = useRef({})

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

    //const boards = [279897,290878, 294261, 303071,303073,302434, 303074, 303153].map(d=>mainstore.primitive(d))
    const boards = [...primitive.primitives.allUniqueView, ...primitive.primitives.allUniqueSummary,...primitive.primitives.allUniqueQuery]

    function prepareBoard(d){
        if( d.type === "view" || d.type === "query"){
            const items = d.itemsForProcessing
            const columnAxis = CollectionUtils.primitiveAxis(d, "column")
            const rowAxis = CollectionUtils.primitiveAxis(d, "row")
    
    const baseViewConfigs = [
        {id:0, title:"Show items",parameters: {showAsCounts:false}},
        {id:1, title:"Show counts",parameters: {
            showAsCounts:true,
            "props": {
                "hideDetails": true,
                "showGrid": false,
                showSummary: true,
                columns: 1,
                fixedWidth: '60rem'
            }
        }},
        {id:2, title:"Show segment overview", 
                parameters: {
                    showAsSegment: true,
                    "props": {
                        "hideDetails": true,
                        "showGrid": false,
                        showSummary: true,
                        columns: 1,
                        fixedWidth: '60rem'
                      }

                }
            },
        {id:3, title:"Show as graph", 
                parameters: {
                    showAsGraph: true,

                },
                "props": {
                    columns: 1,
                    fixedWidth: '80rem'
                    }
            }
    ]
            const activeView  = d?.referenceParameters?.explore?.view
            const viewConfigs = items?.[0]?.metadata?.renderConfig?.explore?.configs ?? baseViewConfigs
            const viewConfig = viewConfigs?.[activeView] 

            let viewFilters = d.referenceParameters?.explore?.filters?.map((d2,i)=>CollectionUtils.primitiveAxis(d, i)) ?? []
            let filterApplyColumns = d.referenceParameters?.explore?.axis?.column?.filter ?? []
            let filterApplyRows = d.referenceParameters?.explore?.axis?.row?.filter ?? []
            let hideNull = d.referenceParameters?.explore?.hideNull
            let viewPivot = d.referenceParameters?.explore?.viewPivot

            let liveFilters = d.primitives.allUniqueCategory.filter(d=>d.referenceId === PrimitiveConfig.Constants["LIVE_FILTER"]).map(d=>{
                return {
                    type: "category",
                    primitiveId: d.id,
                    category: d,
                    isLive: true,
                    title: `Category: ${d.title}`                
                }
            })
            
            let {data, extents} = CollectionUtils.mapCollectionByAxis( items, columnAxis, rowAxis, viewFilters, liveFilters, viewPivot )
            console.log(data)

            let filtered = CollectionUtils.filterCollectionAndAxis( data, [
                {field: "column", exclude: filterApplyColumns},
                {field: "row", exclude: filterApplyRows},
                ...viewFilters.map((d,i)=>{
                    return {field: `filterGroup${i}`, exclude: d.filter}
                })
            ], {columns: extents.column, rows: extents.row, hideNull})
                        
            myState[d.id].primitive = d
            myState[d.id].list = filtered.data
            myState[d.id].axis = {column: columnAxis, row: rowAxis}
            myState[d.id].columns = filtered.columns
            myState[d.id].viewConfig = viewConfig
            myState[d.id].rows = filtered.rows
            myState[d.id].extents = extents
            myState[d.id].toggles = Object.keys(extents).reduce((a,c)=>{
                                                                    if(c.match(/liveFilter/)){
                                                                        a[c] = extents[c]
                                                                    }
                                                                    return a}, {})
        }else if( d.type === "summary" ){
            myState[d.id].primitive = d
            myState[d.id].list = [{column: undefined, row: undefined, primitive: d}]
            myState[d.id].columns = [{idx: undefined, label: ''}]
            myState[d.id].rows = [{idx: undefined, label: ''}]
            myState[d.id].config = "full"
            myState[d.id].extents = {
                columns: [{idx: undefined, label: ''}],
                row:[{idx: undefined, label: ''}]
            }
            myState[d.id].toggles = {}
        }


    }

    for(const d of boards){
        if(!myState[d.id] ){
            myState[d.id] = {id: d.id}
            prepareBoard(d)
        }
    }

    let selectedColIdx = 0
    let selectedRowIdx = 0
    let showPane = 0
    let colFilter = 0
    let rowFilter = 0

    function setShowPane(){}
    async function updateAxis(axisName, axis){
        if( myState?.activeBoard ){
            hideMenu()
            await CollectionUtils.setPrimitiveAxis(myState?.activeBoard.primitive, axis, axisName)
            prepareBoard( myState?.activeBoard.primitive )
            canvas.current.refreshFrame( myState.activeBoardId, renderView(myState.activeBoard))
        }
    }

    let boardUpdateTimer

    function setActiveBoard(e){
        const id = e?.[0]
        myState.activeBoardId = id
        if( id ){
            myState.activeBoard = myState[id]
            if( !myState[id].axisOptions ){
                const source = myState[id].primitive
                myState[id].axisOptions = CollectionUtils.axisFromCollection( source.itemsForProcessing, source,  source.referenceParameters?.explore?.hideNull)
            }
            handleViewChange(true)

        }else{
            myState.activeBoard = undefined
            hideMenu()
        }
    }

    function menuSide(){
        return myState.menuSide
    }

    function getAxisId(axis){
        if( !myState?.activeBoard ){
            return undefined
        }
        return CollectionUtils.findAxisItem( myState?.activeBoard.primitive, axis, myState?.activeBoard.axisOptions )
    }
    function getAxisOptions(){
        return myState?.activeBoard?.axisOptions ?? []
    }

    function updateMenuPosition(boardScreenPosition){
        if(myState.activeBoard){
            const vSize = canvas.current.size()
            const buffer = 80
            const offset = 10
            const roomOnLeft = boardScreenPosition.l > buffer
            const roomOnRight = boardScreenPosition.r < (vSize[0] - buffer)

            if( roomOnLeft ){
                menu.current.style.left = parseInt( boardScreenPosition.l - buffer + offset) + "px"
                myState.menuSide = boardScreenPosition.l > 400 ? "left" : "right"
            }else if( roomOnRight ){
                menu.current.style.left = parseInt( boardScreenPosition.r + offset) + "px"
                myState.menuSide = "left"
            }else{
                menu.current.style.left = offset + "px"
                myState.menuSide = "right"
            }

            const menuHeight = menu.current.offsetHeight

            let tc =Math.max(boardScreenPosition.t, 0)
            let bc =Math.min(boardScreenPosition.b, vSize[1])
            let top = (((bc - tc) / 2) - (menuHeight / 2)) + tc
            if( top < 0){
                top = offset
            }else if((top + menuHeight) + buffer > vSize[1]){
                top = vSize[1] - offset - menuHeight
            }
            menu.current.style.top = top + "px"
        }

    }
    function hideMenu(){
        if( menu.current ){
            menu.current.style.visibility = "hidden"
        }
    }
    function handleViewWillChange(e){
        hideMenu()
    }
    function handleViewChange(instant = false){
        if( canvas.current ){
            if(myState.activeBoard){
                if( boardUpdateTimer ){
                    clearTimeout( boardUpdateTimer )
                }
                boardUpdateTimer = setTimeout(()=>{
                    updateMenuPosition(canvas.current.framePosition(myState.activeBoardId)?.viewport )
                    if( menu.current ){
                        menu.current.style.visibility = "unset"
                        rowButton.current?.refocus()
                        colButton.current?.refocus()
                    }
                }, instant ? 0 : 300)
            }
        }
    }

    function renderView(d){
        const view = myState[d.id]
        if( view.config === "full"){
            return {id: d.id, title: `${d.title} - #${d.plainId}`, items: (stageOptions)=>RenderPrimitiveAsKonva(view.primitive, stageOptions)}
        }

        return {id: d.id, title: `${d.title} - #${d.plainId}`, items: (stageOptions)=>renderMatrix(
            d, 
            view.list, {
                axis: view.axis,
                columnExtents: view.columns,
                rowExtents: view.rows,
                viewConfig: view.viewConfig,
                ...stageOptions,
                toggles: view.toggles
            })
        }

    }

    return <>
        {manualInputPrompt && <InputPopup key='input' cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
        {<div ref={menu} key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 p-1.5 flex flex-col place-items-start space-y-2 invisible'>
            <HierarchyNavigator ref={colButton} noBorder align={()=>menuSide()} icon={<HeroIcon icon='Columns' className='w-5 h-5 '/>} items={()=>CollectionUtils.axisToHierarchy(getAxisOptions())} flat placement='left-start' portal showTick selectedItemId={()=>getAxisId("column")} action={(d)=>updateAxis("column", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedColIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>
            <HierarchyNavigator ref={rowButton} noBorder align={()=>menuSide()} icon={<HeroIcon icon='Rows' className='w-5 h-5 '/>} items={()=>CollectionUtils.axisToHierarchy(getAxisOptions())} flat placement='left-start' portal showTick selectedItemId={()=>getAxisId("row")} action={(d)=>updateAxis("row", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedRowIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>
            <DropdownButton noBorder icon={<FunnelIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>showPane === "filter" ? setShowPane(false) : setShowPane("filter")} className={`hover:text-ccgreen-800 hover:shadow-md ${rowFilter || colFilter ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>
        </div>}
        <div className={`w-full flex min-h-[40vh] h-full rounded-md`} style={{background:"#fdfdfd"}}>
            <InfiniteCanvas 
                            primitive={primitive}
                            board
                            background="#fdfdfd"
                            ref={canvas}
                            ignoreAfterDrag={false}
                            highlights={{
                                "primitive":"border",
                                "cell":"background"
                            }}
                            rerender={(frame, primitiveId)=>{
                                const prim = MainStore().primitive(primitiveId)
                                return RenderPrimitiveAsKonva( primitive)
                            }}
                            enableFrameSelection
                            callbacks={{
                                viewportWillMove:handleViewWillChange,
                                viewportCallback:handleViewChange,
                                frameMove: (d)=>{
                                    const prim = MainStore().primitive(d.id)
                                    if(prim){
                                        primitive.setField(`frames.${prim.id}`, {x: d.x, y: d.y, s: d.s})
                                    }
                                },
                                onClick:{
                                    frame: (id)=>setActiveBoard(id),
                                    primitive:(id)=>mainstore.sidebarSelect(id)
                                },
                                onToggle:async (primitiveId, toggle, frameId)=>{
                                    console.log(`Will toggle ${toggle} on ${primitiveId} for frame ${frameId}`)
                                    if( toggle && primitiveId && myState[frameId]){
                                        const axisValue = myState[frameId].extents[toggle].filter(d=>d.idx !== "_N_")?.[0]
                                        const target = mainstore.primitive(primitiveId)
                                        const category = mainstore.primitive(axisValue.idx)
                                        if( target && category ){
                                            let result 
                                            const currentState = target.parentPrimitiveIds.includes(category.id)
                                            if( currentState ){
                                                await category.removeRelationship(target,"ref")
                                                result = false
                                            }else{
                                                await category.addRelationship(target,"ref")
                                                result = true
                                            }

                                            for(const targetBoard of boards){
                                                if( targetBoard.id !== frameId){
                                                    prepareBoard( targetBoard )
                                                    canvas.current.refreshFrame( targetBoard.id, renderView(targetBoard))
                                                }
                                            }
                                            return result
                                            
                                        }
                                    }
                                },
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
                            render={boards.map(d=>renderView(d))}
                />
            {false && <div className="flex flex-col w-[36rem] h-full justify-stretch space-y-1 grow border-l p-3">
                <FilterPane/>
            </div>}
            
    </div>
    </>
}