import { useMemo, useState } from "react";
import { PrimitiveCard} from "./PrimitiveCard";
import { BoltIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import useDataEvent from "./CustomHook";
import CardGrid from "./CardGrid";
import { roundCurrency } from "./RenderHelpers";
import { ReactECharts } from "./React-ECharts";
import { graphic } from "echarts";


function SegmentGraph({primitive, items, ...props}){
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
        console.log(out)
        return out
    }, [primitive, props["x-axis"],props["y-axis"], props["z-axis"], props.log])

    const projectData = (d, root, forSort)=>{
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
        }
        else{
            if( root.field === 'title' && d.type === "entity"){
                out = d.id + "|" + d?.[root.field]

            }else{
                out = d?.[root.field]
            }
        }
        if( props.log && out === 0){
            return null
        }
        if( root.formatter === "datetime"){
            if( Array.isArray(out) ){
                out = out.map((d)=>d && new Date(d).getTime())
            }else{
                out = out && new Date(out).getTime()
            }
        }
        return out
    }
    let list = items
    if( props.filters ){
        for(const filter of props.filters){
            list = list.filter((d)=>{
                const value = projectData(d, filter)
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



    const option = useMemo(()=>{
        console.log("rebuild")
        if( true ){
            const data = list.map((d)=>{
                return {
                    d: d,
                    x: projectData( d, props["x-axis"])?.sort((a,b)=>a-b),
                    y: projectData( d, props["y-axis"])
                }
            })

            const fullTimeStamps = data.map((d)=>d.x).flat().map((d)=>parseInt(d)).filter((c,i,a)=>a.indexOf(c)===i).sort((a,b)=>a-b)
        //    fullTimeStamps.push( new Date().getSeconds() )
            const ys = data.map((d)=>{
                const out = fullTimeStamps.map((target)=>{
                    const closestIdx = d.x?.findIndex((d2) => d2 === target) 
                    if( closestIdx === undefined || closestIdx === -1 ){
                        return 0
                    }else{
                        return d.y[closestIdx] ?? 0
                    }

                })
                return out.map((d,i,a)=>a.reduce((c,a,i2)=>i2 > i ? c : c + a,0))
            })
            const agg = fullTimeStamps.map((d,i)=>{
                const value = ys.map((d)=>d[i]).reduce((a,c)=>a+c,0)
                return {x: d, y: value}
            })


            return {
                dataset:{
                    source: agg
                } ,           
                grid: {
                    top: 20,
                    bottom: 20,
                    left: "50",
                    right: "50",
                },
                yAxis: {
                    type: "value",
                    axisLabel: {
                        formatter: axisFormatter[props["y-axis"].formatter]
                    }
                },
                xAxis: {
                    type: "time",
                    max: new Date()
                },
                series:[{
                    type: "line",
                    showSymbol: false,
                    encode:{x:'x',y:'y'},
                    areaStyle: {
                        color: new graphic.LinearGradient(0, 0, 0, 1, [
                          {
                            offset: 0,
                            color: 'rgb(255, 158, 68)'
                          },
                          {
                            offset: 1,
                            color: 'rgb(255, 70, 131)'
                          }])
                      }
                }],
            }
        }else{
        const imgHash = items.reduce((o,d)=>{
            o[d.id] = {
                height:20,
                width:20,
                backgroundColor: {image: `http://localhost:3000/api/image/${d.id}`}
            }
            return o
        },{})  

        const data = list.map((d)=>{
    //        const group = projectData( d, props["y-axis"].sort)
            let stats, group
            if( props["x-axis"].delta ){
                const root = props["x-axis"]
                group = projectData(d, root.delta )
                let groupItem = roundStats.findIndex((d)=>d[root.delta.key ?? "title"] === group)
                if( root.delta.offset ){
                    groupItem += root.delta.offset
                }
                stats  = roundStats[groupItem]
            }else{
                group = projectData( d, props["y-axis"].sort)
            }
            if( stats && !stats.valid){stats = undefined}
            const x = [projectData( d, props["x-axis"])].flat().reduce((o, c, i)=>{o['x'+ i] = c; return o}, {})
            const y = [projectData( d, props["y-axis"])].flat().reduce((o, c, i)=>{o['y'+ i] = c; return o}, {})
            const z = [projectData( d, props["z-axis"])].flat().reduce((o, c, i)=>{o['z'+ i] = c; return o}, {})
            return {
                ...x,
                ...y,
                ...z,
                xCount: x.length,
                xSort: projectData( d, props["x-axis"].sort),
                ySort: group,
                minDays: stats?.min_days - stats?.avg_days,
                maxDays: stats?.max_days - stats?.avg_days
            }
        }).sort((a,b)=>typeof(a.ySort) === "string" || typeof(b.ySort) === "string" ?  (a.ySort ?? "").localeCompare(b.ySort ?? "") : a.ySort - b.ySort)
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
                    color: "blue" ,
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
    
    return (
        <div style={props.style} className={props.className}>
            <ReactECharts option={option} />
        </div>
    )
}

export default function SegmentCard({primitive, ...props}){
    useDataEvent("set_parameter set_field relationship_update", [primitive.id, primitive.primitives.uniqueAllIds].flat())
    const [showAll, setShowAll] = useState(false)
    const ring = !props.disableHover

    const nestedItems = props.directOnly ? primitive.primitives.ref.allItems : primitive.nestedItems
    let nestedTypes = nestedItems.map((d)=>d.metadata?.plurals ?? (d.metadata?.title ? d.metadata?.title + "s" : undefined) ?? d.type).filter((v,i,a)=>a.indexOf(v)===i)

    const itemLimit = props.itemLimit || (props.hideDetails  ? nestedItems.length : 10)
    const moreToShow = Math.max(0, nestedItems.length - itemLimit)
    const wide = itemLimit > 10//0

    const mainContent = <>
            <p key='title' className={`${props.hideDetails ? "text-xl font-light mb-4" : "text-sm font-semi mb-2"} text-gray-800  `}>{primitive.title}</p>
            {!props.hideDetails && <p key='description' className='text-xs text-gray-600 mb-2'>{primitive.referenceParameters.description}</p>}
            {props.showGrid  && props.hideDetails  && <div style={{gridTemplateColumns: `repeat(${wide ? 10 : 5}, minmax(0, 1fr))`}} className="grid place-items-center gap-1">
                {(showAll ? nestedItems : nestedItems.slice(0,itemLimit)).map((d)=>(
                    <PrimitiveCard 
                        primitive={d}
                        micro={!props.hideDetails}
                        hideMenu={props.hideDetails}
                        fixedSize={!props.hideDetails ? undefined : "3rem"}
                        imageOnly={props.hideDetails}
                        compact={props.hideDetails}
                        onClick={props.onInnerCardClick ? (e,p)=>{e.stopPropagation(); props.onInnerCardClick(e, p, primitive)} : undefined}
                        />
                ))}
            </div>}
            {props.showGrid && !props.hideDetails && <CardGrid 
                list={showAll ? nestedItems : nestedItems.slice(0,itemLimit)}
                onCardClick={props.onInnerCardClick ? (e,p)=>{e.stopPropagation(); props.onInnerCardClick(e, p, primitive)} : undefined}
                cardProps={
                    {micro:true}
                }
                columnConfig={{xs:2, md: 3}}
            />}
            {props.showGrid && !showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`+ ${moreToShow} items`} onClick={()=>setShowAll(true)}/>}
            {props.showGrid && showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`Show less`} onClick={()=>setShowAll(false)}/>}
            {primitive.insights && primitive.insights.length > 0 &&
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
            <p key='footer' className='text-xs text-gray-400'>#{primitive.plainId}</p>
        </>

    return (
        <>
        <div 
            key={primitive.id}
            onClick={props.onClick ? (e)=>props.onClick(e,primitive) : undefined }
            className={
                ["relative py-3 pl-3 pr-4 group bg-white p-1 rounded-lg",
                    props.overlay ? "@container" : "",
                    props.flatBorder ? '' : 'rounded-lg',
                    ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-${props.ringColor || 'slate'}-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
                    "shadow ",
                    !props.graph && wide ? 'min-w-[48rem]' : 'min-w-[24rem]',
                    props.graph  ? 'min-w-[36rem]' : '',
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
            {props.graph && <SegmentGraph 
                primitive={primitive}
                style={{height: (100 + (nestedItems.length * 2)) + "px"}}
                items={nestedItems} {...props.details} 
                />}
            
            
        </div>
    </>
    )
}