import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useGesture } from "@use-gesture/react"
import MainStore from "./MainStore"
import { animate } from "framer-motion"
import useResizeObserver from '@react-hook/resize-observer';

const spacing = 20
const internalSpacing = 15
const textPadding = `12px 15px`
const test = false

    const restoreState = (gridRef)=>{
        const [translateX = 0, translateY = 0] = gridRef.current.style.transform.match(/translate\((.*?)\)/)?.[1]?.split(',') || [];
        const [scale = 1] = gridRef.current.style.transform.match(/scale\((.*?)\)/)?.[1]?.split(',') || [];
        return [parseFloat(translateX),parseFloat(translateY),parseFloat(scale)]
    }
function arrangeSet( parent, list, size, targetWidth, offset = {x: 0, y: 0}, sizer){
    parent.nestX = parent.root ? 0 : internalSpacing
    if( !parent.renderChildren ){
        return
    }
    if( !size || size.width === 0 || size.height === 0 || !list || list.length === 0){
        parent.scale = (parent.parent?.scale || 1) 
        parent.cascadeScale = (parent.parent?.scale || 1) 
        return
    }
            if( parent.textElement ){
                sizer.style.width = `${(parent.size.width - 2) * 2}px`
                sizer.innerText = parent.text
                parent.textClampHeight =  sizer.offsetHeight * 0.5 
                parent.nestOffset = (parent.textClampHeight ) //+ (spacing / 4)
            }else{
                parent.nestOffset = 0
                parent.textClampHeight = 0
            }

    const maxSpan = list.reduce((a, d)=>d.span > a ? d.span : a, 1) 
    const layoutWidth = size.width// - (2 * offset.x)
    const layoutHeight = size.height - (parent.nestOffset || 0) - (spacing / 2)
    const ratio = layoutWidth / layoutHeight

    const doLayout = (columnWidth)=>{
        if( list.length === 0){return}
        for( const item of list){
            const width = (item.span * columnWidth) + ((item.span - 1) * spacing)
            sizer.style.width = `${width  -2}px`
            sizer.innerText = item.text
            item.size = {width: width, height: Math.max(120, sizer.offsetHeight )}
        }
        const avgHeight = list.reduce((a, d)=>a + (d.size?.height || 0), 0) / list.length
        const avgWidth = list.reduce((a, d)=>a + (d.size?.width || 0), 0) / list.length

        const aRatio =  avgWidth / avgHeight
        const tCols = Math.max(maxSpan, Math.min(Math.ceil( Math.sqrt(list.length) * (1 * ratio / aRatio)), list.length ))
        const cols = Math.max(1, (tCols * 2))



        if( parent.id === 3){
            console.log(ratio, aRatio, tCols, cols)
        }


        //const fullWidth  = ((cols * (columnWidth + spacing)) - spacing) + (offset.x * 2)
        const fullWidth  = ((cols * (columnWidth + spacing)) - spacing) + (spacing * 2)

        const limits = new Array(cols).fill(internalSpacing  )
        
        
        let column = 0
        for( const item of list){
            let sy = limits[column]
            limits.forEach((limit, idx)=>{
                if( idx === (column + 1) && ((idx + item.span) <= cols) ){
                    if( limit + item.size.height < sy){
                        column = idx
                        sy = limit
                    }
                }
            })
            if( column + item.span > cols ){
                column = 0
            }
            if(item.span > 1){
                sy = Math.max(...limits.slice(column, column + item.span))
            }else{
                sy = limits[column]
            }
            item.position = {
                //x: offset.x + (column * (spacing + columnWidth)),
                x: (column * (spacing + columnWidth)),
                y: sy
            }
            for( let idx = 0; idx < item.span; idx++){
                limits[column + idx] = sy +  item.size.height + spacing
            }
            item.column = column
            column = (column + item.span)
            if(column >= cols ){
                column = 0
            }
        }

        const maxHeight = Math.max(...limits) - spacing + (internalSpacing * 2) //+ (offset.y * 2)
        const maxX = list.reduce((a,c)=>Math.max(c.position.x + c.size.width, a),0)
        parent.scale = Math.min( (size.width - (2 * parent.nestX)) / maxX, layoutHeight / maxHeight)

/*
        const nudgeX = (layoutWidth - (fullWidth * parent.scale)) / 2
        const nudgeY = (layoutHeight - (maxHeight * parent.scale)) / 2
        for( const item of list){
            item.position.x += nudgeX / parent.scale
            item.position.y += nudgeY / parent.scale
        }
*/


        return (targetWidth * maxHeight * parent.scale)  / (size.width * size.height)
    }

    let maxScore = 0;
    let maxScale = 0
    let maxF = undefined;
    [1, 1.2, 1.4, 1.6].forEach((d)=>{
        const r = doLayout( targetWidth * d)
        //if( (r >= maxScore) || (r === maxScore && parent.scale > maxScale) ){
        if( (parent.scale > maxScale) ){
            maxScore = r
            maxF = d
            maxScale = parent.scale
        }
        if( parent.id === 8651 ){

            console.log(d, r, parent.scale)
        }
    })
        if( parent.id === 8651){
        //    maxF = 1
            console.log( `picked ${maxF}`)
        }
    
        doLayout( targetWidth * (maxF || 1))
        if( parent.root )
        {
            parent.scale = 1
        }

        const maxX = Math.max(...list.map((c)=>(c.size.width + c.position.x)))
        const nudge = (size.width - (2 * parent.nestX) - (maxX * parent.scale)) / 2
        if( !parent.root ){

            parent.nestX += nudge
        }

        parent.cascadeScale = (parent.parent?.cascadeScale || 1) * parent.scale
        for( const item of list){
            item.element.style.width = `${item.size.width}px`
            item.element.style.height = `${item.size.height}px`
            item.frame.setAttribute('width', item.size.width )
            item.frame.setAttribute('height', item.size.height)
            item.fullPosition = {
                x: (item.parent?.fullPosition?.x || 0) + (item.position.x  * parent.cascadeScale) + ((parent.parent?.cascadeScale || 1) * (parent.nestX || 0)),
                y: (item.parent?.fullPosition?.y || 0) + (item.position.y * parent.cascadeScale) + ((parent.parent?.cascadeScale || 1) * (parent.nestOffset || 0))
            }
            item.fullPosition.x2 = item.fullPosition.x + item.size.width * parent.cascadeScale
            item.fullPosition.y2 = item.fullPosition.y + item.size.height * parent.cascadeScale
        }



    for( const item of list){
        arrangeSet( item, item.children, item.size, targetWidth, {x: spacing, y: 0}, sizer)
    }
    


    return {scale: parent.scale, width: maxX , height: Math.max(...list.map((c)=>(c.size.height + c.position.y)))}
}
function updatePositions( list ){
    for( const item of list){
        if( !item.rendered ){continue}
        if( item.position && item.parentElement){
            item.parentElement.setAttribute("transform", `translate(${item.position.x}, ${item.position.y})`)
        }
        if( item.renderChildren && item.nest){
            item.nest.setAttribute("transform", `translate(${item.nestX},${item.nestOffset }) scale(${item.scale})`)
            updatePositions( item.children )
        }
    }
}

