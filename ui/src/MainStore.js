import PrimitiveParser from "./PrimitivesParser";

let instance = undefined
function MainStore (prims){
    if( !prims && instance ){
        return instance
    }
    let obj = {
        id:  Math.floor(Math.random() * 99999),
        callbacks: {},
        types: ["hypothesis", "learning","activity","experiment","question", "evidence"],
        ajaxResponseHandler(result){
            if( result.success){
                return true
            }            
            console.warn(result)
        },
        stateInfo: {
            "experiment":{
                "open": {title: "Not started", colorBase: "blue"},
                "active": {title: "Underway", colorBase: "amber"},
                "closed": {title: "Completed", colorBase: "green"},
            },
            default: {
                "open": {title: "Open"},
                "closed": {title: "Closed"},
            }
        },
        controller: {
            async createPrimitive(object, parent, paths){
                const data = {
                    parent: parent.id,
                    data: object,
                    paths: paths
                }
                let newId

                await fetch("/api/add_primitive",{
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                })
                .then(res => res.json())
                .then(
                  (result) => {
                    if( obj.ajaxResponseHandler( result )){
                        console.log(result)
                        newId = result.id
                    }
                  },
                  (error) => {
                    console.warn(error)
                  }
                )
               return newId 
            },
            updateTitle( receiver, title){
                const data = {
                    receiver: receiver.id,
                    title: title
                }
                fetch("/api/set_title",{
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                })
                .then(res => res.json())
                .then(
                  (result) => {
                    if( obj.ajaxResponseHandler( result )){
                        obj.triggerCallback("set_title", [receiver])
                    }
                  },
                  (error) => {
                    console.warn(error)
                  }
                )

            },
            moveRelationship( receiver, target, from, to ){
                const data = {
                    receiver: receiver.id,
                    target: target.id,
                    from: from,
                    to: to
                }
                console.log(data)
                console.log( JSON.stringify(data) )
                fetch("/api/move_relationship",{
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                })
                .then(res => res.json())
                .then(
                  (result) => {
                    if( obj.ajaxResponseHandler( result )){
                        obj.triggerCallback("relationship_update", [receiver, target])
                    }
                  },
                  (error) => {
                    console.warn(error)
                  }
                )
            },
            setRelationship( receiver, target, path, set ){
                const data = {
                    receiver: receiver.id,
                    target: target.id,
                    path: path,
                    set: set
                }
                fetch("/api/set_relationship",{
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                })
                .then(res => res.json())
                .then(
                  (result) => {
                    if( obj.ajaxResponseHandler( result )){
                        obj.triggerCallback("relationship_update", [receiver, target])
                    }
                  },
                  (error) => {
                    console.warn(error)
                  }
                )
            }
        },
        metricResolver:{
                get(target, prop, receiver) {
                    if( prop in target.metric ){
                        const value = target.metric[prop];
                        if (value instanceof Function) {
                            return function (...args) {
                                return value.apply(target.metrics, args);
                            };
                        }
                        return value
                    }
                    if( prop === "analysis" ){
                        const collapse = true
                        const options = [
                            {
                                default: "Unknown", id: "contactExpertise", title: "By expertise", project: (item)=>{
                                    const contactId = item.referenceParameters?.contactId
                                    if( contactId === undefined){
                                        return undefined
                                    }
                                    return obj.contact(contactId)?.expertise
                                    
                                }
                            },
                            {
                                id: "contactDomain", title: "By domain expertise", project: (item)=>{
                                    const contactId = item.referenceParameters?.contactId
                                    if( contactId === undefined){
                                        return undefined
                                    }
                                    return obj.contact(contactId)?.domains
                                    
                                }
                            },
                            {
                                id: "companySector", title: "By company sector", project: (item)=>{
                                    const companyId = item.referenceParameters?.companyId
                                    if( companyId === undefined){
                                        return undefined
                                    }
                                    return obj.company(companyId)?.sector
                                    
                                }
                            },
                            {
                                default: "Unknown", id: "companyTurnover", title: "By company turnover", project: (item)=>{
                                    const companyId = item.referenceParameters?.companyId
                                    if( companyId === undefined){
                                        return undefined
                                    }
                                    let turnover = obj.company(companyId)?.turnover

                                    if( turnover === undefined){return "Unknown"}
                                    if( turnover.amount < 1000000){
                                        return "< $1m"
                                    }else if( turnover.amount < 10000000){
                                        return "$1m-$10m"
                                    }else if( turnover.amount < 100000000){
                                        return "$10m-$100m"
                                    }else if( turnover.amount < 500000000){
                                        return "$100m-$500m"
                                    }else if( turnover.amount < 1000000000){
                                        return "$500m-$1b"
                                    }else if( turnover.amount < 10000000000){
                                        return "$1b-$10b"
                                    }else if( turnover.amount >= 10000000000){
                                        return "$10b+"
                                    }
                                    
                                }
                            }
                        ]
                        let value = receiver.value
                        if( value === undefined){return undefined}
                        if( !(value instanceof Array)){
                            value = [value]
                        }

                        return options.map((option)=>{
                            let outcomes = value.map((v)=>{
                                if( v.list === undefined){return undefined}
                                let projections = v.list.reduce((o, d)=>{
                                    let projection = option.project(d)
                                    if( projection === undefined ){
                                        if( option.default ){
                                            projection = option.default
                                        }else{
                                            return o
                                        }
                                    }
                                    [projection].flat().forEach((p)=>{
                                        o.byP[p] = o.byP[p] || []
                                        o.byP[p].push(d)
                                        o.byI[d.id] = o.byI[d.id] || []
                                        o.byI[d.id].push(p)
                                    })
                                    return o
                                }, {byP:{}, byI:{}})

                                if( collapse ){
                                    const ordered = Object.keys(projections.byP).sort((a,b)=>projections.byP[b].length - projections.byP[a].length)
                                    const startTotal = Object.values(projections.byP).flat().length

                                    Object.keys(projections.byI).forEach((i)=>{
                                        projections.byI[i] = projections.byI[i].sort((a,b)=>ordered.indexOf(a) - ordered.indexOf(b))[0]
                                    })
                                    Object.keys(projections.byP).forEach((p)=>{
                                        projections.byP[p] = projections.byP[p].filter((item)=>projections.byI[item.id] === p)
                                        if(projections.byP[p].length === 0){
                                            delete projections.byP[p]
                                        }
                                    })
                                    const endTotal = Object.values(projections.byP).flat().length
                                }
                                projections = projections.byP


                                return Object.keys(projections).length > 0 ? {
                                    relationship: v.relationship,
                                    relationshipConfig: v.relationshipConfig,
                                    count: v.count,
                                    target: v.target,
                                    met: v.met,
                                    data: projections
                                } : undefined
                            }).filter((d)=>d)
                            return (outcomes && outcomes.length > 0) ? {
                                id: option.id,
                                title: option.title,
                                data: outcomes
                            } : undefined
                        }).filter((d)=>d)
                    }
                    if( prop === "value" ){
                        let metric = target.metric
                        let prims = target.parent.primitives.fromPath(metric.path)
                        let counts
                        let filter_empty = false

                        if( metric.type === "conversion" || metric.type === "count"){
                            if( prims === undefined){
                                counts = [{count: 0, list: []}]
                            }else{

                                if( metric.type === "conversion" ){
                                    if( Object.keys(metric.path)[0] !== "results"){return undefined}
                                    
                                    let relationships = target.parent.metadata?.resultCategories[Object.values(metric.path)[0]].relationships
                                    Object.keys(relationships).forEach((k)=>{
                                        if( !prims[k] ){
                                            prims[k] = []
                                        }
                                    })
                                    
                                    counts = Object.keys(prims).map((k)=>({relationship: k, list: prims[k].allItems, count: prims[k].length, relationshipConfig: relationships[k]})).sort((a,b)=>relationships[b.relationship].order - relationships[a.relationship].order)
                                    counts = counts.map((v, idx, a)=>{
                                        if( idx > 0 ) {
                                            v.count += a[idx - 1].count
                                        }
                                        return v
                                    }).reverse()                            
                                }else if( metric.type === "count" ){
                                    let by_reln = metric.targets || metric.by_relationship
                                    counts = by_reln ? Object.keys(prims).map((k)=>({relationship: k, list: prims[k].allItems, count: prims[k].length})) : {count: prims.allIds.length, list: prims.allItems}
                                    filter_empty = true
                                }
                                
                            }
                            if( metric.targets ){
                                counts = counts.filter((d)=>{
                                    let mt = metric.targets.find((d2)=>d2.relationship === d.relationship)
                                    if( mt ){
                                        d.target = mt.value
                                        d.met = d.count >= d.target
                                        return true
                                    }
                                    return !filter_empty
                                })
                            }
                            return counts
                        }
                    }
                }
        },
        component:function(id){
            return this.components().find((d)=>d.id === id)
        },
        components:function(){
            if( obj._cache_vf === undefined){
                obj._cache_vf = vf_temp.map((d)=>primitive_access(d, "component"))
            }
            return obj._cache_vf
        },
        addPrimitive:function(data){
            if( obj._cache_prim === undefined){
                obj.primitives()                
            }
            obj.data.primitives.push(data)
            obj._cache_prim.push(primitive_access(data,"primitive"))

        },
        primitives:function(){
            if( obj._cache_prim === undefined){
                obj._cache_prim = (prims || obj.data.primitives).map((p)=>primitive_access(p,"primitive"))
            }
            return obj._cache_prim
        },
        primitiveByPlain:function(id){
            let data = obj.primitives().find((p)=>p.plainId === id)
            return data
        },
        primitive:function(id){
            let data = obj.primitives().find((p)=>p.id === id)
            if( !data ){
                data = this.primitiveByPlain(id)
                if( data ){
                    console.warn(`Primitive lookup ${id} by plainId`)
                }
            }
                if( data === undefined){
                    console.warn(`Primitive lookup ${id} found nothing`)
                }
            return data
        },
        categories:function(){
            return obj.data.categories
        },
        category:function(id){
            return this.categories().find((d)=>d.id === id)
        },
        companies:function(){
            return this.data.companies
        },
        company:function(id){
            return this.companies().find((d)=>d.id === id)
        },
        contacts:function(){
            return this.data.contacts
        },
        contact:function(id){
            return this.contacts().find((d)=>d.id === id)
        },
        user:function(id){
            return this.users().find((d)=>d.id === id)
        },
        users:function(){
            return this.data.users
        },
        deregisterCallback:function(id){
            let store = this
            Object.keys(store.callbacks).forEach((key)=>{
                store.callbacks[key] = store.callbacks[key].filter((e)=>e.id !== id)
            })
        },     
        registerCallback:function(id, events, cb, idList){
            let store = this
            if( id === null || id === undefined){
                this.callback_tracker = (this.callback_tracker || 0) + 1
                id = this.callback_tracker
            }
            ;[events].flat().forEach((e)=>{
                if( store.callbacks[e] === undefined){
                    store.callbacks[e] = []
                }
                store.callbacks[e] = store.callbacks[e].filter((d)=>d.id !== id)
                store.callbacks[e].push({callback: cb, filterIds: [idList].flat(), id: id})
               // console.log(`registered ${e} for ${id} (${store.callbacks[e].length}) / ${[idList].flat().join(", ")}`)
            })
            return id
        },
        triggerCallback:function(e, items){
            let store = this
            if( this.callbacks[e] === undefined){
                return
            }
            items = [items].flat()//.map((id)=>store.primitive(id))
            this.callbacks[e].forEach((e)=>{
                if( e.filterIds ){
                    items = items.filter((item)=>e.filterIds.includes(item.id))
                    if( items.length === 0){
                        return
                    }
                }
                e.callback(items, e)
            })

        },
        createPrimitive:function( options ){
            let {title = "New item", type = "result", state = undefined, parent = undefined, parentPath = undefined, categoryId = undefined } = options
            let category = categoryId ? this.category( categoryId ) : undefined

            let paths = [
                "origin"
            ]

            if( type === "result"){
                if( category && parent && parent.metadata){
                    const match = parent.metadata.resultCategories.find((d)=>d.resultCategoryId === categoryId) 
                    if( match === undefined){
                        throw new Error(`Cant add result with category ${categoryId} to Prim #${parent.plainId}`)
                    }                    
                    if( match.relationships ){
                        paths.push({results: {[match.id]: Object.keys(match.relationships)[0]}})
                    }else{
                        paths.push({results: match.id})
                    }
                }else{
                    throw new Error(`Cant add result with category ${categoryId} to Prim #${parent.plainId}`)
                }
            }
            console.log(`paths: `, paths)

            let data = {
                plainId:  Math.floor(Math.random() * 99999),
                title: title,
                type: type,
                state: state,
                primitives: [],
                referenceId: categoryId,
                referenceParameters: {},
                users: {owner: [this.activeUser.id], other: []}
            }
            const newId = this.controller.createPrimitive(data, parent, paths)
            data._id = newId
            this.addPrimitive( data )
            
            if( parent ){
                paths.forEach((p)=>{
                    parent.addRelationship( data, p, true)
                })
            }

        }
    }

    obj.structure = PrimitiveParser(obj)

    if( !prims ){
        instance = obj
    }
    const uniquePrimitives = (list)=>{
        let ids = {}
        return list.filter((p)=>{
            if(p=== undefined){console.warn(`undefined prim`)}
            if( ids[p.id] ){return false}
            ids[p.id] = true
            return p
        })
    }
    const primitive_access = (d, type)=>{
        if( d._id){
            d.id = d._id
        }
        return new Proxy(d, {
            set(d, prop, value, receiver) {
                if( prop === "title"){
                    d.title = value
                    obj.controller.updateTitle( receiver, value)
                }
            },
            get(d, prop, receiver) {
                if( prop === "primitives"){
                    return new Proxy( d.primitives || [], obj.structure )
                }
                if( prop === "plainId"){
                    return d.plainId
                }
                if( prop === "referenceParameters"){
                    return d.referenceParameters || {}
                }
                if( prop === "addRelationship"){
                    return function( target, path, skip = false ){
                        if( receiver.primitives.add( target.id, path )){
                            if( !skip ){
                                obj.controller.setRelationship( receiver, target, path, true )
                            }
                        }
                    }
                }
                if( prop === "moveRelationship"){
                    return function( target, from, to ){
                        if( receiver.primitives.move( target.id, from, to) ){
                            obj.controller.moveRelationship( receiver, target, from, to)
                        }
                    }
                }
                if( prop === "toggleRelationship"){
                    return function( target, metric ){
                        let anchor = receiver.primitives.fromPath(metric.path)
                        let result
                        let path = metric.path

                        if( ! (anchor instanceof Array) ){
                            let k = 'positive' //Object.keys(targetList)[0]
                            anchor = anchor[k]
                            if( !anchor ){
                                console.warn(`Cant find 'positive' in list`)
                                return undefined
                            }
                            const rebuild = (node, k)=>{
                                let o = {}
                                if( node instanceof Object ){
                                    let tk = Object.keys(node)[0]
                                    o[tk] = rebuild( node[tk], k )
                                }else{
                                    o[node] = k
                                }
                                return o
                            }
                            path = rebuild(path, k)
                        }

                        const oldRelationship = anchor.includes( target.id )
                        if( oldRelationship ){
                            result = anchor.remove( target.id ) 
                        }else{
                            result = anchor.add( target.id) 
                        }
                        if( result ){
                            obj.controller.setRelationship( receiver, target, path, !oldRelationship )

                        }
                        return anchor
                    }
                }
                if( prop === "master_type"){
                    return type
                }
                if( prop === "stateInfo"){
                    return (obj.stateInfo[d.type] || obj.stateInfo["default"])[d.state] || {title: undefined }
                }
                if( prop === "isTask"){
                    return d.type === "activity" || d.type === "experiment"
                }

                if( prop === "metadata"){
                    return obj.categories().find((p)=>p.id === d.referenceId )
                }

                if( prop in obj.types){
                    return receiver.primitives[type]
                }
                if( type === "primitive"){
                    if( prop === "metrics"){
                        if(!d.metrics){ return undefined}
                        return d.metrics.map((m)=>{
                            return new Proxy({parent: receiver, metric: m}, obj.metricResolver)
                        })
                    }
                    if( prop === "users"){
                        if( d.users === undefined){return []}
                        let id_list = Object.values(d.users).flat()
                        return obj.users().filter((d)=>id_list.includes(d.id))
                    }
                    if( prop === "origin"){
                        let origin = receiver.parentPrimitiveRelationships["origin"]
                        if( origin ){
                            return origin[0]
                        }
                    }
                    if( prop === "originId"){
                            return receiver.origin?.id
                    }
                    if( prop === "originTask"){
                        let origin = receiver.origin
                        if( origin ){
                            if( ["experiment","activity"].includes(origin.type) ){
                                return origin
                            }
                            return origin.findParentPrimitives({type: ["experiment", "activity"]})[0]
                        }
                        return undefined
                    }
                    if( prop === "parentLevelIds"){
                        return receiver.parentLevels.map((d)=>d.id)
                    }
                    if( prop === "parentLevels"){
                        return obj.components().map((c)=>c.levels.filter((l)=>l.primitives && l.primitives.includes(d.id))).flat()
                    }
                    if( prop === "parentPrimitives"){
                        return obj.primitives().filter((t)=>t.primitives.includes(d.id))
                    }
                    if( prop === "parentPrimitiveIds"){
                        return receiver.parentPrimitives.map((d)=>d.id)
                    }
                    if( prop === "parentPrimitiveRelationships"){
                        return receiver.parentPrimitives.reduce((o, p)=>{
                            let rels = [receiver.parentRelationship(p)].flat()
                            rels.forEach((rel)=>{
                                o[rel] = o[rel] || []
                                o[rel].push( p )
                            })
                            return o
                        }, [])
                    }
                }
                if( prop === "displayType"){
                    return d.type.charAt(0).toUpperCase() + d.type.slice(1)
                }
                if( prop === "findParentPrimitives"){
                    return function(options = {type: undefined, first: false}){
                        const scatter = (list)=>{
                            if( list === undefined){ return []}
                            let expanded = list.map((p)=>p.parentPrimitives).flat()
                            let out = uniquePrimitives( expanded )
                            return out
                        }
                        let found = []
                        let current = scatter( [receiver] )
                        
                        while( current.length > 0){
                            if( options.type === undefined ){
                                found = [...found, ...current]
                            }else{
                                found = [...found, ...current.filter((p)=>options.type.includes(p.type))]                        
                            }
                            if( options.first && found.length > 0 ){
                                return found
                            }
                            current = scatter( current )
                        }
                        return found
                    }
                }
                if( prop === "parentRelationship"){
                    return function( parent ){
                        if( !(parent instanceof(Object)) ){
                            parent = obj.primitive(parent)
                        }
                        return parent.primitives.relationships( d.id )
                    }
                }
                if( prop in d){
                    return d[prop]
                }
            }
        })
    }    
    obj.data = {}

    obj.loadData = async function(){
        return new Promise((resolve)=>{
            const users = fetch('/api/users').then(response => response.json())
            const companies = fetch('/api/companies').then(response => response.json())
            const contacts = fetch('/api/contacts').then(response => response.json())
            const categories = fetch('/api/categories').then(response => response.json())
            const primitives = fetch('/api/primitives').then(response => response.json())
            
            Promise.all([users,companies,contacts,categories,primitives]).then(([users, companies,contacts, categories,primitives])=>{
                obj.data.users = users
                obj.data.companies = companies
                obj.data.contacts = contacts
                obj.data.categories = categories
                obj.data.primitives = primitives

                obj.activeUser = obj.data.users[0]
                resolve(true)
            })
        })
    }
    
    return obj
}



