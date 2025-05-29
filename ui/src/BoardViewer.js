import MainStore, { uniquePrimitives } from "./MainStore"
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ClipboardDocumentIcon, DocumentArrowDownIcon, FunnelIcon, MagnifyingGlassIcon, PlusIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';
import { HeroIcon } from './HeroIcon';
import { InputPopup } from './InputPopup';
import DropdownButton from "./DropdownButton";
import InfiniteCanvas from "./InfiniteCanvas";
import CollectionUtils from "./CollectionHelper";
import { RenderPrimitiveAsKonva, RenderSetAsKonva, renderDatatable, renderMatrix, renderPlainObject } from "./RenderHelpers";
import HierarchyNavigator from "./HierarchyNavigator";
import PrimitiveConfig from "./PrimitiveConfig";
import FilterPane from "./FilterPane";
import CollectionInfoPane from "./CollectionInfoPane";
import useDataEvent from "./CustomHook";
import { createPptx, exportKonvaToPptx, writePptx } from "./PptHelper";
import Konva from "konva";
import { compareTwoStrings, expandStringLiterals } from "./SharedTransforms";
import { getLogger } from './logger'
import AgentChat from "./AgentChat";
import clsx from "clsx";

const log = getLogger('BoardViewer', { level: 'debug' })

                
export const IGNORE_NODES_FOR_EXPORT = ["frame_outline", "frame_bg", "item_info", "widget", "frame_label", "background", "view", "pin", "pin_label", "plainId", "indicators"]
const RENDERSUB = false//true

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
    function getLocalPrimitiveListForBoardId( id, myState ){
        let localItems
        if( myState[id].axisSource){
            if( ! myState[myState[id].axisSource.id] ){
                SharedPrepareBoard(myState[id].axisSource, myState)
                myState[myState[id].axisSource.id].skipNextBuild = true
            }
            const source = myState[myState[id].axisSource.id]
            if( source ){
                if( source.data){
                    localItems = source.data.cells.flatMap(d=>d.items)
                }else if( source.primitiveList){
                    localItems = source.primitiveList
                }else{
                    localItems = source.list?.map(d=>d.primitive)
                }
            }else{
                localItems = myState[id].primitiveList
            }                
        }else{
                localItems = myState[id].primitiveList

        }
        return localItems
    }

function buildIndicators(primitive, flowInstance, flow, state){
    flowInstance ||= primitive?.findParentPrimitives({type: "flowinstance"})?.[0]
    flow ||= flowInstance?.findParentPrimitives({type: "flow"})?.[0]
    let step
    if( flow && flowInstance ){
        step = state.current.flowWatchList?.[flow.id]?.[flowInstance.id]?.status?.find(d=>d.step.id === primitive.id)
    }
    return translateIndicatorState( step )
}
function translateIndicatorState(step){
    let out = {
        icon: "Eye",
        color: "#666"
    }
    if( step ){
        if( step.running){
            out = {
                icon: "FAPlay",
                color: "#3b82f6"
            }
        }else if( step.needReason === "complete"){
            out = {
                icon: "FACircleCheck",
                color: "#4ade80"
            }
        }else if( step.canReason === "all_ready"){
            out = {
                icon: "FAPlay",
                color: "#f97316"//#f59e0b
            }
        }else{
            out = {
                icon: "FAHand",
                color: "#f97316"//#f59e0b
            }
        } 
    }
    return [out]
}
function _buildIndicators(primitive){
    let indicatorMap = {
        "complete": {
            icon: "FACircleCheck",
            color: "#4ade80"
        },
        "running": {
            icon: "FAPlay",
            color: "#3b82f6"
        },
        "default": {
            icon: "FAHand",
            color: "#f97316"//#f59e0b
        }
    }
    return [
        indicatorMap[primitive.processing?.flow?.status] ?? indicatorMap.default
    ]
}

function preparePageElements( d, pageState ){
    
    if( d.type !== "page"){
        return []
    }
    let configPage = d.configParent ?? d
    let page = d 

    pageState.subpages ||= {}
    pageState.subpages[d.id] ||= {}
    
    let tempState = pageState.subpages[d.id]
    let childNodes = configPage.primitives.origin.allUniqueElement
    childNodes = [...childNodes.filter(d=>d.referenceId === PrimitiveConfig.Constants.SHAPE_ELEMENT && d.referenceParameters.style === "rect"), ...childNodes.filter(d=>d.referenceId === PrimitiveConfig.Constants.SHAPE_ELEMENT && d.referenceParameters.style !== "rect"), ...childNodes.filter(d=>d.referenceId !== PrimitiveConfig.Constants.SHAPE_ELEMENT )]
    
    if( tempState[configPage.id]){
        console.log(`REUSING SUB PAGE STATE ${d.id}`)
    }else{
        tempState[configPage.id] = {
            id: configPage.id, 
            primitive: configPage,
            underlying: page
        }


        const pageInputs = d.inputs
        const pageOutputs = configPage.primitives.outputs
        let masterVariants = {}
        const partialVariants = {}
        const pageVariants = {}
        console.log(pageInputs)
        for(let child of childNodes){
            const {x,y,s, ...renderConfigOverride} = configPage.frames?.[child.id] ?? {x: 0, y: 0, s: 1}
            tempState[child.id] = {
                id: child.id, 
                primitive: child, 
                renderConfigOverride,
                page: configPage,
                position: {x,y,s},
                renderConfigOverride
            }

            const pins = Object.keys(pageOutputs ?? {}).filter(d2=>pageOutputs[d2].allIds.includes(child.id)).map(d=>d.split("_")[0])
            if( pins.length > 0){
                let inputs = pins.flatMap(pin=>pageInputs[pin]?.data ?? [])
                let variants = getPageVariants( pageInputs, inputs, true)
                for(const d of variants){
                    if( d.data.length > 0){
                        const aId = d.a?.id ?? ".+?"
                        const bId = d.b?.id ?? ".+?"
                        const key = [aId, bId].join("-")

                        const target = (d.a?.id && d.b?.id) ? masterVariants : partialVariants
                        target[key] ||= {}
                        target[key][child.id] = d.data
                        if( (d.a?.id && d.b?.id) ){
                            if( !pageVariants[key] ){
                                pageVariants[key] = {a: d.a, b: d.b}
                            }
                        }
                    }

                }
            }
        }
        for(const p of Object.keys(partialVariants)){
            for(const m of Object.keys(masterVariants)){
                if( m.match(p)){
                    masterVariants[m] = {
                        ...masterVariants[m],
                        ...partialVariants[p]
                    }
                }
            }
        }
        console.log(`Preparing ${Object.keys(pageVariants).length} variants for ${d.plainId} ${d.title}`)
        if(Object.keys(masterVariants).length === 0){
            if(Object.keys(partialVariants).length > 0){
                masterVariants = partialVariants
            }else{
                masterVariants["single"] = pageInputs
            }
        }
        tempState.masterVariants = masterVariants

    }
    
    const variantData = {}
    
    return Object.keys(tempState.masterVariants).map(vId=>{
        variantData[vId] = {}
        variantData[vId][configPage.id]  =tempState[configPage.id]
        return childNodes.map(d=>{
            variantData[vId][d.id] = {
                ...tempState[d.id],
                variant: tempState.masterVariants[vId][d.id]
            }
            SharedPrepareBoard( d, variantData[vId])
            const state = {
                [d.id]: variantData[vId][d.id],
            }
            const subs = [variantData[vId][d.id].axisSource, ...(variantData[vId][d.id].pinSource ?? [])].filter(d=>d)
            let buildNew = false
            for( let axisSource of subs){
                //let axisSource = variantData[vId][d.id].axisSource
                if(!variantData[vId][axisSource.id]){
                    let axisBoard = {}
                    
                    if (axisSource.inFlow && axisSource.configParent.flowElement) {
                        const parent = axisSource.configParent
                        const flowInstance = axisSource.origin
                        const flow = parent.origin
                        if( flowInstance.origin.id !== flow.id){
                            throw `Flow mismatch ${flowInstance.id} ${flow.id}`
                        }
                        axisBoard[parent.id] = {
                            id: parent.id,
                            underlying: axisSource,
                            inFlow: true,
                            flow,
                            flowInstance
                        }
                        axisSource = parent
                    }
                    
                    SharedPrepareBoard( axisSource, axisBoard)
                    state[axisSource.id] = axisBoard[axisSource.id]
                    buildNew = true
                }
            }
            if( buildNew ){
                SharedPrepareBoard( d, {
                    ...state,
                    ...variantData[vId]
                })                    
            }
            
            return {
                ...variantData[vId][d.id].position,
                ...variantData[vId][d.id].renderConfigOverride,
                primitive: d,
                state
            }
        })
    })
}

function renderSubBoard(d, stageOptions){
    if( d.primitive){
        const output = SharedRenderView( d.primitive, {}, d.state)
        if( output?.items ){
            const rendered = output.items(stageOptions)
            rendered.scale({x: d.s, y: d.s})
            rendered.attrs.id = d.primitive.id
            if( rendered){
                return {
                    x: d.x,
                    y: d.y,
                    state: d.state,
                    rendered
                }
            }
        }
    }
    return undefined
}

