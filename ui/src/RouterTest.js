import { useLayoutEffect, useMemo, useReducer, useRef,useState } from "react";
import { OrthogonalConnector } from "./router";


let move = "shape1"
let wasDrag = false

export default function RouterTest(){
    const ref = useRef()
    const [update, setUpdate] = useReducer((x)=>x+1,0)
    const [target, setTarget] = useState({left: 290, top: 8355})

    // Define shapes
    let shapes = []
    for(let idx = 0; idx < 10; idx = idx){
        const shape = {id: `shape${idx}`, 
            left: 5 + Math.random() * 1200,  
            top: 5 + Math.random() * 1200,  
            width: 30, 
            height: 30}
        const clash = shapes.find(d=>{
            return ((d.left+d.width) > shape.left &&  d.left < (shape.left+shape.width) && (d.top + d.height) > shape.top && d.top < (shape.top + shape.height))
        })
        if( !clash){
            idx++
            shapes.push(shape)
        }
    }


    shapes = shapes.map(d=>({...d, left: Math.round(d.left), top: Math.round(d.top)}))
    // Get the connector path
    const router = useMemo(()=>{
        return new OrthogonalConnector({
            shapes,
            shapeMargin: 10,
            globalBoundsMargin: 10,
            globalBounds: {left: 0, top: 0, width: 1500, height: 1500},
        })
    }, [])

    const staticRoutes = useMemo(()=>{

        const routes = [
            {
                //pointA: {shape: shapes.find(d=>d.id === "shape0"), side: ['bottom', 'right','top','left'], distance: 0.5},
                //pointB: {shape: shapes.find(d=>d.id === "shape1"), side: ['bottom','right','top','left'],  distance: 0.5}
                pointA: {shape: shapes.find(d=>d.id === "shape0"), side: ['right'], distance: 0.5},
                pointB: {shape: shapes.find(d=>d.id === "shape1"), side: ['left'],  distance: 0.5}
            }
        ]
        while(routes.length < 3){
            const start = Math.floor(Math.random() * shapes.length)
            const end = Math.floor(Math.random() * shapes.length)
            if( start !== end && start >1 && end > 1){
                console.log(start + " ---> " + end)
                routes.push(
                    {
                        pointA: {shape: shapes.find(d=>d.id === `shape${start}`), side: 'bottom', distance: 0.5},
                        //pointB: {shape: shapes.find(d=>d.id === `shape${end}`), side: ['bottom','right','top','left'],  distance: 0.5}
                        pointB: {shape: shapes.find(d=>d.id === `shape${end}`), side: ['bottom'],  distance: 0.5}
                    }
                )
            }
        }
        OrthogonalConnector.route(routes, router);

    },[])



    
    // Draw shapes and path
    useLayoutEffect(()=>{
        if( ref.current){
            render()
        } 
    }, [ref.current])
    function render(){
        if( !ref.current){
            return 
        }
    const paths = router.paths()
    
            const context = ref.current.getContext('2d');

            context.fillStyle = "white"

            context.fillRect(0, 0, 1400, 1400);


            context.strokeStyle ="#e2e2e2"

            for(const d of router.byproduct.connections){
                context.beginPath();
                context.moveTo(d.a.x, d.a.y)
                context.lineTo(d.b.x, d.b.y)
                context.stroke();

            }
            
            context.strokeStyle ="#f0f0f0"
            for(const d of router.byproduct.vRulers){
                    context.strokeRect(d, 0, 1, 1500);

            }
            for(const d of router.byproduct.spots){
                context.fillStyle = ["#eaaaee", "red", "blue", "green"][ d.mid ?? 0]
                    context.fillRect(d.x - 1, d.y - 2, 2, 2);

            }
            /*
            for(const d of router.byproduct.grid){
                context.strokeRect(d.left, d.top, d.width, d.height);
            }*/

            
            context.strokeStyle ="red"
            
            // Draw shapes
            for(const d of Object.values(router.shapes ?? {})){
                if( d.id === "shape0"){
                    context.fillStyle = "green"
                    context.fillRect(d.left, d.top, d.width, d.height);
                }
                if( d.id === move){
                    context.fillStyle = "blue"
                    context.fillRect(d.left, d.top, d.width, d.height);
                }
                context.strokeRect(d.left, d.top, d.width, d.height);
            }
            
            // Draw path
            
            for(const path of paths){
                if( path.length > 0 ){
                    let idx = 0
                    context.beginPath();
                    for(const p of path ){
                        if( idx === 0){
                            context.moveTo(p?.x, p?.y)
                        }else{
                            context.lineTo(p?.x, p?.y)
                        }
                        idx++
                    }
                    context.stroke();
                }
            }

        }

    let anim


    const handleClick = (event) => {
        if( wasDrag ){
            wasDrag = false
            return 
        }
        if(event.shiftKey){
            setUpdate()
            render()
            return
        }

        const rect = event.target.getClientRects()[0]
        //setTarget({left: event.pageX - rect.x, top: event.pageY - rect.y})
        const left = event.pageX - rect.x
        const top = event.pageY - rect.y

        const inShape = Object.values(router.shapes ?? {}).find(d=>left >= d.left && left < (d.left + 30) && top >= d.top && (top < (d.top + 30)))
        
        if( inShape ){
            //router.removeShape( inShape)
            move = inShape.id
        }else{
            router.addShape({
                id: `s${left}-${top}`,
                left,
                top,
                width: 30,
                height: 30
            })
        }
        
        render()
    }
    const handleMove = (event) => {
        if( event.buttons> 0 ){
            wasDrag = true
            if( !anim ){
                const rect = event.target.getClientRects()[0]
                //setTarget({left: event.pageX - rect.x, top: event.pageY - rect.y})
                const left = event.pageX - rect.x
                const top = event.pageY - rect.y
                router.moveShape(move, {
                    left,
                    top,
                })
                
                anim = requestAnimationFrame(()=>{
                    console.time("route")
                    OrthogonalConnector.route(undefined, router);
                    console.timeEnd("route")
                    render()
                    anim = undefined
                })
            }
        }
      };

    //console.log(shapes)
    /*setTimeout(()=>{
        console.log(update)
        setUpdate()
    }, 10000)*/

    return <canvas 
        ref={ref}
        onMouseMove={handleMove}
        onClick={handleClick}
        width={1400}
        height={1400}
        style={{width:"1400px",height:"1400px"}}
        >

    </canvas>

}