import { ArrowRightCircleIcon, ChevronLeftIcon, ChevronRightIcon, PlayIcon, PlusIcon } from "@heroicons/react/20/solid"
import Panel from "./Panel"
import MainStore from "./MainStore"
import { useState } from "react"
import { PrimitiveTable } from "./PrimitiveTable"
import NewPrimitivePanel from "./NewPrimitivePanel"
import { HeroIcon } from "./HeroIcon"
import QueryCard from "./QueryCard"
import { PrimitiveCard } from "./PrimitiveCard"
import AIProcessButton from "./AIProcessButton"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { main } from "@popperjs/core"
import SummaryCard from "./SummaryCard"
import EditableTextField from "./EditableTextField"
import useDataEvent from "./CustomHook"
import DropdownButton from "./DropdownButton"
import UIHelper from "./UIHelper"

import { fal } from '@fortawesome/pro-light-svg-icons';
import HierarchyNavigator from "./HierarchyNavigator"
import CollectionUtils from "./CollectionHelper"
import TooggleButton from "./ToggleButton"
import PrimitiveConfig from "./PrimitiveConfig"
import SearchSet from "./SearchSet"
import { heatMapPalette } from './RenderHelpers';

// Add the icons to the library


function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

let mainstore = MainStore()
const tabs = [
    { name: 'Discovery', referenceId: 112, discovery: true, search: true},
    { name: 'Process', referenceId: 112, process: true},
    { name: 'Items', list: true}
]

const mainTabs = [
    { name: 'Query', referenceId: 81, initial: true},
    //{ name: 'Summarize (singular)', referenceId: 109},
    { name: 'Summarize', referenceId: 113}
//    { name: 'Lookup', referenceId: 117}
    //{ name: 'Process', referenceId: 112},
]

