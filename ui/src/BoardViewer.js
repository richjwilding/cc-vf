import MainStore from "./MainStore"
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ClipboardDocumentIcon, DocumentArrowDownIcon, FunnelIcon, MagnifyingGlassIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { HeroIcon } from './HeroIcon';
import { InputPopup } from './InputPopup';
import DropdownButton from "./DropdownButton";
import InfiniteCanvas from "./InfiniteCanvas";
import CollectionUtils from "./CollectionHelper";
import { RenderPrimitiveAsKonva, renderMatrix } from "./RenderHelpers";
import HierarchyNavigator from "./HierarchyNavigator";
import PrimitiveConfig from "./PrimitiveConfig";
import FilterPane from "./FilterPane";
import CollectionInfoPane from "./CollectionInfoPane";
import useDataEvent from "./CustomHook";

export default function BoardViewer({primitive,...props}){
    const mainstore = MainStore()
    const [manualInputPrompt, setManualInputPrompt] = useState(false)
    const [collectionPaneInfo, setCollectionPaneInfo] = useState(false)
    const canvas = useRef({})
    const myState = useRef({})
    const menu = useRef({})
    const colButton = useRef({})
    const rowButton = useRef({})
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [updateLinks, forceUpdateLinks] = useReducer( (x)=>x+1, 0)

    useDataEvent("relationship_update set_parameter set_field delete_primitive", undefined, (ids, event, info)=>{
        if( myState.current.watchList  ){
            myState.current.framesToUpdate = myState.current.framesToUpdate || []
            let needRefresh = true
            Object.keys(myState.current.watchList).forEach(frameId=>{
                let checkIds = ids
                if( myState.current.watchList[frameId].filter(d=>checkIds.includes(d)).length > 0 ){

                    if( event === "set_field"){
                        if( info.match(/processing.ai/)){
                            const board = myState[frameId]
                            canvas.current.refreshFrame( board.id, renderView(board.primitive))
                        }else if(info.startsWith('procesing.') || info.startsWith('embed_')){
                            needRefresh = false
                        }
                    }
                    if( event === "relationship_update"){
                        needRefresh = prepareBoard( myState[frameId].primitive )
                        if( !needRefresh){
                            console.log(`Cancelled refresh - no changes on ${myState[frameId]?.primitive.plainId}`)
                        }
                    }

                    if( needRefresh ){
                        console.log("Need to update ", frameId, event, info)
                        
                        if( !myState.current.framesToUpdate.includes(frameId)){
                            myState.current.framesToUpdate.push(frameId)
                        }
                        
                        if( !myState.current.frameUpdateTimer ){
                            myState.current.frameUpdateTimer = setTimeout(()=>{
                                myState.current.frameUpdateTimer = undefined
                                for( const frameId of  myState.current.framesToUpdate){
                                    console.log(`DOING REFRESH ${frameId} / ${myState[frameId]?.primitive.plainId}`)
                                    canvas.current.refreshFrame( frameId )
                                }
                                myState.current.framesToUpdate = []
                            }, 220)
                        }
                    }
                }
            })
        }
        return false
    })

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

    function updateWatchList(frameId, ids){
        myState.current.watchList = myState.current.watchList || {}
        myState.current.watchList[frameId] = [frameId, ...(myState[frameId].internalWatchIds ?? [] ),...ids]
    }

    useEffect(() => {
        const overlay = menu.current;
    
        const preventDefault = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        };
    
        overlay.addEventListener('wheel', preventDefault, { passive: false });
        //overlay.addEventListener('touchstart', preventDefault, { passive: false });
        //overlay.addEventListener('touchmove', preventDefault, { passive: false });
    
        return () => {
          overlay.removeEventListener('wheel', preventDefault);
          //overlay.removeEventListener('touchstart', preventDefault);
          //overlay.removeEventListener('touchmove', preventDefault);
        };
      }, [menu.current]);
    

    const action = primitive.metadata?.actions?.find(d=>d.key === "build_generic_view")


    async function cloneBoard(){
        if(myState.activeBoard){
            const p = myState.activeBoard.primitive
            if( p.type === "view" || p.type === "query"){
                console.log("adding")
                const newPrimitive = await mainstore.createPrimitive({
                    parent: primitive, 
                    title: `Copy of ${p.title}`,
                    type: p.type,
                    workspaceId: p.workspaceId, 
                    categoryId: p.referenceId, 
                    referenceParameters: p.referenceParameters
                })
                
                if(newPrimitive ){
                    for(const imp of p.primitives.imports.allItems){
                        await newPrimitive.addRelationshipAndWait(imp, "imports")
                    }
                    for(const imp of p.primitives.axis.row.allItems){
                        await newPrimitive.addRelationshipAndWait(imp, "axis.row")
                    }
                    for(const imp of p.primitives.axis.column.allItems){
                        await newPrimitive.addRelationshipAndWait(imp, "axis.column")
                    }
                }        

                let position = canvas.current.framePosition(p.id)?.scene
                console.log("now to canvas")
                addBoardToCanvas( newPrimitive, {x:position.l, y: position.b + 30, s: position.s})
                console.log("done")
            }
        }
    }

    function prepareBoard(d){
        let didChange = false
        if( d.type === "view" || d.type === "query"){
            const items = d.itemsForProcessing
            const columnAxis = CollectionUtils.primitiveAxis(d, "column")
            const rowAxis = CollectionUtils.primitiveAxis(d, "row")
    
            const activeView  = d?.referenceParameters?.explore?.view
            const viewConfigs = CollectionUtils.viewConfigs(items?.[0]?.metadata)
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

            let filtered = CollectionUtils.filterCollectionAndAxis( data, [
                {field: "column", exclude: filterApplyColumns},
                {field: "row", exclude: filterApplyRows},
                ...viewFilters.map((d,i)=>{
                    return {field: `filterGroup${i}`, exclude: d.filter}
                })
            ], {columns: extents.column, rows: extents.row, hideNull})

            if( myState[d.id].list ){
                const changes = myState[d.id].list.some((d,i)=>{
                    const n = filtered.data[i]
                    if( !n ){
                        return true
                    }
                    if( n?.primitive?.id !== d.primitive?.id ){
                        return true
                    }
                    if( ([n.column].flat()).map(d=>d?.idx ?? d).join("-") != ([d.column].flat()).map(d=>d?.idx ?? d).join("-")){
                        return true
                    }
                    if( ([n.row].flat()).map(d=>d?.idx ?? d).join("-") != ([d.row].flat()).map(d=>d?.idx ?? d).join("-")){
                        return true
                    }
                    return false
                })
                didChange = changes
            }
                        
            myState[d.id].primitive = d
            myState[d.id].list = filtered.data
            myState[d.id].internalWatchIds = filtered.data.map(d=>d.primitive.parentPrimitiveIds).flat(Infinity).filter((d,i,a)=>a.indexOf(d)===i)
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
        return didChange
    }


    const [boards,  renderedSet] = useMemo(()=>{
        const boards = [...primitive.primitives.allUniqueView, ...primitive.primitives.allUniqueSummary,...primitive.primitives.allUniqueQuery]
        
        for(const d of boards){
            if(!myState[d.id] ){
                myState[d.id] = {id: d.id}
                prepareBoard(d)
            }
        }
        const renderedSet = boards.map(d=>renderView(d))
        return [boards, renderedSet]
    }, [primitive?.id, update])
        

    const linkList = useMemo(()=>{
        console.log(`redo linklist ${updateLinks}`)
        return boards.map(left=>{
            return boards.map(right=>{
                if( left.id !== right.id){
                    let segment
                    if( right.parentPrimitiveIds.includes(left.id) ){
                        return {left: left.id, right: right.id}
                    }else{
                        const route = right.findImportRoute(left.id)
                        if( route.length > 0){
                            return {left: left.id, right: right.id}
                        }else{
                            if( right.type === "query" || right.type === "summary"){
                                const segmentSummaries = left.primitives.origin.allUniqueSegment.map(d=>[...d.primitives.origin.allUniqueSummary, ...d.primitives.origin.allUniqueQuery] ).flat()
                                console.log(left.plainId, segmentSummaries.map(d=>d.plainId))
                                if(segmentSummaries.map(d=>d.id).includes( right.id)){
                                    const out = []
                                    let added = false
                                    myState[left.id].columns.forEach((column,cIdx)=>{
                                        myState[left.id].rows.forEach((row,rIdx)=>{
                                            const filter = [
                                                    PrimitiveConfig.encodeExploreFilter( myState[left.id].axis.column, column ),
                                                    PrimitiveConfig.encodeExploreFilter( myState[left.id].axis.row, row ),
                                                ].filter(d=>d)
                                            
                                            if( right.origin.doesImport(left.id, filter)){
                                                out.push( {left: left.id, cell: `${cIdx}-${rIdx}`, right: right.id})
                                                added = true
                                            }
                                        })
                                    })
                                    if( !added ){
                                        out.push( {left: left.id, right: right.id})
                                    }
                                    return out
                                }
                            }
                        }
                        
                    }
                }
            }).flat(Infinity)
        }).flat().filter(d=>d)
    }, [primitive?.id, update, updateLinks])

    console.log("LINKLIST", linkList)
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
            forceUpdateLinks()
            canvas.current.refreshFrame( myState.activeBoardId )
        }
    }
    async function updateExtents(board){
        const isActive = myState?.activeBoardId === board.id
        if( isActive ){
            hideMenu()
        }
        
        prepareBoard( board )
        forceUpdateLinks()

        if( isActive ){
            canvas.current.refreshFrame( myState.activeBoardId )
        }
    }

    let boardUpdateTimer

    function resizeFrame(fId, width, height){
        const board = myState[fId]
        if( width ){
            primitive.setField(`frames.${fId}.width`, width)
        }
        if( height ){
            primitive.setField(`frames.${fId}.height`, height)
        }
        canvas.current.refreshFrame( board.id, renderView(board.primitive))
    }

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
            //mainstore.sidebarSelect(id)
            setCollectionPaneInfo({frame: myState.activeBoard.primitive, board: primitive})
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

    function addBoardToCanvas( d, position ){
        myState[d.id] = {id: d.id}
        prepareBoard( d )

        if( position ){
            primitive.setField(`frames.${d.id}`, {x: position.x, y: position.y, s: position.s})
        }

        canvas.current.addFrame( renderView(d))
        forceUpdate()
    }

    function addExistingView(){
        let items = mainstore.primitives().filter(d=>d.workspaceId === primitive.workspaceId && ["working","view","query"].includes(d.type))

        const activeBoardIds = Object.keys(myState)
        items = items.filter(d=>!activeBoardIds.includes(d.id))

        mainstore.globalPicker({
            list: items,
            callback: (d)=>{
                primitive.addRelationship(d, "ref")
                let position = canvas.current.framePosition(myState.activeBoardId)?.scene ?? {r: 0, t: 0, s: 1}
                addBoardToCanvas( d, {x: position.r +50, y: position.t, s: position.s})
                return true
            }

        })
    }
    function pickBoardDescendant(){
        if(myState.activeBoard){
            let importedSet = myState.activeBoard.primitive.importedBy.map(d=>[d.primitives.origin.allUniqueQuery, d.primitives.origin.allUniqueView]).flat(Infinity)
            let summaries = [...myState.activeBoard.primitive.primitives.origin.allUniqueSummary, ...myState.activeBoard.primitive.primitives.origin.allUniqueSegment.map(d=>d.primitives.allUniqueSummary).flat(), ...myState.activeBoard.primitive.primitives.origin.allUniqueSegment.map(d=>d.primitives.allUniqueQuery).flat()]
            let items = [...summaries,...myState.activeBoard.primitive.primitives.origin.allUniqueQuery, ...myState.activeBoard.primitive.primitives.origin.allUniqueView, ...importedSet]

            const activeBoardIds = Object.keys(myState)
            items = items.filter(d=>!activeBoardIds.includes(d.id))

            mainstore.globalPicker({
                list: items,
                callback: (d)=>{
                    primitive.addRelationship(d, "ref")
                    let position = canvas.current.framePosition(myState.activeBoardId)?.scene
                    addBoardToCanvas( d, {x:position.r +50, y: position.t, s: position.s})
                }

            })

        }        
    }
    function removeBoard(){
        if(myState.activeBoard){
            let title = "Remove from board?"
            let action = ()=>primitive.removeRelationship(myState.activeBoard.primitive, "ref")

            if( myState.activeBoard.primitive.origin.id === primitive.id){
                title = `Delete ${myState.activeBoard.primitive.displayType}?`
                action = ()=>mainstore.removePrimitive( myState.activeBoard.primitive )

            }
            mainstore.promptDelete({
                title: "Confirmation",
                prompt: title,
                handleDelete: ()=>{
                    action()                        
                    hideMenu()
                    canvas.current.removeFrame( myState.activeBoard.id )
                    delete myState[myState.activeBoard.id]
                    myState.activeBoard = undefined
                    forceUpdate()
                    return true
                }
            })
        }
    }

    function renderView(d){
        const view = myState[d.id]
        const renderOptions = {}
        const configNames = ["width", "height"]


        const mapMatrix = (stageOptions, d, view)=>renderMatrix(
            d, 
            view.list, {
                axis: view.axis,
                columnExtents: view.columns,
                rowExtents: view.rows,
                viewConfig: view.viewConfig,
                ...stageOptions,
                ...renderOptions,
                toggles: view.toggles,
                expand: Object.keys(primitive.frames[ d.id ]?.expand ?? {})
            })

        if( primitive.frames?.[d.id]){
            for( const name of configNames){
                if( primitive.frames[d.id][name] !== undefined){
                    renderOptions[name] = primitive.frames[d.id][name]
                }
            }
        }
        console.log(renderOptions)
        if( view.config === "full"){
            let render = (stageOptions)=>RenderPrimitiveAsKonva(view.primitive, {...stageOptions, ...renderOptions})
            if( d.referenceId === 118){
                const boardToCombine = d.primitives.imports.allItems
                if( boardToCombine.length >0 ){

                    render = (stageOptions)=>{
                        const partials = boardToCombine.map(d=>mapMatrix(stageOptions, d, myState[d.id]))
                        console.log("DID PARTIALS",partials)
                        return RenderPrimitiveAsKonva(view.primitive, {...stageOptions, ...renderOptions, partials})
                    }
                }
            }
            return {id: d.id, title: ()=>`${d.title} - #${d.plainId}`, canChangeSize: "width", canvasMargin: [20,20,20,20], items: render}
        }
        if( d.type === "query" && d.processing?.ai?.data_query){
            return {id: d.id, title: ()=>`${d.title} - #${d.plainId}`, canChangeSize: true, canvasMargin: [20,20,20,20], items: (stageOptions)=>RenderPrimitiveAsKonva(view.primitive, {config: "ai_processing",...stageOptions, ...renderOptions})}
        }

        const canChangeSize = view?.viewConfig?.resizable 

        return {id: d.id, title: ()=>`${d.title} - #${d.plainId}`, canChangeSize, items: (stageOptions)=>mapMatrix(stageOptions, d,view)}

    }

    async function addBlankView(cat_or_id = 38, importId, filter, options = {}){
        const category = typeof(cat_or_id) === "number" ? mainstore.category(cat_or_id) : cat_or_id
        const newPrimitive = await mainstore.createPrimitive({
            title: `New ${category.primitiveType}`,
            categoryId: category.id,
            type: category.primitiveType,
            referenceParameters: {
                ...(importId ? {target: "items", importConfig: [{id: importId, filters: filter}]} : {}),
                target: "items",
                ...options,
            },
            parent: primitive,
        })
        if( newPrimitive ){
            if(importId){
                await newPrimitive.addRelationshipAndWait( mainstore.primitive(importId), "imports")
            }
            primitive.addRelationship(newPrimitive, "ref")

            let position = (importId ? canvas.current.framePosition(importId)?.scene : undefined) ?? {r:0, t: 0, s: 1}
            addBoardToCanvas( newPrimitive, {x:position.r + 50, y: position.t, s: position.s})
        }
    }

    function newView(referenceCategoryId){
        let items = mainstore.primitives().filter(d=>d.workspaceId === primitive.workspaceId && ["activity"].includes(d.type))
            
        mainstore.globalPicker({
            list: items,
            callback: (d)=>{

                mainstore.globalNewPrimitive({
                    title: "New view",
                    type: ["view", "query"],
                    originTask: d,
                    parent: primitive,
                    callback:(d)=>{
                        addBoardToCanvas( d, {x:0, y: 0, s: 1})
                        return true
                    }
                })
            }

        })

    }
    async function createNewQuery( parent, data ){

        const addAsChild = parent.type === "query"
        console.log(data)

        const queryData = data?.target ?? data
        const importData = data?.importConfig 


        await mainstore.doPrimitiveAction( parent, "new_query", {queryData, importData},async (result)=>{
            if( result ){
                const newPrimitive = await MainStore().waitForPrimitive( result.primitiveId )
                let position = canvas.current.framePosition(parent.id)?.scene
                await primitive.addRelationshipAndWait(newPrimitive, "ref")
                addBoardToCanvas( newPrimitive, {x:position.r +50, y: position.t, s: position.s})
            }
        })


        /*
        if( importData ){
            const segmentData = {
                type: "segment",
                parent: parent,
                referenceParameters: {
                    importConfig: importData
                },
                workspaceId: parent.workspaceId
            }
            interimSegment = await MainStore().createPrimitive(segmentData)
            await interimSegment.addRelationshipAndWait( parent, "imports")
        }

        const newPrimitiveData = {
            ...queryData,
            parent: interimSegment ?? parent,
            workspaceId: primitive.workspaceId,
            referenceParameters: interimSegment ? {"target":"items"} : undefined
        }

        const newPrimitive = await MainStore().createPrimitive(newPrimitiveData)
        if( newPrimitive ){
            let position = canvas.current.framePosition(parent.id)?.scene
            await primitive.addRelationshipAndWait(newPrimitive, "ref")
            if( interimSegment ){
                await newPrimitive.addRelationshipAndWait(interimSegment, "imports")
            }
            addBoardToCanvas( newPrimitive, {x:position.r +50, y: position.t, s: position.s})
        }*/
    }
    function findSpace(){
        return {x:0, y:0, s:1}
    }
    function pickNewItem(){
       // addBlankView()
        mainstore.globalNewPrimitive({
            title: "Add to board",
            categoryId: [38, 117, 81, 118],
            parent: primitive,
            callback:(d)=>{
                addBoardToCanvas( d, findSpace())
                return true
            }
        })
    }

    function newDescendView(){
        if(myState.activeBoard){
            const addAsChild = myState.activeBoard.primitive.type === "query"
            mainstore.globalNewPrimitive({
                title: "New view",
                type: ["view", "query"],
                originTask: myState.activeBoard.primitive,
                parent: addAsChild ? myState.activeBoard.primitive : primitive,
                callback:(d)=>{
                    let position = canvas.current.framePosition(myState.activeBoardId)?.scene
                    if( addAsChild ){
                        primitive.addRelationship(d, "ref")
                    }
                    addBoardToCanvas( d, {x:position.r + 50, y: position.t, s: position.s})
                    return true
                }
            })
        }
    }

    return <>
        {manualInputPrompt && <InputPopup key='input' cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
        <div key='toolbar3' className='overflow-hidden max-h-[80vh] bg-white rounded-md shadow-lg border-gray-200 border absolute right-4 top-4 z-50 flex flex-col place-items-start divide-y divide-gray-200'>
            <div className='p-3 flex place-items-start space-x-2 '>
                    <DropdownButton noBorder icon={<HeroIcon icon='FAPickView' className='w-6 h-6 mr-1.5'/>} onClick={addExistingView} flat placement='left-start' />
                    <DropdownButton noBorder icon={<PlusIcon className='w-6 h-6 mr-1.5'/>} onClick={pickNewItem} flat placement='left-start' />
                    <DropdownButton noBorder icon={<HeroIcon icon='FAAddView' className='w-6 h-6 mr-1.5'/>} onClick={newView} flat placement='left-start' />
                    {collectionPaneInfo && <DropdownButton noBorder icon={<HeroIcon icon='FAAddChildNode' className='w-6 h-6 mr-1.5'/>} onClick={pickBoardDescendant} flat placement='left-start' />}
            </div>
            {collectionPaneInfo && <div className='pt-2 overflow-y-scroll'>
                <CollectionInfoPane {...collectionPaneInfo} newPrimitiveCallback={createNewQuery} createNewView={addBlankView} updateFrameExtents={updateExtents}/>
            </div>}
        </div>
        {<div ref={menu} key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 p-1.5 flex flex-col place-items-start space-y-2 invisible'>
            <HierarchyNavigator ref={colButton} noBorder align={()=>menuSide()} icon={<HeroIcon icon='Columns' className='w-5 h-5 '/>} items={()=>CollectionUtils.axisToHierarchy(getAxisOptions())} flat placement='left-start' portal showTick selectedItemId={()=>getAxisId("column")} action={(d)=>updateAxis("column", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedColIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>
            <HierarchyNavigator ref={rowButton} noBorder align={()=>menuSide()} icon={<HeroIcon icon='Rows' className='w-5 h-5 '/>} items={()=>CollectionUtils.axisToHierarchy(getAxisOptions())} flat placement='left-start' portal showTick selectedItemId={()=>getAxisId("row")} action={(d)=>updateAxis("row", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedRowIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>
            <DropdownButton noBorder icon={<HeroIcon icon='FAAddChildNode' className='w-5 h-5'/>} onClick={pickBoardDescendant} flat placement='left-start' />
            <DropdownButton noBorder icon={<HeroIcon icon='FAClearRectangle' className='w-5 h-5'/>} onClick={removeBoard} flat placement='left-start' />
            {myState.activeBoard && ["query","view"].includes(myState.activeBoard.primitive.type) && <DropdownButton noBorder icon={<HeroIcon icon='FACloneRectangle' className='w-5 h-5'/>} onClick={cloneBoard} flat placement='left-start' />}
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
                                "cell":"background",
                                "widget":"background"
                            }}
                            rerender={(frame, primitiveId)=>{
                                const prim = MainStore().primitive(primitiveId)
                                return RenderPrimitiveAsKonva( primitive)
                            }}
                            enableFrameSelection
                            updateWatchList={updateWatchList}
                            callbacks={{
                                resizeFrame,
                                viewportWillMove:handleViewWillChange,
                                viewportCallback:handleViewChange,
                                frameMove: (d)=>{
                                    const prim = MainStore().primitive(d.id)
                                    if(prim){
                                        const expand = primitive.frames?.[d.id]?.expand ?? {}
                                        const width = primitive.frames?.[d.id]?.width
                                        primitive.setField(`frames.${d.id}`, {x: d.x, y: d.y, s: d.s, width, expand })
                                    }
                                },
                                onClick:{
                                    frame: (id)=>setActiveBoard(id),
                                    primitive:(id)=>mainstore.sidebarSelect(id),
                                    //primitive:(id)=>setCollectionPaneInfo({primitive: mainstore.primitive(id)}),
                                    //canvas:(id)=>mainstore.sidebarSelect(),
                                    canvas:(id)=>setCollectionPaneInfo(),
                                    cell:(id, frameId)=>{
                                        const cell = id?.[0]
                                        if( cell ){
                                            const [cIdx,rIdx] = cell.split("-")

                                            let infoPane = {
                                                filters: [
                                                    PrimitiveConfig.encodeExploreFilter( myState[frameId].axis.column, myState[frameId].columns[cIdx] ),
                                                    PrimitiveConfig.encodeExploreFilter( myState[frameId].axis.row, myState[frameId].rows[rIdx] ),
                                                ].filter(d=>d)
                                            }
                                            console.log(infoPane.filters[0])
                                            //MainStore().sidebarSelect( frameId, {infoPane: infoPane})
                                            setCollectionPaneInfo({frame: mainstore.primitive(frameId), board: primitive, filters: infoPane.filters})
                                        }
                                    },
                                    widget:{
                                        show_extra:(d,frameId)=>{
                                            const cellId = d.attrs.id
                                            const [cIdx,rIdx] = cellId.split("-")
                                            console.log(`Toggle extra of ${frameId} / ${cellId}`)
                                            const mappedColumn = myState[frameId].columns[cIdx] 
                                            const mappedRow = myState[frameId].rows[rIdx] 
                                            const current = primitive.frames?.[frameId]?.expand ?? {}
                                            const key = [mappedColumn?.idx, mappedRow?.idx].filter(d=>d).join("-")

                                            if( current[key] ){
                                                delete current[key]
                                            }else{
                                                current[key] = true
                                            }
                                            console.log(key, current)
                                            primitive.setField(`frames.${frameId}.expand`, current)
                                            canvas.current.refreshFrame( frameId)
                                        }
                                    }

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
                                                    canvas.current.refreshFrame( targetBoard.id )
                                                }
                                            }
                                            return result
                                            
                                        }
                                    }
                                },
                            }}
                            frameLinks={linkList}
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
                            render={renderedSet}
                />
            {false && <div className="flex flex-col w-[36rem] h-full justify-stretch space-y-1 grow border-l p-3">
                <FilterPane/>
            </div>}
            
    </div>
    </>
}