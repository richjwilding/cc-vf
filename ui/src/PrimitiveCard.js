import MainStore from './MainStore';
import { RelationshipTable } from './RelationshipTable';
import React, { useEffect, useReducer } from 'react';
import Panel from './Panel';
import {ContactPopover} from './ContactCard';
import DropdownButton from './DropdownButton';
import {
  ArrowTopRightOnSquareIcon,
  PencilIcon,
  CheckIcon,
  UserIcon,
  PaperClipIcon,
  UserPlusIcon,
} from '@heroicons/react/20/solid'
import { HeroIcon, SolidHeroIcon } from './HeroIcon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { EvidenceCard } from './EvidenceCard';
import { Link, useLinkClickHandler } from "react-router-dom";
import EditableTextField from './EditableTextField';
import EditablePersonField from './EditablePersonField';
import EditableResourceField from './EditableResourceField';
import useDataEvent from './CustomHook';
import ContactPicker from './ContactPicker';
import QuestionCard from './QuestionCard';

const ExpandArrow = function(props) {
  return (
      <svg fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
        <path clipRule="evenodd" fillRule="evenodd" d="M15 3.75a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0V5.56l-3.97 3.97a.75.75 0 11-1.06-1.06l3.97-3.97h-2.69a.75.75 0 01-.75-.75zM9.53 14.47A.75.75 0 019.53 15.53L5.56 19.5h2.69a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75v-4.5a.75.75 0 011.5 0v2.69l3.97-3.97a.75.75 0 011.06 0z" />
      </svg>
  
  );
}

