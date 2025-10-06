import { Input, Textarea } from "@heroui/react"
import React from "react"

const normalizeStringValue = (val) => (val == null ? "" : val)
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

export function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 500,
  area,                 // if true -> Textarea
  onBlur,
  onKeyDown,
  onFocus,
  onSelect,
  ...props
}) {
  const [value, setValue] = React.useState(() => normalizeStringValue(initialValue))
  const timeoutRef = React.useRef(null)
  const inputElementRef = React.useRef(null)
  const selectionRef = React.useRef({ start: null, end: null })
  const syncingFromPropsRef = React.useRef(false)
  const isFocusedRef = React.useRef(false)
  const pendingExternalValueRef = React.useRef(null)
  const previousExternalValueRef = React.useRef(normalizeStringValue(initialValue))
  const lastCommittedRef = React.useRef(null)

  const assignInputElement = React.useCallback((node) => {
    if (!node) {
      inputElementRef.current = null
      return
    }
    const candidate =
      node?.inputRef?.current ??
      node?.textareaRef?.current ??
      (typeof node?.querySelector === "function" ? node.querySelector("input, textarea") : null) ??
      (typeof HTMLElement !== "undefined" && node instanceof HTMLElement ? node : null)
    inputElementRef.current =
      candidate && typeof candidate.setSelectionRange === "function" ? candidate : null
  }, [])

  const updateSelectionFromEvent = React.useCallback((event) => {
    const target = event?.target ?? event?.currentTarget ?? inputElementRef.current
    if (!target) return
    const { selectionStart, selectionEnd } = target
    if (typeof selectionStart === "number" && typeof selectionEnd === "number") {
      selectionRef.current = { start: selectionStart, end: selectionEnd }
    }
  }, [])

  // keep local in sync when parent value changes
  React.useEffect(() => {
    const next = normalizeStringValue(initialValue)
    const previousExternal = previousExternalValueRef.current
    setValue((prev) => {
      if (prev === next) {
        pendingExternalValueRef.current = null
        return prev
      }
      if (isFocusedRef.current && prev !== previousExternal) {
        pendingExternalValueRef.current = next
        return prev
      }
      pendingExternalValueRef.current = null
      syncingFromPropsRef.current = true
      return next
    })
    previousExternalValueRef.current = next
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
    updateSelectionFromEvent(e)
    const live = e?.target?.value ?? e?.currentTarget?.value
    const next = typeof live === "string" ? live : value
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (next !== normalizeStringValue(initialValue)) {
      lastCommittedRef.current = next
      onChange?.(next)
    }
  }

  useIsomorphicLayoutEffect(() => {
    if (!syncingFromPropsRef.current) {
      return
    }
    syncingFromPropsRef.current = false
    if (typeof document === "undefined") {
      return
    }
    const inputEl = inputElementRef.current
    if (!inputEl || document.activeElement !== inputEl) {
      return
    }
    const { start, end } = selectionRef.current
    if (typeof start !== "number" || typeof end !== "number") {
      return
    }
    const max = inputEl.value?.length ?? 0
    const nextStart = Math.min(start, max)
    const nextEnd = Math.min(end, max)
    inputEl.setSelectionRange?.(nextStart, nextEnd)
    selectionRef.current = { start: nextStart, end: nextEnd }
  }, [value])

  const handleBlur = (e) => {
    isFocusedRef.current = false
    commitFromEvent(e)
    const pending = pendingExternalValueRef.current
    if (pending != null) {
      const shouldApply = pending === value || pending === lastCommittedRef.current
      if (shouldApply) {
        pendingExternalValueRef.current = null
        syncingFromPropsRef.current = true
        previousExternalValueRef.current = pending
        setValue(pending)
      } else {
        pendingExternalValueRef.current = null
      }
    }
    onBlur?.(e)
  }

  const handleFocus = (e) => {
    isFocusedRef.current = true
    updateSelectionFromEvent(e)
    onFocus?.(e)
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

  const handleSelect = (e) => {
    updateSelectionFromEvent(e)
    onSelect?.(e)
  }

  const handleInternalChange = (e) => {
    updateSelectionFromEvent(e)
    setValue(e.target.value ?? "")
  }

  const fwd = {
    ...props,
    variant: props.variant ?? "bordered",
    value,
    onChange: handleInternalChange,
    onBlur: handleBlur,
    onFocus: handleFocus,
    onKeyDown: handleKeyDown,
    onSelect: handleSelect,
    ref: assignInputElement,
  }

  return area ? <Textarea {...fwd} /> : <Input {...fwd} />
}
