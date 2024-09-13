const heatMapPalette = [
    {
        title: "Default blue",
        name:"default",
        colors:[
            "#f7fcf0",
            "#e0f3db",
            "#ccebc5",
            "#a8ddb5",
            "#7bccc4",
            "#4eb3d3",
            "#2b8cbe",
            "#0868ac",
            "#084081"
        ]
    },{
        title: "Purple",
        name: "purple",
        colors:[
            "#003f5c",
            "#2f4b7c",
            "#665191",
            "#a05195",
            "#d45087",
            "#f95d6a",
            "#ff7c43",
            "#ffa600"
        ]
    },{
        title: "Heat",
        name: "heat",
        colors:[
            "#f5f5ab",
            "#fed976",
            "#fc8c3c",
            "#f03b20",
            "#bd0026"
        ]
    }
]


const PrimitiveConfig = {
    "Constants":{
        LIVE_FILTER: 103,
        CONCEPT: 92,
        QUERY_RESULT: 82,
        GENERIC_SUMMARY: 109,
        EVALUATOR: 90,
        SCORE: 120

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
    types: ["hypothesis", "learning","activity","result","experiment","question", "evidence", "prompt","venture","assessment", "entity", "category", "segment", "view", "search","detail","query", "report", "element", "reportinstance", "concept", "board", "marketsegment", "working", "summary"],
    pageview:{
        "board":{
            defaultWide: "board" 
        },
        "report":{
            defaultWide: "report" 
        },
        "segment":{
         //   evidence: false,
          //  viewer: true
          //  defaultWide: {type: 'result', index: 0} 
        }
    },
    sidebar:{
        "segment":{
            source: false,
            addToResult: "segment",
            addToItems: [42],
        },
        "evidence":{
            showRefs: true
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
        "revenue": "currency",
        "currency": "currency",
        "marketCap": "currency",
        "previousClose": "currency",
        "fiftyDayAverage": "currency",
        "valuation": "funding",
        "employee_count": "number",
        "funding": "funding",
        "contact": "contact",
        "icon": "icon",
        "boolean": "boolean",
        "segment_filter":"segment_filter"
    },
    heatMapPalette:heatMapPalette,
    renderConfigs:{
            default: {title:"Show items",parameters: {showAsCounts:false}},
            checktable: {id: 2,title:"Truth table", renderType: "checktable",parameters: {}},
            score_dial: {id: 3,title:"Score dial", renderType: "dials",parameters: {},
                config:{
                    "colors":{
                        type: "option_list",
                        title: "Colors",
                        default: "green",
                        options: [
                            {id:"green", title: "Green"},
                            {id:"blue", title: "Blue"}
                        ]
                    },
                }
            },
            counts: {id:1, title:"Heatmap",
                config:{
                    "colors":{
                        type: "option_list",
                        title: "Colors",
                        default: "default",
                        options: heatMapPalette.map(d=>({id: d.name, title:d.title}))
                    },
                    "group_by": {
                        type: "option_list",
                        title:"Range source",
                        default: "all",
                        options: [{
                            id: "all",
                            title: "All data"
                        },{
                            id: "row",
                            title: "Rows"
                        },{
                            id: "col",
                            title: "Columns"
                        }]
                    },
                    "counts":{
                        type: "option_list",
                        title: "Show count",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    }
                },
                showAsCounts:true
            }
        },
    decodeExploreFilter:(filter)=>{
        if( !filter){
            return filter
        }
        return filter.reduce((a,c)=>{
            if( c instanceof Object ){
                a[c.idx] = c
            }else{
                a[c === null ? "_N_" : c] = c
            }
            return a
        }, {}) 
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

        if( option.passType === "indexed"){
            return {type: "parent", value: val, pivot: option.access, relationship: option.relationship, invert}
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
            if( val === "_N_"){
                val = undefined
            }else if(Array.isArray(val)){
                val = val.map(d=>d === "_N_" ? undefined : d)
            }
            return {type: option.type, subtype: option.subtype, map: [val].flat(), pivot: option.access, relationship: option.relationship,  invert}
        }else if( option?.type === "type"){
            return {type: option.type, subtype: option.subtype, map: [val].flat().map(d=>parseInt(d)), pivot: option.access, relationship: option.relationship, invert}
        }else if( option?.type === "title"){
            return  {type: "title", value: val, pivot: option.access, relationship: option.relationship, invert}
        }else if( option?.type === "segment_filter"){
            return  {type: "segment_filter", value: val, pivot: option.access, relationship: option.relationship, invert}
        }else if( option.type === "parameter"){
            if( val?.bucket_min  !== undefined ){
                return  {type: "parameter", param: option.parameter, value: {idx: val.idx, min_value: val.bucket_min, max_value: val.bucket_max}, pivot: option.access, relationship: option.relationship, invert}
            }else{
                return  {type: "parameter", param: option.parameter, value: val, pivot: option.access, relationship: option.relationship, invert}
            }
        } 
        return undefined
    },
    commonFilterSetup: (filter, isAxis = false )=>{
        //const needsValue = filter.type === "title" || filter.type === "parameter" || filter.type === "type" || filter.type === "parent"
        const needsValue = filter.type === "type" || filter.type === "parent"
        let isRange = false
        if( !isAxis && needsValue && filter.value === undefined){
            return {skip:true}
        }
        if( filter.value ){
            if( Array.isArray(filter.value)){
                isRange = filter.value.find(d=>d?.min_value !== undefined || d?.max_value !== undefined)
            }else{
                isRange = filter.value.min_value !== undefined || filter.value.max_value !== undefined
            }
        }

        if( isRange ){
//            console.warn("RANGE NOT IMPLEMENTED")
        }
        let pivot = isAxis ? (filter.access ?? filter.pivot ?? filter.relationship?.length) : filter.pivot ?? filter.relationship?.length
        let relationship = filter.relationship
        let resolvedFilterType = filter.type
        
        if( filter.type === "category"){
            resolvedFilterType = "parent"
            if( Array.isArray(relationship)){
                relationship = [...relationship, "ref"]
            }else if(relationship){
                relationship = [relationship, "ref"]
            }else{
                relationship = ['ref']
            }
            pivot = (pivot ?? 0) + 1
        }
        if( filter.type === "segment_filter"){
            resolvedFilterType = "parent"
            pivot = 1
            relationship = ['auto']
        }
        if( filter.subtype === "question"){
            pivot = (pivot ?? 0) + 1
            if( relationship){
                if( Array.isArray(relationship)){
                    relationship = [...relationship, "auto"]
                }else{
                    relationship = [relationship, "auto"]
                }
            }else{
                relationship = ["auto"]
            }
        }
        
        let check = [filter.map ?? filter.value].flat()
        let includeNulls = false

        if( filter.subtype === "question"){
            resolvedFilterType = "parent"
        }else if( filter.subtype === "search"){
            resolvedFilterType = "parent"
        }

        if( check.includes(undefined) || check.includes(null)){
            if( resolvedFilterType === "parent" || resolvedFilterType === "title"){
                check = check.filter(d=>d !== undefined && d !== null )
                includeNulls = true
            }else if(resolvedFilterType === "parameter"){
                check = [undefined, ...check.filter(d=>d !== undefined && d !== null )]
            }
        }

        return {resolvedFilterType, pivot, relationship, check, includeNulls, isRange}

    },areArraysEqualIgnoreOrder:(arr1, arr2)=>{
        // Check if both arrays have the same length
        if( !arr1 || !arr2 ){
            return false
        }
        if (arr1.length !== arr2.length) {
            return false;
        }

        // Sort the arrays
        const sortedArr1 = arr1.slice().sort();
        const sortedArr2 = arr2.slice().sort();

        // Compare the sorted arrays element by element
        for (let i = 0; i < sortedArr1.length; i++) {
            if ((sortedArr1[i] === null || sortedArr1[i] === undefined) && (sortedArr2[i] === null || sortedArr2[i] === undefined)) {
                continue;
            }
            if (sortedArr1[i] !== sortedArr2[i]) {
                return false;
            }
        }

        // If all elements are equal, the arrays are equal
        return true;
    },
    checkImports: (receiver, id, filters)=>{
        if( !filters || filters.length === 0){
            const imp = receiver.primitives.imports
            const ids = imp.allIds ?? imp
            if( ids.includes(id) ){
                if( !receiver?.referenceParameters?.target || receiver?.referenceParameters?.target === "items"){
                    if( !receiver.referenceParameters?.importConfig ){
                        return true
                    }
                    if( receiver.referenceParameters.importConfig.length === 1 ){
                        if(receiver.referenceParameters.importConfig[0].id === id){
                            if( !receiver.referenceParameters.importConfig[0].filters || receiver.referenceParameters.importConfig[0].filters.length === 0 ){
                                return true
                            }
                        }
                    }
                    return false
                }
            }else{
                return false
            }
        }
        if( (!receiver?.referenceParameters?.target || receiver?.referenceParameters?.target === "items") && receiver.referenceParameters?.importConfig){
            const candidates = receiver.referenceParameters.importConfig.filter(d=>d.id === id)
            const match = candidates.filter(d=> {
                if( !d.fitlers){
                    return false
                }
                const thisMatch = d.filters.filter(d2 => {
                    //console.log(`Checking`)
                    const thisSet = filters.find(ip=>{
                        const allKeys = [...Object.keys(d2), ...Object.keys(ip)].filter((d,i,a)=>d!== "id" && a.indexOf(d)===i)
                        return allKeys.reduce((a,c)=>{
                            let res = false
                            if( d2[c] instanceof Object){
                                if( Array.isArray(d2[c]) ){
                                    res = PrimitiveConfig.areArraysEqualIgnoreOrder( d2[c], ip[c])
                                }else if( d2[c] instanceof Object ){
                                    res = d2[c]?.idx === ip[c]?.idx
                                }else{
                                    throw `Param ${c} not processed`
                                }
                            }else{
                                res = (d2[c] === ip[c]) 
                            }
                            //console.log(" - ", res, d2[c], ip[c])
                            return res && a}, true)
                        })
                        //console.log(`Result = `, thisSet)
                        return thisSet
                })
                //console.log(thisMatch)
                return thisMatch.length === filters.length && thisMatch.length === d.filters.length
            })

            //console.log(match.length)
            if( match.length === 1){
                return true
            }
        }
        return false
    },doFilter: ({resolvedFilterType, filter, setToCheck, lookups, check, scope, includeNulls, isRange}, fns)=>{
            const invert = filter.invert ?? false
            const temp = []

            let basicCheck = (d)=>{
                if(d !== null && typeof(d) === "object" ){
                    return check.filter(d2=>d.includes(d2)).length > 0
                }
                if( d === null){
                    return check.includes(undefined)
                }
                return check.includes(d)
            }
            let rangeCheck = (d)=>{
                return check.find(c=>{
                    if( c.min_value === null && c.max_value === null ){
                        return (d === null || d === undefined)
                    }
                    return (d >= (c.min_value ?? -Infinity) && d <= (c.max_value ?? Infinity))
                }) !== undefined
            }
            const doCheck = isRange ? rangeCheck : basicCheck

            let idx = 0
            for(const d of setToCheck){
                let data
                if( resolvedFilterType === "title"){
                    data = lookups[idx].map(d=>d.title)
                }
                else if( resolvedFilterType === "parameter"){
                    data = lookups[idx].map(d=>d.referenceParameters?.[filter.param])//.flat()//.filter(d=>d)
                    data = data.map(d=>Array.isArray(d) && d.length === 0 ? undefined : d).flat()
                }else if( resolvedFilterType === "type"){
                    data = lookups[idx].map(d=>d.referenceId)
                }else if( resolvedFilterType === "not_category_level1"){
                    const parentIds = lookups[idx].map(d=>fns.parentIds(d)).flat()
                    data = scope.filter(d=>parentIds.includes(d))
                }else if( resolvedFilterType === "parent"){
                    if( filter.sourcePrimId ){
                        data = lookups[idx].map(d=>fns.parentIds(d)).flat().filter((d,i,a)=>a.indexOf(d)===i)
                    }else{
                        data = lookups[idx].map(d=>d.id).flat().filter((d,i,a)=>a.indexOf(d)===i)
                    }
                    if( scope ){
                        data = data.filter(d=>scope.includes(d))
                    }
                }


                if( invert ){
                    if( (data.length === 0 && !includeNulls) || !data.reduce((a,d)=>a && doCheck(d), true) ){
                        temp.push( d )
                    }
                }else{
                    if((data.length === 0 && includeNulls) || data.reduce((a,d)=>a || doCheck(d), false) ){
                        temp.push( d )
                    }
                }
                idx++
            }
            return temp
    }
}




export default PrimitiveConfig