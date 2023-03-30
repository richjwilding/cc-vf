import React, { useState } from 'react'
import MainStore from './MainStore';
import GoogleHelper from './GoogleHelper';
import {
    DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'


export default function EditableResourceField ({...props}){
    const tempLoading = "Loading..."
    const [open, setOpen] = React.useState(false)
    const [title, setTitle] = useState(tempLoading)
    const [value, setValue] = useState(props.value)
    const [editing, setEditing] = React.useState(props.editing)
    const field = React.useRef()

    const stopEdit = ()=>props.stopEditing(field?.current) || (()=>setEditing(false))

    const blur = (e)=>{
        if( e.target.contains(e.relatedTarget)){
            return
        }
        if(e.target !== field.current){return}
        //if(e.target.type !== 'button'){return}
        if( !open ){
            stopEdit()
        }
    }
    const mainKeyHandler = (e)=>{
        if(!editing ){
            e.preventDefault()
            e.stopPropagation()
            return
        }
        if(["ArrowUp", "ArrowDown"].includes(e.key) ){
            e.preventDefault()
            e.stopPropagation()
            return
        }
        if( e.key === "Escape"){
            e.stopPropagation()
            setValue( props.value )
            field.current.blur()
            return
        }
        if( e.key === "Backspace"){
            if( value ){
                setValue( undefined )
            }
        }
        if( e.key === "Enter"){
            e.preventDefault()
            e.stopPropagation()
            props.onSelect( value ? {type: "google_drive", id: value.id} : undefined)
            field.current.blur()
            return
        }
    }
    const pickGoogleDocument = ()=>{
        GoogleHelper().showPicker({}, (items)=>{
            if( items ){
                const item = items[0]
                setValue({type: "google_drive", id: item.id, mimeType: item.mimeType, name: item.name})
                setTitle(item.name)
                field.current.focus()
            }
        })
    }

    const clearValue = ()=>{
        setValue(undefined)
    }

    React.useEffect(()=>{
        const localEditing = props.editing === undefined ? editing : props.editing 
        if( editing !== localEditing){
            setEditing(localEditing)
        }
        if( localEditing ){
            field.current.focus()
        }
    }, [props.editing, editing])

    React.useEffect(()=>{
        if( value && value.type === "google_drive" ){
            if( title === tempLoading ){
                const wrap = async function(){
                    setTitle( (await GoogleHelper().getFileInfo( props.value.id )).name )
                }
                wrap()
            }
        }else{
            setTitle("Link")
        }
    },[value])

            return ( <div 
                        ref={field}
                        onBlur={blur}
                        onKeyDown={mainKeyHandler}
                        tabIndex={editing ? "1" : "-1"}
                        className={[
                            editing ? '' : 'pointer-events-none', 
                            'flex w-full justify-end pt-0.5 pb-0.5 ',
                            editing ? "bg-gray-50 ring-1 ring-blue-500 pr-1" : ""
                        ].join(' ')}
                        >
                        {value ? 
                        <div 
                            className={`flex ${props.editing ? "border-gray-200" :"border-transparent"} border-2 bg-white px-1 p-px mb-0.5 rounded-2xl ml-1 place-items-center`}
                            >
                            <a href={props.value} target="_blank" className="rounded-full hover:opacity-75 text-blue-500 hover:text-blue-600 hover:bg-gray-200">
                                <DocumentTextIcon className='w-5 h-5 p-0.5'/>
                            </a>
                            <p title={title} className={`ml-0.5 text-gray-700 text-md max-w-[12em] truncate pr-1`}>{title}</p>
                            { editing && 
                            <p
                                onClick={clearValue}
                                className={`flex w-6 h-6 border-[4px] rounded-2xl w-3 h-3 place-items-center justify-center bg-gray-200 border-white hover:bg-gray-400 hover:text-white`}
                            >
                                <XMarkIcon className='w-3 h-3' strokeWidth={3}/>
                            </p>
                            }
                        </div>
                        :
                           (editing ? 
                                <button
                                    type="button"
                                    className="my-1 rounded bg-white py-1 px-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                    onClick={pickGoogleDocument}
                                >
                                    Google Drive Document
                                </button> 
                            :
                            <p className='text-gray-500 mr-1 '>None</p>)
                        }
                    </div> );

}