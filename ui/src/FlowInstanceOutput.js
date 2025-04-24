import { HeroIcon } from "./HeroIcon";
import { PrimitiveCard } from "./PrimitiveCard";
import { classNames } from "./SharedTransforms";
import { ChevronDownIcon, DocumentArrowDownIcon, ChevronLeftIcon } from "@heroicons/react/24/outline";
import UIHelper from "./UIHelper";
import MainStore from "./MainStore";
import { useRef, useState } from "react";
import FeedList from "./@components/Feed";
import InfiniteCanvas from "./InfiniteCanvas";
import BoardViewer, { IGNORE_NODES_FOR_EXPORT } from "./BoardViewer";
import { createPptx, exportKonvaToPptx } from "./PptHelper";
import Konva from "konva";
import { DescriptionDetails, DescriptionList, DescriptionTerm } from "./@components/description-list";
import PrimitiveConfig from "./PrimitiveConfig";

export function FlowInstanceOutput({primitive, inputPrimitives, steps,...props}){
    const [expand, setExpand] = useState(false)
    const [showFeed, setShowFeed] = useState(true)
    const myState = useRef({})
    const canvas = useRef({})



    async function downloadAll(){
        const pptx = createPptx()
        const frames = canvas.current.frameList() 
        for(const id of frames){                    
            const root = canvas.current.frameData( id )
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
        }
        pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });

    }

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
    
    if( !primitive ){
        return <></>
    }
    
    const flow = primitive.findParentPrimitives({type:"flow"})[0]


    const renderedSet = Object.keys(outputs ?? {}).map(pin=>(outputs[pin]?.items ?? []).map(d=>{
        myState[d.id] = {id: d.id, renderSubPages: true}
        const renderConfig = BoardViewer.prepareBoard(d, myState)
        const inputPin = pin.split("_")[1]
        myState[d.id].title = flow.referenceParameters?.outputPins?.[inputPin]?.name ??  `Output for ${pin}`
        return BoardViewer.renderBoardView(d, primitive, myState)
    })).flat()


    //return  <div className="flex h-full w-full relative border rounded-lg border-gray-200 overflow-hidden mb-2 bg-white">
    return  <div className="@container flex h-full w-full relative overflow-hidden bg-white">
                <InfiniteCanvas
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
                    enableFrameSelection
                    callbacks={{
                        onClick:{
                            frame: (id)=>{
                                //setActiveBoard(id)
                                mainstore.sidebarSelect(id)
                            },
                            primitive:(id, pageId, data, kG)=>{
                                let stateData = kG.stateData?.[id]
                                if( stateData?.primitive && stateData.config === "plain_object"){
                                    const ids = stateData.object?.ids ? stateData.object.ids.filter(d=>d) : undefined
                                    if( ids?.length > 0){
                                        mainstore.sidebarSelect(stateData.primitive, {forFlow: true, asList: true, list: ids.map(d=>mainstore.primitive(d))})
                                    }else if( stateData.object?.type === "text" || stateData.object?.type === "structured_text" ){
                                        mainstore.sidebarSelect(stateData.primitive, {forFlow: true, plainData: stateData.object?.text.join("\n")})
                                    }
                                }else{
                                    let data = stateData.list ?? stateData.primitiveList
                                    let axisData = stateData.extents
                                    if( stateData.axisSource ){
                                        const parentId = stateData.axisSource.configParent?.id
                                        if( parentId ){
                                            const sourceState = kG.stateData[parentId]
                                            const sourceData = sourceState.list ?? sourceState.primitiveList
                                            if( sourceData ){
                                                data = sourceData
                                                axisData = sourceState.extents
                                            }
                                        }
                                    }
                                    if( data ){
                                        mainstore.sidebarSelect(stateData.primitive, {forFlow: true, asList: true, list: data, axisData})
                                    }else{
                                        mainstore.sidebarSelect(id)
                                    }
                                }
                            },
                            cell:(id, pageId, data, kG)=>{
                                const cell = id?.[0]
                                const frameId = kG?.original?.parent?.attrs?.id
                                if( cell && frameId){
                                    const [cIdx,rIdx] = cell.split("-")
                                    
                                    let stateData = kG.original.parent.stateData
                                    let sourceState = stateData[frameId]
                                    if( sourceState.axisSource ){                                        
                                        let axisSource = sourceState.axisSource
                                        if( axisSource.inFlow && axisSource.configParent.flowElement ){
                                            axisSource = axisSource.configParent
                                        }
                                        sourceState = stateData[axisSource.id]
                                    }

                                    if( sourceState?.axis){

                                        
                                        let filters = [
                                                PrimitiveConfig.encodeExploreFilter( sourceState.axis.column, sourceState.columns[cIdx] ),
                                                PrimitiveConfig.encodeExploreFilter( sourceState.axis.row, sourceState.rows[rIdx] ),
                                            ].filter(d=>d)                                    
                                        console.log(filters)
                                        mainstore.sidebarSelect(sourceState.underlying, {forFlow: true, asList: true, filters})
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
}
