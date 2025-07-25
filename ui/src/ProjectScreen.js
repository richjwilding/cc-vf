import { useEffect, useState } from "react"
import MainStore from "./MainStore"
import Panel from "./Panel"
import { PrimitiveCard } from "./PrimitiveCard"
import NewPrimitive from "./NewPrimitive"
import { useNavigate, useParams } from 'react-router-dom';
import useDataEvent from "./CustomHook"
import { Avatar, AvatarGroup, Button, Chip, Divider, ScrollShadow, Tab, Tabs, Tooltip } from "@heroui/react"
import { Icon } from "@iconify/react/dist/iconify.js"

export default function ProjectScreen(props){    
    const mainstore = MainStore()
    const navigate = useNavigate()        
    const [showNew, setShowNew] = useState(false)
    const {id} = useParams()
    
    if( mainstore.activeWorkspaceId !== id){
        (async ()=>{
            await mainstore.loadActiveWorkspace(id)
        })()
    }

    const filterForWorksapce = (array)=>{
        if( id === undefined ){
            return array
        }
        return array.filter((d)=>d.workspaceId === id)
    }

    useEffect(()=>{
        if( !MainStore().homescreenReady){
            console.log(`Need to load homescreen prims`)
            MainStore().loadHomeScreenPrimitives()
        }
    }, [MainStore().homescreenReady])
    
    const flows = filterForWorksapce(MainStore().primitives().filter((p)=>p.type==="flow"))
    const boards = filterForWorksapce(MainStore().primitives().filter((p)=>p.type==="board" || p.type==="working"))
    const activities = filterForWorksapce(MainStore().primitives().filter((p)=>p.isTask))
    const ventures = filterForWorksapce(MainStore().primitives().filter((p)=>p.type === 'venture' || p.type==="concept"))
    const handleCreate = (prim)=>{
        setShowNew(false)
        navigate(`/item/${prim.id}`)
    }
    useDataEvent('new_primitive delete_primitive',undefined)


    return (
    <>

        <div className="w-full h-screen overflow-y-scroll p-4">
        <>
            <Panel key='flows' titleButton={{title:"New board", action: ()=>setShowNew(['flow'])}} title='Flow templates' collapsable={true} count={flows.length} open={true} major='true' >
                <div className="w-full flex overflow-x-scroll">
                    <div className="w-fit flex gap-4 p-4">
                        {flows.map((p)=>{
                            return <PrimitiveCard.Hero primitive={p}/>
                        })}
                    </div>
                </div>
            </Panel>
            <Panel key='boards' titleButton={{title:"New board", action: ()=>setShowNew(['board','working'])}} title='Boards and analysis' collapsable={true} count={boards.length} open={true} major='true' >
                <div className="w-full flex overflow-x-scroll">
                    <div className="w-fit flex gap-4 p-4">
                        {boards.map((p)=>{
                            return <PrimitiveCard.Hero primitive={p}/>
                        })}
                    </div>
                </div>
            </Panel>
            <Panel key='activity' titleButton={{title:"New activity", action: ()=>setShowNew('activity')}} title='Activties' collapsable={true} count={activities.length} open={true} major='true' >
                <div className="w-full flex overflow-x-scroll">
                    <div className="w-fit flex gap-4 p-4">
                        {activities.map((p)=>{
                            return <PrimitiveCard.Hero primitive={p}/>
                        })}
                    </div>
                </div>
            </Panel>
            <Panel key='ventures' titleButton={{title:"New Venture", action: ()=>setShowNew(['venture','concept'])}} title='Ventures' collapsable={true} count={ventures.length} open={true} major='true' >
                <div className="w-full flex overflow-x-scroll">
                    <div className="w-fit flex gap-4 p-4">
                        {ventures.map((p)=>{
                            return <PrimitiveCard.Hero primitive={p}/>
                        })}
                    </div>
                </div>
            </Panel>
        </>
        </div>
        {showNew && <NewPrimitive title={showNew} type={showNew} done={(data)=>handleCreate(data)} cancel={()=>setShowNew(false)}/>}
    </> 
    )
}