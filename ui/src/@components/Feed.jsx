function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function FeedList({items, ...props}) {
  return (
    <div className="flow-root">
      <ul role="list" className="">
        {(items ?? []).map((event, eventIdx) => {
          return (
          <li key={event.id}>
            <div className={`relative ${eventIdx !== items.length - 1 ? "pb-8" : ""}`}>
              {eventIdx !== items.length - 1 ? (
                <span aria-hidden="true" className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" />
              ) : null}
              <div className="relative flex space-x-3">
                <div>
                  <span
                    className={classNames(
                      event.iconBackground,
                      'flex size-6 items-center justify-center rounded-full ring-8 ring-white',
                    )}
                  >
                    {event.icon}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                  <div>
                    <p className={`text-sm ${event.active ? "text-gray-800" : "text-gray-500"}`}>
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
                </div>
              </div>
            </div>
          </li>
        )
      })}
      </ul>
    </div>
  )
}
