import { EnvelopeIcon, PhoneIcon } from '@heroicons/react/20/solid'
import { Popover } from '@headlessui/react'
import { useState, Fragment, useEffect } from 'react'
import { usePopper } from 'react-popper'
import MainStore from './MainStore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {UserIcon} from '@heroicons/react/20/solid';

export function ContactPopover({contact, ...props}) {
    const [referenceElement, setReferenceElement] = useState(null);
    const [popperElement, setPopperElement] = useState(null);
    const [arrowElement, setArrowElement] = useState(null);
    const { styles, attributes } = usePopper(referenceElement, popperElement, { strategy: 'fixed',placement: "bottom",
      modifiers: [{ name: 'arrow', options: { element: arrowElement } }],
    });


    const angle = attributes.popper ? {
        "left": 315,
        "top": 45,
        "bottom": 225,
        "right": 135,
    }[attributes.popper['data-popper-placement']] : ""

    const tx = attributes.popper ? {
            transform: `${styles.arrow.transform} rotate(${angle}deg)`,
            left: attributes.popper['data-popper-placement'] === "right" ? "calc(-0.5rem - 1px)" : undefined,
            right: attributes.popper['data-popper-placement'] === "left" ? "calc(-0.5rem - 1px)" : undefined,
            bottom: attributes.popper['data-popper-placement'] === "top" ? "calc(-0.5rem - 1px)" : undefined,
            top: attributes.popper['data-popper-placement'] === "bottom" ? "calc(-0.5rem - 1px)" : undefined,
        } : {}

    return (
        <Popover as={Fragment}>
          {({ open }) => (
            <>
              <Popover.Button ref={setReferenceElement} className='flex place-items-center' tabIndex='-1'>
                {props.icon}
              </Popover.Button>
              <Popover.Panel
                      ref={setPopperElement}
                      style={{...styles.popper, zIndex: 100, visibility: attributes.popper && attributes.popper['data-popper-reference-hidden']===true ? "hidden" : undefined}}
                      {...attributes.popper}
              >
                    <div 
                        style={tx}
                        className='w-4 h-4 bg-white absolute border-blue-500 border-r-[1px] border-b-[1px]' ref={setArrowElement}/>
                    <div className='bg-white rounded-lg shadow-xl p-4 ring-1 ring-blue-500 min-w-[16em] max-w-[32em] '>
                        <ContactCard {...props}/>
                    </div>
                </Popover.Panel>
                </>
            )}
        </Popover>
    )
}

export default function ContactCard({contact, contactId, context, ...props}) {
    contact = contact || MainStore().contact(contactId)

    const value = contact

    const select = (e)=>{
        e.target.select()
    }
    const updateField = (e, field)=>{
        let newValue = e.target.value
        props.updateContact({
            ...value,
            [field]: newValue
        })
    }

    const listToPills = ( list, title )=> {
        if(!list){return <></>}
        return  (<div className={`mt-1 w-full flex ${title ? "" : "justify-center"}`}>
                {title && <p className='text-sm text-gray-500 py-0.5 mr-2'>{title}:</p>}
                <div className='col-span-3 flex flex-wrap'>
                            {list.map((s)=>(
                                <p key={s} className="my-0.5 mr-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                                    {s}
                                </p>
                            ))}
                    </div>
                </div>)
    }

  return (
        <>
            {value.avatarUrl && <img className="mx-auto h-28 w-28 flex-shrink-0 rounded-full mb-2 border-4 border-white" src={value.avatarUrl} alt="" />}
            {!value.avatarUrl && <UserIcon className="border-slate-500 text-slate-500 mx-auto h-28 w-28 flex-shrink-0 rounded-full mb-2 border-4 border-white"/>}
            <div className='w-full place-items-center text-center'>
                {!props.editable && 
                <h3 className={`text-lg font-medium ${props.editable && !value.name ? 'text-gray-500' : 'text-gray-900'}`}>
                    {value.name ? value.name : "Name"}
                    {value.profile && <a href={value.profile} onClick={(e)=>e.stopPropagation()} target="_blank" className="rounded-full hover:opacity-75 text-slate-500 hover:text-blue-600"><FontAwesomeIcon icon="fa-brands fa-linkedin" className='ml-1'/></a>}
                </h3>
                }
                {props.editable && 
                <input 
                        onFocus={select}
                        onChange={(e)=>updateField(e, "name")}
                        className={`text-lg font-medium text-gray-900`}
                        value = {value.name}
                        placeholder = "Name"
                    >
                </input>
                }
                {!props.editable && value.title && <p className="text-sm text-gray-500 justify-center">{value.title}</p>}
                {props.editable && 
                    <input 
                        onFocus={select}
                        onChange={(e)=>updateField(e, "title")}
                        className={`text-sm text-gray-900 justify-center`}
                        value = {value.title}
                        placeholder = "Title"
                        >
                    </input>}
                {listToPills(value.seniority)}
            </div>
          <div className="px-3 justify-center pt-4 pb-2">
            {listToPills(value.expertise, "Expertise")}
            {listToPills(value.domains, "Domains")}
        </div>
        </>

  )
}
