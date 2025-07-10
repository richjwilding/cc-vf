import colors from 'tailwindcss/colors';

function getBaseHex(colorName, shade = 500) {
  if( colorName?.startsWith("#")){
    return colorName
  }
  return colors[colorName]?.[shade] ?? '#000000';
}

function hexToHSL(H) {
  let r = 0, g = 0, b = 0;
  if (H.length === 4) {
    r = "0x" + H[1] + H[1];
    g = "0x" + H[2] + H[2];
    b = "0x" + H[3] + H[3];
  } else if (H.length === 7) {
    r = "0x" + H[1] + H[2];
    g = "0x" + H[3] + H[4];
    b = "0x" + H[5] + H[6];
  }
  r /= 255; g /= 255; b /= 255;
  const cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin;
  let h = 0, s = 0, l = 0;
  l = (cmax + cmin) / 2;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (cmax) {
      case r: h = ((g - b) / delta) % 6; break;
      case g: h = (b - r) / delta + 2;   break;
      case b: h = (r - g) / delta + 4;   break;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);
  return [h, s, l];
}

function HSLToHex([h, s, l]) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
        m = l - c/2;
  let [r1,g1,b1] = 
    h < 60 ? [c, x, 0] :
    h < 120? [x, c, 0] :
    h < 180? [0, c, x] :
    h < 240? [0, x, c] :
    h < 300? [x, 0, c] :
              [c, 0, x];
  const toHex = v => {
    const hex = Math.round((v + m)*255).toString(16).padStart(2,'0');
    return hex;
  };
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}
function getAnalogousStops(hex, delta = 30) {
  const [h, s, l] = hexToHSL(hex);
  const left  = HSLToHex([ (h - delta + 360) % 360, s, l ]);
  const right = HSLToHex([ (h + delta)      % 360, s, l ]);
  return [ left, right ];
}


export function useSmoothGradient(color, brightness = 400) {
  const baseHex = getBaseHex(color, brightness);
  const [hex1, hex2] = getAnalogousStops(baseHex, 25);

  const gradient = `linear-gradient(
        to bottom right,
        ${hex1} 0%,
        ${baseHex} 50%,
        ${hex2} 100%
      )`
  return {gradient, values: [hex1, baseHex, hex2]}
}