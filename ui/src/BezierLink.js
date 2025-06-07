import React from "react";
import { Group, Line, Path } from "react-konva";

/**
 * BezierLink
 *
 * Props:
 *  - from: string        (ID of the parent node)
 *  - to: string          (ID of the child node)
 *  - positions: Object   ({ nodeId: { x, y }, … } from your layout)
 *  - stroke (optional)   (color of the curve; default "#555")
 *  - strokeWidth (opt)   (thickness; default 2)
 */
export function BezierLink({
    points,
    stroke = "#555",
    strokeWidth = 2,
    arrowLength = 8,
    arrowWidth = 8,
  }) {
    // 1) Get the eight Bézier numbers
    const [sx, sy, c1x, c1y, c2x, c2y, ex, ey] = points
  
    // 2) Use a Konva <Line> with bezier={true}. The `points` prop takes exactly
    //    [ startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY ] for a cubic.
    const bezierPoints = [sx, sy, c1x, c1y, c2x, c2y, ex, ey];
  
    // 3) Compute the final tangent vector at t=1 by (ex-c2x, ey-c2y)
    const dx = ex - c2x;
    const dy = ey - c2y;
    // Compute the angle of that vector:
    const angle = Math.atan2(dy, dx);
  
    // 4) Build arrowhead coordinates (a small triangle).
    //    Tip = (ex, ey). Base midpoint is arrowLength px “behind” along the tangent.
    const backX = ex - arrowLength * Math.cos(angle);
    const backY = ey - arrowLength * Math.sin(angle);
  
    // Two corners of the base (perpendicular to the tangent):
    const leftX =
      backX + (arrowWidth / 2) * Math.cos(angle + Math.PI / 2);
    const leftY =
      backY + (arrowWidth / 2) * Math.sin(angle + Math.PI / 2);
  
    const rightX =
      backX + (arrowWidth / 2) * Math.cos(angle - Math.PI / 2);
    const rightY =
      backY + (arrowWidth / 2) * Math.sin(angle - Math.PI / 2);
  
    // 5) Return a small <Group> containing the bezier‐Line and the arrowhead <Line>
    return (
      <Group>
        {/* 5a) The curved Bézier line */}
        <Line
          points={bezierPoints}
          bezier={true}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0}     // explicitly zero since we're providing control points
        />
  
        {/* 5b) The triangular arrowhead (filled polygon) */}
        <Line
          points={[ex, ey, leftX, leftY, rightX, rightY]}
          closed={true}
          fill={stroke}
          stroke={stroke}
          strokeWidth={strokeWidth * 0.2} // thin border if you like
        />
      </Group>
    );
  }