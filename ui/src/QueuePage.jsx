import { useEffect, useMemo, useState } from "react";
import MainStore from "./MainStore";
import { useParams } from "react-router-dom";
import { Accordion, AccordionItem } from "@heroui/react";

export function QueuePage({intervalSeconds = 5, ...props}){
    const {id} = useParams()
    const [workflowQueues, setWorkflowQueues] = useState()

    MainStore().loadActiveWorkspace( id)

    useEffect(() => {
        const id = setInterval(() => {

        fetch(`/api/queue/status`,{
            method: 'get',
            }).then(d=>d.json()).then(status=>{
                if( status?.success && status.result ){
                    const mainstore = MainStore()
                    const workflows = {}
                    const track = []
                    for( const item of status.result ){
                        const [workspaceId, queue] = item.queue.split("-")
                        workflows[workspaceId] ||= {
                            workspace: mainstore.workspace( workspaceId),
                            queues: {}
                        }
                        workflows[workspaceId].queues[queue] = {
                            name: queue,
                            jobs: []
                        }
                        const jobs = item.jobs ?? []
                        jobs.forEach( d =>{
                            const fullId = `bull:${item.queue}:${d.id}`
                            const out = {
                                fullId: fullId,
                                id: d.data.id,
                                field: d.data.field,
                                status: d.status,
                                primitive: mainstore.primitive(d.data.id),
                                children: Object.keys(d.children ?? {})
                            }
                            workflows[workspaceId].queues[queue].jobs.push(out)
                            track[fullId] = out

                        })
                    }
                    Object.values(track).forEach(d=>{
                        d.children = d.children.map(d=>{
                            const child = track[d]
                            if( child ){
                                child.isChild = true
                            }
                            return child
                        }).filter(Boolean)
                    })
                    setWorkflowQueues( workflows)
                }
        })

        }, intervalSeconds * 1000);

    return () => {
      clearInterval(id);
    };
  }, [intervalSeconds]); // reset if intervalSeconds changes



    console.log(workflowQueues)


   return <div className="flex flex-col space-y-4">
        <Accordion selectionMode="multiple" selectionBehavior="toggle">
        {Object.entries(workflowQueues ?? {}).map(([id, workflowInfo])=>{
            return <AccordionItem key={id} title={workflowInfo.workspace?.title ?? "Unknown project"} className="w-full rounded-lg px-3 py-1 bg-white shadow-sm border space-y-4">
                            <Accordion selectionMode="multiple" selectionBehavior="toggle" showDivider={false}>
                            {Object.entries(workflowInfo.queues ?? {}).map(([queueName, queueDetails])=>{
                                return <AccordionItem key={queueName} title={queueName} className="w-full rounded-lg px-3 py-1 bg-white shadow-sm border" classNames={{base: "my-3"}} >
                                            <div className="flex px-3">
                                                <div className="grid-cols-2 grid gap-1 text-sm w-full">
                                                    {(queueDetails.jobs ?? []).map(job=>{
                                                        return <>
                                                                <p>{job.primitive ? `${job.primitive.displayType} #${job.primitive.plainId} - ${job.primitive.title}` : job.id}</p>
                                                                <p>{job.status}</p>
                                                        </>                                                    
                                                    })}
                                                </div>
                                            </div>
                                        </AccordionItem>
                                })}
                            </Accordion>
                    </AccordionItem>
            })}
        </Accordion>
    </div>
}