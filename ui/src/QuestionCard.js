import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useReducer, useState } from "react";
import { PrimitiveCard, Prompt } from "./PrimitiveCard";
import { PencilIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import GenericEditor from './GenericEditor';
import MainStore from "./MainStore";
import useDataEvent from "./CustomHook";
import AIProcessButton from "./AIProcessButton";

export default function QuestionCard({primitive, ...props}){
    const [eventRelationships, updateRelationships] = useReducer( (x)=>x+1, 0)
    useDataEvent('relationship_update', [primitive.id, primitive.primitives.allPrompt.map((d)=>d.id)].flat(), updateRelationships)
    const [editPrompt, setEditPrompt] = useState(null)

    //let aiSummary = props.aiProcessSummary
    
    const aiSummary = undefined/*useMemo(()=>{
        const source = (props.relatedTo || primitive)
        if( source ){
            if( source.analyzer ){
                const refresh = MainStore().primitive( source.id )
                return refresh.analyzer().aiProcessSummary()
            }
        }
    }, [eventRelationships])*/


    const goButton = (p)=>{
        let action
        const task = p.task
        let exec

        if( p.isTask ){
            action = p.metadata?.actions?.filter(d=>(d.key === "cascade" || d.command === "cascade") && d.cascadeKey?.includes("questions"))
            console.log(`Got ${action.length} candidate(s)`)
            if( action ){
                action = action[0]
            }
            exec = (options)=>MainStore().doPrimitiveAction(p, "process_questions_on_main", {...options, questionIds: [primitive.id]})
        }else{
            action = p.metadata?.actions?.filter(d=>(d.key === "questions" || d.command === "questions"))
            exec = (options)=>MainStore().doPrimitiveDocumentQuestionsAnalysis(p, {...options, questionIds: [primitive.id]})
        }
        if( action.actionFields){
                MainStore().globalInputPopup({
                  primitive: primitive,
                  fields: action.actionFields,
                  confirm: async (inputs)=>exec(inputs),
                })
        }else{
            exec({})
        }
        //process_questions_on_main
    }

    
    return (
        <>
        <div 
            key={primitive.id}
            className=" py-3 pl-3 pr-4"
            onClick={props.onClick ? (e)=>props.onClick(e,primitive) : undefined }
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
                    className='!mt-0'
                    title={<div key='ai_title' className="font-semibold flex place-items-center">
                            <FontAwesomeIcon icon="fa-solid fa-robot" className="mr-1"/>Question will be processed by AI
                            {false && props.relatedTo && <AIProcessButton showDelete={primitive} small subset={primitive.id} active="document_questions" primitive={props.relatedTo} process={(p)=>p.isTask ? MainStore().doPrimitiveAction(p, "process_questions_on_main", {forceCascade: true, questionIds: [primitive.id]}) : MainStore().doPrimitiveDocumentQuestionsAnalysis(p,[primitive.id])}/>}
                            {props.relatedTo && <AIProcessButton showDelete={primitive} small subset={primitive.id} active="document_questions" primitive={props.relatedTo} process={goButton}/>}

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
        {editPrompt && <GenericEditor set={(p)=>p.primitives.allPrompt} options={(props.promptCategories || []).map((d)=>MainStore().category(d))} primitive={primitive} setOpen={()=>setEditPrompt(null)}/> }
        </>
    )
}