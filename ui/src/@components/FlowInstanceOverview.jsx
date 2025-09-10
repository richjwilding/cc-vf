import { ArrowPathIcon } from "@heroicons/react/24/outline"
import MainStore from "../MainStore"
import { IconButton } from "./IconButton"
import { useState } from "react"
import { useEffect } from "react"
import PrimitiveConfig from "../PrimitiveConfig"
import { Progress } from "@heroui/react"

export function FlowInstanceOverview({primitive, status,...props}){
    const flowInstance = primitive.findParentPrimitives({type: ["flowinstance"]})[0]
    const [progress, setProgress] = useState()

    useEffect(()=>{
        if( status === "Completed"){
            setProgress()
            return
        }
        if( primitive?.type === "flowinstance" ){
            primitive.instanceStatus.then(d=>{
                const {nodes, edges, visibleIds} = PrimitiveConfig.flowInstanceStatusToMap( d, {showHidden: false, showSkipped: false, groupByLabels: true})
                const status = nodes.filter(d=>!d.skipped).map(d=>d.status())
                const completed = status.filter(d=>d === "complete")
                setProgress({total: status.length, completed: completed.length})
            })
        }
    }, [primitive?.id, status])
    
    return <>
                  <div className='w-full flex space-x-2 place-items-center'>
                    <span className='text-sm font-semibold'>{primitive.title}</span>
                    <div className="flex grow justify-end">
                        {progress &&  <Progress classNames="w-full" aria-label="Running..." className="max-w-md" value={progress.completed / progress.total * 100} />}
                    </div>
                    <div className="flex space-x-2 shrink grow-0">
                        {status === "Completed" && <IconButton onClick={()=>{
                            MainStore().doPrimitiveAction(flowInstance,"run_subflow", {subFlowId: primitive.origin.id})
                        }}><ArrowPathIcon className="w-5"/></IconButton>}
                        <p className='text-sm'>{status}</p>
                    </div>
                </div>                  
    </>
}