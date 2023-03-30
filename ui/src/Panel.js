import React from 'react';
import { Disclosure, Transition } from '@headlessui/react'
import {
  PencilIcon,
  ChevronRightIcon,
} from '@heroicons/react/20/solid'
import DropdownButton from './DropdownButton';


const Title = (props)=>(
            <h3 className={props.titleClassName || "w-full justify-between text-sm font-medium text-gray-500 flex"}>
              {props.title || "Details"}
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

export default function Panel({...props}){
  const ref = React.useRef()
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
          <div className='flex w-full'>
            <Disclosure.Button className='flex w-full'>
              <Title {...props} open={open}/>
            </Disclosure.Button>
              {props.titleButton && (
                props.titleButton instanceof Array
                ? 
                  <DropdownButton items={props.titleButton} className='shrink-0 grow-0 h-10' />
                :
                    <button
                      type="button"
                      className="shrink-0 grow-0 h-10 self-center rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      onClick={props.titleButton.action}
                    >
                      {props.titleButton.icon ? props.titleButton.icon : 
                        (props.titleButton.title || "Create new")
                      }
                    </button>
              )}
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