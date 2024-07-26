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

  const handleRemove = async ()=>{
    await MainStore().removePrimitive( primitive )
    setConfirmRemove(false)
  }
  const updateItem = (d )=>{
    const [title, description] = d.split(":")
    primitive.title = title.trim()
    primitive.setParameter("description", description?.trim() ?? "", false, true)
    return true
  }

    return (<>
        <div key={primitive.plainId} className={`${props.editable ? "w-full" : 'w-fit'} flex place-items-center mt-2 mr-2 justify-between group`}>
            <div key='title' className={`flex group place-items-center px-1.5 text-xs py-0.5 ${primitive.referenceParameters.bgcolor || "bg-white"} rounded-lg border w-fit nowrap ${primitive.title ? "" : "italic text-gray-400 bg-gray-100" }`}>
                          {props.editable
                            ?  <EditableTextField 
                                callback={updateItem}
                                editable
                                value = {primitive.referenceParameters.description?.length > 0 ? `${primitive.title}: ${primitive.referenceParameters.description}` : primitive.title}
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
    const ring = !props.disableHover
    const [editPrompt, setEditPrompt] = useState(null)
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
            editButton={(e)=>{e.stopPropagation();setEditPrompt(primitive)}}
            title={<div key='title' className="flex place-items-center w-full" >
                    <p>{primitive.title}</p>
                    {primitive.primitives.allCategory.length > 0 && 
                        <AIProcessButton 
                            active="mark_categories"
                            markOnProcess
                            primitive={primitive} 
                            process={async ()=>{
                                await MainStore().doPrimitiveAction(primitive.origin, "mark_categories", {source: primitive.id, scope: props.scope})
                            }}
                            />
                    }
                    </div>}>
            { 
                primitive.primitives.allCategory.length > 0 && 
                        <div className='py-2 flex flex-wrap'>
                            {primitive.primitives.allCategory.map((category)=>{
                                return <CategoryCardPill key={category.plainId} primitive={category}/>

                            })}
                        </div>
            }
        </Panel>
        <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </div>
        {editPrompt && <GenericEditor target={primitive.origin} set={(p)=>p.primitives.allCategory} listType='category_pill' options={MainStore().categories().filter((d)=>[32].includes(d.id))} primitive={primitive} setOpen={()=>setEditPrompt(null)}/> }
        </>
    )
}
CategoryCard.Pill = CategoryCardPill