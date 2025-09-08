import MainStore, { uniquePrimitives } from "./MainStore";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import InfiniteCanvas from "./InfiniteCanvas";
import BoardViewer, { IGNORE_NODES_FOR_EXPORT } from "./BoardViewer";
import { createPptx, exportKonvaToPptx } from "./PptHelper";
import Konva from "konva";
import PrimitiveConfig from "./PrimitiveConfig";

const FlowInstanceOutput = forwardRef(function FlowInstanceOutput({primitive, inputPrimitives, steps,...props},ref){
    const myState = useRef({})
    const canvas = useRef({})
    const [flowStatus, setFlowStatus] = useState()



    async function downloadAll(){
        const pptx = createPptx()
        const frames = canvas.current.frameList() 
        for(const id of frames){                    
            const root = canvas.current.frameData( id )
            const temp = root.node.children
            root.node.children = root.allNodes
            let pages = root.node.find("._page")

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
                    await exportKonvaToPptx( aggNode, pptx, {removeNodes: IGNORE_NODES_FOR_EXPORT, noFraming: true, padding: [0,0,0,0]} )
                    for(const child of childFrames){
                        child.x( child.ox )
                        child.y( child.oy )
                        child.oldParent.add( child )
                        delete child["oldParent"]
                        delete child["ox"]
                        delete child["oy"]
                    }
                }
            }
            root.node.children = temp
        }
        pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });

    }
    useImperativeHandle(ref, () => {
        return {
            downloadAll
        };
      }, []);

    myState.renderSubPages = true
    myState.hideWidgets = true

    const mainstore = MainStore()

    const flowOutputPins = primitive?.origin?.outputPins ?? []
    const outputPins = Object.keys(primitive?.primitives.outputs ?? {})
    const outputs = outputPins.reduce((a,c)=>{
        const [pinSource, pinInput] = c.split("_")
        if( flowOutputPins[pinInput]){
            let items
            const pinContent = primitive.outputs[pinInput]
            if( pinContent?.config === "primitive"){
                items = pinContent.data
            }

            a[c] = {
                id: c,
                name: flowOutputPins[pinInput]?.name ?? pinInput,
                items
            }
        }
        return a}, {})
    
    const flow = primitive.findParentPrimitives({type:"flow"})[0]


    const renderedSet = useMemo(()=>{
        console.log(`Fetching renderstate`)
        if( !flowStatus ){
            console.log(`Fetch status`)
            primitive.instanceStatus.then(d=>setFlowStatus(d))
            return []
        }
        return Object.keys(outputs ?? {}).map(pin=>(outputs[pin]?.items ?? []).map(d=>{
            if( !d ){return}

            const statusInFlow = flowStatus[d.id]
            if( statusInFlow?.skip ){
                return 
            }                
            
            myState[d.id] = {id: d.id, renderSubPages: true}
            const renderConfig = BoardViewer.prepareBoard(d, myState)
            const inputPin = pin.split("_")[1]
            myState[d.id].title = flow.referenceParameters?.outputPins?.[inputPin]?.name ??  `Output for ${pin}`
            return BoardViewer.renderBoardView(d, primitive, myState)
        })).flat().filter(Boolean)
    }, [primitive?.id, flowStatus])

    if( !primitive ){
        return <></>
    }

    function selectItems(...args){
        if( props.select){
            props.select(...args)
        }else{
            mainstore.sidebarSelect(...args)
        }
    }

    if( renderedSet.length == 0){
        return <></>
    }        
    
    //return  <div className="flex h-full w-full relative border rounded-lg border-gray-200 overflow-hidden mb-2 bg-white">
    return  <div className="@container flex h-full w-full relative overflow-hidden bg-white">
                <InfiniteCanvas
                    initialZoom="width"
                    primitive={primitive}
                    board
                    hideWidgets={true}
                    ref={canvas}
                    background="#fefefe"
                    ignoreAfterDrag={false}
                    showPins={false}
                    events={{
                        wheel: {
                            passive: false
                        }
                    }}
                    highlights={{
                        "primitive":"border",
                        "cell":"background",
                        "widget":"background"
                    }}
                    enableShapeSelection={false}
                    enableFrameSelection
                    callbacks={{
                        onClick:{
                            column_header:(id, pageId, data, kG)=>{
                                const colIdx = id[0]?.split("_")[1]
                                if( colIdx !== undefined ){
                                    const view = kG.original?.parent?.findAncestor(".view")
                                    if( view ){
                                        const stateData = view.stateData?.[view.id()]
                                        const data = stateData?.data
                                        if(data){
                                            const list = uniquePrimitives( data.cells.filter(d=>d.cIdx == colIdx).flatMap(d=>d.items) )
                                            selectItems(stateData.primitive, {forFlow: true, asList: true, list})
                                        }
                                    }

                                }
                            },
                            row_header:(id, pageId, data, kG)=>{
                                const rowIdx = id[0]?.split("_")[1]
                                if( rowIdx !== undefined ){
                                    const view = kG.original?.parent?.findAncestor(".view")
                                    if( view ){
                                        const stateData = view.stateData?.[view.id()]
                                        const data = stateData?.data
                                        if(data){
                                            const list = uniquePrimitives( data.cells.filter(d=>d.rIdx == rowIdx).flatMap(d=>d.items) )
                                            selectItems(stateData.primitive, {forFlow: true, asList: true, list})
                                        }
                                    }

                                }
                            },
                            frame: (id)=>{
                                //setActiveBoard(id)
                                const prim = mainstore.primitive(id)
                                if( prim ){
                                    selectItems(prim, {forFlow: true, asList: prim.type === "view"})
                                }
                            },
                            primitive:(id, pageId, data, kG)=>{
                                let stateData = kG.stateData?.[id]
                                let findSelection = false
                                if( !stateData ){
                                    let parent = kG.original?.parent
                                    stateData = parent?.stateData?.[parent.id()]
                                    if( parent && !stateData ){
                                        parent = parent.original?.parent
                                        stateData = parent?.stateData?.[parent.id()]
                                        findSelection = true
                                    }
                                }
                                if( stateData?.primitive && stateData.config === "plain_object"){
                                    const ids = stateData.object?.ids ? stateData.object.ids.filter(d=>d) : undefined
                                    if( ids?.length > 0){
                                        selectItems(stateData.primitive, {forFlow: true, asList: true, list: ids.map(d=>mainstore.primitive(d))})
                                    }else if( stateData.object?.type === "text" || stateData.object?.type === "structured_text" ){
                                        selectItems(stateData.primitive, {forFlow: true, plainData: stateData.object?.text.join("\n")})
                                    }
                                }else{
                                    let data = stateData.list ?? stateData.primitiveList
                                    let axisData = stateData.extents
                                    if( stateData.axisSource ){
                                        const parentId = stateData.axisSource.configParent?.id
                                        if( parentId && kG.stateData){
                                            const sourceState = kG.stateData[parentId]
                                            const sourceData = sourceState.list ?? sourceState.primitiveList
                                            if( sourceData ){
                                                data = sourceData
                                                axisData = sourceState.extents
                                            }
                                        }
                                    }
                                    if( data ){
                                        if( findSelection ){
                                            data = data.filter(d=>id.includes(d.primitive?.id ?? d.id))
                                            if( data.length === id.length){
                                                selectItems(id, {forFlow: true, asList: true, list: [mainstore.primitive(id)]})
                                                return
                                            }
                                        }
                                        selectItems(stateData.primitive, {forFlow: true, asList: true, list: data, axisData})
                                    }else{
                                        selectItems(id, {forFlow: true})
                                    }
                                }
                            },
                            cell:(id, pageId, data, kG)=>{
                                const cell = id?.[0]
                                let frameId = kG?.original?.parent?.attrs?.id
                                let direct = false

                                if( kG && !kG.original){
                                    kG = kG.findAncestor('.inf_track')
                                    frameId = kG.attrs.id
                                    direct = true
                                }

                                if( cell && frameId){
                                    const [cIdx,rIdx] = cell.split("-")
                                    
                                    let stateData = direct ? kG.stateData : kG.original.parent.stateData
                                    if( stateData ){

                                        let sourceState = stateData[frameId]
                                        let sourcePrimitive = sourceState.underlying
                                        
                                        if( sourceState.axisSource ){                                        
                                            let axisSource = sourceState.axisSource
                                            if( axisSource.inFlow && axisSource.configParent.flowElement ){
                                                axisSource = axisSource.configParent
                                            }
                                            const axisSourceState = stateData[axisSource.id]
                                            sourcePrimitive = axisSourceState.underlying
                                            if( !sourceState.data ){
                                                sourceState = axisSourceState
                                            }
                                        }
                                        let filters
                                        
                                        if(sourceState.data){
                                            const data = sourceState.data
                                            const cellData = data.cells.find(d=>d.id === cell)
                                            
                                            filters = [
                                                PrimitiveConfig.encodeExploreFilter( data.defs?.columns, cellData.columnIdx ),
                                                PrimitiveConfig.encodeExploreFilter( data.defs?.rows, cellData.rowIdx ),
                                            ].filter(d=>d)
                                            
                                        }else if( sourceState?.axis){
                                            filters = [
                                                PrimitiveConfig.encodeExploreFilter( sourceState.axis.column, sourceState.columns[cIdx] ),
                                                PrimitiveConfig.encodeExploreFilter( sourceState.axis.row, sourceState.rows[rIdx] ),
                                            ].filter(d=>d)                                    
                                        }
                                        if( !sourcePrimitive && sourceState.primitiveList){
                                            selectItems(sourceState.primitive, {list: sourceState.primitiveList, forFlow: true, asList: true, filters})

                                        }else{
                                            selectItems(sourcePrimitive, {forFlow: true, asList: true, filters})
                                        }
                                    }
                                }
                            },
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
                    render={renderedSet}/>
            </div>
})
export default FlowInstanceOutput
