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
    },{
        title: "Green",
        name: "green",
        colors:[
            "#ecfdf5",
            "#a4f4cf",
            "#5ee9b5",
            "#00bc7d",
            "#007a55"
        ]
    },
    {
        title: "Ice Blue",
        name: "ice_blue",
        text_colors:[
            "#222",
            "#222",
            "#222",
            "#f2f2f2",
            "#f2f2f2"
        ],
        colors:[
            "#c6f1ff",
            "#89e2ff",
            "#46defc",
            "#077c97",
            "#025462"
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
            defaultTitle:false
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
            defaultReferenceId: 54,
            defaultTitle:false
        },
        "hypothesis": {
            needCategory:false,
            defaultReferenceId: 39
        },
        "page": {
            needCategory:true,
            defaultReferenceId: 140
        },
        "flow": {
            needCategory:true,
            defaultReferenceId: 130
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
            defaultTitle:false,
            defaults:{
                useTerms: true
            },
            render:{
                background: "#f7fee7",
                accentBackground: "#3f6212"
            }
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
        "actionrunner": {
            needCategory:true,
            defaultReferenceId: 131
        },
    },
    types: ["hypothesis", 
        "learning",
        "activity",
        "result",
        "experiment",
        "question", 
        "evidence", 
        "prompt",
        "venture",
        "assessment", 
        "entity", 
        "category", 
        "segment", 
        "view", 
        "search",
        "detail",
        "query", 
        "report", 
        "element", 
        "reportinstance", 
        "concept", 
        "board", 
        "marketsegment", 
        "working", 
        "summary",
        "actionrunner",
        "flow",
        "flowinstance",
        "categorizer",
        "action",
        "page"
    ],
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
        },
        "summary":{
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
        "question": "question",
        "segment_filter":"segment_filter"
    },
    heatMapPalette:heatMapPalette,
    renderConfigs:{
            default: {title:"Show items",parameters: {showAsCounts:false},
                config:{
                    "summary":{
                        type: "option_list",
                        title: "Show breakdown",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    }

                }},
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
                    },
                    "titles":{
                        type: "option_list",
                        title: "Show title",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    }
                },
                showAsCounts:true
            },
            cat_overview: {id: 4,title:"Category overview", renderType: "cat_overview",parameters: {},
                config:{
                    "show_none":{
                        type: "option_list",
                        title: "Show None",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_title":{
                        type: "option_list",
                        title: "Show Title",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "by_tag":{
                        type: "option_list",
                        title: "Color by tag",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_legend":{
                        type: "option_list",
                        title: "Show Legend",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                }},
            field: {id: 5,title:"Field of item", renderType: "field",parameters: {},config:{}},
            detail_grid: {id: 6, title:"Details", renderType: "overview",parameters: {},config:{}},
            word_cloud: {id: 7,title:"Word cloud", renderType: "cat_overview", configName:"word_cloud", parameters: {},
                config:{
                    "show_none":{
                        type: "option_list",
                        title: "Show None",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_title":{
                        type: "option_list",
                        title: "Show Title",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "by_tag":{
                        type: "option_list",
                        title: "Color by tag",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_legend":{
                        type: "option_list",
                        title: "Show Legend",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                }},

        },
    decodeParameter:(data, path)=>{
        if (!data || !path) return undefined;
        const parts = path.split(".");
        for (let i = 0; i < parts.length; i++) {
            if (!data) return undefined; 
            data = data[parts[i]];
        }
        return data;
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
        if( filter.type === "question"){
            pivot = (pivot ?? 0) + (filter.subtype === "question" ? 1 : 1)
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
        }else if( filter.subtype === "prompt"){
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
            if( imp ){

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
                }
            }
            return false
        }
        if( (!receiver?.referenceParameters?.target || receiver?.referenceParameters?.target === "items") && receiver.referenceParameters?.importConfig){
            const candidates = receiver.referenceParameters.importConfig.filter(d=>d.id === id)
            const match = candidates.filter(d=> {
                if( !d.filters){
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
    },getInputMap:(primitive, mode = "inputs")=>{
        const out = []
        const input_list = Object.keys(primitive.primitives?.[mode] ?? {})
        for(const inp of input_list){
            const [sourcePin, inputPin] = inp.split("_")
            const sourceIds = primitive.primitives[mode][inp]
            for(const sourceId of sourceIds){
                out.push( {sourceId, sourcePin, inputPin} )
            }
        }
        return out
        //return PrimitiveConfig.getPinMap(primitive, "inputs")
    },getOutputMap:(primitive)=>{
        const out = []
        const pp = primitive._parentPrimitives ?? primitive.parentPrimitives ?? {}
        const outputsToPins = Object.keys(pp).reduce((a,d)=>{
            const res = pp[d].filter(d=>d.startsWith("primitives.inputs."))
            if(res.length > 0){
                a[d] = res.map(d=>d.replace("primitives.inputs.",""))
            }
            return a
        },{})


        const outputToImports = Object.keys(primitive.primitives?.outputs ?? {}).reduce((a,d)=>{
            for( const target of primitive.primitives?.outputs[d]){
                a[target] = [d]
            }
            return a
        }, {})
        const list = {
            ...outputToImports,
            ...outputsToPins
        }


        for(const targetId of Object.keys(list)){
            for(const inp of list[targetId]){
                const [outputPin, targetPin] = inp.split("_")
                out.push( {targetId, targetPin, outputPin} )
            }
        }
        return out
        //return PrimitiveConfig.getPinMap(primitive, "outputs")
    },getPinMap:(primitive, pins)=>{
        if( pins === "inputs"){
            return PrimitiveConfig.getInputMap(primitive)
        }else if( pins === "outputs"){
            return PrimitiveConfig.getOutputMap(primitive)
        }
    },getDynamicPins:(primitive, config, mode = "inputs")=>{
        if( mode === "inputs"){
            if( primitive.type === "query" || primitive.type === "summary"){
                if( config?.prompt ?? config?.query){
                    const matches = (config.prompt ?? config.query).match(/\{([^}]+)\}/g);
                    const dynamicNames =  matches ? matches.map(match => match.slice(1, -1)) : [];
                    return dynamicNames.reduce((a,c)=>{
                        a[c] = {
                            types: ["string"]
                        }
                        return a
                    }, {})
                }
            }else if( primitive.type === "flow"){
                return primitive.referenceParameters?.controlPins
            }else if( primitive.type === "page"){
                return primitive.referenceParameters?.inputPins
            }
        }else{
            if( primitive.type === "flow"){
                return primitive.referenceParameters?.outputPins 
            }
        }
        return {}
    },canConnect:({input = {}, output = {}})=>{
        if( input.config && output.config){
            const toCheck = {
                inputMapConfig: input.config[input.pin],
                sourcePinConfig: output.config[output.pin]
            }
            console.log(toCheck)
            const result = PrimitiveConfig.alignInputAndSource([toCheck])
            return result[0]?.useConfig

        }
        return false

    },alignInputAndSource:(inputMap, dynamicPins)=>{
        let out = []
        for(const input of inputMap){
            let imConfig = input.inputMapConfig

            if(!imConfig && dynamicPins){
                input.inputMapConfig = dynamicPins[input.inputPin]
                imConfig = input.inputMapConfig
            }

            if( imConfig ){
                let sourcePinConfig = input.sourcePinConfig
                if( input.sourcePin === "impout" || (input.sourcePin === "impin" && (input.sourcePrimitive?.type === "flow" || input.sourcePrimitive?.type === "flowinstance"))){
                    if( input.inputMapConfig?.types?.includes("primitive")){
                        out.push({
                            ...input,
                            useConfig: "primitive",
                            sourcePinConfig: {
                                name:"Imports",
                                types:['primitive']
                            },
                            sourceTransform: "imports"
                        })
                    }else{
                        out.push({
                            ...input,
                            useConfig: "string",
                            sourcePinConfig: {
                                name:"Imports",
                                source: "BY_TYPE",
                                types:['primitive']
                            },
                            sourceTransform: "filter_imports"
                        })
                    }
                }else{
                    if( sourcePinConfig ){

                        let sourceTransform
                        let useConfig = sourcePinConfig.types.map(d=>({config:d, position: imConfig.types.indexOf(d)})).filter(d=>d.position > -1).reduce((best, current) => (best === null || current.position < best.position ? current : best), null)?.config
                        
                        if( !useConfig ){
                            if( sourcePinConfig.types.includes("string_list") && imConfig.types.includes("string")){
                                sourceTransform = "list_to_string"
                                useConfig = "string"
                            }else if( sourcePinConfig.types.includes("children") && imConfig.types.includes("string")){
                                sourceTransform = "child_list_to_string"
                                useConfig = "string"
                            }
                        }

                        out.push({
                            ...input,
                            useConfig,
                            sourceTransform
                        })

                    }                
                }
            }
        }
        return out

    },translateInputMap:(inputMap)=>{
        let out = {}
        for(const input of inputMap){
            let imConfig = input.inputMapConfig

            if( imConfig ){
                const source = input.sourcePrimitive
                if( source ){
                    const sourcePinConfig = input.sourcePinConfig
                    if( sourcePinConfig ){
                        if( !out[input.inputPin]){
                            out[input.inputPin] = {
                                config: input.useConfig,
                                data: []
                            }
                        }else{
                            if(out[input.inputPin].config !== input.useConfig ){
                                continue
                            }
                        }
                        if(input.useConfig === "primitive"){
                            if( source.type === "page"){
                                    out[input.inputPin].data.push( source )
                            }else{
                                if( input.sources ){
                                    out[input.inputPin].data = out[input.inputPin].data.concat( input.sources )
                                }else{
                                    out[input.inputPin].data.push( source)
                                }
                            }
                        }else{
                            let sourceField = input.sourcePinConfig.source.replace(/^param./,"")
                            function extractDataFromSource( sources){
                                let result = []
                                let sourceData = sources.map(d=>{
                                    if(sourceField === "title"){
                                        return d.title
                                    }
                                    let sf = sourceField
                                    if( sf === "BY_TYPE"){
                                        if( d.type === "summary"){
                                            sf = "summary"
                                        }else if(d.type === "result"){
                                            sf = "description"
                                        }
                                    }
                                    if( sf === "summary"){
                                        if( typeof(input.inputMapConfig.section)=== "string" && input.inputMapConfig.section.trim().length > 0 ){
                                            if( d.referenceParameters.structured_summary){
                                                const subsection = d.referenceParameters.structured_summary.find(d=>d.heading === input.inputMapConfig.section)
                                                if( subsection ){
                                                    if( imConfig.types.includes("string_list") && subsection.content && subsection.type.includes("list")){
                                                        return subsection.content.match(/"[^"]*"|[^,\n]+/g)
                                                            .map(d => d.trim().replace(/^\s*-\s*/, "")) 
                                                            .map(d => d.replace(/^"(.*)"$/, (_, capture) => capture))
                                                            .map(d=>d.trim())
                                                            .join(",")
                                                    }
                                                    return flattenStructuredResponse( subsection)
                                                }
                                            }
                                            return ""
                                        }
                                    }
                                    return PrimitiveConfig.decodeParameter(d.referenceParameters, sf)
                                }).flat(Infinity)
                                if( input.useConfig === "object_list"){
                                    result = result.concat( sourceData )
                                }else if(input.useConfig === "string_list"){
                                    result = result.concat( sourceData )
                                }else if(input.useConfig === "string"){
                                    if( Array.isArray(sourceData)){
                                        sourceData = sourceData.map(d=>{
                                            let tx = (d ?? "").trim()
                                            if( sourceData.length > 1 && !tx.endsWith(".") && tx){
                                                tx = tx + ".  "
                                            }
                                            return tx
                                        }).join("")
                                    }
                                    result = sourceData
                                }
                                return result
                            }
                            if( input.sourceBySegment ){
                                out[input.inputPin].data = []
                                out[input.inputPin].dataBySegment = {}
                                for(const d of Object.keys(input.sourceBySegment)){
                                    const results = extractDataFromSource(input.sourceBySegment[d] )
                                    out[input.inputPin].dataBySegment[d] = results
                                    if( input.useConfig === "string"){
                                        out[input.inputPin].data = (out[input.inputPin].data.length === 0 ? "" : ".  ") + results
                                    }else{
                                        out[input.inputPin].data = out[input.inputPin].data.concat(results)
                                    }
                                }
                            }else{
                                let sources = input.sources ?? [source] 
                                out[input.inputPin].data = extractDataFromSource( sources )
                            }
                        }
                    }
                    

                }
            }
        }
        return out

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

            function fastUnique(arr){
                return Array.from(new Set(arr));
            }

            let idx = 0
            for(const d of setToCheck){
                let data
                if( resolvedFilterType === "title"){
                    data = lookups[idx].map(d=>d.title)
                }
                else if( resolvedFilterType === "parameter"){
                    data = lookups[idx].map(d=>PrimitiveConfig.decodeParameter(d.referenceParameters,filter.param))
                    data = data.map(d=>Array.isArray(d) && d.length === 0 ? undefined : d).flat()
                }else if( resolvedFilterType === "type"){
                    data = lookups[idx].map(d=>d.referenceId)
                }else if( resolvedFilterType === "not_category_level1"){
                    const parentIds = lookups[idx].map(d=>fns.parentIds(d)).flat()
                    data = scope.filter(d=>parentIds.includes(d))
                }else if( resolvedFilterType === "parent"){
                    if( filter.sourcePrimId ){
                        //data = lookups[idx].map(d=>fns.parentIds(d)).flat().filter((d,i,a)=>a.indexOf(d)===i)
                        data = fastUnique(lookups[idx].map(d=>fns.parentIds(d)).flat())
                    }else{
                        //data = lookups[idx].map(d=>d.id).flat().filter((d,i,a)=>a.indexOf(d)===i)
                        data = fastUnique(lookups[idx].map(d=>d.id).flat())
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


export function flattenStructuredResponse(nodeResult, nodeStruct, allowHeadings = true, headerLevel = 0, first = true) {
    let out = ""

    for(const d in nodeResult){
        const nextR = nodeResult?.[d]
        if( nextR?.heading){
            if( allowHeadings ){
                const h_level = Math.max((3 - headerLevel), 1)
                out += `${"#".repeat(h_level)} ${nextR.heading}\n`
            }else{
                out += `- **${nextR.heading}:** `
            }
        }
        if( nextR?.content ){
            if( nextR?.type?.match(/list/) ){
                let asArray = nextR.content ?? []

                if( typeof(nextR.content) === "string"){
                    asArray = nextR.content.split(/\n/)
                }
                
                out += asArray.map(d=>{
                    if( typeof(d) === "string"){
                        d = d.trim()
                        if(!d.startsWith("- ")){
                            d = "- " + d
                        }
                    }
                    return d
                }).join("\n") + "\n"
            }else{
                out += `${nextR.content}\n`
            }
        }
        if( nextR?.subsections){
            out += flattenStructuredResponse(nextR?.subsections, nextR?.subsections, allowHeadings, headerLevel + 1) + "\n"
        }
    }
    return first ? out.trim() : out
}


PrimitiveConfig.flattenStructuredResponse = flattenStructuredResponse

export default PrimitiveConfig