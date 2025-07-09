import {Card, CardHeader, CardBody, Button, Avatar, Tabs, Tab, Chip, AvatarGroup, Tooltip, ScrollShadow} from "@heroui/react";
import MainStore from "./MainStore";
import colors from 'tailwindcss/colors';
import { Logo } from "./logo";
import { useEffect, useRef, useState } from "react";
import { Vibrant } from "node-vibrant/browser";

// e.g. 'red' → '#ef4444' (that's red.500)
function getBaseHex(colorName, shade = 500) {
  if( colorName.startsWith("#")){
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



export default function WorkspaceCard({workspace}) {
  const usersForWorkspace = MainStore().users().filter(d=>d.workspaces?.includes(workspace.id))

  const [color, setColor] = useState(workspace?.color ?? "slate")
  const baseHex = getBaseHex(color, 400);
  const [hex1, hex2] = getAnalogousStops(baseHex, 25);

  const gradient = `linear-gradient(
        to bottom right,
        ${hex1} 0%,
        ${baseHex} 50%,
        ${hex2} 100%
      )`

  let logo
  if( workspace.company ){
     logo = <Avatar
            isBordered={true}
            className="h-20 w-20 translate-y-12 logo"
            src={`/api/companyLogo?name=${workspace.company}`}
          />
      Vibrant.from(`/api/companyLogo?name=${workspace.company}`)
        .getPalette()
        .then((palette) => {
          const v = palette.Vibrant.hex
          if( v ){
            setColor(v)
          }
        })
        .catch((err) => console.error('Vibrant error:', err))
  }else if( workspace.avatarUrl ){
    logo = <Avatar
            className="h-20 w-20 translate-y-12  logo"
            src="https://i.pravatar.cc/150?u=a04258114e29026708c"
          />
  }else{
          logo = <Logo className={`logo w-20 h-20 shrink-0 mr-1 bg-white rounded-full translate-y-12 text-${workspace.color}-500 p-1 border-2`}/>

  }

  return (
    <div className="mx-6 my-4 flex h-[360px] w-[400px] items-start justify-center">
      <Card isPressable={true} isHoverable={true} className="w-full h-full">
        <CardHeader 
            className="relative flex h-[100px] flex-col justify-end overflow-visible "
             style={{ backgroundImage: gradient }}
             >
          {logo}
          <Button
            className="absolute right-3 top-3 bg-white/20 text-white dark:bg-black/20"
            radius="full"
            size="sm"
            variant="light"
          >
            Settings
          </Button>
        </CardHeader>
        <CardBody className="min-h-0">
          <div className="pb-4 pt-6 min-h-0 flex flex-col">
            <p className="text-large font-medium">{workspace.title}</p>
            {workspace.tags?.length > 0 && <div className="flex gap-2 pb-1 pt-2 h-9 overflow-hidden shrink-0">
              {(workspace.tags ?? []).map(d=><Chip variant="flat" size="sm">{d}</Chip>)}
            </div>}
            <ScrollShadow>
              <p className="py-2 text-small text-foreground flex-shrink overflow-y-scroll">
                {workspace.description}
                {"Your users deserve better than placeholder logos. Every missing logo is a chance for users to drop off. Stop losing signups to poor first impressions.Your users deserve better than placeholder logos. Every missing logo is a chance for users to drop off. Stop losing signups to poor first impressions."}
              </p>
            </ScrollShadow>
          </div>
            <div className="flex gap-2 mb-4">
              <p>
                <span className="text-small font-medium text-default-500">13</span>&nbsp;
                <span className="text-small text-default-400">Following</span>
              </p>
              <p>
                <span className="text-small font-medium text-default-500">2500</span>&nbsp;
                <span className="text-small text-default-400">Followers</span>
              </p>
            </div>
          <AvatarGroup max={3} size="sm" total={usersForWorkspace.length}>
            {usersForWorkspace.map(d=>(
              <Tooltip content={d.name} placement="bottom">
                  <Avatar src={d.avatarUrl} showFallback name={d.name}  imgProps={{ "referrerPolicy": 'no-referrer'}}/>
              </Tooltip>
            ))}
          </AvatarGroup>
        </CardBody>
      </Card>
    </div>
  );
}
