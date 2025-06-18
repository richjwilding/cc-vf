import { useEffect, useReducer, useState } from "react" 
import MainStore from "./MainStore"
import Panel from "./Panel"
import { PrimitiveCard } from "./PrimitiveCard"
import NewPrimitive from "./NewPrimitive"
import { useNavigate } from 'react-router-dom';
import useDataEvent from "./CustomHook"
import WorkflowCard from "./WorkflowCard"
import { FlowInstanceInfo } from "./FlowInstanceInfo"
import { Table } from "./Table"
import { Temporal } from "@js-temporal/polyfill"
import { ArrowDownTrayIcon, EyeIcon, PlayIcon, SparklesIcon } from "@heroicons/react/24/outline"
import { Badge } from "./@components/badge"

export default function WorkflowDashboard(props){
    const navigate = useNavigate()        
    const [showNew, setShowNew] = useState(false)
    props.setWidePage(false)

    MainStore().loadActiveWorkspace( props.workspaceId )


    const filterForWorksapce = (array)=>{
        if( props.workspace === undefined ){
            return array
        }
        return array.filter((d)=>d.workspaceId === props.workspace.id)
    }

    useEffect(()=>{
        if( !MainStore().homescreenReady){
            console.log(`Need to load homescreen prims`)
            MainStore().loadHomeScreenPrimitives()
        }
    }, [MainStore().homescreenReady])
    
    const workflows = filterForWorksapce(MainStore().primitives().filter((p)=>p.type==="flow" && !p.inFlow))
    const handleCreate = (prim)=>{
        setShowNew(false)
        navigate(`/item/${prim.id}`)
    }
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
                        progressStatus.push([d, v.progress])
                        added = true
                    }else if( v.message && d.processing.flow?.status === "running"){
                        progressStatus.push([d, v.message])
                        added = true
                    }
                }
                if( !added ){
                    if( d.processing?.flow?.status === "running"){
                        progressStatus.push([d, "In progress"])
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
            type: d.origin.title,
            progressSection: <div className="text-xs">{progressSection}</div>,
            started: d.processing?.flow?.started ? Temporal.Instant.from(d.processing.flow.started).toZonedDateTimeISO("UTC") : ""
        }
    })

    console.log(flowInstanceInfo)
    return (
    <div className="w-full h-full overflow-y-scroll px-4 pb-4 max-w-7xl mx-auto space-y-6">
        <Panel key='boards' icon={SparklesIcon} title='Create new flow' collapsable={true} count={workflows.length} open={true} major='true' className='w-full rounded-xl bg-white/60 p-4 shadow-md'>
            <div className="w-full flex overflow-x-scroll">
                <div className="w-fit flex gap-4 p-4">
                    {workflows.map((p)=>{
                        return <WorkflowCard primitive={p} onClick={()=>alert("new")}/>
                    })}
                </div>
            </div>
        </Panel>
        <div className="w-full flex flex-col bg-white/60 rounded-xl shadow-md min-h-48 p-3">
            <Table
                enableCopy={false}
                page={0}
                pageItems={20}
                columns={[
                    {renderType: "numbered_title", title: "Id", width: 200},
                    {field: "type", title: "Type", width: 200},
                    {renderType: "date", title: "Started", width: 160, field: "started"},
                    {renderType: "react", title: "Status", field: "progressSection", width: 200},
                    {renderType: "actions", title: "Actions", width: 120, actions: [
                        {title: "View", icon: EyeIcon, action: (d)=>navigate(`/item/${d.id}`)},
                        {title: "Run", icon: PlayIcon, action: (d)=>MainStore().doPrimitiveAction( d, "continue_flow_instance")},
                      //  {title: "Download", icon: ArrowDownTrayIcon, action: (d)=>alert(d)}
                    ]},
                ]}
                data={flowInstanceInfo} 
                className='w-full min-h-[24em] max-h-inherit text-slate-700'
            />
        </div>
    </div> 
    )
}