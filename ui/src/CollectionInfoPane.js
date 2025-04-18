import { ArrowPathIcon, ArrowRightCircleIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, PlayIcon, PlusIcon } from "@heroicons/react/20/solid"
import Panel from "./Panel"
import MainStore from "./MainStore"
import { useEffect, useState } from "react"
import { PrimitiveTable } from "./PrimitiveTable"
import NewPrimitivePanel from "./NewPrimitivePanel"
import { HeroIcon } from "./HeroIcon"
import { PrimitiveCard } from "./PrimitiveCard"
import AIProcessButton from "./AIProcessButton"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import SummaryCard from "./SummaryCard"
import EditableTextField from "./EditableTextField"
import useDataEvent from "./CustomHook"
import UIHelper from "./UIHelper"
import HierarchyNavigator from "./HierarchyNavigator"
import CollectionUtils from "./CollectionHelper"
import TooggleButton from "./ToggleButton"
import PrimitiveConfig from "./PrimitiveConfig"
import SearchSet from "./SearchSet"
import { QueryPane } from "./QueryPane"
import { DescriptionDetails, DescriptionList, DescriptionTerm } from "./@components/description-list"
import { CheckboxField, Checkbox } from "./@components/checkbox"
import { TrashIcon } from "@heroicons/react/24/outline"
import { Table } from "./Table"
import { Label } from "./@components/fieldset"

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
    { name: 'Summarize', referenceId: 113},
    { name: 'Compare', referenceId: 114}
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
    const pageCount = Math.ceil(items.length / pageItems) - 1

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
                                <UIHelper.Button outline icon={<ChevronLeftIcon className="w-5 h-5" onClick={()=>page > 0 ? setPage(page - 1) : undefined}/>}/>
                                <UIHelper.Button outline icon={<ChevronRightIcon className="w-5 h-5" onClick={()=>page < pageCount ? setPage(page + 1) : undefined}/>}/>
                            </>}
                            <UIHelper.Button 
                                tooltip="Add items to board"
                                outline 
                                icon={<HeroIcon icon='FAAddView' className='w-5 h-5'/>}
                                onClick={props.createNewView ? ()=>props.createNewView(38, actionAnchor.id, props.filters, {referenceId: itemCategory.id, pivot: props.pivotRelationship, descend: props.pivotRelationship ? false : true}) : undefined}
                            />
                            <UIHelper.Button 
                                tooltip="Delete items"
                                outline 
                                icon={<TrashIcon className='w-5 h-5'/>}
                                onClick={()=>{
                                    mainstore.promptDelete({
                                        prompt: `Delete ${items.length} items?`,
                                        handleDelete:async ()=>{
                                            for(const d of items){
                                                await mainstore.removePrimitive(d)
                                            }
                                            return true
                                        }                                        
                                    })
                                }}
                            />
                        </div>
                        <div className="relative">
                        <PrimitiveTable 
                            primitive={actionAnchor}
                            page={page}
                            pageItems={pageItems}
                            onEnter={(d)=>mainstore.sidebarSelect(d)}
                            config={props.panelConfig?.columns ?? items[0]?.metadata?.renderConfig?.table ?? cardConfig} 
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

