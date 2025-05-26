import { useLayoutEffect, useMemo, useRef, useState } from "react"
import MainStore from "./MainStore"
import CollectionUtils from "./CollectionHelper"
import { finalizeImages, renderMatrix } from "./RenderHelpers"
import { Layer, Stage } from "react-konva"
import clsx from "clsx"
import { isObjectId } from "./SharedTransforms"


export function VisualizationPreview({source, title, layout, filters, x_axis, y_axis, palette, ...props}){
    const konvaObject = useMemo(()=>{
        layout = layout.toLowerCase()
        const sourcePrimitive = MainStore().primitive( source )
        if( sourcePrimitive ){

            const items = sourcePrimitive.itemsForProcessing

            const imageCallback = (d)=>{
                            d.refreshCache()
                            d.draw()
            }
            
            function convertAxis(def){
                let axis = {type: "none", filter: []}
                if( def ){
                    const field = def.field ?? def.parameter ?? def.category
                    if( def.type === "category" || isObjectId(field) ){
                        axis = {
                            type: "category", 
                            primitiveId: field
                        }
                    }else{
                        axis = {
                            type: "parameter", 
                            parameter: field
                        }
                        if( def.values ?? def.value){
                            axis.invert = true
                            axis.filter = def.values ?? def.value
                        }
                    }
                }
                return axis
                
            }
            function convertFilter(axis, extents){
                const forAxis = filters?.find(d=>d.parameter === axis.parameter)
                if( forAxis ){
                    let exclude = [], keep = []
                    let value = forAxis.value ?? forAxis.values
                    if( axis.parameter === "review_rating"){
                        value = value.map(d=>parseInt(d))
                    }
                    extents.forEach(d=>{
                        if(value.includes(d.idx) ){
                            keep.push(d)
                        }else{
                            exclude.push(d)
                        }
                    })
                    return {keep, exclude}
                }
                return {keep: extents, exclude: []}
            }
            
            let columnAxis = convertAxis( x_axis)
            let rowAxis = convertAxis( y_axis)
            
            let {data, extents} = CollectionUtils.mapCollectionByAxis( items, columnAxis, rowAxis, [], [], undefined )

            const {keep:filteredColumnExtents, exclude: columnFilter} = convertFilter( columnAxis, extents.column )
            const {keep:filteredRowExtents, exclude: rowFilter} = convertFilter( rowAxis, extents.row )
            console.log(columnFilter)
            console.log(rowFilter)

            
            let {data: filtered, columns: finalColumn, rows: finalRow} = CollectionUtils.filterCollectionAndAxis( data, [
                    {field: "column", exclude: columnFilter ?? []},
                    {field: "row", exclude: rowFilter ?? []},
                ], 
                {hideNull: false}
            )
            console.log(finalColumn)
            const selectPalette = palette ? {
                "green": "green",
                "red": "heat",
                "heat": "heat",
                "scale": "default",
                "ice": "ice_blue"
            }[palette.toLowerCase()]  : undefined
            
            let out
            if( layout === "heatmap"){
                out = renderMatrix({id: "temp"}, filtered, {
                    imageCallback,
                    axis: {column: columnAxis, row: rowAxis},
                    allocations: [],
                    columnExtents: filteredColumnExtents,
                    rowExtents: filteredRowExtents,
                    renderOptions:{
                        counts: true,
                        colors: selectPalette ?? "default"
                    },
                    viewConfig: {
                        showAsCounts: true,
                        configName: "grid"
                    }
                })

            }else {
                out = renderMatrix({id: "temp"}, filtered, {
                    imageCallback,
                    axis: {column: columnAxis, row: rowAxis},
                    allocations: [],
                    columnExtents: extents.column,
                    rowExtents: extents.row,
                    renderOptions:{
                        calcRange: true
                    },
                    viewConfig: {
                        renderType: "distribution_chart", 
                        configName: "grid"
                    }
               })                
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