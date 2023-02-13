import { PrimitiveCard } from './PrimitiveCard'
import { HeroIcon } from './HeroIcon'
import { Fragment } from 'react'
import { Menu, Popover, Transition } from '@headlessui/react'
import {useRef} from 'react';
import {
  ArrowLongLeftIcon,
  CheckIcon,
  HandThumbUpIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  PaperClipIcon,
  PencilIcon,
  QuestionMarkCircleIcon,
  UserIcon,
} from '@heroicons/react/20/solid'
import { Bars3Icon, BellIcon, XMarkIcon } from '@heroicons/react/24/outline'


/*export function PrimitivePage({primitive, ...props}) {
    if( primitive === undefined ){
        props.setOpen(false)
        return(<></>)
    }
    let metadata = primitive.metadata
    let task = primitive.originTask
    let origin = task && (primitive.originId !== task.id) ? primitive.origin : undefined

    return (
        <div className='min-w-max'>
            <div className="border-b-gray-100 px-4 py-4 shadow-md  sticky top-0 bg-white">
                <div className="flex items-start justify-between space-x-3">
                    <div className='flex place-items-center'>
                        <HeroIcon icon={metadata.icon} className='w-20 h-20'/>
                        <div className='ml-2'>
                            <p className="text-sm font-medium text-gray-900 ">{metadata.title}</p>
                            <p className="text-xs text-gray-500">{metadata.description}</p>
                        </div>
                    </div>
                    <div className="flex h-7 items-center">
                        <button
                            type="button"
                            className="text-gray-400 hover:text-gray-500"
                            onClick={() => props.setOpen(false)}
                        >
                            <span className="sr-only">Close panel</span>
                            <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>
            <div className="pb-2 pl-4 pr-4 pt-4">
                <PrimitiveCard primitive={primitive}  showDetails={true} showLink={false} major={true} showRelationships={true} showEdit={true} className='mb-6'/>
                {origin &&
                    <div className='mt-4 mb-3'>
                        <h3 className="mb-1 font-medium text-gray-900">Source</h3>
                        <PrimitiveCard primitive={origin} showState={true} showLink={true} showDetails={true}/>
                    </div>
                }
                {task &&
                <div className='mt-4 mb-3'>
                    <h3 className="mb-2 font-medium text-gray-900">Related {task.type}</h3>
                    <PrimitiveCard primitive={task}  showState={true} showDetails={true} showUsers={true} showLink={true}/>
                </div>}
            </div>
        </div>
    )
}*/