export default function CollectionInfoPane({board, frame, underlying, primitive, filters, localItems, ...props}){
    const [activeTab, setActiveTab] = useState(mainstore.category(tabs.find(d=>d.initial)))
    const [showDetails, setShowDetails] = useState(false)
    const [showNested, setShowNested] = useState(false)
    const [hideNull, setHideNull] = useState(frame?.referenceParameters?.explore?.hideNull)
    const [activeView, setActiveView] = useState(frame?.referenceParameters?.explore?.view ?? 0)

    useDataEvent("relationship_update set_parameter set_field delete_primitive", [board?.id, frame?.id, primitive?.id].filter(d=>d))

    let newPrimitiveCallback = props.newPrimitiveCallback


    useEffect(()=>{
        setActiveView( frame?.referenceParameters?.explore?.view ?? 0 )
        setHideNull( frame?.referenceParameters?.explore?.hideNull )

    }, [frame?.id])

    function updateFrame(){
        if( props.updateFrameExtents && frame){
            props.updateFrameExtents( frame )
        }
    }
    const addImport = (target)=>{
        MainStore().globalPicker({
        root: board,// target.referenceId === 118 ? board : undefined,
        target: target,
        exclude: target.primitives.imports,
        callback:(pick)=>{
            target.addRelationship(pick, `imports`)
        },
        })
    }
    let content

    let primitiveForContent = underlying ?? frame
    const activeInfo = !underlying ? <></> : <div className="bg-yellow-100 border border-yellow-100 my-2 px-2 py-2 rounded-md">{(()=>{
                    return <div className="text-sm text-yellow-800">Configuration for flow item</div>
                })()}
            </div>
    const underlyingInfo = !underlying ? <></> : <div className="px-2 py-2 mt-4 bg-ccgreen-50 border-ccgreen-200 border rounded-md">{(()=>{
                    let flowinstance = underlying.findParentPrimitives({type:"flowinstance"})?.[0]
                    let title = flowinstance.primitives.imports.allItems[0]?.filterDescription
                    return <>
                        <div className="text-sm text-ccgreen-800">Items for flow instance {title} (#{flowinstance?.plainId}) </div>
                        <button
                        type="button"
                        className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 mt-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                        onClick={()=>{
                            MainStore().doPrimitiveAction( flowinstance, "run_flowinstance_from_step", {from: underlying.id, force: true})
                            
                        }}
                        >
                            Run from here
                        </button>
                    </>

                })()}
            </div>

    if( frame?.type === "actionrunner" && Object.values(frame.metadata?.parameters ?? {}).filter(d=>d.type).length === 0){
        const inputCategories = primitiveForContent.itemsForProcessing.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i).map(d=>mainstore.category(d)).filter(d=>d)

        const actions = inputCategories.map(d=>d.actions).flat()
        const actionOptions = actions.filter(d=>d.actionRunner).map(d=>({
            id: d.key,
            icon: d.icon,
            title: d.title
        }))

        content = <div className="flex flex-col pb-2 px-3">
                    <span className="text-gray-400 text-xs mt-0.5 mb-2">#{frame.plainId}  {frame.metadata.title ?? "Search"}</span>
                    <div className="p-2 ">
                        <UIHelper.OptionList 
                            name="action" 
                            title="Action" 
                            options={actionOptions} 
                            value={frame.referenceParameters.action}
                            zIndex="50" 
                            onChange={(d)=>{
                                frame.setParameter("action", d, false, true)
                            }}
                        />
                    </div>
                    {false && <div className="px-3 py-2 text-gray-500 text-sm">
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
                    </div>}
                </div>

    }else  if( frame?.type === "search" ){
        const searchCategoryIds = frame.metadata.resultCategoryId ?? frame.metadata.parameters?.sources?.options?.map(d=>d.resultCategoryId ) ?? []
        const searchResultCategory = mainstore.category( searchCategoryIds[0] )
        const searchResults = primitiveForContent.primitives.strictDescendants.filter(d=>searchCategoryIds.includes(d.referenceId))
        const nestedSearch = frame.primitives.origin.uniqueSearch
        
        const nestedCallback = (id)=>{
            mainstore.doPrimitiveAction(mainstore.primitive(id), "run_search")
        }

        content = <div className="flex flex-col pb-2 px-3">
                    {activeInfo}
                    <span className="text-gray-400 text-xs mt-0.5 mb-2">#{frame.plainId}  {frame.metadata.title ?? "Search"}</span>
                    <div className="flex w-full space-x-3 place-items-center">
                        <MagnifyingGlassIcon className="h-6"/>
                        <EditableTextField 
                            submitOnEnter={true} 
                            primitiveId={frame.id}
                            border='hover'
                            value={frame.title} 
                            fieldClassName='w-full'
                            placeholder='Title of search' 
                            callback={(value)=>{
                                frame.title = value
                                return true
                            }}
                        />
                    </div>
                    <div className="w-full my-2">
                        <QueryPane primitive={frame} detail={false}/>
                    </div>
                    <div className="w-full border bg-gray-50 border-gray-200 rounded-lg mt-2 px-2 py-1.5">
                        <QueryPane primitive={frame} terms={false}/>
                    </div>

                    {frame.metadata?.nestedSearch &&  <div className="mt-2 space-y-2">
                        <div className="border rounded-md bg-gray-50">
                            <div onClick={()=>setShowNested(!showNested)} className="flex text-gray-500 w-full place-items-center px-3 py-2 ">
                                <p className="font-medium ">Nested Searches</p>
                                <ChevronRightIcon strokeWidth={2} className={`ml-auto w-5 h-5 ${showNested ? '-rotate-90 transform' : ''}`}/>
                            </div>
                            {showNested && <>
                                <Table
                                    primitive={frame}
                                    page={0}
                                    pageItems={50}
                                    onEnter={(d)=>mainstore.sidebarSelect(d)}
                                    columns={[
                                        {field: 'plainId', title: "ID", width: 80},
                                        {field: 'title', title: "Title"},
                                        {field: 'count', title: "Results"},
                                        {field: 'action', title: "", callback: nestedCallback}
                                    ]}
                                    data={nestedSearch.map(d=>{
                                        const target = d.parentPrimitives.filter(d=>d.id !== frame.id)[0]
                                        if( target ){

                                            return {
                                                id: target.id,
                                                plainId: target.plainId,
                                                title: target.title,
                                                count: d.primitives.origin.allUniqueIds.length,
                                                action: d.id,
                                                data:{
                                                    id: target.id,
                                                    primitive: target
                                                }                                            
                                            }
                                        }
                                    }).filter(d=>d)}
                                    primitives={frame.primitives.origin.uniqueSearch} 
                                    className='w-full min-h-[24em] max-h-[60vh] !text-xs'/> 
                            </>
                            }
                        </div>
                    </div>
                }

                    {underlyingInfo}
                    <div className="w-full border bg-gray-50 border-gray-200 rounded-lg mt-2 p-2">
                        <CategoryHeader itemCategory={searchResultCategory} items={searchResults} actionAnchor={frame} />
                    </div>
                    <QueryPane.Info primitive={frame}/>
                    <div className="flex space-x-3 mt-3">
                        {(searchResults.length > 0) && <button
                            type="button"
                            className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 "
                            onClick={()=>mainstore.promptDelete({prompt: `Remove search all ${searchResults.length} results?`, handleDelete: ()=>frame.removeChildren()})}
                            >
                            Delete {searchResultCategory.plural ?? (searchResultCategory.title + "s")}
                        </button>}
                        <button
                            type="button"
                            className="flex space-x-2 place-items-center justify-center w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                            onClick={()=>mainstore.doPrimitiveAction(frame, "run_search")}
                        >
                            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" /><p>Search</p>
                    </button>
                    </div>
                </div>

    }else if( frame ){
        const list = localItems ?? (filters ? primitiveForContent.itemsForProcessingWithFilter(filters) : primitiveForContent.itemsForProcessing)
        const viewConfigs = frame.type === "flow" ? props.flowInstances.map((d,i)=>(
            {
                id: i,
                title:`Flow instance #${d.plainId}`
            }
        )) : CollectionUtils.viewConfigs(list?.[0]?.metadata)
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
        let descendantCategories = descendants.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i).map(d=>mainstore.category(d)).filter(d=>d && ["activity","evidence","entity","result","detail"].includes(d.primitiveType))

        function getAncestors(){
            let sourceList = list
            /*const origins = list.map(d=>d.origin)
            const originType = origins.map(d=>d.type).filter((d,i,a)=>a.indexOf(d)===i)
            if( originType.length === 1 && originType[0] === "segment"){
                sourceList = origins.flat()
            }*/
            const axisOptions = CollectionUtils.axisFromCollection( sourceList, frame )
            const axisForPivot = axisOptions.filter(d=>["result","entity"].includes(d.category?.primitiveType) ).filter((d,i,a)=>a.findIndex(d2=>d2.category.id === d.category.id)===i).map(d=>({category: d.category, relationship: d.relationship}))
            let parents = mainstore.uniquePrimitives(sourceList.map(d=>d.findParentPrimitives({type: ["entity", "result"]})).flat(Infinity))
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

        const updateViewMode = (value)=>{
            frame.setField(`referenceParameters.explore.view`, value)
            setActiveView( value )
            if( props.updateFrameExtents ){
                //props.updateFrameExtents( frame )
            }
        }
        const addCategory = (target)=>{
            const baseCategories = [54, 90]
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
            const primitiveForFilter = frame
            const fullList = primitiveForContent.itemsForProcessingWithFilter(filters, {ignoreFinalViewFilter: true}) 

            const columnAxis = CollectionUtils.primitiveAxis(primitiveForFilter, "column", fullList)
            const rowAxis = CollectionUtils.primitiveAxis(primitiveForFilter, "row", fullList)
            const colFilter = PrimitiveConfig.decodeExploreFilter(primitiveForFilter.referenceParameters?.explore?.axis?.column?.filter)
            const rowFilter = PrimitiveConfig.decodeExploreFilter(primitiveForFilter.referenceParameters?.explore?.axis?.row?.filter)
            


            const viewFilters = primitiveForFilter.referenceParameters?.explore?.filters?.map((d2,i)=>CollectionUtils.primitiveAxis(primitiveForFilter, i, fullList)) ?? []            
            let viewPivot = primitiveForFilter.referenceParameters?.explore?.viewPivot
            const axisOptions = CollectionUtils.axisFromCollection( fullList, primitiveForFilter ).map(d=>{
                const out = {...d}
                if( d.relationship ){
                    out.relationship = [d.relationship].flat()//.map(d=>d.split(":")[0])
                    out.access = [out.relationship].flat().length
                }
                return out
            })
            const localFilters = CollectionUtils.getExploreFilters( primitiveForFilter, axisOptions )

            let liveFilters = primitiveForFilter.primitives.allUniqueCategory.filter(d=>d.referenceId === PrimitiveConfig.Constants["LIVE_FILTER"]).map(d=>{
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
                    const localFilters = primitiveForFilter.referenceParameters?.explore?.filters ?? []
                    const track = (primitiveForFilter.referenceParameters?.explore?.filterTrack ?? 0) +1
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
                    primitiveForFilter.setField("referenceParameters.explore.filters", localFilters)
                    primitiveForFilter.setField("referenceParameters.explore.filterTrack", track)
                    if( props.updateFrameExtents ){
                        props.updateFrameExtents( primitiveForFilter )
                    }
                }
            }
            function updateHideNull(val){
                primitiveForFilter.setField("referenceParameters.explore.hideNull", val)
                setHideNull(val)
                if( props.updateFrameExtents ){
                    props.updateFrameExtents( primitiveForFilter )
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
                            currentFilter = PrimitiveConfig.decodeExploreFilter(primitiveForFilter.referenceParameters?.explore?.filters?.[ mode]?.filter)
                        }
                        CollectionUtils.updateAxisFilter(primitiveForFilter, mode, currentFilter, item, setAll, axisExtents,
                            (filter)=>{
                                if( props.updateFrameExtents ){
                                    props.updateFrameExtents( primitiveForFilter )
                                }
                            }
                        )
                    },
                    deleteViewFilter: (idx)=>{
                        const filter = viewFilters[idx]
                        let filters = primitiveForFilter.referenceParameters?.explore?.filters
                        filters = filters.filter(d=>d.track !== filter.track )
                        
                        primitiveForFilter.setField("referenceParameters.explore.filters", filters)
                        if( props.updateFrameExtents ){
                            props.updateFrameExtents( primitiveForFilter )
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

        function viewConfigPanel(){
            return  <div className="border rounded-md bg-gray-50 text-gray-500 font-medium px-3 p-2">
                        <UIHelper.Panel title="View configuration" icon={<FontAwesomeIcon icon={["fal","tags"]} />}>
                            <div className="p-2 text-sm space-y-2">
                                <UIHelper.OptionList 
                                    title="View Mode" 
                                    options={viewConfigs} 
                                    onChange={(id)=>updateViewMode(viewConfigs.findIndex(d=>d.id === id))} 
                                    value={viewConfigs[activeView]?.id} 
                                    zIndex={50}
                                    />
                                <div className='w-full text-lg overflow-y-scroll sapce-y-2 max-h-[50vh]'>
                                    {viewConfig && (!viewConfig.config || viewConfig.config.length === 0) && <p className='text-sm text-gray-500 text-center'>No settings</p>}
                                    {viewConfig && viewConfig.config && Object.keys(viewConfig.config).map(d=><UIHelper {...viewConfig.config[d]} value={frame.renderConfig?.[d]} zIndex={50} onChange={async (v)=>{await frame.setField(`renderConfig.${d}`, v); updateFrame()}}/>)}
                                </div>
                            </div>
                        </UIHelper.Panel>
                    </div>
        }
        function categoryPanel(){
                return <div className="border rounded-md bg-gray-50 text-gray-500 font-medium px-3 p-2">
                        <UIHelper.Panel title="Categories" icon={<FontAwesomeIcon icon={["fal","tags"]} />}>
                            <PrimitiveCard.Categories primitive={frame} scope={filters ? list.map(d=>d.id) : undefined} /*directOnly*/ hidePanel className='pb-2 w-full h-fit'/>
                            <div type="button"
                            className="flex my-2 font-medium grow-0 bg-white hover:bg-gray-100 hover:shadow-sm hover:text-gray-600 justify-center ml-2 p-1 rounded-full shrink-0 text-xs text-gray-400 "
                            onClick={()=>addCategory(frame)}> 
                                    <PlusIcon className="w-5 h-5"/>
                            </div>
                            <UIHelper.Button title="Axis" action={()=>mainstore.doPrimitiveAction(frame,"define_axis")}/>
                        </UIHelper.Panel>
                    </div>
        }
        function filterPanel(){
            return <div className="space-y-2">
                        <div className="border rounded-md bg-gray-50 text-gray-500 font-medium px-3 p-2">
                            <UIHelper.Panel title="Filters" icon={<FontAwesomeIcon icon={["fal", "filter"]} />}>
                                        {filterPane}
                            </UIHelper.Panel>
                        </div>
                    </div>
        }
            function pinSet(title, target ){
                const pins = frame.referenceParameters?.[target] ?? {}
                const pinIds = Object.keys(pins)

                function toggleType(pinId, type){
                    let types = (pins[pinId].types ?? [])
                    if( types.includes(type)){
                        types = types.filter(d=>d !== type)
                    }else{
                        types.push(type)
                    }
                    frame.setField(`referenceParameters.${target}.${pinId}.types`, types)
                }
                return <UIHelper.Panel title={title} >
                            <div className="px-2 py-2 flex flex-col space-y-2 text-gray-500 @container">
                            <DescriptionList inContainer={true}>
                                {pinIds.map(pinId=>(<>
                                    <DescriptionTerm inContainer={true}>
                                        <EditableTextField 
                                            submitOnEnter={true} 
                                            fieldClassName="!p-0 !bg-transparent"
                                            callback={(value)=>{
                                                if( value ){
                                                    frame.setField(`referenceParameters.${target}.${pinId}.name`, value)
                                                    return true
                                                }
                                                return false
                                            }}
                                            value={pins[pinId].name}>
                                        </EditableTextField>
                                    </DescriptionTerm>
                                    <DescriptionDetails inContainer={true}>
                                        <DescriptionList inContainer={true}>
                                            <DescriptionTerm inContainer={true}>Types</DescriptionTerm>
                                            <DescriptionDetails inContainer={true}>
                                                <CheckboxField>
                                                    <Checkbox 
                                                        onClick={()=>toggleType(pinId, "primitive")}
                                                        checked={(pins[pinId].types ?? []).includes("primitive")} 
                                                        />
                                                        <Label>Primitive</Label>
                                                </CheckboxField>
                                                <CheckboxField>
                                                    <Checkbox 
                                                        onClick={()=>toggleType(pinId, "string")}
                                                        checked={(pins[pinId].types ?? []).includes("string")} 
                                                        />
                                                    <Label>Text</Label>
                                                </CheckboxField>
                                                <CheckboxField>
                                                    <Checkbox 
                                                        onClick={()=>toggleType(pinId, "string_list")}
                                                        checked={(pins[pinId].types ?? []).includes("string_list")} 
                                                        />
                                                    <Label>Comma separated list</Label>
                                                </CheckboxField>

                                            </DescriptionDetails>
                                        </DescriptionList>
                                    </DescriptionDetails>
                                    </>
                                ))}
                                    <DescriptionTerm inContainer={true}></DescriptionTerm>
                                    <DescriptionDetails inContainer={true} >
                                        <UIHelper.Button outline title="New Pin" className="w-full" onClick={()=>{
                                            const pre = `${target}-`
                                            const existing = Math.max(0, ...pinIds.filter(d=>d.startsWith(pre)).map(d=>d.slice(pre.length)))
                                            let name = `${pre}${existing + 1}`
                                            frame.setField(`referenceParameters.${target}.${name}`, {name: `New ${title}`, types:["string"]})

                                        }}/>
                                    </DescriptionDetails>
                            </DescriptionList>
                            </div>
                        </UIHelper.Panel>

            }
        function flowPanel(){
            let flowInstanceToShow
            if( frame.type === "flow" && frame.flowElement ){
                flowInstanceToShow = props.flowInstances[frame.referenceParameters?.explore?.view ?? 0]
            }

            return <><div className="space-y-2">
                <div className="border rounded-md bg-gray-50">
                    <div onClick={()=>setShowDetails(!showDetails)} className="flex text-gray-500 w-full place-items-center px-3 py-2 ">
                        <p className="font-medium ">{frame.metadata.title} details</p>
                        <ChevronRightIcon strokeWidth={2} className={`ml-auto w-5 h-5 ${showDetails ? '-rotate-90 transform' : ''}`}/>
                    </div>
                    {showDetails && <>
                        <div className="px-4 pb-2 space-y-2 text-sm text-gray-600">
                            {pinSet("Inputs", "inputPins")}
                            {pinSet("Outputs", "outputPins")}
                            {pinSet("Control", "controlPins")}
                        </div>
                    </>
                    }
                </div>
            </div>
            {!filters && (frame.type === "flow" && !frame.flowElement) && <UIHelper.Button outline title="New Instance" onClick={()=>mainstore.doPrimitiveAction(frame,"create_flowinstance")}/>}
            {!filters && (frame.type === "flow" && frame.flowElement && flowInstanceToShow) && <UIHelper.Button outline title="Run subflow" onClick={()=>mainstore.doPrimitiveAction(flowInstanceToShow,"run_subflow", {subFlowId: frame.id})}/>}
            {!filters && (frame.type === "flow") && 
                <UIHelper.Button outline title="Scaffold" onClick={()=>{
                    if( flowInstanceToShow ){
                        mainstore.doPrimitiveAction(frame,"workflow_scaffold", {subFlowForInstanceId: flowInstanceToShow.id})
                    }else{
                        if( props.inFlowInstance ){
                            mainstore.doPrimitiveAction(frame,"workflow_scaffold", {subFlowForInstanceId: props.inFlowInstance.id})
                        }else{
                            mainstore.doPrimitiveAction(frame,"workflow_scaffold")
                        }
                    }
                }}
                />}
            </>
        }



        content = <>
        <div className="p-3 space-y-4">
            {activeInfo}
            {frame.type === "summary" && <SummaryCard primitive={frame}/>}


            {frame.type === "element" && <div className="space-y-2">
                <div className="border rounded-md bg-gray-50">
                    <div onClick={()=>setShowDetails(!showDetails)} className="flex text-gray-500 w-full place-items-center px-3 py-2 ">
                        <p className="font-medium ">{frame.metadata.title} details</p>
                        <ChevronRightIcon strokeWidth={2} className={`ml-auto w-5 h-5 ${showDetails ? '-rotate-90 transform' : ''}`}/>
                    </div>
                    {showDetails && <>
                        <div className="p-2 ">
                            <PrimitiveCard.Parameters primitive={frame} items={props.originalList ?? list} editing leftAlign compactList className="text-xs text-slate-500" fullList />
                            <div className="py-2 text-gray-500 text-sm">
                                    <UIHelper.Panel title="Sections" narrow>
                                    {(()=>{
                                        if( list[0]?.type === "summary"){
                                            const sections = list.flatMap(d=>d.referenceParameters.structured_summary?.map(d=>d.heading)).filter((d,i,a)=>d && a.indexOf(d)===i) 
                                            if( sections.length > 0){
                                                return <div className="px-2 py-1 flex flex-col space-y-2 text-gray-500 @container">
                                                            <DescriptionList inContainer={true}>
                                                                {sections.map((d,i)=>{
                                                                    const show = frame.referenceParameters?.sections?.[d]?.show !== false
                                                                    const includeHeading = frame.referenceParameters?.sections?.[d]?.heading !== false
                                                                    const fontSize = frame.referenceParameters?.sections?.[d]?.fontSize ?? ""
                                                                    const fontStyle = frame.referenceParameters?.sections?.[d]?.fontStyle ?? ""
                                                                    return (
                                                                    <>
                                                                        <DescriptionTerm inContainer={true}>{d}</DescriptionTerm>
                                                                        {!show && <div className="grid grid-cols-1 text-base/6 text-sm/6 @lg:!grid-cols-[min(40%,theme(spacing.40))_auto] py-2">
                                                                                <p>Include</p>
                                                                                    <Checkbox
                                                                                        onClick={()=>{frame.setField(`referenceParameters.sections.${d}.show`, true)}}
                                                                                    />
                                                                                </div>
                                                                        }
                                                                        {show && <DescriptionDetails inContainer={true} className="-mt-2">
                                                                            <DescriptionList inContainer={true}>
                                                                                <DescriptionTerm inContainer={true}>Include</DescriptionTerm>
                                                                                <DescriptionDetails inContainer={true}>
                                                                                    <Checkbox 
                                                                                        checked={true} 
                                                                                        onClick={()=>{frame.setField(`referenceParameters.sections.${d}.show`, false)}}
                                                                                        />
                                                                                </DescriptionDetails>
                                                                                <DescriptionTerm inContainer={true}>Include heading</DescriptionTerm>
                                                                                <DescriptionDetails inContainer={true}>
                                                                                    <Checkbox 
                                                                                        checked={includeHeading} 
                                                                                        onClick={()=>{frame.setField(`referenceParameters.sections.${d}.heading`, !includeHeading)}}
                                                                                        />
                                                                                </DescriptionDetails>
                                                                                <DescriptionTerm inContainer={true}>Font size</DescriptionTerm>
                                                                                <DescriptionDetails inContainer={true}>
                                                                                    <PrimitiveCard.RenderItem 
                                                                                            item={{
                                                                                                type:"number",
                                                                                                value:fontSize
                                                                                            }}
                                                                                            callback={(value)=>{
                                                                                                let size
                                                                                                if( isNaN(value)){
                                                                                                    size = null
                                                                                                }else{                                                                                                    
                                                                                                    size = Math.min(Math.max(1,value), 144)
                                                                                                }
                                                                                                frame.setField(`referenceParameters.sections.${d}.fontSize`, size)
                                                                                                return true
                                                                                            }}
                                                                                        />
                                                                                </DescriptionDetails>
                                                                                <DescriptionTerm inContainer={true}>Font style</DescriptionTerm>
                                                                                <DescriptionDetails inContainer={true}>
                                                                                        <PrimitiveCard.RenderItem 
                                                                                            item={{
                                                                                                type:"option_list",
                                                                                                options:["light","normal","bold","italic"],
                                                                                                value:fontStyle
                                                                                            }}
                                                                                            callback={(v)=>frame.setField(`referenceParameters.sections.${d}.fontStyle`, v)}
                                                                                        />
                                                                                </DescriptionDetails>
                                                                            </DescriptionList>
                                                                        </DescriptionDetails>}
                                                                    </>
                                                                    )})}
                                                            </DescriptionList>
                                                        </div>
                                            }
                                        }
                                        return <></>
                                    })()}
                                    </UIHelper.Panel>
                            </div>
                        </div>
                        <div className="text-xs px-3 pb-3 text-gray-600">#{frame.plainId}</div>
                    </>
                    }
                </div>
            </div>}
            
            <div className="space-y-2">
                {(["query","view","flow"].includes(frame.type) || (frame.type === "element" && frame.getConfig.extract === "items")) && viewConfigPanel()}
                {["query","view"].includes(frame.type) && categoryPanel()}
                {["query","view"].includes(frame.type) && filterPanel()}
            </div>
            {frame.type === "flow" && flowPanel()}
            
            {!filters && (frame.type === "view" || frame.type === "action" || frame.type === "summary" || frame.type === "categorizer" || frame.type == "actionrunner") && 
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
                        </>
                        }
                    </div>
                </div>
            }
            {frame.type === "page" && 
                <div className="space-y-2">
                    <div className="border rounded-md bg-gray-50">
                        <div onClick={()=>setShowDetails(!showDetails)} className="flex text-gray-500 w-full place-items-center px-3 py-2 ">
                            <p className="font-medium ">{frame.metadata.title} details</p>
                            <ChevronRightIcon strokeWidth={2} className={`ml-auto w-5 h-5 ${showDetails ? '-rotate-90 transform' : ''}`}/>
                        </div>
                        {showDetails && <>
                            <div className="px-4 pb-2 space-y-2 text-sm text-gray-600">
                                {pinSet("Inputs", "inputPins")}
                                {pinSet("Outputs", "outputPins")}
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
                            {false && <div className="pt-4 pb-2 text-gray-500 text-sm">
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
                            </div>}
                        </div>}
                    </div>
                </div>
            }
            {underlyingInfo}
            {itemCategory && <div className="px-3 py-2 bg-gray-50 border rounded-md">
                <CategoryHeader newPrimitiveCallback={newPrimitiveCallback} itemCategory={itemCategory} items={list}  newItemParent={newItemParent} createNewView={props.createNewView} panelConfig={frame?.referenceParameters?.table} actionAnchor={frame} filters={filters}/>
            </div>}
            {descendantCategories.length > 0 && <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">Descendants of items</p>
                <div className="border rounded-md p-2 space-y-2">
                    {descendantCategories.map((d,i)=>(
                        <div key={d.id} className="p-2 bg-gray-50 text-sm border rounded-md ">
                            <CategoryHeader itemCategory={d} newPrimitiveCallback={newPrimitiveCallback} newItemParent={newItemParent} createNewView={props.createNewView} panelConfig={frame?.referenceParameters?.table} actionAnchor={frame} items={descendants.filter(d2=>d2.referenceId === d.id)} filters={filters}/>
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
                                        <CategoryHeader itemCategory={d.category} newPrimitiveCallback={newPrimitiveCallback} newItemParent={newItemParent} pivotRelationship={d.relationship} createNewView={props.createNewView} panelConfig={frame?.referenceParameters?.table} actionAnchor={frame} items={parents.filter(d2=>d2.referenceId === d.category.id)} filters={filters}/>
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