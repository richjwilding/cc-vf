import Popup from "./Popup"
import { ArrowPathIcon, CheckIcon } from "@heroicons/react/24/outline"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import useDataEvent from "./CustomHook"
import { useReducer } from "react"

export default function AIStatusPopup({primitive,...props}){
    const [eventRelationships, updateRelationships] = useReducer( (x)=>x+1, 0)
    const list = (primitive.primitives.results ?  primitive.primitives.results[props.path].map((d)=>d) : []).filter((d)=>d.referenceParameters?.notes || d.referenceParameters?.url)



    useDataEvent("set_field", undefined, (p)=>{
        if( p ){
            const checkIds = primitive.primitives.allIds
            if( p.filter((id)=>checkIds.includes(id)).length > 0){
                updateRelationships()
            }
        }
    })

    const completeDiscovery = async ()=>{
        for( const item of list ){
            if( !item.discoveryDone ){
                if( item.analyzer ){
                    await item.analyzer().doDiscovery()
                }
            }
        }

    }
    const completeQuestions = async ()=>{
        for( const item of list ){
            if( item.analyzer ){
                const analysis = item.analyzer().aiProcessSummary()
                const unprocessed =  analysis && analysis.unprocessed ? Object.keys(analysis.unprocessed).length : 0
                if( unprocessed !== 0 ){
                    await item.analyzer().analyzeQuestions()
                }else{

                }
            }
        }

    }

    return (<Popup trigger={eventRelationships} setOpen={props.close}>
          {({ handleClose }) => {
            
            return (
              <>
                <p>Status of <strong>{props.category.title}</strong> processing</p>
                <div role="list" className="rounded-md border border-gray-200 mt-6 px-2 max-h-[60vh] overscroll-contain overflow-y-scroll ">
                <div 
                    key='grid'
                    id='grid'
                    className={`grid text-sm text-gray-700`}
                    style={{gridTemplateColumns: `fit-content(80%) 1fr 1fr`}}
                  >
                    <div 
                        key='title-p'
                        className={`pt-2 text-slate-700 font-semibold flex z-10 place-items-center border-b-[1px] border-gray-200 bg-white row-start-1 sticky top-0`}>
                          Item
                    </div>
                    <div 
                        key='t2'
                        className={`pt-2 text-slate-700 justify-center font-semibold flex z-10 place-items-center border-b-[1px] border-gray-200 bg-white row-start-1 sticky top-0`}>
                          Discovery
                    </div>
                    <div 
                        key='t3'
                        className={`pt-2 text-slate-700 justify-center font-semibold flex z-10 place-items-center border-b-[1px] border-gray-200 bg-white row-start-1 sticky top-0`}>
                          Questions
                    </div>
                  {list.map((d)=>{
                    const analysis = d.analyzer().aiProcessSummary()
                    const processed =  analysis && analysis.processed ? Object.keys(analysis.processed).length : 0
                    const unprocessed =  analysis && analysis.unprocessed ? Object.keys(analysis.unprocessed).length : 0
                    let banner                    
                    if( d.ai_processing){
                      const error = d.ai_processing.state === "error"
                      if( error || (new Date() - new Date(d.ai_processing.started)) > (5 * 60 *1000) ){
                        banner = <div className='text-red-600 group flex place-items-center space-x-1'><FontAwesomeIcon icon='triangle-exclamation' className='mr-1'/>Error
                                  <button
                                      key='reprocess' 
                                      type="button"
                                      onClick={(e)=>{e.stopPropagation();d.setField("ai_processing", null)}}
                                      className="flex h-5 w-5 -mt-0.5 ml-1 invisible group-hover:visible flex-none items-center justify-center rounded-full ext-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    <ArrowPathIcon className='w-4 h-4 text-gray-400' strokeWidth='2'/>
                                  </button>
                        </div>
                      }else{
                        banner = <div className=''><FontAwesomeIcon icon='spinner' className="animate-spin"/> Processing</div>
                      }
                    }
                    return (<>
                          <div className='py-2 border-gray-200 border-b '>{d.title === "New User Interview" ? `Interview with ${d.referenceParameters?.contactName}` : d.title}</div>
                          {banner && <div className='col-start-2 col-span-2 py-1 border-gray-200 border-b justify-center flex place-items-center'>{banner}</div>}
                          {!banner && <>
                            <div className='py-1 border-gray-200 border-b justify-center flex'>
                              <div className='group relative w-6 h-6'><>
                                {d.discoveryDone 
                                  ? <CheckIcon className='group-hover:invisible w-4 h-4 text-gray-400 absolute top-2 left-1' strokeWidth='2'/>
                                  : <div className='group-hover:invisible ml-1 mt-1 w-2 h-2 bg-gray-200 rounded-full  absolute top-2 left-1'/>}
                                  <button
                                      key='reprocess' 
                                      type="button"
                                      onClick={(e)=>{e.stopPropagation();d.analyzer().doDiscovery({force:true})}}
                                      className="absolute top-2 left-0.5 flex h-5 w-5 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full ext-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    <ArrowPathIcon className='w-4 h-4 text-gray-400' strokeWidth='2'/>
                                  </button>
                                </>
                              </div>
                            </div>
                            <div className='py-1 border-gray-200 border-b justify-center flex'>
                              <div className='group relative w-12 h-6'><>
                                {(unprocessed === 0 )
                                  ? <CheckIcon className='group-hover:invisible w-4 h-4 text-gray-400 absolute top-2 left-3.5' strokeWidth='2'/>
                                  : 
                                  <div className='group-hover:invisible mt-2 flex w-12 grow-0 place-items-center border bg-amber-100'>
                                    <div key='status_p' style={{width: `${processed / (processed + unprocessed)*100}%`}} className={`flex place-items-center justify-center h-4 bg-green-400`}></div>
                                  </div>
                                  }
                                  <button
                                      key='reprocess' 
                                      type="button"
                                      onClick={(e)=>{e.stopPropagation();d.analyzer().analyzeQuestions()}}
                                      className="absolute top-2 left-3.5 flex h-5 w-5 -mt-0.5 invisible group-hover:visible flex-none items-center justify-center rounded-full ext-gray-400 hover:bg-gray-200 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    <ArrowPathIcon className='w-4 h-4 text-gray-400' strokeWidth='2'/>
                                  </button>
                                </>
                              </div>
                            </div>
                          </>}
                        </>)
                    })}
                </div>
                </div>
                    <div className="flex flex-shrink-0 justify-between space-x-2 pt-4 mt-1">
                      <button
                      type="button"
                      onClick={completeDiscovery}
                        className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                      Complete discovery
                    </button>
                      <button
                      type="button"
                      onClick={completeQuestions}
                        className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                      Complete questions
                    </button>
                        <button
                            type="button"
                            onClick={props.close}
                            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        >
                            Close
                        </button>
                      </div>
              </>
          )}}
          </Popup>)
}