import React, { useEffect } from 'react';
import ContactPicker from './ContactPicker';
import EditableTextField from './EditableTextField';
  
export default function EditableContactField (props){
  const [open, setOpen] = React.useState(false)
  const [startText, setStartText] = React.useState("")
  const field = React.useRef()

  const trigger = (key, start, editBox)=>{
    document.activeElement.blur() 
    setOpen(true)
    setStartText(start)
    field.current = editBox.current
  }

  const handleClose = ()=>{
    setOpen(false)
    setTimeout(() => {
      console.log(field.current)
      field.current && field.current.focus()
    }, 50);
  }

  return (
    <>
      {open && <ContactPicker startText={startText} setOpen={handleClose} callback={props.onSelect}/>}
      <EditableTextField {...props} onKey={trigger}/>
    </>
  )
}