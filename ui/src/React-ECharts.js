// React-ECharts.tsx
import React, { useRef, useEffect } from "react";
import { init, getInstanceByDom } from "echarts";

export function ReactECharts({
  option,
  style,
  settings,
  loading,
  theme})
  {
  const chartRef = useRef(null);

  useEffect(() => {
    // Initialize chart
    let chart;
    if (chartRef.current !== null) {
      chart = init(chartRef.current, theme, {renderer: "svg"});
    }

    // Add chart resize listener
    // ResizeObserver is leading to a bit janky UX
    function resizeChart() {
      chart?.resize();
    }
    window.addEventListener("resize", resizeChart);

    // Return cleanup function
    return () => {
      chart?.dispose();
      window.removeEventListener("resize", resizeChart);
    };
  }, [theme]);

  useEffect(() => {
    // Update chart
    if (chartRef.current !== null) {
      const chart = getInstanceByDom(chartRef.current);
      chart.setOption(option, settings);
    }
  }, [option, settings, theme]); // Whenever theme changes we need to add option and setting due to it being deleted in cleanup function

  useEffect(() => {
    // Update chart
    if (chartRef.current !== null) {
      const chart = getInstanceByDom(chartRef.current);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      loading === true ? chart.showLoading() : chart.hideLoading();
    }
  }, [loading, theme]);

  return <div ref={chartRef} style={{ width: "100%", height: "100%", ...style }} />;
}