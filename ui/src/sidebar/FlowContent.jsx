import React, { useState } from 'react';
import { PrimitiveCard } from '../PrimitiveCard';
import MainStore from '../MainStore';
import { Table } from '../Table';
import MarkdownEditor from '../MarkdownEditor';
import { HeroIcon } from '../HeroIcon';
import { Accordion, AccordionItem, Button, Tab, Tabs } from '@heroui/react';
import {Icon} from "@iconify/react";
import clsx from 'clsx';
import StringListEditor from '../@components/StringListEditor';

  const colorMap = {
    "error": "bg-red-100/50 border-red-700 text-red-700",
    "child_error": "bg-amber-100/50 border-amber-700 text-amber-700",
    "complete": "bg-ccgreen-100/50 border-ccgreen-700 text-ccgreen-800",
    "not_execued": "bg-slate-100/50 border-slate-700 text-slate-700",
  }
  const iconMap = {
    "error": "solar:danger-circle-linear",
    "child_error": "solar:danger-circle-linear",
    "error_skip": "solar:danger-triangle-linear",
    "running": "solar:play-circle-linear",
    "complete": "solar:check-circle-bold",
    "waiting": "solar:minus-circle-linear",
    "not_execued": "solar:minus-circle-linear"
  }
  const iconColor = {
    "error": "text-red-700",
    "child_error": "text-amber-700",
    "error_skip": "text-ccgreen-800",
    "complete": "text-ccgreen-800",
    "running": "text-blue-700",
    "waiting": "text-slate-700",
    "not_execued": "text-slate-700"
  }

