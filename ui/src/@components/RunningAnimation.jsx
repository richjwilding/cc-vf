import Konva from "konva";
import { useEffect, useRef } from "react";

export const useRunningAnimation = (layerRef, offsetRef) => {
  const animRef = useRef(null);
  const isRunningRef = useRef(false);
  const targetsRef = useRef([]); // cache of shapes to animate

  useEffect(() => {
    const start = () => {
      if (animRef.current) return;
      animRef.current = new Konva.Animation((frame) => {
        // time-based step so speed is consistent across machines
        const step = (1.2 * (frame?.timeDiff ?? 16.7)) / 16.7; 
        offsetRef.current -= step;
        const targets = targetsRef.current;
        // avoid repeated .find(); just touch cached shapes
        for (let i = 0; i < targets.length; i++) {
          targets[i].dashOffset(offsetRef.current);
        }
      }, layerRef.current);
      animRef.current.start();
      isRunningRef.current = true;
    };

    const stop = () => {
      animRef.current?.stop();
      animRef.current = null;
      isRunningRef.current = false;
    };

    const checkAndUpdateAnimation = () => {
      const layer = layerRef.current;
      if (!layer) return;

      const running = layer.find('.running'); // every 300ms, not every frame
      const hasRunning = running.length > 0;

      // cache the collection as a plain array for fast iteration
      targetsRef.current = running.toArray ? running.toArray() : running;

      if (hasRunning && !isRunningRef.current) start();
      else if (!hasRunning && isRunningRef.current) stop();
    };

    const interval = setInterval(checkAndUpdateAnimation, 300);
    return () => {
      clearInterval(interval);
      animRef.current?.stop();
      animRef.current = null;
      isRunningRef.current = false;
      targetsRef.current = [];
    };
  }, [layerRef, offsetRef]);
};