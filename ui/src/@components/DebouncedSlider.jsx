import { Slider } from "@heroui/slider"
import React from "react"

export function DebouncedSlider({
    value: externalValue,
    onChange,
    debounce = 500,
    ...props
}) {
    const [internalValue, setInternalValue] = React.useState(externalValue)

    const latestCallback = React.useRef(onChange)
    React.useEffect(() => {
        latestCallback.current = onChange
    }, [onChange])

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
        <Slider
            {...props}
            value={internalValue}
            onChange={handleChange}
        />
    )
}