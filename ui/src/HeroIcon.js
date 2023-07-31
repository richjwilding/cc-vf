import * as icons from "@heroicons/react/24/outline";
import * as solid_icons from "@heroicons/react/24/solid";


const manual = {
  "FAGaugeHighIcon": (props)=>{
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" {...props}>
      <path d="M0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zM288 96a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM256 416c35.3 0 64-28.7 64-64c0-17.4-6.9-33.1-18.1-44.6L366 161.7c5.3-12.1-.2-26.3-12.3-31.6s-26.3 .2-31.6 12.3L257.9 288c-.6 0-1.3 0-1.9 0c-35.3 0-64 28.7-64 64s28.7 64 64 64zM176 144a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM96 288a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm352-32a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/>
    </svg>
  )},
  "FAUpRightAndDownLeftArrow":(props)=>{
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" {...props}>
      <path d="M344 0H488c13.3 0 24 10.7 24 24V168c0 9.7-5.8 18.5-14.8 22.2s-19.3 1.7-26.2-5.2l-39-39-87 87c-9.4 9.4-24.6 9.4-33.9 0l-32-32c-9.4-9.4-9.4-24.6 0-33.9l87-87L327 41c-6.9-6.9-8.9-17.2-5.2-26.2S334.3 0 344 0zM168 512H24c-13.3 0-24-10.7-24-24V344c0-9.7 5.8-18.5 14.8-22.2s19.3-1.7 26.2 5.2l39 39 87-87c9.4-9.4 24.6-9.4 33.9 0l32 32c9.4 9.4 9.4 24.6 0 33.9l-87 87 39 39c6.9 6.9 8.9 17.2 5.2 26.2s-12.5 14.8-22.2 14.8z"/>
    </svg>
  )},
  "LargeGrid":(props)=>{
    return (
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
      </svg>
    );
  },
  "LargeGrid":(props)=>{
    return (
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
      </svg>
    );
  },
  "Nest":(props)=>{
    return (
      <svg fill="currentColor" stroke="none" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path xmlns="http://www.w3.org/2000/svg" d="M21.736,16.4A5.009,5.009,0,0,0,17,13H13V11.916a6,6,0,1,0-2,0V13H7a5.009,5.009,0,0,0-4.736,3.4,4,4,0,1,0,2.447-.334A3,3,0,0,1,7,15h4v1.127a4,4,0,1,0,2,0V15h4a3,3,0,0,1,2.289,1.063,4,4,0,1,0,2.447.334ZM8,6a4,4,0,1,1,4,4A4,4,0,0,1,8,6ZM6,20a2,2,0,1,1-2-2A2,2,0,0,1,6,20Zm8,0a2,2,0,1,1-2-2A2,2,0,0,1,14,20Zm6,2a2,2,0,1,1,2-2A2,2,0,0,1,20,22Z"/>
      </svg>
    );
  }
}

export function HeroIcon({ icon, ...props }){    
  let Icon = icons[icon];
  if (!Icon){
    Icon = manual[icon];
  }
  if (!Icon) return <></>;
  return <Icon aria-hidden="true" {...props} />;
};

export function SolidHeroIcon({ icon, ...props }){    
  const Icon = solid_icons[icon];
  if (!Icon) return <></>;
  return <Icon aria-hidden="true" {...props} />;
};