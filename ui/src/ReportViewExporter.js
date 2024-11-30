import HierarchyView from "./HierarchyView"
import MainStore from "./MainStore"
import PrimitiveExplorer from "./PrimitiveExplorer"
import ProximityView from "./ProximityView"
import { PrimitiveCard } from './PrimitiveCard';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import DropdownButton from "./DropdownButton";
import { HeroIcon } from "./HeroIcon";
import { ArrowDownCircleIcon, ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, DocumentArrowDownIcon, MinusCircleIcon, PlusCircleIcon, PlusIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { InputPopup } from "./InputPopup";
import Panel from "./Panel";
import PrimitiveReport from "./PrimitiveReport";
import { exportKonvaToPptx } from "./PptHelper";
import pptxgen from "pptxgenjs";
import CollectionUtils from "./CollectionHelper";
import BoardViewer from "./BoardViewer";
import InfiniteCanvas from "./InfiniteCanvas";
import { renderMatrix, RenderPrimitiveAsKonva, RenderSetAsKonva } from "./RenderHelpers";
import PrimitiveConfig from "./PrimitiveConfig";



export default function ReportViewExporter({primitive, ...props}){
    const mainstore = MainStore()
    
    //const targetList = [335760].map(d=>mainstore.primitive(d))
    //const targetList = mainstore.primitive(411138).itemsForProcessing.sort((a,b)=>a.title?.localeCompare(b.title))
    let targetList 
    if( primitive.workspaceId ===  "66a3cbccb95d676c5b4db74b"){
        targetList = mainstore.primitive(516283).itemsForProcessing
    }else if( primitive.plainId === 699437){
        //targetList = [699128,698685, 698691, 699136, 699144,699269, 699416].map(d=>MainStore().primitive(d))
        //targetList = [699598, 699563,699564,699565].map(d=>MainStore().primitive(d))
        targetList = [700480, 700481,700482,700483].map(d=>MainStore().primitive(d))
    }else{
        /*targetList = ["669f45c26e1bd45cc906346b", "666be85605ff1c2b42bc00d4", "669f455e6e1bd45cc90631be", "66a0c1e7abb4c2893f73d839", 
            "666be41e05ff1c2b42bbe25e", "669f43036e1bd45cc90621a5", "66a0b3ea2d1b19b3e90facdd", "669f42d46e1bd45cc9062064", 
            "669f42276e1bd45cc9061baf", "66a0be73abb4c2893f73d595", "66a0b0902d1b19b3e90fa96e", "66a2072662bffbbcac4fd165", 
            "669f41156e1bd45cc9061498", "669f40b76e1bd45cc9061209", "66a0acc52d1b19b3e90fa709", "669f407c6e1bd45cc9061068", 
            "66a21daf9a406e54d8b0e21a", "66a0ac5e2d1b19b3e90fa68f", "66a0abbe2d1b19b3e90fa61e", "66a0aba72d1b19b3e90fa601", 
            "66a0ab912d1b19b3e90fa5ea", "66a0ba37abb4c2893f73d24a", "66b7452c1a38f484a7212f92", "66b74e691a38f484a72132b6", 
            "66b750a71a38f484a7213358", "66b751331a38f484a7213457", "66b758d71a38f484a721381a", "66b745681a38f484a7212fbc", 
            "66b760b1d060e1cec232f835", "66b759181a38f484a72138a1", "66b3f11f73ea448a8c9e1004", "66b77463d060e1cec2333dba", 
            "66b7514a1a38f484a721348a", "66b752151a38f484a721352f", "66b756301a38f484a721373b", "66b7566e1a38f484a721376c", 
            "66b9bc82d060e1cec2341615", "66b7590a1a38f484a7213877", "66b3f14e73ea448a8c9e10f5", "66b762bed060e1cec232fac4", 
            "66b3f13973ea448a8c9e106f", "66890a46069e82d65fb9e3ad", "66b77348d060e1cec23339bd", "66b75ca11a38f484a7213b70", "66b764a8d060e1cec232ff6c", "66b73a461a38f484a7212ad7", "66b3efdd73ea448a8c9e0b59", "66b765aad060e1cec2330179", 
            "66b7680ed060e1cec23308d5", "66b769cbd060e1cec2330db8", "66b76c19d060e1cec23317db", "66b76f9bd060e1cec2332904", "66b7645fd060e1cec232fec1", "66b76ffbd060e1cec2332b21", "66b764f7d060e1cec2330017", "66b7705cd060e1cec2332dcf", 
            "66b77057d060e1cec2332dab", "66b770d3d060e1cec2333069", "66b768a2d060e1cec2330ade", "6689434d36211da6ede2442b", "6689425136211da6ede243cb", "6689424e36211da6ede243b4", "6689424c36211da6ede2439e", "6689423a36211da6ede24366", 
            "668941fb36211da6ede242ef", "668941ee36211da6ede242c4", "668941e536211da6ede242a2", "668941da36211da6ede2425e", "668941c436211da6ede24230", "668941bf36211da6ede24215", "668941ae36211da6ede241a0", "668941ac36211da6ede24189", 
            "668941a436211da6ede2415d", "668941a236211da6ede24148", "6689419e36211da6ede24131", "6689419c36211da6ede2411b", "6689419136211da6ede240d5", "66890e62069e82d65fb9f040", "666be83205ff1c2b42bbf8a2", "666be82105ff1c2b42bbf4a2", 
            "666be81205ff1c2b42bbf011", "66a0b5672d1b19b3e90faed9", "6689464814799b75111269b1", "6689463014799b7511126983", "6689462914799b751112696b", "668945ff14799b75111268f3", "668945f914799b75111268dd", "668945db14799b75111268a3", 
            "6689457714799b751112678f", "6689456914799b7511126743", "6689454a14799b75111266f5", "6689453a14799b75111266b4", "6689451314799b751112662c", "6689451014799b7511126615", "668944f914799b75111265b0", "668944eb14799b7511126584", "668944e714799b751112656a", "668944d014799b751112650f", "668944cd14799b75111264fa", "668944c314799b75111264c1", "668944ba14799b751112648d", "668944b514799b7511126472", 
            "668944ae14799b7511126443", "668944aa14799b751112642b", "6689449f14799b75111263f3", "6689449914799b75111263d6", "6689448c14799b751112638a", "6689448a14799b7511126374", "6689448614799b751112635c", "6689447814799b7511126310", "6689447014799b75111262f3", "6689446d14799b75111262de", "6689445514799b7511126214", "6689445014799b75111261e7", "666be82b05ff1c2b42bbf724", "666be81f05ff1c2b42bbf403", 
            "666be80f05ff1c2b42bbef32", "66881fd9069e82d65fb9b787", "66881fb3069e82d65fb9b72b", "66881f6a069e82d65fb9b694", "66881e10069e82d65fb9b547", "668819eb069e82d65fb9b32b", "66880c1b069e82d65fb9b268", "66880a8a069e82d65fb9b24e", "66880792069e82d65fb9b206", "66880773069e82d65fb9b1af", "66880736069e82d65fb9b134", "6687ffab069e82d65fb9ae0c", "6687ff85069e82d65fb9ada1", "6687ff62069e82d65fb9ad64", 
            "6687ff5f069e82d65fb9ad4e", "6687ff52069e82d65fb9ad16", "6687ff4c069e82d65fb9acfc", "6687ff46069e82d65fb9ace2", "6687ff3e069e82d65fb9acab", "6687ff3b069e82d65fb9ac92", "6687ff28069e82d65fb9ac46", "6687ff23069e82d65fb9ac2c", "6687ff1b069e82d65fb9abfc", "6687ff14069e82d65fb9abdf", "6687ff0c069e82d65fb9abbe", "6687ff03069e82d65fb9aba2", "6687fef9069e82d65fb9ab84", "6687dd2155abc3b1bd0fcbbb", 
            "6687d751661c0068cb77f9cf", "6687dd1f55abc3b1bd0fcba6"].map(d=>mainstore.primitive(d)).filter(d=>d).sort((a,b)=>a.title.localeCompare(b.title))*/


        targetList = primitive.primitives.imports.main.allItems
    }

    const myState = useRef({})
    const canvas = useRef({})
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [activeTarget, setActiveTarget] = useState(targetList?.[0])
    const [autoExport, setAutoExport] = useState(undefined)
    const [slideMap, setSlideMap] = useState({})
    const [rInstance, setRInstance] = useState(  )
    const [asyncCalls, setAsyncCalls] = useState(  )

    const setViewerPick = (d)=>{
        setActiveTarget(d)
        forceUpdate()
    }

    //const pptConfig = {removeNodes: ["frame_outline", "plainId", "background"], padding: [2, 0.2, 0.2, 0.2], scale: 0.03}
    const pptConfig = {removeNodes: ["frame_outline", "plainId", "background", "bounds_frame"], padding: [0,0,0,0], scale: 0.03}
    
    useEffect(()=>{
        async function doCallback(){
            if( asyncCalls ){
                for( const a of asyncCalls ){
                    console.log(`Running async`)
                    await a()
                }
                setAsyncCalls(undefined)
            }

        }
        doCallback()
    }, [asyncCalls])

    async function addElement(){
        const newElement = await MainStore().createPrimitive({
            title: "New Element",
            type: "element",
            parent: primitive
        })
        forceUpdate()
    }

    async function exportFrame(){
        await exportKonvaToPptx( canvas.current.stageNode(), undefined, pptConfig )
    }
    function resizeFrame(fId, width, height){
        const board = myState[fId]
        if( width ){
            primitive.setField(`frames.${fId}.width`, width)
        }
        if( height ){
            primitive.setField(`frames.${fId}.height`, height)
        }
        canvas.current.refreshFrame( board.stateId, renderView(board.element))
    }

    function renderView(d){
        if( myState[d.id]?.processing ){
            return
        }
        const configNames = ["width", "height"]
        const renderOptions = myState[d.id].renderConfigOverride ?? {}
        if( primitive.frames?.[d.id]){
            for( const name of configNames){
                if( primitive.frames[d.id][name] !== undefined){
                    renderOptions[name] = primitive.frames[d.id][name]
                }
            }
        }
        
        if( myState[d.id]?.underlying){
            myState[d.id].noTitle = true


            if( myState[d.id].viewConfig?.renderType === "field" ){
                return {id: d.id, title: ()=>``, canChangeSize: true, canvasMargin: [2,2,2,2], items: (stageOptions)=>RenderPrimitiveAsKonva(myState[d.id]?.underlying, {...stageOptions, ...renderOptions, config: "field", field: d.referenceParameters?.field ?? "title", part: d.part})}
            }
            if( d.referenceParameters?.limit === "single"){
                return {id: d.id, title: ()=>``, canChangeSize: true, canvasMargin: [2,2,2,2], items: (stageOptions)=>RenderPrimitiveAsKonva(myState[d.id]?.underlying, {...stageOptions, ...renderOptions})}
            }

            return BoardViewer.renderBoardView(d, primitive, myState)
        }
        
        return {id: d.id, title: ()=>``, canChangeSize: true, canvasMargin: [2,2,2,2], items: (stageOptions)=>RenderPrimitiveAsKonva(d, {...stageOptions, ...renderOptions, config: "field", field: d.field ?? "title", part: d.part, format: d.format})}
        
        /*
        const view = myState[d.id]
        const viewConfig = view.viewConfig


        let targetPrims = view.primitive.itemsForProcessing.filter(d=>{
            if( d.id === activeTarget.id ){
                return true
            }else if(d.primitives.ref.allIds.includes(activeTarget.id)){
                return true
            }else if(d.primitives.link.allItems.map(d=>d.parentPrimitiveIds).flat().includes(activeTarget.id)){
                return true
            } else if(d.findParentPrimitives({type:"segment"})[0]?.primitives.allSummary[1]?.primitives.ref.allItems[0]?.primitives?.ref.allIds.includes(activeTarget.id)){
                return true
            }else if (d.findParentPrimitives({type:"segment"}).map(d=>d.itemsForProcessing).flat().map(d=>d.id).includes(activeTarget.id)){
                renderOptions.renderConfig.minColumns = 5
                renderOptions.renderConfig.columns = 5
                return true
            }
        }).map(d=>d.id)
        console.log(`renderng ${d.plainId} - ${activeTarget.id}`)

        const filteredList = view.list.filter(d=>targetPrims.includes(d.primitive.id) )
        const rowIdxList = filteredList.map(d=>d.row).flat().filter((d,i,a)=>a.indexOf(d)===i)
        const filteredRows = view.rows.filter(d=>rowIdxList.includes(d.idx ))

        let render = (stageOptions)=>renderMatrix(
            view.primitive, 
            filteredList, {
                axis: view.axis,
                columnExtents: view.columns,
                rowExtents: filteredRows,
                viewConfig: view.viewConfig,
                hideRowHeaders: true,
                hideColumnHeader: true,

                ...stageOptions,
                ...renderOptions,
                toggles: view.toggles,
                expand: Object.keys(primitive.frames[ d.id ]?.expand ?? {})
            })



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
                    console.log("DID PARTIALS",partials)
                    return RenderPrimitiveAsKonva(view.primitive, {...stageOptions, ...renderOptions, partials})
                }
            }
        }else
        return {id: d.id, title: ()=>``, canChangeSize: true, canvasMargin: [2,2,2,2], items: render}
        */
    }
    function prepareBoard(element, underlying){
        const stateId = element.id
        const config = element.referenceParameters ?? {}
        if( underlying && myState[stateId].descend ){
            const sourceSet = mainstore.uniquePrimitives( [
                underlying.origin.primitives.origin.allQuery.map(d=>d.primitives.allItems).flat(Infinity),
                underlying.origin.primitives.origin.allSegment.map(d=>d.primitives.allQuery.map(d=>d.primitives.allItems)).flat(Infinity)
            ].flat()).filter(d=>d.type === "entity")

            const columnAxis = [{idx: "_N_", label: "None"}]
            const rowAxis = [{idx: "_N_", label: "None"}]

            myState[stateId].primitive = element
            myState[stateId].config = "explore_0" 
            myState[stateId].list = sourceSet.map(d=>({column: "_N_", row: "_N_", primitive: d}))
            //myState[stateId].list = sourceSet.map(d=>({column: "_N_", row:"_N_", primitive: d}))
            myState[stateId].internalWatchIds =  sourceSet.map(d=>d.parentPrimitiveIds).flat(Infinity).filter((d,i,a)=>a.indexOf(d)===i)
            myState[stateId].axis = {column: columnAxis, row: rowAxis}
            myState[stateId].columns = columnAxis
            myState[stateId].viewConfig = Object.values(PrimitiveConfig.renderConfigs).find(d=>d.renderType === "overview")
            myState[stateId].renderConfigOverride = {hideColumnHeader: true, hideRowHeaders: true}

            myState[stateId].rows = rowAxis
            myState[stateId].extents = {column: columnAxis, row: rowAxis}
            myState[stateId].toggles = {}

            return
        }
        if( config.transform){
            
            const items = underlying.itemsForProcessing
            const columnAxis = CollectionUtils.primitiveAxis(underlying, "column", items)
            const rowAxis = CollectionUtils.primitiveAxis(underlying, "row", items)
            
            let viewFilters = []//d.referenceParameters?.explore?.filters?.map((d2,i)=>CollectionUtils.primitiveAxis(d, i)) ?? []
            let filterApplyColumns = underlying.referenceParameters?.explore?.axis?.column?.filter ?? []
            let filterApplyRows = underlying.referenceParameters?.explore?.axis?.row?.filter ?? []
            let hideNull = underlying.referenceParameters?.explore?.hideNull
            let viewPivot = underlying.referenceParameters?.explore?.viewPivot

            let liveFilters = []
            
            let {data, extents} = CollectionUtils.mapCollectionByAxis( items, columnAxis, rowAxis, viewFilters, liveFilters, viewPivot )

            let filtered = CollectionUtils.filterCollectionAndAxis( data, [
                {field: "column", exclude: filterApplyColumns},
                {field: "row", exclude: filterApplyRows},
                ...viewFilters.map((d,i)=>{
                    return {field: `filterGroup${i}`, exclude: d.filter}
                })
            ], {columns: extents.column, rows: extents.row, hideNull})

            console.log(extents)

            if( config.transform.mode === "summary"){
                myState[stateId].processing = true
                const toExec = async ()=>{
                    const segmentList = element.primitives.allSegment
                    const remappedData = []
                    let needUpdate = false

                    function updateSet(){
                        myState[stateId].processing = remappedData.length === 0 
                        myState[stateId].primitive = element
                        myState[stateId].config = "report_set" 
                        myState[stateId].list = remappedData
                        myState[stateId].internalWatchIds =  remappedData.map(d=>d.primitive.parentPrimitiveIds).flat(Infinity).filter((d,i,a)=>a.indexOf(d)===i)
                        myState[stateId].axis = {column: columnAxis, row: rowAxis}
                        myState[stateId].columns = filtered.columns
                        myState[stateId].viewConfig = Object.values(PrimitiveConfig.renderConfigs)[0]
                        myState[stateId].rows = filtered.rows
                        myState[stateId].extents = extents
                        myState[stateId].toggles = {}
                        
                        const r = renderView(element)
                        if( r ){
                            console.log("Rerender post async")
                            canvas.current.refreshFrame( element.id, r)
                        }
                    }

                    const requestsPending = element.processing?.summary?.pending?.[underlying.id]
                    
                    for( const row of filtered.rows ){
                        for( const col of filtered.columns ){
                            const filter = [
                                PrimitiveConfig.encodeExploreFilter( columnAxis, col ),
                                PrimitiveConfig.encodeExploreFilter( rowAxis, row ),
                            ].filter(d=>d)
                            
                            let existing = segmentList.find(d=>d.doesImport( underlying.id, filter))


                            function addItem(existing){
                                const summary = existing.primitives.allUniqueSummary[0]
                                if( summary ){
                                    remappedData.push({
                                        column: col.idx ? [col.idx] : undefined,
                                        row: row.idx ? [row.idx] : undefined,
                                        primitive: summary
                                    })
                                }

                            }

                            if( existing ){
                                addItem(existing)
                            }else{
                                if( !requestsPending ){
                                    element.setField(`processing.summary.pending.${underlying.id}`,true)
                                    await mainstore.doPrimitiveAction( element, 
                                        "create_summary", {
                                            segment: [{id: underlying.id, filters: filter}]
                                        }, async (data)=>{
                                            console.log(`Got back from create_summary`)
                                            console.log(data)
                                            existing = await mainstore.waitForPrimitive(data.segment)
                                            if( existing ){
                                                addItem(existing)
                                                updateSet()
                                            }
                                        })
                                }else{
                                    console.log(`Requests alreddy pending`)
                                }
                            }
                        }
                    }
                    updateSet()


                }
                setAsyncCalls( [toExec] )
                return
            }
        }

        BoardViewer.prepareBoard(underlying, myState, element, {viewConfig: config.viewConfig, renderConfig: element.renderConfig})
    }
    function refreshTransforms(){
        const txList = primitive.primitives.allUniqueElement.filter(d=>d.referenceParameters.transform)
        for(const element of txList){
            const segments = element.primitives.allUniqueSegment
            const toClear = segments.filter(d=>d.primitives.imports.allIds.includes(activeTarget.id))
            element.setField(`processing.summary.pending.${activeTarget.id}`,null)
            for(const d of toClear){
                //d.setParameter("summary", null)
                mainstore.removePrimitive(d)
            }
        }
    }
    function exportAll(){
            let pptx = new pptxgen();
            mainstore.keepPPTX = pptx
            
            let widthInInches = 10 * 4
            let heightInInches = 5.625 * 4
            
            setSlideMap({})
            pptx.defineLayout({ name:'VF_CUSTOM', width: widthInInches, height: heightInInches });
            pptx.layout = 'VF_CUSTOM'
            
            
            const count = targetList.length
            let idx = 0

            setViewerPick( targetList[idx])
            setAutoExport( {idx: 0, pptx: pptx} )
    }



    useLayoutEffect(()=>{
        async function doExport(){
            const count = targetList.length
            if( autoExport.idx < count){
                await new Promise(r => setTimeout(r, 2000));                    
                console.log(`EXPORT ${autoExport.idx}`)
                let slide = await exportKonvaToPptx( canvas.current.stageNode(), mainstore.keepPPTX, pptConfig )
                setSlideMap( {...slideMap, [activeTarget.id]: autoExport.idx + 1})
                
                let idx= autoExport.idx + 1
                if( idx < count){
                    setViewerPick( targetList[idx])
                    setAutoExport( {idx: idx, pptx: autoExport.pptx} )
                }else{
                    window.pptlinks = slideMap

                    console.log(`SAVING`)
                    autoExport.pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
                //    setAutoExport( undefined )
                }
            }
        }
        if( autoExport && canvas.current){
            doExport()
        }
    }, [autoExport?.idx])


    function setActiveBoard(e){
        const id = e?.[0]
        myState.activeBoardId = id
        if( id ){
            myState.activeBoard = myState[id]
        }else{
            myState.activeBoard = undefined
        }
    }

    useEffect(()=>{
        async function resolveReport(){
            if( activeTarget ){
                let instance = primitive.primitives.allReportinstance.find(d=>d.parentPrimitiveIds.includes(activeTarget.id) )
                if( !instance){
                    console.log(`Cant find instance of report - creating`)
                    instance = await MainStore().createPrimitive({title:`RI - ${primitive.plainId} / ${activeTarget.plainId}`,type:"reportinstance", parent: primitive }) 
                    activeTarget.addRelationship( instance, "auto" )
                }else{
                  /*  const elements = primitive.primitives.allElement
                    for(const d of elements){
                        if( d.referenceParameters?.transform ){
                            const eInstance = d.primitives.allReportinstance.find(d=>d.parentPrimitiveIds.includes(instance.id) )

                        }
                    }*/

                }
                setRInstance( instance )
            }
        }
        resolveReport()
    }, [primitive?.id, activeTarget?.id])

    function getElementConfig(d){
                const config = d.referenceParameters ?? {}

                let underlying
                if( Object.keys(d.primitives).includes("report_import")){
                    const base = d.primitives.report_import.allItems[0]
                    if( base ){
                        const baseConfig = getElementConfig(base)
                        return {
                            primitive: d,
                            underlying: baseConfig.underlying,
                            descend: true,
                            forceRefresh: true
                        }
                        
                    }
                }else{
                    if( config.sourceData === "active"){
                        underlying = activeTarget 
                    }else if(config.sourceData === "items"){
                        underlying = activeTarget.itemsForProcessing
                        if( true || config.limit === "single"){
                            underlying = underlying[0]
                        }
                    }
                }
                return {
                        primitive: d,
                        underlying,
                        forceRefresh: true
                    }

    }

    const [renderedSet] = useMemo(()=>{

        let fields = [], boards = []
        if( primitive.workspaceId ===  "66a3cbccb95d676c5b4db74b"){
            fields = ["summary/application/bold","summary/use case/bold", "summary/industry/bold", "summary/summary", "summary/key factors driving growth", "cagr//bold", "size//bold"]
            boards = [522857].map(d=>mainstore.primitive(d)).filter(d=>d)
        }else{
            //console.log(`Set to ${activeTarget.plainId}`)
            const elements = primitive.primitives.allElement
            boards =  elements.map(d=>getElementConfig(d))
/*        }else{
            fields = ["location", "title", "url"]
            boards = [411261, 411138, 435057, 434996, 435515, 435526, 435532, 435533, 435544, 436467].map(d=>mainstore.primitive(d)).filter(d=>d)*/
        }
        
        const set = []
        for(const setting of boards){
            const d = setting.primitive
            if(!myState[d.id] || setting.forceRefresh){
                myState[d.id] = {id: d.id, primitive: d, ...setting}
                if( setting.underlying){
                    prepareBoard(d, setting.underlying)
                }else{
                    BoardViewer.prepareBoard(d, myState)
                }
            }
            set.push(d)
        }
        for( const d of fields){
            const [fieldName, part, format] = d.split("/")
            const id = `${primitive.id}-${fieldName}${part ? `-${part}` : ""}`
            set.push({field: fieldName, part: part, format: format, id, primitive: activeTarget})
        }
        const renderedSet = set.map(d=>renderView(d)).filter(d=>d)
        if( canvas.current?.refreshFrame ){
            let currentFramesInCanvas = canvas.current.frameList()
            renderedSet.forEach(d=>{
                if( currentFramesInCanvas.includes( d.id) ){

                    console.log(`refresh ${d.id}`)
                    canvas.current.refreshFrame( d.id, d )
                }else{
                    console.log(`add ${d.id}`)
                    canvas.current.addFrame( d )
                }
                currentFramesInCanvas = currentFramesInCanvas.filter(d2=>d2 !== d.id)
            })
            for(const d of currentFramesInCanvas){
                    console.log(`remove ${d}`)
                canvas.current.removeFrame(d)
            }
        }
        return [renderedSet]
    }, [rInstance?.id, update])

    return <div 
            //  style={{gridTemplateColumns: "9rem calc(100% - 9rem)"}}
            className={`w-full relative flex min-h-[40vh] h-full bg-white rounded-md`}
        >
        {true &&
            <div className={[
                    "w-48 p-2",
                    "border-r shrink-0 max-h-[inherit] flex flex-col place-content-between"
                ].join(" ")}>
                <div className="overflow-y-scroll space-y-2 p-1">
                    {targetList.map((d)=><PrimitiveCard variant={false} primitive={d} compact onClick={()=>setViewerPick(d)} showExpand onEnter={()=>mainstore.sidebarSelect(d)} className={d.id === targetList?.id ? "!bg-ccgreen-100 !border-ccgreen-200 !border" : "!border !border-gray-50"}/>)}
                </div>
                <div className='shrink-0 grow-0'>
                    <Panel.MenuButton title="Export" className='w-full' action={exportAll}/>
                </div>
            </div>
        }
        <div className="relative w-[calc(100%_-192px)] h-full flex">
        <div key='toolbar3' className='overflow-hidden max-h-[80vh] bg-white rounded-md shadow-lg border-gray-200 border absolute right-4 top-4 z-50 flex flex-col place-items-start divide-y divide-gray-200'>
            <div className='p-3 flex place-items-start space-x-2 '>
                    <DropdownButton noBorder icon={<ArrowDownCircleIcon className='w-6 h-6 mr-1.5'/>} onClick={refreshTransforms} flat placement='left-start' />
                    <DropdownButton noBorder icon={<PlusIcon className='w-6 h-6 mr-1.5'/>} onClick={addElement} flat placement='left-start' />
                    <DropdownButton noBorder icon={<DocumentArrowDownIcon className='w-6 h-6 mr-1.5'/>} onClick={exportFrame} flat placement='left-start' />
            </div>
        </div>

            <InfiniteCanvas
                            primitive={primitive}
                            board
                            bounds="slide"
                            background="#f9fbfd"
                            ref={canvas}
                            ignoreAfterDrag={false}
                            snapDistance={5}
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
                            //updateWatchList={updateWatchList}



                            callbacks={{
                                resizeFrame,
                                //viewportWillMove:handleViewWillChange,
                                //viewportCallback:handleViewChange,
                                frameMove: (d)=>{
                                        const expand = primitive.frames?.[d.id]?.expand ?? {}
                                        const width = primitive.frames?.[d.id]?.width
                                        primitive.setField(`frames.${d.id}`, {x: d.x, y: d.y, s: d.s, width, expand })
                                },
                                onClick:{
                                    frame: (id)=>{
                                        setActiveBoard(id)
                                        mainstore.sidebarSelect(id)
                                    },
                                    primitive:(id)=>mainstore.sidebarSelect(id)
                                    //canvas:(id)=>setCollectionPaneInfo(),
                                }
                            }}
                            framePositions={primitive.frames}
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
            </div>
        </div>


}