import MainStore from './MainStore';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowsPointingInIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
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


const mainstore = MainStore()

export default function PrimitiveExplorer({primitive, ...props}){

    const [selectedCategoryIds, setSelectedCategoryIds] = React.useState( props.allowedCategoryIds )
    const [layerSelection, setLayerSelection] = React.useState(0)//axisOptions.length > 1 ? 1 : 0)
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [colSelection, setColSelection] = React.useState(0)
    const [rowSelection, setRowSelection] = React.useState(0)//axisOptions.length > 1 ? 1 : 0)
    const [activeView, setActiveView] = React.useState(0)
    const layerNestPreventionList = React.useRef()
    

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
        const types = [props.types].flat()
        return (props.list || primitive.primitives.uniqueAllItems.filter((d)=>types.includes(d.type) )).filter((d)=>filters.map((f)=>f(d)).reduce((r,c)=>r && c, true))
    },[primitive.id, update])

    let layers
    if( primitive.type === "segment" ){
        layers = []
        const nextLayer = (list)=>{
            layers.push({id: layers.length, title: `Layer ${layers.length + 1}`})
            const thisLevel = list.map((d)=>d.primitives.allSegment).flat()
            
            if( thisLevel.length > 0 ){
                nextLayer( thisLevel )
            }
        }
        nextLayer( [primitive] )
       // layers.push({id: layers.length, title: "Organizations", items: true})
    }

    let items = React.useMemo(()=>{
        let out = baseItems
        let keep = []
        layerNestPreventionList.current = {}
        if( layerSelection > 0){
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
            if( layers[layerSelection].items){
                out = baseItems.map((d)=>d.nestedItems).flat()
            }else{

                for( let a = 0; a < layerSelection; a++){
                    out = unpackLayer(out)
                }
            }
        }
        console.log(`HAD ${baseItems.length} now ${out.length}`)
        console.log(keep.map((d)=>d.id))
        return [out,keep].flat()
    },[primitive.id, update, layerSelection])
    
    useDataEvent("relationship_update", [primitive.id, items.map((d)=>d.id)].flat(), forceUpdate)

    const axisOptions = useMemo(()=>{
        function findCategories( list, access = 0 ){
            const catIds = {}
           // let type
            function topLevelCategory( item ){
                const cats = item.categories
                if( cats.length == 0){
                    if( item.type === "category" ){
                        return [item]
                    }                    
                }else{
                    return cats.map((d)=>topLevelCategory(d)).flat()
                }
                return []
            }
            list.forEach((d)=>{
                //type = type || d.metadata.title
                topLevelCategory(d).forEach((d)=>{
                    if( !catIds[d.id] ){
                        catIds[d.id] = d
                    }
                })
            })
            return Object.values(catIds).map((d)=>{
                const options = d.primitives.allUniqueCategory
                return {
                    type: "category",
                    id: d.id,
                    category: d,
                    order: [undefined,options.map((d)=>d.id)].flat(),
                    values: ["None", options.map((d)=>d.title)].flat(),
                    title: `By ${d.title}`,
                    allowMove: access === 0,
                    access: access
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
                        console.log(parameter, type)
                        if( parameters[parameter].excludeFromAggregation ){
                            return
                        }else if( type === "url" ){
                            return
                        }else if( type === "options" ){
                       //     out.push( {type: 'parameter', parameter: parameter, title: `${title} - All ${parameters[parameter].title}`, access: access})
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
                return p.map((d)=>["number","string"].includes(typeof(d.referenceParameters[filter.parameter])) || Array.isArray(d.referenceParameters[filter.parameter])).filter((d)=>d !== undefined).length > 0
            })
        }

        let out = [{type: "none", title: "None"}]

        const baseCategories = primitive.primitives.allUniqueCategory
        out = out.concat( findCategories( baseCategories ) )

        out = out.concat( findCategories( items ) )

        if( items ){
            out = out.concat( txParameters( items ) )
            
            const expandOrigin = (nodes, count = 0)=>{
                let out = []
                    const origins = nodes.map((d)=>!d.isTask && d.origin).filter((d)=>d)
                    if( origins.length > 0){
                        out = out.concat( txParameters( origins, count + 1 ) )
                        out = out.concat( findCategories( origins, count + 1 ))
                        out = out.concat( expandOrigin(origins, count + 1) )
                    }
                    return out
            }
            if( !props.excludeOrigin ){
                //out = out.concat( txParameters( items.map((d)=>d.origin  === primitive ? undefined : d.origin).filter((d)=>d), "origin"  ) )
                out = out.concat( expandOrigin(items) )
                
            }
        }
        const final = out.filter((d, idx, a)=>(d.type !== "category") || (d.type === "category" && a.findIndex((d2)=>d2.id === d.id) === idx))
        if( colSelection >= final.length){
            setColSelection(0)
        }
        if( rowSelection >= final.length){
            setRowSelection(0)
        }
        return final
    }, [primitive.id, update, layerSelection])



    const pickProcess = ( mode )=>{
        const option = axisOptions[mode]
        if( option ){
            if( option.type === "category"){
                return (p)=>{
                    let item = p
                    for(let idx = 0; idx < option.access; idx++){
                        item = item.origin
                    }
                    return option.values[Math.max(0,...item.parentPrimitiveIds.map((d)=>option.order.indexOf(d)).filter((d)=>d !== -1 ))]
                }
            }
            if( option.type === "interviewee"){
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

        if( axisOptions[colSelection].twoPass ){
            axisOptions[colSelection].labels = bucket[axisOptions[colSelection].passType]("column") 
        }
        if( axisOptions[rowSelection].twoPass ){
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
        if( gridRef.current){
            setTimeout(()=>{

                
                gridRef.current.style.transform = `scale(1)`
                const toolbarHeight = 56
                
                const fontScale = Math.max(1 / 1600  *  gridRef.current.offsetWidth, 1 / 2000  *  gridRef.current.offsetHeight)
                const fontSize = 12 * fontScale
                
                for(const node of gridRef.current.querySelectorAll('.vfbgtitle')){
                    node.style.fontSize = `${fontSize}px`
                    node.style.padding = `${2 * fontScale}px`
                    node.style.minWidth = `${100 * fontScale }px`
                }
                const gbb = {width: gridRef.current.offsetWidth , height:gridRef.current.offsetHeight }

                const tbb = targetRef.current.getBoundingClientRect()
                
                const border = 20
                const tw = tbb.width
                const th = tbb.height 
                
                const scale = Math.min(Math.min( (tbb.width - border) / gbb.width, (tbb.height - border - toolbarHeight) / gbb.height),1) 
                const x =  -(gbb.width / 2) + (tbb.width / 2 )
                const y =  -(gbb.height /2) + (tbb.height / 2 )
                console.log(gbb.height)
                console.log(tbb.height)
                
                gridRef.current.style.transform = `translate(${x}px,${y}px) scale(${scale})`
                setScale(scale)
            }, primitive.type === "segment" ? 150 : 0)
        }

    }, [gridRef.current, primitive.id, colSelection, rowSelection, selectedCategoryIds, update, layerSelection])

    function rebuildPrimitivePosition(){
        myState.current.primitivePositions = rebuildPosition('.pcard')
        myState.current.dropsites = rebuildPosition('.dropzone')
    }
    function rebuildPosition(selector){
        if(gridRef.current){
            const out = []
            for(const node of gridRef.current.querySelectorAll(selector)){
                out.push( {x1: node.offsetLeft, y1: node.offsetTop, x2:node.offsetLeft + node.offsetWidth, y2: node.offsetTop + node.offsetHeight, id: node.getAttribute('id'), el: node} )
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
    
    async function moveItem(primitiveId, startZone, endZone){
        console.log(`${primitiveId} - >${startZone} > ${endZone}`)
        const primitive = mainstore.primitive(primitiveId)
        if( primitive ){
            const [sc,sr] = startZone.split('-')
            const [ec,er] = endZone.split('-')
            if( sc !== ec){
                await updateProcess(primitive, colSelection, columnExtents[sc], columnExtents[ec])
            }
            if( sr !== er){
                await updateProcess(primitive, rowSelection, rowExtents[sr], rowExtents[er])
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

                const { width, height, x, y } = targetRef.current.getBoundingClientRect()
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
                        const [c,r] = start[0].id.split('-')
                        myState.current.dragging.startZone = start[0]
                        if( axisOptions[rowSelection].allowMove !== true || axisOptions[colSelection].allowMove !== true){

                            myState.current.dragging.constrain = {
                                col: axisOptions[rowSelection].allowMove ? c : undefined, 
                                row: axisOptions[colSelection].allowMove ? r : undefined
                            }
                        }

                    }
                    
                    const clone = myState.current.dragging.el.cloneNode(true);
                    clone.style.position = "absolute"
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
                        const [c,r] = target.id.split('-')
                        if( !myState.current.dragging.constrain ||
                            ((myState.current.dragging.constrain.col !== undefined && myState.current.dragging.constrain.col === c) ||
                            (myState.current.dragging.constrain.row !== undefined && myState.current.dragging.constrain.row === r))){

                                if( myState.current.dragging.dropzone && myState.current.dragging.dropzone !== target){
                                    myState.current.dragging.dropzone.el.style.background = null
                                }
                                target.el.style.background = "#6ee7b7"
                                myState.current.dragging.dropzone = target
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
                if( myState.current.dragging){
                    const hits = dropsAt(inGridX, inGridY )
                    if( hits && hits.length > 0){
                        const target = hits[0]
                        if( !(myState.current.dragging.startZone && target.id ===  myState.current.dragging.startZone.id)){
                            moveItem( myState.current.dragging.id, myState.current.dragging.startZone.id, target.id)
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
            setScale(thisScale)
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
                from: ()=>[scale,scale],
                scaleBounds: { min: 0.03, max: 8 },
            },
        }
    )

    
    const axisExtents = (fieldName, field)=>{
        if( !axisOptions || !axisOptions[field]){return []}
        if( axisOptions[field].type === "category" ){
            return axisOptions[field].values
        }
        if( axisOptions[field].parameterType === "currency" || axisOptions[field].parameterType === "number" ){
            return axisOptions[field].labels
        }
        const values = list.map((d)=>d[fieldName]).filter((v,idx,a)=>a.indexOf(v)===idx)
        return values.sort()
    }


  const columnExtents = React.useMemo(()=>{
        return axisExtents("column", colSelection)
    },[primitive.id, colSelection, rowSelection, update])
  
    const rowExtents = React.useMemo(()=>{
        return axisExtents("row", rowSelection)
    },[primitive.id, colSelection, rowSelection, update])



  const colors = ["ccgreen","rose","ccpurple","amber","cyan","fuchsia", "ccblue", "orange","lime","cyan","indigo"] 


  const columnColumns = columnExtents.map((col)=>{
      return Math.max(...Object.values(list.filter((d)=>d.column == (col?.idx ?? col)).reduce((o, d)=>{o[d.row?.idx ?? d.row] = (o[d.row?.idx ?? d.row] || 0) + 1;return o},{})))
    })

    const options = axisOptions.map((d, idx)=>{return {id: idx, title:d.title}})


    const hasColumnHeaders = (columnExtents.length > 1)
    const hasRowHeaders = (rowExtents.length > 1)


    const defaultRenderProps = {
        "segment":{
            hideDetails: true
        },
        "entity": {
            hideCover: true,
            urlShort: true,
            fixedSize: "16rem"
        }
    }
    
    const viewAsSegments =primitive.type === "segment" && layers && !layers[layerSelection].items
    const viewConfigs = props.category?.views.options?.["explore"]?.configs
    const viewConfig = viewConfigs?.[activeView]
    const renderProps = viewConfig?.props ?? defaultRenderProps[ (props.category?.resultCategoryId !== undefined) ? MainStore().category(props.category?.resultCategoryId).primitiveType  : "default" ]


  return (
    <>
      <div key='control' className='z-20 w-full p-2 sticky top-0 left-0 space-x-3 place-items-center flex rounded-t-lg bg-gray-50 border-b border-gray-200'>
                {props.closeButton && <Panel.MenuButton icon={<ArrowsPointingInIcon className='w-4 h-4 -mx-1'/>} action={props.closeButton}/> }
                <Panel.MenuButton icon={<ClipboardDocumentIcon className='w-4 h-4 -mx-1'/>} action={copyToClipboard}/>
                {props.buttons}
                <p>{list?.length} items</p>
                {props.allowedCategoryIds && props.allowedCategoryIds.length > 1 && <MyCombo prefix="Showing: " items={props.allowedCategoryIds.map((id)=>mainstore.category(id))} selectedItem={selectedCategoryIds} setSelectedItem={setSelectedCategoryIds} className='w-42'/>}
                {layers && <MyCombo items={layers} selectedItem={layers[layerSelection] ? layerSelection :  0} setSelectedItem={setLayerSelection}/>}
                {options && <MyCombo items={options} prefix="Columns: " selectedItem={options[colSelection] ? colSelection :  0} setSelectedItem={setColSelection}/>}
                {options && <MyCombo items={options} prefix="Rows: " selectedItem={options[rowSelection] ? rowSelection : 0} setSelectedItem={setRowSelection}/>}
                {viewConfigs && <MyCombo items={viewConfigs} prefix="View: " selectedItem={activeView} setSelectedItem={setActiveView}/>}
            </div>
                <div ref={targetRef} className='touch-none w-full h-full overflow-x-hidden overflow-y-hidden overscroll-contain'>
                <div 
                    key='grid'
                    ref={gridRef}
                    style = {{
//                        transformOrigin: "top left",
                        gridTemplateColumns: `${hasRowHeaders ? "min-content" : ""} repeat(${columnExtents.length}, min-content)`,
                        gridTemplateRows: `${hasColumnHeaders ? "min-content" : ""} repeat(${rowExtents.length}, min-content)`
                    }}
                    className='vfExplorer touch-none grid relative gap-8 w-fit h-fit'>
                    {!hasColumnHeaders && !hasRowHeaders && <div key={`croot`} className={`touch-none vfbgshape z-0 absolute w-full h-full top-0 left-0 bg-${colors[0] || "slate"}-200/20 border-2 border-${colors[0] || "slate"}-200/40`}></div>}
                    {hasColumnHeaders && columnExtents.map((col, cIdx)=>(<div key={`c${cIdx}`} style={{gridColumnStart:cIdx + (hasRowHeaders ? 2 : 1), gridColumnEnd:cIdx + (hasRowHeaders ? 3 : 2)}} className={`touch-none vfbgshape z-0 absolute w-full h-full top-0 left-0 bg-${colors[cIdx] || "slate"}-200/20 border-2 border-${colors[cIdx] || "slate"}-200/40`}></div>))}
                    {hasRowHeaders && rowExtents.map((col, cIdx)=>(<div key={`r${cIdx}`} style={{gridRowStart:cIdx + (hasColumnHeaders ? 2 : 1), gridRowEnd:cIdx + (hasColumnHeaders ? 3 : 2)}} className={`touch-none vfbgshape z-0 absolute w-full h-full top-0 left-0 bg-slate-200/40 border-2 border-slate-200/50`}></div>))}
                    {hasColumnHeaders && <>
                        {hasRowHeaders && <p></p>}
                        {columnExtents.map((col,idx)=>(
                            <p key={`rt${idx}`}
                                className='touch-none vfbgtitle z-[2] text-center self-center w-max m-auto'>{col?.label || col}
                            </p>
                        ))}
                    </>}
                    { rowExtents.map((row, rIdx)=>{
                        let rowOption = axisOptions[rowSelection]
                        return <React.Fragment>
                            {hasRowHeaders && <p 
                                key={`ct${rIdx}`} 
                                className='touch-none vfbgtitle z-[2] text-center p-2 self-center '>
                                    {row?.label || row}
                            </p>}
                            {columnExtents.map((column, cIdx)=>{
                                let colOption = axisOptions[colSelection]
                                let subList = list.filter((item)=>item.column === (column?.idx ?? column) && item.row === (row?.idx ?? row))
                                let spanning = ""
                                if( viewAsSegments ){
                                    subList.forEach((d)=>d.nestedCount = layerNestPreventionList.current[d.primitive.id] ? d.primitive.primitives.ref.allItems.length : d.primitive.nestedItems.length )
                                    subList = subList.sort((a,b)=>b.nestedCount - a.nestedCount )
                                }else{
                                    subList = subList.sort((a,b)=>a.primitive.referenceParameters.scale - b.primitive.referenceParameters.scale).reverse()
                                }
                                return <div 
                                        style={
                                            viewAsSegments
                                                ? { 
                                                        display: "grid",
                                                        gridAutoFlow: "dense",
                                                        gridTemplateColumns: `repeat(${Math.floor(1.5 * Math.sqrt(columnColumns[cIdx]))}, 1fr )`
                                                    }
                                                : {columns: Math.max(2, Math.floor(Math.sqrt(columnColumns[cIdx])))}
                                        } 
                                        id={`${cIdx}-${rIdx}`}                                        
                                        className={
                                            `${colOption?.allowMove || rowOption?.allowMove ? "dropzone" : ""} z-[2] w-full  p-2 gap-0 overflow-y-scroll max-h-[inherit] no-break-children touch-none `
                                            }>
                                            {subList.map((wrapped, idx)=>{
                                                let item = wrapped.primitive
                                                //let isWide = items.type === "segment" && item.
                                                let size = props.asSquare ? {fixedSize: '16rem'} : {fixedWidth:'16rem'}
                                                let sz = Math.floor((parseInt(item.referenceParameters.scale ** 2) / 81) * 6) + 0.5
                                                const staggerScale = scale  + (scale / 200 * (idx % 20))
                                                if( props.render ){
                                                    return props.render( item, staggerScale)
                                                }
                                                let spanning = ""
                                                if( viewConfig?.parameters?.span ){
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
                                                directOnly={layerNestPreventionList.current[item.id]}
                                                primitive={item} 
                                                scale={staggerScale} 
                                                fields={fields} 
                                                {...size} 
                                                className={`mr-2 mb-2 touch-none ${spanning}`}
                                                {...(props.renderProps || renderProps || {})} 
                                                onInnerCardClick={ (e, p)=>{
                                                    if( myState.current?.cancelClick ){
                                                        myState.current.cancelClick = false
                                                        return
                                                    }
                                                    MainStore().sidebarSelect( p, {scope: primitive} )
                                                }}
                                                onClick={ (e, p)=>{
                                                    if( myState.current?.cancelClick ){
                                                        myState.current.cancelClick = false
                                                        return
                                                    }
                                                    MainStore().sidebarSelect( p, {scope: primitive} )
                                                }}/>
                                            })}
                                        </div>
                        })}
                        </React.Fragment>
                    })}
                </div>
        </div>
        </>
  )
}