let mainstore = MainStore()
function SharedRenderView(d, primitive, myState) {
    const view = myState[d.id];
    const primitiveToRender = view.primitive.type === "element" ? view.primitive: (view.underlying ?? view.primitive);
    // Base view and options
    const renderOptions = { 
        ...(view.underlying?.renderConfig ?? {}),
        ...(view.primitive?.renderConfig ?? {}),
        ...view.renderConfigOverride
    };
    if (view.widgetConfig) {
      renderOptions.widgetConfig = view.widgetConfig;
    }
  
    // Merge size options if available
    const configNames = ["width", "height"];
    const sizeSource = view.parentRender ? myState[view.parentRender].primitive.frames : primitive.frames;
    if (sizeSource?.[d.id]) {
      configNames.forEach(name => {
        if (sizeSource[d.id][name] !== undefined) {
          renderOptions[name] = sizeSource[d.id][name];
        }
      });
    }
  
    // Determine what primitive to render
  
    // Common properties
    const pins =
      view.primitive.type === "element" ? undefined: {
            input: Object.values(view.inputPins),
            output: Object.values(view.outputPins)
          };
    const frameless = view.inPage;
    const titleAlwaysPresent = !view.noTitle && !(view.widgetConfig !== undefined || view.config === "widget");
    const title = view.noTitle ? undefined : () =>
          view.title ??
          `${d.title} - #${d.plainId}${
            view.underlying ? ` (${primitiveToRender.plainId})` : ""
          }`;

    const canvasMargin = view.inPage ? [0, 0, 0, 0] : (view.noTitle || view.inFlow) ? [0, 0, 0, 0] : [20, 20, 20, 20];
  
    // Optional indicator builder
    const indicators = undefined//view.primitive.flowElement ? () => buildIndicators(primitiveToRender, undefined, undefined, myState) : undefined;
  
    const prepareSubBoards = d => preparePageElements(d, view);
  
    const mapMatrix = (stageOptions, d, view) => {
      let dataSource = view;
      if (view.axisSource) {
        if (view.axisSource.inFlow && view.axisSource.configParent?.flowElement) {
          dataSource = myState[view.axisSource.configParent.id];
        } else {
          dataSource = myState[view.axisSource.id];
        }
        if (!dataSource) {
          console.warn(`Couldn't find config for axis Source ${view.axisSource.id}`);
          dataSource = view;
        }
      }
      return renderMatrix(primitiveToRender, dataSource.list ?? [], {
        axis: dataSource.axis,
        columnExtents: dataSource.columns,
        rowExtents: dataSource.rows,
        viewConfig: view.viewConfig,
        ...stageOptions,
        ...renderOptions,
        renderOptions,
        toggles: view.toggles,
        data: view.renderData,
        expand: Object.keys(primitive.frames?.[d.id]?.expand ?? {})
      });
    };
  
    // Build base render view object
    const baseRenderView = {
      id: d.id,
      parentRender: view.parentRender,
      isContainer: d.type === "page",
      pins,
      frameless,
      title,
      titleAlwaysPresent,
      indicators,
      canvasMargin
    };
  
    // Determine "items" and "canChangeSize" based on view.config
    let renderView = null;
    switch (view.config) {
      case "plain_object":
        renderView = {
          ...baseRenderView,
          canChangeSize: "plain",
          items: stageOptions => {
            const data = myState[d.id].object;
            return renderPlainObject({ ...data, ...stageOptions, ...renderOptions, renderOptions });
          }
        };
        break;
      case "datatable":
        renderView = {
          ...baseRenderView,
          canChangeSize: true,
          items: stageOptions => {
            const data = myState[d.id].data;
            const viewConfig = myState[d.id].viewConfig;
            return renderDatatable({ id: d.id, data, stageOptions, renderOptions, viewConfig });
          }
        };
        break;
  
      case "full": {
        let renderFunc = stageOptions =>
          RenderPrimitiveAsKonva(primitiveToRender, { ...stageOptions, ...renderOptions, renderOptions });
        // Special case for a reference
        if (d.referenceId === 118) {
          let boardToCombine = d.primitives.imports.allItems;
          if (d.order) {
            boardToCombine.sort((a, b) => d.order.indexOf(a.id) - d.order.indexOf(b.id));
          }
          if (boardToCombine.length > 0) {
            renderFunc = stageOptions => {
              const partials = boardToCombine.map(item => {
                const board = myState[item.id];
                return {
                  primitive: item,
                  axis: board.axis,
                  columnExtents: board.columns,
                  rowExtents: board.rows,
                  viewConfig: board.viewConfig,
                  list: board.list
                };
              });
              return RenderPrimitiveAsKonva(primitiveToRender, {
                ...stageOptions,
                ...renderOptions,
                renderOptions,
                partials
              });
            };
          }
        }
        renderView = {
          ...baseRenderView,
          canChangeSize: "width",
          items: renderFunc
        };
        break;
      }
  
      case "cat_overview":
      case "word_cloud":
        renderView = {
          ...baseRenderView,
          canChangeSize: "width",
          items: stageOptions =>
            RenderPrimitiveAsKonva(primitiveToRender, {
              ...stageOptions,
              ...renderOptions,
              renderOptions,
              config: view.config,
              data: view.renderData
            })
        };
        break;
      case "chart":
      case "dial":
        let dataSource = view;
        if (view.axisSource) {
            if (view.axisSource.inFlow && view.axisSource.configParent?.flowElement) {
            dataSource = myState[view.axisSource.configParent.id];
            } else {
            dataSource = myState[view.axisSource.id];
            }
            if (!dataSource) {
            console.warn(`Couldn't find config for axis Source ${view.axisSource.id}`);
            dataSource = view;
            }
        }
        const catData = {}
        let useJoint = view.config === "dial"
        let mapped = {}
        const pass = ["clearly", "likely", ""]
        for(const c of dataSource.columns){
            for(const r of dataSource.rows){
                let idx = [r.idx, c.idx].filter(d=>d).join("-") ?? "base"
                let label
                if( useJoint ){
                    label = [r.label, c.label].every(d=>pass.includes(d)) ? pass[0] : "not at all"
                }else{
                    label = [r.label, c.label].filter(d=>d).join(" - ") ?? "base"
                }
                mapped[idx] = label
                const axisPrims = [r.primitive, c.primitive].filter(d=>d)
                if( !catData[label] ){
                    catData[label] = {label, items: [], count: 0, axisPrims}
                }
            }
        }
        for(const p of dataSource.list ){
            for(const c of [p.column].flat() ?? [undefined]){
                for(const r of [p.row].flat() ?? [undefined]){
                    const idx = mapped[[r, c].filter(d=>d).join("-") ?? "base"]
                    if( catData[idx]){
                        catData[idx].items.push( p.primitive)
                        catData[idx].count++
                    }
                }
            }
        }
        renderView = {
          ...baseRenderView,
          canChangeSize: "width",
          items: stageOptions =>
            RenderPrimitiveAsKonva(primitiveToRender, {
              ...stageOptions,
              ...renderOptions,
              renderOptions,
              config: view.config,
              data: Object.values(catData)
            })
        };
        break;
      case "page": {
        const renderFunc = stageOptions =>
          RenderPrimitiveAsKonva(primitiveToRender, { ...stageOptions, ...renderOptions, renderOptions, data: view.renderData });
        renderView = {
          ...baseRenderView,
          utils: view.renderSubPages || RENDERSUB
            ? { prepareBoards: prepareSubBoards, renderBoard: renderSubBoard }
            : undefined,
          canChangeSize: true,
          canvasMargin: [0, 0, 0, 0],
          items: renderFunc,
          bgFill: "white"
        };
        break;
      }
  
      case "flow": {
        const renderFunc = stageOptions =>
          RenderPrimitiveAsKonva(primitiveToRender, { ...stageOptions, ...renderOptions, renderOptions, data: view.renderData });
        renderView = {
          ...baseRenderView,
          resizeForChildren: true,
          routeInternal: true,
          canChangeSize: true,
          canvasMargin: [0, 0, 0, 0],
          items: renderFunc,
          bgFill: "transparent",
          flow: true
        };
        break;
      }
  
      case "widget": {
        const data = view.renderData;
        if (view.inFlow) {
          data.basePrimitive = view.primitive;
        }
        const renderFunc = stageOptions =>
          RenderPrimitiveAsKonva(primitiveToRender, {
            ...stageOptions,
            ...renderOptions,
            config: "widget",
            data
          });
        renderView = {
          ...baseRenderView,
          canChangeSize: "width",
          canvasMargin: [2, 2, 2, 2],
          items: renderFunc
        };
        break;
      }
  
      case "report_set":
        renderView = {
          ...baseRenderView,
          canChangeSize: "width",
          items: stageOptions =>
            RenderSetAsKonva(primitiveToRender, view.list, {
              referenceId: primitiveToRender.referenceId,
              ...stageOptions,
              ...renderOptions,
              axis: view.axis,
              data: view.renderData,
              extents: { column: view.columns, row: view.rows }
            })
        };
        break;
  
      default:
        if (d.type === "query" && d.processing?.ai?.data_query) {
          renderView = {
            ...baseRenderView,
            canChangeSize: true,
            items: stageOptions =>
              RenderPrimitiveAsKonva(primitiveToRender, {
                config: "ai_processing",
                ...stageOptions,
                ...renderOptions,
                renderOptions
              })
          };
        } else if (view.viewConfig?.matrixType) {
            
            const rows = ()=>view.rows.map(item => ({
                ...item,
                primitive: mainstore.primitive(item.idx)
            })).sort((a,b)=>b.count - a.count)

            let columns

            if( view.primitive.workspaceId === "680cb9e84d11562ca118b10d"){
                const fixed = ["AA Breakdown Cover", "RAC Breakdown Cover", "Green Flag Breakdown Cover", "Start Rescue", "Emergency Assist"].reverse()
                columns = ()=>view.columns.map(item => ({
                    ...item,
                    primitive: mainstore.primitive(item.idx)
                })).sort((a,b)=>fixed.indexOf(b.label) - fixed.indexOf(a.label))

            }else{
                columns = ()=>view.columns.map(item => ({
                    ...item,
                    primitive: mainstore.primitive(item.idx)
                }))
            }

            renderView = {
                ...baseRenderView,
                canChangeSize: view?.viewConfig?.resizable,
                items: stageOptions =>
                RenderSetAsKonva(primitiveToRender, view.list, {
                    ...stageOptions,
                    ...renderOptions,
                    renderOptions,
                    axis: view.axis,
                    allocations: view.filteredAllocations,
                    extents: {
                    column: columns(),
                    row: rows()
                    },
                    config: view.viewConfig?.matrixType
                })
            };
        } else {
          renderView = {
            ...baseRenderView,
            utils: { prepareBoards: prepareSubBoards, renderBoard: renderSubBoard },
            canChangeSize: true,//view?.viewConfig?.resizable,
            items: stageOptions => mapMatrix(stageOptions, d, view)
          };
        }
        break;
    }
  
    return renderView;
  }
    function getPageVariants( pageInputs, inputs, allItems = false ){
        const combos = []
        if(  pageInputs.group1 ){

            if( pageInputs.group1?.data ){
                for(const g1 of pageInputs.group1?.data?.filter(d=>d)){
                    let groupInputs = inputs.filter(d=>d.id === g1.id || d.parentPrimitiveIds.includes(g1.id) || d.primitives.source.allIds.includes(g1.id))
                    let done = false
                    if( pageInputs.group2?.data){
                        for(const g2 of pageInputs.group2?.data?.filter(d=>d)){
                            let g2Inputs = groupInputs.filter(d=>d.id === g2.id || d.parentPrimitiveIds.includes(g2.id) || d.primitives.source.allIds.includes(g2.id))
                            if( allItems ){
                                combos.push({a: g1, b: g2, data: g2Inputs})
                                if( g2Inputs.length > 0){
                                    done = true
                                }
                            }else{
                                if( g2Inputs.length > 0){
                                    done = true
                                    combos.push(g2Inputs)
                                }
                            }
                        }
                    }
                    if(!done){
                        if( allItems ){
                            combos.push({a: g1,  data: groupInputs})
                        }else{
                            if( groupInputs.length > 0){
                                combos.push(groupInputs)
                            }
                        }
                    }
                }
            }
            console.log(`---> For ${combos.length} sub pages`)
        }                        
        return combos
    }

    function SharedPrepareBoard(d, myState, element, forceViewConfig){
        let stateId = element ? element.id : d.id
        if( myState[stateId]?.skipNextBuild ){
            console.log(`++++ SKIP THIS BUILD of ${stateId}`)
            myState[stateId].skipNextBuild = false
            return
        }
        let didChange = false
        let boardsToRefresh = []
        if( !myState[stateId]){
                myState[stateId] = {id: stateId}
        }
        const basePrimitive = d

        let primitiveToPrepare = myState[stateId].underlying ?? d
        let renderType = primitiveToPrepare.type

        if( d.type === "element" ){
            const pagePrimitive = myState[stateId].page
            const pageState = pagePrimitive ? myState[pagePrimitive.id] : undefined
            let inputs
            const config = basePrimitive.getConfig

            const format = {
                fontSize: config?.fontSize,
                fontStyle: config?.fontStyle,
                fontFamily: config?.fontFamily,
                align: config?.align,
                heading: config?.heading,
                compose: config?.compose,
                fill: config.fill,
                stroke: config.stroke,
                style: config.style,
                text_padding: config.text_padding,
                text_color: config.text_color,
            }
            if( d.referenceId ===  PrimitiveConfig.Constants.SHAPE_ELEMENT){//{pageState?.underlying){
                let text = config.text
                
                myState[stateId].object = {
                    type: "shape",
                    text: text,
                    ...format
                } 
                myState[stateId].config = "plain_object"
                myState[stateId].primitive = basePrimitive
                renderType = "plain_object"
                didChange = true
            }else{
                const pageInstance = pageState.underlying ?? pageState.primitive
                const pageOutputs = pageState.primitive.primitives.outputs
                const pins = Object.keys(pageOutputs ?? {}).filter(d2=>pageOutputs[d2].allIds.includes(d.id)).map(d=>d.split("_")[0])
                if( pins.length > 0){
                    let pageInputs = pageInstance.inputs
                    let inputs
                    if( myState[stateId].variant ){
                        inputs = myState[stateId].variant
                    }else{
                        inputs =pins.flatMap(pin=>pageInputs[pin]?.data ?? [])
                        
                        let variants = getPageVariants( pageInputs, inputs)
                        inputs = variants.length > 0 ? variants[0] : inputs
                    }
                   

                    if( pageInputs[pins[0]]?.config === "primitive"){
                        // Do Ancestors
                        if( config.source_items){
                            let changed = false
                            do{
                                changed = false
                                inputs = uniquePrimitives( inputs.map(d=>{
                                    if( d.referenceId === 82 || d.type == "summary" || d.type === "query"){
                                        changed = true
                                        return [d.primitives.source.allItems,d.primitives.link.allItems].flat()
                                    }else{
                                        return d
                                    }
                                }).flat(Infinity))
                            }while(changed)

                        }
                        myState[stateId].originalList = inputs
                        if( config.flowinstance){
                            inputs = uniquePrimitives(inputs.flatMap(d=>d.findParentPrimitives({type: "flowinstance", first:true})))
                        }else{
                            if( config.ancestor){
                                const rel = config.ancestor
                                if( rel && rel[0] === "SEGMENT"){
                                    inputs = uniquePrimitives( inputs.flatMap(d=>d.findParentPrimitives({type: ["segment"]})) ).slice(-1)
                                }else{
                                    inputs = uniquePrimitives( inputs.flatMap(d=>d.relationshipAtLevel(rel,rel.length)) ).slice(-1)
                                }
                                if( inputs[0]?.type === "flowinstance"){
                                    inputs = uniquePrimitives(inputs.flatMap(d=>d.itemsForProcessing))
                                }
                            }
                        }
                    }

                   
                    inputs = inputs.filter(d=>d)
                    if( pageInputs[pins[0]]?.config === "primitive"){
                        if( basePrimitive.getConfig.extract === "content"){
                            const data = []
                            let contentType = "text"
                            for(const input of inputs){
                                if( input.type === "summary"){
                                    contentType = "structured_text"
                                    let base = input.referenceParameters.structured_summary ?? []
                                    const sectionconfig = basePrimitive.referenceParameters?.sections
                                    let firstFontSize
                                    const result =  base.map(section=>{
                                        let target = sectionconfig?.[section.heading]
                                        if( !target ){
                                            let allItems = Object.keys(sectionconfig ?? "").map(d=>[d, compareTwoStrings(d, section.heading)])
                                            const candidates = allItems.filter(d=>d[1] > 0.4).sort((a,b)=>b[1]-a[1])
                                            if( candidates.length > 0){
                                                target = sectionconfig?.[candidates[0][0]]
                                            }
                                        }
                                        if( target?.show !== false ){
                                            if( !firstFontSize ){
                                                firstFontSize = target?.fontSize
                                            }
                                            return {
                                                ...section,
                                                heading: target?.heading === false ? undefined : section.heading,
                                                fontSize: target?.fontSize,
                                                fontStyle: target?.fontStyle

                                            }
                                        }
                                    }).filter(d=>d)
                                    const parentSegment = input.parentPrimitives.find(d=>d.type === "segment")
                                    if( parentSegment ){
                                        result.unshift({content: parentSegment.filterDescription, fontStyle: "bold", fontSize: firstFontSize ? firstFontSize * 1.4 : undefined, sectionStart: true})
                                    }
                                    data.push( result )
                                }else{
                                    let text
                                    if( input.type === "segment"){
                                        text = input.filterDescription
                                    }else{
                                        text = basePrimitive?.renderConfig?.field ? ( basePrimitive.renderConfig.field === "context" ? input.content : input.referenceParameters[basePrimitive.renderConfig.field]) : input.title
                                    }
                                    data.push( text )
                                }
                            }

                            myState[stateId].object = {
                                type: contentType,
                                ids: inputs.map(d=>d.id),
                                text: data,//contentType === "text" ? data.join("\n") : data,
                                ...format
                            } 
                            myState[stateId].config = "plain_object"
                            myState[stateId].primitive = basePrimitive
                            myState[stateId].primitiveList = inputs
                            renderType = "plain_object"
                        }else if (basePrimitive.getConfig.extract === "page"){
                            let text = format.compose
                            format.compose = undefined
                            if( text && pagePrimitive){
                                if( text.match(/\{.+\}/)){
                                    const status = pageInstance.inputPinsWithStatus
                                    const pinMap = PrimitiveConfig.getPinMap(pageInstance, "inputs")
                                    const expansionItems = text.match(/\{([^}]+)\}/g).map(d=>d.slice(1,-1)).filter((d,i,a)=>a.indexOf(d)===i);
                                    const pinData = {}
                                    myState[stateId].pinSource = []
                                    for(const expFull of expansionItems){
                                        const [exp, mod] = expFull.split("_")
                                        const pin = Object.keys(status).find(d=>status[d].name === exp)
                                        if( pin ){
                                            if( status[pin].connected ){
                                                const pinConnectDetails = pinMap.find(d=>d.inputPin === pin)
                                                if( pinConnectDetails ){

                                                    console.log(`---> Will get pin data src = ${ pinConnectDetails.sourceId}`)

                                                    let sourcePrim = MainStore().primitive(pinConnectDetails.sourceId)
                                                    myState[stateId].pinSource.push(sourcePrim)
                                                    if( sourcePrim.inFlow && sourcePrim.configParent){
                                                        sourcePrim = sourcePrim.configParent
                                                    }
                                                    const source = myState[ sourcePrim.id ]
                                                    let localItems = []
                                                    if( source ){
                                                        if( source.primitiveList){
                                                            localItems = source.primitiveList
                                                        }else{
                                                            localItems = source.list?.map(d=>d.primitive)
                                                        }
                                                    }
                                                    pinData[exp] = {data: localItems}
                                                }
                                            }
                                        }
                                    }
                                    text = expandStringLiterals( text, pinData)
                                }
                            }                    
                            myState[stateId].object = {
                                type: "text",
                                text: text,
                                ...format
                            } 
                            myState[stateId].config = "plain_object"
                            myState[stateId].primitive = basePrimitive
                            renderType = "plain_object"
                            didChange = true
                        }else{
                            myState[stateId].primitiveList = inputs
                            if( config.view_axis){
                                const status = pageInstance.inputPinsWithStatus?.[pins[0]]
                                if( status?.connected ){
                                    const map = PrimitiveConfig.getPinMap(pageInstance, "inputs")
                                    const pin = map.find(d=>d.inputPin === pins[0])
                                    if( pin ){
                                        myState[stateId].axisSource = mainstore.primitive(pin.sourceId)
                                    }
                                }
                            }
                            renderType = "view"
                        }
                    
                    }else{
                        myState[stateId].object = {
                            type: "text",
                            ids: inputs.map(d=>d.id),
                            text: inputs,
                            ...format
                        } 
                        myState[stateId].config = "plain_object"
                        myState[stateId].primitive = basePrimitive
                        renderType = "plain_object"
                    }
                }

                didChange = true

            }

        }


        myState[stateId].isBoard = true
        const oldConfig = myState[stateId]?.config

        let pinIdx = 1

        function processPins(source){
            return Object.keys(source ?? {}).map((d,i)=>({
                    name: d,
                    label: source[d].name,
                    rIdx: i
                }))
            .reduce((a,c)=>{
                c.idx = pinIdx
                a[c.name] = c
                pinIdx++
                return a
            }, {})
        }

        myState[stateId].inputPins = myState[stateId].inputPins ?? processPins(primitiveToPrepare.inputPins)
        if( !myState[stateId].outputPins ){
            myState[stateId].outputPins = processPins(primitiveToPrepare.outputPins )

            //if( basePrimitive.type === "flow" || basePrimitive.type === "page" ){
            if( basePrimitive.type === "flow" ){
                const tempOut = {}
               for(const pin of Object.values(myState[stateId].inputPins)){
                    tempOut[pin.name] = {
                        ...pin,
                        internal: true,
                        showLabel: false,
                        rIdx: myState[stateId].inputPins[pin.name].rIdx,
                        idx: pinIdx++
                    }
               }
               
               for(const pin of Object.values(myState[stateId].outputPins)){
                    myState[stateId].inputPins[pin.name] = {
                        ...pin,
                        internal: true,
                        showLabel: false,
                        rIdx: myState[stateId].outputPins[pin.name].rIdx,
                        idx: pinIdx++
                    }
               }
               myState[stateId].outputPins = {
                ...myState[stateId].outputPins,
                ...tempOut
               }
            }
        }   

        let widgetConfig = {}
        const showItems = basePrimitive.findParentPrimitives({type: basePrimitive.inFlow ? "flow" : "board"})[0]?.frames?.[stateId]?.showItems
        
        if( !myState.hideWidgets){

            if( primitiveToPrepare.type=== "query"){
                let useQuery = basePrimitive.referenceId === 81 

                widgetConfig.showItems = showItems
                widgetConfig.title = basePrimitive.title
                widgetConfig.icon = <HeroIcon icon='FARobot'/>
                widgetConfig.items = "results"
                widgetConfig.count = primitiveToPrepare.itemsForProcessing.length
                widgetConfig.content = `**${useQuery ? "Query" : "Prompt"}:** ` + (useQuery ? primitiveToPrepare.getConfig.query?.slice(0,900) : primitiveToPrepare.getConfig.prompt?.slice(0,900))
                myState[stateId].widgetConfig = widgetConfig
                didChange = true
            }else if( primitiveToPrepare.type=== "action"){

                widgetConfig.showItems = showItems
                widgetConfig.title = basePrimitive.title
                widgetConfig.icon = <HeroIcon icon='FARobot'/>
                widgetConfig.items = "results"
                widgetConfig.content = `**Result:** ` + (primitiveToPrepare.getConfig.result ?? "")
                myState[stateId].widgetConfig = widgetConfig
                didChange = true
            }else if( primitiveToPrepare.type=== "summary"){
                widgetConfig.showItems = showItems
                widgetConfig.title = basePrimitive.title
                widgetConfig.icon = <HeroIcon icon='FARobot'/>
                widgetConfig.count = primitiveToPrepare.itemsForProcessing.length
                widgetConfig.items = "results"
                widgetConfig.content = `**Prompt:** ` + primitiveToPrepare.getConfig.prompt
                myState[stateId].widgetConfig = widgetConfig
            }
        }

        

        if( renderType === "widget"){
            myState[stateId].primitive = basePrimitive
            myState[stateId].config = "widget"
            let renderData = {}

            myState[stateId].renderData = renderData
        }else if( renderType === "view" || renderType === "query" || (renderType === "action" && primitiveToPrepare.metadata.hasResults)){
            
            //const items = myState[stateId].primitiveList ?? primitiveToPrepare.itemsForProcessing
            const items = getLocalPrimitiveListForBoardId(stateId, myState) ?? primitiveToPrepare.itemsForProcessing
            
            const viewConfigs = CollectionUtils.viewConfigs(items?.[0]?.metadata)
            //let activeView = primitiveToPrepare?.referenceParameters?.explore?.view 
            let activeView = basePrimitive?.referenceParameters?.explore?.view 
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

            const columnAxis = CollectionUtils.primitiveAxis(primitiveToPrepare, "column", items)
            const rowAxis = CollectionUtils.primitiveAxis(primitiveToPrepare, "row", items)

            
            
            if( viewConfig?.renderType === "cat_overview"){
                let config = primitiveToPrepare.getConfig
                let categoriesToMap = []
                if( config.view_axis ){
                    let dataSource
                    if( myState[stateId].axisSource.inFlow && myState[stateId].axisSource.configParent?.flowElement){
                        dataSource = myState[myState[stateId].axisSource.configParent.id] 
                    }else{
                        dataSource = myState[myState[stateId].axisSource.id] 
                    }
                    if( dataSource ){
                        categoriesToMap = [
                            dataSource.axis?.row?.type === "category" ?  dataSource.axis?.row?.primitiveId : undefined,
                            dataSource.axis?.column?.type === "category" ?  dataSource.axis?.column?.primitiveId : undefined,
                        ].filter(d=>d).map(d=>mainstore.primitive(d))

                    }

                }else if( config.explore.axis?.column?.type === "category" || config.explore.axis?.row?.type === "category"){
                    categoriesToMap = [
                        config.explore.axis?.column?.type === "category" ? primitiveToPrepare.primitives.axis.column.allItems : undefined,
                        config.explore.axis?.row?.type === "category" ? primitiveToPrepare.primitives.axis.row.allItems : undefined,
                    ].flat().filter(d=>d)
                }else{
                    categoriesToMap = primitiveToPrepare.primitives.origin.allUniqueCategory
                }             
                console.log(`Got ${categoriesToMap?.length} to map`)
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
                    if( primitiveToPrepare.renderConfig?.show_none ){
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
                                    tag: mainstore.primitive(d.idx)?.referenceParameters?.tag,
                                    count: items.length,
                                    items
                                }})
                        }
                })

                myState[stateId].primitive = basePrimitive
                myState[stateId].stateId = stateId
                myState[stateId].config = viewConfig.configName ?? "cat_overview"
                myState[stateId].renderData = {
                    mappedCategories
                }
            }else{
                if( viewConfig.matrixType === "checktable" || viewConfig.matrixType === "distribution" || viewConfig.showAsCounts){
                    let dataTable 
                    
                    if(myState[stateId].axisSource){
                        let dataSource
                        if (myState[stateId].axisSource.inFlow && myState[stateId].axisSource.configParent?.flowElement) {
                            dataSource = myState[myState[stateId].axisSource.configParent.id];
                        } else {
                            dataSource = myState[myState[stateId].axisSource.id];
                        }
                        if( dataSource){
                            const columns = (dataSource.data ? dataSource.data.defs?.columns : dataSource.axis?.column ) ?? []
                            const rows = (dataSource.data ? dataSource.data.defs?.rows : dataSource.axis?.row) ?? []
                            dataTable = CollectionUtils.createDataTable( items, {columns, rows, viewFilters: [], config: undefined, hideNull: false, alreadyFiltered: true})
                            console.log(`GOT from ${dataSource.id}`)
                        }

                    }
                    if( !dataTable ){
                        dataTable = CollectionUtils.createDataTableForPrimitive( primitiveToPrepare, undefined, items )
                    }

                    myState[stateId].primitive = basePrimitive
                    myState[stateId].config = "datatable"
                    myState[stateId].viewConfig = viewConfig
                    myState[stateId].data = dataTable
                            
                    myState[stateId].internalWatchIds = dataTable.ids

                    return [stateId]
                }                    
                columnAxis.allowMove = columnAxis.access === 0 && !columnAxis.relationship
                rowAxis.allowMove = rowAxis.access === 0 && !rowAxis.relationship

                const primitiveConfig = primitiveToPrepare.getConfig
                let hideNull = primitiveConfig?.explore?.hideNull
                let viewPivot = primitiveConfig?.explore?.viewPivot
                let viewFilters = []
                if( viewConfig.needsAllAllocations ){
                    viewFilters = primitiveConfig?.explore?.filters?.map((d2,i)=>CollectionUtils.primitiveAxis(primitiveToPrepare, i, items)) ?? []            
                }
                let filterApplyColumns = primitiveConfig?.explore?.axis?.column?.filter ?? []
                let filterApplyRows = primitiveConfig?.explore?.axis?.row?.filter ?? []

                let liveFilters = primitiveToPrepare.primitives.allUniqueCategory.filter(d=>primitiveToPrepare.referenceId === PrimitiveConfig.Constants["LIVE_FILTER"]).map(d=>{
                    return {
                        type: "category",
                        primitiveId: d.id,
                        category: d,
                        isLive: true,
                        title: `Category: ${d.title}`                
                    }
                })
                
                let {data, extents} = CollectionUtils.mapCollectionByAxis( items, columnAxis, rowAxis, viewFilters, liveFilters, viewPivot )
                const filteredColumnExtents = extents.column.filter(d=>{
                    if( d.idx === "_N_" && (filterApplyColumns.includes(undefined) || filterApplyColumns.includes(null))){
                        return false
                    }
                    if( filterApplyColumns.includes(d.idx)){
                        return false
                    }
                    return true
                    
                })
                const filteredRowExtents = extents.row.filter(d=>{
                    if( d.idx === "_N_" && (filterApplyRows.includes(undefined) || filterApplyRows.includes(null))){
                        return false
                    }
                    if( filterApplyRows.includes(d.idx)){
                        return false
                    }
                    return true
                    
                })
                const filteredAllocations = viewFilters.reduce((a,c,i)=>{
                    const name = `filterGroup${i}`
                    a[name] = extents[name].filter(d=>{
                        
                        if( d.idx === "_N_" && (c.filter.includes(undefined) || c.filter.includes(null))){
                            return false
                        }
                        if( c.filter.includes(d.idx)){
                            return false
                        }
                        return true
                    })
                    return a
                }, {})

                /*let filtered = CollectionUtils.filterCollectionAndAxis( data, [
                    {field: "column", exclude: filterApplyColumns},
                    {field: "row", exclude: filterApplyRows},
                    ...viewFilters.map((d,i)=>{
                        return {field: `filterGroup${i}`, exclude: d.filter}
                    })
                ], {columns: filteredColumnExtents, rows: filteredRowExtents, hideNull})*/
                let filtered = CollectionUtils.filterCollectionAndAxis( data, [], {columns: filteredColumnExtents, rows: filteredRowExtents, hideNull})

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
                        didChange = didChange || changes
                    }
                }

                const watchIds = new Set( filtered.data.flatMap(d=>d.primitive.parentPrimitiveIds) )
                            
                myState[stateId].primitive = basePrimitive
                myState[stateId].config = viewConfig.configName ?? "explore_" + activeView
                myState[stateId].list = filtered.data
                myState[stateId].internalWatchIds = Array.from(watchIds)
                myState[stateId].axis = {column: columnAxis, row: rowAxis}
                myState[stateId].columns = filtered.columns
                myState[stateId].viewConfig = viewConfig
                myState[stateId].rows = filtered.rows
                myState[stateId].extents = extents
                myState[stateId].filteredAllocations = filteredAllocations
                myState[stateId].toggles = Object.keys(extents).reduce((a,c)=>{
                                                                        if(c.match(/liveFilter/)){
                                                                            a[c] = extents[c]
                                                                        }
                                                                        return a}, {})
                if( viewConfig?.renderType === "summary_section"){
                    const sources = []
                    const track = new Set()
                    function expandSources(d){
                        if( Object.keys(d.primitives ?? {}).includes("source")){
                            for(const d2 of d.primitives.source.allItems){
                                if( !track.has(d2.id)){
                                    track.add(d2.id)
                                    sources.push(d2)
                                    expandSources(d2)
                                }
                            }
                        }
                    }
                    items.forEach(d=>expandSources(d))
                    const company_candidates = MainStore().uniquePrimitives( sources.flatMap(d=>d.referenceId === 29 ? d : d.findParentPrimitives({referenceId: [29], first: true}))).flat(Infinity) 
                    myState[stateId].renderData = {
                        company_candidates
                    }
                }
            }
        }else if( renderType === "result" || renderType === "summary" || renderType === "element" || renderType === "action"){
            let viewConfig
            const viewConfigs = CollectionUtils.viewConfigs(basePrimitive.metadata)
            if( forceViewConfig ){
                let activeView = viewConfigs.findIndex(d=>d.renderType === forceViewConfig.viewConfig || d.id === forceViewConfig.viewConfig) 
                if( activeView == -1){
                    viewConfig = {
                        renderType: forceViewConfig.viewConfig
                    }
                }else{
                    viewConfig = viewConfigs[activeView] 
                }
            }

            let childChanged = myState[stateId].showItems !== showItems
            myState[stateId].showItems = showItems
            myState[stateId].primitive = basePrimitive
            myState[stateId].list = [{column: undefined, row: undefined, primitive: primitiveToPrepare}]
            myState[stateId].columns = [{idx: undefined, label: ''}]
            myState[stateId].rows = [{idx: undefined, label: ''}]
            myState[stateId].viewConfig = viewConfig
            myState[stateId].config = "full"
            myState[stateId].extents = {
                columns: [{idx: undefined, label: ''}],
                row:[{idx: undefined, label: ''}]
            }
            myState[stateId].toggles = {}
            
            didChange ||= childChanged
        }else if( renderType === "actionrunner" || renderType === "categorizer" ){
            const items = primitiveToPrepare.itemsForProcessing
            const title = items.length === 0 ? "items" : (items.length > 1 ? items[0]?.metadata?.plural : undefined ) ?? items[0]?.metadata?.title
            myState[stateId].primitive = basePrimitive
            myState[stateId].config = "widget"
            myState[stateId].renderData = {
                title: basePrimitive.title,
                icon: <HeroIcon icon='FARun'/>,
                count: items.length,
                items: items[0]?.metadata?.title ?? "items"
            }
            didChange = true
        }else if( renderType === "search" ){

            const resultCategory = mainstore.category( d.metadata.parameters.sources.options[0].resultCategoryId )

            myState[stateId].primitive = basePrimitive
            myState[stateId].config = "widget"
            myState[stateId].renderData = {
                title: basePrimitive.title,
                icon: <HeroIcon icon={resultCategory?.icon}/>,
                items: resultCategory.plural ?? resultCategory.title + "s",
                //count: primitiveToPrepare.primitives.strictDescendants.filter(d=>d.referenceId === resultCategory.id).length
            }
        }else if( renderType === "page" ){
            let childNodes = d.primitives.origin.uniqueAllItems
            childNodes = [...childNodes.filter(d=>d.referenceId === PrimitiveConfig.Constants.SHAPE_ELEMENT && d.referenceParameters.style === "rect"), ...childNodes.filter(d=>d.referenceId === PrimitiveConfig.Constants.SHAPE_ELEMENT && d.referenceParameters.style !== "rect"), ...childNodes.filter(d=>d.referenceId !== PrimitiveConfig.Constants.SHAPE_ELEMENT )]
            
            didChange ||= d.referenceParameters?.explore?.view !== myState[stateId].lastView
            
            myState[stateId].internalWatchIds = childNodes.map(d=>d.id)

            myState[stateId].primitive = basePrimitive
            myState[stateId].config = "page"
            myState[stateId].lastView = d.referenceParameters?.explore?.view
 //           myState[stateId].title = `${basePrimitive.title} - #${basePrimitive.plainId}`
            myState[stateId].renderData = {
                icon: <HeroIcon icon='CogIcon'/>,
                count: primitiveToPrepare.primitives.uniqueAllIds.length
            }
            if( !myState[stateId].renderSubPages && !RENDERSUB){
                for(let child of childNodes){
                    myState[child.id] ||= {
                        id: child.id, 
                        inPage: true,
                        page: d
                    }
                    const renderResult = SharedPrepareBoard(child, myState)
                    const childChanged = renderResult !== false
                    if( childChanged ){
                        boardsToRefresh = boardsToRefresh.concat([child.id, ...renderResult])
                    }
                    didChange ||= (childChanged ?? true)
                    myState[child.id].parentRender = stateId
                }
            }
        }else if( renderType === "flow" ){
            let childNodes = d.primitives.origin.uniqueAllItems
            childNodes = [...childNodes.filter(d=>d.type !== "page"),...childNodes.filter(d=>d.type === "page")]
            const flowInstances = childNodes.filter(child=>{
                if( child.type !== "flowinstance" ){
                    return false
                }
                if( basePrimitive.flowElement){
                    // subflow
                    if( myState[stateId].flowInstance ){
                        return myState[stateId].flowInstance.primitives.subfi.allIds.includes( child.id)
                    }
                }
                return true
            }).sort((a,b)=>a.plainId - b.plainId)
            let selectedFlowIdx = Math.min(d.referenceParameters?.explore?.view ?? 0, flowInstances.length - 1)
            const flowInstanceToShow = flowInstances[ selectedFlowIdx ]
            childNodes = childNodes.filter(d=>d.type !== "flowinstance")
            didChange ||= d.referenceParameters?.explore?.view !== myState[stateId].lastView
            
            /*if(flowInstanceToShow ){
                stopWatchingFlowInstances(primitiveToPrepare, flowInstances, myState, flowInstanceToShow.id)
                watchFlowInstance( primitiveToPrepare, flowInstanceToShow, myState)
                myState[stateId].internalWatchIds = [flowInstanceToShow.id, ...flowInstanceToShow.primitives.origin.allIds]
            }*/

            myState[stateId].primitive = basePrimitive
            myState[stateId].flowInstances = flowInstances
            myState[stateId].config = "flow"
            myState[stateId].lastView = d.referenceParameters?.explore?.view
            myState[stateId].title = `${basePrimitive.title} - #${basePrimitive.plainId}${flowInstanceToShow ? ` (${flowInstanceToShow.plainId})` : ""}`
            myState[stateId].renderData = {
                icon: <HeroIcon icon='CogIcon'/>,
                count: primitiveToPrepare.primitives.uniqueAllIds.length
            }

            for(let child of childNodes){
                if( child.type === "flowinstance"){
                    continue
                }
                const showItems = d.frames?.[child.id]?.showItems
                const parentFlowInstanceChanged = myState[child.id]?.flowInstance?.id !== flowInstanceToShow?.id

                
                log.trace(`- preparing child of flow ${child.plainId} ${child.type}`)
                myState[child.id] ||= {
                    id: child.id, 
                    inFlow: true,
                    flow: d,
                }
                myState[child.id].flowInstance = flowInstanceToShow
                let childChanged = myState[child.id].showItems !== showItems

                myState[child.id].showItems = showItems


                if( flowInstanceToShow && child.type !== "flow"){
                    const instanceChild = flowInstanceToShow.primitives.uniqueAllItems.find(d=>d.parentPrimitiveIds.includes(child.id))
                    if( instanceChild ){
                        myState[child.id].underlying = instanceChild
                    }else{
                        console.log(`-- couldnt find instance for flowinstance ${flowInstanceToShow.id}`)
                    }
                }
                const renderResult = SharedPrepareBoard(child, myState)
                childChanged ||= renderResult !== false || parentFlowInstanceChanged
                if( childChanged ){
                    boardsToRefresh = boardsToRefresh.concat([child.id, ...(renderResult || [])])
                }
                didChange ||= (childChanged ?? true)
                log.trace(`- Change status`, {renderResult: renderResult !== false, parentFlowInstanceChanged, childChanged, didChange})
                myState[child.id].parentRender = stateId
            }
        }
        if( myState[stateId] && forceViewConfig){
            myState[stateId].renderConfigOverride = forceViewConfig.renderConfig
        }
        if( element ){
            myState[stateId].element = element

        }
        if( oldConfig !== myState[stateId].config){
            didChange = true
        }
        return didChange ? [stateId, ...boardsToRefresh] : false
    }


