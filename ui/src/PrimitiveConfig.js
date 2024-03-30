
const PrimitiveConfig = {
    "Constants":{
    LIVE_FILTER: 103,
    CONCEPT: 92
    },
    "metadata":{
        "hypothesis": {
            icon: "LightBulbIcon",
            title: "Hypothesis"
        },
        "segment":{
            parameters:{
                "description":{
                    "title": "Description",
                    "description": "Description of segment",
                    "type":"long_string"
                },
            }
        },
        "category":{
            parameters:{
                "target":{
                    "title": "Categorize",
                    "description": "Items to categorize",
                    "type":"category_source"
                },
                "referenceId":{
                    "title": "Evidence",
                    "description": "Type of evidence",
                    "type":"categoryId",
                    "hidden": true
                },
                "field":{
                    "title": "Field",
                    "description": "Field of item to use",
                    "type":"category_field"
                },
                "theme":{
                    "title": "Categorization theme",
                    "description": "Categorization theme",
                    "optional": true,
                    "type":"string"
                }
            }
        }
    },
    typeConfig:{
        "prompt": {
            allowedParents:["question"],
            needParent:true,
            needCategory:true,
        },
        "evidence":{
            embed: ["title", "quote"]
        },
        "result":{
            embed: ["title"]
        },
        "entity":{
            embed: ["title","referenceParameters.capabilities","referenceParameters.customers","referenceParameters.offerings"]
        },
        "activity": {
            needCategory:true,
            "createAtWorkspace": true,
        },
        "category": {
            needCategory:false,
            defaultReferenceId: 54
        },
        "hypothesis": {
            needCategory:false,
            defaultReferenceId: 39
        },
        "view": {
            needParent:true,
            needCategory:false,
            defaultReferenceId: 38
        },
        "assessment": {
            allowedParents: ["venture"],
            needParent:true,
            needCategory:true,
        },
        "search": {
            needParent:true,
            needCategory:true,
        },
        "element": {
            needCategory:true,
            defaultReferenceId: 89
        },
        "concept": {
            needCategory:true,
            defaultReferenceId: 92
        },
        "board": {
            needCategory:true,
            defaultReferenceId: 102
        },
    },
    types: ["hypothesis", "learning","activity","result","experiment","question", "evidence", "prompt","venture","assessment", "entity", "category", "segment", "view", "search","detail","query", "report", "element", "reportinstance", "concept", "board"],
    pageview:{
        "board":{
            defaultWide: "board" 
        },
        "report":{
            defaultWide: "report" 
        },
        "segment":{
            evidence: false,
            viewer: true
          //  defaultWide: {type: 'result', index: 0} 
        }
    },
    sidebar:{
        "segment":{
            source: false,
            addToResult: "segment",
            addToItems: [42],
        }
    },
    stateInfo:{
        "hypothesis":{
            "open": {title: "Open", colorBase: "blue"},
            "invalid": {title: "Invalidated", colorBase: "amber"},
            "valid": {title: "Validated", colorBase: "cyan"},
        },
        "activity":{
            "open": {title: "Not started", colorBase: "blue"},
            "active": {title: "Underway", colorBase: "amber"},
            "closed": {title: "Completed", colorBase: "green"},
        },
        "experiment":{
            "open": {title: "Not started", colorBase: "blue"},
            "active": {title: "Underway", colorBase: "amber"},
            "closed": {title: "Completed", colorBase: "green"},
        },
        default: {
            "open": {title: "Open"},
            "closed": {title: "Closed"},
        }
    },
    passTypeMap: {
        "type": "origin_type",
        "options": "raw",
        "title": "raw",
        "currency": "currency",
        "funding": "funding",
        "contact": "contact",
        "boolean": "boolean",
    },
    encodeExploreFilter:(option, val, invert)=>{
        if( !val || val.length === 0){
            return undefined
        }

        if( val instanceof Object && !Array.isArray(val)){
            if( val.bucket_min !== undefined || val.bucket_max !== undefined ){
            }else{
                val = val.idx
            }
        }

        if( option?.type === "category"){
            if( val === "_N_" || (val.length === 1 && val[0] === "_N_") ){
                return {type: "not_category_level1", value: option.primitiveId, pivot: option.access, invert, sourcePrimId: option.primitiveId, relationship: option.relationship}
            }
            if( val === "_N_"){
                val = undefined
            }else if(Array.isArray(val)){
                val = val.map(d=>d === "_N_" ? undefined : d)
            }
            return {type: "parent", value: val, pivot: option.access, relationship: option.relationship, invert, sourcePrimId: option.primitiveId}
        }else if( option?.type === "question" ){
            return {type: option.type, subtype: option.subtype, map: [val].flat(), pivot: option.access, relationship: option.relationship,  invert}
        }else if( option?.type === "type"){
            return {type: option.type, subtype: option.subtype, map: [val].flat().map(d=>parseInt(d)), pivot: option.access, relationship: option.relationship, invert}
        }else if( option?.type === "title"){
            return  {type: "title", value: val, pivot: option.access, relationship: option.relationship, invert}
        }else if( option.type === "parameter"){
            if( val?.bucket_min  !== undefined ){
                return  {type: "parameter", param: option.parameter, value: {idx: val.idx, min_value: val.bucket_min, max_value: val.bucket_max}, pivot: option.access, relationship: option.relationship, invert}
            }else{
                return  {type: "parameter", param: option.parameter, value: val, pivot: option.access, relationship: option.relationship, invert}
            }
        } 
        return undefined
    }
}
export default PrimitiveConfig