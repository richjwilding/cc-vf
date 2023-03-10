import React, { useEffect } from 'react';
import ContactPicker from './ContactPicker';
import {ContactPopover} from './ContactCard';
import EditableTextField from './EditableTextField';
import Select, { components } from "react-select";
import MainStore from './MainStore';
  
export default function EditablePersonField ({...props}){
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(props.editing)
  const startValues = ()=>[props.value].flat().filter((d)=>d).map((d)=>({value: d.id, label: d.name, avatarUrl: d.avatarUrl}))
  const [value, setValue] = React.useState( startValues() );
  const field = React.useRef()

  React.useEffect(()=>{
    const localEditing = props.editing === undefined ? editing : props.editing 
    if( editing !== localEditing){
        setEditing(localEditing)
    }
    if( localEditing ){
      field.current.focus()
    }
  }, [props.editing, editing])

  const BadgeComponent = (props) => { 
    const value = props.data

    let img = <img referrerPolicy="no-referrer" className="mr-1 inline-block h-6 w-6 rounded-full" src={value.avatarUrl}/>

    if( !editing && props.mode !== "user"){
      img = <ContactPopover icon={img} contactId={value.value}/>
    }

    return ( <div className='flex place-items-center'>
      {img} 
      <p className={`text-gray-800 text-md ${editing ? "" : "pr-2"}`}>{value.label}</p>
    </div> ); };

  if( props.compact ){
    return <BadgeComponent data={value[0]}/>
  }
  
  const stopEdit = ()=>props.stopEditing(field?.current?.controlRef.parentElement) || (()=>setEditing(false))

  const trigger = ()=>{
    setOpen(true)
  }


  const handleClose = ()=>{
    setOpen(false)
    setTimeout(() => {
      field.current && field.current.inputRef?.focus()
    }, 50);
  }

  const addPerson = (user) =>{
    if(value.find((d)=>d.value === user.id )){return}
    if( props.mutliple ){
      setValue(
        [...value,
          {value:user.id, label: user.name, avatarUrl: user.avatarUrl}]
          )
    }else{
      setValue([
          {value:user.id, label: user.name, avatarUrl: user.avatarUrl}
      ])
    }
  }

  const handleChange = value => {
      console.log("value:", value);
      setValue(value);
  };

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
        setValue( startValues() )
        field.current.blur()
        return
      }
      if( e.key === "Enter"){
        const out = value.map((v)=>({id: v.value, name: v.label}))
        e.preventDefault()
        e.stopPropagation()
        props.onSelect( props.muliple ? out : out[0])
        field.current.blur()
        return
      }
      if(["Tab", "ArrowUp", "Backspace", "ArrowDown", "ArrowRight", "ArrowLeft" ,"Shift","Meta","Alt","Control"].includes(e.key) ){
          return
      }
      trigger()
  }
  const blur = ()=>{
      if( !open ){
        stopEdit()
      }
  }



  const classes = {
    multiValue: (state) => `flex ${editing ? "border-gray-200" : "border-transparent"} border-2 bg-white px-1 p-px mb-0.5 rounded-2xl ml-1 place-items-center`,
    container: (state) => state.isFocused && editing ? "flex w-full bg-gray-50 ring-1 ring-blue-500 " : "flex w-full",
    control: (state) => editing ? "flex w-full" : "flex w-full ",
    valueContainer: (state) => "flex flex-wrap justify-end px-0 w-full",
    multiValueRemove: (state) => `flex w-6 h-6 border-[4px] rounded-2xl w-3 h-3 place-items-center justify-center bg-gray-200 border-white hover:bg-gray-400 hover:text-white`,
    placeholder:()=>'self-center mx-1 mt-1 mb-1.5',
    indicatorsContainer:()=>editing ? 'p-0.5 self-center' : "" ,
    dropdownIndicator:()=>'p-0.5 self-center ' ,
  }
  const components = editing 
      ? {MultiValueLabel:BadgeComponent }
      : {MultiValueLabel:BadgeComponent, MultiValueRemove:() => null, DropdownIndicator:() => null, IndicatorSeparator:() => null }

  const style = {
    multiValue:()=>{{}},
    container:()=>{{}},
    control:()=>{{}},
    valueContainer:()=>{{}},
    multiValueRemove:()=>{{}},
    placeholder:()=>{{}},
    indicatorsContainer:()=>{},
    dropdownIndicator:()=>{},
  }

        
    return (<>
      {open && <ContactPicker allowNew={true} setOpen={handleClose} callback={addPerson} mode={props.mode}/>}
        <Select 
              components={components}
                ref={field}
                classNames={classes}
                primaryColor={"indigo"} 
                value={value} 
                styles={style}
                isDisabled={!editing}
                isClearable={false}
                isMulti={true}
                isSearchable={false}
                onChange={handleChange} 
                onKeyDown={mainKeyHandler}
                noOptionsMessage={() => null}
                onBlur={blur}
                options={[]} 
              />
      </>)    
}