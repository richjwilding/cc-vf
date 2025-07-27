import moment from "moment"
import MainStore, { uniquePrimitives } from "./MainStore"
import Panel from "./Panel"
import PrimitiveConfig from "./PrimitiveConfig"
import UIHelper from "./UIHelper"
import { roundCurrency } from "./SharedTransforms"
import { Temporal } from "@js-temporal/polyfill"


class CollectionUtils{

    static convertToTimesSeries(set, config = {}){
       // if(!config.field){return []}
       let cumulative = config.cumulative

        let period = config.period ?? "month"
        let sourceData
        if( set?.length > 0 && set[0]?.type === "entity"){
            sourceData = set.map(d=>((config.dataset ? d.financialData?.[config.dataset] : d.referenceParameters?.allFundingRoundInfo) ?? []).map(d=>({date: d[config.dateField ?? "annouced"], amount: d[config.field ?? "amount"]}))).flat()
            if( !config.dataset && !config.dateField ){
                cumulative = true
            }
        }else{
            sourceData = set.map(d=>({date: new Date(d.referenceParameters?.posted), amount: 1}))
        }
        if( sourceData.length === 0){
            return []
        }
        if( config.endDate ){
            sourceData = sourceData.filter(d=>d.date <= config.endDate)
        }
        if( config.startDate ){
            sourceData = sourceData.filter(d=>d.date >= config.startDate)
        }
        let earliestDate = config.startDate ?  moment(config.startDate).startOf(period) : moment(sourceData.reduce((a,c)=>c.date < a.date ? c : a).date).startOf(period)

        let timeSeries = sourceData.map(d=>({period: moment(d.date).startOf(period).diff(earliestDate, period), amount: d.amount}))

        let maxPeriod = config.endDate ? moment(config.endDate).endOf(period).diff(earliestDate, period) : timeSeries.reduce((a, c) => c.period > a.period ? c : a)?.period
        console.log(maxPeriod)

        let values
        if (cumulative) {
            values = new Array(maxPeriod + 1).fill(0)
            for (const d of timeSeries) {
                values[d.period] += d.amount
            }
            values = values.reduce((acc, d, i) => {
                if (i === 0) {
                    acc.push(d)
                } else {
                    acc.push(d + acc[i - 1])
                }
                return acc
            }, [])
        } else {
            values = new Array(maxPeriod + 1).fill(undefined)
            for(const d of timeSeries){
                values[d.period] = (values[d.period] ?? 0) + d.amount
            }
        }
        return values
    }
    static viewConfigs( category ){
        let metaConfigs = category?.renderConfig?.explore?.configs 
        if( metaConfigs ){
            metaConfigs = metaConfigs.map(d=>{
                if( d.builtIn ){
                    return {
                        ...(PrimitiveConfig.renderConfigs[d.builtIn] ?? {}),
                        title: d.title,
                        id: d.id
                    }
                }
                return d
            })
            return metaConfigs
        }
        return Object.values(PrimitiveConfig.renderConfigs)
    }
    static updateAxisFilter(primitive, mode, filter, item, setAll, axisExtents, callback){
        console.log(item, mode, setAll)

        filter = filter || {}

        const encodeMap = axisExtents.reduce((a,item)=>{
            if(item.bucket_min !== undefined || item.bucket_max !== undefined ){
                a[item.idx] = {min_value: item.bucket_min, max_value: item.bucket_max, idx: item.idx}
            }else{
                if( item.idx === undefined){
                    a["_N_"] = null
                }else{
                    a[item.idx] = item.idx
                }
            }
            return a
        },{})

        const resolvedKey = item === undefined ? "_N_" : item

        if(setAll){
            if( item ){
                filter = encodeMap
            }else{
                filter = {}
            }
        }else{
            if( filter[resolvedKey] !== undefined){
                delete filter[resolvedKey]
            }else{
                filter[resolvedKey] = encodeMap[resolvedKey]
            }
        }
        

        let path = (mode === "column" || mode === "row") ? `referenceParameters.explore.axis.${mode}.filter` : `referenceParameters.explore.filters.${mode}.filter`

        //const keys = Object.keys(filter ?? {}).map(d=>d === "undefined" && (filter[undefined] !== undefined) ? undefined : filter[d] ).filter(d=>d)
        const keys = Object.keys(filter ?? {}).map(d=>d === "_N_" ? undefined : encodeMap[d])

        primitive.setField(path, keys)
        
        if( callback ){
            callback(filter)
        }
        
    }
    static getExploreFilters(primitive, axisOptions){
        const filters = primitive.referenceParameters?.explore?.filters
        return filters ? filters.map((filter,idx)=>({
            option: CollectionUtils.findAxisItem(primitive, idx, axisOptions), 
            id: idx, 
            track: filter.track,
            filter: PrimitiveConfig.decodeExploreFilter(filter?.filter) ?? [],
            rawFilter: filter?.filter ?? []
        })) : []
    }

