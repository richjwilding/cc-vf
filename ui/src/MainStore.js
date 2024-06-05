import PrimitiveParser from "./PrimitivesParser";
import ResultAnalyzer from "./ResultAnalyzer";
import ContactHelper from "./ContactHelper";
import {default as PrimitiveConfig} from "./PrimitiveConfig";
import AssessmentAnalyzer from "./AssessmentAnalyzer";
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { unpack, pack } from 'msgpackr';
import CollectionUtils from "./CollectionHelper";

 export function uniquePrimitives(list){
        const ids = new Set();
        return list.filter((p) => {
            if (p === undefined) {
             //   console.warn(`undefined primitive`);
                return false;
            }
            if (ids.has(p.id)) {
                return false;
            }
            ids.add(p.id);
            return true;
        });
    };

function areArraysEqualIgnoreOrder(arr1, arr2) {
    // Check if both arrays have the same length
    if( !arr1 || !arr2 ){
        return false
    }
    if (arr1.length !== arr2.length) {
        return false;
    }

    // Sort the arrays
    const sortedArr1 = arr1.slice().sort();
    const sortedArr2 = arr2.slice().sort();

    // Compare the sorted arrays element by element
    for (let i = 0; i < sortedArr1.length; i++) {
        if ((sortedArr1[i] === null || sortedArr1[i] === undefined) && (sortedArr2[i] === null || sortedArr2[i] === undefined)) {
            continue;
        }
        if (sortedArr1[i] !== sortedArr2[i]) {
            return false;
        }
    }

    // If all elements are equal, the arrays are equal
    return true;
}

