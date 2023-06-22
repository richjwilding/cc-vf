import React from 'react';
import { Disclosure, Transition } from '@headlessui/react'
import {
  ChevronRightIcon,
} from '@heroicons/react/20/solid'
import { PencilIcon } from "@heroicons/react/24/outline";
import DropdownButton from './DropdownButton';
import { ArrowsPointingOutIcon } from '@heroicons/react/24/outline';


const Title = (props)=>(
            <h3 className={
              props.titleClassName || 
                `w-full ${props.titleButton ? "" : "justify-between"} text-gray-500 flex place-items-center font-medium ${props.major ? 'text-md px-0.5' : 'text-sm' }`
                }>
                {props.count !== undefined  
                    ? <div className='flex'>{props.title || "Details"}<span className="inline-flex items-center rounded-full bg-gray-200 ml-2 my-0.5 px-2 py-0.5 text-xs font-medium text-gray-400">{props.count}</span></div>
                    : <div className='flex'>{props.title || "Details"}</div>
                }
              {props.editButton &&
                <div
                    key='edit' 
                    type="button"
                    onClick={props.editButton}
                    className="flex ml-auto h-6 w-6 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <PencilIcon className="h-4 w-4" aria-hidden="true" />
                </div>
              }
              {props.editToggle &&
              (props.editing 
                ? <PencilIcon
                  onClick={()=>props.editToggle(false)}
                  className="h-4 w-4 text-indigo-500 hover:text-indigo-800 " aria-hidden="true"
                  />
                  : <PencilIcon
                  onClick={()=>props.editToggle(true)}
                  className="h-4 w-4 invisible text-slate-300 group-hover:visible hover:text-slate-500 " aria-hidden="true"
                  />)
              }
              {props.collapsable && <ChevronRightIcon strokeWidth={2} className={`ml-1 w-5 h-5 ${props.open ? '-rotate-90 transform' : ''}`}/>}
            </h3>
)


const MenuButton = (props)=>{
  return (
                    <button
                      type="button"
                      className={
                        [
                          props.small ? "text-xs h-8 py-1 px-2" : "text-sm h-10 py-2 px-4 ",
                          `shrink-0 grow-0 self-center rounded-md border border-gray-300 bg-white font-medium text-gray-600 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`
                        ].join(" ")
                      }
                      onClick={props.action || props.onClick}
                    >
                      {props.icon ? props.icon : 
                        (props.title || "Create new")
                      }
                    </button>
    )

}


export default function Panel({...props}){
  const ref = React.useRef()
  const toggleRef = React.useRef()

  const titleButton = props.titleButton && props.titleButton instanceof Array && props.titleButton.length === 1 ? props.titleButton[0] : props.titleButton


  const ensureOpen = ()=>{
    if( toggleRef.current && !ref.current){
      toggleRef.current.click()
    }
  }

  if( !props.collapsable ){
    return (
        <div className={`group ${props.hideTitle ? "" : "mt-6"} ${props.className || ""}`}>
          {!props.hideTitle && <Title {...props}/> }
            {props.children}
        </div>
    )

  }else{
    return (
      <Disclosure defaultOpen={props.open}>
      {({ open }) => (
        <div className={`mt-6 ${props.className || ""}`}>
          <div className='flex w-full place-items-center space-x-2'>
            <Disclosure.Button className='flex w-full' ref={toggleRef}>
              <Title {...props} open={open}/>
            </Disclosure.Button>
              {titleButton && (
                titleButton instanceof Array
                ? 
                  <DropdownButton items={titleButton.map((d)=>{return {...d, action:()=>{ensureOpen();d.action()}}})} className='shrink-0 grow-0 h-10' />
                : <MenuButton title={titleButton.title} icon={titleButton.icon} action={()=>{ensureOpen();titleButton.action()}} small={titleButton.small}/>
              )}
              {props.expandButton && <MenuButton icon={<ArrowsPointingOutIcon className='w-4 h-4 -mx-1'/>} action={()=>{props.expandButton()}} />}
          </div>
          <Transition
            enter="transition duration-100 ease-out"
            enterFrom="transform scale-95 opacity-0"
            enterTo="transform scale-100 opacity-100"
            leave="transition duration-75 ease-out"
            leaveFrom="transform scale-100 opacity-100"
            leaveTo="transform scale-95 opacity-0"
            afterEnter={()=>{
                ref.current.classList.remove('scale-100','transform','opactity-100')
            }}
            ref={ref}
          >
            <Disclosure.Panel>
                {props.children}
            </Disclosure.Panel>
          </Transition>
        </div>
      )}
      </Disclosure>
    )
  }
}
Panel.MenuButton = MenuButton