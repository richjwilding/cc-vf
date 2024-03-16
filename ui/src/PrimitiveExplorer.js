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


const mainstore = MainStore()


const encodeFilter = (option, idx, value)=>{
    const val = value ?? option.order?.[idx]
    const invert = value ? true : undefined
    const sourcePrimId = (idx === undefined || value) ? option.primitiveId : undefined

    if( option?.type === "category"){
        if( idx !== undefined && val === "_N_" ){
            return {type: "not_category_level1", value: option.primitiveId, pivot: option.access, invert, sourcePrimId}
        }
        return {type: "parent", value: val, pivot: option.access, relationship: option.relationship, invert, sourcePrimId}
    }else if( option?.type === "question" ){
        return {type: option.type, subtype: option.subtype, map: [val].flat(), pivot: option.access, relationship: option.relationship,  invert}
    }else if( option?.type === "type"){
        return {type: option.type, subtype: option.subtype, map: [val].flat().map(d=>parseInt(d)), pivot: option.access, relationship: option.relationship, invert}
    }else if( option?.type === "title"){
        return  {type: "title", value: val, pivot: option.access, relationship: option.relationship, invert}
    }else if( option.type === "parameter"){
        if( option.bucket_min ){
            return  {type: "parameter", param: option.parameter, min_value: option.bucket_min[idx], max_value: option.bucket_max[idx], pivot: option.access, relationship: option.relationship, invert}
        }else{
            return  {type: "parameter", param: option.parameter, value: val, pivot: option.access, relationship: option.relationship, invert}
        }
    } 
    return undefined
}

    const getExploreFilters = (primitive, axisOptions)=>{
        const filters = primitive.referenceParameters?.explore?.filters
        return filters ? filters.map((filter,idx)=>({
            option: findAxisItem(primitive, idx, axisOptions), 
            id: idx, 
            track: filter.track,
            filter: filter?.filter?.reduce((a,c)=>{a[c === null ? undefined : c] = true; return a}, {}) ?? {}
        })) : []

    }
    const findAxisItem = (primitive, axis, axisOptions)=>{
        
        if( primitive ){
            const struct =  isNaN(axis) ?  primitive.referenceParameters?.explore?.axis?.[axis] : primitive.referenceParameters?.explore?.filters?.[axis]
            if( struct ){
                if(struct.type === "parameter" ){
                    return axisOptions.find(d=>d.type === struct.type && d.parameter === struct.parameter && mainstore.equalRelationships(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
                }else if(struct.type === "question" ){
                    return axisOptions.find(d=>d.type === struct.type &&  mainstore.equalRelationships(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0) && (d.subtype === struct.subtype))?.id ?? 0
                }else if(struct.type === "title"  || struct.type === "type" ){
                    return axisOptions.find(d=>d.type === struct.type &&  mainstore.equalRelationships(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
                }
                const connectedPrim = isNaN(axis) ? primitive.primitives.axis[axis].allIds[0] : primitive.referenceParameters.explore.filters[axis].sourcePrimId
                return axisOptions.find(d=>d.type === struct.type && d.primitiveId === connectedPrim && mainstore.equalRelationships(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
            }
            return 0
        }
    }
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


//export default function PrimitiveExplorer({primitive, ...props}){
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
    const targetRef = useRef()
    const gridRef = useRef()
    const myState = useRef({})
    const canvas = useRef({})
    const [experiment, setExperiment] = React.useState( [178135,278794, 161258, 257045, 164523].includes(primitive.plainId) )

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
    
    let baseItems = React.useMemo(()=>{
        console.log(`REDO BASE`)
        let list
        if( props.list ){
            list = props.list
            console.log(`GOT LIST OF ${list.length}`)
        }else{
            if( asSegment ){
                list = primitive.primitives.allSegment
            }
            if( !list || list.length === 0){

                if( props.types ){
                    const types = [props.types].flat()
                    list = primitive.itemsForProcessing.filter((d)=>types.includes(d.type) )
                }else{
                    list = primitive.itemsForProcessing
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

    

    const [axisOptions, viewFilters] = useMemo(()=>{
        console.log(`REDO AXIS`)
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
        function findCategories( list, access = 0, relationship ){
            const catIds = {}
           for(const category of list){
            if( category.referenceId === 53){
                catIds[category.id] = category.primitives.params.source?.allUniqueCategory?.[0] ?? undefined
            }else{
                catIds[category.id] = category
            }
           }
            return Object.values(catIds).map((d)=>{
                if( !d){
                    return
                }
                const options = d.primitives?.allUniqueCategory
                if( !options ){
                    return undefined
                }
                return {
                    type: "category",
                    primitiveId: d.id,
                    category: d,
                    order: ["_N_",options.map((d)=>d.id)].flat(),
                    values:["_N_",options.map((d)=>d.id)].flat(),
                    labels:["None", options.map((d)=>d.title)].flat(),
                    title: `Category: ${d.title}`,// (${list.map(d=>d.metadata.title ?? d.type).filter((d,i,a)=>a.indexOf(d)===i).join(", ")})`,
                    allowMove: !relationship && access === 0 && (!viewPivot || (viewPivot.depth === 0 || viewPivot === 0)),
                    relationship: d.referenceParameters.pivotBy ?? relationship,
                    access: d.referenceParameters?.pivot ?? access
                }
            }).filter(d=>d)
        }

        function txParameters(p, access, relationship){
            let out = []
            const catIds = p.map((d)=>d.referenceId).filter((v,idx,a)=>a.indexOf(v)=== idx)
            if( access === 1){
                out.push( {type: 'type', title: `Origin type`, relationship, access: access, values: catIds, order: catIds, labels: catIds.map(d=>mainstore.category(d)?.title ?? "Unknown")})

            }

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
                        }else if( type === "long_string" ){
                            return
                        }else if( type === "options" ){
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, title: `${title} - ${parameters[parameter].title}`, relationship, access: access, clamp: true, twoPass: true, passType: "raw"})
                        }else  if( type === "currency" ||  type === "number"){
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, title: `${title} - ${parameters[parameter].title}`, relationship, access: access, twoPass: true, passType: parameter === "funding" ? "funding" : type})
                        }else if(  type === "contact"){
                            out.push( {type: 'parameter', parameter: "contactId", parameterType: type, title: `${title} - ${parameters[parameter].title}`, relationship, access: access, twoPass: true, passType: "contact"})
                        }else if(  type === "boolean"){
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, title: `${title} - ${parameters[parameter].title}`, relationship, access: access, twoPass: true, passType: "boolean"})
                        }else{
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, title: `${title} - ${parameters[parameter].title}`, relationship, access: access, twoPass: true, passType: "raw"})
                        }
                    })
                }

            }

            catIds.forEach((id)=>{
                const category = MainStore().category(id)
                if( category.primitiveType === "entity" || category.primitiveType === "result" || category.primitiveType === "query" || category.primitiveType === "evidence"){
                    out.push( {type: 'title', title: `${category.title} Title`, relationship, access: access, twoPass: true, passType: "raw"})
                }
                if( category ){
                    process(category.parameters, category.title) //
                }
            })
            p.map((d)=>d.origin && d.origin.childParameters ? d.origin.id : undefined).filter((d,idx,a)=>d && a.indexOf(d)===idx).forEach((d)=>{
                const o = mainstore.primitive(d)
                process(o.childParameters, o.metadata?.title)
            })

            const tasks = mainstore.uniquePrimitives(p.map(d=>d.task))
            const taskParams = tasks.map(d=>d.itemParameters ?? {}).reduce((a,c)=>{
                Object.keys(c).forEach((k)=>{
                    a[k] = {...(a[k] || {}), ...c[k]}
                })
                return a
            },{})
            console.log(taskParams)
            if( Object.keys(taskParams).length > 0){
                const itemParams = p.map(d=>process(taskParams[d.referenceId], ""))
            }

            out = out.filter((d,i)=>out.findIndex(d2=>d2.type === d.type && d.title === d2.title && d.access === d2.access && mainstore.equalRelationships(d.relationship, d2.relationship) ) === i)

            return out.filter((filter)=>{
                if( filter.type === "parameter" ){
                    return  (p.filter((d)=>(filter.parameterType === "boolean" && d.referenceParameters[filter.parameter] !== undefined) ||  ["number","string"].includes(typeof(d.referenceParameters[filter.parameter])) || Array.isArray(d.referenceParameters[filter.parameter])).filter((d)=>d !== undefined).length > 0)
                }
                if( filter.type === "title" ){
                    return  (p.filter((d)=>["number","string"].includes(typeof(d.title))).filter((d)=>d !== undefined).length > 0)
                }
                if( filter.type === "type" ){
                    return true
                }
                return false
            })
        }

        let out = [{type: "none", title: "None", values: [""], order:[""], labels: ["None"]}]

        const baseCategories = primitive.primitives.allUniqueCategory
        out = out.concat( findCategories( baseCategories ) )
        if( primitive.referenceParameters?.explore?.importCategories !== false){
            let nodes = [primitive]
            let updated = false
            let added = 0
            do{
                updated = false
                for(const node of nodes ){
                    let thisSet = []
                    const thisCat = findCategories( node.primitives.allUniqueCategory  ).filter(d=>d)
                    added += thisCat.length
                    out = out.concat( thisCat )
                    if(Object.keys(node.primitives).includes("imports")){
                        thisSet.push( node.primitives.imports.allItems )
                        updated = true
                    }
                    nodes = thisSet.flat()
                }
            }while(updated)
            console.log(`Got ${nodes.length} `)
        }

