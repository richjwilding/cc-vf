import React, { useRef, useEffect, useMemo } from 'react';
import Konva from 'konva';
import { Stage, Layer, Group, Rect } from 'react-konva';
import { useCallback } from 'react';

const AnimatedKonvaProgressBar = ({
    x = 0,
    y = 0,
    width = 300,
    height = 20,
    progress = 0.5,             // 0 → 1
    stripeWidth = 12,           // the thickness of each diagonal stripe
    stripeColor = '#007bff',
    backgroundColor = '#e0e0e0',
    speed = 60,                 // px/sec the stripes scroll
  }) => {
    const stripesRef = useRef();
  
    // 1) compute geometry
    const angle = Math.PI / 4;                    // 45°
    const perpSpacing = stripeWidth * 3;          // stripe + gap, measured perpendicular to stripe
    const stripeSpacingX = perpSpacing * Math.cos(angle); // its projection onto X
  
    // make each stripe long enough so its rotated width covers the bar
    // (bar width along the stripe direction is width·√2, plus a bit extra)
    const stripeLength = width * Math.SQRT2 + stripeWidth;
  
    // how many we need to tile across the fill region?
    const count = Math.ceil((width + stripeLength) / stripeSpacingX ) + 1;
    const stripePositions = useMemo(
      () =>
        Array.from({ length: count }, (_, i) => -stripeLength + i * stripeSpacingX),
      [count, stripeLength, stripeSpacingX]
    );

    // 2) the clip‐shape for the fill
    const clipFunc = useCallback(
      (ctx) => {
        const r = height / 2;
        const w = width * Math.max(0, Math.min(1, progress));
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, height - r);
        ctx.quadraticCurveTo(w, height, w - r, height);
        ctx.lineTo(r, height);
        ctx.quadraticCurveTo(0, height, 0, height - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.clip();
      },
      [width, height, progress]
    );
  
    // 3) animate the stripes group
    useEffect(() => {
      const group = stripesRef.current;
      if (!group) return;
      const layer = group.getLayer();
      if (!layer) return;
  
      const anim = new Konva.Animation((frame) => {
        const dx = ((frame.time * speed) / 1000) % stripeSpacingX;
        group.x(dx);
        layer.batchDraw();
      }, layer);
  
      anim.start();
      return () => anim.stop();
    }, [speed, stripeSpacingX]);
  
    return (
      <Group x={x} y={y}>
        {/* background track */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={backgroundColor}
          stroke={stripeColor}
          strokeWidth={2}
          cornerRadius={height / 2}
        />
        <Group x={0} y={0} clipFunc={clipFunc}>
  
        {/* clipped, scrolling stripes */}
        <Group ref={stripesRef} >
          {stripePositions.map((px, i) => (
            <Rect
              key={i}
              // put the pivot at the center of the stripe so it rotates around its middle
              offsetX={stripeLength / 2}
              offsetY={stripeWidth / 2}
              x={px + stripeLength / 2}
              y={height / 2}
              width={stripeLength}
              height={stripeWidth}
              rotation={-45}
              fill={stripeColor}
              strokeWidth={1}
            />
          ))}
        </Group>
        </Group>
        <Rect
          x={0}
          y={0}
          width={width * progress}
          height={height}
          stroke={stripeColor}
          strokeWidth={2}
          cornerRadius={height / 2}
        />
      </Group>
    );
  };
  
  export default AnimatedKonvaProgressBar;