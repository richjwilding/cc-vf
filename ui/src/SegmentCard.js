import { PrimitiveCard} from "./PrimitiveCard";
import { BoltIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import useDataEvent from "./CustomHook";
import CardGrid from "./CardGrid";
import { roundCurrency } from "./SharedTransforms";
import MainStore from "./MainStore";


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
            const mytime = (dateString) =>{
                let out = new Date(dateString).getTime()
                if( isNaN(out)){

                    
                    const year = parseInt(dateString.substr(0, 4), 10);
                    const month = parseInt(dateString.substr(4, 2), 10) - 1;
                    const day = parseInt(dateString.substr(6, 2), 10);
                    const hours = parseInt(dateString.substr(9, 2), 10);
                    const minutes = parseInt(dateString.substr(11, 2), 10);
                    const seconds = parseInt(dateString.substr(13, 2), 10);
                    out =  new Date(Date.UTC(year, month, day, hours, minutes, seconds)).getTime()
                }
                return out

            }

            if( Array.isArray(out) ){
                out = out.map((d)=>d && mytime(d))
            }else{
                out = out && mytime(out)
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

export default function SegmentCard({primitive, showAll, setShowAll, ...props}){
    useDataEvent("set_parameter set_field relationship_update", [primitive.id, primitive.primitives.uniqueAllIds].flat())
//    const [showAll, setShowAll] = useState(false)


    const ring = !props.disableHover

    let primitiveKeys =  Object.keys(primitive.primitives)
    let nestedItems
    if(primitiveKeys.length === 1 && primitiveKeys[0]==="imports"){
        nestedItems = primitive.itemsForProcessing
    }else{
        nestedItems = props.directOnly ? primitive.primitives.ref.allItems : primitive.nestedItems
    }

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

    const visibleList = showAll ? nestedItems : nestedItems.slice(0,itemLimit)
    let columns
    
    if( props.columns !== undefined ){
        columns = 1
        if( typeof(props.columns) === "number" ){
            columns = props.columns 
        }else{
            columns = props.columns.default ?? 1
            const visibleCount = visibleList.length
            for(const min of Object.keys(props.columns) ){
                if( parseInt(min) < visibleCount ){
                    columns = props.columns[min]
                }
            }
        }
    }else{
        columns = props.cardView ? Math.max(itemLimit ? 2 : 1, (1 + (Math.floor(Math.sqrt(itemLimit) / 3))))  : (wide ? 10 : 5)
    } 

    const summaryItems = (Object.keys(primitive.metadata?.parameters) ?? []).map(d=>(primitive.metadata?.parameters[d].inSummary ? {key: d, ...primitive.metadata?.parameters[d]} : undefined)).filter(Boolean)

    const mainContent = <>
            <p key='title' className={`${props.hideDetails ? "text-xl font-light mb-4" : props.cardView ? "text-xl font-semi m-2 mb-1" : "text-sm font-semi mb-2"} text-gray-800  `}>{primitive.title}</p>
            {!props.hideDetails && <p key='description' className={props.cardView ? 'text-lg text-gray-600 m-2 mb-3' : 'text-xs text-gray-600 mb-2'}>{primitive.referenceParameters.description}</p>}
            {props.showGrid  && <div style={{gridTemplateColumns: `repeat(${columns}, minmax(min-content, 1fr))`}} className={`grid place-items-center gap-1`}>
                {visibleList.map((d)=>(
                    <PrimitiveCard.MatrixItem
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
                        style={{
                            minWidth: props.minWidth  ? props.minWidth : undefined
                        }}
                        onClick={props.onInnerCardClick ? (e,p)=>{e.stopPropagation(); props.onInnerCardClick(e, p, primitive)} : undefined}
                        />
                ))}
            </div>}
            {props.showList && <CardGrid 
                list={visibleList}
                columns={columns}
                onCardClick={props.onInnerCardClick ? (e,p)=>{e.stopPropagation(); props.onInnerCardClick(e, p, primitive)} : undefined}
                cardProps={
                    {
                        fullId: true,
                        micro:true,
                        fields: props.cardView ? ["title", "important","top"] : undefined
                    }
                }
                className='grow'
            />}
            {!props.hideMore && (props.showList || props.showGrid) && !showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`+ ${moreToShow} items`} onClick={()=>setShowAll(true)}/>}
            {!props.hideMore && (props.showList || props.showGrid) && showAll && moreToShow > 0 && <Panel.MenuButton small className='ml-2 mb-4 mt-1' title={`Show less`} onClick={()=>setShowAll(false)}/>}
            {props.showSummary &&
                <div 
                    className="mb-2">
                        {summaryItems.map((d)=>{
                            let out = [<p className='text-gray-500 uppercase mt-4 mb-2 text-sm'>{d.title}:</p>]
                            if( d.type === 'list'){
                                let items = [primitive.referenceParameters?.[d.key]].flat()
                                out.push(<ol className='list-decimal'>{
                                        items.map(d=>(
                                            <li className="text-gray-700 italic ml-6 my-1.5">{d}</li>
                                        ))
                                    }
                                </ol>)
                            }else{
                                out.push(<p className={`flex place-items-start ${d.inSummary?.main ? "text-lg text-gray-900 " : "text-gray-600 "}`}>
                                            {primitive.referenceParameters?.[d.key]}
                                        </p>)
                            }
                            return out
                        })}
                        <p className="text-gray-500 text-sm my-3">{nestedItems.length} {nestedItems[0]?.metadata?.plural ?? (nestedItems[0]?.metadata?.title ??  "item") + "s"}</p>
                </div>
            }
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
    if( props.cardView || props.minWidth){
        width = (2 + (columns * (1 + (props.columnWidth ?? parseInt(props.minWidth) ?? 16)))) + "rem"
    }else if( props.fixedWidth ){
        width = props.fixedWidth
    }
    if( props.graph ){
        width = '36rem'
    }

    const detailsAlloc = props.details ? props.details.length * 20 : 0

    return (
        <>
        <div 
            id={primitive.id}
            key={primitive.id}
            onClick={props.onClick ? (e)=>props.onClick(e,primitive) : undefined }
            style={{
                minWidth: width,
                gridColumn: props.spanColumns ? `span ${parseInt(props.spanColumns)}` : undefined,
                gridRow: props.spanRows ? `span ${parseInt(props.spanRows)}` : undefined,
            }}
            className={
                ["relative py-3 pl-3 pr-4 group bg-white p-1 rounded-lg",
                "flex flex-col",
                    props.flatBorder ? '' : 'rounded-lg',
                    ring ? `focus:ring-2 focus:outline-none hover:ring-1 hover:ring-ccgreen-300 ${props.dragShadow ? "" : "hover:subtle-shadow-bottom"}` : '',
                    "shadow ",
                    props.className
                ].join(" ")}
            >
            {mainContent}
            {props.overlay && <div className="absolute top-0 left-0 w-full h-full backdrop-blur-sm bg-gray-50/90 rounded-lg" style={{containerType:"size"}}>
                <p style={{fontSize: `min(${(100 - detailsAlloc) * 0.6}, 6cqw)`}} className="px-2 py-1 font-semi text-gray-500">{nestedItems.length} {nestedTypes}</p>
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
                            return <p style={{fontSize: `min(20cqh, 10cqw)`}} className="px-2 py-1 font-bold">{formatted}</p>
                        }
                        return <></>
                    })
                }
                <p style={{fontSize: `min(${(100 - detailsAlloc) * 0.4}cqh, 5cqw)`}} className="px-2 py-1 font-light text-gray-500">{primitive.title}</p>

            </div> }
            <p key='footer' className='text-xs text-gray-400 grow flex place-items-end'>#{primitive.plainId}</p>
        </div>
    </>
    )
}