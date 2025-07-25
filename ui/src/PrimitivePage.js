import { PrimitiveCard } from './PrimitiveCard'
import { MetricCard } from './MetricCard'
import { HeroIcon } from './HeroIcon'
import {Fragment, useEffect, useReducer, useRef, useState, useMemo, useCallback, useLayoutEffect} from 'react';
import { useLinkClickHandler, useNavigate, useParams } from "react-router-dom";
import Panel from './Panel';
import { Tab, Transition } from '@headlessui/react'
import {
  QuestionMarkCircleIcon,
} from '@heroicons/react/20/solid'
import { PrimitivePopup } from './PrimitivePopup';
import { MetricPopup } from './MetricPopup';
import MainStore from './MainStore';
import { CheckIcon, XMarkIcon, HandThumbUpIcon, HandThumbDownIcon, GifIcon, ArrowPathIcon, ArrowsPointingInIcon, PlusIcon } from '@heroicons/react/24/outline';
import { formatDistance, subDays } from 'date-fns'
import ResultViewer from './ResultViewer';
import useDataEvent from './CustomHook';
import MetricEditor from './MetricEditor';
import { ComponentRow } from './ComponentRow';
import AIStatusPopup from './AIStatusPopup';
import { AssessmentCard } from './AssessmentCard';
import CollectionViewer from './CollectionViewer';
import EditableTextField from './EditableTextField';
import PrimitiveConfig from './PrimitiveConfig';
import VFTable from './VFTable';
import MapViewer from './MapViewer';
import BoardViewer from './BoardViewer';
import AnalysisPage from './AnalysisPage';
import FlowPage from './FlowPage';
import ReportViewExporter from './ReportViewExporter';
import RouterTest from './RouterTest';
import FlowInstancePage from './FlowInstancePage';


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

    const hasDocumentViewer = primitive.type === "result" && (primitive.referenceParameters?.notes || primitive.referenceParameters?.url)
    const [eventRelationships, updateRelationships] = useReducer( (x)=>x+1, 0)
    const callbackId = useRef(null)
    const [editMetric, setEditMetric] = useState(null)
    const [selected, setSelected] = useState(null)
    const [selectedMetric, setSelectedMetric] = useState(null)
    const [groupMetricsOpen, setGroupMetricsOpen] = useState(false)
    const [activePrim, setActivePrim] = useState(primitive.id)
    const [plainText, setPlainText] = useState()
    const resultViewer = useRef(null)
    const [showWorkingPane, setShowWorkingPaneReal] = useState( )
    const [componentView, setComponentView] = useState(null)
    const [showAIPopup, setShowAIPopup] = useState(null)
    const cvRef = useRef()
    const navigate = useNavigate();

    const doFullScreenExplore = (val)=>{
      if( val ){
        if( val === 'assessment_table'){
          return true
        } 
        if( val === 'map' || val === 'evidence' || val === "report" ){
          return true
        } 
        if( val.type === "result"){
          return true
        }
      }
      if( primitive.type === "board" || primitive.type==="flowinstance"|| primitive.type==="working" || primitive.type==="flow" ){
        return true
      }
      return false
    }

    const setShowWorkingPane = useCallback((value) => {
      if( value === false && hasDocumentViewer){value = true}
      setShowWorkingPaneReal(value)
      if( props.setWidePage ){
        const fullScreenExplore = PrimitiveConfig.pageview[primitive.type]?.defaultWide ?? doFullScreenExplore(value) 
        props.setWidePage( fullScreenExplore ? "always" : value )
      }
    })

    useDataEvent("relationship_update set_field set_parameter", primitive.id, updateRelationships)

    const fullScreenExplore = doFullScreenExplore(showWorkingPane )
    const showOutcomes = primitive.type !== "assessment" && showWorkingPane !== "evidence" && !fullScreenExplore
    //const nestedEvidence = useMemo(()=>primitive.primitives.allUniqueResult.map((d)=>d.primitives.allUniqueEvidence).flat(), [primitive.id])
    const nestedEvidence = useMemo(()=>{
            if( fullScreenExplore){
              return []
            }
            return (primitive.type === "activity" ? primitive.primitives.results.descendants : primitive.primitives.descendants).filter((d)=>d.type==="evidence")
    }, [primitive.id])
    const hasNestedEvidence = (PrimitiveConfig.pageview[primitive.type]?.evidence ?? true) && (primitive.isTask || nestedEvidence.length > 0)
    const showMetrics = (primitive.isTask || primitive.type === "cohort" ) && primitive.metadata.metrics


    const hasQuestions = (task && task.metadata?.sections?.questions) || (primitive && primitive.metadata?.sections?.questions)
    const hasCategories = false //(task && task.metadata.sections?.categories) || (primitive && primitive.metadata.sections?.categories)

    useEffect(()=>{
      console.log(`re run effect ${primitive.id}`)
      if( hasDocumentViewer ){
        setShowWorkingPane(true )

      }else if(PrimitiveConfig.pageview[primitive?.type]?.defaultWide){
        setShowWorkingPane( PrimitiveConfig.pageview[primitive.type].defaultWide )
      }else{
        setShowWorkingPane(false)
      }
      mainstore.setActiveWorkspaceFrom( primitive )
    }, [primitive.id, hasDocumentViewer])


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


    let page = useRef()
    let header = useRef()

    let outcomesList = primitive.isTask ? primitive.primitives.outcomes.allUniqueEvidence : primitive.primitives.origin.allUniqueEvidence
    
    const leftHandSection = ()=>{
      return (
            <>
              <section>
                <div className="bg-white shadow sm:rounded-lg grid grid-cols-5 @container">
                  <div className="px-4 py-5 sm:px-6 col-span-5">
                    <PrimitiveCard primitive={primitive} showEdit={true} hideTitle={true} major={true}/>
                  </div>
                  <div className="border-gray-200 px-4 pb-5 sm:px-6 col-span-5 @lg:col-span-3">
                    <PrimitiveCard.Details allowEdit={true} primitive={primitive} title={`${primitive.displayType} details`} hideFooter={true}/>
                  </div>
                  {(Object.keys(primitive.primitives || {}).includes("imports") || primitive.type==="report") &&
                    <div className='px-4 py-5 sm:px-6 col-span-5'>
                      <Panel title="Inputs" collapsable={true} open={false} major titleClassName='text-sm pb-2 font-medium text-gray-500 flex border-b border-gray-200 w-full justify-between'>
                          <PrimitiveCard.ImportList primitive={primitive} relationship={primitive.type==="report" ? "imports.main" : undefined}/>
                            <div type="button"
                              className="flex my-2 font-medium grow-0 bg-white hover:bg-gray-100 hover:shadow-sm hover:text-gray-600 justify-center ml-2 p-1 rounded-full shrink-0 text-xs text-gray-400 "
                              onClick={()=>{
                                MainStore().globalPicker({
                                  target: primitive,
                                  exclude: primitive.type==="report" ? primitive.primitives.imports.main : primitive.primitives.imports,
                                  callback:(pick)=>{
                                    primitive.addRelationship(pick, primitive.type==="report" ? "imports.main" : undefined)
                                  },
                                })
                              }}> 
                                      <PlusIcon className="w-5 h-5"/>
                            </div>
                      </Panel>
                    </div>
                  }
                  <div className="border-gray-200 px-4 pb-5 sm:px-6 col-span-5 @lg:col-span-2">
                    { primitive.isTask && <PrimitiveCard.Users primitive={primitive} title={`Team members`} asTable={true}/>}
                    { primitive.origin && 
                        <Panel key='relatedOrigin' title={`Related ${primitive.origin.type}`} titleClassName='text-sm pb-2 font-medium text-gray-500 flex border-b border-gray-200'>
                          <PrimitiveCard variant={false} compact={true} primitive={primitive.origin}  disableHover={true} showLink={true}/>
                        </Panel>
                    }
                    { !primitive.isTask && task && task.id !== primitive.origin.id && 
                        <Panel key='relatedTask' title={`Related ${task.type}`} titleClassName='text-sm pb-2 font-medium text-gray-500 flex border-b border-gray-200'>
                          <PrimitiveCard variant={false} compact={true} primitive={task}  disableHover={true} showLink={true}/>
                        </Panel>
                    }
                  </div>
                  {hasQuestions && (task || primitive.isTask) && <div className="border-gray-200 px-4 pb-5 sm:px-6 col-span-5">
                    <PrimitiveCard.Questions key='questions' panelOpen={false} primitive={task ? task : primitive} relatedTo={primitive} editable={true}/>
                  </div>}
                  {hasCategories && (task || primitive.isTask) && <div className="border-gray-200 px-4 pb-5 sm:px-6 col-span-5">
                    <PrimitiveCard.Categories key='categories' panelOpen={false} primitive={task ? task : primitive} relatedTo={primitive} editable={true} includeResult={false}/>
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
                            return <div 
                                        animate={
                                          selectedMetric?.metric === metric.id ? open : closed
                                        }
                                      key={id} >
                                        {selectedMetric?.metric !== metric.id && m}
                                  </div> 
                          }
                        })}
                    </div>
                  </div>
                </Panel>
              }

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
              {showWorkingPane !== "map" &&
                    <Panel key='map_panel' title="Maps" expandButton={()=>setShowWorkingPane('map')} titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true}>
                      <MapViewer primitive={primitive}/>
                    </Panel>}
              {primitive.type === "assessment" && primitive.framework &&
                    <Panel key='assessment_panel' title="Assessment" titleClassName='w-full text-md font-medium text-gray-500 pt-5 pb-2 px-0.5 flex place-items-center' collapsable={true} open={true}>
                      { Object.values(primitive.framework.components).map((c) => {
                        if( primitive.referenceParameters?.phase){
                          if( Object.values(c.levels).filter((d)=>d.phaseId === primitive.referenceParameters?.phase).length === 0){
                            return <></>
                          }
                        }
                        return (<ComponentRow showStats onClick={()=>{setShowWorkingPane('assessment');setComponentView(c)}} primitive={primitive} compact={true} evidenceDetail={false} key={c.id} component={c}/>)
                        })
                      }                    
                    </Panel>}
              {primitive.type === "assessment" && primitive.framework &&
                                    <Panel.MenuButton title='Table' action={()=>setShowWorkingPane("assessment_table")}/>
              }

              {primitive.metadata?.resultCategories && primitive.metadata.resultCategories.filter(d=>!d.hide).map((category,idx)=>{
                const asViewer = PrimitiveConfig.pageview[primitive.type]?.viewer && idx === 0
                return !(showWorkingPane instanceof Object && showWorkingPane.type === "result" && showWorkingPane.index === category.id) ?
                  <CollectionViewer 
                    key={`pane_${category.id}`}
                    primitive={primitive} 
                    category={category} 
                    viewSelf={asViewer}
                    hideCreate={asViewer}
                    open={asViewer}
                    setSelected={setSelected} 
                    onShowInfo={(e,p, s)=>{props.selectPrimitive(p,{scope: s || primitive})}}
                    onInnerShowInfo={(e,p, s)=>{props.selectPrimitive(p,{scope: s || primitive})}}
                    setShowAIPopup={setShowAIPopup}
                    onExpand={()=>setShowWorkingPane( {type: 'result', index: category.id })}
                    onPreview={setSelected ? (p, s)=>{setSelected(p,{scope: s || primitive})} : undefined}
                    onPreviewFromList={setSelected ? (e, p, list, idx)=>{setSelected({list: list, idx: idx},{scope: primitive})} : undefined}
                    onNavigate={(e, p) =>{e.preventDefault();navigate(`/item/${p.id}`)}}
                    selected={selected}
                    /> : undefined
              })}
              {primitive.summary &&
                    <Panel key='analysis' title='Auto analysis' collapsable={true}>
                    <div className="bg-white shadow sm:overflow-hidden sm:rounded-lg mb-6 p-4 mt-2">
                      <dd className="mt-1 text-sm text-gray-900">
                        <ul role="list" className="divide-y divide-gray-200 rounded-md border border-gray-200">
                            <li key='sumamry' className=" py-3 pl-3 pr-4 text-sm">
                                <p className="text-medium ml-2 flex-1 truncate">Summary</p>
                                <EditableTextField
                                  {...props} 
                                  editable={true}
                                  submitOnEnter={true} 
                                  value={primitive.summary} 
                                  callback={(value)=>{
                                      return primitive.setField("summary", value)
                                  }}
                                  fieldClassName={`text-gray-600 ml-4 mt-2 pl-2 flex-1 border-l-2 border-gray-200`}
                                />
                            </li>
                        </ul>
                      </dd>
                    </div>
                    </Panel>
              
              }
              {primitive.metadata?.reports && 
                                    <Panel.MenuButton title='Reports' action={()=>setShowWorkingPane("report")}/>
              }
        </>
      )
    }
  
  if( primitive?.type === "working" ){
    return <AnalysisPage primitive={primitive}/>
  }
  if(primitive?.type === "flow"  ){
    //return <FlowPage primitive={primitive}/>
    return <div className={`h-[calc(100vh_-_4em)] p-4`}>
              <BoardViewer primitive={primitive}/>
            </div>
  }
  if( primitive?.type === "flowinstance"  ){
    return <FlowInstancePage primitive={primitive}/>
  }

  return (
    <>
      <div 
        style={{minHeight: showWorkingPane ? "100%" : 'calc(100% - 4rem)'}}
        className="overflow-y-scroll overscroll-contain w-full overflow-x-hidden"
        onScroll={()=>{
          if( header.current && page.current){

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
          }


        }}
        ref={page}
      >
          {!props.widePage && 
            <div key='banner' ref={header} className={`w-full overflow-hidden mt-10 z-40 mx-auto px-0.5 xs:px-6 flex items-center justify-between md:space-x-5 lg:px-8 sticky top-0 bg-gray-100 ${props.bannerClassName}`}>
              <PrimitiveCard.Banner primitive={primitive} showMenu={true} showStateAction={false} className='pl-4 pr-6 mx-auto w-full max-w-3xl lg:max-w-7xl'/>
              <PrimitiveCard.ProcessingBase primitive={primitive}/>
            </div>
          }

          <div key='content' 
            className={
              [
                'mt-8 grid sm:px-6 ',
                fullScreenExplore ? "" :"gap-6",
                showWorkingPane 
                  ? "relative grid-cols-1 lg:grid-cols-[1fr_1fr_min-content] 2xl:grid-cols-[repeat(2,min-content)_auto_min-content] 2xl:grid-rows-[min-content_1fr] " 
                  : "grid-cols-1 lg:grid-flow-col-dense lg:grid-cols-3 max-w-3xl lg:max-w-7xl",
              ].join(" ")
          }>
             {!fullScreenExplore && 
                <div 
                  className={[
                      "space-y-6 lg:col-span-2 lg:col-start-1",
                      showWorkingPane ? "2xl:w-[30em] h-fit" : ""
                    ].join(" ")}
                  >
                  {leftHandSection()}
                </div>
              }
             {fullScreenExplore &&              
                  <Transition
                  show={props.showDetailPane || false}
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                <div className="space-y-6 lg:col-span-2 lg:col-start-1 fixed min-w-[30em] h-fit max-h-[80vh] top-[4em] left-[3.5em] overflow-y-scroll rounded-b-lg p-4 z-50 shadow-2xl shadow-gray-300 bg-white border border-t-0 ">
                      {leftHandSection()}
                  </div>
                  </Transition>
              }

              {!fullScreenExplore && false && <section 
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
              </section>}
            {primitive?.type !== "working" && (hasDocumentViewer || showWorkingPane)  && 
              <div 
                  style={{minWidth:0, minHeight:0}} 
                  className={
                    fullScreenExplore
                      ? `h-[calc(100vh_-_8em)] col-start-1 lg:col-span-2 2xl:col-start-3 2xl:col-span-1 row-start-2 2xl:row-start-1 2xl:sticky ${props.widePage ? "2xl:top-[2em]" : "2xl:top-[6em]"} row-span-1 2xl:row-span-2`
                      : `h-[60vh] 2xl:h-[calc(100vh_-_10em)] col-start-1 lg:col-span-2 2xl:col-start-3 2xl:col-span-1 row-start-2 2xl:row-start-1 2xl:sticky ${props.widePage ? "2xl:top-[2em]" : "2xl:top-[6em]"} row-span-1 2xl:row-span-2`
                    }
                >
                <div ref={cvRef} className='bg-white h-full flex flex-col @container'>
                    {showWorkingPane === "evidence" && 
                      <CollectionViewer 
                          closeButton={()=>setShowWorkingPane()}
                          hidePanel={true} 
                          className='w-full h-full overflow-y-scroll'
                          defaultWide
                          primitive={primitive} 
                          onShowInfo={(e,p,s)=>{props.selectPrimitive(p,{scope: s || primitive})}}
                          setSelected={setSelected} 
                          onPreview={setSelected ? (p)=>{setSelected(p,{scope: primitive})} : undefined}
                          onPreviewFromList={setSelected ? (e, p, list, idx)=>{setSelected({list: list, idx: idx},{scope: primitive})} : undefined}
                          onNavigate={(e, p) =>{e.preventDefault();navigate(`/item/${p.id}`)}}
                          selected={selected}
                          nested
                          nestedTypes='evidence'
                          //nestedReferenceIds={10}
                          />
                    }
                    {showWorkingPane === "report" && <ReportViewExporter primitive={primitive}/>}
                    {showWorkingPane === "assessment_table" &&
                      <VFTable primitive={primitive}/>
                    }
                    {hasDocumentViewer && (typeof(showWorkingPane) === 'boolean')  && <ResultViewer ref={resultViewer} enableEvidence={true} onHighlightClick={(d)=>console.log(d)} primitive={primitive} />}
                    {showWorkingPane === "assessment" && primitive.framework && componentView && <ComponentRow selectPrimitive={props.selectPrimitive} showFullText={true}  compact={false} evidenceDetail={true} primitive={primitive} key={componentView.id} component={componentView}/>}
                    {showWorkingPane === "map" && 
                      <MapViewer 
                        primitive={primitive}
                        closeButton={()=>setShowWorkingPane()}
                      
                      />}
                    {false && showWorkingPane === "board" && <RouterTest/>}
                    {true && showWorkingPane === "board" && <BoardViewer primitive={primitive}/>}
                    {(showWorkingPane instanceof Object && showWorkingPane.type === "result" )  && 
                      <CollectionViewer 
                          closeButton={()=>setShowWorkingPane()}
                          hidePanel={true} 
                          className='w-full h-full overflow-y-scroll'
                          defaultWide
                          primitive={primitive} 
                          onShowInfo={(e,p,s)=>{props.selectPrimitive(p,{scope: s || primitive})}}
                          onInnerShowInfo={(e,p, s)=>{props.selectPrimitive(p,{scope: s || primitive})}}
                          setSelected={setSelected} 
                          onPreview={setSelected ? (p)=>{setSelected(p,{scope: primitive})} : undefined}
                          onPreviewFromList={setSelected ? (e, p, list, idx)=>{setSelected({list: list, idx: idx},{scope: primitive})} : undefined}
                          onNavigate={(e, p) =>{e.preventDefault();navigate(`/item/${p.id}`)}}
                          selected={selected}
                          viewSelf={PrimitiveConfig.pageview[primitive.type]?.viewer && showWorkingPane.index === 0}
                          hideCreate={PrimitiveConfig.pageview[primitive.type]?.viewer && showWorkingPane.index === 0}
                          category={primitive?.metadata?.resultCategories?.find(d=>d.id === showWorkingPane.index)}/>
                    }
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
              <div className={`bg-white px-4 py-5 shadow sm:rounded-lg sm:px-6 sticky ${props.widePage ? "2xl:top-[2em]" : "2xl:top-[6em]"}`}>
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
                                              <PrimitiveCard 
                                                key={p.id} 
                                                showMenu 
                                                showEdit 
                                                doubleClickToEdit 
                                                menuProps={{showVisitPage:false, showDelete: "origin", showUnlink: true, showInSidebar: true}} 
                                                relatedTo={primitive} compact={true} primitive={p} showMeta="large" onClick={()=>resultViewer.current && resultViewer.current.showPrimitive(p.id)}/>
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
        {selected && <PrimitivePopup primitive={selected} contextOf={primitive} editing={true} setPrimitive={setSelected}/>}
        <MetricPopup selected={selectedMetric?.metric} contextOf={selectedMetric?.primitive} highlight={selectedMetric?.highlight} setSelected={setSelectedMetric}/>
        {editMetric && <MetricEditor metric={editMetric} primitive={primitive} setOpen={()=>setEditMetric(null)}/> }
        {showAIPopup && <AIStatusPopup category={showAIPopup.category} path={showAIPopup.path} primitive={primitive} close={()=>setShowAIPopup(false)}/>}
      </div>
    </>
  )
}
