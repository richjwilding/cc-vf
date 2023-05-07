import { Fragment, useState, useMemo, useReducer } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { HeroIcon } from './HeroIcon'
import { PrimitiveCard } from './PrimitiveCard'
import DropdownButton from './DropdownButton'
import useDataEvent from './CustomHook'
import MainStore from './MainStore'
import ConfirmationPopup from './ConfirmationPopup'


export default function GenericEditor({item, primitive,...props}) {  
  
  const [eventRelationships, updateRelationships] = useReducer( (x)=>x+1, 0)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState( "Are you sure you want to delete this question?" )

  const text = ()=>{
    updateRelationships()
  }
  useDataEvent("relationship_update", primitive.id, text)
  
  const [open, setOpen] = useState(true)
  const list = useMemo(()=>{
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


  return (
    <>
    <Transition.Root show={props.setOpen ? true : open} as={Fragment} appear>
      <Dialog as="div" className="relative z-50" onClose={handleClose} >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-25 transition-opacity backdrop-blur-sm " />
        </Transition.Child>

        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel 
                className="mx-auto max-w-2xl transform rounded-xl bg-white shadow-2xl ring-1 ring-black ring-opacity-5 transition-all p-6">
                  <PrimitiveCard.Banner key='banner' primitive={primitive}/>
                  <PrimitiveCard key='title' primitive={primitive} showEdit={true} showId={false} major={true}/>
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
                      <PrimitiveCard.Variant key={child.id} primitive={child} showEdit={true} editable={true}/>
                      
                    ))}
                  </div>}
                  <DropdownButton flat={true} items={items} title='Add item' className='shrink-0 grow-0 h-8' dropdownWidth='w-96' align='left'/>
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
                    
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
      {confirmRemove && <ConfirmationPopup title="Confirm deletion" confirm={handleRemove} message={deleteMessage} cancel={()=>setConfirmRemove(false)}/>}
      </>
  )
}
