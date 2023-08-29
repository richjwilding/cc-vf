// React-ECharts.tsx
import React, { useRef, useEffect } from "react";
import { init, getInstanceByDom } from "echarts";

export function ReactECharts({
  option,
  style,
  settings,
  loading,
  update,
  renderer,
  clickCallback,
  ref,
  theme})
  {
  const chartRef = useRef(null);

  useEffect(() => {
    // Initialize chart
    let chart;
    if (chartRef.current !== null) {
      chart = init(chartRef.current, theme, {renderer: renderer ?? "svg"});
      chart.on('click', function (params) {
        clickCallback(params)
    });
    
    }

    // Add chart resize listener
    // ResizeObserver is leading to a bit janky UX
    function resizeChart() {
      chart?.resize();
    }
    window.addEventListener("resize", resizeChart);

    // Return cleanup function
    return () => {
      console.log("DISPOSING.....")
      chart?.dispose();
      window.removeEventListener("resize", resizeChart);
    };
  }, [theme,update, renderer]);

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

  return <div data-update={update} ref={chartRef} style={{ width: "100%", height: "100%", ...style }} />;
}