let mainstore = MainStore()

  const RenderItem = ({item, ...props})=>{
    let icon = item.icon && typeof(item.icon) === "object" && item.icon.library === "fa" && <FontAwesomeIcon icon={item.icon.icon} className='mr-1 text-slate-500'/>
      if( item.type === "boolean"){
        return (
          <dd className="text-gray-500 font-medium">{item.value ? "Yes" : "No"}</dd>
        )

      }else if( item.type === "link"){
        return <EditableResourceField
                {...props} 
                onSelect={(value)=>{
                    return props.primitive.setParameter(item.key, value ? value : null)
                }}
                  value = {item.value}
            />
        return (
          <a key={item.id} href={item.value} target="_blank" className="rounded-full hover:opacity-75 text-blue-500 hover:text-blue-600">
            <HeroIcon icon='DocumentTextIcon' className='w-6 h-6'/>
          </a>
        )

      }else if( item.type === "user"){
        let user = mainstore.user( item.value )
        return <EditablePersonField 
                {...props} 
                key={user ? user.id : "user"}
                mode = "user"
                value ={user} 
                onSelect={(value)=>{
                  props.primitive.setParameter(item.key, value ? value.id : null)
                }}
                className={`flex place-items-center ${props.inline ? "truncate" : ""} ${props.secondary ? "text-slate-400 text-xs font-medium" : `text-gray-${item.value ? "500" : "400"}  font-medium`}`}
              />

      }else if( item.type === "scale" || item.type === "progress"){
        if( props.editing ){
          return (
                  <input type="range" min="0" max="9" value={item.value || 0} step='1' className="range" onChange={(e)=>{
                    const value = e.currentTarget.value
                    props.primitive.setParameter(item.key, value)
                  }}/>
          )
        }
        const size = item.type === "scale" ? "w-6 h-6" : "w-8 h-8"
        const r = item.type === "scale" ? 19.2 : 25.6  
        const length = 3.14 * r 
        const thickness = item.type === "scale" ? 4 : 6
        const perc = parseInt(item.value) / 9
        const array = length * (1 - perc)
        const color = item.color || ["#f472b6","#f87171","#fbbf24","#22d3ee","#4ade80"][Math.floor(perc * 5)]
          return <div className='relative'>
              <svg className={size}>
                <circle cx='50%' cy='50%' r='40%' fill='none' stroke='#dedede' strokeWidth={thickness}/>
                <circle className='origin-center	-rotate-90' cx='50%' cy='50%' r='40%' fill='none' stroke={color} strokeWidth={thickness} strokeDashoffset={array} strokeDasharray={length}/>
              </svg>
              {item.type === "scale" && <p className='top-0 left-0 absolute text-center font-sm pt-0.5 w-full' style={{color: color}}>{item.value}</p>}
          </div>
      }else if( item.type === "contactName"){
        const contact = props.primitive.referenceParameters.contact
        if( props.compact ){
          icon = <UserIcon className='w-5 h-5 pr-0.5 text-slate-200'/> 
          let name = contact?.name || item.value
          return <div 
            className={`flex ${props.inline ? "truncate" : ""} ${props.secondary ? "text-slate-400" : ""}`}
          >{icon}{name}</div>
        }
      }else if( item.type === "contact"){
        const contact = props.primitive.referenceParameters.contact
        if( props.compact ){
          icon = <UserIcon className='w-5 h-5 pr-0.5 text-slate-200'/> 
          if( typeof(contact) === "object" ){
            //icon = <ContactPopover icon={<UserIcon className='w-5 h-5 text-blue-200 hover:text-blue-400'/>} contactId={contact?.id}/>
            icon = <ContactPopover contact={contact}/>
          }
          let name = contact?.name || item.value || item.default
          return <div className='flex space-x-1'>{icon}<p className={`ml-1 ${props.inline ? "truncate" : ""}`}>{name}</p></div>
        }
        return <EditablePersonField 
                {...props} 
                value ={ typeof(contact) === "object" ? contact : ""  } 
                key={contact ? contact.id : "contact"}
                onSelect={async function(value){
                  console.log( value)
                  if( value && value.id === undefined ){
                    console.log('Create new contat')
                    value = await MainStore().createContact(value)
                    if( value.id === undefined){
                      console.warn(`Couldnt add new contact ${value}`)
                      return
                    }
                    console.log(`got new id ${value.id}`)
                  }
                  return props.primitive.setParameter("contactId", value ? value.id : null )
                }}
                className={`flex place-items-center ${props.inline ? "truncate" : ""} ${props.secondary ? "text-slate-400 text-xs font-medium" : `text-gray-${item.value ? "500" : "400"}  font-medium`}`}
              />
      }else if( item.type === "currency" && !props.editing){
        let val = item.value
        let unit = ""
        if( val > 1000 ){
          val = val / 1000
          unit = "K"
        }
        if( val > 1000 ){
          val = val / 1000
          unit = "M"
        }
        return <>
              {item.key === "funding" && <HeroIcon icon="BanknotesIcon" className='w-5 h-5 mr-1'/>}
              {item.key === "valuation" && <HeroIcon icon="ArrowTrendingUpIcon" className='w-5 h-5 mr-1'/>}
                <p className='text-lg text-gray-800 font-semibold'>${val}{unit}</p>
              </>

      }
      
      return <EditableTextField
        {...props} 
        submitOnEnter={true} 
        value={item.value} 
        default={item.default} 
        icon={icon} 
        fieldClassName={`${props.compact ? "" :'text-end grow'} ${props.inline ? "truncate" : ""}`}
        callback={(value)=>{
            return props.primitive.setParameter(item.key, value)
        }}
        className={`flex place-items-center ${props.secondary ? "text-slate-400 text-xs font-medium" : `text-gray-${item.value ? "500" : "400"}  font-medium`}`}
      />

  }


