import { useEffect, useState } from "react"
import MainStore from "./MainStore"
import Panel from "./Panel"
import { PrimitiveCard } from "./PrimitiveCard"
import NewPrimitive from "./NewPrimitive"
import { useNavigate } from 'react-router-dom';
import useDataEvent from "./CustomHook"
import { Avatar, AvatarGroup, Button, Chip, Divider, ScrollShadow, Tab, Tabs, Tooltip } from "@heroui/react"
import { Icon } from "@iconify/react/dist/iconify.js"
import WorkspaceCard from "./WorkspaceCard"

export default function HomeScreen(props){
    const mainstore = MainStore()
    const navigate = useNavigate()        
    const [showNew, setShowNew] = useState(false)

    const filterForWorksapce = (array)=>{
        if( props.workspace === undefined ){
            return array
        }
        return array.filter((d)=>d.workspaceId === props.workspace)
    }

    useEffect(()=>{
        if( !MainStore().homescreenReady){
            console.log(`Need to load homescreen prims`)
            MainStore().loadHomeScreenPrimitives()
        }
    }, [MainStore().homescreenReady])
    
    const boards = filterForWorksapce(MainStore().primitives().filter((p)=>p.type==="board" || p.type==="working"))
    const activities = filterForWorksapce(MainStore().primitives().filter((p)=>p.isTask))
    const ventures = filterForWorksapce(MainStore().primitives().filter((p)=>p.type === 'venture' || p.type==="concept"))
    const handleCreate = (prim)=>{
        setShowNew(false)
        navigate(`/item/${prim.id}`)
    }
    useDataEvent('new_primitive delete_primitive',undefined)


    const projects = mainstore.activeUser.info.workspaces.map(d=>mainstore.workspace(d)) ?? []

    const projectTabs = [
        {key:"draft", title: "Draft", count: projects.filter(d=>d.status === "draft").length},
        {key:"active", title: "Active", count: projects.filter(d=>d.status === "active" || d.status === undefined).length},
        {key:"complete", title: "Complete", count: projects.filter(d=>d.status === "complete").length}
    ]

    return (<>

        <div className="w-full h-screen p-4 flex flex-col">
            <div className="w-full py-4 px-4 lg:px-8 grow-0 shrink-0">
                <header className="mb-6 flex w-full items-center justify-between">
                    <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-default-900 lg:text-3xl">Projects</h1>
                    <p className="text-small text-default-400 lg:text-medium">Existing projects</p>
                    </div>
                    <Button
                    color="primary"
                    startContent={
                        <Icon className="flex-none text-current" icon="lucide:plus" width={16} />
                    }
                    >
                        Projects
                    </Button>
                </header>
                    <Tabs
                        aria-label="Navigation Tabs"
                        classNames={{
                            cursor: "bg-default-200 shadow-none",
                        }}
                        radius="full"
                        variant="light"
                    >
                        {projectTabs.map(d=><Tab key={d.key} title={d.count ? <div className="flex items-center gap-2"><p>{d.title}</p><Chip size='sm'>{d.count}</Chip></div> : d.title}/>)}
                    </Tabs>
            </div>
            <ScrollShadow
                hideScrollBar
                className="-mx-2 flex w-full grow"
            >
                <div className="flex flex-wrap ">
                    {projects.slice(0,30).map(d=><WorkspaceCard workspace={d}/>)}
                </div>
            </ScrollShadow>
        </div>
    </> )
}