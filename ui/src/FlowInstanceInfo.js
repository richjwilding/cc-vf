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

export function FlowInstanceInfo({primitive, inputPrimitives, steps,...props}){
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

    const bg = props.bg ?? "bg-white"
    const ring = bg.replace("bg-", "ring-")
    const activeList = []
    const padding = props.padding ?? "p-4"

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
    
    const [selectedOutputPin, setSelectedOutputPin] = useState(outputPins[0])

    if( !primitive || !steps){
        return <></>
    }
    let runningProgress = []

    const stepsToProcess = steps.map(step=>{
        let status = "Pending"
        let iconBackground = 'bg-gray-300'
        let icon = <HeroIcon icon='FAHand' className='text-white w-4 h-4'/>
        let progress
        let message
        const stepForInstance = primitive?.primitives.origin.allItems.find(d=>d.configParent?.id === step.id)
        if(stepForInstance && stepForInstance?.processing?.flow?.flowStarted === primitive?.processing?.flowStarted){
            message = stepForInstance?.processing?.query?.message
            if( stepForInstance?.processing?.flow?.status === "complete" ){
                status = "Done"
                icon = <HeroIcon icon='FACheck' className='text-white w-4 h-4'/>
                iconBackground = 'bg-green-500'
            }else if( stepForInstance?.processing?.flow?.status === "running" ){
                status = "Running"
                activeList.push( step.title)
                icon = <HeroIcon icon='FASpinner' className='text-ccgreen-600 w-4 h-4 animate-spin'/>
                iconBackground = 'bg-white'
                progress = stepForInstance.processing.query?.progress?.message
            }
        }
        return {
            status, iconBackground, icon, progress, message, title: stepForInstance?.plainId + " - " + step.title, primitive: stepForInstance
        }
    })
    const complete = stepsToProcess.every(d=>d.status === "Done")
    console.log(stepsToProcess)
    
    const flow = primitive.findParentPrimitives({type:"flow"})[0]


    const renderedSet = Object.keys(outputs ?? {}).map(pin=>(outputs[pin]?.items ?? []).map(d=>{
        myState[d.id] = {id: d.id, renderSubPages: true}
        const renderConfig = BoardViewer.prepareBoard(d, myState)
        const inputPin = pin.split("_")[1]
        myState[d.id].title = flow.referenceParameters?.outputPins?.[inputPin]?.name ??  `Output for ${pin}`
        //myState[d.id].renderSubPages = true
        return BoardViewer.renderBoardView(d, primitive, myState)
    })).flat()


    function inputPinPane(){
        const pins = flow.referenceParameters?.inputPins ?? {}
        const pinNames = Object.keys(pins)
        return <div className="flex flex-col w-full @container  max-h-[min(70vh,_50rem)] min-h-0 overflow-y-scroll">
            <PrimitiveCard.InputPins primitive={primitive}/>
        </div>

    }
    const hasInputPrimitives = inputPrimitives && inputPrimitives.length > 0
    const singleInputPrimitive = inputPrimitives && inputPrimitives.length === 1
    const inputPrimitive = singleInputPrimitive ? inputPrimitives[0] : undefined

    return (<>
        <div className={`${bg} ${padding} @container flex flex-col text-md`}>
            <div className="flex justify-between">
            <span>{inputPrimitive?.title ?? primitive.title}</span>
            <UIHelper.IconButton 
                icon={<DocumentArrowDownIcon className={`size-5`}/>}
                action={downloadAll}/>
            </div>
            {singleInputPrimitive && inputPrimitive && <PrimitiveCard.Title primitive={inputPrimitive} compact={true}/>}
            {!singleInputPrimitive && hasInputPrimitives && <p>{inputPrimitives.length} inputs</p>}
            {expand && singleInputPrimitive && inputPrimitive && <PrimitiveCard.Parameters primitive={inputPrimitive} fullList={true}/>}
            {expand && !hasInputPrimitives && inputPinPane()}
            {expand && <div className="mt-auto -mb-3">
                <PrimitiveCard.Title primitive={primitive} compact={true}/>
            </div>}
        </div>
        <div className={`${bg} ${padding} px-1 @container flex flex-col`}>
            {expand && <div className={
                classNames(
                    "w-full grid gap-2",
                    showFeed ? "grid-cols-[minmax(30em,1fr)_16em]" : "grid-cols-[minmax(30em,1fr)_3.75em]"
                )}>
                <div className="flex h-full w-full max-h-[min(70vh,_50rem)] min-h-inherit relative border rounded-lg border-gray-200 overflow-hidden mb-2"><InfiniteCanvas
                        primitive={primitive}
                        board
                        hideWidgets={true}
                        ref={canvas}
                        background="white"
                        ignoreAfterDrag={false}
                        snapDistance={5}
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
                                primitive:(id)=>mainstore.sidebarSelect(id)
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
                {<div className={`flex flex-col p-4 rounded-lg px-4 py-2 ${bg}  @container border mb-2 flex w-full @container  max-h-[min(70vh,_50rem)] min-h-0 overflow-y-scroll`}>
                    <div className="flex space-x-2 place-items-center justify-between mb-2">
                        {showFeed && <p className="text-gray-500 font-semibold text-sm">Steps</p>}
                        <UIHelper.IconButton 
                            icon={<ChevronLeftIcon className={`size-4 ${showFeed ? "rotate-180" : ""}`}/>}
                            action={()=>{
                                setShowFeed(!showFeed)
                            }}/>
                    </div>
                    <FeedList 
                        showLabels={showFeed} 
                        items={stepsToProcess.map(d=>({
                            ...d, 
                            content: d.title, 
                            secondary: d.progress, 
                            onClick:()=>MainStore().sidebarSelect(d.primitive, {forFlow: true})
                        }))}
                        />
                    <div className="flex space-x-2 place-items-center justify-stretch mt-5">
                        {showFeed && <UIHelper.Button 
                            className='!font-normal gap-x-1 grow'
                            title="Run"
                            icon={<HeroIcon icon='FAPlay' className='size-4 text-ccgreen-600 group-hover:text-ccgreen-800 hover:text-ccgreen-800'/>}
                            action={()=>{
                                MainStore().doPrimitiveAction( primitive, "run_flow_instance")
                            }}/>}
                        {!showFeed && <UIHelper.IconButton 
                            icon={<HeroIcon icon='FAPlay' className='size-4 text-ccgreen-600 group-hover:text-ccgreen-800 hover:text-ccgreen-800'/>}
                            action={()=>{
                                MainStore().doPrimitiveAction( primitive, "run_flow_instance")
                            }}/>}
                    </div>
                </div>}
            </div>}
            {complete && <p className="text-sm text-gray-600">{primitive.processing?.flow?.completed ? `Last completed ${primitive.processing?.flow?.completed}` : "Completed"}</p>}
            {!complete && !expand && <>
                <div className={`justify-between w-full relative h-min flex ${bg}  ${props.hideProgressAt ? `hidden @4xl:flex` : ""}`}>
                    <span aria-hidden="true" className={`absolute top-[50%] w-full h-0.5 bg-gray-200 z-0`} />
                    {stepsToProcess.map(step=>{
                        return (
                            <span
                                className={classNames(
                                step.iconBackground,
                                'flex size-6 items-center justify-center rounded-full ring-8 z-10',
                                ring
                                )}
                            >
                                {step.icon}
                            </span>
                        )
                    })}
                </div>
                <div className={`${bg} mt-3 text-xs text-gray-600`}>
                    {(()=>{
                        let runningInfo
                        if( activeList.length === 1){
                            runningInfo = `Running ${activeList}...`
                        }else if(activeList.length === 2){
                            runningInfo = `Running ${activeList.join(", ")}...`
                        }else if(activeList.length > 2){
                            runningInfo = `Running ${activeList.slice(0,2).join(", ")} and ${activeList.length - 2} other(s)...`
                        }
                        return <div>
                                <strong>{runningInfo}</strong>
                                {runningProgress.map(d=><p>{d}</p>)}
                            </div>
                    })()}
                </div>
            </>}
        </div>
        <div className={`${bg} ${padding} place-items-center`}>
            <ChevronDownIcon className={`size-5 text-gray-400 hover:text-gray-800 ${expand ? "rotate-180" : ""}`} onClick={()=>setExpand(!expand)}/> 
            <UIHelper.IconButton 
                            icon={<HeroIcon icon='FAPlay' className='size-4 text-ccgreen-600 group-hover:text-ccgreen-800 hover:text-ccgreen-800'/>}
                            action={()=>{
                                MainStore().doPrimitiveAction( primitive, "run_flow_instance")
            }}/>
        </div>
    </>)
}
