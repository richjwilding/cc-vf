import PrimitiveParser from "./PrimitivesParser";
import ResultAnalyzer from "./ResultAnalyzer";
import ExperimentAnalyzer from "./ExperimentAnalyzer";
import ContactHelper from "./ContactHelper";
import {default as PrimitiveConfig} from "./PrimitiveConfig";
import AssessmentAnalyzer from "./AssessmentAnalyzer";
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';



let instance = undefined
function MainStore (prims){
    if( instance ){
        return instance
    }
    window.contactHelper = ContactHelper()
    let obj = {
        id:  Math.floor(Math.random() * 99999),
        callbacks: {},
        types: PrimitiveConfig.types,
        loadWorkspaceFor:async function(id){
            console.log(`will load`)
            return new Promise((resolve)=>{
                const users = fetch(`/api/primitives?owns=${id}`).then(response => {
                    response.json().then(data => {
//                        obj.data.primitives = data 
  //                      obj._cache_prim = undefined

                        obj.data.primitives = data.reduce((o,d)=>{o[d.id || d._id] = primitive_access(d, "primitive"); return o}, {})
                        
                        let primitive = obj.primitive(id)
                        if( primitive === undefined){
                            primitive = obj.primitiveByPlain(parseInt(id))
                            if( primitive === undefined){
                                throw `Couldnt load ${id}`
                            }
                        }
                        obj.activeWorkspaceId = primitive.workspaceId
                        obj.joinChannel(obj.activeWorkspaceId)
                        resolve(true)
                    })
                })
            })
        },
        joinChannel:async function(newChannel){
            if( obj.socket ){
                obj.socket.emit("room", newChannel)
            }
        },
        setActiveWorkspaceFrom:async function(primitive){
            if( primitive.workspaceId ){
                console.warn(`No workspace for Primitive ${primitive.id}`)
            }
            if( obj.activeWorkspaceId == primitive.workspaceId){return}

            obj.loadControl(false)

            const oldId = obj.activeWorkspaceId
            obj.activeWorkspaceId = primitive.workspaceId
            console.log(`Workspace set to ${obj.workspace(obj.activeWorkspaceId).title}`)

            const toPurge = obj.primitives().filter((d)=>this.workspaceId != obj.activeWorkspaceId)
            console.log(`Removing ${toPurge.length} items`)

            const response = await fetch(`/api/primitives?workspace=${obj.activeWorkspaceId}`)
          //  obj._cache_prim = undefined
           // obj.data.primitives = await response.json()
           const data =  await response.json()
           obj.data.primitives = data.reduce((o,d)=>{o[d.id || d._id] = primitive_access(d, "primitive"); return o}, {})

            obj.joinChannel(obj.activeWorkspaceId)
            obj.loadControl(true)

        },
        processServerActions( list ){
            list.forEach((entry)=>{
                if(entry.type === "new_primitives"){
                    for(const rData of entry.data){
                        obj.addPrimitive( rData )
                        const newObj = obj.primitive(rData.id)
                        const list = [newObj]
                        
                        for(const parentId of Object.keys(rData.parentPrimitives || {})){
                            const paths = rData.parentPrimitives[parentId].map((d)=>d.replace('primitives.',''))
                            const parent = obj.primitive( parentId )
                            if( parent ){
                                list.push(parent)
                                paths.forEach((p)=>{
                                    parent.addRelationship( newObj, p, true)
                                })
                            }
                        }
                        obj.triggerCallback("relationship_update", list)
                        obj.triggerCallback("new_primitive", [newObj] )
                    }
                }else if(entry.type === "add_relationship"){
                        const parent = obj.primitive( entry.id)
                        const target = obj.primitive( entry.target)
                        parent.addRelationship(target, entry.path, true)
                        obj.triggerCallback("relationship_update", [entry.id, entry.target])
                    console.log(  ` Add rel ${parent.id} > ${target.id} : ${entry.path}` )
                }else if(entry.type === "remove_relationship"){
                        const parent = obj.primitive( entry.id)
                        const target = obj.primitive( entry.target)
                        parent.removeRelationship(target, entry.path, true)
                        obj.triggerCallback("relationship_update", [entry.id, entry.target])
                    console.log(  ` Remove rel ${parent.id} > ${target.id} : ${entry.path}` )
                }else if(entry.type === "set_fields"){
                    console.log(`SET FIELD CALL BACK`, entry)
                    if( entry.fields){
                        const target = obj.primitive( entry.primitiveId)
                        if( target ){
                            console.log(  `Updating fields on  ${target.id}` )

                            Object.keys(entry.fields).forEach((field)=>{
                                const frag = field.split('.')
                                const root = frag.shift()
                                let val = entry.fields[field]

                                if( val === null){
                                    val = undefined
                                }

                                if( root === 'referenceParameters'){
                                    console.log(`setting reference ${frag.join(".")}`)
                                    target.setParameter(frag.join("."), val, true, true)
                                    obj.triggerCallback("set_parameter", [target] )
                                }else{
                                    target.setField(field, val, undefined, true)
                                    obj.triggerCallback("set_field", [target] )
                                }
                            })
                        }
                    }
                }
            })

        },
        ajaxResponseHandler(response){
            if( response.success){
                if( response.result && Array.isArray(response.result)){
                    this.processServerActions(response.result)
                }
                return true
            }            
            console.warn(response)
        },
        stateInfo: PrimitiveConfig.stateInfo,
        extendPath:function(path, ext){
            return this.stringToPath(this.pathToString(path) + "." + ext)
        },
        pathToString:function(path){
            let out = []
            const nest = (node)=>{
                if( node instanceof Object ){
                    const k = Object.keys(node)[0]
                    out.push(k)
                    nest( node[k] )
                    return out
                }
                out.push(node)
                return out
            }
            return nest( path).join(".")
        },
        stringToPath:function(path){
            if( typeof(path) !== "string"){return undefined}
            let out = {}
            let current = out
            let nodes = path.split(".")
            let last = nodes.pop()
            if( nodes.length === 0){
                return last
            }
            let prev = undefined
            nodes.forEach((n,idx)=>{
                current[n] = (idx === nodes.length - 1) ? last : {}
                current = current[n]
            })            
            return out
        },
        controller: {
            async createMetric(primitive, object){
                return await this._createOrUpdateMetric( primitive, object )
            },
            async updatePrimitiveUserList(receiver, user, mode){
                const data = {
                    userId: user.id,
                    mode: mode
                }
                if( receiver.id === undefined || user.id === undefined){
                    return 
                }
                fetch(`/api/primitive/${receiver.id}/set_user`,{
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
                        obj.triggerCallback('set_user', [receiver])
                    }
                  },
                  (error) => {
                    console.warn(error)
                  }
                )

            },
            async removeMetric(primitive, id){
                if( id === undefined ){ return id}

                const object = {id: id, type: "remove"}
                
                return await this._createOrUpdateMetric( primitive, object, "remove" )
            },
            async updateMetric(primitive, object, id){
                if( id === undefined ){ return id}

                object.id = id
                
                return await this._createOrUpdateMetric( primitive, object, "update" )
            },
            async _createOrUpdateMetric(primitive, object, mode = "add"){
                if( !object.type ||  primitive === undefined){
                    return undefined
                }
                const data = {
                    ...object,
                    primitive: primitive.id
                }
                let newId

                await fetch(`/api/${mode}_metric`,{
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
            async createContact(object){
                if( !object.name ||  object.name.trim() === "" ){
                    return undefined
                }
                const data = {
                    data: object,
                }
                let newId

                await fetch("/api/add_contact",{
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
            async removePrimitive(object){
                const data = {
                    id: object.id,
                }
                let result = false
                await fetch("/api/remove_primitive",{
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                })
                .then(res => res.json())
                .then(
                  (res) => {
                    if( obj.ajaxResponseHandler( res )){
                       result = res.result
                    }
                  },
                  (error) => {
                    console.warn(error)
                  }
                )
               return result 
            },
            async createPrimitive(object, parent, paths){
                let workspaceId = object.workspaceId || parent?.workspaceId || obj.activeWorkspaceId
                const data = {
                    parent: parent ? parent.id : undefined,
                    data: object,
                    workspaceId: workspaceId,
                    paths: paths
                }
                let newItem
                if( workspaceId === undefined){
                    throw "Must have an active workspace"
                }

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
                        newItem = result.result
                    }
                  },
                  (error) => {
                    console.warn(error)
                  }
                )
               return newItem
            },
            updateTitle:function( receiver, title){
                this.updateField(receiver, "title", title, "set_title")
            },
            updateParameter:function( receiver, parameterName, value ){
                this.updateField(receiver, `referenceParameters.${parameterName}`, value, "set_parameter")
            },
            updateField( receiver, field, value, callback_name){
                const data = {
                    receiver: receiver.id,
                    value: value,
                    field: field
                }
                fetch("/api/set_field",{
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
                        obj.triggerCallback(callback_name, [receiver])
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


                        if( metric.type === "sum"){
                            if( prims === undefined){return 0}
                            return prims.allItems.map((p)=>parseInt(p.referenceParameters[metric.parameter] || 0)).reduce((a, c)=>a + c,0)
                        }

                        if( metric.type === "conversion" || metric.type === "count"){

                                if( metric.type === "conversion" ){
                                    if( prims === undefined){
                                        prims = {}
                                    }
                                    if( Object.keys(metric.path)[0] !== "results"){return undefined}
                                    
                                    let relationships = target.parent.metadata?.resultCategories[Object.values(metric.path)[0]].relationships
                                    Object.keys(relationships).forEach((k)=>{
                                        if( !Object.keys(prims).includes(k)){
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
                                    if( prims === undefined){
                                        prims = {allIds: {length: 0}, allItems: []}
                                    }
                                    if( metric.targets && metric.targets.length > 0){
                                        counts = metric.targets.map((t)=>{
                                            if( t.presence ){
                                                return {presence: true, count: prims.allIds.length, list: prims.allItems}
                                            }else{
                                                if( !Array.isArray(prims) ){
                                                    const k = t.relationship
                                                    if( prims[k] ){
                                                        return {relationship: k, list: prims[k].allItems, count: prims[k].length}

                                                    }
                                                }
                                            }
                                        }).filter((d)=>d)

                                    }else{
                                        counts = [{count: prims.allIds.length, list: prims.allItems}]
                                    }
                                    let by_reln = metric.targets || metric.by_relationship
                                    filter_empty = true
                                }
                            if( metric.targets && metric.targets.length > 0 ){
                                counts = counts.filter((d)=>{
                                    let mt = metric.targets.find((d2)=>(d2.presence === d.presence && d2.presence !== undefined) || (d2.relationship === d.relationship))
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
        deletePrimitive:function(id){
/*            
            delete obj.data.primitives[ id ]
            if( obj._cache_prim ){
                obj._cache_prim = obj._cache_prim.filter((d)=>d.id !== id)
            }*/
            /*obj.data.primitives = obj.data.primitives.filter((d)=>d.id === id || d._id === id)
            delete obj._cache_prim[ id ]*/

            delete obj.data.primitives[ id ]

        },
        addPrimitive:function(data){
/*            if( obj._cache_prim === undefined){
                obj.primitives()                
            }
            obj.data.primitives.push(data)*/
            //obj._cache_prim.push(primitive_access(data,"primitive"))
            //obj._cache_prim[data.id || data._id] = primitive_access(data,"primitive")
            obj.data.primitives[data.id || data._id] = primitive_access(data,"primitive")
        },
        primitives:function(){
          /*  if( obj._cache_prim === undefined){
                //obj._cache_prim = (prims || obj.data.primitives).map((p)=>primitive_access(p,"primitive"))
                obj._cache_prim = (prims || obj.data.primitives).map((p)=>primitive_access(p,"primitive")).reduce((o,d)=>{o[d.id]=d;return o}, {})

            }
            return Object.values(obj._cache_prim)*/
            return Object.values(obj.data.primitives)
        },
        primitiveByPlain:function(id){
            let data = obj.primitives().find((p)=>p.plainId === id)
            return data
        },
        primitive:function(id){
            /*if( obj._cache_prim === undefined){
                obj.primitives()                
            }*/
            //let data = obj.primitives().find((p)=>p.id === id)
//            let data = obj._cache_prim[id]
            let data = obj.data.primitives[id]
            if( !data && !isNaN(id) ){
                data = this.primitiveByPlain(id)
                if( data ){
                    console.warn(`Primitive lookup ${id} by plainId`)
                }
            }
/*                if( data === undefined){
                    console.warn(`Primitive lookup ${id} found nothing`)
                }*/
            return data
        },
        workspace:function(id){
            return obj.workspaces().find((d)=>d._id === id)
        },
        workspaces:function(){
            return obj.data.workspaces
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
            if( id === undefined || id === null){return undefined}
            let out = this.contacts().find((d)=>d.id === id) 
            if( out === undefined){
                out = this.contacts().find((d)=>d.plainId === id)
                if( out ){
                    console.log(`Found contact by old id`)
                }
            }
            return out
        },
        user:function(id){
            return this.users().find((d)=>d.id === id)
        },
        users:function(){
            return this.data.users
        },
        framework:function(id){
            return this.frameworks().find((d)=>d.id === id)
        },
        frameworks:function(){
            return this.data.frameworks
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
            if( typeof(events) === "string"){
                events = events.split(" ")
            }
            ;[events].flat().forEach((e)=>{
                if( store.callbacks[e] === undefined){
                    store.callbacks[e] = []
                }
                store.callbacks[e] = store.callbacks[e].filter((d)=>d.id !== id)
                store.callbacks[e].push({callback: cb, filterIds: idList ? [idList].flat(): undefined, id: id})
                //console.log(`registered ${e} for ${id} (${store.callbacks[e].length}) / ${[idList].flat().join(", ")}`)
            })
            return id
        },
        triggerCallback:function(e, items){
            let store = this
            if( this.callbacks[e] === undefined){
                return
            }
            items = [items].flat()

            items = items.map((d)=> d instanceof Object ? d.id : d)

            const name = e
            this.callbacks[e].forEach((e)=>{
                if( e.filterIds && e.filterIds.length > 0 ){
                    if( items.filter((item)=>e.filterIds.includes(item)).length === 0){
                        return
                    }
                }
                e.callback(items, e)
            })

        },
        doPrimitiveAction:async function (primitive, action, params){
            let url = `/api/primitive/${primitive.id}/action/${action}`

            if(params){
                url += '?' + new URLSearchParams(params)
            }

            let out

            const result = await fetch(url,{
                method: "GET",
            })
            const response = await result.json()
            return this.ajaxResponseHandler(response)

        },
        doPrimitiveDocumentDiscovery:async function ( primitive){
            
            let url = `/api/primitive/${primitive.id}/discover`

                const result = await fetch(url,{
                    method: "GET",
                })
                const response = await result.json()
                return response
        },
        doPrimitiveDocumentQuestionsAnalysis:async function ( primitive, ids ){
            
            let url = `/api/primitive/${primitive.id}/analyzeQuestions`
            if( ids ){
                url += '?' + new URLSearchParams({
                    questionIds: ids
                })
            }

                const result = await fetch(url,{
                    method: "GET",
                })
                const response = await result.json()
                return response
        },
        getPrimitiveDocument:async function ( primitive ){
            let revision = ''
            if( primitive.referenceParameters?.notes?.lastFetched ){
                revision = '?rev=' + new Date(primitive.referenceParameters?.notes?.lastFetched).getTime()
            }
            const url = `/api/primitive/${primitive.id}/getDocument${revision}`
                const result = await fetch(url
                ,{
                    method: "GET",
                })
                const response = await result.arrayBuffer()
                return response
        },
        createContact:async function(data){
            const newId = await this.controller.createContact(data)
            data.id = newId
            this.data.contacts = this.data.contacts.filter((d)=>d.id !== newId)
            this.data.contacts.push(data)
            return data
        },
        removePrimitive:async function(primitive){
            if( !(primitive instanceof Object)){
                primitive = this.primitive(primitive)
            }
        //    await primitive.removeChildren()
            const removedIds = await this.controller.removePrimitive(primitive) 
            if( removedIds ){
                console.log(`Server deleted ${removedIds.length} items`)
                const notifyIds = []
                for( const targetId of removedIds ){
                    const target = this.primitive(targetId)
                    target.parentPrimitives.forEach((parent)=>{
                        const rels = target.parentPaths(parent.id)
                        notifyIds.push(parent.id)
                        rels.forEach((path)=>{
                            parent.primitives.remove( target.id, path)
                        })
                    })
                    this.deletePrimitive( target.id )
                }
                obj.triggerCallback("relationship_update", notifyIds )
                obj.triggerCallback("delete_primitive", removedIds )
            }else{
                console.warn(`Couldn't remove ${primitive.id}`)
                throw new Error("Error removing")
            }
        },
        createPrimitive:async function( options ){
            let {
                title = "New item", 
                type = "result", 
                state = undefined, 
                extraFields = {}, 
                parent = undefined, 
                workspaceId = undefined, 
                parentPath = undefined, 
                categoryId = undefined, 
                referenceParameters = {} } = options
            let category = categoryId ? this.category( categoryId ) : undefined

            let paths = []
            if( parent ){
                paths.push( "origin" )

            }
            if( parentPath){
                paths.push( parentPath)
            }
            if( type === "prompt"){
                if( category == undefined){
                    throw new Error(`Cant add prompt without a category`)
                }
                if( !(parent && parent.type === "question")){
                    throw new Error(`Cant add prompt ${parent ? `to parent of type ${parent.type}` : 'without parent'}`)
                }
            }

        //    if( type === "result"){
                if( category && parent && parent.metadata && parent.metadata.resultCategories){
                    const match = parent.metadata.resultCategories.find((d)=>d.resultCategoryId === categoryId) 
                    if( match ){
                        if( match.relationships ){
                            paths.push({results: {[match.id]: Object.keys(match.relationships)[0]}})
                        }else{
                            paths.push({results: match.id})
                        }
                    }                    
/*                }else{
                    throw new Error(`Cant add result with category ${categoryId} to Prim #${parent.plainId}`)*/
                }
          //  }

            let data = {
                //plainId:  Math.floor(Math.random() * 99999),
                title: title,
                type: type,
                state: state,
                workspaceId: workspaceId,
                primitives: {},
                referenceId: categoryId,
                referenceParameters: referenceParameters,
                users: {owner: [this.activeUser.id], other: []},
                ...extraFields
            }
            /*const newIds = await this.controller.createPrimitive(data, parent, paths)
            if( newIds === undefined){
                console.warn('New primitive not created')
                return
            }
            data._id = newIds.id
            data.plainId = newIds.plainId
            data.workspaceId = obj.activeWorkspaceId
            */
            const rData = await this.controller.createPrimitive(data, parent, paths)
            if( rData === undefined){
                console.warn('New primitive not created')
                return
            }
            this.addPrimitive( rData )
            const newObj = obj.primitive(rData.id)
            
            if( parent ){
                paths.forEach((p)=>{
                    parent.addRelationship( newObj, p, true)
                })
            }
            obj.triggerCallback("relationship_update", [parent, newObj])
            obj.triggerCallback("new_primitive", [newObj] )
            return  newObj
        }
    }

    obj.socket = io(window.location.hostname === "localhost" ? "http://localhost:3001" : undefined, {
        withCredentials: true
    })
    obj.socket.on('control', (data)=>{
        obj.joinChannel( obj.activeWorkspaceId )
    })
    obj.socket.on('message', (data)=>{
        let items = data
        console.log(data)
        if( !Array.isArray(data) ){
            items = data.data
            if( data.track ){
                const key = data.field
                if( obj.controlResolver && obj.controlResolver[key]){
                    obj.controlResolver[key]()
                    obj.controlResolver[key] = undefined
                    console.log(`!!!!!!\nCLOSING DOWN ${key}`)
                }else{
                    obj.controlResolver = obj.controlResolver || {}
                    
                    function sleep(key) {
                        return new Promise(resolve=>{
                            obj.controlResolver[key] = resolve
                        })
                    }
                    
                    toast.promise(
                        sleep(key),
                        {
                            loading: data.text,
                            success: <b>Done!</b>,
                            error: <b>Error.</b>,
                        })
                }
            }
        }
        obj.processServerActions(items)
    })

    obj.structure = PrimitiveParser(obj)
    obj.referenceParametersParser = {
        set(d, prop, value, receiver) {
            d[prop] = value
            if( prop === "contact" || prop === "contactId" ){
                d._contact = undefined
            }
            return true
        },
        get(d, prop, receiver) {
            if( prop === "contactName" ){
                return receiver.contact?.name
            }
            if( prop === "contact" && ("contactId" in d)){
                if( d._contact === undefined){
                    d._contact = obj.contact(d.contactId)
                }
                return d._contact
            }
            if( prop in d){
                return d[prop]
            }
        }
    }

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
        if( !d.primitives ){
            d.primitives = {}
        }
        const primObj = new Proxy(d, {
            set(d, prop, value, receiver) {
                if( prop === "title"){
                    d.title = value
                    obj.controller.updateTitle( receiver, value)
                    return true
                }
            },
            get(d, prop, receiver) {
                if( prop === "primitives"){
                    return new Proxy( d.primitives , obj.structure )
                }
                if( prop === "plainId"){
                    return d.plainId
                }
                if( prop === "deleteMetric"){
                    return async function( existingMetric ){  
                        let id = existingMetric ? existingMetric.id : undefined
                        if( id === undefined){return}

                        id = await obj.controller.removeMetric( receiver, id )

                        if( id !== undefined){
                            d.metrics = d.metrics.filter((d)=>d.id !== id )
                            return existingMetric
                        }else{
                            console.warn("Failed to delete metric")
                        }                        

                    }
                }
                if( prop === "addMetric" || prop === "updateMetric"){
                    return async function( data, existingMetric ){  
                        let metric = {
                            title: data.title,
                            type: data.type,
                            targets: data.targets,
                        }
                        let id = existingMetric ? existingMetric.id : undefined
                        if( prop === "updateMetric" ){
                            if( id ){
                                id = await obj.controller.updateMetric( receiver, metric, id )
                                d.metrics = d.metrics.filter((d)=>d.id !== id )
                            }
                        }else{
                            id = await obj.controller.createMetric( receiver, metric )
                        }

                        if( id !== undefined){
                            metric.id = id
                            metric.path = data.type === "conversion" ? {results: 0} : {metrics: id}
                            if( d.metrics === undefined){
                                d.metrics = []
                            }
                            d.metrics.push( metric )
                            return metric
                        }else{
                            console.warn("Failed to create metric")
                        }                        

                    }
                }
                if( prop === "validateParameter"){
                    return function( parameterName, value ){
                        const metadata = receiver.metadata
                        const parameters = {...receiver.metadata?.parameters, ...(receiver.origin?.childParameters || {})}
                        if( Object.keys(parameters).length === 0 ){
                            return false
                        }
                        const root = parameterName.split('.')[0]
                        if( !(root in parameters) ){
                            if( root.slice(-2) === "Id"){
                                if( (root.slice(0, -2) in parameters) ){
                                    if( value !== undefined){
                                        return true
                                    }
                                }
                            }
                            return false
                        }
                        const pConfig = parameters[ root ]
                        switch( pConfig.type ){
                            case "string": return pConfig.optional || value !== ""
                        }
                        return true
                    }
                }
                if( prop === "addUser" ){
                    return function( user ){
                        if( user === undefined){return undefined}
                        d.users = d.users || {other: [], owner: []}
                        const present = d.users.other.includes(user.id)
                        if( present){return true}

                        d.users.other.push(user.id)

                        return obj.controller.updatePrimitiveUserList(receiver, user, "add")
                    }
                }
                if( prop === "removeUser" ){
                    return function( user ){
                        if( user === undefined){return undefined}
                        d.users = d.users || {other: [], owner: []}
                        const present = d.users.other.includes(user.id)
                        if( !present){return true}

                        d.users.other = d.users.other.filter((d)=>d !== user.id)

                        return obj.controller.updatePrimitiveUserList(receiver, user, "remove")
                    }
                }
                if( prop === "workspace"){
                    if( d.workspaceId ){
                        return obj.workspace( d.workspaceId )
                    }
                    return undefined
                }
                if( prop === "setLocalFlag"){
                    return function( fieldName, value ){
                        d['_' + fieldName] = value
                        return true
                    }
                }
                if( prop === "setField"){
                    return function( fieldName, value, callbackName, skip = false ){
                        let node = d
                        const fields = fieldName.split(".")
                        let last = fields.pop()
                        fields.forEach((f)=>{
                            if( node[f] === undefined){
                                node[f] = {}
                            }
                            node = node[f]
                            
                        })
                        node[last] = value
                        if(!skip){
                            obj.controller.updateField( receiver, fieldName, value, callbackName || `set_field`  )
                        }
                        return true
                    }
                }
                if( prop === "setParameter"){
                    return function( parameterName, value, skip = false, force = false ){
                        if( force || receiver.validateParameter(parameterName, value)){
                            let target = receiver.referenceParameters 
                            let set = parameterName.split(".")
                            let last = set.pop()
                            set.forEach((n)=>{
                                target = target[n]
                            })
                            target[last] = value
                            if(!skip){
                                obj.controller.updateParameter( receiver, parameterName, value  )
                            }
                            return true
                        }
                        return false
                    }
                }
                if( prop === "referenceParameters"){
                    if( !d._referenceParameters){
                        d._referenceParameters = d.referenceParameters || {}
                        d.referenceParameters = new Proxy( d._referenceParameters, obj.referenceParametersParser)
                    }
                    if( d.type === "assessment"){
                        if( !d._referenceParameters.levels ){
                            d._referenceParameters.levels = {}
                        }
                    }
                    return d.referenceParameters
                }
                if( prop === "addParentRelationship"){
                    return function( parent, path){
                        const asString = receiver.primitives.flattenPath(path)
                        if(!d.parentPrimitives){
                            d.parentPrimitives = {}
                        }
                        if(!d.parentPrimitives[parent.id]){
                            d.parentPrimitives[parent.id] = []
                        }
                        if( d.parentPrimitives[parent.id].filter((d)=>d === asString).length === 0){
                            d.parentPrimitives[parent.id].push(asString)
                        }
                    }

                }
                if( prop === "removeParentRelationship"){
                    return function( parent, path){
                        const asString = receiver.primitives.flattenPath(path)
                        console.log(asString)
                        if(!d.parentPrimitives){
                            d.parentPrimitives = {}
                        }
                        if(!d.parentPrimitives[parent.id]){
                            d.parentPrimitives[parent.id] = []
                        }
                        
                        d.parentPrimitives[parent.id] = d.parentPrimitives[parent.id].filter((d)=>d !== asString)
                    }

                }
                if( prop === "addRelationship"){
                    return function( target, path, skip = false ){
                        if( receiver.primitives.add( target.id, path )){
                            target.addParentRelationship(receiver, path)
                            if( !skip ){
                                obj.controller.setRelationship( receiver, target, path, true )
                            }
                        }
                    }
                }
                if( prop === "removeRelationship"){
                    return function( target, path, skip = false ){
                        if( receiver.primitives.remove( target.id, path )){
                            target.removeParentRelationship(receiver, path)
                            if( !skip ){
                                obj.controller.setRelationship( receiver, target, path, false )
                            }
                        }
                    }
                }
                if( prop === "moveRelationship"){
                    return function( target, from, to ){
                        if( receiver.primitives.move( target.id, from, to) ){
                            target.removeParentRelationship(receiver, from)
                            target.addParentRelationship(receiver, to)
                            obj.controller.moveRelationship( receiver, target, from, to)
                        }
                    }
                }
                if( prop === "toggleRelationship"){
                    return function( target, metric ){
                        let anchor = receiver.primitives.fromPath(metric.path, true)
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
                            target.removeParentRelationship(receiver, path)
                        }else{
                            result = anchor.add( target.id) 
                            target.addParentRelationship(receiver, path)
                        }
                        if( result ){
                            obj.controller.setRelationship( receiver, target, path, !oldRelationship )

                        }
                        return anchor
                    }
                }
                if( prop === "removeChildren"){
                    return async function(dry_run = false){
                        let directs = [receiver.primitives.origin.uniqueAllItems, receiver.primitives.auto.uniqueAllItems].flat()
                        directs = directs.filter((d)=>!d.lock)
                        let nested = [] 
                        for( d of directs ){
                            nested = nested.concat(await d.removeChildren(dry_run))
                        }
                        if( dry_run ){
                            return nested.concat(directs.map((d)=>d.plainId))
                        }else{
                            for(const prim of directs){
                                await obj.removePrimitive( prim )
                            }
                        }
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
                    let category = obj.categories().find((p)=>p.id === d.referenceId )
                    if( category === undefined){
                        category = PrimitiveConfig.metadata[receiver.type]
                    }
                    return category
                }

                if( prop in obj.types){
                    return receiver.primitives[type]
                }
                if( type === "primitive"){
                    if( d.type === "result"){
                        d.analyzer =  ()=>{
                            return ResultAnalyzer(receiver).init()
                        }
                    }else if( d.type === "assessment"){
                        d.analyzer =  ()=>{
                            return AssessmentAnalyzer(receiver).init()
                        }
                    }else if( receiver.isTask){
                        d.analyzer =  ()=>{
                            return ExperimentAnalyzer(receiver).init()
                        }
                    }
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
                    if( prop === "task"){
                        if( receiver.isTask ){
                            return receiver
                        }else{
                            return receiver.origin?.task
                        }
                    }
                    if( prop === "origin"){
                        if( d._origin){
                           return d._origin 
                        }
                        let origin = receiver.parentPrimitiveRelationships["origin"]
                        if( origin ){
                            d._origin = origin[0]
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
                    if( prop === "parentPrimitives"){
                        //const old = obj.primitives().filter((t)=>t.primitives.includes(d.id)).map((d)=>d.plainId).sort()
                        const parents = receiver.parentPrimitiveIds.map((d)=>obj.primitive(d)).filter((d)=>d)
                        //const check = parents.map((d)=>d.plainId).sort()
                        //console.assert( check.length === old.length )
                        return parents
                    }
                    if( prop === "parentPrimitiveIds"){
                        return d.parentPrimitives ? Object.keys(d.parentPrimitives).filter((p)=>d.parentPrimitives[p] && d.parentPrimitives[p].length > 0 ) : []
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
                    if( d.type === "assessment"){
                        if( prop === "framework"){
                            return obj.framework( d.frameworkId)
                        }
                        if( prop === "venture"){
                            return receiver.parentPrimitives.filter((d)=>d.type === "venture")[0]
                        }
                    }
                    if( d.type === "venture" ){
                        if( prop === "currentAssessment"){
                            return receiver.primitives.allUniqueAssessment.pop()
                        }
                    }
                    if( prop === "categories" ){
                        return receiver.parentPrimitives.filter((d)=>d.type === "category")
                    }
                }

                if( prop === "doDiscovery"){
                    return (ids)=>{
                        return obj.doPrimitiveDocumentDiscovery( receiver, ids )
                    }
                } 
                if( prop === "doQuestionsAnalysis"){
                    return (ids)=>{
                        return obj.doPrimitiveDocumentQuestionsAnalysis( receiver, ids )
                    }
                }
                if( prop === "getDocument"){
                    return ()=>{
                        return obj.getPrimitiveDocument( receiver )
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
                    return function( parent, root ){
                        if( !(parent instanceof(Object)) ){
                            parent = obj.primitive(parent)
                        }
                        //return parent.primitives.relationships( d.id )
                        return receiver.parentPaths(parent, root)?.map((d)=>d.split('.').slice(-1)[0])
                    }
                }
                if( prop === "parentPaths"){
                    return function( parent, root ){
                        if( !(parent instanceof(Object)) ){
                            parent = obj.primitive(parent)
                        }
                        const out = parent.primitives.paths( d.id )?.map((d)=>d.slice(1))
                        if( root ){
                            return out.filter((d)=>d.substr(0, root.length) == root)
                        }
                        return out
                    }
                }
                if( prop in d){
                    return d[prop]
                }
            }
        })
        return primObj
    }    
    obj.data = {}

    obj.processOutstandingDiscovery = async function(){
        obj.primitives().forEach((primObj)=>{
            if( primObj.type === "result"){
                if( primObj.referenceParameters.notes !== undefined ){
                    if( primObj.origin && primObj.origin.doDiscovery ){
                        if(primObj.discoveryDone !== true ){
                            primObj.setLocalFlag("doingDiscovery", true)
                            primObj.analyzer().doDiscovery()
                        }
                    }
                }
            }
        })
    }
    

    obj.loadData = async function(){
        obj.loadProgress = []
            const status = await fetch('/api/status').then(response => response.json())
            if( !status.logged_in ){
                if( window.location.pathname !== "/login"){
                    window.location.href = "/login"
                }
                return
            }
                obj.activeUser = status.user

                obj.env = status.env


        return new Promise((resolve)=>{
            const users = fetch('/api/users').then(response => {obj.loadProgress.push('users');return response.json()})
            const companies = fetch('/api/companies').then(response => {obj.loadProgress.push('companies');return response.json()})
            const contacts = fetch('/api/contacts').then(response => {obj.loadProgress.push('contacts');return response.json()})
            const categories = fetch('/api/categories').then(response => {obj.loadProgress.push('categories');return response.json()})
            const primitives = fetch('/api/primitives').then(response => {obj.loadProgress.push('primitives');return response.json()})
            const workspaces = fetch('/api/workspaces').then(response => {obj.loadProgress.push('workspaces');return response.json()})
            const frameworks = fetch('/api/frameworks').then(response => {obj.loadProgress.push('frameworks');return response.json()})
            
            Promise.all([users,companies,contacts,categories,primitives,workspaces,frameworks]).then(([users, companies,contacts, categories,primitives,workspaces,frameworks])=>{
                obj.data.users = users.map((d)=>{
                    return {...d, id: d.id || d._id}
                })
                obj.data.companies = companies
                obj.data.contacts = contacts.map((d)=>{
                    d.id = d.id !== undefined ? d.id : d._id; 
                    if( d.avatarPresent){
                        d.avatarUrl = `/api/avatarImage/${d.id}?${d.updatedAt ? new Date(d.updatedAt).getTime() : ""}`
                    }
                    return d} )
                obj.data.categories = categories
                obj.data.primitives = primitives.reduce((o,d)=>{o[d.id || d._id] = primitive_access(d, "primitive"); return o}, {})
                obj.activeUser.info = obj.users().find((d)=>d.email === obj.activeUser.email)
                obj.activeUser.id = obj.activeUser.info.id
                obj.data.workspaces = workspaces.map((d)=>{d.id = d._id; return d})
                obj.data.frameworks = frameworks.map((d)=>{d.id = d._id; return d})

//                obj.processOutstandingDiscovery()
                resolve(true)
            })
        })
    }
    obj.refreshUser = async function(){
        await fetch('/api/refresh')
            .then(response => response.json())
            .then((response)=>{
                obj.activeUser = response.user
                obj.activeUser.info = obj.users().find((d)=>d.email === obj.activeUser.email)
                console.log(`updated user`)
            })
    }
    
    return obj
}



export default MainStore