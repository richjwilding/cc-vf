import { motion } from "framer-motion"
import { PrimitiveCard } from "./PrimitiveCard"
import Panel from "./Panel"
import MainStore from "./MainStore"
export default function CardGrid({primitive, category, list, categoryConfig, fields, ...props}){
    if( category === undefined ){
        if( primitive.metadata.resultCategories ){
            category = primitive.metadata?.resultCategories[0]
        }else{
            return <></>
        }
    }        
    if( fields === undefined && category && category.views.list){
        fields = category.views.list['cards']
    }

    if( list === undefined ){
        list = category && primitive.primitives.results ?  primitive.primitives.results[category.id].map((d)=>d) : []
    }
    
    if( fields ){
        list = list.sort((a,b)=>{
        let va = props.cardSort === "title" ? a.title : a.referenceParameters[props.cardSort]
        let vb = props.cardSort === "title" ? b.title : b.referenceParameters[props.cardSort]
        if( va && vb ){
            return va.localeCompare(vb)
        }
        })
    }
    const resultCategory = category ? MainStore().category(category.resultCategoryId) : undefined

    const hasButton = props.createButton

    return (<>
    {hasButton && <div className="w-full p-2 flex h-12 space-x-2 sticky top-0 z-20 bg-white">
        {resultCategory && props.createButton && <Panel.MenuButton title='Create new' action={()=>props.createButton(resultCategory)}/>}
        <p>{list.length} items</p>
    </div>}
    <div 
        className={
            [`gap-3 space-y-3 no-break-children `,
            props.className,
            props.columnClass].join(" ")
        }>
        {list.map((p,idx)=>{
            return (
                <motion.div 
                    key={p.plainId}
                    layoutId={p.plainId} onDoubleClick={props.onDoubleClick ? (e)=>props.onDoubleClick(e,p,list,idx) : undefined}
                >
                <PrimitiveCard 
                    key={p.id}
                    compact={true} primitive={p} 
                    onClick={props.cardClick ? (e)=>props.cardClick(e,p,list,idx) : undefined}
                    onEnter={props.onEnter ? (e)=>props.onEnter(e,p,list,idx) : undefined}
                    className={`h-full select-none flex flex-col justify-between ${props.selectedItem && props.selectedItem.id === p.id ? "bg-white opacity-50 blur-50" : ""}`}
                    fields={fields} 
                    border={true} 
                    enableHero={true}
                    showExpand={true}
                    showState={true} 
                    showAsSecondary={true}
                    showEvidence="compact"
                    relationships={category.relationships} 
                    relationship={primitive.primitives.relationships(p.id, ["results", category.id])}/>
                </motion.div>
            )}
        )}
    </div></>)
}