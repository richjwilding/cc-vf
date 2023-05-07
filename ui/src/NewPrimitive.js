import { CalendarIcon, CommandLineIcon, MegaphoneIcon } from '@heroicons/react/24/outline'
import { Dialog, Transition } from '@headlessui/react'
import {Fragment, useEffect, useState} from 'react';
import {
  ChevronRightIcon,
  XMarkIcon
} from '@heroicons/react/20/solid'
import MainStore from './MainStore';
import { HeroIcon } from './HeroIcon';

const olditems = [
  {
    name: 'Marketing Campaign',
    description: 'I think the kids call these memes these days.',
    href: '#',
    iconColor: 'bg-pink-500',
    icon: MegaphoneIcon,
  },
  {
    name: 'Engineering Project',
    description: 'Something really expensive that will ultimately get cancelled.',
    href: '#',
    iconColor: 'bg-purple-500',
    icon: CommandLineIcon,
  },
  {
    name: 'Event',
    description: 'Like a conference all about you that no one will care about.',
    href: '#',
    iconColor: 'bg-yellow-500',
    icon: CalendarIcon,
  },
]

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function NewPrimitive({...props}) {

    const items = MainStore().categories().filter((d)=>props.type === undefined || props.type === d.primitiveType).map((d)=>{
        return {
            name: d.title,
            categoryId: d.id,
            description: d.description,
            icon: d.icon,
            iconColor: 'bg-slate-500',
        }
    })

    async function create( item ) {
        console.log(`would create ${item.categoryId}`)
        const primitive = await MainStore().createPrimitive({
            type: props.type,
            categoryId: item.categoryId,
            parent: props.parent,
            parentPath: props.parentPath
        })
        if( props.done ){
            props.done(primitive)
        }
    }

    function closeModal() {
        if( props.cancel ){
            props.cancel()
        }
    }

    return (
        <Transition appear show={true} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={closeModal}>
            <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
            >
                <div className="fixed inset-0 bg-black bg-opacity-25" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
                <div className="flex min-h-full items-center justify-center p-4 text-center">
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0 scale-95"
                    enterTo="opacity-100 scale-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100 scale-100"
                    leaveTo="opacity-0 scale-95"
                >
                    <Dialog.Panel className="w-full max-w-md md:max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                        as="h3"
                        className="text-lg font-medium leading-6 text-gray-900"
                    >
                        Create a new {props.title || "item"}
                    </Dialog.Title>
                        <div className="mx-auto max-w-lg">
                            <p className="mt-1 text-sm text-gray-500">Get started by selecting a template or start from an empty {props.title || "item"}.</p>
                            <ul role="list" className="mt-6 divide-y divide-gray-200 border-b border-t border-gray-200">
                                {items.map((item, itemIdx) => (
                                <li key={itemIdx}>
                                    <div className="group relative flex items-start space-x-3 py-4 hover:bg-gray-50 px-2">
                                    <div className="flex-shrink-0">
                                        <span
                                        className={classNames(item.iconColor, 'inline-flex h-10 w-10 items-center justify-center rounded-lg')}
                                        >
                                        <HeroIcon icon={item.icon} className="h-6 w-6 text-white" aria-hidden="true" />
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium text-gray-900">
                                        <a onClick={()=>create(item) }>
                                            <span className="absolute inset-0" aria-hidden="true" />
                                            {item.name}
                                        </a>
                                        </div>
                                        <p className="text-sm text-gray-500">{item.description}</p>
                                    </div>
                                    <div className="flex-shrink-0 self-center">
                                        <ChevronRightIcon className="h-5 w-5 text-gray-400 group-hover:text-gray-500" aria-hidden="true" />
                                    </div>
                                    </div>
                                </li>
                                ))}
                            </ul>
                            <div className="mt-6 flex">
                                <a href="#" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                                Or start from an empty {props.title || "item"}
                                <span aria-hidden="true"> &rarr;</span>
                                </a>
                            </div>
                        </div>
                    <div className="flex flex-shrink-0 justify-end space-x-2 mt-1">
                        <button
                            type="button"
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            onClick={() => closeModal(null)}
                        >
                            Close
                        </button>
                      </div>
                    </Dialog.Panel>
                </Transition.Child>
                </div>
            </div>
            </Dialog>
        </Transition>
    )
}