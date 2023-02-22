import { EnvelopeIcon, PhoneIcon } from '@heroicons/react/20/solid'
import { Popover } from '@headlessui/react'
import { useState, Fragment } from 'react'
import { usePopper } from 'react-popper'
import MainStore from './MainStore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

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
              <Popover.Button ref={setReferenceElement}>
                {props.icon}
              </Popover.Button>
              <Popover.Panel
                      ref={setPopperElement}
                      style={{...styles.popper, zIndex: 100, visibility: attributes.popper && attributes.popper['data-popper-reference-hidden']===true ? "hidden" : undefined}}
                      {...attributes.popper}
              >
                    <div 
                        style={tx}
                        className='w-4 h-4 bg-white absolute border-blue-500 border-r-2 border-b-2' ref={setArrowElement}/>
                    <div className='bg-white rounded-lg shadow-xl p-4 ring-2 ring-blue-500'>
                        <ContactCard {...props}/>
                    </div>
                </Popover.Panel>
                </>
            )}
        </Popover>
    )
}

export default function ContactCard({contact, contactId, ...props}) {
    contact = contact || MainStore().contact(contactId)
  return (
        <>
          <div className="flex flex-1 flex-col p-4 w-72">
            <img className="mx-auto h-24 w-24 flex-shrink-0 rounded-full" src={contact.avatarUrl} alt="" />
            <h3 className="mt-6 text-center text-sm font-medium text-gray-900">
                {contact.name}
                {contact.profile && <a href={contact.profile} onClick={(e)=>e.stopPropagation()} target="_blank" className="rounded-full hover:opacity-75 text-slate-500 hover:text-blue-600"><FontAwesomeIcon icon="fa-brands fa-linkedin" className='ml-1'/></a>}
            </h3>
            <dl className="mt-1 text-center flex flex-grow flex-col justify-between">
              {contact.title && <dd className="text-sm text-gray-500">{contact.title}</dd>}
            </dl>
              <dl className="mt-3 flex flex-wrap space-x-1 justify-center">
                {contact.expertise && contact.expertise.map((e)=>(
                    <p className="my-0.5 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        {e}
                    </p>
                ))}
                </dl>
          </div>
          <div>
            <div className="-mt-px flex divide-x divide-gray-200">
              <div className="flex w-0 flex-1">
                <a
                  href={`mailto:${contact.email}`}
                  className="relative -mr-px inline-flex w-0 flex-1 items-center justify-center rounded-bl-lg border border-transparent py-4 text-sm font-medium text-gray-700 hover:text-gray-500"
                >
                  <EnvelopeIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  <span className="ml-3">Email</span>
                </a>
              </div>
              <div className="-ml-px flex w-0 flex-1">
                <a
                  href={`tel:${contact.telephone}`}
                  className="relative inline-flex w-0 flex-1 items-center justify-center rounded-br-lg border border-transparent py-4 text-sm font-medium text-gray-700 hover:text-gray-500"
                >
                  <PhoneIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                  <span className="ml-3">Call</span>
                </a>
              </div>
            </div>
          </div>
        </>

  )
}
