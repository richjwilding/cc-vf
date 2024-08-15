import { ArrowPathIcon, MagnifyingGlassIcon, TrashIcon } from "@heroicons/react/20/solid"
import MainStore from "./MainStore"
import UIHelper from "./UIHelper"
import { PrimitiveCard } from "./PrimitiveCard"
import Panel from "./Panel"
import useDataEvent from "./CustomHook"

export default function SearchSet({primitive, resultSet, filters, toggleFilter, searchCategoryIds, props}){
    const mainstore = MainStore()
    useDataEvent("update_field update_parameter", primitive.id)

        const searches = primitive.primitives.search?.[resultSet] 
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
//                createSearchButton = <Panel.MenuButton small title={<><MagnifyingGlassIcon className="h-4 mr-1"/>New Search</>} action={()=>createSearch()} className='flex place-items-center'/>
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
                    let action = false, active = false, error = false
                    let title = <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                    return (
                    <div className="group w-full py-2 px-4 space-y-1  hover:bg-gray-50 hover:subtle-shadow-bottom">
                        <div className="w-full flex space-x-2 min-h-16">
                            <div className="flex place-items-center w-full mb-1 text-slate-500">
                                <MagnifyingGlassIcon className="w-5 h-5 mr-1"/>
                                <PrimitiveCard primitive={d} compact titleAtBase hideTitle showEdit disableHover editing className='w-full place-items-center !bg-transparent'/>
                            </div>
                            <div className="flex w-fit shrink-0 ">
                                <div
                                    type="button"
                                    onClick={toggleFilter ? ()=>toggleFilter({type: "parent", id: d.id}) : undefined}
                                    className={[
                                    'text-xs ml-2 py-0.5 px-1.5 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                                        filters && filters.find(d2=>d2.type === "parent" && d2.id === d.id) ? "bg-ccgreen-100 border-ccgreen-600 text-ccgreen-800 border" : "bg-white text-gray-400"
                                    ].join(" ")}
                                    >
                                    {d.primitives.uniqueAllIds.length} items
                                </div>
                                <div
                                    type="button"
                                    className={[
                                    'text-xs ml-2 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                                        active ? "bg-ccgreen-100 border-ccgreen-600 text-ccgreen-800 border" : 
                                        error ? "bg-red-100 border-red-600 text-red-800 border" : "bg-white text-gray-400"
                                    ].join(" ")}
                                    onClick={()=>mainstore.doPrimitiveAction(d, "query")}>
                                {title}</div>
                                <div
                                    type="button"
                                    className={[
                                        'text-xs ml-0.5 py-0.5 px-1 shrink-0 grow-0 self-center rounded-full  font-medium  hover:text-gray-600 hover:shadow-sm hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                                        "bg-white text-gray-400"
                                    ].join(" ")}
                                    onClick={()=>mainstore.promptDelete({prompt: "Remove search and all results?", handleDelete: ()=>mainstore.removePrimitive(d)})}>
                                    {<TrashIcon className="h-4 w-4" aria-hidden="true" />}</div>
                            </div>
                        </div>
                        <Panel collapsable open={false}>
                            <div className="w-full flex-col text-xs my-2 space-y-1">
                                <PrimitiveCard.Parameters primitive={d} editing leftAlign inline compactList className="text-xs text-slate-500" fullList />
                            </div>
                            <span className="text-gray-400 text-xs">#{d.plainId}  {d.metadata.title ?? "Search"}</span>
                        </Panel>
                    </div>
                )}) }
                <div className="px-4 pt-2">
                    {createSearchButton}
                </div>
                </>
                }
            </div>
}