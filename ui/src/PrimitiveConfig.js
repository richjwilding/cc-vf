
function fastUnique(arr){
    return Array.from(new Set(arr));
}
const heatMapPalette = [
    {
        title: "Default",
        name:"default",
        category_colors:[
            '#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD',
                                    '#8C564B', '#E377C2', '#7F7F7F', '#BCBD22', '#17BECF',
                                    '#AEC7E8', '#FFBB78', '#98DF8A', '#FF9896', '#C5B0D5'
        ],
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
            "#ffa600",
        ]
    },{
        title: "Purple 12",
        name: "purple_12",
        colors: ['#003f5c', '#20456b', '#394a78', '#514d83', '#6b508b', '#855192', '#e55878', '#f16468', '#f97356', '#fd8443', '#ff952c', '#ffa600']
        /*colors:[
            "#003f5c",
            "#2f4b7c",
            "#665191",
            "#a05195",
            "#d45087",
            "#f95d6a",
            "#ff7c43",
            "#ffa600",
        ]*/
    },{
        title: "Heat",
        name: "heat",
        colors:[
            "#f5f5ab",
            "#fed976",
            "#fc8c3c",
            "#f03b20",
            "#bd0026"
        ],text_colors:[
            "#222",
            "#222",
            "#222",
            "#f2f2f2",
            "#f2f2f2"
        ]
    },{
        title: "Sentiment 5",
        name: "sentiment_5",
        colors:[
            "#bd0026",
            "#fc8c3c",
            "#fed976",
            "#00bc7d",
            "#007a55"
        ],text_colors:[
            "#f2f2f2",
            "#f2f2f2",
            "#222",
            "#222",
            "#222",
            "#f2f2f2",
            "#f2f2f2"
        ]
    },{
        title: "Sentiment 7",
        name: "sentiment_7",
        colors:[
            "#bd0026",
            "#f03b20",
            "#fc8c3c",
            "#fed976",
            "#5ee9b5",
            "#00bc7d",
            "#007a55"
        ],text_colors:[
            "#f2f2f2",
            "#f2f2f2",
            "#222",
            "#222",
            "#222",
            "#f2f2f2",
            "#f2f2f2"
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
        ],text_colors:[
            "#222",
            "#222",
            "#222",
            "#f2f2f2",
            "#f2f2f2"
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
    },
    {
        title: "CC Green",
        name: "cc_green",
        text_colors:[
            "#222",
            "#222",
            "#222",
            "#f2f2f2",
            "#f2f2f2"
        ],
        colors:[
            "#edfcf4",
            "#c5f5de",
            "#9defc9",
            "#75e8b3",
            "#4de29d",
            "#26db88",
            "#00d472",
            "#00d967"
          ]
    },
    {
        title: "Blue > yellow",
        name: "blue_yellow",
        text_colors:[
            "#f2f2f2",
            "#f2f2f2",
            "#222",
            "#222",
            "#222",
            "#222",
            "#222",
            "#222",
            "#222",
            "#222"
        ],
        colors: ['#00429d', '#2b57a7', '#426cb0', '#5681b9', '#6997c2', '#7daeca', '#93c4d2', '#abdad9', '#caefdf', '#ffffe0']
    },
    {
        title: "Dynamic heat",
        name: "dynamic_heat",
        dynamic: true,
        colors:[
            "#f5f5ab",
            "#bd0026"
        ]
    }
    

]


