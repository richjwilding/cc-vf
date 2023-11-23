import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useGesture } from "@use-gesture/react"
import MainStore from "./MainStore"
import { animate, distance } from "framer-motion"
import useResizeObserver from '@react-hook/resize-observer';
import { text } from "@fortawesome/fontawesome-svg-core";
import SegmentCard from "./SegmentCard";
import { CursorArrowRaysIcon } from "@heroicons/react/24/outline";
import Panel from "./Panel";
import PrimitivePicker from "./PrimitivePicker";

const bgColors = [
    "#fffbeb", // yellow-50
    "#f0fdf4", // green-50
    "#ebf8ff", // blue-50
    "#e0e7ff", // indigo-50
    "#f5f3ff", // purple-50
    "#fdf2f8", // pink-50
    "#fff7ed", // orange-50
    "#e6fffa", // teal-50
    "#ecfeff", // cyan-50
    "#ebf8ff", // light-blue-50
    "#f7fee7", // lime-50
    "#fffbeb", // amber-50
    "#fdf4ff", // fuchsia-50
    "#f9fafb", // gray-50
    "#fef2f2", // red-50
  ];

  const viewbox = [-500,-350,1000,700]

function generateArcPath(innerRadius, outerRadius, startRadians, endRadians) {
    
    const startX = innerRadius * Math.cos(startRadians);
    const startY = innerRadius * Math.sin(startRadians);
    
    const endX = innerRadius * Math.cos(endRadians);
    const endY = innerRadius * Math.sin(endRadians);
    
    const largeArcFlag = endRadians - startRadians > Math.PI ? 1 : 0;
    
    const path = `M ${startX} ${startY} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${endX} ${endY} L ${outerRadius * Math.cos(endRadians)} ${outerRadius * Math.sin(endRadians)} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerRadius * Math.cos(startRadians)} ${outerRadius * Math.sin(startRadians)} Z`;
    
    return path;
}

