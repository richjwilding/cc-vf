import MainStore from "./MainStore"
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ClipboardDocumentIcon, DocumentArrowDownIcon, FunnelIcon, MagnifyingGlassIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { HeroIcon } from './HeroIcon';
import { InputPopup } from './InputPopup';
import DropdownButton from "./DropdownButton";
import InfiniteCanvas from "./InfiniteCanvas";
import CollectionUtils from "./CollectionHelper";
import { RenderPrimitiveAsKonva, RenderSetAsKonva, renderMatrix } from "./RenderHelpers";
import HierarchyNavigator from "./HierarchyNavigator";
import PrimitiveConfig from "./PrimitiveConfig";
import FilterPane from "./FilterPane";
import CollectionInfoPane from "./CollectionInfoPane";
import useDataEvent from "./CustomHook";
import { createPptx, exportKonvaToPptx, writePptx } from "./PptHelper";

function dropZoneToAxis(id){
    return id.split('-')
}
async function moveItemOnAxis(  primitive, axis, from, to ){
    if( axis){
        if( axis.type === "category"){
            console.log(`move ${primitive.title} from ${from} to ${to}`)
            if( from ){
                const prim = mainstore.primitive(from)
                if( prim ){
                    await prim.removeRelationship( primitive, 'ref')
                }
            }
            if( to ){
                const prim = mainstore.primitive(to)
                if( prim ){
                    await prim.addRelationship( primitive, 'ref')
                }
            }
        }
    }
}
async function moveItemWithinFrame(primitiveId, startZone, endZone, frame){
    console.log(`${primitiveId} - >${startZone} > ${endZone}`)
    const primitive = mainstore.primitive(primitiveId)
    if( primitive ){
        const [sc,sr] = dropZoneToAxis( startZone)
        const [ec,er] = dropZoneToAxis( endZone )
        if( sc !== ec){
            await moveItemOnAxis(primitive, frame.axis.column, frame.extents.column[sc]?.idx, frame.extents.column[ec]?.idx)
        }
        if( sr !== er){
            await moveItemOnAxis(primitive, frame.axis.row, frame.extents.row[sr]?.idx, frame.extents.row[er]?.idx)
        }
    }

}

