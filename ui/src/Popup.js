import {Dialog, Transition } from '@headlessui/react'
import { Fragment, useState, cloneElement } from 'react'
function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function Popup({metric, primitive,...props}) {
  const [open, setOpen] = useState(true)

  const handleClose = function(){
      if( props.setOpen ){
          props.setOpen(false)
      }else{
          setOpen(false)
      }
  }

  return (

    <Transition.Root show={props.setOpen ? true : open} as={Fragment} appear>
      <Dialog as="div" className="relative z-50" onClose={()=>{}} >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-25 transition-opacity backdrop-blur-sm " />
        </Transition.Child>

        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel 
              onDoubleClick={(e)=>e.stopPropagation()}
              className={[
                "min-w-[14em] mx-auto  transform rounded-xl bg-white shadow-2xl ring-1 ring-black ring-opacity-5 transition-all @container",
                props.width === undefined ? "max-w-2xl" : props.width,
                props.padding === undefined ? "p-6" : props.padding,
                ].join(" ")}>
                {props.title && <h3 className='text-lg mb-4 font-semibold'>{props.title}</h3>}
                {props.children instanceof Function ? props.children({
                    handleClose: handleClose,
                }) : props.children}
                
                
                {props.showCancel &&
                <div className="flex flex-shrink-0 justify-between space-x-2 pt-4 mt-1">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                        {props.cancelText || "Cancel"}
                    </button>
                </div>
                }
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  )
}