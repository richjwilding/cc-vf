import { useEffect, useReducer, useRef, useState } from "react";
import useDataEvent from "./CustomHook";
import MainStore from "./MainStore";
import Panel from "./Panel";
import { PrimitiveCard } from "./PrimitiveCard";
import EditableTextField from "./EditableTextField";
import FeedList from "./@components/Feed";
import { HeroIcon } from "./HeroIcon";
import {DescriptionList, DescriptionTerm, DescriptionDetails} from './@components/description-list'
import UIHelper from "./UIHelper";
import clsx from "clsx";
import { VFImage } from "./VFImage";
import { useLocation, useParams } from "react-router-dom";
import { Button, Progress, Select, SelectItem, Tab, Tabs } from "@heroui/react";
import { ChevronDoubleLeftIcon, ChevronRightIcon, DocumentArrowDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import FlowInstanceOutput from "./FlowInstanceOutput";
import AgentChat from "./AgentChat";
import { Logo } from "./logo";
import WorkflowStructurePreview from "./WorkflowStructurePreview";
import PrimitiveConfig from "./PrimitiveConfig";
import { Icon } from "@iconify/react/dist/iconify.js";
import GanttChart from "./GanttChart";
import { FlowContent } from "./sidebar/FlowContent";


export default function FlowInstancePage({primitive, ...props}){
    const { id } = useParams();
    const location = useLocation();
    const query = new URLSearchParams(location.search);
    const flowInfoRef = useRef({})
    const [agentStatus, setAgentStatus] = useState({activeChat: false})

    const [chatState, setChatState] = useState(undefined);
    const [animateState, setAnimateState] = useState(true);
    const isEmbedded = query.get("embed")
    
    const tabsMain = [
        { title: 'Flow', id: "flow"},
        { title: 'Inspector', id: "inspector" },
    ].filter(d=>d)
    const tabs = [
        primitive?.processing?.run_flow_instance ? undefined :{ title: 'Assistant', id: "ai" },
        { title: 'Inputs', id: "input" },
        { title: 'Progress', id: "progress"},
        { title: 'Timeline', id: "timeline"},
    ].filter(d=>d)
    const [activeTab, setActiveTab ] = useState( tabs[0].id )
    const [activeMainTab, setActiveMainTab ] = useState( tabsMain[0].id )
    const [inspectorFocus, _setInspectorFocus ] = useState(  )

    function setInspectorFocus(...args){
        _setInspectorFocus(...args)
        setActiveMainTab( "inspector")

    }

    if (!primitive && id) {
        primitive = MainStore().primitive(id)
    }
    useEffect(() => {
        if( !primitive ){
            MainStore().fetchPrimitive(id)
        }
      }, [primitive]);

    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [showOutput, setShowOutput ]= useState(false)
    const [dataForNewInstance, setDataForNewInstance ]= useState({})
    
    const [errors, setErrors ]= useState({})
    const [missing, setMissing ]= useState({})
    const [statusMap, setStatusMap ]= useState({})
    const [stepsToProcess, setStepsToProcess ]= useState([])
    const [timelineData, setTimelineData ]= useState([])

    const ids = primitive ? [primitive.id, ...primitive.primitives.origin.allIds] : []

    useDataEvent('relationship_update set_field set_parameter',ids, (...args)=>{
        forceUpdate()
    })
    function updateChatState(state){
        setChatState(state)
        setAnimateState(true)
        setTimeout(() => {
            setAnimateState(false)
        }, 1200);
    }

    const isForNewInstance = primitive.type === "flow"
    const targetFlow = isForNewInstance ? primitive : primitive.origin
    const pins = isEmbedded ? {
        ...primitive.getConfig?.inputPins,
        split1:{split:true, title:"Your details"},
        ext_name:{
            "name": "Your Name",
            "source": "param.ext_name",
            "types": [
              "string"
            ]
        },
        ext_company_name:{
            "name": "Your company",
            "source": "param.ext_company_name",
            "types": [
              "string"
            ]
        },
        ext_email:{
            "name": "Your company email (for report)",
            "source": "param.ext_email",
            "types": [
              "string"
            ]
        }
    }: primitive.getConfig?.inputPins


    function createNewInstance(){
        if( isForNewInstance ){
            MainStore().doPrimitiveAction(targetFlow, "create_flowinstance", {data: dataForNewInstance})
        }
    }

    let steps = [], flowInstances = []
    targetFlow?.primitives.origin.allUniqueItems.forEach(d=>{
        if(d.type === "flowinstance"){
            flowInstances.push(d)
        }else{
            //if( d.type !== "view" && d.type !== "page"){
                steps.push(d)
            //}
        }
    })
    useEffect(()=>{
        if( primitive && (activeTab === "progress" || activeTab === "timeline")){
            primitive.instanceStatus.then(d=>{
                
                const {nodes, edges, visibleIds} = PrimitiveConfig.flowInstanceStatusToMap( d, {showHidden: false, showSkipped: false, groupByLabels: activeTab === "progress"})
                
                const depth = PrimitiveConfig.convertEdgesToDepth( edges )
               

                nodes.forEach(d=>{
                    d.depth = depth.get(d.id)
                })
                

                const steps = nodes.sort((a,b)=>a.depth - b.depth).map(d=>{
                    return {
                        title: d.name,
                        status: d.status,
                        ids: d.itemIds,
                        details: d
                    }
                })

                const timeline = nodes.flatMap(d=>{
                    let multiple = d.itemIds.length > 1
                    let minStart, maxEnd
                    const lineItems = d.itemIds.map(id=>{
                        const p = MainStore().primitive(id)
                        if( p.type === "page"){
                            return
                        }
                        let start = p.type === "flowinstance" ? p.processing?.flow?.started : p.processing?.run_step?.pending
                        let end = p.type === "flowinstance" ? p.processing?.flow?.completed : p.processing?.run_step?.completed


                        if(p.type === "search"){
                            start = p.processing?.query?.running
                            end = p.processing?.query?.completed ?? new Date()
                            const children = p.primitives.origin.allSearch
                            if( children ){
                                for(const c of children){
                                    let thisStart = c.processing?.query?.running
                                    let thisEnd = c.processing?.query?.completed
                                    if( !start || (thisStart < start) ){
                                        start = thisStart
                                    }
                                    if( !end || (thisEnd > end) ){
                                        end = thisEnd
                                    }
                                }
                            }
                        }

                        if( !(start && end)){
                            return
                        }
                        if( !minStart || start < minStart){ minStart = start}
                        if( !maxEnd || end > maxEnd){ maxEnd = end}
                        return {
                            id: p.id,
                            title: multiple ? p.configParent.title : d.name,
                            start,
                            end,
                            parentId: multiple ? d.id : undefined,
                            childrenIds: multiple ? undefined : edges.filter(d=>d.from === id).map(d=>d.to)
                        }
                    })
                    if( multiple){
                        lineItems.unshift({
                            id: d.id,
                            title: d.name,
                            start: minStart,
                            end: maxEnd,
                            childrenIds: edges.filter(d2=>d2.from === d.id).map(d=>d.to)
                        })
                    }
                    return lineItems
                }).filter(Boolean)
                setTimelineData( timeline )

                setStepsToProcess(steps)
                setStatusMap(d)
            })
        }
    },[primitive?.id, activeTab])
    if( !primitive){
        return <></>
    }

    
    if(!targetFlow){
        return <></>
    }
    function newInstanceCallback(d,v){
        setDataForNewInstance({
            ...dataForNewInstance,
            [d]: v
        })
        return true
    }

    
    const inputs = primitive.itemsForProcessing
    const color = targetFlow.workspace?.color || "slate"
    const showImage = targetFlow.referenceParameters?.hasImg
    const enableSubmit = [...Object.values(missing), ...Object.values(errors)].filter(d=>d).length === 0

    const configurationOptions = targetFlow.referenceParameters.configurations ?? {}
    const hasConfiguration = Object.keys(configurationOptions).length > 0

    function setValue(k,v){
        if( isForNewInstance ){
            newInstanceCallback(k, v)
        }else{
            primitive.setField(`referenceParameters.${k}`, v)
        }
    }

    function renderConfigOption( rawKey, info ){
        const key = "fc_" + rawKey
        const currentValue =[primitive.referenceParameters?.[key]].flat()
        switch( info.type ){
            case "options":
                return <Select 
                            className="max-w-xs" 
                            label="Select option" 
                            variant="bordered" 
                            selectedKeys={currentValue ?? []} 
                            selectionMode={info.can_select_multiple === true ? "multiple" : "single"} 
                            onChange={(e)=>{
                                const value = e.target.value
                                setValue(key, info.can_select_multiple === true ? value.split(",").map(d=>d.trim()) : value)
                            }}
                            >
                    {info.options.map((option) => (
                    <SelectItem key={option.id}>{option.title}</SelectItem>
                    ))}
                </Select>
            
        }            
    }

    const pinsToShow = Object.entries(pins ?? {}).reduce((a, [k,d])=>{
        let include = true
        if( d.validForConfigurations ){
            include = d.validForConfigurations.some(config=>{
                const key = "fc_" + config.config
                const currentValue = [isForNewInstance ? dataForNewInstance[key] : primitive.referenceParameters[key]].flat()
                if( [config.values].flat().some(d=>currentValue.includes(d)) ){
                    return true
                }
                return false
            })
        }
        if( include ){
            a[k] = d
        }
        return a
    }, {})

    const showWorking = primitive.processing?.flow?.status === "running"
    return <div className={clsx([
            "flex w-full relative flex-1 min-h-0 h-full max-h-[calc(100vh_-_2rem)] bg-gray-50",
            showOutput ? "p-6 space-x-6" : ""
        ])}>
                {showOutput && !isForNewInstance && <div className="w-full h-full flex ">
                    <div className="w-full h-full flex bg-[#fefefe] overflow-hidden shadow-lg rounded-2xl relative">
                        <div className="flex-1 min-h-0 flex h-full">
                            <FlowInstanceOutput
                                ref={flowInfoRef} 
                                primitive={primitive} 
                                inputPrimitives={inputs} 
                                steps={steps} 
                                select={(p_or_id, options)=>{
                                    const primitives = p_or_id ? [p_or_id].flat().map(d=>typeof(d) === "object" ? d : MainStore().primitive(d)) : []
                                    console.log(primitives)
                                    setInspectorFocus({primitives, ...options, showExecution: false})
                                }}
                                hideProgressAt="@4xl"
                                />
                        </div>
                        <div key='toolbar3' className='overflow-hidden max-h-[80vh] bg-white rounded-md shadow-lg border-gray-200 border absolute right-4 top-4 z-50 flex space-x-1 place-items-center p-1'>
                            <Button isIconOnly variant="light" onClick={()=>setShowOutput(false)}><XMarkIcon className="text-slate-500 w-5 h-5"/></Button>
                            <Button isIconOnly variant="light" onClick={()=>flowInfoRef?.current?.downloadAll()}><DocumentArrowDownIcon className="text-slate-500 w-5 h-5"/></Button>
                        </div>
                    </div>
                </div>}
                <div className={clsx([
                    "min-w-[30em] font-['Poppins'] @container flex flex-col min-h-0 relative overflow-hidden",
                    //showOutput ? "w-[25vw] max-w-2xl p-6 shadow-lg rounded-2xl bg-white" : "w-full mx-auto max-w-6xl px-9 bg-white"
                    showOutput ? "min-w-[24rem] sm:min-w-[28rem] w-[24rem] sm:w-[28rem] 3xl:min-w-[32rem] 5xl:min-w-[40rem] 5xl:w-[40rem] 6xl:min-w-[48rem] 6xl:w-[48rem] py-4 px-6 shadow-lg rounded-2xl bg-white" : "w-full mx-auto max-w-6xl px-9 bg-white"
                ])}>
                    {!showOutput && <div className={clsx([
                        "flex relative mb-4",                    
                        showOutput ? "min-h-32 -mx-6 -mt-6 mb-0 overflow-hidden rounded-t-2xl" : "min-h-32 [@media(min-height:1024px)]:min-h-64 -mx-9 -mt-6 shadow-md ",
                    ])}>
                        {showImage && <VFImage 
                                            src={`/api/image/${targetFlow.id}`} 
                                            className={clsx([
                                                "w-full object-cover max-h-32 [@media(min-height:1024px)]:max-h-64"
                                            ])}
                                            />}
                        {!showImage && <div className={clsx([
                            "w-full",
                            `pattern-isometric pattern-${color}-600 pattern-bg-${color}-500 pattern-opacity-20 pattern-size-8`
                        ])}/>}

                        <div className={
                            clsx([
                                "grow bottom-0 absolute py-2 px-3",
                                showImage && "bg-gradient-to-t from-black to-transparent from-20% w-full text-white/90 pt-4"
                            ])}>
                            <UIHelper.PrimitiveField primitive={targetFlow} field="title" major submitOnEnter={true} update={update} editable={false}/>
                            <PrimitiveCard.Title primitive={targetFlow} major={true}/>
                        </div>
                    </div>}
                    {showWorking && <Progress color="secondary" isIndeterminate aria-label="Working..." size="sm" className="top-0 absolute left-0 h-2 " />}
                    {showOutput && <div className="flex place-items-center py-2 justify-center relative ">
                        <Tabs variant="underlined" fullWidth selectedKey={activeMainTab} onSelectionChange={((id)=>setActiveMainTab(id))}>
                            {tabsMain.map(d=><Tab key={d.id} title={d.title}/>)}
                        </Tabs>
                    </div>}
                    {showOutput && activeMainTab === "inspector" && <div className="flex-1 min-h-0 overflow-y-scroll">
                        { inspectorFocus &&<FlowContent {...inspectorFocus} />}
                    </div>}
                    {(!showOutput || activeMainTab === "flow") && <div className="flex-1 min-h-0">
                        <div className="flex place-items-center py-2 justify-center relative ">
                            <Tabs variant="solid" selectedKey={activeTab} onSelectionChange={((id)=>setActiveTab(id))}>
                                {tabs.map(d=><Tab key={d.id} title={d.title}/>)}
                            </Tabs>
                            <div className="absolute right-0 space-x-2 place-items-center flex">
                                {!showOutput && !isForNewInstance && <Button isIconOnly variant="flat" onClick={()=>setShowOutput(true)}><Icon icon="fluent:slide-text-sparkle-20-regular" className='w-6 h-6'/></Button>}
                                {<Button isIconOnly variant="flat" color="primary" onClick={()=>MainStore().doPrimitiveAction( primitive, "continue_flow_instance", {organizationId: MainStore().activeOrganization?.id})}><Icon icon="solar:play-circle-linear" className='w-6 h-6'/></Button>}
                                
                            </div>
                        </div>
                        {chatState && activeTab === "ai" && <div className={clsx([
                                                                animateState ? "animate-border bg-[length:400%_400%] bg-gradient-to-r from-green-500 to-blue-500 via-purple-500 " : "",
                                                                "border absolute flex-col left-[calc(100vh_-_30rem)] left-[105%] top-[7rem] rounded-[20px] shadow-lg text-xs w-[28rem] z-50 p-[1px]",
                                                                "hidden min-[2150px]:flex "
                                                            ])}>
                                                                <div className="bg-ccgreen-50 rounded-[18px] px-3 py-2 flex flex-col overflow-y-scroll  @container  space-y-1.5 max-h-[calc(100vh_-_12rem)]">
                                                                    <p className="text-sm font-semibold text-slate-600">Flow settings</p>
                                                                    <p className="text-md text-slate-700">Configuration</p>
                                                                    <DescriptionList className="!text-xs">
                                                                    {Object.entries(chatState.configuration ?? {}).map(([k,v])=>{
                                                                        return <>
                                                                            <DescriptionTerm>{configurationOptions[k]?.title ?? k}</DescriptionTerm>
                                                                            <DescriptionDetails>{[v].flat().map(d=>configurationOptions[k].options.find(d2=>d2.id==d)?.title ?? d).join(", ")}</DescriptionDetails>
                                                                        </>
                                                                    })}                            
                                                                    </DescriptionList>
                                                                    <p className="text-md text-slate-700">Inputs</p>
                                                                    <DescriptionList className="!text-xs">
                                                                    {Object.entries(chatState.inputs ?? {}).map(([k,v])=>{
                                                                        return <>
                                                                            <DescriptionTerm>{pins[k]?.name ?? k}</DescriptionTerm>
                                                                            <DescriptionDetails>{Array.isArray(v) ? v.join(", ") : (v ?? "")}</DescriptionDetails>
                                                                        </>
                                                                    })}                            
                                                                    </DescriptionList>
                                                                    </div>
                                                                </div>}

                        <div className={clsx([
                                    "flex flex-col h-full pb-8 bg-white",
                                    activeTab === "ai" ? "" : "hidden",
                                    agentStatus.hasReplies ? "justify-stretch" : "justify-center "
                                ])}>
                                    <div key='chatbar' className={clsx([
                                        'flex flex-col overflow-hidden p-3 place-items-start text-md',
                                        agentStatus.hasReplies ? "h-full w-full" : "mx-auto",
                                        showOutput ? "w-full" : "min-w-[44rem] w-[60%] "
                                    ])}>
                                        {!agentStatus.hasReplies && <div className="w-full flex justify-center space-x-2 place-items-center grow">
                                            <div className="bg-gray-50 rounded-xl border p-6 m-4 text-slate-700 w-72">
                                                SENSE AI can help you setup this workflow.  Tell it what you're looking to do...
                                            </div>
                                        </div>}
                                        <AgentChat setChatState={updateChatState} setStatus={setAgentStatus} primitive={primitive} seperateInput={true}/>
                                    </div>
                        </div>
                        <div className={clsx([
                            "overflow-y-scroll flex flex-col h-full",
                            activeTab === "input" ? "" : "hidden"
                            ])}>
                            {hasConfiguration && <UIHelper.Panel title="Flow Options" narrow className="my-6">
                                <DescriptionList inContainer={true}>
                                {Object.entries(configurationOptions).map(([key, info])=>(
                                    <>
                                        <DescriptionTerm inContainer={true}>{info.title}</DescriptionTerm>
                                        <DescriptionDetails inContainer={true}>
                                            {renderConfigOption(key, info)}                                       
                                        </DescriptionDetails>
                                    </>
                                ))}
                                </DescriptionList>
                            </UIHelper.Panel>}
                            <PrimitiveCard.InputPins 
                                primitive={primitive} 
                                pins={pinsToShow} 
                                dataForNewInstance={isForNewInstance ? dataForNewInstance : undefined} 
                                newInstanceCallback={isForNewInstance ? newInstanceCallback : undefined} 
                                updateMissing={isForNewInstance ? setMissing : undefined}
                            />
                            {isForNewInstance&& <div className="flex place-items-center py-3 justify-end space-x-3">
                                {isEmbedded && <UIHelper.Button title="Cancel" onClick={()=>{console.log("send");window.parent.postMessage("close_newflow","*")}}/>}
                                <UIHelper.Button title="Submit" color='green' disabled={!enableSubmit} onClick={createNewInstance}/>
                            </div>}
                        </div>
                        {activeTab === "progress" && <div className="flex w-full h-full">
                            <FeedList 
                                className="w-96 shrink-0 grow-0 overflow-y-scroll mb-16"
                                showLabels={true} 
                                update={update}
                                items={stepsToProcess.map(d=>({
                                    ...d, 
                                    content: d.title, 
                                    //secondary: d.progress, 
                                    onClick:()=>{
                                        if( d.ids?.length > 0 ){
                                            MainStore().sidebarSelect(d.ids, {forFlow: true, flowInstance: primitive})
                                         //const primitives = d.ids.map(d=>MainStore().primitive(d))
                                         //setInspectorFocus({primitives, flowInstance: primitive})
                                        }
                                    }
                                }))}
                            />
                            {!showOutput && <div className="relative grow">
                                {statusMap && <WorkflowStructurePreview statusMap={statusMap} onClick={(id)=>MainStore().sidebarSelect(id, {forFlow: true, flowInstance: primitive})}/>}
                            </div>}
                        </div>}
                        {activeTab === "timeline" && <div className="flex w-full h-full">
                            <GanttChart items={timelineData} width={1000} />
                            </div>
                        }
                    </div>}
                </div>
    </div>
}
