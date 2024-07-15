  import React, { useEffect, useLayoutEffect } from 'react';
  import {Input} from '@headlessui/react'
import clsx from 'clsx';

  export default function EditableTextField ({item, ...props}){
    const [errors, setErrors] = React.useState(false)
    const editBox = React.useRef()
    const editing = React.useRef(false)

    const showPlaceholder = props.value === undefined ||props.value?.length === 0


    const updateDisplay = (value)=>{
      value = value ?? props.value
      editBox.current.textContent = editing.current ? (value  ?? ""): value?.length > 0 ? value :  (props.default ?? props.placeholder ?? "Enter details")
    }

    const startEditing = ()=>{
      if( !editing.current ){
        editing.current = true
        editBox.current.textContent = props.value ?? ""
      }
    }

    const stopEditing = ()=>{
      let useTemp = false
      const value = editBox.current.textContent.trim()
      if( value !== (props.value ?? "") ){
        if( props.callback ){
          if( !props.callback( value ) ){
            editBox.current.focus()
            setErrors(true)
            return
          }
          useTemp = true
        }
      }      
      editing.current = false
      updateDisplay(useTemp ? value : undefined)
    }

    const keyHandler = (e)=>{
      e.stopPropagation()

        if(e.key === "Enter"){
          if( props.submitOnEnter ){
            e.preventDefault()
            stopEditing()
            return
          }        
        }
        if( e.key === "Escape"){
          e.stopPropagation();
          e.preventDefault();
          cancelEdit()
          return
        }
    }

    const cancelEdit = ()=>{
      editing.current = false
      const sel = window.getSelection();
      sel.removeAllRanges();
      updateDisplay()
    }
    


    return  <div 
      contentEditable={props.editable !== false}
      suppressContentEditableWarning={true}
      onClick={props.editable ? startEditing : undefined}
      onFocus={props.editable ? startEditing : undefined}
      key={props.key} 
      ref={editBox} 
      tabIndex={1}
      onKeyUp={props.editable ? keyHandler : undefined}
      onBlur={props.editable ? stopEditing : undefined}
      placeholder={props.placeholder ?? props.default}
      className={clsx([
            'place-items-center outline-none bg-white resize-none overflow-hidden',
            props.border ? "border border-zinc-950/10 rounded-md shadow-sm" : "",
            !props.compact && !editing ? "p-1 min-h-[2em]" : "",
            props.fieldClassName || '',
            props.compact ? "py-1.5" : "px-1 py-1.5",
            props.fieldClassName && props.fieldClassName.search("text-") > -1 ? "" :props.secondary ? "text-gray-400" : "text-gray-800",
            showPlaceholder ? "italic text-gray-500" : "",
            props.editable && !editing ? props.clamp : "",
            props.editable && !editing && !errors ? "focus:bg-gray-50 focus:outline-none focus:ring-1  focus:ring-ccgreen-200" : "",
            props.editable && editing && !errors ? "px-1 focus:outline-none focus:ring-1  focus:ring-ccgreen-500" : "",
            props.editable && errors ? "px-1 bg-red-50 focus:outline-none focus:ring-1 focus:ring-amber-500" : ""

      ])}>  
          {props.value?.length > 0 ? props.value :  (props.default ?? props.placeholder ?? "Enter details")}
      </div>
  }