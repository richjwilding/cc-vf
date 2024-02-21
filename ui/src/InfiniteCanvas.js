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
    
    const stageRef = useRef()
    const frameRef = useRef()
    const myState = useRef()

    const chunkWidth = 400
    const chunkHeight = 400


    const test_items = useMemo(()=>{
        myState.current ||= {}
        const out = []
        
        let cols = 50, rows = 50
        
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
        for(const d of Object.values( myState.current.imageCache )){
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
                const [scale = 1] = stageRef.current.container().style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
                for(let i = 0; i < step; i++) {
                    const fi = bi +i
                    if( fi < len){
                        const d = updated[ fi]
                        if( d._scale !== d.newScale){
                            d._scale = d.newScale
                            d.node.clearCache()
                            d.node.cache({pixelRatio: d.newScale * 2})
                        }
                    }
                }
                stageRef.current.batchDraw()
                
            }, idx * 5);
            idx++
        }
    }

    function buildPositionCache(){
        if(!stageRef.current){
            return
        }        
        myState.current ||= {}
        if( enablePages ){
            myState.current.pages = []
        }

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

    function convertItems(){
        const target = stageRef.current?.children[0]
        if( target ){
            let frameId = 0
            const frame = new Konva.Rect({
                x: 0,
                y:0,
                width: 1000,
                height: 10,
                fill: undefined,//"#d2d2f2",
                stroke:"red",
                strokeWidth:1,
                strokeScaleEnabled: false,
                visible: false,
                id: `f${frameId}`
            }) 
            target.add(frame)
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
                target.add(g)
                moveList.forEach(d=>target.add(d))

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

                    target.add(g)
                    
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
                        visible: enableNodePruning
                    })
                    
                    let r = g.x() + g.width()
                    let b = g.y() + g.height()
                    if( r > maxX){ maxX = r }
                    if( b > maxY){ maxY = b }

                    if( g ){
                        target.add(g)
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
          frame.width(maxX)
           frame.height(maxY)
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
        convertItems()
        resizeFrame()
        updateVisibility(0,0)


        const observer = new ResizeObserver((rect)=>{
            resizeFrame(rect[0].contentRect.width, rect[0].contentRect.height)
        });
        observer.observe(frameRef.current);

        return ()=>{
            observer.unobserve(frameRef.current);
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
        let w = myState.current.width / scale
        let h = myState.current.height / scale
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

        let showFrame = scale < 0.2
                    
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
        
        stageRef.current.find('#f0')?.[0]?.visible(showFrame)
        
        if( enableNodePruning ){
            stageRef.current.children[0].children = activeNodes
        }
//        console.log(`RENDERED ${vis} of ${nodes.length} candidates / ${stageRef.current.children[0].children.length}`)
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

        function findTrackedNodesAtPosition(x,y, classes){
            if( classes ){
                classes = [classes].flat()
            }
            const found = []
            const checked = new Set()
            if( myState.current.pages.lastRendered ){
                for(const page of myState.current.pages.lastRendered){
                    const [px, py] = page.split("-");
                    const n = myState.current.pages[px]?.[py];
                    if( n ){
                        for(const d of n){
                            if( !checked.has(d._id) && d.attrs.x <= x && d.attrs.y <= y &&  (d.attrs.x + d.attrs.width) >= x && (d.attrs.y + d.attrs.height) >= y){
                                if( !classes || d.attrs.name?.split(" ").filter(d=>classes.includes(d)).length >0){
                                    found.push(d)
                                    checked.add( d._id)
                                }
                            }
                        }
                    }
                }
            }
            return found
        }
        function leftNode(node, type){
            const operation = props.highlights?.[type]
            if( operation === "background"){
                if( node.getClassName() === "Group"){
                    const bg = node.find('Rect')?.[0]
                    if( bg ){
                        bg.fill(bg.attrs.baseFill)
                    }
                }
            }
            if( operation === "border"){
                if( node.getClassName() === "Group"){
                    const border = node.find('.border')?.[0]
                    if( border ){
                        border.remove()
                    }
                }
            }
            stageRef.current.batchDraw()
        }
        function enteredNode(node, type, scale){
            const operation = props.highlights?.[type]
            if( operation === "background"){
                if( node.getClassName() === "Group"){
                    const bg = node.find('Rect')?.[0]
                    if( bg ){
                        bg.attrs.baseFill = bg.attrs.fill
                        bg.fill('#a3f0c611')
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
                        stroke: "#a3f0c6",
                        fill:'#a3f0c633',
                        //strokeWidth: Math.min(2, 2 / (scale ?? restoreScale())),
                        strokeScaleEnabled: false,
                        name: "border"
                    })
                    node.add(border)
                }
            }
            stageRef.current.batchDraw()
        }

        function processMouseMove(e){
            let [x, y] = convertStageCoordToScene(e.evt.layerX, e.evt.layerY)
            processHighlights(x,y)
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
            let found = findTrackedNodesAtPosition( x, y, "primitive")
            let doneClick = false
            for( const d of found){
                if( d.attrs.onClick ){
                    d.attrs.onClick(d.attrs.id)
                    doneClick = true
                }else{
                    for(const cls of d.attrs.name?.split(" "))
                    if( props.callbacks?.onClick?.[cls] ){
                        props.callbacks?.onClick?.[cls]( d.attrs.id )
                        doneClick = true
                    }
                }
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