function CategoryHeader({itemCategory, items, newItemParent, actionAnchor, ...props}){
    const [page, setPage] = useState(0)
    const [pageItems, setPageItems] = useState(50)
    const [showItems, setShowItems] = useState(false)
    const [activeTab, setActiveTab] = useState()
    

    const count = items.length

    let cardConfig = {fields: [
        {field: 'id', title: "ID", width: 80},
        {field: 'title', title: "Title"}
    ]}

    const nestedActions = (itemCategory.actions?.filter(d=>d.collectionAction || d.showInCollection)) ?? []
    const searchCategoryList = itemCategory.resultCategories?.map(d=> d.searchCategoryIds ? d.searchCategoryIds.map(d2=>({id: d.id, title: d.title, searchCategoryIds: [d2]})) : undefined).flat().filter(d=>d)
    const pageCount = Math.ceil(items.length / pageItems)

    return  <>
                {itemCategory && <h3 onClick={()=>setShowItems(!showItems)} className="flex w-full text-gray-500 font-medium">
                    <div className="flex flex-col space-y-2 w-full ">
                        <div className="flex space-x-1.5 place-items-center">
                            <HeroIcon icon={itemCategory.icon} className='w-5 h-5'/>
                            <p>{itemCategory.plural ?? `${itemCategory.title}s`}</p>
                            <span className="inline-flex items-center rounded-full bg-gray-200 px-1.5 py-1 ml-3 text-xs font-medium text-gray-600">{count === 1 ? "1 item" : `${count} items`}</span>
                        </div>
                    </div>
                    <ChevronRightIcon strokeWidth={2} className={`ml-auto w-5 h-5 ${showItems ? '-rotate-90 transform' : ''}`}/>
                </h3>}
            {showItems && <>
                <div className="mt-3 mb-1.5">
                    <nav aria-label="Tabs" className="flex space-x-4">
                    {tabs.map((tab) => (
                        <a
                        key={tab.name}
                        onClick={()=>setActiveTab(tab)}
                        aria-current={activeTab?.name === tab.name ? 'page' : undefined}
                        className={classNames(
                            activeTab?.name === tab.name ? 'bg-ccgreen-200 text-ccgreen-900' : 'bg-gray-100 text-gray-500 hover:text-gray-700',
                            'rounded-md px-3 py-2 text-xs font-medium',
                        )}
                        >
                        {tab.name}
                        </a>
                    ))}
                    </nav>
                </div>
                {activeTab?.referenceId && activeTab?.process && <div className="w-full flex flex-col mt-2">
                    <NewPrimitivePanel key={activeTab.referenceId} newPrimitiveCallback={props.newPrimitiveCallback} parent={newItemParent} primitiveList={items} selectedCategory={mainstore.category(activeTab.referenceId)}/>
                </div>}
                {activeTab?.list && <div className="w-full border bg-gray-50 border-gray-200 rounded-lg mt-2">
                        <div className="flex p-2 space-x-1 text-gray-600">
                            {pageCount > 1 && <>
                                <UIHelper.Button outline icon={<ChevronLeftIcon className="w-5 h-5"/>}/>
                                <UIHelper.Button outline icon={<ChevronRightIcon className="w-5 h-5"/>}/>
                            </>}
                            <UIHelper.Button 
                                tooltip="Add items to board"
                                outline 
                                icon={<HeroIcon icon='FAAddView' className='w-5 h-5'/>}
                                onClick={props.createNewView ? ()=>props.createNewView(38, actionAnchor.id, props.filters, {referenceId: itemCategory.id, pivot: props.pivotRelationship, descend: props.pivotRelationship ? false : undefined}) : undefined}
                            />
                        </div>
                        <div className="relative">
                        <PrimitiveTable 
                            page={page}
                            pageItems={pageItems}
                            onEnter={(d)=>mainstore.sidebarSelect(d)}
                            config={cardConfig} 
                            primitives={items} 
                            className='w-full min-h-[24em] max-h-[60vh] !text-xs'/> 
                        </div>
                    </div>}
                {activeTab?.discovery && nestedActions.length > 0 && 
                    <><PrimitiveCard.CardMenu 
                            icon={<PlayIcon className="w-4 h-4 m-[0.45rem]"/>} 
                            custom={nestedActions.map(d=>{
                                const doAction = async (options)=>{
                                    await MainStore().doPrimitiveAction( 
                                        d.collectionAction ? items[0] : actionAnchor, 
                                        d.collectionAction ? d.key : "auto_cascade", 
                                        {cascade_key: d.collectionAction ?  undefined : d.key, ids: items?.map(d=>d.id), ...options},
                                        ()=>{}
                                        )
                                }
                                return {
                                    ...d,
                                    action: async ()=>{
                                        if( d.actionFields){
                                            mainstore.globalInputPopup({
                                                primitive: newItemParent,
                                                fields: d.actionFields,
                                                confirm: async (inputs)=>await doAction( inputs )
                                            })
                                        }else{
                                            await doAction()
                                        }

                                    }
                                }
                            })} 
                            size={10}
                        />
                        {!props.filters && searchCategoryList && <div className="text-sm my-3 space-y-3">
                            {searchCategoryList.map(d=>
                                <UIHelper.Panel title={d.title}>
                                    <SearchSet primitive={actionAnchor} resultSet={d.id} searchCategoryIds={d.searchCategoryIds}/>
                                </UIHelper.Panel>
                            )}
                        </div>}
                    </>

            }
            </>}
        </>

}

