import CollectionUtils from "./CollectionHelper"
import MainStore from "./MainStore"
import { deepEqualIgnoreOrder } from "./SharedTransforms"


function mapChart( chart ){
    const KIND_MAP ={
        "pie": {
            type: "distribution",
            style: "pie",
            size: "size",
            show_legend: true
        },
        "bar": {
            type: "distribution",
            style: "bar",
            show_legend: true,
            size: "size"
        },
        "heatmap": {
            type: "heatmap",
            size: "scale"
        },
        "bubble": {
            type: "heatmap",
            size: "scale",
            bubble: true,
            counts: "number"
        },
    }
    const kind = chart?.kind ?? "bar"
    const config = KIND_MAP[kind]

    config.primary_axis = {}

    if( chart.top_n){
        config.primary_axis.limit = chart.top_n
    }       
    if( chart.sort_by){
        config.primary_axis.sort = chart.sort_by
    }       

    return config

}

export function ConvertVisualizationSpec( spec, defs ){
    return ConvertVisualizationSpecToView( spec, defs )
}
export function ConvertVisualizationSpecToView( spec, defs ){

  /*
  {
    "wellness_journey": {
        "categorization_id": "6894d0a1962e3fbef7a2205c",
        "title": "Wellness journey"
    },
    "why_thorne": {
        "categorization_id": "6893deda95ec258cb9d868b4",
        "title": "Why thorne"
    }
}

  {
    "id": 1,
    "sourceId": "689f8a98ec2030de97ccf49b",
    "type": "visualization",
    "pre_filter": "Limit to posts that mention Thorne (possibly/likely/clearly).",
    "axis_1": {
        "definition": {
            "$ref": "categorizations.wellness_journey"
        }
    },
    "axis_2": {
        "definition": {
            "$ref": "categorizations.why_thorne"
        }
    },
    "visualization": "Heatmap showing which purchase reasons map to which user wellness goals.",
    "chart": {
        "kind": "heatmap",
        "value": {
            "agg": "count"
        },
        "palette": "heat",
        "labels": false
    },
    "overview": "Heatmap mapping wellness goals (e.g., Immune Support, Gut Health) to explicit purchase reasons, highlighting strong alignments and gaps."
}
    */

    function convertAxis( axisDef ){
        let filter = [null]
        const baseDef = axisDef.definition ?? axisDef
        if( baseDef){
            let def = baseDef
            if( baseDef.$ref){
                def = defs.categorizations?.[baseDef.$ref.replace("categorizations.", "")]
            }
            if( def.categorization_id){
                return {
                    type: "category",
                    primitiveId: def.categorization_id,
                    filter
                }
            }else if( def.parameter){

                const pC = {
                    type: "parameter",
                    parameter: def.parameter,
                    filter
                }

                const match = meta.find(d=>d.parameters?.[def.parameter]?.axisType)
                if( match){
                        pC.passType = match.parameters[def.parameter].axisType
                        pC.axisData = match.parameters[def.parameter].axisData
                }
                return pC
            }
        }
    }
    
    const {type, primary_axis, ...renderOptions} = mapChart( spec.chart )
    const mainstore = MainStore()
    
    const items = mainstore.primitive( spec.sourceId ).itemsForProcessing
    const meta = Array.from(new Set(items.map(d=>d.referenceId))).map(d=>mainstore.category(d))

    const ignore_axis_1 = !spec.axis_1 || deepEqualIgnoreOrder(spec.axis_1?.definition,  spec.series_1) || deepEqualIgnoreOrder(spec.axis_1,  spec.series_1) || deepEqualIgnoreOrder(spec.axis_1?.definition,  spec.split_by)|| deepEqualIgnoreOrder(spec.axis_1,  spec.split_by)
    const ignore_axis_2 = !spec.axis_2 || deepEqualIgnoreOrder(spec.axis_2?.definition,  spec.series_1) || deepEqualIgnoreOrder(spec.axis_2,  spec.series_1) || deepEqualIgnoreOrder(spec.axis_2?.definition,  spec.split_by)|| deepEqualIgnoreOrder(spec.axis_2,  spec.split_by)
    

    
    const axis = [
        !ignore_axis_1 && convertAxis(spec.axis_1),
        !ignore_axis_2 && convertAxis(spec.axis_2),
        spec.series_1 && convertAxis(spec.series_1),
        spec.split_by && convertAxis(spec.split_by),
    ].filter(Boolean)
    if( axis.length === 0 && spec.chart?.color_by ){
        axis.push( convertAxis(spec.chart?.color_by) )
    }

    if( primary_axis ){
        axis[0] = {
            ...axis[0],
            ...primary_axis
        }
    }
    

    let columns = axis[0]
    let rows = axis[1]
    let viewFilters = axis.slice(2)



    if( type === "distribution"){
        if( axis.length === 1){
            columns = {type: "none", filter: []}
            rows = {type: "none", filter: []}
            viewFilters = [
                {
                    ...axis[0],
                    treatment: "allocation"
                }
            ]
        }else if( axis.length === 2){
            if( spec.chart.kind === "pie"){

                rows = {type: "none", filter: []}
                viewFilters = [
                    {
                        ...axis[1],
                        treatment: "allocation"
                    }
                ]
            }else{
                columns = {type: "none", filter: []}
                rows = {type: "none", filter: []}
                viewFilters = [
                    {
                        ...axis[0],
                        treatment: "allocation"
                    },
                    {
                        ...axis[1],
                        treatment: "allocation"
                    }
                ]
            }
        }
    }

    const alreadyFiltered = false
    const hideNull = true


    const table = CollectionUtils.createDataTable( items, {columns, rows, viewFilters, alreadyFiltered, hideNull})
    console.log(table)
    
    return {
        id: spec.id - 1,
        viewConfig: {matrixType: type},
        renderOptions,
        data: table,
        config: {
            columns,
            rows,
            viewFilters
        }
    }

    
}
window.spec2view = ConvertVisualizationSpecToView