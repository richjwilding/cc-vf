import { Input, Textarea } from "@heroui/react"
import React from "react"

const normalizeStringValue = (val) => (val == null ? "" : val)

export function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 500,
  area,                 // if true -> Textarea
  onBlur,
  onKeyDown,
  ...props
}) {
  const [value, setValue] = React.useState(() => normalizeStringValue(initialValue))
  const timeoutRef = React.useRef(null)

  // keep local in sync when parent value changes
  React.useEffect(() => {
    setValue(normalizeStringValue(initialValue))
  }, [initialValue])

  // debounce user edits
  React.useEffect(() => {
    const normalizedInitial = normalizeStringValue(initialValue)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (value !== normalizedInitial) {
      timeoutRef.current = setTimeout(() => {
        onChange?.(value)
        timeoutRef.current = null
      }, debounce)
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [value, debounce, initialValue, onChange])

  // commit immediately using the freshest value from the event/DOM
  const commitFromEvent = (e) => {
    const live = e?.target?.value ?? e?.currentTarget?.value
    const next = typeof live === "string" ? live : value
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (next !== normalizeStringValue(initialValue)) {
      onChange?.(next)
    }
  }

  const handleBlur = (e) => {
    commitFromEvent(e)
    onBlur?.(e)
  }

  const handleKeyDown = (e) => {
    if (!area) {
      // Input: commit on Enter
      if (e.key === "Enter") {
        commitFromEvent(e)
      }
    } else {
      // Textarea: commit on Ctrl+Enter / Cmd+Enter; plain Enter inserts newline
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        commitFromEvent(e)
      }
    }
    onKeyDown?.(e)
  }

  const fwd = {
    ...props,
    variant: props.variant ?? "bordered",
    value,
    onChange: (e) => setValue(e.target.value ?? ""),
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  }

  return area ? <Textarea {...fwd} /> : <Input {...fwd} />
}