const Resources = function({primitive, ...props}){
  let resources = primitive.resources
  if( resources === undefined ){return <></>}
  return (
      <div className="sm:col-span-2">
      <dt className="text-sm font-medium text-gray-500">Attachments</dt>
      <dd className="mt-1 text-sm text-gray-900">
        <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {resources.map((resource) => (
            <li
              key={resource.title}
              className="flex items-center justify-between py-3 pl-3 pr-4 text-sm"
            >
              <div className="flex w-0 flex-1 items-center">
                <PaperClipIcon className="h-5 w-5 flex-shrink-0 text-gray-400" aria-hidden="true" />
                <span className="ml-2 w-0 flex-1 truncate">{resource.title}</span>
              </div>
              <div className="ml-4 flex-shrink-0">
                <a href={resource.url} target="_blank" className="font-medium text-blue-500 hover:text-blue-600">
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </dd>
    </div>
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
    return <RelationshipTable title='Significance' relationships={relationships}/>
}
const Users = function({primitive, ...props}){
  const [editing, setEditing] = React.useState(props.editing)
  const [addUser, setAddUser] = React.useState(false)


  useEffect(()=>{
    setEditing(props.editing)
  }, [primitive.id, props.editing])

  let userContent
  if( props.asTable ){
    userContent = (
      <dl className="mt-2 mx-2 divide-y divide-gray-200 border-t border-b border-gray-200">
        {!editing && primitive.users.length === 0 &&
          <p className='py-3 text-center text-gray-400 text-sm'>Nothing to show</p>
        }
        {primitive.users.map((user)=>(
          <div key={user.email} className="flex justify-between py-3 text-sm relative place-items-center">
            <dt>{user.name}</dt>
              <img
                className="inline-block h-7 w-7 rounded-full right-0 absolute"
                referrerPolicy="no-referrer"
                src={user.avatarUrl}
                alt={user.name} />
          </div>
        ))}
        {editing &&
          <div key='adduser' className="flex justify-between py-3 text-sm relative place-items-center">
            <dt className='text-transparent'>Add user</dt>
              <UserPlusIcon
                onClick={()=>setAddUser(true)}
                className="inline-block h-7 w-7 p-1 rounded-full bg-gray-300 hover:bg-gray-500 text-white right-0 absolute"
                />
          </div>}
      </dl>
    )
  }else{
    userContent = 
    <div className={`flex space-x-2 ${props.className || 'mt-2 mx-2'}`}>
        {!editing && primitive.users.length === 0 &&
          <p className='w-8 h-8 justify-center place-items-center flex rounded-full text-gray-300 bg-gray-100 border border-gray-300 text-md'><UserIcon/></p>
        }
        {primitive.users.map((user) => (
          <a key={user.email} href={user.href} className="rounded-full hover:opacity-75">
            <img
              className="inline-block h-8 w-8 rounded-full"
              referrerPolicy="no-referrer"
              src={user.avatarUrl}
              alt={user.name} />
          </a>
        ))}
       </div>

  }
  if( props.hideTitle){
    return userContent
  }

  return (<>
    <Panel {...props} title={props.title || "Team"} editToggle={setEditing} editing={editing} hideTitle={props.hideTitle} >
      {userContent}
      {addUser && <ContactPicker allowNew={false} setOpen={()=>setAddUser(false)} callback={(d)=>alert(d)} mode="user"/>}
    </Panel>
  </>)
}

const Banner = function({primitive, ...props}){
  let metadata = primitive.metadata
  return (
    <div className={`flex items-center space-x-2 xs:space-x-5 ${props.className || ""}`}>
      {metadata &&
        <div className="flex-shrink-0">
          <div className="relative">
              <HeroIcon icon={metadata.icon} className={`${props.small ? "w-12 h-12" : "w-12 h-12 md:w-20 md:h-20"}`}/>
          </div>
        </div>
      }
      <div className='flex-grow w-full'>
        <h1 className={`flex place-items-center text-lg ${!props.small && "md:text-2xl"} font-bold text-gray-900`}><p className='hidden xs:inline'> {primitive.displayType} #{primitive.plainId}</p>
          {props.showLink &&
            <button
                type="button"
                className="ml-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Link to={`/item/${primitive.plainId}`}><ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" /></Link>
            </button>}
        </h1>
        <div className="text-xs md:text-sm font-medium text-gray-500">{metadata.title}<p className='hidden xs:inline'> - {metadata.description}</p></div>
      </div>
      {props.showStateAction &&
              <DropdownButton colorKey='colorBase' items={mainstore.stateInfo[primitive.type]} selected={primitive.state}/>
      }
    </div>
  )
}
const Parameters = function({primitive, ...props}){

  const [listEditable, setListEditable] = React.useState(props.editing)
  const [editing, setEditing] = React.useState()
  const [eventTracker, updateForEvent] = React.useReducer( (x)=>x+1, 0)
  const callbackId = React.useRef(null)

  React.useEffect(()=>{
    setListEditable(props.editing)
    if( !props.editing ){
      setEditing(null)
    }
  }, [props.editing])

  React.useEffect(()=>{
    if( !props.noEvents ){
      callbackId.current = mainstore.registerCallback(callbackId.current, "parameter_update", updateForEvent, primitive.id )
      return ()=>{
        mainstore.deregisterCallback(callbackId.current )
      }
    }
  }, [])


  let parameters = primitive.metadata?.parameters || undefined
  if( !parameters ){ return <></> }
  let fields = Object.keys(parameters).sort((a,b)=>(parameters[a].order === undefined ? 99 : parameters[a].order ) - (parameters[b].order === undefined ? 99 : parameters[b].order) )
  if( props.fields ){
    let remap = props.fields.reduce((o,f)=>{
      if( f instanceof Object){
        o = {...o,...f}
        Object.keys(f).forEach((k)=>{
          parameters[k].type = f[k]
        })
      }else{
        o[f] = f
      }
      return o
    },{})
    let keyNames = Object.keys(remap)
    fields = fields.filter((f)=>keyNames.includes(f))
  }
  let details = fields.map((k)=>{
    return {...parameters[k], value: primitive.referenceParameters[k], autoId: primitive.referenceParameters[`${k}Id`], key: k}
  })

  if( !props.editing ){
    details = details.filter((item)=>item.value !== undefined || item.default) 
  }else{
    details = details.filter((item)=>item.value || !item.extra) 
  }

  const listKeyHandler = (e, idx)=>{
    if(e.key === "Enter"){
      e.preventDefault()
      setEditing( idx )
    }
    if (e.key === 'ArrowDown') {
        e.currentTarget.nextSibling && e.currentTarget.nextSibling.focus()
    }
    if (e.key === 'ArrowUp') {
        e.currentTarget.previousSibling && e.currentTarget.previousSibling.focus()
    }
  }

  const stopEditing = (element)=>{
    element?.parentElement?.focus()
    setEditing( null )
  }

  if( details.length === 0){
    return <p className='py-3 text-center text-gray-400 text-sm'>Nothing to show</p>
  }

  return (
    details.map((item, idx)=>(
      <div 
        key={idx} 
        tabIndex={listEditable ? 1 : undefined}
        onDoubleClick={listEditable ? ()=>setEditing(idx) : undefined}
        onKeyDown={listEditable ? (e)=>listKeyHandler(e,idx) : undefined}
        className={[
          "flex text-sm place-items-center py-2",
          listEditable ? "hover:bg-gray-50 hover:outline-indigo-500" : "",
          props.className || ""
        ].join(" ")}
        >
        {(props.showTitles === undefined || props.showTitles === true) && <p className={`pl-1 mr-2 grow-0 ${props.showAsSecondary ? "text-xs" : ""}`}>{item.title}</p>}
        <RenderItem editing={editing === idx} stopEditing={stopEditing} primitive={primitive} compact={props.compact} showTitles={props.showTitles} item={item} inline={props.inline} secondary={(props.inline && idx > 0) || props.showAsSecondary}/>
        {props.inline && (idx < (details.length - 1)) && <p className='pl-1 text-slate-400'>•</p> }
      </div>
    )))
  
}
const EvidenceList = function({primitive, ...props}){
  let evidence = props.evidenceList || primitive?.primitives.allUniqueEvidence
  if( evidence === undefined || evidence === null || evidence.length === 0){return <></>} 
  let relatedTask = props.relatedTask || primitive?.findParentPrimitives({type: ["experiment", "activity"]})

  if( relatedTask && Array.isArray(relatedTask)){
    if( relatedTask.length > 1){
      console.warn(`Primitive ${primitive.id} has multiple tasks - defualting to first`)
    }
    relatedTask = relatedTask[0]
  }

  let evidenceCategories = relatedTask.metadata.evidenceCategories?.map((id)=>mainstore.category(id))

  let evidenceGroups = evidence.reduce((o, d)=>{
      let c = d._packed ? d.primitive : d
      if( c.metadata ){
        let evidenceType = c.metadata.id
        
        o[evidenceType] = o[evidenceType] || []
        o[evidenceType].push( d )
      }
      return o
    },{})

    if( evidenceCategories.length == 0 && Object.values(evidenceGroups).length === 0){
      return <></>
    }

  return (
         <div className={props.className || ""}>
         {!props.hideTitle && 
          <h3 className="mt-6 text-sm font-medium text-gray-500">{props.title || "Evidence"}</h3>
         }
         <div className='flex flex-col mt-1 overflow-y-scroll max-h-[inherit]'>
          {evidenceCategories.map((e)=>
            <div key={e.id} className='mx-1 my-0.5 p-1 bg-gray-50' >
              <p className='p-0.5 text-xs uppercase text-gray-500 w-full flex place-items-center mt-1 ml-0'><HeroIcon icon={e.icon} className='w-5 h-5 mr-1'/>{e.title}</p>
              {(evidenceGroups[e.id] === undefined || evidenceGroups[e.id].length === 0)
                && <p className='text-sm p-2 min-h-[3em] '>No items</p>
              }
              {(evidenceGroups[e.id] &&  evidenceGroups[e.id].length > 0) && 
                <div className={`p-2 w-full gap-3 ${props.frameClassName || ""} space-y-3 no-break-children`}>
                  {evidenceGroups[e.id].map((item)=>{
                    let origin
                    if( item._packed ){
                      origin = item.origin
                      item = item.primitive
                    }
                    return <PrimitiveCard key={item.id} primitive={item} compact={true} border={true} origin={props.showOriginInfo && (origin || item.origin)} showOriginInfo={props.showOriginInfo} relationshipTo={props.relationshipTo || primitive} relationshipMode={props.relationshipMode} relationshipPath='outcomes' fields={props.cardFields}/>
                  })}
                </div>
              }
            </div>
          )}
         </div>
        </div>
  )
}


const Evidence = function({primitive, ...props}){
  let evidence = props.evidenceList || primitive?.primitives.allUniqueEvidence
  if( evidence === undefined || evidence === null || evidence.length === 0){return <></>} 

  if( props.aggregate ){
    evidence = Object.values(evidence.reduce((o, c)=>{
      if( c.metadata ){

        let evidenceType = c.metadata.id
        
        o[evidenceType] = o[evidenceType] || {e:c , count: 0}
        o[evidenceType].count++
      }

      return o
    },{}))
  }else{
    evidence = evidence.map((e)=>({e:e, count: 1}))
  }

  return (
         <div>
         {!props.hideTitle && 
          <h3 className="mt-6 text-sm font-medium text-gray-500">{props.title || "Evidence"}</h3>
         }
         <div>
          {evidence.map((e)=><EvidenceCard key={e.e.id} evidence={e.e} count={e.count} asPill={true}/>)}
         </div>
        </div>
  )
}

const Details = function({primitive, ...props}){
  const [editing, setEditing] = React.useState(props.editing)

  useEffect(()=>{
    setEditing(props.editing)
  }, [primitive.id, props.editing])
  
  const eventTracker = useDataEvent(props.noEvents ? undefined : "set_parameter", primitive.id )
  let metadata = primitive.metadata
  let parameters = primitive.metadata?.parameters || undefined
  if( !parameters ){ return <></> }
  return (
        <Panel {...props} title={props.title || "Details"} editToggle={setEditing} editing={editing} hideTitle={props.hideTitle} >
          <dl className={`mt-2 mx-2 divide-y divide-gray-200 ${props.hideTitle ? "" : "border-t"} border-b border-gray-200`}>
            <Parameters primitive={primitive} editing={editing}/>
          </dl>
          {!props.hideFooter && 
            <h3 className={`flex text-slate-400 font-medium tracking-tight text-xs uppercase mt-2 place-items-center justify-end mt-2`}>
              {metadata.icon && <HeroIcon icon={metadata.icon} className='w-5 h-5 mr-1' strokeWidth={1}/>}
              {metadata.description}
            </h3>
            }
        </Panel>
  )
}

const Title = function({primitive, ...props}){
  let color = primitive.stateInfo?.colorBase || "gray"
  let relationshipConfig
  let relationship
  let metadataRender
  
  if( props.relationshipTo ){
    relationship = primitive.parentRelationship(props.relationshipTo)
    relationshipConfig = (props.relationships && props.relationships[ relationship ]) || {title: relationship, color: 'gray'}
  }
  if( props.relationship ){
    relationshipConfig =  (props.relationships && props.relationships[ props.relationship ]) || {title: props.relationship, color: 'gray'}
  }

  let relationshipRender
  if( props.relationshipMode === "presence"){
    const toggleRelationship = ()=>{
      if( props.relationshipTo ){
        if( relationship ){
          props.relationshipTo.removeRelationship( primitive, props.relationshipPath )
        }else{
          props.relationshipTo.addRelationship( primitive, props.relationshipPath )
        }
      }
    }
    if( relationship ){
      relationshipRender = <HeroIcon onClick={toggleRelationship} icon='StarIcon' className='ml-auto w-6 h-6 stroke-width-[0.5px] text-gray-600 hover:text-gray-900 fill-yellow-300 hover:fill-yellow-400'/>
    }else{
      relationshipRender = <HeroIcon onClick={toggleRelationship} icon='StarIcon' className='ml-auto w-6 h-6 text-gray-300 hover:text-gray-600'/>
    }
  }else{
    if( relationshipConfig ){
      relationshipRender = <span className={`inline-flex items-center rounded-full bg-${relationshipConfig.color}-100 px-2 py-0.5 text-xs font-medium text-${relationshipConfig.color}-800 ml-auto`}>
        {relationshipConfig.title}
      </span>
    }
  }
  if( props.showMetadataTitle ){
    let metadata = primitive.metadata
    metadataRender = <p className='ml-1 truncate opacity-0 group-hover:opacity-75 transition-opacity'>· {metadata.title}</p>
  }


  return (
      <h3 className={`flex text-slate-400 font-medium tracking-tight place-items-center text-${props.compact ? 'xs' : 'sm'} ${props.className}`}>
        {(props.showId === undefined || props.showId === true) && <p>{primitive.displayType} #{primitive.plainId}</p>}
        {(props.showId === "number") && <p>#{primitive.plainId}</p>}
        {props.showState && primitive.stateInfo.title && 
          <span className={`inline-flex items-center rounded-full bg-${color}-100 px-2 py-0.5 text-xs font-medium text-${color}-800 ml-3`}>
            {primitive.stateInfo.title}
        </span>
        }
        {relationshipRender}
        {metadataRender}
        {(props.compact && props.showLink) &&
          <button
              type="button"
              className="ml-1 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {props.showLink && <Link to={`/item/${primitive.plainId}`}><ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" /></Link>}
          </button>
        }
      </h3>
  )
}

const Hero = function({primitive, ...props}){
    const metadata = primitive.metadata
    return (<div 
        onClick={useLinkClickHandler(`/item/${primitive.plainId}`)}
        tabIndex='0'
        id={primitive.plainId}
        className={
        [
          "pcard group relative flex flex-col space-between",
          props.bg ? props.bg : 'bg-white',
          'w-96 min-h-[12em]',
          'rounded-lg',
          `focus:ring-2 ring-offset-4 focus:outline-none hover:ring-2 hover:ring-${props.ringColor || 'slate'}-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}`,
          "shadow border-[1px]",
          props.className].filter((d)=>d).join(' ')
        }>
          <div className='relative h-32 rounded-t-lg flex-0 text-indigo-900'>
            <div className='absolute pattern-isometric pattern-indigo-600 pattern-bg-indigo-500 pattern-opacity-20 pattern-size-8 h-full w-full rounded-t-lg'></div>
            <div className='absolute bottom-0 px-3 py-2 flex w-full'>
              {metadata && metadata.icon && <HeroIcon icon={metadata.icon} className='w-16 h-16' strokeWidth={0.8}/>}
              <div className='ml-2'>
                {metadata && <p className='text-2xl font-light'>{metadata.title}</p>}
                {metadata && <p className='text-lg font-light'>{metadata.description}</p>}
              </div>
            </div>
          </div>
          <p className='px-4 py-2 text-gray-800 text-lg my-2 flex-1'>{primitive.title}</p>
          <Users primitive={primitive} hideTitle={true} className='px-4'/>
          <Title primitive={primitive} showState={true} className='px-4 py-4 flex-0'/>
        </div>)
}

const Questions = function({primitive, ...props}){
  const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
  useDataEvent("set_field", props.relatedTo?.id, forceUpdate)
  let aiProcessSummary
  if(props.relatedTo ){
    if(props.relatedTo.analyzer){
      const analyzer = props.relatedTo.analyzer()
      if(analyzer.aiProcessSummary){
        aiProcessSummary = analyzer.aiProcessSummary() 
      }
    }
  }
    
  let button = aiProcessSummary ? 
    {action: ()=>{props.relatedTo.analyzer().analyzeQuestions()}, title: (aiProcessSummary.processed.length  + aiProcessSummary.unprocessed.length) > 0 ? "Reprocess"  : "Auto Process", small: true}
    : undefined

  if( props.relatedTo && props.relatedTo.ai_processing ){
    button = {action: ()=>{}, title: <div className=''><FontAwesomeIcon icon='spinner' className="animate-spin"/> Processing</div>, small: true}
    
  }

  return (
    <Panel key='analysis' title='Questions' collapsable={true} open={true} titleButton={button} titleClassName='w-full font-medium text-sm text-gray-500 pt-5 pb-2 flex place-items-center'>
      <dd className="mt-1 text-sm text-gray-900">
        <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {primitive.primitives.allQuestion.map((question, idx) => (
            <QuestionCard key={question.id} primitive={question} {...props} aiProcessSummary={aiProcessSummary}/>
          ))}
        </ul>
      </dd>
    </Panel>
  )
}

export function PrimitiveCard({primitive, className, showDetails, showUsers, showRelationships, showResources, major, disableHover, fields,...props}) {
  let ring = !disableHover
  let mainTextSize = props.textSize || (props.compact ? 'sm' : 'md' )
  let margin = props.bigMargin ? (ring ? 'px-4 py-6' : 'px-2 py-3') : (ring ? 'px-2 py-3' : 'px-0.5 py-1')

  const [eventTracker, updateForEvent] = React.useReducer( (x)=>x+1, 0)
  const [editing, setEditing] = React.useState(false)
  const callbackId = React.useRef(null)
  React.useEffect(()=>{
    if( !props.noEvents ){
      callbackId.current = mainstore.registerCallback(callbackId.current, "set_title set_parameter set_field", updateForEvent, primitive.id )
      return ()=>{
        mainstore.deregisterCallback(callbackId.current )
      }
    }
  }, [])



  let smallMeta
  let metadata
  if( props.showMeta){
    metadata = primitive.metadata
    if( props.showMeta !== "large" ){
      smallMeta = <h3 className={`flex text-slate-400 font-medium tracking-tight text-xs uppercase mt-2 place-items-center justify-end mt-2`}>
              {metadata.icon && <HeroIcon icon={metadata.icon} className='w-5 h-5 mr-1' strokeWidth={1}/>}
              {metadata.description}
            </h3>
    }

  }
  let titleAtBase = fields 

  if( major ){
    margin = ""
    mainTextSize = "lg"
    ring = false
  }
  let withHero = props.enableHero && primitive.metadata?.title === "Venture"
  if( withHero ){
    mainTextSize = '2xl'
  }

  const updateTitle = (newTitle )=>{
    primitive.title = newTitle
    return true
  }

  let content = (fields && !fields.includes('title')) ? undefined : 
      <>
        <EditableTextField 
          callback={updateTitle}
          editable={props.showEdit ? ()=> setEditing( true ) : undefined}
          stopEditing={()=>setEditing(false)}
          editing={editing}
          value = {primitive.title}
          className='w-full'
          compact={true}
          fieldClassName={`${(primitive.title || "").search(/\s/) == -1 ? "break-all" : "break-word"} grow text-${mainTextSize} ${withHero ? "px-2 self-end text-slate-50 font-bold" : "text-slate-700"}`}>
        </EditableTextField>
        {(!props.compact && (props.showLink || props.showEdit)) &&
          <button
              type="button"
              onClick={ props.showEdit ? ()=>setEditing(!editing) : undefined}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
              {props.showLink && !props.showEdit && <Link to={`/item/${primitive.plainId}`}><ArrowTopRightOnSquareIcon className="h-5 w-5" aria-hidden="true" /></Link>}
              {props.showEdit && !editing && <PencilIcon className="h-5 w-5" aria-hidden="true" />}
              {props.showEdit && editing && <CheckIcon className="h-5 w-5" aria-hidden="true" />}
          </button>
        }
      </>

  let header
  if(metadata ){
      header = <div className='flex'>
        <HeroIcon icon={metadata.icon} className='w-10 h-10 mr-2 shrink-0 grow-0 text-gray-400 ease-linear transition-colors  group-hover:text-gray-800' strokeWidth={1}/>
        <div>
          <div className={`flex items-start justify-between space-x-3`}>
            {content}
          </div>
          {!titleAtBase && !props.hideTitle && <Title primitive={primitive} {...props} showMetadataTitle={true} className='mt-1'/>} 
        </div>
      </div>

  }else{
    header = <>
              {!titleAtBase && !metadata && !props.hideTitle && <Title primitive={primitive} {...props}/>} 
              {content && 
                <div 
                  className={
                    withHero
                      ? "rounded-t-lg bg-gradient-to-br from-slate-900 to-slate-600 -mx-2 -mt-3 h-24 flex" 
                      : `flex items-start justify-between space-x-3 ${props.compact ? 'mt-2' : 'mt-3'}`
                  }>
                {content}
              </div>}
            </>
  }

  const handleEnter = (e)=>{
    if( e.key === "Enter"){
      e.preventDefault();
      e.stopPropagation()
      props.onEnter()
    }
  }

  const packedFields = fields ? fields.filter((d)=>d.indexOf(",") >= 0).map((d)=>d.split(",")).flat() : undefined
  fields = fields ? fields.filter((d)=> (d !== "title") && (d.indexOf(",") === -1)) : undefined

  return (
    <div 
        onClick={props.onClick }
        onKeyDown={props.onEnter ? handleEnter : undefined}
        tabIndex='0'
        id={primitive.plainId}
        className={
        [
          "pcard group relative",
          props.bg ? props.bg : 'bg-white',
          margin,
          props.flatBorder ? '' : 'rounded-lg',
          ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-${props.ringColor || 'slate'}-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
          props.border ? "shadow border-[1px]" : '',
          props.inline ? "flex space-x-2" : "",
          props.dragShadow ? "shadow-xl rotate-[-5deg]" : "",
          className].filter((d)=>d).join(' ')
        }>
        {props.showExpand && 

          <div 
            onClick={props.onEnter}
            className='absolute flex place-items-center justify-center right-0 top-0 mr-0.5 mt-0.5 w-5 h-5 text-slate-300 invisible group-hover:visible hover:text-blue-500 rounded-lg hover:bg-gray-100 active:bg-blue-500 active:text-gray-100'>
            <ExpandArrow 
              className='w-4 h-4'
            />
          </div>}
        {header}
      {fields && (packedFields === undefined || fields.length > 0) &&
        <div className={[
          props.inline ? `flex items-start justify-between space-x-1 w-max` : ``,
          props.fieldsInline ? `flex -ml-1 space-x-1 py-2` : ``, 
          ].join(" ")}>
            <Parameters primitive={primitive} noEvents={props.noEvents} inline={props.inline || props.fieldsInline} compact={true} showAsSecondary={props.showAsSecondary} asMain={true} fields={fields} showTitles={props.fieldsInline === true} className='!py-1'/>
        </div>
      }
      {packedFields &&  (packedFields.length > 0) &&
        <div className='flex -ml-1 space-x-1 py-2 justify-center'>
            <Parameters primitive={primitive} noEvents={props.noEvents} inline={true} compact={true} showAsSecondary={props.showAsSecondary} asMain={true} fields={packedFields} showTitles={false} className='!py-1'/>
        </div>
      }

        {props.showOriginInfo && 
          <div className='flex items-start space-x-1'>
            <PrimitiveCard.Parameters primitive={props.origin || primitive.origin} inline={true} showAsSecondary={true} noEvents={props.noEvents}  compact={true} showTitles={false} fields={props.showOriginInfo} />
          </div>}
        {showRelationships && <PrimitiveCard.Relationships primitive={primitive}/>}
        {showDetails && <PrimitiveCard.Details primitive={primitive}/>}
        {showUsers && <PrimitiveCard.Users primitive={primitive}/>}
        {showResources && <PrimitiveCard.Resources primitive={primitive}/>}
        {(props.showEvidence  === true) && <PrimitiveCard.Evidence primitive={primitive}/>}
        {(props.showEvidence  === "compact") && <PrimitiveCard.Evidence primitive={primitive} hideTitle={true} compact={true} aggregate={true}/>}
        {props.children}
        {titleAtBase && !props.hideTitle && <Title primitive={primitive} {...props} className={props.inline ? 'grow-0' : 'grow-0 mt-1'}/>}
        {smallMeta}
        {primitive._doingDiscovery && !primitive.discoveryDone && <div className='w-2 h-2 absolute bg-amber-500 rounded-lg right-1 top-1'/>}
        {primitive.openai_token_limit && <div className='w-2 h-2 absolute bg-red-500 rounded-lg right-1 top-1'/>}
    </div>
  )
}
PrimitiveCard.Details = Details
PrimitiveCard.Questions = Questions
PrimitiveCard.Parameters = Parameters
PrimitiveCard.Users = Users
PrimitiveCard.Relationships = Relationships
PrimitiveCard.Resources = Resources
PrimitiveCard.Banner = Banner
PrimitiveCard.Title = Title
PrimitiveCard.Hero = Hero
PrimitiveCard.Evidence = Evidence
PrimitiveCard.EvidenceList = EvidenceList
