    import React, { useEffect } from 'react';
  export default function EditableTextField ({item, ...props}){
    const [editing, setEditing] = React.useState(false)
    const editBox = React.useRef()
    const [errors, setErrors] = React.useState(false)

    const keyHandler = (e)=>{
      e.stopPropagation()

      if( !editing ){          
        if(e.key === "Enter"){
          e.preventDefault()
          editBox.current.focus()

          const range = document.createRange();
          range.selectNodeContents(editBox.current );
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);

          startEditing()

          return
        }
        if( e.key === "Tab"){
          return
        }
        e.preventDefault()
      }else{
        if(e.key === "Enter"){
          if( props.submitOnEnter ){
            e.preventDefault()
            toggleEditing()
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

    }

    const startEditing = ()=>{
      editBox.current.setAttribute("_org", editBox.current.textContent.trim())
      setEditing(true)
    }


    const cancelEdit = ()=>{
      const sel = window.getSelection();
      sel.removeAllRanges();
      editBox.current.textContent = editBox.current.getAttribute("_org") 
      setEditing(false)
    }

    const toggleEditing = ()=>{
      let editOld = editBox.current.getAttribute("_org") 
        let newText = editBox.current.textContent.trim()
        if( editOld !== newText ){
          editBox.current.setAttribute("_org", newText)
          if( props.callback ){
            if( !props.callback( newText ) ){
              editBox.current.focus()
              setErrors(true)
              return
            }
          }
        }      
        cancelEdit()
    }

    const showAsEmpty = props.value === undefined || props.value === null || props.value === ""
    const showPlaceholder = !(props.editable && editing) && props.value === undefined && props.placeholder

    return (
        <>
        <div
          ref={editBox} 
          contentEditable={props.editable && editing}
          onClick={props.editable && editing ? undefined : ()=>startEditing()}
          onKeyDown={props.editable ? keyHandler : undefined}
          onBlur={props.editable ? toggleEditing : undefined}
          tabIndex={1}
          suppressContentEditableWarning={true}
          className={[
            'place-items-center outline-none',
            props.border ? "border border-gray-200 rounded-md" : "",
            !props.compact && !editing ? "p-1 min-h-[2em]" : "",
            props.fieldClassName || '',
            props.compact ? "py-1" : "px-1 py-1",
            props.fieldClassName && props.fieldClassName.search("text-") > -1 ? "" :props.secondary ? "text-gray-400" : "text-gray-800",
            showPlaceholder ? "italic" : "",
            showAsEmpty ? "italic text-gray-600" : "",
            props.editable && !editing ? props.clamp : "",
            props.editable && !editing && !errors ? "focus:bg-gray-50 focus:outline-none focus:ring-1  focus:ring-ccgreen-200" : "",
            props.editable && editing && !errors ? "px-1 bg-gray-50 focus:outline-none focus:ring-1  focus:ring-ccgreen-500" : "",
            props.editable && errors ? "px-1 bg-red-50 focus:outline-none focus:ring-1 focus:ring-amber-500" : ""
          ].join(" ")}
          >
          {props.value ?? ((props.editable && editing) ? undefined : props.default) ?? props.placeholder ?? "Enter details" }
          </div>
          {props.icon && <div className='grow-0 place-items-center ml-1'>
            {props.icon}
          </div>}
          </>
    )    
  }