import MainStore from './MainStore';
import React from 'react';
import {
  ArrowTopRightOnSquareIcon,
  PencilIcon,
} from '@heroicons/react/20/solid'
import { HeroIcon } from './HeroIcon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'


let mainstore = MainStore()

  const RenderItemValue = ({item, ...props})=>{
    if( item.type === "boolean"){
      return (
        <dd className="text-gray-900">{item.value ? "Yes" : "No"}</dd>
      )

    }else if( item.type === "link"){
      return (
        <a key={item.id} href={item.value} target="_blank" className="rounded-full hover:opacity-75">
          <HeroIcon icon='DocumentTextIcon' className='w-6 h-6'/>
        </a>
      )

    }else if( item.type === "user"){
      let user = mainstore.user( item.value )
      return (
          <img
            className="inline-block h-6 w-6 rounded-full"
            src={user.avatarUrl}
            alt={user.name} />
      )

    }
    return (
      <dd className="text-gray-900">
        {item.icon && typeof(item.icon) === "object" && item.icon.library === "fa" && <FontAwesomeIcon icon={item.icon.icon} className='mr-1 text-slate-500'/>}
        {item.value}
      </dd>
    )
  }

const Relationships = function({primitive, ...props}){
    let temp = primitive.parentPrimitiveRelationships
    let map = primitive.metadata?.relationships 
    if( map == undefined ){return <></>}
    let relationships = Object.keys(map).map((k)=>{
      return {
        key: k,
        items: temp[k] || [],
        ...map[k]
      }
    })
  return (
         <>
          <h3 className="mt-6 font-medium text-gray-900">Signficance</h3>
            <div 
              className='grid'
              style={{gridTemplateColumns: `100% repeat(${relationships.length},minmax(min-content, '1fr') mt-2`}}
              >
              <div className='col-start-1 row-start-1 border-b-[1px] border-gray-200'></div>
              {
                relationships.map((set, idx)=>(
                  <div 
                    style={{gridColumnStart: idx + 2}}
                    className={`flex text-slate-400 font-medium place-items-center row-start-1 text-sm  px-2 py-px max-w-fit border-b-[1px] border-gray-200`}>
                      {set.title}
                  </div>
                ))
              }
              {
                relationships.map((r,idx)=>r.items.map((p)=>({item: p, relIdx: idx, set: r}))).flat().sort((a,b)=>a.item.id - b.item.id).map((wrapped, row_id)=>(
                    <>
                      <p
                      className='col-start-1 text-xs p-1 border-b-[1px] border-gray-200'
                      >
                        <PrimitiveCard primitive={wrapped.item} compact={true} disableHover={true} showLink={true}/>
                      </p>
                      {relationships.map((set,idx)=>(
                        <div 
                          className='place-items-center justify-center flex w-full h-full border-b-[1px] border-gray-200'
                          style={{gridColumnStart: idx + 2}}
                        >
                          {idx === wrapped.relIdx && <HeroIcon icon={wrapped.set.icon} style={{gridColumnStart: wrapped.relIdx + 2}} className={`place-self-center mr-0.5 p-1 max-w-6 w-6 h-6 m-0.5 rounded-[4em] bg-${wrapped.set.bgColor} text-${wrapped.set.textColor}`}/>}
                          {idx !== wrapped.relIdx && <div className={`max-w-2 w-2 h-2 rounded-[4em] bg-slate-200`}/>}
                        </div>

                      ))}
                    </>
                ))
              }
            </div>
        </>
  )
}
const Users = function({primitive, ...props}){

  let userContent
  if( props.asTable ){
    userContent = (
      <dl className="mt-2 mx-2 divide-y divide-gray-200 border-t border-b border-gray-200">
        {primitive.users.map((user)=>(
          <div className="flex justify-between py-3 text-sm font-medium relative place-items-center">
            <dt className="text-gray-500">{user.name}</dt>
              <img
                className="inline-block h-7 w-7 rounded-full right-0 absolute"
                src={user.avatarUrl}
                alt={user.name} />
          </div>
        ))}
      </dl>
    )
  }else{
    userContent = 
    <div className="flex space-x-2 mt-2 mx-2">
        {primitive.users.map((user) => (
          <a key={user.email} href={user.href} className="rounded-full hover:opacity-75">
            <img
              className="inline-block h-8 w-8 rounded-full"
              src={user.avatarUrl}
              alt={user.name} />
          </a>
        ))}
       </div>

  }

  return (<>
    <h3 className="mt-6 text-sm font-medium text-gray-900">{props.title || "Team"}</h3>
    {userContent}
  </>)
}
const Details = function({primitive, ...props}){
  let metadata = primitive.metadata
  let parameters = primitive.metadata?.parameters || undefined
  console.log(primitive, parameters)
  if( !parameters ){ return <></> }

  let details = Object.keys(parameters).reduce((h, k)=>{
    h[k] = {...parameters[k], value: primitive.refereceParameters[k], key: k}
    return h
  }, {})
  return (
         <>
         {!props.hideTitle && 
          <h3 className="mt-6 text-sm font-medium text-gray-900">{props.title || "Details"}</h3>
         }
          <dl className="mt-2 mx-2 divide-y divide-gray-200 border-t border-b border-gray-200">
            {Object.values(details).filter((item)=>item.value !== undefined).map((item)=>(
              <div className="flex justify-between py-3 text-sm font-medium">
                <dt className="text-gray-500">{item.title}</dt>
                <RenderItemValue item={item}/>
              </div>
            ))}
          </dl>
         {!props.hideFooter && 
          <h3 className={`flex text-slate-400 font-medium tracking-tight text-xs uppercase mt-2 place-items-center justify-end mt-2`}>
            {metadata.icon && <HeroIcon icon={metadata.icon} className='w-5 h-5 mr-1' strokeWidth={1}/>}
            {metadata.description}
          </h3>
          }
        </>
  )
}

