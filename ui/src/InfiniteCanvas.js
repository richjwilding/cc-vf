import { Stage, Layer, Text, Rect, Group, FastLayer} from 'react-konva';
import Konva from 'konva';
import { Children, cloneElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import { RenderPrimitiveAsKonva, finalizeImages, renderToggle } from './RenderHelpers';
import { exportKonvaToPptx } from './PptHelper';
import MainStore from './MainStore';
import { AvoidLib } from 'libavoid-js';

Konva.autoDrawEnabled = false

const updateLinksDuringMove = true

//export default function InfiniteCanvas(props){
const InfiniteCanvas = forwardRef(function InfiniteCanvas(props, ref){

    const childRefs = useRef([]);

    const attachRefs = (child, index) => {
        if (!childRefs.current[index]) {
          // Assign a function to the ref array if it doesn't exist
          childRefs.current[index] = {};
        }
    
        console.log(`attaching ${index}`)
        return cloneElement(child, {
          ref: (el) => {
            childRefs.current[index] = el;
          },
        });
      };

    const enablePages =  true
    const enableFlipping = true
    const enableNodePruning = true

    const scaleTriggers = {min: 0.1, max: 3}

    const colors = {
        hover:{
            background:{
                //fill:'#a3f0c611'
                fill:'#fafefb'
            },
            border:{
                stroke: "#a3f0c6",
                fill : '#a3f0c633'
            }
        },
        drop_hover:{
            background:{
                fill:'#a3f0c644'
                //fill:'#f9fafb'
            }
        },
        select:{
            background:{
                //fill : '#9abef822'
                fill:'#f3f6fd'
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
    const lineLayerRef = useRef()
    const myState = useRef({renderList: props.render})

    /*
    useEffect(()=>{
        myState.current.renderList = props.render
        console.log(`----- RL CHANGE`)
        console.log(myState.current.renderList)
    }, [props.render, props.update])*/
    

    useEffect(()=>{
        refreshLinks()
    }, [props.frameLinks])

    const chunkWidth = 800
    const chunkHeight = 800

    const framePosition = (id)=>{
        if(!myState.current?.frames){
            return undefined
        }
        const list = id ? myState.current.frames.filter(d=>d.id === id)  : myState.current.frames


        const mapped = list.map(d=>{
            const tl = convertSceneCoordToScreen( d.x, d.y)
            const br = convertSceneCoordToScreen( d.x + (d.node.attrs.width * d.node.attrs.scaleX), d.y + (d.node.attrs.height * d.node.attrs.scaleY))
                
            return {
                scene:{
                    x: d.x,
                    y: d.y,
                    width: d.node.attrs.width,
                    height: d.node.attrs.height,
                    l: d.x,
                    r: d.x + (d.node.attrs.width  * d.node.attrs.scaleX),
                    t: d.y,
                    b: d.y + (d.node.attrs.height * d.node.attrs.scaleY),
                    s: d.node.attrs.scaleX
                },
                viewport:{
                    l: tl[0],
                    t: tl[1],
                    r: br[0],
                    b: br[1]
                }
            }
        })
        return id ? mapped[0] : mapped
    }
    const exportToPptx = ()=>{
        console.log(`EXPORTING`)

        if( stageRef.current ){
            exportKonvaToPptx( stageRef.current )
        }
    }
    function addFrame(d){
        myState.current.renderList.push(d)
        refreshFrame(d.id)
        refreshLinks()
    }
    function removeFrame(frameId){

        const existing = myState.current.frames?.find(d=>d.id === frameId) 
        if( existing ){
            if( myState.current.frameSelect && myState.current.selected.frame){
                const ids = myState.current.selected.frame.map(d=>d.attrs.id)
                if( ids.includes(frameId) ){
                    destroyFrameSelect()
                }
            }
            existing.node.children = existing.allNodes
            myState.current.frames = myState.current.frames.filter(d=>d.id !== frameId) 

            existing.node.children.forEach(d=>d.attrs.removing = true)
            existing.node.remove()

        }
        myState.current.renderList = myState.current.renderList.filter(d=>d.id !== frameId)
        refreshLinks()
        stageRef.current.batchDraw()

    }

    useImperativeHandle(ref, () => {
        return {
            exportToPptx,
            addFrame,
            removeFrame,
            framePosition,
            size: ()=>[myState.current.width,myState.current.height],
            refreshFrame
        };
      }, []);


    const test_items = useMemo(()=>{
        const out = []
        
        let cols = 200, rows = 50
        
        for(let i = 0; i < (cols * rows); i++){
            out.push({x: (i % cols), y: Math.floor(i / cols)})
        }
        return out
    }, [])

    function refreshImages(){
        if( !stageRef.current){
            return
        }
        if( !myState.current.rescaleList  ){
            return
        }
        const delay = 1 +(Math.random() * 5)

        if(!myState.current.width || !myState.current.height){
            setTimeout(() => {
                refreshImages()
            }, delay)
            return
        }
        
        myState.current.timeoutPending = setTimeout(() => {
            myState.current.timeoutPending = undefined
            myState.current.animFramePending = requestAnimationFrame(()=>{
                myState.current.animFramePending = undefined
                let steps = 200
                let toProcess = myState.current.rescaleList.splice(0,steps)
                for(let idx = 0; idx < steps; idx++){
                    const d = toProcess[idx]
                    if( d ){
                        /*
                        if(idx === 0){
                            if(!d.getLayer()){
                                console.log(`CANVAS DESTROYED - BAIING`)
                                myState.current.rescaleList = []
                                break
                            }
                        }*/
                        //if( !d.parent?.attrs.removing ){
                        if( !d.parent?.attrs.removing && d.getLayer()){
                            d.queuedForRefresh = false
                            d.refreshCache()
                            d.draw()
                        }else{
                            console.log(`Has been removed`)
                        }
                    }
                }
                if( myState.current.rescaleList.length > 0){
                    refreshImages()
                }
            })
        }, delay);
            
    }

    function processImageCallback(image, parent){
        if( !myState.current.rescaleList ){
            myState.current.rescaleList = []
        }
        if( !image.queuedForRefresh ){
            const doRefresh = myState.current.rescaleList.length === 0
            image.queuedForRefresh = true
            myState.current.rescaleList.push( image )
            
            if( doRefresh){
                refreshImages()
            }
        }
    }
    function buildPositionCache(frame){
        if(!stageRef.current){
            return
        }        
        if( !enablePages ){
            return
        }
        
        if(frame.pages){
            //throw `Pages already present for frame ${frame.id}`
            frame.pages = []
        }else{
            frame.pages = []
        }


        let nodes = frame.allNodes ?? frame.node.children
        for(const d of nodes){

            let l = d.x()
            let t = d.y()
            let r = l + d.width() 
            let b = t + d.height() 
            let page

            if( frame.scale !== 1){
                l *= frame.scale
                t *= frame.scale
                r *= frame.scale
                b *= frame.scale
            }

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
        const [maxCol,maxRow] = calcPage( frame.node.width() * frame.scale, frame.node.height() * frame.scale)
        frame.maxCol = maxCol
        frame.maxRow  = maxRow
    }

    function createFrame(options = {}){
        const target = stageRef.current?.children[0]
        let frameId = myState.current?.frames?.length ?? 0
        const frame = new Konva.Group({
            x: options.x ?? 0,
            y: options.y ?? 0,
            scaleX: options.s ?? 1,
            scaleY: options.s ?? 1,
            name: "frame",
            id: options.id ??  `f${frameId}`
        }) 
        target.add(frame)
        const frameBorder = new Konva.Rect({
            x: 0,
            y:0,
            width: 1000,
            height: 10,
            fill: undefined,
            stroke:"#eee",
            strokeWidth: 0.5,
            fill:"white",
            strokeScaleEnabled: false,
            visible: props.board,
            id: `frame`,
        }) 
        frame.add(frameBorder)
        
        
        
        myState.current.frames ||= []

        
        myState.current.frames[frameId] = {
            id: options.id ?? frameId,
            node: frame,
            border: frameBorder,
            x: options.x ?? 0,
            y: options.y ?? 0,
            scale: options.s ?? 1
        }
        
        return myState.current.frames[frameId]
    }
    function setupFrameForItems( id, title, items, x, y, s, options ){
        let ids, removeIds
        const existing = myState.current.frames?.find(d=>d.id === id) 
        let existingNode
        if(existing){
            existing.node.children = existing.allNodes
            existingNode = existing.node
            myState.current.frames = myState.current.frames.filter(d=>d.id !== id) 
        }
        const frame = createFrame({id: id, x, y, s})
        if( frame ){
            const frameBorder = frame.border//node.find('#frame')?.[0]
            let framePadding = [0,0,0,0]
            
            if( props.board){
                framePadding = options.canvasMargin ?? [5,5,5,5]
                const titleText = new Konva.Text({
                    text: typeof(title) == "function" ? title() : title,
                    x:0,
                    y: 0,
                    verticalAlign:"bottom",
                    fontSize:12,
                    lineHeight: 1.5,
                    color: '#444',
                    name:"frame_label"
                })
                titleText.attrs.offsetY = -titleText.attrs.y
                titleText.attrs.height = 1
                titleText.attrs.scaleFont = 12

                
                frame.node.add(titleText)
            }

            const rendered = items({imageCallback: processImageCallback, x: framePadding[3], y: framePadding[0]})
            framePadding = rendered.attrs.canvasMargin ?? framePadding

            const root = convertItems( rendered, frame.node)
            ids = frame.node.find('.primitive').map(d=>d.attrs.id)
            frame.cells = frame.node.find('.cell').map(d=>({id: d.attrs.id, l: d.attrs.x, t: d.attrs.y, r: (d.attrs.x + d.attrs.width), b: (d.attrs.y + d.attrs.height)}))
            const maxX = root.width() + framePadding[1] + framePadding[3]
            const maxY = root.height() + framePadding[0] + framePadding[2]
            
            frame.allNodes = frame.node.children
            frame.canChangeSize = options.canChangeSize
            frame.canvasMargin = framePadding
            
            if( frameBorder){
                frameBorder.width(maxX)
                frameBorder.height(maxY)
            }
            console.log(maxX,maxY)
            frame.node.width(maxX)
            frame.node.height(maxY)
        }
        if( existingNode ){
            if( frame ){
                const newItems = frame.node.find('.inf_keep')
                let existingItems = options.forceRender ?[] : existingNode.find('.inf_keep')
                for(const d of newItems){
                    if( !d.attrs.id ){continue}
                    const match = existingItems.filter(d2=>d.attrs.id === d2.attrs.id )
                    if( match.length > 0){
                        if( match.length === 1){
                            const parent = d.parent
                            match[0].remove()
                            match[0].setAttrs(d.attrs)
                            parent.add(match[0])
                            d.destroy()

                            existingItems = existingItems.filter(d2=>d.attrs.id !== d2.attrs.id)
                        }
                    }
                }
                
            }

            console.log(`Found existing frame - removing`)
            existingNode.children.forEach(d=>d.attrs.removing = true)
            existingNode.remove()
            stageRef.current.batchDraw()
        }

        if( props.updateWatchList ){
            props.updateWatchList(frame.id, ids)
        }

        return frame
    }

    function convertItems(g, frame, padding = 0){
        if(  typeof(g) === "object" ){

            const moveList = []
            g.find('.inf_track').forEach(d=>{
                let x = d.x(), y = d.y()
                for(const p of d.findAncestors('Group')){
                    x += p.x()
                    y += p.y()
                }
                d.remove()
                d.x(x )
                d.y(y )
                moveList.push(d)

            })                    
            frame.add(g)
            moveList.forEach(d=>frame.add(d))
        }else{
            let maxX = 0, maxY = 0
            test_items.forEach((d,i)=>{
                g = new Konva.Group({
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
        return g
    }

    function resizeFrame(w, h){
        if( frameRef.current && stageRef.current){
            if( myState.current.resizeTimer ){
                console.log('resize clear')
                clearTimeout( myState.current.resizeTimer )
            }
            myState.current.resizeTimer = setTimeout(() => {
                console.log('resize timeout')
                
                myState.current.width = w ?? frameRef.current.offsetWidth
                myState.current.height = h ?? frameRef.current.offsetHeight
                stageRef.current.width( (enableFlipping ? 2 : 1) * myState.current.width)
                stageRef.current.height( (enableFlipping ? 2 : 1) * myState.current.height)
                if( enableFlipping ){
                    let [x,y,scale] = restoreTransform()
                    console.log(x,y,scale)
                    alignViewport(x,y,scale)
                    updateVisibility(myState.current.flipping?.last.cx ?? 0, myState.current.flipping?.last.cy ?? 0)
                    stageRef.current.batchDraw()
                }
                if( myState.current.needExtentZoom ){
                    zoomToExtents()
                }
            }, 50);
            
        }
    }
    async function refreshLinks( override ){
        
        if( props.frameLinks){
            if( !myState.current.frameLinks ){
                myState.current.frameLinks = []                
            }
            if( !myState.current.avoid_loaded ){
                AvoidLib.load('/images/libavoid.wasm').then(data=>{
                    myState.current.avoid_loaded = true
                    refreshLinks()
                })
                return

            }
            const Avoid = AvoidLib.getInstance();
            const router = new Avoid.Router(Avoid.OrthogonalRouting);

            // Define the graph with fixed node positions and edges
            
            const track = new Set()
            const edges = []
            let edge = 0

            const nodes = {}

            function addShapeToRouter(id, l,t,r,b){
                const shapeRef = new Avoid.ShapeRef(router, 
                    new Avoid.Rectangle(
                        new Avoid.Point(l, t),
                        new Avoid.Point(r, b)
                ));

        
                const inputPin = new Avoid.ShapeConnectionPin(
                    shapeRef,
                    1,
                    0,
                    0.5,
                    true,
                    0,
                    Avoid.ConnDirLeft // All directions
                );



                const outputPin = new Avoid.ShapeConnectionPin(
                    shapeRef,
                    2, // one central pin for each shape
                    1,
                    0.5,
                    true,
                    0,
                    Avoid.ConnDirRight // All directions
                );
                inputPin.setExclusive(false);
                outputPin.setExclusive(false);
                
                nodes[id] = {id: id, shape: shapeRef}
                return shapeRef
            }

            for(const frame of myState.current.frames){
                const fId = frame.id

                if( !track.has(fId)){
                    track.add(fId)
                    let position =  framePosition(fId)?.scene
                    if( override && override.id === fId ){
                        position.r = position.r - position.l + override.x
                        position.b = position.b - position.t + override.y
                        position.l = override.x
                        position.t = override.y
                    }
                    
                    if( position ){
                        addShapeToRouter( fId, position.l, position.t, position.r, position.b)

                        for(const cell of frame.cells){
                            const id = `${fId}:${cell.id}`
                            addShapeToRouter( id, (cell.l * position.s) + position.l , (cell.t  * position.s) + position.t, (cell.r  * position.s) + position.l , (cell.b * position.s) + position.t)
                        }
                    }
                }
            }

            let activeLinks = new Set()


            for(const target of props.frameLinks){
                const leftName = target.left + (target.cell ? `:${target.cell}` : "")
                const left = nodes[leftName]
                const right = nodes[target.right]
                
                if( left && right){
                    const id = `${leftName}-${target.right}` 
                    const leftConnEnd = new Avoid.ConnEnd(left.shape,2)
                    const rightConnEnd = new Avoid.ConnEnd(right.shape,1)
                    const connRef = new Avoid.ConnRef(router);
                    connRef.setSourceEndpoint(leftConnEnd);
                    connRef.setDestEndpoint(rightConnEnd);
                    activeLinks.add(id)
                    edges.push({
                        id: id,
                        left: {
                            id: leftName, 
                            position: left.position
                        },
                        right: {
                            id: target.right, 
                            position: right.position
                        },
                        route: connRef
                    })
                }
            }
            myState.current.frameLinks = myState.current.frameLinks.filter(d=>{
                if( !activeLinks.has(d.attrs.id)){
                    d.remove()
                    return false
                }
                return true
            })

            router.setRoutingParameter(Avoid.shapeBufferDistance, 40);
    

            router.processTransaction()
            edges.forEach(edge=>{
                const route = edge.route.displayRoute()
                const points = []
                for (let i = 0; i < route.size() ; i++) {
                    const { x, y } = route.get_ps(i);
                    points.push(x)
                    points.push(y)
                }

                let allPoints = points

                let link = myState.current.frameLinks.find(d=>d.attrs.id === edge.id)
                if( link ){
                    link.points(allPoints)
                }else{
                    link = new Konva.Arrow({
                        id: edge.id,
                        points: allPoints,
                        stroke: '#444',
                        strokeWidth: 0.5,
                        pointerLength: 20,
                        pointerWidth: 20,
                        fill: '444',
                        strokeScaleEnabled: false
                    })
                    myState.current.frameLinks.push(link)
                    lineLayerRef.current.add( link )
                }
            })
            lineLayerRef.current.batchDraw()

            Avoid.destroy( router )
        }
    }

    function refreshFrame(id, newItems ){
        const force = newItems !== undefined
        const item = myState.current.renderList.find(d=>d.id === id)
        if( force ){            
            item.items = newItems.items            
        }
        if( item ){
            const x = props.primitive.frames?.[id]?.x ?? myState.current.frames?.[id]?.x
            const y = props.primitive.frames?.[id]?.y ?? myState.current.frames?.[id]?.y
            const s = props.primitive.frames?.[id]?.s ?? myState.current.frames?.[id]?.s

            const {items, title, ...options} = item

            const frame = setupFrameForItems(id, title, items, x, y, s, {...options, forceRender: force})
            buildPositionCache(frame)
            finalizeImages(stageRef.current, {imageCallback: processImageCallback})
            alignViewport(myState.current.viewport?.x ?? 0,myState.current.viewport?.y ?? 0, myState.current.viewport?.scale ?? 1, true)
            if( myState.current.frameSelect ){
                if( myState.current.frameSelect.node.attrs.id === id ){
                    clearSelection()                    
                    destroyFrameSelect()
                    createFrameSelect(frame.node)
                }
            }
            refreshLinks()
            stageRef.current.batchDraw()
        }
    }

    useLayoutEffect(()=>{
        myState.current.renderList = props.render
        var ctx = layerRef.current.getContext()._context;
        ctx.textRendering = "optimizeSpeed";
        
        stageRef.current.container().querySelector('canvas').style.background = props.background ?? "white"
        
        
        if( myState.current.renderList ){
            if( myState.current.frames ){
                myState.current.frames.forEach(d=>d.markForDeletion = true)
            }
            let x = 0, y = 0, s = 1
            for( const set of myState.current.renderList){
                if( props.primitive?.frames?.[set.id] ){
                    x = props.primitive.frames[set.id].x
                    y = props.primitive.frames[set.id].y
                    s = props.primitive.frames[set.id].s
                }
                const frame = setupFrameForItems(set.id, set.title, set.items, x, y, s, set)
                y += (frame.node.attrs.height * frame.node.attrs.scaleY) + 200

            }
            if( myState.current.frames ){
                myState.current.frames = myState.current.frames.filter(d=>{
                    if(d.markForDeletion ){
                        d.node.destroy()
                        d.border.destroy()
                        return false
                    }
                    return true
                })
                refreshLinks()
            }
        }
        finalizeImages(stageRef.current, {imageCallback: processImageCallback})


        for( const frame of myState.current.frames ?? []){
            console.log(`Building for ${frame.id}`)
            buildPositionCache(frame)
        }
        //resizeFrame()
        updateVisibility(0,0)


        const observer = new ResizeObserver((rect)=>{
            resizeFrame(rect[0].contentRect.width, rect[0].contentRect.height)
        });
        observer.observe(frameRef.current);


        if( props.primitive?.id !== myState.current.lastPrimitiveId ){
            zoomToExtents()
            myState.current.lastPrimitiveId = props.primitive?.id
        }

        return ()=>{
            
            if( myState.current.timeoutPending ){
                console.log(`Cancelling timeout`)
                clearTimeout(myState.current.timeoutPending)
            }
            if( myState.current.animFramePending ){
                console.log(`Cancelling RAF`)
                cancelAnimationFrame(myState.current.animFramePending)
            }
            myState.current.rescaleList = undefined
            observer.unobserve(frameRef.current);
            for(const frame of myState.current.frames ?? []){
                if( frame.allNodes ){
                    console.log(`Restoring all nodes on ${frame.id}`)
                    frame.node.children = frame.allNodes
                }
            }
        }
    },[props.update, props.primitive.id, props.renderList])

    function zoomToExtents(){
        if( myState.current?.frames ){
            if( !myState.current.width || !myState.current.height){
                myState.current.needExtentZoom = true
                return 
            }
            myState.current.needExtentZoom = false
            let minX = Infinity, minY = Infinity
            let maxX = -Infinity, maxY = -Infinity
            for( const d of myState.current.frames){
                minX = Math.min( minX, d.x )
                minY = Math.min( minY, d.y )
                maxX = Math.max( maxX, d.x + (d.node.attrs.width * d.node.attrs.scaleX))
                maxY = Math.max( maxY, d.y + (d.node.attrs.height * d.node.attrs.scaleY))
            }
            const w = (maxX - minX)
            const h = (maxY - minY)
            let scale = Math.min(1, 0.95 * Math.min( myState.current.width / w, myState.current.height / h ))

            let ox = -minX * scale, oy = -minY * scale
            let tx = ox + ((myState.current.width  - (w * scale)) /2)
            let ty = oy + ((myState.current.height  - (h * scale)) /2)

            alignViewport(tx, ty, scale, true)
        }
    }


    function calcPage(x,y){
        return [Math.floor(x / chunkWidth),  Math.floor(y / chunkHeight)]
    }
    function areSetsEqual(set1, set2) {
        if (set1.size !== set2.size) {
          return false;
        }
        for (let item of set1) {
          if (!set2.has(item)) {
            return false;
          }
        }
        return true;
      }
      

    function updateVisibility(x,y){
        
        if(!stageRef.current || !myState.current.frames){
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

        const lastRenderCount = myState.current.refreshCount
        myState.current.refreshCount = (myState.current.refreshCount ?? 0) + 1

        let changed = 0
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
                let epx = Math.min(frame.maxCol + 1, px + cols + 1)
                let epy = Math.min(frame.maxRow + 1, py + rows + 1)



             //   console.log(`Frame ${frame.id} offset by ${px}, ${py} pages - : ${spx}, ${spy} - doing ${epx-spx} x ${epy-spy} pages`)

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
                                if( item.attrs.scaleFont || ((item.attrs.width * scale * frame.scale) > 10)){
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
                const newThisRender = []
               // const activeNodeIds = new Set()
                let newlyRendered = 0

                vis = 0
                let ax = x - frame.node.attrs.x
                let ax2 = (x2 - frame.node.attrs.x)
                let ay = y - frame.node.attrs.y
                let ay2 = (y2 - frame.node.attrs.y) 

                for( const d  of nodes){
                    let c = d.attrs
                    let x1 = c.x 
                    let y1 = c.y 
                    let x2 = c.x + c.width
                    let y2 = c.y + c.height
                    if(  frame.scale !== 1){
                        x1 *= frame.scale
                        x2 *= frame.scale
                        y1 *= frame.scale
                        y2 *= frame.scale
                    }
                    let visible = true//c.scaleFont ? (x1 >= ax &&  x1 <= ax2 && (y2 + c.offsetY) >= ay && y2 <= ay2) : (x2 > ax &&  x1 < ax2 && y2 > ay && y1 < ay2)
                    if(visible){
                        if( d.attrs.scaleFont ){
                            const iScale = Math.min(25, Math.max(1 / scale / frame.scale , 2))
                            d.fontSize( iScale * d.attrs.scaleFont )
                        }
                        vis++
                        if( enableNodePruning ){
                            if( lastRenderCount === undefined || (d.attrs._vis !== lastRenderCount)){
                                newThisRender.push(d)
                                newlyRendered++
                            }
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
                if( !frame.lastNodeIds){
                    changed = changed > 1 ? changed : 1
                }else if(newlyRendered  ){
                    changed = 2
                }

                frame.lastNodes = activeNodes
                frame.thisRender = newThisRender

                let showFrame = hidden > 0
                if( props.board){
                    frame.border.stroke(showFrame ? "#444" : "#eee")
                }else{
                    frame.border.visible(showFrame)
                }
                
                if( enableNodePruning ){
                    frame.node.children = activeNodes
                }
            //    console.log(`${frame.id} RENDERED ${vis} of ${nodes.length} candidates / ${myState.current.frames.map(d=>d.allNodes.length).reduce((a,c)=>a+c,0)}`)
            }
            return changed
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

            const tw = myState.current.width
            const th = myState.current.height


            let fx = -tx / myState.current.flipping.last.scale * scale 
            let fy = -ty / myState.current.flipping.last.scale * scale

            let fhx = Math.floor(((fx ) - (myState.current.flipping.last.fsx / myState.current.flipping.last.scale * scale) ) / tw) 
            let fhy = Math.floor(((fy ) - (myState.current.flipping.last.fsy / myState.current.flipping.last.scale * scale) ) / th) 

            //let cx = Math.max(0,Math.floor(-tx / scale / chunkWidth)) * chunkWidth
            //let cy = Math.max(0,Math.floor(-ty / scale / chunkHeight)) * chunkHeight

            let cx = Math.floor(-tx / scale / chunkWidth) * chunkWidth
            let cy = Math.floor(-ty / scale / chunkHeight) * chunkHeight


            const isZooming = myState.current.flipping.last.callScale !== scale


            const refScale = scale / (myState.current.flipping.last.scale ?? 1)
            let doImageRescale = false
            
            if( isZooming || forceRescale){
                if( refScale > scaleTriggers.max || refScale < scaleTriggers.min || forceRescale || myState.current.flipping.last.fhx !== fhx || myState.current.flipping.last.fhy !== fhy){
                    //console.log(`RESET ZOOM`, cx, stageRef.current.x(), scale)
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
                }
            }

            if( doUpdate ){
                myState.current.redrawingForZoomPan = true
                let hasChanged = updateVisibility(cx, cy)

                if( updateStagePosition ){
                    myState.current.transformCount = (myState.current.transformCount || 0) + 1
                    stageRef.current.position({x:-vx, y: -vy})
                    stageRef.current.batchDraw()
                }else if( hasChanged ){
                    requestAnimationFrame(()=>{
                        myState.current.frames.forEach((f)=>{
                            if( f.thisRender){
                                for(const d of f.thisRender){
                                    d.draw()
                                }
                            }
                        })
                    })
                }
                myState.current.redrawingForZoomPan = false
            }


            let ox = (-tx - (myState.current.flipping.last.fsx / myState.current.flipping.last.scale * scale )) // (scale / myState.current.flipping.last.scale )
            let oy = (-ty - (myState.current.flipping.last.fsy / myState.current.flipping.last.scale * scale)) // (scale / myState.current.flipping.last.scale)
            

            stageRef.current.container().style.transform = `translate(${-Math.floor(ox)}px, ${-Math.floor(oy)}px) scale(${scale / myState.current.flipping.last.scale}) `
            myState.current.flipping.last.callScale = scale

            myState.current.viewport = {x: tx, y: ty, scale: scale}


            return myState.current.viewport

        }else{
            stageRef.current.scale({x: scale, y: scale} )
            stageRef.current.x(x)
            stageRef.current.y(y)
            updateVisibility(-x, -y)
            stageRef.current.batchDraw()
            
            return {x:tx,y:ty, scale:scale}
        }

    }

    function restoreScale(){
        return myState.current.viewport?.scale ?? 1
    }
    function restoreTransform(){
        return [myState.current.viewport?.x ?? 0, myState.current.viewport?.y ?? 0, myState.current.viewport?.scale ?? 1]
    }
    function createDragging(clone, x, y, shadow){
        if( myState.current.dragging){
            throw "Dragging already present"
            return
        }
        const container = document.createElement('div')
        container.setAttribute("id","drag_container")
        Object.assign(container.style,{
            top:0,
            left: 0,
            position: "absolute"
        })
        frameRef.current.append(container)

        const w = clone.x() + ((clone.width() + shadow)* clone.scale().x)
        const h = clone.y() + ((clone.height() + shadow )* clone.scale().y)

        const maxW = myState.current.width + x
        const maxH = myState.current.height + y

        console.log(`Canvas size => ${x} => ${maxW}`)
        console.log(`Canvas size => ${y} => ${maxH}`)



        const stage = new Konva.Stage({width: Math.min(w, maxW) , height: Math.min(h, maxH), container:'drag_container'})
        //const stage = new Konva.Stage({width: frameRef.current.offsetWidth, height: frameRef.current.offsetHeight, container:'drag_container'})
        stage.add(new Konva.Layer())
        
        myState.current.dragging = {
            clone: clone,
            stage: stage,
            later: stage.children[0],
            ox: x,
            oy: y,
            sw: w,
            sh: h
        }

        return stage
    }
    function destroyDragging(){
        if( !myState.current.dragging){
            return
        }
        let container = myState.current.dragging.stage.container()
        myState.current.dragging.stage.destroy()
        container.remove() 
        myState.current.dragging = undefined



    }

    useGesture({
        onDrag:(state)=>{
            if( myState.current.frameSelect?.transforming){
                return
            }
            let memo = state.memo || {}
            let x, y
            if( state.first ){
                const scale = restoreScale()
                var frameRect = frameRef.current.getBoundingClientRect();
                let [px,py] = state.initial
                memo = {x: frameRect.left, y: frameRect.top}

                px -= memo.x;
                py -= memo.y;


                [x, y] = convertStageCoordToScene(px, py )
                let found = findTrackedNodesAtPosition( x, y, ["primitive", "frame"])
                console.log(`started drag`, found?.[0], state)
                const item = found[0]
                if( item && !myState.current.dragging ){

                    clearHightlights()
                    clearSelection()                    
                    destroyFrameSelect()
                    if( props.callbacks?.viewportWillMove){
                        props.callbacks?.viewportWillMove(myState.current.viewport)
                    }
                    
                    const isFrame = item.attrs.name === "frame"
                    
                    const clone = item.clone()                    
                    let offsetForShadow = 10

                    if( isFrame ){
                        clone.find('.frame_label')?.[0]?.destroy()
                        clone.find('#frame')?.[0]?.stroke('#999')
                        item.visible(false)
                        offsetForShadow = 0
                    }else{
                        const box = new Konva.Rect({
                            x: 0,
                            y: 0,
                            width: clone.width(),
                            height: clone.height(),
                            fill: 'white',
                            cornerRadius:2,
                            stroke: colors.select.border.stroke,
                            strokeWidth:0.5,
                            shadowColor: "#666",
                            shadowOffset: {x:2, y:2},
                            shadowBlur: 4,
                        })
                        clone.add(box)
                        box.zIndex(0)
                        for(const i of clone.find('Image')){
                            i.clearCache()
                        }
                    }

                    let frameScale = (isFrame ? item.attrs.scaleX : item.findAncestor('.frame')?.attrs.scaleX) 
                    let cloneScale = scale * frameScale
                    console.log(frameScale)

                    const dx = x - (item.parent?.attrs.x ?? 0) - (item.attrs.x * (isFrame ? 1 : frameScale))
                    const dy = y - (item.parent?.attrs.y ?? 0) - (item.attrs.y * (isFrame ? 1 : frameScale))
                    console.log(dx,dy)
                    


                    clone.scale({x: cloneScale, y:cloneScale})
                    clone.setAttrs({
                        x: offsetForShadow,
                        y: offsetForShadow,                    
                    })


                    createDragging(clone, (dx * scale) + offsetForShadow, (dy * scale) + offsetForShadow, 8 )
                    
                    if( props.enableFrameSelection){
                        myState.current.dragging.frameSelect = [item]
                    }

                    myState.current.dragging.sourceItem = item
                    myState.current.dragging.isFrame = isFrame
                    myState.current.dragging.startScale = scale
                    myState.current.dragging.spx = px
                    myState.current.dragging.spy = py
                    myState.current.dragging.sox = myState.current.dragging.ox
                    myState.current.dragging.soy = myState.current.dragging.oy
                    myState.current.dragging.type = "primitive"
                    myState.current.dragging.stage.children[0].add(clone)
                    myState.current.dragging.stage.batchDraw()
                    myState.current.dragging.stage.container().style.transform = `translate(${px - myState.current.dragging.ox}px, ${py - myState.current.dragging.oy}px)`
                    
                    
                }
            }else{
                if( !myState.current.dragging ){
                    return
                }
                let [px,py] = state.xy
                px -= memo.x
                py -= memo.y
                    myState.current.dragging.spx = px
                    myState.current.dragging.spy = py
                myState.current.dragging.stage.container().style.transform = `translate(${px - myState.current.dragging.ox}px, ${py - myState.current.dragging.oy}px)`;
                [x, y] = convertStageCoordToScene(px, py )

                if( updateLinksDuringMove && myState.current.dragging.isFrame){
                    const [fx, fy] = convertStageCoordToScene(px - myState.current.dragging.ox, py - myState.current.dragging.oy)
                    refreshLinks({id: myState.current.dragging.clone.attrs.id, x: fx, y: fy})
                }
            }
            
            if( myState.current.dragging ){
                const config = props.drag?.[myState.current.dragging.type]
                if( config ){
                    for(const type of Object.keys(config)){
                        let found = findTrackedNodesAtPosition( x, y, type )?.[0]
                        if( state.first ){
                            myState.current.dragging.startZone = found
                        }
                        if( found ){

                            if( config[type].droppable ){
                                if( !config[type].droppable( myState.current.dragging.clone.attrs.id, myState.current.dragging.startZone.attrs.id, found.attrs.id)){
                                    console.log(`Cant drop on ${found.attrs.id}`)
                                    continue
                                }
                            }
                            doHighlight(found, type, "drop_")
                        }
                        myState.current.dragging.dropZone = found
                        myState.current.dragging.dropConfig = config[type]
                    }
                }
                
                if(state.last){
                    const scale = restoreScale()
                    myState.current.ignoreClick = props.ignoreAfterDrag
                    if( myState.current.dragging.dropConfig && myState.current.dragging.dropZone){
                        myState.current.dragging.dropConfig.drop( myState.current.dragging.clone.attrs.id, myState.current.dragging.startZone.attrs.id, myState.current.dragging.dropZone.attrs.id )
                    }
                    myState.current.dragging.sourceItem.visible(true)
                    if( myState.current.dragging.isFrame ){
                        const frameId = myState.current.dragging.clone.attrs.id
                        stageRef.current.batchDraw()
                        
                        let [px,py] = state.xy
                        px -= memo.x
                        py -= memo.y
                        
                        const [fx, fy] = convertStageCoordToScene(px - myState.current.dragging.ox, py - myState.current.dragging.oy)
                        const frame = myState.current.frames.find(d=>d.id === frameId)

                        if( frame ){
                            frame.x = fx
                            frame.y = fy
                            frame.node.setPosition({x:fx, y:fy})
                        }

                        if( props.callbacks?.frameMove ){
                            props.callbacks.frameMove({
                                id: frameId,
                                x: fx,
                                y: fy,
                                s: frame.scale
                            })
                        }
                        refreshLinks()
                        if( props.enableFrameSelection && myState.current.dragging.frameSelect){
                            createFrameSelect(myState.current.dragging.frameSelect[0])
                            if(props.callbacks?.onClick?.frame){
                                props.callbacks.onClick.frame(  [frameId] )
                            }
                        }
                    }
                    destroyDragging()
                    clearHightlights()
                    processHighlights(x,y)
                    if( props.callbacks?.viewportCallback){
                        props.callbacks?.viewportCallback(myState.current.viewport)
                    }
                }
            }
            return memo
        },
        onPinch: (state)=>{
                       // state.event.preventDefault()
                        if( !state.first && myState.current.wasPanning ){
                            myState.current.wasPanning = false
                            alignViewport(myState.current.viewport?.x ?? 0,myState.current.viewport?.y ?? 0, myState.current.viewport?.scale ?? 1, true)
                            return
                        }
            
                        let memo = state.memo
                        const ox = state.origin[0]
                        const oy = state.origin[1]

                        if (state.first) {
                            const { width, height, x, y } = frameRef.current.getBoundingClientRect()

                            const tx = ox - x
                            const ty = oy - y
                            memo = [myState.current.viewport?.x ?? 0, myState.current.viewport?.y ?? 0, tx, ty, myState.current.viewport?.scale ?? 1]

                            if( props.callbacks?.viewportWillMove){
                                props.callbacks?.viewportWillMove(myState.current.viewport)
                            }
                        }
                        const oldScale = memo[4]
                        const thisScale = state.offset[0]

                        const tx = (memo[2] - memo[0]) / oldScale
                        const ty = (memo[3] - memo[1]) / oldScale

                        const x = memo[2] - (tx * thisScale)
                        const y = memo[3] - (ty * thisScale)

                        let updated = alignViewport(x,y, thisScale, state.last)
                        if( state.last ){
                            if( props.callbacks?.viewportCallback){
                                props.callbacks?.viewportCallback(myState.current.viewport)
                            }
                        }

                        if( myState.current.dragging || myState.current.dragging?.isFrame ){
                            const adjScale = thisScale / myState.current.dragging.startScale 
                            myState.current.dragging.stage.scale({x:adjScale, y:adjScale})
                            myState.current.dragging.ox = myState.current.dragging.sox * adjScale
                            myState.current.dragging.oy = myState.current.dragging.soy * adjScale

                            const dx = myState.current.dragging.spx - myState.current.dragging.ox
                            const dy = myState.current.dragging.spy - myState.current.dragging.oy

                            myState.current.dragging.stage.container().style.transform = `translate(${dx}px, ${dy}px)`;

                            const maxW = myState.current.width + dx
                            const maxH = myState.current.height + dy
                            
                            myState.current.dragging.stage.width( Math.min(myState.current.dragging.sw * adjScale, maxW) )
                            myState.current.dragging.stage.height( Math.min(myState.current.dragging.sh * adjScale, maxH)  )
                            myState.current.dragging.stage.batchDraw()
                        }

                        return [ updated.x, updated.y, memo[2], memo[3],updated.scale, state.pinching] 
                    },
        onWheel: (state) => {
                    if( !state.ctrlKey ){
                        myState.current.wasPanning = true
                      //  state.event.preventDefault()
                        if( state.first || state.memo === undefined) {
                            clearHightlights()
                            if( props.callbacks?.viewportWillMove){
                                props.callbacks?.viewportWillMove(myState.current.viewport)
                            }
                        }
                        
                        const x = (myState.current.viewport?.x ?? 0) - ((state.delta[0] ) * 3)
                        const y = (myState.current.viewport?.y ?? 0) - ((state.delta[1] )  * 3)
                        
                        alignViewport(x,y, myState.current.viewport?.scale ?? 1)

                        if( state.last ){
                            let [px, py] = convertStageCoordToScene(state.event.layerX, state.event.layerY)
                            processHighlights(px,py)
                            myState.current.wasPanning = false
                            if( state.last ){
                                if( props.callbacks?.viewportCallback){
                                    props.callbacks?.viewportCallback(myState.current.viewport)
                                }
                            }
                        }

                    }
                }
            },{
                target: frameRef,
                eventOptions: { 
                    passive: true,
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
                        return [initialScale,initialScale]
                    },
                    //scaleBounds: { min: 0.03, max: 8 },
                    scaleBounds: ()=>{
                        const max = props.board ? 5 / Math.min(1, ...Object.values(props.primitive.frames ?? {}).map(d=>d.s ?? 1)) : 8
                        console.log(max)
                        return { min: 0.03, max: max }
                    }
                },
            }
        )

        function findTrackedNodesAtPosition(px,py, classes, includeFrame = false, forClick){
            if( !myState.current?.frames){return}
            if( classes ){
                classes = [classes].flat()
            }
            const found = []
            let hasFound = false
            const checked = new Set()
            for(const frame of myState.current.frames){
                const inFrame = frame.x <= px && frame.y <= py &&  (frame.x + (frame.node.attrs.width * frame.scale)) >= px && (frame.y + (frame.node.attrs.height * frame.scale)) >= py
                if( inFrame ){
                    for(const d of frame.lastNodes){
                        let x = px - frame.node.attrs.x
                        let y = py - frame.node.attrs.y
                        x /= frame.scale
                        y /= frame.scale
                        if( !checked.has(d._id) && d.attrs.x <= x && d.attrs.y <= y &&  (d.attrs.x + d.attrs.width) >= x && (d.attrs.y + d.attrs.height) >= y){
                            if( !classes || d.attrs.name?.split(" ").filter(d=>classes.includes(d)).length >0){
                                hasFound = true
                                let addMajor = true

                                if( forClick ){
                                    const clickables = d.children?.filter(d2=>d2.attrs.name?.split(" ").includes("clickable"))
                                    if( clickables && clickables?.length){
                                        for( const d2 of clickables ){
                                            if( (d2.attrs.width * myState.current.viewport.scale) > 5 && (d2.attrs.height * myState.current.viewport.scale) > 5){
                                                if( (d.attrs.x + d2.attrs.x) <= x && (d.attrs.y + d2.attrs.y) <= y &&  (d.attrs.x + d2.attrs.x + d2.attrs.width) >= x && (d.attrs.y + d2.attrs.y + d2.attrs.height) >= y){
                                                    found.push(d2)
                                                    addMajor = false
                                                }
                                            }
                                        }
                                    }
                                }
                                checked.add( d._id)
                                if( addMajor ){
                                    found.push(d)
                                }
                            }
                        }
                    }
                    if( !hasFound && props.board && (includeFrame || classes.includes("frame"))){
                        found.push(frame.node)
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
                        bg.fill(bg.attrs?.hoverFill ?? colors[operation]?.fill)
                    }
                }
            }
            if( operation === "border"){
                if( node.getClassName() === "Group"){
                    const border = new Konva.Rect({
                        x: 1,
                        y: 1,
                        cornerRadius: 2,
                        width: node.attrs.width - 2,
                        height: node.attrs.height - 2,
                        stroke: colors[operation]?.stroke,
                        fill: colors[operation]?.fill,
                       // strokeScaleEnabled: false,
                        name: label
                    })

                    node.add(border)
                }
            }
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
        }

        function leftNode(node, type){
            const operation = props.highlights?.[type]
            removeOverlay( node, "border", operation)
        }
        function enteredNode(node, type, prefix){
            const operation = props.highlights?.[type]
            addOverlay( node, "border", operation, colors[prefix + "hover"])
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
            stageRef.current.batchDraw()
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
        function doHighlight(found, type, prefix = ""){
            let doDraw = false
            let cleared 
            if( found ){
                const thisItem = found
                if( myState.current.hover[type] !== thisItem ){
                    if( myState.current.hover[type] ){
                        doDraw = true
                        cleared = myState.current.hover[type]
                        leftNode(myState.current.hover[type], type, prefix)
                    }
                    myState.current.hover[type] = thisItem
                    if(myState.current.hover[type]){
                        doDraw = true
                        enteredNode(myState.current.hover[type], type, prefix)
                    }
                }
            }else{
                if( myState.current.hover[type] ){
                    doDraw = true
                    leftNode(myState.current.hover[type], type, prefix)
                    cleared = myState.current.hover[type]
                    myState.current.hover[type] = undefined
                }
            }
            if( doDraw ){
                let updates = []
                if( props.highlights?.[type] === "border" ){
                    if( cleared ){
                        updates.push(cleared)
                    }
                    if( found ){
                        updates.push(found)
                    }
                }else{

                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
                    
                    if( cleared ){
                        const x1 = cleared.attrs.x, y1 = cleared.attrs.y
                        const x2 = x1 + cleared.attrs.width, y2 = y1 + cleared.attrs.height
                        if( x1 < minX){minX = x1}
                        if( y1 < minY){minY = y1}
                        if( x2 > maxX){maxX = x2}
                        if( y2 > maxY){maxY = y2}
                        
                    }
                    if( found ){
                        const x1 = found.attrs.x, y1 = found.attrs.y
                        const x2 = x1 + found.attrs.width, y2 = y1 + found.attrs.height
                        if( x1 < minX){minX = x1}
                        if( y1 < minY){minY = y1}
                        if( x2 > maxX){maxX = x2}
                        if( y2 > maxY){maxY = y2}
                    }
                    let count = 0
                    for(const frame of myState.current.frames){
                        for(const d of frame.lastNodes){
                            let x1 = d.attrs.x, y1 = d.attrs.y
                            let x2 = x1 + d.attrs.width, y2 = y1 + d.attrs.height  
                            if(x2 >= minX &&  x1 <= maxX && y2 >= minY && y1 <= maxY){
                                if(d.attrs.name === "frame" || d.attrs.name === "view"){
                                    continue
                                }
                                updates.push(d)
                                count++
                                if( x1 < minX){minX = x1}
                                if( y1 < minY){minY = y1}
                                if( x2 > maxX){maxX = x2}
                                if( y2 > maxY){maxY = y2}
                            }
                        }
                    }
                }
                requestAnimationFrame(()=>{
                    let canvas = layerRef.current.getCanvas()
                    for(const d of updates){
                        //d.draw()
                        d.drawScene(canvas)
                    }
                })
            }            
        }
        function processHighlights(x,y, dropCandidate){
            if( !dropCandidate && myState.current.dragging){
                return
            }

            myState.current.hover ||= {}
            for(const type of Object.keys(props.highlights ?? {})){
                let found = findTrackedNodesAtPosition( x, y, type)?.[0]
                doHighlight( found, type)

            }
        }
        async function processClick(e){
            if( myState.current.ignoreClick ){
                myState.current.ignoreClick = false
                return
            }
            let [x, y] = convertStageCoordToScene(e.evt.layerX, e.evt.layerY)
            const clickable_names = ["widget", ...Object.keys(props.selectable), Object.keys(props.callbacks?.onClick ?? {})].filter((d,i,a)=>a.indexOf(d) === i)
            if( clickable_names.length === 0 ){
                return
            }
            let found = findTrackedNodesAtPosition( x, y, clickable_names, undefined, true)
            console.log(found)
            let doneClick = false
            for( const d of found){
                if( d.attrs.onClick ){
                    d.attrs.onClick(d.attrs.id)
                    doneClick = true
                }else{
                    const clsNames = d.attrs.name?.split(" ") ?? []
                    for(const cls of clsNames){
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
                            if( props.enableFrameSelection && cls === "frame" ){
                                destroyFrameSelect()
                                createFrameSelect( d )

                            }else{
                                addOverlay(d, "select", props.highlights?.[cls] ?? "border", colors.select)
                            }
                            doneClick = true
                        }                        
                        if( cls === "widget"){
                            const frameId = d.findAncestor('.frame')?.attrs.id
                            const triggerNames = clsNames.filter(d=>!["widget" ,"inf_track"].includes(d))
                            for(const trigger of triggerNames){
                                if( props.callbacks?.onClick?.widget?.[trigger]){
                                    props.callbacks?.onClick?.widget?.[trigger](d, frameId)
                                }

                            }
                        }
                        else if( cls === "_toggle"){
                            const parent = d.findAncestor('Group')
                            if(parent){
                                const id = parent.attrs.id
                                const toggleId = d.attrs.id
                                const frameId = d.findAncestor('.frame')?.attrs.id
                                if( props.callbacks?.onToggle ){
                                    const status = await props.callbacks.onToggle(id, toggleId, frameId)
                                    const frame =  myState.current.frames.find(d=>d.id === frameId)
                                    console.log(status, frame)
                                    if(frame){
                                        const oldNode = frame.node.children.find(d=>d.attrs.id === id)
                                        if( oldNode ){
                                            console.log(status)
                                            const newNode = renderToggle( status, 
                                                d.attrs.x,
                                                d.attrs.y,
                                                d.attrs.width,
                                                d.attrs.height,
                                                d.attrs.id
                                                )
                                            
                                            oldNode.add(newNode)
                                            d.destroy()
                                        }
                                        oldNode.draw()
                                    }
                                }
                            }
                            doneClick = true
                        }else if( props.callbacks?.onClick?.[cls] ){
                            const frameId = myState.current.selected[cls][0].findAncestor('.frame')?.attrs.id
                            const ids = myState.current.selected[cls].map(d=>d.attrs.id)
                            const result = props.callbacks?.onClick?.[cls]( ids.length > 1 ? ids : ids, frameId )
                            doneClick = true
                        }
                    }
                }
            }
            if(!doneClick){
                clearSelection()
                destroyFrameSelect()                
                if( props.callbacks?.onClick?.frame ){
                    props.callbacks.onClick.frame(undefined)

                }
                if( props.callbacks?.onClick?.canvas ){
                    props.callbacks.onClick.canvas()

                }
            }
            e.evt.stopPropagation()
        }
        function createFrameSelect(d){
            if( myState.current.frameSelect){
                throw "Dragging already present"
                return
            }            
            myState.current.frameSelect = {
                layer: new Konva.Layer(),
                node: d
            }
            stageRef.current.add(myState.current.frameSelect.layer)
            const node = new Konva.Rect({x: d.attrs.x, y: d.attrs.y, width: d.attrs.width * d.attrs.scaleX, height: d.attrs.height  * d.attrs.scaleX})
            const frame = myState.current.frames?.find(d2=>d2.id === d.attrs.id) 
            myState.current.frameSelect.layer.add(node)
            myState.current.frameSelect.transformer = new Konva.Transformer({
                rotateEnabled:false, 
                resizeEnabled: true,
                flipEnabled: false,
                enabledAnchors: frame?.canChangeSize ? ['top-left', 'top-right', 'middle-right', 'bottom-left', 'bottom-right'] : ['top-left', 'top-right', 'bottom-left', 'bottom-right']
            })
            myState.current.frameSelect.transformer.on('transformstart',()=>{
                myState.current.frameSelect.transforming = true
            })
            myState.current.frameSelect.transformer.on('transformend',(e)=>{
                myState.current.frameSelect.transforming = false
                const frame = myState.current.frames?.find(d2=>d2.id === d.attrs.id) 

                if( frame ){
                    if( myState.current.frameSelect.transformer._movingAnchorName === "middle-right"){
                        const newWidth = (myState.current.frameSelect.transformer.width() / myState.current.viewport.scale) / frame.scale
                        const innerWidth = newWidth - (frame.canvasMargin[1] + frame.canvasMargin[3])
                        if( props.callbacks.resizeFrame ){
                            props.callbacks.resizeFrame( frame.id, innerWidth)                        
                        }
                        return
                    }else{
                        const newScale = myState.current.frameSelect.transformer.width() / myState.current.viewport.scale / frame.node.attrs.width
                        let fx = node.attrs.x
                        let fy = node.attrs.y
                        frame.x = fx
                        frame.y = fy
                        frame.scale = newScale
                        buildPositionCache(frame)
                        frame.node.scale({x:1, y:1})
                        frame.node.setPosition({x:fx, y:fy})
                        frame.node.scale({x:newScale, y:newScale})
                        
                        alignViewport(myState.current.viewport?.x ?? 0,myState.current.viewport?.y ?? 0, myState.current.viewport?.scale ?? 1, true)
                        
                        console.log(newScale)
                        stageRef.current.batchDraw()
                        
                        if( props.callbacks?.frameMove ){
                            props.callbacks.frameMove({
                                id: frame.id,
                                x: fx,
                                y: fy,
                                s: newScale
                            })
                        }
                        refreshLinks()
                    }
                }
            })
            myState.current.frameSelect.transformer.nodes([node])
            myState.current.frameSelect.layer.add(myState.current.frameSelect.transformer)
            stageRef.current.batchDraw()
        }        
        function destroyFrameSelect(){
            if( myState.current.frameSelect){
                myState.current.frameSelect.transformer.destroy()
                myState.current.frameSelect.layer.destroy()
                myState.current.frameSelect = undefined
                stageRef.current.batchDraw()
            }
            
        }        
        function convertSceneCoordToScreen(fx, fy){
            if( enableFlipping ){
                const ox = -parseInt(myState.current.viewport?.x ?? 0);
                const oy = -parseInt(myState.current.viewport?.y ?? 0);
                const scale = myState.current.viewport?.scale ?? 1;
              
                let cx = fx * scale - ox;
                let cy = fy * scale - oy;
              
                return [cx, cy];
            }else{
                throw "Not implemented"
            }

        }
        function convertStageCoordToScene(cx, cy){
            if( enableFlipping ){
                const ox = -parseInt(myState.current.viewport?.x ?? 0)  
                const oy = -parseInt(myState.current.viewport?.y ?? 0)
                const scale = myState.current.viewport?.scale ?? 1
                
                let fx  = (ox + cx) / scale
                let fy  = (oy + cy) / scale
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
                    transformOrigin: "0 0",
                }}>
                    <Layer
                        ref={layerRef}
                        perfectDrawEnabled={false}
                        listening={false}
                    />
                    <Layer
                        ref={lineLayerRef}
                        perfectDrawEnabled={false}
                        listening={false}
                    />
                </Stage>

        return <div 
            ref={frameRef}
            style={{
                touchAction: "none"
            }}
            onClick={(e)=>{e.stopPropagation()}}
            className='rounded-md  overflow-hidden w-full h-full' 
            >
               {stage} 
               {Children.map(props.children, (child, index) => attachRefs(child, index))}
            </div>

})
export default InfiniteCanvas