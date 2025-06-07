import { useEffect, useState } from "react" 
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
import { ArrowDownTrayIcon, EyeIcon, SparklesIcon } from "@heroicons/react/24/outline"

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

    const flowInstanceInfo = flowInstances.map(d=>{
        const status = d.processing?.flow?.status ?? "not_started"
        const completedTime = status === "complete" && d.processing?.flow?.completed ? Temporal.Instant.from(d.processing.flow.completed).toZonedDateTimeISO("UTC").toPlainDate().toLocaleString("en-US", {
            day:   "numeric",
            month: "long",
            year:  "numeric"
          }) : "";
        const statusText = {
            "not_started": "Not Started",
            "running": "Running...",
            "complete": `Completed: ${completedTime}`,
        }[status]
        const color = {
            "not_started": "grey",
            "running": "blue",
            "complete": "green",
        }[status]
        return {
            id: d.id,
            plainId: d.plainId,
            title: d.title,
            type: d.origin.title,
            status: {text: statusText, color},
            started: d.processing?.flow?.started ? Temporal.Instant.from(d.processing.flow.started).toZonedDateTimeISO("UTC") : ""
        }
    })

    console.log(flowInstanceInfo)
    return (
    <div className="w-full h-full px-4 pb-4 max-w-7xl mx-auto space-y-6">
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
                    {renderType: "pill", title: "Status", field: "status", width: 120},
                    {renderType: "actions", title: "Actions", width: 120, actions: [
                        {title: "View", icon: EyeIcon, action: (d)=>navigate(`/item/${d.id}`)},
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