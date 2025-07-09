
import { Tab, Tabs } from '@heroui/react';
import { KonvaPrimitive } from '../KonvaPrimitive';
import { useState } from 'react';
import { Table } from '../Table';
import MainStore from '../MainStore';
export function PrimitiveReferenceInfo({items, ...props}){
    const [activeTab, setActiveTab ] = useState( "items" )

    return <div className='flex flex-col w-full py-1.5'>
      <Tabs fullWidth variant="solid" selectedKey={activeTab} onSelectionChange={((id)=>setActiveTab(id))}>
        <Tab key="items" title="Items"/>)
        <Tab key="table" title="Table"/>)
      </Tabs>
    <div className="px-1 py-2 flex flex-col overflow-y-scroll max-h-[80vh]" >
        {activeTab === "items" && items.map(d=><KonvaPrimitive primitive={d} width={550}/>)}
        {activeTab === "table" && <div className='w-[72em]'>
            <Table
                page={0}
                pageItems={20}
                onExpand={(p)=>MainStore().primitivePopup(p)}
                data={items} 
                className='w-full min-h-[24em] max-h-inherit !text-sm'
        />
        </div>}
    </div>
    </div>
}