    static buildFilterPane(sets, extentMap, options){
        let {mainstore, updateAxisFilter, deleteViewFilter} = options
        if( !mainstore ){
            mainstore = MainStore()
        }
        return sets.map(set=>{
            const axis = extentMap[set.selection]
            if(axis){
                return  <Panel title={set.title} noSpace 
                            deleteButton={
                                set.deleteIdx === undefined
                                    ? undefined
                                    : (e)=>{e.preventDefault();mainstore.promptDelete({message: "Remove filter?", handleDelete:()=>{deleteViewFilter(set.deleteIdx); return true}})}
                            }
                            collapsable>
                        <>
                        <div className='flex space-x-2 justify-end'>
                            <button
                                type="button"
                                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                onClick={()=>updateAxisFilter(false, set.mode, true, axis)}
                            >
                                Select all
                            </button>
                            <button
                                type="button"
                                className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                                onClick={()=>updateAxisFilter(true, set.mode, true, axis)}
                            >
                                Clear all
                            </button>
                        </div>
                        <div className='space-y-2 divide-y divide-gray-200 flex flex-col bg-gray-50 border border-gray-200 rounded-lg text-sm p-2 mt-2'>
                            {axis.map(d=>{
                                return (
                                <label
                                    className='flex place-items-center '>
                                    <input
                                    aria-describedby="comments-description"
                                    name="comments"
                                    type="checkbox"
                                    checked={!(set.list && set.list[d.idx === undefined ? "_N_" : d.idx] !== undefined)}
                                    onChange={()=>updateAxisFilter(d.idx, set.mode, false, axis)}
                                    className="accent-ccgreen-700"
                                />
                                    <p className={`p-2 ${set.list && set.list[d.idx] ? "text-gray-500" : ""}`}>{d.label}</p>
                                </label>
                                )})}
                        </div> 
                        </>
                    </Panel>
            }
        })

    }
    static axisToHierarchy(axisList, options = {}){
        const out = {}
        function findPath(node, path, d, route){
            if( path.length === 0 || (path.length === 1 && d.type === "type")){
                return node
            }
            node.nested ||= {}
            let next = path[0]
            const running = [...route, next]
            if( !node.nested[next] ){
                node.nested[next] = {path: running, parent: node}
            }
            return findPath( node.nested[next], path.slice(1), d, running)
        }
        for(const d of axisList){
            let node = out
            if( d.relationship ){
                node = findPath(node, d.relationship, d, [])
            }
            if( d.type !== "category"){
                node.category ||= d.category
            }
            node.items ||= []
            node.items.push(d)
        }
        return out
    }
    static axisFromCollection(items, primitive, options = {}){
        const mainstore = MainStore()
        let out = [{type: "none", title: "None", values: [""], order:[""], labels: ["None"]}]

        function findQueryAxis(p){
            if( p.type === "query"){
                if( p.metadata.type === "aggregator" || p.referenceParameters.useAxis || p.referenceParameters.segments){
                    return p
                }
            }
            const parent = p.primitives.imports.allItems[0]
            if( parent && (parent.type === "view" || parent.type === "query")){
                return findQueryAxis(parent)
            }
        }
        if( findQueryAxis(primitive)){
            const segments = uniquePrimitives(items.map(d=>d.findParentPrimitives({type: "segment", first:true})).flat())
            const filterLength = Math.max(0, ...segments.map(d=>d.referenceParameters?.importConfig?.[0].filters?.length))
            if( filterLength ){
                let segmentAxis = new Array(filterLength).fill().map((d,i)=>({id: i + 1, passType: "segment_filter", axis: i, type: "segment_filter", title: `By Segment axis ${i}`}))
                out = out.concat( segmentAxis)
            }else{
                out.push(
                    {id: 1, axis:0, passType: "segment_filter", type: "segment_filter", title: `By Segment axis`}
                )
            }
        }
        if( primitive.flowElement){
                out.push(
                    {id: out.length, passType: "title", type: "title", title: `Title`},
                )
        }
        const pins = primitive.inputPinsWithStatus
        if( pins.rowAxis?.connected ){
                out.push(
                    {axis:"row", passType: "pin", type: "pin", title: `Axis (Row) Pin`},
                )
        }
        if( pins.colAxis?.connected ){
                out.push(
                    {axis: "col", passType: "pin", type: "pin", title: `Axis (Col) Pin`},
                )
        }
        
        const viewPivot = options.viewPivot



        function findCategories( list, access = 0, relationship ){
            const catIds = {}
            for(const category of list){
                if( category.referenceId === 53){
                    catIds[category.id] = category.primitives.params.source?.allUniqueCategory?.[0] ?? undefined
                }else{
                    if( category.origin.type === "categorizer"){
                        const target = category.origin.flowElement ? category.origin : category.origin.configParent ?? category.origin
                        catIds[target.id] = target
                    }else{
                        catIds[category.id] = category
                    }
                }
            }
            return Object.values(catIds).map((d)=>{
                if( !d){
                    return
                }
                const options = d.primitives?.allUniqueCategory
                if( !options ){
                    return undefined
                }
                return {
                    type: "category",
                    primitiveId: d.id,
                    category: d,
                    isLive: d.referenceId === PrimitiveConfig.Constants["LIVE_FILTER"],
                    title: `Category: ${d.title}`,
                    allowMove: !relationship && access === 0 && (!viewPivot || (viewPivot.depth === 0 || viewPivot === 0)),
                    relationship: relationship, //d.referenceParameters.pivotBy ?? relationship,
                    access: access//d.referenceParameters?.pivot ?? access
                }
            }).filter(d=>d)
        }
        
        function getUniqueCategoryIds(list){
            const ts = new Set()
            list.forEach((d)=>{
                if( d.referenceId){
                    ts.add(d.referenceId)
                }
            })
            return Array.from(ts)
        }

        function txParameters(p, access, relationship ){
            let out = []

            const catIds = getUniqueCategoryIds( p )
            
            if( access === 1){
                out.push( {type: 'type', title: `Origin type`, relationship, access: access, values: catIds, order: catIds, labels: catIds.map(d=>mainstore.category(d)?.title ?? "Unknown"), passType: "origin_type"})

            }

            function process(parameters, category){
                function processParameter( param, parent, path = "" ){
                    if(!parent[param]){
                        return
                    }
                    let  parameter = path.length > 0 ? `${path}.${param}` : param
                    const type = parent[param].type

                    let paramConfig = {
                        type: 'parameter', 
                        parameter: parameter, 
                        parameterType: type, 
                        category, 
                        title: `${parent[param].title}`, 
                        relationship, 
                        access, 
                        passType: parent[param].axisType,
                        axisData: parent[param].axisType ? parent[param].axisData : undefined,
                    }
                    if( parent[param].asAxis === false){
                        return
                    }
                    else if( parent[param].excludeFromAggregation ){
                        return
                    }else if( type === "url" ){
                        return
                    }else if( type === "long_string" ){
                        return
                    }else if( type === "options" ){
                        out.push( {clamp: true, passType: "raw", ...paramConfig})
                    }else  if( type === "currency" ||  type === "number" ||  type === "funding"){
                        out.push( {passType: type, ...paramConfig})
                    }else if(  type === "contact"){
                        out.push( {...paramConfig, parameter: "contactId", passType: "contact"})
                    }else if(  type === "boolean"){
                        out.push( {...paramConfig, passType: "boolean"})
                    }else if(  type === "object"){
                        for(const d in parent[parameter]){
                            if( d === "type"){continue}
                            processParameter(d, parent[parameter], parameter )
                        }
                    }else{
                        out.push( {type: 'parameter', parameter: parameter, parameterType: type, category, title: `${parent[param].title}`, relationship, access: access, passType: "raw"})
                    }

                }

                if( parameters ){
                    for(const parameter of Object.keys(parameters)){
                        processParameter( parameter, parameters)
                    }
                }
            }

            if( p.some(d=>d.type === "summary")){
                const category = MainStore().category(109)
                out.push( {type: 'title', title: `Title`, category, relationship: relationship ?? [], access: access ?? 0, passType: "raw"})
                out.push( {type: 'primitive', title: `Item`, category, relationship: relationship ?? [], access: access ?? 0, passType: "primitive"})
            }

            catIds.forEach((id)=>{
                const category = MainStore().category(id)
                if( id=== 29){
                        out.push( {type: 'act_parent', title: `Activity parent`, category, relationship, access: access, passType: "raw"})
                }
                if( ["result","entity","evidence", "summary"].includes(category.primitiveType)){
                        out.push( {type: 'primitive', title: `${category.title} item`, category, relationship, access: access, passType: "primitive"})
                }
                if( category.primitiveType === "marketsegment"){
                        out.push( {type: 'title', title: `${category.title} Title`, category, relationship, access: access, passType: "indexed"})
                }else{
                    if( category.primitiveType === "entity" || category.primitiveType === "result" || category.primitiveType === "query" || category.primitiveType === "evidence" || category.primitiveType === "search" ){
                        out.push( {type: 'title', title: `${category.title} Title`, category, relationship, access: access, passType: "raw"})
                    }
                    if( category.primitiveType === "entity"){
                        out.push( {type: 'icon', title: `${category.title} Icon`, category, relationship, access: access, passType: "icon"})
                    }
                    if( category ){
                        process(category.parameters, category) //
                    }
                }
            })
            const checkList = new Set()
            const orignList = []

            for(const d of p){
                let oId = d.originId
                if( !checkList.has( oId) ){
                    checkList.add(oId)
                    if( d.origin?.childParameters ){
                        orignList.push(d.origin)
                    }
                }
            }

            //p.map((d)=>d?.origin.childParameters ? d.origin.id : undefined).filter((d,idx,a)=>d && a.indexOf(d)===idx).forEach((d)=>{
            orignList.forEach((d)=>{
                const o = mainstore.primitive(d)
                process(o.childParameters, o.metadata)
            })

            const tasks = uniquePrimitives(p.map(d=>d.task))
            const taskParams = tasks.map(d=>d.itemParameters ?? {}).reduce((a,c)=>{
                Object.keys(c).forEach((k)=>{
                    a[k] = {...(a[k] || {}), ...c[k]}
                })
                return a
            },{})
            if( Object.keys(taskParams).length > 0){
                p.forEach(d=>process(taskParams[d.referenceId], ""))
            }

            out = out.filter((d,i)=>out.findIndex(d2=>d2.type === d.type && d.title === d2.title && d.access === d2.access && mainstore.equalRelationships(d.relationship, d2.relationship) ) === i)

            const p1 = performance.now()
            const hasData = new Set()
            let hasTitle = false

            function expandObject(d, p = ""){
                for(const k of Object.keys(d)){
                    const v = d[k]
                    if(v){
                        if( typeof(v) === "object" && !Array.isArray(v)){
                            expandObject(v, p + k + ".")
                        }else{
                            hasData.add(p + k)
                        }
                    }
                }
            }
            for( const d of p){
                if( d.title ){
                    hasTitle = true
                }
                expandObject(d.referenceParameters ?? {})
            }

            const final = out.filter((filter)=>{
                if( filter.type === "parameter" ){
                   const r = hasData.has( filter.parameter)
                    return r
                }
                if( filter.type === "title" ){
                    return hasTitle
                }
                if( filter.type === "icon"  || filter.type === "type" || filter.type ==="act_parent" || filter.type ==="pin" || filter.type ==="primitive"){
                    return true
                }
                return false
            })
            return final
        }


        if( primitive ){
            const primitiveOrigin = primitive.origin
            const inheritedCategories = []
            const seenCats = new Set()
            for(const d of items){
                for(const p of d.parentPrimitives){
                    if( p.type === "category"){
                        for(const p2 of p.parentPrimitives){
                            if( p2.type === "category"){
                                if( !seenCats.has(p2.id)){
                                    seenCats.add(p2.id)
                                    inheritedCategories.push(p2)
                                }
                            }
                        }
                    }
                }
            }
            let baseCategories = uniquePrimitives([
                ...primitive.primitives.origin.allUniqueCategory, 
                ...primitive.findParentPrimitives({type:["view", "query","categorizer"]}).map(d=>d.primitives.origin.allUniqueCategory).flat(),
                ...primitiveOrigin?.type == "flow" ? primitiveOrigin.primitives.origin.allCategorizer.filter(d=>d.metadata?.mode === "assign") : [],
                ...primitiveOrigin?.type == "flowinstance" ? primitiveOrigin.origin.primitives.origin.allCategorizer.filter(d=>d.metadata?.mode === "assign") : [],
                ...inheritedCategories
                //...items.flatMap(d=>d.parentPrimitives.filter(d=>d.type === "category")).flatMap(d=>d.parentPrimitives.filter(d=>d.type === "category"))
                //...uniquePrimitives(items.flatMap(d=>d.parentPrimitives.filter(d=>d.type === "category"))).flatMap(d=>d.parentPrimitives.filter(d=>d.type === "category"))
                //...uniquePrimitives(items.map(d=>d.parentPrimitives.filter(d=>d.type === "category")).flat()).map(d=>d.parentPrimitives.filter(d=>d.type === "category")).flat()
            ])

            out = out.concat( findCategories( baseCategories ) )
        } 

        if( items ){
            out = out.concat( txParameters( items ) )
            
            const expandOrigin = (nodes, count = 0, relationshipChain = "origin_link_result")=>{
                const pl = [relationshipChain].flat().length
                let perf = performance.now()
                let out = []
                    const relForOrigin =  Array.isArray(relationshipChain) ? relationshipChain.slice(-1)[0] : relationshipChain
                    let origins = uniquePrimitives(nodes.flatMap((d)=>!d.isTask && d.relationshipAtLevel(relForOrigin,1)))

                    let path = [relationshipChain].flat()
                    let last = path.pop()
                    if( last === "auto"){
                        const rejectList = uniquePrimitives(nodes.flatMap((d)=>!d.isTask && d.relationshipAtLevel("origin_link_result",1))).map(d=>d.id)
                        const pre = origins.length
                        origins = origins.filter(d=>!rejectList.includes(d.id))

                    }
                    if( origins.length > 0){
                        //const referenceIds = origins.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i)
                        const referenceIds = getUniqueCategoryIds( origins )
                        for(const d of referenceIds){

                            const theseOrigins = origins.filter(d2=>d2.referenceId === d) 
                            
                            let cont = [...path,`${last}:${d}`]

                            let originCategories = uniquePrimitives(uniquePrimitives(origins.filter(d2=>d2.referenceId === d).map(d=>d.parentPrimitives.filter(d=>d.type === "category")).flat()).map(d=>d.parentPrimitives.filter(d=>d.type === "category")).flat())
                            out = out.concat( findCategories( originCategories, count + 1, cont ) )

                            out = out.concat( txParameters( theseOrigins, count + 1, cont ) )
                            out = out.concat( expandOrigin(theseOrigins, count + 1, [...cont, last]))
                            if( last !== "origin_link_result"){
                                out = out.concat( expandOrigin(theseOrigins, count + 1, [...cont, "origin_link_result"]) )
                            }
                        }
                    }
                    //const flowinstances = uniquePrimitives(nodes.map(d=>d.findParentPrimitives({type:"flowinstance"})).flat())
                    const flowinstances = uniquePrimitives(nodes.flatMap(d=>d.parentPrimitives)).filter(d=>d.type === "flowinstance")
                    if( flowinstances.length > 0 ){
                        out.push( {type: 'title', title: `Flow instance`,  category: flowinstances[0].metadata, passType: "title", access: count + 1, relationship: [...path, "origin"]})
                    }

                    const questions = uniquePrimitives(uniquePrimitives(nodes.map(d=>d.parentPrimitives).flat()).filter(d=>d.type === "prompt").map(d => d.origin))
                    if( questions.length > 0 ){

                        const prompts = questions.map(d=>d.primitives.allPrompt.map(d=>({idx: d.id, label: d.title})))
                        const values = questions.map(d=>({idx: d.id, label: d.title, map: d.primitives.allPrompt.map(d2=>d2.id) }))
                        
                        out.push( {type: 'question', subtype:"question", values, title: `Question`, category: questions[0].metadata, access: count, relationship: path, passType: "question"})
                        out.push( {type: 'question', subtype:"prompt", values, title: `Prompt`, category: questions[0].primitives.allPrompt[0]?.metadata, access: count, relationship: path, passType: "question"})
                    }
                    const search = uniquePrimitives(nodes.map(d=>d.parentPrimitives).flat()).filter(d=>d.type === "search" && d.metadata)
                    if( search.length > 0 ){
                        const byCat = search.reduce((a,d)=>{
                            a[d.metadata.id] ||= {items: [], category: d.metadata}
                            a[d.metadata.id].items.push( d )
                            return a
                        },{})
                        for(const d of Object.values(byCat)){
                            const values = d.items.map(d=>({idx: d.id, label: `Search #${d.plainId}`, map: [d.id, d.id]}))
                            out.push( {type: 'question', subtype:"search", values, title: `Source search`, access: count + 1, relationship: [...path, `origin_link_result:${d.category.id}`], passType: "question", category: d.category})
                        }
                    }


                    return out
            }
            if( !options.excludeOrigin ){
                out = out.concat( expandOrigin(items, 0, "origin_link_result") )
                //out = out.concat( expandOrigin(items, 0, "link") )
                out = out.concat( expandOrigin(items, 0, "auto") )
            }
        }
        const final = out.filter((d, idx, a)=>{
            if(d.type === "category"){
                return a.findIndex((d2)=>(d2.primitiveId === d.primitiveId) && (d.access === d2.access) && mainstore.equalRelationships(d.relationship, d2.relationship) ) === idx
            }
            if(d.subtype === "search"){
                return a.findIndex((d2)=>(d.access === d2.access) && mainstore.equalRelationships(d.relationship, d2.relationship)) === idx
            }
            if(d.subtype === "question"){
                return a.findIndex((d2)=>(d.access === d2.access) && mainstore.equalRelationships(d.relationship, d2.relationship)) === idx
            }
            return true
        })
        const labelled = final.map((d,idx)=>{return {id:idx, ...d}})
        return labelled
    }
    static axisExtents(interim, axis, field){
        const bucket = {
            "question":(field)=>{
                const mainstore = MainStore()
                let out = interim.map((d)=>d[field]).flat().filter((v,idx,a)=>a.indexOf(v)===idx).map(d=>{
                    const p = mainstore.primitive(d)
                    return {idx: p.id, label: p.title ?? ""}
                }).sort((a,b)=>a.label.localeCompare(b.label))
                console.log(out)
                return {values: [{idx: "_N_", label: "None"},...out]}
            },
            "segment_filter":(field)=>{
                const segments = uniquePrimitives(interim.map(d=>d.primitive.findParentPrimitives({type: "segment", first:true})).flat())

                const newRemap = {}
                const remap = {}
                let doRemap = true
                let mapped = segments.map(d=>{
                    const m =  axis.title?.match(/(\d+)/)

                    let filterConfig = d.referenceParameters?.importConfig?.[0]?.filters
                    const sourcePrimId = d.referenceParameters?.importConfig?.[0]?.id
                    if( filterConfig ){
                       filterConfig = filterConfig[axis.axis ?? 0]
                        
                        if( filterConfig){
                            if(filterConfig.type ==="parent"){
                                if( filterConfig.value){
                                    const segment = MainStore().primitive(filterConfig.value)
                                    let title = segment?.filterDescription ??  segment?.title  ?? "None"
                                    
                                    newRemap[title] ||= []
                                    newRemap[title] = filterConfig.value
                                    
                                    remap[d.id] = title
                                    return {idx: filterConfig.value, label: title, sourcePrimId: filterConfig.sourcePrimId ?? sourcePrimId}
                                }else{
                                    remap[d.id] = "None"
                                    return {idx: d.id, label: "None", sourcePrimId}
                                }
                            }else{
                                const value = filterConfig.value ?? "None"
                                remap[d.id] = value
                                if( !newRemap[value] ){
                                    newRemap[value] = d.id
                                }
                                return {idx: d.id, label: value, sourcePrimId: filterConfig.sourcePrimId ?? sourcePrimId}
                            }
                        }
                    }else{
                        doRemap = false
                        return {idx: d.id, primitive:d, label: d.title}
                    }
                })


                if( doRemap ){
                    interim.forEach(d=>{
                        d["original_" + field] = d[field]
                        if( Array.isArray(d[field])){
                            d[field] = d[field].map(df=>newRemap[remap[df]])
                        }else{
                            d[field] = newRemap[remap[d[field]]]
                        }
                    })
                }
                mapped = mapped.filter((d,i,a)=>d && a.findIndex(d2=>d2?.label === d?.label)===i).sort((a,b)=>{
                    const v1 =  (a?.label ?? "")
                    if( v1.localeCompare){
                        return v1?.localeCompare(b?.label ?? "")
                    }
                    return v1 - b?.label
                })
                return {values: mapped}
            },
            "indexed":(field)=>{
                let out = interim.map((d)=>d[field]).filter((v,idx,a)=>a.findIndex(d2=>d2.value === v.value)===idx).sort((a,b)=>a.order - b.order)
                interim.forEach(d=>{
                    d[field] = d[field].idx
                })
                return {values: out.map((d,i)=>({idx: d.idx, label: d.value === undefined ? "None" : d.value}))}
            },
            "pin":(field)=>{
                return {values: axis.pinData}
            },             
            "icon":(field)=>{
                let out = interim.map((d)=>d[field]).flat().filter((v,idx,a)=>a.indexOf(v)===idx)
                return {values: out.map((d,i)=>({idx: d, label: d === undefined ? "None" : MainStore().primitive(d)?.title ?? "Unknown"})).sort((a,b)=>a.label.localeCompare(b.label))}
            },
            "primitive":(field)=>{
                let out = interim.map((d)=>d.primitive).sort((a,b)=>(a.title ?? "None").localeCompare(b.title ?? "None"))
                return {values: out.map((d,i)=>({idx: d.id, primitive:d, label: d.title ?? "None"}))}
            },
            "raw":(field)=>{
                //let out = interim.map((d)=>d[field]).flat().filter((v,idx,a)=>a.indexOf(v)===idx).sort()
                let out = [...new Set(interim.flatMap((d)=>d[field]))].sort();
                const extents = {values: out.map((d,i)=>({idx: d, label: d === undefined ? "None" : d}))}
                if( axis.type === "parameter"){
                    const hasImage = interim[0]?.primitive?.metadata?.parameters?.[axis.parameter]?.image
                    if( hasImage ){
                        extents.values.forEach(extent=>{
                            const match = interim.find(d=>d[field] === extent.idx)
                            if( match?.primitive ){
                                extent.imageUrl = match.primitive.referenceParameters?.[hasImage]
                            }
                        })
                    }
                }
                return extents
            },
            "boolean":(field)=>{
                return {labels: ["True","False","Not specified"], order: [true, false , undefined], values: [
                    {idx: true, label: "True"},
                    {idx: false, label: "False"},
                    {idx: undefined, label: "Not specified"}
                ]}
            },
            "origin_type":(field)=>{
                //const categories = interim.map(d=>d.primitive.relationshipAtLevel(axis.relationship, axis.access).map(d=>d.referenceId)).flat().filter((d,i,a)=>d && a.indexOf(d) === i).map(d=>MainStore().category(d))
                const categories = interim.map(d=>d[field]).filter((d,i,a)=>d && a.indexOf(d) === i).map(d=>MainStore().category(d))
                console.log(categories)
                return {values: categories.map((d)=>({idx: d.id, label: d.title}))}
            },
            "contact":(field)=>{
                const contacts = interim.map(d=>d.primitive.origin?.referenceParameters?.contact).filter((d,i,a)=>d && a.findIndex(d2=>d2.id === d.id) === i)
                const labels = contacts.map(d=>d.name)
                const ids = contacts.map(d=>d.id)

                return {labels: labels, order: ids, values: ids.map((d,i)=>({idx: d, label: labels[i]}))}
            },
            "funding": (field)=>{
                const brackets = [0,100000,500000,1000000,5000000,15000000,50000000,100000000,200000000,500000000,1000000000,10000000000,100000000000]
                const labels = brackets.map((d,i,a)=>i === 0 ? "Unknown" : `${roundCurrency(a[i-1])} - ${roundCurrency(d)}`)
                const mins = brackets.map((d,i,a)=>i === 0 ? undefined : a[i-1])
                const max = brackets.map((d,i,a)=>d)
                interim.forEach((d)=>{
                    d[field] = labels[ brackets.filter((d2)=>d2 < d[field]).length ]
                })
                return {labels: labels, order: labels, values: labels.map((d,i)=>({idx: d, label: d, bucket_min: mins[i], bucket_max: max[i]}))}
            },
            "currency": (field)=>{
                const brackets = [0,100000,500000,1000000,5000000,15000000,50000000,100000000,200000000,500000000,1000000000,10000000000,100000000000]
                const labels = brackets.map((d,i,a)=>`${roundCurrency(i > 0 ? a[i-1] : 0)} - ${roundCurrency(d)}`)

                const mins = brackets.map((d,i,a)=>i === 0 ? 0 : a[i-1])
                const max = brackets.map((d,i,a)=>d)

                interim.forEach((d)=>{
                    d[field] = labels[brackets.filter((d2)=>d2 < d[field]).length]
                })
                //return {labels: labels, bucket_min: mins, bucket_max: max, order: labels, values: labels.map((d,i)=>({idx: d, label: d}))}
                return {labels: labels, order: labels, values: labels.map((d,i)=>({idx: d, label: d, bucket_min: mins[i], bucket_max: max[i]}))}
            },
            "number":(field)=>bucket["raw"](field),
            "__number": (field)=>{
                let bucketCount = 10
                //const hasValues = interim.filter(d=>d[field]).sort((a,b)=>a[field] - b[field])
                const noValues = interim.filter(d=>d[field] === undefined)
                const hasValues = interim.filter(d=>d[field] !== undefined).sort((a,b)=>a[field] - b[field])
                //const noValues = interim.filter(d=>d[field] === undefined || (Array.isArray(d[field]) && (d[field].length === 0 || (d[field].length === 1 && d[field][0] === undefined))))
                //const hasValues = interim.filter(d=>(d[field] === undefined) || (Array.isArray(d[field]) && d[field][0])).sort((a,b)=>a[field] - b[field])

                const totalItems = hasValues.length 
                const itemsPerBucket = Math.ceil(totalItems / bucketCount)
                
                let bucket = noValues.length === 0 ? 0 : 1, count = 0
                const mins = []
                const max = []
                const mapped =  {}

                if(noValues.length){
                    noValues.forEach(d=>{
                        mapped[d.primitive.id] = 0
                    })
                    mins[0] = null
                    max[0] = null
                    bucketCount += 1
                }


                let last = undefined
                hasValues.forEach(d=>{
                    if( count >= itemsPerBucket && last !== d[field]){
                        count = 0
                        bucket++
                    }
                    mapped[d.primitive.id] = bucket
                    if( count === 0){
                        mins[bucket ] = d[field]
                    }else{
                        max[bucket ] = d[field]
                    }
                    count++                    
                    last = d[field]
                })

                let labels =  new Array(bucket + 1).fill(0).map((_,i)=>(mins[i] === null) && (max[i] === null) ? "Unknown" : `${mins[i]} - ${max[i]}`)

                interim.forEach((d)=>{
                    d.old = d[field]
                    d[field] = labels[mapped[d.primitive.id]]
                })
                //return {labels: labels, bucket_min: mins, bucket_max: max, order: labels, values: labels.map((d,i)=>({idx: d, label: d}))}
                return {labels: labels, order: labels, values: labels.map((d,i)=>({idx: d, label: d, bucket_min: mins[i], bucket_max: max[i]}))}
            },
            "number_even": (field)=>{
                const bucketCount = 10
                const hasValues = interim.filter(d=>d[field])
                const maxValue = hasValues.reduce((a,c)=>c[field] > a ? c[field] : a, 0)
                const minValue = hasValues.reduce((a,c)=>c[field] < a ? c[field] : a, Infinity)
                const bucket = (maxValue - minValue) / bucketCount
                const mins = []
                const max = []
                let labels

                if( minValue === maxValue ){
                    mins[0] = minValue
                    max[0] = minValue
                    labels = [minValue]
                }else{
                    labels = new Array(bucketCount).fill(0).map((_,i)=>{
                        const start = minValue + (bucket * i)
                        mins[i] = start
                        max[i] = start + bucket - (i === (bucketCount - 1) ? 0 : 1)
                        return `${Math.floor(mins[i])} - ${Math.floor(max[i])}`
                    }) 
                }
                interim.forEach((d)=>{
                    d.old = d[field]
                    d[field] = isNaN(d[field]) ? undefined : labels.find((_,i)=>{
                        const v = d[field]
                        return v>= mins[i] && v <= max[i]
                    })
                })
                //return {labels: labels, bucket_min: mins, bucket_max: max, order: labels, values: labels.map((d,i)=>({idx: d, label: d}))}
                return {labels: labels, order: labels, values: labels.map((d,i)=>({idx: d, label: d, bucket_min: mins[i], bucket_max: max[i]}))}
            },
            "date": (field)=>{
                const mode = "year"//axis.axisData.dateOptions[0]

                function convert(date){
                    if( mode === "day"){
                        return date.year() + "-" + date.dayOfYear()
                    }else if( mode === "week"){
                        return date.format('YYYY-[W]WW');
                    }else if( mode === "month"){
                        return date.format('YYYY-MM');
                    }else if( mode === "year"){
                        return date.format('YYYY');
                    }
                }

                let minDate, maxDate
                for(const d of interim){
                    let dateValue
                    if( d[field]){
                        let date = moment(d[field])
                        if( !minDate || (date < minDate)){
                            minDate = date
                        }
                        if( !maxDate || (date > maxDate)){
                            maxDate = date
                        }
                        d["original_" + field] = d[field]
                        d[field] = convert(date)
                    }
                }
                if( maxDate && mode === "day"){
                    for(const d of interim){
                        let date = moment(d["original_" + field])
                        if( maxDate.diff(date, "d") > 30){
                            d[field] = undefined
                        }
                    }
                    if( maxDate.diff(minDate, "d") > 30){
                        minDate = maxDate.clone().subtract(30, "d");
                    }

                }
                if( minDate < moment("1995-01-01")){
                    minDate = moment("1995-01-01")
                }
                if( minDate && maxDate){
                    let bucketCount = maxDate.diff( minDate, mode) + 1
                    let buckets = new Array(bucketCount).fill(0).map((_,i)=>convert(minDate.clone().add(i, mode)))
                    console.log(bucketCount)
                    console.log(buckets)
                    return {values: buckets.map((d,i)=>({idx: d, label: d}))}
                }
                return {values: []}
            },
            "custom_bracket": (field)=>{
                const brackets = axis.axisData.buckets
                for(const d of interim){
                    const bracket = brackets.findIndex(b=>{
                        return (!b.min || d[field] >= b.min ) && (!b.lessThan || d[field] < b.lessThan )
                    })
                    d["original_" + field] = d[field]
                    d[field] = bracket === -1 ? "_N_" : bracket
                }
                return {values: [{idx: "_N_", label: "Unknown"}, ...brackets.map((d,i)=>({idx: i, bucket_min: d.min, bucket_max: d.lessThan, label: d.label}))]}
            }
        }
        bucket.string = bucket.raw

        let out 

        if( axis.type === "none"){
            out = {labels: axis.labels, values: [{idx: undefined, label: ""}], order: axis.order}
        }else if( axis.type === "category"){
            const catPrimitive = MainStore().primitive(axis.primitiveId)
            if( catPrimitive?.referenceId === PrimitiveConfig.Constants.EVAL_CATEGORIZER){
                out = {
                    values: ["not at all", "possibly", "likely", "clearly"].map(d=>({idx: d, label: d}))
                }
            }else{
                let subCats = catPrimitive?.primitives?.allUniqueCategory.map((d,i)=>({idx: d.id, primitive: d, label:d.title})) ?? []
                
                if( catPrimitive?.referenceId === PrimitiveConfig.Constants.EVALUATOR){
                    out = {
                        values: [{idx: "_N_", label: "None"}, ...subCats]
                    }
                }else{
                    out = {
                        values: [{idx: "_N_", label: "None"}, ...subCats]//.sort((a,b)=>a.label?.localeCompare(b.label)),
                    }
                }
            }
        }else{
            let parser = bucket[axis.passType]
            if( !parser ){
                console.warn(`Cant pass axis ${axis.passType}`)
                parser = bucket["raw"]
            }
            out = parser(field)
        }        

        const counts = {}

        for(const d of interim){
            counts[d[field]] = (counts[d[field]]  ?? 0) + 1
        }
        const preCount = {
            ...out,
            values: out.values.map(d=>({...d, idx: d.idx, count: counts[d.idx], label: Array.isArray( d.label ) ? d.label.join(", ") : d.label}))
        }
        return preCount
    }
    