let mainstore = MainStore()
    function SharedRenderView(d, primitive, myState){
        const view = myState[d.id]
        const renderOptions = view.renderConfigOverride ?? {}
        const configNames = ["width", "height"]


        const title = view.noTitle ? undefined : ()=>`${d.title} - #${d.plainId}`
        const canvasMargin = view.noTitle ? [0,0,0,0] : [20,20,20,20]


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
                expand: Object.keys(primitive.frames?.[ d.id ]?.expand ?? {})
            })

        if( primitive.frames?.[d.id]){
            for( const name of configNames){
                if( primitive.frames[d.id][name] !== undefined){
                    renderOptions[name] = primitive.frames[d.id][name]
                }
            }
        }
        if( view.config === "full"){
            let render = (stageOptions)=>RenderPrimitiveAsKonva(view.primitive, {...stageOptions, ...renderOptions})
            if( d.referenceId === 118){
                let boardToCombine = d.primitives.imports.allItems
                if(d.order){
                    boardToCombine.sort((a,b)=>d.order.indexOf(a.id) - d.order.indexOf(b.id))
                }
                if( boardToCombine.length >0 ){

                    render = (stageOptions)=>{
                        const partials = boardToCombine.map(d=>{
                            const board = myState[d.id]
                            return {
                                primitive: d,
                                axis: board.axis,
                                columnExtents: board.columns,
                                rowExtents: board.rows,
                                viewConfig: board.viewConfig,
                                list: board.list
                        }})
                        return RenderPrimitiveAsKonva(view.primitive, {...stageOptions, ...renderOptions, partials})
                    }
                }
            }
            return {id: d.id, parentRender: view.parentRender, title, canChangeSize: "width", canvasMargin, items: render}
        }else if( view.config === "cat_overview"){
            return {
                id: d.id, 
                parentRender: view.parentRender, 
                title, 
                canChangeSize: "width", 
                canvasMargin, 
                items: (stageOptions)=>RenderPrimitiveAsKonva(view.primitive, {...stageOptions, ...renderOptions, config: "cat_overview", data: view.renderData})
            }
        }else if( view.config === "flow"){
            let render = (stageOptions)=>RenderPrimitiveAsKonva(view.primitive, {...stageOptions, ...renderOptions, data: view.renderData})
            return {id: d.id, parentRender: view.parentRender, title, canChangeSize: true, canvasMargin: [0,0,0,0], items: render}
        }else if( view.config === "widget"){
            let render = (stageOptions)=>RenderPrimitiveAsKonva(view.primitive, {...stageOptions, ...renderOptions, data: view.renderData})
            return {id: d.id, parentRender: view.parentRender, canChangeSize: "width", canvasMargin: [2,2,2,2], items: render}
        }else if( view.config === "report_set"){


            return {id: d.id, 
                    title, 
                    canChangeSize: "width", 
                    canvasMargin, 
                    parentRender: view.parentRender, 
                    items: (stageOptions)=>RenderSetAsKonva(
                                                            view.primitive, 
                                                            view.list, 
                                                            {
                                                                referenceId: view.primitive.referenceId,
                                                                ...stageOptions, 
                                                                ...renderOptions,
                                                                axis:view.axis,
                                                                extents:{column: view.columns, row:view.rows}
                                                            }
                                                        )
                    }
        }
        
        if( d.type === "query" && d.processing?.ai?.data_query){
            return {id: d.id, parentRender: view.parentRender, title, canChangeSize: true, canvasMargin, items: (stageOptions)=>RenderPrimitiveAsKonva(view.primitive, {config: "ai_processing",...stageOptions, ...renderOptions})}
        }

        const canChangeSize = view?.viewConfig?.resizable 

        return {id: d.id ,parentRender: view.parentRender, title, canChangeSize, items: (stageOptions)=>mapMatrix(stageOptions, d,view)}

    }

    function SharedPrepareBoard(d, myState, element, forceViewConfig){
        let didChange = false
        let stateId = element ? element.id : d.id
        if( !myState[stateId]){
                myState[stateId] = {id: stateId}
        }
        myState[stateId].isBoard = true
        const oldConfig = myState[stateId]?.config
        if( d.type === "view" || d.type === "query"){
            const items = d.itemsForProcessing
            
            const viewConfigs = CollectionUtils.viewConfigs(items?.[0]?.metadata)
            let activeView = d?.referenceParameters?.explore?.view 
            let viewConfig = viewConfigs[activeView] ?? viewConfigs[0] 
            if( forceViewConfig ){
                activeView = viewConfigs.findIndex(d=>d.renderType === forceViewConfig.viewConfig || d.id === forceViewConfig.viewConfig) 
                if( activeView == -1){
                    viewConfig = {
                        renderType: forceViewConfig.viewConfig
                    }
                }else{
                    viewConfig = viewConfigs[activeView] 
                }
            }

            const columnAxis = CollectionUtils.primitiveAxis(d, "column", items)
            const rowAxis = CollectionUtils.primitiveAxis(d, "row", items)

            if( viewConfig?.renderType === "cat_overview"){
                let categoriesToMap
                if( d.referenceParameters.explore.axis?.column?.type === "category" || d.referenceParameters.explore.axis?.row?.type === "category"){
                    categoriesToMap = [
                        d.referenceParameters.explore.axis?.column?.type === "category" ? d.primitives.axis.column.allItems : undefined,
                        d.referenceParameters.explore.axis?.row?.type === "category" ? d.primitives.axis.row.allItems : undefined,
                    ].flat().filter(d=>d)
                }else{
                    categoriesToMap = d.primitives.origin.allUniqueCategory
                }             
                console.log(`Got ${categoriesToMap.length} to map`)
                let mappedCategories = categoriesToMap.map(category=>{
                    console.log(`Doing ${category.title} - ${category.primitives.allUniqueCategory.length} subcats`)
                    const axis = {
                        type: "category",
                        title: category.title,
                        access: category.referenceParameters.access,
                        primitiveId: category.id,
                        relationship: category.referenceParameters.relationship
                    }
                    let {data, extents} = CollectionUtils.mapCollectionByAxis( items, axis, undefined, [], [], undefined )
                    //console.log(data, extents)
                    let columnsToInclude, totalCount = data.length
                    if( d.renderConfig?.show_none ){
                        const none = extents.column.find(d=>d.idx === "_N_")
                        columnsToInclude =  [none, ...extents.column.filter(d=>d.idx !== "_N_")]
                    }else{
                        totalCount -= data.filter(d=>d.column === "_N_").length
                        columnsToInclude =  extents.column.filter(d=>d.idx !== "_N_")
                    } 

                    return {
                            id: category.id,
                            title: `${category.title} (${totalCount})`,
                            //details: extents.column.filter(d=>d.idx !== "_N_").map(d=>{
                            details: columnsToInclude.map(d=>{
                                const items = data.filter(d2=>d2.column === d.idx || (Array.isArray(d2.column) && d2.column.includes(d.idx)))
                                return {
                                    idx: d.idx,
                                    label: d.label,
                                    count: items.length,
                                    items
                                }})
                        }
                })

                myState[stateId].primitive = d
                myState[stateId].stateId = stateId
                myState[stateId].config = "cat_overview"
                myState[stateId].renderData = {
                    mappedCategories
                }
            }else{
                columnAxis.allowMove = columnAxis.access === 0 && !columnAxis.relationship
                rowAxis.allowMove = rowAxis.access === 0 && !rowAxis.relationship

                let viewFilters = []//d.referenceParameters?.explore?.filters?.map((d2,i)=>CollectionUtils.primitiveAxis(d, i)) ?? []
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

                if( myState[stateId].list ){
                    if( filtered.data.length !== myState[stateId].list.length){
                        didChange = true
                    }else{
                        const changes = myState[stateId].list.some((d,i)=>{
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
                }
                            
                myState[stateId].primitive = d
                myState[stateId].config = "explore_" + activeView
                myState[stateId].list = filtered.data
                myState[stateId].internalWatchIds = filtered.data.map(d=>d.primitive.parentPrimitiveIds).flat(Infinity).filter((d,i,a)=>a.indexOf(d)===i)
                myState[stateId].axis = {column: columnAxis, row: rowAxis}
                myState[stateId].columns = filtered.columns
                myState[stateId].viewConfig = viewConfig
                myState[stateId].rows = filtered.rows
                myState[stateId].extents = extents
                myState[stateId].toggles = Object.keys(extents).reduce((a,c)=>{
                                                                        if(c.match(/liveFilter/)){
                                                                            a[c] = extents[c]
                                                                        }
                                                                        return a}, {})
            }
        }else if( d.type === "summary" || d.type === "element"){
            myState[stateId].primitive = d
            myState[stateId].list = [{column: undefined, row: undefined, primitive: d}]
            myState[stateId].columns = [{idx: undefined, label: ''}]
            myState[stateId].rows = [{idx: undefined, label: ''}]
            myState[stateId].config = "full"
            myState[stateId].extents = {
                columns: [{idx: undefined, label: ''}],
                row:[{idx: undefined, label: ''}]
            }
            myState[stateId].toggles = {}
        }else if( d.type === "actionrunner" ){


            myState[stateId].primitive = d
            myState[stateId].config = "widget"
            myState[stateId].renderData = {
                //icon: HeroIcon({icon: d.metadata.icon, asString: true, stroke: "#ff0000", width: 12, height: 12}),
                icon: <HeroIcon icon='FARun'/>,
                count: d.primitives.uniqueAllIds.length
            }
        }else if( d.type === "search" ){

            const resultCategory = mainstore.category( d.metadata.parameters.sources.options[0].resultCategoryId )

            myState[stateId].primitive = d
            myState[stateId].config = "widget"
            myState[stateId].renderData = {
                //icon: HeroIcon({icon: d.metadata.icon, asString: true, stroke: "#ff0000", width: 12, height: 12}),
                icon: <HeroIcon icon={resultCategory?.icon}/>,
                items: resultCategory.plural ?? resultCategory.title + "s",
                count: d.primitives.uniqueAllIds.length
            }
        }else if( d.type === "flow" ){
            myState[stateId].primitive = d
            myState[stateId].config = "flow"
            myState[stateId].renderData = {
                //icon: HeroIcon({icon: d.metadata.icon, asString: true, stroke: "#ff0000", width: 12, height: 12}),
                icon: <HeroIcon icon='CogIcon'/>,
                count: d.primitives.uniqueAllIds.length
            }

            const childNodes = d.primitives.origin.uniqueAllItems

            for(const child of childNodes){
                if( child.type === "flowinstance"){
                    continue
                }
                console.log(`- preparing child of flow ${child.plainId} ${child.type}`)
                SharedPrepareBoard(child, myState)
                myState[child.id].parentRender = d.id
            }
            console.log(`Flow children done`)
        }
        if( myState[stateId] && forceViewConfig){
            myState[stateId].renderConfigOverride = forceViewConfig.renderConfig
        }
        if( element ){
            myState[stateId].element = element

        }
        console.log(oldConfig, myState[stateId].config)
        if( oldConfig !== myState[stateId].config){
            didChange = true
        }
        return didChange
    }

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

    window.exportFrames = exportMultiple

    useDataEvent("relationship_update set_parameter set_field delete_primitive set_title", undefined, (ids, event, info)=>{
        if( myState.current.watchList  ){
            myState.current.framesToUpdate = myState.current.framesToUpdate || []
            Object.keys(myState.current.watchList).forEach(frameId=>{
                let checkIds = ids
                if( myState[frameId] && myState.current.watchList[frameId].filter(d=>checkIds.includes(d)).length > 0 ){
                    
                    const existing = myState.current.framesToUpdate.find(d=>d.frameId === frameId && d.event === event) 
                    if( !existing){
                        myState.current.framesToUpdate.push({frameId, event, info})
                    }else{
                        console.log(`already queued`)
                    }
                    
                    if( !myState.current.frameUpdateTimer ){
                        myState.current.frameUpdateTimer = setTimeout(()=>{
                            myState.current.frameUpdateTimer = undefined
                            for( const {frameId, event, info} of  myState.current.framesToUpdate){
                                let needRefresh = true
                                let needRebuild = ((event === "set_field" || event === "set_parameter") && info === "referenceParameters.explore.view")

                                if( event === "set_field" && info && typeof(info)==="strng"){
                                    if( info.match(/processing.ai/)){
                                        const board = myState[frameId]
                                        canvas.current.refreshFrame( board.id, renderView(board.primitive))
                                    }else if(info.startsWith('procesing.') || info.startsWith('embed_')){
                                        needRefresh = false
                                    }
                                }
                                if( event === "relationship_update" || needRebuild){
                                    needRefresh = prepareBoard( myState[frameId].primitive )
                                    if( !needRefresh){
                                        console.log(`Cancelled refresh - no changes on ${myState[frameId]?.primitive.plainId}`)
                                    }
                                }

                                if( needRefresh){
                                    console.log(`DOING REFRESH ${frameId} / ${myState[frameId]?.primitive.plainId}`)
                                    forceUpdateLinks()
                                    if( needRebuild ){
                                        console.log(`With rebuild`)
                                        const board = myState[frameId]
                                        canvas.current.refreshFrame( frameId, renderView(board.primitive))
                                    }else{
                                        canvas.current.refreshFrame( frameId )
                                    }
                                }
                            }
                            myState.current.framesToUpdate = []
                        }, 2820)
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

    const prepareBoard = (d)=>SharedPrepareBoard(d, myState)

    useEffect(() => {
        const overlay = menu.current;
    
        const preventDefault = (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        };
    
        overlay.addEventListener('wheel', preventDefault, { passive: false });
    
        return () => {
          overlay.removeEventListener('wheel', preventDefault);
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



    const [boards,  renderedSet] = useMemo(()=>{
        console.log(`--- REDO BOARD RENDER ${primitive?.id}, ${update}`)
        const boards = [...primitive.primitives.allUniqueView, ...primitive.primitives.allUniqueSummary,...primitive.primitives.allUniqueQuery,...primitive.primitives.allUniqueSearch,...primitive.primitives.allUniqueFlow]
        
        for(const d of boards){
            if(!myState[d.id] ){
                myState[d.id] = {id: d.id}
                prepareBoard(d)
            }
        }
        //const renderedSet = boards.map(d=>renderView(d))
        //const renderedSet = boards.map(d=>renderView(d))
        //return [boards, renderedSet]
        const allBoards = Object.values(myState).filter(d=>d && d.isBoard).map(d=>d.primitive)
        const renderedSet = allBoards.map(d=>renderView(d))
        return [allBoards, renderedSet]
    }, [primitive?.id, update])
        

    const linkList = useMemo(()=>{
        let p1 = performance.now()
        let itemCache = {}
        function getItemList( item ){
            let list = itemCache[item.id]
            if( !list){
                itemCache[item.id] = item.itemsForProcessing
                list = itemCache[item.id]
            }
            return list ?? []
        }
        let links = boards.map(left=>{
            let segmentSummaries
            return boards.map(right=>{
                if( right.referenceId === 118){
                    return
                }
                if( left.id !== right.id){
                    let segment
                    if( right.parentPrimitiveIds.includes(left.id) ){
                        const sources = right.parentPrimitiveIdsAsSource
                        if( sources.length > 0){
                            let ids = getItemList(left).map(d=>d.id)
                            if( sources.some(d=>ids.includes(d))){
                                return {left: left.id, right: right.id}
                            }
                        }
                        if( left.type === "flow" ){
                            if(right.primitives.imports.allIds.includes(left.id)){
                                return {left: left.id, right: right.id, leftPin: "input"}
                            }
                        }else{
                            return {left: left.id, right: right.id}
                        }
                    }else{
                        const route = right.findImportRoute(left.id)
                        if( route.length > 0){
                            //console.log(`Checking view import ${left.plainId} -> ${right.plainId} ()`)
                            for(const axis of ["row","column"]){
                                if( left.referenceParameters?.explore?.axis?.[axis]?.type === "category" ){
                                    const axisPrim = left.primitives.axis?.[axis]?.allIds?.[0]
                                    if(  axisPrim ){
                                        const values = right.referenceParameters?.importConfig?.find(d=>d.id === left.id )?.filters?.map(d=>d.sourcePrimId === axisPrim ? d.value : undefined).flat().filter(d=>d)
                                        let row, column
                                        if( values ){
                                            column = values.map(d=>myState[left.id].extents.column.findIndex(d2=>d2.idx === d)).filter(d=>d > -1)
                                            row = values.map(d=>myState[left.id].extents.row.findIndex(d2=>d2.idx === d)).filter(d=>d > -1)
                                            if( row.length || column.length){
                                                if( column.length === 0){
                                                    column = [0]
                                                }
                                                if( row.length === 0){
                                                    row = [0]
                                                }
                                                for(const r of row){
                                                    for( const c of column){
                                                        return {left: left.id, cell: `${c}-${r}`, right: right.id}

                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            return {left: left.id, right: right.id}


                        }else{
                            if( right.type === "query" || right.type === "summary"){
                                if( !segmentSummaries ){
                                    segmentSummaries = left.primitives.origin.allUniqueSegment.map(d=>[...d.primitives.origin.allUniqueSummary, ...d.primitives.origin.allUniqueQuery] ).flat()
                                }
                                
                                if(segmentSummaries.map(d=>d.id).includes( right.id)){
                                    const out = []
                                    let added = false
                                    if( myState[left.id].columns && myState[left.id].rows){

                                        myState[left.id].columns.forEach((column,cIdx)=>{
                                            myState[left.id].rows.forEach((row,rIdx)=>{
                                                if(!added){
                                                    const filter = [
                                                        PrimitiveConfig.encodeExploreFilter( myState[left.id].axis.column, column ),
                                                        PrimitiveConfig.encodeExploreFilter( myState[left.id].axis.row, row ),
                                                    ].filter(d=>d)
                                                    
                                                    if( right.origin.doesImport(left.id, filter)){
                                                        out.push( {left: left.id, cell: `${cIdx}-${rIdx}`, right: right.id})
                                                        added = true
                                                    }
                                                }
                                            })
                                        })
                                    }
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
                                    console.log("Links took", performance.now()-p1)

        let oldLinks = canvas.current.getLinks ? canvas.current.getLinks() :undefined
        console.log(links)
        if( !mainstore.deepEqual( oldLinks, links) ){
            if( canvas.current?.updateLinks){
                canvas.current.updateLinks(links)
            }
        }else{
            console.log(`LINKS DID HNOT CAHANGE`)
        }
        return links
    }, [primitive?.id, update, updateLinks])

    //console.log("LINKLIST", linkList)
    let selectedColIdx = 0
    let selectedRowIdx = 0
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
            canvas.current.updateFramePosition( fId, {width: width})
        }
        if( height ){
            primitive.setField(`frames.${fId}.height`, height)
            canvas.current.updateFramePosition( fId, {height: height})
        }
        canvas.current.refreshFrame( board.id, renderView(board.primitive))
    }

    function setActiveBoard(e){
        const id = e?.[0]
        myState.activeBoardId = id
        if( id ){
            myState.activeBoard = myState[id]
            if(true || !myState[id].axisOptions ){
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
        if( !position){
            position = findSpace()
        }
        myState[d.id] = {id: d.id}
        prepareBoard( d )

        if( position ){
            primitive.setField(`frames.${d.id}`, {x: position.x, y: position.y, s: position.s})
            canvas.current.updateFramePosition( d.id,  {x: position.x, y: position.y, s: position.s})
        }

        canvas.current.addFrame( renderView(d))
        forceUpdate()
    }

    function addExistingView(){
        let items = mainstore.primitives().filter(d=>d.workspaceId === primitive.workspaceId && ["working","view","query","search"].includes(d.type))

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
    async function addWidgetChildView(){
        if(myState.activeBoard){
            const bp = myState.activeBoard.primitive
            if( bp.type === "search"){
                const resultCategoryIds = bp.metadata.parameters.sources.options.map(d=>d.resultCategoryId).filter((d,i,a)=>a.indexOf(d) === i)
                if( resultCategoryIds.length > 0 ){
                    await addBlankView( undefined, bp.id, undefined, {referenceId: resultCategoryIds})
                }
                
            }
        }
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
        return SharedRenderView(d, primitive, myState)
    }
    async function addBlankView(cat_or_id = 38, importId, filter, full_options = {}){
        const category = typeof(cat_or_id) === "number" ? mainstore.category(cat_or_id) : cat_or_id
        const {pivot, ...options} = full_options 
        let importPrimitive = importId ? mainstore.primitive(importId) : undefined
        let position = (importPrimitive ? canvas.current.framePosition(importPrimitive.id)?.scene : undefined) ?? {r:0, t: 0, s: 1}
        
        if(pivot){
            console.log("has pivot", pivot)
            const existingSegments = importPrimitive.primitives.allUniqueSegment
            console.log(`Got ${existingSegments.length} segments to check`)
            let targetTargetSegment = existingSegments.find(d=>d.doesImport(importId, filter) && mainstore.equalRelationships(pivot, d.referenceParameters?.pivot))
            console.log(targetTargetSegment)
            if(!targetTargetSegment){
                const newPrim = await mainstore.createPrimitive({type: 'segment', 
                    parent: importPrimitive, 
                    referenceParameters:{
                        target:"items",
                        pivot,
                        importConfig: [{id: importPrimitive.id, filters: filter}]
                    }})
                if( newPrim ){
                    await mainstore.waitForPrimitive( newPrim.id )
                    await newPrim.addRelationshipAndWait( importPrimitive, "imports")
                    console.log(`create new segment ${newPrim.id}`)
                    targetTargetSegment = newPrim
                }
            }
            if( !targetTargetSegment ){
                console.warn(`Cannot create interim segment for pivot view`)
                return
            }
            importPrimitive = targetTargetSegment
            filter = undefined
        }
        const newPrimitive = await mainstore.createPrimitive({
            title: `New ${category.primitiveType}`,
            categoryId: category.id,
            type: category.primitiveType,
            referenceParameters: {
                ...(importPrimitive ? {target: "items", importConfig: [{id: importPrimitive.id, filters: filter}]} : {}),
                target: "items",
                ...options,
            },
            parent: primitive,
        })
        if( newPrimitive ){
            if(importPrimitive){
                await newPrimitive.addRelationshipAndWait( importPrimitive, "imports")
            }
            primitive.addRelationship(newPrimitive, "ref")

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
                        addBoardToCanvas( d )
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
        let position = {x:0, y:0, s:1}
        if( myState.activeBoard){
            let current = canvas.current.framePosition(myState.activeBoardId)?.scene
            if( current ){
                position = {x:current.l, y: current.b + 30, s: current.s}
            }
        }
        return position
    }
    async function getOrCreateSuitableView(item){
        const manual = primitive.primitives.manual.allUniqueSegment[0]
        if(!manual){
            console.log(`Can't find maual`)
            return
        }
        const views = primitive.primitives.origin.allUniqueView.filter(d=>{
            if(d.doesImport(manual)){
                if( d.referenceParameters?.referenceId === item.referenceId){
                    return true
                }
                if( Array.isArray(d.referenceParameters?.referenceId) && d.referenceParameters.referenceId.includes(item.referenceId)){
                    return true
                }
            } 
            return false
        })
        if( views.length > 0){
            console.log(`Got view`)
            return views[0]
        }
        console.log(`Need to create vew`)
        const result = await MainStore().createPrimitive({
            title: item.metadata?.plural ?? item.metadata?.title ?? "View",
            type: "view",
            parent: primitive,
            parentPath: "origin",
            workspaceId: primitive.workspaceId
        })
        let view = await mainstore.waitForPrimitive( result.id )
        if( view ){
            await primitive.addRelationshipAndWait(view, "ref")
            await view.addRelationshipAndWait(manual, "imports")
            addBoardToCanvas( view, findSpace())
        }

    }
    window.getTest = getOrCreateSuitableView
    function pickNewItem(){
       // addBlankView()



        const addToFlow = (myState.activeBoard && myState.activeBoard.primitive?.type === "flow") ? myState.activeBoard.primitive : undefined

       const categoryList = [
        mainstore.categories().filter(d=>d.primitiveType === "search").map(d=>d.id),
        addToFlow ? [] : mainstore.categories().filter(d=>d.primitiveType === "entity").map(d=>d.id),
       ].flat()

        mainstore.globalNewPrimitive({
            title: addToFlow ? `Add to ${addToFlow.title} flow` : "Add to board",
            //categoryId: [38, 117, 81, 118],
            categoryId: [38, 130, 131, 118, 109, ...categoryList],
            parent: primitive,
            beforeCreate:async (data)=>{
                if( addToFlow ){
                    return {
                        ...data,
                        parent: addToFlow
                    }

                }else{
                    if( data.type === "entity"){
                        console.log(`Entity selected - need to add to manual segment`)
                        let segment = primitive.primitives.manual.allUniqueSegment[0]
                        if( !segment ){
                            console.log(`Manual doesnt exist - creating`)
                            const result = await MainStore().createPrimitive({
                                title: `Manual segment for Board ${primitive.plainId}`,
                                type: "segment",
                                parent: primitive,
                                parentPath: "manual",
                                workspaceId: primitive.workspaceId
                            })
                            segment = await mainstore.waitForPrimitive( result.id )
                        }
                        if( segment ){
                            console.log(`Got manual segment`)
                            return {
                                ...data,
                                parent: segment
                            }
                        }
                        throw "Cant add to board - couldnt find manual segment"
                    }
                }
                return data
            },
            callback:async (d)=>{
                if( d ){
                    if( addToFlow ){
                        console.log(`Added to flow`)
                    }else{
                        if(d.type === "entity"){
                            await getOrCreateSuitableView(d)
                        }
                        addBoardToCanvas( d, findSpace())
                    }
                    return true
                }
            }
        })
    }
    async function exportMultiple(ids, byCell){
        const prims = ids.map(d=>mainstore.primitive(d)).filter(d=>d)
        const pptx = createPptx()
        for( const d of prims ){
            const root = canvas.current.frameData( d.id )?.node
            if( root ){
                let list 
                let labels = []
                if( byCell ){
                    list = root.find('.cell')
                    const len = Math.max(...list.map(d=>d.children?.length ?? 0))
                    if( len === 1){
                        labels = list.map(d=>{
                            const [col, row] = d.attrs.id.split("-")
                            return root.find('.row_header').find(d=>d.attrs.id===row)?.find('CustomText')[0]?.attrs?.text
                        })
                        list = root.find('.primitive')
                    }
                }
                let idx = 0
                for(const d of list){
                    await exportKonvaToPptx( d, pptx, {title: labels ? labels[idx]  : undefined} )
                    idx ++
                }
            }
        }
        writePptx( pptx)
    }
    async function exportReport(asTable = false){
        if(myState.activeBoard){
                const frames = canvas.current.getSelection("frame")
                const pptx = createPptx({width: 8.5, height: 11})

                const pxToInch = 612 / 8.5

                let bounds = [
                    11 / 811 * 72,
                    8.5 / 612 * 552,
                    11 / 811 * 739,
                    8.5 / 612 * 60,
                ]//.map(d=>d.toFixed(3))

                pptx.defineSlideMaster({
                    title: "MASTER_SLIDE",
                    background: { color: "FFFFFF" },
                    objects: [
                     { line: { x: bounds[3], y: bounds[0], w: bounds[1] - bounds[3], h: 0, line: { color: "D4D4D4", width: 1 } } },
                     { line: { x: bounds[3], y: bounds[2], w: bounds[1] - bounds[3], h: 0, line: { color: "D4D4D4", width: 1 } } },
                     { text:  {
                        text: 'COMPANY ANALYSIS - SENSE',
                        options: { x: bounds[3], y: bounds[0], w:'100%', align:'left', color:'000000', fontSize:8, bold: true, valign: "bottom",margin:[0,0,0,0] }
                    }},
                     { text:  {
                        text: "Note: This report includes content generated by artificial intelligence (AI). While accuracy is a priority, it is recommended to use this information as a supplement to, rather than a sole basis for, decision-making.",
                        options: { x: bounds[3], y: bounds[2], w: bounds[1] - bounds[3], align:'left', color:'555555', fontSize:7, valign: "top",margin:[5,0,0,0] }
                    }}
                    // { line: { x: bounds[3], y: bounds[2], w: bounds[3] - bounds[1], line: { color: "0088CC", width: 5 } } },
                    ],
                    slideNumber: { x: 500 / pxToInch , w: 52 / pxToInch , y: 11 / 811 * 742, fontSize: 8, bold: true, align: 'right',margin:[0,0,0,0]} ,
                   });

                for(const d of frames){
                    const root = canvas.current.frameData( d.attrs.id )
                    const temp = root.node.children
                    root.node.children = root.allNodes

                    const padding = [bounds[0],0,bounds[0], 0]

                    await exportKonvaToPptx( root.node, pptx, {offsetForFrame: [root.canvasMargin[3], root.canvasMargin[0]], master: "MASTER_SLIDE", removeNodes: ["frame_outline", "frame_bg", "frame_label", "background", "view"],  scale: 1 / pxToInch / root.node.attrs.scaleX, padding} )
                    root.node.children = temp
                }
                pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
        }
    }
    async function exportFrame(asTable = false){
        if(myState.activeBoard){
            if( asTable ){
                const root = canvas.current.frameData( myState.activeBoardId )
                const temp = root.node.children
                root.node.children = root.allNodes
            
                await exportKonvaToPptx( root.node, mainstore.keepPPTX, {removeNodes: ["frame_outline", "frame_bg", "frame_label", "background", "view"], fit:"width", asTable: true, padding: [3, 1, 0.25, 1]} )
                root.node.children = temp
            }else{
                const frames = canvas.current.getSelection("frame")
                const pptx = createPptx()
                for(const d of frames){
                    const root = canvas.current.frameData( d.attrs.id )
                    const temp = root.node.children
                    root.node.children = root.allNodes
                    await exportKonvaToPptx( root.node, pptx, {removeNodes: ["frame_outline", "frame_bg",  "background", "view"],  padding: [3, 1, 0.25, 1]} )
                    root.node.children = temp
                }
                pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
            }
            if( !mainstore.disablePPTXSave ){
                mainstore.keepPPTX.writeFile({ fileName: "Konva_Stage_Export.pptx" });
            }
        }else{
            await exportKonvaToPptx( canvas.current.stageNode() )
        }

    }
    async function copyToClipboard(){
        if(myState.activeBoard){
            const view = myState[myState.activeBoard.id]
            if( view.referenceId === 118){
                const root = mainstore.primitive(view.order?.[0])
                const rootList = root.itemsForProcessing


            }
            const type = view.list[0]?.primitive.type
            let out = "~" + view.columns.map(d=>d.label).join("~")
            
            out += "\n" + view.rows.map(row=>{
                return row.label +"~" + view.columns.map(column=>{
                    const subList = view.list.filter(d=>[d.column].flat().includes( column.idx) && [d.row].flat().includes( row.idx))
                    let text = "-"
                    if( subList.length > 0){
                        if( type === "evidence"){
                            //text = subList.map(d=>([d.primitive.title, d.primitive.referenceParameters?.quote].filter(d=>d).join("\n")).replaceAll(/\n/g, "-ENT-")).join("-ENT-")
                            text = subList.length > 0 ? "✓" : ""
                        }  else{
                            text = subList.map(d=>(d.primitive.referenceParameters?.summary ?? d.primitive.referenceParameters?.description ?? "").replaceAll(/\n/g, "-ENT-")).join("-ENT-")
                        }                 
                    }
                    const partial = `"${text}"`
                    return partial
                }).join("~")
            }).join("\n")
            navigator.clipboard.writeText( out )
        }

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

    const flowChildPositions = Object.values(myState).filter(d=>d && d.isBoard && d.primitive?.type === "flow").reduce((a,d)=>({...a,...d.primitive.frames}),{})
    
    let framePositions = {
        ...primitive.frames,
        ...flowChildPositions
    }

    return <>
        {manualInputPrompt && <InputPopup key='input' cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
        <div key='toolbar3' className='overflow-hidden max-h-[80vh] bg-white rounded-md shadow-lg border-gray-200 border absolute right-4 top-4 z-50 flex flex-col place-items-start divide-y divide-gray-200'>
            <div className='p-3 flex place-items-start space-x-2 '>
                    <DropdownButton noBorder icon={<HeroIcon icon='FAPickView' className='w-6 h-6 mr-1.5'/>} onClick={addExistingView} flat placement='left-start' />
                    <DropdownButton noBorder icon={<PlusIcon className='w-6 h-6 mr-1.5'/>} onClick={pickNewItem} flat placement='left-start' />
                    <DropdownButton noBorder icon={<HeroIcon icon='FAAddView' className='w-6 h-6 mr-1.5'/>} onClick={newView} flat placement='left-start' />
                    {collectionPaneInfo && <DropdownButton noBorder icon={<HeroIcon icon='FAAddChildNode' className='w-6 h-6 mr-1.5'/>} onClick={pickBoardDescendant} flat placement='left-start' />}
                    {<DropdownButton noBorder icon={<DocumentArrowDownIcon className='w-6 h-6 mr-1.5'/>} onClick={()=>exportFrame(true)} flat placement='left-start' />}
                    {<DropdownButton noBorder icon={<DocumentArrowDownIcon className='w-6 h-6 mr-1.5'/>} onClick={()=>exportFrame(false)} flat placement='left-start' />}
                    {<DropdownButton noBorder icon={<DocumentArrowDownIcon className='w-6 h-6 mr-1.5'/>} onClick={()=>exportReport(false)} flat placement='left-start' />}
                    {collectionPaneInfo && <DropdownButton noBorder icon={<ClipboardDocumentIcon className='w-6 h-6 mr-1.5'/>} onClick={copyToClipboard} flat placement='left-start' />}
            </div>
            {collectionPaneInfo && <div className='pt-2 overflow-y-scroll'>
                <CollectionInfoPane {...collectionPaneInfo} newPrimitiveCallback={createNewQuery} createNewView={addBlankView} updateFrameExtents={updateExtents}/>
            </div>}
        </div>
        {<div ref={menu} key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 p-1.5 flex flex-col place-items-start space-y-2 invisible'>
            {myState.activeBoard?.config !== "widget" && <HierarchyNavigator ref={colButton} noBorder align={()=>menuSide()} icon={<HeroIcon icon='Columns' className='w-5 h-5 '/>} items={()=>CollectionUtils.axisToHierarchy(getAxisOptions())} flat placement='left-start' portal showTick selectedItemId={()=>getAxisId("column")} action={(d)=>updateAxis("column", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedColIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
            {myState.activeBoard?.config !== "widget" && <HierarchyNavigator ref={rowButton} noBorder align={()=>menuSide()} icon={<HeroIcon icon='Rows' className='w-5 h-5 '/>} items={()=>CollectionUtils.axisToHierarchy(getAxisOptions())} flat placement='left-start' portal showTick selectedItemId={()=>getAxisId("row")} action={(d)=>updateAxis("row", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedRowIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
            {myState.activeBoard?.config === "widget" && <DropdownButton noBorder icon={<HeroIcon icon='FAAddChildNode' className='w-5 h-5'/>} onClick={addWidgetChildView} flat placement='left-start' />}
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
                            drag={{
                                "primitive": {
                                    cell:{
                                        start: undefined,
                                        droppable: (id,start, drop, sFrame, dFrame)=>{
                                            if( sFrame !== dFrame ){
                                                return false
                                            }                                                
                                            let frameId = sFrame
                                            
                                            const [sc,sr] = dropZoneToAxis(start)
                                            const [dc,dr] = dropZoneToAxis(drop)
                                            if( sr != dr && !myState[frameId].axis.row.allowMove){
                                                return false
                                            }
                                            if( sc != dc && !myState[frameId].axis.column.allowMove){
                                                return false
                                            }
                                            return true
                                        },
                                        drop: (id, start, drop, sFrame, dFrame)=>{
                                            if( sFrame !== dFrame ){
                                                return false
                                            }                                                
                                            let frameId = sFrame
                                            moveItemWithinFrame(id, start, drop, myState[frameId])
                                        }
                                    }
                                }
                            }}
                            callbacks={{
                                resizeFrame,
                                viewportWillMove:handleViewWillChange,
                                viewportCallback:handleViewChange,
                                frameMove: (d)=>{
                                    const prim = MainStore().primitive(d.id)
                                    if(prim){

                                        let target = primitive
                                        if( myState[d.id].parentRender ){
                                            target = myState[myState[d.id].parentRender].primitive
                                            console.log(`Will update position in flow parent`)
                                        }

                                        const expand = target.frames?.[d.id]?.expand ?? {}
                                        const width = target.frames?.[d.id]?.width
                                        target.setField(`frames.${d.id}`, {x: d.x, y: d.y, s: d.s, width, expand })
                                        canvas.current.updateFramePosition( d.id, {x: d.x, y: d.y, s: d.s})
                                    }
                                },
                                onClick:{
                                    frame: (id)=>setActiveBoard(id),
                                    primitive:(id)=>mainstore.sidebarSelect(id),
                                    canvas:(id)=>setCollectionPaneInfo(),
                                    cell:(id, frameId)=>{
                                        const cell = id?.[0]
                                        if( cell && myState[frameId].axis){
                                            const [cIdx,rIdx] = cell.split("-")

                                            let infoPane = {
                                                filters: [
                                                    PrimitiveConfig.encodeExploreFilter( myState[frameId].axis.column, myState[frameId].columns[cIdx] ),
                                                    PrimitiveConfig.encodeExploreFilter( myState[frameId].axis.row, myState[frameId].rows[rIdx] ),
                                                ].filter(d=>d)
                                            }
                                            console.log(infoPane.filters[0])
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
                                            canvas.current.updateFramePosition( frameId, {expand: current})
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
                            framePositions={framePositions}
                            selectable={{
                                "frame":{
                                    multiple: true
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
BoardViewer.prepareBoard = SharedPrepareBoard
BoardViewer.renderBoardView = SharedRenderView