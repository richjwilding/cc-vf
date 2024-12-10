import { Stage, Layer, Text, Rect, Group, FastLayer} from 'react-konva';
import Konva from 'konva';
import { Children, cloneElement, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';
import { RenderPrimitiveAsKonva, finalizeImages, renderToggle } from './RenderHelpers';
import { exportKonvaToPptx } from './PptHelper';
import MainStore from './MainStore';
import { AvoidLib } from 'libavoid-js';
import CustomImage from './CustomImage';

Konva.autoDrawEnabled = false

const updateLinksDuringMove = true
const linkArrowSize = 8



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
        refreshLinks()
    }, [props.frameLinks])*/

    const chunkWidth = 800
    const chunkHeight = 800

    const frameData = (id)=>{
        if(!myState.current?.frames){
            return undefined
        }
        const frame = myState.current.frames.find(d=>d.id === id)
        return frame
    }
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
    function getSelection(key){
        return myState.current.selected?.[key] ?? []
    }
    function frameList(){
        return myState.current?.frames?.map(d=>d.id) ?? []
    }
    function addFrame(d){
        if(!d){return}
        myState.current.renderList.push(d)
        refreshFrame(d.id)
        refreshLinks()
    }
    function removeFrame(frameId){

        const existing = myState.current.frames?.find(d=>d.id === frameId) 
        if( existing ){
            removeRoutingForFrame( existing )
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
        myState.current.renderList = myState.current.renderList.filter(d=>d?.id !== frameId)
        refreshLinks()
        stageRef.current.batchDraw()

    }

    useImperativeHandle(ref, () => {
        return {
            exportToPptx,
            addFrame,
            updateFramePosition,
            removeFrame,
            framePosition,
            frameList,
            frameData,
            stageNode: ()=>stageRef.current,
            size: ()=>[myState.current.width,myState.current.height],
            updateLinks,
            getLinks,
            refreshFrame,
            getSelection
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
        /*
        if(!myState.current.healthTracker){
            myState.current.healthTracker = setInterval(() => {
                console.log(`${myState.current.rescaleList?.length ?? 0}, ${myState.current.timeoutPending}, ${myState.current.animFramePending}`)
            }, 500);

        }*/
        if( !stageRef.current){
            return
        }
        if(myState.current.timeoutPending){
            //console.log(`TO  cancel - already scheduled ${myState.current.timeoutPending} ${myState.current.rescaleList?.length ?? 0}`)
            return
        }
        if(myState.current.animFramePending){
            //console.log(`RAF cancel - already scheduled ${myState.current.timeoutPending} ${myState.current.rescaleList?.length ?? 0}`)
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
                /*if(myState.current.animFramePending){
                    console.log(`No RAF after 5s - clearing`)
                    myState.current.animFramePending = undefined
                }*/
            myState.current.animFramePending = requestAnimationFrame(()=>{
                myState.current.animFramePending = undefined
                let steps = 200
                //console.log(`RENDERING ${myState.current.rescaleList?.length ?? 0}`)
                let toProcess = myState.current.rescaleList.splice(0,steps)
                for(let idx = 0; idx < steps; idx++){
                    const d = toProcess[idx]
                    if( d ){
                        if( !d.parent?.attrs.removing && d.getLayer()){
                            d.refreshCache()
                            d.draw()
                        }else{
                            console.log(`Has been removed`)
                            d.resetOwner()
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
        myState.current.rescaleList.push( image )
        refreshImages()
        return
        if( !image.queuedForRefresh ){
            //const doRefresh = myState.current.rescaleList.length === 0
            image.queuedForRefresh = true
            myState.current.rescaleList.push( image )
            
            //if( doRefresh){
                refreshImages()
            //}
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

        const frameBg = new Konva.Rect({
            x: 0,
            y:0,
            width: 1000,
            height: 10,
            fill:"#fcfcfc",
            cornerRadius: 10,
            strokeScaleEnabled: false,
            visible: props.board,
            stroke: undefined,
            name:"frame_bg",
            id: `frame`,
        }) 
        frame.add(frameBg)
        const frameBorder = new Konva.Rect({
            x: 0,
            y:0,
            width: 1000,
            height: 10,
            strokeWidth: 0.5,
            fill:undefined,//"#fcfcfc",
            cornerRadius: 10,
            strokeScaleEnabled: false,
            visible: props.board,
            stroke: "#b8b8b8",
            name:"frame_outline",
            id: `frame`,
        }) 
        frame.add(frameBg)
        frame.add(frameBorder)
        
        
        
        myState.current.frames ||= []

        
        myState.current.frames[frameId] = {
            id: options.id ?? frameId,
            node: frame,
            border: frameBorder,
            bg: frameBg,
            x: options.x ?? 0,
            y: options.y ?? 0,
            scale: options.s ?? 1
        }
        
        return myState.current.frames[frameId]
    }
    function processAnimationQueue(){
        if( myState.current.animationRequest ){
            console.log(`defer anim request`)
        }
        if( myState.current.animationQueue?.length > 0){
            myState.current.animationRequest = requestAnimationFrame(()=>{
                const tick = performance.now()
                for(const d of myState.current.animationQueue){
                    if(d.callback){
                        if( d.node.getLayer()){
                            if(d.callback(tick)){
                                d.node.draw()
                            }
                        }
                    }
                }
                myState.current.animationRequest = undefined
                processAnimationQueue()
            })
        }
    }
    function animationCallback(g, callback, options){
        myState.current.animationQueue = myState.current.animationQueue || []
        myState.current.animationQueue.push( {node: g, callback, options} )
        processAnimationQueue()
    }
    function removeFromAnimationQueue( animationNodeId ){
        if(myState.current.animationQueue ){
            const old = myState.current.animationQueue.length
            myState.current.animationQueue = myState.current.animationQueue.filter(d=>d.node._id !== animationNodeId )
            console.log(`REMOVED ${old-myState.current.animationQueue.length} nodes`)
        }

    }

    function setupFrameForItems( id, title, items, x, y, s, options ){
        let ids, removeIds
        const existing = myState.current.frames?.find(d=>d.id === id) 
        let existingNode
        if(existing){
            existing.node.children = existing.allNodes
            existingNode = existing.node
            removeRoutingForFrame( existing )
            myState.current.frames = myState.current.frames.filter(d=>d.id !== id) 
        }
        const frame = createFrame({id: id, x, y, s})
        if( frame ){
            const frameBorder = frame.border//node.find('#frame')?.[0]
            let framePadding = [0,0,0,0]
            
            if( props.board){
                framePadding = options.canvasMargin ?? [5,5,5,5]
                if( title ){

                    const label = new Konva.Group({
                        x:0,
                        y:0,
                        offsetY:18,
                        width:100,
                        height:18,
                        name:"frame_label",
                    })
                    label.add(new Konva.Rect({
                        x:0,
                        y:0,
                        width:18,
                        height:18,
                        fill:"#fdfdfd"
                    }))
                    const titleText = new Konva.Text({
                        text: typeof(title) == "function" ? title() : title,
                        x:0,
                        y: 0,
                        verticalAlign:"middle",
                        fontSize:12,
                        lineHeight: 1.5,
                        color: '#444',
                        ellipsis: true
                    })
                    label.attrs.originWidth = titleText.width()
                    label.attrs.scaleFont = 12
                    
                    label.add(titleText)
                    frame.label = label
                    frame.node.add(label)
                }
            }

            const rendered = items({imageCallback: processImageCallback, amimCallback: animationCallback, x: framePadding[3], y: framePadding[0]})
            framePadding = rendered?.attrs?.canvasMargin ?? framePadding

            const root = convertItems( rendered, frame.node)
            ids = frame.node.find('.primitive').map(d=>d.attrs.id)
            frame.cells = frame.node.find('.cell').map(d=>({id: d.attrs.id, l: d.attrs.x, t: d.attrs.y, r: (d.attrs.x + d.attrs.width), b: (d.attrs.y + d.attrs.height)}))
            const maxX = root.width() + framePadding[1] + framePadding[3]
            const maxY = root.height() + framePadding[0] + framePadding[2]
            
            frame.allNodes = frame.node.children
            frame.canChangeSize = options.canChangeSize
            frame.canvasMargin = framePadding
            
            if( frame.bg){
                frame.bg.width(maxX)
                frame.bg.height(maxY)
            }
            if( frameBorder){
                frameBorder.remove()
                frameBorder.width(maxX)
                frameBorder.height(maxY)
                frame.node.add(frameBorder)
            }
            frame.node.width(maxX)
            frame.node.height(maxY)
            addRoutingForFrame( frame )
            refreshLinks()
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
                            match[0].attrs["_txc"] = undefined
                            match[0].attrs._vis = undefined
                            if( match[0].resetOwner ){
                                match[0].resetOwner()
                            }

                            parent.add(match[0])
                            d.destroy()

                            existingItems = existingItems.filter(d2=>d.attrs.id !== d2.attrs.id)
                        }
                    }
                }
                
            }

            //console.log(`Found existing frame - removing`)
            existingNode.children.forEach(d=>{
                if( d.attrs.hasAnimationNode ){
                    console.log(`will remove from animation queue`)
                    removeFromAnimationQueue(d.attrs.hasAnimationNode)
                }
                d.attrs.removing = true
            })
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
            }, 150);
            
        }
    }
    function refreshLinksDuringDrag( override ){
        if( myState.current.linkUpdatePending ){
            return
        }
        myState.current.linkUpdatePending = requestAnimationFrame(()=>{
            refreshLinks( override)
            myState.current.linkUpdatePending = undefined            
        })
    }
    function computeDistance(frameId, current, param, distance){
        return myState.current.frames.reduce((a,d)=>{
            if( d.id === frameId){
                return a
            }
            let di = (d[param]) ? Math.abs(current - d[param]) : undefined
            let v = d[param]
            if( di){
                let v2 = v + (param === "x" ? d.node.width() * d.node.scaleX( ): d.node.height() * d.node.scaleY( ))
                const di2 = Math.abs(current - v2)
                if( di2 < di ){
                    di = di2
                    v = v2
                }

                if( di < distance){
                    if( di < a.d){
                        return {v, d: di}
                    }
                }
            }
            return a
        }, {v: undefined, d: Infinity})
    }

    function rescaleLinks(){
        let scale = myState.current.viewport?.scale ?? 1
        let pw = linkArrowSize / scale
        
        if( myState.current.frameLinks ){

            for(const d of myState.current.frameLinks){
                d.pointerLength( pw )
                d.pointerWidth( pw )
            }
        }

    }
    function addShapeToRouter(id, l,t,r,b){
        const Avoid = myState.current.routing.avoid
        let router = myState.current.routing.router
        const shapeRef = new Avoid.ShapeRef(router, 
            new Avoid.Rectangle(
                new Avoid.Point(l, t),
                new Avoid.Point(r, b)
        ));


        const topPin = new Avoid.ShapeConnectionPin(
            shapeRef,
            1,
            0.5,
            0,
            true,
            0,
            Avoid.ConnDirTop 
        );
        const bottomPin = new Avoid.ShapeConnectionPin(
            shapeRef,
            1, // one central pin for each shape
            0.5,
            1,
            true,
            0,
            Avoid.ConnDirBottom 
        );
        const leftPin = new Avoid.ShapeConnectionPin(
            shapeRef,
            1,
            0,
            0.5,
            true,
            0,
            Avoid.ConnDirLeft 
        );
        const rightPin = new Avoid.ShapeConnectionPin(
            shapeRef,
            1, 
            1,
            0.5,
            true,
            0,
            Avoid.ConnDirRight 
        );
        leftPin.setExclusive(false);
        rightPin.setExclusive(false);
        topPin.setExclusive(false);
        bottomPin.setExclusive(false);
        const inputPin = new Avoid.ShapeConnectionPin(
            shapeRef,
            2,
            0,
            0.5,
            true,
            0,
            Avoid.ConnDirRight 
        );
        inputPin.setExclusive(false);
        
        return shapeRef
    }
    function removeRoutingForFrame( frame ){
        if( frame.routing){
            myState.current.routing.routerLinks = myState.current.routing.routerLinks.filter(d=>{
                let [leftFull,right] = d.id.split("~")
                let [left, cell] = leftFull.split(":")
                if( left === frame.id || right === frame.id){
                    myState.current.routing.router.deleteConnector( d.route )     
                    return false
                }
                return true
            })
            for(const d of Object.values(frame.routing)){
                myState.current.routing.router.deleteShape( d.shape )
            }
        }
    }

    function addRoutingForFrame( frame ){
        if( !myState.current.routing ){return}
        const fId = frame.id

        let position = framePosition(fId)?.scene
        frame.routing = {
            [fId]: {
                shape: addShapeToRouter( fId, position.l, position.t, position.r, position.b)
            }
        }

        if( myState.current.baseLinks ){
            for(const cell of frame.cells){
                if( myState.current.baseLinks.find(d=>d.left === fId && d.cell === cell.id) ){
                    const id = `${fId}:${cell.id}`
                    frame.routing[id] = {
                        shape: addShapeToRouter( id, (cell.l * position.s) + position.l , (cell.t  * position.s) + position.t, (cell.r  * position.s) + position.l , (cell.b * position.s) + position.t),
                        cell: cell
                    }
                }
            }
        }
    }
    function getLinks( links ){
        return myState.current.baseLinks
    }
    function updateFramePosition( frameId, details){
        myState.current.framePositions ||= {}
        myState.current.framePositions[frameId] = {
            ...myState.current.framePositions[frameId],
            ...details
        }


    }
    function updateLinks( links ){
        console.log(`UPDATING LINKS IN IC`)
        myState.current.baseLinks = links

        const frameList = new Set()
        
        for(const d of myState.current.baseLinks){
            frameList.add( d.left)
            frameList.add( d.right)
        }
        for(const d of frameList.values()){
            const frame = myState.current.frames.find(d2=>d2.id === d)
            removeRoutingForFrame(frame)
            addRoutingForFrame(frame)
        }

        refreshLinks()
    }


    async function refreshLinks( override ){
        
        if( myState.current.baseLinks){
            if( !myState.current.frameLinks ){
                myState.current.frameLinks = []                
            }
            if( !myState.current.avoid_loaded ){
                myState.current.avoid_loaded = true
                AvoidLib.load('/images/libavoid.wasm').then(data=>{
                    const Avoid = AvoidLib.getInstance();
                    const router = new Avoid.Router(Avoid.OrthogonalRouting)
                    router.setRoutingParameter(Avoid.shapeBufferDistance, 40);
                    myState.current.routing = {
                        avoid: Avoid,
                        router: router,
                        routerLinks: []
                    }
                    refreshLinks()
                })
                return
            }
            if( !myState.current.routing){return}
            const Avoid = myState.current.routing.avoid
            const router = myState.current.routing.router

            // Define the graph with fixed node positions and edges
            
            let nodes = {}

            for(const frame of myState.current.frames){
                if( !frame.routing ){
                    addRoutingForFrame(frame)
                }
                //nodes[frame.id] = frame.routing
                nodes = {
                    ...nodes,
                    ...frame.routing
                }
            }


            let activeLinks = new Set()

            for(const target of myState.current.baseLinks){
                const leftName = target.left + (target.cell ? `:${target.cell}` : "")
                const left = nodes[leftName]?.shape
                const right = nodes[target.right]?.shape
                
                if( left && right){
                    const id = `${leftName}~${target.right}` 
                    let leftPin = 1
                    let rightPin = 1
                    if( target.leftPin === "input"){
                        leftPin = 2
                    }
                    if( !myState.current.routing.routerLinks.find(d=>d.id===id)){
                        const leftConnEnd = new Avoid.ConnEnd(left, leftPin)
                        const rightConnEnd = new Avoid.ConnEnd(right, rightPin)
                        const connRef = new Avoid.ConnRef(myState.current.routing.router);
                        connRef.setSourceEndpoint(leftConnEnd);
                        connRef.setDestEndpoint(rightConnEnd);
                        connRef.setCallback( renderLink, connRef)
                        myState.current.routing.routerLinks.push({
                            id: id,
                            route: connRef
                        })
                    }
                    activeLinks.add(id)
                }
            }
            myState.current.frameLinks = myState.current.frameLinks.filter(d=>{
                if( !activeLinks.has(d.attrs.id)){
                    d.remove()
                    return false
                }
                return true
            })
            if( override ){
                for(const d of override){
                    updateFrameInRouter(d)
                }
            }


            router.processTransaction()
            lineLayerRef.current.batchDraw()
        }
    }
    function updateFrameInRouter(d){
        const Avoid = myState.current.routing.avoid
        const router = myState.current.routing.router
        let position = framePosition(d.id)?.scene
        position.r = position.r - position.l + d.x
        position.b = position.b - position.t + d.y
        position.l = d.x
        position.t = d.y
        
        const ovrFrame = myState.current.frames.find(d2=>d2.id === d.id)
        
        for( const ri in ovrFrame.routing){
            const r = ovrFrame.routing[ri]
            if( r.cell ){
                const shapeRect = new Avoid.Rectangle(
                    new Avoid.Point((r.cell.l * position.s) + position.l, (r.cell.t * position.s) + position.t),
                    new Avoid.Point((r.cell.r * position.s) + position.l, (r.cell.b * position.s) + position.t)
                );
                router.moveShape(r.shape, shapeRect);
            }else{
                const shapeRect = new Avoid.Rectangle(
                    new Avoid.Point(position.l, position.t),
                    new Avoid.Point(position.r, position.b)
                );
                router.moveShape(r.shape, shapeRect);
            }
        }
    }
    function renderLink( avRoute ){
        const edge = myState.current.routing.routerLinks.find(d=>d.route?.g === avRoute)
        if( !edge){return}
        const route = edge.route.displayRoute()
        const points = []
        for (let i = 0; i < route.size() ; i++) {
            const { x, y } = route.get_ps(i);
            points.push(x)
            points.push(y)
        }

        let allPoints = points

        let scale = myState.current.viewport?.scale ?? 1
        let pw = linkArrowSize / scale
        let link = myState.current.frameLinks.find(d=>d.attrs.id === edge.id)
        if( link ){
            link.points(allPoints)
            link.pointerLength( pw )
            link.pointerWidth( pw )
        }else{
            link = new Konva.Arrow({
                id: edge.id,
                points: allPoints,
                stroke: '#b6b6b6',
                strokeWidth: 0.75,
                pointerLength: pw,
                pointerWidth: pw,
                fill: '#b6b6b6',
                strokeScaleEnabled: false
            })
            myState.current.frameLinks.push(link)
            lineLayerRef.current.add( link )
        }
    }
    function getRelativeFramePosition(id){
        return myState.current.framePositions?.[id] ?? {x:0,y:0,s:1}
    }
    function getFramePosition(id, defaults = true){
        const hasAbsolute = myState.current.frames?.[id]?.x !== undefined
        let x = myState.current.framePositions?.[id]?.x ?? myState.current.frames?.[id]?.x ?? (defaults ? 0 : undefined)
        let y = myState.current.framePositions?.[id]?.y ?? myState.current.frames?.[id]?.y ?? (defaults ? 0 : undefined)
        let s = myState.current.framePositions?.[id]?.s ?? myState.current.frames?.[id]?.s ?? (defaults ? 1 : undefined)
        
        if( !hasAbsolute ){

            const item = myState.current.renderList.find(d=>d?.id === id)
            if( item.parentRender ){
                console.log(`Aligning to parent`)
                let {x:px, y:py, s:ps} = getFramePosition(item.parentRender)
                x = ((x ?? 0) * ps) + px
                y = ((y ?? 1) * ps) + py
                s = (s ?? 1) * ps
            }
        }

        return {x,y,s}
    }
    function updateNestedFramePosition( node ){
        const children = myState.current.renderList.filter(d=>d.parentRender === node.attrs.id)
        if( children.length > 0){
            let {x:px, y:py, s:ps} = getFramePosition(node.attrs.id)
            for(const d of children){
                const frame = myState.current.frames.find(d2=>d.id === d2.id)
                const node = frame.node
                
                let {x, y, s} = getRelativeFramePosition( d.id)
                x = (x * ps) + px
                y = (y * ps) + py
                s *= ps
                
                node.setPosition({x, y})
                node.scale({x:s, y:s})
                frame.x = x
                frame.y = y
                
                updateFrameInRouter({
                    id: d.id,
                    x: x,
                    y: y
                })
                
                
            }
        }
    }

    function orderNestedFrames(node, start = true){
        console.log(`Check reorder frame ${node.attrs.id}`)
        const children = myState.current.renderList.filter(d=>d.parentRender === node.attrs.id)
        //let nextZ = startZ ?? node.zIndex() + 1
        if( children.length > 0){
            for(const d of children){
                const frame = myState.current.frames.find(d2=>d.id === d2.id)
                const node = frame.node
                console.log(`Setting ${node.attrs.id} to top`)
                node.moveToTop()
                orderNestedFrames(node, false)
            }
        }
        if( start ){

            myState.current.frames.forEach(frame=>frame.order = frame.node.zIndex())
            console.log(myState.current.frames.map(d=>d.order))
            myState.current.frames = myState.current.frames.sort((a,b)=>a.order - b.order)
        }
    }

    function refreshFrame(id, newItems ){
        const force = newItems !== undefined
        const item = myState.current.renderList.find(d=>d?.id === id)
        if( item ){
            if( force ){            
                item.items = newItems.items            
            }

            const {x, y, s} = getFramePosition(id)
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
            orderNestedFrames(frame.node)
            stageRef.current.batchDraw()
        }else{
            addFrame(newItems)
        }
    }

    useLayoutEffect(()=>{
        myState.current.renderList = props.render
        myState.current.baseLinks = props.frameLinks
        myState.current.framePositions = props.framePositions
        var ctx = layerRef.current.getContext()._context;
        ctx.textRendering = "optimizeSpeed";
        
        stageRef.current.container().querySelector('canvas').style.background = props.background ?? "white"
        
        
        if( myState.current.renderList ){
            if( myState.current.frames ){
                myState.current.frames.forEach(d=>d.markForDeletion = true)
            }
            let x = 0, y = 0, s = 1
            for( const set of myState.current.renderList){
                let {x:tx, y:ty, s:ts} = getFramePosition(set.id, false)
                if( tx !== undefined ){
                    x = tx
                    y = ty
                    s = ts
                }
                const frame = setupFrameForItems(set.id, set.title, set.items, x, y, s, set)
                y += (frame.node.attrs.height * frame.node.attrs.scaleY) + 200

            }
            if( myState.current.frames ){
                myState.current.frames = myState.current.frames.filter(d=>{
                    if(d.markForDeletion ){
                        removeRoutingForFrame( d )
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
                    //console.log(`Restoring all nodes on ${frame.id}`)
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
                                if( item.attrs.scaleFont || ((item.attrs.width * scale * frame.scale) > (item.attrs.minRenderSize ?? 8)) || item.attrs.name === "frame_outline"){
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
                            const w = Math.min( d.attrs.originWidth * iScale, frame.node.attrs.width * 1.25)
                            const h =  (iScale * d.attrs.scaleFont) * 1.2
                            d.children[1].fontSize( iScale * d.attrs.scaleFont )
                            d.children[1].width( w )
                            d.children[0].width( w )
                            d.children[0].height( h )
                            d.children[1].height( h )
                            d.offsetY( h + 2)
                            d.height( h )
                            d.width( w )
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
                    //frame.border.stroke(showFrame ? "#b8b8b8" : "#b8b8b8")
                    //frame.border.fill(showFrame ? "#f2f2f2" : "#efefef")
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

                    rescaleLinks()

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
                                    d.lastActualRenderFor = d.attrs._vis
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
    function panHandler(state){
        if( state.first || state.memo === undefined) {
            clearHightlights()
            if( props.callbacks?.viewportWillMove){
                props.callbacks?.viewportWillMove(myState.current.viewport)
            }
        }
        const multiple = myState.current.panForDrag ? -1 : 3
        
        const x = (myState.current.viewport?.x ?? 0) - ((state.delta[0] ) * multiple)
        const y = (myState.current.viewport?.y ?? 0) - ((state.delta[1] )  * multiple)
        
        alignViewport(x,y, myState.current.viewport?.scale ?? 1)

        if( state.last ){
            let [px, py] = convertStageCoordToScene(state.event.layerX, state.event.layerY)
            processHighlights(px,py)
            myState.current.wasPanning = false
            myState.current.panForDrag = false
            if( state.last ){
                if( props.callbacks?.viewportCallback){
                    props.callbacks?.viewportCallback(myState.current.viewport)
                }
            }
        }
        
    }

    

    useGesture({
        onDrag:(state)=>{
            if( myState.current.frameSelect?.transforming){
                return
            }
            if( myState.current.panForDrag ){
                return panHandler(state)
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
                let found = orderInteractiveNodes(findTrackedNodesAtPosition( x, y, ["primitive", "frame"], true))
                const item = found[0]
                if( !item ){
                    myState.current.panForDrag = true
                    return panHandler(state)
                }
                if( item && !myState.current.dragging ){

                    clearHightlights()
                    clearSelection(["frame"])                    
                    destroyFrameSelect()
                    if( props.callbacks?.viewportWillMove){
                        props.callbacks?.viewportWillMove(myState.current.viewport)
                    }
                    
                    const isFrame = item.attrs.name === "frame"
                    
                    let clone
                    let offsetForShadow = 10
                    let dx, dy, minX, minY
                    let frameScale = (isFrame ? item.attrs.scaleX : item.findAncestor('.frame')?.attrs.scaleX) 
                    let cloneScale = scale * frameScale

                    if( isFrame ){

                        clone = new Konva.Group({})
                        minX = Infinity
                        minY = Infinity
                        let maxX = -Infinity, maxY = -Infinity
                        let clones = []
                        
                        myState.current.selected = myState.current.selected ?? {}
                        
                        const frameInList = myState.current.selected.frame?.find(d=>d.attrs.id === item.attrs.id)
                        if( !frameInList ){
                            if(state.event.shiftKey == false || !props.selectable?.frame?.multiple){
                                myState.current.selected.frame = [item]
                            }else{
                                myState.current.selected.frame.push(item)
                            }                            
                        }
                        let oScale
                        for(const item of myState.current.selected.frame ){
                            oScale = oScale ?? item.attrs.scaleX
                            
                            const thisClone = item.clone()                    
                            minX = Math.min( minX, item.attrs.x)
                            minY = Math.min( minY, item.attrs.y)
                            maxX = Math.max( maxX, item.attrs.x + (item.attrs.width * item.attrs.scaleX))
                            maxY = Math.max( maxY, item.attrs.y + (item.attrs.height * item.attrs.scaleY))
                            thisClone.find('.frame_label')?.[0]?.destroy()
                            thisClone.find('#frame')?.[0]?.stroke('#999')
                            item.visible(false)
                            clones.push( thisClone)
                        }
                        for(const d of clones){
                            d.x( d.x() - minX)
                            d.y( d.y() - minY)
                            clone.add(d)
                        }
                        clone.x( minX )
                        clone.y( minY )
                        clone.width( (maxX - minX ) * 1.05)
                        clone.height( (maxY - minY) * 1.05)
                        offsetForShadow = 0

                        dx = x - minX
                        dy = y - minY
                        cloneScale = scale 
                    }else{
                        clone = item.clone()                    
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
                        
                        dx = x - (item.parent?.attrs.x ?? 0) - (item.attrs.x * frameScale)
                        dy = y - (item.parent?.attrs.y ?? 0) - (item.attrs.y * frameScale)
                    }

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
                    myState.current.dragging.minX = minX
                    myState.current.dragging.minY = minY
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
                if( props.snapDistance ){
                    const [fx, fy] = convertStageCoordToScene(px - myState.current.dragging.ox, py - myState.current.dragging.oy)
                    const snapX = computeDistance( myState.current.dragging.clone.attrs.id, fx, "x", props.snapDistance)
                    const snapY = computeDistance( myState.current.dragging.clone.attrs.id, fy, "y", props.snapDistance)
                    if( snapX.v ){
                        const [cx,cy] = convertSceneCoordToScreen(snapX.v)
                        px = cx + myState.current.dragging.ox
                    }
                    if( snapY.v ){
                        const [cx,cy] = convertSceneCoordToScreen(undefined, snapY.v)
                        py = cy + myState.current.dragging.oy
                    }
                }
                myState.current.dragging.spx = px
                myState.current.dragging.spy = py
                myState.current.dragging.stage.container().style.transform = `translate(${px - myState.current.dragging.ox}px, ${py - myState.current.dragging.oy}px)`;
                [x, y] = convertStageCoordToScene(px, py )

                if( updateLinksDuringMove && myState.current.dragging.isFrame){
                    const [fx, fy] = convertStageCoordToScene(px - myState.current.dragging.ox, py - myState.current.dragging.oy)
                    refreshLinksDuringDrag(
                        myState.current.selected.frame.map(d=>(
                            {id: d.attrs.id, x: fx + d.attrs.x -  myState.current.dragging.minX, y: fy + d.attrs.y -  myState.current.dragging.minY}
                        ))                        
                    )
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
                            if( config[type].droppable && myState.current.dragging.startZone ){
                                let droppable
                                if( props.board ){
                                    const startFrame = myState.current.dragging.startZone?.findAncestor('.frame')?.attrs.id
                                    const dropFrame = found.findAncestor('.frame')?.attrs.id
                                    droppable = config[type].droppable( myState.current.dragging.clone.attrs.id, myState.current.dragging.startZone.attrs.id, found.attrs.id, startFrame, dropFrame)
                                }else{
                                    droppable = config[type].droppable( myState.current.dragging.clone.attrs.id, myState.current.dragging.startZone.attrs.id, found.attrs.id)
                                }
                                if( !droppable){
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
                    if( myState.current.dragging.dropConfig && myState.current.dragging.dropZone && myState.current.dragging.startZone){
                        if( props.board ){
                            const startFrame = myState.current.dragging.startZone?.findAncestor('.frame')?.attrs.id
                            const dropFrame = myState.current.dragging.dropZone?.findAncestor('.frame')?.attrs.id
                            myState.current.dragging.dropConfig.drop( myState.current.dragging.clone.attrs.id, myState.current.dragging.startZone.attrs.id, myState.current.dragging.dropZone.attrs.id, startFrame, dropFrame)
                        }else{
                            myState.current.dragging.dropConfig.drop( myState.current.dragging.clone.attrs.id, myState.current.dragging.startZone.attrs.id, myState.current.dragging.dropZone.attrs.id )
                        }
                    }
                    myState.current.dragging.sourceItem.visible(true)
                    if( myState.current.dragging.isFrame ){
                        for( const thisFrame of myState.current.selected.frame){

                            const frameId = thisFrame.attrs.id
                            thisFrame.visible(true)
                            
                            let [px,py] = state.xy
                            px -= memo.x
                            py -= memo.y
                            
                            let [fx, fy] = convertStageCoordToScene(px - myState.current.dragging.ox, py - myState.current.dragging.oy)
                            const frame = myState.current.frames.find(d=>d.id === frameId)
                            
                            if( props.snapDistance ){
                                const snapX = computeDistance( myState.current.dragging.clone.attrs.id, fx, "x", props.snapDistance)
                                const snapY = computeDistance( myState.current.dragging.clone.attrs.id, fy, "y", props.snapDistance)
                                console.log(`Snap ${snapX.v}, ${snapY.v}`)
                                if( snapX.v ){
                                    fx = snapX.v
                                }
                                if( snapY.v ){
                                    fy = snapY.v
                                }
                            }

                            fx += thisFrame.attrs.x -  myState.current.dragging.minX
                            fy += thisFrame.attrs.y -  myState.current.dragging.minY

                            if( frame ){
                                frame.x = fx
                                frame.y = fy
                                frame.node.setPosition({x:fx, y:fy})
                                
                                if( props.callbacks?.frameMove ){
                                    let fs = frame.scale

                                    const item = myState.current.renderList.find(d=>d?.id === frame.id)
                                    if( item.parentRender ){
                                        let {x:px, y:py, s:ps} = getFramePosition(item.parentRender)
                                        fx = (fx - px) / ps
                                        fy = (fy - py) / ps
                                        fs /= ps
                                    }
                                    
                                    props.callbacks.frameMove({
                                        id: frameId,
                                        x: fx,
                                        y: fy,
                                        s: fs
                                    })
                                    updateNestedFramePosition( frame.node )
                                }
                            }
                        }
                        stageRef.current.batchDraw()
                        refreshLinks()
                        if( props.enableFrameSelection && myState.current.dragging.frameSelect){
                            console.log(`FINISHED WITH ${myState.current.selected.frame.length} selected frames`)
                            for(const item of myState.current.selected.frame ){
                                createFrameSelect( item )
                            }
                            const frameId = myState.current.dragging.sourceItem.attrs.id
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
                      panHandler(state)

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
                        const max = props.board ? 5 / Math.min(1, ...Object.values(props.framePositions ?? {}).map(d=>d.s ?? 1)) : 8
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
                    if( !hasFound && props.board && (classes.includes("frame"))){
                        found.push(frame.node)
                    }
                }else{
                    if( (forClick || includeFrame) && frame.label){
                        
                        const lx = frame.label.attrs.x + frame.node.attrs.x
                        const ly= frame.label.attrs.y + frame.node.attrs.y - (frame.label.attrs.height * frame.scale )
                        const inFrameLabel = lx <= px && ly <= py &&  (lx + (frame.label.width() * frame.scale)) >= px && (ly + (frame.label.attrs.height * frame.scale )) >= py
                        if( inFrameLabel){
                            found.push(frame.node)
                        }
                    }
                }
            }
            return found
        }


        function addOverlay( node, label, operation, colors){
            if( node.attrs?.name.includes("widget")){
                for(const d of node.find('.hover_target')){
                    if( d.attrs.hoverFill){
                        d.attrs._originalFill = d.attrs.fill
                        d.fill( d.attrs.hoverFill)
                    }
                }
                return
            }
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
            if( node.attrs?.name.includes("widget")){
                for(const d of node.find('.hover_target')){
                    if( d.attrs._originalFill){
                        d.fill( d.attrs._originalFill)
                        d._originalFill = undefined
                    }
                }
                return
            }
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
            let cursor = ""            
            let [x, y] = convertStageCoordToScene(e.evt.layerX, e.evt.layerY)
            if( processHighlights(x,y) ){
                cursor = "pointer"
            }else{
                cursor = "default"
            }

            if( cursor !== myState.current.cursor){
                frameRef.current.style.cursor = cursor
                myState.current.cursor = cursor
            }
        }
        function clearSelection(skip){
            myState.current.hover ||= {}
            for(const type of Object.keys(props.selectable ?? {})){
                if( skip && skip.includes(type)){
                    continue
                }
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
                    
                    for(const d of [cleared, found]){
                        if(!d){continue}
                        const frame = d.findAncestor('.frame')
                        const x1 = d.attrs.x + frame.attrs.x, y1 = d.attrs.y + frame.attrs.y
                        const x2 = x1 + d.attrs.width, y2 = y1 + d.attrs.height
                        if( x1 < minX){minX = x1}
                        if( y1 < minY){minY = y1}
                        if( x2 > maxX){maxX = x2}
                        if( y2 > maxY){maxY = y2}
                        
                    }
                    let count = 0
                    for(const frame of myState.current.frames){
                        for(const d of frame.lastNodes){
                            let x1 = d.attrs.x + frame.x, y1 = d.attrs.y + frame.y
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
            let anythingFound = false
            for(const type of Object.keys(props.highlights ?? {})){
                //let found = findTrackedNodesAtPosition( x, y, type)?.[0]
                let found = orderInteractiveNodes(findTrackedNodesAtPosition( x, y, type))?.[0]
                anythingFound ||= found
                doHighlight( found, type)

            }
            return anythingFound
        }
        function orderInteractiveNodes(found){
            const nodesWithZIndex = found.map(node => ({
                node,
                zIndex: node.zIndex(), // Cache zIndex
              }));
            return nodesWithZIndex.sort((a, b) => b.zIndex - a.zIndex).map(d=>d.node)

        }
        async function processClick(e){
            if( myState.current.ignoreClick ){
                myState.current.ignoreClick = false
                return
            }
            let [x, y] = convertStageCoordToScene(e.evt.layerX, e.evt.layerY)
            const clickable_names = ["widget", "frame_label",...Object.keys(props.selectable), Object.keys(props.callbacks?.onClick ?? {})].filter((d,i,a)=>a.indexOf(d) === i)
            if( clickable_names.length === 0 ){
                return
            }
            let found = orderInteractiveNodes(findTrackedNodesAtPosition( x, y, clickable_names, undefined, true))
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
                                if( props.enableFrameSelection && cls === "frame" ){
                                    destroyFrameSelect()
                                }
                            }
                            myState.current.selected ||= {}
                            myState.current.lastSelection = cls
                            myState.current.selected[cls] ||= []
                            myState.current.selected[cls].push(d)
                            
                            leftNode(d, cls)
                            if( props.enableFrameSelection && cls === "frame" ){
                                createFrameSelect( d )
                                console.log(myState.current.selected.frame.map(d=>d.attrs.id))
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
                if(doneClick){
                    break
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
            if( !myState.current.frameSelect ){
                myState.current.frameSelect = {
                    layer: new Konva.Layer(),
                    node: d
                }
                stageRef.current.add(myState.current.frameSelect.layer)
            }

            myState.current.frameSelect.transformers = myState.current.frameSelect.transformers  ?? []

            const node = new Konva.Rect({x: d.attrs.x, y: d.attrs.y, width: d.attrs.width * d.attrs.scaleX, height: d.attrs.height  * d.attrs.scaleX})
            const frame = myState.current.frames?.find(d2=>d2.id === d.attrs.id) 
            myState.current.frameSelect.layer.add(node)
            const thisTransformer = new Konva.Transformer({
                rotateEnabled:false, 
                resizeEnabled: true,
                flipEnabled: false,
                enabledAnchors: frame?.canChangeSize === "width" ? 
                        ['top-left', 'top-right', 'middle-right', 'bottom-left', 'bottom-right'] : 
                        frame?.canChangeSize ? ['top-left', 'top-right', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
                        : ['top-left', 'top-right', 'bottom-left', 'bottom-right']
            })
            thisTransformer.on('transformstart',()=>{
                myState.current.frameSelect.transforming = true
            })
            thisTransformer.on('transformend',(e)=>{
                myState.current.frameSelect.transforming = false
                const frame = myState.current.frames?.find(d2=>d2.id === d.attrs.id) 

                if( frame ){
                    if( thisTransformer._movingAnchorName === "middle-right"){
                        const newWidth = (thisTransformer.width() / myState.current.viewport.scale) / frame.scale
                        const innerWidth = newWidth - (frame.canvasMargin[1] + frame.canvasMargin[3])
                        if( props.callbacks.resizeFrame ){
                            props.callbacks.resizeFrame( frame.id, innerWidth)                        
                        }
                        return
                    }else if( thisTransformer._movingAnchorName === "bottom-center"){
                        const newHeight = (thisTransformer.height() / myState.current.viewport.scale) / frame.scale
                        const innerHeight = newHeight - (frame.canvasMargin[0] + frame.canvasMargin[2])
                        if( props.callbacks.resizeFrame ){
                            props.callbacks.resizeFrame( frame.id, undefined, innerHeight)                        
                        }
                        return
                    }else{
                        const newScale = thisTransformer.width() / myState.current.viewport.scale / frame.node.attrs.width
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
                        

                        removeRoutingForFrame( frame )
                        addRoutingForFrame( frame )

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
            thisTransformer.nodes([node])
            myState.current.frameSelect.layer.add(thisTransformer)
            myState.current.frameSelect.transformers.push( thisTransformer )
            stageRef.current.batchDraw()
        }        
        function destroyFrameSelect(){
            if( myState.current.frameSelect){
                for(const t of myState.current.frameSelect.transformers){
                    t.destroy()
                }
                myState.current.frameSelect.transformers = undefined
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

        window.mainStage = stageRef
    
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
                        >
                        {props.bounds && <Rect name="bounds_frame" stroke="#aaa" strokeWidth={0.5} fill="white" strokeScaleEnabled={false} x="0" y="0" width={10 * 4 / 0.03} height={5.625 * 4 / 0.03}/>}
                    </Layer>
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