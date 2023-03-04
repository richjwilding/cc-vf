import React, { useEffect } from 'react';
import ContactPicker from './ContactPicker';
import EditableTextField from './EditableTextField';
import Select, { components } from "react-select";
import MainStore from './MainStore';
  
export default function EditableUserField ({users, ...props}){
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const field = React.useRef()
  const parentRow = React.useRef()

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

  const options = MainStore().users().map((user)=>({value:user.id, label: user.name, avatarUrl: user.avatarUrl}))
  const startValues = ()=>[users].flat().filter((d)=>d).map((d)=>options.find((o)=>o.value === d.id))
  const [value, setValue] = React.useState( startValues() );
  console.log(startValues())

  const handleChange = value => {
      console.log("value:", value);
      setValue(value);
  };

  const listKeyHandler = (e)=>{
    if(e.key === "Enter"){
        e.preventDefault()
        setEditing( !editing )
        setTimeout(() => {
          field.current && field.current.inputRef?.focus()
        }, 50);
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
  const mainKeyHandler = (e)=>{
      if(["ArrowUp", "ArrowDown"].includes(e.key) ){
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if( e.key === "Escape"){
        setEditing(false)
        setValue( startValues() )
        parentRow.current.focus()
        return
      }
      if( e.key === "Enter"){
        setEditing(false)
        parentRow.current.focus()

        const out = value.map((v)=>({id: v.value, name: v.name}))

        props.onSelect( props.muliple ? out : out[0])
        return
      }
      if(["Tab", "ArrowUp", "Backspace", "ArrowDown", "ArrowRight", "ArrowLeft" ,"Shift","Meta","Alt","Control"].includes(e.key) ){
          return
      }
      trigger()
  }
  const blur = ()=>{
      if( !open ){
        setEditing(false)
      }
  }

  const BadgeComponent = (props) => { 
    const value = props.data
    return ( <div className='flex place-items-center'> 
      <img referrerPolicy="no-referrer" className="mr-1 inline-block h-6 w-6 rounded-full" src={value.avatarUrl}/>
      <p className={`text-gray-800 text-md ${editing ? "" : "pr-2"}`}>{value.label}</p>
    </div> ); };


  const classes = {
    multiValue: (state) => "flex border-2 border-gray-200 bg-white px-1 p-px mb-0.5 rounded-2xl ml-1 place-items-center",
    container: (state) => state.isFocused ? "flex w-full bg-gray-50 ring-1 ring-blue-500 " : "flex w-full",
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
    constainer:()=>{{}},
    control:()=>{{}},
    valueContainer:()=>{{}},
    multiValueRemove:()=>{{}},
    placeholder:()=>{{}},
    indicatorsContainer:()=>{},
    dropdownIndicator:()=>{},
  }
        
    return (<>
      {open && <ContactPicker setOpen={handleClose} callback={addPerson} mode='user'/>}
      <div 
          tabIndex={props.editable ? 0 : undefined}
          ref={parentRow}
          onKeyDown={props.asList ? listKeyHandler : undefined}
          className={[
            props.compact ? "" : "flex px-1 py-1 w-full ",
            props.editable ? "hover:bg-gray-50 hover:outline-indigo-500" : "",
            props.className || ""
          ].join(" ")}
        >
        {(props.showTitles === undefined || props.showTitles === true) && <p className='mr-2 grow-0'>{props.title}</p>}
        <Select 
              tabIndex={editing ? 1 : -1}
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

      </div>
      </>)    
}