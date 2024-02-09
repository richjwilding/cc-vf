import { Stage, Layer, Text, Rect, Group, FastLayer} from 'react-konva';
import Konva from 'konva';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';

Konva.autoDrawEnabled = false

export default function InfiniteCanvas(props){
    const enablePages =  true
    const enableFlipping = true
    const enableNodePruning = true

    const scaleTriggers = {min: 0.1, max: 3}
    
    const stageRef = useRef()
    const frameRef = useRef()
    const myState = useRef()

    const width = 800
    const height = 800
    const chunkWidth = 400
    const chunkHeight = 400


    const test_items = useMemo(()=>{
        const out = []
        let cols = 120, rows = 120
        
        for(let i = 0; i < (cols * rows); i++){
            out.push({x: (i % cols), y: Math.floor(i / cols)})
        }
        myState.current ||= {}
        return out
    }, [])

    function buildPositionCache(){
        if(!stageRef.current){
            return
        }        
        myState.current ||= {}
        if( enablePages ){
            myState.current.pages = []
        }
        const w = width / 2
        const h = height / 2

        let nodes =  stageRef.current.children[0].children
        for(const d of nodes){
            let l = d.x()
            let t = d.y()
            let r = l + d.width()
            let b = t + d.height()
            let page

            if( enablePages){
                let [px,py] = calcPage( l, t)
                let [mx,my] = calcPage( r, b)

                for(let j = py; j <= my; j++){
                    for(let i = px; i <= mx; i++){
                        myState.current.pages[i] ||= []
                        myState.current.pages[i][j] ||= []

                        myState.current.pages[i][j].push(d)
                    }
                }
                d.attrs['page'] = page
            }
        }
    }

    useEffect(()=>{
    }, [])


    useLayoutEffect(()=>{
        console.log(stageRef.current)
        updateVisibility(0,0)
        return ()=>{
            if( myState.current.allNodes ){
                console.log(`Restoring all nodes`)
                stageRef.current.children[0].children = myState.current.allNodes
            }
        }
    },[])

    function calcPage(x,y){
        return [Math.floor(x / chunkWidth),  Math.floor(y / chunkHeight)]
    }

    function updateVisibility(x,y, zooming){
        if(!stageRef.current){
            return
        }        
        if( !myState.current.allNodes ){
            myState.current.allNodes = stageRef.current.children[0].children
        }
        let nodes =  stageRef.current.children[0].children
        let scale = stageRef.current.scale().x
        if( !myState.current?.pages){
            buildPositionCache()
        }
        x = x 
        y = y 
        let w = width / scale
        let h = height / scale
        let idx = 0
        let vis = 0

        if( enablePages ){
            if( enableFlipping ){
                w *= 2
                h *= 2
            }
            const lastPages = myState.current.pages.lastRendered ?? []

            const cols = Math.ceil(w / chunkWidth) + 1
            const rows = Math.ceil(h / chunkHeight) + 1
            
            const [px, py] = calcPage(x,y)
          //  console.log(`Will render ${cols} x ${rows} pages from ${px}, ${py}`)
            const pages = []
            const outer = []
            for(let j = 0; j < rows; j++){
                for(let i = 0; i < cols; i++){
                    const page = `${px+i}-${py+j}`
                    if( zooming && ((i === 0) || (j === 0) || (i === (cols - 1)) || (j === (rows - 1)))){
                        outer.push( page )
                    }else{
                        pages.push( page )
                    }
                }
            }

            let pagesToProcess
            if( enableFlipping ){
                if( enableNodePruning ){
                    pagesToProcess = [pages, outer].flat().filter((d,i,a)=>a.indexOf(d)===i)
                }else{
                    pagesToProcess = [lastPages.filter(d=>!pages.includes(d)), pages.filter(d=>!lastPages.includes(d))].flat()
                    pagesToProcess = pagesToProcess.concat( outer ).filter((d,i,a)=>a.indexOf(d)===i)
                }
            }else{
                pagesToProcess = [lastPages, pages, outer].flat().filter((d,i,a)=>a.indexOf(d)===i)
            }

            const seen = new Set();
            nodes = [];
            pagesToProcess.forEach(d => {
              const [x, y] = d.split("-");
              const n = myState.current.pages[x]?.[y];
              if( n){
                  n.forEach(item => {
                      const uniqueKey = item._id; // Assuming 'item' has a unique 'id'
                      if (!seen.has(uniqueKey)) {
                          seen.add(uniqueKey);
                          nodes.push(item);
                        }
                    });
                }
            });


            myState.current.pages.lastRendered = pages

            w = cols * chunkWidth
            h = rows * chunkHeight
        }
        let x2 = x + w
        let y2 = y + h

        const activeNodes = []

                    

        for( const d  of nodes){
            let c = d.attrs
            let visible = (c.width * scale) > 10 && ((c.x + c.width) > x &&  c.x < x2 && (c.y + c.height) > y && c.y < y2)
            if(visible){
                vis++
                if( enableNodePruning ){
                    if( d.attrs["_txc"] !== myState.current.transformCount){
                        d._clearSelfAndDescendantCache('absoluteTransform')
                        d.attrs["_txc"] = myState.current.transformCount
                    }
                    activeNodes.push(d)
                }else{
                    d.visible(visible)
                }
            }
        }
        if( enableNodePruning ){
            stageRef.current.children[0].children = activeNodes
        }
        //console.log(`RENDERED ${vis} of ${nodes.length} candidates / ${stageRef.current.children[0].children.length}`)
    }

    function alignViewport(tx,ty, scale, forceRescale = false){
        if( stageRef.current.doneReset == 3 ){
            //return [tx,ty,scale]
        }

        let x = tx, y = ty

        function quantizeFrame(x,y){            
            return [
                Math.floor(x / (width / 2)) * (width / 2),
                Math.floor(y / (height / 2)) * (height / 2)
            ]
        }

        if( enableFlipping){
            let doUpdate = false, updateStagePosition = false
            myState.current.flipping ||= {last: {scale: scale, fhx: 0, fhy: 0, fsx:0, fsy: 0, skx: 0, sky: 0}}
            if( tx > width * 0.8){
                tx = width * 0.8
            }
            if( ty > height * 0.8 ){
                ty = height * 0.8
            }

            const tw = width //* scale
            const th = height //* scale


            let fx = -tx / myState.current.flipping.last.scale * scale 
            let fy = -ty / myState.current.flipping.last.scale * scale

            let fhx = Math.floor(((fx ) - (myState.current.flipping.last.fsx / myState.current.flipping.last.scale * scale) ) / tw) 
            let fhy = Math.floor(((fy ) - (myState.current.flipping.last.fsy / myState.current.flipping.last.scale * scale) ) / th) 

            let cx = Math.max(0,Math.floor(-tx / scale / chunkWidth)) * chunkWidth
            let cy = Math.max(0,Math.floor(-ty / scale / chunkHeight)) * chunkHeight



            const isZooming = myState.current.flipping.last.callScale !== scale


            const refScale = scale / (myState.current.flipping.last.scale ?? 1)
            
            if( isZooming || forceRescale){
                if( refScale > scaleTriggers.max || refScale < scaleTriggers.min || forceRescale || myState.current.flipping.last.fhx !== fhx || myState.current.flipping.last.fhy !== fhy){
                    //console.log(`RESET ZOOM`, cx, stageRef.current.x(), scale)
                    stageRef.current.doneReset = (stageRef.current.doneReset ?? 0) + 1
                    myState.current.flipping.last.scale = scale
                    
                    let q = quantizeFrame( -tx, -ty)
                    fx = q[0]
                    fy = q[1]
        
                    myState.current.flipping.last.fsx = fx
                    myState.current.flipping.last.fsy = fy

                    fhx = Math.floor(((fx ) - (myState.current.flipping.last.fsx / myState.current.flipping.last.scale * scale) ) / tw) 
                    fhy = Math.floor(((fy ) - (myState.current.flipping.last.fsy / myState.current.flipping.last.scale * scale) ) / th) 

                    myState.current.flipping.last.fhx = fhx
                    myState.current.flipping.last.fhy = fhy
                                    
                    stageRef.current.scale({x:scale, y:scale})
                    doUpdate = true
                    updateStagePosition = true
                    
                }
            }
           if( !isZooming ){
                if(myState.current.flipping.last.fhx !== fhx || myState.current.flipping.last.fhy !== fhy){
                    //console.log("FLIP", fx - myState.current.flipping.last.fsx, fhx - myState.current.flipping.last.fhx)
                    
                    let q = quantizeFrame( fx, fy)
                    
                    myState.current.flipping.last.fsx = q[0]
                    myState.current.flipping.last.fsy = q[1]


                    fhx = Math.floor(((fx ) - (myState.current.flipping.last.fsx / myState.current.flipping.last.scale * scale) ) / tw) 
                    fhy = Math.floor(((fy ) - (myState.current.flipping.last.fsy / myState.current.flipping.last.scale * scale) ) / th) 

                    myState.current.flipping.last.fhx = fhx
                    myState.current.flipping.last.fhy = fhy

                    doUpdate = true
                    updateStagePosition = true
                }
            }

            myState.current.flipping.skx = ((myState.current.flipping.last.fsx / myState.current.flipping.last.scale) ) - cx 
            myState.current.flipping.sky = ((myState.current.flipping.last.fsy / myState.current.flipping.last.scale) ) - cy 

            const vx = (cx  + myState.current.flipping.skx) * scale
            const vy = (cy  + myState.current.flipping.sky) * scale
           
            if( !isZooming ){
                if(myState.current.flipping.last.cx !== cx || myState.current.flipping.last.cy !== cy){
                    doUpdate = true
                    myState.current.flipping.last.cx = cx
                    myState.current.flipping.last.cy = cy
                    //console.log(`UPDATE CHUNK`)
                }
            }

            if( doUpdate ){
                //console.time("updateVis")
                updateVisibility(cx, cy)
                //console.timeEnd("updateVis")
                if( updateStagePosition ){
                    //console.log(`Update stage to ${-vx}, ${-vy} @ ${scale} ${stageRef.current.scale()?.x}`)
                    //console.time("updatePos")
                    myState.current.transformCount = (myState.current.transformCount || 0) + 1
                    stageRef.current.position({x:-vx, y: -vy})
                    //console.timeEnd("updatePos")
                }
                //console.time("draw")
                stageRef.current.batchDraw()
                //console.timeEnd("draw")
                //console.log(`DOING REDRAW`)
            }


            let ox = (-tx - (myState.current.flipping.last.fsx / myState.current.flipping.last.scale * scale )) // (scale / myState.current.flipping.last.scale )
            let oy = (-ty - (myState.current.flipping.last.fsy / myState.current.flipping.last.scale * scale)) // (scale / myState.current.flipping.last.scale)
            

            stageRef.current.container().style.transform = `translate(${-ox}px, ${-oy}px) scale(${scale / myState.current.flipping.last.scale}) `
            myState.current.flipping.last.callScale = scale
            return [tx,ty, scale]
        }else{
            stageRef.current.scale({x: scale, y: scale} )
            stageRef.current.x(x)
            stageRef.current.y(y)
            updateVisibility(-x, -y)
            stageRef.current.batchDraw()
            return [tx,ty, scale]
        }

    }

    useGesture({
        onPinch: (state)=>{
                        state.event.preventDefault()
                        let memo = state.memo
                        const ox = state.origin[0]
                        const oy = state.origin[1]
                        //return

                        let translateX, translateY
                        if (state.first) {
                            let initialScale = stageRef.current.scale().x
                            translateX = stageRef.current.x()
                            translateY = stageRef.current.y()

                            if( enableFlipping ){
                                const [sx = 0, sy = 0] = stageRef.current.container().style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
                                const [scale = 1] = stageRef.current.container().style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
                                translateX += parseInt(sx)
                                translateY += parseInt(sy)
                                initialScale *= scale
                            }

                            const { width, height, x, y } = frameRef.current.getBoundingClientRect()

                            const tx = ox - x
                            const ty = oy - y
                            memo = [translateX, translateY, tx, ty, initialScale]
                        }
                        const oldScale = memo[4]
                        const thisScale = state.offset[0]
                        

                        const tx = (memo[2] - memo[0]) / oldScale
                        const ty = (memo[3] - memo[1]) / oldScale

                        const x = memo[2] - (tx * thisScale)
                        const y = memo[3] - (ty * thisScale)

                        let [updatedX, updatedY, updateScale] = alignViewport(x,y, thisScale, state.last)

                        return [ updatedX, updatedY, memo[2], memo[3],updateScale] 
                    },
        onWheel: (state) => {
                    if( !state.ctrlKey ){
                        state.event.preventDefault()
                        let translateX, translateY, scale
                        if( state.first) {
                            scale = stageRef.current.scale().x
                            translateX = stageRef.current.x()
                            translateY = stageRef.current.y()
                            if( enableFlipping ){
                                const [sx = 0, sy = 0] = stageRef.current.container().style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
                                const [ss = 1] = stageRef.current.container().style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
                                translateX += parseInt(sx)
                                translateY += parseInt(sy)


                               // translateX -= myState.current.flipping.skx ?? 0
                                //translateY -= myState.current.flipping.sky ?? 0

                                scale *= ss
                            }
                            console.log("reading")
                        }else{
                            translateX = state.memo?.[0] ?? 0
                            translateY = state.memo?.[1] ?? 0
                            scale = state.memo?.[2] ?? 1

                        }
        
                        const x = translateX - ((state.delta[0] ) * 3)
                        const y = translateY - ((state.delta[1] )  * 3)
                        let [updatedX, updatedY, updateScale] = alignViewport(x,y, scale)
                        return [updatedX, updatedY, updateScale]
                    }
                }
            },{
                target: frameRef,
                eventOptions: { 
                    passive: false,
      //              preventDefault: true,
                },
                drag:{
                    delay: 150,
                    threshold: 10,
                    eventOptions: { 
                        passive: false,
    //                    
                    }
    
                },
                pinch: {
                from: ()=>{
                //    const [translateX, translateY, initialScale] = restoreState()
                let initialScale = stageRef.current.scale().x
                if( enableFlipping ){
                    const [scale = 1] = stageRef.current.container().style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
                    initialScale *= scale
                }
                return [initialScale,initialScale]
                },
                    scaleBounds: { min: 0.03, max: 8 },
                },
            }
        )
    
    const stage = <Stage
                ref={stageRef}
                style={{
                    transformOrigin: "0 0"
                }}
                
                width={width * (enableFlipping ? 2 : 1)} height={height * (enableFlipping ? 2 : 1)}>
                    <Layer
                        perfectDrawEnabled={false}
                        listening={false}
                    >
                    <Rect  id='frame' x={10} y={10} width={760} height={760} stroke="#ff0000" fill='#00ff00'/>
                    {test_items.map((d,idx)=>{
                        const id = `g_${idx}`
                        return <Group key={id} id={id} x={d.x * 80} y={d.y * 80} width={80} height={80} visible={enableNodePruning}>
                            <Rect  width={76} height={76} stroke="#888"/>
                            <Text  x={5} y={2} width={51} height={51} text={`${d.x} / ${d.y}`} fontSize={12}/>
                        </Group>
                    })}
                    </Layer>
                </Stage>

        return <div 
            ref={frameRef}
            className='border border-red overflow-hidden' 
            style={{
                width: width,
                height: height
            }}>
               {stage} 
            </div>

}