import React, { useRef, useState, useLayoutEffect, useEffect } from "react";
export function AutoSizer({
  enableResizeObserver = false,
  children,
  className = "",
  style = {},
}) {
  // 1) ref to the wrapper div that we measure
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Ref to hold debounce timer ID
  const debounceRef = useRef(null);

  // Helper to measure container and update state
  const measure = () => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    setSize({ width: clientWidth, height: clientHeight });
  };

  // Debounced measure: clears previous timer and sets a new one
  const measureDebounced = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    // 100ms debounce delay; adjust as needed
    debounceRef.current = setTimeout(() => {
      measure();
      debounceRef.current = null;
    }, 100);
  };

  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Initial measurement
    measure();

    if (!enableResizeObserver) {
      return;
    }

    // Set up ResizeObserver, calling debounced measure on change
    const ro = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === containerRef.current) {
          measureDebounced();
        }
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [enableResizeObserver]);

  // Until we have non-zero size, render just the wrapper
  if (size.width === 0 || size.height === 0) {
    return (
      <div
        ref={containerRef}
        className={`w-full h-full ${className}`}
        style={{ position: "relative", ...style }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ position: "relative", ...style }}
    >
      {typeof(children) === "function" ? children({ width: size.width, height: size.height }) : children}
    </div>
  );
}