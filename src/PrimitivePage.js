import { PrimitiveCard } from './PrimitiveCard'
import { MetricCard } from './MetricCard'
import { HeroIcon } from './HeroIcon'
import {Fragment, useEffect, useRef, useState} from 'react';
import Panel from './Panel';
import { Tab } from '@headlessui/react'
import {
  PencilIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/20/solid'
import { motion, AnimatePresence } from "framer-motion"
import { PrimitivePopup } from './PrimitivePopup';
import { MetricPopup } from './MetricPopup';
import MainStore from './MainStore';
import { CheckIcon, XMarkIcon, HandThumbUpIcon, HandThumbDownIcon } from '@heroicons/react/24/outline';
import { formatDistance, subDays } from 'date-fns'
/*import { Document, Page } from 'react-pdf/dist/esm/entry.webpack5';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';*/

let mainstore = MainStore()

let user = mainstore.user(1)

const comments = [
  {
    id: 1,
    date: '4d ago',
    userId: 4,
    body: 'Ducimus quas delectus ad maxime totam doloribus reiciendis ex. Tempore dolorem maiores. Similique voluptatibus tempore non ut.',
  },
  {
    id: 2,
    date: '4d ago',
    userId: 2,
    body: 'Et ut autem. Voluptatem eum dolores sint necessitatibus quos. Quis eum qui dolorem accusantium voluptas voluptatem ipsum. Quo facere iusto quia accusamus veniam id explicabo et aut.',
  },
  {
    id: 3,
    date: '4d ago',
    userId: 3,
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

    const [selected, setSelected] = useState(null)
    const [selectedMetric, setSelectedMetric] = useState(null)
    const [groupMetricsOpen, setGroupMetricsOpen] = useState(false)
    const [activePrim, setActivePrim] = useState(primitive.id)

    if( activePrim !== primitive.id ){
      setActivePrim(primitive.id)
      setSelectedMetric(null)
      setSelected(null)
      setGroupMetricsOpen(false)
      if( props.selectPrimitive ){
        props.selectPrimitive(null)
      }
    }
    useEffect(()=>{
      console.log(`first close`)
      if( props.selectPrimitive ){
        props.selectPrimitive(null)
      }
    },[])


    const setLocalMetric = (id)=>{
      console.log({primitive: primitive, metric: id})
      setSelectedMetric({primitive: primitive, metric: id})
    }

    const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

    let page = useRef()
    let header = useRef()

    let outcomesList = primitive.primitives.filter((p)=>p.type === "evidence")

  return (
    <>
      {/*
        This example requires updating your template:

        ```
        <html class="h-full bg-gray-100">
        <body class="h-full">
        ```
      */}
      <div className="min-h-full overflow-y-scroll overscroll-contain w-full"
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
          {/* Page header */}
          <div ref={header} className="w-full mt-10 z-10 mx-auto px-0.5 xs:px-6 flex items-center justify-between md:space-x-5 lg:px-8 sticky top-0 bg-gray-100">
            <PrimitiveCard.Banner primitive={primitive} showStateAction={true} className='pl-4 pr-6 mx-auto w-full max-w-3xl lg:max-w-7xl'/>
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
                    { primitive.isTask && <PrimitiveCard.Users primitive={primitive} title={`Team members`} asTable={true}/>}
                    { !primitive.isTask && task && 
                      <Panel title={`Related ${task.type}`} titleClassName='text-sm pb-2 font-medium text-gray-500 flex border-b border-gray-200'>
                        <PrimitiveCard compact={true} primitive={task}  disableHover={true} showUsers={true} showLink={true}/>
                      </Panel>
                    }
                  </div>
                  <div className="px-4 pt-2 pb-5 sm:px-6 md:col-span-5">
                    <PrimitiveCard.Resources primitive={primitive}/>
                </div>
                </div>
              </section>
            {primitive.metrics &&
                <section aria-labelledby="applicant-information-title">
                    <h2 id="notes-title" className="text-md font-medium text-gray-500 pt-5 pb-2 px-0.5">Metrics</h2>
                    <div className="gap-3 grid-cols-2 grid md:grid-cols-3 lg:grid-cols-3">
                        {primitive.metrics.map((metric)=>{
                          let wide = metric.type === "conversion"
                          const m = <MetricCard 
                              key={metric.id} 
                              groupOpen={wide ? undefined : groupMetricsOpen}
                              groupControl={wide ? undefined : setGroupMetricsOpen}
                              className='h-full' 
                              onClick={setLocalMetric} 
                              primitive={primitive} 
                              metric={(metric)} 
                              onCardClick={(p)=>setSelected(p)}/>
                          if( wide ){
                            return m
                          }else{
                            const open = {
                              scaleY: 2,
                              zIndex: 100
                            };
                            
                            const closed = {
                              scaleY: 1,
                              transitionEnd: { zIndex: 0 }
                            };
                            const id = `m${metric.id}`
                            return <motion.div 
                                        animate={
                                          selectedMetric?.metric === metric.id ? open : closed
                                        }
                                      key={id} layoutId={id}>
                                        {m}
                                  </motion.div> 
                          }
                        })}
                    </div>
                </section>
            }

            {primitive.metadata.resultCategories && primitive.metadata.resultCategories.map((category)=>{
                let view = category.views?.default
                let cardConfig = view ? category.views.list[view] : undefined
                let showState = view !== "kaban"
                return (
                  <Panel key={category.title} title={primitive.metadata.title} titleClassName='text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true}>
                        <div 
                            className="gap-3 space-y-3 no-break-children sm:columns-2 md:columns-3 xl:columns-4">
                            {primitive.primitives.results[category.id].map((p,idx)=>{
                                return (
                                    <motion.div 
                                        key={p.id}
                                        layoutId={p.id} onClick={() => setSelected(p)}
                                    >
                                    <PrimitiveCard 
                                        key={p.id}
                                        compact={true} primitive={p} 
                                        className='h-full flex flex-col justify-between'
                                        fields={cardConfig} 
                                        border={true} 
                                        showState={showState} 
                                        showAsSecondary={true}
                                        showEvidence="compact"
                                        relationships={category.relationships} 
                                        relationship={primitive.primitives.relationships(p.id, ["results", category.id])}/>
                                    </motion.div>
                                )}
                            )}
                        </div>
                  </Panel>
                )
            })}

              <section aria-labelledby="notes-title">
                <div className="bg-white shadow sm:overflow-hidden sm:rounded-lg mb-6">
                  <div className="divide-y divide-gray-200">
                    <div className="px-4 py-5 sm:px-6">
                      <h2 id="notes-title" className="text-lg font-medium text-gray-900">
                        Notes
                      </h2>
                    </div>
                      {primitive.comments && 
                    <div className="px-4 py-6 sm:px-6">
                      <ul role="list" className="space-y-8">
                        {primitive.comments?.map((comment) => {
                          let user = mainstore.user( comment.userId)
                          return (
                          <li key={comment.id}>
                            <div className="flex space-x-3">
                              <div className="flex-shrink-0">
                                <img
                                  className="h-10 w-10 rounded-full"
                                  src={user.avatarUrl}
                                  alt=""
                                />
                              </div>
                              <div>
                                <div className="text-sm">
                                  <a href="#" className="font-medium text-gray-900">
                                    {user.name}
                                  </a>
                                </div>
                                <div className="mt-1 text-sm text-gray-700">
                                  <p>{comment.body}</p>
                                </div>
                                <div className="mt-2 space-x-2 text-sm">
                                  <span className="font-medium text-gray-500">{formatDistance(Date.parse(comment.date), new Date(), { includeSeconds: true, addSuffix: true })}</span>{' '}
                                  <span className="font-medium text-gray-500">&middot;</span>{' '}
                                  <button type="button" className="font-medium text-gray-900">
                                    Reply
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        )})}
                      </ul>
                    </div>}
                  </div>
                  <div className="bg-gray-50 px-4 py-6 sm:px-6">
                    <div className="flex space-x-3">
                      <div className="flex-shrink-0">
                        <img className="h-10 w-10 rounded-full" src={user.avatarUrl} alt="" referrerPolicy="no-referrer"/>            
                      </div>
                      <div className="min-w-0 flex-1">
                        <form action="#">
                          <div>
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
                            <Tab.Group>
                                <Tab.List className="-mb-px flex space-x-8 border-b border-gray-200" aria-label="Tabs">
                                <Tab as={Fragment}>
                                    {({ selected }) => ( 
                                    <button
                                    className={classNames(
                                    selected
                                    ? 'border-indigo-500 text-indigo-600 '
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                                    'py-2 px-2 text-lg border-b-2 text-gray-900 ring-offset-0 focus:outline-none focus:border-indigo-900')}
                                    aria-current={selected ? 'page' : undefined}
                                    >
                                    Outcomes {selected}
                                    </button>)}
                                    </Tab>
                                  {!primitive.isTask && task && 
                                <Tab as={Fragment}>
                                    {({ selected }) => ( 
                                    <button
                                    className={classNames(
                                    selected
                                    ? 'border-indigo-500 text-indigo-600 '
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                                    'py-2 px-2 text-lg border-b-2 text-gray-900 ring-offset-0 focus:outline-none focus:border-indigo-900')}
                                    aria-current={selected ? 'page' : undefined}
                                    >
                                    Metrics{selected}
                                    </button>)}
                                    </Tab>}
                                </Tab.List>
                                <Tab.Panels>
                                    <Tab.Panel>
                                      <div className="mt-6 flow-root">
                                        <ul role="list" className="p-1 space-y-1">
                                          {outcomesList.map((p)=>(
                                              <PrimitiveCard key={p.id} compact={true} primitive={p} showMeta="large"/>
                                          ))}
                                        </ul>
                                      </div>
                                      <div className="justify-stretch mt-6 flex flex-col">
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                        >
                                          Add new
                                        </button>
                                      </div>
                                    </Tab.Panel>
                                    {!primitive.isTask && task && 
                                      <Tab.Panel>
                                        <div 
                                          style={{gridTemplateColumns: 'max-content 1fr'}}
                                          className='grid grid-cols-2 mt-6 mx-2'>
                                          {task.metrics.filter((m)=>m.type==="count").map((metric)=>{
                                            let included = false
                                            let list
                                            const v = metric.value                                          
                                            if( v instanceof Array){
                                              list = v.map((d)=>d.list).flat()
                                            }else{
                                              list = v.list
                                            }
                                            included = list.map((d)=>d.id).includes( primitive.id )

                                            return (
                                              <>
                                                {included && <p className={`p-2 text-sm grow-0 text-gray-900`}><CheckIcon className='w-5 h-5 text-green-500'/></p>}
                                                {!included && <p className={`p-2 text-sm grow-0 text-gray-900`}><XMarkIcon className='w-5 h-5 text-amber-600'/></p>}
                                                <a href='#' onClick={()=>setSelectedMetric({primitive: task, metric: metric.id, highlight: primitive.id})}>
                                                  <p className='p-2 text-sm truncate text-gray-500 hover:text-indigo-600 hover:underline'>{metric.title}</p>
                                                </a>
                                              </>
                                              )
                                          })}
                                        </div>
                                      <div className="justify-stretch mt-6 flex flex-col">
                                        <button
                                          type="button"
                                          className="flex-1 rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                        >
                                          Create new
                                        </button>
                                      </div>
                                      </Tab.Panel>}
                                </Tab.Panels>
                            </Tab.Group>
              </div>
            </section>
          </div>
        <PrimitivePopup selected={selected} contextOf={primitive} setSelected={setSelected}/>
        <MetricPopup selected={selectedMetric?.metric} contextOf={selectedMetric?.primitive} highlight={selectedMetric?.highlight} setSelected={setSelectedMetric}/>
      </div>
    </>
  )
}
