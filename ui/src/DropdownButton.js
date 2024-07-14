import { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { Float } from '@headlessui-float/react'
import { CheckIcon } from '@heroicons/react/24/outline'


function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function DropdownButton({...props}) {
    let items = props.items 
    let baseColor = "gray"
    let colors = props.major ? "bg-blue-600 border-blue-50  text-white hover:bg-ccgreen-700 focus:ring-blue-500 focus:ring-offset-gray-100" : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50 focus:border-ccgreen-500 focus:ring-ccgreen-500"
    if( items === undefined && !props.onClick){return <></>}
    let selected

    if( items ){
      if(  !(items instanceof(Array)) ){
        items = Object.keys(items).map((k, idx)=>{
          return {
            ...items[k],
            selected: items[k].selected || props.selected === k,
            key: items[k].key || k,
          }
        })
      }
      if( props.setSelectedItem ){
        items = items.map((d,idx)=>{
          return {
            ...d,
            action: props.setSelectedItem ? ()=>props.setSelectedItem(idx) : undefined
          }
        })
      }
      if(props.selectedItemIdx !== undefined ){
        items.forEach((d,idx)=>{
          d.selected = idx === props.selectedItemIdx
        })
      }
      selected = items.find((d)=>d.selected)
    }
    
    if( props.colorKey ){
        baseColor = (selected ? selected[props.colorKey] : undefined) || "gray"
        colors = `bg-${baseColor}-200 border-${baseColor}-400  text-${baseColor}-800 hover:bg-${baseColor}-300 focus:ring-${baseColor}-700 focus:ring-offset-${baseColor}-700` 
    }

    const actualMenu = [
        props.flat 
          ? <Menu.Button className={
                [
                  props.small ? "text-xs py-1 px-2" : `text-sm py-2 px-2`,
                  `h-full relative inline-flex items-center rounded-md font-medium focus:z-20 focus:outline-none  ${colors}`,
                  props.noBorder ? "" : "border",
                  props.className ?? ""
                ].join(' ')
              }
                key='button' 
                onClick={props.onClick}
            >
            {props.icon && props.icon}
            {props.title }
            {(props.hideArrow || props.icon) ? "" : <ChevronDownIcon key='arrow' className="h-5 w-5 ml-1" aria-hidden="true" />}
          </Menu.Button>

          : <Menu.Button 
            key='button' 
              onClick={props.onClick}
            className={[
              props.small ? "text-xs py-1 px-1" : `text-sm py-2 px-2`,
                `h-full  relative inline-flex items-center rounded-r-md border font-medium focus:z-20 focus:outline-none  ${colors}`
              ].join(" ")}>
          <span key='title' className="sr-only">Open options</span>
          <ChevronDownIcon key='arrow' className="h-5 w-5" aria-hidden="true" />
          </Menu.Button>
        ,
          (items && items.length > 0) ? <Menu.Items key='items' className={[
              'z-20 mt-2 -mr-1 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none',
              props.align === 'left' ? 'left-0' : 'right-0',
              props.portal ? "" : "absolute",
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
                        //active ? `bg-${baseColor}-100 text-${baseColor}-900` : `text-${baseColor}-700 bg-${props.colorKey ? `${baseColor}-50` : 'white' }`,
                        props.colorKey ? 'my-2 mx-1 rounded-md' : '',
                        active ? 'bg-ccgreen-700 text-white' : 'text-gray-900',
                        'block px-4 py-2 text-sm relative flex space-x-2'
                      )}
                    >
                      {item.icon && item.icon}
                      <p>{item.title}</p>
                      {props.showTick && item.selected && (
                        <span
                          className={classNames(
                            'absolute inset-y-0 right-0 flex items-center pr-4',
                            active ? 'text-white' : 'text-ccgreen-700'
                          )}
                        >
                          <CheckIcon className={`h-5 w-5 ${active ? 'bg-ccgreen-700' : "bg-white"}`} aria-hidden="true" />
                        </span>
                      )}
                    </a>
                  )}
                </Menu.Item>
              )})}
            </div>
          </Menu.Items> : undefined
    ].filter(d=>d)


  return (
    <div className={`inline-flex rounded-md ${props.flat ? "hover:shadow-sm" : "shadow-sm"} ${props.className || ""}`}>
      {!props.flat &&
      <button
        type="button"
        onClick={props.main ? undefined : (e)=>{e.stopPropagation();props.items[0]?.action && props.items[0]?.action()}}
        className={[
            props.small ? "text-xs py-1 px-2" : `text-sm py-4 px-2`,
          `relative inline-flex items-center rounded-l-md border font-medium focus:z-20 focus:outline-none focus:ring-2  focus:ring-offset-2 ${colors} w-full `
        ].join(" ")}
      >
        {props.main ||  selected?.title || props.title || items[0].title}
      </button>}
      <Menu as="div" className="relative -ml-px block">
        {props.portal
          ? <Float portal placement={props.placement ?? "bottom-end"} offset={4} >{actualMenu}</Float>
          : actualMenu}

      </Menu>
    </div>
  )
}
