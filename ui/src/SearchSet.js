import { ArrowPathIcon, MagnifyingGlassIcon, TrashIcon } from "@heroicons/react/20/solid"
import MainStore from "./MainStore"
import UIHelper from "./UIHelper"
import useDataEvent from "./CustomHook"
import { QueryPane } from "./QueryPane"
import Panel from "./Panel"
import { Badge, BadgeButton } from "./@components/badge"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

const mainstore = MainStore()

export default function SearchSet({primitive, searchPrimitive, resultSet, filters, toggleFilter, searchCategoryIds, props}){
    useDataEvent("update_field update_parameter", [primitive?.id, searchPrimitive?.id])

        const searches = searchPrimitive ? [searchPrimitive] : primitive.primitives.search?.[resultSet] 
        const hasSearches = (searches && searches.length > 0)
        
        
        const createSearch = async (id)=>{

            const path = `search.${resultSet}`
            const createId = id ?? searchCategoryIds?.[0]
            console.log(`will create ${createId} at ${path}`)
            const newPrim = await MainStore().createPrimitive({type: 'search', parent: primitive, categoryId: createId , parentPath: path})
        }
        
        let createSearchButton
        if(!searchCategoryIds || searchCategoryIds.length === 1){
            if( hasSearches ){
                createSearchButton = <UIHelper.Button small  icon={<MagnifyingGlassIcon className="h-4"/>} title="New search" action={()=>createSearch()}/>
            }else{
                createSearchButton = <button 
                type="button" 
                onClick={()=>createSearch()} 
                className="text-center hover:border-gray-400 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    <span className="m-2 block text-sm font-semibold text-gray-900">{'Create a new query'}</span>
                </button>
            }
        }else{
            createSearchButton = <UIHelper.Dropdown small={hasSearches} icon={<MagnifyingGlassIcon className="h-4"/>} title="New search" action={createSearch} options={searchCategoryIds.map((d)=>{let cat = MainStore().category(d);return {id: cat.id, title:cat.title}})}/>
        }

        
        return <div className={`${hasSearches ? "py-2" : "p-2"} bg-slate-50 border m-2 rounded-lg divide-y divide-gray-200 border-b border-gray-300`}>
                {!hasSearches && <div className="relative block w-full rounded-lg border-2 border-dashed border-gray-300 p-12 text-center hover:border-gray-400">{createSearchButton}</div>}
                {searches && searches.length > 0 && <>
                    {searches.map(d=>{
                    return (
                    <div key={d.id} className="group w-full py-2 px-4 space-y-1  hover:bg-gray-50 ">
                        <UIHelper.Disclosure>
                            {({ open }) => (
                                <>
                                    <UIHelper.Disclosure.Button counter={`${d.primitives.uniqueAllIds.length} items`}>
                                        <MagnifyingGlassIcon className="h-4"/>
                                        <p className='w-full text-left'>{d.title}</p>
                                        <BadgeButton 
                                            onClick={(e)=>{
                                                e.stopPropagation()
                                                toggleFilter && toggleFilter({type: "parent", id: primitive.id})
                                            }}
                                            color={filters && filters.find(d2=>d2.type === "parent" && d2.id === primitive.id) ? "lime" : "zinc"}
                                        >
                                            {d.primitives.uniqueAllIds.length} items
                                        </BadgeButton>
                                        <UIHelper.IconButton 
                                            icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}
                                            action={()=>mainstore.doPrimitiveAction(d, "query")}
                                        />
                                        <UIHelper.IconButton 
                                            icon={<FontAwesomeIcon icon="trash" />}
                                            action={()=>mainstore.promptDelete({prompt: "Remove search and all results?", handleDelete: ()=>mainstore.removePrimitive(d)})}
                                        />
                                        <div className="grow"/>
                                        <FontAwesomeIcon icon="chevron-down" className={open ? "text-slate-500 rotate-180" : "text-slate-500 "}/>
                                    </UIHelper.Disclosure.Button>
                                    <UIHelper.Disclosure.Panel className='mt-4'>
                                        <QueryPane primitive={d} toggleFilter={toggleFilter} filters={filters}/>
                                        {open && <span className="text-gray-400 text-xs">#{d.plainId}  {d.metadata.title ?? "Search"}</span>}
                                    </UIHelper.Disclosure.Panel>
                                </>
                            )}
                        </UIHelper.Disclosure>
                    </div>
                )}) }
                {!searchPrimitive && <div className="px-4 pt-2">
                    {createSearchButton}
                </div>}
                </>
                }
            </div>
}