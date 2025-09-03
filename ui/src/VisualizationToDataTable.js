import CollectionUtils from "./CollectionHelper"
import MainStore from "./MainStore"


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
            size: "size"
        },
        "heatmap": {
            type: "heatmap",
            size: "scale"
        },
    }
    const config = KIND_MAP[chart?.kind ?? "bar"]
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
            let def
            if( baseDef.$ref){
                def = defs.categorizations?.[baseDef.$ref.replace("categorizations.", "")]
            }
            if( def ){
                if( def.categorization_id){
                    return {
                        type: "category",
                        primitiveId: def.categorization_id,
                        filter
                    }
                }
            }
        }
    }
    
    const {type, ...renderOptions} = mapChart( spec.chart )
    
    const axis = [
        spec.axis_1 && convertAxis(spec.axis_1),
        spec.axis_2 && convertAxis(spec.axis_2),
        spec.series_1 && convertAxis(spec.series_1),
        spec.split_by && convertAxis(spec.split_by),
    ].filter(Boolean)
    if( axis.length === 0 && spec.chart?.color_by ){
        axis.push( convertAxis(spec.chart?.color_by) )
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

    const items = MainStore().primitive( spec.sourceId ).itemsForProcessing
    const alreadyFiltered = false
    const hideNull = true


    const table = CollectionUtils.createDataTable( items, {columns, rows, viewFilters, alreadyFiltered, hideNull})
    console.log(table)
    
    return {
        id: spec.id - 1,
        viewConfig: {matrixType: type},
        renderOptions,
        data: table
    }

    
}
window.spec2view = ConvertVisualizationSpecToView