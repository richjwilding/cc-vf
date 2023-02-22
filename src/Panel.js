import React from 'react';
import { Disclosure, Transition } from '@headlessui/react'
import {
  ChevronRightIcon,
} from '@heroicons/react/20/solid'

export default function Panel({...props}){
    const ref = React.useRef()
  if( !props.collapsable ){
    return (
        <div className={`${props.hideTitle ? "" : "mt-6"} ${props.className || ""}`}>
          {!props.hideTitle && 
            <h3 className="text-sm font-medium text-gray-500 flex w-full">
              {props.title || "Details"}
            </h3>}
            {props.children}
        </div>
    )

  }else{
    return (
      <Disclosure defaultOpen={props.open}>
      {({ open }) => (
        <div className={`mt-6 ${props.className || ""}`}>
          <Disclosure.Button className='flex'>
            <h3 className={props.titleClassName || "text-sm font-medium text-gray-500 flex"}>
              {props.title || "Details"}
              <ChevronRightIcon strokeWidth={2} className={`ml-1 w-5 h-5 ${open ? '-rotate-90 transform' : ''}`}/>
            </h3>
          </Disclosure.Button>
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