import { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { Float } from '@headlessui-float/react'


function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function DropdownButton({...props}) {
    let items = props.items 
    let baseColor = "gray"
    let colors = props.major ? "bg-blue-600 border-blue-50  text-white hover:bg-blue-700 focus:ring-blue-500 focus:ring-offset-gray-100" : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50 focus:border-indigo-500 focus:ring-indigo-500"
    if( items === undefined){return <></>}

    if( !(items instanceof(Array)) ){
        items = Object.keys(items).map((k)=>{
            return {
                ...items[k],
                selected: items[k].selected || props.selected === k,
                key: items[k].key || k,
            }
        })
    }
    const selected = items.find((d)=>d.selected)
    if( items === undefined || items.length === 0){return <></>}
    if( props.colorKey ){
        baseColor = (selected ? selected[props.colorKey] : undefined) || "gray"
        colors = `bg-${baseColor}-200 border-${baseColor}-400  text-${baseColor}-800 hover:bg-${baseColor}-300 focus:ring-${baseColor}-700 focus:ring-offset-${baseColor}-700` 
    }


    const actualMenu = [
        props.flat 
          ? <Menu.Button className={`h-full relative inline-flex items-center rounded-md border px-2 py-2 text-sm font-medium focus:z-20 focus:outline-none  ${colors}`}>
            {props.title}
            <ChevronDownIcon className="h-5 w-5 ml-1" aria-hidden="true" />
          </Menu.Button>

          : <Menu.Button className={`h-full relative inline-flex items-center rounded-r-md border px-2 py-2 text-sm font-medium focus:z-20 focus:outline-none  ${colors}`}>
          <span className="sr-only">Open options</span>
          <ChevronDownIcon className="h-5 w-5" aria-hidden="true" />
          </Menu.Button>
        ,
          <Menu.Items className={[
              'absolute z-20 mt-2 -mr-1 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none',
              props.align === 'left' ? 'left-0' : 'right-0',
              props.dropdownWidth || 'w-56'
            ].join(" ")}>
            <div className="py-1">
              {items.map((item) => {
                let baseColor =  props.colorKey ? (item[props.colorKey] || "gray") : "gray"
                return (
                <Menu.Item key={item.key || item.title}>
                  {({ active }) => (
                    <a
                      href={item.href}
                      onClick={(e)=>{e.stopPropagation();item.action && item.action()}}
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
    ]
    

  return (
    <div className={`inline-flex rounded-md ${props.flat ? "hover:shadow-sm" : "shadow-sm"} ${props.className || ""}`}>
      {!props.flat &&
      <button
        type="button"
        onClick={props.main ? undefined : (e)=>{e.stopPropagation();props.items[0]?.action && props.items[0]?.action()}}
        className={`relative inline-flex items-center rounded-l-md border  px-4 py-2 text-sm font-medium focus:z-20 focus:outline-none focus:ring-2  focus:ring-offset-2 ${colors} w-full `}
      >
        {props.main ||  selected?.title || props.title || items[0].title}
      </button>}
      <Menu as="div" className="relative -ml-px block">
        {props.portal
          ? <Float portal placement='bottom-end'>{actualMenu}</Float>
          : actualMenu}

      </Menu>
    </div>
  )
}
