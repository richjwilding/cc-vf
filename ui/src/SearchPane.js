import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { useMemo, useRef, useState } from "react"
import MainStore from "./MainStore"
import CardGrid from "./CardGrid"
import { Grid } from "react-loader-spinner"
import {useGesture, usePinch} from '@use-gesture/react'

const mainstore = MainStore()

export function SearchPane(props){
    const [searchItems, setSearchItems] = useState([{id: 0, value: "", type: "text", static: true}])
    const [resultList, setResultList] = useState([])
    const [pending, setPending] = useState(false)
    const [hideCurrent, setHideCurrent] = useState(false)
    const targetRef = useRef()
    const gridRef = useRef()
    const myState = useRef({})
    const dropOnGrid = true // !viewConfig?.config?.dropOnPrimitive

    console.log(props.primitive.id)

    const timerTrack = useRef(undefined)

    const updateSearch = async ()=>{
        const term = searchItems[0].value
        setPending(true)
        const results = await MainStore().queryPrimitives(props.primitive, {parent: undefined, types: "evidence", value: term, mode: "fuzzy", limit: 30, threshold: 0.75})
        if( results.success )
        setResultList( results.result.map(d=>mainstore.primitive(d)))
        setPending(false)
    }
    const restoreState = (source)=>{
        const [translateX = 0, translateY = 0] = source.style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
        const [scale = 1] = source.style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
        return [parseFloat(translateX),parseFloat(translateY),parseFloat(scale)]
    }

    function rebuildPrimitivePosition(){
        myState.current.primitivePositions = rebuildPosition('.pcard')
        myState.current.dropsites = rebuildPosition('.dropzone', props.dropParent?.current)
        console.log(myState.current.dropsites,props.dropParent?.current)
    }
    function rebuildPosition(selector, source ){
        source = source ?? gridRef.current
        if( source ){
            var gridRect = source.getBoundingClientRect();
            const [translateX, translateY, scale] = restoreState(source)
            const out = []
            for(const node of source.querySelectorAll(selector)){
                const bb = node.getBoundingClientRect()
                const x1 = (bb.left - gridRect.left) / scale
                const y1 = (bb.top - gridRect.top) / scale
                const x2 = (bb.right - gridRect.left) / scale
                const y2 = (bb.bottom - gridRect.top) / scale
                
                out.push( {x1: x1, y1: y1, x2: x2, y2: y2, id: node.getAttribute('id'), el: node} )
                //out.push( {x1: node.offsetLeft, y1: node.offsetTop, x2:node.offsetLeft + node.offsetWidth, y2: node.offsetTop + node.offsetHeight, id: node.getAttribute('id'), el: node} )
            }
            return out
        }
    }
    function primitivesAt(x,y, xo, yo){
        if( myState.current.primitivePositions ){
            const results = myState.current.primitivePositions.filter((d)=>(x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2))
            return results
        }
    }

    function dropsAt(x,y){
        if( myState.current.dropsites ){
            const results = myState.current.dropsites.filter((d)=>(x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2))
            return results
        }
    }

    const setQuery = (id, val)=>{
        const newSet = [...searchItems]
        newSet[id].value = val
        setSearchItems(newSet)
        if( timerTrack.current ){
            clearTimeout(timerTrack.current)
        }
        timerTrack.current = setTimeout(updateSearch, 500)
    }
    useGesture({
        onDrag:(state)=>{
            state.event.preventDefault()
            let memo = state.memo
            if( state.first ){
                rebuildPrimitivePosition()
            }
                
            if( state.first || myState.current?.needRecalc){
                const target = props.dropParent.current            
                const parent = targetRef.current            
                const grid = gridRef.current

                var targetRect = target.getBoundingClientRect();
                var parentRect = parent.getBoundingClientRect();
                var gridRect = grid.getBoundingClientRect();

                memo = {px:parentRect.x, py:parentRect.y, dx:gridRect.x - parentRect.x, dy:gridRect.y - parentRect.y, ox: targetRect.x - parentRect.x, oy: targetRect.y - parentRect.y}
                myState.current.needRecalc = false
            }
            const [mouseX, mouseY] = state.xy
          
            const adjustedX = mouseX - memo.px
            const adjustedY = mouseY - memo.py
            const inGridX= (adjustedX - memo.dx) 
            const inGridY = (adjustedY - memo.dy) 
          
            if( state.first ){
                const hits = primitivesAt(inGridX, inGridY )
                if( hits && hits.length > 0){

                    const start = dropsAt(inGridX, inGridY )
                    myState.current.dragging = {...hits[0]}
                    
                    const clone = myState.current.dragging.el.cloneNode(true);
                    clone.style.position = "absolute"
                    clone.style.maxWidth = `${myState.current.dragging.el.offsetWidth}px`
                    clone.style.minWidth = `${myState.current.dragging.el.offsetWidth}px`
                    clone.style.left = `${myState.current.dragging.x1}px`
                    clone.style.top = `${myState.current.dragging.y1}px`
                    clone.style.zIndex = `100`
                    clone.classList.add('shadow-2xl')
                    clone.classList.add('ring')
                    
                    myState.current.dragging.helper = clone
                    myState.current.dragging.el.style.opacity = 0.5

                    myState.current.dragOffset = {
                        x: inGridX - myState.current.dragging.x1,
                        y: inGridY - myState.current.dragging.y1
                    }

                    gridRef.current.appendChild(clone);

                }else{
                    myState.current.dragging = undefined
                }
            }
            if( myState.current?.dragging){
                if( myState.current.dragging.helper){
                    myState.current.dragging.helper.style.left = `${inGridX - myState.current.dragOffset.x}px`
                    myState.current.dragging.helper.style.top = `${inGridY - myState.current.dragOffset.y}px`
                }
                
                const hits = inGridX > 0 ? undefined : dropsAt(inGridX - memo.ox, inGridY - memo.oy )
                if( hits && hits.length > 0){
                    const target = hits[0]
                    if( !myState.current.dragging.startZone || target.id !==  myState.current.dragging.startZone.id){
                        const id = target.id
                        if(id){
                            let cancelForConstraints = false
                            
                            if( dropOnGrid){
                                const [c,r] = id.split('-')
                                cancelForConstraints = true
                                if( !myState.current.dragging.constrain ||
                                    ((myState.current.dragging.constrain.col !== undefined && myState.current.dragging.constrain.col === c) ||
                                    (myState.current.dragging.constrain.row !== undefined && myState.current.dragging.constrain.row === r))){
                                        cancelForConstraints = false
                                    }
                            }
                            if( !cancelForConstraints ){
                                if( myState.current.dragging.dropzone && myState.current.dragging.dropzone !== target){
                                    myState.current.dragging.dropzone.el.style.background = null
                                }
                                target.el.style.background = "#6ee7b7"
                                myState.current.dragging.dropzone = target
                            }
                        }
                    }
                }else{
                    if( myState.current.dragging.dropzone ){
                        myState.current.dragging.dropzone.el.style.background = null
                    }
                    myState.current.dragging.dropzone = undefined
                }

                
            }
            if( state.last ){
                if( myState.current.dragging ){
                        const hits = inGridX > 0 ? undefined : dropsAt(inGridX - memo.ox, inGridY - memo.oy )

                        if( hits && hits.length > 0){
                            const target = hits[0]
                            if( props.dropCallback ){

                                new Promise(async (resolve)=>{
                                    const id = myState.current.dragging.id
                                    const dropped = await props.dropCallback( id, target.id)
                                    console.log`GOT BACK`
                                    if( dropped ){
                                        setResultList( resultList.filter(d=>d.id !== id )) 
                                        console.log("filer")
                                    }
                                })
                            }
                        }
                    if( myState.current.dragging.helper){
                        gridRef.current.removeChild(myState.current.dragging.helper);
                    }
                    if( myState.current.dragging.dropzone ){
                        myState.current.dragging.dropzone.el.style.background = null
                    }
                    myState.current.dragging.dropzone = undefined
                    myState.current.dragging.el.style.opacity = null
                    myState.current.dragging = undefined
                    myState.current.cancelClick = true
                }
            }

            return memo
        },
    }, {
            target: targetRef,
            eventOptions: { 
                passive: false,
            },
            drag:{
                delay: 150,
                threshold: 10,
                eventOptions: { 
                    passive: false,
//                    
                }

            },
        }
    )




    return <div className="flex flex-col w-1/2 h-full justify-stretch space-y-1 grow border-l p-3">
        {
            searchItems.map((d,idx)=>(
                    <div className="relative">
                      <MagnifyingGlassIcon
                        className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400"
                        aria-hidden="true"
                        />
                      <input
                        value={d.value}
                        className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
                        placeholder="Search..."
                        onChange={(event) => setQuery(idx, event.target.value)}
                        />
                    </div>
            ))
        }
        {pending && <div className="flex h-full justify-center place-items-center w-full">
            <Grid
              height="40%"
              color="#4fa94d"
              ariaLabel="grid-loading"
              radius="12.5"
              wrapperStyle={{}}
              wrapperClass="mx-auto"
              visible={true}
              />
            </div>}
        {!pending && 
            <div className="w-full h-0 grow self-stretch p-1 relative touch-none" ref={targetRef}>
                <div className="w-full h-full flex overflow-y-scroll select-none" ref={gridRef}>
                    <CardGrid 
                        list={resultList} 
                        fullId
                        onCardClick={ (e, p)=>{
                                    if( myState.current?.cancelClick ){
                                        myState.current.cancelClick = false
                                        return
                                    }
                                    MainStore().sidebarSelect( p )
                                } }
                        />
                </div>
            </div>}
    </div>

}