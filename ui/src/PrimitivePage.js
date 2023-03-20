import { PrimitiveCard } from './PrimitiveCard'
import { MetricCard } from './MetricCard'
import { HeroIcon } from './HeroIcon'
import {Fragment, useEffect, useReducer, useRef, useState} from 'react';
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
import ContactPicker from './ContactPicker';
import ResultViewer from './ResultViewer';
import useDataEvent from './CustomHook';
import OpenAIAnalysis from './OpenAIAnalysis';
import GoogleHelper from './GoogleHelper';


let mainstore = MainStore()

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

    const [eventRelationships, updateRelationships] = useReducer( (x)=>x+1, 0)
    const callbackId = useRef(null)
    const [selected, setSelected] = useState(null)
    const [selectedMetric, setSelectedMetric] = useState(null)
    const [groupMetricsOpen, setGroupMetricsOpen] = useState(false)
    const [activePrim, setActivePrim] = useState(primitive.id)
    const [plainText, setPlainText] = useState()
    const resultViewer = useRef()
    const [analysis, setAnalysis] = useState()
    const test = ()=>{
      console.log('helo')
      updateRelationships()
    }
    useDataEvent("relationship_update", primitive.id, test)

    const hasDocumentViewer = primitive.type === "result" && primitive.referenceParameters?.notes

      const analyzeText = async ()=>{
        if( primitive.referenceParameters.notes.type === "google_drive"){
          
          const text = await GoogleHelper().getFileAsPdf( primitive.referenceParameters.notes.id, "text/plain")
          setPlainText(text)

          const thisAnalysis = OpenAIAnalysis({text: text})
          window.analysis = thisAnalysis
          await thisAnalysis.process()
          setAnalysis(thisAnalysis)
        }
      }

    useEffect(()=>{
      if( hasDocumentViewer ){
        setAnalysis(undefined)
        console.log(`WILL READ NOW`)
        analyzeText()
      }
    },[primitive.id])

    /*const registerCallbacks = ()=>{
      callbackId.current = mainstore.registerCallback(callbackId.current, "relationship_update", updateRelationships, primitive.id )
    }*/

    if( activePrim !== primitive.id ){
      setActivePrim(primitive.id)
      setSelectedMetric(null)
      setSelected(null)
      setGroupMetricsOpen(false)
      if( props.selectPrimitive ){
        props.selectPrimitive(null)
      }
      //registerCallbacks()
    }
    useEffect(()=>{
      if( props.selectPrimitive ){
        props.selectPrimitive(null)
      }
     // registerCallbacks()
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

  const createResult = async( category, open = false )=>{
    const newObj = await mainstore.createPrimitive({
      parent: primitive,
      type: "result",
      title: `New ${category.title}`,
      categoryId: category.resultCategoryId,
    })
    setSelected( newObj )

  }

  const createEvidenceFromNote = async (note)=>{
    await mainstore.createPrimitive({
      parent: primitive,
      type: "evidence",
      title: note.content,
      categoryId: 3,
      referenceParameters:{
        highlightAreas: note.highlightAreas,
        quotedText: note.quote
      }
    })
  }


    let page = useRef()
    let header = useRef()

    let outcomesList = primitive.primitives.filter((p)=>p.type === "evidence")

  return (
    <>
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
          <div key='banner' ref={header} className="w-full mt-10 z-10 mx-auto px-0.5 xs:px-6 flex items-center justify-between md:space-x-5 lg:px-8 sticky top-0 bg-gray-100">
            <PrimitiveCard.Banner primitive={primitive} showStateAction={true} className='pl-4 pr-6 mx-auto w-full max-w-3xl lg:max-w-7xl'/>
          </div>

          <div key='content' 
            className={
              [
                'mx-auto mt-8 grid sm:px-6  gap-6 ',
                hasDocumentViewer 
                  ? "grid-cols-1 lg:grid-cols-[1fr_1fr_min-content] 2xl:grid-cols-[repeat(2,min-content)_auto_min-content] 2xl:grid-rows-[min-content_1fr] " 
                  : "grid-cols-1 lg:grid-flow-col-dense lg:grid-cols-3 max-w-3xl lg:max-w-7xl",
              ].join(" ")
          }>
            <div 
              className={[
                  "space-y-6 lg:col-span-2 lg:col-start-1",
                  hasDocumentViewer ? "2xl:w-[30em] h-fit" : ""
                ].join(" ")}
              >
              <section 
                aria-labelledby="applicant-information-title"
              
                >
                <div className="bg-white shadow sm:rounded-lg grid grid-cols-5 @container">
                  <div className="px-4 py-5 sm:px-6 col-span-5">
                    <PrimitiveCard primitive={primitive} showEdit={true} hideTitle={true} major={true}/>
                  </div>
                  <div className="border-gray-200 px-4 pb-5 sm:px-6 col-span-5 @lg:col-span-3">
                    <PrimitiveCard.Details allowEdit={true} primitive={primitive} title={`${primitive.displayType} details`} hideFooter={true}/>
                  </div>
                  <div className="border-gray-200 px-4 pb-5 sm:px-6 col-span-5 @lg:col-span-2">
                    { primitive.isTask && <PrimitiveCard.Users primitive={primitive} title={`Team members`} asTable={true}/>}
                    { !primitive.isTask && task && 
                      <Panel title={`Related ${task.type}`} titleClassName='text-sm pb-2 font-medium text-gray-500 flex border-b border-gray-200'>
                        <PrimitiveCard compact={true} primitive={task}  disableHover={true} showUsers={true} showLink={true}/>
                      </Panel>
                    }
                  </div>
                  <div className="px-4 pt-2 pb-5 sm:px-6 col-span-5">
                    <PrimitiveCard.Resources primitive={primitive}/>
                  </div>
            {!hasDocumentViewer && 
                <div className='px-4 sm:px-6 pt-2 pb-5 col-span-5 w-full'>
                  <Panel key='analysis' title='Questions' collapsable={true}>
                    <dd className="mt-1 text-sm text-gray-900">
                      <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
                        {OpenAIAnalysis({}).questions.map((question, idx) => (
                          <li
                            key={idx}
                            className=" py-3 pl-3 pr-4 text-sm"
                          >
                              <p className="text-medium ml-2 flex-1 truncate">{question}</p>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </Panel>
                </div>
            
            }
                </div>
              </section>
            {primitive.metrics &&
                <section key='metricss' aria-labelledby="applicant-information-title">
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
                              zIndex: 100
                            };
                            
                            const closed = {
                              transitionEnd: { zIndex: 0 }
                            };
                            const id = `m${metric.id}`
                            return <motion.div 
                                        animate={
                                          selectedMetric?.metric === metric.id ? open : closed
                                        }
                                      key={id} layoutId={id}>
                                        {selectedMetric?.metric !== metric.id && m}
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
                
                let list = primitive.primitives.results[category.id].map((d)=>d)

                if( cardConfig ){
                  list = list.sort((a,b)=>{
                    let va = a.referenceParameters[cardConfig[0]]
                    let vb = b.referenceParameters[cardConfig[0]]
                    if( va && vb ){
                        return va.localeCompare(vb)
                    }
                  })
                }

                
                return (
                  <Panel key={category.title} title={primitive.metadata.title} titleButton={()=>createResult(category)} titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true}>
                        <div 
                            className="gap-3 space-y-3 no-break-children sm:columns-2 md:columns-3 xl:columns-4">
                            {list.map((p,idx)=>{
                                return (
                                    <motion.div 
                                        key={p.plainId}
                                        layoutId={p.plainId} onDoubleClick={(e) =>{e.preventDefault();setSelected(p)}}
                                    >
                                    <PrimitiveCard 
                                        key={p.id}
                                        compact={true} primitive={p} 
                                        onClick={(e)=>e.currentTarget.focus()}
                                        onEnter={()=>setSelected(p)}
                                        className={`h-full select-none flex flex-col justify-between ${selected && selected.id === p.id ? "bg-white opacity-50 blur-50" : ""}`}
                                        fields={cardConfig} 
                                        border={true} 
                                        showExpand={true}
                                        showState={showState} 
                                        showAsSecondary={true}
                                        showEvidence="compact"
                                        noEvents = {true}
                                        relationships={category.relationships} 
                                        relationship={primitive.primitives.relationships(p.id, ["results", category.id])}/>
                                    </motion.div>
                                )}
                            )}
                        </div>
                  </Panel>
                )
            })}
            {hasDocumentViewer  && 
                  <Panel key='analysis' title='OpenAI analysis' collapsable={true}>
                  <div className="bg-white shadow sm:overflow-hidden sm:rounded-lg mb-6 p-4 mt-2">
                    <dd className="mt-1 text-sm text-gray-900">
                      <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
                        {!analysis && <p>Waiting....</p>}
                        {analysis && analysis.questions.map((question, idx) => (
                          <li
                            key={idx}
                            className=" py-3 pl-3 pr-4 text-sm"
                          >
                              <p className="text-medium ml-2 flex-1 truncate">{question}</p>
                              <p className="text-gray-600 ml-4 mt-2 pl-2 flex-1 border-l-2 border-gray-200">{analysis.answers[idx]}</p>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  </Panel>
            
            }
            </div>

              <section 
                key='notes'
                className={[
                    'col-start-1 lg:col-span-2',
                    hasDocumentViewer ? 'row-start-4 lg:row-start-3 2xl:row-start-2' :"row-start-3 lg:row-start-2"
                  ].join(" ")}
                >
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
                        {primitive.comments?.map((comment,idx) => {
                          let user = mainstore.user( comment.userId)
                          return (
                          <li key={idx}>
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
                        <img className="h-10 w-10 rounded-full" src={mainstore.activeUser.info.avatarUrl} alt="" referrerPolicy="no-referrer"/>            
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
            {primitive?.referenceParameters?.notes && 
              <div className='h-[60vh] 2xl:h-[calc(100vh_-_10em)] col-start-1 lg:col-span-2 2xl:col-start-3 2xl:col-span-1 row-start-2 2xl:row-start-1 2xl:sticky 2xl:top-[6em] row-span-1 2xl:row-span-2'>
              <ResultViewer evidenceList={outcomesList} ref={resultViewer} enableEvidence={true} onHighlightClick={(d)=>console.log(d)} createCallback={createEvidenceFromNote} GoogleDoc={primitive.referenceParameters.notes}/>
              </div>
              }

            <section key='rhs' 
              className={
                [
                  "lg:col-span-1  ",
                  hasDocumentViewer ? "min-w-[25em] lg:col-start-3 2xl:col-start-4 row-start-3 lg:row-start-1 2xl:row-span-2" : "lg:col-start-3 row-start-2 lg:row-start-1 "
                ].join(" ")
              }>
              <div className="bg-white px-4 py-5 shadow sm:rounded-lg sm:px-6 sticky top-[6em]">
                            <Tab.Group>
                                <Tab.List key='tabs' className="-mb-px flex space-x-8 border-b border-gray-200" aria-label="Tabs">
                                <Tab key='t1' as={Fragment}>
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
                                <Tab key='t2' as={Fragment}>
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
                                <Tab.Panels key='panels'>
                                    <Tab.Panel>
                                      <div key='evidence' className="mt-6 flow-root">
                                        <ul role="list" className="p-1 space-y-1">
                                          {outcomesList.map((p)=>(
                                              <PrimitiveCard key={p.id} compact={true} primitive={p} showMeta="large" onClick={()=>resultViewer.current && resultViewer.current.showPrimitive(p.id)}/>
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
                                      <Tab.Panel >
                                        <div 
                                          key='metrics'
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
                                              <Fragment key={metric.id}>
                                                <button
                                                    type="button"
                                                    onClick={()=>task.toggleRelationship(primitive, metric)}
                                                    className="ml-1 flex p-1 m-1 flex-none items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none active:ring-2 active:ring-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                                >
                                                  {included && <CheckIcon className='w-5 h-5 text-green-500'/>}
                                                  {!included && <XMarkIcon className='w-5 h-5 text-amber-600'/>}
                                                </button>
                                                <a href='#' onClick={()=>setSelectedMetric({primitive: task, metric: metric.id, highlight: primitive.id})}>
                                                  <p className='p-2 text-sm truncate text-gray-500 hover:text-indigo-600 hover:underline'>{metric.title}</p>
                                                </a>
                                              </Fragment>
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
        <PrimitivePopup selected={selected} contextOf={primitive} editing={true} setSelected={setSelected}/>
        <MetricPopup selected={selectedMetric?.metric} contextOf={selectedMetric?.primitive} highlight={selectedMetric?.highlight} setSelected={setSelectedMetric}/>
      </div>
    </>
  )
}
