import * as icons from "@heroicons/react/24/outline";
import * as solid_icons from "@heroicons/react/24/solid";

export function HeroIcon({ icon, ...props }){    
  const Icon = icons[icon];
  if (!Icon) return <></>;
  return <Icon aria-hidden="true" {...props} />;
};

export function SolidHeroIcon({ icon, ...props }){    
  const Icon = solid_icons[icon];
  if (!Icon) return <></>;
  return <Icon aria-hidden="true" {...props} />;
};