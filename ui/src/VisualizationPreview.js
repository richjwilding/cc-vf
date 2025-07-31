import { useLayoutEffect, useMemo, useRef, useState } from "react"
import MainStore from "./MainStore"
import CollectionUtils from "./CollectionHelper"
import { finalizeImages, renderDatatable, renderMatrix } from "./RenderHelpers"
import { Layer, Stage } from "react-konva"
import clsx from "clsx"
import { convertVisualizationToPrimitiveConfig, isObjectId } from "./SharedTransforms"
import PrimitiveConfig from "./PrimitiveConfig"
import Konva from "konva"

function convertAxis(axis, metadata){
    if( axis ){

        const field = axis.field ?? axis.parameter ?? axis.category
        if( metadata.parameters[field]?.axisType === "custom_bracket"){
            axis.passType = "custom_bracket"
            axis.axisData = metadata.parameters[field].axisData
        }
        return axis
    }
    return {type: "none", filter: []}
}

export function VisualizationPreview({source, title, layout, filters, x_axis, y_axis, palette, ...props}){
    const konvaObject = useMemo(()=>{
        layout = layout.toLowerCase()
        let sourcePrimitive = MainStore().primitive( source )
        if( sourcePrimitive ){
            if( sourcePrimitive.flowElement ){
                sourcePrimitive = sourcePrimitive.primitives.config.allItems.find(d=>d.itemsForProcessing.length > 0)
                if( !sourcePrimitive ){
                    return new Konva.Text({text:"No data to show"})
                }
            }

            const items = sourcePrimitive.itemsForProcessing
            const metadata = items[0]?.metadata
            
            const {renderConfig, referenceParameters} = convertVisualizationToPrimitiveConfig({source, title, layout, filters, x_axis, y_axis, palette, metadata} )

            const axis = referenceParameters?.explore?.axis

            const imageCallback = (d)=>{
                            d.refreshCache()
                            d.draw()
            }
            
            let columnAxis = convertAxis( axis.column, metadata)
            let rowAxis = convertAxis( axis.row, metadata)
            let viewFilters = (referenceParameters?.explore?.filters ?? []).map(d=>convertAxis(d, metadata))

            const dataTable = CollectionUtils.createDataTable( items, {columns: columnAxis, rows: rowAxis, viewFilters, config: undefined, hideNull: true, alreadyFiltered: false})

            
            let out
            if( layout === "pie" || layout === "bar" ){
                 out = renderDatatable(
                    {
                        id: "temp",
                        data: dataTable, 
                        stageOptions: {imageCallback},
                        renderOptions:{
                            ...(renderConfig ?? {})
                        },
                        viewConfig: {
                            showAsCounts: true,
                            matrixType: "distribution",
                        }
                    }
                )
            }
            return out
        }else{
            console.log(`Cant find primitive ${source}`)
        }

    }, [source])
    const stageRef = useRef()
    const [expand, setExpand ] = useState(false)

    useLayoutEffect(()=>{
        if( stageRef.current && konvaObject){
            let targetWidth, targetHeight
            
            if( expand){
                targetWidth = window.innerWidth * 0.75
                targetHeight = window.innerHeight * 0.75
            }else{
                targetWidth = 400
                targetHeight = targetWidth / 16 * 9
            }

            const w = konvaObject.width()
            const h = konvaObject.height()
            let scale = Math.min( targetWidth / w, targetHeight / h)
            stageRef.current.scale({x: scale, y: scale})

            stageRef.current.children[0].removeChildren()
            stageRef.current.children[0].add( konvaObject )
            
            stageRef.current.width( w * scale)
            stageRef.current.height( h * scale )

            setTimeout(()=>{
                finalizeImages(konvaObject)
            }, 200)
        }
    }, [stageRef.current, konvaObject?.attrs?.id, expand])

    const visual = <Stage 
            onClick={()=>setExpand(!expand)}
            ref={stageRef} className="w-full h-full" 
            >
                <Layer
                    perfectDrawEnabled={false}
                    listening={false}
                    >
                </Layer>
            </Stage>

    return <div
            onClick={e => {
            }}
            className={expand
                ? [
                    "fixed inset-0 z-[5000] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center "
                  ].join(" ")
                : "inline-flex"
              }
        >
        <div className={expand
                ? [
                    "bg-white p-4 w-min h-min m-auto"
                  ].join(" ")
                : "inline-flex rounded-lg border m-2 p-2 hover:shadow-md \
                   transform transition-transform duration-100 ease-out-back \
                   hover:-translate-y-1 hover:border-gray-300"
              }
        >
                {visual}
        </div>
    </div>
    return <div 
            className={
                expand ? "fixed m-auto top-1/2 left-1/2  transform -translate-x-1/2 -translate-y-1/2 z-[5000] bg-white rounded-lg shadow-lg p-4" 
                        : "inline-flex rounded-lg border m-2 p-2 hover:shadow-md transform transition-transform duration-100 ease-out-back hover:-translate-y-1 hover:border-gray-300"}
            >
                {visual}
            </div>
}


/*
[ { "source": "1179276", 
    "title": "Average Review Rating per Company", 
    "layout": "bar_chart", 
    "filters": 
    [ { "field": "company_name", "values": ["Emergency Assist", "Rescuemycar.com", "Green Flag Breakdown Cover", "Start Rescue", "AA Breakdown Cover", "RAC Breakdown Cover", "LV="] } ], 
    "x_axis": { "field": "company_name" }, 
    "y_axis": { "field": "review_rating", "aggregation": "average" } 
} ]*/