export default function CollectionInfoPane({board, frame, primitive, filters, ...props}){
    const [activeTab, setActiveTab] = useState(mainstore.category(tabs.find(d=>d.initial)))
    const [showDetails, setShowDetails] = useState(false)
    const [hideNull, setHideNull] = useState(frame?.referenceParameters?.explore?.hideNull)
    const [activeView, setActiveView] = useState(frame?.referenceParameters?.explore?.view ?? 0)

    useDataEvent("relationship_update set_parameter set_field delete_primitive", [board?.id, frame?.id, primitive?.id].filter(d=>d))

    let newPrimitiveCallback = props.newPrimitiveCallback

    function updateFrame(){
        if( props.updateFrameExtents && frame){
            props.updateFrameExtents( frame )
        }
    }
    let content
    if( frame ){


        const list = filters ? frame.itemsForProcessingWithFilter(filters) : frame.itemsForProcessing
        const viewConfigs = CollectionUtils.viewConfigs(list?.[0]?.metadata)
        const viewConfig = viewConfigs?.[activeView] 


        let itemCategoryId = list.map(d=>d.referenceId).filter((d,i,a)=>d && a.indexOf(d)===i)
        if( itemCategoryId.legnth > 1 ){
            console.log(`Multiple catgegory type in list`)
        }
        itemCategoryId = itemCategoryId[0]
        let itemCategory = mainstore.category(itemCategoryId)

        const newItemParent = frame.type === "query" ? frame : board 

        newPrimitiveCallback = (d)=>{
            if( filters ){
                const newItem ={
                    target: d,
                    importConfig: [{
                        id: frame.id,
                        filters: filters
                    }]
                }
                d = newItem
            }
            if( props.newPrimitiveCallback ){
                props.newPrimitiveCallback(frame, d)
            }
        }

        let descendants = mainstore.uniquePrimitives(list.map(d=>d.primitives.directDescendants).flat())
        let descendantCategories = descendants.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i).map(d=>mainstore.category(d)).filter(d=>d && ["activity","evidence","entity","result"].includes(d.primitiveType))

        function getAncestors(){
            const axisOptions = CollectionUtils.axisFromCollection( list, frame )
            const axisForPivot = axisOptions.filter(d=>["result","entity"].includes(d.category?.primitiveType) ).filter((d,i,a)=>a.findIndex(d2=>d2.category.id === d.category.id)===i).map(d=>({category: d.category, relationship: d.relationship}))
            let parents = mainstore.uniquePrimitives(list.map(d=>d.findParentPrimitives({type: ["entity", "result"]})).flat(Infinity))
            return [axisForPivot, parents]
        }

        function clearItems(e){
            e.stopPropagation();
            const pathMap = {}
            list.forEach(d=>{
                (d.parentPaths(frame) ?? []).forEach(p=>{
                    if(p === "ref" || p==="link" || p === "origin"  ){
                        pathMap[p] ||= []
                        pathMap[p].push(d)
                    }
                })
            })
            for(const path of Object.keys(pathMap)){
                if( path !== "origin"){
                    for(const d of pathMap[path]){
                        frame.removeRelationship(d, path)
                    }
                }
            }
            if( pathMap.origin){
                mainstore.promptDelete({
                    prompt: `Delete ${list.length} items?`,
                    handleDelete:async ()=>{
                        for(const d of pathMap.origin){
                            await mainstore.removePrimitive(d)
                        }
                        return true
                    }
                })
            }
        }
        const addImport = (target)=>{
          MainStore().globalPicker({
            root: target.referenceId === 118 ? board : undefined,
            callback:(pick)=>{
                target.addRelationship(pick, `imports`)
            },
            type: ["view", "query"]
          })
        }

        const updateViewMode = (value)=>{
            frame.setField(`referenceParameters.explore.view`, value)
            setActiveView( value )
            if( props.updateFrameExtents ){
                props.updateFrameExtents( frame )
            }
        }
        const addCategory = (target)=>{
            const baseCategories = [54, 53,55,33, 90]
            MainStore().globalCategoryPicker({
                    categoryIds: baseCategories,
                    callback:async (d)=>{
                        
                        const newPrim = await mainstore.createPrimitive({type: 'category', parent: target, categoryId: d.categoryId, referenceParameters:{target:"items"}})
                        if( newPrim ){
                            await mainstore.waitForPrimitive( newPrim.id )
                            mainstore.globalCategoryEditor({primitive: newPrim, originTask: target})
                        }

                        return true
                    }
                })

        }
        function filterPane(){
            const columnAxis = CollectionUtils.primitiveAxis(frame, "column")
            const rowAxis = CollectionUtils.primitiveAxis(frame, "row")
            const colFilter = PrimitiveConfig.decodeExploreFilter(frame.referenceParameters?.explore?.axis?.column?.filter)
            const rowFilter = PrimitiveConfig.decodeExploreFilter(frame.referenceParameters?.explore?.axis?.row?.filter)
            

            const fullList = frame.itemsForProcessingWithFilter(filters, {ignoreFinalViewFilter: true}) 

            const viewFilters = frame.referenceParameters?.explore?.filters?.map((d2,i)=>CollectionUtils.primitiveAxis(frame, i)) ?? []            
            let viewPivot = frame.referenceParameters?.explore?.viewPivot
            const axisOptions = CollectionUtils.axisFromCollection( fullList, frame ).map(d=>{
                const out = {...d}
                if( d.relationship ){
                    out.relationship = [d.relationship].flat()//.map(d=>d.split(":")[0])
                    out.access = [out.relationship].flat().length
                }
                return out
            })
            const localFilters = CollectionUtils.getExploreFilters( frame, axisOptions )

            let liveFilters = frame.primitives.allUniqueCategory.filter(d=>d.referenceId === PrimitiveConfig.Constants["LIVE_FILTER"]).map(d=>{
                return {
                    type: "category",
                    primitiveId: d.id,
                    category: d,
                    isLive: true,
                    title: `Category: ${d.title}`                
                }
            })

            let {_, extents} = CollectionUtils.mapCollectionByAxis( fullList, columnAxis, rowAxis, viewFilters, liveFilters, viewPivot )

            const sets = [
                {selection: "column", mode: "column", title: "Columns", list: colFilter},
                {selection: "row", mode: "row", title: "Rows", list: rowFilter},
                ...localFilters.map((d,idx)=>({selection:  `filterGroup${idx}`, title: `Filter by ${axisOptions[d.option]?.title}`, deleteIdx: idx, mode: idx, list: d.filter}))
            ]

            const addViewFilter = (item)=>{
                const axis = axisOptions[item]
                if( axis ){
                    const localFilters = frame.referenceParameters?.explore?.filters ?? []
                    const track = (frame.referenceParameters?.explore?.filterTrack ?? 0) +1
                    const newFilter = {
                        track: track,
                        sourcePrimId: axis.primitiveId,
                        type: axis.type,
                        subtype: axis.subtype,
                        parameter: axis.parameter,
                        relationship: axis.relationship,
                        access: axis.access,
                        value: undefined
                    }
                    localFilters.push(newFilter)
                    frame.setField("referenceParameters.explore.filters", localFilters)
                    frame.setField("referenceParameters.explore.filterTrack", track)
                    if( props.updateFrameExtents ){
                        props.updateFrameExtents( frame )
                    }
                }
            }
            function updateHideNull(val){
                frame.setField("referenceParameters.explore.hideNull", val)
                setHideNull(val)
                if( props.updateFrameExtents ){
                    props.updateFrameExtents( frame )
                }
            }

            const filterList = CollectionUtils.buildFilterPane(
                sets, 
                extents,
                {
                    mainstore: mainstore,
                    updateAxisFilter: (item, mode, setAll, axisExtents)=>{
                        let currentFilter
                        if( mode === "row"){
                            currentFilter = rowFilter  
                        }else if(mode === "column"){
                            currentFilter = colFilter  
                        }else{
                            currentFilter = PrimitiveConfig.decodeExploreFilter(frame.referenceParameters?.explore?.filters?.[ mode]?.filter)
                        }
                        CollectionUtils.updateAxisFilter(frame, mode, currentFilter, item, setAll, axisExtents,
                            (filter)=>{
                                if( props.updateFrameExtents ){
                                    props.updateFrameExtents( frame )
                                }
                            }
                        )
                    },
                    deleteViewFilter: (idx)=>{
                        const filter = viewFilters[idx]
                        let filters = frame.referenceParameters?.explore?.filters
                        filters = filters.filter(d=>d.track !== filter.track )
                        
                        frame.setField("referenceParameters.explore.filters", filters)
                        if( props.updateFrameExtents ){
                            props.updateFrameExtents( frame )
                        }
                    }

                }
            )
            return <>
                    <p className="text-xs mt-1">Filtered from {fullList.length} to {list.length} items</p>
                    <div className='w-full px-1 py-2 text-lg flex place-items-center justify-between text-gray-600 font-normal'>
                        <TooggleButton title='Hide empty rows / columns' enabled={hideNull} setEnabled={updateHideNull}/>
                        <HierarchyNavigator noBorder portal icon={<HeroIcon icon='FunnelPlus' className='w-5 h-5 '/>} items={CollectionUtils.axisToHierarchy(axisOptions)} flat placement='left-start' action={(d)=>addViewFilter(d.id)} dropdownWidth='w-64' className='ml-auto hover:text-ccgreen-800 hover:shadow-md'/>
                    </div>
                    <div className='w-full p-2 text-sm space-y-2 overflow-y-scroll'>
                        {filterList}
                    </div>
                </>
        }


        content = <>
        <div className="p-3 space-y-4">
            {frame.type === "summary" && <SummaryCard primitive={frame}/>}
            
                <div className="space-y-2">
                    <div className="border rounded-md bg-gray-50 text-gray-500 font-medium px-3 p-2">
                        <UIHelper.Panel title="View configuration" icon={<FontAwesomeIcon icon={fal.faTags} />}>
                            <div className="p-2 text-sm space-y-2">
                                <UIHelper.OptionList title="View Mode" options={viewConfigs} onChange={(id)=>updateViewMode(viewConfigs.findIndex(d=>d.id === id))} value={viewConfigs[activeView]?.id}/>
                                <div className='w-full text-lg overflow-y-scroll sapce-y-2 max-h-[50vh]'>
                                    {viewConfig && (!viewConfig.config || viewConfig.config.length === 0) && <p className='text-sm text-gray-500 text-center'>No settings</p>}
                                    {viewConfig && viewConfig.config && Object.keys(viewConfig.config).map(d=><UIHelper {...viewConfig.config[d]} value={frame.renderConfig?.[d]} onChange={async (v)=>{await frame.setField(`renderConfig.${d}`, v); updateFrame()}}/>)}
                                </div>
                            </div>
                        </UIHelper.Panel>
                    </div>
                    <div className="border rounded-md bg-gray-50 text-gray-500 font-medium px-3 p-2">
                        <UIHelper.Panel title="Categories" icon={<FontAwesomeIcon icon={fal.faTags} />}>
                            <PrimitiveCard.Categories primitive={frame} scope={filters ? list.map(d=>d.id) : undefined} directOnly hidePanel className='pb-2 w-full h-fit'/>
                            <div type="button"
                            className="flex my-2 font-medium grow-0 bg-white hover:bg-gray-100 hover:shadow-sm hover:text-gray-600 justify-center ml-2 p-1 rounded-full shrink-0 text-xs text-gray-400 "
                            onClick={()=>addCategory(frame)}> 
                                    <PlusIcon className="w-5 h-5"/>
                            </div>
                        </UIHelper.Panel>
                    </div>
                    <div className="space-y-2">
                        <div className="border rounded-md bg-gray-50 text-gray-500 font-medium px-3 p-2">
                            <UIHelper.Panel title="Filters" icon={<FontAwesomeIcon icon={fal.faFilter} />}>
                                        {filterPane()}
                            </UIHelper.Panel>
                        </div>
                    </div>
                </div>
            
            {!filters && (frame.type === "view" || frame.type === "summary") && 
                <div className="space-y-2">
                    <div className="border rounded-md bg-gray-50">
                        <div onClick={()=>setShowDetails(!showDetails)} className="flex text-gray-500 w-full place-items-center px-3 py-2 ">
                            <p className="font-medium ">{frame.metadata.title} details</p>
                            <ChevronRightIcon strokeWidth={2} className={`ml-auto w-5 h-5 ${showDetails ? '-rotate-90 transform' : ''}`}/>
                        </div>
                        {showDetails && <>
                            <div className="p-2 ">
                                <PrimitiveCard.Parameters primitive={frame} includeTitle editing leftAlign compactList className="text-xs text-slate-500" fullList />
                            </div>
                            <div className="px-3 py-2 text-gray-500 text-sm">
                                <UIHelper.Panel title="Show inputs" narrow>
                                    <div className="border p-2 rounded-md">
                                        <PrimitiveCard.ImportList primitive={frame}/>
                                        <div type="button"
                                        className="flex my-2 font-medium grow-0 bg-white hover:bg-gray-100 hover:shadow-sm hover:text-gray-600 justify-center ml-2 p-1 rounded-full shrink-0 text-xs text-gray-400 "
                                        onClick={()=>addImport(frame)}> 
                                                <PlusIcon className="w-5 h-5"/>
                                        </div>
                                    </div>
                                </UIHelper.Panel>
                            </div>
                        </>
                        }
                    </div>
                </div>
            }
            {frame.type === "query" && 
                <div className="space-y-2">
                    <div className="border rounded-md bg-gray-50">
                        <div onClick={()=>setShowDetails(!showDetails)} className="flex text-gray-500 w-full place-items-center px-3 py-2 ">
                            <p className="font-medium ">{frame.metadata.title} details</p>
                            <AIProcessButton active='data_query' actionKey='custom_query' primitive={frame} />
                            {list.length > 0 && <div type="button"
                               className="flex font-medium grow-0 bg-white hover:bg-gray-100 hover:shadow-sm hover:text-gray-600 justify-center ml-2 p-1 rounded-full shrink-0 text-xs w-5 text-gray-400 "
                               onClick={(e)=>clearItems(e)}> 
                                    <FontAwesomeIcon icon="fa-solid fa-trash" />
                                </div>
                            }
                            <ChevronRightIcon strokeWidth={2} className={`ml-auto w-5 h-5 ${showDetails ? '-rotate-90 transform' : ''}`}/>
                        </div>
                        {showDetails && <div className="p-2 ">
                            <PrimitiveCard.Parameters primitive={frame} includeTitle editing leftAlign compactList className="text-xs text-slate-500" fullList showExtra/>
                            <div className="pt-4 pb-2 text-gray-500 text-sm">
                                <UIHelper.Panel title="Show inputs" narrow>
                                    <div className="border p-2 rounded-md">
                                        <PrimitiveCard.ImportList primitive={frame}/>
                                        <div type="button"
                                        className="flex my-2 font-medium grow-0 bg-white hover:bg-gray-100 hover:shadow-sm hover:text-gray-600 justify-center ml-2 p-1 rounded-full shrink-0 text-xs text-gray-400 "
                                        onClick={()=>addImport(frame)}> 
                                                <PlusIcon className="w-5 h-5"/>
                                        </div>
                                    </div>
                                </UIHelper.Panel>
                            </div>
                        </div>}
                    </div>
                </div>
            }
            {itemCategory && <div className="px-3 py-2 bg-gray-50 border rounded-md">
                <CategoryHeader newPrimitiveCallback={newPrimitiveCallback} itemCategory={itemCategory} items={list}  newItemParent={newItemParent} createNewView={props.createNewView} actionAnchor={frame} filters={filters}/>
            </div>}
            {descendantCategories.length > 0 && <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">Descendants of items</p>
                <div className="border rounded-md p-2 space-y-2">
                    {descendantCategories.map((d,i)=>(
                        <div key={d.id} className="p-2 bg-gray-50 text-sm border rounded-md ">
                            <CategoryHeader itemCategory={d} newPrimitiveCallback={newPrimitiveCallback} newItemParent={newItemParent} createNewView={props.createNewView} actionAnchor={frame} items={descendants.filter(d2=>d2.referenceId === d.id)} filters={filters}/>
                    </div>))}
                </div>
            </div>}
            <div className="text-gray-500 text-sm">
                <UIHelper.Panel narrow title="Ancestors">
                    {()=>{
                        const [axisForPivot, parents] = getAncestors()
                            
                        return <div className="space-y-2 mt-2">
                            <div className="border rounded-md p-2 space-y-2">
                                {axisForPivot.map((d,i)=>(
                                    <div key={d.category.id} className="p-2 bg-gray-50 text-sm border rounded-md ">
                                        <CategoryHeader itemCategory={d.category} newPrimitiveCallback={newPrimitiveCallback} newItemParent={newItemParent} pivotRelationship={d.relationship} createNewView={props.createNewView} actionAnchor={frame} items={parents.filter(d2=>d2.referenceId === d.category.id)} filters={filters}/>
                                </div>))}
                            </div>
                        </div>
                    }}
                </UIHelper.Panel>
            </div>
        </div>
            <div className="mt-2">
                <nav aria-label="Tabs" className="border-t isolate flex divide-x divide-gray-200 shadow">
                {mainTabs.map((tab, tabIdx) => (
                    <a
                    key={tab.name}
                    onClick={()=>setActiveTab(tab)}
                    aria-current={tab.current ? 'page' : undefined}
                    className={classNames(
                        activeTab?.name === tab.name ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700',
                        'group relative min-w-0 flex-1 overflow-hidden bg-white px-4 py-4 text-center text-sm font-medium hover:bg-gray-50 focus:z-10',
                    )}
                    >
                    <span>{tab.name}</span>
                    <span
                        aria-hidden="true"
                        className={classNames(
                        activeTab?.name === tab.name ? 'bg-green-600' : 'bg-transparent',
                        'absolute inset-x-0 bottom-0 h-0.5',
                        )}
                    />
                    </a>
                ))}
                </nav>
                {activeTab?.referenceId && <div className="w-full flex flex-col p-3">
                    <NewPrimitivePanel key={activeTab.referenceId} newPrimitiveCallback={newPrimitiveCallback} parent={newItemParent} primitiveList={list} selectedCategory={mainstore.category(activeTab.referenceId)}/>
                </div>}
            </div>
        </>
    }
    const discared = <>
                <div>
                <dl className="mt-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <dt className="text-sm text-gray-600">Add descendant view</dt>
                        <dd className="text-sm font-medium text-gray-900"><ArrowRightCircleIcon className="w-6 h-6 text-gray-400 hover:text-gray-500"/></dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt className="text-sm text-gray-600">Add Parent view</dt>
                        <dd className="text-sm font-medium text-gray-900"><ArrowRightCircleIcon className="w-6 h-6 text-gray-400 hover:text-gray-500"/></dd>
                    </div>
                </dl>        
            </div></>
    return <div 
            className='w-[32rem] 2xl:w-[40rem]'>
                {content}
            </div>
}