    static renderDataTableAsCSV( tableData ){
        function escapeCsvCell(cell) {
            const str = String(cell);
            if (str.includes('"') || str.includes(',') || str.includes('\n')) {
                // Escape quotes by doubling them, then wrap in double quotes
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }

        let out = ""
        const includeRowHeader = tableData.rows.length > 1
        const includeColumnHeader = tableData.columns.length > 1
        if( includeColumnHeader){
            out += (includeRowHeader ? "," : "") + tableData.columns.map(d=>escapeCsvCell(d.label)).join(",") + "\n"
        }
        for(let rIdx = 0; rIdx < tableData.rows.length; rIdx++){
            out += (includeRowHeader ? `${escapeCsvCell(tableData.rows[rIdx].label)},` : "")
            for(let cIdx = 0; cIdx < tableData.columns.length; cIdx++){
                const id = `${cIdx}-${rIdx}`
                let cell = tableData.cells.find(d=>d.id === id)
                let cellData = cell?.count ?? "-"
                if( tableData.allocations){
                    for(const a of Object.entries(tableData.allocations)){
                        cellData += "\n" + `${a[1].title}:\n${"-".repeat(a[1].title.length)}\n`
                        cellData += cell.allocations[a[0]].map(d=>`${d.label}: ${d.count}`).join("\n")
                        //${cell.allocations[a[0]].items[a[1].idx]}`)
                    }
                }
                out += escapeCsvCell(cellData) + ","
            }
            out += "\n"
        }
        return out
    }
    static createDataTableForPrimitive(primitive, config, items){
        const primitiveConfig = primitive.getConfig
        items = items ?? primitive.itemsForProcessing
        const columns = this.primitiveAxis(primitive, "column", items)

        const rows = this.primitiveAxis(primitive, "row", items)
        let viewFilters = []
        if( true /*viewConfig.needsAllAllocations*/ ){
            viewFilters = primitiveConfig?.explore?.filters?.map((d2,i)=>CollectionUtils.primitiveAxis(primitive, i, items)) ?? []            
        }
        let hideNull = primitiveConfig?.explore?.hideNull

        return this.createDataTable( items, {columns, rows, viewFilters, config, hideNull, alreadyFiltered: true})

    }
    static createDataTable(items, {columns, rows, viewFilters, alreadyFiltered, hideNull, config= {}}){
        const mainstore = MainStore()
        let {data, extents} = CollectionUtils.mapCollectionByAxis( items, columns, rows, viewFilters, [], undefined )

        const filters = []

        if( columns?.filter?.length > 0){
            filters.push({field:"column", exclude: columns.filter})
        }
        if( rows?.filter?.length > 0){
            filters.push({field:"row", exclude: rows.filter})
        }
        viewFilters.forEach((d,i)=>{
            if( d.filter?.length > 0 ){
                filters.push({field: `filterGroup${i}`, exclude: d.filter})
            }
        })
        const {column: columnExtents, row: rowExtents, ...otherExtents} = extents
        const defs = {hideNull}
        if( columns ){
            defs.columns = columns
        }
        if( rows ){
            defs.rows = rows
        }
        if( viewFilters ){
            defs.viewFilters = viewFilters
        }
        
        const allocations = viewFilters.slice(0,1).map(d=>{
            if( d ){
                defs.allocations = [d]
                const field = "filterGroup0"
                if( otherExtents[field] && d.filter){
                    const filterToCheck = typeof( d.filter[0] ) === "object" ? d.filter.map(d=>d ? d.idx : d) : d.filter

                    otherExtents[field]= otherExtents[field].filter(f=>{
                        if( f.idx === "_N_" && (d.filter.includes(undefined) || d.filter.includes(null))){
                            return false
                        }
                        return !filterToCheck.includes(f.idx)
                    })
                }
                return {...d, field}
            }
            return undefined
        }).filter(d=>d)

                
        let {data: filtered, columns: finalColumns, rows: finalRows} = CollectionUtils.filterCollectionAndAxis( data, filters , {columns: columnExtents, rows: rowExtents, otherExtents, hideNull, skipItemsFilter: alreadyFiltered})
        const table = {
            defs,
            columns: finalColumns,
            rows: finalRows,
            totals: {rows: {idx: {}, order: []}, columns: {idx: {}, order: []}, table: 0},
            ranges: {rows: {idx: {}, order: []}, columns: {idx: {}, order: []}, table: {min: Infinity, max: -Infinity}},
            cells: [],
            ids: Array.from(new Set(filtered.map(d=>d.primitive.id) ))
        }
        if( config.timeseries ){
            table.ranges.timeseries = {
                time: {rows: {idx: {}, order: []}, columns: {idx: {}, order: []}, table: {min: Infinity, max: -Infinity}, table: {min: Infinity, max: -Infinity}},
                values: {rows: {order: [], idx: {}}, columns: {order: [], idx: {}}}
            }
            table.totals.timeseries = {table: 0, rows: {idx: {}, order: []}, columns: {idx: {}, order: []}}
        }                   
        if( allocations?.length > 0 ){
            table.allocations = {}
            allocations.forEach((d)=>{
                table.allocations[d.field] = {
                    title: d.title ?? mainstore.primitive(d.sourcePrimId)?.title ?? d.parameter,
                    items: otherExtents[d.field].map(d=>({...d}))
                }
            })
        }

        const cellMap = {}

        finalRows.forEach((row,rIdx)=>{
            const rowList = filtered.filter((item=>Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx))
            finalColumns.forEach((column,cIdx)=>{
                let subList = rowList.filter((item)=>Array.isArray(item.column) ? item.column.includes( column.idx ) : item.column === column.idx)
                let count = subList.length

                table.totals.rows.idx[row.idx] = (table.totals.rows.idx[row.idx] || 0) + count
                table.totals.columns.idx[column.idx] = (table.totals.columns.idx[column.idx] || 0) + count
                table.totals.table = table.totals.table + count

                table.ranges.rows.idx[row.idx] ||= {min: Infinity, max: -Infinity}
                table.ranges.columns.idx[column.idx] ||= {min: Infinity, max: -Infinity}
                if( count > table.ranges.rows.idx[row.idx].max){
                    table.ranges.rows.idx[row.idx].max = count
                }
                if( count < table.ranges.rows.idx[row.idx].min){
                    table.ranges.rows.idx[row.idx].min = count
                }
                if( count > table.ranges.columns.idx[column.idx].max){
                    table.ranges.columns.idx[column.idx].max = count
                }
                if( count < table.ranges.columns.idx[column.idx].min){
                    table.ranges.columns.idx[column.idx].min = count
                }


                if( count > table.ranges.table.max){
                    table.ranges.table.max = count
                }
                if( count < table.ranges.table.min){
                    table.ranges.table.min = count
                }
                const idxId = `${column.idx}-${row.idx}`
                const cell = {
                    idxId,
                    columnIdx: column.idx,
                    rowIdx: row.idx,
                    items: subList.map(d=>d.primitive),
                    count: count
                }
                if( allocations?.length > 0 ){
                    cell.allocations = {}
                    allocations.forEach((d)=>{
                        if( otherExtents[d.field] ){
                            cell.allocations[d.field] = otherExtents[d.field].map((c)=>({idx: c.idx, label: c.label, count: 0, items: []}))
                            const pos = Object.fromEntries(cell.allocations[d.field].map((d,i)=>[d.idx, i]))
                            for(const item of subList){
                                const parts = [item[d.field]].flat()
                                for( const part of parts){
                                    if( cell.allocations[d.field][pos[part]] ){
                                        cell.allocations[d.field][pos[part]].count++
                                        cell.allocations[d.field][pos[part]].items.push( item.primitive)
                                    }else{
                                        console.warn(`Couldnt find ${part}`)
                                    }
                                }
                            }
                        }
                    })
                }
                if( config.timeseries ){
                    const resScale = {
                        "second": 1000,
                        "minute": 1000 * 60,
                        "hour": 1000 * 60 * 60,
                        "day": 1000 * 60 * 60 * 24,
                        "week": 1000 * 60 * 60 * 24 * 7,
                        "month": 1000 * 60 * 60 * 24 * 365 / 12,
                        "year": 1000 * 60 * 60 * 24 * 365 ,
                    }
                    //const series = config.timeseries.series
                    const series = [{name: "Total", type: "count", cumulative: true}]
                    const timeOriginField = config.timeseries.timeOrigin ?? "posted"
                    const objectField = config.timeseries.timeField ?? "comment_data"
                    const timeField = config.timeseries.timeField ?? "created_at"
                    const resolution = config.timeseries.resolution ?? "day"
                    let startDate = 0, endDate
                    if( config.timeseries.delta){
                        if( config.timeseries.limitTicks){
                            endDate = resScale[resolution ?? "day"] * config.timeseries.limitTicks
                        }
                    }else{
                        startDate = config.timeseries.startDate ? Date.parse(config.timeseries.startDate) : undefined
                        endDate = config.timeseries.endData ? Date.parse(config.timeseries.endData) : undefined
                    }
                    
                    table.ranges.timeseries.time.rows.idx[row.idx] ||= {min: Infinity, max: -Infinity}
                    table.ranges.timeseries.time.columns.idx[column.idx] ||= {min: Infinity, max: -Infinity}

                    let interpolate 
                    cell.timeseries ||= []
                    for(const item of cell.items){
                        const startTime = PrimitiveConfig.decodeParameter(item.referenceParameters, timeOriginField) ?? []
                        const sourceObjects = PrimitiveConfig.decodeParameter(item.referenceParameters, objectField) ?? []
                        const incValue = config.timeseries.delta ? (cell.count === 0 ? 0 : 1 / cell.count) : 1


                        for( const sourceObject of [sourceObjects].flat()){
                            let itemDate = PrimitiveConfig.decodeParameter(sourceObject, timeField) 
                            if( typeof(itemDate) === "string"){
                                try{
                                    itemDate = Date.parse(itemDate)
                                }catch(e){
                                    itemDate = undefined
                                }
                            }
                            if( !itemDate ){continue}

                            if(config.timeseries.delta){
                                const diff = moment(itemDate).diff(startTime, resolution)
                                itemDate =  diff.valueOf() * resScale[resolution]
                            }else{
                                itemDate = moment(itemDate).startOf(resolution).valueOf()
                            }
                            
                            if( itemDate < table.ranges.timeseries.time.table.min){
                                table.ranges.timeseries.time.table.min = itemDate
                            }
                            if( itemDate > table.ranges.timeseries.time.table.max){
                                table.ranges.timeseries.time.table.max = itemDate
                            }

                            if( startDate && (itemDate < startDate)){continue}
                            if( endDate && (itemDate > endDate)){
                                if( interpolate === undefined || interpolate?.date > itemDate ){
                                    interpolate = {
                                        date: itemDate,
                                        value: incValue
                                    }
                                }else if( interpolate?.date === itemDate ){
                                    interpolate.value += incValue
                                }
                                continue
                            }

                            if( itemDate < table.ranges.timeseries.time.table.min){
                                table.ranges.timeseries.time.table.min = itemDate
                            }
                            if( itemDate > table.ranges.timeseries.time.table.max){
                                table.ranges.timeseries.time.table.max = itemDate
                            }

                            if( itemDate < table.ranges.timeseries.time.columns.idx[column.idx].min){
                                table.ranges.timeseries.time.columns.idx[column.idx].min = itemDate
                            }
                            if( itemDate > table.ranges.timeseries.time.columns.idx[column.idx].max){
                                table.ranges.timeseries.time.columns.idx[column.idx].max = itemDate
                            }

                            if( itemDate < table.ranges.timeseries.time.rows.idx[row.idx].min){
                                table.ranges.timeseries.time.rows.idx[row.idx].min = itemDate
                            }
                            if( itemDate > table.ranges.timeseries.time.rows.idx[row.idx].max){
                                table.ranges.timeseries.time.rows.idx[row.idx].max = itemDate
                            }

                            series.forEach((d,i)=>{
                                cell.timeseries[i] ||= {}
                                if( d.type === "count"){

                                    table.totals.timeseries.rows.idx[row.idx] ||= []
                                    table.totals.timeseries.rows.idx[row.idx][i] ||= 0
                                    table.totals.timeseries.rows.idx[row.idx][i] += incValue

                                    table.totals.timeseries.columns.idx[column.idx] ||= []
                                    table.totals.timeseries.columns.idx[column.idx][i] ||= 0
                                    table.totals.timeseries.columns.idx[column.idx][i] += incValue

                                    cell.timeseries[i][itemDate] ||= {count: 0, items: []}
                                    cell.timeseries[i][itemDate].count += incValue
                                    cell.timeseries[i][itemDate].items.push( sourceObject )
                                }
                            })
                        }
                    }
                    if( interpolate && config.timeseries.cumulative){
                        if( series.length > 1){console.warn("INTERPOLATION NOT IMPLLEMENETED FOR MULTIPLE SERIES")}
                        const tx = endDate
                        if( cell.timeseries[0][ tx ] == undefined){
                            const [iT,iData] = Object.entries(cell.timeseries[0] ?? {}).sort((a,b)=>a[0] - b[0])[0]
                            const x1 = parseInt(iT)
                            const y1 = iData.count
                            const x2 = interpolate.date
                            const y2 = interpolate.value
                            const ty = y1 + ((y2 - y1) / (x2 - x1) * (tx - x1))
                            cell.timeseries[0][ tx ] = {count: ty, interpolated: true, items: []}
                        }
                    }

                }
                table.cells.push(cell)
                cellMap[idxId] = cell
            })
        })
        

        function orderAxis( axis, order, name){

            let orderMap
            if( order === undefined){
                const isNUmeric = axis.some(d=>typeof(d.label) === "number")
                if( isNUmeric ){
                    orderMap = new Map(axis.sort((a,b)=>(a.label ?? 0) - (b.label ?? 0)).map((d,i)=>[d,i]))
                }else{
                    orderMap = new Map(axis.sort((a,b)=>(a.label ?? "").localeCompare(b.label ?? {})).map((d,i)=>[d,i]))
                }
            }else if( Array.isArray(order) ){
                orderMap = new Map(
                    order.map((idx, position) => [idx, position])
                )
            }else{

                const field = order.field
                let mappedRows
                if( field === "count"){
                    const totals = table.totals[name]?.idx
                    mappedRows = axis.map((d,i)=>[d.idx, totals[d.idx]])
                    console.log(mappedRows)
                    mappedRows = mappedRows.sort((a,b)=>a[1] - b[1])
                }else{
                    const orth = name === "column" ? "rows" : "columns"
                    const thisIdx = name === "column" ? "columnIdx" : "rowIdx"
                    const orthIdx = name === "column" ? "rowIdx" : "columnIdx"
                    let inScopeIdx = field.orthogonal

                    const mapped = {}

                    table.cells.forEach(cell=>{
                        if( inScopeIdx && !inScopeIdx.includes(cell[orthIdx]) ){
                            return
                        }
                        mapped[cell[thisIdx]] ||= 0
                        if( field.allocation && cell.allocations ){
                            let items = cell.allocations[field.allocation] ?? [] 
                            if(field.values){
                                items = items.filter(d=>field.values.includes(d.idx))
                            }
                            for(const d of items){
                                mapped[cell[thisIdx]] += d.count
                            }
                        }else{
                            mapped[cell[thisIdx]] += cell.count
                        }
                    })
                    mappedRows = Object.entries(mapped).sort((a,b)=>a[1] - b[1])

                }
                if( mappedRows ){
                    if( order.descend){
                        mappedRows = mappedRows.reverse()
                    }
                    orderMap = new Map(mappedRows.map((d,i)=>[d[0], i]))
                }
            }
            if( orderMap ){
                return axis.sort((a, b) => {
                    const ia = orderMap.has(a.idx) ? orderMap.get(a.idx) : Infinity;
                    const ib = orderMap.has(b.idx) ? orderMap.get(b.idx) : Infinity;
                    return ia - ib;
                });
            }
        }

        orderAxis( finalColumns, columns.order, "columns")
        orderAxis( finalRows, rows.order, "rows")
        finalRows.forEach((row,rIdx)=>{
            finalColumns.forEach((column,cIdx)=>{
                const id = `${cIdx}-${rIdx}`
                const idxId = `${column.idx}-${row.idx}`
                const cell = cellMap[idxId]
                cell.id = id
                cell.cIdx = cIdx
                cell.rIdx= rIdx
                
                table.totals.rows.order[rIdx] = table.totals.rows.idx[row.idx]
                table.totals.columns.order[cIdx] = table.totals.columns.idx[column.idx]
                
                table.ranges.rows.order[rIdx] ||= table.ranges.rows.idx[row.idx]
                table.ranges.columns.order[cIdx] ||= table.ranges.columns.idx[column.idx]
                if( config.timeseries ){
                    if( config.timeseries.cumulative ){
                        cell.timeseries_base = cell.timeseries.slice()
                        cell.timeseries = cell.timeseries.map(series=>{
                            const entries = Object.entries(series ?? {}).sort((a,b)=>parseInt(a[0]) - parseInt(b[0]))
                            const cumulative = {};
                            let total = 0;
                            for (const [key, { count, ...rest }] of entries) {
                                total += count 
                                cumulative[key] = { count: total, ...rest };
                            }
                            return cumulative
                        })
                        
                    }

                    table.ranges.timeseries.values.rows.order[rIdx] ||= []
                    table.ranges.timeseries.values.rows.idx[row.idx] ||= []
                    table.ranges.timeseries.values.columns.order[cIdx] ||= []
                    table.ranges.timeseries.values.columns.idx[column.idx] ||= []
                    cell.timeseries.map((series, sIdx)=>{
                        const values = Object.values(series ?? {}).map(d=>d.count)
                        const maxValue = values.reduce((a,c)=> c > a ? c : a, -Infinity)
                        const minValue = values.reduce((a,c)=> c < a ? c : a, Infinity)


                        table.ranges.timeseries.values.rows.order[rIdx][sIdx] ||= {min: Infinity, max: -Infinity}
                        table.ranges.timeseries.values.rows.idx[row.idx][sIdx] ||= {min: Infinity, max: -Infinity}
                        table.ranges.timeseries.values.columns.order[cIdx][sIdx] ||= {min: Infinity, max: -Infinity}
                        table.ranges.timeseries.values.columns.idx[column.idx][sIdx] ||= {min: Infinity, max: -Infinity}

                        if( minValue < table.ranges.timeseries.values.rows.order[rIdx][sIdx].min ){
                            table.ranges.timeseries.values.rows.order[rIdx][sIdx].min = minValue
                            table.ranges.timeseries.values.rows.idx[row.idx][sIdx].min = minValue
                        }
                        if( maxValue > table.ranges.timeseries.values.rows.order[rIdx][sIdx].max ){
                            table.ranges.timeseries.values.rows.order[rIdx][sIdx].max = maxValue
                            table.ranges.timeseries.values.rows.idx[row.idx][sIdx].max = maxValue
                        }
                        if( minValue < table.ranges.timeseries.values.columns.order[cIdx][sIdx].min ){
                            table.ranges.timeseries.values.columns.order[cIdx][sIdx].min = minValue
                            table.ranges.timeseries.values.columns.idx[column.idx][sIdx].min = minValue
                        }
                        if( maxValue > table.ranges.timeseries.values.columns.order[cIdx][sIdx].max ){
                            table.ranges.timeseries.values.columns.order[cIdx][sIdx].max = maxValue
                            table.ranges.timeseries.values.columns.idx[column.idx][sIdx].max = maxValue
                        }
                    })

                    table.ranges.timeseries.time.rows.order[rIdx] ||= table.ranges.timeseries.time.rows.idx[row.idx]
                    table.ranges.timeseries.time.columns.order[cIdx] ||= table.ranges.timeseries.time.columns.idx[column.idx]

                    table.totals.timeseries.columns.order[cIdx] = table.totals.timeseries.columns.idx[column.idx]
                    table.totals.timeseries.rows.order[rIdx] = table.totals.timeseries.rows.idx[row.idx]
                }
                
            })
        })
        return table
    }
    static mapCollectionByAxis(list, column, row, others, liveFilters, viewPivot){

        let pinData = {}

     


        const _pickProcess = ( option )=>{
            if( option ){
                if(option.relationship && !option._relationship){
                    option._relationship = [option.relationship].flat().map(d=>{
                        const split = d.split(":")
                        return {rel: split[0], rId: split[1]}
                    })
                }
                if( option.type === "category"){
                    return (p)=>{
                        let candidates = option.relationship ? p.relationshipAtLevel(option.relationship, option.access) : [p]
                        let matches = candidates.flatMap(d=>d.parentPrimitives.filter(d=>d.parentPrimitiveIds.includes(option.primitiveId))).filter(d=>d)
                        if( matches.length > 0 ){
                            return uniquePrimitives(matches).map(d=>d.id)
                        }
                        return "_N_"
                    }
                }else if( option.type === "pin"){
                    return (p)=>{
                        return p.parentPrimitiveIds.filter(d=>option.pinValues.includes(d))
                    }

                }else if( option.type === "primitive"){
                    return (p)=>p.id
                }else if( option.type === "segment_filter"){
                    return (p)=>{
                        const segments = p.findParentPrimitives({type: "segment", first:true})
                        return segments.map(d=>d.id)
                    }
                }else if( option.type === "contact"){
                    return (d)=>d.origin.referenceParameters?.contactId
                }else if( option.type === "act_parent"){
                    return (d)=>d.findParentPrimitives({type:"activity"})?.[0]?.title
                }else if( option.type === "type"){
                    return (p)=>{
                        let item = p
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                        return item?.referenceId
                    }
                }else if( option.type === "icon"){
                    return (p)=>{
                        let item = p
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access) : [item.originAtLevel( option.access)]
                        item = item.map(d=>d.id)
                        return item.length === 1 ? item[0] : item
                    }
                }else if( option.type === "title"){
                    return (p)=>{
                        let item = p
                        //item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access) : [item.originAtLevel( option.access)]
                        item = option.relationship ? item.relationshipAtLevel(option._relationship, option.access) : (option.access ? [item.originAtLevel( option.access)] : [item])
                        if( option.passType === "indexed" ){
                            item = item.map(d=>{
                                return {order: (d?.referenceParameters?.step ?? d?.referenceParameters?.index), value: d?.title, idx: d.id}
                            })
                        }else{
                            item = item.map(d=>d?.title)
                        }
                        if( item.length === 0){
                            return undefined
                        }
                        return item.length === 1 ? item[0] : item
                    }
                }else if( option.type === "question"){
                    return (d)=> {
                        let item = d
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                        if( !item ){return undefined}
                        //let out = option.values?.filter(d2=>d.parentPrimitiveIds.filter(d3=>d2.map.includes(d3)).length > 0).map(d2=>d2.idx)?.[0]
                        let out
                        if( option.subtype === "prompt"){
                            out = d.parentPrimitives.filter(d=>d.type === "prompt" && d.origin.type === "question").map(d=>d.id)
                        }else{
                            out = d.parentPrimitives.filter(d=>d.type === "prompt" && d.origin.type === "question").map(d=>d.origin.id)
                        }
                        return out 
                    }
                }else if( option.type === "parameter"){
                    if( option.parameterType === "options"){
                        return (d)=>{
                            let item = d
                            item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                            if( !item ){return undefined}
                            const orderedOptions = item.metadata?.parameters[option.parameter]?.options
                            if( orderedOptions){
                            //const values =  [item.referenceParameters[option.parameter]].flat()
                            const values =  [PrimitiveConfig.decodeParameter(item.referenceParameters, option.parameter)].flat()
                            if( values && values.length > 0){
                                    const maxIdx = Math.max(...values.map((d2)=>orderedOptions.indexOf(d2)))
                                    return orderedOptions[maxIdx]
                            }else{
                                return item.metadata.parameters[option.parameter].default ?? "None"
                            }
                            }
                            return ""
                        }
                    }
                    return (d)=> {
                        let item = d
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access) : (option.access ? [item.originAtLevel( option.access)] : [item])

                        item = item.map(d=>{
                            //let value = d?.referenceParameters[option.parameter]
                            let value = PrimitiveConfig.decodeParameter(d?.referenceParameters, option.parameter)
                            if( option.parameterType === "number" && typeof(value) === "string"){
                                value = parseFloat(value)
                            }
                            if( option.parameterType === "boolean"){
                                return (value === undefined || value === false) ? value : true
                            }
                            return value
                        })
                        return item.length === 1 ? item[0] : item
                    }
                }
            }
            return (p)=>undefined
        }

