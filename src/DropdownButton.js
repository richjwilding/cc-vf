import { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'


function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function DropdownButton({...props}) {
    let items = props.items 
    let baseColor = "gray"
    let colors = props.major ? "bg-blue-600 border-blue-50  text-white hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-gray-100" : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50 focus:border-indigo-500 focus:ring-indigo-500"
    if( !(items instanceof(Array)) ){
        items = Object.keys(items).map((k)=>{
            return {
                ...items[k],
                selected: items[k].selected || props.selected === k,
                key: items[k].key || k,
            }
        })
    }
    if( props.colorKey ){
        baseColor = items.find((d)=>d.selected)[props.colorKey] || "gray"
        colors = `bg-${baseColor}-200 border-${baseColor}-400  text-${baseColor}-800 hover:bg-${baseColor}-300 focus:ring-${baseColor}-700 focus:ring-offset-${baseColor}-700` 
    }

  return (
    <div className="inline-flex rounded-md shadow-sm">
      <button
        type="button"
        className={`relative inline-flex items-center rounded-l-md border  px-4 py-2 text-sm font-medium focus:z-10 focus:outline-none focus:ring-2  focus:ring-offset-2 ${colors}`}
      >
        {(items.find((d)=>d.selected) || props.items[0]).title}
      </button>
      <Menu as="div" className="relative -ml-px block">
        <Menu.Button className={`relative inline-flex items-center rounded-r-md border px-2 py-2 text-sm font-medium focus:z-10 focus:outline-none  ${colors}`}>
          <span className="sr-only">Open options</span>
          <ChevronDownIcon className="h-5 w-5" aria-hidden="true" />
        </Menu.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className="absolute right-0 z-10 mt-2 -mr-1 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            <div className="py-1">
              {items.map((item) => {
                let baseColor =  props.colorKey ? (item[props.colorKey] || "gray") : "gray"
                return (
                <Menu.Item key={item.key}>
                  {({ active }) => (
                    <a
                      href={item.href}
                      className={classNames(
                        active ? `bg-${baseColor}-100 text-${baseColor}-900` : `text-${baseColor}-700 bg-${props.colorKey ? `${baseColor}-50` : 'white' }`,
                        props.colorKey ? 'my-2 mx-1 rounded-md' : '',
                        'block px-4 py-2 text-sm'
                      )}
                    >
                      {item.title}
                    </a>
                  )}
                </Menu.Item>
              )})}
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
    </div>
  )
}
