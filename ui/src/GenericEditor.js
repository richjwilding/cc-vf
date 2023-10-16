import { Fragment, useState, useMemo, useReducer } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { HeroIcon } from './HeroIcon'
import { PrimitiveCard } from './PrimitiveCard'
import DropdownButton from './DropdownButton'
import useDataEvent from './CustomHook'
import MainStore from './MainStore'
import ConfirmationPopup from './ConfirmationPopup'
import { Spinner } from '@react-pdf-viewer/core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Popup from './Popup'
import PrimitiveConfig from './PrimitiveConfig'


export default function GenericEditor({item, primitive,...props}) {  
  
  const [eventRelationships, updateRelationships] = useReducer( (x)=>x+1, 0)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState( `Are you sure you want to delete this ${primitive.displayType}?` )

  useDataEvent("relationship_update set_field", primitive.id, updateRelationships)
    const [parameters, setParameters] = useState({})
  
  const [open, setOpen] = useState(true)
  const list = useMemo(()=>{
    if( primitive.metadata?.subCategories === "inherit"){
      return undefined
    }
    return props.set ? props.set(primitive) : primitive.primitives.allItems
  }, [primitive.id, eventRelationships])
  const targets = undefined

  if( !primitive ){
    return undefined
  }

  const items = props.options.map((category)=>{
    return {
      key:category.id,
      title: <div key='title' className='flex place-items-center'><HeroIcon key='icon' icon={category.icon} className='w-6 h-6 pr-2'/>{category.title}</div>,
      action: ()=>{
        MainStore().createPrimitive({
          categoryId: category.id,
          type: category.primitiveType,
          title: null,
          parent: primitive,
        })
      }
    }
  })
  
  const promptConfirmRemove = ()=>{
    const children = primitive.primitives.uniqueAllItems
    if( children.length > 0){
      setDeleteMessage(`Deletion of this item will also delete ${children.length} child items`)
    }

    setConfirmRemove(true)
  }

  const handleRemove = async function(){
    setConfirmRemove(false)
    MainStore().removePrimitive(primitive)
      if( props.setOpen ){
          props.setOpen(false)
      }else{
          setOpen(false)
      }
  }

  const handleClose = function(){
      if( props.setOpen ){
          props.setOpen(false)
      }else{
          setOpen(false)
      }
  }

  const waiting = primitive.processing?.ai?.categorize

    function validateAndSetParameter( paramaterName, paramater, value ){
        if( paramater.type === "float" ){
            console.log(value)
            if( isNaN(parseFloat(value)) ){
                return false
            }            
        }
        setParameters({
            ...parameters,
            [paramaterName]: value
        })
        return true

    }

    const actions = [
      {
        key: "categorize", 
        title: "Auto discover categories from data",
        action: async ()=>await MainStore().doPrimitiveAction(props.target, "categorize", {source: primitive.id})
      },
      ...(props.actions || [])
    ]

  return (
    <>
      <Popup width='max-w-xl' setOpen={handleClose} >
        {({ activeOption }) => (
            <>
              
              <PrimitiveCard.Banner key='banner' primitive={primitive}/>
              <PrimitiveCard key='title' primitive={primitive} showEdit={true} showId={false} major={true}/>
              {primitive?.metadata?.parameters && <>
                <p className='mt-4 text-gray-500 text-xs'>Parameters</p>
                <div className='p-4 bg-gray-50 rounded-md border border-gray-200'>
                  <PrimitiveCard.Parameters primitive={primitive} editing={true} fullList={true} />
                </div>
              </>}
              {list && <p className='mt-4 text-gray-500 text-xs'>Category items</p>}
              {list && <div className='overscroll-contain overflow-y-scroll max-h-[50vh] rounded-md border border-gray-200 p-3 my-2 space-y-3 bg-gray-50 '>
                {(list.length === 0) && 
                  <div className='w-full p-2'>
                    <button
                    type="button"
                    className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    <span className="mt-2 block text-sm font-semibold text-gray-900">Nothing to show</span>
                  </button>
                  </div>
                }
                {list && list.map((child)=>(
                  <PrimitiveCard.Variant key={child.id} primitive={child} showEdit={true} editable={true} listType={props.listType}/>
                ))}
              </div>}
              <div className='w-full space-x-2 mt-2'>
                <DropdownButton flat={true} items={items} title='Add item' className='shrink-0 grow-0 h-8' dropdownWidth='w-96' align='left'/>
                {actions && <DropdownButton flat={true} items={
                  actions.map((d)=>{
                    return {
                      key: d.key,
                      title: d.title,
                      action: async ()=>await MainStore().doPrimitiveAction(props.target, d.key, {parent: primitive.id, source: primitive.id})
                    }
                  })
                  } title='Action' className='shrink-0 grow-0 h-8' dropdownWidth='w-max' align='left'/>}
                  <button
                    type="button"
                    onClick={async (e)=>{e.stopPropagation();await primitive.removeChildren()}}
                    className={`bg-white border-gray-300 text-gray-500 hover:bg-gray-50 focus:border-indigo-500 focus:ring-indigo-500 relative inline-flex items-center rounded-md border px-2 py-2 text-sm font-medium shrink-0 grow-0 h-8 focus:outline-none`}
                  >
                    Delete all
                  </button>
              </div>
              <div key='button_bar' className="mt-6 flex items-center w-full gap-x-6 justify-between">
                {primitive && primitive.id &&   <button
                  type="button"
                  className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:w-auto"
                  onClick={promptConfirmRemove}
                >
                  Delete
                </button>}
                  <button
                    disabled={false}
                    onClick={handleClose}
                    className="inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:bg-gray-400 hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                    Close
                  </button>
                </div>
                {waiting && <div key='wait' className='z-50 absolute bg-gray-400/50 backdrop-blur-sm w-full h-full top-0 left-0 rounded-lg place-items-center justify-center flex'>
                  <Spinner className='animate-spin'/>
                </div>}
            </>
          )}
        </Popup>
      {confirmRemove && <ConfirmationPopup title="Confirm deletion" confirm={handleRemove} message={deleteMessage} cancel={()=>setConfirmRemove(false)}/>}
      </>
  )
}
