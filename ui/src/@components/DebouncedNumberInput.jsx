import { NumberInput } from "@heroui/react"
import React from "react"

const normalizeExternalNumber = (val) => {
  if (val === "" || val === null || typeof val === "undefined") return ""
  if (typeof val === "number") return val
  const parsed = parseFloat(String(val).replaceAll(",", ""))
  return Number.isNaN(parsed) ? "" : parsed
}

// parse helper (numbers or empty string allowed)
const parseMaybeNumber = (val) => {
  if (val === "" || val === null || typeof val === "undefined") return ""
  const n = typeof val === "number" ? val : parseFloat(String(val).replaceAll(",", ""))
  return Number.isNaN(n) ? null : n
}

export function DebouncedNumberInput({
  value: externalValue,
  onValueChange,
  onChange,
  debounce = 500,
  ...props
}) {
  const normalizedExternalValue = normalizeExternalNumber(externalValue)
  const [internalValue, setInternalValue] = React.useState(normalizedExternalValue)

  // keep latest callback in a ref
  const latestCallback = React.useRef(onValueChange ?? onChange)
  React.useEffect(() => {
    latestCallback.current = onValueChange ?? onChange
  }, [onValueChange, onChange])

  // sync internal when parent value changes
  React.useEffect(() => {
    setInternalValue(normalizedExternalValue)
  }, [normalizedExternalValue])

  // debounce sends
  const timeoutRef = React.useRef(null)
  React.useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (internalValue !== normalizedExternalValue) {
      timeoutRef.current = setTimeout(() => {
        latestCallback.current?.(internalValue)
        timeoutRef.current = null
      }, debounce)
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [internalValue, debounce, normalizedExternalValue])

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

    // If the event didn't give us a usable value, fall back to internalValue
    const nextValue = parsed === null ? internalValue : parsed

    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (nextValue !== normalizedExternalValue) {
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
