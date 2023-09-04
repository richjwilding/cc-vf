import { useState } from 'react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { Combobox } from '@headlessui/react'
import MainStore from './MainStore'
import { HeroIcon } from './HeroIcon'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function MyCombo({selectedItem, setSelectedItem, ...props}) {
  const [query, setQuery] = useState('')
  const [selectedItemFallback, setSelectedItemFallback] = useState(props.multiple ? [] : props.items[0])

  const selectedItemReal = setSelectedItem ? selectedItem : selectedItemFallback
  const setSelectedItemReal = setSelectedItem ? setSelectedItem : setSelectedItemFallback

  const filteredItems =
    query === ''
      ? props.items
      : props.items.filter((item) => {
          return item.title.toLowerCase().includes(query.toLowerCase())
        })
  return (
    <Combobox 
      disabled={props.disabled}
      multiple={Array.isArray(selectedItemReal)} as="div" value={selectedItemReal} onChange={setSelectedItemReal} className={props.className}>
      {props.label && <Combobox.Label className="block text-sm font-medium leading-6 text-gray-900">{props.label}</Combobox.Label>}
      <div className="relative w-48">
        <Combobox.Input
          className="w-full rounded-md border-0 bg-white py-1.5 pl-3 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
          onChange={(event) => setQuery(event.target.value)}
          displayValue={(item) => Array.isArray(item) ?  `${props.prefix || ""}${item.length} items` : props.items ? `${props.prefix || ""}${props.items.find((d)=>d?.id === item)?.title}` : ""}
        />
        <Combobox.Button disabled={props.disabled} className="absolute inset-y-0 right-0 flex items-center rounded-r-md px-2 focus:outline-none">
          <ChevronUpDownIcon className={`h-5 w-5 ${props.disabled ? "text-gray-200" : "text-gray-400"  }`} aria-hidden="true" />
        </Combobox.Button>

        {filteredItems.length > 0 && (
          <Combobox.Options className="absolute z-10 mt-1 max-h-60 lg:max-h-[50vh] overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
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
        )}
      </div>
    </Combobox>
  )
}
