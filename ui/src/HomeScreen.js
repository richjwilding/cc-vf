import { useState } from "react"
import MainStore from "./MainStore"
import Panel from "./Panel"
import { PrimitiveCard } from "./PrimitiveCard"
import NewPrimitive from "./NewPrimitive"
import { useNavigate } from 'react-router-dom';
import useDataEvent from "./CustomHook"

export default function HomeScreen(props){
    const navigate = useNavigate()        
    const [showNew, setShowNew] = useState(false)

    const filterForWorksapce = (array)=>{
        if( props.workspace === undefined ){
            return array
        }
        return array.filter((d)=>d.workspaceId === props.workspace.id)
    }
    
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
        </div>
        {showNew && <NewPrimitive title={showNew} type={showNew} done={(data)=>handleCreate(data)} cancel={()=>setShowNew(false)}/>}
    </> 
    )
}