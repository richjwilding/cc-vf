import MainStore, { uniquePrimitives } from "./MainStore"
import { roundCurrency } from "./RenderHelpers"


class CollectionUtils{
    static passTypeMap = {
        "type": "origin_type",
        "options": "raw",
        "title": "raw",
        "currency": "currency",
        "funding": "funding",
        "contact": "contact",
        "boolean": "boolean",
    }
    static axisToHierarchy(axisList, options = {}){
        const out = {}
        function findPath(node, path, d){
            if( path.length === 0 || (path.length === 1 && d.type === "type")){
                return node
            }
            node.nested ||= {}
            const next = path[0]
            if( !node.nested[next] ){
                node.nested[next] = {path: d.relationship}
            }
            return findPath( node.nested[next], path.slice(1), d)
        }
        for(const d of axisList){
            let node = out
            if( d.relationship ){
                node = findPath(node, d.relationship, d)
            }
            node.category ||= d.category
            node.items ||= []
            node.items.push(d)
        }
        return out
    }
    static axisFromCollection(items, primitive, options = {}){
        const mainstore = MainStore()
        const viewPivot = options.viewPivot

        let out = [{type: "none", title: "None", values: [""], order:[""], labels: ["None"]}]

        function findCategories( list, access = 0, relationship ){
            const catIds = {}
            for(const category of list){
            if( category.referenceId === 53){
                catIds[category.id] = category.primitives.params.source?.allUniqueCategory?.[0] ?? undefined
            }else{
                catIds[category.id] = category
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
                    /*order: ["_N_",options.map((d)=>d.id)].flat(),
                    values:["_N_",options.map((d)=>d.id)].flat(),
                    labels:["None", options.map((d)=>d.title)].flat(),*/
                    title: `Category: ${d.title}`,
                    allowMove: !relationship && access === 0 && (!viewPivot || (viewPivot.depth === 0 || viewPivot === 0)),
                    relationship: d.referenceParameters.pivotBy ?? relationship,
                    access: d.referenceParameters?.pivot ?? access
                }
            }).filter(d=>d)
        }

