import { ArrowRightCircleIcon, ChevronRightIcon } from "@heroicons/react/20/solid"
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

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

let mainstore = MainStore()
const tabs = [
    { name: 'Discovery', search: true},
    { name: 'Process', referenceId: 112},
    { name: 'Vew', list: true}
]

const mainTabs = [
    { name: 'Query', referenceId: 81, initial: true},
    { name: 'Summarize', referenceId: 109},
]

function CategoryHeader({itemCategory, items, newItemParent, ...props}){
    const [page, setPage] = useState(0)
    const [pageItems, setPageItems] = useState(50)
    const [showItems, setShowItems] = useState(false)
    const [activeTab, setActiveTab] = useState(mainstore.category(tabs.find(d=>d.initial)))

    const count = items.length

    let cardConfig = {fields: [
        {field: 'id', title: "ID", width: 80},
        {field: 'title', title: "Title"}
    ]}


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
                {activeTab?.referenceId && <div className="w-full flex flex-col mt-2">
                    <NewPrimitivePanel key={activeTab.referenceId} parent={newItemParent} primitiveList={items} selectedCategory={mainstore.category(activeTab.referenceId)}/>
                </div>}
                {activeTab?.list && <div className="w-full flex border bg-gray-50 border-gray-200 rounded-lg mt-2">
                        <PrimitiveTable 
                            page={page}
                            pageItems={pageItems}
                            config={cardConfig} 
                            primitives={items} 
                            className='w-full min-h-[24em] max-h-[60vh] !text-xs'/> 
                    </div>}
            </>}
        </>

}

export default function CollectionInfoPane({board, frame, primitive, filters, ...props}){
    const [activeTab, setActiveTab] = useState(mainstore.category(tabs.find(d=>d.initial)))
    const [showDetails, setShowDetails] = useState(false)

    let newPrimitiveCallback = props.newPrimitiveCallback

    let content
    if( frame ){


        const list = filters ? frame.itemsForProcessingWithFilter(filters) : frame.itemsForProcessing
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

        function clearItems(e){
            e.stopPropagation();
            mainstore.promptDelete({
                prompt: `Delete ${list.length} items?`,
                handleDelete:async ()=>{
                    for(const d of list){
                        await mainstore.removePrimitive(d)
                    }
                    return true
                }
            })
        }


        content = <>
        <div className="p-3 space-y-4">
            {frame.type === "summary" && <SummaryCard primitive={frame}/>}
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
                            <PrimitiveCard.Parameters primitive={frame} editing leftAlign compactList className="text-xs text-slate-500" fullList />
                        </div>}
                    </div>
                </div>
            }
            {itemCategory && <div className="px-3 py-2 bg-gray-50 border rounded-md">
                <CategoryHeader itemCategory={itemCategory} items={list} newItemParent={newItemParent} />
            </div>}
            {descendantCategories.length > 0 && <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">Descendants of items</p>
                <div className="border rounded-md p-2 space-y-2">
                    {descendantCategories.map((d,i)=>(
                        <div className="p-2 bg-gray-50 text-sm border rounded-md ">
                            <CategoryHeader key={d.id} itemCategory={d} newItemParent={newItemParent} items={descendants.filter(d2=>d2.referenceId === d.id)}/>
                    </div>))}
                </div>
            </div>}
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
            className='w-[32rem]'>
                {content}
            </div>
}