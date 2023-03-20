    import React, { useEffect } from 'react';
  export default function EditableTextField ({item, ...props}){
    const [editing, setEditing] = React.useState(props.editing)
    const editBox = React.useRef()
    const editAny = React.useRef()
    const editOld = React.useRef()
    const parentRow = React.useRef()
    const [errors, setErrors] = React.useState(false)

    React.useEffect(()=>{
        const localEditing = props.editing === undefined ? editing : props.editing 
        if( editBox.current && localEditing){
            editBox.current.focus()

            const range = document.createRange();
            range.selectNodeContents(editBox.current );
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            editAny.current = false
            editOld.current = editBox.current.textContent.trim()
        }
        if( editing !== localEditing){
            setEditing(localEditing)
        }
    }, [props.editing, editing])

    const stopEdit = props.stopEditing 
      ? ()=>{
            const sel = window.getSelection();
            sel.removeAllRanges();
        props.stopEditing(editBox.current)
      }
      : (()=>setEditing(false))
    const cancelEdit = ()=>{
        const sel = window.getSelection();
        sel.removeAllRanges();
        editBox.current.textContent = editOld.current
        stopEdit()
    }

    const keyHandler = (e)=>{
      e.stopPropagation()
      if(e.key === "Enter"){
        if( !editAny.current ){
          e.preventDefault()
          cancelEdit()
          return
        }
        if( props.submitOnEnter ){
          e.preventDefault()
          if( props.stopEditing ){
            props.stopEditing(editBox.current)
          }else{
            e.currentTarget.blur()
          }
          return
        }        
      }
      if( e.key === "Escape"){
        e.stopPropagation();
        e.preventDefault();
        cancelEdit()
        return
      }

      editAny.current = true

    }
    const toggleEditing = ()=>{
      if( editing ){
        let newText = editBox.current.textContent.trim()
        console.log(editOld.current, newText)
        if( editOld.current !== newText ){
          if( props.callback ){
            if( !props.callback( newText ) ){
              editBox.current.focus()
              setErrors(true)
              return
            }
          }
        }      
        stopEdit()
      }else{
        setEditing(true)
      }
    }

    return (
        <>
        <div
          ref={editBox} 
          contentEditable={editing}
          onDoubleClick={props.editable}
          onKeyDown={editing ? keyHandler : undefined}
          onBlur={editing ? toggleEditing : undefined}
          tabIndex={editing ? 1 : -1}
          suppressContentEditableWarning={true}
          className={[
            'place-items-center outline-none',
            !props.compact && !editing ? "p-1 min-h-[2em]" : "",
            props.fieldClassName || '',
            props.compact ? "" : "px-1 py-1",
            props.secondary ? "text-gray-400" : "text-gray-800",
            editing && !errors ? "px-1 bg-gray-50 focus:outline-none focus:ring-1  focus:ring-blue-500" : "",
            editing && errors ? "px-1 bg-red-50 focus:outline-none focus:ring-1 focus:ring-amber-500" : ""
          ].join(" ")}
          >
          {props.value || ((props.editable && editing) ? undefined : props.default)   }
          </div>
          {props.icon && <div className='grow-0 place-items-center ml-1'>
            {props.icon}
          </div>}
          </>
    )    
  }