export default function HierarchyView({primitive, ...props}){
    const viewport = useRef()
    const ref = useRef()
    const targetRef = useRef()
    const sizer = useRef()
    const [scale, setScale] = useState(1)
    const myState = useRef({})
    const columnWidth = props.columnWidth || 75

    useResizeObserver(targetRef, (data)=>{
        viewport.current = {
                ...viewport.current,
                width: data.contentRect.width,
                height: data.contentRect.height,
            }
        var transformString = window.getComputedStyle(ref.current).getPropertyValue('transform');
        var transformMatrix = transformString === "none" ? [1,0,0,0,0,0] : transformString.match(/^matrix\((.+)\)$/)[1].split(',').map(parseFloat);
        updateForZoom(transformMatrix[4], transformMatrix[5], transformMatrix[0])
    })

    const updateView = (primitiveId)=>{
        console.log(`UPDATED`, primitiveId)
    }


    const data = useMemo(()=>{
        if( primitive.clusters ){
            const root = {root: true, level:0, children: [], id:0}
            const nodes = {"0": root}

            const markLevels = (node, parent, level)=>{
                const text = node.short || node.summary 
                const length = text.length
                let span = 2
                if( length > 200){
                    span = 3
                    if( length > 500){
                        span = 4
                        if( length > 1600){
                            span = 5
                            if( length > 2000){
                                span = 6
                            }
                        }
                    }
                }
                const d = {
                    parent: parent, 
                    level: level,
                    id: node.id,
                    text: text,
                    span: span,
                    childrenId: node.children,
                    perturb: node.id % 20,
                    show: true,
                    key: `node_${node.id}`
                }
                parent.children.push( d )
                nodes[d.id] = d
                if(node.children){
                    d.children = []
                    node.children.forEach((c)=>{
                        markLevels(primitive.clusters[c], d, level + 1)
                    })
                }
                //if( node.id === 9843 && node.primitives ){
                if( node.primitives ){
                    d.children = d.children || []
                    node.primitives.forEach((id, idx)=>{
                        const prim = MainStore().primitive(id)
                        if( prim ){
                            const p = {
                                id: id,
                                key: id,
                                isPrimitive: true,
                                parent: d,
                                text: prim.title,
                                perturb: idx % 20,
                                span: 2,
                                show: true
                            }
                            d.children.push(p)
                            nodes[id] = p
                        }

                    })
                }
            }
            const level1 = Object.values(primitive.clusters).filter((d)=>d.parent === undefined && d.id !== 0)
            level1.forEach((n)=>{
                markLevels(n, root, 1)
            })
            console.log(nodes)

            const markParents = (node, value)=>{
                if( node.parent ){
                    node.parent.tag = value
                    markParents(node.parent, value)
                }
            }
            //markParents( nodes[9583], 1)
            
            const primIds = Object.values(nodes).filter((d)=>d.isPrimitive).map((d)=>d.id)
            console.log(`TRACKING ${primIds.length} ids` )
            const callbackId  = MainStore().registerCallback(myState.current.callbackId, "set_field set_parameter", updateView, primIds )
            myState.current.callbackId = callbackId

            return {root: root, nodes: nodes}
        }
        return {}
    }, [primitive.id])
    
    useEffect(()=>{
        return ()=>{
            if( myState.current.callbackId ){
                console.log("DEREGISTER")
                MainStore().deregisterCallback( myState.current.callbackId )
            }
        }
    }, [])

    useLayoutEffect(()=>{
        sizer.current = sizer.current || document.createElement('p')
        sizer.current.style.display = 'block'
        sizer.current.style.position = 'absolute'
        sizer.current.style.visibility = 'hidden'
        sizer.current.style.padding = textPadding
        targetRef.current.appendChild( sizer.current )

        if( test ){
            const grid = document.createElement('div')
            grid.style.display = 'block'
            grid.style.position = 'absolute'
            grid.style.left = '25%'
            grid.style.top = '25%'
            grid.style.width = '50%'
            grid.style.height = '50%'
            grid.style.border = '2px solid red'
            targetRef.current.appendChild( grid )
        }


        const root = data.nodes["0"]

        
        renderNodes(root, ref.current.querySelector('g'))
        
        const result = arrangeSet( root, root.children, {width: 1200, height: 900}, columnWidth, undefined, sizer.current)
        updatePositions( root.children )
        root.size = {width: result.width, height: result.height}


        ref.current.setAttribute("width", result.width )
        ref.current.setAttribute("height", result.height)

        viewport.current = {
                width: targetRef.current.offsetWidth,
                height: targetRef.current.offsetHeight,
                shw: result.width / 2,
                shh: result.height / 2,
            }

        const dx = (viewport.current.width / 2) - viewport.current.shw
        const dy = (viewport.current.height / 2) - viewport.current.shh
        
        
        ref.current.style.transform = `translate(${dx}px,${dy}px) scale(1)`
        updateForZoom(dx, dy, 1)


    }, [])


    const updateForZoom = (x, y, thisScale)=>{
        const l = ((viewport.current.shw * thisScale) - x - viewport.current.shw ) / thisScale
        const t = ((viewport.current.shh * thisScale) - y - viewport.current.shh) / thisScale
        const thisView = test 
                            ? [l + (viewport.current.width / thisScale * 0.25) , t + (viewport.current.height / thisScale * 0.25), l + (viewport.current.width / thisScale * 0.75), t + (viewport.current.height / thisScale * 0.75)]
                            : [l, t, l + (viewport.current.width / thisScale), t + (viewport.current.height / thisScale)]

        const midX = (thisView[0] + thisView[2])/2
        const midY = (thisView[1] + thisView[3])/2
        const dia = Math.sqrt(((viewport.current.width / thisScale / 2) ** 2) + ((viewport.current.height / thisScale / 2) ** 2))



        for(const item of Object.values(data.nodes)){
            if( !item.rendered ){continue}
            const lerpRaw = (item.level <= 1) ? 1 : ((thisScale * (item.parent?.cascadeScale || 1)) - 0.4) / 0.2
            let lerp = Math.min(Math.max(0,lerpRaw) , 1)

            //const parentTextLerpRaw = ((thisScale * (item.parent?.parent?.cascadeScale || 1)) - 1.35) / 2.5

//            const distance = Math.sqrt(((midX - ((item.fullPosition.x2 + item.fullPosition.x)/2)) ** 2) + ((midY - ((item.fullPosition.y2 + item.fullPosition.y)/2)) ** 2))
  //          const perturb = 1 - (distance / dia)
    //        const pb = (perturb ** 3) /10
            const pb = item.perturb / 100
//                console.log(item.id,  pb)

            const parentTextLerpRaw = (((thisScale * (item.parent?.parent?.cascadeScale || 1)) - 1.75) / 1.75) * (1+pb)
            const parentNestLerp = Math.min(Math.max(0,parentTextLerpRaw - 0.1) / 0.4, 1)

            const textLerpRaw = (((thisScale * parentNestLerp  * (item.parent?.cascadeScale || 1)) - 1.75) / 1.75) * (1 + pb)
            const textLerp = 1 - Math.min(Math.max(0,textLerpRaw) , 0.5) 
            const nestLerp = Math.min(Math.max(0,textLerpRaw - 0.1) / 0.4, 1)


            const lerping = item.lerp !== lerp
            const textLerping = item.children && (item.textLerp !== textLerp)

            const outOfView = (thisView[0] >= item.fullPosition.x2 || item.fullPosition.x >= thisView[2] || thisView[1] >= item.fullPosition.y2 || item.fullPosition.y >= thisView[3])
            if( test ){
                item.element.style.border = outOfView ? "1px solid red" : "1px solid green"
            }

            const show = !outOfView //&& ((item.level <= 1) || nestLerp > 0)
            const showNest = !outOfView && ((item.level < 1) || nestLerp > 0)

            const nestLerping = (item.nestLerp === undefined && nestLerp === true) || (item.nestLerp !== undefined && item.nestLerp !== nestLerp) || (showNest !== item.showNest)
            
            if( item.show && !show ){
                item.show = show
                item.parentElement.style.display = 'none'
            }else if( show && !item.show){
                item.show = show
                item.parentElement.style.display = 'unset'
            }
            if( item.innernest ){
                if( item.showNest !== showNest){
                    if( !showNest ){
                        item.innernest.style.display = 'none'
                    }else{
                        item.innernest.style.display = 'unset'
                    }
                }
                item.showNest = showNest
            }
            if( outOfView ){

                continue
            }

            if( item.children && showNest && !item.renderChildren){
                renderNodes( item, item.innernest)
                arrangeSet( item, item.children, item.size, columnWidth, {x: spacing, y: 0}, sizer.current)
                item.nest.setAttribute("transform", `translate(${item.nestX},${item.nestOffset }) scale(${item.scale})`)
                updatePositions( item.children )
            }

            if( textLerping ){
                item.textElement.style.transform = `scale(${textLerp})`
                item.textElement.style.width = `${(1 / textLerp) * 100}%`
                item.textLerp = textLerp
            }
            if( nestLerping ){
                if( item.innernest ){
                    item.innernest.style.transform = `scale(${nestLerp})`
                    item.innernest.style.opacity = nestLerp ** 2//+ 0.2
                }
            }
            item.nestLerp = nestLerp
        }
    }
    const zoomTo = (x1,y1,x2,y2,instant = false)=>{
        console.log( `zooming to `)
        const scale = Math.min(viewport.current.width * 0.9 / (x2 - x1), viewport.current.height * 0.9 / (y2 - y1))
        const x =  (viewport.current.shw * (scale - 1)) - (x1  * scale) + viewport.current.width * 0.05
        const y =  (viewport.current.shh * (scale - 1)) - (y1 * scale)
        
        var transformString = window.getComputedStyle(ref.current).getPropertyValue('transform');
        var transformMatrix = transformString === "none" ? [1,0,0,0,0,0] : transformString.match(/^matrix\((.+)\)$/)[1].split(',').map(parseFloat);
        
        const iter =  [(x - transformMatrix[4]) / 100, (y - transformMatrix[5]) / 100, (scale - transformMatrix[0]) / 100]

        if( !instant ){

            animate(0, 100, {
                ease: "easeInOut",
                onUpdate: latest => {
                    const x = transformMatrix[4] + (latest * iter[0])
                    const y = transformMatrix[5] + (latest * iter[1])
                    const s = transformMatrix[0] + (latest * iter[2])
                    
                    const out = `translate(${x}px,${y}px) scale(${s})`
                    ref.current.style.transform = out
                    updateForZoom(x,y,s)
                },
                duration: 0.4
            })
        }
        
        ref.current.style.transform = `translate(${x}px,${y}px) scale(${scale})`
        setScale( scale )
    }

    useGesture({
        onClick:(state)=>{
            state.event.preventDefault()
            const clicked = state.event.target.closest('.pcard')
            if( clicked ){
                const id = clicked.getAttribute('id')
                if( id ){
                    let node = data.nodes[id]
                    if( node ){
                        if( !node.parent.root && node.parent.nestLerp !== 1){
                            node = node.parent
                        }
                        if( myState.current.selected?.element !== node.element ){
                            if( myState.current.selected ){
                                myState.current.selected.element.classList.remove('ring-inset', 'ring-2', 'select-text')
                                myState.current.selected = undefined
                            }
                            myState.current.selected = {element: node.element}
                            myState.current.selected.element.classList.add('ring-inset', 'ring-2' )
                            
                            setTimeout(() => {
                                if(myState.current.selected.element === node.element){
                                    myState.current.selected.element.classList.add('select-text' )
                                    window.getSelection().removeAllRanges()
                                }
                            }, 200);
                            
                            if( node.isPrimitive ){
                                MainStore().sidebarSelect(node.id)
                            }
                        }
                    }
                    if( state.event.detail === 2){
                        zoomTo( node.fullPosition.x, node.fullPosition.y, node.fullPosition.x2, node.fullPosition.y2)
                    }
                }
            }else{
                if( state.event.target.nodeName === "svg" || state.event.target === targetRef.current){
                    window.getSelection().removeAllRanges()
                    if( state.event.detail === 2){
                        zoomTo( 0, 0, data.nodes[0].size.width, data.nodes[0].size.height)
                    }
                }
            }
        },
        onWheel: (state) => {
            if( !state.ctrlKey ){
                const [translateX, translateY, initialScale] = restoreState(ref)

                const x = translateX - ((state.delta[0] ) * 3)
                const y = translateY - ((state.delta[1] )  * 3)
                ref.current.style.transform = `translate(${x}px,${y}px) scale(${initialScale})`
                state.event.preventDefault()
                updateForZoom( x, y, initialScale )
            }
        },
        onPinch: (state) => {
            state.event.preventDefault()
            let memo = state.memo
            const ox = state.origin[0]
            const oy = state.origin[1]

            if (state.first) {
                const [translateX, translateY, initialScale] = restoreState(ref)

                const { width, height, x, y } = ref.current.getBoundingClientRect()
                const tx = ox - (x + width / 2)
                const ty = oy - (y + height / 2)
                memo = [translateX, translateY, tx, ty, initialScale]
            }
            const ms = state.offset[0] / memo[4]
            const x = memo[0] - (ms - 1) * memo[2]
            const y = memo[1] - (ms - 1) * memo[3]


            const thisScale = memo[4] * ms

            ref.current.style.transform = `translate(${x}px,${y}px) scale(${thisScale})`
            setScale(thisScale)
            updateForZoom( x, y, thisScale )

            return memo
        }
    }, {
            target: targetRef,
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
                from: ()=>[scale,scale],
                scaleBounds: { min: 0.03, max: 500 },
            },
        }
    )

    const renderNodes = ( parent, target, depth = 1 )=>{
        parent.renderChildren = true

        parent.children.forEach((node, idx)=>{
            node.rendered = true
            let g = target.querySelector(`g[id='${node.id}']`)
            if( !g ){
                const main = `<foreignObject width='100' height='100' id='${node.id}' ><div id=${node.id} style='width:${(node.span * columnWidth) + ((node.span - 1) * spacing)}px;' class='pcard h-fit bg-white border rounded-lg'><p style='transform-origin:top left;padding:${textPadding};background:transparent'>${node.text}</p></div></foreignObject>`
                g = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                g.setAttribute("id", node.id)
                g.innerHTML = main
                target.appendChild(g)
            }

            node.frame = g.childNodes[0]
            node.element = node.frame.childNodes[0]
            node.parentElement = g
            node.textElement = node.element.childNodes[0]
            node.frame.classList.add('shadow-md', 'rounded-lg')

            node.size = {width: node.element.offsetWidth, height: node.element.offsetHeight}
            if( node.tag ){
                node.element.style.background = "yellow"
            }

            if( node.children ){

                const nest = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                nest.setAttribute("nest", node.id)
                nest.innerHTML = "<g id='innernest' style='transform-box:fill-box;transform-origin:center bottom'></g>"
                g.appendChild(nest)
                
                node.nest = nest
                node.innernest = node.nest.childNodes[0]
                
                if( depth > 0){
                    renderNodes( node, node.innernest, depth - 1)
                    
                }
            }
        })
    }

    return (
    <div
    ref={targetRef}
        className="w-full h-full bg-white overflow-hidden touch-none "
        >
        <svg
        style={{background:'white', userSelect: "none"}}
        
        ref={ref}
        >
            <g
                style={{transformOrigin: 'center'}}
            >
            </g>


        </svg>
    </div>)
}