export default function ProximityView({primitive, target,...props}){
    const viewport = useRef()
    const ref = useRef()
    const targetRef = useRef()
    const sizer = useRef()
    const sizerDesc = useRef()
    const [scale, setScale] = useState(1)
    const [showPicker, setShowPicker] = useState()
    const [distances, setDistances] = useState(undefined)
    const [distanceIds, setDistanceIds] = useState(undefined)
    const myState = useRef({})
    const columnWidth = props.columnWidth || 75
    const itemSize = 40
    const iconSize = itemSize - 4

    

    const [focus, setFocus] = useState(target)

    useEffect(()=>{
        if( distanceIds ){
            console.log('FETCH DISTACNE')
            console.log(distanceIds)
            fetch(
                `/api/primitive/${focus.id}/getDistances`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ids: distanceIds })
                }).then(response => response.json()).then((data)=>{
                console.log('BACK')
                console.log(data)
                if( data.success ){
                    console.log(data.distances)
                    setDistances( data.distances.reduce((a,c)=>{a[c.id] = c.distance; return a}, {}) )
                }
            })
        }
    }, [distanceIds])

    const data = useMemo(()=>{
        if( !focus ){return }
        let nodes = [{primitive: focus, id: focus.id}]
        const orbits = [{id: 0, sets:[ {items: [nodes[0]]} ]}]
        nodes[0].orbit = orbits[0]

        const targetSegment = primitive.primitives.descendants.find((d)=>d.type === "segment" && d.primitives.includes(focus.id))
        if( targetSegment){
            console.log(targetSegment)
            
            const orbit = {id:1, sets: []} 
            const thisLayer = targetSegment.nestedItems.filter((d,id)=>d.id !== focus.id).map((d,idx)=>{return {id:d.id,order: idx, primitive:d, orbit: orbit, segmentIdx: 0}}) 
            orbit.sets.push({items: thisLayer, segment: targetSegment, orbit: orbit})
            orbits.push(orbit)
            
            nodes = nodes.concat( thisLayer )

            const outerOrbit = {id: 2 }
            const parent = targetSegment.origin
            outerOrbit.sets = parent.primitives.allSegment.filter((d)=>d.id != targetSegment.id).map((d, idx)=>{
                const segment = {id: idx, segment: d, orbit: outerOrbit}
                const thisLayer = d.nestedItems.map((d,idx)=>{return {id:d.id,order: idx, primitive:d, orbit: outerOrbit, segmentIdx: idx}}) 
                nodes = nodes.concat( thisLayer )
                segment.items = thisLayer
                return segment
            })
            if( outerOrbit.sets.length > 0){
                orbits.push(outerOrbit)
            }
        }
        
        if( !distanceIds ){
            setDistanceIds(nodes.map((d)=>d.primitive.id))
            return undefined
        }
        if( !distances ){return }


        orbits.forEach((orbit)=>{
            orbit.distances = orbit.sets.map((d)=>d.items).flat().map((d)=>distances[d.id])//.map((d)=>Math.abs(d))
            orbit.distanceMin = Math.min(...orbit.distances)
            orbit.distanceMax = Math.max(...orbit.distances)
            orbit.distanceMid = (orbit.distanceMax + orbit.distanceMin) /2
            orbit.distanceWidth = (orbit.distanceMax - orbit.distanceMin) / 2

        })
        const sumDistance = orbits.reduce((a,c)=>a+c.distanceWidth,0)

        const margin = 5
        const thetaMargin = 1 / 180 * Math.PI
        const targetRadius = 250
        
        let adj = 0
        orbits.forEach((orbit,idx)=>{
            if( orbit.distances.length > 0){
                if( idx === 0){
                    orbit.proportion = 60 / targetRadius
                }else{
                    const t = (1 - orbits[0].proportion - adj) / sumDistance * orbit.distanceWidth 
                    orbit.proportion = Math.max(t, 0.2)
                    adj += (orbit.proportion - t)
                    orbit.proportion = (1 - orbits[0].proportion)/2
                }
            }
        })

        let startR = 0
        orbits.forEach((orbit)=>{
            if( orbit.distances.length > 0){
                orbit.startR = startR
                orbit.endR = startR + (orbit.proportion * targetRadius)
                orbit.usableR = (orbit.endR - orbit.startR ) /2
                startR = orbit.endR + margin
            }
        })
        const layoutOrbits = (count = 15)=>{

            nodes.forEach((node)=>{            
                if( node.orbit.id === 0){
                    node.r = 0
                }else if( node.orbit.id === 1){
                    const delta = node.orbit.distanceWidth > 0 ? ((distances[node.id] - node.orbit.distanceMid) / node.orbit.distanceWidth * (node.orbit.usableR / 2)) : 0
                    node.r = ((node.orbit.startR + node.orbit.endR) / 2) + delta
                }else{
                    const mod = Math.max(node.orbit.usableR / itemSize,1)
                    node.r = (node.order % mod) * (itemSize * 1.05) + node.orbit.startR + ((itemSize / 2) * 1.05)  
                }
            })
            
            
            orbits.forEach((orbit, orbitIdx)=>{
                const total = orbit.sets.map((d)=>Math.max(5,d.items.length)).reduce((a,c)=>a+c,0) 
                let startTheta = 0
                const singleSet = orbit.sets.length == 1
                orbit.sets.forEach((set)=>{
                    set.startTheta = startTheta 
                    set.endTheta = startTheta + (Math.max(5,set.items.length) / total * Math.PI * 2) - thetaMargin
                    set.midTheta = (set.endTheta + set.startTheta) / 2
                    
                    set.items.forEach((item, idx)=>{
                        const thisMargin =  Math.atan( itemSize / 2 / item.r)// + (thetaMargin * 2)
                        const denom = singleSet ? set.items.length : (set.items.length > 1 ? set.items.length - 1 : 1)
                        const span = (set.endTheta - set.startTheta - thisMargin - thisMargin)/ denom

                        item.pos = idx / total 
                        const theta = set.startTheta + span + (idx * span) 
                        
                        item.x = item.r * Math.cos( theta )  
                        item.y = item.r * Math.sin( theta )  
                    })
                    startTheta = set.endTheta + thetaMargin
                })
            })
            
            let orbitsWithOverlappingNodes = orbits.filter((orbit,orbitIdx)=>{
                return orbit.sets.filter((segment)=>{
                    return  segment.items.filter((node)=>{
                        return segment.items.filter((d)=>{
                            if( d.id === node.id){return false}
                            const dx = d.x - node.x 
                            const dy = d.y - node.y
                            return Math.sqrt( (dx * dx) + (dy * dy)) < itemSize
                        }).length > 0
                    }).length > 0
                }).length >0
            })
            if( orbitsWithOverlappingNodes.length > 0 && (count > 0)){
                orbitsWithOverlappingNodes.forEach((adjusting)=>{
                    let delta = 0
                    orbits.forEach((orbit)=>{
                        if( adjusting.id === orbit.id ){
                            delta = (orbit.endR - orbit.startR) * 0.1
                            console.log(`Expanding by ${delta}`)
                            orbit.endR += delta
                            orbit.usableR += delta
                        }else if( adjusting.id < orbit.id){
                            orbit.startR += delta
                            orbit.endR += delta
                        }
                    })
                })
                layoutOrbits(count - 1)

            }

        }
        layoutOrbits()





        return {orbits: orbits, nodes: nodes}

    },[primitive.id, Object.keys(distances || {}).join("-"), focus?.id])

    useResizeObserver(targetRef, (data)=>{
        viewport.current = {
                ...viewport.current,
                width: data.contentRect.width,
                height: data.contentRect.height,
            }
        var transformString = window.getComputedStyle(ref.current).getPropertyValue('transform');
        var transformMatrix = transformString === "none" ? [1,0,0,0,0,0] : transformString.match(/^matrix\((.+)\)$/)[1].split(',').map(parseFloat);
        //updateForZoom(transformMatrix[4], transformMatrix[5], transformMatrix[0])
    })

    /*useEffect(()=>{
        return ()=>{
            if( myState.current.callbackId ){
                console.log("DEREGISTER")
                MainStore().deregisterCallback( myState.current.callbackId )
            }
        }
    }, [])*/

    console.log(data)

    const renderNodes = ()=>{
        const target = ref.current.querySelector('g')
        for( const el of target.querySelectorAll('.manual')){
            target.removeChild(el)
        }
        for(const node of data.nodes ){
            const g = document.createElementNS("http://www.w3.org/2000/svg", 'g');
            g.setAttribute("id", node.id)
            g.classList.add('manual')
            target.appendChild(g)

            /*const text = document.createElementNS("http://www.w3.org/2000/svg", 'text');
            text.setAttribute("id", node.id)
            text.setAttribute("text-anchor", "middle")
            text.setAttribute("alignment-baseline","middle")
            text.setAttribute("x", node.x )
            text.setAttribute("y", node.x )
            text.textContent = node.primitive.title*/
            const isFocus = node.id === focus.id

            const circle = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
            if( !isFocus ){
                circle.setAttribute("id", node.id)
                circle.setAttribute("cx", node.x )
                circle.setAttribute("cy", node.y )
                circle.setAttribute("r", (node.id === focus.id ? itemSize * 2 : itemSize) / 2 )
                circle.setAttribute("fill", "white" )
                circle.setAttribute("stroke", "#e5e7eb" )
                circle.setAttribute("stroke-width", 1 )
                g.appendChild( circle )
            }


            const size = node.id === focus.id ? iconSize * 2 : iconSize
            const text = document.createElementNS("http://www.w3.org/2000/svg", 'image');
            text.setAttribute("id", node.id)
            text.setAttribute("x", node.x - (size / 2))
            text.setAttribute("y", node.y - (size / 2))
            text.setAttribute("width", size)
            text.setAttribute("height", size )

            text.setAttribute("preserveAspectRatio", "xMidYMid meet" )
            text.setAttribute("href", `/api/image/${node.id}` )

            text.addEventListener('mouseenter', ()=>{circle.setAttribute('stroke-width' , 1.5);circle.setAttribute("stroke", "#2c55ff" )})
            text.addEventListener('mouseleave', ()=>{circle.setAttribute('stroke-width' , 1);circle.setAttribute("stroke", "#e5e7eb" )})

            if( isFocus ){
                text.addEventListener('click', ()=>{setShowPicker(true)})
            }else{
                text.addEventListener('click', ()=>{setDistanceIds(null);setFocus(node.primitive)})
                text.setAttribute("clip-path", "url(#circleCrop)")
            }
            text.textContent = node.primitive.title

            g.appendChild( text )
        }

    }
    
    useLayoutEffect(()=>{
        const fullWidth = targetRef.current.offsetWidth
        const fullHeight = targetRef.current.offsetHeight
        ref.current.setAttribute("width", fullWidth )
        ref.current.setAttribute("height", fullHeight)
        if( data ){
            const lastOrbit = data.orbits[data.orbits.length - 1]
            const offsetX = lastOrbit.endR * 1.2
            const scale = 0.75
            renderNodes()
            
            const target = ref.current.querySelector('g')

            const segments = data.orbits.map((d)=>d.sets).flat().filter((d)=>d.items.length > 0).reduce((a,d)=>{if(d.segment){a[d.segment.id] = d}; return a},{})
            ref.current.querySelectorAll('foreignObject').forEach((d, idx)=>{
                const width = d.childNodes[0].offsetWidth
                const height = d.childNodes[0].offsetHeight
                
                d.setAttribute('width', width +2)
                d.setAttribute('height', height +2)
                d.childNodes[0].style.border = `1px solid #444`
                
                const thisSegment = segments[d.id]
                if(thisSegment){
                    const tx = thisSegment.orbit.endR * Math.cos(thisSegment.midTheta)
                    const ty = thisSegment.orbit.endR * Math.sin(thisSegment.midTheta)
                    const side = tx <= 0

                    const mx = (lastOrbit.endR * 1.15) * Math.cos(thisSegment.midTheta)
                    const my = (lastOrbit.endR * 1.15) * Math.sin(thisSegment.midTheta)
                    
                    const fx = side ? -offsetX - (width * scale) : offsetX
                    const fy = my -  (height / 4) 
                    const nx =  side ? fx + 1 + (width * scale):  fx 

                    thisSegment.position = {
                        side: side,
                        fx: fx,
                        fy: fy,
                        fx2: fx + (width * scale),
                        fy2: fy + (height * scale),
                        height: (height * scale),
                        width: (width * scale),
                        nx: nx,
                        mx: mx,
                        my: my,
                        tx: tx,
                        ty: ty}
                }
            })
            const findOverlaps = () =>{
                return Object.values(segments).map((d)=>{
                    const sameSide = Object.values(segments).filter((d2)=>d.position && d2.position && d.segment.id !== d2.segment.id && d.position.side === d2.position.side)
                    const overlap = sameSide.filter((d2)=>d2.position.fy < d.position.fy2 && d2.position.fy > d.position.fy)
                    return overlap.length > 0 ? {target: d, overlaps: overlap} : undefined
                }).filter((d)=>d)
            }
            let iters = 20
            let overlaps = findOverlaps()
            while(overlaps.length > 0 && ((iters--) > 0)){
                console.log(`overlap = ${overlaps.length}`)
                overlaps.forEach((d)=>{
                    d.overlaps.forEach((candidate)=>{
                        const delta = d.target.position.fy2 - candidate.position.fy + 10
                        candidate.position.fy += delta
                        candidate.position.fy2 += delta
                        candidate.position.my += delta

                        candidate.midTheta += (20 /180 * Math.PI) * (candidate.position.side ? - 1 : 1)
                    
                    
                        candidate.position.tx = candidate.orbit.endR * Math.cos(candidate.midTheta)
                        candidate.position.ty = candidate.orbit.endR * Math.sin(candidate.midTheta)
                        candidate.position.mx = (lastOrbit.endR * 1.15) * Math.cos(candidate.midTheta)                    
                        candidate.position.my = (lastOrbit.endR * 1.15) * Math.sin(candidate.midTheta)


                    })
                })
                overlaps = findOverlaps()
            }
            
            ref.current.querySelectorAll('foreignObject').forEach((d, idx)=>{
                const thisSegment = segments[d.id]

                    d.setAttribute('transform', `translate(${thisSegment.position.fx},${thisSegment.position.fy}) scale(${scale})`)
                    
                    //const angle = Math.atan2(ny,nx)
                    


                    const path = document.createElementNS("http://www.w3.org/2000/svg", 'path');
                    path.setAttribute("stroke", "#444" )
                    path.setAttribute("stroke-width", 1 )
                    path.setAttribute("fill", "none" )
                    path.setAttribute("d", `M${thisSegment.position.nx}, ${thisSegment.position.my} L ${thisSegment.position.mx}, ${thisSegment.position.my} L ${thisSegment.position.tx},${thisSegment.position.ty}` )

                    path.classList.add('manual')
                    target.appendChild( path )
                
            })
            const minX = Object.values(segments).reduce((a,c)=>Math.min(a, c.position.fx), -offsetX)
            const maxX = Object.values(segments).reduce((a,c)=>Math.max(a, c.position.fx2), offsetX)
            const minY = Object.values(segments).reduce((a,c)=>Math.min(a, c.position.fy), -offsetX)
            const maxY = Object.values(segments).reduce((a,c)=>Math.max(a, c.position.fy2), offsetX)
            ref.current.setAttribute('viewBox', `${minX - 10} ${minY - 10}  ${maxX - minX + 20} ${maxY - minY + 20}`)
        }

    }, [data])


    
    let colorIdx = 0


    return (
        <>
        {showPicker && <PrimitivePicker list={primitive.nestedItems} callback={(p)=>{setShowPicker(null);setDistanceIds(null);setFocus(p)}} setOpen={setShowPicker} />}
        <div
            ref={targetRef}
            className="w-full h-full bg-white overflow-hidden touch-none relative "
        >
        <svg
        style={{background:'#eee', userSelect: "none"}}
        viewBox={viewbox.join()} 
        ref={ref}
        >
        <defs>
            <clipPath id="circleCrop" clipPathUnits="objectBoundingBox">
                <circle cx="0.5" cy="0.5" r={0.5} />
            </clipPath>
        </defs>
            <g
                style={{transformOrigin: 'center'}}
            >
                {data?.orbits && data.orbits.map((orbit, idx)=>{
                    if(orbit.distances.length > 0){
                        if( orbit.sets.length > 1 ){
                            return orbit.sets.map((s,idx)=>{
                                colorIdx++
                                return <path fill={bgColors[colorIdx - 1]} fillOpacity={0.5} stroke='#e5e7eb' d={generateArcPath(orbit.startR, orbit.endR, s.startTheta, s.endTheta)}/>
                            })
                        }
                        colorIdx++
                        return <>
                        <path fill={idx === 0 ? "white" : bgColors[colorIdx - 1]} fillOpacity={0.5} stroke='none' d={generateArcPath(orbit.startR, orbit.endR, 0, Math.PI * 2)}/>
                        <circle stroke='#e5e7eb' fill='none'  cx='0' cy='0' r={orbit.startR}/>
                        <circle stroke='#e5e7eb' fill='none' cx='0' cy='0' r={orbit.endR}/>
                    </>
                    }
                })}
                {!focus && <foreignObject width='100' height='100' className="p-4 -translate-y-4 -translate-x-4"><Panel.MenuButton title={<CursorArrowRaysIcon className="w-10 h-10 " strokeWidth={1}/>} onClick={()=>setShowPicker(true)} className="!w-14 !h-14 place-items-center !rounded-full !p-2"/></foreignObject>}
                {data?.orbits && data.orbits.map((orbit)=>orbit.sets.map((d)=>d.items.length > 0 ? d.segment : undefined)).flat().filter((d)=>d).map((d)=>(
                    <>
                        {d && <foreignObject id={d.id} width='100' height='200'>
                            <SegmentCard primitive={d} hideGrid showDetails/>
                        </foreignObject>}
                    </>
                ))}
            </g>
            
            


        </svg>
    </div>
    </>
    )
}