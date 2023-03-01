export default function PrimitiveParser(obj){
    const uniqueArray = (a)=>{
        return a.filter((v,i)=>a.indexOf(v) === i)
    }
    const structure = {
            get(target, prop, receiver) {
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
                        target.push( item )
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

                if( prop === "includes" ){
                    return function(){
                        let value = arguments[0]
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
                }
                if( prop === "paths" ){
                    return function(){
                        let id = arguments[0]
                        const find = (v, path)=>{
                            let out = []
                            if( v instanceof(Array) ){
                                if( v.includes( id )){
                                    out.push( path )
                                }
                                v.filter((d)=>d instanceof(Object) ).forEach((d)=>{
                                    out.push( Object.keys(d).map((k)=>{
                                        return find( d[k], path + "." + k)
                                    }))
                                })
                            }else{
                                out.push( Object.keys(v).map((k)=>{
                                    return find( v[k], path + "." + k)
                                }))
                            }
                            out = out.flat(2).filter((d)=>d !== undefined)
                            return out.length > 0 ? out : undefined
                        }
                        let result = find( target, "" )
                        if( arguments.length == 2){
                            let str = arguments[1] instanceof(Array) ? `.${arguments[1].join('.')}.` : arguments[1]
                            let len = str.length
                            result = result.filter((p)=>p.slice(0, len) === str)
                        }
                        if( result ){
                            result = result.map((p)=>p.replace(/^\.null/,""))
                        }
                        return result
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
                if( prop === "uniqueIds" && target instanceof(Array)){
                    return uniqueArray( receiver.ids )
                }

                if( prop === "allIds"){
                    const flatten = (v)=>{
                        return Object.values(v).map((d)=>{
                            if( d instanceof(Object) ){
                                return flatten(d) 
                            }else{
                                return d
                            }
                        }).flat()
                    }
                    return flatten( target )
                }
                if( prop === "uniqueAllIds"){
                    return uniqueArray( receiver.allIds )
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
                        return value;
                    }
                }
                if( prop in target ){
                    return new Proxy(target[prop], structure)
                }else {
                    let s = prop.toString()
                    if( s in target ){
                        return new Proxy(target[s], structure)
                    }
                }
                if( prop === "fromPath"){
                    return function(path, create = false){
                        let node = receiver                        

                        while( path instanceof(Object) ){
                            let step = Object.keys(path)[0]
                            let last = node
                            path = path[step]
                            node = node[step]
                            if( node === undefined){
                                if( create ){
                                    last[step] = {}
                                    node = last[step]
                                }else{
                                    return undefined
                                }
                            }
                        }
                        if( !node[path] && create ){
                            node[path] = []
                        }
                        return node[path]

                    }
                }
                if( obj ){
                    // was here
                    if( prop === "items"){
                        return receiver.ids.map((d)=>obj.primitive(d)).filter((d)=>d)
                    }
                    if( prop === "allItems"){
                        return receiver.allIds.map((d)=>obj.primitive(d)).filter((d)=>d)
                    }
                    if( prop === "uniqueAllItems"){
                        return receiver.uniqueAllIds.map((d)=>obj.primitive(d)).filter((d)=>d)
                    }
                    if( prop === "uniqueItems"){
                        return receiver.uniqueIds.map((d)=>obj.primitive(d)).filter((d)=>d)
                    }
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
                }
            }
        }
        return structure
    }