import MainStore from './MainStore';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ClipboardDocumentIcon, DocumentArrowDownIcon, FunnelIcon, MagnifyingGlassIcon, TrashIcon } from '@heroicons/react/24/outline';
import { PrimitiveCard } from './PrimitiveCard';
//import html2canvas from 'html2canvas';
//import MiroExporter from './MiroExporter'; 
import Panel from './Panel';
import {useGesture, usePinch} from '@use-gesture/react'
import { useLayoutEffect } from 'react';
import useDataEvent from './CustomHook';
import MyCombo from './MyCombo';
import TooggleButton from './ToggleButton';
import { roundCurrency } from './RenderHelpers';
import { itemsForGraph, projectData } from './SegmentCard';
import { exportViewToPdf } from './ExportHelper';
import DropdownButton from './DropdownButton';
import { HeroIcon } from './HeroIcon';
import { SearchPane } from './SearchPane';


const mainstore = MainStore()


    const findAxisItem = (primitive, axis, axisOptions)=>{
        
        if( primitive ){
            const struct = primitive.referenceParameters?.explore?.axis?.[axis]
            if( struct ){
                if(struct.type === "parameter" ){
                    return axisOptions.find(d=>d.type === struct.type && d.parameter === struct.parameter && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
                }else if(struct.type === "title" ){
                    return axisOptions.find(d=>d.type === struct.type &&  (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
                }
                const connectedPrim = primitive.primitives.axis[axis].allIds[0]
                return axisOptions.find(d=>d.type === struct.type && d.primitiveId === connectedPrim && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
            }
            return 0
        }
    }
    const defaultRenderProps = {
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


export default function PrimitiveExplorer({primitive, ...props}){

    const [selectedCategoryIds, setSelectedCategoryIds] = React.useState( props.allowedCategoryIds )
    const [layerSelection, setLayerSelection] = React.useState(primitive?.referenceParameters?.explore?.layer ?? 0)//axisOptions.length > 1 ? 1 : 0)
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [updateRel, forceUpdateRel] = useReducer( (x)=>x+1, 0)
    const [updateNested, forceUpdateNested] = useReducer( (x)=>x+1, 0)
    const [colSelection, setColSelection] = React.useState(undefined)
    const [rowSelection, setRowSelection] = React.useState(undefined)
    const [activeView, setActiveView] = React.useState(primitive?.referenceParameters?.explore?.view ?? 0)
    const layerNestPreventionList = React.useRef()
    const [hideNull, setHideNull]= React.useState(primitive?.referenceParameters?.explore?.hideNull)
    const [showCategoryPane, setshowCategoryPane] = React.useState(false)
    const [showPane, setShowPane] = React.useState(false)
    const [importantOnly, setImportantOnly] = React.useState(true)
    const [colFilter, setColFilter] = React.useState(undefined)
    const [rowFilter, setRowFilter] = React.useState(undefined)
    const targetRef = useRef()
    const gridRef = useRef()
    const myState = useRef({})

    let cancelRender = false

    const restoreState = ()=>{
        const [translateX = 0, translateY = 0] = gridRef.current.style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
        const [scale = 1] = gridRef.current.style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
        return [parseFloat(translateX),parseFloat(translateY),parseFloat(scale)]
    }
    const storeCurrentOffset = ()=>{
        if( gridRef.current){
            const [lx,ly,ls] = restoreState()
            const gbb = {width: gridRef.current.offsetWidth , height:gridRef.current.offsetHeight }
            const tbb = targetRef.current.getBoundingClientRect()

            const x =  -(gbb.width / 2) + (tbb.width / 2 )
            const y =  -(gbb.height /2) + (tbb.height / 2 )
            const rx = lx - x
            const ry  = ly - y
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
        forceUpdate()
        forceUpdateNested()
        return updateFilters()
    }, [selectedCategoryIds])

    
    let baseItems = React.useMemo(()=>{
        //console.log(`REDO BASE`)
        let list
        if( props.list ){
            list = props.list
        }else{
            if( props.types ){
                const types = [props.types].flat()
                list = primitive.itemsForProcessing.filter((d)=>types.includes(d.type) )
            }else{
                list = primitive.itemsForProcessing
            }
        }
        return list.filter((d)=>filters.map((f)=>f(d)).reduce((r,c)=>r && c, true))
    },[primitive.id, update])

    let layers
    const asSegment = primitive.type === "segment" || (props.category && mainstore.category(props.category.resultCategoryId).primitiveType === "segment")
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
        //console.log(`REDO ITEMS`)

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
        console.log(`RESET COL AND ROW`)

        return [out,keep].flat()
    },[primitive.id, update, layerSelection])

    
    useDataEvent("relationship_update", [primitive.id, items.map((d)=>d.id)].flat(), ()=>{
        storeCurrentOffset()
        forceUpdateRel()
    })

    const axisOptions = useMemo(()=>{
        //console.log(`REDO AXIS`)
        if( props.compare ){
            let h_list = primitive.primitives.allUniqueHypothesis
            if( importantOnly ){
                h_list = h_list.filter(d=>d.referenceParameters?.important)
            }
            return [
                {
                    type: "parent",
                    order: [h_list.map(d=>d.id)].flat(), 
                    values: [h_list.map(d=>d.plainId + " " + d.title)].flat(), 
                    labels: [h_list.map(d=>"Hypothesis #" + d.plainId)].flat(), 
                    title: "By hypothesis",
                    allowMove: true
                },
                {
                    type: "relationship",
                    order: [undefined, "candidate", "positive", "negative"],  
                    values: ["None", "Candidate", "Positive", "Negative"],  
                    colors: ["gray", "blue", "green", "amber"],  
                    title: "By relationship",
                    allowMove: true
                }

            ]
        }
        function findCategories( list, access = 0 ){
            const catIds = {}
           // let type
            function topLevelCategory( item ){
                const cats = item.categories
                if( cats.length == 0 || item.referenceId === 54){
                    if( item.type === "category" ){
                        return [item]
                    }                    
                }else{
                    return cats.map((d)=>topLevelCategory(d)).flat()
                }
                return []
            }
            list.forEach((p)=>{
                for(const d of topLevelCategory(p)){
                    if( !catIds[d.id] ){
                        catIds[d.id] = d
                    }
                }
            })
            return Object.values(catIds).map((d)=>{
                const options = d.primitives.allUniqueCategory
                return {
                    type: "category",
                    primitiveId: d.id,
                    category: d,
                    order: [undefined,options.map((d)=>d.id)].flat(),
                    values:["None", options.map((d)=>d.title)].flat(),
                    title: `By ${d.title}`,// (${list.map(d=>d.metadata.title ?? d.type).filter((d,i,a)=>a.indexOf(d)===i).join(", ")})`,
                    allowMove: access === 0,
                    access: d.referenceParameters?.pivot ?? access
                }
            })
        }

        function txParameters(p, access){
            const out = []
            const catIds = p.map((d)=>d.referenceId).filter((v,idx,a)=>a.indexOf(v)=== idx)

            function process(parameters, title){
                if( parameters ){
                    Object.keys(parameters).forEach((parameter)=>{
                        const type = parameters[parameter].type
                        if( parameters[parameter].asAxis === false){
                            //skip
                        }
                        else if( parameters[parameter].excludeFromAggregation ){
                            return
                        }else if( type === "url" ){
                            return
                        }else if( type === "options" ){
                        out.push( {type: 'parameter', parameter: parameter, parameterType: type, title: `${title} - ${parameters[parameter].title}`, access: access, clamp: true})
                        }else  if( type === "currency" ||  type === "number"){
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, title: `${title} - ${parameters[parameter].title}`, access: access, twoPass: true, passType: parameter === "funding" ? "funding" : type})
                        }else if(  type === "contact"){
                            out.push( {type: 'parameter', parameter: "contactName", parameterType: type, title: `${title} - ${parameters[parameter].title}`, access: access})
                        }else{
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, title: `${title} - ${parameters[parameter].title}`, access: access})
                        }
                    })
                }

            }

            catIds.forEach((id)=>{
                const category = MainStore().category(id)
                if( category.primitiveType === "entity" || category.primitiveType === "result" ){
                    out.push( {type: 'title', title: `${category.title} Title`, access: access})
                }
                if( category ){
                    process(category.parameters, category.title) //
                }
            })
            p.map((d)=>d.origin && d.origin.childParameters ? d.origin.id : undefined).filter((d,idx,a)=>d && a.indexOf(d)===idx).forEach((d)=>{
                const o = mainstore.primitive(d)
                process(o.childParameters, o.metadata?.title)
            })

            return out.filter((filter)=>{
                if( filter.type === "parameter" ){
                    return  (p.filter((d)=>["number","string"].includes(typeof(d.referenceParameters[filter.parameter])) || Array.isArray(d.referenceParameters[filter.parameter])).filter((d)=>d !== undefined).length > 0)
                }
                if( filter.type === "title" ){
                    return  (p.filter((d)=>["number","string"].includes(typeof(d.title))).filter((d)=>d !== undefined).length > 0)
                }
                return false
            })
        }

        let out = [{type: "none", title: "None"}]

        const baseCategories = primitive.primitives.allUniqueCategory
        out = out.concat( findCategories( baseCategories ) )

//        out = out.concat( findCategories( items ) )

        if( items ){
            out = out.concat( txParameters( items ) )
            
            const expandOrigin = (nodes, count = 0)=>{
                let out = []
                    const origins = nodes.map((d)=>!d.isTask && d.origin).filter((d)=>d)
                    if( origins.length > 0){
                        out = out.concat( txParameters( origins, count + 1 ) )
//                        out = out.concat( findCategories( origins, count + 1 ))
                        out = out.concat( expandOrigin(origins, count + 1) )
                    }
                    return out
            }
            if( !props.excludeOrigin ){
                //out = out.concat( txParameters( items.map((d)=>d.origin  === primitive ? undefined : d.origin).filter((d)=>d), "origin"  ) )
                out = out.concat( expandOrigin(items) )
                
            }
        }
        const final = out.filter((d, idx, a)=>(d.type !== "category") || (d.type === "category" && a.findIndex((d2)=>(d2.primitiveId === d.primitiveId) && (d.access === d2.access)) === idx))
        const labelled = final.map((d,idx)=>{return {id:idx, ...d}})
        
        if( props.compare ){
            setColSelection(1)
            setRowSelection(0)
        }else{
            const colSelect = findAxisItem(primitive, "column", labelled )
            const rowSelect =  findAxisItem(primitive, "row", labelled)
            console.log(colSelect, rowSelect)
            if( colSelect !== colSelection ){
                setColSelection(colSelect )

                const filter = primitive.referenceParameters?.explore?.filter?.column?.reduce((a,c)=>{a[c === null ? undefined : c] = true; return a}, {}) 
                
            console.log("Load col", filter)

                setColFilter(filter)
                cancelRender = true
            }
            if( rowSelect !== rowSelection ){
                setRowSelection(rowSelect)

                const filter = primitive.referenceParameters?.explore?.filter?.row?.reduce((a,c)=>{a[c === null ? undefined : c] = true; return a}, {}) 
                
                setRowFilter(filter)
                cancelRender = true
            }
        }
        return labelled
    }, [primitive.id, /*update*/, layerSelection, importantOnly])



    const pickProcess = ( mode )=>{
        const option = axisOptions[mode]
        if( option ){
            if( option.type === "category"){
                return (p)=>{
                    let item = p
                    for(let idx = 0; idx < option.access; idx++){
                        item = item.origin
                    }
                    return option.values[Math.max(0,...item.parentPrimitiveIds.map((d)=>option.order?.indexOf(d)).filter((d)=>d !== -1 ))]
                }
            }else if( option.type === "interviewee"){
                return (d)=>d.origin.referenceParameters?.contactName
            }else if( option.type === "title"){
                return (p)=>{
                    let item = p
                    for(let idx = 0; idx < option.access; idx++){
                        item = item.origin
                    }
                    return item.title
                }
            }else if( option.type === "parameter"){
                if( option.parameterType === "options"){
                    return (p)=>{
                        const orderedOptions = p.metadata?.parameters[option.parameter]?.options
                        if( orderedOptions){
                           const values =  [p.referenceParameters[option.parameter]].flat()
                           if( values && values.length > 0){
                                const maxIdx = Math.max(...values.map((d2)=>orderedOptions.indexOf(d2)))
                                return orderedOptions[maxIdx]
                           }else{
                            return p.metadata.parameters[option.parameter].default ?? "None"
                           }
                        }
                        return ""
                    }
                }
                return (d)=> {
                    let item = d
                    for(let idx = 0; idx < option.access; idx++){
                        item = item.origin
                    }
                    return item?.referenceParameters[option.parameter]
                }
            }else if( option.type === "specificity"){
                fields = fields.filter((d)=>d!=="specificity")
                return (d)=> d.referenceParameters?.specificity
            }
        }
        return (p)=>""
    }

    async function updateProcess (  primitive, mode,from, to ){
        const option = axisOptions[mode]
        if( option ){
            if( option.type === "category"){
                console.log(`Moving for ${option.category.title}`)
                
                const fromId = option.order[from]
                if( fromId ){
                    const prim = mainstore.primitive(fromId)
                    if( prim ){
                        await prim.removeRelationship( primitive, 'ref')
                    }
                }
                const toId = option.order[to]
                if( toId ){
                    const prim = mainstore.primitive(toId)
                    if( prim ){
                        await prim.addRelationship( primitive, 'ref')
                    }
                }
            }
        }
    }
    const column = pickProcess( colSelection )
    const row = pickProcess( rowSelection )
    const group = (d)=>d.referenceParameters?.category

    let list = React.useMemo(()=>{
        //console.log(`REDO LIST`)
        const bucket = {
            "funding": (field)=>{
                const brackets = [0,100000,500000,1000000,5000000,15000000,50000000,100000000,200000000,500000000,1000000000]
                interim.forEach((d)=>{
                    d[field] =  brackets.filter((d2)=>d2 < d[field]).length
                })
                const format = brackets.map((d)=>roundCurrency(d))
                return format.map((d,i,a)=>{return {idx: i, label: i === 0 ? "Unknown" : `${a[i-1]} - ${d}` }})
            },
            "currency": (field)=>{
                const brackets = [0,100000,500000,1000000,5000000,15000000,50000000,100000000,200000000,500000000,1000000000]
                interim.forEach((d)=>{
                    d[field]=brackets.filter((d2)=>d2 < d[field]).length
                })
                const format = brackets.map((d)=>roundCurrency(d))
                return format.map((d,i,a)=>{return {idx: i, label: `${i > 0 ? a[i-1] : 0} - ${d}` }})
            },
            "number": (field)=>{
                const minValue = interim.reduce((a,c)=>c[field] < a ? c[field] : a, 0)
                const maxValue = interim.reduce((a,c)=>c[field] > a ? c[field] : a, 0)
                const bucket = (maxValue - minValue) / 5
                interim.forEach((d)=>{
                    d[field] = Math.round((d[field]- minValue) / bucket)
                })
            }
        }


        
        const interim = items.map((p)=>{
            return {
                column: column(p),
                row: row(p),
                group: group(p),
                primitive: p
            }
        })

        if( axisOptions[colSelection]?.twoPass ){
            axisOptions[colSelection].labels = bucket[axisOptions[colSelection].passType]("column") 
        }
        if( axisOptions[rowSelection]?.twoPass ){
            axisOptions[rowSelection].labels = bucket[axisOptions[rowSelection].passType]("row") 
        }

        return interim
    },[colSelection, rowSelection, update, updateRel, items ])


    let fields = ["title", props.fields].flat()
    let originFields = [{contact: "contactName"}]




    const [scale, setScale] = useState(1)
    useLayoutEffect(()=>{
        //console.log(`REDO MAIN ZOOM`)
        const cHeaderWidth = props.compare ? 300 : 100
        if( gridRef.current){
                const fontSize = 14
                myState.current.fontSize = `14px`
                myState.current.padding = `${2}px` 
                myState.current.minWidth = `${cHeaderWidth}px` 
                for(const node of gridRef.current.querySelectorAll('.vfbgtitle')){
                    node.style.fontSize = myState.current.fontSize
                    node.style.padding = myState.current.padding
                    node.style.minWidth = myState.current.minWidth
                }
            setTimeout(()=>{
                gridRef.current.style.transform = `scale(1)`
                const toolbarHeight = 56
                
                //const fontScale = Math.max(1 / 1600  *  gridRef.current.offsetWidth, 1 / 2000  *  gridRef.current.offsetHeight)
                const fontScale = props.compare ? 1 : Math.max(1, gridRef.current.offsetWidth / 1600 )
                const fontSize = 14 * fontScale
                myState.current.fontSize = `${fontSize}px`
                myState.current.padding = `${2 * fontScale}px` 
                myState.current.minWidth = `${cHeaderWidth * fontScale }px` 
                
                for(const node of gridRef.current.querySelectorAll('.vfbgtitle')){
                    node.style.fontSize = myState.current.fontSize
                    node.style.padding = myState.current.padding
                    node.style.minWidth = myState.current.minWidth
                }
                const gbb = {width: gridRef.current.offsetWidth , height:gridRef.current.offsetHeight }

                const tbb = targetRef.current.getBoundingClientRect()
                
                const border = 20
                const tw = tbb.width
                const th = tbb.height 
                
                const scale = Math.min(Math.min( (tbb.width - border) / gbb.width, (tbb.height - border - toolbarHeight) / gbb.height),1) 
                const x =  -(gbb.width / 2) + (tbb.width / 2 )
                const y =  -(gbb.height /2) + (tbb.height / 2 )
                
                gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${scale})`
                setScale(scale)
            }, primitive.type === "segment" ? 150 : 150)
        }
        
    }, [gridRef.current, primitive.id, /*colSelection, rowSelection*/, selectedCategoryIds, layerSelection, activeView, hideNull, importantOnly])

    useLayoutEffect(()=>{
        //console.log(`REDO ADJUST ZOOM`)
        const gbb = {width: gridRef.current.offsetWidth , height:gridRef.current.offsetHeight }
        const tbb = targetRef.current.getBoundingClientRect()

        let x, y, scale

        if( myState.current.offset ){

            
            scale = myState.current.offset.scale 
            x =  myState.current.offset.x -(gbb.width / 2) + (tbb.width / 2 )
            y =  myState.current.offset.y -(gbb.height /2) + (tbb.height / 2 )
        }else{
                const border = 20
                const toolbarHeight = 56
            scale = Math.min(Math.min( (tbb.width - border) / gbb.width, (tbb.height - border - toolbarHeight) / gbb.height),1) 
            x =  -(gbb.width / 2) + (tbb.width / 2 )
            y =  -(gbb.height /2) + (tbb.height / 2 )
        }
        
        gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${scale})`
    }, [colSelection, rowSelection, updateRel,Object.keys(expandState).join(",")])


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
        const [ec,er] = id.split('-')

        const rFilterIdx = rowFilter === undefined ? er : rowRemap[er]
        const cFilterIdx = colFilter === undefined ? ec : colRemap[ec]
        return [cFilterIdx, rFilterIdx]

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
    
    async function moveItem(primitiveId, startZone, endZone){
        console.log(`${primitiveId} - >${startZone} > ${endZone}`)
        const primitive = mainstore.primitive(primitiveId)
        if( primitive ){
            if(dropOnGrid){

                if( props.compare ){
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
                        await updateProcess(primitive, colSelection, sc, ec)
                    }
                    if( sr !== er){
                        await updateProcess(primitive, rowSelection, sr, er)
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
        //let htmlData = list.map((p)=>[p.primitive.plainId,p.primitive.title, p.primitive.origin?.referenceParameters?.contactName || p.primitive.origin.title, p.column, p.row].map((f)=>`<td>${f}</td>`).join("")).map((r)=>`<tr>${r}</tr>`).join("")
        const fList = list.filter(d=>d.row !== "None" && d.column !== "None")
        let htmlData = fList.map((p)=>[p.primitive.plainId,p.primitive.referenceParameters?.text,p.primitive?.referenceParameters?.url, p.primitive.origin?.referenceParameters?.contactName || p.primitive.origin.title, p.primitive.origin?.referenceParameters?.role,p.primitive.origin?.referenceParameters?.profile, p.column, p.row, p.primitive.origin?.linkedInData?.country].map((f)=>`<td>${f}</td>`).join("")).map((r)=>`<tr>${r}</tr>`).join("")
        htmlData = '<table><tbody>' + htmlData + '</tbody></text>'

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
                    myState.current.cancelClick = true
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

    
    const axisExtents = (fieldName, field)=>{
        if( !axisOptions || !axisOptions[field]){return []}
        const filter = fieldName === "column" ? colFilter : rowFilter
        let out

        if( props.compare || axisOptions[field].type === "category" ){
        }else if( axisOptions[field].parameterType === "currency" || axisOptions[field].parameterType === "number" ){
            axisOptions[field].values = axisOptions[field].labels
            out = axisOptions[field].labels
        }else{ 
            
            let values = list.map((d)=>d[fieldName]).filter((v,idx,a)=>a.indexOf(v)===idx).sort()
            axisOptions[field].values = values
            axisOptions[field].order = values
        }
        out = axisOptions[field].values.filter((_,idx)=>!((filter && filter[axisOptions[field].order[idx]]) || (hideNull && myState.current?.[fieldName + "Empty"]?.[axisOptions[field].order[idx]]))) ?? []

        return out
    }


  let [columnExtents, rowExtents] = React.useMemo(()=>{
        return [
            axisExtents("column", colSelection),
            axisExtents("row", rowSelection)
        ]
    },[primitive.id, colSelection, rowSelection, update, hideNull, colFilter ? Object.values(colFilter).join("-") : "", rowFilter ? Object.values(rowFilter).join("-") : ""])
  



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


    const hasColumnHeaders = props.compare || (columnExtents.length > 1)
    const hasRowHeaders = props.compare || (rowExtents.length > 1)


    
    const renderType = layers?.[layerSelection]?.items ? list?.[0]?.primitive?.type :  (props.category?.resultCategoryId !== undefined) ? MainStore().category(props.category?.resultCategoryId).primitiveType  : "default"
    const viewConfigs = list?.[0]?.primitive?.metadata?.renderConfig?.explore?.configs
    const viewConfig = viewConfigs?.[activeView]
    const renderProps = viewConfig?.props ?? defaultRenderProps[renderType ]

    if( myState.current ){
        myState.current.needsScaleState = renderProps?.scales
    }

    const columnColumns = useMemo(()=>{
        return columnExtents.map((col, cIdx)=>{
            const inColumn = list.filter(d=>d.column === (col?.idx ?? col))
            let spanColumns = undefined
            let spanRows = undefined
            let nestedCount
            if( viewAsSegments ){
                const cc = []
                for(const item of inColumn){
                    const p = item.primitive
                    if( p ){
                        
                        nestedCount = layerNestPreventionList.current[p.id] ? p.primitives.ref.allItems.length : p.nestedItems.length
                        if(renderProps?.columns){
                            if( typeof(renderProps.columns) === "number" ){
                            }else{
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
                const byRows = inColumn.reduce((a,c)=>{
                    a[c.row] = (a[c.row] ?? 0) + 1
                    return a
                },{} )
                return Math.max(...Object.values(byRows))
            }
        })

    }, [primitive?.id, updateNested, colSelection, rowSelection])

    useMemo(()=>{

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

    const updateAxis = async ( axis, idx )=>{
        const item = axisOptions[idx]
        if( item.type === "none"){
            primitive.setField(`referenceParameters.explore.axis.${axis}`, null)
        }else if( item.type === "category"){
            if( primitive.referenceParameters ){
                const fullState = {
                    type: "category",
                    access: item.access
                }
                primitive.setField(`referenceParameters.explore.axis.${axis}`, fullState)
                let toRemove = primitive.primitives.axis[axis].allItems.filter(d=>d.id)
                let already = false

                if( toRemove.find(d=>d.id === item.category.id)){
                    already = true
                    toRemove = toRemove.filter(d=>d.id !== item.category.id)
                }
                
                console.log(`removeing old ${toRemove.length}`)
                for(const old of toRemove){
                    console.log(`-- ${old.plainId} / ${old.id}`)
                    await primitive.removeRelationship( old, `axis.${axis}`)
                }
                if( !already ){
                    console.log(`++ ${item.category.plainId} / ${item.category.id}`)
                    await primitive.addRelationship( item.category, `axis.${axis}`)
                }
            }
        }else if( item.type === "title"){
            if( primitive.referenceParameters ){
                const fullState = {
                    type: "title",
                    access: item.access
                }
                primitive.setField(`referenceParameters.explore.axis.${axis}`, fullState)
            }
        }else if( item.type === "parameter"){
            if( primitive.referenceParameters ){
                const fullState = {
                    type: "parameter",
                    parameter:  item.parameter,
                    access: item.access
                }
                primitive.setField(`referenceParameters.explore.axis.${axis}`, fullState)
            }
        }
        primitive.setField(`referenceParameters.explore.filter.${axis}`, [])
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

    const updateAxisFilter = (item, mode, setAll)=>{
        let axis, filter, setter,altAxis, altFilter, altSetter, tester, altEmpty
        console.log(mode)

        if( mode === "row" ){
            axis = axisOptions[rowSelection]
            filter = rowFilter  
            setter = setRowFilter
            altAxis = axisOptions[colSelection]
            altFilter = colFilter
            altSetter = setColFilter
            tester = (item, alt, c) => item.column === alt && !c[item.row]
            altEmpty = "columnEmpty"

        }else if(mode === "column"){
            axis = axisOptions[colSelection]
            filter = colFilter  
            setter = setColFilter
            altAxis = axisOptions[rowSelection]
            altFilter = rowFilter
            altSetter = setRowFilter
            tester = (item, alt, c) => item.row === alt && c.includes(item.column)
            altEmpty = "rowEmpty"

        }else{
            throw "HUH"
        }


        storeCurrentOffset()
        filter = filter || {}
        if(setAll){
            filter = new Array(axis.values.length).fill(true)
        }else{
            filter[item] = !filter[item]
        }
        setter( filter )


        if( primitive.referenceParameters ){
            const keys = Object.keys(filter).map(d=>d === "undefined" && (filter[undefined] !== undefined) ? undefined : d).filter(d=>filter[d])
            primitive.setField(`referenceParameters.explore.filter.${mode}`, keys)
        }
        

        myState.current[ altEmpty ] = {}
        if( altAxis ){
            const allowedValues = axis.order.map((d, idx)=> filter[ d ] ? undefined : axis.values[idx] ).filter(d=>d)
            altAxis.order.forEach((alt,idx)=>{
                if( !altFilter || !altFilter[alt]){
                    const altPresent = list.filter(d=>tester(d, altAxis.values[idx], allowedValues))
                    myState.current[ altEmpty ][alt] = altPresent.length === 0
                }
            })
        }

        forceUpdateRel()
        forceUpdateNested()

    }

    const axisFilterOptions = (axis, filter)=>{
        
        return [{id:-1,title:"Clear all"}].concat(axis.values.map((d,idx)=>{
            return {
                id:idx, 
                title: axis.labels?.[idx] ??  d, 
                selected: filter === undefined || !filter[idx]
        }}))
    }


    const rowRemap =  axisOptions[rowSelection]?.order?.map((d,idx)=>((rowFilter && rowFilter[d]) || (hideNull && myState.current?.rowEmpty?.[d])) ? undefined : idx).filter(d=>d!==undefined)
    const colRemap =  axisOptions[colSelection]?.order?.map((d,idx)=>((colFilter && colFilter[d]) || (hideNull && myState.current?.columnEmpty?.[d])) ? undefined : idx).filter(d=>d!==undefined)

    const exploreView = 
    <>
        {props.allowedCategoryIds && props.allowedCategoryIds.length > 1 && 
            <div key='control' className='z-20 w-full p-2 sticky top-0 left-0 flex rounded-t-lg bg-gray-50 border-b border-gray-200'>
                <div className='flex place-items-center space-x-2 w-full flex-wrap '>
                    <MyCombo prefix="Showing: " items={props.allowedCategoryIds.map((id)=>mainstore.category(id))} selectedItem={selectedCategoryIds} setSelectedItem={setSelectedCategoryIds} className='w-42'/>
                </div>
            </div>
        }
                <div ref={targetRef} className='touch-none w-full h-full overflow-x-hidden overflow-y-hidden overscroll-contain relative'>
        {props.closeButton ?? ""}
                    <div key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 top-32 p-1.5 flex flex-col place-items-start space-y-2'>
                        {!props.compare && axisOptions && <DropdownButton noBorder icon={<HeroIcon icon='Columns' className='w-5 h-5 '/>} items={axisOptions} flat placement='left-start' portal showTick selectedItemIdx={selectedColIdx} setSelectedItem={(d)=>updateAxis("column", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedColIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && axisOptions && <DropdownButton noBorder icon={<HeroIcon icon='Rows' className='w-5 h-5'/>} items={axisOptions} flat placement='left-start' portal showTick selectedItemIdx={selectedRowIdx} setSelectedItem={(d)=>updateAxis("row", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedRowIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && layers && layers.length > 1 && <DropdownButton noBorder icon={<HeroIcon icon='Layers' className='w-5 h-5'/>} items={layers} flat placement='left-start' portal showTick selectedItemIdx={layers[layerSelection] ? layerSelection :  0} setSelectedItem={updateLayer} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${layerSelection > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && viewConfigs && <DropdownButton noBorder icon={<HeroIcon icon='Eye' className='w-5 h-5'/>} items={viewConfigs} flat placement='left-start' portal showTick selectedItemIdx={activeView} setSelectedItem={updateViewMode} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${activeView > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {<DropdownButton noBorder icon={<FunnelIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>showPane === "filter" ? setShowPane(false) : setShowPane("filter")} className={`hover:text-ccgreen-800 hover:shadow-md ${rowFilter || colFilter ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder title="IMP" items={undefined} flat placement='left-start' onClick={()=>updateImportantOnly(!importantOnly)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${importantOnly ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder title='CF' showTick hideArrow flat items={axisFilterOptions(axisOptions[colSelection], colFilter)} placement='left-start' setSelectedItem={(d)=>updateAxisFilter(d, "column")} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${axisOptions[colSelection].exclude && axisOptions[colSelection].exclude.reduce((a,c)=>a||c,false) ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder title='RF' showTick hideArrow flat items={axisFilterOptions(axisOptions[rowSelection], rowFilter)} placement='left-start' setSelectedItem={(d)=>updateAxisFilter(d, "row" )} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${axisOptions[colSelection].exclude && axisOptions[colSelection].exclude.reduce((a,c)=>a||c,false) ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {(viewConfig?.config?.searchPane || primitive.type === "assessment") && <DropdownButton noBorder icon={<MagnifyingGlassIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>showPane === "search" ? setShowPane(false) : setShowPane("search")} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${hideNull ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                    </div>
                    <div key='export' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 bottom-4 p-0.5 flex flex-col place-items-start space-y-2'>
                        <DropdownButton noBorder icon={<ArrowUpTrayIcon className='w-5 h-5 '/>} 
                        items={[
                            {'title': "Export to PDF", icon: <DocumentArrowDownIcon className='w-5 h-5 mx-1'/>, action: ()=>exportViewToPdf(gridRef.current)},
                            {'title': "Copy to clipboard", icon: <ClipboardDocumentIcon className='w-5 h-5 mx-1'/>, action: copyToClipboard},
                        ]} 
                        flat placement='left-end' portal className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                    </div>
                    <div key='category_toolbar' className={`bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 left-4 bottom-4 p-0.5 flex flex-col place-items-start space-y-2 ${showCategoryPane ? "w-[28rem]" :""}`}>
                        {showCategoryPane && <PrimitiveCard.Categories primitive={primitive} directOnly hidePanel className='px-4 pt-4 pb-2 w-full h-fit'/>}
                        <DropdownButton noBorder icon={showCategoryPane ? <ArrowDownLeftIcon className='w-5 h-5'/> : <HeroIcon icon='Puzzle' className='w-5 h-5 '/>} onClick={()=>setshowCategoryPane(!showCategoryPane)} flat className={`hover:text-ccgreen-800 hover:shadow-md`}/>
                    </div>
                <div 
                    key={`grid`}
                    ref={gridRef}
                    style = {{
//                        transformOrigin: "top left",
                        gridTemplateColumns: `${hasRowHeaders ? "min-content" : ""} repeat(${columnExtents.length}, min-content)`,
                        gridTemplateRows: `${hasColumnHeaders ? "min-content" : ""} repeat(${rowExtents.length}, min-content)`
                    }}
                    //className={`vfExplorer touch-none grid relative gap-4 w-fit h-fit [&>*]:bg-gray-50 ${hasMultipleUnit ? "[&>*]:p-8" : ""}`}>
                    className={`vfExplorer touch-none grid relative gap-4 w-fit h-fit  ${hasMultipleUnit ? "[&>.vfcell]:p-8" : ""}`}>
                    {!cancelRender && hasColumnHeaders && <>
                        {hasRowHeaders && <p className='!bg-gray-100'></p>}
                        {columnExtents.map((col,idx)=>{
                            const cFilterIdx = colFilter === undefined ? idx : colRemap[idx]
                            return(
                            <p key={`rt${idx}-${update}-${updateNested}-${updateRel}-${colSelection}-${rowSelection}`}
                                style={{
                                    fontSize: myState.current.fontSize ?? '14px',    
                                    minWidth: myState.current.minWidth ?? "100px",    
                                    minWidth: myState.current.padding ?? "2px",    
                                }}
                                className='touch-none vfbgtitle z-[2] self-stretch w-full h-full flex justify-center place-items-center text-center !bg-gray-100'>
                                    {
                                        props.compare  && axisOptions[colSelection].type === "parent"
                                        ? (axisOptions[colSelection].order[cFilterIdx] ?  <PrimitiveCard textSize='lg' compact primitive={mainstore.primitive(axisOptions[colSelection].order[cFilterIdx])} onClick={()=>MainStore().sidebarSelect( mainstore.primitive(axisOptions[colSelection].order[cFilterIdx]) )}/> : "None")
                                        : (col?.label ?? col ?? "None")
                                    }
                            </p>
                        )})}
                    </>}
                    { !cancelRender && rowExtents.map((row, rIdx)=>{
                        const rFilterIdx = rowFilter === undefined ? rIdx : rowRemap[rIdx]
                        let rowOption = axisOptions[rowSelection]
                        return <React.Fragment>
                            {hasRowHeaders && <p 
                                key={`ct${rIdx}-${update}-${updateNested}-${updateRel}`} 
                                className='touch-none vfbgtitle z-[2] p-2 self-stretch flex justify-center place-items-center text-center !bg-gray-100'>
                                    {
                                        props.compare  && rowOption.type === "parent"
                                        ? (rowOption.order[rFilterIdx] ?  <PrimitiveCard compact primitive={mainstore.primitive(rowOption.order[rFilterIdx])} onClick={()=>MainStore().sidebarSelect( mainstore.primitive(rowOption.order[rFilterIdx]) )}/> : "None")
                                        : (row?.label ?? row ?? "None")
                                    }
                            </p>}
                            {columnExtents.map((column, cIdx)=>{
                                let colOption = axisOptions[colSelection]
                                let subList 
                                if( props.compare ){
                                    subList = list
                                    const cFilterIdx = colFilter === undefined ? cIdx : colRemap[cIdx]
                                    subList = filterForCompare( subList, axisOptions[colSelection], cFilterIdx, axisOptions[rowSelection], rFilterIdx)
                                    subList = filterForCompare( subList, axisOptions[rowSelection], rFilterIdx, axisOptions[colSelection], cFilterIdx)
                                }else{
                                    subList = list.filter((item)=>item.column === (column?.idx ?? column) && item.row === (row?.idx ?? row))
                                }
                                let spanning = ""
                                    if( viewAsSegments ){
                                        //subList = subList.sort((a,b)=>b.nestedCount - a.nestedCount )
                                    }else{
                                        subList = subList.sort((a,b)=>a.primitive.referenceParameters.scale - b.primitive.referenceParameters.scale).reverse()
                                    }
                                if( viewConfig?.config?.searchPane ){
                                    subList = subList.sort((a,b)=>a.plainId - b.plainId)
                                }
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
                                        id={`${cIdx}-${rIdx}-${update}-${updateNested}-${updateRel}`}                                        
                                        key={`${cIdx}-${rIdx}-${update}-${updateNested}-${updateRel}`}                                        
                                        className={[
                                           'vfcell', 
                                            `${dropOnGrid && (colOption?.allowMove || rowOption?.allowMove) ? "dropzone" : ""} ${rowOption.colors ? `bg-${rowOption.colors?.filter((_,idx)=>!rowFilter || !rowFilter[idx])?.[rIdx]}-50` : "bg-gray-50"} z-[2] w-full  p-2 overflow-y-scroll max-h-[inherit] no-break-children touch-none `,
                                            renderProps?.showList || renderProps?.showGrid ? (Math.max(...columnColumns) > 8 ? "gap-12" : "gap-2") : "gap-0"    
                                        ].join(" ")
                                            }>
                                            {subList.map((wrapped, idx)=>{
                                                let item = wrapped.primitive
                                                let defaultRender = item.metadata?.defaultRenderProps?.card
                                                let defaultFields = defaultRender?.fields
                                                let size = props.asSquare ? {fixedSize: '16rem'} : {fixedWidth:'16rem'}
                                                let sz = Math.floor((parseInt(item.referenceParameters.scale ** 2) / 81) * 6) + 0.5
                                                const staggerScale = scale  + (scale / 200 * (idx % 20))
                                                let style = {}
                                                if( props.render ){
                                                    return props.render( item, staggerScale)
                                                }
                                                let spanning = ""
                                                if( viewConfig?.parameters?.fixedSpan ){
                                                    spanning= 'w-full'
                                                }
                                                /*
                                                let spanColumns = undefined
                                                let spanRows = undefined
                                                if(renderProps?.columns){
                                                    if( typeof(renderProps.columns) === "number" ){
                                                    }else{
                                                        let defaultColumns = renderProps.columns.default ?? 1
                                                        let defaultRows = renderProps.rows?.default ?? defaultColumns 
                                                        let innerColumns = defaultColumns
                                                        let collapseCount = 10
                                                        if(renderProps.itemLimit){
                                                            if( typeof( renderProps.itemLimit) === "number"){
                                                                collapseCount = renderProps.itemLimit
                                                            }
                                                        }
                                                        const visibleCount = expandState[item.id] ? wrapped.nestedCount : Math.min( wrapped.nestedCount, collapseCount)
                                                        for(const min of Object.keys(renderProps.columns) ){
                                                            if( parseInt(min) < visibleCount ){
                                                                innerColumns = renderProps.columns[min]
                                                            }
                                                        }
                                                        spanColumns = Math.ceil( innerColumns / defaultColumns )
                                                        spanRows = Math.floor( visibleCount / innerColumns / defaultRows)
                                                    }
                                                }
                                                */
                                            return <PrimitiveCard 
                                                fullId 
                                                key={item.id} 
                                                border={false} 
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
                                                {...(props.renderProps || renderProps || {})} 
                                                onInnerCardClick={ (e, p)=>{
                                                    if( myState.current?.cancelClick ){
                                                        myState.current.cancelClick = false
                                                        return
                                                    }
                                                    MainStore().sidebarSelect( p, {scope: item} )
                                                }}
                                                onClick={ enableClick ? (e, p)=>{
                                                    if( myState.current?.cancelClick ){
                                                        myState.current.cancelClick = false
                                                        return
                                                    }
                                                    MainStore().sidebarSelect( p, {scope: primitive, context: {column: column?.label ?? column ?? "None", row: row?.label ?? row ?? "None"}} )
                                                } : undefined}/>
                                            })}
                                        </div>
                        })}
                        </React.Fragment>
                    })}
                </div>
        </div>
        </>

    let filterPane
    if( showPane === "filter"){
        filterPane = []
        const sets = [
            {selection: colSelection, mode: "column", title: "Columns", setter: setColFilter, list: colFilter},
            {selection: rowSelection, mode: "row", title: "Rows", setter: setRowFilter, list: rowFilter},
        ]
        sets.forEach(set=>{
            const axis = axisOptions[set.selection]
            if(axis && axis.values){
                filterPane.push(
                    <Panel title={set.title} collapsable>
                        <div className='space-y-2 divide-y divide-gray-200 flex flex-col bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 mt-2'>
                            {axis.values.map((d,idx)=>{
                                const id = axis.order[idx]
                                return (
                                <label
                                    className='flex place-items-center '>
                                    <input
                                    aria-describedby="comments-description"
                                    name="comments"
                                    type="checkbox"
                                    checked={!(set.list && set.list[id])}
                                    onChange={()=>updateAxisFilter(id, set.mode)}
                                    className="accent-ccgreen-700"
                                />
                                    <p className={`p-2 ${set.list && set.list[id] ? "text-gray-500" : ""}`}>{d}</p>
                                </label>
                                )})}
                        </div> 
                    </Panel>
                )
            }
        })
    }


    if( true || viewConfig?.config?.searchPane || primitive.type === "assessment"){
        return <div className='flex w-full h-0 grow'>
            {exploreView}
            {showPane === "search" && <SearchPane primitive={primitive} dropParent={targetRef} dropCallback={externalDrop}/>}
            {showPane === "filter" && 
                <div className="flex flex-col w-[36rem] h-full justify-stretch space-y-1 grow border-l p-3">
                    <div className='w-full p-2 text-lg'>
                        Filter
                    </div>
                    <div className='w-full p-2 text-lg overflow-y-scroll'>
                        <TooggleButton title='Hide empty rows / columns' enabled={hideNull} setEnabled={updateHideNull}/>
                        {filterPane}
                    </div>
                </div>}
        </div>
    }
    return exploreView
}