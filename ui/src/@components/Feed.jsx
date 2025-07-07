import {Icon} from "@iconify/react";
import { HeroIcon } from "../HeroIcon";

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function FeedList({items, className,...props}) {
  return (
    <div className={classNames("flow-root p-3",className)}>
      <ul role="list" className="">
        {(items ?? []).map((event, eventIdx) => {

          let icon = event.icon
          const status = typeof(event.status) == "function" ?  event.status() : event.status
          if( status === "complete"){
            icon = <Icon className="text-primary" icon="solar:check-circle-bold" width={30} />
          }else if( status === "running"){
            icon = <HeroIcon icon='FASpinner' className='text-secondary w-4 h-4 animate-spin'/>
          }else if( status === "error_skip"){
            icon = <Icon className="text-amber-600" icon="solar:danger-triangle-linear" width={30} />
          }else if( status === "error" || status === "rerun"){
            icon = <Icon className="text-red-600" icon="solar:danger-circle-linear" width={30} />
          }
          
          if( !icon ){
            icon = <Icon className="text-gray-500" icon="solar:minus-circle-linear" width={30} />
          }

          return (
          <li key={event.id}>
            <div className={`relative ${eventIdx !== items.length - 1 ? "pb-8" : ""}`}>
              {eventIdx !== items.length - 1 ? (
                <span aria-hidden="true" className="absolute left-3 top-3 -ml-px h-full w-0.5 bg-gray-200" />
              ) : null}
              <div className="relative flex space-x-3 bg-white hover:bg-gray-50 hover:rounded-md hover:shadow-sm hover:ring-1 ring-ccgreen-500 -m-2 p-2 group" onClick={event.onClick}>
                <div>
                  <span
                    className={classNames(
                      event.iconBackground,
                      'flex size-6 items-center justify-center rounded-full ring-8 ring-white group-hover:ring-gray-100',
                    )}
                  >
                    {icon}
                  </span>
                </div>
                {props.showLabels !== false && <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-[0.1em]">
                  <div>
                    <p className={`text-sm ${event.active ? "text-gray-800" : "text-gray-500"} group-hover:text-gray-800`}>
                      {event.content}{' '}
                      {event.target && <a href={event.href} className="font-medium text-gray-900">
                        {event.target}
                      </a>}
                    </p>
                    {event.secondary && <p className={`my-0.5 pt-0.5 text-xs font-semibold ${event.active ? "text-gray-600" : "text-gray-400"}`}>
                      {event.secondary}
                    </p>}
                  </div>
                  {event.datetime && <div className="whitespace-nowrap text-right text-sm text-gray-500">
                    <time dateTime={event.datetime}>{event.date}</time>
                  </div>}
                </div>}
              </div>
            </div>
          </li>
        )
      })}
      </ul>
    </div>
  )
}
