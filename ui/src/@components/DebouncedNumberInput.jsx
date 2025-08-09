import { NumberInput } from "@heroui/react"
import React from "react"

export function DebouncedNumberInput({
  value: externalValue,
  onValueChange,
  debounce = 500,
  ...props
}) {
  const [internalValue, setInternalValue] = React.useState(externalValue)

  const latestCallback = React.useRef(onValueChange)
  React.useEffect(() => {
    latestCallback.current = onValueChange
  }, [onValueChange])

  React.useEffect(() => {
    setInternalValue(externalValue)
  }, [externalValue])

  React.useEffect(() => {
    const handle = setTimeout(() => {
      latestCallback.current(internalValue)
    }, debounce)
    return () => clearTimeout(handle)
  }, [internalValue, debounce])

  const handleChange = (val) => {
    const parsed = parseFloat(val)
    if (!Number.isNaN(parsed)) {
      setInternalValue(parsed)
    } else if (val === "" || val === null) {
      setInternalValue("")
    } else {
    }
  }

  return (
    <NumberInput
      {...props}
      value={internalValue}
      onValueChange={handleChange}
    />
  )
}