        function txParameters(p, access, relationship ){
            let out = []
            const catIds = p.map((d)=>d.referenceId).filter((v,idx,a)=>v && a.indexOf(v)=== idx)
            if( access === 1){
                out.push( {type: 'type', title: `Origin type`, relationship, access: access, values: catIds, order: catIds, labels: catIds.map(d=>mainstore.category(d)?.title ?? "Unknown"), passType: "origin_type"})

            }

            function process(parameters, category){
                if( parameters ){
                    for(const parameter of Object.keys(parameters)){
                        const type = parameters[parameter].type
                        if( parameters[parameter].asAxis === false){
                            continue
                        }
                        else if( parameters[parameter].excludeFromAggregation ){
                            continue
                        }else if( type === "url" ){
                            continue
                        }else if( type === "long_string" ){
                            continue
                        }else if( type === "options" ){
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, category, title: `${parameters[parameter].title}`, relationship, access: access, clamp: true, passType: "raw"})
                        }else  if( type === "currency" ||  type === "number" ||  type === "funding"){
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, category, title: `${parameters[parameter].title}`, relationship, access: access, passType: type})
                        }else if(  type === "contact"){
                            out.push( {type: 'parameter', parameter: "contactId", parameterType: type, category, title: `${parameters[parameter].title}`, relationship, access: access, passType: "contact"})
                        }else if(  type === "boolean"){
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, category, title: `${parameters[parameter].title}`, relationship, access: access, passType: "boolean"})
                        }else{
                            out.push( {type: 'parameter', parameter: parameter, parameterType: type, category, title: `${parameters[parameter].title}`, relationship, access: access, passType: "raw"})
                        }
                    }
                }
            }

            catIds.forEach((id)=>{
                const category = MainStore().category(id)
                if( category.primitiveType === "entity" || category.primitiveType === "result" || category.primitiveType === "query" || category.primitiveType === "evidence"){
                    out.push( {type: 'title', title: `${category.title} Title`, category, relationship, access: access, passType: "raw"})
                }
                if( category ){
                    process(category.parameters, category) //
                }
            })
            p.map((d)=>d.origin && d.origin.childParameters ? d.origin.id : undefined).filter((d,idx,a)=>d && a.indexOf(d)===idx).forEach((d)=>{
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
            console.log(out)

            out = out.filter((d,i)=>out.findIndex(d2=>d2.type === d.type && d.title === d2.title && d.access === d2.access && mainstore.equalRelationships(d.relationship, d2.relationship) ) === i)

            return out.filter((filter)=>{
                if( filter.type === "parameter" ){
                    return  (p.filter((d)=>(filter.parameterType === "boolean" && d.referenceParameters[filter.parameter] !== undefined) ||  ["number","string"].includes(typeof(d.referenceParameters[filter.parameter])) || Array.isArray(d.referenceParameters[filter.parameter])).filter((d)=>d !== undefined).length > 0)
                }
                if( filter.type === "title" ){
                    return  (p.filter((d)=>["number","string"].includes(typeof(d.title))).filter((d)=>d !== undefined).length > 0)
                }
                if( filter.type === "type" ){
                    return true
                }
                return false
            })
        }


        if( primitive ){

            const baseCategories = primitive.primitives.allUniqueCategory
            out = out.concat( findCategories( baseCategories ) )
            if( primitive.referenceParameters?.explore?.importCategories !== false){
                let nodes = [primitive]
                let updated = false
                let added = 0
                do{
                    updated = false
                    for(const node of nodes ){
                        let thisSet = []
                        const thisCat = findCategories( node.primitives.allUniqueCategory  ).filter(d=>d)
                        added += thisCat.length
                        out = out.concat( thisCat )
                        if(Object.keys(node.primitives).includes("imports")){
                            thisSet.push( node.primitives.imports.allItems )
                            updated = true
                        }
                        nodes = thisSet.flat()
                    }
                }while(updated)
            }
        } 

        if( items ){
            out = out.concat( txParameters( items ) )
            
            const expandOrigin = (nodes, count = 0, relationshipChain = "origin")=>{
                let out = []
                    let origins = uniquePrimitives(nodes.map((d)=>!d.isTask && d.relationshipAtLevel(Array.isArray(relationshipChain) ? relationshipChain.slice(-1)[0] : relationshipChain,1)).flat(Infinity).filter((d)=>d)) 
                    let path = [relationshipChain].flat()
                    let last = path.pop()
                    if( origins.length > 0){
                        const referenceIds = origins.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d)===i)
                        for(const d of referenceIds){
                            const theseOrigins = origins.filter(d2=>d2.referenceId === d) 
                            
                            let cont = [...path,`${last}:${d}`]

                            out = out.concat( txParameters( theseOrigins, count + 1, cont ) )
                            out = out.concat( expandOrigin(theseOrigins, count + 1, [...cont, last]))
                            if( last !== "link"){
                                out = out.concat( expandOrigin(theseOrigins, count + 1, [...cont, "link"]) )
                            }
                        }
                    }
                    const questions = uniquePrimitives(uniquePrimitives(nodes.map(d=>d.parentPrimitives).flat()).filter(d=>d.type === "prompt").map(d => d.origin))
                    if( questions.length > 0 ){

                        const labels = questions.map(d=>d.title)
                        const values = questions.map(d=>d.id)
                        const mapped = questions.map(d=>d.primitives.allPrompt.map(d2=>[d2.id, d.id])).flat()
                        
                        out.push( {type: 'question', subtype:"question", map:mapped, title: `Source question`, access: count, relationship: path, values: values, order: values, labels: labels})
                    }
                    const search = uniquePrimitives(nodes.map(d=>d.parentPrimitives).flat()).filter(d=>d.type === "search")
                    if( search.length > 0 ){

                        const labels = search.map(d=>d.title)
                        const values = search.map(d=>d.id)
                        const mapped = search.map(d=>[d.id, d.id])
                        
                        out.push( {type: 'question', subtype:"search", map:mapped, title: `Source search`, access: count, relationship: path, values: values, order: values, labels: labels})
                    }

                    return out
            }
            if( !options.excludeOrigin ){
                out = out.concat( expandOrigin(items, 0, "origin") )
                out = out.concat( expandOrigin(items, 0, "link") )
            }
        }
        const final = out.filter((d, idx, a)=>{
            return (d.type !== "category" ) || (d.type === "category" && a.findIndex((d2)=>(d2.primitiveId === d.primitiveId) && (d.access === d2.access)) === idx)
        })
        const labelled = final.map((d,idx)=>{return {id:idx, ...d}})
        return labelled
    }
    static axisExtents(interim, axis, field){
        const bucket = {
            "raw":(field)=>{
                let out = interim.map((d)=>d[field]).filter((v,idx,a)=>a.indexOf(v)===idx).sort()
                return {labels: out, order: out, values: out.map((d,i)=>({idx: d, label: d === undefined ? "None" : d}))}
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
                const brackets = [0,100000,500000,1000000,5000000,15000000,50000000,100000000,200000000,500000000,1000000000]
                const labels = brackets.map((d,i,a)=>i === 0 ? "Unknown" : `${roundCurrency(a[i-1])} - ${roundCurrency(d)}`)
                const mins = brackets.map((d,i,a)=>i === 0 ? undefined : a[i-1])
                const max = brackets.map((d,i,a)=>d)
                interim.forEach((d)=>{
                    d[field] = labels[ brackets.filter((d2)=>d2 < d[field]).length ]
                })
                return {labels: labels, order: labels, values: labels.map((d,i)=>({idx: d, label: d, bucket_min: mins[i], bucket_max: max[i]}))}
            },
            "currency": (field)=>{
                const brackets = [0,100000,500000,1000000,5000000,15000000,50000000,100000000,200000000,500000000,1000000000]
                const labels = brackets.map((d,i,a)=>`${roundCurrency(i > 0 ? a[i-1] : 0)} - ${roundCurrency(d)}`)

                const mins = brackets.map((d,i,a)=>i === 0 ? 0 : a[i-1])
                const max = brackets.map((d,i,a)=>d)

                interim.forEach((d)=>{
                    d[field] = labels[brackets.filter((d2)=>d2 < d[field]).length]
                })
                //return {labels: labels, bucket_min: mins, bucket_max: max, order: labels, values: labels.map((d,i)=>({idx: d, label: d}))}
                return {labels: labels, order: labels, values: labels.map((d,i)=>({idx: d, label: d, bucket_min: mins[i], bucket_max: max[i]}))}
            },
            "number": (field)=>{
                const bucketCount = 10
                const hasValues = interim.filter(d=>d[field]).sort((a,b)=>a[field] - b[field])

                const totalItems = hasValues.length 
                const itemsPerBucket = Math.ceil(totalItems / bucketCount)
                
                let bucket = 0, count = 0
                const mins = []
                const max = []
                const mapped =  {}

                let labels =  new Array(bucketCount).fill(0).map((_,i)=>`Bucket ${i}`)
                let last = undefined
                hasValues.forEach(d=>{
                    mapped[d.primitive.id] = bucket
                    if( count === 0){
                        mins[bucket ] = d[field]
                    }else{
                        max[bucket ] = d[field]
                    }
                    count++                    
                    if( count === itemsPerBucket){
                        count = 0
                        bucket++
                    }
                })

                labels = labels.map((d,i)=>`${mins[i]} - ${max[i]}`)

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
            }
        }

        let out 
        if( axis.type === "none"){
            out = {labels: axis.labels, values: [{idx: undefined, label: ""}], order: axis.order}
        }else if( axis.type === "category"){
            out = {
                values: MainStore().primitive(axis.primitiveId).primitives?.allUniqueCategory.map((d,i)=>({idx: d.id, label:d.title})) ?? [],
            }
        }else{
            const parser = bucket[axis.passType]
            if( !parser ){
                console.log(axis)
                throw `Cant pass axis ${axis.passType}`
            }
            out = parser(field)
        }        
        return {
            ...out,
            values: out.values.map(d=>({...d, idx: d.idx, label: Array.isArray( d.label ) ? d.label.join(", ") : d.label}))
        }
    }
    static mapCollectionByAxis(list, column, row, others, viewPivot){
        const _pickProcess = ( option )=>{
            if( option ){
                if( option.type === "category"){
                    return (p)=>{
                        let candidates = option.relationship ? [p] : p.relationshipAtLevel(option.relationship, option.access)
                        let matches = candidates.flatMap(d=>d.parentPrimitives.filter(d=>d.parentPrimitiveIds.includes(option.primitiveId))).filter(d=>d)
                        if( matches.length > 0 ){
                            return uniquePrimitives(matches).map(d=>d.id)
                        }
                        return "_N_"
                    
                        //candidates = MainStore().uniquePrimitives(candidates.map(d=>d.parentPrimitives).flat())

                        /*
                        let item = p
                        let candidates = [p]
                        
                        for(let i = 0; i < option.access; i++ ){
                            candidates = MainStore().uniquePrimitives(candidates.map(d=>d.parentPrimitives).flat())
                        }
                        
                        item = candidates.filter(d=>d.parentPrimitiveIds.filter(d=>option.order.includes(d)).length > 0)?.[0]

                        if( !item ){return "_N_"}//}undefined}

                        const matches = item.parentPrimitiveIds.map((d)=>option.order?.indexOf(d)).filter((d,i,a)=>d !== -1 && a.indexOf(d)===i).sort()
                        if( matches.length === 0){
                            return "_N_"
                        }
                        return matches.map(d=>option.order[d])*/
                    }
                }else if( option.type === "contact"){
                    return (d)=>d.origin.referenceParameters?.contactId
                }else if( option.type === "type"){
                    return (p)=>{
                        let item = p
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                        return item?.referenceId
                    }
                }else if( option.type === "title"){
                    return (p)=>{
                        let item = p
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                        return item?.title
                    }
                }else if( option.type === "question"){
                    return (d)=> {
                        let item = d
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                        if( !item ){return undefined}
                        const hits = option.map.filter(d2=>d.parentPrimitiveIds.includes(d2[0]))
                        return hits.map(d=>d[1]).filter((d,i,a)=>a.indexOf(d)===i)[0]
                    }
                }else if( option.type === "parameter"){
                    if( option.parameterType === "options"){
                        return (d)=>{
                            let item = d
                            item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                            if( !item ){return undefined}
                            const orderedOptions = item.metadata?.parameters[option.parameter]?.options
                            if( orderedOptions){
                            const values =  [item.referenceParameters[option.parameter]].flat()
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
                        item = option.relationship ? item.relationshipAtLevel(option.relationship, option.access)?.[0] : item.originAtLevel( option.access)
                        if( !item ){return undefined}
                        let value = item?.referenceParameters[option.parameter]
                        if( option.parameterType === "number" && typeof(value) === "string"){
                            value = parseFloat(value)
                        }
                        if( option.parameterType === "boolean"){
                        }
                        return value
                    }
                }
            }
            return (p)=>""
        }

        let interim = list.map((p)=>{
            return {
                primitive: p,
                column: column ? _pickProcess(column)(p) || undefined : undefined,
                row: row ? _pickProcess(row)(p) || undefined : undefined,
                ...((others ?? []).reduce((a,d,idx)=>{
                    a[`filterGroup${idx}` ] = _pickProcess(d)(p) || undefined
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
        
        let list = CollectionUtils.filterCollection( data, filters)
        let outColumns
        let outRows

        if( options.columns  ){
            outColumns = options.columns.filter(d=>!colFilter.includes(d.idx) )
        }
        if( options.rows  ){
            outRows = options.rows.filter(d=>!rowFilter.includes(d.idx) )
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

    static applyFilter(list, field, items){

        const partial = field === "column" || field === "row"

        const removeList = new Set()

        items = [items].flat()
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
    }
    static primitiveAxis( primitive, axisName){
        let axis 
        if( axisName === "column" || axisName === "row"){
            axis = primitive.referenceParameters?.explore?.axis?.[axisName]
        }else{
            axis = primitive.referenceParameters?.explore?.filters?.find(d=>d.track === axisName)
        }
        if( axis ){
            if( ["question", "parameter", "title", "type"].includes(axis.type)){
                return {filter: {},...axis, passType: this.passTypeMap[axis.type] ?? "raw"}
            }
            const connectedPrim = isNaN(axis) ? primitive.primitives.axis[axisName].allIds[0] : primitive.referenceParameters.explore.filters[axisName].sourcePrimId
            if( connectedPrim ){
                return {filter: {}, ...axis, primitiveId: connectedPrim}
            }
        }
        return {type: "none", filter: {}}

    }
    static findAxisItem(primitive, axis, axisOptions){
        if( primitive ){
            const struct =  isNaN(axis) ?  primitive.referenceParameters?.explore?.axis?.[axis] : primitive.referenceParameters?.explore?.filters?.[axis]
            if( struct ){
                if(struct.type === "parameter" ){
                    return axisOptions.find(d=>d.type === struct.type && d.parameter === struct.parameter && MainStore().equalRelationships(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
                }else if(struct.type === "question" ){
                    return axisOptions.find(d=>d.type === struct.type &&  MainStore().equalRelationships(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0) && (d.subtype === struct.subtype))?.id ?? 0
                }else if(struct.type === "title"  || struct.type === "type" ){
                    return axisOptions.find(d=>d.type === struct.type &&  MainStore().equalRelationships(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
                }
                const connectedPrim = isNaN(axis) ? primitive.primitives.axis[axis].allIds[0] : primitive.referenceParameters.explore.filters[axis].sourcePrimId
                return axisOptions.find(d=>d.type === struct.type && d.primitiveId === connectedPrim && MainStore().equalRelationships(d.relationship, struct.relationship) && (d.access ?? 0) === (struct.access ?? 0))?.id ?? 0
            }
            return 0
        }
    }
}

export default CollectionUtils