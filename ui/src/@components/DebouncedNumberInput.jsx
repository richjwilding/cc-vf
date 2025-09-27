import { NumberInput } from "@heroui/react"
import React from "react"

export function DebouncedNumberInput({
  value: externalValue,
  onValueChange,
  onChange,
  debounce = 500,
  ...props
}) {
  const [internalValue, setInternalValue] = React.useState(externalValue)

  const latestCallback = React.useRef(onValueChange ?? onChange)
  React.useEffect(() => {
    latestCallback.current = onValueChange ?? onChange
  }, [onValueChange, onChange])

  React.useEffect(() => {
    setInternalValue(externalValue)
  }, [externalValue])

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if( internalValue !== externalValue ){
        latestCallback.current(internalValue)
      }
    }, debounce)
    return () => clearTimeout(handle)
  }, [internalValue, debounce])

  const handleChange = (val) => {
    const parsed = parseFloat(val)
    if (internalValue !== parsed) {
      if (!Number.isNaN(parsed)) {
        setInternalValue(parsed)
      } else if (val === "" || val === null) {
        setInternalValue("")
      } else {
      }
    }
  }

  return (
    <NumberInput
      {...props}
      variant={props.variant ?? "bordered"}
      value={internalValue}
      onValueChange={handleChange}
    />
  )
}