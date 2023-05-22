
import React from 'react';
import { HeroIcon } from './HeroIcon';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function EvidenceCard({evidence, ...props}) {
  let config = evidence.metadata
  let details = props.details === undefined ? true : props.details
  let bgColor = props.bgColor === undefined ? "slate-400" : props.bgColor
  let textColor = props.iconColor === undefined ? "white" : props.iconColor
  let icon = config?.icon
  let value = undefined


  if( config?.type === "quantitative" && evidence.referenceParameters ){
    value = evidence.referenceParameters.value
  }
  if(props.sentiment === "positive"){
    icon = "HandThumbUpIcon"      
  }
  if(props.sentiment === "negative"){
    icon = "HandThumbDownIcon"      
    bgColor = 'orange-400'
    textColor = 'white'
  }

  if( props.asPill){
    textColor = "slate-500"
    bgColor = "white"//"slate-100"
    let showMulti = props.count && props.count > 1
    return (
    <div  onClick={props.onClick} className={`min-w-max rounded-2xl bg-${bgColor} hover:shadow-md hover:ring-1 ring-slate-300 hover:ring-slate-900/20 my-0.5 mr-2 w-fit inline-flex`}>
        <div key='icon' className={`flex flex-shrink-0 items-center`}>
          <HeroIcon strokeWidth={1.5} icon={icon} className={`w-6 h-6 text-${textColor} ${showMulti ? "pl-1" : "px-0.5"}`}/>
          {showMulti && <p className={`text-${textColor} text-xs pr-1`}>x{props.count}</p>}
        </div>
    </div>

    )
  }


  return (
    <div  onClick={props.onClick} className="min-w-max rounded-2xl bg-white shadow hover:shadow-md ring-1 ring-slate-900/5 hover:ring-slate-900/20 m-2 w-fit inline-flex">
      <div className="flex space-x-1 min-w-max ">
        <div key='icon' className={`flex flex-shrink-0 bg-${bgColor} rounded-l-2xl items-center`}>
          <HeroIcon strokeWidth={1} icon={icon} className={`${details ? 'w-10 h-10' : 'w-7 h-7'} text-${textColor} p-1`}/>
        </div>
        <div key='content' className={`min-w-max flex-1 ${details ? "py-2 pr-3" : "py-1 pr-2"} pl-1 select-none`}>
          <p key='name' className="text-sm font-medium text-gray-900 ">
              {config?.title}
              {props.count !== undefined && props.count > 1 &&
              <span className="ml-1 inline-flex items-center rounded-full bg-gray-200 px-2.5 py-px text-xs font-medium text-gray-800">
                x{props.count}
              </span>}
          </p>
          {details && <p key='desc' className="text-xs text-gray-500">
            {config?.description}
          </p>}
        </div>
      </div>
    </div>
  )
}
