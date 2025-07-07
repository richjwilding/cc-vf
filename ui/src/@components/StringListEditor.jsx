import {Icon} from "@iconify/react";
import { HeroIcon } from "../HeroIcon";
import MarkdownEditor from "../MarkdownEditor";
import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Button } from "@heroui/react";

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function StringListEditor({data, size = "md", className, onChange, editable}) {
  const inputBox = useRef({})
  const [changed, setChanged] = useState(false)
  const asMarkdown = useMemo(()=>{
    let interim = [""]
    if( typeof(data) === "string" ){
      if( data.includes("\n")){
        interim = data.split("\n").map(d=>d.trim())
      }else if( data.includes(",")){
        interim = data.split(",").map(d=>d.trim())
      }else{
        interim = [data]
      }
    }else if( Array.isArray( data) ){
      interim = data
    }
    if( changed ){
      setChanged(false)
    }      
    return interim.map(d=>"- " + d).join("\n")
  }, [data])


  function handleChange(data){
    console.log(data)
    if( !changed ){
      setChanged(true)
    }
  }
  function handleUpdate(){
    const markdown = inputBox.current?.value()
    if( markdown){
      const mapped = markdown.split("\n").map(d=>d.replace(/^\s+-{1,}\s+/, "").trim()).filter(Boolean)
      if(onChange){
        onChange(mapped)
      }
      setChanged(false)
    }
  }

  return (
    <div className={clsx('flex flex-col space-y-3 w-full', `text-${size}`, className)}>
      <MarkdownEditor readOnly={!editable} ref={inputBox} initialMarkdown={asMarkdown} onKeyUp={handleChange}/>
      {changed && <Button color="primary" onPress={handleUpdate}>Update</Button>}
    </div>
  )
}
