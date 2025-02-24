import PrimitiveParser from "./PrimitivesParser";
import ResultAnalyzer from "./ResultAnalyzer";
import ContactHelper from "./ContactHelper";
import {default as PrimitiveConfig} from "./PrimitiveConfig";
import AssessmentAnalyzer from "./AssessmentAnalyzer";
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { unpack, pack } from 'msgpackr';
import CollectionUtils from "./CollectionHelper";

 export function __uniquePrimitives(list){
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
    

export function uniquePrimitives(list) {
    if (!Array.isArray(list) || list.length === 0) {
        return [];
    }

    const ids = new Set(); // Track unique ids
    const result = []; // Store unique primitives

    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p === undefined || p.id === undefined) {
            continue; // Skip undefined primitives or those without an id
        }
        const pid = p.id; // Cache the id
        if (!ids.has(pid)) {
            ids.add(pid); // Add id to set
            result.push(p); // Add the object to the result array
        }
    }

    return result; // Return the array of unique primitives
}

function doStep(data, step, currentInstruction){
    let out = data
    const instructions = Object.keys(step) 
    for(const instruction of instructions){
        const config = step[instruction]
        switch(instruction){
            case "fetch_children":{
                let temp = out.flatMap(d=>[...d.primitives.origin.allItems,...d.primitives.results.allItems]).filter(d=>d)
                if( config.referenceId ){
                    temp = temp.filter(d=>d.referenceId === config.referenceId)
                }
                out = temp
                break
            }
            case "fetch_ancestor":{
                if( config.referenceId ){
                    const r = [config.referenceId]
                    out = out.flatMap(d=>d.findParentPrimitives({referenceId: r}))
                }else{
                    out = out.map(d=>d.origin).filter(d=>d)
                }
                break
            }
            case "filter":{
                out = out.filter(d=>{
                    let scope = d
                    if( config.fetch_children ){
                        scope = doStep( [d], {fetch_children: config.fetch_children})
                        if( config.count !== undefined){
                            return scope.length === config.count
                        }
                    }
                })
                break
            }
        }
    }
    return out
    
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
            console.log(`Got primitives step 1`)
            const buffer =  await response.arrayBuffer()
            console.log(`Got primitives step 2`)
            const data = unpack(new Uint8Array(buffer))
            console.log(`Got primitives step 3`)
            obj.data.primitives = data.reduce((o,d)=>{o[d._id] = primitive_access(d, "primitive"); return o}, {})
            console.log(`Got primitives step 4`)

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
                        obj.triggerCallback("new_primitive", [newObj], undefined, true )
                        obj.triggerCallback("relationship_update", list, undefined, true)
                    }
                }else if(entry.type === "add_relationship"){
                        const parent = obj.primitive( entry.id)
                        const target = obj.primitive( entry.target)
                        if( parent && target){
                            if(parent.primitives.fromPath(entry.path)?.allIds.includes(entry.target)){
                            }else{
                                obj.triggerCallback("relationship_update", [entry.id, entry.target], {parent: entry.id, target:entry.target}, true)
                                parent.addRelationship(target, entry.path, true)
                            }
                        }
                    //console.log(  ` Add rel ${parent.id} > ${target.id} : ${entry.path}` )
                }else if(entry.type === "remove_relationship"){
                        const parent = obj.primitive( entry.id)
                        const target = obj.primitive( entry.target)
                        if( parent && target){
                            if(parent.primitives.fromPath(entry.path)?.allIds.includes(entry.target)){
                                obj.triggerCallback("relationship_update", [entry.id, entry.target], true)
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
                            Object.keys(entry.fields).forEach((field)=>{
                                const frag = field.split('.')
                                const root = frag.shift()
                                let val = entry.fields[field]

                                if( val === null){
                                    val = undefined
                                }

                                if( root === 'referenceParameters'){
                                    let trigger = false
                                    if(frag.length === 0){
                                        for( const f in val){
                                            target.setParameter(f, val[f], true, true)
                                        }
                                    }else{
                                        const oldValue = PrimitiveConfig.decodeParameter(target.referenceParameters, frag.join("."))
                                        if( val?.decode && val.modify !== undefined){
                                            target.modifyParameter(frag.join("."), val.value, val.modify, true)
                                        }else{
                                            target.setParameter(frag.join("."), val, true, true)
                                        }
                                        trigger = !obj.deepEqual(oldValue, val)
                                    }
                                    if( trigger ){
                                        obj.triggerCallback("set_parameter", [target], field, true )
                                    }
                                }else{
                                    
                                    const oldVal = PrimitiveConfig.decodeParameter(target, field)
                                    if( !obj.deepEqual(oldVal, val) ){
                                        target.setField(field, val, undefined, true)
                                        obj.triggerCallback("set_field", [target], field, true )
                                    }
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
        deepEqual:function(obj1, obj2){
            if (obj1 === obj2) return true;
          
            if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
              return false;
            }
          
            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);
          
            if (keys1.length !== keys2.length) return false;
          
            for (let key of keys1) {
              if (!keys2.includes(key) || !obj.deepEqual(obj1[key], obj2[key])) {
                return false;
              }
            }
          
            return true;
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
                this.updateField(receiver, "title", title, "set_title", undefined)
            },
            updateParameter:function( receiver, parameterName, value ){
                this.updateField(receiver, `referenceParameters.${parameterName}`, value, "set_parameter", undefined)
            },
            modifyParameter:function( receiver, parameterName, value, add ){
                this.updateField(receiver, `referenceParameters.${parameterName}`, value, "set_parameter", add)
            },
            updateField( receiver, field, value, callback_name, modify){
                const data = {
                    receiver: receiver.id,
                    value: value,
                    modify: modify, 
                    field: field
                }
                obj.triggerCallback(callback_name, [receiver], field)
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
                        //obj.triggerCallback(callback_name, [receiver], field)
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
            async setRelationshipAndWait( receiver, target, path, set ){
                const data = {
                    receiver: receiver.id,
                    target: target.id,
                    path: path,
                    set: set
                }
                obj.triggerCallback("relationship_update", [receiver, target])
                await fetch("/api/set_relationship",{
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                })
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
            delete obj.data.primitives[ id ]
        },
        addPrimitive:function(data){
            obj.data.primitives[data.id || data._id] = primitive_access(data,"primitive")
        },
        primitives:function(){
            return Object.values(obj.data.primitives)
        },
        primitiveByPlain:function(id){
            let data = obj.primitives().find((p)=>p.plainId === id)
            return data
        },
        primitive:function(id){
            let data = obj.data.primitives[id]
            if( !data && !isNaN(id) ){
                data = this.primitiveByPlain(id)
                if( data ){
                    console.warn(`Primitive lookup ${id} by plainId`)
                }
            }
            return data
        },
        workspace:function(id){
            return obj.workspaces().find((d)=>d._id === id)
        },
        workspaces:function(){
            return obj.data.workspaces
        },
        categories:function(){
            return Object.values(obj.data.categories)
        },
        category:function(id){
            return obj.data.categories[ id ]
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
                let flatIds, descendIds 
                if( idList ){
                    for(const id of [idList].flat(Infinity)){
                        if( id ){
                            if( id.endsWith("+")){
                                descendIds ||= []
                                descendIds.push( id.slide(0, id.length - 1))
                            }else{
                                flatIds ||= []
                                flatIds.push(id)
                            }
                        }
                    }
                }
                store.callbacks[e].push({callback: cb, filterIds: flatIds, descendIds, id: id})
                //console.log(`registered ${e} for ${id} (${store.callbacks[e].length}) / ${[idList].flat().join(", ")}`)
            })
            return id
        },
        triggerCallback:function(e, items, data, fromRemote){
            let store = this
            if( this.callbacks[e] === undefined){
                return
            }
            items = [items].flat()

            items = items.map((d)=> d instanceof Object ? d.id : d)

            let name = e

            this.callbacks[e].forEach((e)=>{
                const doCall = true
                if( e.filterIds ){
                    if( !items.some((item)=>e.filterIds.includes(item)).length === 0){
                        doCall = false
                    }
                }
                if( e.descendIds ){
                    if( items.filter((item)=>{
                            const allIds = obj.primitive(item).primitives.uniqueAllIds
                            return allIds.some(item=>e.filterIds.includes(item)).length > 0
                        }).length === 0){
                            doCall = false
                    }
                }
                if( doCall){
                    e.callback(items, name, data, fromRemote)
                }
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
                title = undefined,//category?.blankTitle ? undefined : "New item", 
                type = "result", 
                state = undefined, 
                extraFields = {}, 
                parent = undefined, 
                flowElement = undefined,
                workspaceId = undefined, 
                parentPath = undefined, 
                categoryId = undefined, 
                referenceParameters = {} } = options
            
            if(!categoryId && options.referenceId){
                categoryId = options.referenceId 
            }

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
                title: title,
                type: type,
                state: state,
                flowElement,
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
                obj.triggerCallback("relationship_update", [parent, newObj], {parent: parent.id, target: newObj.id})
            }
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
    obj.followSteps = (out, steps)=>{
        for(const d of steps){
            out = doStep(out, d)
        }
        return out
    }
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
                        /*switch( pConfig.type ){
                            case "string": return (pConfig.optional ?? true) 
                        }*/
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
                if( prop === "addToParameter"){
                    return function( parameterName, value, skip = false){
                        return receiver.modifyParameter(parameterName, value, true, skip)
                    }
                }
                if( prop === "removeFromParameter"){
                    return function( parameterName, value, skip = false){
                        return receiver.modifyParameter(parameterName, value, false, skip)
                    }
                }
                if( prop === "modifyParameter"){
                    return function( parameterName, value, add, skip = false ){
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
                        if(target[last] && Array.isArray(target[last])){
                            target[last] = target[last].filter(d=>d !== value)
                        }else{
                            target[last] = receiver.metadata?.parameters?.[last]?.default ?? []
                        }
                        if( add ){
                            target[last].push( value )
                        }
                        if(!skip){
                            obj.controller.modifyParameter( receiver, parameterName, value, add  )
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
                        d._ppIdCache = undefined
                    }

                }
                if( prop === "removeParentRelationship"){
                    return function( parent, path){
                        const asString = receiver.primitives.flattenPath(path)
                        if(!d.parentPrimitives){
                            d.parentPrimitives = {}
                        }
                        if(!d.parentPrimitives[parent.id]){
                            d.parentPrimitives[parent.id] = []
                        }
                        
                        d.parentPrimitives[parent.id] = d.parentPrimitives[parent.id].filter((d)=>d !== asString)
                        d._ppIdCache = undefined
                    } 

                }
                if( prop === "addRelationshipAndWait"){
                    return async function( target, path ){
                        if( receiver.primitives.add( target.id, path )){
                            target.addParentRelationship(receiver, path)
                            console.log(`ADDING WITH WAIT`)
                            await obj.controller.setRelationshipAndWait( receiver, target, path, true )
                            console.log(`ADDING WITH WAIT - BACK`)
                        }
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
                        directs = uniquePrimitives(directs)
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
                    let category = obj.category(d.referenceId)
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
                            //console.log(`Check primitive `, id, receiver.id)
                            return PrimitiveConfig.checkImports( receiver, id, filters)
                        }
                    }
                    if( prop === "filterItems"){
                        return (list, filters)=>{
                            let thisSet = undefined
                            for(const filter of filters ){
                                
                                let {resolvedFilterType, pivot, relationship, check, includeNulls, skip, isRange} = PrimitiveConfig.commonFilterSetup( filter )
                                if( skip){
                                    continue
                                }
                                const setToCheck = (thisSet || list)

                                let lookups = setToCheck.map(d=>d.relationshipAtLevel(relationship, pivot))

                                let scope
                                if( filter.type === "parent"){
                                    if( filter.sourcePrimId ){
                                        scope = obj.primitive(filter.sourcePrimId)?.primitives.allIds ?? []
                                    }
                                }else if( filter.subtype === "question"){
                                    const prompts = uniquePrimitives(setToCheck.map(d=>d.findParentPrimitives({type: "prompt"})).flat()),
                                    scope = prompts.map(d=>d.id)
                                    check = check.map(d=>prompts.filter(d2=>d2.parentPrimitiveIds.includes(d))).flat().map(d=>d.id)
                                }else if( filter.subtype === "search"){
                                    if( includeNulls){
                                        scope = uniquePrimitives(setToCheck.map(d=>d.findParentPrimitives({type: "search"})).flat()).map(d=>d.id)
                                    }
                                }else if(filter.type === "not_category_level1"){
                                    includeNulls = true
                                    check = []
                                    if( filter.sourcePrimId ){
                                        scope = obj.primitive(filter.sourcePrimId).primitives.allIds
                                    }
                                }
                                    
                                
                                thisSet = PrimitiveConfig.doFilter( {resolvedFilterType, filter, setToCheck, lookups, check, scope, includeNulls, isRange}, {parentIds:(primitive)=>primitive.parentPrimitiveIds})
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
                    if( prop === "itemsForProcessingWithParams"){
                        return (p)=>{
                            return receiver.itemsForProcessingWithOptions(undefined, {params: p})
                        }
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
                    if( prop === "filterTargets"){
                        if( receiver.referenceParameters?.importConfig ){
                            const idsToLookup = []
                            let relationships = []
                            let doImport
                            let importFrom = receiver
                            let importFilter
                            receiver.referenceParameters.importConfig.forEach(d2=>{
                                return d2.filters.forEach( d=>{
                                    if( d.type === "parent"){
                                        idsToLookup.push(d.value)
                                    }else if( d.type === "title" || d.type === "parameter"){
                                        doImport = true
                                        if( d.relationship ){
                                            relationships.push(d.relationship)
                                        }
                                        importFilter = (d3)=>d3.title === d.value
                                        importFrom = obj.primitive( d2.id )
                                    }
                                })
                            })
                            if( doImport && (relationships.length > 0 || importFilter)){
                                let items = importFrom.itemsForProcessing
                                let mapped = []
                                if( relationships.length > 0){

                                    for(const rel of relationships){
                                        mapped.push(items.flatMap(d=>d.relationshipAtLevel(rel ?? "origin", rel?.length ?? 1)))
                                    }
                                    mapped = uniquePrimitives(mapped.flat(Infinity))
                                }else{
                                    mapped = items
                                }
                                if( importFilter ){
                                    mapped = mapped.filter(importFilter)
                                }                                
                                return mapped
                            }
                            if( idsToLookup.length > 0){
                                return uniquePrimitives(idsToLookup.flatMap(d=>obj.primitive(d)?.filterTargets))
                            }
                            return []
                        }
                        return [receiver]
                    }
                    if( prop === "filterDescription"){
                        if( receiver.referenceParameters?.importConfig ){
                            const idsToLookup = [], frags = []
                            receiver.referenceParameters.importConfig.forEach(d=>{
                                return d.filters?.forEach( d=>{
                                    if( d.type === "parent"){
                                        idsToLookup.push(d.value)
                                    }else if(d.type === "title" || d.type === "parameter"){
                                        frags.push(d.value)
                                    }
                                })
                            })
                            if( idsToLookup.length > 0){
                                //const segmentName = idsToLookup.map(d=>obj.primitive(d)?.title).filter(d=>d).join(", ")
                                const segmentName = idsToLookup.map(d=>obj.primitive(d)?.filterDescription).filter(d=>d).join(", ")
                                return segmentName
                            }
                            return frags.join(", ")
                        }else{
                            return receiver.title
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
                            const excludedTypes = new Set(["segment", "category", "query", "report", "reportinstance"]);

                            if( Object.keys(receiver.primitives).includes("imports") && (options.forceImports || (receiver.type !== "query" && receiver.type !== "summary" && receiver.type !== "search"))){
                                let fullList = []
                                for( const source of receiver.primitives.imports.allItems){
                                    if( id && source.id !== id){
                                        continue
                                    }
                                    if( source.type === "flow" && !receiver.inFlow){
                                        const instances = source.primitives.origin.allUniqueFlowInstance
                                        const address = source.primitives.outputs.paths(receiver.id)[0]
                                        if( address ){
                                            const [outputPin, inputPin] = address.slice(1).split("_")
                                            return uniquePrimitives(instances.flatMap(d=>d.outputs[outputPin]?.data).filter(d=>d))
                                        }
                                        return uniquePrimitives(instances.flatMap(d=>d.outputs.output?.data).filter(d=>d))
                                    }else if( source.inFlow && !receiver.inFlow){
                                        const address = source.primitives.outputs.paths(receiver.id)[0]
                                        if( address ){
                                            const [outputPin, inputPin] = address.slice(1).split("_")
                                            return source.outputs[outputPin]?.data ?? []
                                        }
                                        return source.itemsForProcessing
                                    }else{
                                        const address = source.primitives.outputs.paths(receiver.id)[0]
                                        if( address && address !== '.impout_impin' && address !== '.impin_impin'){
                                            const [outputPin, inputPin] = address.slice(1).split("_")
                                            return source.outputs[outputPin]?.data ?? []
                                        }

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
                                        if( !receiver.referenceParameters?.path && source.type === "segment"){
                                            list = source.nestedItems
                                        }else{
                                            list = node.uniqueAllItems
                                        }
                                    }
                                    let params = options.params ?? receiver.getConfig
                                    if( params.descend ){
                                        list = list.map(d=>[d,d.primitives.strictDescendants]).flat(2).filter(d=>d)
                                    }
                                    if( params.referenceId ){
                                        const match = params.referenceId
                                        if( Array.isArray(match)){
                                            list = list.filter(d=>match.includes(d.referenceId))
                                        }else{
                                            list = list.filter(d=>d.referenceId === match) 
                                        }
                                    }
                                    if( params.type ){
                                        list = list.filter(d=>d.type === params.type) 
                                    }
                                    let config
                                    
                                    config = receiver.referenceParameters?.importConfig?.filter(d=>d.id === source.id)
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
                                                list = uniquePrimitives( list.map(d=>d.primitives.filter(d=>d.referenceId === set.referenceId)).flat())
                                            }
                                        }
                                    }
                                    if( receiver.referenceParameters?.pivot){
                                        if( typeof(receiver.referenceParameters?.pivot) === "number"){
                                            list = list.map(d=>d.originAtLevel(receiver.referenceParameters?.pivot)).flat()
                                        }else{
                                            list = uniquePrimitives(list.map(d=>d.relationshipAtLevel(receiver.referenceParameters.pivot, receiver.referenceParameters.pivot.length)).flat())
                                        }
                                    }
                                    fullList = fullList.concat(list) 
                                }
                                if(receiver.type === "view"  && !options.ignoreFinalViewFilter){
                                    let viewFilters = CollectionUtils.convertCollectionFiltersToImportFilters( receiver )
                                    if( viewFilters.length === 0 && receiver.inFlow){
                                        if( receiver.configParent  ){
                                            viewFilters = CollectionUtils.convertCollectionFiltersToImportFilters( receiver.configParent )
                                        }
                                    }
                                    fullList = uniquePrimitives(fullList)
                                    fullList = receiver.filterItems(fullList, viewFilters)
                                }
                                return uniquePrimitives(fullList)
                            }else if(receiver.type === "summary"){
                                return [receiver]
                            }else{
                                let ids = Object.keys(receiver.primitives).filter(d=>d !== "imports" && d !== "params" && d !=="config" && d !=="inputs" && d !=="outputs" ).map(d=>receiver.primitives[d].allIds).flat()
                                let list = []
                                const check = new Set()
                                for( const d of ids ){
                                    if( !check.has(d)){
                                        check.add(d)
                                        const p = obj.primitive(d)
                                        if( p ){
                                            list.push(p)
                                        }
                                    }
                                }
                                if( receiver.type === "query" || receiver.type  === "segment" || receiver.type === "search"){
                                    if( receiver.type === "query" && !options.ignoreFinalViewFilter){
                                        const viewFilters = CollectionUtils.convertCollectionFiltersToImportFilters( receiver )
                                        list = receiver.filterItems(list, viewFilters)
                                    }
                                    if( receiver.type === "search"){
                                        const nestedSearch = [receiver, ...receiver.primitives.origin.allSearch].filter(d=>d)
                                        console.log(`Got ${nestedSearch.length} nested searches`)
                                        list = nestedSearch.flatMap(d=>d.primitives.uniqueAllItems)
                                    }
                                    let params = options.params ?? receiver.getConfig
                                    if( params.extract ){
                                        const check = [params.extract].flat()
                                        list = list.filter(d=>check.includes(d.referenceId))
                                    }
                                    list = list.filter(d => !excludedTypes.has(d.type));
                                }
                                return list
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
                    if( prop === "outputs"){
                        if( receiver.type === "flow" || receiver.type === "flowinstance"){
                            return receiver.fetchInputs(undefined, "outputs" , "output")
                        }
                        let outputMap = PrimitiveConfig.getOutputMap(receiver)
                        const out = {}
                        const c = {}
                        for(const d of outputMap){
                            let targetMap = c[d.targetId]
                            if( d.outputPin !== "impout" && d.targetPin === "impin"){
                                const query = receiver.metadata?.pins?.output?.[d.outputPin]?.query
                                if( query ){
                                    out[d.outputPin] = {data: receiver.follow(receiver.metadata?.queries?.[query]?.steps ?? [])}
                                }else{
                                    console.error(`Cant handle pin connected to import without query`, d)
                                }
                            }else{
                                if(!targetMap){
                                    const target = obj.primitive( d.targetId )
                                    targetMap = target.fetchInputs( receiver.id)
                                    c[d.targetId] = targetMap
                                }
                                out[d.outputPin] = targetMap[d.targetPin]
                            }
                        }
                        return out
                    }
                    if(prop === "inFlow"){
                        if( receiver.flowElement){
                            return true
                        }
                        const configParent = receiver.parentPrimitiveWithRelationship("config")?.[0]
                        if( configParent?.flowElement ){
                            return true
                        }
                        return false
                    }
                    if(prop === "inputPinsWithStatus"){
                        const pins = receiver.inputPins
                        return Object.keys(pins).reduce((a,pinName)=>{
                            a[pinName] = {
                                ...pins[pinName],
                                connected: pinName === "impin" ? receiver.primitives.imports.allIds.length > 0 : Object.keys(receiver.primitives.inputs).some(d=>d.endsWith(`_${pinName}`))
                            }
                            return a
                        },{})
                    }
                    if(prop === "outputPinsWithStatus"){
                        const pins = receiver.outputPins
                        return Object.keys(pins).reduce((a,pinName)=>{
                            a[pinName] = {
                                ...pins[pinName],
                                connected: pinName === "impout" ? Object.values(receiver._parentPrimitives ?? {}).some(d=>d.some(d=>d === "primitives.imports")) : Object.values(receiver._parentPrimitives).some(d=>d.some(d=>d.startsWith(`primitives.inputs.${pinName}_`)))
                            }
                            return a
                        },{})
                    }
                    if(prop === "inputPins"){
                        let dynamicPinSource = receiver
                        let generatorPins = {}
                        if(receiver.type === "flowinstance"){
                            dynamicPinSource = receiver.origin
                        }else if( !receiver.flowElement ){
                            dynamicPinSource = receiver.configParent ?? receiver
                        }
                        if( receiver.type === "actionrunner"){
                            const rConfig  = dynamicPinSource.getConfigWithoutOverrides()                                
                            if( rConfig.generator){
                                const generateTarget = obj.category( rConfig.generator)
                                generatorPins = generateTarget?.ai?.generate?.inputs ?? {}
                            }
                        }
                        return {
                            ...receiver._pins("input"),
                            ...PrimitiveConfig.getDynamicPins(dynamicPinSource, dynamicPinSource.getConfigWithoutOverrides(), "inputs"),
                            ...generatorPins
                        }
                    }
                    if(prop === "outputPins"){
                        const dynamicPinSource = receiver.type === "flowinstance" ? receiver.origin : receiver
                        return {
                            ...receiver._pins("output"),
                            ...PrimitiveConfig.getDynamicPins(dynamicPinSource, dynamicPinSource.getConfigWithoutOverrides(), "outputs")
                        }

                    }
                    if(prop === "_pins"){
                        return (mode = "input")=>{
                            const base = {
                                ...(receiver.metadata?.pins?.[mode] ?? {})
                            }
                            if( receiver.type === "query" || receiver.type === "view"){
                                if( mode === "output"){
                                    base["rowAxis"] =  {name: "Axis (row)", types: ["primitive", "string"]}
                                    base["colAxis"] =  {name: "Axis (col)", types: ["primitive", "string"]}
                                }else{
                                    base["rowAxis"] =  {name: "Axis (row)", types: ["primitive","string"]}
                                    base["colAxis"] =  {name: "Axis (col)", types: ["primitive", "string"]}
                                }
                            }
                            if( mode === "output" && receiver.type === "flow"){
                                return base
                            }
                            return {
                                [mode === "input" ? "impin" : "impout"]:{
                                    name: `Imports ${mode}`,
                                    types: ["primitive"]
                                },
                                ...base
                            }
                        }
                    }
                    if( prop === "fetchInputs"){
                        return (sourceId, mode = "inputs", pinMode = "input")=>{
                            let inputMap = PrimitiveConfig.getInputMap(receiver, mode)
                            if( sourceId ){
                                inputMap = inputMap.filter(d=>d.sourceId === sourceId)
                            }
                            
                            inputMap = inputMap.map(d=>{
                                let sourcePrimitive = obj.primitive(d.sourceId)
                                let sourcePinConfig = sourcePrimitive.metadata?.pins?.output?.[d.sourcePin]

                                if( sourcePrimitive.type === "flow" || sourcePrimitive.type === "flowinstance"){
                                    const flow = sourcePrimitive.type === "flow" ? sourcePrimitive : sourcePrimitive.findParentPrimitives({type: ["flow"]})[0]

                                    if( flow.referenceParameters?.controlPins?.[d.sourcePin]){
                                        sourcePrimitive = flow
                                        sourcePinConfig = {
                                            ...flow.referenceParameters?.controlPins?.[d.sourcePin],
                                            source: `param.${d.sourcePin}`
                                        }                                        
                                    }
                                }
                                const inputMapSource = receiver.type === "flowinstance" ? receiver.origin : receiver
                                //let inputMapConfig = inputMapSource.metadata?.pins?.[pinMode]?.[d.inputPin]
                                let inputMapConfig = receiver._pins(pinMode)[d.inputPin]
                                if( inputMapConfig?.hasConfig ){
                                    const localConfig = inputMapSource.getConfigWithoutOverrides().pins?.[d.inputPin] ?? {}
                                    inputMapConfig = {
                                        ...inputMapConfig,
                                        ...localConfig
                                    }
                                }
                                return {
                                    ...d,
                                    sourcePrimitive,
                                    sourcePinConfig,
                                    inputMapConfig
                            }})

                            //const dynamicPinSource = receiver.type === "flowinstance" ? receiver.origin : receiver
                            let dynamicPinSource = receiver
                            if(receiver.type === "flowinstance"){
                                dynamicPinSource = receiver.origin
                            }else if( !receiver.flowElement ){
                                dynamicPinSource = receiver.configParent ?? receiver
                            }
                            let dynamicPins = dynamicPinSource.type === "query" || dynamicPinSource.type === "summary" || dynamicPinSource.type === "page" ? PrimitiveConfig.getDynamicPins(dynamicPinSource, dynamicPinSource.getConfigWithoutOverrides(), "inputs") : {}
                            

                            if( (receiver.type === "flow" || receiver.type === "flowinstance") && mode === "outputs"){
                                dynamicPins = {
                                    ...dynamicPins,
                                    ...PrimitiveConfig.getDynamicPins(dynamicPinSource, dynamicPinSource.getConfigWithoutOverrides(), "outputs")
                                }
                            }
                            let generatorPins = {}
                            if( receiver.type === "actionrunner"){
                                const rConfig  = receiver.getConfigWithoutOverrides()                                
                                if( rConfig.generator){
                                    const generateTarget = obj.category( rConfig.generator)
                                    generatorPins = generateTarget?.ai?.generate?.inputs ?? {}

                                    dynamicPins = {
                                        ...dynamicPins,
                                        ...generatorPins
                                    }
                                }
                            }

                            let interim = PrimitiveConfig.alignInputAndSource(inputMap,  dynamicPins)

                            for(const d of interim){
                                if( d.sourceTransform === "imports"){
                                    d.sources = d.sourcePrimitive.itemsForProcessing
                                }else if( d.sourceTransform === "get_axis"){
                                    const items = d.sourcePrimitive.itemsForProcessing
                                    const extents = CollectionUtils.mapCollectionByAxis(items, CollectionUtils.primitiveAxis(d.sourcePrimitive, d.axis, items)).extents.column
                                    if(d.inputMapConfig.types.includes("primitive")){
                                        d.pass_through = extents.map(d=>d.primitive)
                                    }else{
                                        d.pass_through = extents.map(d=>d.label)
                                    }
                                }else if( d.sourceTransform === "filter_imports"){
                                    const items = d.sourcePrimitive.itemsForProcessing
                                    const {data, extents} = CollectionUtils.mapCollectionByAxis(items, CollectionUtils.primitiveAxis(d.sourcePrimitive, "col", items), CollectionUtils.primitiveAxis(d.sourcePrimitive, "row", items))
                                    const colMap = extents.column.reduce((a,c)=>{
                                        a[c.idx] = c.label
                                        return a
                                    },{})
                                    const rowMap = extents.row.reduce((a,c)=>{
                                        a[c.idx] = c.label
                                        return a
                                    },{})


                                    d.sourceBySegment = data.reduce((a,d)=>{
                                        const desc = [colMap[d.column],rowMap[d.row]].filter(d=>d && d.length > 0).join(" - ")
                                        a[desc] ||= []
                                        a[desc].push( d.primitive )
                                        return a
                                    }, {})
                                    /*
                                    const sourceSegments = uniquePrimitives(itp.flatMap(d=>d.findParentPrimitives({type: ["segment"]})))
                                    d.sourceBySegment = sourceSegments.reduce((a,d)=>{
                                        const desc = d.filterDescription
                                        a[desc] ||= []
                                        a[desc] = a[desc].concat( itp.filter(d2=>Object.keys(d2._parentPrimitives ?? {}).includes(d.id)))
                                        return a
                                    }, {})*/
                                }else if( d.sourceTransform === "child_list_to_string"){
                                    d.sources = d.sourcePrimitive.itemsForProcessing
                                }
                            }
                            let final = PrimitiveConfig.translateInputMap(interim)
                            
                            return final
                        }
                    }

                    if( prop === "inputs"){
                        return receiver.fetchInputs(undefined)
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
                        if( d._ppIdCache ){
                            return d._ppIdCache
                        }

                        d._ppIdCache = d.parentPrimitives ? Object.keys(d.parentPrimitives).filter((p)=>d.parentPrimitives[p]?.length > 0 && !d.parentPrimitives[p].includes("primitives.imports") && !d.parentPrimitives[p].find(d=>d.startsWith("primitives.inputs."))) : []
                        return d._ppIdCache
                    }
                    if( prop === "parentPrimitiveIdsAsSource"){
                        let out = []
                        if( d.parentPrimitives ){
                            out = Object.keys(d.parentPrimitives).filter(k=>{
                                return d.parentPrimitives[k].some(d => d.startsWith("primitives.source"))
                            })
                        }
                        return out
                    }
                    if( prop === "parentPrimitivesAsSource"){
                        return receiver.parentPrimitiveIdsAsSource.map(d=>obj.primitive(d))
                    }
                    if( prop === "parentPrimitiveWithRelationship"){
                        return (relationship)=>{
                            let out
                            let [rel, rId] = relationship ? relationship.split(":") : []
                            if( rId !== undefined){
                                rId = parseInt(rId)
                            }

                            if( d.parentPrimitives ){
                                out = Object.keys(d.parentPrimitives).filter(k=>{
                                    if( rel === "origin_link_result"){
                                        return d.parentPrimitives[k].filter(d=>{
                                            const parts = d.split(".")
                                            return ( parts[parts.length - 1] === "origin" || parts[parts.length - 1] === "link" || parts[parts.length - 2]=== "results" )
                                        }).length > 0
                                    }
                                    const check = `.${rel}`
                                    return d.parentPrimitives[k].some(d => d.endsWith(check))
                                }).map(id=>obj.primitive(id)).filter(d=>d && (rId === undefined || rId === d.referenceId))
                                
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
                    return d.metadata?.title ?? d.type.charAt(0).toUpperCase() + d.type.slice(1)
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
                            if( source.referenceId){
                                let header = source.title
                                let showCount = false
                                const children = receiver.primitives.uniqueAllItems.filter(d=>d.referenceId === source.referenceId)
                                if( children && children.length > 0){
                                    if( out.length > 0){
                                        out += ".\n"
                                    }
                                    out += (header?.length > 0 ? `${header}:` : "") + children.map((d,i)=>{
                                        let interim = `${(source.prefix + " ") ?? ""}${showCount ? i + " - " : ""} ${d.title}`
                                        for(const p of Object.keys(d.referenceParameters ?? {})){
                                            const val = [d.referenceParameters[p]].flat().filter(d=>d)
                                            if( val.length > 0){
                                                interim += `\n${p}: ${val.join(", ")}`
                                            }
                                        }
                                        return interim
                                    }).join("\n") + "\n"
                                }else{
                                    if( source.fallback){
                                        const param = source.fallback.slice(7)
                                        if( receiver.referenceParameters?.[param] ){
                                            out += (header?.length > 0 ? `${header}: ` : "") + receiver.referenceParameters[param] + "\n"
                                        }
                                    }
                                }
                            }else{
                                const list = [receiver.referenceParameters?.[d]].flat().filter(d=>d)
                                if( list.length > 0){
                                    out += (source.header ?? d) + ":\n"

                                    const titleBase = source.title ?? d

                                    for(const d of list){
                                        const title = titleBase.replace(/\{([^}]+)\}/g, function(match, fieldName) {
                                            return fieldName in d ? d[fieldName] : match;
                                        });

                                        out += title + ":" + source.fields.map(d2=>d[d2]) + "\n"
                                    }
                                }
                            }
                        }else{
                            let field
                            if( d === "title"){
                                field = receiver.title
                            }else{
                                field = receiver.referenceParameters?.[d]
                            }
                            if( field ){
                                let header = source
                                out += header?.length > 0 ? `${header}: ${field}\n` : `${field}\n`
                            }
                        }
                    }
                    return out.length === 0 ? undefined : out
                }
                if( prop === "findImportRoute"){
                    return function(target, out = []){
                        if( receiver.primitives.imports.allIds.includes(target)){
                            out.push(receiver)
                        }else{
                            const workings = receiver.parentPrimitives.filter(d=>d.type === "working")
                            for(const d of workings){
                                d.findImportRoute( target, out)
                            }                        
                        }
                        return out
                    }
                }
                if( prop === "importedBy"){
                    return Object.keys(receiver._parentPrimitives).filter(d=>receiver._parentPrimitives[d].includes("primitives.imports")).map(d=>obj.primitive(d))
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
                if( prop === "follow"){
                    return function(steps){
                        let out = [receiver]
                        if( steps ){
                            for(const d of steps){
                                out = doStep(out, d)
                            }
                        }
                        return out
                    }
                }
                if( prop === "findParentPrimitives"){
                    return function(options = {type: undefined, referenceId: undefined, first: false}){
                        const checked = new Set()
                        const scatter = (list)=>{
                            if( list === undefined){ return []}
                            return uniquePrimitives(list.flatMap((p) => p.parentPrimitives)).filter(d=>{
                                if( checked.has(d.id) ){
                                    return false
                                }
                                checked.add(d.id)
                                return true
                            })
                        }
                        let found = []
                        let current = scatter( [receiver] )
                        if( typeof(options.type) == "string"){
                            options.type = [options.type]
                        }
                        
                        while( current.length > 0){
                            if (options.type === undefined && options.referenceId === undefined) {
                                found.push(...current); // Use push instead of spread for performance
                            } else {
                                let filtered = current;
                                if (options.referenceId !== undefined && options.referenceId.length > 0) {
                                    filtered = filtered.filter((p) => options.referenceId.includes(p.referenceId));
                                }
                                if (options.type !== undefined && options.type.length > 0) {
                                    filtered = filtered.filter((p) => options.type.includes(p.type));
                                }
                                found.push(...filtered);
                            }

                            /*if( options.type === undefined && options.referenceId === undefined){
                                found = [...found, ...current]
                            }else if(options.type === undefined){
                                found = [...found, ...current.filter((p)=>options.referenceId.includes(p.referenceId))]                        
                            }else if(options.referenceId === undefined){
                                found = [...found, ...current.filter((p)=>options.type.includes(p.type))]                        
                            }else{
                                found = [...found, ...current.filter((p)=>(options.referenceId.length === 0 || options.referenceId.includes(p.referenceId)) && (options.type.length === 0 || options.type.includes(p.type)))]                        
                            }*/
                            if( options.first && found.length > 0 ){
                                return found
                            }
                            current = scatter( current )
                        }
                        return uniquePrimitives(found)
                    }
                    /*return function(options = {type: undefined, referenceId: undefined, first: false}){
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
                    }*/
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
                if( prop === "configParent"){
                    return receiver.parentPrimitiveWithRelationship("config")?.[0]
                }
                if( prop === "getConfig"){
                    return receiver._getConfigWithFields( )
                }
                if( prop === "_getConfigWithFields"){
                    return (requiredFields, doneFields = new Set() )=>{
                        const localConfig = {}

                        const inputsConfig = {}
                        if( requiredFields == undefined){
                            requiredFields = new Set([
                                ...Object.keys(receiver.referenceParameters ?? {}),
                                ...Object.keys(receiver.metadata?.parameters ?? {})
                                ])                            
                        }

                        Object.keys(receiver.referenceParameters).forEach(field => {
                            if( !doneFields.has( field ) ){
                                localConfig[field] = receiver.referenceParameters[field]
                                requiredFields.delete(field)
                                doneFields.add(field)
                            }
                        });
                        
                        if( requiredFields.size > 0){
                            const overrides = []
                            const connectedInputs = Object.keys(receiver.primitives.inputs).map(d=>d.split("_")[1])
                            Object.keys(receiver.metadata?.pins?.input ?? {}).forEach((d=>{
                                if( receiver.metadata.pins.input[d]?.override && connectedInputs.includes(d) && !doneFields.has(d)){
                                    console.log(`Override ${d} for ${receiver.plainId}`)
                                    overrides.push({
                                        input:d,
                                        param:receiver.metadata.pins.input[d]?.override
                                    })
                                } 
                            }))
                            if( overrides.length > 0){
                                const inputs = receiver.inputs
                                for(const d of overrides ){
                                    if( inputs[d.input] && inputs[d.input].data !== undefined){
                                        if( typeof( inputs[d.input].data) !== "string" || inputs[d.input].data.trim().length > 0){
                                            inputsConfig[d.param] = inputs[d.input].data
                                            requiredFields.delete(d.param)
                                            doneFields.add(d.param)
                                        }
                                    }
                                }
                            }
                        }

                        const base = receiver.getConfigWithoutOverrides( requiredFields, doneFields )

                        
                        return {
                            ...base,
                            ...inputsConfig,
                            ...localConfig,
                        }
                    }
                }
                if( prop === "getConfigWithoutOverrides"){
                    return (requiredFields, doneFields = new Set() )=>{
                        if( !requiredFields ){
                            requiredFields = new Set( Object.keys(receiver.metadata?.parameters ?? {}))
                        }
                        const { referenceId, referenceParameters } = receiver;
                    
                        const category = receiver.metadata
                        let categoryConfig = {} 
                    

                        for(const cKey of  [
                            ...Object.keys(receiver.referenceParameters ?? {}),
                            ...Object.keys(receiver.metadata?.parameters ?? {})
                        ]){
                            if( !doneFields.has(cKey)){
                                requiredFields.add(cKey)
                            }

                        }

                        for(const p of Object.keys(category?.parameters ?? {})){
                            if(  category.parameters[p].default && !doneFields.has(p) ){
                                categoryConfig[p] = category.parameters[p].default
                                //requiredFields.delete(p)
                                //doneFields.add(p)
                            }
                        }
                    
                        const localConfig = referenceParameters || {};
                    
                        let parentConfig = {};
                        //if (requiredFields.size > 0) {
                            const configParent = receiver.configParent
                            if( configParent ){
                                parentConfig = configParent._getConfigWithFields(requiredFields, doneFields)
                                Object.keys(parentConfig).forEach(field => {
                                    requiredFields.delete(field)
                                    doneFields.add(field)
                                });
                            }
                        //}
                    
                        return {
                            ...categoryConfig,
                            ...parentConfig,
                            ...localConfig,
                        };
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
                    }
                }
                if( prop === "stepOrder" && receiver.type === "flow"){
                    const steps = receiver.primitives.origin.allUniqueItems.filter(d=>d.type !== "flowinstance")
                    console.log(`Got ${steps.length} steps`)
                    let out = {}
                    const toProcess = steps
                    let stage = 0
                    
                    let addedThisLoop = 0
                    do{
                        const willPlace = {}
                        addedThisLoop = 0
                        for(const step of toProcess){
                            if( out[step.id] !== undefined){
                                continue
                            }
                            const inputsToCheck = [...step.primitives.imports.allUniqueItems, ...step.primitives.inputs.allUniqueItems].filter(d=>d.inFlow || d.type === "flowinstance")
                            const canPlace = inputsToCheck.reduce((a,check)=>{
                                let r = false
                                if( check.type === "flowinstance"){
                                    r = true
                                }else if( out[ check.id ] !== undefined){
                                    r = true
                                }
                                return a &&  r
                            }, true)
                            if( canPlace ){
                                willPlace[step.id] = stage
                                addedThisLoop++
                            }
                        }
                        out = {
                            ...out,
                            ...willPlace
                        }
                        stage++
                    }while( addedThisLoop > 0 )
                    return out
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
            const primitives = fetch('/api/primitives').then(response => response.arrayBuffer()).then(buffer => {obj.loadProgress.push('primitives');console.log("Unpacking...");return unpack(new Uint8Array(buffer))})
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
                obj.data.categories = categories.reduce((o,d)=>{o[d.id] = d; return o}, {})
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