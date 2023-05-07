import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { PrimitiveCard, Prompt } from "./PrimitiveCard";
import { PencilIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import GenericEditor from './GenericEditor';
import MainStore from "./MainStore";

export default function QuestionCard({primitive, ...props}){
    let aiSummary = props.aiProcessSummary
    const [editPrompt, setEditPrompt] = useState(null)
    if( !aiSummary ){
        const source = (props.relatedTo || primitive)
        if( source.analyzer ){
            aiSummary = source.analyzer().aiProcessSummary()
        }
    }
    return (
        <>
        <div 
            key={primitive.id}
            className=" py-3 pl-3 pr-4"
            >
        <div key='title' className="flex place-items-start justify-between group">
                <p>{primitive.title}</p>
            <div className="flex w-fit">
                <div
                    key='edit' 
                    type="button"
                    onClick={(e)=>{e.stopPropagation();setEditPrompt(primitive)}}
                    className="flex ml-2 h-6 w-6 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full ext-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <PencilIcon className="h-4 w-4" aria-hidden="true" />
                </div>
                {
                    aiSummary && aiSummary.byQuestion[primitive.id]?.length > 0 &&
                    <span className="grow-0 flex hover:bg-indigo-600 hover:text-white justify-end ml-2 px-1 py-0.5 rounded-md shrink-0 text-indigo-700 text-xs">
                        {aiSummary.byQuestion[primitive.id].length} Items
                    </span>
                }
            </div>
        </div>
        {
            primitive.primitives.allPrompt.length > 0 && 
            <div key='prompts' className="bg-gray-50 p-2 space-y-1 text-sm pl-2 my-1 text-gray-500 group">
                <Panel 
                    key='prompt_panel'
                    collapsable={true} 
                    className='mt-0'
                    title={<div key='ai_title' className="font-semibold flex place-items-center">
                            <FontAwesomeIcon icon="fa-solid fa-robot" className="mr-1"/>Question will be processed by AI
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
                        const processed =  aiSummary ? aiSummary.processed[prompt.id] : undefined
                        const unprocessed =  aiSummary ? aiSummary.unprocessed[prompt.id] : undefined
                        const count = aiSummary ? aiSummary.byPrompt[prompt.id]?.length : undefined
                        return <Prompt key={prompt.id} primitive={prompt} processed={processed} unprocessed={unprocessed} itemCount={count}/>

                    })}
                    </div>
                </Panel>
            </div>
        }
        <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </div>
        {editPrompt && <GenericEditor set={(p)=>p.primitives.allPrompt} options={[13,14].map((d)=>MainStore().category(d))} primitive={primitive} setOpen={()=>setEditPrompt(null)}/> }
        </>
    )
}