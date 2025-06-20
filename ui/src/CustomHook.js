import React, { useEffect } from 'react';
import MainStore from './MainStore';

export default function useDataEvent(fields, ids, callback){
    const callbackId = React.useRef(null)
    const [count, forceUpdate] = React.useReducer( (x)=>x+1, 0)

    const wrap = (...args)=>{
        let doUpdate = true
        if( callback ){
            const r = callback(...args)
            if( r === false){
                doUpdate = false
            }
        }
        if( doUpdate ){
            forceUpdate()
        }
    }

    React.useEffect(()=>{
        if( fields ){
            callbackId.current = MainStore().registerCallback(callbackId.current, fields, wrap, ids )
            return ()=>{
                MainStore().deregisterCallback(callbackId.current )
            }
        }
    }, [ids])

    return callbackId
}