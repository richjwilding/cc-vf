import HierarchyView from "./HierarchyView"
import MainStore from "./MainStore"
import PrimitiveExplorer from "./PrimitiveExplorer"
import ProximityView from "./ProximityView"
import { PrimitiveCard } from './PrimitiveCard';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import DropdownButton from "./DropdownButton";
import { HeroIcon } from "./HeroIcon";
import { ArrowDownLeftIcon, ArrowUpTrayIcon, ArrowsPointingInIcon, ChevronLeftIcon, ChevronRightIcon, DocumentArrowDownIcon, MinusCircleIcon, PlusCircleIcon, PlusIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";
import { InputPopup } from "./InputPopup";
import Panel from "./Panel";
import PrimitiveReport from "./PrimitiveReport";
import { exportKonvaToPptx } from "./PptHelper";
import pptxgen from "pptxgenjs";
import CollectionUtils from "./CollectionHelper";
import BoardViewer from "./BoardViewer";
import InfiniteCanvas from "./InfiniteCanvas";
import { renderMatrix, RenderPrimitiveAsKonva, RenderSetAsKonva } from "./RenderHelpers";



export default function ReportViewExporter({primitive, ...props}){
    const mainstore = MainStore()
    
    //const targetList = [335760].map(d=>mainstore.primitive(d))
    //const targetList = mainstore.primitive(411138).itemsForProcessing.sort((a,b)=>a.title?.localeCompare(b.title))
    let targetList 
    if( primitive.workspaceId ===  "66a3cbccb95d676c5b4db74b"){
        targetList = mainstore.primitive(516283).itemsForProcessing
    }else{
        targetList = ["669f45c26e1bd45cc906346b", "666be85605ff1c2b42bc00d4", "669f455e6e1bd45cc90631be", "66a0c1e7abb4c2893f73d839", 
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
            "6687d751661c0068cb77f9cf", "6687dd1f55abc3b1bd0fcba6"].map(d=>mainstore.primitive(d)).filter(d=>d).sort((a,b)=>a.title.localeCompare(b.title))
        }

    const myState = useRef({})
    const canvas = useRef({})
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [activeTarget, setActiveTarget] = useState(targetList?.[0])
    const [autoExport, setAutoExport] = useState(undefined)
    const [slideMap, setSlideMap] = useState({})

    const setViewerPick = (d)=>{
        setActiveTarget(d)
        forceUpdate()
    }

    const pptConfig = {removeNodes: ["frame_outline", "plainId", "background"], padding: [2.5, 3, 0.5, 3], scale: 0.03}
    
    const prepareBoard = (d)=>BoardViewer.prepareBoard(d, myState)


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
        canvas.current.refreshFrame( board.id, renderView(board.primitive))
    }

    function renderView(d){
        const configNames = ["width", "height"]
        const renderOptions = {
            renderConfig:{
                columns:1,
                minColumns: 1
            }
        }
        if( primitive.frames?.[d.id]){
            for( const name of configNames){
                if( primitive.frames[d.id][name] !== undefined){
                    renderOptions[name] = primitive.frames[d.id][name]
                }
            }
        }
        if( d.field ){
            return {id: d.id, title: ()=>``, canChangeSize: true, canvasMargin: [2,2,2,2], items: (stageOptions)=>RenderPrimitiveAsKonva(d.primitive, {...stageOptions, ...renderOptions, config: "field", field: d.field, part: d.part, format: d.format})}
        }
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
    const [renderedSet] = useMemo(()=>{
        let fields = [], boards = []
        if( primitive.workspaceId ===  "66a3cbccb95d676c5b4db74b"){
            fields = ["summary/application/bold","summary/use case/bold", "summary/industry/bold", "summary/summary", "summary/key factors driving growth", "cagr//bold", "size//bold"]
            boards = [522857].map(d=>mainstore.primitive(d)).filter(d=>d)
        }else{
            fields = ["location", "title", "url"]
            boards = [411261, 411138, 435057, 434996, 435515, 435526, 435532, 435533, 435544, 436467].map(d=>mainstore.primitive(d)).filter(d=>d)
        }
        
        const set = []
        for(const d of boards){
            if(!myState[d.id] ){
                myState[d.id] = {id: d.id}
                prepareBoard(d)
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
            renderedSet.forEach(d=>canvas.current.refreshFrame( d.id, d ))
        }
        return [renderedSet]
    }, [primitive?.id, update])

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
                    <DropdownButton noBorder icon={<PlusIcon className='w-6 h-6 mr-1.5'/>} onClick={forceUpdate} flat placement='left-start' />
                    <DropdownButton noBorder icon={<DocumentArrowDownIcon className='w-6 h-6 mr-1.5'/>} onClick={exportFrame} flat placement='left-start' />
            </div>
        </div>

            <InfiniteCanvas
                            primitive={primitive}
                            board
                            background="#fdfdfd"
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
                                    frame: (id)=>setActiveBoard(id),
                                    //primitive:(id)=>mainstore.sidebarSelect(id),
                                    //canvas:(id)=>setCollectionPaneInfo(),
                                }
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
                            render={renderedSet}
                />
            </div>
        </div>


}