import { Switch } from '@headlessui/react'
import { CheckIcon } from '@heroicons/react/24/solid'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function CheckPill({enabled, setEnabled, ...props}) {

  console.log(enabled)
  return (
    <button
        type="button"
        onClick={setEnabled ? ()=>setEnabled(!enabled) : undefined }
        className={`flex rounded-full ${enabled ? "bg-ccgreen-100" : "bg-grey-50"} pl-1 pr-2 py-1 text-xs ${enabled ? "text-ccgreen-900 ring-ccgreen-700 hover:bg-green-50" : "text-gray-600 ring-gray-300 hover:bg-gray-50"} shadow-sm ring-1 ring-inset `}
      >
        <div className={`w-4 h-4 rounded-full mr-1 border p-0.5 border-gray-${enabled ? "900" : "600"} ${enabled ? "bg-ccgreen-700 text-gray-100" : ""}`}>
          {enabled && <CheckIcon stroke='2'/>}
        </div>
        {props.title}
      </button>
  )
}
