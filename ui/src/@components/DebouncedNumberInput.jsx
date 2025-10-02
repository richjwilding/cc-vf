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

  // keep latest callback in a ref
  const latestCallback = React.useRef(onValueChange ?? onChange)
  React.useEffect(() => {
    latestCallback.current = onValueChange ?? onChange
  }, [onValueChange, onChange])

  // sync internal when parent value changes
  React.useEffect(() => {
    setInternalValue(externalValue)
  }, [externalValue])

  // debounce sends
  const timeoutRef = React.useRef(null)
  React.useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      if (internalValue !== externalValue) {
        latestCallback.current?.(internalValue)
      }
    }, debounce)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [internalValue, debounce, externalValue])

  // parse helper (numbers or empty string allowed)
  const parseMaybeNumber = (val) => {
    if (val === "" || val === null || typeof val === "undefined") return ""
    const n = typeof val === "number" ? val : parseFloat(val.replaceAll(",",""))
    return Number.isNaN(n) ? null : n
  }

  // Commit immediately, grabbing the freshest value from the event/DOM
  const commitFromEvent = (e) => {
    // Try to read directly from the input
    const raw =
      e?.target?.value ??
      e?.currentTarget?.value ??
      // fallback to valueAsNumber when available (input[type=number])
      (typeof e?.target?.valueAsNumber === "number" && !Number.isNaN(e.target.valueAsNumber)
        ? e.target.valueAsNumber
        : undefined)

    const parsed = parseMaybeNumber(raw)
    console.log(`UPDATE ${raw} > ${parsed}`)

    // If the event didn't give us a usable value, fall back to internalValue
    const nextValue = parsed === null ? internalValue : parsed

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (nextValue !== externalValue) {
      latestCallback.current?.(nextValue)
    }
  }

  const handleBlur = (e) => {
    commitFromEvent(e)
    props.onBlur?.(e)
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      commitFromEvent(e)
    }
    props.onKeyDown?.(e)
  }

  // track user edits into local state
  const handleChange = (val) => {
    const parsed = parseMaybeNumber(val)
    if (parsed !== null && parsed !== internalValue) {
      setInternalValue(parsed)
    }
  }

  return (
    <NumberInput
      size="sm"
      {...props}
      variant={props.variant ?? "bordered"}
      value={internalValue}
      onValueChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  )
}