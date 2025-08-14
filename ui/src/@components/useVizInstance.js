import { useState, useEffect } from 'react';
import { instance } from '@viz-js/viz';

export function useVizInstance() {
  const [viz, setViz] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let localViz = null;

    (async () => {
      localViz = await instance();
      if (!cancelled) setViz(localViz);
    })();

    return () => {
      cancelled = true;
      // free the worker if provided
      localViz?.terminate?.();
    };
  }, []);

  return viz;
}