import { Fragment, useState, useMemo, useRef, useEffect, Children } from 'react'
import { Combobox, Dialog, Transition } from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { UsersIcon } from '@heroicons/react/24/outline'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import MainStore from './MainStore'
import ContactCard from './ContactCard'
import { PrimitiveCard } from './PrimitiveCard'
import { HeroIcon } from './HeroIcon'
import Popup from './Popup'
import TextEntryPopup from './TextEntryPopup'



function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

const SearchPanel = (props)=>{
  const [query, setQuery] = useState(props.startText || "")
  
  const groups = []
  if( props.includeRoot ){
    groups.push({
      title: props.rootTitle || "Source",
      filter: (p)=>p.id === props.root.id
    })
  }
  if( props.separateAggregate === undefined || props.separateAggregate ){
    groups.push({
      title: "Aggregate evidence",
      filter: (p)=>p.metadata?.isAggregation
    })
  }

  const filterSet = []
  if( props.type ){
    const types = [props.type].flat()
    filterSet.push({
      name: "Type",
      action: (p)=>types.includes(p.type) || (props.root && props.root.id === p.id)
    })
  }
  if( props.resultCategoryId ){
    filterSet.push({
      name: "resultCategoryId",
      action: (p)=>p.referenceId === props.resultCategoryId
    })
  }
  if( props.referenceId ){
    const ids = [props.referenceId].flat()
    filterSet.push({
      name: "Type",
      action: (p)=>ids.includes(p.referenceId) //|| (props.root && props.root.id === p.id)
    })
  }

  if( props.hasResultCategoryFor ){
    filterSet.push({
      name: "Result sets",
      action: (p)=>p.metadata.resultCategories.find((d)=>props.hasResultCategoryFor.includes(d.resultCategoryId))
    })
  }

  if( props.target){
    const target = [props.target].flat()
    const selfIds = target.map(d=>d.id)
    const ids = target.map(d=>d.primitives.allIds).flat()
    //const parentChain = props.target.findParentPrimitives().map((d)=>d.id).filter((d,i,a)=>a.indexOf(d)===i)
    const parentChain = target.map(d=>d.findParentPrimitives().map((d)=>d.id)).flat().filter((d,i,a)=>a.indexOf(d)===i)
    filterSet.push({
      name: "Parent chain",
      action: (p)=>{
        if( parentChain.includes(p.id)){
          console.log(`Cant create circular reference`)
          return false
        }
        return true
      }
    })
    filterSet.push({
      name: "Already linked",
      action: (p)=>!ids.includes(p.id)
    })
    filterSet.push({
      name: "Self",
      action: (p)=>!selfIds.includes(p.id)
    })
  }
    if( props.exclude ){
      const eIds = props.exclude.map(d=>d.id)
      console.log(`EXCLUDE = ${eIds}`)
      filterSet.push({
        name: "Exclude list",
        action: (p)=>!eIds.includes(p.id)
      })
    }
  if( props.primitive){
    filterSet.push({
      name: "Self",
      action: (p)=>p.id !== props.primitive.id
    })
    filterSet.push({
      name: "Already linked",
      action: (p)=>!p.primitives.allIds.includes(props.primitive.id)
    })
    filterSet.push({
      name: "Already peer",
      action: (p)=>{
        if( p.metadata && !p.metadata.isAggregation ){
          const parents = props.primitive.parentPrimitives.filter((d)=>d.metadata.isAggregation)
          const ids = parents.map((p)=>p.primitives.allIds).flat()
          return !ids.includes(p.id) 
        }else{
          return true
        }
      }
    })
  }

  const group = (p)=>{
    const pos = groups.map((d)=>d.filter(p)).indexOf(true)
    return pos === -1 ? undefined : pos
  }

  const primitives = useMemo(()=>{
    const seed = ()=>{
      if( props.root ){
        let directs
        let thisRoot = props.root.primitives
        if( props.path){
          thisRoot = thisRoot[props.path]
          console.log(thisRoot)
        }
        if( props.deep ){
          directs = thisRoot.descendants
        }else{
          directs = thisRoot.uniqueAllItems
        }
        if( props.includeRoot ){
          return [props.root, directs].flat()
        }
        return directs
      }else if(props.list){
        return props.list
      }else{
        const id = MainStore().activeWorkspaceId
        return MainStore().primitives().filter(d=>d.workspaceId === id)
      }
    }
    const set = seed().filter((p)=>{
      return filterSet.reduce((a, f)=>{
        return a && f.action(p) 
      }, true)
    })
    if( groups.length === 0){
      return set
    }
    return set.sort((a,b)=>{
      const sa = group(a) ?? 99
      const sb = group(b) ?? 99
      return sa - sb 
    })
  }, [filterSet.map((f)=>f.name), props.root?.id, props.hasResultCategoryFor, props.path])

  const ql = query.toLowerCase()
  const filteredPrimitives =
    (query === ''
      ? primitives
      : primitives.filter((p) => {
          return (p.title?.toLowerCase().includes(ql) || p.plainId.toString().slice(0,ql.length) === ql)
        })).slice(0, (props.maxListLength || 200))

  let lastGroup = undefined

        return (
              <>
              <Combobox 
                defaultValue={props.root}
                onChange={props.selected}>
                {({ activeOption }) => {
                  return (
                  <>
                  <div className="relative flex">
                    <MagnifyingGlassIcon
                      className="pointer-events-none absolute top-3.5 left-4 h-5 w-5 text-gray-400"
                      aria-hidden="true"
                    />
                    <Combobox.Input
                      className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm focus:outline-none"
                      placeholder="Search..."
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                    <button
                        type="button"
                        onClick={props.setOpen ? ()=>props.setOpen(false) : undefined}
                        className="place-self-center mr-2 w-fit rounded-md bg-gray-100 py-2 px-3 text-sm text-gray-400 shadow-sm hover:bg-indigo-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                      >
                        Cancel
                    </button>
                  </div>

                    {((query === '' || filteredPrimitives.length > 0) || props.allowNew) && (
                      <Combobox.Options as="div" static hold className="flex divide-x divide-gray-100">
                        <div
                          className={classNames(
                            'max-h-96 min-w-0 flex-auto scroll-py-4 overflow-y-auto px-6 py-4',
                            activeOption && 'sm:h-96'
                          )}
                        >
                          <div className="-mx-2 text-sm text-gray-700">
                            {
                              filteredPrimitives.map((primitive) => {
                                const thisGroup = group(primitive)
                                const prevGroup = lastGroup
                                lastGroup = thisGroup
                                return (<>
                                  {groups.length > 0 && thisGroup != prevGroup && 
                                    //<p className='font-semibold border-t border-b bg-gray-50 pl-1 py-1.5'>{thisGroup !== undefined ? groups[thisGroup].title : "Other"}</p>
                                    <p className='font-semibold text-gray-500 text-xs pl-2 py-0.5 mb-1'>{thisGroup !== undefined ? groups[thisGroup].title : "Other"}</p>
                                  }
                                  <Combobox.Option
                                    as="div"
                                    key={primitive.id}
                                    value={primitive}
                                    className={({ active }) =>
                                      classNames(
                                        'flex cursor-default select-none items-center rounded-md p-2',
                                        active && 'bg-gray-100 text-gray-900'
                                      )
                                    }
                                  >
                                    {({ active }) => {
                                      return (
                                      <>
                                        <HeroIcon className='w-5 h-5 shrink-0' icon={primitive.metadata?.icon}/><span className="ml-3 flex-auto truncate">{primitive.origin?.isTask ? `${primitive.origin.title} / `: ""}{primitive.title}</span>
                                        {active && (
                                          <ChevronRightIcon
                                            className="ml-3 h-5 w-5 flex-none text-gray-400"
                                            aria-hidden="true"
                                          />
                                        )}
                                      </>
                                    )}}
                                  </Combobox.Option>
                              </>)
                            })}
                          </div>
                      </div>
                      {props.children({activeOption:activeOption})}
                      </Combobox.Options>
                    )}

                    {query !== '' && filteredPrimitives.length === 0 && !props.allowNew  && 
                      <div className="py-14 px-6 text-center text-sm sm:px-14">
                        <UsersIcon className="mx-auto h-6 w-6 text-gray-400" aria-hidden="true" />
                        <p className="mt-4 font-semibold text-gray-900">No primitives found</p>
                        <p className="mt-2 text-gray-500">
                          Nothing was found with that term. Please try again.
                        </p>
                      </div>
                    }
                  </>
                )}}
              </Combobox>
              {props.allowAll && <div className='p-2'>
                                  <button
                                      type="button"
                                      onClick={()=>props.selected(filteredPrimitives)}
                                      className="w-fit rounded-md bg-gray-100 py-2 px-3 text-sm text-gray-400 shadow-sm hover:bg-indigo-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                                    >
                                      Select all {filteredPrimitives.length} items
                                    </button>
              </div>}
              </>
        )
}

