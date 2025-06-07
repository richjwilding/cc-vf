import { Input } from "@heroui/react"
import useDataEvent from "./CustomHook";
import { useEffect, useRef, useState } from "react";
import {useInput} from "@heroui/react";
export default function InputWithSync({
    initialValue,
    primitive,
    field,
    ...props
  }) {
    const [localValue, setLocalValue] = useState(initialValue ?? primitive?.referenceParameters?.[field] ?? "");
    const pendingPrimitiveRef = useRef(primitive);
    useDataEvent(["set_parameter","set_field"], primitive?.id, (info)=>{
      console.log(info)
      
    } )
  
    useEffect (() => {
      console.log(`PRIMIITIVE CHNAGING to ${primitive.id}`)
      const newVal = initialValue ?? primitive?.referenceParameters?.[field] ?? ""
      if (localValue !== newVal) {
        setLocalValue(newVal);
      }
    }, [initialValue, primitive]);
    const inputRef = useRef(null);

  
    const handleBlur = (e) => {
      const latestText = e.target.value;
      console.log(`BLUR FIRED = ${latestText}`)
      const p = pendingPrimitiveRef.current;
      if (p) {
        p.setField(`referenceParameters.${field}`, latestText);
      }
    };

    const handleValueChange = (val) => {
      setLocalValue(val);
      pendingPrimitiveRef.current = primitive;
    };
  
    // 6) After mount, find the nested <input> and attach blur listener
    useEffect(() => {
      const el = inputRef.current;
      if (!el) return;
      const targetInput = el.nodeName === "INPUT" ? el : el.querySelector("input");
      targetInput.addEventListener("blur", handleBlur);
      return () => {
        targetInput.removeEventListener("blur", handleBlur);
      };
    }, []);
  
    return (
      <Input
        {...props}
        ref={inputRef}
        value={localValue}
        onValueChange={handleValueChange}
      />
    );
  }
  
