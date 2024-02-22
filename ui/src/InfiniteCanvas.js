import { Stage, Layer, Text, Rect, Group, FastLayer} from 'react-konva';
import Konva from 'konva';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import { RenderPrimitiveAsKonva } from './RenderHelpers';

Konva.autoDrawEnabled = false

export default function InfiniteCanvas(props){
    const enablePages =  true
    const enableFlipping = true
    const enableNodePruning = true

    const scaleTriggers = {min: 0.1, max: 3}

    const colors = {
        hover:{
            background:{
                fill:'#a3f0c611'
            },
            border:{
                stroke: "#a3f0c6",
                fill : '#a3f0c633'
            }
        },
        select:{
            background:{
                fill : '#9abef822'
            },
            border:{
                stroke: "#9abef8",
                fill : '#9abef833'
            }
        }
    }
    
    const stageRef = useRef()
    const frameRef = useRef()
    const layerRef = useRef()
    const myState = useRef()

    const chunkWidth = 400//800
    const chunkHeight = 400//800


    const test_items = useMemo(()=>{
        myState.current ||= {}
        const out = []
        
        let cols = 200, rows = 50
        
        for(let i = 0; i < (cols * rows); i++){
            out.push({x: (i % cols), y: Math.floor(i / cols)})
        }
        return out
    }, [])

    function processImageCallback(image, parent){
        parent._clearSelfAndDescendantCache('absoluteTransform')
        image.cache({
            pixelRatio: 2
        })
        
        stageRef.current.batchDraw()
        myState.current.imageCache ||= {}
        myState.current.imageCache[image._id] = {
            scale: restoreScale(),
            parent: parent,
            node: image
        }

    }
    function rescaleImages(scale){
        let updated = []
        if(!myState.current.imageCache){return}
        console.log(scale)
        for(const d of Object.values( myState.current.imageCache )){
            if( d.parent.attrs._vis !== myState.current.refreshCount){
                continue
            }
            const ratio = scale / d.scale 
            if( ratio < 0.2 || ratio > 1.5){
                d.newScale = scale
                updated.push(d)
            }
        }

        let len = updated.length
        let idx = 0, step = 20
        for(let bi = 0; bi < len; bi += step){
            setTimeout(() => {
                let doDraw = false
                for(let i = 0; i < step; i++) {
                    const fi = bi +i
                    if( fi < len){
                        const d = updated[ fi]
                        if( d._scale !== d.newScale){
                            if((d.node.attrs.width * d.newScale) > 5 && (d.node.attrs.height * d.newScale) > 5 ){
                                d._scale = d.newScale
                                d.node.clearCache()
                                d.node.cache({pixelRatio: d.newScale * 2})
                                doDraw = true
                            }
                        }
                    }
                }
                if(doDraw){
                    stageRef.current.batchDraw()
                }
                
            }, idx * 5);
            idx++
        }
    }

    function buildPositionCache(frame){
        if(!stageRef.current){
            return
        }        
        if( !enablePages ){
            return
        }
        myState.current ||= {}
        
        if(frame.pages){
            //throw `Pages already present for frame ${frame.id}`
            frame.pages = []
        }else{
            frame.pages = []
        }


        let nodes =  frame.node.children
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
                        frame.pages[i] ||= []
                        frame.pages[i][j] ||= []

                        frame.pages[i][j].push(d)
                    }
                }
                d.attrs['page'] = page
            }
        }
    }

    useEffect(()=>{
    }, [])

    function convertItems(props, options = {}){
        options = {x:0, y:0, ...options}
        const target = stageRef.current?.children[0]
        if( target ){
            let frameId = myState.current?.frames?.length ?? 0
            const frame = new Konva.Group({
                x: options.x,
                y: options.y,
                id: `f${frameId}`
            }) 
            target.add(frame)
            const frameBorder = new Konva.Rect({
                x: 0,
                y:0,
                width: 1000,
                height: 10,
                fill: undefined,//"#d2d2f2",
                stroke:"red",
                strokeWidth:1,
                strokeScaleEnabled: false,
                visible: false,
                id: `frame`
            }) 
            frame.add(frameBorder)
            let maxX = 0, maxY = 0

            if( props.render){
                const g = props.render({imageCallback: processImageCallback})

                const moveList = []
                g.find('.inf_track').forEach(d=>{
                    let x = d.x(), y = d.y()
                    for(const p of d.findAncestors('Group')){
                        x += p.x()
                        y += p.y()
                    }
                    console.log(`Moving item`)
                    d.remove()
                    d.x(x)
                    d.y(y)
                    d.attrs['fid'] = frameId
                    moveList.push(d)

                })                    
                frame.add(g)
                moveList.forEach(d=>frame.add(d))

                maxX = g.width()
                maxY = g.height()


                
            }else if( props.list){
                let i = 0
                const cols = Math.floor(Math.sqrt( props.list.length))
                for( const d of props.list){
                    const col = (i % cols)
                    const row = Math.floor(i / cols)

                    const g = RenderPrimitiveAsKonva( d,  )
                    g.setAttrs({
                        x: col * 80,
                        y:row * 80,
                        visible: enableNodePruning
                    })

                    frame.add(g)
                    
                    let r = g.x() + g.width()
                    let b = g.y() + g.height()
                    if( r > maxX){ maxX = r }
                    if( b > maxY){ maxY = b }



                    i++
                }
            }else{
                test_items.forEach((d,i)=>{
                    const g = new Konva.Group({
                        id: `g_${i}`,
                        x: d.x * 80,
                        y: d.y * 80,
                        width: 80,
                        height: 80,
                        name:"primitive",
                        visible: enableNodePruning
                    })
                    
                    let r = g.x() + g.width()
                    let b = g.y() + g.height()
                    if( r > maxX){ maxX = r }
                    if( b > maxY){ maxY = b }

                    if( g ){
                        frame.add(g)
                        const r = new Konva.Rect({
                            width: 72,
                            height: 72,
                            fill: '#fafafa',
                            stroke: '#888'
                        })
                        g.add(r)
                        const t = new Konva.Text({
                            x: 5,
                            y: 5, 
                            width: 50,
                            height: 50,
                            text: `${d.x} / ${d.y}`,
                            fontSize: 12,
                            fill: '#000'
                        })
                        g.add(t)
                    }
                })            
            }
           // frame.width(maxX)
           // frame.height(maxY)
            frameBorder.width(maxX)
            frameBorder.height(maxY)
            myState.current.frames ||= []

            const [maxCol,maxRow] = calcPage( maxX, maxY)

            myState.current.frames[frameId] = {
                id: frameId,
                node: frame,
                allNodes: frame.children,
                x: options.x ?? 0,
                y: options.y ?? 0,
                maxCol,
                maxRow
            }
        }

    }

    function resizeFrame(w, h){
        if( frameRef.current && stageRef.current){
            myState.current.width = w ?? frameRef.current.offsetWidth
            myState.current.height = h ?? frameRef.current.offsetHeight
            stageRef.current.width( (enableFlipping ? 2 : 1) * myState.current.width)
            stageRef.current.height( (enableFlipping ? 2 : 1) * myState.current.height)
            if( enableFlipping ){
                let [x,y,scale] = restoreTransform()
                alignViewport(x,y,scale)
                updateVisibility(myState.current.flipping?.last.cx ?? 0, myState.current.flipping?.last.cy ?? 0)
            }
            
        }
    }

    useLayoutEffect(()=>{
        console.log(stageRef.current)
        convertItems(props)
        convertItems(props, {x: 1720, y: 720})
        for( const frame of myState.current.frames ?? []){
            console.log(`Building for ${frame.id}`)
            buildPositionCache(frame)
        }
        resizeFrame()
        updateVisibility(0,0)


        const observer = new ResizeObserver((rect)=>{
            resizeFrame(rect[0].contentRect.width, rect[0].contentRect.height)
        });
        observer.observe(frameRef.current);

        return ()=>{
            observer.unobserve(frameRef.current);
            for(const frame of myState.current.frames ?? []){
                if( frame.allNodes ){
                    console.log(`Restoring all nodes on ${frame.id}`)
                    frame.node.children = frame.allNodes
                }
            }
        }
    },[])

    function calcPage(x,y){
        return [Math.floor(x / chunkWidth),  Math.floor(y / chunkHeight)]
    }

    function updateVisibility(x,y){
        if(!stageRef.current){
            return
        }        
        let nodes =  layerRef.current.children
        let scale = stageRef.current.scale().x
        x = x 
        y = y 
        let w = myState.current.width / scale
        let h = myState.current.height / scale
        let idx = 0
        let vis = 0
        let x2 = x + w
        let y2 = y + h

        myState.current.refreshCount = (myState.current.refreshCount ?? 0) + 1

        if( enablePages ){
            let lastPages = enableNodePruning ? undefined : myState.current.lastRendered ?? []
            if( enableFlipping ){
                w *= 2
                h *= 2
            }
                

            const cols = Math.ceil(w / chunkWidth) + 1
            const rows = Math.ceil(h / chunkHeight) + 1

            w = cols * chunkWidth
            h = rows * chunkHeight

            x2 = x + w
            y2 = y + h
            
            //  console.log(`Will render ${cols} x ${rows} pages from ${px}, ${py}`)
            for(const frame of myState.current.frames){
                const [px, py] = calcPage(x - frame.node.attrs.x, y - frame.node.attrs.y)
                
                const seenPages = new Set();
                const pages = []


                let spx = Math.max(0, px)
                let spy = Math.max(0, py)
                let epx = Math.min(frame.maxCol + 1, px + cols)
                let epy = Math.min(frame.maxRow + 1, py + rows)



                //console.log(`Frame ${frame.id} offset by ${px}, ${py} pages - : ${spx}, ${spy} - doing ${epx-spx} x ${epy-spy} pages`)

                for(let j = spy; j < epy; j++){
                    for(let i = spx; i < epx; i++){
                        const page = `${i}-${j}`
                        if (!seenPages.has(page)) {
                            seenPages.add(page);
                            pages.push( page )
                        }
                    }
                }
                
                let pagesToProcess
                if( enableFlipping ){
                    if( enableNodePruning ){
                        pagesToProcess = pages//.filter((d,i,a)=>a.indexOf(d)===i)
                    }else{
                        pagesToProcess = [lastPages.filter(d=>!pages.includes(d)), pages.filter(d=>!lastPages.includes(d))].flat()//.filter((d,i,a)=>a.indexOf(d)===i)
                    }
                }else{
                    pagesToProcess = [lastPages, pages].flat().filter((d,i,a)=>a.indexOf(d)===i)
                }
                
                let hidden = 0
                const seen = new Set();
                nodes = [];
                pagesToProcess.forEach(d => {
                    const [x, y] = d.split("-");
                    const n = frame.pages[x]?.[y];
                    if( n){
                        n.forEach(item => {
                            const uniqueKey = item._id; // Assuming 'item' has a unique 'id'
                            if (!seen.has(uniqueKey)) {
                                seen.add(uniqueKey);
                                if( (item.attrs.width * scale) > 10){
                                    nodes.push(item);
                                }else{
                                    hidden++
                                }
                            }
                        });
                    }
                });
                
                
                if( !enableNodePruning ){
                    myState.current.lastRendered = pages
                }
                
                
                const activeNodes = []
                
                vis = 0
                let ax = x - frame.node.attrs.x
                let ax2 = x2 - frame.node.attrs.x
                let ay = y - frame.node.attrs.y
                let ay2 = y2 - frame.node.attrs.y
                for( const d  of nodes){
                    let c = d.attrs
                    //let visible = (c.width * scale) > 10 && ((c.x + c.width) > x &&  c.x < x2 && (c.y + c.height) > y && c.y < y2)
                    let visible = ((c.x + c.width) > ax &&  c.x < ax2 && (c.y + c.height) > ay && c.y < ay2)
                    if(visible){
                        vis++
                        if( enableNodePruning ){
                            d.attrs._vis = myState.current.refreshCount
                            
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
                frame.lastNodes = activeNodes
                let showFrame = hidden > 0
                
                frame.node.find('#frame')?.[0]?.visible(showFrame)
                
                if( enableNodePruning ){
                    frame.node.children = activeNodes
                }
                //console.log(`${frame.id} RENDERED ${vis} of ${nodes.length} candidates / ${myState.current.frames.map(d=>d.allNodes.length).reduce((a,c)=>a+c,0)}`)
            }
        }else{
            for( const d  of nodes){
                let c = d.attrs
                let visible = ((c.x + c.width) > x &&  c.x < x2 && (c.y + c.height) > y && c.y < y2)
                if(visible){
                    vis++
                    d.visible(visible)
                }
            }
            console.log(`RENDERED ${vis} of ${nodes.length} candidates / ${myState.current.frames.map(d=>d.allNodes.length).reduce((a,c)=>a+c,0)}`)
        }

        
    }

    function alignViewport(tx,ty, scale, forceRescale = false){
        if( stageRef.current.doneReset == 3 ){
            //return [tx,ty,scale]
        }

        let x = tx, y = ty

        function quantizeFrame(x,y){            
            return [
                Math.floor(x / (myState.current.width / 2)) * (myState.current.width / 2),
                Math.floor(y / (myState.current.height / 2)) * (myState.current.height / 2)
            ]
        }

        if( enableFlipping){
            let doUpdate = false, updateStagePosition = false
            myState.current.flipping ||= {last: {scale: scale, fhx: 0, fhy: 0, fsx:0, fsy: 0, skx: 0, sky: 0}}
            if( tx > myState.current.width * 0.8){
                tx = myState.current.width * 0.8
            }
            if( ty > myState.current.height * 0.8 ){
                ty = myState.current.height * 0.8
            }

            const tw = myState.current.width
            const th = myState.current.height


            let fx = -tx / myState.current.flipping.last.scale * scale 
            let fy = -ty / myState.current.flipping.last.scale * scale

            let fhx = Math.floor(((fx ) - (myState.current.flipping.last.fsx / myState.current.flipping.last.scale * scale) ) / tw) 
            let fhy = Math.floor(((fy ) - (myState.current.flipping.last.fsy / myState.current.flipping.last.scale * scale) ) / th) 

            let cx = Math.max(0,Math.floor(-tx / scale / chunkWidth)) * chunkWidth
            let cy = Math.max(0,Math.floor(-ty / scale / chunkHeight)) * chunkHeight



            const isZooming = myState.current.flipping.last.callScale !== scale


            const refScale = scale / (myState.current.flipping.last.scale ?? 1)
            let doImageRescale = false
            
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
                    doImageRescale = forceRescale

                   /* if( myState.current.hover ){
                        for( const d of Object.keys(myState.current.hover)){
                            const node = myState.current.hover[d]
                            if( node ){
                                leftNode(node, d )
                                enteredNode(node, d, scale )
                            }
                        }
                    }*/
                    
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
                if( doImageRescale ){
                    rescaleImages(scale)
                }
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

    function restoreScale(){
        let initialScale = stageRef.current.scale().x

        if( enableFlipping ){
            const [scale = 1] = stageRef.current.container().style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
            initialScale *= scale
        }
        return initialScale

    }
    function restoreTransform(){
        let initialScale = stageRef.current.scale().x
        let translateX = stageRef.current.x()
        let translateY = stageRef.current.y()

        if( enableFlipping ){
            const [sx = 0, sy = 0] = stageRef.current.container().style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
            const [scale = 1] = stageRef.current.container().style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
            translateX += parseInt(sx)
            translateY += parseInt(sy)
            initialScale *= scale
        }
        return [translateX, translateY, initialScale]

    }

    useGesture({
        onPinch: (state)=>{
                        state.event.preventDefault()
                        let memo = state.memo
                        const ox = state.origin[0]
                        const oy = state.origin[1]
                        //return

                        let translateX, translateY, initialScale
                        if (state.first) {
                            [translateX, translateY, initialScale] = restoreTransform()


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
                            clearHightlights()
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
                        }else{
                            translateX = state.memo?.[0] ?? 0
                            translateY = state.memo?.[1] ?? 0
                            scale = state.memo?.[2] ?? 1

                        }
        
                        const x = translateX - ((state.delta[0] ) * 3)
                        const y = translateY - ((state.delta[1] )  * 3)
                        let [updatedX, updatedY, updateScale] = alignViewport(x,y, scale)


                        if( state.last ){
                            let [px, py] = convertStageCoordToScene(state.event.layerX, state.event.layerY)
                            processHighlights(px,py)
                        }

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
                    let [translateX, translateY, initialScale] = restoreTransform()
                //    const [translateX, translateY, initialScale] = restoreState()
                /*let initialScale = stageRef.current.scale().x
                if( enableFlipping ){
                    const [scale = 1] = stageRef.current.container().style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
                    initialScale *= scale
                }*/
                return [initialScale,initialScale]
                },
                    scaleBounds: { min: 0.03, max: 8 },
                },
            }
        )

        function findTrackedNodesAtPosition(px,py, classes){
            if( classes ){
                classes = [classes].flat()
            }
            const found = []
            const checked = new Set()
            for(const frame of myState.current.frames){
                for(const d of frame.lastNodes){
                    let x = px - frame.node.attrs.x
                    let y = py - frame.node.attrs.y
                    if( !checked.has(d._id) && d.attrs.x <= x && d.attrs.y <= y &&  (d.attrs.x + d.attrs.width) >= x && (d.attrs.y + d.attrs.height) >= y){
                        if( !classes || d.attrs.name?.split(" ").filter(d=>classes.includes(d)).length >0){
                            found.push(d)
                            checked.add( d._id)
                        }
                    }
                }
            }
            return found
        }


        function addOverlay( node, label, operation, colors){
            if( operation === "background"){
                if( node.getClassName() === "Group"){
                    const bg = node.find('Rect')?.[0]
                    if( bg && !bg.attrs.overlay_label || bg.attrs.overlay_label === "hover" ){
                        bg.attrs.baseFill = bg.attrs.fill
                        bg.attrs.overlay_label = label
                        bg.fill(colors[operation]?.fill)
                    }
                }
            }
            if( operation === "border"){
                if( node.getClassName() === "Group"){
                    const border = new Konva.Rect({
                        x: 0,
                        y: 0,
                        cornerRadius: 2,
                        width: node.attrs.width,
                        height: node.attrs.height,
                        stroke: colors[operation]?.stroke,
                        fill: colors[operation]?.fill,
                        strokeScaleEnabled: false,
                        name: label
                    })

                    node.add(border)
                }
            }
            stageRef.current.batchDraw()
        }
        function removeOverlay( node, label, operation){
            if( operation === "background"){
                if( node.getClassName() === "Group"){
                    const bg = node.find('Rect')?.[0]
                    if( bg && bg.attrs.overlay_label === label){
                        bg.fill(bg.attrs.baseFill)
                        bg.attrs.overlay_label = undefined
                    }
                }
            }
            if( operation === "border"){
                if( node.getClassName() === "Group"){
                    const border = node.find(`.${label}`)?.[0]
                    if( border ){
                        border.remove()
                    }
                }
            }
            stageRef.current.batchDraw()
        }

        function leftNode(node, type){
            const operation = props.highlights?.[type]
            removeOverlay( node, "border", operation)
        }
        function enteredNode(node, type, scale){
            const operation = props.highlights?.[type]
            addOverlay( node, "border", operation, colors.hover)
        }

        function processMouseMove(e){
            let [x, y] = convertStageCoordToScene(e.evt.layerX, e.evt.layerY)
            processHighlights(x,y)
        }
        function clearSelection(){
            myState.current.hover ||= {}
            for(const type of Object.keys(props.selectable ?? {})){
                if( myState.current?.selected?.[type] ){
                    for( const d of myState.current.selected[type]){
                        removeOverlay(d, "select", props.highlights?.[type] ?? "border")
                    }
                    myState.current.selected[type] = undefined
                }
            }
        }
        function clearHightlights(){
            myState.current.hover ||= {}
            for(const type of Object.keys(props.highlights ?? {})){
                if( myState.current.hover[type] ){
                    leftNode(myState.current.hover[type], type)
                    myState.current.hover[type] = undefined
                }
            }
        }
        function processHighlights(x,y){

            myState.current.hover ||= {}
            for(const type of Object.keys(props.highlights ?? {})){
                let found = findTrackedNodesAtPosition( x, y, type)
                if( found ){
                    const thisItem = found[0]
                    if( myState.current.hover[type] !== thisItem ){
                        if( myState.current.hover[type] ){
                            leftNode(myState.current.hover[type], type)
                        }
                        myState.current.hover[type] = thisItem
                        if(myState.current.hover[type]){
                            enteredNode(myState.current.hover[type], type)
                        }
                    }
                }else{
                    if( myState.current.hover[type] ){
                        leftNode(myState.current.hover[type], type)
                    }
                }
            }
        }
        function processClick(e){
            let [x, y] = convertStageCoordToScene(e.evt.layerX, e.evt.layerY)
            let found = findTrackedNodesAtPosition( x, y)
            let doneClick = false
            for( const d of found){
                if( d.attrs.onClick ){
                    d.attrs.onClick(d.attrs.id)
                    doneClick = true
                }else{
                    for(const cls of (d.attrs.name?.split(" ") ?? [])){
                        if( props.selectable?.[cls]){

                            if( myState.current.lastSelection && myState.current.lastSelection !== cls && props.selectable[myState.current.lastSelection].multiple && e.evt.shiftKey ){
                                continue
                            }

                            if( !myState.current.lastSelection  || 
                                props.selectable[cls].multiple !== true ||
                                cls !== myState.current.lastSelection 
                                || e.evt.shiftKey == false
                                ){
                                clearSelection()
                            }
                            myState.current.selected ||= {}
                            myState.current.lastSelection = cls
                            myState.current.selected[cls] ||= []
                            myState.current.selected[cls].push(d)
                            
                            leftNode(d, cls)
                            addOverlay(d, "select", props.highlights?.[cls] ?? "border", colors.select)
                            doneClick = true
                        }                        
                        if( props.callbacks?.onClick?.[cls] ){
                            const ids = myState.current.selected[cls].map(d=>d.attrs.id)
                            const result = props.callbacks?.onClick?.[cls]( ids.length > 1 ? ids : ids )
                            doneClick = true
                        }
                    }
                }
            }
            if(!doneClick){
                clearSelection()
            }
            e.evt.stopPropagation()
        }
        function convertStageCoordToScene(cx, cy){
            let initialScale = stageRef.current.scale().x
            
            if( enableFlipping ){
                const [sx = 0, sy = 0] = stageRef.current.container().style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
                let [canvasScale = 1] = stageRef.current.container().style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
                let scale = canvasScale * initialScale

                const cox = myState.current.flipping.last.fsx
                const coy = myState.current.flipping.last.fsy

                const ox = -parseInt(sx)  
                const oy = -parseInt(sy)

                let fx  = (cox + ox + cx) / scale
                let fy  = (coy + oy + cy) / scale
                return [fx, fy]
                
            }else{
                throw "Not implemented"
            }

        }
    
    const stage = <Stage
                ref={stageRef}
                onClick={processClick}
                onMouseMove={processMouseMove}
                style={{
                    transformOrigin: "0 0"
                }}>
                    <Layer
                        ref={layerRef}
                        perfectDrawEnabled={false}
                        listening={false}
                    >
                    </Layer>
                </Stage>

        return <div 
            ref={frameRef}
            onClick={(e)=>{e.stopPropagation()}}
            className='rounded-md  overflow-hidden w-full h-full' 
            >
               {stage} 
            </div>

}