export default MainStore



const vf_temp = 
[
    {
        "id": 489,
        "order": 0,
        "title": "Problem",
        "description": "Customer pain points, unmet needs, opportunity areas",
        "currentLevel": 3891,
        primitives:[4417,4418,4430,4421],
        "levels": [
            {
                "id": 3888,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3889,
                "title": "Have an inkling for a potential unmet need in the market based on something we discovered",
                "score": 1,
                "target": true,
                "phase_id": 184
            },
            {
                "id": 3890,
                "title": "Understand where unmet need fits into user flow and what is of value to users",
                "score": 2,
                "target": false,
                "phase_id": 185
            },
            {
                "id": 3891,
                "title": "Heard the same pain point(s) consistently from market representatives, validating unmet need",
                "score": 3,
                "target": true,
                "phase_id": 185,
            },
            {
                "id": 3892,
                "title": "Engaged candidate customers and have more nuanced understanding of their problems and honed in on unmet need(s) to prioritize",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3893,
                "title": "Qualified scale of customer pain and motivation/ability to change behavior with candidate customers",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3894,
                "title": "Quantitatively validated prioritized unmet need(s) with larger sample of target customers",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3895,
                "title": "Engaged target customers who are motivated to help inform solution design & development",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3896,
                "title": "Have clear evidence that POC/MVP solution addresses unmet need",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 490,
        "order": 1,
        "title": "Solution",
        "description": "Value proposition, demand signals, and willingness to buy",
        "currentLevel": 3899,
        "levels": [
            {
                "id": 3897,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3898,
                "title": "Have an idea/conceptual solution to address unmet need",
                "score": 2,
                "target": false,
                "phase_id": 185
            },
            {
                "id": 3899,
                "title": "Can clearly articulate core thesis around solution and value proposition  ",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3900,
                "title": "Engaged candidate customers and validated benefits/value proposition, refined core thesis",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3901,
                "title": "Confirmed target customers' willingness to pay/use for our specific value proposition",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3902,
                "title": "Have commitments in place from initial customers/users",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3903,
                "title": "Onboarded first POC/Beta customers and validated the benefits/value proposition",
                "score": 8,
                "target": false,
                "phase_id": 187,
            },
            {
                "id": 3904,
                "title": " Demonstrating quantifiable value with MVP solution and have first revenues or commitments to pay",
                "score": 9,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3905,
                "title": "Have repeat/sticky customers and high engagement metrics/NPS",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 491,
        "order": 2,
        "title": "Targeting",
        "description": "Customer segments, target market",
        "currentLevel": 3908,
        "primitives": [
            4425,
        ],
        "levels": [
            {
                "id": 3906,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3907,
                "title": "Have an initial view of who our top market segments will be",
                "score": 2,
                "target": false,
                "phase_id": 185
            },
            {
                "id": 3908,
                "title": "Identified the potential market segments we can address and developed a representative customer persona",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3909,
                "title": "Engaged with and researched a cross-section of potential target customers",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3910,
                "title": "Determined our priority/target customer segment(s) and developed a more specific customer persona",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3911,
                "title": "Meaningfully engaged with users/customers in our initial target segment(s) and refined our qualifying parameters",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3912,
                "title": "Actively working with a representative set of early adopters from our initial target segment(s)",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3913,
                "title": "Can more clearly define core customer persona(s) based on use of solution, analytics, and regular customer interviews",
                "score": 9,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3914,
                "title": "Have a mature understanding of target segment(s) and actively exploring/prioritizing secondary segments to grow into",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 492,
        "order": 3,
        "title": "Positioning",
        "description": "Competitive landscape, differentiation and positioning, superiority of product, brand",
        "currentLevel": 3917,
        "levels": [
            {
                "id": 3915,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3916,
                "title": "Have an initial view of our primary competitors and points of differentiation",
                "score": 2,
                "target": false,
                "phase_id": 185
            },
            {
                "id": 3917,
                "title": "Understand the broad competitive landscape and identified the gap in the market for our proposition ",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3918,
                "title": "Have a clear view of the key competitors and their offerings and can communicate a differentiated proposition",
                "score": 4,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3919,
                "title": "Can clearly communicate our differentiation in collateral",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3920,
                "title": "Target customers and/or key stakeholders validate our stated differentiation",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3921,
                "title": "Refined our positioning based on feedback and deeper engagement with target customers",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3922,
                "title": "Target customers are responding positively to our differentiation and positioning relative to competition",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3923,
                "title": "Have clear evidence that target customers select our proposition over competition because of our differentiation",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 493,
        "order": 4,
        "title": "TAM",
        "description": "Size of the prize, market opportunity",
        "currentLevel": 3926,
        "levels": [
            {
                "id": 3924,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3925,
                "title": "Have an initial view of the market opportunity that this business addresses",
                "score": 1,
                "target": true,
                "phase_id": 184
            },
            {
                "id": 3926,
                "title": "Have market data which demonstrates market size/customer spend in this space",
                "score": 2,
                "target": false,
                "phase_id": 185
            },
            {
                "id": 3927,
                "title": "Built a high-level model to estimate total addressable market opportunity",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3928,
                "title": "Validated some key assumptions with target customers and through secondary research about spend on this problem today/ likely in the future",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3929,
                "title": "Refined high-level top down and bottom up models to estimate initial market size and total addressable market size",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3930,
                "title": "Have strong validation of initial market opportunity estimates and clear rationale about growth opportunities beyond initial target market",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3931,
                "title": "Have detailed models and validated supporting data/insights to estimate TAM of initial market and growth opportunities",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3932,
                "title": "Base TAM estimates/forecasts on our own data in addition to external data",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 494,
        "order": 5,
        "title": "Revenue",
        "description": "Revenue streams, pricing model",
        "currentLevel": 3935,
        "levels": [
            {
                "id": 3933,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3934,
                "title": "Have an initial view of likely revenue streams",
                "score": 2,
                "target": false,
                "phase_id": 185
            },
            {
                "id": 3935,
                "title": "Identified potential revenue streams and have a view of basic terms",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3936,
                "title": "Explored market expectations and competitors and selected our prefered revenue structures",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3937,
                "title": "Validated our revenue structures with the market and have initial view on pricing",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3938,
                "title": "Engaged early customers with our initial revenue structures and are gathering feedback/running tests on pricing models",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3939,
                "title": "Set initial pricing and secured first revenues",
                "score": 9,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3940,
                "title": "Have stable revenue structures, refined pricing, and initial view of trial/onboarding terms",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 495,
        "order": 6,
        "title": "Funding",
        "description": "Investment requirements, financial model, ROI",
        "currentLevel": 3942,
        "levels": [
            {
                "id": 3941,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3942,
                "title": "Have a tactical plan and budget for Signals and a conceptual plan for MVP",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3943,
                "title": "Have an initial list of key revenue and cost drivers",
                "score": 4,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3944,
                "title": "Have a preliminary financial model forecasting high level revenues and costs",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3945,
                "title": "Can clearly articulate the needed resources for the MVP/POC phase that align with our financial model",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3946,
                "title": "Refined the financial model with more granular and validated view of revenue and cost drivers",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3947,
                "title": "Have a breakdown of cost items validated externally for the next stage of growth and a financial model aligned with our roadmap",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3948,
                "title": "Have data points that enable us to accurately forecast costs for our next period of growth",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 496,
        "order": 7,
        "title": "Growth",
        "description": "Acquisition costs, unit economics, and growth metrics",
        "currentLevel": 3949,
        "levels": [
            {
                "id": 3949,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3950,
                "title": "Have an initial view on relevant acquisition strategies and costs",
                "score": 4,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3951,
                "title": "Successfully engaged target customers via direct outreach/networking",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3952,
                "title": "Have a point of view on relevant acquisition strategies and have a testing plan to validate them",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3953,
                "title": "Ran initial tests on relevant acquisition strategies and determined which to prioritize",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3954,
                "title": "Acquired early customers via repeatable acquisition strategies and set baseline of acquisition costs and unit economics",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3955,
                "title": "Ran larger-scale acquisition tests, achieved growth and refined acquisition cost estimates",
                "score": 9,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3956,
                "title": "Refined tactics and lowered acquisition costs; can articulate path to scalable growth and profitable unit economics",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 497,
        "order": 8,
        "title": "Team",
        "description": "Domain expertise & Management Team",
        "currentLevel": 3959,
        "levels": [
            {
                "id": 3957,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3958,
                "title": "Have access to resources & individuals with sufficient domain expertise to identify broad needs/opportunity areas",
                "score": 1,
                "target": true,
                "phase_id": 184
            },
            {
                "id": 3959,
                "title": "Have access to resources that can identify/validate customer problems and have initial view of future needs/gaps",
                "score": 2,
                "target": false,
                "phase_id": 185
            },
            {
                "id": 3960,
                "title": "Have a high level understanding of the domain and key risks & requirements to be mindful of",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3961,
                "title": "Have sufficient domain expertise to be seen as credible and to develop a plan to address key risks for our MVP/POC",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3962,
                "title": "Have sufficient domain & operational expertise to deliver initial MVPs/POCs and overcome regulatory/legal constraints",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3963,
                "title": "Have identified and filled key roles on the team and are building the breadth and depth of our domain expertise",
                "score": 9,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3964,
                "title": "Have all key roles and functions to run the venture, including delivery partners, and can articulate hiring needs to support growth",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 498,
        "order": 9,
        "title": "Capability",
        "description": "Technology capabilities and intellectual property",
        "currentLevel": 3966,
        "levels": [
            {
                "id": 3965,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3966,
                "title": "Have an initial understanding of the key stages of user workflows",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3967,
                "title": "Understand the key technology and capability requirements and gaps in existing solutions",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3968,
                "title": "Have researched options for technology solutions and have an intial view of how to proceed",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3969,
                "title": "Have a view on the lightweight capabilities needed to deliver a MVP/POC",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3970,
                "title": "Have identified the needed technology components, IP, standards, and partners for MVP",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3971,
                "title": "Successfully delivered MVP/POC with lightweight tech and have a point of view on full solution requirements",
                "score": 9,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3972,
                "title": "Improved MVP tech/capability and understand how to meet/maintain technical standards and develop/secure needed IP",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 499,
        "order": 10,
        "title": "GTM",
        "description": "Route-to-market, regulatory/legal risks",
        "currentLevel": 3974,
        "levels": [
            {
                "id": 3973,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3974,
                "title": "Have an initial view of potential go-to-market options for how to reach early adopters",
                "score": 3,
                "target": true,
                "phase_id": 185
            },
            {
                "id": 3975,
                "title": "Engaged market representatives and candidate customers to help validate GTM options",
                "score": 5,
                "target": false,
                "phase_id": 186
            },
            {
                "id": 3976,
                "title": "Have an informed point of view on the preferred go-to-market strategy to reach early adopters",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3977,
                "title": "Developed a plan to test the preferred go-to-market strategies",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3978,
                "title": "Go-to-market strategy is effective at getting us to initial target customers/segments",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3979,
                "title": "Can articulate a go-to-market strategy for scaling beyond MVP/POC",
                "score": 9,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3980,
                "title": "Go-to-market strategy is effective at building our sales pipeline and we have identified additive GTM strategies",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    },
    {
        "id": 500,
        "order": 11,
        "title": "Resources",
        "description": "Business infrastructure, resources, partners/providers",
        "currentLevel": 3981,
        "levels": [
            {
                "id": 3981,
                "title": "Not assessed",
                "score": 0,
                "target": false,
                "phase_id": "184"
            },
            {
                "id": 3982,
                "title": "Have an inforned view of the operational capability, speciliast skill and expertise required to operate the business",
                "score": 6,
                "target": true,
                "phase_id": 186
            },
            {
                "id": 3983,
                "title": "Indentified options for putting necessary capability and experise in place for the MVP",
                "score": 7,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3984,
                "title": "Have the capabilities and expertise in place to deliver a POC/MVP",
                "score": 8,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3985,
                "title": "The assembled capabilities and expertise is effective at delivering the MVP",
                "score": 9,
                "target": false,
                "phase_id": 187
            },
            {
                "id": 3986,
                "title": "Identified areas of infrastructre that need to be replaced/gaps that need to be filled for the next phase of venture development",
                "score": 10,
                "target": true,
                "phase_id": 187
            }
        ]
    }
]