async function watchFlowInstances( flow, flowInstances, state){
    for(const fi of flowInstances ){
        await watchFlowInstance(flow, fi, state)
    }

}
async function stopWatchingFlowInstances( flow, flowInstances, state, filter){
    if( filter ){
        filter = [filter].flat()
    }
    for(const fi of flowInstances ){
        if( filter && filter.includes(fi.id)){
            continue
        }
        await stopWatchingFlowInstance( flow, fi, state)
    }

}
async function stopWatchingFlowInstance( flow, flowInstance, state){
    if( flow && flowInstance && flow.type === "flow" && flowInstance.type === "flowinstance"){
        if( !state.current.flowWatchList ){
            return
        }
        if( !state.current.flowWatchList[flow.id] ){
            return
        }
        if( !state.current.flowWatchList[flow.id][flowInstance.id] ){
            return
        }
        if( state.current.flowWatchList[flow.id][flowInstance.id].timer ){
            clearTimeout(state.current.flowWatchList[flow.id][flowInstance.id].timer)
        }
        delete state.current.flowWatchList[flow.id][flowInstance.id]
        console.log(`Stopped watching ${flowInstance.id}`)
        
    }
}
async function watchFlowInstance( flow, flowInstance, state){
    if( flow && flowInstance && flow.type === "flow" && flowInstance.type === "flowinstance"){
        if( !state.current.flowWatchList ){
            state.current.flowWatchList = {}
        }
        if( !state.current.flowWatchList[flow.id] ){
            state.current.flowWatchList[flow.id] = {}
        }
        if( !state.current.flowWatchList[flow.id][flowInstance.id] ){
            state.current.flowWatchList[flow.id][flowInstance.id] = {}
            await updateFlowInstanceState(flow, flowInstance, state)
        }
    }
}
async function updateFlowInstanceState(flow, flowInstance, state){
    return
    if(state.current.flowWatchList?.[flow.id]?.[flowInstance.id]){
        try{

            await MainStore().doPrimitiveAction(flowInstance, "instance_info",undefined, (data)=>{
                console.log(`Got state`, data)
                if(state.current.flowWatchList?.[flow.id]?.[flowInstance.id]){
                    state.current.flowWatchList[flow.id][flowInstance.id].status = data
                    
                    if( state.current?.canvas){
                        for(const d of data){
                            state.current.canvas.updateIndicators( d.flowStepId, translateIndicatorState( d ) )
                        }
                    }
                    state.current.flowWatchList[flow.id][flowInstance.id].timer = setTimeout(()=>{
                        updateFlowInstanceState(flow, flowInstance, state)
                    }, 5000)
                }
            })
        }catch(e){
                    state.current.flowWatchList[flow.id][flowInstance.id].timer = setTimeout(()=>{
                        updateFlowInstanceState(flow, flowInstance, state)
                    }, 5000)

        }
    }
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
    const [agentStatus, setAgentStatus] = useState({activeChat: false})


    const setCanvasRef = (node) => {
        if (node) {
          canvas.current = node;
          myState.current.canvas = node
        }
      };

    window.exportFrames = exportMultiple

    useDataEvent("relationship_update set_parameter set_field delete_primitive set_title new_child", undefined, (ids, event, info, fromRemote)=>{
        if( myState.current.watchList  ){
            if( ids.length === 1 && ids[0] === primitive.id && typeof(info) == "string"){
                const frameUpdate = info.match(/frames\.(.+)\.(.+)/)
                if( frameUpdate && frameUpdate[2] === "showItems"){
                    ids = [frameUpdate[1]]
                }
            }

            if( event === "new_child"){
                if( ids[0] === primitive.id ){
                    const child = info?.child
                    if( child){
                        if( !myState[child.id] ){
                            addBoardToCanvas( child )
                        }
                    }
                }
                return false
            }else if( event === "set_field" && info === "rationale"){
                return false
            }

            myState.current.framesToUpdate = myState.current.framesToUpdate || []
            myState.current.framesToUpdateForRemote = myState.current.framesToUpdateForRemote || []
            log.trace(`Got data event`,{ids, event, info, fromRemote})
            Object.keys(myState.current.watchList).forEach(frameId=>{
                let listName = fromRemote ? "framesToUpdateForRemote" : "framesToUpdate"
                let timerName = fromRemote ? "frameUpdateTimerForRemote" : "frameUpdateTimer"
                let checkIds = ids
                if( myState[frameId] && myState.current.watchList[frameId].filter(d=>checkIds.includes(d)).length > 0 ){
                    
                    const existing = myState.current[listName].find(d=>d.frameId === frameId && d.event === event) 
                    if( !existing){
                        myState.current[listName].push({frameId, event, info})
                    }
                    
                    if( !myState.current[timerName] ){
                        myState.current[timerName] = setTimeout(()=>{
                            myState.current[timerName] = undefined
                            for( let {frameId, event, info} of  myState.current[listName]){
                                if( !myState[frameId] ){
                                    continue
                                }
                                log.trace(`In data event handler ${listName}`,{frameId, event, info})
                                let needRefresh = true
                                let refreshBoards = []
                                let resized = false
                                let changedRenderConfig = false
                                let needRebuild = ((event === "set_field" || event === "set_parameter") && info === "referenceParameters.explore.view")
                                

                                if( event === "set_field" && info && typeof(info)==="string"){
                                    if( info.startsWith('processing.ai.')){
                                        const board = myState[frameId]
                                        canvas.current.refreshFrame( board.id, renderView(board.primitive))
                                    }else if(info.startsWith('frames.') && info.endsWith('.showItems')){
                                        needRebuild = true
                                        let targetFrame = info.match(/frames\.(.+)\..+/)?.[1]
                                        if(  targetFrame ){
                                            frameId =  targetFrame
                                        }
                                    }else if(info.startsWith('frames.') ){
                                        if((info.endsWith('.height') || info.endsWith('.width'))){
                                            resized = true
                                            needRebuild = true
                                        }else{
                                            needRefresh = true
                                            //needRebuild = true
                                        }
                                        if( mainstore.primitive(ids[0])?.type === "page"){
                                            myState[frameId].subpages = {}
                                            resized = true
                                        }
                                    }else if(info.startsWith('renderConfig') ){
                                        needRefresh = true
                                        needRebuild = true
                                        changedRenderConfig  = true
                                    }else if(info.startsWith('processing.flow') ){
                                        needRefresh = true
                                    }else if(info.startsWith('processing.') || info.startsWith('embed_')){
                                        needRefresh = false
                                    }
                                }
                                log.trace(` Post field check`,{needRebuild, needRefresh})
                                if(event === "set_field" || event === "set_parameter" ){
                                    const board = myState[frameId]
                                    if( board.primitive.type === "element"){
                                        needRebuild = true
                                    }
                                }
                                if( event === "relationship_update" || needRebuild){
                                    const framePrimitive = myState[frameId].primitive
                                    let doFrame = true
                                    if( framePrimitive.type === "page"){
                                        let dIds = ids
                                        if(typeof(info) === "string" && info.startsWith('frames.') && (info.endsWith('.height') || info.endsWith('.width'))){
                                            dIds = [...ids, info.split(".")[1]]
                                        }
                                        
                                        dIds.filter(d=>d !== frameId).map(d=>myState[d]).forEach(other=>{
                                            if( other && other.primitive.type === "element"){
                                                needRefresh = prepareBoard( other.primitive )
                                                if( needRefresh ){
                                                    refreshBoards.push( other.id )
                                                    needRebuild = true
                                                }
                                                doFrame = false
                                            }
                                        })

                                    }else{
                                        needRebuild = true
                                    }
                                    if( doFrame ){
                                        needRefresh = prepareBoard( framePrimitive )
                                        if( changedRenderConfig ){
                                            needRefresh = true
                                        }
                                    }
                                    if(resized ){
                                        needRefresh = true
                                    }
                                    if( !needRefresh){
                                        console.log(`Cancelled refresh - no changes on ${myState[frameId]?.primitive.plainId}`)
                                    }
                                }
                                log.trace(` Post handling`,{needRebuild, needRefresh})

                                if( needRefresh){
                                    forceUpdateLinks()
                                    
                                    refreshBoards = [...refreshBoards, ...(Array.isArray(needRefresh) ? needRefresh : [frameId])].filter((d,i,a)=>a.indexOf(d) === i)
                                    log.trace(` Refresh list`,{refreshBoards})

                                    console.log(`DOING REFRESH ${frameId} / ${myState[frameId]?.primitive.plainId}, [${refreshBoards.join(", ")}]`)

                                    if( needRebuild ){
                                        for(const frameId of refreshBoards ){
                                            const board = myState[frameId]
                                            canvas.current.refreshFrame( frameId, renderView(board.primitive))
                                        }
                                    }else{
                                        for(const frameId of refreshBoards ){
                                            canvas.current.refreshFrame( frameId )
                                        }
                                    }
                                }
                            }
                            myState.current[listName] = []
                        }, fromRemote ? 4820 : 50)
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
        myState.current.watchList[frameId] = [frameId, myState[frameId].underlying?.id,...(myState[frameId].internalWatchIds ?? [] ),...ids].filter(d=>d)
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
                    parent: p.origin, 
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
            if( p.type === "element"){
                console.log("adding")
                const newPrimitive = await mainstore.createPrimitive({
                    parent: p.origin, 
                    title: `Copy of ${p.title}`,
                    type: p.type,
                    workspaceId: p.workspaceId, 
                    categoryId: p.referenceId, 
                    referenceParameters: p.referenceParameters
                })
                let position = canvas.current.framePosition(p.id)?.relative
                console.log("now to canvas")
                addBoardToCanvas( newPrimitive, {x:position.r + 10, y: position.t, s: position.s})
                console.log("done")
            }
        }
    }



    const [boards,  renderedSet] = useMemo(()=>{
        log.info(`--- REDO BOARD RENDER ${primitive?.id}, ${update}`)
        const boards = [...primitive.primitives.allUniqueView,
                        ...primitive.primitives.allUniquePage, 
                        ...primitive.primitives.allUniqueSummary,
                        ...primitive.primitives.allUniqueCategorizer,
                        ...primitive.primitives.allUniqueQuery,
                        ...primitive.primitives.allUniqueSearch,
                        ...primitive.primitives.allUniqueFlow,
                        ...primitive.primitives.allUniqueAction]
        
        for(const d of boards){
            if(!myState[d.id] ){
                myState[d.id] = {id: d.id}
                prepareBoard(d)
            }
        }
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
                if( right.type === "element"){return}
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
                                return {left: left.id, right: right.id, mode: 0}
                            }
                        }
                        if( left.type === "flow" ){
                            if(right.primitives.imports.allIds.includes(left.id)){
                                const leftPin = myState[left.id].outputPins.impin?.idx
                                const rightPin = myState[right.id].inputPins.impin?.idx
                                return {left: left.id, right: right.id, leftPin, rightPin, mode: 1 }
                            }                       
                            if(right.primitives.inputs.allIds.includes(left.id)){
                                return right.primitives.paths(left.id,"inputs").map(rel=>{
                                    const pinNames = rel.substring(rel.lastIndexOf(".") + 1);
                                    const [leftPinName, rightPinName] = pinNames.split("_")
                                    const leftPin = myState[left.id].outputPins[leftPinName]?.idx
                                    const rightPin = myState[right.id].inputPins[rightPinName]?.idx
                                    return {left: left.id, right: right.id, leftPin, rightPin, mode: 2 }
                                })
                            }                       
                        }else{
                            if(right.primitives.imports.allIds.includes(left.id)){
                                if(left.primitives.outputs.allIds.includes(right.id)){
                                    return left.primitives.paths(right.id,"outputs").map(rel=>{
                                            const pinNames = rel.substring(rel.lastIndexOf(".") + 1);
                                            const [leftPinName, rightPinName] = pinNames.split("_")
                                            const leftPin = myState[left.id].outputPins[leftPinName]?.idx
                                            const rightPin = myState[right.id].inputPins[rightPinName]?.idx
                                            return {left: left.id, right: right.id, leftPin, rightPin, mode: 3 }
                                    })
                                }                       
                            }
                            if( left.primitives.paths(right.id).filter(d=>d.startsWith(".axis.")).length > 0){
                                return
                            }
                            const leftPin = myState[left.id].outputPins.impout?.idx
                            const rightPin = myState[right.id].inputPins.impin?.idx
                            return {left: left.id, right: right.id, leftPin, rightPin, mode: 4 }
                        }
                    }else if( left.type === "flow" && right.primitives.imports.allIds.includes(left.id)){
                        const leftPin = myState[left.id].outputPins.output?.idx
                        const rightPin = myState[right.id].inputPins.impin?.idx
                        return {left: left.id, right: right.id, leftPin, rightPin, mode: 5}
                    }else if( right.type === "flow" && right.primitives.outputs.allIds.includes(left.id)){
                        const rels = right.primitives.paths(left.id,"outputs")
                        const relPins = rels.map(rel=>{

                            const pinNames = rel.substring(rel.lastIndexOf(".") + 1);
                            const [leftPinName, rightPinName] = pinNames.split("_")
                            const leftPinDef = myState[left.id].outputPins[leftPinName]
                            if( leftPinDef && !leftPinDef.internal ){
                                const leftPin = leftPinDef?.idx
                                const rightPin = myState[right.id].inputPins[rightPinName]?.idx
                                if( leftPin !== undefined && rightPin !== undefined){
                                    return {left: left.id, right: right.id, leftPin, rightPin, mode: 6}
                                }
                            }
                        }).filter(d=>d)
                        if( relPins.length > 0 ){
                            return relPins
                        }

                    }else if(right.primitives.inputs.allIds.includes(left.id)){
                            return right.primitives.paths(left.id,"inputs").map(rel=>{
                                const pinNames = rel.substring(rel.lastIndexOf(".") + 1);
                                const [leftPinName, rightPinName] = pinNames.split("_")
                                const leftPin = myState[left.id].outputPins[leftPinName]?.idx
                                const rightPin = myState[right.id].inputPins[rightPinName]?.idx
                                if( leftPin !== undefined && rightPin !== undefined){
                                    return {left: left.id, right: right.id, leftPin, rightPin, mode: 7}
                                }
                            })
                    }else{
                        const route = right.findImportRoute(left.id)
                        if( route.length > 0){
                            //console.log(`Checking view import ${left.plainId} -> ${right.plainId} ()`)
                            for(const axis of ["row","column"]){
                                continue
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
                                                        return {left: left.id, cell: `${c}-${r}`, right: right.id, mode: 8}

                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            const leftPin = myState[left.id].outputPins.impout?.idx
                            const rightPin = myState[right.id].inputPins.impin?.idx

                            return {left: left.id, right: right.id, leftPin, rightPin, mode: 9}


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
                                                        out.push( {left: left.id, cell: `${cIdx}-${rIdx}`, right: right.id, mode: 10})
                                                        added = true
                                                    }
                                                }
                                            })
                                        })
                                    }
                                    if( !added ){
                                        out.push( {left: left.id, right: right.id, mode: 11})
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

    function resizeFrame(fId, {x,y,width, height}){
        let target = myState[fId].parentRender ? myState[myState[fId].parentRender].primitive : primitive
        const board = myState[fId]

        const updateData = {
            ...(target.frames?.[fId] ?? {}),
            ...(x !== undefined && { x }),
            ...(y !== undefined && { y }),
            ...(width !== undefined && { width }),
            ...(height !== undefined && { height }),
        }

        target.setField(`frames.${fId}`, updateData)
        canvas.current.updateFramePosition( fId, updateData)
        
        canvas.current.refreshFrame( board.id, renderView(board.primitive))
    }
    async function createElementFromActivePin(){
        const pin = myState.activePin
        if( pin ){
            const frame = myState[pin.frameId]
            const parent = frame.primitive
            const pinDef = frame.primitive.referenceParameters?.inputPins[pin.name]
            if( pinDef ){
                console.log(pinDef)
                const newPrim = await MainStore().createPrimitive({
                    title: `Element for ${parent.title}`,
                    type: "element",
                    parent: parent,
                    parentPath: `outputs.${pin.name}_impin`,
                    workspaceId: primitive.workspaceId
                })
                if( newPrim ){
                    await mainstore.waitForPrimitive( newPrim.id )
                    await newPrim.addRelationshipAndWait( parent, "imports")
                    const position = canvas.current.framePosition(frame.id).scene
                    addBoardToCanvas( newPrim, position)
                }
            }
        }
    }
    function disconnectActivePin(){
        if( myState.activePin ){
            let clearList
            const primitiveForPin = mainstore.primitive(myState.activePin.frameId)
            if( myState.activePin.name === "impin"){
                clearList = []
                primitiveForPin.primitives.imports.uniqueAllItems.map(d=>{
                    Object.keys(d.primitives.outputs ?? {}).filter(d=>d.endsWith(`_impin`)).map(r=>{
                        if( d.primitives.outputs[r].includes(primitiveForPin.id)){
                            clearList.push({
                                    parent: d,
                                    target: primitiveForPin,
                                    rel: `outputs.${r}`
                                })
                        }
                    })
                    clearList.push({
                            parent: primitiveForPin,
                            target: d,
                            rel: "imports"
                        })
                })
            }else{
                if( myState.activePin.output){
                    clearList = Object.keys(primitiveForPin._parentPrimitives ?? {}).map(d=>{
                        let matches = primitiveForPin._parentPrimitives[d].map(d=>d === `primitives.imports` ||  d.startsWith(`primitives.outputs.${myState.activePin.name}_`) || d.startsWith(`primitives.inputs.${myState.activePin.name}_`) ? d : undefined).filter(d=>d)
                        
                        if(matches.length > 0){
                            const src = mainstore.primitive(d)

                            if( matches.includes("primitives.imports")){
                                console.log(`Checking imports for named import`)
                                const named = primitiveForPin._parentPrimitives[d].filter(d=>d.endsWith(`_impin`))
                                console.log(`Got ${named.length}`, named.join(", "))
                                const filtered = named.filter(d=>!matches.includes(d))
                                console.log(`Got ${filtered.length} filtered`, filtered.join(", "))
                                if( filtered.length > 0){
                                    console.log(`Preserving main import for outstanding named import`)
                                    matches = matches.filter(d=>d !== "primitives.import")
                                }
                            }

                            const set = matches.map(rel=>{
                                return {
                                    parent: src,
                                    target: primitiveForPin,
                                    rel: rel.slice(11)
                                }
                            })
                            console.log(set)
                            return set
                        }
                    }).flat(Infinity).filter(d=>d)
                }else{
                    clearList = [
                        ...Object.keys(primitiveForPin.primitives.inputs ?? {}).filter(d=>d.endsWith(`_${myState.activePin.name}`)).map(r=>{
                            return primitiveForPin.primitives.inputs[r].uniqueAllItems.map(d=>{
                                return {
                                    parent: primitiveForPin,
                                    target: d,
                                    rel: "inputs." + r
                                }
                            })}),
                        ...Object.keys(primitiveForPin.primitives.outputs ?? {}).filter(d=>d.endsWith(`_${myState.activePin.name}`)).map(r=>{
                            return primitiveForPin.primitives.outputs[r].uniqueAllItems.map(d=>{
                                return {
                                    parent: primitiveForPin,
                                    target: d,
                                    rel: "outputs." + r
                                }
                            })}),
                    ].flat(Infinity).filter(d=>d )
                }
            }
            if( clearList ){
                for(const d of clearList){
                    d.parent.removeRelationship(d.target, d.rel)
                    console.log(`Remove relation ${d.rel} from parent ${d.parent.plainId} to ${d.target.plainId}`)
                }
            }
        }
    }

    function setActivePin(pin){
        myState.activePin = pin
        const frame = myState[pin.frameId]
        myState.createFromActivePin = frame.primitive.type === "page" && frame.primitive.referenceParameters?.inputPins?.[pin.name]
        {
            setActiveBoard( [pin.frameId] )
        }
    }

    function setActiveBoard(e){
        const id = [e].flat()[0]
        myState.activeBoardId = id
        if( id !== myState.activePin?.frameId){
            myState.activePin = undefined
        }
        if( id ){
            myState.activeBoard = myState[id]
            if(true || !myState[id].axisOptions ){
                const source = myState[id].underlying ?? myState[id].primitive
                myState[id].axisOptions = CollectionUtils.axisFromCollection( myState[id].primitiveList ? myState[id].primitiveList : source.itemsForProcessing, source,  source.referenceParameters?.explore?.hideNull)
                //myState[id].axisOptions = CollectionUtils.axisFromCollection( source.itemsForProcessing, source,  source.referenceParameters?.explore?.hideNull)
            }

            let addToView = false
            if( myState.activeBoard.primitive.type === "view" ){
                if( myState.activeBoard.primitive.primitives.imports.allIds.length === 0){
                    addToView = {view: myState.activeBoard.primitive, segment: undefined}
                }else{
                    const target = myState.activeBoard.primitive.primitives.imports.allItems.find(d=>d.type === "search" || (d.type === "segment" && d.primitives.imports.allIds.length === 0))
                    if( target ){
                        addToView = {view: myState.activeBoard.primitive, segment: target}
                    }
                }
            }

            myState.menuOptions = {
                showAddChild: myState.activeBoard.primitive.type !== "element" && myState.activeBoard.primitive.type !== "page",
                showAxis: myState.activeBoard.config !== "widget" && myState.activeBoard.primitive.type !== "element" && myState.activeBoard.primitive.type !== "page",
                showClone: myState.activeBoard.type === "query" || myState.activeBoard.primitive.type === "view" || myState.activeBoard.primitive.type === "element",
                addToView
            }

            handleViewChange(true)

            
            setCollectionPaneInfo({
                frame: myState.activeBoard.primitive, 
                underlying: myState.activeBoard.underlying, 
                flowInstances: myState.activeBoard.flowInstances, 
                inFlowInstance: myState.activeBoard.flowInstance, 
                board: primitive,
                localItems: getLocalPrimitiveListForBoardId(id, myState),
                originalList: myState[id].originalList
            })
        }else{
            myState.activeBoard = undefined
            myState.menuOptions = {}
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
                        rowButton.current?.refocus && rowButton.current?.refocus()
                        colButton.current?.refocus && colButton.current?.refocus()
                    }
                }, instant ? 0 : 250)
            }
        }
    }

    function addBoardToCanvas( d, position ){
        if( !position){
            position = findSpace()
        }
        myState[d.id] = {id: d.id, primitive: d}
        if( d.type === "element"){
            myState[d.id].inPage = true
            myState[d.id].page = myState[d.origin.id]
            myState[d.id].parentRender = d.origin.id
        }else if(d.flowElement){
            myState[d.id].parentRender = d.origin.id
        }
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
                
            }else if( bp.type === "query"){
                let resultCategoryIds = bp.itemsForProcessing.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i)
                if( resultCategoryIds.length === 0){
                    if( bp.referenceParameters.extract ){
                        resultCategoryIds = [bp.referenceParameters.extract]
                    }else{
                        resultCategoryIds = [82]
                    }
                }
                if( resultCategoryIds.length > 0 ){
                    await addBlankView( undefined, bp.id, undefined, {referenceId: resultCategoryIds})
                }
                
            }else if( bp.type === "action" || bp.type === "actionrunner" || bp.type === "categorizer"){
                let resultCategoryIds = bp.itemsForProcessing.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i).filter(d=>["entity","result","evidence"].includes(mainstore.category(d).primitiveType))
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
                    setCollectionPaneInfo(undefined)
                    forceUpdate()
                    return true
                }
            })
        }
    }

    window.removeActiveBoard = removeBoard


    function renderView(d){
        return SharedRenderView(d, primitive, myState)
    }
    async function addBlankView(cat_or_id = 38, importId, filter, full_options = {}){
        const category = typeof(cat_or_id) === "number" ? mainstore.category(cat_or_id) : cat_or_id
        const {pivot, ...options} = full_options 
        let importPrimitive = importId ? mainstore.primitive(importId) : undefined
        let position = (importPrimitive ? canvas.current.framePosition(importPrimitive.id)?.scene : undefined) ?? {r:0, t: 0, s: 1}
        let createInFlow = myState[importId]?.inFlow ? myState[importId]?.flow : false
        
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
            flowElement: createInFlow !== false,
            referenceParameters: {
                ...(importPrimitive ? {target: "items", importConfig: [{id: importPrimitive.id, filters: filter}]} : {}),
                target: "items",
                ...options,
            },
            parent: createInFlow ? createInFlow : primitive,
        })
        if( newPrimitive ){
            if(importPrimitive){
                await newPrimitive.addRelationshipAndWait( importPrimitive, "imports")
            }
            if( !createInFlow ){
                primitive.addRelationship(newPrimitive, "ref")
                addBoardToCanvas( newPrimitive, {x:position.r + 50, y: position.t, s: position.s})
            }

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
                if( result.flow ){
                    console.log(`Need to refresh flow for new query`)
                    const flow = MainStore().primitive(result.flow)
                    prepareBoard( myState[flow.id].primitive )
                    canvas.current.refreshFrame( flow.id, renderView(flow))

                }else{
                    const newPrimitive = await MainStore().waitForPrimitive( result.primitiveId )
                    let position = canvas.current.framePosition(parent.id)?.scene
                    await primitive.addRelationshipAndWait(newPrimitive, "ref")
                    addBoardToCanvas( newPrimitive, {x:position.r +50, y: position.t, s: position.s})
                }
            }
        })
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
            if(d.doesImport(manual.id)){
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
            workspaceId: primitive.workspaceId,
            "referenceParameters": {
                "referenceId": item.referenceId
            }
        })
        let view = await mainstore.waitForPrimitive( result.id )
        if( view ){
            await primitive.addRelationshipAndWait(view, "ref")
            await view.addRelationshipAndWait(manual, "imports")
            addBoardToCanvas( view, findSpace())
        }

    }
    window.getTest = getOrCreateSuitableView

    function addToView(){
        if( myState.menuOptions?.addToView ){
            const config = myState.menuOptions.addToView
            const target = config.segment ?? config.view
            const categoryList = [config.view.referenceParameters.referenceId].flat().filter(d=>d)
            pickNewItem( {categoryList, addTo: config})

        }
    }

    function pickNewItem(options = {}){
        const addToFlow = (myState.activeBoard && myState.activeBoard.primitive?.type === "flow") ? myState.activeBoard.primitive : undefined
        const addToPage = (myState.activeBoard && myState.activeBoard.primitive?.type === "page") ? myState.activeBoard.primitive : undefined


        let {categoryList, addTo} = options

       if(!categoryList  ){
           if( addToPage ){
               categoryList = [89, 145]
            }else{
                categoryList = [
                    38, 81, 130, 140, 131,142,118, 135,  136, 137,132,133,144,
                    ...mainstore.categories().filter(d=>d.primitiveType === "search").map(d=>d.id),
                    ...(addToFlow ? [81,113] : mainstore.categories().filter(d=>d.primitiveType === "entity").map(d=>d.id)),
                ].flat()
            }
        }

        mainstore.globalNewPrimitive({
            title: addTo ? `Add to ${addTo.view.title} (#${addTo.view.plainId})` : (addToFlow ? `Add to ${addToFlow.title} flow` : "Add to board"),
            categoryId: categoryList,
            parent: primitive,
            beforeCreate:async (data)=>{
                if( addToFlow ){
                    return {
                        ...data,
                        flowElement: true,
                        parent: addToFlow
                    }
                }else if( addToPage ){
                    return {
                        ...data,
                        parent: addToPage
                    }
                }else if( addTo ){
                    console.log(addTo)
                    let targetSegment = addTo.segment
                    if( !targetSegment){
                        console.log(`Need to source create segment for view`)
                        const result = await MainStore().createPrimitive({
                            title: `Segment for View ${addTo.view.plainId}`,
                            type: "segment",
                            parent: primitive,
                            workspaceId: primitive.workspaceId
                        })
                        if( result ){
                            targetSegment = await mainstore.waitForPrimitive( result.id )
                            await addTo.view.addRelationshipAndWait( targetSegment, "imports")
                        }
                    }
                    if( !targetSegment ){
                        return false
                    }
                    return {
                        ...data,
                        parent: targetSegment
                    }
                }else{
                    if( !addTo ){
                        if( data.type === "entity" || data.type === "result"){
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
                }
                return data
            },
            callback:async (d)=>{
                if( d ){
                    if( addToFlow ){
                        addBoardToCanvas( d, {x:0, y:0, s:1})
                    }else if( addToPage ){
                        addBoardToCanvas( d, {x:0, y:0, s:1})
                    }else{
                        if(d.type === "entity" || d.type === "result"){
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

                    await exportKonvaToPptx( root.node, pptx, {offsetForFrame: [root.canvasMargin[3], root.canvasMargin[0]], master: "MASTER_SLIDE", removeNodes:IGNORE_NODES_FOR_EXPORT,  scale: 1 / pxToInch / root.node.attrs.scaleX, padding} )
                    root.node.children = temp
                }
                pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
        }
    }
    async function exportFrame(asTable = false, byCell, options = {}){
        if(myState.activeBoard){
            if( asTable ){
                const root = canvas.current.frameData( myState.activeBoardId )
                const temp = root.node.children
                root.node.children = root.allNodes
                await exportKonvaToPptx( root.node, mainstore.keepPPTX, {removeNodes: IGNORE_NODES_FOR_EXPORT, fit:"width", asTable: true, padding: [3, 1, 0.25, 1]} )
                root.node.children = temp
            }else if(byCell){
                const frames = canvas.current.getSelection("frame")
                const pptx = createPptx()
                for(const d of frames){
                    const root = canvas.current.frameData( d.attrs.id )
                    const temp = root.node.children
                    root.node.children = root.allNodes

                    const cells = root.node.find('.cell')
                    for(const cell of cells){
                        canvas.current.restoreChildren( cell, root.node )
                        await exportKonvaToPptx( cell, pptx, {removeNodes: IGNORE_NODES_FOR_EXPORT,  padding: [0,0,0,0]} )
                        canvas.current.restoreChildrenForTracking( cell )
                    }

                    root.node.children = temp
                }
                pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });

            }else{
                const frames = options.allFrames ? canvas.current.frameList() : canvas.current.getSelection("frame")
                const pptx = createPptx()
                for(const d of frames){                    
                    const childFrames = Object.values(myState).filter(d2=>d2?.parentRender === d.attrs.id).map(d=>canvas.current.frameData(d.id)).filter(d=>d)
                    
                    if( childFrames.length > 0){
                        const aggNode = new Konva.Group({
                            x: d.x(),
                            y: d.y(),
                            width: d.width() * d.scaleX(),
                            height: d.height() * d.scaleY()
                        })
                        for(const root of childFrames){
                            root.temp = root.node.children
                            root.node.x( root.x - d.x() )
                            root.node.y( root.y - d.y() )
                            root.node.children = root.allNodes
                            root.oldParent = root.node.parent
                            aggNode.add( root.node )
                        }
                        await exportKonvaToPptx( aggNode, pptx, {removeNodes: IGNORE_NODES_FOR_EXPORT,   noFraming: true, padding: [0,0,0,0]} )
                        for(const root of childFrames){
                            root.node.x( root.x )
                            root.node.y( root.y )
                            root.oldParent.add( root.node )
                            root.node.children = root.temp
                            delete root["temp"]
                            delete root["oldParent"]
                        }

                    }else{
                        const root = canvas.current.frameData( d.attrs.id )
                        let pages = root.node.find("._page")
                        const temp = root.node.children
                        root.node.children = root.allNodes

                        if( pages.length > 0){
                            for(const page of pages){
                                const childFrames = root.node.find(d=>d.attrs.pageTrack === page.attrs.pageIdx)
                                const aggNode = new Konva.Group({
                                    width: page.width(),
                                    height: page.height()
                                })
                                for(const child of childFrames){
                                    child.ox = child.x()
                                    child.oy = child.y()
                                    child.x( child.ox - page.x() )
                                    child.y( child.oy - page.y() )
                                    child.oldParent = child.parent
                                    aggNode.add( child )
                                }
                                await exportKonvaToPptx( aggNode, pptx, {removeNodes: IGNORE_NODES_FOR_EXPORT,  noFraming: true, padding: [0,0,0,0]} )
                                for(const child of childFrames){
                                    child.x( child.ox )
                                    child.y( child.oy )
                                    child.oldParent.add( child )
                                    delete child["oldParent"]
                                    delete child["ox"]
                                    delete child["oy"]
                                }
                            }
                        }else{
                            await exportKonvaToPptx( root.node, pptx, {removeNodes: IGNORE_NODES_FOR_EXPORT,  padding: [3, 1, 0.25, 1]} )
                        }
                        
                        root.node.children = temp
                    }
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
    const pageChildPositions = Object.values(myState).filter(d=>d && d.isBoard && d.primitive?.type === "page").reduce((a,d)=>({...a,...d.primitive.frames}),{})
    
    let framePositions = {
        ...primitive.frames,
        ...flowChildPositions,
        ...pageChildPositions
    }

    function checkPinConnect(sourceId, sourcePin, targetId, targetPin){
        if( sourceId === targetId ){
            return false
        }
        const sourcePrimitive = mainstore.primitive(sourceId)
        const targetPrimitive = mainstore.primitive(targetId)
        if( sourcePrimitive && targetPrimitive){
            const isInternalFlowPin = (sourcePrimitive.inFlow && targetPrimitive.type === "flow") && sourcePrimitive.parentPrimitiveIds.includes(targetPrimitive.id)
            let targetIsPageElement 
            if( targetPrimitive.type === "element"){
                const topElement = targetPrimitive.configParent ?? targetPrimitive
                if( topElement.origin.flowElement ){
                    targetIsPageElement = true
                }
            }
            if( !targetIsPageElement && sourcePrimitive.inFlow && !targetPrimitive.inFlow && !isInternalFlowPin){
                return false
            }
            const inputPins = isInternalFlowPin ? targetPrimitive.outputPins : targetPrimitive.inputPins
            const canConnect = PrimitiveConfig.canConnect({
                input: {
                    config: inputPins,
                    pin: targetPin
                },
                output:{
                    config: sourcePrimitive.outputPins,
                    pin: sourcePin
                }

            })
            console.log(canConnect)
            return {result: canConnect, isInternalFlowPin, sourcePrimitive, targetPrimitive}
        }
        return false
    }

    return <>
        {manualInputPrompt && <InputPopup key='input' cancel={()=>setManualInputPrompt(false)} {...manualInputPrompt}/>}
        <div key='chatbar' className={clsx([
            'absolute bg-white border border-gray-200 bottom-4 space-y-2 flex flex-col left-4 overflow-hidden p-3 place-items-start rounded-md shadow-lg text-sm z-50 ',
            agentStatus.activeChat ? 'max-h-[80vh] w-[40vw] 4xl:max-w-3xl min-w-[24rem]' : "w-96 max-h-[80vh]"
        ])}>
            <AgentChat 
                setStatus={setAgentStatus} 
                contextClick={(d)=>mainstore.sidebarSelect(d)}
                primitive={primitive}/>
        </div>
        
        <div key='toolbar3' className='overflow-hidden max-h-[80vh] bg-white rounded-md shadow-lg border-gray-200 border absolute right-4 top-4 z-50 flex flex-col place-items-start divide-y divide-gray-200'>
            <div className='p-3 flex place-items-start space-x-2 '>
                    <DropdownButton noBorder icon={<HeroIcon icon='FAPickView' className='w-6 h-6 mr-1.5'/>} onClick={addExistingView} flat placement='left-start' />
                    <DropdownButton noBorder icon={<PlusIcon className='w-6 h-6 mr-1.5'/>} onClick={()=>pickNewItem()} flat placement='left-start' />
                    <DropdownButton noBorder icon={<HeroIcon icon='FAAddView' className='w-6 h-6 mr-1.5'/>} onClick={newView} flat placement='left-start' />
                    {collectionPaneInfo && <DropdownButton noBorder icon={<HeroIcon icon='FAAddChildNode' className='w-6 h-6 mr-1.5'/>} onClick={pickBoardDescendant} flat placement='left-start' />}
                    {<DropdownButton noBorder icon={<DocumentArrowDownIcon className='w-6 h-6 mr-1.5'/>} onClick={()=>exportFrame(false,true)} flat placement='left-start' />}
                    {<DropdownButton noBorder icon={<DocumentArrowDownIcon className='w-6 h-6 mr-1.5'/>} onClick={()=>exportFrame(false)} flat placement='left-start' />}
                    {<DropdownButton noBorder icon={<DocumentArrowDownIcon className='w-6 h-6 mr-1.5'/>} onClick={()=>exportReport(false)} flat placement='left-start' />}
                    {collectionPaneInfo && <DropdownButton noBorder icon={<ClipboardDocumentIcon className='w-6 h-6 mr-1.5'/>} onClick={copyToClipboard} flat placement='left-start' />}
            </div>
            {collectionPaneInfo && <div className='pt-2 overflow-y-scroll'>
                <CollectionInfoPane {...collectionPaneInfo} newPrimitiveCallback={createNewQuery} createNewView={addBlankView} updateFrameExtents={updateExtents}/>
            </div>}
        </div>
        {<div ref={menu} key='toolbar' className='bg-white rounded-md shadow-lg border-gray-200 border absolute z-40 p-1.5 flex flex-col place-items-start space-y-2 invisible'>
            {myState.menuOptions?.addToView && <DropdownButton noBorder icon={<PlusIcon className='w-5 h-5'/>} onClick={addToView} flat placement='left-start' />}
            {myState.menuOptions?.showAxis && <HierarchyNavigator ref={colButton} noBorder align={()=>menuSide()} icon={<HeroIcon icon='Columns' className='w-5 h-5 '/>} items={()=>CollectionUtils.axisToHierarchy(getAxisOptions())} flat placement='left-start' portal showTick selectedItemId={()=>getAxisId("column")} action={(d)=>updateAxis("column", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedColIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
            {myState.menuOptions?.showAxis && <HierarchyNavigator ref={rowButton} noBorder align={()=>menuSide()} icon={<HeroIcon icon='Rows' className='w-5 h-5 '/>} items={()=>CollectionUtils.axisToHierarchy(getAxisOptions())} flat placement='left-start' portal showTick selectedItemId={()=>getAxisId("row")} action={(d)=>updateAxis("row", d)} dropdownWidth='w-64' className={`hover:text-ccgreen-800 hover:shadow-md ${selectedRowIdx > 0 ? "!bg-ccgreen-100 !text-ccgreen-700" : ""}`}/>}
            {myState.menuOptions?.showAddChild && <DropdownButton noBorder icon={<HeroIcon icon='FAAddChildNode' className='w-5 h-5'/>} onClick={addWidgetChildView} flat placement='left-start' />}
            {myState.activeBoard && <DropdownButton noBorder icon={<HeroIcon icon='FAClearRectangle' className='w-5 h-5'/>} onClick={removeBoard} flat placement='left-start' />}
            {myState.activeBoard && myState.menuOptions?.showClone  && <DropdownButton noBorder icon={<HeroIcon icon='FACloneRectangle' className='w-5 h-5'/>} onClick={cloneBoard} flat placement='left-start' />}
            {myState.activePin && <DropdownButton noBorder icon={<HeroIcon icon='FALinkBreak' className='w-5 h-5'/>} onClick={disconnectActivePin} flat placement='left-start' />}
            {myState.createFromActivePin && <DropdownButton noBorder icon={<HeroIcon icon='FAAddChildNode' className='w-5 h-5'/>} onClick={createElementFromActivePin} flat placement='left-start' />}
        </div>}
        <div className={`w-full flex min-h-[40vh] h-full rounded-md`} style={{background:"#fdfdfd"}}>
            <InfiniteCanvas 
                            primitive={primitive}
                            board
                            background="#fdfdfd"
                            ref={setCanvasRef}
                            ignoreAfterDrag={true}
                            highlights={{
                                "primitive":"border",
                                "cell":"background",
                                "pin":"background",
                                "widget":"background"
                            }}
                            rerender={(frame, primitiveId)=>{
                                const prim = MainStore().primitive(primitiveId)
                                return RenderPrimitiveAsKonva( primitive)
                            }}
                            enableFrameSelection
                            updateWatchList={updateWatchList}
                            drag={{
                                pin:{
                                    pin: {
                                        drop: (sourceId, sourcePin, targetId, targetPin)=>{
                                            const canConnect = checkPinConnect( sourceId, sourcePin, targetId, targetPin )
                                            if( canConnect){
                                                const baseRel = canConnect.isInternalFlowPin ? "outputs" : "inputs"
                                                if( targetPin === "impin"){
                                                    console.log(`Will connect target ${canConnect.targetPrimitive.plainId} to source ${canConnect.sourcePrimitive.plainId} as import`)
                                                    canConnect.targetPrimitive.addRelationship( canConnect.sourcePrimitive, "imports")
                                                    if( sourcePin !== "impout"){
                                                        const rel = `outputs.${sourcePin}_${targetPin}`
                                                        console.log(`Will connect target ${canConnect.sourcePrimitive.plainId} to source ${canConnect.targetPrimitive.plainId} at ${rel}`)
                                                        canConnect.sourcePrimitive.addRelationship( canConnect.targetPrimitive, rel)
                                                    }
                                                }else{
                                                    const rel = `${baseRel}.${sourcePin}_${targetPin}`
                                                    canConnect.targetPrimitive.addRelationship( canConnect.sourcePrimitive, rel)
                                                    console.log(`Will connect target ${canConnect.targetPrimitive.plainId} to source ${canConnect.sourcePrimitive.plainId} at ${rel}`)
                                                }
                                                return true
                                            }
                                        },
                                        droppable: (sourceId, sourcePin, targetId, targetPin)=>{
                                            return checkPinConnect(sourceId, sourcePin, targetId, targetPin) !== false
                                        }
                                    }
                                },
                                "primitive": {
                                    start: (id, frameId)=>{
                                        const framePrimitive = mainstore.primitive( frameId )
                                        if( framePrimitive.type === "element"){
                                            return "frame_parent"
                                        }
                                    },
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
                                viewportCallback:()=>handleViewChange(),
                                frameMove: (d)=>{
                                    const prim = MainStore().primitive(d.id)
                                    if(prim){

                                        console.log(d)

                                        let target = primitive
                                        let scaledWidth, scaledHeight


                                        if( myState[d.id].parentRender ){
                                            target = myState[myState[d.id].parentRender].primitive
                                            console.log(`Will update position in flow parent`)
                                        }

                                        const updateData = {
                                            ...(target.frames?.[d.id] ?? {}),
                                            x: d.x, 
                                            y: d.y, 
                                            s: d.s
                                        }
                                        
                                        target.setField(`frames.${d.id}`, updateData)

                                        canvas.current.updateFramePosition( d.id, {x: updateData.x, y: updateData.y, s: updateData.s})
                                    }
                                },
                                onClick:{
                                    pin: (ids, frameId, {name, output})=>{
                                        console.log(frameId, name, output)
                                        setActivePin({frameId, name, output})
                                    },
                                    frame: (id)=>setActiveBoard(id),
                                    primitive:(id, frameId)=>{
                                        const frame = mainstore.primitive(frameId)
                                        if( myState.activeBoard?.id ===  frameId){
                                            mainstore.sidebarSelect(id)
                                        }else{
                                            setActiveBoard( frame.id )
                                            if( canvas.current ){
                                                canvas.current.selectFrame( frame.id )
                                            }

                                        }
                                        if( frame?.type === "element"){
                                            setActiveBoard( frame.id )
                                            if( canvas.current ){
                                                canvas.current.selectFrame( frame.id )
                                            }
                                        }
                                    },
                                    canvas:(id)=>setCollectionPaneInfo(),
                                    toggle_items:(id, frameId, data)=>{
                                        let target = primitive
                                        if( myState[frameId].parentRender ){
                                            target = myState[myState[frameId].parentRender].primitive
                                            console.log(`Will update toggle in flow parent`)
                                        }
                                        target.setField(`frames.${frameId}.showItems`, !(data?.open ?? false))
                                    },
                                    cell:(id, frameId)=>{
                                        const cell = id?.[0]
                                        if( cell ){
                                            let sourceState = myState[frameId]
                                            if( sourceState.axisSource ){
                                                let axisSource = sourceState.axisSource
                                                if( axisSource.inFlow && axisSource.configParent.flowElement ){
                                                    axisSource = axisSource.configParent
                                                }
                                                sourceState = myState[axisSource.id]
                                            }

                                            let cIdx, rIdx, infoPane

                                            if(myState[frameId].axis){
                                                [cIdx,rIdx] = cell.split("-")
                                                infoPane = {
                                                    filters: [
                                                        PrimitiveConfig.encodeExploreFilter( sourceState.axis.column, sourceState.columns[cIdx] ),
                                                        PrimitiveConfig.encodeExploreFilter( sourceState.axis.row, sourceState.rows[rIdx] ),
                                                    ].filter(d=>d)
                                                }
                                            }else{
                                                const data = myState[frameId].data
                                                const cellData = data.cells.find(d=>d.id === cell)
                                                infoPane = {
                                                    filters: [
                                                        PrimitiveConfig.encodeExploreFilter( data.defs?.columns, cellData.columnIdx ),
                                                        PrimitiveConfig.encodeExploreFilter( data.defs?.rows, cellData.rowIdx ),
                                                    ].filter(d=>d)
                                                }
                                            }

                                            console.log(infoPane.filters[0])
                                            setCollectionPaneInfo({frame:  sourceState.underlying ??  sourceState.primitive, board: primitive, filters: infoPane.filters})
                                            if( !myState.activeBoard || myState.activeBoard.id !== frameId){
                                                setActiveBoard(frameId)
                                                canvas.current.selectFrame( frameId )
                                            }
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
                                "pin":{
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