const PrimitiveConfig = {
    "Constants":{
        LIVE_FILTER: 103,
        CONCEPT: 92,
        QUERY_RESULT: 82,
        VIEW: 38,
        GENERIC_SUMMARY: 109,
        EVALUATOR: 90,
        EVAL_CATEGORIZER: 144,
        SCORE: 120,
        SHAPE_ELEMENT: 145,
        TWITTER_POST: 149

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
          //  embed: ["title", "quote"]
        },
        "result":{
            //embed: ["title"]
        },
        "entity":{
          //  embed: ["title","referenceParameters.capabilities","referenceParameters.customers","referenceParameters.offerings"]
        },
        "activity": {
            needCategory:true,
            "createAtWorkspace": true,
        },
        "summary": {
            defaultReferenceId: 109,
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
        "pin": "pin",
        "primitive": "primitive",
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
            default: {title:"Show items",id:0, parameters: {showAsCounts:false},
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
                social: {title:"Show content",id:13,parameters: {showAsCounts:false},
                config:{
                    "columns":{
                        type: "column_count",
                        title: "Text length",
                        default: 1,
                        max: 20
                    },
                    "text_length":{
                        type: "option_list",
                        title: "Text length",
                        default: 60,
                        options: [
                            {id:20, title: "Short"},
                            {id:60, title: "Medium"},
                            {id:150, title: "Long"}
                        ]
                    },"extract_hashtags":{
                        type: "option_list",
                        title: "Extract hastags",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:5, title: "Up to 5"},
                            {id:10, title: "Up to 10"},
                            {id:true, title: "All"}
                        ]
                    }

                }},
            checktable: {id: 2,title:"Truth table", matrixType: "checktable", renderType: "checktable",parameters: {},
                config:{

                    "max_cols":{
                        type: "option_list",
                        title: "Max columns",
                        default: undefined,
                        options: [
                            {id: undefined, title: "No cap"},
                            {id: 5, title: "5"},
                            {id: 10, title: "10"},
                            {id: 15, title: "15"},
                            {id: 20, title: "20"},
                            {id: 25, title: "25"},
                            {id: 30, title: "30"},
                        ]
                    }
                
            }},
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
            counts: {id:1, title:"Heatmap", "matrixType": "heatmap",
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
                            {id:"number", title: "Number"},
                            {id:"percentage", title: "Percentage"}
                        ]
                    },
                    "titles":{
                        type: "boolean",
                        title: "Show title",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "bubble":{
                        type: "boolean",
                        title: "Show as bubbles",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_row_headers":{
                        type: "boolean",
                        title: "Row heaaders",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_column_headers":{
                        type: "boolean",
                        title: "Column heaaders",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_row_totals":{
                        type: "boolean",
                        title: "Row totals",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_column_totals":{
                        type: "boolean",
                        title: "Column totals",
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
                    "style":{
                        type: "option_list",
                        title: "Chart Type",
                        default: true,
                        options: [
                            {id:"bar", title: "Bar graph"},
                            {id:"pie", title: "Pie chart"},
                        ]
                    },
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
            chart: {id: 8,title:"Distribution chart", renderType: "chart", configName: "chart", parameters: {},
                config:{
                    "colors":{
                        type: "option_list",
                        title: "Colors",
                        default: "default",
                        options: heatMapPalette.map(d=>({id: d.name, title:d.title}))
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
                    "style":{
                        type: "option_list",
                        title: "Style",
                        default: "pie",
                        options: [
                            {id:"bar", title: "Bar"},
                            {id:"pie", title: "Pie"},
                            {id:"dial", title: "Dial"}
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
            dial: {id: 9,title:"Dial", renderType: "dial", configName: "dial", parameters: {},
                config:{
                    "invert":{
                        type: "option_list",
                        title: "Invert",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_label":{
                        type: "option_list",
                        title: "Show label",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_number":{
                        type: "option_list",
                        title: "Show number",
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
                    }
                }},
            subchart: {id: 11,title:"Sub distribution chart", "matrixType": "distribution", renderType: "grid", configName: "grid", parameters: {},
                needsAllAllocations: true,
                config:{
                    "colors":{
                        type: "option_list",
                        title: "Colors",
                        default: "default",
                        options: heatMapPalette.map(d=>({id: d.name, title:d.title}))
                    },
                    "show_title":{
                        type: "boolean",
                        title: "Show Title",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "style":{
                        type: "option_list",
                        title: "Style",
                        default: "pie",
                        options: [
                            {id:"bar", title: "Bar"},
                            {id:"stacked_bar", title: "Stacked Bar"},
                            {id:"pie", title: "Pie"},
                            {id:"dial", title: "Dial"},
                            {id:"weighted", title: "Weighted average"},
                        ]
                    },
                    "show_value":{
                        type: "option_list",
                        title: "Show Value",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:"number", title: "Number"},
                            {id:"percent", title: "Percent"}
                        ]
                    },
                    "reverse_palette":{
                        type: "boolean",
                        title: "Reverse Palette",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "order":{
                        type: "option_list",
                        title: "Order by",
                        default: false,
                        options: [
                            {id:false, title: "None"},
                            {id:"high_to_low", title: "Count (High to low)"},
                            {id:"low_to_high", title: "Count (Low to high)"}
                        ]
                    },
                    "calcRange":{
                        type: "option_list",
                        title: "Relative scale",
                        default: false,
                        options: [
                            {id:false, title: "None"},
                            {id:true, title: "by chart"},
                            {id:"column", title: "by column"},
                            {id:"row", title: "by row"}
                        ]
                    },
                    "legend_size":{
                        type: "option_list",
                        title: "Legend size",
                        default: true,
                        options: [
                            {id:8, title: 8},
                            {id:10, title: 10},
                            {id:12, title: 12},
                            {id:14, title: 14},
                            {id:16, title: 16},
                            {id:18, title: 18},
                        ]
                    },
                    "show_legend":{
                        type: "option_list",
                        title: "Show Legend",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Below"},
                            {id:"right", title: "On right"},
                            {id:"each-below", title: "Below each"},
                            {id:"each-right", title: "Right of each"}
                        ]
                    },
                    "show_row_headers":{
                        type: "boolean",
                        title: "Row heaaders",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_column_headers":{
                        type: "boolean",
                        title: "Column heaaders",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_row_totals":{
                        type: "boolean",
                        title: "Row totals",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                    "show_column_totals":{
                        type: "boolean",
                        title: "Column totals",
                        default: false,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    }
                }},
            overUnderChart: {id: 12,title:"Over / under chart", "matrixType": "overunder", renderType: "grid", configName: "grid", parameters: {},
                needsAllAllocations: true,
                config:{
                    "colors":{
                        type: "option_list",
                        title: "Colors",
                        default: "default",
                        options: heatMapPalette.map(d=>({id: d.name, title:d.title}))
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
                    "center":{
                        type: "option_list",
                        title: "Center Axis",
                        default: true,
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
                    "show_breakdown":{
                        type: "option_list",
                        title: "Show Pie",
                        default: true,
                        options: [
                            {id:false, title: "No"},
                            {id:true, title: "Yes"}
                        ]
                    },
                }}


        },
    decodeParameter:(data, path)=>{
        if (!data || !path) return undefined;
        if (typeof(path) !== "string") return undefined;
        const parts = path.split(".");
        for (let i = 0; i < parts.length; i++) {
            if (!data) return undefined; 
            data = data[parts[i]];
        }
        return data;
    },
    decodeParameterFromParts:(data, parts)=>{
        if (!data || !parts) return undefined;
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
        if( typeof(filter) === "object" && !Array.isArray(filter) ){
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
        if( val === undefined || val.length === 0){
            return undefined
        }

        if( val instanceof Object && !Array.isArray(val)){
            if( val.bucket_min !== undefined || val.bucket_max !== undefined ){
            }else if( val.lte !== undefined || val.gte !== undefined ){
                invert = !invert
            }else if(option?.type === "segment_filter"){
            }else if(option?.type === "icon"){
                val = val.label
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
        }else if( option?.type === "title" ){
            return  {type: "title", value: val, pivot: option.access, relationship: option.relationship, invert}
        }else if( option?.type === "icon"){
            return  {type: "parent", value: val, pivot: option.access, relationship: option.relationship, invert}
        }else if( option?.type === "segment_filter"){
            if( Array.isArray(val)){
                return  {type: "segment_filter", value: val,  pivot: option.access, relationship: option.relationship, invert}
            }
            return  {type: "parent", segmentFilter: true, value: val.idx ?? val, sourcePrimId: val.sourcePrimId, pivot: option.access, relationship: option.relationship, invert}
        }else if( option.type === "parameter"){
            if( val?.bucket_min  !== undefined ){
                return  {type: "parameter", param: option.parameter, value: {idx: val.idx, min_value: val.bucket_min, max_value: val.bucket_max}, pivot: option.access, relationship: option.relationship, invert}
            }else if( option.axisData?.buckets){
                const bucket = option.axisData?.buckets[val]
                return  {type: "parameter", param: option.parameter, value: {bucket: val, min_value: bucket.min, max_value: bucket.lessThan}, pivot: option.access, relationship: option.relationship, invert}
            }else{
                return  {type: "parameter", param: option.parameter, value: val, pivot: option.access, relationship: option.relationship, invert}
            }
        } 
        return undefined
    },
    commonFilterSetup: (filter, isAxis = false )=>{
        //const needsValue = filter.type === "title" || filter.type === "parameter" || filter.type === "type" || filter.type === "parent"
        if( filter.segmentFilter){
            const {segmentFilter, axis, ...filterToRelay} = filter
            if( filterToRelay.type === "parameter" || filterToRelay.type === "title"){
                delete filterToRelay["sourcePrimId"]
            }
            return {
                resolvedFilterType: "segment_filter",
                pivot: 1, 
                relationship: ["auto"], 
                check: filterToRelay,
                includeNulls: undefined,
                isRange: false
            }
        }
        const needsValue = filter.type === "type" || filter.type === "parent"
        let isRange = false
        if( !isAxis && needsValue && filter.value === undefined){
            return {skip:true}
        }
        if( filter.value ){
            if( Array.isArray(filter.value)){
                isRange = filter.value.find(d=>d?.gte !== undefined || d?.lte !== undefined || d?.min_value !== undefined || d?.max_value !== undefined )
            }else{
                isRange = filter.value.gte !== undefined || filter.value.lte !== undefined || filter.value.min_value !== undefined || filter.value.max_value !== undefined
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
            pivot = 1
            relationship = ['auto']
            if( Array.isArray(filter.value) ){
                resolvedFilterType = "parent"
            }
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
    processingErrors:(receiver, tasks)=>{
        const processing = receiver.processing ?? {}
        return Object.entries(processing).reduce((a,[k,v])=>{
            if( tasks && tasks.includes(k)){
                return a
            }
            if( v.error ){
                a[k] = v
            }
            return a
        }, {})

    },
    checkImports: (receiver, id, filters)=>{
        if( !filters || filters.length === 0){
            const imp = receiver.primitives?.imports
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
                a[target] ||= []
                a[target].push(d)
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
    },getPinsForAction:(targetCategory, name)=>{
        const activeAction = targetCategory?.actions?.find(d=>d.key === name)
        let actionPins = {}
        if( activeAction ){
            actionPins = Object.entries(activeAction.actionFields ?? {}).reduce((a,[k,d])=>{
                if( d.pin ){
                    a[k] = {
                        name: d.title,
                        types: ["string"]
                    }
                }
                return a
            },{})                    
        }
        return actionPins
    },getPinMap:(primitive, pins)=>{
        if( pins === "inputs"){
            return PrimitiveConfig.getInputMap(primitive)
        }else if( pins === "outputs"){
            return PrimitiveConfig.getOutputMap(primitive)
        }
    },getDynamicPins:(primitive, config, mode = "inputs")=>{
        if( mode === "inputs"){
            if( primitive.type === "query" || primitive.type === "summary" || primitive.type === "categorizer"|| primitive.type === "action"){
                let src = config.prompt ?? config.query 
                if( primitive.type === "categorizer" ){
                    src = [config.conditions ?? "", config.evaluation ?? "", config.cat_theme ?? ""].filter(d=>d).join(" ")
                }
                if( src ){
                    const matches = src.match(/\{([^}]+)\}/g);
                    const dynamicNames =  matches ? matches.map(match => match.slice(1, -1)) : [];
                    return dynamicNames.reduce((a,c)=>{
                        a[c] = {
                            types: ["string"]
                        }
                        return a
                    }, {})
                }
            }else if( primitive.type === "flow"){
                return {
                    ...(primitive.referenceParameters?.controlPins ?? {}),
                    ...(primitive.referenceParameters?.inputPins ?? {}),
                }
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
                            sourceTransform: ["result","evidence"].includes(input.sourcePrimitive.type) ? "pass_through" : input.inputMapConfig.segments ? "filter_imports" : "imports"
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
                }else if( (input.sourcePrimitive?.type === "flow" || input.sourcePrimitive?.type === "flowinstance") ){
                    if( sourcePinConfig.types?.includes("primitive") ){
                        out.push({
                                ...input,
                                useConfig: "primitive",
                                sourceTransform: "pin_relay",
                        })
                    }else{
                        out.push({
                                ...input,
                                useConfig: "string",
                                sourceTransform: "pin_relay",
                        })
                    }
                }else{
                    if( !sourcePinConfig && (input.sourcePin === "rowAxis" || input.sourcePin === "colAxis")){
                        out.push({
                            ...input,
                            useConfig: "pass_through",
                            sourceTransform: "get_axis",
                            axis: input.sourcePin.slice(0,3)

                        })
                    }else  if( sourcePinConfig ){

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
                    if( sourcePinConfig || input.useConfig === "pass_through"){
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
                                }else if( input.sourceBySegment ){
                                    out[input.inputPin].dataBySegment = input.sourceBySegment
                                    out[input.inputPin].data = Object.values(input.sourceBySegment).flat()
                                }else{
                                    out[input.inputPin].data.push( source)
                                }
                            }
                        }else if(input.useConfig === "pass_through"){
                            if( input.passThroughCoonfig ){
                                out[input.inputPin].config = input.passThroughCoonfig
                            }
                            out[input.inputPin].data.push( ...[input.pass_through].flat())
                        }else if(input.useConfig){
                            let sourceField = input.sourcePinConfig.source.replace(/^param./,"")
                            function extractDataFromSource( sources){
                                let result = []
                                let sourceData = sources.map(d=>{
                                    if(!d){return ""}
                                    if(sourceField === "title"){
                                        return d.title
                                    }
                                    let sf = sourceField
                                    if( sf === "BY_TYPE"){
                                        if( d.type === "summary"){
                                            sf = "summary"
                                        }else if(d.type === "action"){
                                            sf = "result"
                                        }else if(d.type === "result"){
                                            sf = "description"
                                        }else{
                                            return d.title
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
                                    let list
                                    if( sourceData.length  === 1){
                                        list = sourceData.flatMap(d=>{
                                            if( typeof(d)==="string"){
                                                if( d.includes("\n")){
                                                    return d.split("\n").map(d=>d.trim())
                                                }
                                                return d.split(",").map(d=>d.trim())
                                            }
                                            return d
                                        })
                                    }else{
                                        list = sourceData.flatMap(d=>typeof(d) === "string" ? d.trim() : d)
                                    }
                                    result = result.concat( list )
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
                                out[input.inputPin].source = sources
                            }
                        }
                    }
                    

                }
            }
        }
        return out

    },
    convertEdgesToDepth( edges){
        const adj = new Map();        // from → [to,…]
        const indegree = new Map();   // node → # of incoming edges

        edges.forEach(({from, to}) => {
            if (!adj.has(from)) adj.set(from, []);
            if (!adj.has(to))   adj.set(to, []);
            adj.get(from).push(to);

            indegree.set(to, (indegree.get(to) || 0) + 1);
            if (!indegree.has(from)) indegree.set(from, 0);
        });
        const depth = new Map();  // node → its depth
        const q = [];

        for (let [node, d] of indegree.entries()) {
            if (d === 0) {
                q.push(node);
                depth.set(node, 0);
            }
        }
        while (q.length) {
            const u = q.shift();
            const d = depth.get(u);
          
            for (let v of adj.get(u)) {
              // assign depth[v] = max(existing, d+1)
              depth.set(v, Math.max(depth.get(v) || 0, d + 1));
          
              // “remove” edge u→v
              indegree.set(v, indegree.get(v) - 1);
              if (indegree.get(v) === 0) {
                q.push(v);
              }
            }
        }
        return depth
    },
    flowInstanceStatusToMap( statusMap, {showHidden, showSkipped, groupByLabels}){
        const visibleIds = new Set(
            Object.entries(statusMap).filter(([id, info]) => {
                const refParams = (info.primitive.configParent ?? info.primitive).referenceParameters;
                const isVisible = showHidden ? true  : refParams?.showInMap !== false;
                const isNotSkipped = showSkipped ? true : !info.skip;
                return isVisible && isNotSkipped;
              })
              .map(([id]) => id)
          );
    
          // 2) Build a lookup from each node ID → its direct children IDs
          const childrenMap = {};
          Object.values(statusMap).forEach(({ id, children }) => {
            childrenMap[id] = (children || []).map((c) => c.id);
          });
    
          // 3) Helper: collect all visible descendants of a node, skipping over hidden ones
          const collectVisibleDescendants = (nodeId, visited = new Set()) => {
            const targets = new Set();
            const stack = [...(childrenMap[nodeId] || [])];
            while (stack.length) {
              const curr = stack.pop();
              if (visited.has(curr)) continue;
              visited.add(curr);
    
              if (visibleIds.has(curr)) {
                targets.add(curr);
              } else {
                // dive into this hidden node’s children
                (childrenMap[curr] || []).forEach((gc) => {
                  if (!visited.has(gc)) stack.push(gc);
                });
              }
            }
            return targets;
          };
    
          // 4) If groupByLabels: build label→IDs map for visible nodes
          let labelGroups = null;
          if (groupByLabels) {
            labelGroups = {};
            visibleIds.forEach((id) => {
              // assume “label” is at info.primitive.configParent.label or info.primitive.label
              const {children, ...info} = statusMap[id];
              const label = (info.primitive.configParent ?? info.primitive).referenceParameters.labelForMap;
              const icon = info.primitive.configParent?.metadata?.icon
              if (label) {
                if (!labelGroups[label]) labelGroups[label] = {ids:[], items:[], icon};
                labelGroups[label].ids.push(id);
                labelGroups[label].items.push(info);
              }
            });
          }
    
          // 5) Determine representative ID for each visible node (possibly remapped by label)
          //    repMap[id] = representative ID (either its label or itself)
          const repMap = {};
          if (groupByLabels) {
            // for each label group, pick the label string as the rep ID
            Object.entries(labelGroups).forEach(([label, {ids}]) => {
              ids.forEach((id) => {
                repMap[id] = `label:${label}`;
              });
            });
          }
          // for any visible ID not in repMap, it stays as itself
          visibleIds.forEach((id) => {
            if (!repMap[id]) repMap[id] = id;
          });
    
          // 6) Build nodeList: one entry per unique repMap value
          const seenReps = new Set();
          const nodeList = [];
          visibleIds.forEach((id) => {
            const rep = repMap[id];
            if (seenReps.has(rep)) return;
            seenReps.add(rep);
    
            if (rep.startsWith("label:")) {
              // grouped node: label = rep.slice(6)
              let label = rep.slice(6);
              const labelGroup = labelGroups[label]
              if( labelGroup.ids.length > 1){
                label += ` (${labelGroup.ids.length})`
              }
              nodeList.push({
                id: rep,
                name: label,
                _itemIds: labelGroup.items.map(d=>d.primitive.id),
                itemIds: labelGroup.ids,
                status: ()=>{
                    const itemStatus = labelGroup.items.map(d=>d.primitive.processing?.run_step?.status === "pending" ? "waiting" : (d.primitive.processing?.flow?.status ?? "not_run")).filter((d,i,a)=>a.indexOf(d)===i)
                    let groupStatus = "not_run"
                    if( itemStatus.includes("error")){
                        groupStatus = "error"
                    }else if( itemStatus.includes("error_skip")){
                        groupStatus = "error_skip"
                    }else if( itemStatus.includes("rerun")){
                        groupStatus = "rerun"
                    }else if( itemStatus.includes("running")){
                        groupStatus = "running"
                    }else if( itemStatus.includes("waiting") || itemStatus.includes("pending")){
                        groupStatus = "waiting"
                    }else if( itemStatus.includes("not_complete")){
                        groupStatus = "not_complete"
                    }else if( itemStatus.includes("complete")){
                        groupStatus = "complete"
                    }
                    return groupStatus
                },
                progress:()=>{
                  const progressList = labelGroup.items.map(d=>d.primitive.percentageProgress)
                  const progress = Math.min(...progressList.filter(d=>d!==undefined))
                  return progress
                },
                progressMessage: ()=>{
                    const progressList = labelGroup.items.map(d=>d.primitive.progress).filter(Boolean)
                    const progressCount = progressList.length
                    if( progressCount === 0){
                        return
                    }
                    if( progressCount === 1){
                        return progressList[0]
                    }
                    return progressList.slice(0,3).join("\n") + (progressCount > 3 ? `\n+${progressCount - 3} others` : "")
                },
                skipped: false,
                candidateForRun: labelGroup.items.some(d=>d.candidateForRun),
                icon: labelGroup.icon
              });
            } else {
              // ungrouped, use original info
              const info = statusMap[id];
              nodeList.push({
                id,
                itemIds: [info.primitive.id],
                name: (info.primitive.configParent ?? info.primitive).title,
                status: ()=>{
                    let status = info.primitive.processing?.run_step?.status === "pending" ? "waiting" : (info.primitive.processing?.flow?.status ?? "not_run")
                    if( status === "pending"){
                        return "waiting"
                    }                   
                    return status     
                },
                progress: ()=>info.primitive.percentageProgress,
                progressMessage: ()=>info.primitive.progress,
                //progress: ()=>({percentage: 0.35}),
                candidateForRun: info.candidateForRun,
                skipped: info.skip,
                icon: info.primitive.configParent?.metadata?.icon,
              });
            }
          });
    
          // 7) Build edgeList: for each visible “parent” ID, collect its visible descendants,
          //    then map parent→rep and child→rep, skipping self‐loops and duplicates.
          const edgeSet = new Set();
          visibleIds.forEach((parentId) => {
            const descendants = collectVisibleDescendants(parentId);
            descendants.forEach((childId) => {
              const repParent = repMap[parentId];
              const repChild = repMap[childId];
              if (repParent !== repChild) {
                const key = `${repParent}->${repChild}`;
                if (!edgeSet.has(key)) {
                  edgeSet.add(key);
                }
              }
            });
          });
    
          const edgeList = Array.from(edgeSet).map((key) => {
            const [from, to] = key.split("->");
            return { from, to };
          });
    
          return { nodes: nodeList, edges: edgeList, visibleIds: [...visibleIds] };
    },
    async buildFlowInstanceStatus(flowInstance, steps, functions = {}, options = {}){
        steps = steps.slice().filter(d=>d)
        let flowStarted = flowInstance.processing?.flow?.started
        const map = {}

        function getOrigin( item ){
            return Object.entries(item._parentPrimitives ?? item.parentPrimitives ?? {}).find(d=>d[1].includes("primitives.origin"))?.[0]
        }
        function getConfigId( item ){
            return Object.entries(item._parentPrimitives ?? item.parentPrimitives ?? {}).find(d=>d[1].includes("primitives.config"))?.[0]
        }

        //const flowId = Object.entries(flowInstance._parentPrimitives ?? flowInstance.parentPrimitives ?? {}).find(d=>d[1].includes("primitives.origin"))?.[0]
        const flowId = getOrigin(flowInstance)
        
        const fcValues = Object.entries(flowInstance.referenceParameters ?? {}).reduce((a,[k,v])=>{
            if( k.startsWith("fc_")){
                a[k] = [v].flat()
            }
            return a
        }, {})

        async function setupStep( step, child ){
            if( map[step.id]){
                if( child ){
                    if(!map[step.id].children.find(d=>d.id === child.id)){
                        map[step.id].children.push( child )
                    }
                }
                return
            }
            
            const pp = functions.getPrimitives ? functions.getPrimitives(step) : step.primitives
            const checkListIds = [
                ...pp.imports.allIds, 
                ...pp.inputs.allIds,
            ]
            if( step.type === "view" || step.type === "query" ){
                checkListIds.push(...pp.axis.column.allIds, ...pp.axis.row.allIds)
            }
            const checkList = checkListIds.map(d=>{
                const match = steps.find(d2=>d2.id === d)
                if( match ){
                    return match
                }
            }).filter(d=>d)

            let config = {}
            if( options.configPrimitives){
                const stepConfigId = getConfigId(step)
                if( stepConfigId ){
                    const configPrimitve = options.configPrimitives.find(d=>d.id === stepConfigId)
                    config = configPrimitve?.referenceParameters ?? {}
                }else{
                    console.log(`>> Couldnt get config Id`)
                }
            }else{
                config = functions.getConfig ? (await functions.getConfig(step)) : step.getConfig
            }
            const stepControlValues = Object.entries(config ?? {}).reduce((a,[k,v])=>{
                if( k.startsWith("fc_")){
                    a.push([k,[v].flat()])
                }
                return a
            }, [])
            let matchingConfig  = stepControlValues.some(([k,v])=>fcValues[k] && fcValues[k].some(d=>d.includes(v)))
            const skipForConfiguration = stepControlValues.length > 0 && !matchingConfig

            const status = {
                id: step.id,
                routing: step.type === "segment",
                skipForConfiguration,
                skipForUpstream: undefined,
                need: false,
                can: undefined,
                children: child ? [child] : []
            }
            if( options.withPrimitives){
                status.primitive = step
            }
            let skipForImport = 0
            const importIds = pp.imports.allIds
            for(const p of checkList){
                await setupStep( p, status )
                if( map[p.id]){
                    let thisSkipped = (map[p.id].skip === true || map[p.id].skipDownstream === true) ? true : false
                    if( importIds.includes(p.id)){
                        if( thisSkipped ){
                            skipForImport++
                        }
                    }else{
                        if( !thisSkipped && skipForImport > 0 && skipForImport === importIds.length){
                            console.log(`Step ${step.id} has all imports skipped - ignoring input status ${thisSkipped} of ${p.id} / ${p.plainId}`)
                            thisSkipped = true
                        }
                    }
                    if( status.skipForUpstream === undefined ){
                        status.skipForUpstream = thisSkipped
                    }else{
                        status.skipForUpstream = thisSkipped && status.skipForUpstream
                    }
                }
            }

            status.skip = status.skipForConfiguration || status.skipForUpstream

            if( !status.skip && !status.routing){
                if( 
                    (step.type === "flowinstance" && flowStarted && new Date(step.processing?.flow?.started) >= new Date(flowStarted)) ||
                    (step.type !== "flowinstance" && flowStarted && step.processing?.flow?.started === flowStarted)
                ){
                    if(step.processing?.flow?.status === "error"){
                        status.needReason = step.processing?.flow?.status
                        status.error = step.processing?.flow?.error ?? "Error"
                    }else if(step.processing?.flow?.status === "error_skip"){
                        status.needReason = step.processing?.flow?.status
                        status.error = step.processing?.flow?.error ?? "Error"
                        status.skipDownstream = true
                    }else if(step.processing?.flow?.status === "error_ignore" || step.processing?.flow?.status === "complete"){
                        status.needReason = "complete"
                    }else{
                        status.need = true
                        status.needReason = "not_complete"
                    }
                }else{
                    status.need = true
                    status.needReason = "not_executed"
                }
                if( step.processing?.flow?.status === "ignore"){
                    status.need = false
                    status.needReason = "ignored"
                }
                if( status.need ){
                    if( functions.isStepRunning ){
                        status.running = await functions.isStepRunning( step )
                    }
                }
                if( status.need ){
                    const {can, canReason} = await PrimitiveConfig.canStepRun( flowInstance, step, map, functions, options)
                    status.can = can
                    status.canReason = canReason
                    
                }
            }
            status.candidateForRun = status.can && status.need
            map[step.id] = status
        }

        if( options.subFlowsToScaffold ){
            for(const subFlow of options.subFlowsToScaffold ){
                const need = flowInstance.processing?.flow?.subFlow?.[subFlow.id]?.checked !== flowStarted
                const status = {
                    id: subFlow.id,
                    need,
                    needReason: need ? "scaffold_flow" : undefined,
                    can: undefined,
                    children: []
                }
                if( options.withPrimitives){
                    status.primitive = subFlow
                }
                map[status.id] = status

                    
                const pp = functions.getPrimitives ? functions.getPrimitives(subFlow) : subFlow.primitives
                const checkListIds = [
                    ...pp.imports.allIds, 
                    ...pp.inputs.allIds,
                ]
                console.log(`Missing subflow origin is ${checkListIds.join(", ")}`)
                let can = need
                for(const id of checkListIds ){
                    const resolved = steps.find(d=>getConfigId(d) === id)
                    console.log(`Resolved ${id} to ${resolved?.id} / ${resolved?.plainId} / ${resolved?.title}`)
                    let thisCan = false
                    if( resolved ){
                        await setupStep( resolved, status)
                        if( map[resolved.id].skip ){
                            continue
                        }
                        if( map[resolved.id].routing ){
                            continue
                        }
                        if( need ){
                            const hasValidStart    = flowInstance.processing?.flow?.started !== undefined;
                            const otherFlowStarted = resolved.processing?.flow?.started;
                            const isComplete       = resolved.processing?.flow?.status === "complete" || resolved.processing?.flow?.status === "error_ignore";
                            const timingOk = otherFlowStarted <= flowStarted;
                            
                            thisCan = (hasValidStart && isComplete && timingOk);
                        }
                    }else{
                        if( getOrigin(flowInstance) === id){
                            thisCan = true
                        }else{
                            console.log(`Couldnt resolve ${id} in flowinstance status check`)
                        }
                    }
                    can &&= thisCan
                }
                if( can ){
                    status.can = true
                    status.canReason = "all_ready"
                    
                }
            }
        }

        
        for( const step of steps){
            await setupStep(step)
        }
        for(const id of Object.keys(map)){
            const thisItem = map[id]
            if( thisItem.routing ){
                const nodesToUpdate = Object.values(map).filter(d=>d.children.some(d2=>d2.id === thisItem.id))
                for(const updateNode of nodesToUpdate){
                    updateNode.children = updateNode.children.filter(d=>d.id !== thisItem.id)
                    updateNode.children.push(...thisItem.children)
                }
                delete map[id]
            }
        }
        return map

    },async canStepRun(flowInstance, step, stepState, functions = {}, options = {}){
        let flowStarted = flowInstance.processing?.flow?.started
        let can = true
        let canReason = "all_ready"

        async function fetchImports( importIds ){
            if( !options.cache ){
                return await functions.fetchPrimitives(importIds)
            }
            let importPrimitives = importIds.map(d=>options.cache[d]).filter(d=>d)
            if( importPrimitives.length !== importIds.length){
                console.log(`-- Cache miss - fetching importIds`)
                importPrimitives = await functions.fetchPrimitives( importIds )
            }
            return importPrimitives
        } 


        async function checkOutstandingSource( rel ){
            let can = true
            let inAncestor = false
            const pp = functions.getPrimitives(step).fromPath(rel)
            const importIds = pp.uniqueAllIds
            if( importIds.length > 0){
                const importPrimitives = await fetchImports( importIds)
                for(const baseImp of importPrimitives){
                    if( !can ){
                        continue
                    }
                    const baseId = baseImp.id
                    if( !stepState[baseId] ){
                        if( baseId !== flowInstance.id){
                            console.warn( `No state for ${baseId} when processing ${step.id}`)
                        }
                    }else{
                        if( stepState[baseId].skip ){
                            continue
                        }
                        if( stepState[baseId].routing ){
                            continue
                        }
                    }
                    let imp = baseImp
                    const originId = Object.entries(imp._parentPrimitives ?? imp.parentPrimitives ?? {}).find(d=>d[1].includes("primitives.origin"))?.[0]
                    if( imp.type === "segment"){
                        if( step.type === "flowinstance"){
                            console.log(`Got segment import for instance of sub flow`)
                            const parentStep = (await fetchImports( [originId] ))[0]
                            if( !parentStep || (parentStep.id !== flowInstance.id && !Object.keys(parentStep._parentPrimitives ?? parentStep.parentPrimitives ?? {}).includes( flowInstance.id ))){
                                throw `mismatch on segment origin ${parentStep.id} not a child of flowInstance ${flowInstance.id}`                                
                            }
                            imp = parentStep
                        }else{
                            throw "Need to move to segment origin to get flow step?"
                        }
                    }
                    if( imp.type === "category" ){
                        console.log(`-- Got category ${imp.id} / ${imp.plainId} for ${rel} - checking parent`)
                        const parent = (await fetchImports( [originId] ))[0]
                        if( parent ){
                            console.log(`-- Got parent of catgeory  = ${parent.id} / ${parent.plainId}`)
                            imp = parent
                        }else{
                            console.log(`-- Couldnt get parent`)
                        }

                    }
                    if( imp.id !== flowInstance.id){
                        if( !Object.keys(imp._parentPrimitives ?? imp.parentPrimitives ?? {}).includes(flowInstance.id) ){
                            console.log(`-- ${imp.id} / ${imp.plainId} not in this flow instance - checking ancestors`)
                            const chainResult = await functions.relevantInstanceForFlowChain( [imp], [flowInstance.id])
                            if( chainResult.length === 0){
                                console.log(`${imp.id} / ${imp.plainId} is not linked to flow instance ${flowInstance.id} / ${flowInstance.plainId} for ${step.id} / ${step.plainId}`)
                                can = false
                                continue
                            }else{
                                inAncestor = true
                                console.log(`-- found in ancestor chain`)
                            }
                        }
                    }
                    const isSameFlow       = imp.id === flowInstance.id;
                    const hasValidStart    = flowStarted !== undefined;
                    const otherFlowStarted = imp.processing?.flow?.started;
                    const isComplete       = imp.processing?.flow?.status === "complete" || imp.processing?.flow?.status === "error_ignore" ;

                    const timingOk = !inAncestor ? otherFlowStarted <= flowStarted : otherFlowStarted <= flowStarted;
                    const importPrimValid = isSameFlow || (hasValidStart && isComplete && timingOk);

                    //console.log(`Checking status of ${rel} step ${imp.id} / ${imp.plainId} = ${importPrimValid} for ${step.id} / ${step.plainId}`)
                    can = can && importPrimValid
                }
            }
            return !can
        }
        const waitImports = await checkOutstandingSource( "imports" )
        const waitInputs = await checkOutstandingSource( "inputs" )
        let waitAxis = false
        if( step.type === "view" || step.type === "query" ){
            const waitAxisCol = await checkOutstandingSource( "axis.column" )
            const waitAxisRow = await checkOutstandingSource( "axis.row" )
            waitAxis = waitAxisCol || waitAxisRow
        }
        if( waitImports || waitInputs || waitAxis){
            canReason = ""
            if( waitImports){
                canReason = "data_"
            }
            if( waitInputs){
                canReason += "inputs_"
            }
            if( waitAxis){
                canReason += "axis_"
            }
            canReason += "not_ready"
            can = false
        }
        return {can, canReason}
    },doFilter: ({resolvedFilterType, filter, setToCheck, lookups, check, scope, includeNulls, isRange}, fns)=>{
            const invert = filter.invert ?? false
            const temp = []
            const hasScope = Array.isArray(scope) && scope.length > 0;
            const hScope   = hasScope ? new Set(scope) : null;

            let doCheck
            if( isRange ){
                let c = check.find(Boolean)
                if( !c || c.hasOwnProperty("min_value") || c.hasOwnProperty("max_value") ){
                    doCheck =  (d)=>{
                        return check.find(c=>{
                            if( !c || (c.min_value === null && c.max_value === null) ){
                                return (d === null || d === undefined)
                            }
                            return (d >= (c.min_value ?? -Infinity) && d <= (c.max_value ?? Infinity))
                        }) !== undefined
                    }
                }else if( c.hasOwnProperty("gte") ){
                    doCheck =  (d)=>{
                        return check.find(c=>{
                            return d >= c.gte
                        }) !== undefined
                    }
                }else if( c.hasOwnProperty("lte") ){
                    doCheck =  (d)=>{
                        return check.find(c=>{
                            return d <= c.lte
                        }) !== undefined
                    }
                }
            }else if( resolvedFilterType === "segment_filter"){
                doCheck = (d)=>{
                    return fns.findFilterMatches(d, check)
                }
            }else{
                const checkSet = new Set(check);
                doCheck = (d) => {
                    if (Array.isArray(d)) {
                        for (const v of d) {
                            if (checkSet.has(v)) return true;
                        }
                        return false;
                    }
                    if (d === null) {
                        return checkSet.has(undefined);
                    }
                    return checkSet.has(d);
                };
            }

            let idx = 0
            for(const d of setToCheck){
                let data
                if( resolvedFilterType === "title"){
                    data = lookups[idx].map(d=>d.title)
                }
                else if( resolvedFilterType === "parameter"){
                    const parts = filter.param.split(".");
                    if( parts.length > 1){
                        data = lookups[idx].flatMap(d=>{
                            const r = PrimitiveConfig.decodeParameterFromParts(d.referenceParameters, parts) 
                            return Array.isArray(r) && r.length === 0 ? undefined : r
                        })
                    }else{
                        data = lookups[idx].flatMap(d=>{
                            const r = d.referenceParameters[parts[0]]
                            return Array.isArray(r) && r.length === 0 ? undefined : r
                        })
                    }
                    //data = data.flatMap(d=>Array.isArray(d) && d.length === 0 ? undefined : d)
                }else if( resolvedFilterType === "type"){
                    data = lookups[idx].map(d=>d.referenceId)
                }else if( resolvedFilterType === "not_category_level1"){
                    const parentIds = lookups[idx].map(d=>fns.parentIds(d)).flat()
                    data = scope.filter(d=>parentIds.includes(d))
                }else if( resolvedFilterType === "segment_filter"){
                    data = lookups[idx].map(d=>{
                        return d.referenceParameters?.importConfig?.flatMap(d=>d.filters).map(d=>{
                            if(d.type === "parameter" || d.type === "title"){
                                delete d["sourcePrimId"]
                            }
                            return d
                        })
                    })                        
                }else if( resolvedFilterType === "parent"){
                    const seen = new Set();
                    data = []
                    for (const obj of lookups[idx]) {
                        const ids = filter.sourcePrimId ? fns.parentIds(obj) : [obj.id];
                        for (const id of ids) {
                            if ((!hasScope || hScope.has(id)) && !seen.has(id)) {
                                seen.add(id);
                                data.push(id);
                            }
                        }
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
                //out += `- **${nextR.heading}:** `
            }
        }
        if( nextR?.content ){
            if( nextR?.type?.match(/list/) ){
                let asArray = nextR.content ?? []

                if( typeof(nextR.content) === "string"){
                    asArray = nextR.content.trim().split(/\n/)
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
                let val = nextR.content
                if(val.trim().startsWith("- ")){
                    val = val.slice(1).trim()
                }
                out += `${val}\n`
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