//        out = out.concat( findCategories( items ) )

        if( items ){
            out = out.concat( txParameters( items ) )
            
            const expandOrigin = (nodes, count = 0, relationship)=>{
                let out = []
                    const origins = relationship ? mainstore.uniquePrimitives(nodes.map((d)=>!d.isTask && d.relationshipAtLevel(Array.isArray(relationship) ? relationship.slice(-1)[0] : relationship,1)).flat(Infinity).filter((d)=>d)) : nodes.map((d)=>!d.isTask && d.origin).filter((d)=>d)
                    if( relationship ){
                        console.log(origins)
                    }
                    if( origins.length > 0){
                        out = out.concat( txParameters( origins, count + 1, relationship ) )
                        if( relationship ){
                            out = out.concat( expandOrigin(origins, count + 1, [relationship, relationship.slice(-1)].flat()) )
                            out = out.concat( expandOrigin(origins, count + 1, [relationship, "link"].flat()) )
                        }else{
                            out = out.concat( expandOrigin(origins, count + 1) )
                            out = out.concat( expandOrigin(origins, count + 1, ["origin", "link"]) )
                        }
                    }
                    const questions = mainstore.uniquePrimitives(mainstore.uniquePrimitives(nodes.map(d=>d.parentPrimitives).flat()).filter(d=>d.type === "prompt").map(d => d.origin))
                    if( questions.length > 0 ){

                        const labels = questions.map(d=>d.title)
                        const values = questions.map(d=>d.id)
                        const mapped = questions.map(d=>d.primitives.allPrompt.map(d2=>[d2.id, d.id])).flat()
                        
                        out.push( {type: 'question', subtype:"question", map:mapped, title: `Source question`, access: count, values: values, order: values, labels: labels})
                    }
                    const search = mainstore.uniquePrimitives(nodes.map(d=>d.parentPrimitives).flat()).filter(d=>d.type === "search")
                    if( search.length > 0 ){

                        const labels = search.map(d=>d.title)
                        const values = search.map(d=>d.id)
                        const mapped = search.map(d=>[d.id, d.id])
                        
                        out.push( {type: 'question', subtype:"search", map:mapped, title: `Source search`, access: count, values: values, order: values, labels: labels})
                    }

                    return out
            }
            if( !props.excludeOrigin ){
                //out = out.concat( txParameters( items.map((d)=>d.origin  === primitive ? undefined : d.origin).filter((d)=>d), "origin"  ) )
                out = out.concat( expandOrigin(items) )
                out = out.concat( expandOrigin(items, 0, "link") )
                if( items[0]?.referenceId === 84){
                    out = out.concat( expandOrigin(items, 0, "partnership_a") )
                    out = out.concat( expandOrigin(items, 0, "partnership_b") )

                }
            }
        }
        const final = out.filter((d, idx, a)=>{
            return (d.type !== "category" ) || (d.type === "category" && a.findIndex((d2)=>(d2.primitiveId === d.primitiveId) && (d.access === d2.access)) === idx)
        })
        const labelled = final.map((d,idx)=>{return {id:idx, ...d}})
        
        if( props.compare ){
            setColSelection(1)
            setRowSelection(0)
        }else{
            const colSelect = findAxisItem(primitive, "column", labelled )
            const rowSelect =  findAxisItem(primitive, "row", labelled)
            {
                setColSelection(colSelect )
                const filter = primitive.referenceParameters?.explore?.axis?.column?.filter?.reduce((a,c)=>{a[c === null ? undefined : c] = true; return a}, {}) 
                setColFilter(filter)
            }
            {
                setRowSelection(rowSelect)
                const filter = primitive.referenceParameters?.explore?.axis?.row?.filter?.reduce((a,c)=>{a[c === null ? undefined : c] = true; return a}, {}) 
                setRowFilter(filter)
            }
            cancelRender = true
        }
        const filters = getExploreFilters( primitive, labelled )
        console.log(filters)


        return [labelled, filters]
    }, [primitive.id,  update, layerSelection, importantOnly])



    const _pickProcess = ( mode )=>{
        const option = axisOptions[mode]
        if( option ){
            if( option.type === "category"){
                return (p)=>{
                    let item = p
                    if( true || option.relationship === "ALL"){
                        let candidates = [p]
                        for(let i = 0; i < option.access; i++ ){
                            candidates = MainStore().uniquePrimitives(candidates.map(d=>d.parentPrimitives).flat())
                        }
                        item = candidates.filter(d=>d.parentPrimitiveIds.filter(d=>option.order.includes(d)).length > 0)?.[0]
                    }else{
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                    }
                    if( !item ){return "_N_"}//}undefined}
                    if( primitive.referenceParameters?.explore?.allowMulti ){
                        const matches = item.parentPrimitiveIds.map((d)=>option.order?.indexOf(d)).filter((d,i,a)=>d !== -1 && a.indexOf(d)===i).sort()
                        if( matches.length === 0){
                            return "_N_"
                        }
                        return matches.map(d=>option.order[d])
                    }else{
                        return option.order[Math.max(0,...item.parentPrimitiveIds.map((d)=>option.order?.indexOf(d)).filter((d)=>d !== -1 ))] ?? "_N_"
                    }
                }
            }else if( option.type === "contact"){
                return (d)=>d.origin.referenceParameters?.contactId
            }else if( option.type === "type"){
                return (p)=>{
                    let item = p
                    item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                    return item?.referenceId
                }
            }else if( option.type === "title"){
                return (p)=>{
                    let item = p
                    item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                    return item?.title
                }
            }else if( option.type === "question"){
                return (d)=> {
                    let item = d
                    item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                    if( !item ){return undefined}
                    const hits = option.map.filter(d2=>d.parentPrimitiveIds.includes(d2[0]))
                    return hits.map(d=>d[1]).filter((d,i,a)=>a.indexOf(d)===i)[0]
                }
            }else if( option.type === "parameter"){
                if( option.parameterType === "options"){
                    return (d)=>{
                        let item = d
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                        if( !item ){return undefined}
                        const orderedOptions = item.metadata?.parameters[option.parameter]?.options
                        if( orderedOptions){
                           const values =  [item.referenceParameters[option.parameter]].flat()
                           if( values && values.length > 0){
                                const maxIdx = Math.max(...values.map((d2)=>orderedOptions.indexOf(d2)))
                                return orderedOptions[maxIdx]
                           }else{
                            return item.metadata.parameters[option.parameter].default ?? "None"
                           }
                        }
                        return ""
                    }
                }
                return (d)=> {
                    let item = d
                    item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                    if( !item ){return undefined}
                    let value = item?.referenceParameters[option.parameter]
                    if( option.parameterType === "number" && typeof(value) === "string"){
                        value = parseFloat(value)
                    }
                    if( option.parameterType === "boolean"){
                    }
                    return value
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
    const pickProcess = ( mode)=>{
        const real = _pickProcess(mode)
        return (p)=>{
            let r = real(p)
            if( r === null){
                r = undefined
            }
            return r
        }
    } 
    const column = pickProcess( colSelection )
    const row = pickProcess( rowSelection )

    let [list, baseFilters] = React.useMemo(()=>{
        console.log(`REDO LIST`)
        const bucket = {
            "raw":(field)=>{
                return {labels: interim.map((d)=>d[field]).filter((v,idx,a)=>a.indexOf(v)===idx).sort()}
            },
            "boolean":(field)=>{
                return {labels: ["True","False","Not specified"], order: [true, false , undefined], values: [true, false , undefined]}
            },
            "contact":(field)=>{
                const contacts = interim.map(d=>d.primitive.origin?.referenceParameters?.contact).filter((d,i,a)=>d && a.findIndex(d2=>d2.id === d.id) === i)
                const labels = contacts.map(d=>d.name)
                const ids = contacts.map(d=>d.id)

                return {labels: labels, order: ids, values: ids}
            },
            "funding": (field)=>{
                const brackets = [0,100000,500000,1000000,5000000,15000000,50000000,100000000,200000000,500000000,1000000000]
                const format = brackets.map((d)=>roundCurrency(d))
                const labels = format.map((d,i,a)=>i === 0 ? "Unknown" : `${a[i-1]} - ${d}`)
                const mins = format.map((d,i,a)=>i === 0 ? undefined : a[i-1])
                const max = format.map((d,i,a)=>d)
                interim.forEach((d)=>{
                    d[field] = labels[ brackets.filter((d2)=>d2 < d[field]).length ]
                })
                return {labels: labels, bucket_min: mins, bucket_max: max}
            },
            "currency": (field)=>{
                const brackets = [0,100000,500000,1000000,5000000,15000000,50000000,100000000,200000000,500000000,1000000000]
                const format = brackets.map((d)=>roundCurrency(d))
                const labels = format.map((d,i,a)=>`${i > 0 ? a[i-1] : 0} - ${d}`)

                const mins = format.map((d,i,a)=>i === 0 ? 0 : a[i-1])
                const max = format.map((d,i,a)=>d)

                interim.forEach((d)=>{
                    d[field] = labels[brackets.filter((d2)=>d2 < d[field]).length]
                })
                return {labels: labels, bucket_min: mins, bucket_max: max}
            },
            "number": (field)=>{
                const bucketCount = 10
                const hasValues = interim.filter(d=>d[field]).sort((a,b)=>a[field] - b[field])

                const totalItems = hasValues.length 
                const itemsPerBucket = Math.ceil(totalItems / bucketCount)
                
                let bucket = 0, count = 0
                const mins = []
                const max = []
                const mapped =  {}

                let labels =  new Array(bucketCount).fill(0).map((_,i)=>`Bucket ${i}`)
                let last = undefined
                hasValues.forEach(d=>{
                    mapped[d.primitive.id] = bucket
                    if( count === 0){
                        mins[bucket ] = d[field]
                    }else{
                        max[bucket ] = d[field]
                    }
                    count++                    
                    if( count === itemsPerBucket){
                        count = 0
                        bucket++
                    }
                })

                labels = labels.map((d,i)=>`${mins[i]} - ${max[i]}`)

                interim.forEach((d)=>{
                    d.old = d[field]
                    d[field] = labels[mapped[d.primitive.id]]
                })
                return {labels: labels, bucket_min: mins, bucket_max: max}
            },
            "number_even": (field)=>{
                const bucketCount = 10
                const hasValues = interim.filter(d=>d[field])
                const maxValue = hasValues.reduce((a,c)=>c[field] > a ? c[field] : a, 0)
                const minValue = hasValues.reduce((a,c)=>c[field] < a ? c[field] : a, Infinity)
                const bucket = (maxValue - minValue) / bucketCount
                const mins = []
                const max = []
                let labels

                if( minValue === maxValue ){
                    mins[0] = minValue
                    max[0] = minValue
                    labels = [minValue]
                }else{
                    labels = new Array(bucketCount).fill(0).map((_,i)=>{
                        const start = minValue + (bucket * i)
                        mins[i] = start
                        max[i] = start + bucket - (i === (bucketCount - 1) ? 0 : 1)
                        return `${Math.floor(mins[i])} - ${Math.floor(max[i])}`
                    }) 
                }
                interim.forEach((d)=>{
                    d.old = d[field]
                    d[field] = isNaN(d[field]) ? undefined : labels.find((_,i)=>{
                        const v = d[field]
                        return v>= mins[i] && v <= max[i]
                    })
                })
                return {labels: labels, bucket_min: mins, bucket_max: max}
            }
        }


        const forFilter = viewFilters.map(d=>pickProcess( d.option ))


        let interim= items.map((p)=>{
            return {
                column: column(p),
                row: row(p),
                primitive: p,
                ...forFilter.reduce((a,d,idx)=>{a[`filterGroup${idx}` ]=d(p); return a},{})
            }
        })
        console.log(interim)
        console.log(axisOptions)
        console.log(axisOptions.find(d=>d.id === 22)?.relationship)
        
        if( primitive.referenceParameters?.explore?.allowMulti){
            let unpacked = []
            for( const entry of interim){
                const constants = []
                const expands = []
                const base = {}
                for(const key in entry){
                    if( Array.isArray(entry[key]) ){
                        expands.push(key)
                    }else{
                        base[key] = entry[key]
                        constants.push(key)
                    }        
                }
                let unpack = [ base ]
                for(const key of expands){
                    let thisOut = []
                    let idx = 0
                    for( const replicate of unpack){
                        for( const perm of entry[key]){
                            const thisEntry = {...replicate, dup_track: idx}
                            thisEntry[key] = perm
                            thisOut.push(thisEntry)
                            idx++
                        }
                    }
                    unpack = thisOut
                }                
                unpacked = unpacked.concat(unpack)
            }
            interim = unpacked
        }
        console.log(interim)

        for( const [selection, accessor] of [
            [colSelection, "column"],
            [rowSelection, "row"],
            ...viewFilters.map((d,idx)=>[d.option, `filterGroup${idx}`])
        ]){
            if( axisOptions[selection]?.twoPass ){
                const parsed = bucket[axisOptions[selection].passType](accessor)
                axisOptions[selection].labels = parsed.labels
                axisOptions[selection].values = parsed.values ?? axisOptions[selection].labels
                axisOptions[selection].order = parsed.order ?? axisOptions[selection].values
                if( parsed.bucket_min){
                    axisOptions[selection].bucket_min = parsed.bucket_min
                    axisOptions[selection].bucket_max = parsed.bucket_max
                }
                
            }
        }
        let baseFilters = []
        if( viewFilters && viewFilters.length > 0){
            let temp = interim.map(d=>d.primitive) 
            for(const d of viewFilters){
                if(axisOptions[d.option].bucket_min){
                    const ids = Object.keys(d.filter ?? {}).map(d2=>axisOptions[d.option]?.order?.indexOf(d2) ).filter(d=>d !== -1)
                    console.log(ids)
                    for( const id of ids){
                        const thisFilter = encodeFilter( axisOptions[d.option], id, true)
                        const old = temp.length
                        temp = primitive.filterItems( temp, [thisFilter] )
                        console.log(`fitler for bucket - ${old} -> ${temp.length}`)
                        baseFilters.push( thisFilter )
                    }

                }else{
                    //const thisFilter = encodeFilter( axisOptions[d.option], undefined, Object.keys(d.filter).map(k=>(k === "_N_" || k === "undefined" || k ==="null")  ? undefined : k ))
                    const thisFilter = encodeFilter( axisOptions[d.option], undefined, Object.keys(d.filter).map(k=>(k === "_N_" || k === undefined || k === "undefined" || k ==="null")  ? undefined : k ))
                    console.log(thisFilter)
                    temp = primitive.filterItems( temp, [thisFilter] )
                    baseFilters.push( thisFilter )
                }
            }
            const ids = temp.map(d=>d.id)
            interim = interim.filter(d=>ids.includes(d.primitive.id ) )
            if( primitive.referenceParameters?.explore?.allowMulti  ){
                //interim = interim.filter((d,i,a)=>a.findIndex(d2 => (d.primitive.id === d2.primitive.id) && ((d.column?.idx) === (d2.column?.idx)) && ((d.row?.idx) === (d2.row?.idx))) === i)
                interim = interim.filter((d,i,a)=>a.findIndex(d2 => (d.primitive.id === d2.primitive.id) && (d.column === d2.column) && (d.row === d2.row)) === i)
            }

        }
        if( viewPivot ){
            const depth = viewPivot instanceof Object ? viewPivot.depth : viewPivot
            const relationship = (viewPivot instanceof Object ? viewPivot.relationship : undefined) ?? "origin"

            if( relationship === "origin" ){
                interim = interim.map(d=>{
                    return {
                        ...d,
                        primitive_source: d.primitive,
                        primitive:  d.primitive.originAtLevel( depth )
                    }
                })
            }else{
                interim = interim.map(d=>{
                    const items = d.primitive.relationshipAtLevel( relationship, depth)
                    return items.map(item=>{

                        return {
                            ...d,
                            primitive_source: d.primitive,
                            primitive:  item
                        }
                    })
                }).flat()
            }
            //interim = interim.filter((d,i,a)=>a.findIndex(d2=>((d2.column?.idx) === (d.column?.idx) ) && ((d2.row?.idx ) === (d.row?.idx) ) && d.primitive.id === d2.primitive.id) === i)
            interim = interim.filter((d,i,a)=>a.findIndex(d2=>(d2.column === d.column) && (d2.row === d.row ) && d.primitive.id === d2.primitive.id) === i)
        }

        return [interim, baseFilters]
    },[colSelection, rowSelection, update, updateRel, primitive.id, layerSelection, viewPivot ])


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

    
    const axisExtents = (fieldName, field)=>{
        if( !axisOptions || !axisOptions[field]){return []}
        const filter = fieldName === "column" ? colFilter : rowFilter
        let out

        if( props.compare || axisOptions[field].type === "category" ){
            //out = axisOptions[field].values
            out = axisOptions[field].labels.map((d,i)=>({idx: axisOptions[field].order[i], label: d}))
            console.log(out)
        }else if( axisOptions[field].parameterType === "currency" || axisOptions[field].parameterType === "number"){
            //out = axisOptions[field].labels
            out = axisOptions[field].labels.map((d,i)=>({idx: axisOptions[field].values[i], label: d}))
        }else if( axisOptions[field].parameterType === "boolean"   ){
            out = axisOptions[field].labels.map((d,i)=>({idx: axisOptions[field].values[i], label: d}))
        }else if( axisOptions[field].parameterType === "contact" ){
            out = axisOptions[field].labels.map((d,i)=>({idx: axisOptions[field].values[i], label: d}))
        }else if( axisOptions[field].type === "question" || axisOptions[field].type === "type"  ){
            out = axisOptions[field].labels.map((d,i)=>({idx: axisOptions[field].values[i], label: d}))
        }else{ 
            out = axisOptions[field].values.map((d,i)=>({idx: d, label: d}))
        }
        out = out.filter((_,idx)=>!((filter && filter[axisOptions[field].order[idx]]) || (hideNull && myState.current?.[fieldName + "Empty"]?.[axisOptions[field].order[idx]]))) ?? []

        return out
    }

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

    const renderType = layers?.[layerSelection]?.items ? list?.[0]?.primitive?.type :  (props.category?.resultCategoryId !== undefined) ? MainStore().category(props.category?.resultCategoryId).primitiveType  : "default"
    const viewConfigs = list?.[0]?.primitive?.metadata?.renderConfig?.explore?.configs ?? baseViewConfigs
    const viewConfig = viewConfigs?.[activeView] 
    const renderProps = viewConfig?.props ?? list?.[0]?.primitive?.metadata?.defaultRenderProps ?? defaultRenderProps[renderType ]

    let [columnExtents, rowExtents, columnColumns] = React.useMemo(()=>{
        console.log("redo extents")
        
        myState.current[ "rowEmpty" ] = {}
        myState.current[ "columnEmpty" ] = {}
        if( hideNull ){
            for(const [axis, altAxis, altEmpty, filter, altFilter, tester] of [
                [axisOptions[colSelection], axisOptions[rowSelection], "rowEmpty", colFilter, rowFilter, (item, alt, c) => item.row === alt && c.includes(item.column)], 
                [axisOptions[rowSelection], axisOptions[colSelection], "columnEmpty", rowFilter, colFilter,(item, alt, c) => item.column === alt && !c[item.row]]
            ] ){
                if( axis?.order && altAxis?.order ){
                    const allowedValues = filter ? axis.order.map((d, idx)=> filter[ d ] ? undefined : axis.values[idx] ).filter(d=>d) : axis.values
                    altAxis.order.forEach((alt,idx)=>{
                        if( !altFilter || !altFilter[alt]){
                            const altPresent = list.filter(d=>tester(d, altAxis.values[idx], allowedValues))
                            myState.current[ altEmpty ][alt] = altPresent.length === 0
                        }
                    })
                }
            }
        }

        const columns = axisExtents("column", colSelection)
        const rows = axisExtents("row", rowSelection)

        

        const columSizing = columns.map((col, cIdx)=>{
            const inColumn = list.filter(d=>d.column === col?.idx)
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

        console.log(`REDO EXTENTS`)
        storeCurrentOffset()
        forceUpdateExtent()


        return [
            columns,
            rows,
            columSizing
        ]
    },[primitive.id, colSelection, rowSelection, update, updateNested, hideNull, colFilter ? Object.keys(colFilter).filter(d=>colFilter[d]).join("-") : "", rowFilter ? Object.keys(rowFilter).filter(d=>rowFilter[d]).join("-") : "", Object.keys(expandState).join(",")])

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

    const updateAxis = async ( axis, idx )=>{
        const item = axisOptions[idx]
        const fullState = {
            type: item.type,
            access: item.access,
            relationship: item.relationship
        }
        if( item.type === "none"){
            primitive.setField(`referenceParameters.explore.axis.${axis}`, null)
        }else if( item.type === "category"){
            if( primitive.referenceParameters ){
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
        }else if( item.type === "question"){
            if( primitive.referenceParameters ){
                fullState.subtype = item.subtype
            }
        }else if( item.type === "parameter"){
            if( primitive.referenceParameters ){
                fullState.parameter = item.parameter
            }
        }
        primitive.setField(`referenceParameters.explore.axis.${axis}`, fullState)
       // primitive.setField(`referenceParameters.explore.filter.${axis}`, [])
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
        let axis, filter, setter
        console.log(item, mode, setAll)

        const axisSetter = (filter, path)=>{
            if( primitive.referenceParameters ){
                const keys = Object.keys(filter).map(d=>d === "undefined" && (filter[undefined] !== undefined) ? undefined : d).filter(d=>filter[d])
                console.log(keys)
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
        }else if(mode instanceof Object){
            axis = axisOptions[viewFilters[mode.id].option]
            if( axis ){
                filter = primitive.referenceParameters?.explore?.filters?.[ mode.id ]?.filter?.reduce((a,c)=>{a[c === null ? undefined : c]=true;return a},{}) || {}
                setter = ( filter )=>{
                    console.log(`WILL UPDATE ${mode.id}`, filter) 
                    axisSetter(filter, `referenceParameters.explore.filters.${mode.id}.filter`)
                    forceUpdate()
                }
            }

        }else{
            throw "HUH"
        }


        storeCurrentOffset()
        filter = filter || {}
        if(setAll){
            if( item ){
                filter = axis.order?.reduce((a,c)=>{a[c] = true;return a},{})
            }else{
                filter = {}
            }
        }else{
            filter[item] = !filter[item]
        }
        setter( filter )

        console.log( mode, filter ? Object.keys(filter).filter(d=>filter[d]).join("-") : "" )


        
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


    const rowRemap =  axisOptions[rowSelection]?.order?.map((d,idx)=>((rowFilter && rowFilter[d]) || (hideNull && myState.current?.rowEmpty?.[d])) ? undefined : idx).filter(d=>d!==undefined)
    const colRemap =  axisOptions[colSelection]?.order?.map((d,idx)=>((colFilter && colFilter[d]) || (hideNull && myState.current?.columnEmpty?.[d])) ? undefined : idx).filter(d=>d!==undefined)

    let updateBatch
    console.log(`UPREND`)
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
                rowExtents: 
                rowExtents, 
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
                <div ref={experiment ? undefined : targetRef} className='touch-none w-full h-full overflow-x-hidden overflow-y-hidden overscroll-contain relative'>
        {props.closeButton ?? ""}
                    <div key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-50 right-4 top-32 p-1.5 flex flex-col place-items-start space-y-2'>
                        {!props.compare && axisOptions && <DropdownButton noBorder icon={<HeroIcon icon='Columns' className='w-5 h-5 '/>} items={axisOptions} flat placement='left-start' portal showTick selectedItemIdx={selectedColIdx} setSelectedItem={(d)=>updateAxis("column", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedColIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && axisOptions && <DropdownButton noBorder icon={<HeroIcon icon='Rows' className='w-5 h-5'/>} items={axisOptions} flat placement='left-start' portal showTick selectedItemIdx={selectedRowIdx} setSelectedItem={(d)=>updateAxis("row", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedRowIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && layers && layers.length > 1 && <DropdownButton noBorder icon={<HeroIcon icon='Layers' className='w-5 h-5'/>} items={layers} flat placement='left-start' portal showTick selectedItemIdx={layers[layerSelection] ? layerSelection :  0} setSelectedItem={updateLayer} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${layerSelection > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
                        {!props.compare && viewConfigs && <DropdownButton noBorder icon={<HeroIcon icon='Eye' className='w-5 h-5'/>} items={viewConfigs} flat placement='left-start' portal showTick selectedItemIdx={activeView} setSelectedItem={updateViewMode} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${activeView > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
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
                            update={update + updateRel + updateExtent}
                            updateOld={update}
                            updateRel={updateRel}
                            updateExtent={updateExtent}
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
                                onClick:{
                                    primitive:(id)=>{
                                        mainstore.sidebarSelect(id)
                                    },
                                    cell:(id)=>{
                                        const cell = id?.[0]
                                        if( cell ){
                                            const [cIdx,rIdx] = cell.split("-")

                                            let infoPane = {
                                                filters: [
                                                    encodeFilter( axisOptions[colSelection], colRemap[cIdx] ),
                                                    encodeFilter( axisOptions[rowSelection], rowRemap[rIdx] ),
                                                    ...baseFilters
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
                                                                    rowExtents: 
                                                                    rowExtents, 
                                                                    ...stageOptions
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
                            const cFilterIdx = colFilter === undefined ? idx : colRemap[idx]
                            //console.log(`SETTING HEADER `, myState.current.fontSize )
                            return(
                            <p key={`rt${col?.idx}-${update}-${updateNested}-${updateRel}-${updateExtent}`}
                                style={{
                                    fontSize: myState.current.fontSize ?? '14px',    
                                    minWidth: myState.current.minWidth ?? "100px",    
                                    padding: myState.current.padding ?? "2px",    
                                }}
                                className='touch-none vfbgtitle z-[2] self-stretch w-full h-full flex justify-center place-items-center text-center !bg-gray-100'>
                                    {
                                        props.compare  && axisOptions[colSelection].type === "parent"
                                        ? (axisOptions[colSelection].order?.[cFilterIdx] ?  <PrimitiveCard textSize='lg' compact primitive={mainstore.primitive(axisOptions[colSelection].order[cFilterIdx])} onClick={()=>MainStore().sidebarSelect( mainstore.primitive(axisOptions[colSelection].order[cFilterIdx]) )}/> : "None")
                                        : (col?.label ?? "None")
                                    }
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
                                    subList = list
                                    const cFilterIdx = colFilter === undefined ? cIdx : colRemap[cIdx]
                                    subList = filterForCompare( subList, axisOptions[colSelection], cFilterIdx, axisOptions[rowSelection], rFilterIdx)
                                    subList = filterForCompare( subList, axisOptions[rowSelection], rFilterIdx, axisOptions[colSelection], cFilterIdx)
                                }else{
                                    //subList = list.filter((item)=>item.column === (column?.idx ?? column) && item.row === (row?.idx ?? row))
                                    // column && 'idx' in column ? column.idx : column

                                    subList = list.filter((item)=>item.column === column?.idx  && item.row === row?.idx )
                                }
                                if( viewConfig?.config?.searchPane ){
                                    subList = subList.sort((a,b)=>a.plainId - b.plainId)
                                }
                                
                                const cVal = colOption.order?.[colRemap[cIdx]]
                                const rVal = rowOption.order?.[rowRemap[rIdx]]


                                let infoPane = {
                                    filters: [
                                        encodeFilter( colOption, colRemap[cIdx] ),
                                        encodeFilter( rowOption, rowRemap[rIdx] ),
                                        ...baseFilters
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
                                            setSelectedBox({column: cVal,row: rVal, infoPane })
                                            MainStore().sidebarSelect( primitive, {
                                                infoPane: infoPane
                                            })}
                                        }
                                        className={[
                                           'vfcell', 
                                           selectedBox?.column === cVal && selectedBox?.row === rVal ? "ring-2 ring-ccgreen-200 !bg-ccgreen-50" : "",
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
                                                        /* onInnerCardClick={ (e, p)=>{
                                                                if( myState.current?.cancelClick ){
                                                                    myState.current.cancelClick = false
                                                                    return
                                                                }
                                                                e.stopPropagation()
                                                                MainStore().sidebarSelect( p, {scope: item} )
                                                            }}
                                                            onClick={ enableClick ? (e, p)=>{
                                                                if( myState.current?.cancelClick ){
                                                                    myState.current.cancelClick = false
                                                                    return
                                                                }
                                                                e.stopPropagation()
                                                                MainStore().sidebarSelect( p, {scope: primitive, context: {column: column?.label ?? column ?? "None", row: row?.label ?? row ?? "None"}} )
                                                            } : undefined}*/
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
            {selection: colSelection, mode: "column", title: "Columns", setter: setColFilter, list: colFilter},
            {selection: rowSelection, mode: "row", title: "Rows", setter: setRowFilter, list: rowFilter},
            ...viewFilters.map((d,idx)=>({selection: d.option, title: `Filter by ${axisOptions[d.option]?.title}`, deleteIdx: idx, mode: {mode: "view", id: d.id}, list: d.filter}))
        ]
        sets.forEach(set=>{
            const axis = axisOptions[set.selection]
            if(axis && axis.values){
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
                                onClick={()=>updateAxisFilter(false, set.mode, true)}
                            >
                                Select all
                            </button>
                            <button
                                type="button"
                                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                onClick={()=>updateAxisFilter(true, set.mode, true)}
                            >
                                Clear all
                            </button>
                        </div>
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
                                    <p className={`p-2 ${set.list && set.list[id] ? "text-gray-500" : ""}`}>{axis.labels?.[idx] ?? d}</p>
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
            onClick={()=>{
                setSelectedBox(undefined)
                MainStore().sidebarSelect( undefined)
            }}
            >
            {exploreView}
            {showPane === "search" && <SearchPane primitive={primitive} dropParent={targetRef} dropCallback={externalDrop}/>}
            {showPane === "filter" && 
                <div className="flex flex-col w-[36rem] h-full justify-stretch space-y-1 grow border-l p-3">
                    <div className='w-full p-2 text-lg flex place-items-center'>
                        Filter
                        <DropdownButton items={axisOptions} setSelectedItem={addViewFilter} flat placement='left-start' icon={<HeroIcon icon='FunnelPlus' className='w-5 h-5'/>} flat placement='left-start' className={`ml-auto hover:text-ccgreen-800 hover:shadow-md`}/>
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