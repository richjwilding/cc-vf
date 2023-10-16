import { useMemo, useReducer, useRef, useState } from "react";
import { PrimitiveCard} from "./PrimitiveCard";
import { BoltIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import useDataEvent from "./CustomHook";
import CardGrid from "./CardGrid";
import { roundCurrency } from "./RenderHelpers";
import { ReactECharts } from "./React-ECharts";
import { graphic } from "echarts";
import MainStore from "./MainStore";
import { renderToString } from 'react-dom/server';


    export function projectData(d, root, log, roundStats = []){
        let out
        if( root === undefined){return undefined}
        if( root.parameter ){
            let parts = root.parameter.split('.')
            let node = d?.referenceParameters
            let sublist
            for( const part of parts ){
                if( node && part[0] === "[" && Array.isArray(node)){
                    if(part.length === 2){
                    }else{

                        const idx = parseInt(part.slice(1,-1))
                        
                        if( idx < 0 ){
                            node = node[node.length + idx]
                        }
                        else{
                            node = node[idx]
                        }
                    }
                }else{
                    if( node ){
                        if(Array.isArray(node)){
                            node = node.map((d)=>{
                                let value = d[part]
                                let sort = d[root.sort || part]
                                if( root.formatter === "datetime"){
                                    value = value && new Date(value)
                                }
                                if( root.sort_formatter === "datetime" || (!root.sort && root.formatter === "datetime")){
                                    sort = sort && new Date(sort)

                                }
                                return [value, sort]
                            }).sort((a,b)=>b[1]-a[1])
                            node = node.map((d)=>d[0])

                        }else{
                            node = node[part]
                        }
                    }
                }
            }
            out = node
            if( root.match ){
                out = d.referenceParameters?.[root.match.collection]?.filter((d)=>d[root.match.key || "id"] === out).map((d)=>[d[root.match.parameter],d[root.match.xzSort ?? root.match.parameter]])
                out = out.sort((a,b)=>b[1]-a[1]).map((d)=>d[0])
            }
            if( root.delta ){
                if( root.delta ){
                    const group = projectData(d, root.delta )
                    let groupItem = roundStats.findIndex((d)=>d[root.delta.key ?? "title"] === group)
                    if( root.delta.offset ){
                        groupItem += root.delta.offset
                    }
                    const value  = roundStats[groupItem]?.[root.delta.groupField]
                    if( value === undefined){
                        out = null
                    }else{
                        if( !isNaN(value)){
                            if( Array.isArray(out)){
                                out = out.map((d)=>d - value) 
                            }else{
                                out -= value
                            }
                        }
                    }
                }                
            }
        }else if(root.action === "count"){
            return 1
        }else{
            if( root.field === 'title' && d.type === "entity"){
                out = d.id + "|" + d?.[root.field]

            }else{
                out = d?.[root.field]
            }
        }
        if( log ){
            if( Array.isArray(out) ){
                out = out.map((d)=> d === 0 ? null : d)
            }else{
                out = out === 0 ? null : out
            }
        }
        if( root.formatter === "datetime"){
            if( Array.isArray(out) ){
                out = out.map((d)=>d && new Date(d).getTime())
            }else{
                out = out && new Date(out).getTime()
            }
        }
        if( root.invert ){
            if( Array.isArray(out) ){
                out = out.map((d)=>-d)
            }else{
                out = -out
            }

        }
        return out
    }
export function itemsForGraph( pivot, items ){
    if( pivot ){
        console.log(`Had ${items.length} before pivot`)
        if(pivot === "origin"){
            items = items.map((d)=>d.origin).filter((d, i, a)=>a.findIndex((d2)=>d2.id === d.id) === i)
            
        }
        console.log(`Now ${items.length}`)
    }
    return items
}
function SegmentGraph({primitive, ...props}){
    const items = useMemo(()=>{
        return itemsForGraph(props.pivot, props.items)
    }, [primitive, props["x-axis"],props["y-axis"], props["z-axis"], props.log])

    const imgSize = props.mode === "xy" ? 30 : 20
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const myScale = useRef({})
    const roundStats = useMemo(()=>{
        const roundOrder =[
                "Angel Round",
                "Pre Seed Round",
                "Seed Round",
                "Series A",
                "Series B",
                "Series C",
                "Series D",
                "Series E"]

        const fullRoundList = items.map((d)=>d?.referenceParameters?.fundingRounds).flat().filter((d,i,a)=>a.indexOf(d)===i).sort((a,b)=>roundOrder.indexOf(a)-roundOrder.indexOf(b))
        const out = fullRoundList.map((round)=>{
            const subList = items.filter((d)=>d.referenceParameters?.fundingRoundInfo?.find((d)=>d.title === round))
            const investments = subList.map((d)=>d.referenceParameters.fundingRoundInfo?.filter((d)=>d.title === round).map((d)=>d.amount)).flat().filter((d)=>d)
            const days = subList.map((d)=>d.referenceParameters.fundingRoundInfo?.filter((d)=>d.title === round).map((d)=>d.timeSinceFounded)).flat().filter((d)=>d)

            return {
                title: round,
                valid: subList.length > 0,
                count: subList.length,
                max_funding: Math.max(...investments),
                min_funding: Math.min(...investments),
                avg_funding: investments.reduce((a,c)=>a+c, 0) / investments.length,
                funding_count: investments.length,
                days_count: days.length,
                min_days:  Math.min(...days),
                max_days:  Math.max(...days),
                avg_days:  days.reduce((a,c)=>a+c, 0) / days.length,
            }
        })
        return out
    }, [primitive, props["x-axis"],props["y-axis"], props["z-axis"], props.log])

    myScale.current.scale = props.parentScale
    let list = items
    if( props.filters ){
        for(const filter of props.filters){
            list = list.filter((d)=>{
                const value = projectData(d, filter, props.log, roundStats)
                return filter.values.includes(value)
            })
        }
    }
    const axisFormatter = {
        "currency" : function(value){
            return roundCurrency(value)
        },
        "datetime" : function(value){
            return new Date(value)
        },
        "days" : function(value){
            return Math.round( value / 86400000 ) + "d"
        }
    }

    const getScale = ()=>{
        console.log(`fetched here ${props.parentScale}`)
        return props.parentScale
    }


    const option = useMemo(()=>{
        forceUpdate()

        const imgHash = items.reduce((o,d)=>{
            o[d.id] = {
                height: imgSize,
                width: imgSize,
                backgroundColor: {image: `/api/image/${d.id}`}
            }
            return o
        },{})  
        
        if( props.mode === "timeline" ){
            const data = list.map((d)=>{
                let x = projectData( d, props["x-axis"], props.log, roundStats)
                if( Array.isArray(x)){
                    x = x.sort((a,b)=>a-b)
                }
                return {
                    d: d,
                    x: x,
                    y: projectData( d, props["y-axis"], props.log, roundStats)
                }
            })

            const fullTimeStamps = data.map((d)=>d.x).flat().map((d)=>parseInt(d)).filter((c,i,a)=>a.indexOf(c)===i).sort((a,b)=>a-b)
            const ys = data.map((d)=>{
                const out = fullTimeStamps.map((target)=>{
                    if( Array.isArray(d.x)){

                        const closestIdx = d.x?.findIndex((d2) => d2 === target) 
                        if( closestIdx === undefined || closestIdx === -1 ){
                            return 0
                        }else{
                            return d.y[closestIdx] ?? 0
                        }
                    }else{
                        return target === d.x ? d.y : 0
                    }
                })
                return out.map((d,i,a)=>a.reduce((c,a,i2)=>i2 > i ? c : c + a,0))
            })
            const agg = fullTimeStamps.map((d,i)=>{
                const value = ys.map((d)=>d[i]).reduce((a,c)=>a+c,0)
                const items = data.filter((d2)=>Array.isArray(d2.x) ? d2.x.includes(d) : d2.x === d).map((d2)=>d2.d.id)
                return {x: d, y: value, items: items}
            })


            return {
                dataset:{
                    source: agg
                } ,           
                dataZoom: [
                    {
                        id: 'dataZoomX',
                        type: 'slider',
                        xAxisIndex: [0],
                        filterMode: 'filter'
                    }
                ],
                grid: {
                    top: 20,
                    bottom: 90,
                    left: "50",
                    right: "0",
                },
                yAxis: {
                    type: "value",
                    axisLabel: {
                        fontSize:12,
                       // show:false,
                        formatter: axisFormatter[props["y-axis"].formatter]
                    }
                },
                xAxis: {
                    type: "time",
                    max: new Date(),
                    min: props['x-axis'].minimum,
                    axisLabel: {
                        fontSize:12,
                       // show:false
                    }
                    

                },
                tooltip: {
                    trigger: 'item',
                    triggerOn:'click',
                    appendToBody:true,
                  //  confine: true,
                    position:"top",
                    position:  function (point, params, dom, rect, size) {
                        const scale =  myScale.current.scale
                        let px = point[0], py = point[1]
                        py -= size.contentSize[1] / scale + 10
                        px -= size.contentSize[0] / scale / 2 
                        return [px,py]
                    },
                    //extraCssText:"background:transparent;border:none;box-shadow:none",
                    //extraCssText:'pointer-events:all',
                    enterable:true,
                    alwaysShowContent: true,
                    formatter: function (params) {
                        const cards = params.data.items?.map((id)=><PrimitiveCard onClick={()=>{console.log(id);MainStore().sidebarSelect(id)}} className='max-w-[20rem]' border primitive={MainStore().primitive(id)}/>)
                        const count = cards.length
                        const cols = count >= 16 ? 4 : count >= 9 ? 3 : count >= 2 ? 2 : 1  
                      return renderToString(<div className="grid gap-2 whitespace-normal" style={{gridTemplateColumns: `repeat(${cols},1fr)`}}>{cards}</div>);
                    }
                  },
                series:[{
                    type: "line",
                    showSymbol: true,
                    encode:{x:'x',y:'y'},
                    color:"#22d3ee",
                    areaStyle: {
                        color: new graphic.LinearGradient(0, 0, 0, 1, [
                          {
                            offset: 0,
                            color: '#06b6d4'
                          },
                          {
                            offset: 1,
                            color: '#bfdbfe'
                          }])
                      }
                }],
            }
        }else if(props.mode === "xy"){
            let data = list.map((d)=>{
                return [
                    projectData( d, props["x-axis"], props.log, roundStats),
                     projectData( d, props["y-axis"], props.log, roundStats),
                     d.id,
                     d.title
                ]
            })

            data = data.filter((d)=>d[1] > 100000)
            data = data.map((d)=>[d[0], d[1] ? Math.log10(d[1]) : null, d[2], d[3]])
            

            let minX = data.map((d)=>d[0]).flat().reduce((a,c)=>(!a || c < a) ? c : a, undefined )
            let maxX = data.map((d)=>d[0]).flat().reduce((a,c)=>(!a || c > a) ? c : a, undefined )
            let maxY = data.map((d)=>d[1]).flat().reduce((a,c)=>(!a || c > a) ? c : a, undefined )
            let minY = data.map((d)=>d[1]).flat().reduce((a,c)=>(!a || c < a) ? c : a, undefined )
            maxY += (maxY - minY) / 400 * imgSize
            minY -= (maxY - minY) / 400 * imgSize
            minX -= (maxX - minX) / 500 * imgSize
            maxX += (maxX - minX) / 500 * imgSize

            const axisXMin = minX//Math.min(minX, -maxX)
            const axisXMax = maxX//Math.max(-minX, maxX)
            
            return {
                grid: {
                    top: 20,
                    bottom: 20,
                    left: "50",
                    right: "50",
                    show:true
                },
                yAxis: {
                    type: "value",
                    //type: props.log ? "log" : "value",
                    interval: (maxY - minY) / 3,
                    axisLine:{show:false},
                    axisTick:{show:false},
                    splitLine:{show:true},
                    logBase:10,
                    max:maxY,
                    min:minY,
                    axisLabel: {
                        show: true,
                        formatter: (d,i)=>{
                            return i === 0 ? "$" : i === 3 ? "$$$" : ""
                        }
                    }
                },
                xAxis: {
                    type: "value",
                    interval: (axisXMax - axisXMin) / 3,
                    axisLine:{show:false},
                    axisTick:{show:false},
                    splitLine:{show:true},
                    min: axisXMin,
                    max: axisXMax,
                    axisLabel: {
                        show:true,
                        formatter: (d,i)=>{
                            return i === 0 ? "Slower" : i === 3 ? "Faster" : ""
                        }
                    }
                },
                series:[{
                    type: "scatter",
                    showSymbol: true,
                    data:data,
                    encode:{
                        x:0,
                        y:1
                    },
                    label:{
                        show:true,
                        //position:'right',
                        line:"none",
                        color:'black',
                        opacity:1,
                        formatter: function (d) {
                            return `{${d.data[2]}|}`//${d.data[3]}`
                        },
                        rich: imgHash
                    }
                }],
            }

        }else{

            let data = list.map((d)=>{
    //        const group = projectData( d, props["y-axis"].sort)
            let stats, group
            if( props["x-axis"].delta ){
                const root = props["x-axis"]
                group = projectData(d, root.delta, props.log, roundStats)
                let groupItem = roundStats.findIndex((d)=>d[root.delta.key ?? "title"] === group)
                if( root.delta.offset ){
                    groupItem += root.delta.offset
                }
                stats  = roundStats[groupItem]
            }else{
                group = projectData( d, props["y-axis"].sort)
            }
            if( stats && !stats.valid){stats = undefined}
            const x = [projectData( d, props["x-axis"], props.log, roundStats)].flat().reduce((o, c, i)=>{o['x'+ i] = c; return o}, {})
            const y = [projectData( d, props["y-axis"], props.log, roundStats)].flat().reduce((o, c, i)=>{o['y'+ i] = c; return o}, {})
            const z = [projectData( d, props["z-axis"], props.log, roundStats)].flat().reduce((o, c, i)=>{o['z'+ i] = c; return o}, {})


            return {
                ...x,
                ...y,
                ...z,
                xCount: x.length,
                xSort: projectData( d, props["x-axis"].sort, props.log, roundStats),
                ySort: group,
                minDays: stats?.min_days - stats?.avg_days,
                maxDays: stats?.max_days - stats?.avg_days
            }
        }).sort((a,b)=>typeof(a.ySort) === "string" || typeof(b.ySort) === "string" ?  (a.ySort ?? "").localeCompare(b.ySort ?? "") : a.ySort - b.ySort)
            
        data = data.filter((d)=>d.x0 > 100000)
        
        const xs = data.map((d)=>Object.keys(d)).flat().filter((d)=>d.match(/x\d+/)).filter(((c,i,a)=>a.indexOf(c )=== i))
            data.forEach((d)=>{
                xs.forEach((x)=>{
                    d[x] = d[x] ?? null
                })
            })
            const xSeries = xs.map((d, idx)=>{
                return {
                    type: props.type ?? "bar",
                    encode: {
                        y: 'y0',   
                        x: d, 
                    },
                    lineStyle:{
                        width: 0
                    },
                    showSymbol: true,
                    color: "#3b82f6" ,
                    symbolSize: (s)=>{
                        const group = roundStats.find((d2)=>d2.title === s.ySort)
                        if( group ){
                            const range = group.max_funding - group.min_funding
                            const dp = s[`z` + idx]
                            if( dp === undefined | dp === null){
                                return 2
                            }
                            const size = (dp - group.min_funding) / range * 10
                            return 4 + size
                        }
                        return 4
                    },
                    label: idx == 0 ? {
                        show: true,
                        fontSize: 10,
                        formatter: (d2)=>d2.data[d] === undefined  ? "" : axisFormatter[props["x-axis"].formatter](d2.data[d]),
                        position: "right"
                    } : false
                }
            })

            return {
                dataset: {
                    source: data,
                },
                grid: {
                    top: 0,
                    bottom: 20,
                left: "200",
                right: "20",
                },
                xAxis: {
                    type: props.log ? "log" : "value",
                    max: (d)=>d.max * 1.1,
                    axisLabel: {
                        formatter: axisFormatter[props["x-axis"].formatter]
                    }
                },
                yAxis: {
                    type: "category",
                    axisLabel: {
                        interval:0,
                        margin:10,
                        fontSize:12,
                        lineHeight:25,
                        show: true,
                        formatter: function (value) {
                            return `{${value.split("|")[0]}|} ` + value.split("|")[1]
                        },
                        rich: imgHash
                        },
                },
                series: [
                    ...xSeries,
                {
                    type: "bar",
                    stack:"days",
                    encode: {
                        y: 'y0',   
                        x: 'minDays', 
                    },
                    itemStyle: {
                        color: 'transparent',
                        color: 'gray',
                        color: (d)=>d.data.x0 > d.data.minDays ? "green" : "grey",
                        opacity: 0.1
                    },
                    showSymbol: false,
                },
                {
                    type: "bar",
                    stack:"days",
                    encode: {
                        y: 'y0',   
                        x: 'maxDays', 
                    },
                    showSymbol: false,
                    itemStyle: {
                        color: 'gray',
                        color: (d)=>d.data.x0 > 0 ? "red" : "grey",
                        opacity: 0.1
                    }
                },
                ],
            }
        }
    }, [primitive, props["x-axis"],props["y-axis"], props["z-axis"], props.log])


    const height =  (props.mode === "timeline" || props.mode === "xy")  ? "400px" : (100 + (option?.dataset?.source?.length * 20)) + "px"
    console.log(primitive.plainId, list.length, option.series?.data?.length)


    const clickCallback = (e)=>{
        console.log('click', e.event.offsetX, e.event.offsetY)
    }
    
    return (
        <div style={{width: "100%", height: height}} className={props.className} >
            <ReactECharts option={option} update={update} clickCallback={clickCallback} renderer={!props.mode ? "canvas" : "canvas"} />
        </div>
    )
}

export default function SegmentCard({primitive, ...props}){
    useDataEvent("set_parameter set_field relationship_update", [primitive.id, primitive.primitives.uniqueAllIds].flat())
    const [showAll, setShowAll] = useState(false)
    const ring = !props.disableHover

    let nestedItems = props.directOnly ? primitive.primitives.ref.allItems : primitive.nestedItems

    if( props.details?.pivot){
        if(props.details.pivot === "origin"){
            nestedItems = MainStore().uniquePrimitives( nestedItems.map(d=>d.origin) )
        }
    }

    let nestedTypes = nestedItems.map((d)=>d.metadata?.plurals ?? (d.metadata?.title ? d.metadata?.title + "s" : undefined) ?? d.type).filter((v,i,a)=>a.indexOf(v)===i)

    let itemLimit = nestedItems.length
    if(props.itemLimit ){
        const flagged = (items)=>{
            const temp = items.sort((a,b)=>{
                const flaggedA = (a.referenceParameters?.top || a.referenceParameters?.important) ? 1 : 0
                const flaggedB = (b.referenceParameters?.top || b.referenceParameters?.important) ? 1 : 0
                return flaggedB - flaggedA
            })
            return [temp, temp.filter((d)=>d.referenceParameters?.top || d.referenceParameters?.important).length]
        }

        if( typeof(props.itemLimit) === "number"){
            itemLimit = props.itemLimit ?? 10 

        }else{
    
            let process = [props.itemLimit].flat()
            let finalCount = 1
            let finalSet = []
            for( const d of process ){
                let thisCount
                let thisSet
                console.log(`checking ${d}`)
                if( d === "flagged"){
                    [thisSet, thisCount] = flagged( nestedItems )
                }
                if( d.slice(0,7) === "recent_"){
                    thisCount = 10
                    thisSet = nestedItems.sort((a,b)=>b.plainId - a.plainId)//.slice(0,thisCount)

                }
                if( thisCount > 0 ){
                    finalCount = thisCount
                    finalSet = thisSet
                    break
                }
            }
            itemLimit = finalCount
            nestedItems = finalSet

        }
    } 
    const moreToShow = Math.max(0, nestedItems.length - itemLimit)
    const wide = !props.compact && props.showGrid && itemLimit > 10//0
    const columns = props.cardView ? Math.max(itemLimit ? 2 : 1, (1 + (Math.floor(Math.sqrt(itemLimit) / 3))))  : (wide ? 10 : 5)
    console.log(primitive.plainId, props.cardView, props.card, columns)

    const mainContent = <>
            <p key='title' className={`${props.hideDetails ? "text-xl font-light mb-4" : props.cardView ? "text-xl font-semi m-2 mb-1" : "text-sm font-semi mb-2"} text-gray-800  `}>{primitive.title}</p>
            {!props.hideDetails && <p key='description' className={props.cardView ? 'text-lg text-gray-600 m-2 mb-3' : 'text-xs text-gray-600 mb-2'}>{primitive.referenceParameters.description}</p>}
            {props.showGrid  && !itemLimit  && <div style={{gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`}} className={`grid place-items-center gap-1`}>
                {(showAll ? nestedItems : nestedItems.slice(0,itemLimit)).map((d)=>(
                    <PrimitiveCard 
                        fullId
                        primitive={d}
                        micro={!props.imageOnly}
                        hideMenu={props.imageOnly}
                        fixedSize={!props.imageOnly ? undefined : "3rem"}
                        imageOnly={props.imageOnly}
                        titleAtBase
                        fields={props.cardView ? ["title","important","top"] : undefined}
                        compact={props.hideDetails}
                        className={!props.imageOnly ? "min-w-[10rem]" : ""}
                        onClick={props.onInnerCardClick ? (e,p)=>{e.stopPropagation(); props.onInnerCardClick(e, p, primitive)} : undefined}
                        />
                ))}
            </div>}
            {props.showGrid && (itemLimit !== undefined) && <CardGrid 
                list={showAll ? nestedItems : nestedItems.slice(0,itemLimit)}
                columns={props.cardView ? columns : undefined}
                onCardClick={props.onInnerCardClick ? (e,p)=>{e.stopPropagation(); props.onInnerCardClick(e, p, primitive)} : undefined}
                cardProps={
                    {
                        fullId: true,
                        micro:true,
                        fields: props.cardView ? ["title", "important","top"] : undefined
                    }
                }
                columnConfig={{xs:2, md: 3,"2xl": 4, "4xl":5}}
                className='grow'
            />}
            {!props.hideMore && props.showGrid && !showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`+ ${moreToShow} items`} onClick={()=>setShowAll(true)}/>}
            {!props.hideMore && props.showGrid && showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`Show less`} onClick={()=>setShowAll(false)}/>}
            {props.showInsight && primitive.insights && primitive.insights.length > 0 &&
                <Panel title='Problems' titleClassName='text-xs w-fit flex text-gray-500 flex place-items-center font-medium' collapsable defaultOpen={false}>
                <div 
                    className="bg-gray-50 border border-gray-200 font-light p-2 py-4 rounded-md space-y-2 text-gray-600 text-xs mb-2">
                        {primitive.insights.map((insight)=>(
                            <div className="flex place-items-start">
                                <BoltIcon className="h-5 mt-1 mr-1 shrink-0" strokeWidth={1}/>
                                <p>{insight?.problem}</p>
                            </div>
                        ))}
                </div>
                </Panel>
            }
        </>

    let width = wide ? "48rem" : '24rem' 
    if( props.cardView ){
        width = (columns * 20) + "rem"
    }
    if( props.graph ){
        width = '36rem'
    }
    console.log(primitive.plainId, columns, width, props.cardView)

    return (
        <>
        <div 
            id={primitive.id}
            key={primitive.id}
            onClick={props.onClick ? (e)=>props.onClick(e,primitive) : undefined }
            style={{
                minWidth: width,
                gridColumn: props.cardView ? `span ${columns}` : undefined,
            }}
            className={
                ["relative py-3 pl-3 pr-4 group bg-white p-1 rounded-lg",
                "flex flex-col",
                    props.overlay ? "@container" : "",
                    props.flatBorder ? '' : 'rounded-lg',
                    ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-${props.ringColor || 'slate'}-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
                    "shadow ",
                    width,
                    props.className
                ].join(" ")}
            >
            {mainContent}
            {props.overlay && <div className="absolute top-0 left-0 w-full h-full backdrop-blur-sm bg-gray-50/90 rounded-lg  ">
                <p style={{fontSize: "min(24cqh, 6cqw)"}} className="px-2 py-1 font-semi text-gray-500">{nestedItems.length} {nestedTypes}</p>
                {
                    props.details && props.details.map((d)=>{
                        const items = nestedItems.map((d2)=>d.parameter ? d2.referenceParameters?.[d.parameter] : d2[d.field])
                        let value
                        if( d.action === "sum"){
                            value = items.reduce((a,c)=>a + (c||0),0)
                        }
                        if( value ){
                            let formatted = value
                            if( d.formatter === "currency"){
                                formatted = roundCurrency( value )
                            }
                            return <p style={{fontSize: "min(30cqh, 10cqw)"}} className="px-2 py-1 font-bold">{formatted}</p>
                        }
                        return <></>
                    })
                }
                <p style={{fontSize: "min(12cqh, 4cqw)"}} className="px-2 py-1 font-light text-gray-500">{primitive.title}</p>

            </div> }
            {props.graph && <div className="grow">
                <SegmentGraph 
                primitive={primitive}
                parentScale={props.scale}
                items={nestedItems} {...props.details} 
                />
            </div>}
            
            
            <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </div>
    </>
    )
}