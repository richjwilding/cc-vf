const PrimitiveConfig = {
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
            allowedParents:["activity","experiment"],
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
    },
    types: ["hypothesis", "learning","activity","result","experiment","question", "evidence", "prompt","venture","assessment", "entity", "category", "segment", "view", "search","detail","query"],
    pageview:{
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
    }
}
export default PrimitiveConfig