const user = {
  name: 'Whitney Francis',
  email: 'whitney@example.com',
  imageUrl:
    'https://images.unsplash.com/photo-1517365830460-955ce3ccd263?ixlib=rb-=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=8&w=256&h=256&q=80',
}
const attachments = [
  { name: 'resume_front_end_developer.pdf', href: '#' },
  { name: 'coverletter_front_end_developer.pdf', href: '#' },
]
const eventTypes = {
  applied: { icon: UserIcon, bgColorClass: 'bg-gray-400' },
  advanced: { icon: HandThumbUpIcon, bgColorClass: 'bg-blue-500' },
  completed: { icon: CheckIcon, bgColorClass: 'bg-green-500' },
}
const timeline = [
  {
    id: 1,
    type: eventTypes.applied,
    content: 'Applied to',
    target: 'Front End Developer',
    date: 'Sep 20',
    datetime: '2020-09-20',
  },
  {
    id: 2,
    type: eventTypes.advanced,
    content: 'Advanced to phone screening by',
    target: 'Bethany Blake',
    date: 'Sep 22',
    datetime: '2020-09-22',
  },
  {
    id: 3,
    type: eventTypes.completed,
    content: 'Completed phone screening with',
    target: 'Martha Gardner',
    date: 'Sep 28',
    datetime: '2020-09-28',
  },
  {
    id: 4,
    type: eventTypes.advanced,
    content: 'Advanced to interview by',
    target: 'Bethany Blake',
    date: 'Sep 30',
    datetime: '2020-09-30',
  },
  {
    id: 5,
    type: eventTypes.completed,
    content: 'Completed interview with',
    target: 'Katherine Snyder',
    date: 'Oct 4',
    datetime: '2020-10-04',
  },
]
const comments = [
  {
    id: 1,
    name: 'Leslie Alexander',
    date: '4d ago',
    imageId: '1494790108377-be9c29b29330',
    body: 'Ducimus quas delectus ad maxime totam doloribus reiciendis ex. Tempore dolorem maiores. Similique voluptatibus tempore non ut.',
  },
  {
    id: 2,
    name: 'Michael Foster',
    date: '4d ago',
    imageId: '1519244703995-f4e0f30006d5',
    body: 'Et ut autem. Voluptatem eum dolores sint necessitatibus quos. Quis eum qui dolorem accusantium voluptas voluptatem ipsum. Quo facere iusto quia accusamus veniam id explicabo et aut.',
  },
  {
    id: 3,
    name: 'Dries Vincent',
    date: '4d ago',
    imageId: '1506794778202-cad84cf45f1d',
    body: 'Expedita consequatur sit ea voluptas quo ipsam recusandae. Ab sint et voluptatem repudiandae voluptatem et eveniet. Nihil quas consequatur autem. Perferendis rerum et.',
  },
]

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function PrimitivePage({primitive, ...props}) {
    let metadata = primitive.metadata
    let task = primitive.originTask
    let origin = task && (primitive.originId !== task.id) ? primitive.origin : undefined

    let page = useRef()
    let header = useRef()
  return (
    <>
      {/*
        This example requires updating your template:

        ```
        <html class="h-full bg-gray-100">
        <body class="h-full">
        ```
      */}
      <div className="min-h-full overflow-y-scroll overscroll-contain"
        onScroll={()=>{
            let opacity = parseInt(Math.min(page.current.scrollTop, 60) / 6) * 10
            let last = parseInt(header.current.getAttribute('last')) || 0
            header.current.setAttribute('last', opacity)
            if( last !== opacity){
                header.current.classList.remove(`shadow-gray-300/${last}`)
                header.current.classList.add(`shadow-gray-300/${opacity}`)
                if( last === 0){
                    header.current.classList.add(`shadow-md`)
                }
                if( opacity === 0){
                    header.current.classList.remove(`shadow-md`)
                }
            }


        }}
        ref={page}
      >
        <main className="py-10">
          {/* Page header */}
          <div ref={header} className="z-10 mx-auto max-w-3xl px-4 sm:px-6 md:flex md:items-center md:justify-between md:space-x-5 lg:max-w-7xl lg:px-8 sticky top-0 bg-gray-100">
            <div className="flex items-center space-x-5">
              <div className="flex-shrink-0">
                <div className="relative">
                    <HeroIcon icon={metadata.icon} className='w-20 h-20'/>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{primitive.displayType} #{primitive.id}</h1>
                <p className="text-sm font-medium text-gray-500">{metadata.title} - {metadata.description}</p>
              </div>
            </div>
            <div className="justify-stretch mt-6 flex flex-col-reverse space-y-4 space-y-reverse sm:flex-row-reverse sm:justify-end sm:space-y-0 sm:space-x-3 sm:space-x-reverse md:mt-0 md:flex-row md:space-x-3">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-100"
              >
                {primitive.stateInfo.title}
              </button>
            </div>
          </div>

          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-6 sm:px-6 lg:max-w-7xl lg:grid-flow-col-dense lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2 lg:col-start-1">
              <section aria-labelledby="applicant-information-title">
                <div className="bg-white shadow sm:rounded-lg grid grid-cols-1 md:grid-cols-5 ">
                  <div className="px-4 py-5 sm:px-6 md:col-span-5">
                    <div className={`flex items-start justify-between space-x-3 mt-3'`}>
                        <p className={`text-slate-700 text-lg`}>
                        {primitive.title}
                        </p>
                        <button
                            type="button"
                            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <PencilIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                  </div>
                  <div className="border-gray-200 px-4 pb-5 sm:px-6 md:col-span-3">
                    <PrimitiveCard.Details primitive={primitive} title={`${primitive.displayType} details`} hideFooter={true}/>
                  </div>
                  <div className="border-gray-200 px-4 pb-5 sm:px-6 md:col-span-2">
                    <PrimitiveCard.Users primitive={primitive} title={`Team members`} asTable={true}/>
                  </div>
                </div>
              </section>

            {primitive.metadata.resultCategories && primitive.metadata.resultCategories.map((category)=>{
                let view = category.views?.default
                let cardConfig = view ? category.views.list[view] : undefined
                let showState = view !== "kaban"
                return (
                        <section aria-labelledby="applicant-information-title">
                            <div className="bg-white shadow sm:rounded-lg">
                            <div className="divide-y divide-gray-200">
                                <div className="px-4 py-5 sm:px-6">
                                <h2 id="notes-title" className="text-lg font-medium text-gray-900">
                                    {primitive.metadata.title}
                                </h2>
                                </div>
                                <div className="px-4 py-6 sm:px-6 gap-3 grid-cols-2 grid md:grid-cols-3 lg:grid-cols-4">
                                    {primitive.primitives.results[category.id].map((p)=>(
                                        <PrimitiveCard compact={true} primitive={p} fields={cardConfig} border={true} showState={showState} relationships={category.relationships} relationshipTo={primitive}/>
                                    ))}
                                </div>
                            </div>
                            </div>
                        </section>
                )
            })}

              <section aria-labelledby="notes-title">
                <div className="bg-white shadow sm:overflow-hidden sm:rounded-lg">
                  <div className="divide-y divide-gray-200">
                    <div className="px-4 py-5 sm:px-6">
                      <h2 id="notes-title" className="text-lg font-medium text-gray-900">
                        Notes
                      </h2>
                    </div>
                    <div className="px-4 py-6 sm:px-6">
                      <ul role="list" className="space-y-8">
                        {comments.map((comment) => (
                          <li key={comment.id}>
                            <div className="flex space-x-3">
                              <div className="flex-shrink-0">
                                <img
                                  className="h-10 w-10 rounded-full"
                                  src={`https://images.unsplash.com/photo-${comment.imageId}?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80`}
                                  alt=""
                                />
                              </div>
                              <div>
                                <div className="text-sm">
                                  <a href="#" className="font-medium text-gray-900">
                                    {comment.name}
                                  </a>
                                </div>
                                <div className="mt-1 text-sm text-gray-700">
                                  <p>{comment.body}</p>
                                </div>
                                <div className="mt-2 space-x-2 text-sm">
                                  <span className="font-medium text-gray-500">{comment.date}</span>{' '}
                                  <span className="font-medium text-gray-500">&middot;</span>{' '}
                                  <button type="button" className="font-medium text-gray-900">
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-4 py-6 sm:px-6">
                    <div className="flex space-x-3">
                      <div className="flex-shrink-0">
                        <img className="h-10 w-10 rounded-full" src={user.imageUrl} alt="" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <form action="#">
                          <div>
                            <label htmlFor="comment" className="sr-only">
                              About
                            </label>
                            <textarea
                              id="comment"
                              name="comment"
                              rows={3}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                              placeholder="Add a note"
                              defaultValue={''}
                            />
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <a
                              href="#"
                              className="group inline-flex items-start space-x-2 text-sm text-gray-500 hover:text-gray-900"
                            >
                              <QuestionMarkCircleIcon
                                className="h-5 w-5 flex-shrink-0 text-gray-400 group-hover:text-gray-500"
                                aria-hidden="true"
                              />
                              <span>Some HTML is okay.</span>
                            </a>
                            <button
                              type="submit"
                              className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                              Comment
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section aria-labelledby="evidence-title" className="lg:col-span-1 lg:col-start-3">
              <div className="bg-white px-4 py-5 shadow sm:rounded-lg sm:px-6">
                <h2 id="evidence-title" className="text-lg font-medium text-gray-900">
                  Outcomes
                </h2>

                {/* Activity Feed */}
                <div className="mt-6 flow-root">
                  <ul role="list" className="p-1">
                    {primitive.primitives.filter((p)=>p.type === "evidence").map((p)=>(
                        <PrimitiveCard compact={true} primitive={p}/>
                    ))}
                  </ul>
                </div>
                <div className="justify-stretch mt-6 flex flex-col">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Advance to offer
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </>
  )
}
