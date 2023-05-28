import { Combobox, Dialog } from '@headlessui/react'

import { useState, useMemo} from 'react';
import {
  ChevronRightIcon,
} from '@heroicons/react/20/solid'
import MainStore from './MainStore';
import { HeroIcon } from './HeroIcon';
import Popup from './Popup';
import { ExclamationCircleIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { PrimitiveCard } from './PrimitiveCard';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function CategoryCard({item, ...props}){
    return (
            <div className={`group relative flex items-start space-x-3 py-4 ${props.onClick ? "hover:bg-gray-50" : ""} px-2 ${props.className}`}>
                <div className="flex-shrink-0">
                    <span
                    className={classNames(item.iconColor, 'inline-flex h-10 w-10 items-center justify-center rounded-lg')}
                    >
                    <HeroIcon icon={item.icon} className="h-6 w-6 text-white" aria-hidden="true" />
                    </span>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900">
                    <a onClick={props.onClick}>
                        <span className="absolute inset-0" aria-hidden="true" />
                        {item.name}
                    </a>
                    </div>
                    <p className="text-sm text-gray-500">{item.description}</p>
                </div>
            </div>
    )

}

function CategorySelection({items, ...props}){
    const [query, setQuery] = useState('')


    const filteredCategories =
      query === ''
        ? items
        : items.filter((item) => {
            return (item.name?.toLowerCase().includes(query.toLowerCase()) || item.description?.toLowerCase().includes(query.toLowerCase()))
          })
  

    return (
        <Combobox 
            value={props.selectedCategory} onChange={props.setSelectedCategory}>
            <div className="relative">
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
            </div>
            <Combobox.Options static hold>
                <div className='p-2 divide-y divide-gray-100'>
                {filteredCategories.map((item) => (
                <Combobox.Option key={item.id} value={item}>
                    {({ active }) => (
                        <CategoryCard item={item} className={active ? "bg-gray-100" : ""}/>
                    )}
                </Combobox.Option>
                ))}
                </div>
            </Combobox.Options>
        </Combobox>

    )
}


export default function NewPrimitive({...props}) {

    const mainstore = MainStore()
    const getCategoryList = ()=>{
        let list = mainstore.categories().filter((d)=>props.type === undefined || props.type === d.primitiveType)
        if( props.categoryId ){
            list = props.categoryId.map((id)=>mainstore.category(id))
        }else if(props.parent ){
            if( props.parent.metadata && props.parent.metadata.evidenceCategories ){
                list = props.parent.metadata.evidenceCategories ? props.parent.metadata.evidenceCategories.map((id)=>mainstore.category(id)) : []
            }            
        }
        return list.map((d)=>{
            return {
                name: d.title,
                categoryId: d.id,
                description: d.description,
                icon: d.icon,
                iconColor: 'bg-slate-500',
                details: d
            }
        })  
    }

    const items = useMemo(getCategoryList, [props.type])
    const [value, setValue] = useState()
    const [pickCategory, setPickCategory] = useState(false)
    const [pickWorkspace, setPickWorkspace] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState(items.length === 1 ? items[0] : undefined)
    const [selectedWorkspace, setSelectedWorkspace] = useState( props.parent?.workspaceId || MainStore().activeWorkspaceId )
    const [parameters, setParameters] = useState({})

    const allowWorkspaceSelection = props.parent === undefined 
    const workspace = MainStore().workspace(selectedWorkspace)

    async function submit() {
        const primitive = await MainStore().createPrimitive({
            title: value,
            type: props.type,
            categoryId: selectedCategory?.categoryId,
            parent: props.parent,
            parentPath: props.parentPath,
            referenceParameters: {...props.parameters, ...parameters},
            workspaceId: selectedWorkspace
        })
        if( props.done ){
            props.done(primitive)
        }
    }

    function closeModal() {
        if( props.cancel ){
            props.cancel()
        }
    }

    function changeCategory(category){
        setSelectedCategory( category )
        setParameters({})
    }

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
    return (
        <Popup width='max-w-xl' setOpen={closeModal} title={`Create new ${props.title || "item"}`}>
            {({ activeOption }) => (
                <>
                {selectedCategory === undefined && items.length > 0 && <div role='button' tabIndex='0' onKeyDown={(e)=>{if(e.key=='Enter' || e.key==" " || e.key === "ArrowDown"){setPickCategory(true)}}} onClick={()=>setPickCategory(true)} className='border outline-none focus:ring-2 focus:ring-indigo-600 rounded-md shadow-md mb-4 p-1'>
                    <div className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 h-[4.5rem] justify-center place-items-center flex hover:border-gray-400">
                        Select type of item
                    </div>
                </div>}
                {selectedCategory && items.length > 1 && <div role='button' tabIndex='0' onKeyDown={(e)=>{if(e.key=='Enter' || e.key==" " || e.key === "ArrowDown"){setPickCategory(true)}}} className='border outline-none focus:ring-2 focus:ring-indigo-600 rounded-md shadow-md mb-4 p-1'><CategoryCard onClick={()=>setPickCategory(true)} item={selectedCategory}/></div>}
                {selectedCategory && items.length === 1 && <CategoryCard item={selectedCategory}/>}
                {pickCategory && <Popup padding='false' setOpen={()=>setPickCategory(false)}><CategorySelection items={items} setSelectedCategory={(item)=>{changeCategory(item);setPickCategory(false)}}/></Popup>}
                <textarea
                    className='mt-4'
                    rows={5}
                    tabIndex={1}
                    onKeyDown={(e)=>{
                        if(e.key === "Enter"){
                            e.preventDefault()
                            submit()
                        }
                    }}
                    onChange={(e)=>setValue(e.currentTarget.value)}
                    className="block w-full rounded-md border-0 py-1.5 px-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder={props.prompt || "Title..."}
                    defaultValue={''}
                />
                {selectedCategory && selectedCategory.details.parameters && 
                    <div style={{gridTemplateColumns:'max-content auto'}} className='w-full px-2 py-0.5 grid grid-cols-2 border border-gray-200 rounded-md shadow-sm mt-2'>
                        {Object.keys(selectedCategory.details.parameters).map((d, idx)=>{
                            const parameter = selectedCategory.details.parameters[d]
                            const classDef = ['flex text-sm min-h-[2rem] p-2 place-items-center', idx > 0 ? "border-t" : ""].join(" ")
                            return <>
                                <p className={`${classDef} font-semibold text-gray-500`}>
                                    {parameter.title}
                                </p>
                                <div className={`${classDef} flex justify-end w-full`}>
                                    <PrimitiveCard.RenderItem item={parameter} editable={true} border callback={(e)=>{return validateAndSetParameter(d, parameter, e)}}/>
                                </div>
                            </>
                        })}
                    </div>}
                {allowWorkspaceSelection && workspace && <p onClick={()=>setPickWorkspace(true)} className={`cursor-pointer flex place-items-center text-xs rounded-md mt-2 py-1 px-2 bg-${workspace.color}-200 text-color-${workspace.color}-800`}><ExclamationCircleIcon className='w-6 h-6 pr-1'/> Creating in the {workspace.title} workspace</p>}
                {allowWorkspaceSelection && !workspace && <p onClick={()=>setPickWorkspace(true)} className={`cursor-pointer flex place-items-center text-xs rounded-md mt-2 py-1 px-2 bg-amber-200 text-color-amber-800`}><ExclamationTriangleIcon className='w-6 h-6 pr-1'/>You must select a workspace to create this in</p>}
                {pickWorkspace && <Popup title='Select a workspace' width='max-w-lg' setOpen={()=>setPickWorkspace(false)} showCancel={true}>
                    <div className='space-y-3'>
                    {MainStore().activeUser.info.workspaces.map((id)=>{
                        const workspace = MainStore().workspace(id)
                        return (<p onClick={()=>{setSelectedWorkspace(id);setPickWorkspace(false)}} className={`cursor-pointer bg-${workspace.color}-200 text-color-${workspace.color}-800 p-2`}>{workspace.title}</p>)
                    })}
                    </div>
                </Popup>}
                <div className="flex flex-shrink-0 justify-between space-x-2 pt-4 mt-1">
                    <button
                        type="button"
                        tabIndex='2' 
                        onClick={() => closeModal(null)}
                        className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                        {props.cancelText || "Cancel"}
                    </button>
                    <button
                        type="button"
                        tabIndex='3' 
                       disabled={value === undefined || value.trim().length === 0 || (items.length > 0 && selectedCategory === undefined)}
                        onClick={submit}
                        className="rounded-md bg-indigo-600 disabled:bg-gray-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        {props.addText || "Create"}
                    </button>
                </div>
            </>
        )}
    </Popup>)
}