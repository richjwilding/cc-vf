import { ChevronDownIcon } from "@heroicons/react/24/outline"
import clsx from "clsx"


function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function Tabs({onChange, options = [], value, className, ...props}) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:hidden">
        {/* Use an "onChange" listener to redirect the user to the selected tab URL. */}
        <select
          defaultValue={options.find((tab) => tab.id === value)?.name}
          onChange={(e)=>onChange(e.currentTarget.value)}
          aria-label="Select a tab"
          className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-2 pl-3 pr-8 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-ccgreen-600"
        >
          {options.map((tab) => (
            <option key={tab.name}>{tab.name}</option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end fill-gray-500"
        />
      </div>
      <div className={clsx([
        "hidden sm:block",
        className
      ])}>
        <nav aria-label="Tabs" className="flex space-x-4">
          {options.map((tab) => (
            <a
              key={tab.name}
              aria-current={tab.id === value ? 'page' : undefined}
              onClick={()=>onChange(tab.id)}
              className={classNames(
                tab.id === value ? 'bg-ccgreen-200 text-ccgreen-800' : 'text-gray-500 hover:text-gray-700',
                'rounded-md px-3 py-2 text-sm font-medium',
              )}
            >
              {tab.name}
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}