        let interim = list.map((p)=>{
            return {
                primitive: p,
                column: column ? _pickProcess(column)(p) ?? undefined : undefined,
                row: row ? _pickProcess(row)(p) ?? undefined : undefined,
                ...((others ?? []).reduce((a,d,idx)=>{
                    a[`filterGroup${idx}` ] = _pickProcess(d)(p) ?? undefined
                    return a
                },{})),
                ...((liveFilters ?? []).reduce((a,d,idx)=>{
                    a[`liveFilter${idx}` ] = _pickProcess(d)(p) ?? undefined
                    return a
                },{}))
            }
        })

        let axisExtents = {
            column: column ? this.axisExtents(interim, column, "column").values : [],
            row: row ? this.axisExtents(interim, row, "row").values : [],
            ...((others  ?? []).reduce((a,d,idx)=>{
                a[`filterGroup${idx}` ] = this.axisExtents( interim, d, `filterGroup${idx}`).values
                return a
            },{})),
            ...((liveFilters  ?? []).reduce((a,d,idx)=>{
                a[`liveFilter${idx}` ] = this.axisExtents( interim, d, `liveFilter${idx}`).values
                return a
            },{}))
        }
        if( viewPivot ){
            const depth = viewPivot instanceof Object ? viewPivot.depth : viewPivot
            const relationship = (viewPivot instanceof Object ? viewPivot.relationship : undefined) ?? "origin"

            if( relationship === "origin" ){
                interim = interim.map(d=>{
                    return {
                        ...d,
                        primitive_source: d.primitive,
                        primitive:  d.primitive.originAtLevel( depth )
                    }
                })
            }else{
                interim = interim.map(d=>{
                    const items = d.primitive.relationshipAtLevel( relationship, depth)
                    return items.map(item=>{

                        return {
                            ...d,
                            primitive_source: d.primitive,
                            primitive:  item
                        }
                    })
                }).flat()
            }
            interim = interim.filter((d,i,a)=>a.findIndex(d2=>(d2.column === d.column) && (d2.row === d.row ) && d.primitive.id === d2.primitive.id) === i)
        }


