import React, { useRef, useEffect } from 'react';
import { Image as KonvaImage } from 'react-konva';

function svgToDataURL(svgString) {
    const encoded = encodeURIComponent(svgString)
      .replace(/'/g, '%27')
      .replace(/"/g, '%22');
  
    return `data:image/svg+xml;charset=utf-8,${encoded}`;
  }

export function StaticImage({ svgString, x, y, width, height, color }) {
  const imageRef = useRef(null);
  const imgObjRef = useRef(null); // to avoid re-creating image on each render

  if( typeof(svgString) !== "string"){
    console.warn("StaticImage expects a string")
  }    
  useEffect(() => {
    if( typeof(svgString) === "string"){

      if( color ){
        svgString = svgString.replace("currentColor", color)
      }
      const img = new window.Image();
      img.crossOrigin = 'Anonymous'; // optional for base64
      img.src = svgToDataURL( svgString);
      img.onload = () => {
        imgObjRef.current = img;
        const konvaNode = imageRef.current;
        if (konvaNode) {
          konvaNode.image(img);
          konvaNode.getLayer().batchDraw();
        }
      };
    }
  }, [svgString, color]);

  return (
    <KonvaImage
      ref={imageRef}
      image={imgObjRef.current}
      x={x}
      y={y}
      width={width}
      height={height}
    />
  );
}