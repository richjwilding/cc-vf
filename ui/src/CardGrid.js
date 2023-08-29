import { motion } from "framer-motion"
import { PrimitiveCard } from "./PrimitiveCard"
import Panel from "./Panel"
import MainStore from "./MainStore"
import { useContainerQueries } from 'use-container-queries';
import { useMemo } from "react";

const allBreakpoints = {
    "xs": 320,
    "sm": 384,
    "md": 448,
    "lg": 512,
    "xl": 576,
    "2xl": 672,
    "3xl": 768,
    "4xl": 896,
    "5xl": 1024,
    "6xl": 1152,
    "7xl": 1280,
    "9xl": 1520,
    "11xl": 1920,
};
const defaultColumnMap = {
    "md": 2,
    "xl": 3,
    "2xl": 4,
}

export default function CardGrid({primitive, category, list, categoryConfig, fields, ...props}){

    const breakpoints = useMemo(()=>{
        let last = 1
        let lastBp = 0
        let columnMap = props.columnConfig || defaultColumnMap
        const out = Object.keys(columnMap).reduce((o,a,idx)=>{
            const bp = allBreakpoints[a]

            o[last] = [lastBp, bp - 1]
            
            last = columnMap[a]
            lastBp = bp
            return o
        }, {}) 
        out[last] = [lastBp]
        return out
    },[])

    
    const { ref, active, width } = useContainerQueries({breakpoints});

    const hasButton = props.createButton
    if( hasButton && category === undefined ){
        if( primitive.metadata.resultCategories ){
            category = primitive.metadata?.resultCategories[0]
        }else{
            return <></>
        }
    }        
    
    console.log(fields)
    
    if( fields === undefined ){
        let cardConfig = category?.views?.options?.["cards"] || undefined //{fields: ["title"]}
        fields = cardConfig?.fields
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
    console.log(fields)

    if( props.pageItems ){
        const start = props.pageItems * (props.page || 0)
        list = list.slice(start, start + props.pageItems )
    }

    const resultCategory = category ? MainStore().category(category.resultCategoryId) : undefined

    const columnCount = parseInt(active)
    const columns = list.reduce((o, d, idx)=>{o[idx% columnCount]=o[idx% columnCount] || [];o[idx% columnCount].push(d);return o},[])

    return (<>
    {hasButton && <div className="w-full p-2 flex h-12 space-x-2 sticky top-0 z-20 bg-white">
        {resultCategory && props.createButton && <Panel.MenuButton title='Create new' action={()=>props.createButton(resultCategory)}/>}
        <p>{list.length} items</p>
    </div>}
    <div 
        ref={ref}
            style={{gridTemplateColumns: `repeat(${columnCount}, calc(${100 / columnCount}% - ${(0.75 * (columnCount - 1) / columnCount)}rem))`}}
            className={`grid gap-3 ${props.className}`}
        >
        {
            columns.map((_, column)=>{
                return (
                    <div className="flex flex-grow flex-col gap-3">
                        {
                columns[column].map((p,idx)=>{
                    return (
                        <div 
                            key={p.plainId}
                            onDoubleClick={props.onDoubleClick ? (e)=>props.onDoubleClick(e,p,list,idx) : undefined}
                        >
                        <PrimitiveCard 
                            key={p.id}
                            compact={true} primitive={p} 
                            onClick={props.onCardClick ? (e,p)=>props.onCardClick(e,p) : undefined}
                            onInnerCardClick ={ props.onInnerCardClick !== undefined ? props.onInnerCardClick : props.onCardClick ? props.onCardClick : undefined}
                            onEnter={props.onEnter ? (e)=>props.onEnter(p) : undefined}
                            //className={`h-full select-none flex justify-between ${props.selectedItem && props.selectedItem.id === p.id ? "bg-white opacity-50 blur-50" : ""}`}
                            fields={fields} 
                            border={true} 
                            showDetails={props.showDetails}
                            enableHero={true}
                            showExpand={true}
                            showState={true} 
                            showAsSecondary={true}
                            imageOnly={props.imageOnly}
                            showEvidence="compact"
                            relationships={category?.relationships} 
                            relationship={category ? primitive.primitives.relationships(p.id, ["results", category.id]) : undefined}
                            {...(props.cardProps || {})}
                            />
                        </div>
                    )})}
                    </div>)
            })
        }
    </div></>)
}