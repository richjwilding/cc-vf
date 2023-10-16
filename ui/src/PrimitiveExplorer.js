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
                }
                const connectedPrim = primitive.primitives.axis[axis].allIds[0]
                return axisOptions.find(d=>d.type === struct.type && d.primitiveId === connectedPrim && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
            }
            return 0
        }
    }


export default function PrimitiveExplorer({primitive, ...props}){

    const [selectedCategoryIds, setSelectedCategoryIds] = React.useState( props.allowedCategoryIds )
    const [layerSelection, setLayerSelection] = React.useState(0)//axisOptions.length > 1 ? 1 : 0)
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [colSelection, setColSelection] = React.useState(0)
    const [rowSelection, setRowSelection] = React.useState(props.compare ? 1 : 0)//axisOptions.length > 1 ? 1 : 0)
    const [activeView, setActiveView] = React.useState(0)
    const layerNestPreventionList = React.useRef()
    const [hideNull, setHideNull]= React.useState(primitive?.referenceParameters?.explore?.hideNull)
    const [showCategoryPane, setshowCategoryPane] = React.useState(false)
    const [showSearchPane, setShowSearchPane] = React.useState(false)
    const [importantOnly, setImportantOnly] = React.useState(true)
    const [colFilter, setColFilter] = React.useState(undefined)
    const [rowFilter, setRowFilter] = React.useState(undefined)


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
        return updateFilters()
    }, [selectedCategoryIds])



    
    let baseItems = React.useMemo(()=>{
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
        console.log(`pre - ${list.length}`)
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

    let items = React.useMemo(()=>{
        if( props.compare ){
            console.log(`HARD CODE HYPOTHESIS COMPARE ${primitive.plainId}`)
            return mainstore.primitives().filter(d=>d.type === "evidence" && d.origin?.type === "result")
        }
        console.log(`REDO FOR ${primitive.plainId}`)
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

        return [out,keep].flat()
    },[primitive.id, update, layerSelection])
    
    useDataEvent("relationship_update", [primitive.id, items.map((d)=>d.id)].flat(), forceUpdate)

    const axisOptions = useMemo(()=>{
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
            //list.filter(d=>d.type!=='category').forEach((p)=>{
            list.forEach((p)=>{
                console.log(p)
                //type = type || d.metadata.title
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
                if( category ){

                    process(category.parameters, category.title) //
                }
            })
            p.map((d)=>d.origin && d.origin.childParameters ? d.origin.id : undefined).filter((d,idx,a)=>d && a.indexOf(d)===idx).forEach((d)=>{
                const o = mainstore.primitive(d)
                process(o.childParameters, o.metadata?.title)
            })

            return out.filter((filter)=>{
                return p.filter((d)=>["number","string"].includes(typeof(d.referenceParameters[filter.parameter])) || Array.isArray(d.referenceParameters[filter.parameter])).filter((d)=>d !== undefined).length > 0
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
        console.log(out)
        const final = out.filter((d, idx, a)=>(d.type !== "category") || (d.type === "category" && a.findIndex((d2)=>(d2.primitiveId === d.primitiveId) && (d.access === d2.access)) === idx))
        const labelled = final.map((d,idx)=>{return {id:idx, ...d}})

        if( props.compare ){
            setColSelection(1)
            setRowSelection(0)
        }else{
            setColSelection( findAxisItem(primitive, "column", labelled ))
            setRowSelection( findAxisItem(primitive, "row", labelled))
        }
        return labelled
    }, [primitive.id, update, layerSelection, importantOnly])



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
                
                if( from ){
                    const prim = option.category.primitives.allUniqueCategory.find((d)=>d.title === from)
                    if( prim ){
                        await prim.removeRelationship( primitive, 'ref')
                    }
                }
                if( to ){
                    const prim = option.category.primitives.allUniqueCategory.find((d)=>d.title === to)
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
                console.log(minValue, maxValue, bucket)
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
        },[colSelection, rowSelection, update, items])

    let fields = ["title", props.fields].flat()
    let originFields = [{contact: "contactName"}]


    const targetRef = useRef()
    const gridRef = useRef()
    const myState = useRef({})

    const restoreState = ()=>{
        const [translateX = 0, translateY = 0] = gridRef.current.style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
        const [scale = 1] = gridRef.current.style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
        return [parseFloat(translateX),parseFloat(translateY),parseFloat(scale)]
    }

    const [scale, setScale] = useState(1)
    useLayoutEffect(()=>{
        const cHeaderWidth = props.compare ? 300 : 100
        if( gridRef.current){
                const fontSize = 14
                for(const node of gridRef.current.querySelectorAll('.vfbgtitle')){
                    node.style.fontSize = `${fontSize}px`
                    node.style.padding = `2px`
                    node.style.minWidth = `${cHeaderWidth}px`
                }
            setTimeout(()=>{
                gridRef.current.style.transform = `scale(1)`
                const toolbarHeight = 56
                
                //const fontScale = Math.max(1 / 1600  *  gridRef.current.offsetWidth, 1 / 2000  *  gridRef.current.offsetHeight)
                const fontScale = props.compare ? 1 : Math.max(1, gridRef.current.offsetWidth / 1600 )
                const fontSize = 14 * fontScale
                console.log(fontScale, gridRef.current)
                
                for(const node of gridRef.current.querySelectorAll('.vfbgtitle')){
                    node.style.fontSize = `${fontSize}px`
                    node.style.padding = `${2 * fontScale}px`
                    node.style.minWidth = `${cHeaderWidth * fontScale }px`
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

    }, [gridRef.current, primitive.id, colSelection, rowSelection, selectedCategoryIds, /*update,*/ layerSelection, activeView, hideNull, importantOnly])

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
        console.log(`${ec} -> ${cFilterIdx} / ${er} -> ${rFilterIdx}`)
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

                const [sc,sr] = dropZoneToAxis( startZone )//.split('-')
                const [ec,er] = dropZoneToAxis( endZone ) //.split('-')
                if( props.compare ){
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
                    if( sc !== ec){
                        await updateProcess(primitive, colSelection, columnExtents[sc], columnExtents[ec])
                    }
                    if( sr !== er){
                        await updateProcess(primitive, rowSelection, rowExtents[sr], rowExtents[er])
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
        let htmlData = list.map((p)=>[p.primitive.plainId,p.primitive.title, p.primitive.origin?.referenceParameters?.contactName || p.primitive.origin.title, p.column, p.row].map((f)=>`<td>${f}</td>`).join("")).map((r)=>`<tr>${r}</tr>`).join("")
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
                                const [c,r] = dropZoneToAxis(id)//.split('-')
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
                                const [c,r] = dropZoneToAxis(id)//.split('-')
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
            if(!props.compare){
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
        if( props.compare ){
            const filter = fieldName === "column" ? colFilter : rowFilter
            return axisOptions[field].values.filter((_,idx)=>!filter || !filter[idx]) ?? []
        }
        if( !axisOptions || !axisOptions[field]){return []}
        if( axisOptions[field].type === "category" ){
            let base = axisOptions[field].values
            if( hideNull ){
                if( base.length > 1) {
                    return base.filter(d=>d!=="None")
                }
            }
            return base
        }
        if( axisOptions[field].parameterType === "currency" || axisOptions[field].parameterType === "number" ){
            return axisOptions[field].labels
        }
        let values = list.map((d)=>d[fieldName]).filter((v,idx,a)=>a.indexOf(v)===idx)
        if( hideNull && values.length > 1) {
            values = values.filter(d=>d!=="" && d)
        }
        return values.sort()
    }


  let columnExtents = React.useMemo(()=>{
        return axisExtents("column", colSelection)
    },[primitive.id, colSelection, rowSelection, update, hideNull])
  
   let rowExtents = React.useMemo(()=>{
        return axisExtents("row", rowSelection)
    },[primitive.id, colSelection, rowSelection, update, hideNull])



  const colors = ["ccgreen","rose","ccpurple","amber","cyan","fuchsia", "ccblue", "orange","lime","cyan","indigo"] 



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

  const columnColumns = columnExtents.map((col)=>{
      return Math.max(...Object.values(list.filter((d)=>d.column == (col?.idx ?? col)).reduce((o, d)=>{
                                                o[d.row?.idx ?? d.row] = (o[d.row?.idx ?? d.row] || 0) + ((hideNull && d.row === "None") ? 0 : 1)
                                                return o
                                            },{})))
    })

    const options = axisOptions.map((d, idx)=>{return {id: idx, title:d.title}})


    const hasColumnHeaders = props.compare || (columnExtents.length > 1)
    const hasRowHeaders = props.compare || (rowExtents.length > 1)


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
    
    const renderType = layers?.[layerSelection]?.items ? list?.[0]?.primitive?.type :  (props.category?.resultCategoryId !== undefined) ? MainStore().category(props.category?.resultCategoryId).primitiveType  : "default"
    const viewAsSegments = asSegment && layers && !layers[layerSelection]?.items
    const viewConfigs = list?.[0]?.primitive?.metadata?.renderConfig?.explore?.configs
    const viewConfig = viewConfigs?.[activeView]
    const renderProps = viewConfig?.props ?? defaultRenderProps[renderType ]

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

    const updateHideNull = (value)=>{
        if( primitive.referenceParameters ){
            primitive.setField(`referenceParameters.explore.hideNull`, value)
        }
        setHideNull( value )
    }

    const updateAxis = async ( axis, idx )=>{
        const item = axisOptions[idx]
        console.log(axis, item)
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
        if( axis === "column"){
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

    const updateAxisFilter = (item, axis, filter, setter)=>{
        filter = filter || (new Array(axis.values.length).fill(false))
        if(item === 0){
            filter = new Array(axis.values.length).fill(true)
        }else{
            item--
            filter[item] = !filter[item]
        }
        setter( filter )
        forceUpdate()
    }

    const axisFilterOptions = (axis, filter)=>{
        
        return [{id:-1,title:"Clear all"}].concat(axis.values.map((d,idx)=>{
            return {
                id:idx, 
                title: axis.labels?.[idx] ??  d, 
                selected: filter === undefined || !filter[idx]
        }}))
    }
    const rowRemap =  rowFilter ? new Array( axisOptions[rowSelection].values.length ).fill(0).map((_,idx)=>rowFilter[idx] ? undefined : idx).filter(d=>d!==undefined) : undefined
    const colRemap =  colFilter ? new Array( axisOptions[colSelection].values.length ).fill(0).map((_,idx)=>colFilter[idx] ? undefined : idx).filter(d=>d!==undefined) : undefined

    if( rowExtents.length > 50 ){
        rowExtents = []
        setRowSelection(0)

    }
    if( columnExtents.length > 50 ){
        columnExtents = []
        setColSelection(0)
    }


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
                    <div key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 top-32 p-1.5 flex flex-col place-items-start space-y-2'>
                        {!props.compare && axisOptions && <DropdownButton noBorder icon={<HeroIcon icon='Columns' className='w-5 h-5 '/>} items={axisOptions} flat placement='left-start' portal showTick selectedItemIdx={selectedColIdx} setSelectedItem={(d)=>updateAxis("column", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedColIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && axisOptions && <DropdownButton noBorder icon={<HeroIcon icon='Rows' className='w-5 h-5'/>} items={axisOptions} flat placement='left-start' portal showTick selectedItemIdx={selectedRowIdx} setSelectedItem={(d)=>updateAxis("row", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedRowIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && layers && layers.length > 1 && <DropdownButton noBorder icon={<HeroIcon icon='Layers' className='w-5 h-5'/>} items={layers} flat placement='left-start' portal showTick selectedItemIdx={layers[layerSelection] ? layerSelection :  0} setSelectedItem={setLayerSelection} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${layerSelection > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && viewConfigs && <DropdownButton noBorder icon={<HeroIcon icon='Eye' className='w-5 h-5'/>} items={viewConfigs} flat placement='left-start' portal showTick selectedItemIdx={activeView} setSelectedItem={setActiveView} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${activeView > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && <DropdownButton noBorder icon={<FunnelIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>updateHideNull(!hideNull)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${hideNull ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder icon={<FunnelIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>updateImportantOnly(!importantOnly)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${importantOnly ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder title='CF' showTick hideArrow flat items={axisFilterOptions(axisOptions[colSelection], colFilter)} placement='left-start' setSelectedItem={(d)=>updateAxisFilter(d, axisOptions[colSelection], colFilter, setColFilter )} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${axisOptions[colSelection].exclude && axisOptions[colSelection].exclude.reduce((a,c)=>a||c,false) ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {props.compare && <DropdownButton noBorder title='RF' showTick hideArrow flat items={axisFilterOptions(axisOptions[rowSelection], rowFilter)} placement='left-start' setSelectedItem={(d)=>updateAxisFilter(d, axisOptions[rowSelection], rowFilter, setRowFilter )} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${axisOptions[colSelection].exclude && axisOptions[colSelection].exclude.reduce((a,c)=>a||c,false) ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {(viewConfig?.config?.searchPane || primitive.type === "assessment") && <DropdownButton noBorder icon={<MagnifyingGlassIcon className='w-5 h-5'/>} items={undefined} flat placement='left-start' onClick={()=>setShowSearchPane(!showSearchPane)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${hideNull ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
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
                    key='grid'
                    ref={gridRef}
                    style = {{
//                        transformOrigin: "top left",
                        gridTemplateColumns: `${hasRowHeaders ? "min-content" : ""} repeat(${columnExtents.length}, min-content)`,
                        gridTemplateRows: `${hasColumnHeaders ? "min-content" : ""} repeat(${rowExtents.length}, min-content)`
                    }}
                    //className={`vfExplorer touch-none grid relative gap-4 w-fit h-fit [&>*]:bg-gray-50 ${hasMultipleUnit ? "[&>*]:p-8" : ""}`}>
                    className={`vfExplorer touch-none grid relative gap-4 w-fit h-fit  ${hasMultipleUnit ? "[&>*]:p-8" : ""}`}>
                    {hasColumnHeaders && <>
                        {hasRowHeaders && <p className='!bg-gray-100'></p>}
                        {columnExtents.map((col,idx)=>{
                            const cFilterIdx = colFilter === undefined ? idx : colRemap[idx]
                            return(
                            <p key={`rt${idx}-${update}`}
                                className='touch-none vfbgtitle z-[2] self-stretch w-full h-full flex justify-center place-items-center text-center !bg-gray-100'>
                                    {
                                        props.compare  && axisOptions[colSelection].type === "parent"
                                        ? (axisOptions[colSelection].order[cFilterIdx] ?  <PrimitiveCard textSize='lg' compact primitive={mainstore.primitive(axisOptions[colSelection].order[cFilterIdx])} onClick={()=>MainStore().sidebarSelect( mainstore.primitive(axisOptions[colSelection].order[cFilterIdx]) )}/> : "None")
                                        : (col?.label ?? col ?? "None")
                                    }
                            </p>
                        )})}
                    </>}
                    { rowExtents.map((row, rIdx)=>{
                        const rFilterIdx = rowFilter === undefined ? rIdx : rowRemap[rIdx]
                        let rowOption = axisOptions[rowSelection]
                        return <React.Fragment>
                            {hasRowHeaders && <p 
                                key={`ct${rIdx}-${update}`} 
                                className='touch-none vfbgtitle z-[2] p-2 self-stretch flex justify-center place-items-center text-center !bg-gray-100'>
                                    {
                                        props.compare  && rowOption.type === "parent"
                                        ? (rowOption.order[rFilterIdx] ?  <PrimitiveCard compact primitive={mainstore.primitive(rowOption.order[rFilterIdx])} onClick={()=>MainStore().sidebarSelect( mainstore.primitive(rowOption.order[rFilterIdx]) )}/> : "None")
                                        : (props.row?.label ?? row ?? "None")
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
                                if( viewConfig?.config?.searchPane ){
                                        subList = subList.sort((a,b)=>a.plainId - b.plainId)
                                }else{
                                    if( viewAsSegments ){
                                        subList.forEach((d)=>d.nestedCount = layerNestPreventionList.current[d.primitive.id] ? d.primitive.primitives.ref.allItems.length : d.primitive.nestedItems.length )
                                        subList = subList.sort((a,b)=>b.nestedCount - a.nestedCount )
                                    }else{
                                        subList = subList.sort((a,b)=>a.primitive.referenceParameters.scale - b.primitive.referenceParameters.scale).reverse()
                                    }
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
                                                : {columns: columnOverride ?? Math.max(2, Math.floor(Math.sqrt(columnColumns[cIdx])))}
                                        } 
                                        id={`${cIdx}-${rIdx}`}                                        
                                        key={`${cIdx}-${rIdx}-${update}`}                                        
                                        className={
                                            `${dropOnGrid && (colOption?.allowMove || rowOption?.allowMove) ? "dropzone" : ""} ${rowOption.colors ? `bg-${rowOption.colors?.filter((_,idx)=>!rowFilter || !rowFilter[idx])?.[rIdx]}-50` : "bg-gray-50"} z-[2] w-full  p-2 gap-0 overflow-y-scroll max-h-[inherit] no-break-children touch-none `
                                            }>
                                            {subList.map((wrapped, idx)=>{
                                                let item = wrapped.primitive
                                                let defaultRender = item.metadata?.defaultRenderProps?.card
                                                let defaultFields = defaultRender?.fields
                                                let size = props.asSquare ? {fixedSize: '16rem'} : {fixedWidth:'16rem'}
                                                let columns = undefined
                                                let sz = Math.floor((parseInt(item.referenceParameters.scale ** 2) / 81) * 6) + 0.5
                                                const staggerScale = scale  + (scale / 200 * (idx % 20))
                                                if( props.render ){
                                                    return props.render( item, staggerScale)
                                                }
                                                let spanning = ""
                                                if( viewConfig?.parameters?.fixedSpan ){
                                                    spanning= 'w-full'
                                                }else if( viewConfig?.parameters?.span?.sqrt){
                                                    columns = true//1 + Math.floor(Math.sqrt(wrapped.nestedCount) / 1.5)
                                                }else if( viewConfig?.parameters?.span ){
                                                    if( wrapped.nestedCount > 10 ){
                                                        spanning ='col-span-2'
                                                        if( wrapped.nestedCount > 100 ){
                                                            spanning ='col-span-2 row-span-4'
                                                        }else if(wrapped.nestedCount > 70 ){
                                                            spanning ='col-span-2 row-span-3'
                                                        }else if(wrapped.nestedCount > 20 ){
                                                            spanning ='col-span-2 row-span-2'
                                                        }
                                                    }
                                                } 
                                            return <PrimitiveCard 
                                                fullId 
                                                key={item.id} 
                                                border={false} 
                                                directOnly={layerNestPreventionList?.current ? layerNestPreventionList.current[item.id] : false}
                                                primitive={item} 
                                                scale={props.comapre ? undefined : staggerScale} 
                                                fields={defaultFields ?? fields} 
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

    if( viewConfig?.config?.searchPane || primitive.type === "assessment"){
        return <div className='flex w-full h-0 grow'>
            {exploreView}
            {showSearchPane && <SearchPane primitive={primitive} dropParent={targetRef} dropCallback={externalDrop}/>}
        </div>
    }
    return exploreView
}