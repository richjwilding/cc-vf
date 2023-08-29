import { useState } from "react";
import { ComponentRow } from "./ComponentRow";
import { PrimitiveCard } from "./PrimitiveCard";
import TooggleButton from "./ToggleButton";
import MainStore from "./MainStore";

export default function VFTable({primitive,...props}){
    const [showActivity, setShowActivity] = useState(true)
    const [showHypothesis, setShowHypothesis] = useState(false)
    const [importantOnly, setImportantOnly] = useState(false)
    const [asTable, setAsTable] = useState(true)
    return (
    <div className="overflow-scroll ">
        <div className="flex">
            <TooggleButton title='Show hypothesis' enabled={showHypothesis} setEnabled={setShowHypothesis} className='p-2 m-2 text-xs'/>
            <TooggleButton title='Show activity' enabled={showActivity} setEnabled={setShowActivity} className='p-2 m-2 text-xs'/>
            <TooggleButton title='Only critical' enabled={importantOnly} setEnabled={setImportantOnly} className='p-2 m-2 text-xs'/>
            <TooggleButton title='As table' enabled={asTable} setEnabled={setAsTable} className='p-2 m-2 text-xs'/>
        </div>
        <div 
            className="grid"
            style={{
                gridTemplateColumns: `400px${showHypothesis ? " auto" : ""}${showActivity ? " auto" : ""}`
            }}
        >
            <p className="font-semi text-gray-600 border-b-gray-200 border-b text-sm text-center">Fundamental</p>
            {showHypothesis && <p className="font-semi text-gray-600 border-b-gray-200 border-b text-sm text-center">Hypothesis to test</p>}
            {showActivity && <p className="font-semi text-gray-600 border-b-gray-200 border-b text-sm text-center">Activities to address}</p>}
            {
                Object.values(primitive.framework.components).map((c) => {
                    if( primitive.referenceParameters?.phase){
                        if( Object.values(c.levels).filter((d)=>d.phaseId === primitive.referenceParameters?.phase).length === 0){
                            return <></>
                        }
                    }
                    let hypothesis_list = primitive.primitives.hfc[c.id].allUniqueHypothesis
                    if( importantOnly){
                        hypothesis_list = hypothesis_list.filter((d)=>d.referenceParameters?.important)
                    }

                    const activityList = hypothesis_list.map((d)=>d.primitives.allActivity).flat().filter((d,i,a)=>a.findIndex((d2)=>d2.id===d.id)===i) 
                    return <>
                        <ComponentRow showInfo primitive={primitive} compact={true} evidenceDetail={false} key={c.id} component={c}/>
                        {showHypothesis && <div 
                            className={ asTable 
                                            ? "w-full flex flex-col border border-transparent border-b-gray-200"
                                            : "w-full flex flex-wrap border border-transparent border-b-gray-200"
                                        }
                            >
                            {hypothesis_list.map((d)=>{
                                return <PrimitiveCard 
                                            fields={['important,title']} 
                                            primitive={d} 
                                            border={!asTable} 
                                            textSize='xs' 
                                            compact 
                                            onClick={()=>MainStore().sidebarSelect(d)}
                                            className={
                                                asTable 
                                                    ? `my-1 mr-1 !px-1 !pt-0 !pb-1`
                                                    : `my-2 mx-4 max-w-[20rem]`
                                            }/>
                            })}
                        </div>}
                        {showActivity && <div 
                            className={ asTable 
                                            ? "w-full flex flex-col border border-transparent border-b-gray-200"
                                            : "w-full flex flex-wrap border border-transparent border-b-gray-200"
                                    }
                            >
                            {activityList.map((d)=>{
                                return <PrimitiveCard 
                                            fields={['title','important']} 
                                            primitive={d} 
                                            border={!asTable} 
                                            textSize='xs' 
                                            onClick={()=>MainStore().sidebarSelect(d)}
                                            compact 
                                            className={
                                                asTable 
                                                    ? `my-0.5 mr-1`
                                                    : `my-2 mx-4 max-w-[20rem]`
                                            }/>
                            })}
                        </div>}
                    </>
                })
            }                    
    </div>
    </div>)
}