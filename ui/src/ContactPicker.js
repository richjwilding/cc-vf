import { Fragment, useState, useMemo, useRef, useEffect } from 'react'
import { Combobox, Dialog, Transition } from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { UsersIcon } from '@heroicons/react/24/outline'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import MainStore from './MainStore'
import ContactCard from './ContactCard'



function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function ContactPicker({mode, ...props}) {
  const [query, setQuery] = useState(props.startText || "")
  const [open, setOpen] = useState(true)
  const inputbox = useRef()

  const people = useMemo(()=>mode === "user" ? MainStore().users() : MainStore().contacts(), [])

  const filteredPeople =
    query === ''
      ? people
      : people.filter((person) => {
          return person.name.toLowerCase().includes(query.toLowerCase())
        })

    const selected = (person)=>{
        if( props.callback ){
            props.callback(person)
        }
        handleClose()
    }

    const handleClose = function(){
        if( props.setOpen ){
            props.setOpen(false)
        }else{
            setOpen(false)
        }
    }

  return (
    <Transition.Root show={props.setOpen ? true : open} as={Fragment} afterLeave={() => setQuery('')} appear>
      <Dialog as="div" className="relative z-50" onClose={handleClose} >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-25 transition-opacity" />
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
                className="mx-auto max-w-3xl transform divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black ring-opacity-5 transition-all">
              <Combobox onChange={selected}>
                {({ activeOption }) => (
                  <>
                    <div className="relative">
                      <MagnifyingGlassIcon
                        className="pointer-events-none absolute top-3.5 left-4 h-5 w-5 text-gray-400"
                        aria-hidden="true"
                      />
                      <Combobox.Input
                        ref={inputbox}
                        className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm focus:outline-none"
                        placeholder="Search..."
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>

                    {(query === '' || filteredPeople.length > 0) && (
                      <Combobox.Options as="div" static hold className="flex divide-x divide-gray-100">
                        <div
                          className={classNames(
                            'max-h-96 min-w-0 flex-auto scroll-py-4 overflow-y-auto px-6 py-4',
                            activeOption && 'sm:h-96'
                          )}
                        >
                          <div className="-mx-2 text-sm text-gray-700">
                            {filteredPeople.map((person) => (
                              <Combobox.Option
                                as="div"
                                key={person.id}
                                value={person}
                                className={({ active }) =>
                                  classNames(
                                    'flex cursor-default select-none items-center rounded-md p-2',
                                    active && 'bg-gray-100 text-gray-900'
                                  )
                                }
                              >
                                {({ active }) => (
                                  <>
                                    <img src={person.avatarUrl} alt="" className="h-6 w-6 flex-none rounded-full" />
                                    <span className="ml-3 flex-auto truncate">{person.name}</span>
                                    {active && (
                                      <ChevronRightIcon
                                        className="ml-3 h-5 w-5 flex-none text-gray-400"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </>
                                )}
                              </Combobox.Option>
                            ))}
                          </div>
                        </div>

                        {activeOption && (
                          <div className="hidden h-96 w-1/2 flex-none flex-col overflow-y-auto sm:flex">
                            <div className="flex flex-col py-2 px-6 border-t-[1px] border-gray-100 grow overflow-y-scroll">
                                <ContactCard contact={activeOption}/>
                            </div>
                            <div className="flex flex-auto p-6 border-t-[1px] border-gray-100 grow-0 shrink-0">
                              <button
                                type="button"
                                onClick={()=>selected(activeOption)}
                                className="w-full rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                              >
                                Select
                              </button>
                            </div>
                          </div>
                        )}
                      </Combobox.Options>
                    )}

                    {query !== '' && filteredPeople.length === 0 && (
                      <div className="py-14 px-6 text-center text-sm sm:px-14">
                        <UsersIcon className="mx-auto h-6 w-6 text-gray-400" aria-hidden="true" />
                        <p className="mt-4 font-semibold text-gray-900">No contacts found</p>
                        <p className="mt-2 text-gray-500">
                          We couldn’t find anything with that term. Please try again.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </Combobox>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
