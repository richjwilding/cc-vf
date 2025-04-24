import React from 'react';
import { PrimitiveCard } from '../PrimitiveCard';
import MainStore from '../MainStore';
import { Table } from '../Table';

export function FlowContent({ primitive, props }) {
    let itemsForList
    if(props.asList){
        itemsForList = (props.filters ? primitive.itemsForProcessingWithFilter(props.filters) : primitive.itemsForProcessing)
    }
        
  return (
    <div className="pb-2 pl-4 pr-4 pt-4">
      <span className="text-2xl font-bold text-gray-500">{primitive.configParent?.title}</span>
      <PrimitiveCard.Title primitive={primitive.configParent}/>
      <div className='my-5 flex flex-col'>
        {!props.asList && (
          <>
            <p className="text-sm font-bold text-gray-500">Step instance details</p>
            <div className='border border-gray-200 rounded-md p-2 bg-gray-50 my-3'>
              <PrimitiveCard.OutputPins primitive={primitive}/>
            </div>
          </>
        )}
        {props.asList && (
          <Table
            key={primitive.id}
            primitive={primitive}
            page={0}
            pageItems={20}
            onEnter={(d) => MainStore().sidebarSelect(d)}
            data={itemsForList} 
            className='w-full min-h-[24em] max-h-inherit !text-xs'
          />
        )}
        <PrimitiveCard.Title primitive={primitive}/>
      </div>
      
      <button
        type="button"
        className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        onClick={() => {
          const flowInstance = primitive.findParentPrimitives({type: ["flowinstance"]})[0]
          MainStore().doPrimitiveAction(flowInstance, "run_flowinstance_from_step", {from: primitive.id, force: true})
        }}
      >
        Run from here
      </button>
    </div>
  );
}