export function PrimitiveCard({primitive, className, showState, showDetails, showUsers, showLink, showRelationships, major, compact, disableHover, showEdit, ...props}) {
  let color = primitive.stateInfo.colorBase || "gray"
  let details = undefined
  let category = undefined
  let ring = !disableHover
  let mainTextSize = compact ? 'sm' : 'md' 
  let margin = props.bigMargin ? (ring ? 'px-4 py-6' : 'px-2 py-3') : (ring ? 'px-2 py-3' : 'px-0.5 py-1')

  if( major ){
    margin = ""
    mainTextSize = "lg"
    ring = false
  }

  let relationships

  if( showRelationships){
  }



  return (
    <div className={
        [`bg-white rounded-lg ${margin}`,
          ring ? `hover:ring-1 hover:ring-${props.ringColor || 'slate'}-300 hover:subtle-shadow-bottom` : '',
          className].filter((d)=>d).join(' ')
        }>
      <h3 className={`flex text-slate-400 font-medium tracking-tight place-items-center text-${compact ? 'xs' : 'sm'}`}>
        {primitive.displayType} #{primitive.id}
        {showState && primitive.stateInfo.title && 
          <span className={`inline-flex items-center rounded-full bg-${color}-100 px-2 py-0.5 text-xs font-medium text-${color}-800 ml-3`}>
            {primitive.stateInfo.title}
        </span>
        }
        {(compact && (showLink || showEdit)) &&
          <button
              type="button"
              className="ml-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
              {showLink && !showEdit && <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />}
              {showEdit && <PencilIcon className="h-4 w-4" aria-hidden="true" />}
          </button>
        }
      </h3>
      <div className={`flex items-start justify-between space-x-3 ${compact ? 'mt-2' : 'mt-3'}`}>
        <p className={`text-slate-700 text-${mainTextSize}`}>
          {primitive.title}
        </p>
        {(!compact && (showLink || showEdit)) &&
          <button
              type="button"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
              {showLink && !showEdit && <ArrowTopRightOnSquareIcon className="h-5 w-5" aria-hidden="true" />}
              {showEdit && <PencilIcon className="h-5 w-5" aria-hidden="true" />}
          </button>
        }
      </div>
        {showRelationships && <PrimitiveCard.Relationships primitive={primitive}/>}
        {showDetails && <PrimitiveCard.Details primitive={primitive}/>}
        {showUsers && <PrimitiveCard.Users primitive={primitive}/>}
        {props.children}
    </div>
  )
}
PrimitiveCard.Details = Details
PrimitiveCard.Users = Users
PrimitiveCard.Relationships = Relationships