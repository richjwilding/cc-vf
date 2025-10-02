function uniqueArray(arr){
    return Array.from(new Set(arr));
}

const actions = {
    flattenPath(rx, tgt) { 
        return function(path){
            if( typeof(path) === "string"){
                if( path.slice(0, 11) !== "primitives."){
                    path = "primitives." + path
                }
                return path
            }
            let out = ['primitives']
            const nest = (node)=>{
                if( node instanceof Object ){
                    const k = Object.keys(node)[0]
                    out.push(k)
                    nest( node[k] )
                    return out
                }
                out.push((node === undefined || node === '') ? "null" : node)
                return out
            }
            return nest( path).join(".")
        }
    },
    uniqueAllIds(receiver, target) {
        const stack = [target];
        const result = [];
        let idx = 0;
        const seen = Object.create(null);
      
        while (idx < stack.length) {
          const current = stack[idx++];
          if (current !== null && typeof current === "object") {
            if (Array.isArray(current)) {
              // fast array walk
              for (let i = 0, len = current.length; i < len; i++) {
                stack.push(current[i]);
              }
            } else {
              // Object.keys gets own properties only
              const keys = Object.keys(current);
              for (let i = 0, len = keys.length; i < len; i++) {
                stack.push(current[keys[i]]);
              }
            }
          } else {
            if( !seen[current] ){
                seen[current] = true
                result.push(current);
            }
          }
        }
      
        return result;
      },
    allIds(receiver, target) {
        const stack = [target];
        const result = [];
        let idx = 0;
      
        while (idx < stack.length) {
          const current = stack[idx++];
          if (current !== null && typeof current === "object") {
            if (Array.isArray(current)) {
              // fast array walk
              for (let i = 0, len = current.length; i < len; i++) {
                stack.push(current[i]);
              }
            } else {
              // Object.keys gets own properties only
              const keys = Object.keys(current);
              for (let i = 0, len = keys.length; i < len; i++) {
                stack.push(current[keys[i]]);
              }
            }
          } else {
            result.push(current);
          }
        }
      
        return result;
      },
    uniqueIds(receiver, target){
        return uniqueArray( receiver.ids )
    },
    allUniqueIds(receiver, target){
        return receiver.uniqueAllIds
    },
    allUniqueCategory(receiver, target){
        return receiver.uniqueAllItems.filter((p)=>p.type === "category")
    },
    allUniqueSegment(receiver, target){
        return receiver.uniqueAllItems.filter((p)=>p.type === "segment")
    },
    allUniqueFlow(receiver, target){
        return receiver.uniqueAllItems.filter((p)=>p.type === "flow")
    },
    allUniqueQuery(receiver, target){
        return receiver.uniqueAllItems.filter((p)=>p.type === "query")
    },
    allUniqueSearch(receiver, target){
        return receiver.uniqueAllItems.filter((p)=>p.type === "search")
    },
    allUniqueCategorizer(receiver, target){
        return receiver.uniqueAllItems.filter((p)=>p.type === "categorizer")
    },
    allUniqueSummary(receiver, target){
        return receiver.uniqueAllItems.filter((p)=>p.type === "summary")
    },
    __uniqueAllIds(receiver, target){
        return uniqueArray( receiver.allIds )
    },
    includes(receiver, target){
        return function(){
            let value = arguments[0]
            if( value instanceof  Object){
                value = value.id
            }
            const find = (v)=>{
                return Object.values(v).reduce((r, d)=>{
                    if( d instanceof(Object) ){
                        return r || find(d) 
                    }else{
                        return r || (d === value)
                    }
                },false)
            }
            return find( target )
        }
    },
    paths(receiver, target){
        return function(){
            let id = arguments[0]
            let out = []
            const find = (v, path)=>{
                if( v instanceof(Array) ){
                    for(const d of v){
                        if( d === id ){
                            out.push( path )
                        }else{
                            if( d instanceof(Object)){
                                Object.keys(d).forEach((k)=>find( d[k], `${path}.${k}`))
                            }
                        }
                    }
                }else if( v !== undefined && v !== null){
                    Object.keys(v).forEach((k)=>find( v[k], `${path}.${k}`))
                }
            }
            find( target, "" )
            let result = out
            if( result && arguments.length == 2){
                let str = arguments[1] instanceof(Array) ? `.${arguments[1].join('.')}.` : ("." + arguments[1] + (arguments[1].endsWith(".") ? "" :"."))
                result = result.filter((p)=>p.startsWith(str))
            }
            if( result ){
                result = result.map((p)=>p.replace(/^\.null/,""))
            }
            return result
        }
    }
}
const storeActions = {
    items(receiver, target, obj){
        return receiver.ids.map((d)=>obj.primitive(d)).filter((d)=>d)
    },
    allItems(receiver, target,obj){
        return receiver.allIds.map((d)=>obj.primitive(d)).filter((d)=>d)
    },
    uniqueAllItems(receiver, target,obj){
        const out = []
        for(const d of receiver.uniqueAllIds){
            const p = obj.primitive(d)
            if( p ){
                out.push(p)
            }
        }
        return out
    },
    allUniqueItems(receiver, target,obj){
        return receiver.uniqueAllIds.map((d)=>obj.primitive(d)).filter((d)=>d)
    },uniqueItems(receiver, target,obj){
        return receiver.uniqueIds.map((d)=>obj.primitive(d)).filter((d)=>d)
    },
    strictDescendantIds(receiver, target,obj){
        return receiver._buildDescendantIds( {}, true, true )
    },
    strictDescendants(receiver, target,obj){
        const ids = receiver._buildDescendantIds( {}, true, true )
        return ids.flatMap((d)=>obj.primitive(d))//.filter((d)=>d)
    },
    directDescendants(receiver, target,obj){
        const ids = receiver._buildDescendantIds( {}, true, false, true )
        return ids.map((d)=>obj.primitive(d)).filter((d)=>d)
    },
    descendants(receiver, target,obj){
        return receiver.descendantIds.map((d)=>obj.primitive(d)).filter((d)=>d)
    },
    descendantIds(receiver, target,obj){
        return receiver._buildDescendantIds( {}, true )
    },
    _buildDescendantIds(receiver, target, obj) {
        return function _recurse(temp, first = true, origin_only = false, direct_only = false) {
          // initialize once
          if (first) {
            temp = new Set();
          }
      
          // gather children IDs into a single Set (no intermediate arrays)
          const childrenIds = new Set();
      
          if (origin_only) {
            for (const k of ORIGIN_KEYS) {
              const arr = target[k];
              if (Array.isArray(arr)) {
                for (let i = 0, L = arr.length; i < L; i++) {
                  childrenIds.add(arr[i]);
                }
              }
            }
          } else {
            // skip these props and, if direct_only, also skip 'ref'
            for (const key in target) {
              if (COMMON_SKIP.has(key) || (direct_only && DIRECT_SKIP.has(key))) continue;
              const ids = receiver[key].uniqueAllIds;
              for (let i = 0, L = ids.length; i < L; i++) {
                childrenIds.add(ids[i]);
              }
            }
          }
      
          // now recurse down each new child
          for (const id of childrenIds) {
            if (!id || temp.has(id)) continue;
            temp.add(id);
      
            const p = obj.primitive(id);
            // only recurse if there actually are nested primitives
            if (p) {
                let hasPrims = false;
                for (const _ in p._primitives) {
                  hasPrims = true;
                  break;
                }
                if (hasPrims) {
                  p.primitives._buildDescendantIds(temp, false, origin_only, direct_only);
                }
            }
          }
      
          // on the top‐level call, return an array
          if (first) {
            return Array.from(temp);
          }
        };
      }
}

