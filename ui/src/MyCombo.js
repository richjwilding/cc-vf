import { Fragment, useRef, useState } from 'react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { Combobox } from '@headlessui/react'
import MainStore from './MainStore'
import { HeroIcon } from './HeroIcon'
import { Float } from '@headlessui-float/react'
import { offset } from '@floating-ui/react-dom'
import UIHelper from './UIHelper'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}


export default function MyCombo({selectedItem, setSelectedItem, ...props}) {
  return <UIHelper.OptionList options={props.items} zIndex="50" onChange={setSelectedItem} value={selectedItem} showCount={props.showCount} small={true}/>
}

export function _MyCombo({selectedItem, setSelectedItem, ...props}) {
  const [query, setQuery] = useState('')
  const [selectedItemFallback, setSelectedItemFallback] = useState(props.multiple ? [] : props.items[0])
  const main = useRef()

  const selectedItemReal = setSelectedItem ? selectedItem : selectedItemFallback
  const setSelectedItemReal = setSelectedItem ? setSelectedItem : setSelectedItemFallback


  const middleware = [
    offset(({rects}) => {
      return (
        main.current ? -main.current.offsetWidth : 0
      );
    })
  ]

  const filteredItems =
    query === ''
      ? props.items
      : props.items.filter((item) => {
          return item.title.toLowerCase().includes(query.toLowerCase())
        })




        const actualMenu = [
                <Combobox.Button disabled={props.disabled} className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
                  <ChevronUpDownIcon className={`h-5 w-5 ${props.disabled ? "text-gray-200" : "text-gray-400"  }`} aria-hidden="true" />
                </Combobox.Button>,                
                filteredItems.length > 0 ? (
                    <Combobox.Options 
                        className="absolute z-10 mt-1 max-h-60 lg:max-h-[50vh] overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                      {filteredItems.map((item) => (
                        <Combobox.Option
                          key={item?.id}
                          value={item instanceof Object ? item.id : item}
                          className={({ active }) =>
                            classNames(
                              'relative cursor-default select-none py-2 pl-3 pr-9',
                              active ? 'bg-indigo-600 text-white' : 'text-gray-900'
                            )
                          }
                        >
                        {({ active, selected }) => (
                            <>
                              <div className="flex items-center">
                                <HeroIcon icon={item.icon} className="h-6 w-6 flex-shrink-0 rounded-full" />
                                <span className={classNames('ml-3 truncate', selected && 'font-semibold')}>{item.title}</span>
                                {props.showCount && <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">{item.count ?? 0}</span>}
                              </div>

                              {selected && (
                                <span
                                  className={classNames(
                                    'absolute inset-y-0 right-0 flex items-center pr-4',
                                    active ? 'text-white' : 'text-indigo-600'
                                  )}
                                >
                                  <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                </span>
                              )}
                            </>
                          )}
                        </Combobox.Option>
                      ))}
                    </Combobox.Options>
                ) : <p>No items</p>
              ].filter(d=>d)

              console.log(actualMenu)

  return (
    <Combobox 
      ref={main} 
      disabled={props.disabled}
      multiple={Array.isArray(selectedItemReal)} as="div" value={selectedItemReal} onChange={setSelectedItemReal} className={props.className}>
      {props.label && <Combobox.Label className="block text-sm font-medium leading-6 text-gray-900">{props.label}</Combobox.Label>}
      <div className="relative w-full">
        <Combobox.Input
          className={
            [
              props.small ? "text-xs leading-6 pl-2" : "py-1.5 pl-3 sm:text-sm sm:leading-6" ,
              "w-full rounded-md border-0 bg-white pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
            ].join(" ")
          }
          onChange={(event) => setQuery(event.target.value)}
          displayValue={(item) => Array.isArray(item) ?  `${props.prefix || ""}${item.length} items` : props.items ? `${props.prefix || ""}${props.items.find((d)=>d?.id === item)?.title ?? "Select..."}` : ""}
        />
         {props.portal
          ? <Float as="div" portal middleware={middleware} placement='right-end'>{actualMenu }</Float>
          : actualMenu}
      </div>
    </Combobox>
  )
}
