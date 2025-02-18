import { useLayoutEffect, useMemo, useReducer, useRef,useState } from "react";
import { OrthogonalConnector } from "./router";

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


    const _shapes = [
        {
            "id": "shape0",
            "left": 290,
            "top": 635,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape1",
            "left": 792,
            "top": 339,
            ...target,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape2",
            "left": 252,
            "top": 835,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape3",
            "left": 76,
            "top": 1184,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape4",
            "left": 566,
            "top": 790,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape5",
            "left": 131,
            "top": 257,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape6",
            "left": 352,
            "top": 507,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape7",
            "left": 1118,
            "top": 8,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape8",
            "left": 260,
            "top": 1006,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape9",
            "left": 857,
            "top": 962,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape10",
            "left": 326,
            "top": 1069,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape11",
            "left": 816,
            "top": 407,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape12",
            "left": 907,
            "top": 71,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape13",
            "left": 654,
            "top": 462,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape14",
            "left": 18,
            "top": 770,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape15",
            "left": 273,
            "top": 968,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape16",
            "left": 780,
            "top": 1190,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape17",
            "left": 57,
            "top": 521,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape18",
            "left": 907,
            "top": 533,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape19",
            "left": 1130,
            "top": 859,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape20",
            "left": 292,
            "top": 532,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape21",
            "left": 413,
            "top": 879,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape22",
            "left": 1130,
            "top": 99,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape23",
            "left": 962,
            "top": 994,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape24",
            "left": 372,
            "top": 793,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape25",
            "left": 651,
            "top": 1033,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape26",
            "left": 936,
            "top": 599,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape27",
            "left": 282,
            "top": 891,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape28",
            "left": 969,
            "top": 1183,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape29",
            "left": 563,
            "top": 115,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape30",
            "left": 415,
            "top": 505,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape31",
            "left": 153,
            "top": 540,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape32",
            "left": 497,
            "top": 417,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape33",
            "left": 164,
            "top": 796,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape34",
            "left": 570,
            "top": 871,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape35",
            "left": 945,
            "top": 568,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape36",
            "left": 162,
            "top": 466,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape37",
            "left": 804,
            "top": 27,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape38",
            "left": 745,
            "top": 1205,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape39",
            "left": 593,
            "top": 362,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape40",
            "left": 774,
            "top": 387,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape41",
            "left": 392,
            "top": 347,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape42",
            "left": 970,
            "top": 199,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape43",
            "left": 996,
            "top": 724,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape44",
            "left": 462,
            "top": 656,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape45",
            "left": 6,
            "top": 156,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape46",
            "left": 494,
            "top": 868,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape47",
            "left": 636,
            "top": 895,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape48",
            "left": 868,
            "top": 186,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape49",
            "left": 497,
            "top": 785,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape50",
            "left": 1046,
            "top": 921,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape51",
            "left": 1158,
            "top": 931,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape52",
            "left": 750,
            "top": 471,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape53",
            "left": 791,
            "top": 131,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape54",
            "left": 389,
            "top": 381,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape55",
            "left": 608,
            "top": 596,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape56",
            "left": 767,
            "top": 704,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape57",
            "left": 1088,
            "top": 1163,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape58",
            "left": 509,
            "top": 924,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape59",
            "left": 785,
            "top": 264,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape60",
            "left": 841,
            "top": 55,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape61",
            "left": 729,
            "top": 106,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape62",
            "left": 588,
            "top": 1187,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape63",
            "left": 935,
            "top": 388,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape64",
            "left": 33,
            "top": 273,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape65",
            "left": 183,
            "top": 738,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape66",
            "left": 1115,
            "top": 682,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape67",
            "left": 1190,
            "top": 293,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape68",
            "left": 218,
            "top": 736,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape69",
            "left": 410,
            "top": 817,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape70",
            "left": 565,
            "top": 202,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape71",
            "left": 581,
            "top": 149,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape72",
            "left": 157,
            "top": 199,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape73",
            "left": 761,
            "top": 671,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape74",
            "left": 131,
            "top": 1191,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape75",
            "left": 453,
            "top": 219,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape76",
            "left": 1173,
            "top": 437,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape77",
            "left": 206,
            "top": 1071,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape78",
            "left": 112,
            "top": 624,
            "width": 30,
            "height": 30
        },
        {
            "id": "shape79",
            "left": 846,
            "top": 773,
            "width": 30,
            "height": 30
        }
    ]
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
                        pointB: {shape: shapes.find(d=>d.id === `shape${end}`), side: ['bottom','right','top','left'],  distance: 0.5}
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
            /*
            context.fillStyle ="#aaaaff"
            for(const d of router.byproduct.spots){
                    context.fillRect(d.x - 1, d.y - 2, 2, 2);

            }*/
            /*
            for(const d of router.byproduct.grid){
                context.strokeRect(d.left, d.top, d.width, d.height);
            }*/

            
            context.strokeStyle ="red"
            
            // Draw shapes
            for(const d of shapes){
                if( d.id === "shape0"){
                    context.fillStyle = "green"
                    context.fillRect(d.left, d.top, d.width, d.height);
                }
                if( d.id === "shape1"){
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
                    render()
    }
    const handleMove = (event) => {
        if( event.buttons> 0 ){
            if( !anim ){
                const rect = event.target.getClientRects()[0]
                //setTarget({left: event.pageX - rect.x, top: event.pageY - rect.y})
                const left = event.pageX - rect.x
                const top = event.pageY - rect.y
                router.moveShape("shape1", {
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