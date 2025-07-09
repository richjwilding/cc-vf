import { useLayoutEffect, useRef } from "react"
import { Layer, Stage, Text } from "react-konva"
import { finalizeImages, RenderPrimitiveAsKonva } from "./RenderHelpers"

export function KonvaPrimitive({primitive, ...props}){
    const stageRef = useRef()

    useLayoutEffect(()=>{
        if( stageRef.current){
            const items = RenderPrimitiveAsKonva(primitive, {
                    width: props.width,
                imageCallback: (d)=>{
                    d.refreshCache()
                    d.draw()
                }
            })
            if( items ){

                let scale = 0.8
                stageRef.current.scale({x: scale, y: scale})
                stageRef.current.children[0].add(items)
                stageRef.current.width( items.width() * scale)
                stageRef.current.height( items.height() * scale )
                
                setTimeout(()=>{
                    finalizeImages(items)
                }, 200)
            }
        }
    }, [stageRef.current])
    
    function clickHandler(){
        const url = primitive.referenceParameters.url
        if( url ){
            window.open(url, '_blank');
        }
    }

    return <Stage 
                onClick={clickHandler}
                ref={stageRef} width={300} height={300} className="inline-flex rounded-lg border m-2 p-2 hover:shadow-md transform transition-transform duration-100 ease-out-back hover:-translate-y-1 hover:border-gray-300">
                    <Layer
                        perfectDrawEnabled={false}
                        listening={false}
                        >
                    </Layer>
                </Stage>

}


//imageCallback: processImageCallback