let instance = undefined
function MainStore (prims){
    if( !prims && instance ){
        return instance
    }
    window.contactHelper = ContactHelper()
    let obj = {
        id:  Math.floor(Math.random() * 99999),
        callbacks: {},
        types: PrimitiveConfig.types,
        waitForPrimitive:async function(id, count = 1){
            console.log(`checking for ${id}`)
            const primitive = obj.primitive(id)
            if( primitive === undefined){
                console.log(`Primitive ${id} not present - sleeping`)
                await new Promise(r => setTimeout(r, 100 * count ));
                if( count < 10 ){
                    console.log(`Try again`)
                    return await this.waitForPrimitive(id, count + 1)
                }
            }
            return primitive
        },
        loadWorkspaceFor:async function(id){
            console.log(`will load`)
            return new Promise((resolve)=>{
                const users = fetch(`/api/primitives?owns=${id}`).then(response => {
                    response.arrayBuffer().then(buffer => {
//                        obj.data.primitives = data 
  //                      obj._cache_prim = undefined
                            const data = unpack(new Uint8Array(buffer))

                        obj.data.primitives = data.reduce((o,d)=>{o[d._id] = primitive_access(d, "primitive"); return o}, {})
                        
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
            const buffer =  await response.arrayBuffer()
            const data = unpack(new Uint8Array(buffer))
            obj.data.primitives = data.reduce((o,d)=>{o[d._id] = primitive_access(d, "primitive"); return o}, {})

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
                        obj.triggerCallback("new_primitive", [newObj] )
                        obj.triggerCallback("relationship_update", list)
                    }
                }else if(entry.type === "add_relationship"){
                        const parent = obj.primitive( entry.id)
                        const target = obj.primitive( entry.target)
                        if( parent && target){
                            if(parent.primitives.fromPath(entry.path)?.allIds.includes(entry.target)){
                            }else{
                                obj.triggerCallback("relationship_update", [entry.id, entry.target])
                                parent.addRelationship(target, entry.path, true)
                            }
                        }
                    //console.log(  ` Add rel ${parent.id} > ${target.id} : ${entry.path}` )
                }else if(entry.type === "remove_relationship"){
                        const parent = obj.primitive( entry.id)
                        const target = obj.primitive( entry.target)
                        if( parent && target){
                            if(parent.primitives.fromPath(entry.path)?.allIds.includes(entry.target)){
                                obj.triggerCallback("relationship_update", [entry.id, entry.target])
                                parent.removeRelationship(target, entry.path, true)
                            }else{
                                console.log(`SKIP REMOVED - NOT THERE`)
                            }
                        }
                    //console.log(  ` Remove rel ${parent.id} > ${target.id} : ${entry.path}` )
                }else if(entry.type === "remove_primitives"){
                    if( entry.primitiveIds && Array.isArray(entry.primitiveIds) ){
                        obj.removePrimitive(undefined, entry.primitiveIds)
                    }
                }else if(entry.type === "set_fields"){
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
                                    if(frag.length === 0){
                                        console.log(`SET FULL`)
                                        for( const f in val){
                                            target.setParameter(f, val[f], true, true)
                                        }
                                    }else{
                                        target.setParameter(frag.join("."), val, true, true)
                                    }
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
            /*addImport( primitive, target, filters ){
                const data = {
                    target: target.id,
                    filters: filters
                }
                let url = `/api/primitive/${primitive.id}/addImport`
                fetch(url,{
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                })
                .then(res => res.json())
                    .then(
                    (result) => {
                        obj.ajaxResponseHandler( result )
                    },
                    (error) => {
                        console.warn(error)
                    }
                    )
            },*/
            moveRelationship( receiver, target, from, to ){
                const data = {
                    receiver: receiver.id,
                    target: target.id,
                    from: from,
                    to: to
                }
                obj.triggerCallback("relationship_update", [receiver, target])
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
                        /*if( obj.ajaxResponseHandler( result )){
                            obj.triggerCallback("relationship_update", [receiver, target])
                        }*/
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
                obj.triggerCallback("relationship_update", [receiver, target])
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
                    /*if( obj.ajaxResponseHandler( result )){
                        obj.triggerCallback("relationship_update", [receiver, target])
                    }*/
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
        queryPrimitives:async function (primitive, params){
            let url = `/api/primitive/${primitive.id}/queryPrimitives`

            if(params){
                for(const k in params){
                    if( params[k] === undefined){
                        delete params[k]
                    }
                }
                url += '?' + new URLSearchParams(params)
            }

            let out

            const result = await fetch(url,{
                method: "GET",
            })
            const response = await result.json()
            return response

        },
        doPrimitiveAction:async function (primitive, action, params, callback){
            let url = `/api/primitive/${primitive.id}/action/${action}`

            const result = await fetch(url,{
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(params)
            })
            const response = await result.json()
            const success = this.ajaxResponseHandler(response)
            if( response.success && callback && typeof(callback) === "function"){
                console.log(`WILL CALL CALLBACK`)
                await callback(response.result)
            }
            return success

        },
        doPrimitiveDocumentDiscovery:async function ( primitive){
            
            let url = `/api/primitive/${primitive.id}/discover`

                const result = await fetch(url,{
                    method: "GET",
                })
                const response = await result.json()
                return response
        },
        doPrimitiveDocumentQuestionsAnalysis:async function ( primitive, options ){
            let url = `/api/primitive/${primitive.id}/analyzeQuestions`
            url += '?' + new URLSearchParams(options)

            const result = await fetch(url,{
                method: "GET",
            })
            const response = await result.json()
            return response
        },
        getPrimitiveDocumentAsText:async function ( primitive ){
            let revision = ''
            if( primitive.referenceParameters?.notes?.lastFetched ){
                revision = '?rev=' + new Date(primitive.referenceParameters?.notes?.lastFetched).getTime()
            }
            const url = `/api/primitive/${primitive.id}/getDocumentAsPlainText${revision}`
                const result = await fetch(url
                ,{
                    method: "GET",
                })
                const response = (await result.json())?.result
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
        removePrimitive:async function(primitive, skip = false){
            if( !skip ){
                if(!(primitive instanceof Object)){
                    primitive = this.primitive(primitive)
                }
                console.log(`removing ${primitive.id}`)
            }
            let removedIds
            if(!skip){
                removedIds = await this.controller.removePrimitive(primitive) 
            }else{
                removedIds = skip
            }
            if( removedIds ){
                //console.log(`Server deleted ${removedIds.length} items`)
                const notifyIds = []
                for( const targetId of removedIds ){
                    const target = this.primitive(targetId)
                    if( target ){
                        target.parentPrimitives.forEach((parent)=>{
                            const rels = target.parentPaths(parent.id)
                            notifyIds.push(parent.id)
                            rels.forEach((path)=>{
                                parent.primitives.remove( target.id, path)
                            })
                        })
                        this.deletePrimitive( target.id )
                    }
                }
                obj.triggerCallback("relationship_update", notifyIds )
                obj.triggerCallback("delete_primitive", removedIds )
            }else{
                console.warn(`Couldn't remove ${primitive.id}`)
                throw new Error("Error removing")
            }
        },
        createPrimitive:async function( options ){
            let category = options.categoryId ? this.category( options.categoryId ) : undefined
            let {
                title = category?.blankTitle ? undefined : "New item", 
                type = "result", 
                state = undefined, 
                extraFields = {}, 
                parent = undefined, 
                workspaceId = undefined, 
                parentPath = undefined, 
                categoryId = undefined, 
                referenceParameters = {} } = options

            let paths = []
            if( parent ){
                paths.push( "origin" )

            }
            if( parentPath){
                paths.push( parentPath)
            }
            
            const config = PrimitiveConfig.typeConfig[type]
            if( config?.createAtWorkspace){
                paths = paths.filter((p)=>p !== 'origin')
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
                if( parent && parent.metadata && parent.metadata.resultCategories){
                    let match
                    if( category){
                        match = parent.metadata.resultCategories.find((d)=>d.resultCategoryId === categoryId)
                    }
                    if( !match ){
                        match = parent.metadata.resultCategories.find((d)=>d.type === type) 
                    }
                    console.log(`PATHS`, match)
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
                const key = data.track
                if( obj.controlResolver && obj.controlResolver[key]){
                    obj.controlResolver[key]()
                    obj.controlResolver[key] = undefined
                }else if(data.text){
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
    obj.uniquePrimitives = uniquePrimitives
    const equalRelationships = (or1,or2)=>{
        if( or1 === or2){
            return true
        }
        let r1 = [or1].flat()
        let r2 = [or2].flat()
    
        if(r1.length !== r2.length){
            return false
        }
        const setR2 = new Set(r2);

        return r1.every(element => setR2.has(element));

    }
    obj.equalRelationships = equalRelationships
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
                if( prop === "id"){
                    return d.id
                }
                if( prop === "primitives"){
                    return new Proxy( d.primitives , obj.structure )
                }
                if( prop === "_primitives"){
                    return d.primitives
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
                        if(parameterName === "state"){
                            return true
                        }
                        const parameters = {...receiver.metadata?.parameters, ...(receiver.origin?.childParameters || {}), ...(receiver.task?.itemParameters?.[receiver.referenceId] || {})}
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
                                const last = target
                                target = target[n]
                                if( !target ){
                                    last[n] = {}
                                    target = last[n]
                                }

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
                    return async function(allItems = false){
                        let directs = allItems ? receiver.primitives.uniqueAllItems : [receiver.primitives.origin.uniqueAllItems, receiver.primitives.auto.uniqueAllItems].flat()
                        directs = directs.filter((d)=>!d.lock)
                        let nested = [] 
                        for( d of directs ){
                            nested = nested.concat(await d.removeChildren())
                        }
                        for(const prim of directs){
                            await obj.removePrimitive( prim )
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

                if( prop === "relationshipAtLevel"){
                    return function(original, level = 0){
                        if(level === 0){
                            return [receiver]
                        }
                        let out = []
                        let relationship = original
                        let fwdArray

                        if( Array.isArray(original)){
                            fwdArray = [original].flat()
                            level = fwdArray.length
                            relationship = fwdArray.shift()
                        }
                        
                        const parents = relationship === "origin" ? [receiver.origin] : receiver.parentPrimitiveWithRelationship(relationship)
                        if( parents ){
                            out = uniquePrimitives(parents)
                            if( level > 1){
                                out = uniquePrimitives(parents.map(d=>{
                                    return d.relationshipAtLevel(fwdArray ? fwdArray : relationship, level - 1, false)
                                }).flat(Infinity))
                            }
                        }
                        return out
                    }                    
                }
                if( prop === "originAtLevel"){
                    return function(level){
                        let node = receiver
                        while(level--){
                            if( node ){
                                node = node.origin
                            }
                        }
                        return node
                    }                    
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
                    if( prop === "doesImport"){
                        return (id, filters)=>{
                            console.log(`Check segment `, id, receiver.id)
                            if( receiver?.referenceParameters?.target === "items" && receiver.referenceParameters.importConfig){
                                const candidates = receiver.referenceParameters.importConfig.filter(d=>d.id === id)
                                const match = candidates.filter(d=> {
                                    const thisMatch = d.filters.filter(d2 => {
                                        console.log(`Checking`)
                                        const thisSet = filters.find(ip=>{
                                            const allKeys = [...Object.keys(d2), ...Object.keys(ip)].filter((d,i,a)=>d!== "id" && a.indexOf(d)===i)
                                            return allKeys.reduce((a,c)=>{
                                                let res = false
                                                if( d2[c] instanceof Object){
                                                    if( Array.isArray(d2[c]) ){
                                                        res = areArraysEqualIgnoreOrder( d2[c], ip[c])
                                                    }else if( d2[c] instanceof Object ){
                                                        res = d2[c]?.idx === ip[c]?.idx
                                                    }else{
                                                        throw `Param ${c} not processed`
                                                    }
                                                }else{
                                                    res = (d2[c] === ip[c]) 
                                                }
                                                console.log(" - ", res)
                                                return res && a}, true)
                                            })
                                            console.log(`Result = `, thisSet)
                                            return thisSet
                                    })
                                    console.log(thisMatch)
                                    return thisMatch.length === filters.length && thisMatch.length === d.filters.length
                                })

                                console.log(match.length)
                                if( match.length === 1){
                                    return true
                                }
                            }
                            return false
                        }
                    }
                    if( prop === "filterItems"){
                        return (list, filters)=>{
                            
                            return PrimitiveConfig.commonFilter( 
                                list, 
                                filters,
                                {
                                    parentsAt:(list, pivot, relationship)=>list.map(d=>d.relationshipAtLevel(relationship, pivot)),                                    
                                    parentsOfType:(primitive, type)=>primitive.findParentPrimitives({type: type}),
                                    parentsOfTypeForList:(list, type)=>uniquePrimitives(list.map(d=>d.findParentPrimitives({type: type})).flat()),
                                    getPrimitive:(id)=>obj.primitive(id),
                                    parentIds:(primitive)=>primitive.parentPrimitiveIds,
                                    primitiveChildren:(primitive, type)=>primitive.primitives.allItems.filter(d=>!type || d.type===type),

                                })
                        }                        
                    }
                    if( prop === "___filterItems"){
                        return (list, filters)=>{
                            let thisSet


                            const notCat1 = (list, hits, filter)=>{
                                const invert = filter.invert ?? false
                                const l1Hits = hits.map(d=>obj.primitive(d)?.primitives?.allCategory).flat().filter(d=>d).map(d=>d.id)
                                if( l1Hits.length === 0){
                                    return list
                                }
                                return list.filter(d=>{
                                    const parents = d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)
                                    const result = parents.reduce((a,d)=>a && d.parentPrimitiveIds.filter(d=>l1Hits.filter(d2=>d2===d).length > 0).length === 0, true)
                                    return invert ^ result
                                })
                                //return list.filter(d=>{invert ^ !d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.[0]?.parentPrimitiveIds.filter(d=>l1Hits.filter(d2=>d2===d).length > 0).length > 0)
                            }

                            for( const filter of filters){
                                if( filter === undefined){
                                    continue
                                }
                                const invert = filter.invert ?? false
                                if( filter.type === "parent"){
                                    let hitList = [filter.value].flat()
                                    if( hitList.length === 0){
                                        thisSet = (thisSet || list)
                                    }else{

                                        if( hitList.includes(undefined) || hitList.includes(null)){
                                            hitList = hitList.filter(d=>d !== undefined && d !== null )
                                            thisSet = notCat1( thisSet || list, [filter.sourcePrimId], filter)
                                        }
                                        if( filter.sourcePrimId){
                                            if( !filter.relationship || filter.relationship === "origin" ){
                                                thisSet = (thisSet || list).filter(d=>invert ^ d.originAtLevel(filter.pivot).parentPrimitiveIds.filter(d=>hitList.includes(d)).length > 0)
                                            }else{
                                                thisSet = (thisSet || list).filter(d=>invert ^ (d.relationshipAtLevel(filter.relationship,filter.pivot)?.[0]?.parentPrimitiveIds ?? []).filter(d=>hitList.includes(d)).length > 0)
                                            }
                                        }else{
                                            if( !filter.relationship || filter.relationship === "origin" ){
                                                thisSet = (thisSet || list).filter(d=>invert ^ d.originAtLevel(filter.pivot).id === d)
                                            }else{
                                                thisSet = (thisSet || list).filter(d=>invert ^ (d.relationshipAtLevel(filter.relationship,filter.pivot)?.map(d=>d.id) ?? []).filter(d=>hitList.includes(d)).length > 0)
                                            }

                                        }
                                    }
                                }else if( filter.type === "not_category_level1"){
                                    const hits = [filter.value].flat()
                                    thisSet = notCat1( thisSet || list, hits, filter)
                                }else if( filter.type === "question"){
                                    thisSet = (thisSet || list).filter(d=>invert ^ filter.map.includes( d.findParentPrimitives({type: filter.subtype})?.[0]?.id))
                                }else if( filter.type === "type"){
                                    if( filter.map !== undefined){
                                        if( Array.isArray(filter.map)){
                                            thisSet = (thisSet || list).filter(d=>invert ^ filter.map.includes(d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.[0]?.referenceId))
                                        }else{
                                            thisSet = (thisSet || list).filter(d=>invert ^ d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.[0]?.referenceId === filter.map)
                                        }
                                    }
                                }else if( filter.type === "title"){
                                    if( filter.value !== undefined){
                                        const val = [filter.value].flat()
                                        thisSet = (thisSet || list).filter(d=>{
                                            const titles = d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.map(d=>d.title)
                                            if( invert ){
                                                return !titles.reduce((a,d)=>a && val.includes(d), true)
                                            }else{
                                                return titles.reduce((a,d)=>a || val.includes(d), false)
                                            }
                                        })
                                        /*
                                        if( Array.isArray(filter.value)){
                                            thisSet = (thisSet || list).filter(d=>invert ^ filter.value.includes(d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.[0]?.title))
                                        }else{
                                            thisSet = (thisSet || list).filter(d=>invert ^ filter.value === d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.[0]?.title)
                                        }*/
                                    }
                                }else if( filter.type === "parameter"){
                                    let values = [filter.value].flat()
                                    let isRange = values?.[0]?.min_value !== undefined || values?.[0]?.max_value !== undefined
                                    if( !isRange){
                                        thisSet = (thisSet || list).filter(d=>{
                                            const params = d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.map(d=>d.referenceParameters?.[filter.param])
                                            if( invert ){
                                                return !params.reduce((a,d)=>a && values.includes(d), true)
                                            }else{
                                                return params.reduce((a,d)=>a || values.includes(d), false)
                                            }
                                        })
                                       /* thisSet = (thisSet || list).filter(d=>{
                                            let r = d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.[0]?.referenceParameters?.[filter.param]
                                            if( r === null){
                                                r = undefined
                                            }
                                            return invert ^ values.includes(r)
                                        })*/
                                    }else{
                                            thisSet = (thisSet || list).filter(d=>{
                                                const toCheck = d.relationshipAtLevel(filter.relationship ?? "origin", filter.pivot)?.map(d=>d.referenceParameters?.[filter.param]).filter(d=>d)
                                                if( toCheck.length === 0){
                                                    return false
                                                }
                                                return invert ^ toCheck.reduce((r,v)=>{
                                                    return r || values.reduce((a,c)=>a || (v >= (c.min_value ?? -Infinity) && v <= (c.max_value ?? Infinity)), false)
                                                }, false)
                                            })
                                    }
                                }
                            }
                            return thisSet || list
                        }
                    }
                    if( prop === "fetchItemsForAction"){
                        return (options = {})=>{

                            let list = []
                            let primitive = receiver
                            let source = options.source ?? primitive
                            
                            
                            let type = primitive.referenceParameters?.type 
                            const target = primitive.referenceParameters?.target || "children"
                            const referenceId = primitive.referenceParameters?.referenceId 
                            const constrainIds = primitive.primitives.params?.constrain_parent_chain.allIds

                            console.log(constrainIds)
                            
                            if(target === "descend"){
                                list = source.primitives.strictDescendants
                            }else if(target === "all_descend"){
                                list = source.primitives.descendants
                            }else if(target === "ref"){
                                list = source.primitives.ref.uniqueAllItems
                            }else if(target === "link"){
                                list = source.primitives.link.uniqueAllItems
                            }else if(target === "children"){
                                list = source.primitives.origin.uniqueAllItems
                            }else if(target === "items"){
                                list = source.itemsForProcessing
                            }else if( target === "hierarchy"){
                                list = source.findParentPrimitives({referenceId: referenceId ? [referenceId] : undefined, type: type ? [type] : undefined, first: true})
                            }
                            
                            if( type ){
                                list = list.filter((d)=>d.type === type)
                            }
                            if( referenceId ){
                                list = list.filter((d)=>d.referenceId === referenceId)
                            }
                            
                            if( list === undefined){
                                return []
                            }
                            if( constrainIds.length > 0){
                                const validIds = obj.primitive(constrainIds[0]).itemsForProcessing.map(d=>d.id)
                                
                                list = list.filter(d=>validIds.includes(d.id))
                            }
                            
                            return list
                        }
                    }
                    if( prop === "itemsForProcessing"){
                        return receiver.itemsForProcessingWithOptions()
                    }
                    if( prop === "itemsForProcessingWithFilter"){
                        return (f,o)=>{
                            let items = receiver.itemsForProcessingWithOptions(undefined, o)
                            if( f && f.length > 0){ 
                                return receiver.filterItems( items, f)
                            }else{
                                return items
                            }
                        }
                    }
                    if( prop === "itemsForProcessingFromImport"){
                        return (p, o)=>receiver.itemsForProcessingWithOptions(p.id, o)
                    }
                    if( prop === "itemsForProcessingWithOptions"){
                        return (id, options = {})=>{
                            if( !options.cache ){
                                options.cache = {}
                            }

                            if( Object.keys(receiver.primitives).includes("imports")){
                                //console.log(`Importing from other sources`)
                                let fullList = []
                                for( const source of receiver.primitives.imports.allItems){
                                    if( id && source.id !== id){
                                        continue
                                    }
                                    let list = []
                                    let node = source.primitives
                                    if( Object.keys(node).includes("imports")  ){
                                        const test = options.cache[source.id]
                                        if( test ){
                                            list = test
                                        }else{
                                            list = list.concat(source.itemsForProcessingWithOptions(undefined, {cache:options.cache}) )
                                            options.cache[source.id] = list
                                        }
                                    }else{
                                        if( receiver.referenceParameters?.path ){
                                            node = node.fromPath(receiver.referenceParameters?.path)
                                        }
                                        let items 
                                        if( !receiver.referenceParameters?.path && source.type === "segment"){
                                            items = source.nestedItems
                                        }else{
                                            items = node.uniqueAllItems
                                        }
                                        if( receiver.referenceParameters?.descend ){
                                            items = items.map(d=>[d,d.primitives.strictDescendants]).flat(2).filter(d=>d)
                                        }
                                        if( receiver.referenceParameters?.referenceId ){
                                            const match = receiver.referenceParameters.referenceId
                                            items = items.filter(d=>d.referenceId === match) 
                                        }
                                        if( receiver.referenceParameters?.type ){
                                            items = items.filter(d=>d.type === receiver.referenceParameters.type) 
                                        }
                                        list = list.concat(items)
                                    }
                                    let config
                                    
                                    config = receiver.referenceParameters?.importConfig?.filter(d=>d.id === source.id)
                                    
                                    
                                    //console.log(`For ${received.plainId} - ${list.length} and ${config?.length} configs to scan`)

                                    if( config && config.length > 0){
                                        let filterOut
                                        for(const set of config ){
                                            if( set.filters ){
                                                filterOut ||= []
                                                let thisSet = receiver.filterItems(list, set.filters)
                                                if( thisSet ){
                                                    filterOut = filterOut.concat( thisSet )
                                                }
                                            }
                                        }
                                        list = filterOut ?? list
                                        for(const set of config ){
                                            if( set.referenceId ){
                                                console.log(`Descend after import`)
                                                list = uniquePrimitives( list.map(d=>d.primitives.filter(d=>d.referenceId === set.referenceId)).flat())
                                            }
                                        }
                                    }
                                    fullList = fullList.concat(list) 
                                }
                                if(receiver.type === "view" && !options.ignoreFinalViewFilter){
                                    const viewFilters = CollectionUtils.convertCollectionFiltersToImportFilters( receiver )
                                    fullList = uniquePrimitives(fullList)
                                    fullList = receiver.filterItems(fullList, viewFilters)
                                }
                                if( (options?.pivot !== false) && receiver.referenceParameters?.pivot){
                                    fullList = uniquePrimitives(fullList)
                                    fullList = fullList.map(d=>d.originAtLevel(receiver.referenceParameters?.pivot))
                                }
                                return uniquePrimitives(fullList)
                            }else{
                                return receiver.primitives.uniqueAllItems
                            }                        
                        }
                    }
                    if( prop === "nestedItems"){
                        if( d.type === "view"){
                            return uniquePrimitives( receiver.primitives.allSegment.map(d=>d.nestedItems).flat() )
                        }
                        if( d.type === "segment"){
                            const segmentItems = (node)=>{
                                return node.primitives.uniqueAllItems.map((d)=>{
                                    if( d.type === "segment" ){
                                        return segmentItems( d )
                                    }else{
                                        return d
                                    }
                                }).flat()
                            } 
                            return segmentItems( receiver).filter((d)=>!d.referenceParameters?.duplicate)
                        }
                        return []
                    }
                    if( d.type === "result"){
                        d.analyzer =  ()=>{
                            return ResultAnalyzer(receiver).init()
                        }
                    }else if( d.type === "assessment"){
                        d.analyzer =  ()=>{
                            return AssessmentAnalyzer(receiver).init()
                        }
                    /*}else if( receiver.isTask){
                        d.analyzer =  ()=>{
                            return ExperimentAnalyzer(receiver).init()
                        }*/
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
                        //let origin = receiver.parentPrimitiveRelationships["origin"]
                        let originId = receiver.originId
                        if( originId ){
                            const origin = obj.primitive(originId)
                            d._origin = origin
                            return origin
                        }
                    }
                    if( prop === "originId"){
                        let id = undefined;
                        if (receiver._parentPrimitives) {
                            for (const key in receiver._parentPrimitives) {
                                if (receiver._parentPrimitives[key].includes("primitives.origin")) {
                                    id = key;
                                    break;
                                }
                            }
                        }
                        return id
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
                    if( prop === "_parentPrimitives"){
                        return d.parentPrimitives
                    }
                    if( prop === "parentPrimitives"){
                        const parents = receiver.parentPrimitiveIds.map((d)=>obj.primitive(d)).filter((d)=>d)
                        return parents
                    }
                    if( prop === "parentPrimitiveIds"){
                        return d.parentPrimitives ? Object.keys(d.parentPrimitives).filter((p)=>d.parentPrimitives[p]?.length > 0 && !d.parentPrimitives[p].includes("primitives.imports")) : []
                    }
                    if( prop === "parentPrimitiveWithRelationship"){
                        return (rel)=>{
                            let out

                            if( d.parentPrimitives ){
                                out = Object.keys(d.parentPrimitives).filter(k=>{
                                    return d.parentPrimitives[k].filter(d=>d.split(".").slice(-1)?.[0] === rel).length > 0
                                }).map(id=>obj.primitive(id)).filter(d=>d)
                                
                                if( out.length === 0){
                                    out = undefined
                                }
                            }
                            return out
                        }
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
                    if( d.type === "hypothesis"){
                        if( prop === "addresses" ){
                            return receiver.findParentPrimitives({type: "assessment"}).map((a)=>{
                                const component_ids = a.primitives.paths(receiver.id, '.hfc.').map((d)=>d.match(/\.hfc\.(\d+)/)?.[1])
                                const components = component_ids.map((d)=>{return {framework: a.framework, component: a.framework?.components[d]}})
                                return components
                            }).flat().filter((d,i,a)=>a.findIndex((d2)=>d2.component.id === d.component.id)===i)
                        }
                        if( prop === "addresses_lenses" ){
                            return receiver.addresses.map((c)=>{
                                if( c.framework ){
                                    return c.framework.lenses[ c.component.lens]
                                }
                                return undefined
                            }).filter((d,i,a)=>d && a.indexOf(d)===i)
                        }
                        if( prop === "addresses_components" ){
                            return receiver.addresses.map((c)=>{
                                const lens = c.framework.lenses[ c.component.lens]
                                return {...c.component, lens}
                            }).filter((d,i,a)=>a.findIndex((d2)=>d2.id === d.id)===i)
                        }
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
                if( prop === "getDocumentAsText"){
                    return ()=>{
                        return obj.getPrimitiveDocumentAsText( receiver )
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
                if( prop === "context"){
                    const category = receiver.metadata
                    if( !category?.ai?.process?.context){
                        if( receiver.type === "evidence"){
                            if( receiver.referenceParameters?.quote){
                                return `${category.title}: ${receiver.title}\nQuote:"${receiver.referenceParameters?.quote.replaceAll(/\n/g,". ")}"`
                            }
                            if( receiver.origin.referenceId === PrimitiveConfig.Constants.QUERY_RESULT ){                                
                                const parts = [
                                    receiver.origin.referenceParameters?.description ? `Context:${receiver.origin.referenceParameters?.description.replaceAll(/\n/g,". ")}` : undefined, 
                                    receiver.origin.referenceParameters?.quote ? `Quote:${receiver.origin.referenceParameters?.quote.replaceAll(/\n/g,". ")}` : undefined
                                ].filter(d=>d)
                                if( parts.length > 0){
                                    return `${category.title}: ${receiver.title}\n${parts.join("\n")}`
                                }
                            }
                            return receiver.title
                        }
                        return undefined
                    }
                    let out = ""
                    for(const d of Object.keys(category.ai.process.context.fields ?? [])){
                        const source = category.ai?.process?.context.fields[d]
                        if( source instanceof Object){
                            let header = source.title
                            const children = receiver.primitives.uniqueAllItems.filter(d=>d.referenceId === source.referenceId)
                            if( children && children.length > 0){
                                if( out.length > 0){
                                    out += ".\n"
                                }
                                out += (header?.length > 0 ? `${header}:` : "") + children.map((d,i)=>`${(source.prefix + " ") ?? ""}${i} - ${d.title}`).join("\n")
                            }else{
                                if( source.fallback){
                                    const param = source.fallback.slice(7)
                                    if( receiver.referenceParameters?.[param] ){
                                        out += (header?.length > 0 ? `${header}: ` : "") + receiver.referenceParameters[param]
                                    }
                                }
                            }

                        }else{
                            if( receiver.referenceParameters?.[d] ){
                                let header = source
                                out += header?.length > 0 ? `${header}: ${receiver.referenceParameters[d]}\n` : `${receiver.referenceParameters[d]}\n`
                            }
                        }
                    }
                    return out.length === 0 ? undefined : out
                }
                if( prop === "findRouteToParent"){
                    return function(target){
                        const ids = {}
                        const layerUp = (node, indent = 0)=>{
                            let out
                            if( node.parentPrimitiveIds.length === 0){
                                return false
                            }
                            for(const d of node.parentPrimitives){
                                if(d.id === target){
                                    return [d]
                                }
                            }
                            node.parentPrimitives.forEach((d)=>{
                                if( !ids[d.id] ){
                                    ids[d.id] = true
                                    if(!out){
                                        const result = layerUp( d, indent + 1 )
                                        if( result ){
                                            out = [...result, d]
                                        }
                                    }
                                }
                            })
                            return out   
                        }
                        return layerUp(receiver)
                    }
                }
                if( prop === "findParentPrimitives"){
                    return function(options = {type: undefined, referenceId: undefined, first: false}){
                        const ids = {}
                        const scatter = (list)=>{
                            if( list === undefined){ return []}
                            let expanded = list.map((p)=>p.parentPrimitives).flat()
                            let out = uniquePrimitives( expanded )
                            out = out.filter(d=>{
                                const res = !ids[d.id]
                                if( res ){
                                    ids[d.id] = true
                                }
                                return res
                            })

                            return out
                        }
                        let found = []
                        let current = scatter( [receiver] )
                        
                        while( current.length > 0){
                            if( options.type === undefined && options.referenceId === undefined){
                                found = [...found, ...current]
                            }else if(options.type === undefined){
                                found = [...found, ...current.filter((p)=>options.referenceId.includes(p.referenceId))]                        
                            }else if(options.referenceId === undefined){
                                found = [...found, ...current.filter((p)=>options.type.includes(p.type))]                        
                            }else{
                                found = [...found, ...current.filter((p)=>(options.referenceId.length === 0 || options.referenceId.includes(p.referenceId)) && (options.type.length === 0 || options.type.includes(p.type)))]                        
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
                        let out = d.parentPrimitives[parent.id]
                        if( out ){
                            out = out.map(d=>d.slice(11))
                            if( root ){
                                const len = root.length
                                out = out.filter((d)=>d.substr(0, len) == root)
                            }
                        }
                        return out
                        
                        /*const out = parent.primitives.paths( d.id )?.map((d)=>d.slice(1))
                        if( root ){
                            return out.filter((d)=>d.substr(0, root.length) == root)
                        }
                        return out*/
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
    if( prims ){
        obj.data = {primitives: prims.reduce((a,d)=>{a[d.id] = primitive_access(d, "primitive");return a}, {})}
    }

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
            //const primitives = fetch('/api/primitives').then(response => {obj.loadProgress.push('primitives');return response.json()})
            const primitives = fetch('/api/primitives').then(response => response.arrayBuffer()).then(buffer => {obj.loadProgress.push('primitives');return unpack(new Uint8Array(buffer))})
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
                obj.data.primitives = primitives.reduce((o,d)=>{o[d._id] = primitive_access(d, "primitive"); return o}, {})
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