function ParentLinksManager({mode, ...props}) {
  const [inputOpen, setInputOpen] = useState(false)
  const [inputSubmitted, setInputSubmitted] = useState()
  const [inputTitle, setInputTitle] = useState()
  const [inputList, setInputList] = useState()

    const selected = (item)=>{
        if( props.callback ){
            props.callback(item)
        }
        handleClose()
    }

    const handleClose = function(){
        if( props.setOpen ){
            props.setOpen(false)
        }
    }

    const createAggregationCallback = async(text)=>{
      const mainstore = MainStore()
      const category = mainstore.categories().find((d)=>d.isAggregation)
      if( category ){
        const newPrim = await mainstore.createPrimitive({
          title: text,
          type: "evidence",
          categoryId: category.id,
          parent: props.root,
          parentPath: 'outcomes'
        })
        await newPrim.addRelationship( props.primitive )
        props.setOpen(false)
        return newPrim
      }
    }

    const createAggregation = ()=>{
      setInputSubmitted(()=>createAggregationCallback)
      setInputTitle(`Create new aggregate evidence on ${props.root.displayType}`)
      setInputList([{title:"Selected", items: [props.primitive]}])
      setInputOpen(true)
    }
    const combineToAggregation = (target)=>{
      setInputSubmitted(()=>async (text)=>{
        const newPrim = await createAggregationCallback(text)
        await newPrim.addRelationship( target )

      })
      setInputTitle(`Create new aggregate evidence on ${props.root.displayType}`)
      setInputList([{title:"Selected", items: [props.primitive]}, {title:"Combine with", items: [target]}])
      setInputOpen(true)
    }
    const promote = async ()=>{
      await props.root.addRelationship( props.primitive, "outcomes" )
      props.setOpen(false)
    }
    const addToAggregation = async (target)=>{
      await target.addRelationship( props.primitive )
      props.setOpen(false)
    }

  return (
    <>
    <Popup setOpen={()=>props.setOpen(false)} padding={false} width="md:max-w-4xl xl:max-w-5xl">
      {({ handleClose }) => (
        <>
          <SearchPanel {...props} close={handleClose} selected={selected}>
            {({ activeOption }) => (
            activeOption && (
              <div className="hidden h-96 w-2/5 flex-none flex-col overflow-y-auto sm:flex">
                <div className="flex flex-col py-2 px-6 border-t-[1px] border-gray-100 grow overflow-y-scroll">
                  <PrimitiveCard.Banner primitive={activeOption}/>
                  <PrimitiveCard.ModalPreview primitive={activeOption} showId={false}/>
                </div>
                <div className="flex-auto p-6 space-y-4 border-t-[1px] border-gray-100 grow-0 shrink-0">
                  {(activeOption.id !== props.root.id) && !activeOption.metadata.isAggregation && 
                    <button
                      key='create'
                      type="button"
                      onClick={()=>combineToAggregation(activeOption)}
                      className="w-full rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                      Combine as aggregation on {props.root.displayType}
                    </button>
                  }
                  {(activeOption.id !== props.root.id) && activeOption.metadata.isAggregation && 
                    <button
                      key='create'
                      type="button"
                      onClick={()=>addToAggregation(activeOption)}
                      className="w-full rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                      Add to aggregation on {props.root.displayType}
                    </button>
                  }
                  {(activeOption.id === props.root.id) && 
                  <>
                    <button
                      key='create'
                      type="button"
                      onClick={()=>createAggregation(activeOption)}
                      className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                      Start new aggregation on {props.root.displayType}
                    </button>
                    <button
                      key='promote'
                      type="button"
                      onClick={()=>promote(activeOption)}
                      className="w-full rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                      Promote evidence to {props.root.displayType}
                    </button>
                  </>}
                </div>
              </div>
            ))}
          </SearchPanel>
          {inputOpen && <TextEntryPopup list={inputList} title={inputTitle} setOpen={setInputOpen} submitted={(text)=>inputSubmitted(text)}/>}
        </>
      )}
    </Popup>
    </>
  )
}
export default function PrimitivePicker({mode, ...props}) {

    const selected = (item)=>{
        if( props.callback ){
            props.callback(item)
        }
        handleClose()
    }

    const handleClose = function(){
        if( props.setOpen ){
            props.setOpen(false)
        }
    }

  return (
    <Popup setOpen={()=>props.setOpen(false)} padding={false} width="md:max-w-4xl xl:max-w-5xl">
      {({ handleClose }) => (
          <SearchPanel {...props} selected={selected}>
            {({ activeOption }) => (
            activeOption && (
              <div className="hidden h-96 w-2/5 flex-none flex-col overflow-y-auto sm:flex">
                <div className="flex flex-col py-2 px-6 border-t-[1px] border-gray-100 grow overflow-y-scroll">
                  <PrimitiveCard.Banner primitive={activeOption}/>
                  <PrimitiveCard.ModalPreview primitive={activeOption} disableHover={false} showId={false}/>
                </div>
                <div className="flex flex-auto p-6 border-t-[1px] border-gray-100 grow-0 shrink-0">
                  <button
                    type="button"
                    onClick={()=>selected(activeOption)}
                    className="w-full rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </SearchPanel>
      )}
    </Popup>
  )
}
PrimitivePicker.ParentLinksManager = ParentLinksManager