import Konva from 'konva';
import { useEffect, useRef } from 'react';

export const useRunningAnimation = (layerRef, offsetRef) => {
  const animRef = useRef(null);
  const isRunningRef = useRef(false);

  useEffect(() => {
    const checkAndUpdateAnimation = () => {
      const layer = layerRef.current;
      if (!layer) return;

      const runningShapes = layer.find('.running');
      const hasRunningShapes = runningShapes.length > 0;

      if (hasRunningShapes && !isRunningRef.current) {
        // Start animation
        animRef.current = new Konva.Animation(() => {
          offsetRef.current -= 1.2; // speed
          layer.find('.running').forEach((shape) => {
            shape.dashOffset(offsetRef.current);
          });
        }, layer);
        animRef.current.start();
        isRunningRef.current = true;
      } else if (!hasRunningShapes && isRunningRef.current) {
        // Stop animation
        animRef.current?.stop();
        animRef.current = null;
        isRunningRef.current = false;
      }
    };

    const interval = setInterval(checkAndUpdateAnimation, 300); // adjust frequency as needed

    return () => {
      clearInterval(interval);
      animRef.current?.stop();
    };
  }, [layerRef, offsetRef]);
};