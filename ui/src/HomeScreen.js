import MainStore from "./MainStore"
import Panel from "./Panel"
import { PrimitiveCard } from "./PrimitiveCard"

export default function HomeScreen(props){
    const activities = [4449,99571]

    return (
        <div className="w-full h-screen p-4">
            <Panel key='activity' title='Activties' collapsable={true} count={activities.length} open={true} major='true' >
                <div className="w-full flex overflow-x-scroll">
                    <div className="w-fit flex gap-4 p-4">
                        {activities.map((id)=>{
                            const primitive = MainStore().primitive( id )
                            return <PrimitiveCard.Hero primitive={primitive}/>
                        })}
                    </div>
                </div>
            </Panel>
        </div>
    )
}