import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { PrimitiveCard} from "./PrimitiveCard";
import { PencilIcon, ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import GenericEditor from './GenericEditor';
import MainStore from "./MainStore";
import ConfirmationPopup from "./ConfirmationPopup";
import EditableTextField from "./EditableTextField";

export function CategoryCardPill({primitive, ...props}){
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [editing, setEditing] = useState(false)

  const handleRemove = async ()=>{
    await MainStore().removePrimitive( primitive )
    setConfirmRemove(false)
  }
  const updateTitle = (newTitle )=>{
    primitive.title = newTitle
    return true
  }

    return (<>
        <div key={primitive.plainId} className={`${props.editable ? "w-full" : 'w-fit'} flex place-items-center mt-2 mr-2 justify-between group`}>
            <div key='title' className={`flex group place-items-center px-1.5 text-xs py-0.5 ${primitive.referenceParameters.bgcolor || "bg-ccblue-50"} rounded-lg border w-fit nowrap ${primitive.title ? "" : "italic text-gray-400 bg-gray-100" }`}>
                          {props.editable
                            ?  <EditableTextField 
                                callback={updateTitle}
                                editable={props.showEdit ? ()=> setEditing( true ) : undefined}
                                stopEditing={()=>setEditing(false)}
                                editing={editing}
                                value = {primitive.title}
                                default='<Add category>'
                                className='w-full'
                                compact={true}
                                submitOnEnter={true}
                                fieldClassName={`${(primitive.title || "").search(/\s/) == -1 ? "break-all" : "break-word"} grow text-md text-slate-700`}>
                              </EditableTextField>
                            : primitive.title || "Unspecified"
                            }
            </div>
            {props.editable && 
              <div className='flex space-x-2 invisible group-hover:visible -my-1'>
                <div
                    key='edit' 
                    type="button"
                        onClick={(e)=>{e.stopPropagation();setEditing(!editing)}}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <PencilIcon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div
                    key='trash' 
                    type="button"
                    onClick={(e)=>{e.stopPropagation();setConfirmRemove(true)}}
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <TrashIcon className="h-4 w-4" aria-hidden="true" />
                </div>
            </div>}
        </div>
        {confirmRemove && <ConfirmationPopup title="Confirm deletion" confirm={handleRemove} message={'Are you sure you want to delete this Category?'} cancel={()=>setConfirmRemove(false)}/>}
        </>
        )
}

export default function CategoryCard({primitive, ...props}){
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
            className=" py-3 pl-3 pr-4 group"
            >
        <Panel 
            key='panel'
            collapsable={true} 
            className='mt-0 w-full'
            title={<div key='title' className="flex place-items-center w-full" >
                    <p>{primitive.title}</p>
                    {primitive.primitives.allCategory.length > 0 && 
                        <div
                            key='reprocess' 
                            type="button"
                            onClick={async (e)=>{e.stopPropagation(); console.log(await MainStore().doPrimitiveAction(primitive.origin, "mark_categories", {source: primitive.id}))}}
                            className="flex ml-2 h-6 w-6 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full ext-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                        </div>}

                <div
                    key='edit' 
                    type="button"
                    onClick={(e)=>{e.stopPropagation();setEditPrompt(primitive)}}
                    className="flex ml-auto h-6 w-6 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <PencilIcon className="h-4 w-4" aria-hidden="true" />
                </div>
                    </div>}>
            {
                primitive.primitives.allCategory.length > 0 && 
                        <div className='py-2 flex flex-wrap'>
                            {primitive.primitives.allCategory.map((category)=>{
                                //const processed =  aiSummary ? aiSummary.processed[prompt.id] : undefined
                                //const unprocessed =  aiSummary ? aiSummary.unprocessed[prompt.id] : undefined
                                //const count = aiSummary ? aiSummary.byPrompt[prompt.id]?.length : undefined
                                return <CategoryCardPill key={category.plainId} primitive={category}/>

                            })}
                        </div>
            }
        </Panel>
        <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </div>
        {editPrompt && <GenericEditor target={primitive.origin} actions={primitive.origin?.metadata?.actions ? primitive.origin.metadata.actions.filter((d)=>d.key === "categorize") : undefined} set={(p)=>p.primitives.allCategory} listType='category_pill' options={MainStore().categories().filter((d)=>d.primitiveType === "category")} primitive={primitive} setOpen={()=>setEditPrompt(null)}/> }
        </>
    )
}
CategoryCard.Pill = CategoryCardPill