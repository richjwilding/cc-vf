import React from 'react';
import { PrimitiveCard } from '../PrimitiveCard';
import MainStore from '../MainStore';
import { Table } from '../Table';
import MarkdownEditor from '../MarkdownEditor';

export function FlowContent({ primitive, axisData, ...props }) {
    let itemsForList
    if(props.asList){
        itemsForList = props.list ?? (props.filters ? primitive.itemsForProcessingWithFilter(props.filters) : primitive.itemsForProcessing)
    }

    let content = <></>
    if( props.asList ){
        content = <>
            <Table
                key={primitive.id}
                primitive={primitive}
                page={0}
                pageItems={20}
                onExpand={(p)=>MainStore().sidebarSelect(p)}
                data={itemsForList.filter(d=>d)} 
                axisData={{
                    column: axisData?.column.reduce((a,c)=>{a[c.idx]=c;return a},{}),
                    row: axisData?.row.reduce((a,c)=>{a[c.idx]=c;return a},{}),
                }}
                className='w-full min-h-[24em] max-h-inherit !text-xs'
            />
            <PrimitiveCard.Title primitive={primitive}/>
        </>
    }else if(props.plainData){
        content = <MarkdownEditor initialMarkdown = {props.plainData}/>
    }else{
        content =<>
        <p className="text-sm font-bold text-gray-500">Step instance details</p>
        <div className='border border-gray-200 rounded-md p-2 bg-gray-50 my-3'>
            <PrimitiveCard.OutputPins primitive={primitive}/>
        </div>
        </>
    }
        
  return (
    <div className="pb-2 pl-4 pr-4 pt-4">
      <span className="text-2xl font-bold text-gray-500">{primitive.configParent?.title}</span>
      <PrimitiveCard.Title primitive={primitive.configParent}/>
      <div className='my-5 flex flex-col'>
          {content}
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