import { PrimitiveCard } from './PrimitiveCard'
import { MetricCard } from './MetricCard'
import { HeroIcon } from './HeroIcon'
import {Fragment, useEffect, useReducer, useRef, useState, useMemo, useCallback, useLayoutEffect} from 'react';
import { useLinkClickHandler, useNavigate, useParams } from "react-router-dom";
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
import { CheckIcon, XMarkIcon, HandThumbUpIcon, HandThumbDownIcon, GifIcon, ArrowPathIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import { formatDistance, subDays } from 'date-fns'
import ContactPicker from './ContactPicker';
import ResultViewer from './ResultViewer';
import useDataEvent from './CustomHook';
import OpenAIAnalysis from './OpenAIAnalysis';
import GoogleHelper from './GoogleHelper';
import EvidenceExplorer from './EvidenceExplorer';
import MetricEditor from './MetricEditor';
import AIProcessButton from './AIProcessButton';
import { ComponentRow } from './ComponentRow';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Popup from './Popup';
import AIStatusPopup from './AIStatusPopup';
import { AssessmentCard } from './AssessmentCard';
import {PrimitiveTable} from './PrimitiveTable';
import CardGrid from './CardGrid';
import PrimitiveExplorer from './PrimitiveExplorer';
import { VFImage } from './VFImage';


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
    const { id } = useParams();
    if( primitive === undefined && id){
      primitive = mainstore.primitive(isNaN(id) ? id : parseInt(id))
    }
    //let metadata = primitive.metadata
    let task = primitive.originTask
    //let origin = task && (primitive.originId !== task.id) ? primitive.origin : undefined

    const hasDocumentViewer = primitive.type === "result" && primitive.referenceParameters?.notes
    const [eventRelationships, updateRelationships] = useReducer( (x)=>x+1, 0)
    const callbackId = useRef(null)
    const [editMetric, setEditMetric] = useState(null)
    const [selected, setSelected] = useState(null)
    const [selectedMetric, setSelectedMetric] = useState(null)
    const [groupMetricsOpen, setGroupMetricsOpen] = useState(false)
    const [activePrim, setActivePrim] = useState(primitive.id)
    const [plainText, setPlainText] = useState()
    const resultViewer = useRef(null)
    const [analysis, setAnalysis] = useState()
    const [showWorkingPane, setShowWorkingPaneReal] = useState()
    const [componentView, setComponentView] = useState(null)
    const [showAIPopup, setShowAIPopup] = useState(null)
    const cvRef = useRef()
    const navigate = useNavigate();

    const setShowWorkingPane = useCallback((value) => {
      console.log(value)
      setShowWorkingPaneReal(value)
      if( props.setWidePage ){
        props.setWidePage( value )
      }
    })

    useDataEvent("relationship_update set_field", primitive.id, updateRelationships)

    const hasNestedEvidence = primitive.isTask
    const showOutcomes = primitive.type !== "assessment"// && !(showWorkingPane && hasNestedEvidence)
    const nestedEvidence = useMemo(()=>primitive.primitives.allUniqueResult.map((d)=>d.primitives.allUniqueEvidence).flat(), [primitive.id])
    const showMetrics = (primitive.isTask || primitive.type === "cohort" ) && primitive.metadata.metrics

    const hasQuestions = (task && task.metadata.sections?.questions) || (primitive && primitive.metadata.sections?.questions)
    const hasCategories = (task && task.metadata.sections?.categories) || (primitive && primitive.metadata.sections?.categories)

    useEffect(()=>{
      if( hasDocumentViewer ){
        setAnalysis(undefined)
      }
      console.log(`re run effect ${primitive.id}`)
      setShowWorkingPane(hasDocumentViewer ? true : (primitive.metadata?.title === "Market scan" ? "results" : false) )
      mainstore.setActiveWorkspaceFrom( primitive )
    }, [primitive.id])

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
    }
    useEffect(()=>{
      if( props.selectPrimitive ){
        props.selectPrimitive(null)
      }
     // registerCallbacks()
    },[])

    useLayoutEffect(()=>{
      if( cvRef.current ){
        var rect = cvRef.current.getBoundingClientRect();
        var windowHeight = window.innerHeight || document.documentElement.clientHeight;
        var vertInView = rect.top <= windowHeight && rect.top + rect.height >= 0;
        if( !vertInView ){
          cvRef.current.scrollIntoView({behavior:"smooth"})
        }

      }
    },[componentView])



    const setLocalMetric = (id)=>{
      console.log({primitive: primitive, metric: id})
      setSelectedMetric({primitive: primitive, metric: id})
    }

  const createNewResultFromDocument = async( category )=>{
    GoogleHelper().showPicker({}, (items)=>{
      for( const item of items){

        createResult( category, {
          title: item.name,
          type: category.primitiveType || "result",
          referenceParameters: {
            notes: {type: "google_drive", id: item.id, mimeType: item.mimeType, name: item.name}
          }
        } )
      }
    })
  }

  const createResult = async( category, options = {}, open = false )=>{
    const newObj = await mainstore.createPrimitive({
      parent: primitive,
      type: category.primitiveType || "result",
      title: options.title || `New ${category.title}`,
      categoryId: category.id,
      referenceParameters: options.referenceParameters
    })
    if(open){
      setSelected( newObj )
    }

  }


    let page = useRef()
    let header = useRef()

    let outcomesList = primitive.isTask ? primitive.primitives.outcomes.allUniqueEvidence : primitive.primitives.origin.allUniqueEvidence

  return (
    <>
      <div 
        style={{minHeight: showWorkingPane ? "100%" : 'calc(100% - 4rem)'}}
        className="overflow-y-scroll overscroll-contain w-full"
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
          <div key='banner' ref={header} className="w-full mt-10 z-40 mx-auto px-0.5 xs:px-6 flex items-center justify-between md:space-x-5 lg:px-8 sticky top-0 bg-gray-100">
            <PrimitiveCard.Banner primitive={primitive} showMenu={true} showStateAction={false} className='pl-4 pr-6 mx-auto w-full max-w-3xl lg:max-w-7xl'/>
          </div>

          <div key='content' 
            className={
              [
                'mx-auto mt-8 grid sm:px-6  gap-6 ',
                showWorkingPane 
                  ? "grid-cols-1 lg:grid-cols-[1fr_1fr_min-content] 2xl:grid-cols-[repeat(2,min-content)_auto_min-content] 2xl:grid-rows-[min-content_1fr] " 
                  : "grid-cols-1 lg:grid-flow-col-dense lg:grid-cols-3 max-w-3xl lg:max-w-7xl",
              ].join(" ")
          }>
            <div 
              className={[
                  "space-y-6 lg:col-span-2 lg:col-start-1",
                  showWorkingPane ? "2xl:w-[30em] h-fit" : ""
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
                        <Panel key='relatedTask' title={`Related ${task.type}`} titleClassName='text-sm pb-2 font-medium text-gray-500 flex border-b border-gray-200'>
                          <PrimitiveCard compact={true} primitive={task}  disableHover={true} showLink={true}/>
                        </Panel>
                    }
                    { primitive.type === "assessment" && primitive.venture && 
                        <Panel key='relatedVenture' title={`Related ${primitive.venture.type}`} titleClassName='text-sm pb-2 font-medium text-gray-500 flex border-b border-gray-200'>
                          <PrimitiveCard compact={true} primitive={primitive.venture}  disableHover={true} showLink={true}/>
                        </Panel>
                    }
                  </div>
                  {hasQuestions && (task || primitive.isTask) && <div className="border-gray-200 px-4 pb-5 sm:px-6 col-span-5">
                    <PrimitiveCard.Questions key='questions' primitive={task ? task : primitive} relatedTo={primitive} editable={true}/>
                  </div>}
                  {hasCategories && (task || primitive.isTask) && <div className="border-gray-200 px-4 pb-5 sm:px-6 col-span-5">
                    <PrimitiveCard.Categories key='categories' primitive={task ? task : primitive} relatedTo={primitive} editable={true}/>
                  </div>}
                  {primitive.resources && <div className="px-4 pt-2 pb-5 sm:px-6 col-span-5">
                    <PrimitiveCard.Resources primitive={primitive}/>
                  </div>}
                  {primitive.type==="venture" && <div className="px-4 pt-2 pb-5 sm:px-6 col-span-5">
                    <AssessmentCard primitive={primitive.currentAssessment}/>
                  </div>}
              </div>
              </section>
                {showMetrics && <Panel key='metrics' title='Metrics' titleButton={{action:()=>setEditMetric({new: true})}} titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true} open={primitive.metrics}>
                  <div className='@container'>
                    <div className="gap-3  grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3">
                        {(primitive.metrics === undefined || primitive.metrics.length === 0) && 
                          <div className='col-span-1 @md:col-span-2 @xl:col-span-3 w-full p-2'>
                            <button
                            onClick={()=>setEditMetric({new: true})}
                            type="button"
                            className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                          >
                            <span className="mt-2 block text-sm font-semibold text-gray-900">Create a metric</span>
                          </button>
                          </div>
                        }
                        {primitive.metrics && primitive.metrics.map((metric)=>{
                          let wide = metric.type === "conversion"
                          const m = <MetricCard 
                              key={metric.id} 
                              groupOpen={wide ? undefined : groupMetricsOpen}
                              groupControl={wide ? undefined : setGroupMetricsOpen}
                              className='h-full' 
                              onClick={setLocalMetric} 
                              primitive={primitive} 
                              metric={(metric)} 
                              editMetric={setEditMetric}
                              wideSizeClasses='col-span-1 @md:col-span-2 @xl:col-span-3'
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
                  </div>
                </Panel>}

            {hasNestedEvidence && showWorkingPane !== "evidence" &&
                  <Panel key='evidence_panel' title="Evidence" expandButton={()=>setShowWorkingPane('evidence')} titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true}>
                        {(nestedEvidence === undefined || nestedEvidence.length === 0) && 
                          <div className='w-full p-2'>
                            <button
                            type="button"
                            className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                          >
                            <span className="mt-2 block text-sm font-semibold text-gray-900">Nothing to show</span>
                          </button>
                          </div>
                        }
                    <PrimitiveCard.EvidenceList onCardClick={(p)=>props.selectPrimitive(p)} showCategories={primitive.primitives.allCategory.length > 0} relationshipTo={primitive} relationshipMode="presence"  evidenceList={nestedEvidence} aggregate={true} relatedTask={primitive} frameClassName='columns-1 xs:columns-2 sm:columns-3 md:columns-4' hideTitle='hideTitle'/>
                  </Panel>}
            {primitive.type === "assessment" && primitive.framework &&
                  <Panel key='assessment_panel' title="Assessment" titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true} open={true}>
                    { Object.values(primitive.framework.components).map((c) => {
                      return (<ComponentRow onClick={()=>{setShowWorkingPane('assessment');setComponentView(c)}} primitive={primitive} compact={true} evidenceDetail={false} key={c.id} component={c}/>)
                      })
                    }                    
                  </Panel>}

            {showWorkingPane !== "results" && primitive.metadata.resultCategories && primitive.metadata.resultCategories.map((category)=>{
                let view = category.views?.default
                let cardConfig = view ? category.views.list[view] : undefined
                let cardSort =  view ? category.views.sort[view] : undefined
                const viewConfig = view ? (category.views?.config && category.views?.config[view] ) : undefined
                
                
                let list = primitive.primitives.results ?  primitive.primitives.results[category.id].map((d)=>d) : []

                const resultCategory = mainstore.category(category.resultCategoryId)
                const title = (resultCategory.openai || resultCategory.doDiscovery) 
                            ? <div className='flex place-items-center'>
                              {category.plurals || category.title}
                              <button
                                type="button"
                                onClick={(e)=>{e.stopPropagation();setShowAIPopup({category:resultCategory, path: category.id})}}
                                className="text-xs ml-2 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full text-gray-400 font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                                  <FontAwesomeIcon icon="fa-solid fa-robot" />
                                </button>
                              </div>
                            : category.plurals || category.title

                let createButtons = [{title:"Create new", action: ()=>createResult(resultCategory, undefined, true)}]
                if( resultCategory.parameters.notes ){
                  createButtons.push( {title: "Create from document", action: ()=>createNewResultFromDocument(resultCategory)} )
                }
                
                return (
                  <Panel expandButton={title === "Organizations" ? ()=>setShowWorkingPane('results') : undefined} key={category.title} count={list.length} title={title} titleButton={createButtons} titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true}>
                        {(list === undefined || list.length === 0) && 
                          <div className='w-full p-2'>
                            <button
                            type="button"
                            onClick={()=>createResult(resultCategory, undefined, true)}
                            className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                          >
                            <span className="mt-2 block text-sm font-semibold text-gray-900">Create a new {category.title}</span>
                          </button>
                          </div>
                        }
                        {
                        view === "table" && <div className="p-2 bg-white rounded-md h-[60vh]">
                          <PrimitiveTable 
                            onDoubleClick={(p)=>setSelected({list:list, idx: list.findIndex((d)=>d.id === p.id)})} 
                            columns={category.views.list.table} primitives={list} className='w-full min-h-[24em] bg-white'/> 
                        </div>
                        }
                        {view === "cards" && <CardGrid 
                          primitive={primitive}
                          category={category}
                          selectedItem={selected}
                          cardClick={(e)=>e.currentTarget.focus()}
                          onEnter={(e, p, list, idx)=>{setSelected({list: list, idx: idx})}}
                          onDoubleClick={(e, p) =>{e.preventDefault();navigate(`/item/${p.id}`)}}
                          list={list} 
                          cardSort={cardSort} 
                          cardFields={cardConfig} 
                          columnClass={showWorkingPane ? "sm:columns-2" : viewConfig?.wide ? 'sm:columns-2 2xl:columns-3' : `sm:columns-2 md:columns-3 xl:columns-4`}
                          />}
                  </Panel>
                )
            })}
            {primitive.summary &&
                  <Panel key='analysis' title='Auto analysis' collapsable={true}>
                  <div className="bg-white shadow sm:overflow-hidden sm:rounded-lg mb-6 p-4 mt-2">
                    <dd className="mt-1 text-sm text-gray-900">
                      <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
                          <li key='sumamry' className=" py-3 pl-3 pr-4 text-sm">
                              <p className="text-medium ml-2 flex-1 truncate">Summary</p>
                              <p className="text-gray-600 ml-4 mt-2 pl-2 flex-1 border-l-2 border-gray-200">{primitive.summary}</p>
                          </li>
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
                    showWorkingPane ? 'row-start-4 lg:row-start-3 2xl:row-start-2' :"row-start-3 lg:row-start-2"
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
            {showWorkingPane  && 
              <div style={{minWidth:0, minHeight:0}} className='h-[60vh] 2xl:h-[calc(100vh_-_10em)] col-start-1 lg:col-span-2 2xl:col-start-3 2xl:col-span-1 row-start-2 2xl:row-start-1 2xl:sticky 2xl:top-[6em] row-span-1 2xl:row-span-2'>
                <div ref={cvRef} className='bg-white rounded-lg shadow h-full flex flex-col p-2 @container'>
                    {showWorkingPane === "evidence" &&
                          <EvidenceExplorer closeButton={()=>setShowWorkingPane(false)} evidenceList={nestedEvidence}  showOriginInfo={[{contact: 'contactName'}, 'company']} primitive={primitive}/>
                    }
                    {hasDocumentViewer && <ResultViewer ref={resultViewer} enableEvidence={true} onHighlightClick={(d)=>console.log(d)} primitive={primitive} />}
                    {showWorkingPane === "assessment" && primitive.framework && componentView && <ComponentRow selectPrimitive={props.selectPrimitive} showFullText={true}  compact={false} evidenceDetail={true} primitive={primitive} key={componentView.id} component={componentView}/>}
                    {true && showWorkingPane === "results" && 
                          <PrimitiveExplorer 
                            primitive={primitive}
                            types='entity'
                            renderProps={{
                              hideDescription: true, 
                              hideCover: true,
                              hideCategories: true,
                              urlShort: true
                            }}
                            render={
                              (p)=><VFImage className="m-1 w-8 h-8 object-scale" src={`/api/image/${p.id}`} />
                            }
                            closeButton={()=>setShowWorkingPane(false)} 
                            />
                    }
                    {false && showWorkingPane === "results" && <div className='overflow-y-scroll'>
                        <CardGrid 
                          primitive={primitive}
                          createButton={(resultCategory)=>createResult(resultCategory, undefined, true)}
                          cardClick={(e)=>e.currentTarget.focus()}
                          onEnter={(e, p, list, idx)=>{setSelected({list: list, idx: idx})}}
                          onDoubleClick={(e, p) =>{e.preventDefault();navigate(`/item/${p.id}`)}}
                          className='p-2'
                          columnClass={`@xl:columns-2 @[70rem]:columns-3 @[95rem]:columns-4 @[120rem]:columns-5`}
                          /></div>}
                </div>
              </div>
              }

            {showOutcomes && <section key='rhs' 
              className={
                [
                  "col-start-1 col-span-1  ",
                  showWorkingPane ? "min-w-[25em] lg:col-start-3 2xl:col-start-4 row-start-3 row-span-4 lg:row-start-1 2xl:row-span-2" : "lg:row-span-4 lg:col-start-3 row-start-2 lg:row-start-1 "
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
                                        <ul role="list" className="p-1 space-y-2">
                                          {outcomesList.map((p)=>(
                                              <PrimitiveCard key={p.id} showMenu menuProps={{showVisitPage:false, showDelete: "origin", showUnlink: true}} relatedTo={primitive} compact={true} primitive={p} showMeta="large" onClick={()=>resultViewer.current && resultViewer.current.showPrimitive(p.id)}/>
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
                                    {!primitive.isTask && task && task.metrics && 
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
            </section>}
          </div>
        <PrimitivePopup primitive={selected} contextOf={primitive} editing={true} setPrimitive={setSelected}/>
        <MetricPopup selected={selectedMetric?.metric} contextOf={selectedMetric?.primitive} highlight={selectedMetric?.highlight} setSelected={setSelectedMetric}/>
        {editMetric && <MetricEditor metric={editMetric} primitive={primitive} setOpen={()=>setEditMetric(null)}/> }
        {showAIPopup && <AIStatusPopup category={showAIPopup.category} path={showAIPopup.path} primitive={primitive} close={()=>setShowAIPopup(false)}/>}
      </div>
    </>
  )
}
