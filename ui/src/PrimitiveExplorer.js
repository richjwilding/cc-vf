import MainStore from './MainStore';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ClipboardDocumentIcon, DocumentArrowDownIcon, FunnelIcon, MagnifyingGlassIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { PrimitiveCard } from './PrimitiveCard';
//import html2canvas from 'html2canvas';
//import MiroExporter from './MiroExporter'; 
import Panel from './Panel';
import {useGesture, usePinch} from '@use-gesture/react'
import { useLayoutEffect } from 'react';
import useDataEvent from './CustomHook';
import MyCombo from './MyCombo';
import TooggleButton from './ToggleButton';
import { renderMatrix, roundCurrency } from './RenderHelpers';
import SegmentCard, { itemsForGraph, projectData } from './SegmentCard';
import { exportViewToPdf } from './ExportHelper';
import DropdownButton from './DropdownButton';
import { HeroIcon } from './HeroIcon';
import { SearchPane } from './SearchPane';
import ListGraph from './ListGraph';
import InfiniteCanvas from './InfiniteCanvas';
import HierarchyNavigator from './HierarchyNavigator';
import CollectionUtils from './CollectionHelper';
import PrimitiveConfig from './PrimitiveConfig';
import UIHelper from './UIHelper';
import { heatMapPalette } from './RenderHelpers';


const mainstore = MainStore()


function decodeFilter(filter, extents){
    if( !filter){
        return filter
    }
    return filter.reduce((a,c)=>{
        if( c instanceof Object ){
            a[c.idx] = c
        }else{
            //a[c === null ? undefined : c] = true
            a[c === null ? undefined : c] = c === null ? undefined : c
        }
        return a
    }, {}) 

} 
const encodeFilter = PrimitiveConfig.encodeExploreFilter

    const getExploreFilters = (primitive, axisOptions)=>{
        const filters = primitive.referenceParameters?.explore?.filters
        return filters ? filters.map((filter,idx)=>({
            option: findAxisItem(primitive, idx, axisOptions), 
            id: idx, 
            track: filter.track,
            //filter: filter?.filter?.reduce((a,c)=>{a[c === null ? undefined : c] = true; return a}, {}) ?? {}
            filter: decodeFilter(filter?.filter) ?? []
        })) : []

    }

    const findAxisItem = CollectionUtils.findAxisItem

    const defaultRenderProps = {
        "default": {
            simpleRender: true
        },
        "segment":{
            hideDetails: true
        },
        "result": {
            fixedSize: "8rem"
        },
        "entity": {
            hideCover: true,
            urlShort: true,
            fixedSize: "16rem"
        }
    }


