import * as icons from "@heroicons/react/24/outline";
import * as solid_icons from "@heroicons/react/24/solid";


const manual = {
  "FABullseye": (props)=>{
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" {...props}><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>
  )},
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
      <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path strokeLinecap="round" strokeLineJoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
      </svg>
    );
  },
  "LargeGrid":(props)=>{
    return (
      <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
      </svg>
    );
  },
  "Nest":(props)=>{
    return (
      <svg fill="currentColor" stroke="none" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path xmlns="http://www.w3.org/2000/svg" d="M21.736,16.4A5.009,5.009,0,0,0,17,13H13V11.916a6,6,0,1,0-2,0V13H7a5.009,5.009,0,0,0-4.736,3.4,4,4,0,1,0,2.447-.334A3,3,0,0,1,7,15h4v1.127a4,4,0,1,0,2,0V15h4a3,3,0,0,1,2.289,1.063,4,4,0,1,0,2.447.334ZM8,6a4,4,0,1,1,4,4A4,4,0,0,1,8,6ZM6,20a2,2,0,1,1-2-2A2,2,0,0,1,6,20Zm8,0a2,2,0,1,1-2-2A2,2,0,0,1,14,20Zm6,2a2,2,0,1,1,2-2A2,2,0,0,1,20,22Z"/>
      </svg>
    );
  },
  "Columns":(props)=>{
    return (
      <svg fill="currentColor" stroke="none" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path d="M19.5,2H4.5C2.019,2,0,4.019,0,6.5v11c0,2.481,2.019,4.5,4.5,4.5h15c2.481,0,4.5-2.019,4.5-4.5V6.5c0-2.481-2.019-4.5-4.5-4.5ZM4.5,3h15c1.93,0,3.5,1.57,3.5,3.5v.5H1v-.5c0-1.93,1.57-3.5,3.5-3.5ZM1,17.5V8H11.5v13H4.5c-1.93,0-3.5-1.57-3.5-3.5Zm18.5,3.5h-7V8h10.5v9.5c0,1.93-1.57,3.5-3.5,3.5Z"/>
      </svg>
    );
  },
  "Rows":(props)=>{
    return (
      <svg fill="currentColor" stroke="none" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path d="M19.5,2H4.5C2.019,2,0,4.019,0,6.5v11c0,2.481,2.019,4.5,4.5,4.5h15c2.481,0,4.5-2.019,4.5-4.5V6.5c0-2.481-2.019-4.5-4.5-4.5Zm3.5,4.5v4.5H6V3h13.5c1.93,0,3.5,1.57,3.5,3.5ZM1,17.5V6.5c0-1.93,1.57-3.5,3.5-3.5h.5V21h-.5c-1.93,0-3.5-1.57-3.5-3.5Zm18.5,3.5H6V12H23v5.5c0,1.93-1.57,3.5-3.5,3.5Z"/>
      </svg>
    );
  },
  "Eye":(props)=>{
    return (
      <svg fill="currentColor" stroke="none" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path d="M23.271,9.419C21.72,6.893,18.192,2.655,12,2.655S2.28,6.893.729,9.419a4.908,4.908,0,0,0,0,5.162C2.28,17.107,5.808,21.345,12,21.345s9.72-4.238,11.271-6.764A4.908,4.908,0,0,0,23.271,9.419Zm-1.705,4.115C20.234,15.7,17.219,19.345,12,19.345S3.766,15.7,2.434,13.534a2.918,2.918,0,0,1,0-3.068C3.766,8.3,6.781,4.655,12,4.655s8.234,3.641,9.566,5.811A2.918,2.918,0,0,1,21.566,13.534Z"/><path d="M12,7a5,5,0,1,0,5,5A5.006,5.006,0,0,0,12,7Zm0,8a3,3,0,1,1,3-3A3,3,0,0,1,12,15Z"/>
      </svg>
    );
  },
  "Puzzle":(props)=>{
    return (
      <svg fill="currentColor" stroke="none" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path d="M24,2.5c0-1.379-1.122-2.5-2.5-2.5h-7.5V4.46l.646-.196c.595-.182,1.119-.264,1.354-.264,.551,0,1,.448,1,1s-.449,1-1,1c-.235,0-.759-.082-1.354-.264l-.646-.196v4.46h3.136c-.086,.389-.136,.744-.136,1,0,1.103,.897,2,2,2s2-.897,2-2c0-.256-.05-.611-.136-1h3.136V2.5Zm-1,6.5h-3.459l.196,.646c.181,.595,.263,1.119,.263,1.354,0,.552-.449,1-1,1s-1-.448-1-1c0-.235,.083-.76,.263-1.354l.196-.646h-3.459v-2.137c.389,.087,.745,.137,1,.137,1.103,0,2-.897,2-2s-.897-2-2-2c-.255,0-.611,.05-1,.137V1h6.5c.827,0,1.5,.673,1.5,1.5v6.5Zm-8.263,5.646c.181,.595,.263,1.119,.263,1.354,0,.552-.449,1-1,1s-1-.448-1-1c0-.235,.083-.76,.263-1.354l.196-.646h-3.459V5H2.5c-1.378,0-2.5,1.121-2.5,2.5V24H19V14h-4.459l.196,.646ZM1,7.5c0-.827,.673-1.5,1.5-1.5h6.5V14h-2.136c.086-.389,.136-.744,.136-1,0-1.103-.897-2-2-2s-2,.897-2,2c0,.256,.05,.611,.136,1H1V7.5Zm8,15.5H1V15h3.459l-.196-.646c-.181-.595-.263-1.119-.263-1.354,0-.552,.449-1,1-1s1,.448,1,1c0,.235-.083,.76-.263,1.354l-.196,.646h3.459v2.137c-.389-.087-.745-.137-1-.137-1.103,0-2,.897-2,2s.897,2,2,2c.255,0,.611-.05,1-.137v2.137Zm6.864-8h2.136v8H10v-3.46l-.646,.196c-.595,.182-1.119,.264-1.354,.264-.551,0-1-.448-1-1s.449-1,1-1c.235,0,.759,.082,1.354,.264l.646,.196v-3.46h2.136c-.086,.389-.136,.744-.136,1,0,1.103,.897,2,2,2s2-.897,2-2c0-.256-.05-.611-.136-1Z"/>
      </svg>
    );
  },
  "Layers":(props)=>{
    return (
      <svg fill="currentColor" stroke="none" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path d="M22.485,10.975,12,17.267,1.515,10.975A1,1,0,1,0,.486,12.69l11,6.6a1,1,0,0,0,1.03,0l11-6.6a1,1,0,1,0-1.029-1.715Z"/><path d="M22.485,15.543,12,21.834,1.515,15.543A1,1,0,1,0,.486,17.258l11,6.6a1,1,0,0,0,1.03,0l11-6.6a1,1,0,1,0-1.029-1.715Z"/><path d="M12,14.773a2.976,2.976,0,0,1-1.531-.425L.485,8.357a1,1,0,0,1,0-1.714L10.469.652a2.973,2.973,0,0,1,3.062,0l9.984,5.991a1,1,0,0,1,0,1.714l-9.984,5.991A2.976,2.976,0,0,1,12,14.773ZM2.944,7.5,11.5,12.633a.974.974,0,0,0,1,0L21.056,7.5,12.5,2.367a.974.974,0,0,0-1,0h0Z"/>
      </svg>
    );
  },
  "FunnelPlus":(props)=>{
    return (
      <svg fill="currentColor" stroke="none" strokeWidth="2" viewBox="0 0 640 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path d="M0 73.7C0 50.7 18.7 32 41.7 32c142.9 0 285.7 0 428.6 0c23 0 41.7 18.7 41.7 41.7c0 9.6-3.3 18.9-9.4 26.3c-31.2 38.4-62.5 76.7-93.7 115C355.8 245.3 320 302.5 320 368c0 26.2 5.7 51 16 73.4c0 2.1 0 4.2 0 6.3c0 17.8-14.5 32.3-32.3 32.3c-7.3 0-14.4-2.5-20.1-7c-30.8-24.5-61.7-48.9-92.5-73.4c-9.6-7.6-15.1-19.1-15.1-31.3c0-21.3 0-42.5 0-63.8C120.5 236.3 64.9 168.2 9.4 100C3.3 92.6 0 83.3 0 73.7zM55 80c54.5 66.9 109.1 133.9 163.6 200.8c3.5 4.3 5.4 9.6 5.4 15.2c0 22.8 0 45.6 0 68.4c21.3 16.9 42.7 33.9 64 50.8c0-39.7 0-79.5 0-119.2c0-5.5 1.9-10.9 5.4-15.2C347.9 213.9 402.5 146.9 457 80L55 80zM352 368c0-79.5 64.5-144 144-144s144 64.5 144 144s-64.5 144-144 144s-144-64.5-144-144zm64 0c0 8.8 7.2 16 16 16c16 0 32 0 48 0c0 16 0 32 0 48c0 8.8 7.2 16 16 16s16-7.2 16-16c0-16 0-32 0-48c16 0 32 0 48 0c8.8 0 16-7.2 16-16s-7.2-16-16-16c-16 0-32 0-48 0c0-16 0-32 0-48c0-8.8-7.2-16-16-16s-16 7.2-16 16c0 16 0 32 0 48c-16 0-32 0-48 0c-8.8 0-16 7.2-16 16z"/>
      </svg>
    );
  },

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