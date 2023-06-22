const PrimitiveConfig = {
    "metadata":{
        "hypothesis": {
            icon: "LightBulbIcon",
            title: "Hypothesis"
        }
    },
    typeConfig:{
        "prompt": {
            allowedParents:["question"],
            needParent:true,
            needCategory:true,
        },
        "assessment": {
            allowedParents: ["venture"],
            needParent:true,
            needCategory:true,
        },
    },
    types: ["hypothesis", "learning","activity","result","experiment","question", "evidence", "prompt","venture","assessment", "entity", "category", "segment"],
    stateInfo:{
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