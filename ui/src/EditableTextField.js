  import React, { useEffect, useLayoutEffect } from 'react';
  import {Input} from '@headlessui/react'
import clsx from 'clsx';

  export default function EditableTextField ({item, ...props}){
    const [errors, setErrors] = React.useState(false)
    const editBox = React.useRef()
    const editing = React.useRef(false)

    const showPlaceholder = props.value === undefined ||props.value?.length === 0
    const showValue = (v)=>{
      if((typeof(v) !== "string" && v !== undefined && v !== null) || (v?.length > 0)){
        if( props.formatter){
          return props.formatter(v)
        }
        return v
      }
      return (props.default ?? props.placeholder ?? "Enter details")
    }

    useEffect(()=>{
      updateDisplay(props.value)
    },[props.primitiveId])

    const updateDisplay = (value)=>{
      value = value ?? props.value
      editBox.current.textContent = editing.current ? (value  ?? "") : showValue(value)  
    }

    const startEditing = ()=>{
      if( !editing.current ){
        editing.current = true
        console.log(`starting edit`, editing.current.textContent, props.value)
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
         // useTemp = true
        }
      }else{
        editing.current = false
        updateDisplay()
      }
        editing.current = false
      //updateDisplay(useTemp ? value : undefined)
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
      onClick={props.editable !== false ? startEditing : undefined}
      onFocus={props.editable !== false ? startEditing : undefined}
      key={props.key} 
      ref={editBox} 
      tabIndex={1}
      onKeyUp={props.editable !== false ? keyHandler : undefined}
      onBlur={props.editable !== false ? stopEditing : undefined}
      placeholder={props.placeholder ?? props.default}
      className={clsx([
            'place-items-center outline-none bg-white resize-none overflow-hidden',
            props.border && props.border === "hover" ? "border border-zinc-950/5 rounded-md hover:border-zinc-950/10 hover:shadow-sm" : "",
            props.border && props.border !== "hover" ? "border border-zinc-950/10 rounded-md shadow-sm" : "",
            !props.compact && !editing ? "p-1 min-h-[2em]" : "",
            props.fieldClassName || '',
            props.compact ? (props.border ? "py-1.5" : "py-0.5") : "px-1 py-1.5",
            props.fieldClassName && props.fieldClassName.search("text-") > -1 ? "" :props.secondary ? "text-gray-600" : "text-gray-800",
            showPlaceholder ? "italic text-gray-500" : "",
            props.editable && !editing ? props.clamp : "",
            props.editable && !editing && !errors ? "focus:bg-gray-50 focus:outline-none focus:ring-1  focus:ring-ccgreen-200" : "",
            props.editable && editing && !errors ? "px-1 focus:outline-none focus:ring-1  focus:ring-ccgreen-500" : "",
            props.editable && errors ? "px-1 bg-red-50 focus:outline-none focus:ring-1 focus:ring-amber-500" : ""

      ])}>  
          {showValue(props.value)}
      </div>
  }