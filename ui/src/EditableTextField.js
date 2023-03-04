    import React, { useEffect } from 'react';
  export default function EditableTextField ({item, ...props}){
    const [editing, setEditing] = React.useState(false)
    const editBox = React.useRef()
    const editAny = React.useRef()
    const editOld = React.useRef()
    const parentRow = React.useRef()
    const [errors, setErrors] = React.useState(false)

    React.useEffect(()=>{
      if( editBox.current && editing){
        editBox.current.focus()

        const range = document.createRange();
        range.selectNodeContents(editBox.current );
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        editAny.current = false
        editOld.current = editBox.current.textContent.trim()
      }
    }, [editing])

    const cancelEdit = ()=>{
        const sel = window.getSelection();
        sel.removeAllRanges();
        editBox.current.textContent = editOld.current
        setEditing(false)
        if( props.asList && parentRow.current ){
          parentRow.current.focus()
        }
    }
    const onKeykeyHandler = (e)=>{
        if(["Enter", "Tab", "Escape", "ArrowUp", "ArrowDown" ,"Shift","Meta","Alt","Control"].includes(e.key) ){
            return
        }
        let current = undefined
        if( editBox.current ){
            current = editBox.current.textContent
            editBox.current.textContent = editOld.current
        }
        e.stopPropagation();
        props.onKey(e.key, current, parentRow)
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
          if( props.asList && parentRow.current ){
            parentRow.current.focus()
          }
          return
        }        
      }
      if( e.key === "Escape"){
        e.stopPropagation();
        cancelEdit()
        return
      }

      editAny.current = true

    }
    const toggleEditing = ()=>{
      if( editing ){
        let newText = editBox.current.textContent.trim()
        if( editOld.current !== newText ){
          if( props.callback ){
            if( !props.callback( newText ) ){
              editBox.current.focus()
              setErrors(true)
              return
            }
          }
        }      
        setEditing(false)
      }else{
        setEditing(true)
      }
    }

    const listKeyHandler = (e)=>{
      if(e.key === "Enter"){
          e.preventDefault()
        toggleEditing()
      }
        if (e.key === 'ArrowDown') {
          let cn = e.currentTarget.parentElement.nextSibling && e.currentTarget.parentElement.nextSibling.childNodes
          if( cn && cn[0]){
            cn[0].focus()
          }
      }
      if (e.key === 'ArrowUp') {
          let cn = e.currentTarget.parentElement.previousSibling && e.currentTarget.parentElement.previousSibling.childNodes
          if( cn && cn[0]){
            cn[0].focus()
          }
      }
    }


    return (
      <div 
          tabIndex={props.editable ? 0 : undefined}
          ref={parentRow}
          onKeyDown={props.asList ? listKeyHandler : undefined}
          onKeyUp={props.onKey ? onKeykeyHandler : undefined}
          onDoubleClick={props.editable && !editing ? toggleEditing : undefined}
          className={[
            props.compact ? "" : "flex px-1 py-2 w-full ",
            props.editable ? "hover:bg-gray-50 hover:outline-indigo-500" : "",
            props.className || ""
          ].join(" ")}
        >
        {(props.showTitles === undefined || props.showTitles === true) && <p className='mr-2 grow-0'>{props.title}</p>}
        <div
          ref={editBox} 
          contentEditable={editing}
          onKeyDown={props.editable ? keyHandler : undefined}
          onBlur={props.editable ? toggleEditing : undefined}
          suppressContentEditableWarning={true}
          className={[
            'place-items-center',
            props.fieldClassName || '',
            props.compact ? "" : "py-1",
            editing && !errors ? "px-1 bg-gray-50 focus:outline-none focus:ring-1  focus:ring-blue-500" : "",
            editing && errors ? "px-1 bg-red-50 focus:outline-none focus:ring-1 focus:ring-amber-500" : ""
          ].join(" ")}
          >
          {props.value || ((props.editable && editing) ? undefined : props.default) }
          </div>
          {props.icon && <div className='grow-0 place-items-center'>
            {props.icon}
          </div>}
      </div>
    )    
  }