export function FlowContent({ primitives, axisData, ...props }) {
    const [activeTab, setActiveTab ] = useState( "output" )
    
    let content = []
    let first
    for( const primitive of primitives){
      const srcPrimitive = primitive.configParent ?? primitive
      const outputSet = Object.entries(primitive.outputs ?? {})
      const outputPins = primitive.outputPinsWithStatus ?? {}
      if( outputPins?.impout?.connected){
        outputSet.push(["impout", {config: "primitive", data: primitive.itemsForProcessing, source: [primitive]}])
      }
      
      
      let thisContent = <></>
      let tableData 
      let empty = true
      if( props.asList ){
        const itemsForList = props.list ?? (props.filters ? primitive.itemsForProcessingWithFilter(props.filters) : primitive.itemsForProcessing)
        tableData = itemsForList.filter(d=>d)
        empty = false
      }else if(props.plainData){
        empty = false
        thisContent = <MarkdownEditor initialMarkdown = {props.plainData}/>
      }else{
        if( outputSet.length > 0){
          for(const [name, output] of outputSet){
            if( output?.config === "string_list"){
              empty = false
              thisContent = <StringListEditor 
                                    size="sm"
                                    className='text-slate-600' 
                                    data={output.data}
                                    editable={srcPrimitive.referenceParameters?.fcAllowEdit}
                                    onChange={(d)=>{
                                      primitive.updateSourceDataForPin(name, d)
                                    }}
                                  />
            }else if( output?.config === "primitive"){
              if( output.data?.length > 0){
                empty = false
                tableData = output.data
              }
            }
          }
          
        }else{
          //tableData = [primitive]
          //empty = false
        }
      }
      if( tableData ){
        if(tableData.length === 1){
          thisContent = <>
            <PrimitiveCard variant={true} primitive={tableData[0]} title={false}/>
          </>

        }else{
          thisContent = <>
              <Table
                  key={primitive.id + (props.filters ? props.filters.map(d=>d.value).join("-") : "")}
                  primitive={primitive}
                  page={0}
                  popout={true}
                  pageItems={20}
                  onExpand={(p)=>MainStore().primitivePopup(p)}
                  data={tableData} 
                  axisData={{
                    column: axisData?.column.reduce((a,c)=>{a[c.idx]=c;return a},{}),
                    row: axisData?.row.reduce((a,c)=>{a[c.idx]=c;return a},{}),
                  }}
                  className='w-full min-h-[24em] max-h-inherit !text-sm'
                  />
              <PrimitiveCard.Title primitive={primitive}/>
          </>
        }
      }
      if(empty){
          thisContent = <div className='p-4 flex'>
            <div className='rounded-xl bg-gray-100 w-full p-6 place-items-center'>
              <Icon icon="line-md:gauge-empty" className='w-8 h-8 text-slate-400'/>
              <p className='uppercase font-semibold text-xs text-slate-400'>No Data</p>
            </div>
          </div>
      }
      first = first ?? primitive.id
      content.push(
        <AccordionItem 
            key={primitive.id} 
            textValue={primitive.plainId}
            classNames = {{
              base: "px-3 my-3 border border-slate-300 bg-white shadow-sm rounded-md w-full [&>section]:[will-change:auto!important]"
            }}
            title={<>
              <p className="text-sm font-semibold text-gray-500">{srcPrimitive.title}</p>
              {srcPrimitive.referenceParameters?.stepDescription && <p className="text-md text-gray-500">{srcPrimitive.referenceParameters.stepDescription}</p>}
            </>
            }
          >
          {thisContent}
        </AccordionItem>)
    }

  const status = primitives.map(d=>({...d.flowStatus, primitive: d}))
  const itemsByState = {}
  for( const item of status){
    if( !itemsByState[item.status] ){
      itemsByState[item.status] = []
    }
    itemsByState[item.status].push(item)
  }

  const severityList = status.map(d=>d?.status).filter((d,i,a)=>d && a.indexOf(d)===i)

  let errorIcon = <></>
  let severity = severityList.includes("error") ? "error" : severityList.includes("child_error") ? "child_error" : severityList.includes("error_skip") ? "error_skip" : "none"
  if( severity !== "none" ){
    errorIcon =  <Icon className={iconColor[severity]} icon={iconMap[severity]} width={24} />
  }

  function executionPanel(){
    const colors = colorMap[severity]


    const statusCounts = status.reduce((a,d)=>{a[d.status] = (a[d.status] ?? 0) + 1; return a},{})
    const multipleStatus = Object.keys(statusCounts).length > 1

    const total = status.length

    function section( name, title, singular, plural){

      if(statusCounts[name]){
        let details = <div className='flex flex-col space-y-2'>
          {itemsByState[name].map(d=>{
              const primitive = d.primitive.configParent ?? d.primitive
              const showRetry = name === "child_error" || name === "error"
              let innerContent

              if( (primitive.type === "search" && d.primitive.primitives.config.allIds.length > 0)){
                const nestedSearches = d.primitive.primitives.config.allItems
                innerContent = <div className='flex flex-col text-sm w-full'>
                  <span className='font-semibold'>{primitive.title}</span>
                  <ul class="list-disc list-outside pl-6 w-full">
                    {nestedSearches.map(d=>{
                      const hasError = d.processing.query.error
                      const overrideTextColor = showRetry && !hasError
                      if( hasError ){
                        return <li>
                        <span className='flex flex-col w-full my-1'>
                          <p>Search for {d.searchFor?.title} - {d.processing.query.error.message ?? d.processing.query.error}</p>
                          <div className='flex w-full justify-end flex space-x-2 mb-2'>
                            {<Button variant="bordered" size="sm" onPress={()=>MainStore().sidebarSelect(d.searchFor)}>View</Button>}
                            {(d.processing.query.status === "error" || d.processing.query.status === "rerun") && <Button variant="bordered" size="sm" onPress={()=>d.setFlow("complete")}>Ignore</Button>}
                            {(d.processing.query.status === "rerun") && <Button variant="flat" size="sm" onPress={()=>d.setFlow("error")}>Marked for retry</Button>}
                            {(d.processing.query.status === "complete" || d.processing.query.status === "error") && <Button variant="bordered" size="sm" onPress={()=>d.setFlow("rerun")}>Mark to retry</Button>}
                          </div>
                        </span>
                        </li>
                      }
                      return <li className={clsx(overrideTextColor ? "marker:text-slate-500" : "")}>
                          <span className={clsx('flex w-full justify-between', overrideTextColor ? "text-slate-500" : "")}>
                            <p>Search for {d.searchFor?.title}</p>
                            <p className='mr-2'>{d.primitives.origin.allUniqueIds.length} items</p>
                          </span>
                          </li>
                      })}
                  </ul>
                </div>
              }else{
                innerContent = <>
                  <div className='flex flex-col'>
                    <span className='text-sm font-semibold'>{primitive.title}</span>
                    <span className='text-md'>{d.childErrors?.map(d=>d.error).filter((d,i,a)=>a.indexOf(d)===i).join(", ")}</span>
                  {showRetry && <div className='flex w-full justify-end flex space-x-2 mb-2'>
                    {d.severity === "rerun" && <Button variant="flat" size="sm" onPress={()=>d.primitive.setFlow("error")}>Marked for retry</Button>}
                    {d.severity === "error" && <Button variant="bordered" size="sm" onPress={()=>d.primitive.setFlow("rerun")}>Mark to retry</Button>}
                    <Button variant="bordered" size="sm">Run from here</Button>
                  </div>}
                  </div>
                  {!showRetry && <p className='text-sm'>{title}</p>}
                </>
              }
              return <div className='flex flex-col ml-8'>
                <div className={clsx(colorMap[name], "rounded-lg border p-3 flex place-content-between")}>
                  {innerContent}
                </div>
              </div>

              
          })}
          </div>

        return  <AccordionItem key={name} textValue="name" title={
          <div className='flex space-x-2 place-items-center '>
            {<Icon className={iconColor[name]} icon={iconMap[name]} width={38} />}
            <div className='flex-col flex'>
              <span className='uppercase text-slate-500 text-xs font-semibold'>{title}</span>
              <span className='text-sm text-slate-700'>{statusCounts[name] === total ? (total === 1 ? "Item" : "All items") : `${statusCounts[name]} / ${total}`} {statusCounts[name] > 1 ? plural : singular}</span>
            </div>
          </div>
          }>
          {details}
        </AccordionItem>
      }
      return <></>
    }

    return  <Accordion
                selectionMode="multiple"   // allow more than one panel open
                selectionBehavior="toggle"  // clicking an open header closes it
              >
                {section( "error", "Errors", "has an error", "have errors")}
                {section( "child_error", "Nested errors", "has nested errors", "have nested errors")}
                {section( "complete", "Completed", "has completed", "have completed")}
                {section( "running", "Running", "is running", "are running")}
                {section( "waiting", "Waiting", "is waiting", "are waiting")}
                {section( "not_execued", "Not excuted", "has not run", "have not run")}
            </Accordion>
  }
        
  return (
    <div className="pb-2 pl-4 pr-4 pt-4" key={primitives.map(d=>d.id).join("-")}>
      <Tabs fullWidth variant="solid" selectedKey={activeTab} onSelectionChange={((id)=>setActiveTab(id))}>
        <Tab key="execution"
          title={<div className="flex items-center space-x-2">
            {errorIcon}
            <span>Execution</span>
          </div>}>
        </Tab>
        <Tab key="output" title="Outputs"/>)
        <Tab key="interact" title="Interact"/>)
      </Tabs>

      <div className='my-5 flex flex-col'>
          {activeTab === "execution" && executionPanel()}
          {activeTab === "output" &&  <Accordion
                selectionMode="multiple"   // allow more than one panel open
                selectionBehavior="toggle"  // clicking an open header closes it
                showDivider={false}
                defaultExpandedKeys={[first]}
              >{content}</Accordion>}
      </div>
      
      {false && <button
        type="button"
        className="w-full rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        onClick={() => {
          const flowInstance = primitives[0].findParentPrimitives({type: ["flowinstance"]})[0]
          MainStore().doPrimitiveAction(flowInstance, "run_flowinstance_from_step", {from: primitives[0]?.id, force: true})
        }}
      >
        Run from here
      </button>}
    </div>
  );
}