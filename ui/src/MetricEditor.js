import { Fragment, useState, useMemo, useRef, useEffect } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { PlusIcon, ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import MainStore from './MainStore'
import { HeroIcon } from './HeroIcon'
import Popup from './Popup'



function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function MetricEditor({metric, primitive,...props}) {
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState(metric?.type)
  const [title, setTitle] = useState(metric?.title || '')
  const [targets, setTargets] = useState( metric && metric.targets ? metric.targets.reduce((o, c)=>{o[c.relationship] = c.value;return o},{}) : undefined)
  if( !primitive ){
    if( !metric || metric.new ){
      return undefined
    }    
    primitive = metric.parent
    if(!primitive){
      return undefined
    }
  }

  const metricList = primitive.metadata.metrics
  if( metricList === undefined){return <></>}

  const selectMetric = (key)=>{
    setSelected(key)
    setTargets({})
  }

  const updateTarget = (target, value)=>{
    setTargets({
      ...targets,
      [target]: parseInt(value)
    })
  }

  const handleDelete = async function(handleClose){
      await primitive.deleteMetric( metric )
      if( handleClose ){
        handleClose()
      }
  }
  const handleSave = async function(handleClose){
    const data = {
      title: title,
      type: selected,
      targets: Object.keys(targets).map((k)=>{
        if( targets[k]){
          return {
            presence: relationships.find((r)=>r.key === k)?.presence,
            relationship: k,
            value: targets[k]
          }
        }
        return undefined
      }).filter((d)=>d)
    }
    if( metric.id ){
      await primitive.updateMetric( data, metric )
    }else{
      await primitive.addMetric( data )
    }

      if( handleClose ){
        handleClose()
      }
  }



  let relationships 
  let results
  if( primitive.metadata?.resultCategories ){
    results = primitive.metadata?.resultCategories[0]
    if( selected === "conversion" ){
      relationships = results.relationships 
      if( relationships ){
        relationships = Object.keys(relationships).map((k)=>{return {key:k, ...relationships[k]}}).sort((a,b)=>a.order-b.order)
      }
    }
  }
  if( relationships === undefined){
    relationships = [{
      presence: true,
      key: targets && Object.keys(targets).length === 1 ?  Object.keys(targets)[0] : "presence",
      title: `Count of ${results.plurals}`
    }]
  }
  if( relationships && !targets ){
    setTargets({})
  }
  

  return (
    <Popup {...props}>
      {({ handleClose }) => (
        <>
      <Listbox value={selected || ''} onChange={selectMetric}>
            {({ open }) => (
              <>
                <Listbox.Label className="block text-lg font-medium leading-6 text-gray-900">Metric type</Listbox.Label>
                <div className="relative mt-2">
                  <Listbox.Button className="relative w-full cursor-default rounded-md bg-white py-1.5 pl-3 pr-10 text-left text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm sm:leading-6">
                    <span className="flex items-center">
                      <HeroIcon icon={(selected ? metricList[selected].icon : undefined) || "PlusIcon"} className="h-6 w-6 flex-shrink-0 "/>
                      <span className="ml-3 block truncate text-lg">{selected ? metricList[selected].title : "Pick one..."}</span>
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 ml-3 flex items-center pr-2">
                      <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </span>
                  </Listbox.Button>

                  <Transition
                    show={open}
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                      {Object.keys(metricList).map((id) => {
                        const metric = metricList[id]
                        return (
                        <Listbox.Option
                          key={id}
                          className={({ active }) =>
                            classNames(
                              active ? 'bg-indigo-600 text-white' : 'text-gray-900',
                              'relative cursor-default select-none py-2 pl-3 pr-9'
                            )
                          }
                          value={id}
                        >
                          {({ selected, active }) => (
                            <>
                              <div className="flex">
                                  <HeroIcon icon={metric.icon || "PlusIcon"} className="h-6 w-6 flex-shrink-0 "/>
                                  <div>
                                  <p
                                    className={classNames(selected ? 'font-semibold' : 'font-normal', 'ml-3 block truncate text-lg mb-1')}
                                  >
                                    {metric.title}
                                  </p>
                                  <p
                                    className={'ml-3 block truncate'}
                                  >
                                    {metric.description}
                                  </p>
                                </div>
                              </div>

                              {selected ? (
                                <span
                                  className={classNames(
                                    active ? 'text-white' : 'text-indigo-600',
                                    'absolute inset-y-0 right-0 flex items-center pr-4'
                                  )}
                                >
                                  <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                </span>
                              ) : null}
                            </>
                          )}
                        </Listbox.Option>
                      )})}
                    </Listbox.Options>
                  </Transition>
                </div>
              </>
            )}
          </Listbox>
          { selected && targets && 
          <>
            <div className="rounded-md border border-gray-200 p-3 my-2 space-y-3 bg-gray-50 ">
              <div className='grid px-2 gap-x-6 gap-y-8 grid-cols-5'>
                <label htmlFor="title" className="block text-sm font-medium leading-6 text-gray-800 pt-1.5 ">
                  Title
                  </label>
                    <input
                      type="text"
                      name="title"
                      id="title"
                      value={title}
                      onChange={(e)=>setTitle(e.target.value)}
                      className="block col-span-4 rounded-md shadow-sm ring-1 ring-inset ring-gray-300 flex-1 py-1.5 px-2 text-gray-900 placeholder:text-gray-400 focus:ring-0 leading-6 w-full"
                      placeholder="Title of metric"
                    />
                  <label className="block text-sm font-medium leading-6 text-gray-800 pt-1.5 ">
                    {relationships.length > 1 ? "Targets" : "Target"}
                    </label>
                    <div className='col-span-4 grid grid-cols-5 gap-y-2'>
                      {relationships.map((rel)=>{
                        const key = `target_${rel.key}`
                        return (
                        <Fragment key={rel.key}>
                            <label htmlFor={key} className="block text-sm font-medium leading-6 pt-1.5 text-gray-400">
                              {rel.title}
                            </label>
                            <input
                              type="number"
                              pattern="[0-9]"
                              name={key}
                              id={key}
                              value={targets[rel.key] || ''}
                              onChange={(e)=>updateTarget(rel.key, e.target.value )}
                              className="block col-span-4 rounded-md shadow-sm ring-1 ring-inset ring-gray-300 flex-1 py-1.5 px-2 text-gray-900 placeholder:text-gray-400 placeholder:text-sm focus:ring-0 leading-6 w-full"
                              placeholder="Optional target..."
                            />
                        </Fragment>
                      )})}
                    </div>
              </div>
            </div>
        </>

          }
          <div className="mt-6 flex items-center w-full gap-x-6">
          {metric.id !== undefined &&   <button
            type="button"
            className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:w-auto"
            onClick={()=>handleDelete(handleClose)}
          >
            Delete
          </button>}
            <button type="button" 
              className="text-sm font-semibold leading-6 text-gray-900 ml-auto"onClick={handleClose}>
              Cancel
            </button>
            <button
              disabled={selected === undefined || title === undefined || title.trim() === ""}
              onClick={()=>handleSave(handleClose)}
              className="inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:bg-gray-400 hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {metric.id ? "Update" : "Create"}
            </button>
          </div>
          </>
      )}
    </Popup>
  )
}
