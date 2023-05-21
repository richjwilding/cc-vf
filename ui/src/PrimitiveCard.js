import MainStore from './MainStore';
import { RelationshipTable } from './RelationshipTable';
import React, { useEffect, useReducer, useState } from 'react';
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
import { Link, useLinkClickHandler, useNavigate } from "react-router-dom";
import EditableTextField from './EditableTextField';
import EditablePersonField from './EditablePersonField';
import EditableResourceField from './EditableResourceField';
import useDataEvent from './CustomHook';
import ContactPicker from './ContactPicker';
import QuestionCard from './QuestionCard';
import { ArrowPathIcon,  ChevronRightIcon,  TrashIcon } from '@heroicons/react/24/outline';
import { Bars3Icon } from '@heroicons/react/20/solid';
import ConfirmationPopup from './ConfirmationPopup';
import AIProcessButton from './AIProcessButton';
import { Menu, Popover } from '@headlessui/react';
import { Float } from '@headlessui-float/react';
import PrimitivePicker from './PrimitivePicker';

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
                onSelect={async (value)=>{
                  await props.primitive.setParameter(item.key, value ? value.id : null)
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
        const contact = item.value || props.primitive?.referenceParameters.contact
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

  const CardMenu = function({primitive,...props}){
    const [showDeletePrompt, setShowDeletePrompt] = React.useState(false)
    const navigate = useNavigate();
    const buttonClass = `p-1 shrink-0 grow-0 self-center rounded-md border ${props.bg === "transparent" ? "border-transparent hover:border-gray-300 hover:bg-white hover:shadow-sm" :"border-gray-300 bg-white shadow-sm"} font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`

    const handleDelete = ()=>{
      mainstore.removePrimitive( primitive )
      setShowDeletePrompt( null )
    }

    const items = [
      {
        title: 'Delete',
        action: ()=>setShowDeletePrompt(true),
        icon: TrashIcon,
        skip: !((props.relatedTo && props.showDelete === 'origin' && primitive.origin.id === props.relatedTo.id) || (props.showDelete === undefined ? false : (props.showDelete === true)))
      },
      {
        title: `Unlink from ${props.relatedTo?.displayType}`,
        action: ()=>props.relatedTo.removeRelationship(primitive, props.relatedTo.metadata.isAggregation ? "" : "outcomes"),
        icon: TrashIcon,
        skip: (props.showUnlink === false || props.showUnlink === undefined) ? true : (props.relatedTo === undefined ) || (props.relatedTo && props.relatedTo.id === primitive.origin.id) || !(props.relatedTo && props.relatedTo?.primitives.includes(primitive))
      },
      {
        title: 'Open page',
        action: ()=>navigate(`item/${primitive.id}`),
        icon: ArrowTopRightOnSquareIcon,
        skip: props.showVisitPage === undefined ? false : !props.showVisitPage
      },
    ].filter((d)=>!d.skip)
    const baseColor = props.color || "gray"

    return(<>
      {showDeletePrompt && <ConfirmationPopup message={`This will also delete all items that belong to this ${primitive.displayType}`} title="Confirm deletion" confirm={handleDelete} cancel={()=>setShowDeletePrompt(false)}/>}
      <div className={[`h-${props.size || 8} w-${props.size || 8}`, 'shrink-0', props.className].join(" ")}>
        <Menu>
          {({open})=>(<>
          {!open && <Menu.Button key={`b-${open}`} onClick={(e)=>e.stopPropagation()} className={buttonClass}><Bars3Icon className='w-full h-full'/></Menu.Button>}
          {open && <Float portal placement='bottom-end'>
              <Menu.Button key={`b-${open}`} className={buttonClass}><Bars3Icon className='w-full h-full'/></Menu.Button>
              <Menu.Items className={`absolute z-10 p-1 mt-2  origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none right-0 w-min`}>
                <div className="py-1">
                  {items.map((item) => (
                    <Menu.Item>
                    {({ active }) => (
                      <a
                        href={item.href}
                        key={item.title}
                        onClick={(e)=>{e.stopPropagation();item.action && item.action()}}
                        className={[
                          active ? `bg-${baseColor}-100 text-${baseColor}-900` : `text-${baseColor}-700 bg-${props.colorKey ? `${baseColor}-50` : 'white' }`,
                          props.colorKey ? 'my-2 mx-1 rounded-md' : '',
                          'flex place-items-center space-x-2 px-2 py-1 text-sm'
                        ].join(" ")}
                      >
                        <item.icon aria-hidden="true" className='w-6 h-6'/>
                        <p className='whitespace-nowrap'>{item.title}</p>
                      </a>
                    )}
                    </Menu.Item>
                  ))}                  
                </div>
            </Menu.Items>
          </Float>}
          </>
          )}
      </Menu>
    </div>
    </>)

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
      {addUser && <ContactPicker allowNew={false} setOpen={()=>setAddUser(false)} callback={(d)=>primitive.users.find((c)=>c.id === d.id) ? primitive.removeUser(d) :  primitive.addUser(d)} mode="user"/>}
    </Panel>
  </>)
}

const Banner = function({primitive, ...props}){
  let metadata = primitive.metadata
  return (
    <div className={`flex items-center space-x-2 xs:space-x-5 ${props.className || ""}`}>
      {metadata &&
        <div className="flex-shrink-0">
          {metadata && <div className="relative">
              <HeroIcon icon={metadata.icon} className={`${props.small ? "w-12 h-12" : "w-12 h-12 md:w-20 md:h-20"}`}/>
          </div>}
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
        {metadata && <div className="text-xs md:text-sm font-medium text-gray-500">{metadata.title}<p className='hidden xs:inline'> - {metadata.description}</p></div>}
      </div>
      {props.showMenu &&
        <CardMenu primitive={primitive} showVisitPage={false} size='12' bg='transparent'/>
      }
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
  fields = fields.filter((d)=>!parameters[d].hidden)
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
  useDataEvent('relationship_update', evidence.map((d)=>d.id))
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
  
  const eventTracker = useDataEvent(props.noEvents ? undefined : ["set_parameter","set_field"], primitive.id )
  let metadata = primitive.metadata
  let parameters = primitive.metadata?.parameters || undefined
  if( !parameters ){ return <></> }
  
  const panelTitle = <>{props.title || "Details"}{metadata.do_discovery && <AIProcessButton active="discovery" primitive={primitive} process={(p)=>p.analyzer().doDiscovery({force: true})}/>}</>
  
  return (
        <Panel {...props} title={panelTitle} editToggle={setEditing} editing={editing} hideTitle={props.hideTitle} >
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
  const [showParentLinksManager, setShowParentLinksManager ] = useState(false)
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
    const manageParentLinks = ()=>{
      setShowParentLinksManager(true)
      
    }
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
      relationshipRender = <HeroIcon onClick={manageParentLinks} icon='StarIcon' className='ml-auto w-6 h-6 stroke-width-[0.5px] text-ccgreen-600 hover:text-ccgreen-900 fill-ccgreen-300 hover:fill-ccgreen-400'/>
    }else{
      //if( props.relationshipTo && props.relationshipTo.primitives.allUniqueEvidence.filter((d)=>d.metadata?.isAggregation).map((d)=>d.primitives.descendants).flat().map((d)=>d?.id).includes(primitive.id)){
      if( props.relationshipTo && props.relationshipTo.primitives.allUniqueEvidence.filter((d)=>d.metadata?.isAggregation && d.primitives.descendantsInclude(primitive.id)).length > 0){
        relationshipRender = <HeroIcon onClick={manageParentLinks} icon='StarIcon' className='ml-auto w-6 h-6 stroke-width-[0.5px] text-ccpurple-600 hover:text-ccpurple-900 fill-ccpurple-300 hover:fill-ccpurple-400'/>
      }else{
        relationshipRender = <HeroIcon onClick={manageParentLinks} icon='StarIcon' className='ml-auto w-6 h-6 text-gray-300 hover:text-gray-600'/>
      }
    }
  }else{
    if( relationshipConfig ){
      relationshipRender = <span className={`inline-flex items-center rounded-full bg-${relationshipConfig.color}-100 px-2 py-0.5 text-xs font-medium text-${relationshipConfig.color}-800 ml-auto`}>
        {relationshipConfig.title}
      </span>
    }
  }
  if( props.showMetadataTitle && primitive.metadata){
    let metadata = primitive.metadata
    metadataRender = props.showMetadataTitle === "full"
      ? <p className='ml-1 truncate'>{metadata.title}</p>
      : <p className='ml-1 truncate opacity-0 group-hover:opacity-75 transition-opacity'>· {metadata.title}</p>
  }


  return (
    <>
    {showParentLinksManager && <PrimitivePicker.ParentLinksManager primitive={primitive} rootTitle={`Related ${props.relationshipTo.displayType}`} includeRoot={true} setOpen={()=>setShowParentLinksManager(false)} type="evidence" root={props.relationshipTo}/>}
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
    </>
  )
}

const Hero = function({primitive, ...props}){
    const metadata = primitive.metadata
    const color = primitive.workspace?.color || "slate"
    const navigate = useNavigate();

    return (<div 
        onClick={(e)=>{
          navigate(`/item/${primitive.plainId}`)
        }}
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
          <div className={`relative h-32 rounded-t-lg flex-0 text-${color}-900`}>
            <div className={`absolute pattern-isometric pattern-${color}-600 pattern-bg-${color}-500 pattern-opacity-20 pattern-size-8 h-full w-full rounded-t-lg`}></div>
            <div className='absolute bottom-0 px-3 py-2 flex w-full'>
              {metadata && metadata.icon && <HeroIcon icon={metadata.icon} className='w-16 h-16' strokeWidth={0.8}/>}
              <div className='ml-2'>
                {metadata && <p className='text-2xl font-light'>{metadata.title}</p>}
                {metadata && <p className='text-lg font-light'>{metadata.description}</p>}
              </div>
            </div>
          </div>
          <CardMenu primitive={primitive} bg='transparent' className='absolute right-2 top-2'/>
          <p className='px-4 py-2 text-gray-800 text-lg my-2 flex-1'>{primitive.title}</p>
          <Users primitive={primitive} hideTitle={true} className='px-4'/>
          <Title primitive={primitive} showState={true} className='px-4 py-4 flex-0'/>
        </div>)
}

const Questions = function({primitive, ...props}){
  const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
  useDataEvent("set_field relationship_update", [props.relatedTo?.id, primitive.id], forceUpdate)
  let aiProcessSummary
  let analyzer

  if(props.relatedTo ){
    if(props.relatedTo.analyzer){
      analyzer = props.relatedTo.analyzer()
      if(analyzer.aiProcessSummary){
        aiProcessSummary = analyzer.aiProcessSummary() 
      }
    }
  }

  const createQuestion = async ()=>{
    const newPrim = await MainStore().createPrimitive({type: 'question', parent: primitive})
  }
    
  let button
  
  if( props.relatedTo && props.relatedTo !== primitive ){
    button = <AIProcessButton active="questions" primitive={props.relatedTo} process={(p)=>p.analyzer().analyzeQuestions()}/>
  }

  const list = primitive.primitives.allQuestion

  return (
    <Panel key='analysis' title={(<>Questions{button}</>)} collapsable={true} open={list && list.length > 0} titleButton={{title:'Create new',small:true,action: createQuestion}} titleClassName='w-full font-medium text-sm text-gray-500 pt-5 pb-2 flex place-items-center'>
      <dd className="mt-1 text-sm text-gray-900">
        <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {(list === undefined || list.length === 0) && 
            <div className='w-full p-2'>
              <button
              type="button"
              onClick={props.editable ? createQuestion : undefined}
              className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <span className="mt-2 block text-sm font-semibold text-gray-900">{props.editable ? 'Create a new Question' : 'Nothing to show'}</span>
            </button>
            </div>
          }
          {list.map((question, idx) => (
            <QuestionCard key={question.id} primitive={question} {...props} aiProcessSummary={aiProcessSummary}/>
          ))}
        </ul>
      </dd>
    </Panel>
  )
}

const Variant=({primitive, ...props})=>{
  if( primitive === undefined){return}
  if( primitive.type === 'prompt' ){
    return <Prompt primitive={primitive} {...props}/>
  }
  return <div>UNSUPPORTED</div>
}
export const Prompt = ({primitive, ...props})=>{
  const [editing, setEditing] = React.useState(false)
  const [confirmRemove, setConfirmRemove] = React.useState(false)
  const [deleteMessage, setDeleteMessage] = React.useState( "Are you sure you want to delete this prompt?" )
  const updateTitle = (newTitle )=>{
    primitive.title = newTitle
    return true
  }
  const textSize = props.editable ? "sm" : "xs"
  const itemCount = props.itemCount || 0
  const processed = props.processed || false
  const unprocessed = props.unprocessed || false
  const prompt = primitive
  const showAsEmpty = prompt.title === undefined || prompt.title === null || prompt.title.trim() === "" 
  const showEmptyAsPlaceholder = (props.editable === true) && !prompt.allowInput
  const processedNumbers = (processed + unprocessed ) > 1
  
  const handleRemove = async ()=>{
    await MainStore().removePrimitive( primitive )
    setConfirmRemove(false)
  }
  
  const promptConfirmRemove = ()=>{
    const evidence = primitive.primitives.allUniqueEvidence
    if( evidence.length > 0){
      setDeleteMessage(`Deletion of this prompt will also delete ${evidence.length} child items`)
    }

    setConfirmRemove(true)
  }

  return (
    <>
              <div key={prompt.id} className='w-full flex place-items-center mt-2 justify-between group'>
              <div key='summary' className={`flex text-${textSize} flex-0`}>
                  <p className={`p-1 pl-2 bg-gray-200 ${showAsEmpty && (!props.editable || !showEmptyAsPlaceholder) ? "rounded-md" : "rounded-l-md"} border border-gray-300`}> 
                      {showAsEmpty ? prompt.metadata.summaryEmpty : prompt.metadata.summary}
                  </p> 
                  {(showEmptyAsPlaceholder || !showAsEmpty) &&
                      <div className={`p-1 bg-white rounded-r-md border border-gray-300 ${props.editable ? 'pr-2' : ''}`}> 
                          {props.editable
                            ?  <EditableTextField 
                                callback={updateTitle}
                                editable={props.showEdit ? ()=> setEditing( true ) : undefined}
                                stopEditing={()=>setEditing(false)}
                                editing={editing}
                                value = {primitive.title}
                                default='<Add term>'
                                className='w-full'
                                compact={true}
                                fieldClassName={`${(primitive.title || "").search(/\s/) == -1 ? "break-all" : "break-word"} grow text-${textSize} text-slate-700`}>
                              </EditableTextField>
                            : prompt.title
                            }
                      </div>
                  }
              </div>
              { props.editable
              ?  <div className='flex space-x-2 invisible group-hover:visible'>
                  <button
                    key='edit'
                      type="button"
                      onClick={()=>setEditing( !editing )}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {editing ? <CheckIcon className="h-5 w-5" aria-hidden="true" /> : <PencilIcon className="h-5 w-5" aria-hidden="true" />}
                  </button>
                  <button
                    key='delete'
                      type="button"
                      onClick={promptConfirmRemove}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  > <TrashIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              : <div className='flex w-fit grow-0 place-items-center'>
                  {processedNumbers 
                    ? <div className='flex w-12 grow-0 place-items-center border bg-amber-100'>
                        <div key='status_p' style={{width: `${processed / (processed + unprocessed)*100}%`}} className={`flex place-items-center justify-center h-4 bg-green-400`}></div>
                      </div>
                    : <div key='status' className={`ml-auto w-3 h-3 rounded-full border ${processed ? "bg-green-200" : 'bg-amber-200'}`}/>
                  }
                  {(itemCount > 0) && <p key='count' className="flex hover:bg-indigo-600 hover:text-white justify-end ml-0.5 px-1 py-0.5 rounded-md shrink-0 text-indigo-700 text-xs">{itemCount} items</p>}
                  </div>
              }
            </div>
      {confirmRemove && <ConfirmationPopup title="Confirm deletion" confirm={handleRemove} message={deleteMessage} cancel={()=>setConfirmRemove(false)}/>}
     </>)
}

function Aggregation({primitive, ...props}){
  useDataEvent("relationship_update", primitive.id)
  const [show, setShow] = useState(false)
  if( !primitive.metadata?.isAggregation ){return <></>}
  const subList = primitive.primitives.allUniqueEvidence
  if( subList.length === 0 ){return <></>}
  return (<>
    <p 
      onClick={()=>setShow(!show)}
      className={[
      "text-xs text-gray-500 mt-1 flex place-items-center hover:text-gray-800 cursor-pointer",
    ].join(" ")
    }>{subList.length} Items<ChevronRightIcon className={`w-2.5 h-2.5 ml-0.5 mt-0.5 ${show ? "rotate-90" : ""}`}/></p>
    {show && <div 
      className={[
        'border-l-2 space-y-2 pt-2 mt-1 ml-1 pl-2',
        ].join(" ")}>
      {subList.map((d)=>(
        <PrimitiveCard primitive={d} textSize='sm' titleAtBase showMeta compact disableHover showMenu menuProps={{showVisitPage:false, showUnlink: true}} relatedTo={primitive} />
      ))}
      </div>}
  </>)
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



  let metaSummary
  let smallMeta
  let metadata
  if( props.showMeta){
    metadata = primitive.metadata
    if( metadata ){
      if( props.showMeta === "summary" ){
        metaSummary = <p className={`text-${mainTextSize} pl-1 font-medium`}>{metadata.summary}</p>
      }
      else if( props.showMeta !== "large" ){
        smallMeta = <h3 className={`flex text-slate-400 font-medium tracking-tight text-xs uppercase mt-2 place-items-center mt-2`}>
              {metadata.icon && <HeroIcon icon={metadata.icon} className='w-5 h-5 mr-1' strokeWidth={1}/>}
              {metadata.description}
            </h3>
      }
    } 
  }
  let titleAtBase = fields || props.titleAtBase

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
        {props.showMenu &&
          <CardMenu primitive={primitive} relatedTo={props.relatedTo} {...props.menuProps} size='6' bg='transparent' className='invisible group-hover:visible'/>
        }
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
  if(metadata && !smallMeta){
      header = <div className='flex'>
        <HeroIcon icon={metadata.icon} className={`${props.textSize === "sm" ? 'w-6 h-6' : 'w-10 h-10'} mr-2 shrink-0 grow-0 text-gray-400 ease-linear transition-colors  group-hover:text-gray-800`} strokeWidth={1}/>
        <div className='w-full'>
          <div className={`flex items-start justify-between ${props.compact ? "space-x-1" : "space-x-3"}`}>
            {metaSummary}
            {content}
          </div>
          {!titleAtBase && !props.hideTitle && <Title primitive={primitive} {...props} showMetadataTitle={props.showMetadataTitle === undefined ? true : props.showMetadataTitle} className='mt-1'/>} 
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
                      : `flex items-start justify-between ${props.compact ? "space-x-1" : "space-x-3"} ${props.compact ? 'mt-2' : 'mt-3'}`
                  }>
                {metaSummary}
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
        {primitive.openai_error && <div className='w-2 h-2 absolute bg-red-500 rounded-lg right-1 top-1'/>}
        {primitive.metadata?.isAggregation && <Aggregation primitive={primitive} {...props}/>}
    </div>
  )
}
PrimitiveCard.Variant = Variant
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
PrimitiveCard.RenderItem = RenderItem
