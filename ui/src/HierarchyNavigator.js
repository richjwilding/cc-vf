import { Fragment, forwardRef, useImperativeHandle, useReducer, useRef, useState } from 'react'
import { Menu, Transition } from '@headlessui/react'
import {
  ArchiveBoxIcon,
  ArrowRightCircleIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  HeartIcon,
  PencilSquareIcon,
  TrashIcon,
  UserPlusIcon,
} from '@heroicons/react/20/solid'
import { ArrowLeftCircleIcon } from '@heroicons/react/24/solid'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import MainStore from './MainStore'
import { Float } from '@headlessui-float/react'

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

const HierarchyNavigator = forwardRef(function HierarchyNavigator(props, ref){
    const [path,setPath] = useState(undefined)
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)

    let colors = props.major ? "bg-blue-600 border-blue-50  text-white hover:bg-ccgreen-700 focus:ring-blue-500 focus:ring-offset-gray-100" : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50 focus:border-ccgreen-500 focus:ring-ccgreen-500"

    function getNodes(){
        return typeof(props.items) === "function" ? props.items() : props.items ?? []
    }



    function alignPath(){
      let path = undefined
      let nodes = getNodes()
      if( props.selectedItemId && nodes){
          const unpack = (node)=>{
              return [node.items, Object.values(node.nested ?? {}).map(d=>unpack(d))].flat(Infinity).filter(d=>d)
          }
          const allItems = unpack(nodes)
          
          const id = selectedItemId()
          path = allItems.find(d=>d.id === id)?.relationship
      }
      setPath( path )
    }

    useImperativeHandle(ref, () => {
        return {
          refocus:()=>{
            alignPath()
            forceUpdate()
          }
        };
      }, []);
      
    let selectedItemId = () => typeof(props.selectedItemId) === "function" ? props.selectedItemId() : props.selectedItemId
    let node = getNodes()
    if(path ){
        let idx = 0
        while(node?.nested && idx < path.length){
            node = node.nested[path[idx]]
            idx++
        }
    }

    const align = (typeof(props.align) === "function" ? props.align() : props.align) 

  return (
    <Menu as="div" className="relative inline-block text-left ml-auto">
      <Float portal={props.portal} shift flip={10} onUpdate={()=>{}} placement={align === "right" ? "right-start" : "left-start"} offset={4}>
      <div>
        <Menu.Button 
            onClick={(e)=>alignPath()}
            className={
                [
                  props.small ? "text-xs py-1 px-2" : `text-sm py-2 px-2`,
                  `h-full relative inline-flex items-center rounded-md font-medium focus:z-20 focus:outline-none  ${colors}`,
                  props.noBorder ? "" : "border",
                  props.className ?? ""
                ].join(' ')
            }
        >
            {props.icon || props.title }
        </Menu.Button>
      </div>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items static className={`z-10 w-56 origin-top-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none max-h-[80vh] overflow-y-auto`}>
        {path && path.length > 0 && <div >
                                        <Menu.Item>
                                        {({ active }) => (
                                            <a
                                            href="#"
                                            onClick={(e)=>{
                                                e.preventDefault()
                                                setPath(path.slice(0,-1))
                                            }}
                                            className={classNames(
                                                active ? 'bg-ccgreen-700 text-white' : 'bg-ccgreen-50  text-gray-700',
                                                'rounded-t-md group flex items-center px-4 pt-2 pb-1.5 text-sm font-semibold',
                                                align === "right" ? "justify-start" : "justify-end"
                                            )}
                                            >
                                            {align === "right" && <ChevronLeftIcon className="mr-1 h-5 w-5 text-gray-400 group-hover:text-white" aria-hidden="true" />}
                                             {node?.parent?.category?.title ?? "UNKNOWN"}
                                             {align !== "right" && <ChevronRightIcon className="mr-1 h-5 w-5 text-gray-400 group-hover:text-white" aria-hidden="true" />}
                                            </a>
                                        )}
                                        </Menu.Item>
        </div>}
        {node?.items && <div className="py-1">
            {node.items.map(d=>(<Menu.Item>
                                        {({ active }) => (
                                            <a
                                            href="#"
                                            className={classNames(
                                                active ? 'bg-ccgreen-700 text-white' : 'text-gray-900',
                                                'group flex items-center px-4 py-2 text-sm'
                                            )}
                                            onClick={(e)=>{
                                                if( props.action ){
                                                    props.action(d) 
                                                }
                                            }}
                                            >
                                             {d.title}
                                             {selectedItemId() === d.id && <span
                                                                        className={classNames(
                                                                            'inset-y-0 items-center ml-auto text-ccgreen-700',
                                                                            active ? 'bg-ccgreen-700 text-white' : 'text-ccgreen-700',
                                                                        )}
                                                                        >
                                                                        <CheckIcon  className={`h-5 w-5 ${active ? 'bg-ccgreen-700' : "bg-white"}`} aria-hidden="true" />
                                                                        </span>}
                                            </a>
                                        )}
                                        </Menu.Item>))}
          </div>}
          {node?.nested && <div className="py-1">
            {Object.values(node.nested).map(d=>(<Menu.Item>
              {({ active }) => (
                <a
                  href="#"
                  onClick={(e)=>{
                    e.preventDefault()
                    setPath(d.path)
                }}
                  className={classNames(
                    active ? 'bg-ccgreen-700 text-white' : 'text-gray-900',
                    'group flex items-center pr-2 py-2 text-sm',
                    align === "right" ? "pl-4" : "pl-2"
                  )}
                >
                  {align !== "right" && <ChevronLeftIcon className="mr-1 h-5 w-5 text-gray-400 group-hover:text-white" aria-hidden="true" />}
                  {d.category?.title ?? "UNKNOWN"}
                  {align === "right" && <ChevronRightIcon className="ml-auto mr-1 h-5 w-5 text-gray-400 group-hover:text-white" aria-hidden="true" />}
                </a>
              )}
            </Menu.Item>))}
          </div>}
        </Menu.Items>
      </Transition>
      </Float>
    </Menu>
  )
})
export default HierarchyNavigator
