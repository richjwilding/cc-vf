import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PrimitiveCard } from "./PrimitiveCard";
import { PencilIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";

export default function QuestionCard({primitive, ...props}){
    let evidenceList = [primitive.primitives.allEvidence, primitive.primitives.allPrompt.map((d)=>d.primitives.allEvidence).flat()].flat()
    let aiSummary = props.aiProcessSummary
    if( props.relatedTo && props.relatedTo.id !== primitive.id){
        evidenceList = evidenceList.filter((p)=>p.parentRelationship(props.relatedTo) !== undefined )
        if( !aiSummary ){
            aiSummary = props.relatedTo.analyzer().aiProcessSummary()
        }
    }
    return (
        <div 
            key={primitive.id}
            className=" py-3 pl-3 pr-4"
            >
        <div key='title' className="flex place-items-start justify-between">
            <p>{primitive.title}</p>
            {
                aiSummary && aiSummary.byQuestion[primitive.id]?.length > 0 &&
                <span className="flex hover:bg-indigo-600 hover:text-white justify-end ml-2 px-1 py-0.5 rounded-md shrink-0 text-indigo-700 text-xs">
                    {aiSummary.byQuestion[primitive.id].length} Items
                </span>
            }
        </div>
        {
            primitive.primitives.allPrompt.length > 0 && 
            <div key='prompts' className="bg-gray-50 p-2 space-y-1 text-sm pl-2 my-1 text-gray-500 group">
                <Panel 
                    key='prompt_panel'
                    collapsable={true} 
                    className='mt-0'
                    title={<div key='ai_title' className="font-semibold flex ">
                            <FontAwesomeIcon icon="fa-solid fa-robot" className="mr-1"/>Question will be processed by AI
                            <div
                                key='edit' 
                                type="button"
                                onClick={(e)=>{e.stopPropagation();console.log(primitive.id)}}
                                className="flex ml-2 h-6 w-6 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full ext-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <PencilIcon className="h-4 w-4" aria-hidden="true" />
                            </div>
                            {props.relatedTo && 
                                <div
                                    key='reprocess' 
                                    type="button"
                                    onClick={(e)=>{e.stopPropagation();props.relatedTo.analyzer().analyzeQuestions(true, [primitive])}}
                                    className="flex ml-2 h-6 w-6 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full ext-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                                </div>}

                            </div>}>
                
                    <div key='prompts' className='flex flex-col pl-1 space-y-2'>
                    {primitive.primitives.allPrompt.map((prompt)=>{
                        const processed =  aiSummary ? aiSummary.processed.includes(prompt.id) : undefined
                        const count = aiSummary ? aiSummary.byPrompt[prompt.id]?.length : undefined
                        const promptDescription = ()=>{
                            if( prompt.metadata ){
                                    return <div key={prompt.id} className='w-full flex place-items-center mt-2'>
                                                <div key='summary' className="flex text-xs flex-0">
                                                    <p className={`p-1 bg-gray-200 ${prompt.title ? "rounded-l-md" : "rounded-md"} border border-gray-300`}> 
                                                        {prompt.metadata.summary}
                                                    </p>
                                                    {prompt.title && 
                                                        <p className="p-1 bg-white rounded-r-md border border-gray-300"> 
                                                            {prompt.title}
                                                        </p>
                                                    }
                                                </div>
                                                <div key='status' className={`ml-auto w-3 h-3 rounded-full border ${processed ? "bg-green-600" : 'bg-amber-300'}`}/>
                                                {(count > 0) && <p key='count' className="flex hover:bg-indigo-600 hover:text-white justify-end ml-0.5 px-1 py-0.5 rounded-md shrink-0 text-indigo-700 text-xs">{count} items</p>}
                                            </div>
                            }
                            return prompt.title
                        }

                        return promptDescription()
                    })}
                    </div>
                </Panel>
            </div>
        }
        <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </div>
    )
}