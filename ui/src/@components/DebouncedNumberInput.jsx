import { NumberInput } from "@heroui/react"
import React from "react"

export function DebouncedNumberInput({
  value: externalValue,
  onValueChange,
  debounce = 500,
  ...props
}) {
  const [internalValue, setInternalValue] = React.useState(externalValue)

  // Keep latest callback to avoid forcing parent to memoize
  const latestCallback = React.useRef(onValueChange)
  React.useEffect(() => {
    latestCallback.current = onValueChange
  }, [onValueChange])

  // Sync prop into internal state
  React.useEffect(() => {
    setInternalValue(externalValue)
  }, [externalValue])

  // Debounced propagate
  React.useEffect(() => {
    const handle = setTimeout(() => {
      latestCallback.current(internalValue)
    }, debounce)
    return () => clearTimeout(handle)
  }, [internalValue, debounce])

  const handleChange = (val) => {
    // Try to parse number; you can tweak behavior for empty/invalid input
    const parsed = parseFloat(val)
    if (!Number.isNaN(parsed)) {
      setInternalValue(parsed)
    } else if (val === "" || val === null) {
      // allow clearing if desired
      setInternalValue("")
    } else {
      // ignore invalid partial input or you can set to 0, etc.
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