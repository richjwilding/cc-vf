
import { Switch, Tab, Tabs } from '@heroui/react';
import { KonvaPrimitive } from '../KonvaPrimitive';
import { useState } from 'react';
import { Table } from '../Table';
import MainStore from '../MainStore';
export function PrimitiveReferenceInfo({items, ...props}){
    const [activeTab, setActiveTab ] = useState( "items" )
    const [showInterim, setShowInterim ] = useState( false )

    const itemsHaveSources = items.some(d=>(d.type === "summary" || d.type === "result") && (d.primitives.source.allIds.length > 0 || d.primitives.link.allIds.length > 0 ))

    let showItems = (itemsHaveSources && !showInterim) ? items.flatMap(d=>d.getResultSources) : items

    showItems = showItems.slice(0,20)
    console.log(showItems)

    return <div className='flex flex-col w-full py-1.5 max-w-[calc(100vw_-_30rem)]'>
      <Tabs fullWidth variant="solid" selectedKey={activeTab} onSelectionChange={((id)=>setActiveTab(id))}>
        <Tab key="items" title="Items"/>)
        <Tab key="table" title="Table"/>)
      </Tabs>
        {itemsHaveSources && <div className='px-1 pt-1'>
            <Switch isSelected={showInterim} onValueChange={()=>setShowInterim(!showInterim)} size="sm">
                <p className='text-slate-500'>Intermediate results</p>
            </Switch>
        </div>}
    <div className="px-1 py-2 flex flex-col overflow-y-scroll max-h-[80vh]" >
        {activeTab === "items" && showItems.map(d=><KonvaPrimitive primitive={d} width={550}/>)}
        {activeTab === "table" && <div className='w-[72em]'>
            <Table
                page={0}
                pageItems={20}
                onExpand={(p)=>MainStore().primitivePopup(p)}
                data={showItems} 
                className='w-full min-h-[24em] max-h-inherit !text-sm'
        />
        </div>}
    </div>
    </div>
}