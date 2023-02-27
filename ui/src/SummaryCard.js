
import React from 'react';
import { EllipsisVerticalIcon } from "@heroicons/react/24/outline";

export function SummaryCard(props) {
  let bg = (props.open === 0) && (props.closed > 0) ? `bg-${props.bgColor}-800` : `bg-${props.bgColorOpen || props.bgColor}-200`
  let text = (props.open === 0) && (props.closed > 0) ? `text-${props.textColor}-200` : `text-${props.bgColorOpen || props.bgColor}-600`

  return (
          <div key={props.name} className="col-span-1 flex rounded-md shadow-sm m-2">
            <div
              className={`${bg} uppercase flex-shrink-0 flex items-center justify-center w-12 ${text} text-lg font-medium rounded-l-md`}
            >
              {props.initials}
            </div>
            <div className="flex flex-1 items-center justify-between truncate rounded-r-md border-t border-r border-b border-gray-200 bg-white">
              <div className="flex-1 truncate px-4 py-1 text-sm">
                <p className="text-gray-900">{props.open || 0} {props.open_text || "Open"}</p>
                <p className="text-gray-500">{props.complete || 0} {props.complete_text || "Closed"}</p>
              </div>
              <div className="flex-shrink-0 pr-2">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white bg-transparent text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  <span className="sr-only">Open options</span>
                  <EllipsisVerticalIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
  )
}