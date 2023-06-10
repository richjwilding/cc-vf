import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { PrimitiveCard} from "./PrimitiveCard";
import { PencilIcon, ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import GenericEditor from './GenericEditor';
import MainStore from "./MainStore";
import ConfirmationPopup from "./ConfirmationPopup";
import EditableTextField from "./EditableTextField";
import AIProcessButton from "./AIProcessButton";
import useDataEvent from "./CustomHook";

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
    useDataEvent("set_parameter set_field relationship_update", [primitive.id, primitive.primitives.uniqueAllIds].flat())
    let aiSummary = props.aiProcessSummary
    const ring = !props.disableHover
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
            className={
                [" py-3 pl-3 pr-4 group w-full  bg-white p-1 rounded-lg",
                    props.flatBorder ? '' : 'rounded-lg',
                    ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-${props.ringColor || 'slate'}-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
                    props.border ? "shadow border-[1px]" : '',
                ].join(" ")}
            >
        <Panel 
            key='panel'
            collapsable={true} 
            className='!mt-0 w-full'
            title={<div key='title' className="flex place-items-center w-full" >
                    <p>{primitive.title}</p>
                    {primitive.primitives.allCategory.length > 0 && 
                        <AIProcessButton 
                            active="mark_categories"
                            markOnProcess
                            primitive={primitive} 
                            process={async ()=>await MainStore().doPrimitiveAction(primitive.origin, "mark_categories", {source: primitive.id})}
                            />
                    }
                <div
                    key='edit' 
                    type="button"
                    onClick={(e)=>{e.stopPropagation();setEditPrompt(primitive)}}
                    className="flex ml-auto h-6 w-6 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <PencilIcon className="h-4 w-4" aria-hidden="true" />
                </div>
                    </div>}>
            {!props.showDetails && 
                primitive.primitives.allCategory.length > 0 && 
                        <div className='py-2 flex flex-wrap'>
                            {primitive.primitives.allCategory.map((category)=>{
                                return <CategoryCardPill key={category.plainId} primitive={category}/>

                            })}
                        </div>
            }
            {props.showDetails && 
                primitive.primitives.allCategory.length > 0 && 
                        <div className='py-2 flex flex-col grid' style={{gridTemplateColumns: '1fr 3fr'}}>
                            {primitive.primitives.allCategory.map((category)=>{
                                return <>
                                        <p className="text-gray-700 text-sm p-2 border-t border-gray-200">{category.title}</p>
                                        <div className="flex flex-col p-2 border-t border-gray-200">
                                            <div className="flex">
                                                <p className="grow text-gray-600 text-sm ">{category.referenceParameters.description || "None"}</p>

                                            <AIProcessButton 
                                                active="summarize"
                                                markOnProcess
                                                small
                                                primitive={category} 
                                                process={async ()=>MainStore().doPrimitiveAction(category, "summarize", {source: category.task.id})}
                                                />
                                            </div>
                                            <Panel 
                                                key='panel'
                                                collapsable={true} 
                                                className='w-fit'
                                                title={`${category.primitives.uniqueAllIds.length} items`}>
                                                <div className="flex flex-wrap w-full p-2 ">
                                                    {category.primitives.ref.uniqueAllItems.map((p)=>(
                                                        <PrimitiveCard imageOnly hideMenu primitive={p} className='m-0.5' onClick={()=>MainStore().sidebarSelect(p)}/> 
                                                    ))}
                                                </div>
                                            </Panel>
                                        </div>
                                     </>

                            })}
                        </div>
            }
        </Panel>
        <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </div>
        {editPrompt && <GenericEditor target={primitive.task} actions={primitive.task?.metadata?.actions ? primitive.task.metadata.actions.filter((d)=>d.key === "categorize") : undefined} set={(p)=>p.primitives.allCategory} listType='category_pill' options={MainStore().categories().filter((d)=>d.primitiveType === "category")} primitive={primitive} setOpen={()=>setEditPrompt(null)}/> }
        </>
    )
}
CategoryCard.Pill = CategoryCardPill