const PrimitiveExplorer = forwardRef(function PrimitiveExplorer({primitive, ...props}, exportRef){

    const [selectedCategoryIds, setSelectedCategoryIds] = React.useState( props.allowedCategoryIds )
    const [layerSelection, setLayerSelection] = React.useState(primitive?.referenceParameters?.explore?.layer ?? 0)//axisOptions.length > 1 ? 1 : 0)
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [updateRel, forceUpdateRel] = useReducer( (x)=>x+1, 0)
    const [updateNested, forceUpdateNested] = useReducer( (x)=>x+1, 0)
    const [updateExtent, forceUpdateExtent] = useReducer( (x)=>x+1, 0)
    const [colSelection, setColSelection] = React.useState(undefined)
    const [rowSelection, setRowSelection] = React.useState(undefined)
    const [selectedBox, setSelectedBox] = React.useState(undefined)
    const [activeView, setActiveView] = React.useState(primitive?.referenceParameters?.explore?.view ?? 0)
    const layerNestPreventionList = React.useRef()
    const [hideNull, setHideNull]= React.useState(primitive?.referenceParameters?.explore?.hideNull)
    const [showCategoryPane, setshowCategoryPane] = React.useState(false)
    const [showPane, setShowPane] = React.useState(false)
    const [importantOnly, setImportantOnly] = React.useState(true)
    const [colFilter, setColFilter] = React.useState(undefined)
    const [rowFilter, setRowFilter] = React.useState(undefined)
    const [viewPivot, setViewPivot] = React.useState(primitive?.referenceParameters?.explore?.viewPivot )
    const [axisToggle, setAxisToggle] = React.useState(primitive?.referenceParameters?.explore?.axisToggle )
    const targetRef = useRef()
    const gridRef = useRef()
    const myState = useRef({})
    const canvas = useRef({})
    const [experiment, setExperiment] = React.useState( true )

    let cancelRender = false



    const restoreState = ()=>{
        const [translateX = 0, translateY = 0] = gridRef.current.style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
        const [scale = 1] = gridRef.current.style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
        return [parseFloat(translateX),parseFloat(translateY),parseFloat(scale)]
    }
    const storeCurrentOffset = ()=>{
        if( gridRef.current){
            const [lx,ly,ls] = restoreState()
            const tbb = targetRef.current.getBoundingClientRect()
            const gbb = gridRef.current.getBoundingClientRect()
            
            const rx = gbb.x - tbb.x
            const ry  = gbb.y - tbb.y
            myState.current.offset = {x: rx, y: ry, scale: ls}
        }

    }
    const updateExpand = (state, item)=>{
        const current = state[item] ?? false
        if( current ){
            delete state[item]
        }else{
            state[item] = true
        }
        console.log(state)
        storeCurrentOffset()
        forceUpdateNested()
        return state || {}
    }

    const [expandState, setExpandState] = React.useReducer(updateExpand, {})


    function updateFilters(){
        let out = []
        if( props.categoryIds ){
            out.push((d)=>props.categoryIds.includes(d.referenceId))
        }
        if( props.allowedCategoryIds ){
            out.push((d)=>selectedCategoryIds.includes(d.referenceId))
        }        
        
        return out
    }

    const filters = React.useMemo(()=>{
        console.log(`REDO CATEGORY IDS`)
        forceUpdate()
        forceUpdateNested()
        return updateFilters()
    }, [selectedCategoryIds])

    const asSegment = props.asSegment || primitive.type === "segment" || (props.category && mainstore.category(props.category.resultCategoryId).primitiveType === "segment")
    const isAggregation = primitive.type === "query" && primitive.metadata.type === "aggregator"
    const fixAxis = isAggregation
    const allowToggleAxis = isAggregation
    
    let baseItems = React.useMemo(()=>{
        console.log(`REDO BASE`)
        let list
        if( props.list ){
            list = props.list
            console.log(`GOT LIST OF ${list.length}`)
        }else{
            /*
            if( primitive.type === "query"){
                if( primitive.metadata.type === "aggregator"){
                    const parentForScope = primitive.findParentPrimitives({type: "working"})[0]
                    if( parentForScope ){
                        list = parentForScope.itemsForProcessingWithParams({descend: true, ...primitive.referenceParameters})
                    }
                }
            }*/
            /*if( asSegment ){
                list = primitive.primitives.allSegment
            }*/
            if( !list || list.length === 0){

                if( props.types ){
                    const types = [props.types].flat()
                    list = primitive.itemsForProcessingWithOptions(undefined, {ignoreFinalViewFilter:true}).filter((d)=>types.includes(d.type) )
                }else{
                    list = primitive.itemsForProcessingWithOptions(undefined, {ignoreFinalViewFilter:true})
                }
            }
        }
        return list.filter((d)=>filters.map((f)=>f(d)).reduce((r,c)=>r && c, true))
    },[primitive.id, update])

    let layers
    const skipFirstLayer =  asSegment && primitive.type !== "segment"
    if( asSegment){
        
        layers = []
        const nextLayer = (list, idx = 0)=>{
            if( !skipFirstLayer || idx > 0){
                layers.push({id: layers.length, title: `Layer ${layers.length + 1}`})
            }
            const thisLevel = list.map((d)=>d.primitives.allSegment).flat()
            
            if( thisLevel.length > 0 ){
                nextLayer( thisLevel, idx + 1 )
            }
        }
        nextLayer( [primitive] )
        layers.push({id: layers.length, title: "All items", items: true})
    }
    const viewAsSegments = asSegment && layers && !layers[layerSelection]?.items

    let items = React.useMemo(()=>{
        console.log(`REDO ITEMS`)

        if( props.compare ){
            console.log(`HARD CODE HYPOTHESIS COMPARE ${primitive.plainId}`)
            return mainstore.primitives().filter(d=>d.type === "evidence" && d.origin?.type === "result")
        }
        let out = baseItems
        let keep = []
        if(layers){
            layerNestPreventionList.current = {}
            const dLayer = layerSelection + (skipFirstLayer ? 1 : 0)
            if( dLayer === 0){
                out = [primitive]
            }
            
           if( dLayer > 1){
                const unpackLayer = (thisLayer)=>{
                    return thisLayer.map((d)=>{
                        const children = d.primitives.allSegment
                        if( children.length > 0){
                            if( d.primitives.ref.allItems.length > 0){
                                if( !keep.find((d2)=>d2.id === d.id) ){
                                    keep.push(d)
                                }
                                layerNestPreventionList.current[d.id] = true
                            }
                            return children
                        }
                        return d
                    }).flat()
                }
                if( layers[layerSelection]?.items){
                    out = baseItems.map((d)=>d.nestedItems).flat()
                }else{
                    
                    for( let a = 0; a < (dLayer - 1); a++){
                        out = MainStore().uniquePrimitives( unpackLayer(out) )
                    }
                }
            }
            console.log(`HAD ${baseItems.length} now ${out.length}`)
        }
        out = out.filter((d)=>!d?.referenceParameters?.duplicate)


        const excluded = ['category', 'activity','task']
        out = out.filter(d=>!excluded.includes(d.type))
        
        setLayerSelection( primitive?.referenceParameters?.explore?.layer ?? 0 )
        setHideNull( primitive?.referenceParameters?.explore?.hideNull )
        setActiveView( primitive?.referenceParameters?.explore?.view  ?? 0)
        setViewPivot( primitive?.referenceParameters?.explore?.viewPivot)
        console.log(`RESET COL AND ROW`)

        return [out,keep].flat()
    },[primitive.id, update, layerSelection])

    
    function doToggleAxis(){
        const newToggle = !axisToggle
        if( newToggle ){
            setColSelection(0)
            setRowSelection(1)
        }else{
            setColSelection(1)
            setRowSelection(0)
        }
        primitive.setField("referenceParameters.explore.axisToggle", newToggle)
        setAxisToggle( newToggle )
    }

    const [axisOptions, viewFilters, liveFilters] = useMemo(()=>{
        const labelled = CollectionUtils.axisFromCollection( items, primitive ).map(d=>{
            const out = {...d}
            if( d.relationship ){
                out.relationship = [d.relationship].flat()//.map(d=>d.split(":")[0])
                out.access = [out.relationship].flat().length
            }
            return out
        })
        
        if( props.compare ){
            setColSelection(1)
            setRowSelection(0)
        }else if(isAggregation ){
            if( axisToggle ){
                setColSelection(0)
                setRowSelection(1)
            }else{
                setColSelection(1)
                setRowSelection(0)
            }
        }else{
            const colSelect = findAxisItem(primitive, "column", labelled )
            const rowSelect =  findAxisItem(primitive, "row", labelled)
            {
                setColSelection(colSelect )
                //const filter = primitive.referenceParameters?.explore?.axis?.column?.filter?.reduce((a,c)=>{a[c === null ? undefined : c] = true; return a}, {}) 
                const filter = decodeFilter(primitive.referenceParameters?.explore?.axis?.column?.filter)
                setColFilter(filter)
            }
            {
                setRowSelection(rowSelect)
                //const filter = primitive.referenceParameters?.explore?.axis?.row?.filter?.reduce((a,c)=>{a[c === null ? undefined : c] = true; return a}, {}) 
                const filter = decodeFilter(primitive.referenceParameters?.explore?.axis?.row?.filter)
                setRowFilter(filter)
            }
            cancelRender = true
        }
        const filters = getExploreFilters( primitive, labelled )
        console.log(filters)

        const liveFilters = CollectionUtils.findLiveFilters( labelled)
        console.log(liveFilters)


        return [labelled, filters, liveFilters]
    }, [primitive.id,  update, layerSelection, importantOnly])




    let [fullList, baseFilters, extentMap] = React.useMemo(()=>{

        
        let {data: interim, extents} = CollectionUtils.mapCollectionByAxis( items, axisOptions[colSelection], axisOptions[rowSelection], viewFilters.map(d=>axisOptions[d.option]), liveFilters, viewPivot )
        let baseFilters = []

        if( viewFilters && viewFilters.length > 0){
            for(const d of viewFilters){
                if(axisOptions[d.option].bucket_min){
                    const ids = Object.keys(d.filter ?? {}).map(d2=>axisOptions[d.option]?.order?.indexOf(d2) ).filter(d=>d !== -1)
                    for( const id of ids){
                        const thisFilter = encodeFilter( axisOptions[d.option], id, true)
                        baseFilters.push( thisFilter )
                    }

                }else{
                    const thisFilter = encodeFilter( axisOptions[d.option], Object.keys(d.filter).map(k=>(k === "_N_" || k === undefined || k === "undefined" || k ==="null")  ? undefined : k ), true)
                    baseFilters.push( thisFilter )
                }
            }
        }

        return [interim, baseFilters, extents]
    },[colSelection, rowSelection, update, updateRel, primitive.id, layerSelection, viewPivot])

    const baseViewConfigs = [
        {id:0, title:"Show items",parameters: {showAsCounts:false}},
        {id:1, title:"Show counts",
            config:{
                "colors":{
                    type: "option_list",
                    title: "Colors",
                    default: "default",
                    options: heatMapPalette.map(d=>({id: d.name, title:d.title}))
                },
                "group_by": {
                    type: "option_list",
                    title:"Range source",
                    default: "all",
                    options: [{
                        id: "all",
                        title: "All data"
                    },{
                        id: "row",
                        title: "Rows"
                    },{
                        id: "col",
                        title: "Columns"
                    }]
                }
            },
            parameters: {
            showAsCounts:true,
            "props": {
                "hideDetails": true,
                "showGrid": false,
                showSummary: true,
                columns: 1,
                fixedWidth: '60rem'
            }            
         }
        },
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

    const renderType = layers?.[layerSelection]?.items ? fullList?.[0]?.primitive?.type :  (props.category?.resultCategoryId !== undefined) ? MainStore().category(props.category?.resultCategoryId).primitiveType  : "default"
    const viewConfigs = fullList?.[0]?.primitive?.metadata?.renderConfig?.explore?.configs ?? baseViewConfigs
    const viewConfig = viewConfigs?.[activeView] 
    const renderProps = viewConfig?.props ?? fullList?.[0]?.primitive?.metadata?.defaultRenderProps ?? defaultRenderProps[renderType ]

    let [list, columnExtents, rowExtents, columnColumns] = React.useMemo(()=>{

        let columns = extentMap.column ?? []
        let rows = extentMap.row ?? []

        let filterApplyColumns = colFilter ? Object.keys(colFilter).filter(d=>colFilter[d]) : []
        let filterApplyRows = rowFilter ? Object.keys(rowFilter).filter(d=>rowFilter[d]) : []

        filterApplyColumns = filterApplyColumns.map(d=>d === "undefined" ? undefined : d)
        filterApplyRows = filterApplyRows.map(d=>d === "undefined" ? undefined : d)


        let filtered = CollectionUtils.filterCollectionAndAxis( fullList, [
            {field: "column", exclude: filterApplyColumns},
            {field: "row", exclude: filterApplyRows},
            ...viewFilters.map((d,i)=>{
                return {field: `filterGroup${i}`, exclude: Object.keys(d.filter).filter(d2=>d.filter[d2] !== undefined).map(d2=>d2 === "undefined" ? undefined : d.filter[d2]) }
            })
        ], {columns, rows, hideNull})

        let list = filtered.data
        columns = filtered.columns
        rows = filtered.rows


        const columSizing = columns.map((col, cIdx)=>{
            const inColumn = list.filter(d=>Array.isArray(d.column) ? d.column.includes(col.idx) : d.column ===  col.idx)
            let spanColumns = undefined
            let spanRows = undefined
            let nestedCount
            if( viewAsSegments || viewConfig?.parameters?.showAsGraph || viewConfig?.parameters?.showAsCounts || viewConfig?.parameters?.showAsSegment ){
                const cc = []
                for(const item of inColumn){
                    const p = item.primitive
                    if( p ){
                        
                        if(renderProps?.columns){
                            if( typeof(renderProps.columns) === "number" ){
                                spanColumns = renderProps.columns
                            }else{
                                nestedCount = layerNestPreventionList.current[p.id] ? p.primitives.ref.allItems.length : p.nestedItems.length
                                let defaultColumns = renderProps.columns.default ?? 1
                                let defaultRows = renderProps.rows?.default ?? defaultColumns 
                                let innerColumns = defaultColumns
                                let collapseCount = 10
                                let visibleCount = nestedCount
                                if(renderProps.itemLimit){
                                    if( typeof( renderProps.itemLimit) === "number"){
                                        collapseCount = renderProps.itemLimit
                                    }
                                    visibleCount = expandState[p.id] ? nestedCount : Math.min( nestedCount, collapseCount)
                                }
                                for(const min of Object.keys(renderProps.columns) ){
                                    if( parseInt(min) < visibleCount ){
                                        innerColumns = renderProps.columns[min]
                                    }
                                }
                                spanColumns = Math.ceil( innerColumns / defaultColumns )
                                spanRows = Math.ceil( visibleCount / innerColumns / defaultRows)
                                console.log(p.plainId, defaultColumns, innerColumns, visibleCount, nestedCount, expandState[p.id], spanColumns, spanRows)
                                cc.push(spanColumns)
                            }
                        }
                    }
                    item.spanColumns = spanColumns      
                    item.spanRows = spanRows
                }
                return Math.max(...cc)
            }else{
                const rowLabels = Object.values(rows).reduce((a,c)=>{a[c?.idx]=true;return a},{})
                const byRows = inColumn.reduce((a,c)=>{
                    if( rowLabels[c?.row ]){
                        a[c.row] = (a[c.row] ?? 0) + 1
                    }
                    return a
                },{} )
                return Math.max(...Object.values(byRows))
            }
        })

        storeCurrentOffset()
        forceUpdateExtent()


        return [
            list,
            columns,
            rows,
            columSizing
        ]
    },[primitive.id, colSelection, rowSelection, update, updateRel, updateNested, hideNull, colFilter ? Object.keys(colFilter).filter(d=>colFilter[d]).join("-") : "", rowFilter ? Object.keys(rowFilter).filter(d=>rowFilter[d]).join("-") : "", Object.keys(expandState).join(",")])
    let fields = list?.[0]?.primitive?.metadata?.defaultRenderProps?.card?.fields ?? ["title", props.fields].flat()
    let originFields = [{contact: "contactName"}]

    function rescaleFonts( scale = true){
        if( gridRef.current ){

            const cHeaderWidth = props.compare ? 300 : 100
            
            const fontScale = scale ? (props.compare ? 1 : Math.max(1, gridRef.current.offsetWidth / 1600 )) : 1
            const fontSize = 14 * fontScale
            myState.current.fontSize = `${fontSize}px`
            myState.current.padding = `${2 * fontScale}px` 
            myState.current.minWidth = `${cHeaderWidth * fontScale }px` 
            
            for(const node of gridRef.current.querySelectorAll('.vfbgtitle')){
                node.style.fontSize = myState.current.fontSize
                node.style.padding = myState.current.padding
                node.style.minWidth = myState.current.minWidth
            }
        }
    }

    const [scale, setScale] = useState(1)
    useLayoutEffect(()=>{
        console.log(`REDO MAIN ZOOM`)
        const lerpSteps = 10
        const cHeaderWidth = props.compare ? 300 : 100
        if( gridRef.current){
            rescaleFonts( false )
            setTimeout(()=>{
                rescaleFonts()
                const gbb = {width: gridRef.current.offsetWidth , height:gridRef.current.offsetHeight }

                const tbb = targetRef.current.getBoundingClientRect()
                
                const border = 20
                
                const scale = Math.min(Math.min( (tbb.width - border) / gbb.width, (tbb.height - border) / gbb.height),1) 
                const x =  -(gbb.width / 2) + (tbb.width / 2 )
                const y =  -(gbb.height /2) + (tbb.height / 2 )
                if(lerpSteps > 0 ){
                    const [lx,ly,ls] = restoreState()
                    let dx = ( x - lx) / lerpSteps
                    let dy = ( y - ly) / lerpSteps
                    let ds = ( scale - ls) / lerpSteps
                    const doStep = (i = 0)=>{
                        gridRef.current.style.transform = `translate(${lx + (dx * i)}px,${ly + (dy * i)}px) scale(${ls + (ds * i)})`
                        if( i < lerpSteps ){
                            i++
                            requestAnimationFrame(()=>{ doStep(i) })
                        }else{
                            setScale(scale)
                        }
                    }
                    doStep()
                }else{
                    gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${scale})`
                    setScale(scale)
                }
            }, primitive.type === "segment" ? 150 : 0)
        }
        
    }, [gridRef.current, primitive.id, /*colSelection, rowSelection*/, selectedCategoryIds, layerSelection, activeView, hideNull, importantOnly, viewPivot])

    useLayoutEffect(()=>{
        if( gridRef.current ){

            rescaleFonts()
            const gbb = {width: gridRef.current.offsetWidth , height:gridRef.current.offsetHeight }
            const tbb = targetRef.current.getBoundingClientRect()
            
            let x, y, scale
            
            if( myState.current.offset ){
                scale = myState.current.offset.scale 
                x =  (gbb.width / 2) * ( scale - 1) + (myState.current.offset.x )
                y =  (gbb.height / 2) * ( scale - 1) + (myState.current.offset.y )
            }else{
                const border = 20
                const toolbarHeight = 56
                scale = Math.min(Math.min( (tbb.width - border) / gbb.width, (tbb.height - border - toolbarHeight) / gbb.height),1) 
                x =  -(gbb.width / 2) + (tbb.width / 2 )
                y =  -(gbb.height /2) + (tbb.height / 2 )
            }
            
            gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${scale})`
        }
    }, [colSelection, rowSelection, updateRel,Object.keys(expandState).join(","), updateExtent])


    function rebuildPrimitivePosition(){
        myState.current.primitivePositions = rebuildPosition('.pcard')
        myState.current.dropsites = rebuildPosition('.dropzone')
    }
    function rebuildPosition(selector){
        if(gridRef.current){
            var gridRect = gridRef.current.getBoundingClientRect();
            const [translateX, translateY, scale] = restoreState()
            const out = []
            for(const node of gridRef.current.querySelectorAll(selector)){
                const bb = node.getBoundingClientRect()
                const x1 = (bb.left - gridRect.left) / scale
                const y1 = (bb.top - gridRect.top) / scale
                const x2 = (bb.right - gridRect.left) / scale
                const y2 = (bb.bottom - gridRect.top) / scale
                
                out.push( {x1: x1, y1: y1, x2: x2, y2: y2, id: node.getAttribute('id'), el: node} )
                //out.push( {x1: node.offsetLeft, y1: node.offsetTop, x2:node.offsetLeft + node.offsetWidth, y2: node.offsetTop + node.offsetHeight, id: node.getAttribute('id'), el: node} )
            }
            return out
        }
    }
    function primitivesAt(x,y, xo, yo){
        if( myState.current.primitivePositions ){
            const results = myState.current.primitivePositions.filter((d)=>(x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2))
            return results
        }
    }

    function dropsAt(x,y){
        if( myState.current.primitivePositions ){
            const results = myState.current.dropsites.filter((d)=>(x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2))
            return results
        }
    }
    function dropZoneToAxis(id){
        return id.split('-')
    }
    async function externalDrop( primitiveId, dropZoneId ){
        const primitive = mainstore.primitive(primitiveId)
        if( primitive ){
                const [ec,er] = dropZoneToAxis(dropZoneId)
                if( props.compare ){
                    const newH = axisOptions[colSelection].type === "parent" ? axisOptions[colSelection].order[ec] : axisOptions[rowSelection].type === "parent" ? axisOptions[rowSelection].order[er] : undefined
                    const newR = axisOptions[colSelection].type === "relationship" ? axisOptions[colSelection].order[ec] : axisOptions[rowSelection].type === "relationship" ? axisOptions[rowSelection].order[er] : undefined
                    if( newH ){
                        if( newR){
                            console.log(`Will add ${primitive.plainId} to ${mainstore.primitive(newH).plainId} at ${newR}`)
                            await mainstore.primitive( newH ).addRelationship( primitive, newR)
                            return true
                        }
                    }
                }else{
                    const target = mainstore.primitive(dropZoneId)
                    if( target ){
                        await target.addRelationship(primitive, "ref")
                    }
                    return true
                }
        }
        return false
    }

    async function updateProcess (  primitive, mode,from, to, axis ){
        const option = axisOptions[mode]
        if( option && axis){
            if( option.type === "category"){
                const fromId = axis[from]?.idx
                if( fromId ){
                    const prim = mainstore.primitive(fromId)
                    if( prim ){
                        await prim.removeRelationship( primitive, 'ref')
                    }
                }
                const toId = axis[to]?.idx
                if( toId ){
                    const prim = mainstore.primitive(toId)
                    if( prim ){
                        await prim.addRelationship( primitive, 'ref')
                    }
                }
            }
        }
    }
    
    async function moveItem(primitiveId, startZone, endZone){
        console.log(`${primitiveId} - >${startZone} > ${endZone}`)
        const primitive = mainstore.primitive(primitiveId)
        if( primitive ){
            if(dropOnGrid){

                if( props.compare ){
                    throw "Not implemented"
                    const [sc,sr] = dropZoneToAxis( startZone )
                    const [ec,er] = dropZoneToAxis( endZone ) 
                    const oldH = axisOptions[colSelection].type === "parent" ? axisOptions[colSelection].order[sc] : axisOptions[rowSelection].type === "parent" ? axisOptions[rowSelection].order[sr] : undefined
                    const newH = axisOptions[colSelection].type === "parent" ? axisOptions[colSelection].order[ec] : axisOptions[rowSelection].type === "parent" ? axisOptions[rowSelection].order[er] : undefined
                    const oldR = axisOptions[colSelection].type === "relationship" ? axisOptions[colSelection].order[sc] : axisOptions[rowSelection].type === "relationship" ? axisOptions[rowSelection].order[sr] : undefined
                    const newR = axisOptions[colSelection].type === "relationship" ? axisOptions[colSelection].order[ec] : axisOptions[rowSelection].type === "relationship" ? axisOptions[rowSelection].order[er] : undefined
                    if( oldH && newH ){
                        if( oldR  ){
                            await mainstore.primitive( oldH ).removeRelationship( primitive, oldR)
                        }
                        if( newR){
                            await mainstore.primitive( newH ).addRelationship( primitive, newR)
                        }
                    }

                }else{
                    const [sc,sr] = dropZoneToAxis( startZone)
                    const [ec,er] = dropZoneToAxis( endZone )
                    if( sc !== ec){
                        await updateProcess(primitive, colSelection, sc, ec, columnExtents)
                    }
                    if( sr !== er){
                        await updateProcess(primitive, rowSelection, sr, er, rowExtents)
                    }
                }
            }else{
                console.log(`looking for direct realtion of ${primitiveId} to ${startZone}`)
                const route = primitive.findRouteToParent( startZone )
                if( route ){
                    const directParent = route.reverse()[0]
                    const target = mainstore.primitive(endZone)
                    if( directParent && target ){
                        if( directParent.id !== target.id ){

                            console.log(`MOVING FROM ${directParent.plainId} > ${target.plainId}`)
                            await directParent.removeRelationship( primitive, 'ref')
                            await target.addRelationship( primitive, 'ref')
                        }else{

                            console.log(`NOT MOVING FROM - IS SAME ${directParent.plainId} > ${target.plainId}`)
                        }

                    }
                    console.log(`Direct is ${directParent.plainId}`)
                }else{
                    console.log(`Couldnt `)
                }         


            }
        }

    }

    async function copyToClipboard(){


        let fields = primitive.referenceParameters?.explore?.exportFields ?? list?.[0]?.primitive?.metadata?.renderConfig?.explore?.exportFields ?? ["text","url", "title", "role","profile"]
        let htmlData = list.map((p)=>{
            let colLabel = p.column?.idx ?? columnExtents.find(d=>d.idx == p.column)?.label
            let rowLabel = p.row?.idx ?? rowExtents.find(d=>d.idx == p.row)?.label
            return [
                p.primitive.plainId,
                fields.map(d=>{
                    let source = p.primitive
                    if( source ){
                        if(d === "title"){
                            return source.title
                        }
                        let parts = d.split(".")
                        if( parts.length > 1){
                            source = source.origin
                            d = parts[1]
                        }
                        if(d === "title"){
                            return source.title
                        }
                        source = source.referenceParameters
                        if( source ){
                            return source[d]
                        }
                    }
                    return ""
                }),
                colLabel,
                rowLabel
            ].flat().map((f)=>`<td>${f}</td>`).join("")                
        }).map((r)=>`<tr>${r}</tr>`).join("")


        let category = list[0].primitive.metadata
        const headers = "<tr>" + [fields.map(d=>category?.parameters?.[d]?.title ?? d), "Axis 1", "Axis 2"].flat().map(d=>`<th>${d}</th>`).join("") +" </tr>"

        htmlData = '<table><tbody>' + headers + htmlData + '</tbody></text>'

        const textarea = document.createElement('template');
        textarea.innerHTML = htmlData.trim()
        const el = textarea.content.childNodes[0]
        document.body.appendChild(el);

        const range = document.createRange();
        const sel = window.getSelection();
        sel.removeAllRanges();
        try {
            range.selectNodeContents(el);
            sel.addRange(range);
        } catch (e) {
            range.selectNode(el);
            sel.addRange(range);
        }
        document.execCommand('copy');
        document.body.removeChild(el);
    }
        

  
    useGesture({
        onClick:(state)=>{
            const clicked = state.event.target.closest('.pcard')
            if( clicked ){
                const id = clicked.getAttribute('id')
                if( id ){
                    state.event.preventDefault()
                    state.event.stopPropagation()
                    if( myState.current.cancelClick ){
                        myState.current.cancelClick = false
                        return
                    }
                    console.log(id)
                    MainStore().sidebarSelect( MainStore().primitive(id), {scope: primitive} )
                }
            }
        },
        onDrag:(state)=>{
            state.event.preventDefault()
            let memo = state.memo
            if( state.first ){
                rebuildPrimitivePosition()
            }
                
            if( state.first || myState.current?.needRecalc){
                const parent=targetRef.current            
                const grid = gridRef.current

                var parentRect = parent.getBoundingClientRect();
                var gridRect = grid.getBoundingClientRect();

                var transformString = window.getComputedStyle(grid).getPropertyValue('transform');
                var transformMatrix = transformString.match(/^matrix\((.+)\)$/)[1].split(',').map(parseFloat);

                memo = {px:parentRect.x, py:parentRect.y, dx:gridRect.x - parentRect.x, dy:gridRect.y - parentRect.y, scale: transformMatrix[0]}
                myState.current.needRecalc = false
            }
            const [mouseX, mouseY] = state.xy
          
            const adjustedX = mouseX - memo.px
            const adjustedY = mouseY - memo.py
            const inGridX= (adjustedX - memo.dx) / memo.scale
            const inGridY = (adjustedY - memo.dy) / memo.scale
          
            if( state.first ){
                const hits = primitivesAt(inGridX, inGridY )
                if( hits && hits.length > 0){

                    const start = dropsAt(inGridX, inGridY )
                    myState.current.dragging = {...hits[0]}
                    if( start && start[0] ){
                        const id = start[0].id
                        if(id){
                            myState.current.dragging.startZone = start[0]
                            if( dropOnGrid ){
                                const [c,r] = dropZoneToAxis(id)
                                if( axisOptions[rowSelection].allowMove !== true || axisOptions[colSelection].allowMove !== true){
                                    myState.current.dragging.constrain = {
                                        col: axisOptions[rowSelection].allowMove ? c : undefined, 
                                        row: axisOptions[colSelection].allowMove ? r : undefined
                                    }
                                }
                            }
                        }

                    }
                    
                    const clone = myState.current.dragging.el.cloneNode(true);
                    clone.style.position = "absolute"
                    clone.style.maxWidth = `${myState.current.dragging.el.offsetWidth}px`
                    clone.style.minWidth = `${myState.current.dragging.el.offsetWidth}px`
                    clone.style.left = `${myState.current.dragging.x1}px`
                    clone.style.top = `${myState.current.dragging.y1}px`
                    clone.style.zIndex = `100`
                    clone.classList.add('shadow-2xl')
                    clone.classList.add('ring')
                    
                    myState.current.dragging.helper = clone
                    myState.current.dragging.el.style.opacity = 0.5
                    myState.current.cancelClick = true

                    myState.current.dragOffset = {
                        x: inGridX - myState.current.dragging.x1,
                        y: inGridY - myState.current.dragging.y1
                    }

                    gridRef.current.appendChild(clone);

                }else{
                    myState.current.dragging = undefined
                }
            }
            if( myState.current?.dragging){
                if( myState.current.dragging.helper){
                    myState.current.dragging.helper.style.left = `${inGridX - myState.current.dragOffset.x}px`
                    myState.current.dragging.helper.style.top = `${inGridY - myState.current.dragOffset.y}px`
                }
                const hits = dropsAt(inGridX, inGridY )
                if( hits && hits.length > 0){
                    const target = hits[0]
                    if( !myState.current.dragging.startZone || target.id !==  myState.current.dragging.startZone.id){
                        const id = target.id
                        if(id){
                            let cancelForConstraints = false
                            
                            if( dropOnGrid){
                                const [c,r] = dropZoneToAxis(id)
                                cancelForConstraints = true
                                if( !myState.current.dragging.constrain ||
                                    ((myState.current.dragging.constrain.col !== undefined && myState.current.dragging.constrain.col === c) ||
                                    (myState.current.dragging.constrain.row !== undefined && myState.current.dragging.constrain.row === r))){
                                        cancelForConstraints = false
                                    }
                            }
                            if( !cancelForConstraints ){
                                if( myState.current.dragging.dropzone && myState.current.dragging.dropzone !== target){
                                    myState.current.dragging.dropzone.el.style.background = null
                                }
                                target.el.style.background = "#6ee7b7"
                                target.el.classList.remove("!bg-ccgreen-50")
                                myState.current.dragging.dropzone = target
                            }
                        }
                    }
                }else{
                    if( myState.current.dragging.dropzone ){
                        myState.current.dragging.dropzone.el.style.background = null
                    }
                    myState.current.dragging.dropzone = undefined
                }

                
            }
            if( state.last ){
                if( myState.current.dragging ){
                    const hits = dropsAt(inGridX, inGridY )
                    if( myState.current.dragging.startZone ){

                        if( hits && hits.length > 0){
                            const target = hits[0]
                            if( !(myState.current.dragging.startZone && target.id ===  myState.current.dragging.startZone.id)){
                                moveItem( myState.current.dragging.id, myState.current.dragging.startZone.id, target.id)
                            }
                        }
                    }
                    if( myState.current.dragging.helper){
                        gridRef.current.removeChild(myState.current.dragging.helper);
                    }
                    if( myState.current.dragging.dropzone ){
                        myState.current.dragging.dropzone.el.style.background = null
                    }
                    myState.current.dragging.dropzone = undefined
                    myState.current.dragging.el.style.opacity = null
                    myState.current.dragging = undefined
                }
            }

            return memo
        },
        onWheel: (state) => {
            if( !state.ctrlKey ){
                const [translateX, translateY, initialScale] = restoreState()

                const x = translateX - ((state.delta[0] ) * 3)
                const y = translateY - ((state.delta[1] )  * 3)
                gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${initialScale})`
                myState.current.needRecalc = true
                state.event.preventDefault()
            }
        },
        onPinch: (state) => {
            state.event.preventDefault()
            let memo = state.memo
            const ox = state.origin[0]
            const oy = state.origin[1]

            if (state.first) {
                const [translateX, translateY, initialScale] = restoreState()

                const { width, height, x, y } = gridRef.current.getBoundingClientRect()
                const tx = ox - (x + width / 2)
                const ty = oy - (y + height / 2)
                memo = [translateX, translateY, tx, ty, initialScale]
            }
            const ms = state.offset[0] / memo[4]
            const x = memo[0] - (ms - 1) * memo[2]
            const y = memo[1] - (ms - 1) * memo[3]


            const thisScale = memo[4] * ms

            gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${thisScale})`
            if( myState.current.needsScaleState ){
                setScale(thisScale)
            }
            myState.current.needRecalc = true

            return memo
        }
    }, {
            target: targetRef,
            eventOptions: { 
                passive: false,
  //              preventDefault: true,
            },
            drag:{
                delay: 150,
                threshold: 10,
                eventOptions: { 
                    passive: false,
//                    
                }

            },
            pinch: {
                from: ()=>{
                    const [translateX, translateY, initialScale] = restoreState()
                    return [initialScale,initialScale]
                },
                scaleBounds: { min: 0.03, max: 8 },
            },
        }
    )


  const filterForCompare = ( subList, axis, idx, other, otherIdx)=>{
    if( axis.type === "parent" ){
        if(  axis.order[idx] ){
            subList = subList.filter((item)=>item.primitive.parentPrimitiveIds?.includes(  axis.order[idx] ))
        }else{
            for( const exclude of axis.order ){
                if( exclude ){
                    subList = subList.filter((item)=>!item.primitive.parentPrimitiveIds?.includes( exclude ))
                }
            }
        }
    }
    if( axis.type === "relationship" && other.type === "parent" ){
        subList = subList.filter(item=>{
            if( item.primitive.parentPrimitiveIds?.includes(  other.order[otherIdx] ) ){
                const relationship = item.primitive.parentRelationship(  other.order[otherIdx] )
                if( relationship.includes(axis.order[idx]) ){
                   return true 
                }else{
                    return false
                }
            }
        })

    }
    return subList

  }



    const options = axisOptions.map((d, idx)=>{return {id: idx, title:d.title}})


    const hasColumnHeaders = !viewConfig?.parameters?.showAsGraph && (props.compare || axisOptions[colSelection]?.type !== "none")
    const hasRowHeaders = !viewConfig?.parameters?.showAsGraph && (props.compare || axisOptions[rowSelection]?.type !== "none")


    

    
    if( myState.current ){
        myState.current.needsScaleState = renderProps?.scales
    }

    useMemo(()=>{
        console.log(`REDO SYNC GRAPH`)

        if(renderProps?.details?.sync){
            renderProps.details["x-axis"].minimum = list.map((d)=>{
                const thisItems = itemsForGraph(renderProps.details.pivot, d.primitive.nestedItems ?? [])
                
                const xs = thisItems.map((d)=>projectData(d, renderProps.details["x-axis"])).flat().filter((d=>d))
                return xs.reduce((a,c)=>!a || c < a ? c : a, undefined)
            }).reduce((a,c)=>!a || c < a ? c : a, undefined)
        }
    },[primitive.id, update, layerSelection])

    const enableClick = !renderProps?.graph


    const dropOnGrid = !viewConfig?.config?.dropOnPrimitive

    const updateImportantOnly = (value)=>{
        setImportantOnly( value )
        forceUpdate()
    }
    const updateViewPivot = (value)=>{
        const pivot = {depth: viewPivotOptions[value]?.id, relationship: viewPivotOptions[value].relationship}
        if( primitive.referenceParameters ){
            primitive.setField(`referenceParameters.explore.viewPivot`, pivot)
        }
        setViewPivot(pivot)
        forceUpdateNested()
    }

    const updateViewMode = (value)=>{
        if( primitive.referenceParameters ){
            primitive.setField(`referenceParameters.explore.view`, value)
        }
        setActiveView(value)
        forceUpdateNested()
    }
    const updateLayer = (value)=>{
        if( primitive.referenceParameters ){
            primitive.setField(`referenceParameters.explore.layer`, value)
        }
        setLayerSelection( value )
        forceUpdateNested()
    }
    const updateHideNull = (value)=>{
        if( primitive.referenceParameters ){
            primitive.setField(`referenceParameters.explore.hideNull`, value)
        }
        setHideNull( value )
        forceUpdateNested()
    }

    const updateAxis = async ( axis, idx, extents )=>{
        const item = axisOptions[idx]
        await CollectionUtils.setPrimitiveAxis(primitive, item, axis, extents)
        if( axis === "column"){
            storeCurrentOffset()
            setColSelection( idx )
            setColFilter( undefined )

        }
        if( axis === "row"){
            setRowSelection( idx )
            setRowFilter( undefined )
        }
    }


    const hasMultipleUnit = rowExtents.length > 1 || columnExtents.length > 1

    const selectedColIdx = props.compare ? 1 : findAxisItem(primitive, "column", axisOptions)
    const selectedRowIdx = props.compare ? 0 : findAxisItem(primitive, "row", axisOptions)
    const columnOverride = props.compare ? 3 : undefined


    const updateAxisFilter = (item, mode, setAll, axisExtents)=>{
        let axis, filter, setter
        console.log(item, mode, setAll)

        const axisSetter = (filter, path)=>{
            if( primitive.referenceParameters ){
                //const keys = Object.keys(filter ?? {}).map(d=>d === "undefined" && (filter[undefined] !== undefined) ? undefined : filter[d] instanceof Object ? filter[d] : filter[d] ? d : undefined ).filter(d=>d)
                const keys = Object.keys(filter ?? {}).map(d=>d === "undefined" && (filter[undefined] !== undefined) ? undefined : filter[d] ).filter(d=>d)
                primitive.setField(path, keys)
            }
            forceUpdateExtent()
        }

        if( mode === "row" ){
            axis = axisOptions[rowSelection]
            filter = rowFilter  
            setter = (filter)=>{
                setRowFilter(filter)
                axisSetter(filter, `referenceParameters.explore.axis.${mode}.filter`)
            }
        }else if(mode === "column"){
            axis = axisOptions[colSelection]
            filter = colFilter  
            //setter = setColFilter
            setter = (filter)=>{
                setColFilter(filter)
                axisSetter(filter, `referenceParameters.explore.axis.${mode}.filter`)
            }
        }else{
            axis = axisOptions[viewFilters[mode].option]
            if( axis ){
                //filter = primitive.referenceParameters?.explore?.filters?.[ mode]?.filter?.reduce((a,c)=>{a[c === null ? undefined : c]=true;return a},{}) || {}
                filter = decodeFilter(primitive.referenceParameters?.explore?.filters?.[ mode]?.filter)
                setter = ( filter )=>{
                    axisSetter(filter, `referenceParameters.explore.filters.${mode}.filter`)
                    forceUpdate()
                }
            }

        }


        storeCurrentOffset()
        filter = filter || {}

        const encodeMap = axisExtents.reduce((a,item)=>{
            if(item.bucket_min !== undefined || item.bucket_max !== undefined ){
                a[item.idx] = {min_value: item.bucket_min, max_value: item.bucket_max, idx: item.idx}
            }else{
                a[item.idx] = item.idx
            }
            return a
        },{})


        if(setAll){
            if( item ){
                //filter = axisExtents?.reduce((a,c)=>{a[c.idx] = true;return a},{})
                filter = encodeMap
            }else{
                filter = {}
            }
        }else{
            if(filter[item] === undefined){
                filter[item] = encodeMap[item]
            }else{
                filter[item] = undefined
            }
        }
        setter( filter )
        
    }
    const deleteViewFilter = (idx)=>{
        const filter = viewFilters[idx]
        let filters = primitive.referenceParameters?.explore?.filters
        filters = filters.filter(d=>d.track !== filter.track )
        
        primitive.setField("referenceParameters.explore.filters", filters)
        forceUpdate()
    }
    const addViewFilter = (item)=>{
        const axis = axisOptions[item]
        if( axis ){
            const filters = primitive.referenceParameters?.explore?.filters ?? []
            const track = (primitive.referenceParameters?.explore?.filterTrack ?? 0) +1
            const newFilter = {
                track: track,
                sourcePrimId: axis.primitiveId,
                type: axis.type,
                subtype: axis.subtype,
                parameter: axis.parameter,
                relationship: axis.relationship,
                access: axis.access,
                value: undefined
            }
            filters.push(newFilter)
            primitive.setField("referenceParameters.explore.filters", filters)
            primitive.setField("referenceParameters.explore.filterTrack", track)
            forceUpdate()
        }
    }

    const axisFilterOptions = (axis, filter)=>{
        
        return [{id:-1,title:"Clear all"}].concat(axis.values.map((d,idx)=>{
            return {
                id:idx, 
                title: axis.labels?.[idx] ??  d, 
                selected: filter === undefined || !filter[idx]
        }}))
    }


//    const rowRemap =  axisOptions[rowSelection]?.order?.map((d,idx)=>((rowFilter && rowFilter[d]) || (hideNull && myState.current?.rowEmpty?.[d])) ? undefined : idx).filter(d=>d!==undefined)
 //   const colRemap =  axisOptions[colSelection]?.order?.map((d,idx)=>((colFilter && colFilter[d]) || (hideNull && myState.current?.columnEmpty?.[d])) ? undefined : idx).filter(d=>d!==undefined)
    const colRemap = columnExtents.map((d,i)=>i)
    const rowRemap = rowExtents.map((d,i)=>i)

    let updateBatch
    useDataEvent("relationship_update", [primitive.id, items.map((d)=>d.id)].flat(), (data)=>{
        if( updateBatch ){
            console.log(`Clearing`)
            clearTimeout(updateBatch)
        }
        updateBatch = setTimeout(() => {
            console.log("RUP")
            storeCurrentOffset()
            forceUpdateRel()
            updateBatch = undefined
        }, 50);
        return false
    })

    //console.log(renderProps)

    let layoutColumns = viewConfig?.parameters?.showAsGraph ? [0] : columnExtents
    let layoutRows = viewConfig?.parameters?.showAsGraph ? [0] : rowExtents

    let viewPivotOptions 
    if( !asSegment && list && list.length > 0 && list[0]?.primitive){
        viewPivotOptions = []
        
        const unpackPath = (relationship, prefix = "")=>{
            let node = list[0].primitive_source ?? list[0].primitive
            let depth = 0
            let path = 0
            do{
                if( path > 0 || relationship === "origin"){

                    if( ["result", "evidence", "entity"].includes(node.type) ){
                        const title = prefix + " > ".repeat(path) + node.metadata?.title ?? node.type
                        viewPivotOptions.push({
                            id: depth,
                            title: title,
                            relationship: relationship
                        })
                        path++
                    }
                }else{
                    path++
                }
                
                node = relationship === "origin" ? node.origin : node.parentPrimitiveRelationships[relationship]?.[0]
                if( node ){
                    if( !["result", "evidence", "entity", "search"].includes(node.type) ){
                        node = undefined
                    }
                }
                depth++
            }while( node )        
        }
        unpackPath('origin')
        unpackPath('link')
        unpackPath('partnership_a', "Partner A")
        unpackPath('partnership_b', "Partner B")


        if( viewPivotOptions.length === 0){
            viewPivotOptions = undefined
        }

    }

    const dataForCanvas = ()=>{
        return {id: primitive.id, title: `${primitive.title} - #${primitive.plainId}`, items: (stageOptions)=>renderMatrix(
            primitive, 
            list, {
                columnExtents: columnExtents, 
                rowExtents: rowExtents, 
                ...stageOptions
            })}
    }

    useImperativeHandle(exportRef, () => {
        return {
            dataForCanvas
        };
      }, []);

    if( props.embed ){
        return <></>
    }


    let selectionForCategory = selectedBox?.infoPane?.filters ? primitive.filterItems(list.map(d=>d.primitive), selectedBox.infoPane.filters).map(d=>d.id).filter((d,i,a)=>a.indexOf(d)===i) : undefined


    let exploreView = <>
        {props.allowedCategoryIds && props.allowedCategoryIds.length > 1 && 
            <div key='control' className='z-20 w-full p-2 sticky top-0 left-0 flex rounded-t-lg bg-gray-50 border-b border-gray-200'>
                <div className='flex place-items-center space-x-2 w-full flex-wrap '>
                    <MyCombo prefix="Showing: " items={props.allowedCategoryIds.map((id)=>mainstore.category(id))} selectedItem={selectedCategoryIds} setSelectedItem={setSelectedCategoryIds} className='w-42'/>
                </div>
            </div>
        }
                <div ref={experiment ? undefined : targetRef} id='explorebase' className='touch-none w-full h-full overflow-x-hidden overflow-y-hidden overscroll-contain relative'>
        {props.closeButton ?? ""}
                    <div key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 top-32 p-1.5 flex flex-col place-items-start space-y-2'>
                        {allowToggleAxis && <DropdownButton noBorder icon={<HeroIcon icon='Angle90' className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={doToggleAxis} className={`hover:text-ccgreen-800 hover:shadow-md ${axisToggle? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!fixAxis && <HierarchyNavigator noBorder icon={<HeroIcon icon='Columns' className='w-5 h-5 '/>} items={CollectionUtils.axisToHierarchy(axisOptions)} flat placement='left-start' portal showTick selectedItemId={axisOptions[colSelection]?.id} action={(d)=>updateAxis("column", d.id, columnExtents)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedColIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!fixAxis && <HierarchyNavigator noBorder icon={<HeroIcon icon='Rows' className='w-5 h-5 '/>} items={CollectionUtils.axisToHierarchy(axisOptions)} flat placement='left-start' portal showTick selectedItemId={axisOptions[rowSelection]?.id} action={(d)=>updateAxis("row", d.id, rowExtents)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedRowIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && layers && layers.length > 1 && <DropdownButton noBorder icon={<HeroIcon icon='Layers' className='w-5 h-5'/>} items={layers} flat placement='left-start' portal showTick selectedItemIdx={layers[layerSelection] ? layerSelection :  0} setSelectedItem={updateLayer} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${layerSelection > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && viewConfigs && <DropdownButton noBorder icon={<HeroIcon icon='Eye' className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>showPane === "view" ? setShowPane(false) : setShowPane("view")} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${hideNull ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && viewPivotOptions && <DropdownButton noBorder icon={<HeroIcon icon='TreeStruct' className='w-5 h-5'/>} items={viewPivotOptions} flat placement='left-start' portal showTick selectedItemIdx={viewPivot} setSelectedItem={updateViewPivot} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${viewPivot > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {<DropdownButton noBorder icon={<FunnelIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>showPane === "filter" ? setShowPane(false) : setShowPane("filter")} className={`hover:text-ccgreen-800 hover:shadow-md ${rowFilter || colFilter ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder title="IMP" items={undefined} flat placement='left-start' onClick={()=>updateImportantOnly(!importantOnly)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${importantOnly ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder title='CF' showTick hideArrow flat items={axisFilterOptions(axisOptions[colSelection], colFilter)} placement='left-start' setSelectedItem={(d)=>updateAxisFilter(d, "column")} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${axisOptions[colSelection].exclude && axisOptions[colSelection].exclude.reduce((a,c)=>a||c,false) ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder title='RF' showTick hideArrow flat items={axisFilterOptions(axisOptions[rowSelection], rowFilter)} placement='left-start' setSelectedItem={(d)=>updateAxisFilter(d, "row" )} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${axisOptions[colSelection].exclude && axisOptions[colSelection].exclude.reduce((a,c)=>a||c,false) ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {<DropdownButton noBorder icon={<SparklesIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>setExperiment(!experiment)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${hideNull ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {(viewConfig?.config?.searchPane || primitive.type === "assessment") && <DropdownButton noBorder icon={<MagnifyingGlassIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>showPane === "search" ? setShowPane(false) : setShowPane("search")} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${hideNull ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                    </div>
                    <div key='export' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 bottom-4 p-0.5 flex flex-col place-items-start space-y-2'>
                        <DropdownButton noBorder icon={<ArrowUpTrayIcon className='w-5 h-5 '/>} 
                        items={[
                            {'title': "Export to PDF", icon: <DocumentArrowDownIcon className='w-5 h-5 mx-1'/>, action: ()=>exportViewToPdf(gridRef.current)},
                            experiment && {'title': "Export to PPTX", icon: <DocumentArrowDownIcon className='w-5 h-5 mx-1'/>, action: ()=> canvas.current ? canvas.current.exportToPptx() : undefined },
                            {'title': "Copy to clipboard", icon: <ClipboardDocumentIcon className='w-5 h-5 mx-1'/>, action: copyToClipboard},
                        ]} 
                        flat placement='left-end' portal className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                    </div>
                    <div key='category_toolbar' className={`bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 left-4 bottom-4 p-0.5 flex flex-col place-items-start space-y-2 ${showCategoryPane ? "w-[28rem]" :""}`}>
                        {showCategoryPane && <PrimitiveCard.Categories primitive={primitive} scope={selectionForCategory} directOnly hidePanel className='px-4 pt-4 pb-2 w-full h-fit'/>}
                        <DropdownButton noBorder icon={showCategoryPane ? <ArrowDownLeftIcon className='w-5 h-5'/> : <HeroIcon icon='Puzzle' className='w-5 h-5 '/>} onClick={()=>setshowCategoryPane(!showCategoryPane)} flat className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                    </div>
                {experiment && <InfiniteCanvas 
                            ref={canvas}
                            update={update + "." + updateRel + "." + updateExtent}
                            primitive={primitive}
                            updateOld={update}
                            updateRel={updateRel}
                            updateExtent={updateExtent}
                            ignoreAfterDrag
                            highlights={{
                                "primitive":"border",
                                "cell":"background"
                            }}
                            selectable={{
                                "primitive":{
                                    multiple: false
                                },
                                "cell":{
                                    multiple: true
                                }
                            }}
                            drag={{
                                "primitive": {
                                    cell:{
                                        start: undefined,
                                        droppable: (id,start, drop)=>{
                                            const [sc,sr] = dropZoneToAxis(start)
                                            const [dc,dr] = dropZoneToAxis(drop)
                                            if( sr != dr && !axisOptions[rowSelection].allowMove){
                                                return false
                                            }
                                            if( sc != dc && !axisOptions[colSelection].allowMove){
                                                return false
                                            }
                                            return true
                                        },
                                        drop: (id, start, drop)=>moveItem(id,start,drop)
                                    }
                                }
                            }}
                            callbacks={{
                                onToggle:async (primitiveId, toggle)=>{
                                    console.log(`Will toggle ${toggle} on ${primitiveId}`)
                                    if( toggle && primitiveId){
                                        const axisValue = extentMap[toggle].filter(d=>d.idx !== "_N_")?.[0]
                                        const target = mainstore.primitive(primitiveId)
                                        const category = mainstore.primitive(axisValue.idx)
                                        let status
                                        if( target && category ){
                                            const currentState = target.parentPrimitiveIds.includes(category.id)
                                            if( currentState ){
                                                await category.removeRelationship(target,"ref")
                                                status = false
                                            }else{
                                                await category.addRelationship(target,"ref")
                                                status = true
                                            }
                                        }
                                        return status
                                    }
                                },
                                onClick:{
                                    canvas: ()=>{
                                        MainStore().sidebarSelect( primitive )
                                    },
                                    primitive:(id)=>{
                                        mainstore.sidebarSelect(id)
                                    },
                                    cell:(id)=>{
                                        const cell = id?.[0]
                                        if( cell ){
                                            const [cIdx,rIdx] = cell.split("-")

                                            let infoPane = {
                                                filters: [
                                                    encodeFilter( axisOptions[colSelection], columnExtents[cIdx] ),
                                                    encodeFilter( axisOptions[rowSelection], rowExtents[rIdx] ),
                                                ].filter(d=>d)
                                            }
                                            MainStore().sidebarSelect( primitive, {
                                                infoPane: infoPane
                                            })
                                        }
                                    }
                                }
                            }}
                            render={[{id: primitive.id, items: (stageOptions)=>renderMatrix(
                                                                primitive, 
                                                                list, {
                                                                    columnExtents: columnExtents, 
                                                                    axis:{
                                                                        column: axisOptions[colSelection],
                                                                        row: axisOptions[rowSelection]
                                                                    },
                                                                    viewConfig: viewConfig,
                                                                    rowExtents: rowExtents, 
                                                                    ...stageOptions,
                                                                    toggles: Object.keys(extentMap).reduce((a,c)=>{
                                                                        if(c.match(/liveFilter/)){
                                                                            a[c] = extentMap[c]
                                                                        }
                                                                        return a}, {})
                                                                })}]}
                />}
                {!experiment &&<div 
                    key={`grid`}
                    ref={gridRef}
                    style = {{
                        gridTemplateColumns: `${hasRowHeaders ? "min-content" : ""} repeat(${layoutColumns.length}, min-content)`,
                        gridTemplateRows: `${hasColumnHeaders ? "min-content" : ""} repeat(${layoutRows.length}, min-content)`
                    }}
                    className={`vfExplorer touch-none grid relative gap-4 w-fit h-fit  ${hasMultipleUnit ? (viewConfig?.parameters?.showAsCounts ? "[&>.vfcell]:p-2" : "[&>.vfcell]:p-8") : ""}`}>
                    {!cancelRender && hasColumnHeaders && <>
                        {hasRowHeaders && <p className='!bg-gray-100'></p>}
                        {layoutColumns.map((col,idx)=>{
                            //console.log(`SETTING HEADER `, myState.current.fontSize )
                            return(
                            <p key={`rt${col?.idx}-${update}-${updateNested}-${updateRel}-${updateExtent}`}
                                style={{
                                    fontSize: myState.current.fontSize ?? '14px',    
                                    minWidth: myState.current.minWidth ?? "100px",    
                                    padding: myState.current.padding ?? "2px",    
                                }}
                                className='touch-none vfbgtitle z-[2] self-stretch w-full h-full flex justify-center place-items-center text-center !bg-gray-100'>
                                    {(col?.label ?? "None")}
                            </p>
                        )})}
                    </>}
                    { !cancelRender && layoutRows.map((row, rIdx)=>{
                        const rFilterIdx = rowFilter === undefined ? rIdx : rowRemap[rIdx]
                        let rowOption = axisOptions[rowSelection]
                        return <React.Fragment>
                            {hasRowHeaders && <p 
                                key={`ct${row?.idx}-${update}-${updateNested}-${updateRel}-${updateExtent}`} 
                                className='touch-none vfbgtitle z-[2] p-2 self-stretch flex justify-center place-items-center text-center !bg-gray-100'>
                                    {
                                        props.compare  && rowOption.type === "parent"
                                        ? (rowOption.order?.[rFilterIdx] ?  <PrimitiveCard compact primitive={mainstore.primitive(rowOption.order[rFilterIdx])} onClick={()=>MainStore().sidebarSelect( mainstore.primitive(rowOption.order[rFilterIdx]) )}/> : "None")
                                        : (row?.label ?? "None")
                                    }
                            </p>}
                            {layoutColumns.map((column, cIdx)=>{
                                let colOption = axisOptions[colSelection]
                                let subList 
                                if( props.compare ){
                                    throw "Not reimplemented"
                                    /*
                                    subList = list
                                    const cFilterIdx = colFilter === undefined ? cIdx : colRemap[cIdx]
                                    subList = filterForCompare( subList, axisOptions[colSelection], cFilterIdx, axisOptions[rowSelection], rFilterIdx)
                                    subList = filterForCompare( subList, axisOptions[rowSelection], rFilterIdx, axisOptions[colSelection], cFilterIdx)*/
                                }else{
                                    subList = list.filter((item)=>(Array.isArray(item.column) ? item.column.includes( column.idx ) : item.column === column.idx) && (Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx))
                                }
                                if( viewConfig?.config?.searchPane ){
                                    subList = subList.sort((a,b)=>a.plainId - b.plainId)
                                }
                                
                                let infoPane = {
                                    filters: [
                                        encodeFilter( colOption, columnExtents[cIdx] ),
                                        encodeFilter( rowOption, rowExtents[rIdx] ),
                                    ].filter(d=>d)
                                }
                                const thisKey = `${column?.idx}-${row?.idx}-${update}-${updateNested}-${updateExtent}`
                                    return <div 
                                            style={
                                            viewAsSegments
                                                ? 
                                                   ( viewConfig?.parameters?.fixedSpan
                                                    ? {
                                                        minWidth: '900px'
                                                        }
                                                    : { 
                                                        display: "grid",
                                                        gridAutoFlow: "dense",
                                                        gridTemplateColumns: `repeat(${Math.max(4, Math.floor(1.5 * Math.sqrt(columnColumns[cIdx])))}, 1fr )`
                                                    })
                                                : {columns: columnOverride ?? Math.max(1, Math.floor(Math.sqrt(columnColumns[cIdx])))}
                                        } 
                                        id={`${cIdx}-${rIdx}`}
                                        data-MYID={thisKey}
                                        key={thisKey}
                                        onClick={(e)=>{
                                            e.stopPropagation();
                                            console.log( infoPane )
                                            setSelectedBox({column: cIdx,row: rIdx, infoPane })
                                            MainStore().sidebarSelect( primitive, {
                                                infoPane: infoPane
                                            })}
                                        }
                                        className={[
                                           'vfcell', 
                                           selectedBox?.column === cIdx && selectedBox?.row === rIdx ? "ring-2 ring-ccgreen-200 !bg-ccgreen-50" : "",
                                            `${dropOnGrid && (colOption?.allowMove || rowOption?.allowMove) ? "dropzone" : ""} ${rowOption.colors ? `bg-${rowOption.colors?.filter((_,idx)=>!rowFilter || !rowFilter[idx])?.[rIdx]}-50` : "bg-gray-50"} z-[2] w-full  p-2 overflow-y-scroll max-h-[inherit] no-break-children touch-none `,
                                            renderProps?.showList || renderProps?.showGrid ? (Math.max(...columnColumns) > 8 ? "gap-12" : "gap-2") : "gap-0"    
                                        ].join(" ")
                                            }>
                                            {viewConfig?.parameters?.showAsCounts 
                                            ? subList.length > 0 ? subList.length : ""
                                            : viewConfig?.parameters?.showAsGraph 
                                                ? <ListGraph data={columnExtents.map(d=>({name: (d?.label ?? d ?? "None"), value: list.filter(d2=>d2.column === (d?.idx ?? d)).length}))} width={renderProps.fixedWidth ?? "96rem"} height={renderProps.fixedHeight ?? renderProps.fixedWidth ?? "96rem"}/>
                                                : viewConfig?.parameters?.showAsSegment
                                                    ? [primitive.primitives.allSegment.find(d=>d.doesImport( primitive.id, infoPane.filters))].map(segment=>{

                                                        if( segment ){
                                                            return <SegmentCard primitive={segment} {...viewConfig.parameters.props}/>
                                                        }
                                                        return <></>
                                                    })
                                                    : subList.map((wrapped, idx)=>{
                                                        let item = wrapped.primitive
                                                        let defaultRender = item.metadata?.defaultRenderProps?.card
                                                        let defaultFields = defaultRender?.fields
                                                        let rProps = props.renderProps || renderProps || {}
                                                        let size = props.asSquare ? {fixedSize: '16rem'} : {fixedWidth: defaultRender?.width ?? ((wrapped.spanColumns || wrapped.spanRows) ? undefined : '16rem')}
                                                        const staggerScale = scale  + (scale / 200 * (idx % 20))
                                                        if( props.render ){
                                                            return props.render( item, staggerScale)
                                                        }
                                                        let spanning = ""
                                                        if( viewConfig?.parameters?.fixedSpan ){
                                                            spanning= 'w-full'
                                                        }
                                                    return renderProps?.simpleRender
                                                        ? <div key={item.id} id={item.id} style={{maxWidth:"16rem",minWidth:"16rem"}} className='pcard hover:ring-2 hover:ring-ccgreen-300 text-md px-2 pt-6 mb-3 bg-white mr-2 mb-2 rounded-lg text-slate-700'><p>{item.title}</p><p className='text-slate-400 text-sm mt-1'>{item.displayType} #{item.plainId}</p></div> 
                                                        : <PrimitiveCard 
                                                            fullId 
                                                            key={item.id} 
                                                            border={false}
                                                            editable={false}
                                                            noEvents
                                                            directOnly={layerNestPreventionList?.current ? layerNestPreventionList.current[item.id] : false}
                                                            primitive={item} 
                                                            scale={staggerScale} 
                                                            fields={defaultFields ?? fields} 
                                                            showAll={expandState[item.id]}
                                                            setShowAll={()=>setExpandState(item.id)}
                                                            spanColumns={wrapped.spanColumns}
                                                            spanRows={wrapped.spanRows}
                                                            columns
                                                            {...size} 
                                                            className={`mr-2 mb-2 touch-none ${spanning} ${viewConfig?.config?.dropOnPrimitive ? "dropzone" : ""}`}
                                                            {...defaultRender || {}}
                                                            {...rProps} 
                                                            />
                                                        })}
                                        </div>
                        })}
                        </React.Fragment>
                    })}
                </div>}
        </div>
        </>

    let filterPane
    if( showPane === "filter"){
        filterPane = []
        const sets = [
            {selection: "column", mode: "column", title: "Columns", setter: setColFilter, list: colFilter},
            {selection: "row", mode: "row", title: "Rows", setter: setRowFilter, list: rowFilter},
            ...viewFilters.map((d,idx)=>({selection:  `filterGroup${idx}`, title: `Filter by ${axisOptions[d.option]?.title}`, deleteIdx: idx, mode: idx, list: d.filter}))
        ]
        sets.forEach(set=>{
            const axis = extentMap[set.selection]
            if(axis){
                filterPane.push(
                    <Panel title={set.title} 
                            deleteButton={
                                set.deleteIdx === undefined
                                    ? undefined
                                    : (e)=>{e.preventDefault();mainstore.promptDelete({message: "Remove filter?", handleDelete:()=>{deleteViewFilter(set.deleteIdx); return true}})}
                            }
                            collapsable>
                        <>
                        <div className='flex space-x-2 justify-end'>
                            <button
                                type="button"
                                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                onClick={()=>updateAxisFilter(false, set.mode, true, axis)}
                            >
                                Select all
                            </button>
                            <button
                                type="button"
                                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                onClick={()=>updateAxisFilter(true, set.mode, true, axis)}
                            >
                                Clear all
                            </button>
                        </div>
                        <div className='space-y-2 divide-y divide-gray-200 flex flex-col bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 mt-2'>
                            {axis.map(d=>{
                                return (
                                <label
                                    className='flex place-items-center '>
                                    <input
                                    aria-describedby="comments-description"
                                    name="comments"
                                    type="checkbox"
                                    checked={!(set.list && set.list[d.idx])}
                                    onChange={()=>updateAxisFilter(d.idx, set.mode, false, axis)}
                                    className="accent-ccgreen-700"
                                />
                                    <p className={`p-2 ${set.list && set.list[d.idx] ? "text-gray-500" : ""}`}>{d.label}</p>
                                </label>
                                )})}
                        </div> 
                        </>
                    </Panel>
                )
            }
        })
    }


    if( true || viewConfig?.config?.searchPane || primitive.type === "assessment"){
        return <div 
            className='flex w-full h-0 grow'
            onClick={(e)=>{
                if( e.target.getAttribute('id') === "explorebase"){
                    setSelectedBox(undefined)
                    MainStore().sidebarSelect( primitive )
                }
            }}
            >
            {exploreView}
            {showPane === "search" && <SearchPane primitive={primitive} dropParent={targetRef} dropCallback={externalDrop}/>}
            {showPane === "view" && <div className="flex flex-col w-[36rem] h-full justify-stretch space-y-1 grow border-l p-3">
                    <UIHelper.OptionList title="View Mode" options={viewConfigs} onChange={(id)=>updateViewMode(viewConfigs.findIndex(d=>d.id === id))} value={viewConfigs[activeView]?.id}/>
                    <div className='w-full text-lg overflow-y-scroll sapce-y-2'>
                        {viewConfig && (!viewConfig.config || viewConfig.config.length === 0) && <p className='text-sm text-gray-500 text-center'>No settings</p>}
                        {viewConfig && viewConfig.config && Object.keys(viewConfig.config).map(d=><UIHelper {...viewConfig.config[d]} value={primitive.renderConfig?.[d]} onChange={async (v)=>{await primitive.setField(`renderConfig.${d}`, v); forceUpdate()}}/>)}
                    </div>
                </div>}
            {showPane === "filter" && 
                <div className="flex flex-col w-[36rem] h-full justify-stretch space-y-1 grow border-l p-3">
                    <div className='w-full p-2 text-lg flex place-items-center'>
                        Filter
                        <HierarchyNavigator noBorder icon={<HeroIcon icon='FunnelPlus' className='w-5 h-5 '/>} items={CollectionUtils.axisToHierarchy(axisOptions)} flat placement='left-start' portal action={(d)=>addViewFilter(d.id)} dropdownWidth='w-64' className='ml-auto hover:text-ccgreen-800 hover:shadow-md'/>
                    </div>
                    <div className='w-full p-2 text-lg overflow-y-scroll'>
                        <TooggleButton title='Hide empty rows / columns' enabled={hideNull} setEnabled={updateHideNull}/>
                        {filterPane}
                    </div>
                </div>}
        </div>
    }
    return exploreView
})

export default PrimitiveExplorer