const ORIGIN_KEYS   = ['link', 'origin', 'auto'];
const COMMON_SKIP   = new Set(['imports', 'chat', 'config', 'inputs']);
const DIRECT_SKIP   = new Set(['ref', 'link']);


export default function PrimitiveParser(obj){
    const structure = {
            get(target, prop, receiver) {
                if (prop in actions) {
                    return actions[prop](receiver, target);
                }
                if (prop in storeActions) {
                    return storeActions[prop](receiver, target, obj);
                }
                if( prop === "add" ){
                    return function(){
                        let item = arguments[0]
                        if( arguments[1] ){
                            const path = receiver.fromPath(arguments[1], true)
                            
                            if( !path){
                                console.warn(`Path not found`)
                                console.log(path)
                                return undefined
                            }
                            return path.add(item)
                        }
                        if( !(target instanceof Array) ){
                            if( !(null in target) ){
                                target[null] = []
                            }
                            target = target.null
                        }
                        if(!target.includes(item)){
                            target.push( item )
                        }
                        return receiver 
                    }
                }
                if( prop === "remove" ){
                    return function(){
                        let item = arguments[0]
                        if( arguments[1] ){
                            const path = receiver.fromPath(arguments[1])
                            
                            if( !path){
                                console.warn(`Path not found`)
                                console.log(path)
                                return undefined
                            }
                            return path.remove(item)
                        }
                        if( !(target instanceof Array) ){
                            target = target.null
                        }
                        let idx = target.findIndex((i)=> i === item )
                        while(idx > -1){
                            target.splice(idx,1)
                            idx = target.findIndex((i)=> i === item )
                        }

                        return receiver 
                    }
                }
                if( prop === "move" ){
                    return function(){
                        let item = arguments[0]
                        let from =  receiver.fromPath(arguments[1])
                        let to =  receiver.fromPath(arguments[2], true)
                        if( from && to ){
                            from.remove(item)
                        }
                        if( to ){
                            to.add(item)
                        }
                        return to
                    }
                }

                if( prop === "descendantsInclude" ){
                    return function(){
                        let value = arguments[0]
                        if( value instanceof(Object) ){
                            value = value.id
                        }
                        return receiver.descendantIds.includes(value)
                    }
                }
               
                
                if( prop === "relationships"){
                    return function(){
                        let path = receiver.paths(...arguments)
                        return path?.map((p)=>p.split('.').slice(-1)[0])
                    }
                }
                
                if( prop === "all"){
                    return target
                }
                if( prop === "ids" && target instanceof(Array)){
                    return target.map((d)=>{
                        if( d instanceof(Object)){
                            return undefined
                        }else{
                            return d
                        }}).filter((d)=>d)
                }
                
                if( prop === "filter" || prop === "length" || prop === "map"){
                    const base = receiver.allItems
                    const value = base[prop];
                    if (value instanceof Function) {
                        return function (...args) {
                            return value.apply(base, args);
                        };
                    }
                }
                if( Array.isArray(target) ){
                    let out
                    target.forEach((d)=>{
                        if( d instanceof(Object) ){
                            if( prop in d){
                                out = d[prop]
                            }
                        }
                    })
                    if( out ){
                        return new Proxy(out, structure)
                    }
                    if( prop in target ){
                        const value = target[prop];
                        if (value instanceof Function) {
                        return function (...args) {
                            return value.apply(this === receiver ? target : this, args);
                        };
                        }
                        if( value instanceof Object ){
                            return new Proxy(value, structure)
                        }
                        return value;
                    }
                }
                if( prop in target ){
                    if( target[prop] === null ){
                        target[prop] = []
                    }
                    return new Proxy(target[prop], structure)
                }else {
                    let s = prop.toString()
                    if( s in target ){
                        return new Proxy(target[s], structure)
                    }
                }
                if( prop === "underlying"){
                    return target
                }
                if( prop === "fromPath"){
                    return function(path, create = false){
                        if( !path){return receiver}
                        let node = receiver                        
                        if( typeof(path) === "string"){
                            path = path.split('.')
                            if( path[0] === "primitives"){
                                path.shift()
                            }
                            const last = path.pop()
                            if( path.length === 0){
                                path = last
                            }else{

                                path = path.reverse().reduce((o, c, idx)=>{
                                    return {[c]: idx === 0 ? last : o}
                                },{})
                            }
                        }

                        const addNode = ( last, step, prevLast, prevStep)=>{
                            let underlying = last.underlying
                            if( Array.isArray(underlying ) ){
                                if( underlying.length === 0 && prevLast ){
                                    if( Array.isArray(prevLast) ){
                                        const arr = prevLast.underlying.find((d)=>Object.keys(d)[0] == prevStep)
                                        if( arr  ){
                                            arr[prevStep] = {}
                                        }
                                    }else{
                                        prevLast.underlying[prevStep] = {}
                                    }
                                    last = prevLast[prevStep]
                                    underlying = last.underlying
                                    underlying[step] = []
                                }else{
                                    underlying.push({[step]: []})
                                }
                            }else{
                                underlying[step] = []
                            }
                            return last
                        }

                        let prevLast
                        let prevStep

                        const needCreate = (step, last) => {
                            const is_A = Array.isArray(last.underlying)
                            return (is_A && !last.underlying[step] && !last.underlying.find((d)=>Object.keys(d).includes(step)))
                            || (!is_A && last.underlying[step] === undefined)
                        }

                        while( path instanceof(Object) ){
                            let step = Object.keys(path)[0]
                            let last = node
                            path = path[step]
                            node = node[step]
                            if( needCreate(step, last) ){
                                if( create ){
                                    last = addNode( last, step, prevLast, prevStep)
                                    node = last[step]
                                }else{
                                    return new Proxy([], structure)
                                }
                            }
                            prevLast = last
                            prevStep = step
                        }
                        if( needCreate(path, node) && create ){
                            node = addNode( node, path, prevLast, prevStep)
                        }
                        return node[path]

                    }
                }
                if( obj ){
                    if( obj.types.includes(prop)){
                        return receiver.items.filter((p)=>p.type===prop)
                    }
                    if( prop.slice(0,6) === 'unique' ){
                        let type = prop.slice(6).toLowerCase()
                        if( obj.types.includes(type)){
                            return receiver.uniqueItems.filter((p)=>p.type === type)
                        }
                    }
                    if( prop.slice(0,9) === 'allUnique' ){
                        let type = prop.slice(9).toLowerCase()
                        if( obj.types.includes(type)){
                            return receiver.uniqueAllItems.filter((p)=>p.type === type)
                        }
                    }
                    if( prop.slice(0,3) === 'all' ){
                        let type = prop.slice(3).toLowerCase()
                        if( obj.types.includes(type)){
                            return receiver.allItems.filter((p)=>p.type === type)
                        }
                    }
                }
                if( target[null]){
                    return new Proxy(target[null], structure)[prop]
                }else{
                    return new Proxy([], structure)
                }
            }
        }
        return structure
    }