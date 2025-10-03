import { useEffect, useReducer, useState } from "react" 
import MainStore, { uniquePrimitives } from "./MainStore"
import Panel from "./Panel"
import { PrimitiveCard } from "./PrimitiveCard"
import NewPrimitive from "./NewPrimitive"
import { useNavigate, useParams } from 'react-router-dom';
import useDataEvent from "./CustomHook"
import WorkflowCard from "./WorkflowCard"
import { FlowInstanceInfo } from "./FlowInstanceInfo"
import { Table } from "./Table"
import { Temporal } from "@js-temporal/polyfill"
import { ArrowDownTrayIcon, Cog8ToothIcon, EyeIcon, PlayIcon, SparklesIcon } from "@heroicons/react/24/outline"
import { Badge } from "./@components/badge"
import WorkspaceEditor from "./WorkspaceEditor"
import { Button } from "@heroui/react"
import { Icon } from "@iconify/react/dist/iconify.js"
import FlowInstanceEditor from "./FlowInstanceEditor"

export default function WorkflowDashboard(){
    const navigate = useNavigate()        
    const [showNew, setShowNew] = useState(false)
    const [editFlowInstance, setEditFlowInstance] = useState(false)

    const {id} = useParams()

    if( id ){
        MainStore().loadActiveWorkspace( id)
    }else{
        if( MainStore().activeWorkspaceId ){
            navigate(`/workflows/${id}`)
        }
    }
    


    const activeWorkspaceId = MainStore().activeWorkspaceId

    const filterForWorksapce = (array)=>{
        if( activeWorkspaceId === undefined ){
            return array
        }
        return array.filter((d)=>d.workspaceId === activeWorkspaceId)
    }

    useEffect(()=>{
        if( !MainStore().homescreenReady){
            console.log(`Need to load homescreen prims`)
            MainStore().loadHomeScreenPrimitives()
        }
    }, [MainStore().homescreenReady])
    
    const workflows = filterForWorksapce(MainStore().primitives().filter((p)=>p.type==="flow" && !p.inFlow))

    useDataEvent('new_primitive delete_primitive',undefined)


    let steps = [], flowInstances = []
    workflows.forEach(d=>d.primitives.origin.allUniqueItems.forEach(d=>{
        if(d.type === "flowinstance"){
            flowInstances.push(d)
        }else{
            if( d.type !== "view" && d.type !== "page"){
                steps.push(d)
            }
        }
    }))
    const [count, forceUpdate] = useReducer( (x)=>x+1, 0)
    const watchIds = [...flowInstances.map(d=>d.id),...steps.map(d=>d.id)]
    useDataEvent("set_field ", watchIds, ()=>{
        console.log(`event`)
        forceUpdate()
    })

    const flowInstanceInfo = flowInstances.map(d=>{
        const status = d.processing?.flow?.status ?? "not_started"
        const completedTime = status === "complete" && d.processing?.flow?.completed ? Temporal.Instant.from(d.processing.flow.completed).toZonedDateTimeISO("UTC").toPlainDate().toLocaleString("en-US", {
            day:   "numeric",
            month: "long",
            year:  "numeric"
          }) : "";
        let statusText = {
            "not_started": "Not Started",
            "running": "Running...",
            "complete": `Completed: ${completedTime}`,
        }[status]
        const color = {
            "not_started": "grey",
            "running": "blue",
            "complete": "green",
        }[status]

        let progressStatus = []
        let progressSection = []

        if( status === "running"){
            d.primitives.origin.map(d=>{
                let added = false
                for(const [k,v] of Object.entries(d.processing ?? {})){
                    if( !v ){
                        continue
                    }
                    if( v.progress){
                        if( typeof(v.progress) === "string" ){
                            progressStatus.push([d,  v.progress])
                            added = true
                        }
                    }else if( v.message && d.processing.flow?.status === "running"){
                        progressStatus.push([d, v.message])
                        added = true
                    }
                }
                if( !added ){
                    if( d.processing?.flow?.status === "running"){
                        progressStatus.push([d, ""])
                    }
                }
            })
            const count = progressStatus.length
            if( count > 0 ){
                if( count > 1 ){
                    statusText = `Running ${count} items...`
                    progressSection.push( <ul className="list-disc text-blue-600 list-inside mt-1">{progressStatus.map(d=>{
                        const label = d[0].getConfig.labelForMap ?? d[0].configParent.title ?? `#${d[0].plainId}`
                        return <li>{label} -  {d[1]}</li>
                    })}</ul>)
                }else{
                    const rp = progressStatus[0][0]
                    const label = rp.getConfig.labelForMap || rp.configParent.title || `#${rp.plainId}`
                    statusText = `Running ${label}...`
                    progressSection.push( <ul className="list-disc text-blue-600 list-inside mt-1"><li>{progressStatus[0][1]}</li></ul> )
                }
            }
        }
        progressSection.unshift(<Badge color={color}>{statusText}</Badge>)
            
        return {
            id: d.id,
            plainId: d.plainId,
            title: d.title,
            tags: d.referenceParameters.tags,
            type: d.origin.title,
            progressSection: <div className="text-xs">{progressSection}</div>,
            started: d.processing?.flow?.started ? Temporal.Instant.from(d.processing.flow.started).toZonedDateTimeISO("UTC") : ""
        }
    })



    return (
    <div className="w-full h-full overflow-y-scroll px-4 py-4 max-w-7xl mx-auto space-y-6">
        <div className="w-full my-2 flex justify-end">
            <Button
                color="primary"
                onPress={()=>setShowNew(true)}
                startContent={
                    <Icon className="flex-none text-current" icon="lucide:plus" width={16} />
                }
                >
                Flow
            </Button>
        </div>
        <div className="w-full flex flex-col bg-white/60 rounded-xl shadow-md min-h-48 p-3">
            <Table
                enableCopy={false}
                page={0}
                pageItems={20}
                columns={[
                    {renderType: "numbered_title", title: "Id", width: 300},
                    {renderType: "pill", title: "Tags", width: 200, field: "tags"},
                    {field: "type", title: "Template", width: 200},
                    {renderType: "react", title: "Status", field: "progressSection", width: 200},
                    {renderType: "actions", title: "Actions", width: 120, actions: [
                        {title: "View", icon: <EyeIcon/>, action: (d)=>navigate(`/item/${d.id}`)},
                        {title: "Run", icon: <PlayIcon/>, action: (d)=>MainStore().doPrimitiveAction( d, "continue_flow_instance")},
                        {title: "Run", icon: <Cog8ToothIcon/>, action: (d)=>setEditFlowInstance(MainStore().primitive(d.id))},
                    ]},
                ]}
                data={flowInstanceInfo} 
                className='w-full min-h-[24em] max-h-inherit text-slate-700'
            />
        </div>
        <FlowInstanceEditor isOpen={editFlowInstance || showNew} flowInstance={editFlowInstance} onClose={()=>{setShowNew(false); setEditFlowInstance(undefined)}}/>
    </div> 
    )
}