        return {data: interim, extents: axisExtents}
    }
    static filterCollectionAndAxis( data, filters, options = {} ){
        let colFilter = filters.find(d=>d.field === "column")?.exclude ?? []
        let rowFilter = filters.find(d=>d.field === "row")?.exclude ?? []
        
        let list = options.skipItemsFilter ? data : CollectionUtils.filterCollection( data, filters)
        
        let outColumns
        let outRows

        if( options.columns  ){
            outColumns = options.columns.filter(d=>{
                if( (d.idx === "_N_" || d.idx === undefined) && (colFilter.includes(undefined) || colFilter.includes(null))){
                    return false
                }
                return !colFilter.includes(d.idx)
            })
        }
        if( options.rows  ){
            outRows = options.rows.filter(d=>{
                if( (d.idx === "_N_" || d.idx === undefined) && (rowFilter.includes(undefined) || rowFilter.includes(null))){
                    return false
                }
                return !rowFilter.includes(d.idx)
            })
        }

        if( options.hideNull ){
            if( outColumns ){
                outColumns = outColumns.filter(d=>list.filter(d2=>Array.isArray(d2.column) ? d2.column.includes(d.idx) : d2.column === d.idx).length > 0)
            }
            if( outRows ){
                outRows = outRows.filter(d=>list.filter(d2=>Array.isArray(d2.row) ? d2.row.includes(d.idx) : d2.row === d.idx).length > 0)
            }
        }
        return {data: list, columns: outColumns, rows: outRows}
    }

    static filterCollection( data, filters ){
        let list = data

        for( const d of filters ){
            list = d.exclude.length > 0 ? CollectionUtils.applyFilter( list, d.field, d.exclude) : list
        }
        return list
    }
    static applyFilter(list, field, items) {
        const flatItems = [items].flatMap(d =>d && typeof d === 'object' && d.idx != null ? d.idx : d);
        const itemSet = new Set(
          flatItems.map(v => (v === null ? undefined : v))
        );
      
        return list.reduce((out, entry) => {
          const val = entry[field];
      
          if (Array.isArray(val)) {
            const filtered = val.filter(v => !itemSet.has(v));
            if (filtered.length > 0) {
              out.push({ ...entry, [field]: filtered });
            }
          } else {
            // scalar case: only push if not filtered out
            if (!itemSet.has(val)) {
              out.push(entry);
            }
          }
      
          return out;
        }, []);
      }

    /*static applyFilter(list, field, items){

        const partial = true // field === "column" || field === "row"

        const removeList = new Set()

        items = [items].flat().map(d=>d instanceof Object ? d.idx : d).map(d=>d === null ? undefined : d)
        var outList = []
        
        for(const d of list){
            let item = d[field]
            if( Array.isArray(item)){
                if( partial ){
                    item = item.filter(d=>!items.includes(d))
                    if( item.length === 0){
                        continue
                    }
                }else{
                    const match = item.reduce((a,d)=>a || items.includes(d), false )
                    if( match ){
                        removeList.add(d.primitive.id)
                        continue
                    }
                }
            }else{
                if(items.includes(item)){
                    if( !partial ){
                        removeList.add(d.primitive.id)
                    }
                    continue
                }
            }
            outList.push({
                ...d,
                [field]: item
            })
        }

        if( !partial ){
            outList = outList.filter(d=>!removeList.has(d.primitive.id))
        }

        return outList
    }*/
    static primitiveAxis( primitive, axisName, items, skipPinData){
        let config = primitive.getConfig
        let axis 
        if( axisName === "column" || axisName === "row"){
            axis = config?.explore?.axis?.[axisName]
        }else{
            axis = config?.explore?.filters?.[ axisName]
        }
        if( axis ){
            if( ["question", "title", "type", "icon","segment_filter","primitive"].includes(axis.type)){
                return {filter: [],...axis, passType: PrimitiveConfig.passTypeMap[axis.type] ?? "raw"}
            }

            if( axis.type == "pin"){
                let pinData = []
                if(!skipPinData){
                    const inputs = primitive.inputs[axisName === 'column' ? "colAxis" : "rowAxis"]
                    pinData = inputs?.data?.map(d=>{
                        if(d.id){
                            return {idx: d.id, label: d.title, primitive: d}
                        }
                        return {idx: d, label: d}
                    })
                }
                return {filter: [],...axis, pinData, pinValues: pinData.map(d=>d.idx), passType: PrimitiveConfig.passTypeMap[axis.type] ?? "raw"}
            }
    

            if( "parameter" === axis.type ){
                const meta = axis.relationship ? items?.[0]?.relationshipAtLevel(axis.relationship, axis.relationship.length)?.[0]?.metadata : items?.[0]?.metadata 

                const pC = {filter: [],...axis, passType: PrimitiveConfig.passTypeMap[axis.parameter] ?? PrimitiveConfig.passTypeMap[axis.type] ?? meta?.parameters?.[axis.parameter]?.type ?? "raw"}

                //const meta = items?.[0]?.metadata 
                
                if( meta ){
                    if( meta.parameters?.[axis.parameter]?.axisType){
                        pC.passType = meta.parameters[axis.parameter].axisType
                        pC.axisData = meta.parameters[axis.parameter].axisData
                    }
                }
                return pC
            }
            const connectedPrim = isNaN(axisName) ? primitive.primitives.axis[axisName].allIds[0] : primitive.getConfig.explore.filters[axisName].sourcePrimId            
            if( connectedPrim ){
                return {filter: [], ...axis, primitiveId: connectedPrim}
            }
        }
        return {type: "none", filter: []}

    }
    static async setPrimitiveAxis(primitive, item, axisName, forExplorer = true){
        let target
        if( forExplorer){
            if( axisName === "column" || axisName === "row"){
                target =`referenceParameters.explore.axis.${axisName}`
            }else{
                target = `referenceParameters.explore.filters.${axisName}`
            }
        }else{
            target = `referenceParameters.${axisName}`
        }
        const fullState = {
            type: item.type,
            title: item.title,
            access: item.access,
            relationship: item.relationship//?.map(d=>d?.split(":")[0])
        }
        if( item.type === "none"){
            primitive.setField(target, null)

            const existingPrimitives = primitive.primitives.fromPath( `axis.${axisName}` ).allItems
            if( existingPrimitives ){
                for(const d of existingPrimitives){
                    await primitive.removeRelationship(d, `axis.${axisName}` )
                }
            }


            return
        }else if( item.type === "category"){
            primitive.setField(target, fullState)
            let toRemove = primitive.primitives.axis[axisName].allItems.filter(d=>d.id)
            let already = false

            if( toRemove.find(d=>d.id === item.category.id)){
                already = true
                toRemove = toRemove.filter(d=>d.id !== item.category.id)
            }
            
            for(const old of toRemove){
                await primitive.removeRelationship( old, `axis.${axisName}`)
            }
            if( !already ){
                await primitive.addRelationship( item.category, `axis.${axisName}`)
            }
        }else if( item.type === "question"){
            fullState.subtype = item.subtype
        }else if( item.type === "parameter"){
            fullState.parameter = item.parameter
        }else if( item.type === "segment_filter"){
            fullState.axis = item.axis
        }
        primitive.setField(target, fullState)
    
    }
    static equalRelationshipForFilter(or1, or2, ignoreType = false){
        if( or1 === or2){
            return true
        }
        let r1 = [or1].flat()
        let r2 = [or2].flat()

        if( ignoreType ){
            r1 = r1.map(d=>d?.split(':')[0])
            r2 = r2.map(d=>d?.split(':')[0])
        }
    
        if(r1.length !== r2.length){
            return false
        }
        const setR2 = new Set(r2);

        if( !r1.every(element => setR2.has(element))){
            return false
        }
        const setR1 = new Set(r1);
        return r2.every(element => setR1.has(element));
        //return r1.every(element => setR2.has(element));

    }
    static findLiveFilters(axisOptions){
        return axisOptions.filter(d=>d.isLive && (!d.relationship || [d.relationship].flat().length === 0))
    }
    static findAxisItem(primitive, axis, axisOptions){
        if( primitive && axisOptions){
            const struct =  isNaN(axis) ?  primitive.referenceParameters?.explore?.axis?.[axis] : primitive.referenceParameters?.explore?.filters?.[axis]
            const connectedPrim = isNaN(axis) ? primitive.primitives.axis[axis].allIds[0] : primitive.referenceParameters.explore.filters[axis].sourcePrimId
            return CollectionUtils.findAxis(struct, axisOptions, connectedPrim)
        }
    }
    static findAxis(struct, axisOptions, connectedPrim){
        if( struct ){
            if(struct.type === "parameter" ){
                return axisOptions.find(d=>d.type === struct.type && d.parameter === struct.parameter && CollectionUtils.equalRelationshipForFilter(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
            }else if(struct.type === "question" ){
                return axisOptions.find(d=>d.type === struct.type &&  CollectionUtils.equalRelationshipForFilter(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0) && (d.subtype === struct.subtype))?.id ?? 0
            }else if(struct.type === "title"  || struct.type === "type" || struct.type === "icon" ){
                return axisOptions.find(d=>d.type === struct.type &&  CollectionUtils.equalRelationshipForFilter(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
            }else if(struct.type === "segment_filter" || struct.type === "primitive" ){            
                return axisOptions.find(d=>d.type === struct.type &&  ((struct.axis ?? 0) === (d.axis ?? 0)))?.id ?? 0
            }
            return axisOptions.find(d=>d.type === struct.type && d.primitiveId === connectedPrim && CollectionUtils.equalRelationshipForFilter(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
        }
        return 0
    }
    static convertCollectionFiltersToImportFilters(source){
        return [
            "column",
            "row",
            (source.referenceParameters?.explore?.filters ?? []).map((d,i)=>i)
        ].flat().map(d=>this.primitiveAxis(source,d, undefined, true)).filter(d=>d).map(d=>PrimitiveConfig.encodeExploreFilter(d, d.filter, true)).filter(d=>d)
    }
}

export default CollectionUtils
window.utils = CollectionUtils