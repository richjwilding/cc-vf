import { Input } from "@heroui/react"
import React from "react"

export function DebouncedInput({
    value: initialValue,
    onChange,
    debounce = 500,
    ...props
  }){
    const [value, setValue] = React.useState(initialValue)
  
    React.useEffect(() => {
      setValue(initialValue)
    }, [initialValue])
  
    React.useEffect(() => {
      const timeout = setTimeout(() => {
        onChange(value)
      }, debounce)
  
      return () => clearTimeout(timeout)
    }, [value])
  
    return (
      <Input {...props} value={value} onChange={e => setValue(e.target.value)} />
    )
  }