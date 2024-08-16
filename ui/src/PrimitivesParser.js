export default function PrimitiveParser(obj){
    const uniqueArray = (a)=>{
        return [...new Set(a)]
        return a.filter((v,i)=>a.indexOf(v) === i)
    }
    const structure = {
            get(target, prop, receiver) {
                if( prop === "flattenPath" ){
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
                if( prop === "includes" ){
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
                }
                
                if( prop === "paths" ){
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
                /*if( prop === "__paths" ){
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
                            }else if( v !== undefined && v !== null){
                                out.push( Object.keys(v).map((k)=>{
                                    return find( v[k], path + "." + k)
                                }))
                            }
                            out = out.flat(2).filter((d)=>d !== undefined)
                            return out.length > 0 ? out : undefined
                        }
                        let result = find( target, "" )
                        if( result && arguments.length == 2){
                            let str = arguments[1] instanceof(Array) ? `.${arguments[1].join('.')}.` : arguments[1]
                            let len = str.length
                            result = result.filter((p)=>p.slice(0, len) === str)
                        }
                        if( result ){
                            result = result.map((p)=>p.replace(/^\.null/,""))
                        }
                        return result
                    }
                }*/
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

                if (prop === "allIds") {
                    /*const flatten = (obj) => {
                        const stack = [obj];
                        const result = [];
                        
                        while (stack.length) {
                            const current = stack.pop();
                            
                            if (current !== null && typeof current === 'object') {
                                stack.push(...Object.values(current));
                            } else {
                                result.push(current);
                            }
                        }
                        
                        return result;
                    };*/
                
                    const stack = [target];
                    const result = [];
                
                    while (stack.length) {
                        const current = stack.pop();
                
                        if (current !== null && typeof current === 'object') {
                            for (const key in current) {
                                if (current.hasOwnProperty(key)) {
                                    stack.push(current[key]);
                                }
                            }
                        } else {
                            result.push(current);
                        }
                    }
                
                    return result;

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
                if (prop === "__fromPath") {
                    return function(path, create = false) {
                        let node = receiver;
                
                        if (typeof path === "string") {
                            path = path.split('.').filter(p => p !== "primitives");
                        }
                
                        for (let i = 0; i < path.length; i++) {
                            let step = path[i];
                            let nextNode = Array.isArray(node.underlying)
                                ? node.underlying.find(item => item.hasOwnProperty(step))?.[step]
                                : node[step];
                
                            if (nextNode === undefined) {
                                if (create) {
                                    nextNode = Array.isArray(node.underlying) ? {} : (i === path.length - 1 ? [] : {});
                                    if (Array.isArray(node.underlying)) {
                                        node.underlying.push({ [step]: nextNode });
                                    } else {
                                        node[step] = nextNode;
                                    }
                                } else {
                                    return undefined;
                                }
                            }
                
                            node = nextNode;
                        }
                
                        return node;
                    };
                }
                if( prop === "fromPath"){
                    return function(path, create = false){
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
                                    return undefined
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
                    if(prop === "strictDescendants"){
                        const ids = receiver._buildDescendantIds( {}, true, true )
                        return ids.map((d)=>obj.primitive(d)).filter((d)=>d)
                    }
                    if(prop === "directDescendants"){
                        const ids = receiver._buildDescendantIds( {}, true, false, true )
                        return ids.map((d)=>obj.primitive(d)).filter((d)=>d)
                    }
                    if(prop === "descendants"){
                        return receiver.descendantIds.map((d)=>obj.primitive(d)).filter((d)=>d)
                    }
                    if(prop === "descendantIds"){
                        return receiver._buildDescendantIds( {}, true )
                    }
                    if(prop === "_buildDescendantIds"){
                        return function(temp , first = true, origin_only, direct_only){
                            if( first ){
                                temp = new Set()
                            }
                            let childrenIds 
                            if( origin_only ){
                                childrenIds = []
                                if( target.link ){
                                    childrenIds.push( ...Object.values(target.link ) )
                                }
                                if( target.origin ){
                                    childrenIds.push( ...Object.values(target.origin ) )
                                }
                                if( target.auto ){
                                    childrenIds.push( ...Object.values(target.auto ) )
                                }
                                //childrenIds = childrenIds.flat(Infinity)
                            }else if(direct_only){
                                const keys = Object.keys(target).filter(d=>d !== "imports" && d!== "ref")
                                //childrenIds = keys.map(d=>receiver[d].uniqueAllIds).flat().filter((d,i,a)=>a.indexOf(d)===i)
                                childrenIds = [...new Set(keys.map(d => receiver[d].uniqueAllIds).flat())];
                            }else{
                                childrenIds = receiver.uniqueAllIds
                            }
                            for(const id of childrenIds){
                                if( id && !temp.has(id) ){
                                    temp.add(id)
                                    const p = obj.primitive(id)
                                    if (p && Object.keys(p._primitives).length > 0) {
                                        p.primitives._buildDescendantIds(temp, false, origin_only);
                                    }
                                    /*if(p){
                                        let hasProperties = false;
                                        for (let key in p._primitives) {
                                            if (p._primitives.hasOwnProperty(key)) {
                                                hasProperties = true;
                                                break;
                                            }
                                        }
                                        if( hasProperties ){
                                            p.primitives._buildDescendantIds( temp, false, origin_only)
                                        }
                                    }*/
                                }
                            }
                            if( first ){
                                return [...temp]
                            }
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