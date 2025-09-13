import Konva from "konva";
import { Util } from 'konva/lib/Util'
import CustomImage  from "./CustomImage";
import CustomText from "./CustomText";
import PrimitiveConfig, { flattenStructuredResponse } from "./PrimitiveConfig";
import CollectionUtils from "./CollectionHelper";
import moment from "moment";
import MainStore from "./MainStore";
import { renderToString } from "react-dom/server";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { compareTwoStrings, convertOrganizationFinancialData, extractHashtags, formatNumber, getBaseDomain, getRegisteredDomain, roundCurrency } from "./SharedTransforms";
import { HeroIcon } from "./HeroIcon";
import { cloneElement } from "react";
import WedgeRing from "./WedgeRing";
import { getConfig } from "@testing-library/react";
const typeMaps = {}
const categoryMaps = {}


const defaultWidthByCategory = {
    34: 256,
    63: 256,
    138: 256,
    109: 480,
    122: 320,
    123: 320,
    124: 480,
    125: 320,
    149: 280,
    152: 320
}

export const heatMapPalette = PrimitiveConfig.heatMapPalette

export const categoryColors = [ "#8dd3c7",
                                "#ffffb3",
                                "#bebada",
                                "#fb8072",
                                "#80b1d3",
                                "#fdb462",
                                "#b3de69",
                                "#fccde5",
                                "#d9d9d9",
                                "#bc80bd",
                                "#ccebc5",
                                "#ffed6f"]
export const categoryColors_pastel = [ "#66c5cc", 
    "#f6cf71",
    "#f89c74",
    "#dcb0f2",
    "#87c55f",
    "#9eb9f3",
    "#fe88b1",
    "#c9db74",
    "#8be0a4",
    "#b3b3b3"
]
export const categoryColors2 = [ "#4e79a7",
                                "#f28e2c",
                                "#e15759",
                                "#76b7b2",
                                "#59a14f",
                                "#edc949",
                                "#af7aa1",
                                "#ff9da7",
                                "#9c755f",
                                "#bab0ab"]


export const categoryColors_old = [
                                    '#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD',
                                    '#8C564B', '#E377C2', '#7F7F7F', '#BCBD22', '#17BECF',
                                    '#AEC7E8', '#FFBB78', '#98DF8A', '#FF9896', '#C5B0D5'
                                  ];
export const categoryColors_MUTED = [
    '#6B8E9E', '#D4A76A', '#8FBC8F', '#C85A5A', '#A48ABF',
    '#B07F68', '#D6A5C7', '#A0A0A0', '#C4B76E', '#73A2A8',
    '#B0C4DE', '#F4C2C2', '#BFD8B8', '#E6A19F', '#D0C4D6'
  ];
export const categoryColors_STD = [
    '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
    '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
    '#86BCB6', '#F4A261', '#D98880', '#A5A58D', '#C3C1E3'
  ];

export const tagColors =  {
    Blue: ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb"],
    Green: ["#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a"],
    Yellow: ["#fef9c3", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04"],
    Red: ["#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626"],
    Lime: ["#ecfccb", "#d9f99d", "#bef264", "#a3e635", "#84cc16", "#65a30d"],
    Amber: ["#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#f59e0b", "#d97706"],
    Indigo: ["#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5"],
    Orange: ["#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c"],
    Violet: ["#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed"],
    Cyan: ["#cffafe", "#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2"],
    Emerald: ["#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669"],
    Teal: ["#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488"],
    Sky: ["#e0f2fe", "#bae6fd", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0284c7"]
  };

export const defaultTheme = {
  palette: {
    background: "#ffffff",
    surface: "#f9fafb",
    primary: "#334155",
    secondary: "#94a3b8",
    border: "#e2e2e2",
    muted: "#777777",
    accent: "#7e8184",
    overlay: "#edf3f8",
    placeholder: "#e2e2e2",
    categoryColors,
    tagColors
  },
  fontFamily: "Arial"
};

export const darkNavyTheme = {
  palette: {
    background: "#0f172a",
    surface: "#1e293b",
    primary: "#f1f5f9",
    secondary: "#94a3b8",
    border: "#334155",
    muted: "#cbd5e1",
    accent: "#38bdf8",
    overlay: "#1e293b",
    placeholder: "#475569",
    categoryColors,
    tagColors
  },
  fontFamily: "Arial"
};

export function themeColor(theme, key, fallback) {
  return theme?.palette?.[key] ?? fallback;
}

  function interpolateHexColors(startHex, endHex, steps) {
    // strip “#”, handle shorthand
    const normalize = hex => {
      hex = hex.replace(/^#/, '');
      if (hex.length === 3) {
        hex = hex.split('').map(ch => ch+ch).join('');
      }
      return hex;
    };
  
    const hexToRgb = hex => {
      const h = normalize(hex);
      return {
        r: parseInt(h.slice(0,2), 16),
        g: parseInt(h.slice(2,4), 16),
        b: parseInt(h.slice(4,6), 16),
      };
    };
  
    const rgbToHex = ({r, g, b}) =>
      '#' +
      [r, g, b]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('');
  
    const c1 = hexToRgb(startHex);
    const c2 = hexToRgb(endHex);
  
    if (steps < 2) {
      return [ normalize(startHex).startsWith('#') ? startHex : `#${normalize(startHex)}` ];
    }
  
    const out = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = Math.round(c1.r + (c2.r - c1.r) * t);
      const g = Math.round(c1.g + (c2.g - c1.g) * t);
      const b = Math.round(c1.b + (c2.b - c1.b) * t);
      out.push(rgbToHex({ r, g, b }));
    }
    return out;
  }

function registerRenderer( mappings, callback){
    for(const d of [mappings].flat()){
        let obj = typeMaps
        if( d.type === "categoryId" ){
            obj = categoryMaps
        }
        const ids = [d.id ?? "default"].flat()
        for( const id of ids){
            if( !obj[id]){
                obj[id] = {}
            }
            const configs = d.configs ?? ["default"]
            for( const c of [configs].flat()){
                if( obj[ id ]?.[c] ){
                    console.log(`Overwriting renderer for ${id} / ${c}`)
                }
                obj[ id ][c] = callback
            }
        }
    }

}

function renderWithWidget( primitive, options, mainRender){
    if( options.widgetConfig && options.config !== "widget"){
        const g = new Konva.Group({
            name: "view",
            x:options.x ?? 0,
            y:options.y ?? 0
        })

        let w, h
        const widget = RenderPrimitiveAsKonva( primitive, {config: "widget", data: options.widgetConfig, imageCallback: options.imageCallback, theme: options.theme})
        g.add( widget )
        w = widget.width()
        h = widget.height()

        if( options.widgetConfig.showItems ){
            const px = Math.max(options.x ?? 5, 5)
            const py = Math.max(options.y ?? 5, 5)
            
            const content = mainRender({...options, x: px, y: py, widgetConfig: undefined})
            const contentScale = Math.min(1, (w - px - px) / content.width() )
            content.scale({x:contentScale, y:contentScale})
            content.y(h)
            g.add(content)
            
            h = h + py +(content.height() * contentScale)
        }

        g.width( w )
        g.height( h )
        
        return g
    }
    return mainRender(options)
}

export function RenderSetAsKonva( primitive, list, options = {} ){
    if( !list ){
        return
    }
    let config = "set_" + (options.config || "default")
    let source =  list?.[0]
    let referenceId =  options.referenceId ?? source?.referenceId ?? source?.primitive?.referenceId
    let renderer = categoryMaps[referenceId]?.[config] ?? typeMaps[ source?.type ]?.[config]
    if( !renderer ){
        renderer = typeMaps[ "default" ]?.[config]
    }

    if( !renderer ){
        console.warn(`Cant find renderer for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${config}`)
        return
    }
    const themedOptions = { ...options, theme: options.theme ?? defaultTheme };
    return renderer(primitive, {list:list, ...themedOptions, config: options.config} )
}
export function RenderPrimitiveAsKonva( primitive, options = {} ){
    if( !primitive){
        return
    }
    let config = options.config || "default"
    let renderer = categoryMaps[primitive.referenceId]?.[config] ?? typeMaps[ primitive.type ]?.[config]  ?? typeMaps[ primitive.type ]?.["default"]
    if( !renderer ){
        renderer = typeMaps[ "default" ]?.[config]
    }
    if( !renderer ){
        console.warn(`Cant find renderer for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${config}`)
        return
    }

    const themedOptions = { ...options, theme: options.theme ?? defaultTheme };
    return renderWithWidget( primitive, themedOptions, (options)=>renderer(primitive, options))

}
registerRenderer( {type: "default", configs: "set_dials"}, (primitive, options = {})=>{
    const theme = options.theme ?? defaultTheme;
    const config = {width: 60, height: 30, padding: [2,2,2,2], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }
    let g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height
    })
        const items = options.list

        const pad = options.inTable ? config.height / 2 : 0
        
        const w = config.width - config.padding[3] - config.padding[1]
        const h = (config.height - pad - config.padding[0] - config.padding[2])
        const r = new Konva.Rect({
            x: config.padding[3],
            y: config.padding[0] + (pad / 2),
            width: w,
            height: h,
            fill: themeColor(theme, 'surface', '#f9fafb'),
            name: "background"
        })
        g.add(r)

        const colorscheme = primitive.renderConfig?.colors ?? "green"
        let colors = {
            green: [undefined, "#bbf7d0", "#86efac", "#4ade80"],
            blue: [undefined, "#bfdbfe", "#93c5fd", "#3b82f6"],
        }[colorscheme] ?? [undefined, "#bbf7d0", "#86efac", "#4ade80"]


        if( items.length > 0 ){
            let showTitle = !options.inTable
            if( options.checkMap ){
                const score = items.map(d=>d.parentPrimitiveIds.map(d=>options.checkMap[d] ?? 0)).flat().reduce((a,c)=>a > c ? a : c, 0)

                if( showTitle ){
                    const text = new CustomText({
                        fontSize: 7,
                        text: primitive.title,
                        align:"center",
                        wrap: false,
                        ellipsis: true,
                        verticalAlign:"middle",
                        bgFill: themeColor(theme, 'overlay', '#f3f4f6'),
                        x: 0,
                        y: config.height - 9,
                        width: config.width,
                        height: 12,
                        refreshCallback: options.imageCallback
                    })
                    g.add(text)
                }
                const ah = h - (showTitle ? 10 : 0)
                    var arc1 = new Konva.Rect({
                        x: config.padding[3],
                        y: config.padding[0] + (pad / 2),
                        width: w,
                        height: ah,
                        fill: themeColor(theme, 'overlay', '#eee'),
                        stroke: themeColor(theme, 'border', '#ccc'),
                        strokeWidth: 0.5,
                    });
                  g.add(arc1)
                const p = w / 3
                const dx = p * 0.1
                for(let i = 0; i < score; i++){
                    var arc = new Konva.Rect({
                        x: config.padding[3] + (p * i) + dx,
                        y: config.padding[0] + dx + (pad / 2),
                        width: p - dx - dx,
                        height: ah - dx - dx,
                        fill: colors[i + 1],
                        stroke: '#ccc',
                        strokeWidth: 0.5,
                    });
                    g.add(arc)
                }
            }

        }

    if( options.getConfig){
        config.cachedNodes = g
        return config
    }else{
        if( options.cachedNodes ){
            options.cachedNodes.destroy()
        }
    }


    return g
})
registerRenderer( {type: "default", configs: "datatable_checktable"}, ({table, cell, renderOptions, ...options})=>{
    const config = {width: 60, height: 60, padding: [2,2,2,2]}
    let g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height
    })
        
        const w = config.width - config.padding[3] - config.padding[1]
        const h = config.height - config.padding[0] - config.padding[2]
        const r = new Konva.Rect({
            x: config.padding[3],
            y: config.padding[0],
            width: w,
            height: h,
            fill: '#f9fafb',
            name: "background"
        })
        g.add(r)


        if( cell.count > 0 ){

                const cScale = Math.min(w,h * 0.75) / 500 
                const dim = 500 * cScale
                const points = [
                    100, 300, 200, 400, 400, 100
                ].map(d=>d * cScale)
                
                const polyline = new Konva.Line({
                    points: points,
                    x: config.padding[3] + ((w - dim) / 2),
                    y: config.padding[0] + ((h - dim) / 2),
                    stroke: "black",
                    strokeWidth: 2,
                    lineJoin: 'round',
                    lineCap: 'round',
                    closed: false
                });
                g.add(polyline)

        }


    if( options.getConfig){
        return config
    }

    return g
})
/*registerRenderer( {type: "default", configs: "set_checktable"}, (primitive, options = {})=>{
    const config = {width: 60, height: 60, padding: [2,2,2,2], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }
    let g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height
    })
        const items = options.list
        
        const w = config.width - config.padding[3] - config.padding[1]
        const h = config.height - config.padding[0] - config.padding[2]
        const r = new Konva.Rect({
            x: config.padding[3],
            y: config.padding[0],
            width: w,
            height: h,
            fill: '#f9fafb',
            name: "background"
        })
        g.add(r)

        //const colors = [undefined, "#aaa", "#666", "black"]
        const colors = [undefined, "#bbf7d0", "#86efac", "#4ade80"]

        if( items.length > 0 ){
            if( options.checkMap ){
                const score = items.map(d=>d.parentPrimitiveIds.map(d=>options.checkMap[d] ?? 0)).flat().reduce((a,c)=>a > c ? a : c, 0)

                var circle = new Konva.Circle({
                    x: config.padding[3] + (w/ 2),
                    y: config.padding[0] + (h / 2),
                    radius: w * 0.4,
                    fill: 'white',
                    stroke: "black",
                    strokeWidth:1,
                  });
                  g.add(circle)
                var arc = new Konva.Arc({
                    x: config.padding[3] + (w/ 2),
                    y: config.padding[0] + (h / 2),
                    innerRadius: 0,
                    outerRadius: w * 0.4,
                    angle: 120 * score,
                    rotation: 270,
                    fill: colors[score],
                    strokeWidth: 1,
                  });
                  g.add(arc)
            }else{

                const cScale = Math.min(w,h * 0.75) / 500 
                const dim = 500 * cScale
                const points = [
                    100, 300, 200, 400, 400, 100
                ].map(d=>d * cScale)
                
                const polyline = new Konva.Line({
                    points: points,
                    x: config.padding[3] + ((w - dim) / 2),
                    y: config.padding[0] + ((h - dim) / 2),
                    stroke: "black",
                    strokeWidth: 2,
                    lineJoin: 'round',
                    lineCap: 'round',
                    closed: false
                });
                g.add(polyline)
            }

        }


    if( options.getConfig){
        config.cachedNodes = g
        return config
    }else{
        if( options.cachedNodes ){
            options.cachedNodes.destroy()
        }
    }


    return g
})*/
registerRenderer( {type: "default", configs: "set_totalValue"}, (primitive, options = {})=>{
    const config = {width: 130, height: 60, padding: [5,5,5,5], ...(options.renderConfig ?? {})}

    const renderWidth = (config.width - config.padding[3] - config.padding[1]) 
    const renderHeight = config.height - config.padding[0] - config.padding[2]

    if( options.getConfig){
        const years = parseInt(primitive.renderConfig?.range ?? "1") 
        const endDate = primitive.renderConfig?.end ?? new Date()
        const startDate = moment(endDate).subtract(years, "year")

        let sourceData = options.list.map(d=>(d.referenceParameters.allFundingRoundInfo ?? []).map(d=>({date: d.annouced, amount: d.amount}))).flat()
        console.log(`Got ${sourceData.length} total`)
        sourceData = sourceData.filter(d=>d.date <= endDate && d.date >= startDate)
        console.log(`Got ${sourceData.length} filtered`)
        const total = sourceData.reduce((a,d)=>a+ (d.amount ?? 0), 0)
        

        config.data = total
        return config
    }
    const total = options.data ?? 0
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height
    })
    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: renderHeight,
        fill: "white",
        name: "background"
    })
    const t = new CustomText({
        x: config.padding[3],
        y: config.padding[0],
        fontSize: 24,
        lineHeight: 1.5,
        text: roundCurrency( total ),
        align:"center",
        verticalAlign:"middle",
        fill: '#334155',
        wrap: false,
        width: renderWidth,
        refreshCallback: options.imageCallback
    })
    t.y (config.padding[0] + (renderHeight - t.height())/2 )
    g.add(r)
    g.add(t)

    return g
})

function getTextColor(hexColor) {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16) / 255;
    const g = parseInt(hexColor.slice(3, 5), 16) / 255;
    const b = parseInt(hexColor.slice(5, 7), 16) / 255;

    // Calculate luminance
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Return black or white text color based on luminance
    return luminance > 0.5 ? 'black' : 'white';
}

function mixHexWithWhite(hex, opacity = 0.25) {
    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Calculate the new RGB values by blending each channel with white (255)
    const newR = Math.round((1 - opacity) * r + opacity * 255);
    const newG = Math.round((1 - opacity) * g + opacity * 255);
    const newB = Math.round((1 - opacity) * b + opacity * 255);

    // Convert the new RGB values back to hex
    const toHex = (value) => value.toString(16).padStart(2, '0');
    const newHex = `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;

    return newHex;
}
registerRenderer( {type: "categoryId", id: 29, configs: "set_investment_landscape"}, (primitive, options = {})=>{
    const config = {width: 320, height: 160, fontSize: 20, padding: [15,15,15,15], ...(options.renderOptions ?? {}), ...(options.renderConfig ?? {})}
    if( options.getConfig){
        return config
    }
    if( !options.list ){
        return undefined
    }
    const g = new Konva.Group({
        id: options.id,
        name:"inf_track primitive inf_keep",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height,
        id: primitive.id
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        shadowBlur: 10,
        shadowOffset: { x: 3, y: 3 },
        shadowOpacity: 0.5,

        fill: "white",
        cornerRadius: 10,
        name: "background"
    })

    const pe_stages = ["Private Equity"]
    const vc_stages = ["Angel Round","Seed Round", "Series A", "Series B", "Series C", "Series D", "Series E", "Series F", "Series G", "Series H", "Series I", "Venture Round", "Pre-Seed"]
    const vcBacked = options.list.filter(d=>d.referenceParameters?.fundingRounds && d.referenceParameters?.fundingRounds.find(d=>vc_stages.includes(d)))
    const peBacked = options.list.filter(d=>d.referenceParameters?.fundingRounds && d.referenceParameters?.fundingRounds.find(d=>pe_stages.includes(d)))
    const sections = [
        {
            title: "Total",
            number: options.list.length,
            line: true
        },
        {
            title: "Raised <$1m",
            number: vcBacked.filter(d=>d.referenceParameters?.funding && d.referenceParameters?.funding < 1000000).length            
        },
        {
            title: "Raised $1m-$50m",
            number: vcBacked.filter(d=>d.referenceParameters?.funding >= 1000000 && d.referenceParameters?.funding < 50000000).length            
        },
        {
            title: "Raised >$50m",
            number: vcBacked.filter(d=>d.referenceParameters?.funding >= 5000000).length            
        },
        {
            title: "PE Backed",
            number: peBacked.length            
        }
    ]

    const sectionWidth = (config.width - config.padding[3] - config.padding[1]) / sections.length
    const sPadding = sectionWidth * 0.05

    let x = config.padding[3]
    for( const section of sections){
        const sg = new Konva.Group({
            name:"inf_track",
            x: x,
            y: config.padding[0],
            width: sectionWidth,
            height: config.height - config.padding[2] - config.padding[0]
        })
        g.add(sg)
        const t = new CustomText({
            x: sPadding,
            y: 10,
            width: sectionWidth - 2 * sPadding,
            height: config.fontSize * 2.5,
            align:"center",
            fontSize: config.fontSize * 2.5,
            text: `**${section.number}**`,
            fontFamily: "poppins",
            fontStyle: "bold",
            withMarkdown: true,
            fill: "black",
            refreshCallback: options.imageCallback
        })
        sg.add(t)
        const t2 = new CustomText({
            x: sPadding,
            y: 10 + (t.height() * 1.2),
            width: sectionWidth - 2 * sPadding,
            align:"center",
            fontSize: config.fontSize,
            text: section.title,
            fontFamily: "poppins",
            fontStyle: "bold",
            withMarkdown: true,
            fill: "black",
            wrap: true,
            refreshCallback: options.imageCallback
        })
        sg.add(t2)
        if( section.line){
            sg.add(new Konva.Line({
                points: [sectionWidth, 10, sectionWidth, sg.height() - 10],
                strokeWidth: 1,
                stroke: '#999'
            }))
        }
        x += sectionWidth
        

    }

    g.add(r)
    return g

})

registerRenderer( {type: "default", configs: "set_timeseries"}, (primitive, options = {})=>{
    const config = {width: 128, height: 80, padding: [5,5,5,5], fontSize: 8, ...(options.renderConfig ?? {}), ...(options.renderOptions ?? {})}
    if( !options.list ){
        return undefined
    }
    const alignScale = primitive.renderConfig?.align_scale ??"no"
    const doBoth = alignScale === "both"
    if( doBoth && options.getConfig){
        if( !options.renderConfig.width){
            options.config = options.config * 2
        }
    }

    let locateThreshold //= 0.15
    let location
    let showPercChange = false
    let showEndValue = true

    const renderWidth = (config.width - config.padding[3] - config.padding[1]) * (doBoth ? 0.45 : 1)
    const tHeight = config.height - config.padding[0] - config.padding[2]
    const renderHeight = tHeight - (config.show_x_label ? config.fontSize * 1.2 : 0) - (showEndValue || showPercChange ? config.fontSize * 2.2 : 0)
    let period = "month"


    if( options.getConfig){
        const years = parseInt(primitive.renderConfig?.range ?? "1") 
        const endDate = moment(primitive.renderConfig?.end ? new Date(primitive.renderConfig?.end) : new Date())
        const startDate = moment(endDate).subtract(years, "year")
        //const startDate = moment(endDate).subtract(1, "Q").toDate()
        config.data = {
            startDate: startDate.format("YYYY"),
            endDate: endDate.format("YYYY"),
            series: CollectionUtils.convertToTimesSeries( 
                                        options.list, 
                                        {
                                            dataset: primitive.renderConfig?.set ?? options.renderConfig?.viewConfig?.set,
                                            dateField: primitive.renderConfig?.dateField ?? options.renderConfig?.viewConfig?.dateField,
                                            field: primitive.renderConfig?.field ?? options.renderConfig?.viewConfig?.field,
                                            cumulative: false,
                                            startDate: startDate,
                                            endDate: endDate,
                                            period: period
                                        })}
        return config
    }
    const series = options.data.series
    

    if( locateThreshold ){
        let maximum = Math.max(...series)
        location = series.findIndex(d=>d >= (locateThreshold * maximum))
    }

    
    const g = new Konva.Group({
        id: options.id,
        name:"inf_track inf_keep primitive",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height,
        id: primitive.id
    })
    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: tHeight,
        fill: "transparent",
        name: "background"
    })



    const palette = options.theme?.palette?.categoryColors ?? categoryColors
    let color = "#00bc7d" //primitive.renderConfig?.color ? palette[primitive.renderConfig?.color] : "#0ea5e9"


    if( options.renderConfig?.viewConfig?.scheme === "under_over" ){
        const cleaned = series.filter(d=>d)
        const first = cleaned[0]
        const last = cleaned[ cleaned.length - 1 ]
        color = "#000000"
        if( last > first ){
            color = "#22c55e"
        }else if( last < first ){
            color = "#dc2626"
        }
    }

    let fadeColor = mixHexWithWhite(color, 0.5)


    let offsetX = 0
    const len = series.length
    g.add(r)
    function renderPlot(alignScale){
        const maxValue = (alignScale ? (options.globalData?.maximumValue ?? 0) : series.reduce((a,c)=>c > a ? c : a, -Infinity)) + 1
        const minValue = (alignScale ? (options.globalData?.minimumValue ?? 0): series.reduce((a,c)=>c < a ? c : a, Infinity))- 1

        const range = maxValue - minValue
        
        const dx = renderWidth / (len - 1)
        const lineMargin = 0//renderHeight * 0.1
        const scale = (renderHeight - lineMargin - lineMargin) / range
        const points = series.flatMap((d,i)=>[offsetX + (i * dx), renderHeight - lineMargin - (scale * (d - minValue))] )
        const lower = series.flatMap((d,i)=>[ offsetX + (len - 1 - i) * dx, renderHeight - lineMargin ])

        const shaded = [
            ...points,
            ...lower
        ]


        for(const d of points){
            if(isNaN(d)){
                console.log('err')
            }
        }
        const plotY = config.padding[0] + (showEndValue || showPercChange ? config.fontSize * 2.2 : 0)

        const l2 = new Konva.Line({
            x: config.padding[0],
            y: plotY,
            points: shaded,
            strokeEnabled: false,
            fillLinearGradientStartPoint: { x: renderWidth / 2, y: 0 },
            fillLinearGradientEndPoint: { x: renderWidth / 2, y: renderHeight },
            fillLinearGradientColorStops: [0, fadeColor, 0.8, 'white'],
            closed: true
        })
        g.add(l2)

        
        const l = new Konva.Line({
            x: config.padding[0],
            y: plotY,
            points: points,
            strokeWidth: 1,
            strokeScaleEnabled: false,
            stroke: color
        })
        g.add(l)

        if( location ){
            let locationX = (location * dx)

            const r = new Konva.Rect({
                x: offsetX + config.padding[1] + locationX,
                y: config.padding[0],
                width: renderWidth - locationX,
                height: renderHeight,
                strokeWidth: 1,
                strokeScaleEnabled: true,
                stroke: fadeColor
            })
            g.add(r)
            const r2 = new Konva.Rect({
                x: offsetX + config.padding[0] + locationX - (dx / 2),
                y: config.padding[1],
                width: dx,
                height: renderHeight,
                strokeWidth: 1,
                strokeScaleEnabled: true,
                fill: color
            })
            g.add(r2)
            const count = len -location
            const px = offsetX + config.padding[1] + locationX - dx
            const t = new CustomText({
                x: px,
                y: config.padding[0] + (renderHeight / 2),
                fontSize: config.fontSize,
                lineHeight: 1,
                text: `${count} ${period}${count === 1 ? "" : "s"}`,
                verticalAlign:"middle",
                fill: color,
                refreshCallback: options.imageCallback
            })
            t.x( px - t.width())
            g.add(t)

        }
        if( showPercChange ){
            const withValues = series.filter(d=>d)
            const first = withValues[0]
            const last = withValues[withValues.length - 1]
            const perc = (first && last) ? ((last - first) / first * 100).toFixed(2) : "-"

            const t = new CustomText({
                x: 0,
                y: config.padding[0],
                fontSize: config.fontSize,
                lineHeight: 1,
                text: `${perc}%`,
                verticalAlign:"top",
                fill: color,
                refreshCallback: options.imageCallback
            })
            t.x( renderWidth - t.width())
            g.add(t)

        }
        if( showEndValue ){
            const withValues = series.filter(d=>d)
            const last = withValues[withValues.length - 1]

            {

                const t = new CustomText({
                    x: 0,
                    y: config.padding[0],
                    fontSize: config.fontSize * 2,
                    lineHeight: 1,
                    text: roundCurrency(last),
                    verticalAlign:"top",
                    fill: color,
                    refreshCallback: options.imageCallback
                })
                t.x( config.padding[3] + renderWidth - t.width())
                g.add(t)
            }
            {
                const t = new CustomText({
                    x: config.padding[3],
                    y: config.padding[0],
                    fontSize: config.fontSize * 2,
                    lineHeight: 1,
                    text: roundCurrency(withValues[0]),
                    verticalAlign:"top",
                    fill: color,
                    refreshCallback: options.imageCallback
                })
                g.add(t)
            }
                
        }
        if( config.show_x_label){
            const axisY = renderHeight + plotY + config.fontSize * 0.3
            const st = new CustomText({
                x: config.padding[3],
                y: axisY,
                fontSize: config.fontSize,
                lineHeight: 1,
                text: options.data.startDate,
                verticalAlign:"top",
                fill: "#999",
                refreshCallback: options.imageCallback
            })
            g.add(st)

            const et = new CustomText({
                x: 0,
                y: axisY,
                fontSize: config.fontSize,
                lineHeight: 1,
                text: options.data.endDate,
                verticalAlign:"top",
                fill: '#999',
                refreshCallback: options.imageCallback
            })
            et.x( config.padding[3] + renderWidth - et.width())
            g.add(et)/*
            g.add(new Konva.Line({
                points: [
                    config.padding[3], renderHeight + plotY + config.fontSize * 0.15,
                    config.padding[3] + renderWidth, renderHeight + plotY + config.fontSize * 0.15,
                ],
                stroke: "#999",
                strokeWidth: 1
            }))*/

        }
        offsetX += renderWidth + (renderWidth / 4.5)

    }
    
    if( series.length > 0){
        if(doBoth || alignScale === "yes"){
            renderPlot(true)
        }
        if(doBoth || alignScale === "no"){
            renderPlot(false)
        }
    }




    return g
})
/*registerRenderer( {type: "default", configs: "set_heatmap"}, (primitive, options = {})=>{
    const renderOptions = options.renderOptions
    const config = {width: 128, height: 128, padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }
    let range = options.range ?? [0,0]
    let totals = options.totals ?? [0]
    let title = ""
    if(!options.inTable){

        if( renderOptions?.group_by === "row"){
            totals = options.rowTotal?.[options.rIdx]
            range = options.rowRange?.[options.rIdx]
            title = options.colTitles?.[options.cIdx]
        }else if( renderOptions?.group_by === "col"){
            totals = options.colTotal?.[options.cIdx]
            range = options.colRange?.[options.cIdx]
            title = options.rowTitles?.[options.rIdx]
        }
    }

    const colors = heatMapPalette.find(d=>d.name === (renderOptions?.colors ?? "default"))?.colors ?? heatMapPalette[0].colors
    const textColors = heatMapPalette.find(d=>d.name === (renderOptions?.colors ?? "default"))?.text_colors ?? colors.map(d=>"black")
    range ||= [0,0]
    const spread = range[1] - range[0] + 1
    
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height
    })
    const items = options.list

    const idx = Math.floor((items.length - range[0]) / spread * colors.length) 

    if( renderOptions.bubble){
        const b = new Konva.Rect({
            x: config.padding[3],
            y: config.padding[0],
            width: config.width - config.padding[3] - config.padding[1],
            height: config.height - config.padding[0] - config.padding[2],
            fill: "transparent",
            name: "background"
        })
        g.add(b)
        const midX = (config.width - config.padding[3] - config.padding[1]) / 2
        const midY = (config.height - config.padding[2] - config.padding[0]) / 2
        const maxR = Math.min(midX, midY)
        const s = items.length
        let r = s ===0 ? (!renderOptions.counts ? 1 : 0) : maxR / spread * (1+(s- range[0]))
        let color = s === 0 && !renderOptions.counts ? "#555" : s === 0 ? "white" : colors[idx]
        if( r > 0){
            const r2 = new Konva.Circle({
                x: config.padding[3] + midX,
                y: config.padding[0] + midY,
                radius: r,
                fill: color
            })
            g.add(r2)
        }
    }else{
        const r2 = new Konva.Rect({
            x: config.padding[3],
            y: config.padding[0],
            width: config.width - config.padding[3] - config.padding[1],
            height: config.height - config.padding[0] - config.padding[2],
            fill: items.length === 0 ? "white" : colors[idx]
        })
        g.add(r2)
    }
    if( renderOptions?.counts){
        const t = new Konva.CustomText({
            x: config.padding[3],
            y: (config.height) / 2,
            text: renderOptions?.counts === "percentage" ? `${(items.length / totals * 100).toFixed(0)}% ` : items.length,
            fontSize: renderOptions.bubble ? 10 : 16,
            fontStyle: renderOptions.bubble ? "bold" : undefined,
            fill: textColors[idx],
            width: config.width - config.padding[3] - config.padding[1],
            align:'center',
            height:20,
            bgFill: 'transparent',
            refreshCallback: options.imageCallback
        })
        g.add(t)
        t.y((config.height - t.textHeight ) /2)

    }else if( renderOptions?.titles){
        const t = new Konva.CustomText({
            x: config.padding[3],
            y: (config.height - 20) / 2,
            text: title,
            fontSize: 16,
            width: config.width - config.padding[3] - config.padding[1],
            fill: textColors[idx],
            wrap: true,
            ellipses: true,
            align:'center',
            //height:20,
            bgFill: 'transparent',
            refreshCallback: options.imageCallback
        })
        g.add(t)
        t.y((config.height - t.height() ) /2)

    }


    if( options.getConfig){
        config.cachedNodes = g
        return config
    }else{
        if( options.cachedNodes ){
            options.cachedNodes.destroy()
        }
    }


    return g
})*/

registerRenderer( {type: "default", configs: "datatable_grid"}, function renderFunc({table, cell, renderOptions, stageOptions, ...options}){
    const items = cell.items
    const config = {columns: 1, padding: [0, 0, 0, 0], spacing: [10,10], ...options}
    const itemWidth = renderOptions.width ?? config.itemSize ?? defaultWidthByCategory[items[0]?.referenceId] ?? 200
    const maxHeight = renderOptions.maxHeight
    let itemCount = items.length

    const referenceIds = items.map(d=>d.referenceId).filter((d,i,a)=>a.indexOf(d) === i)
    if( referenceIds.length > 1){
        console.log(`Multiple types in list, selecting first`)
    }
    
    let cellContentLimit = {
            "result": 50,
            "evidence": 150
        }[items[0]?.type] ?? 150
        
        cellContentLimit = {
            29: 63
        }[referenceIds[0]] ?? cellContentLimit

    let cellShowExtra
    if( cellContentLimit ){
        if( items.length > cellContentLimit){
            //if( options.expand && options.expand.includes([column.idx, row.idx].filter(d=>d).join("-"))){
            if( options.expand && options.expand.includes(cell.id)){
                cellShowExtra = -1
            }else{
                cellShowExtra = items.length - cellContentLimit
                itemCount = cellContentLimit
            }
        }
    }
    
    config.columns = Math.max( renderOptions.columns, options.minColumns ?? 1, 1)
    if( !renderOptions.columns ){
        if( options.width ){
            config.columns = (options.width -  config.padding[1] - config.padding[3] + config.spacing[0]) / (itemWidth + config.spacing[0]) 
        }else{
            config.columns = Math.max(1, Math.floor( Math.sqrt( itemCount ) ))
        }
    }

    let width = (config.columns * itemWidth) + ((config.columns - 1) * config.spacing[0])
    config.width =  width + config.padding[1] + config.padding[3]

    let g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width
    })
    const bgRect = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: width,
        name: "background",
        fill: options.palette?.cells?.background ?? '#f9fafb'
    });
    g.add(bgRect);
    let x = config.padding[3];
    let y = config.padding[0];
    let idx = 0;
    let rows = 0;
    let thisRow = [];

    const columnYs = new Array(config.columns).fill(y);
    const skipForOverflow = new Array(config.columns).fill(false);

    for (let dIdx = 0; dIdx < itemCount; dIdx++) {
        if (idx === 0){
            rows++;
            if( dIdx > 0){
                columnYs.forEach((d, i)=>columnYs[i] = d +  config.spacing[0])
            }
        }

        if (config.maxHeight && skipForOverflow[idx]) continue;

        const data = items[dIdx];
        let node;

        if (data) {
            const rConfig = (options.config === "grid" ? "default" : options.config) ?? "default";
            node = RenderPrimitiveAsKonva(data, {
                config: rConfig,
                x: x,
                y: columnYs[idx],
                onClick: options.primitiveClick,
                width: itemWidth,
                placeholder: stageOptions.placeholder !== false,
                imageCallback: stageOptions.imageCallback,
                utils: options.utils,
                data: options.data,
                sectionConfig: config.sectionConfig,
                ...options.extras
            });
        } else {
            node = addExtraNode(config, options, x, y, itemWidth);
        }

        g.add(node);
        thisRow.push(node);

        const nodeHeight = node.attrs.height;
        const nextY = columnYs[idx] + nodeHeight;

        if (config.maxHeight && nextY > config.maxHeight) {
            skipForOverflow[idx] = true;
            //node.destroy();
            //thisRow.pop();
            node.clipHeight( config.maxHeight - columnYs[idx] )
            columnYs[idx] = config.maxHeight
        } else {
            columnYs[idx] = nextY;
        }

        x += itemWidth + config.spacing[1];
        idx++;

        if (idx === config.columns) {
            idx = 0;
            x = config.padding[3] //+ config.spacing[1];

            if (config.alignHeight && thisRow.length) {
                const maxY = Math.max(...columnYs);
                const maxHeight = thisRow
                                .map(d => d.find('.item_background')[0]?.height() ?? 0)
                                .reduce((a, c) => (a > c ? a : c), 0);

                columnYs.fill(maxY);
                for (const d of thisRow) {
                    d.height(maxHeight);
                    const bg = d.find('.item_background')[0];
                    if (bg) bg.height(maxHeight);
                }
            }

            y = columnYs[idx];
            thisRow = [];
        }
    }
    if( cellShowExtra  ){
        idx = config.columns - 1
        x = (itemWidth + config.spacing[1]) * idx
        columnYs[idx] += config.spacing[0]
        const node = addExtraNode({showExtra: cellShowExtra}, options, x, columnYs[idx], itemWidth);
        columnYs[idx] += node.height() + config.spacing[0]
        g.add(node);
    }

    const maxY = Math.max(...columnYs);
    const newHeight = maxY + config.padding[2];
    bgRect.height(newHeight - config.padding[0] - config.padding[2]);
    g.height(newHeight);
    config.height = newHeight;

    g.attrs.resizeInfo = {
        //padding: config.padding,
        //spacing: config.spacing,
        widthPadding: config.padding[1] + config.padding[3] + ((config.columns - 1) * config.spacing[1]),
        columns: config.columns,
        rows,
    };

    Object.assign(config, config);
    if (options.getConfig) return config;
    return g
})
registerRenderer( {type: "default", configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemSize: 256, columns: 5, spacing: [8,12], itemPadding: [10,12,10,8], padding: [5,5,5,5], ...(options.renderConfig ?? {}), ...(options.renderOptions ?? {})}
    if( config.minWidth ){
        config.itemSize = config.minWidth
    }
    if( !options.list ){
        return undefined
    }
    let items = options.list
    let itemCount = items.length + (config.showExtra ? 1 : 0)


    if( config.minColumns) {
        config.columns = Math.max(config.minColumns, config.columns)
    }
    const fullWidth = config.itemSize + config.itemPadding[1] + config.itemPadding[3]

    const calcWidth = ((Math.max(1, config.columns)  + 1) * config.spacing[1]) + (Math.max(1, config.columns) * fullWidth) + config.padding[1] + config.padding[3]

    if( calcWidth > config.width && !config.columns){
        config.columns = Math.ceil(Math.max(1, ((config.width - config.padding[1] + config.padding[3]) - config.spacing[1]) / (config.itemSize + config.spacing[1])))
    }else{
        config.width = calcWidth
    }

    config.rows = Math.ceil( itemCount / config.columns )


    const width = config.width 
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: width
    })
    let x = config.padding[3] + config.spacing[1]


    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: 0,//config.height - config.padding[0] - config.padding[2],
        fill: '#f9fafb',
        name: "background"
    })
    g.add(r)

    let col = 0
    
    let ypos = new Array( config.columns ?? 1).fill(config.padding[0] + config.spacing[0])
    const {columns, count, ...relayOptions} = options.renderOptions ?? {}

    let skipCol = new Array(ypos.length).fill(false)
    for( let dIdx = 0; dIdx < itemCount; dIdx++){
        const d = items[dIdx]
        let y = ypos[col]
        let node
        let lastNode

        const skip = skipCol[col] || (options.renderOptions.height &&  y >= options.renderOptions.height )
        if( !skip ){
            if( d ){
                if( options.cachedNodes ){
                    node = options.cachedNodes.children.find(d2=>d2.attrs.id === d.id)
                    if( node ){
                        node.remove()
                        node.attrs.placeholder = options.placeholder !== false
                        if(node.children){
                            node.children.forEach(d=>{
                                if(d.className === "CustomImage"|| d.className === "CustomText"){
                                    d.attrs.refreshCallback = options.imageCallback
                                }
                                
                            })
                        }
                    }
                }
                if( !node ){
                    node = RenderPrimitiveAsKonva( d, {
                        config: "default", 
                        x: x, 
                        y: y, 
                        onClick: options.primitiveClick,
                        width: fullWidth, 
                        padding: config.itemPadding, 
                        placeholder: options.placeholder !== false,
                        renderOptions: relayOptions,
                        imageCallback: options.imageCallback
                    })
                }
                if( options.renderOptions.height && (y + node.height()) > options.renderOptions.height ){
                    const delta = options.renderOptions.height - node.y()
                    node.height( delta)
                    node.clipHeight(delta)
                    skipCol[col] = true
                }
            }else{
                col = config.columns - 1
                x = (config.padding[3] + config.spacing[1]) + ((fullWidth + config.spacing[1]) * col)
                y = ypos[col]
                
                node = addExtraNode( config, options, x, y, fullWidth)
            }
        
            if( node ){
                g.add(node)
                ypos[col] += config.spacing[0] + (node.height() ?? 0)
            }
        }
        

        x += fullWidth + config.spacing[1]
        col++
        if( col === config.columns){
            col = 0
            x = config.padding[3] + config.spacing[1]
        }
        lastNode = node
    }
    
    const height = Math.max(ypos.reduce((a,c)=>c > a ? c : a, 0) + config.padding[0] + config.padding[2], config.minHeight ?? 0)
    config.height = height + config.spacing[0]

    if( options.getConfig){
        return config
    }else{
        if( options.cachedNodes ){
            options.cachedNodes.destroy()
        }
    }

    r.height( height )
    g.height( config.height)

    return g
})
registerRenderer( {type: "default", configs: "field"}, (primitive, options = {})=>{
    const config = {showId: true, fontSize: 16, fontFamily: "Arial", width: 128, padding: [10,10,10,10], ...options}
    if( config.minWidth){
        config.width = config.minWidth
    }

    const g = new Konva.Group({
        name:"inf_track primitive",
        id: primitive.id,
        x:options.x ?? 0,
        y:options.y ?? 0
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        fill: '#f9fafb',
        name: "background"
    })
    g.add(r)

    const w = config.width
    let h = config.height ?? 40
    const fullWidth = config.width - config.padding[3] - config.padding[1]

    
    options.format = options.format ?? options.fontStyle

    if( options.field === "icon"){
        if(!options.getConfig){
            const logo = imageHelper( `/api/image/${primitive.id}`, {
                size: config.width,
                y: options.getConfig ? undefined : (h - config.padding[0] - config.padding[2]- config.width)/2,
                linkUrl: primitive.referenceParameters.url,
                padding: config.padding,
                center: true,
                imageCallback: options.imageCallback,
                placeholder: options.placeholder !== false
            })
            g.add(logo)
        }
    }else{

        let value = options.field === "title" ? primitive.title : primitive.referenceParameters[options.field]
        if( options.field.startsWith("cat_")){
            const topCat = options.field.slice(4)
            const matches = primitive.parentPrimitives.filter(d=>d.parentPrimitiveIds.includes(topCat))
            if( matches.length > 0 ){
                value = matches.map(d=>d.title).join("\n")   
            }else{
                value = "None"
            }

        }
        let text = value
        if( options.type === "currency" || options.type === "funding"){
            if( primitive.referenceParameters?.ipo === "public" || primitive.referenceParameters?.ipo === "delisted"  ){
                text = "Private"
            }else{
                if( value ){
                    text = roundCurrency(value ?? 0)
                }else{
                    text = "-"
                }
            }
        }else if( options.field.startsWith("summary_")){
            const sectionNames = options.field.slice(8).split("_")
            text = ""
            for(const sectionName of sectionNames ){
                const section = primitive.referenceParameters.structured_summary?.filter(d=>d.heading.toLowerCase() === sectionName.toLowerCase()).map(d=>{
                    return [
                        d.content,
                        ...(d.subsections ?? []).map(d=>d.content)
                    ]
                }).flat().filter(d=>d).join("\n").trim()
                if( sectionNames.length > 1){
                    text += `**${sectionName}**: `
                    if(section.match(/^\s*-+\s+/)){
                        text += "\n"
                    }
                }
                text += section + "\n\n"
            }
            text = text.trim()
            if( options.format === "bold"){
                text = `**${text}**`
            }
        }else if( options.type === "date_string"){
            text = value?.match(/(\d+)-/)?.[1] ?? "-"
        }else if(options.part){
            if( text ){
                let r1 = new RegExp(`(?:\\*\\*)?(${options.part}):?\\s*(?:\\*\\*)?:?([\\s\\S]*)`, 'i');
                let m = r1.exec(text)
                if( m ){
                    text = m[2]
                    //let r2 = new RegExp(`(?:-\\s+|\\n)?(?:\\*\\*)?(.+):\\s*(?:\\*\\*)?`, 'i');
                    let r2 = new RegExp(`(?:-\\s+|\\n)(?:\\*\\*)?([^-]+):\\s*(?:\\*\\*)?`, 'i');
                    m = r2.exec(text) 
                    if( m ){
                        text = text.slice(0, m.index).replaceAll(/\s*-\s*$/g,"").trim()
                    }
                    text = (text ?? "").trim()
                    if( options.format === "bold"){
                        text = `**${text}**`
                    }
                }else{
                    text = undefined
                }
            }
        }else{
            if( options.format === "bold"){
                text = `**${text}**`
            }
        }
        
        if( text ){
            let y = config.padding[0]
            if(options.heading){
                const t = new CustomText({
                    x: config.padding[3],
                    y: y,
                    fontSize: config.fontSize * 0.8,
                    fontFamily: config.fontFamily,
                    fontStyle:"bold",
                    text: options.heading.toUpperCase(),
                    fill: '#999999',
                    showPlaceHolder: false,
                    wrap: false,
                    bgFill: 'transparent',
                    align:'center',
                    width: fullWidth,
                    withMarkdown: false,
                    ellipsis: false,
                    refreshCallback: options.imageCallback
                })
                g.add(t)
                y += t.height() * 2
            }
            const textHeight = options.getConfig ? undefined : h - config.padding[0] - config.padding[2] 
            
            const t = new CustomText({
                x: config.padding[3],
                y,
                fontSize: config.fontSize,
                fontFamily: config.fontFamily,
                fontStyle: options.format === "light" ? "light" : "normal",
                lineHeight: 1.25,
                text: text,
                fill: '#334155',
                showPlaceHolder: false,
                wrap: true,
                bgFill: 'transparent',
                width: fullWidth,
                withMarkdown: true,
                ellipsis: true,
                refreshCallback: options.imageCallback
            })
            g.add(t)
            if( t.height() > textHeight){
                t.height(textHeight)
            }
            const th = Math.max(t.height(), textHeight ?? 0)
            
          //  t.y( config.padding[0] + (th - t.height())  /2)
        }
    }

    r.width(w)
    r.height(h)
    g.width(w)
    g.height(h)
    if( options.getConfig){
        config.width = w
        config.height = h
        return config
    }
    return g
})
registerRenderer( {type: "categoryId", id: 118, configs: "default"}, (primitive, options = {})=>{
    const config = {showId: true, idSize: 14, width: 256, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }


    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 
    const theme = options.theme ?? defaultTheme;

    const g = new Konva.Group({
        name: "view",
        x:options.x ?? 0,
        y:options.y ?? 0
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        fill: '#f9fafb',
        name: "background"
    })
    g.add(r)
    
    let partials = options.partials ?? []
    const rowUnion = partials.map(d=>d.rowExtents).flat()
    let rowLabels = rowUnion.map(d=>d.label ?? "").filter((d,i,a)=>a.indexOf(d)===i).sort()
    let mainPartial = partials[0]

    let primColumns = []
    let skipMainPrim = false
    if(primitive.referenceParameters?.fields ){
        let fieldList = primitive.referenceParameters?.fields?.split(",").map(d=>d.trim())
        if( fieldList.includes("SKIP")){
            fieldList = fieldList.filter(d=>d!=="SKIP")
            skipMainPrim = true
            partials = partials.slice(1)
        }
        
        const row = mainPartial ? mainPartial.rowExtents?.find(d=>(d.label ?? "") === rowLabels[0]) : undefined
        let subList = row ? mainPartial.list.filter((item)=>(Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx)).map(d=>d.primitive) : []
        if( subList[0]){
            const category = subList[0].metadata

            primColumns = fieldList.map(src=>{
                let [d,w] = src.split("|")

                d = d.trim()
                if(d==="title"){
                    return {
                        label: "Name",
                        field: d,
                        width: w ? parseInt(w) : 200,
                        type: "string"
                    }
                }else if(d==="icon"){
                    return {
                        label: "",
                        field: d,
                        width: w ? parseInt(w) : 60,
                        type: "icon"
                    }
                }
                const param = category.parameters[d]
                    let width = w ? parseInt(w) : (param?.type === "string" || param?.type === "long_string" ? 200 : 100)
                    let height
                    if( d === "description"){
                        width = 600
                        height = 80
                    }
                    return {
                        label: param?.title ?? d,
                        field: d,
                        width,
                        height,
                        type: param?.type
                    }
            }).filter(d=>d)
            console.log(`FIELDS`, primColumns)
        }
    }
    
    const baseRenderConfig = {
                placeholder: options.placeholder !== false, 
                imageCallback: options.imageCallback,
    }

    const cells = []
    let rIdx = 0
    const columns = []
    for(const thisLabel of rowLabels){
        let cIdx = 0
        const row = mainPartial.rowExtents.find(d=>(d.label ?? "") === thisLabel)
        let subList = row ? mainPartial.list.filter((item)=>(Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx)).map(d=>d.primitive) : []
        for( const d of primColumns){
            const cell = {
                cIdx,
                rIdx,
                orIdx: rIdx,
                primitive: subList[0],
                present: row !== undefined,
            }
            cells.push(cell)
            cIdx++
        }
        for(const partial of partials){
            const row = partial.rowExtents.find(d=>(d.label ?? "") === thisLabel)
            let subList = row ? partial.list.filter((item)=>(Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx)).map(d=>d.primitive) : []
            const cell = {
                cIdx,
                rIdx,
                orIdx: rIdx,
                list: subList,
                listLength: subList.length,
                present: row !== undefined,
            }
            cells.push(cell)
            cIdx++
        }
        rIdx++
        cIdx = 0
    }
    rIdx = 0
    const mainstore = MainStore()
    const partialConfig = []
    const pcLength = primColumns.length
    const pScores = []

    let cIdx = pcLength
    for(const partial of partials){
        let configName = partial.viewConfig?.renderType ?? "grid" 
        partialConfig[cIdx - pcLength] = {}
        if( configName === "checktable"){
            const checkFor = [
                partial.axis.column,
                partial.axis.row,
            ].filter(d=>d.type == "category").map(d=>mainstore.primitive(d.primitiveId)).filter(d=>d.referenceId === PrimitiveConfig.Constants.EVALUATOR)                
            const scoreMap = checkFor.reduce((a,d)=>{
                d.primitives.allItems.forEach(d=>{
                    if( d.title === "clearly"){
                        a[d.id] = 3
                    }else if( d.title === "likely"){
                        a[d.id] = 2
                    }else if( d.title === "possibly"){
                        a[d.id] = 1
                    }
                })
                return a
            }, {})
            partialConfig[cIdx - pcLength].checkMap = scoreMap
            rIdx = 0
            for(const thisLabel of rowLabels){
                const cell = cells.find(d=>d.cIdx === cIdx && d.rIdx === rIdx)
                let score = cell.list.map(d=>d.parentPrimitiveIds.map(d=>partialConfig[cIdx - pcLength].checkMap[d] ?? 0)).flat().reduce((a,c)=>a > c ? a : c, 0)
                pScores[rIdx] = (pScores[rIdx] ?? 0) + (score * score)
                rIdx++
            }
        }else if( configName === "dials"){
            const checkFor = [
                partial.axis.column,
                partial.axis.row,
            ].filter(d=>d.type == "category").map(d=>mainstore.primitive(d.primitiveId)).filter(d=>d.referenceId === PrimitiveConfig.Constants.SCORE)                
            const scoreMap = checkFor.reduce((a,d)=>{
                d.primitives.allItems.forEach(d=>{
                    if( d.title === "high"){
                        a[d.id] = 3
                    }else if( d.title === "medium"){
                        a[d.id] = 2
                    }else if( d.title === "low"){
                        a[d.id] = 1
                    }
                })
                return a
            }, {})
            partialConfig[cIdx - pcLength].checkMap = scoreMap
            rIdx = 0
        }
        cIdx++
    }

    if( pScores.length > 0){
        const newOrder = rowLabels.map((d,i)=>[d,i]).sort((a,b)=>pScores[b[1]]-pScores[a[1]])
        newOrder.forEach((d,idx)=>{
            cells.filter(c=>c.orIdx === d[1]).forEach(c=>c.rIdx = idx)
            rowLabels[idx] = d[0]
        })
    }

    rIdx = 0
    for(const thisLabel of rowLabels){
        let cIdx = 0
        for( const d of primColumns){
            const config ={
                    ...baseRenderConfig,
                    config: "field",
                    field: d.field,
                    type: d.type,
                    width: d.width,
                    showId: false,  
                    inTable: true,
                    padding:[5,8,5,8],
                    renderConfig:{
                    }                
            }
            const cell = cells.find(d=>d.cIdx === cIdx && d.rIdx === rIdx)
            const updateConfig = RenderPrimitiveAsKonva( cell.primitive, {...config, getConfig: true})    
            cell.config = {
                ...config,
                ...updateConfig,
                getConfig: false
            }
            cIdx++
        }
        for(const partial of partials){
            const range = rowLabels.map((_,i)=>cells.filter(d=>d.cIdx === cIdx && d.rIdx === i).map(d=>d.listLength))
            const cell = cells.find(d=>d.cIdx === cIdx && d.rIdx === rIdx)
            let minWidth =  defaultWidthByCategory[cell.list[0]?.referenceId] ?? 100
            let preferredWith = primitive.columns?.[cIdx]?.width
            
            let configName = partial.viewConfig?.renderType ?? "grid" 
            const asCounts = partial.viewConfig?.showAsCounts
            const asChecks = partial.viewConfig?.parameters?.showAsCheck ?? configName == "checktable"
            if( asCounts ){
                configName = "heatmap"
            }
            if( asChecks ){
                configName = "checktable"
            }
            
            
            const config ={
                    ...baseRenderConfig,
                    partial: partial.primitive,
                    config: configName,
                    range: [Math.min(...range), Math.max(...range)],
                    ...partialConfig[cIdx - pcLength],
                    renderConfig:{
                        showId: false,  
                        inTable: true,
                        padding:[5,8,5,8],
                        asChecks,
                        minWidth: minWidth,
                        columns: 1,
                    }                
            }
            if( preferredWith ){
                config.renderConfig.width = preferredWith 
            }
            if(primitive.widths?.[cIdx] ){
                config.renderConfig.width = 80//primitive.widths[cIdx]
            }
            let updateConfig 
            if( cell.list.length === 1 && cell.list[0].type === "summary"){
                   const configForSummary = configName === "grid" ? "default" : configName 
                   updateConfig = RenderPrimitiveAsKonva( cell.list[0], {
                       ...config,
                       config: configForSummary,
                       ...config.renderConfig,
                       getConfig: true
                    })
                    updateConfig.config = configForSummary
            }else{
                updateConfig = RenderSetAsKonva( partial.primitive, cell.list, {...config, getConfig: true})    
            }
            cell.config = {
                ...config,
                ...updateConfig
            }
                
            cIdx++
        }
        rIdx++
    }
    console.log(`Got ${cells.length} cells`)
    const columnWidths = [primColumns,partials].flat().map((_,i)=>Math.max(0,...cells.filter(d=>d.cIdx === i).map(d=>d.config.width)))
    const rowHeights = rowLabels.map((_,i)=>Math.max(0,...cells.filter(d=>d.rIdx === i).map(d=>d.config.height ?? 0)))
    
    for(const cell of cells){
        cell.config.renderConfig.width = columnWidths[cell.cIdx]
        cell.config.renderConfig.height = rowHeights[cell.rIdx]
    }
    let x = 0, y = 80, h = 0 

    rowLabels.forEach((_,rIdx)=>{
        primColumns.forEach((column,cIdx)=>{
            const cell = cells.find(d=>d.cIdx === cIdx && d.rIdx === rIdx)
            if( rIdx === 0){
                g.add( addHeader(column.label, {x: x, y: 0, width: cell.config.renderConfig.width, height: 80, imageCallback: options.imageCallback, class: "column_header"}))
            }
            if( cell.primitive ){

                const renderedCell = RenderPrimitiveAsKonva( cell.primitive, 
                    {
                        ...cell.config, 
                        ...cell.config.renderConfig,
                        id: `${cell.cIdx}-${cell.rIdx}`, 
                    })    
                    renderedCell.x(x)
                    renderedCell.y(y)
                    g.add(renderedCell)
            }
            x += columnWidths[cIdx]
        })
        partials.forEach((partial,pIdx)=>{
            let cIdx = pIdx + primColumns.length
            const cell = cells.find(d=>d.cIdx === cIdx && d.rIdx === rIdx)
            if( rIdx === 0){
                g.add( addHeader(partial.primitive.title, {x: x, y: 0, width: cell.config.renderConfig.width, height: 80, imageCallback: options.imageCallback, class: "column_header"}))
            }
            let renderedCell
            if( cell.list.length === 1 && cell.list[0].type === "summary"){
                renderedCell = RenderPrimitiveAsKonva( cell.list[0], {
                        ...cell.config,
                        ...config.renderConfig,
                        ...cell.config.renderConfig,
                        getConfig: false
                    })
            }else{
                renderedCell = RenderSetAsKonva( partial.primitive, cell.list, 
                    {
                        ...cell.config, 
                        id: `${cell.cIdx}-${cell.rIdx}`, 
                    })    
            }
            renderedCell.x(x)
            renderedCell.y(y)
            g.add(renderedCell)
            x += columnWidths[cIdx]
        })
        x = 0
        y += rowHeights[rIdx]
        h += rowHeights[rIdx]
    })

    
    const tw = g.find(()=>true).map(d=>d.x() + d.width()).reduce((a,c)=>c > a ? c : a, 0)
    const th = g.find(()=>true).map(d=>d.y() + d.height()).reduce((a,c)=>c > a ? c : a, 0)
    g.width( tw)
    g.height( th)
    r.width( tw)
    r.height( th)

    return g
})
function addHeader( title, options ={}){
    let config = {x: 0, y: 0, width: 100, fontSize: 12, height:25, padding: [2,2,2,2], textPadding:[2,2,2,2], ...options}
    const group = new Konva.Group({
        name: `inf_track ${options.class ?? "row_header"}`,
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height
    }) 
    const bg = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: config.height - config.padding[0] - config.padding[2] ,
        fill:'#f3f4f6'
    })
    group.add(bg)
    const t = new CustomText({
        //fontFamily: "system-ui",
        fontSize: config.fontSize,
        text: title,
        wrap: true,
        align:"center",
        bgFill:"#f3f4f6",
        verticalAlign:"middle",
        x: config.padding[3] + config.textPadding[3],
        y: config.padding[0] + config.textPadding[0],
        width: config.width - (config.padding[3] + config.textPadding[3] + config.padding[1] + config.textPadding[1]),
        refreshCallback: options.imageCallback
    })
    t.y( (config.height - t.height()) / 2)
    group.add(t)
    return group

}

registerRenderer( {type: "type", id: "page", configs: "set_grid"}, (primitive, options = {})=>{
    const config = {minColumns: 1, spacing: [20,20], itemPadding: [0,0,0,0], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }

    let minColumns = config.minColumns

    let items = options.list
    let itemCount = items.length + (config.showExtra ? 1 : 0)

    if( minColumns) {
        config.columns = Math.max(minColumns, config.columns)
    }

    const width = config.width 
    const height = config.height 
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: width,
        height: height,
    })
    let x = config.padding[3] + config.spacing[1]
    let y = config.padding[0] + config.spacing[0]

    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: config.height ? config.height - config.padding[0] - config.padding[2] : undefined,
        name: "background",
        fill: '#f9fafb'
    })
    g.add(r)

    let idx = 0
    let maxX = 0
    let columnYs = new Array( config.columns ).fill( y )
    for( let dIdx = 0; dIdx < itemCount; dIdx++){
        const d = items[dIdx]
        let node

        if( d ){
            node = RenderPrimitiveAsKonva( d, {
                config: "default", 
                x: x, 
                y: columnYs[ idx ], 
                onClick: options.primitiveClick,
                padding: config.itemPadding, 
                placeholder: options.placeholder !== false,
                imageCallback: options.imageCallback,
                itemIdx: dIdx,
                utils: options.utils,
                ...options.extras
            })
        }else{
            node = addExtraNode( config, options, x, y, 1080)
        }

        g.add(node)
        let lastHeight = node.attrs.height
        columnYs[idx] += lastHeight + config.spacing[0]

        maxX = Math.max(maxX, x + node.attrs.width)
        x += node.attrs.width + config.spacing[1]
        idx++
        if( idx === config.columns){
            idx = 0
            x = config.padding[3] + config.spacing[1]
            y = columnYs[idx]
        }
    }

    const mayY = Math.max(...columnYs) 
    g.height( mayY + config.padding[2])
    config.height = mayY + config.padding[2]
    config.width = maxX

    if( options.getConfig ){
        return config
    }

    return g

})
registerRenderer( {type: "categoryId", id: 138, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemWidth: 600, minColumns: 1, spacing: [2,2], itemPadding: [10,10,10,10], ...(options.renderConfig ?? {})}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 109, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemWidth: 600, minColumns: 1, spacing: [2,2], itemPadding: [10,10,10,10], ...(options.renderConfig ?? {})}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 100, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemWidth: 600, itemHeight: 1800, spacing: [2,2], itemPadding: [10,10,10,10], ...(options.renderConfig ?? {}), columns: 3}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 29, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemSize: 60, columns: 3, minColumns: options.renderOptions?.int_columns ?? 3, spacing: [8,8], itemPadding: [2,2,2,2], padding: [2,2,2,2], ...(options.renderConfig ?? {})}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 101, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemWidth: 360, spacing: [2,2], itemPadding: [2,2,2,2], ...(options.renderConfig ?? {})}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 95, configs: "set_grid"},(primitive, options = {})=>{
    const config = {itemWidth:555, spacing: [20,20], itemPadding: [2,2,2,2], ...(options.renderConfig ?? {}), height: undefined}


    return baseGridRender({...options}, config)
})
function baseGridRender(options, config) {
  if (!options?.list) return undefined;

  // normalize (inline, no helpers)
  const cfg = {
    ...config,
    padding: (Array.isArray(config?.padding) && config.padding.length === 4) ? config.padding
             : (Array.isArray(options?.padding) && options.padding.length === 4) ? options.padding
             : [0, 0, 0, 0],
    spacing: (Array.isArray(config?.spacing) && config.spacing.length === 2) ? config.spacing : [0, 0],
    sectionConfig: config?.sectionConfig ?? {},
  };

  const items = options.list;
  const itemCount = items.length + (cfg.showExtra ? 1 : 0);

  const heightDefined = Boolean(cfg.itemHeight || cfg.itemSize);
  const fullHeight = heightDefined ? (cfg.itemHeight ?? cfg.itemSize) : undefined;
  const fullWidth  = (cfg.columns === 1 ? (cfg.minWidth ?? cfg.itemWidth) : (cfg.itemWidth ?? cfg.itemSize));

  // min columns if minWidth present
  if (cfg.minWidth) {
    const inner = (cfg.minWidth - cfg.padding[1] - cfg.padding[3]) - cfg.spacing[1];
    const denom = (fullWidth + cfg.spacing[1]);
    const byMinWidth = Math.floor(inner / denom);
    const minColumns = Math.max(cfg.minColumns ?? 1, 1, byMinWidth);
    cfg.columns = Math.max(minColumns, cfg.columns ?? 1);
  } else if (cfg.minColumns) {
    cfg.columns = Math.max(cfg.minColumns, cfg.columns ?? 1);
  }

  // columns/width coherence
  if (!cfg.columns) {
    if (!cfg.width) cfg.columns = 1;
    const inner = (cfg.width - cfg.padding[1] - cfg.padding[3]) - cfg.spacing[1];
    cfg.columns = Math.max(1, Math.floor(inner / (fullWidth + cfg.spacing[1])));
  }

  const calcWidth = ((cfg.columns - 1) * cfg.spacing[1]) + (cfg.columns * fullWidth) + cfg.padding[1] + cfg.padding[3];
  if (!cfg.width || calcWidth > cfg.width) {
    cfg.width = calcWidth;
    const inner = (cfg.width - cfg.padding[1] - cfg.padding[3]) - cfg.spacing[1];
    cfg.columns = Math.max(1, Math.floor(inner / (fullWidth + cfg.spacing[1])));
  }

  cfg.rows = Math.ceil(itemCount / cfg.columns);

  if (heightDefined) {
    cfg.height ||= ((cfg.rows + 1) * cfg.spacing[0]) + (cfg.rows * fullHeight) + cfg.padding[0] + cfg.padding[2];
  }

  if (options.getConfig && cfg.height){
    return cfg
  }

  // ----- render -----
  const g = new Konva.Group({
    id: options.id,
    name: "cell inf_track",
    x: (options.x ?? 0),
    y: (options.y ?? 0),
    width: cfg.width,
    height: cfg.height,
  });

  const bgRect = new Konva.Rect({
    x: cfg.padding[3],
    y: cfg.padding[0],
    width: cfg.width - cfg.padding[3] - cfg.padding[1],
    height: cfg.height ? (cfg.height - cfg.padding[0] - cfg.padding[2]) : undefined,
    name: "background",
    fill: '#f9fafb'
  });
  g.add(bgRect);

  let x = cfg.padding[3];
  let y = cfg.padding[0];
  let idx = 0;
  let rows = 0;
  let thisRow = [];

  const columnYs = new Array(cfg.columns).fill(y);
  const skipForOverflow = new Array(cfg.columns).fill(false);

  for (let dIdx = 0; dIdx < itemCount; dIdx++) {
    if (idx === 0) rows++;

    if (cfg.maxHeight && skipForOverflow[idx]) continue;

    const data = items[dIdx];
    let node;

    if (data) {
      const rConfig = (options.config === "grid" ? "default" : options.config) ?? "default";
      node = RenderPrimitiveAsKonva(data, {
        config: rConfig,
        x: x,
        y: columnYs[idx],
        onClick: options.primitiveClick,
        height: fullHeight,
        width: fullWidth,
        placeholder: options.placeholder !== false,
        imageCallback: options.imageCallback,
        utils: options.utils,
        data: options.data,
        sectionConfig: cfg.sectionConfig,
        ...options.extras
      });
    } else {
      node = addExtraNode(cfg, options, x, y, fullWidth);
    }

    g.add(node);
    thisRow.push(node);

    const nodeHeight = fullHeight ?? node.attrs.height;
    const nextY = columnYs[idx] + nodeHeight + cfg.spacing[0];

    if (cfg.maxHeight && nextY > cfg.maxHeight) {
      skipForOverflow[idx] = true;
      node.destroy();
      thisRow.pop();
    } else {
      columnYs[idx] = nextY;
    }

    x += fullWidth + cfg.spacing[1];
    idx++;

    if (idx === cfg.columns) {
      idx = 0;
      x = cfg.padding[3] + cfg.spacing[1];

      if (cfg.alignHeight && thisRow.length) {
        const maxY = Math.max(...columnYs);
        const maxHeight = thisRow
          .map(d => d.find('.item_background')[0]?.height() ?? 0)
          .reduce((a, c) => (a > c ? a : c), 0);

        columnYs.fill(maxY);
        for (const d of thisRow) {
          d.height(maxHeight);
          const bg = d.find('.item_background')[0];
          if (bg) bg.height(maxHeight);
        }
      }

      y = columnYs[idx];
      if (heightDefined && (y + fullHeight) > (cfg.height ?? Infinity)) break;

      thisRow = [];
    }
  }

  const maxY = Math.max(...columnYs);
  const newHeight = maxY + cfg.padding[2];
  bgRect.height(newHeight - cfg.padding[0] - cfg.padding[2]);
  g.height(newHeight);
  cfg.height = newHeight;

  g.attrs.resizeInfo = {
    padding: cfg.padding,
    spacing: [cfg.spacing[1] + cfg.spacing[1], cfg.spacing[0] + cfg.spacing[0]],
    columns: cfg.columns,
    rows,
  };

  Object.assign(config, cfg);
  if (options.getConfig) return cfg;
  return g;
}
function addExtraNode(config, options, x,y, fullWidth){
    const number = `${config.showExtra}`
    const check = config.showExtra >= 0 ? number.length > 4 ? number : "more" : `Show less`
    const fullLabel = config.showExtra >= 0 ? `**${number}**\nmore`: `Show less`
    let size = fullWidth * 5
    let minSize = fullWidth * 0.2
    const t = new CustomText({
        x: 0,
        y: 10,
        fontSize: size,
        lineHeight: config.showExtra >= 0 ? 0.7 : 1.2,
        text: fullLabel,
        align:"center",
        withMarkdown: true,
        fill: '#334155',
        showPlaceHolder: false,
        wrap: true,
        bgFill: 'transparent',
        width: fullWidth,
        refreshCallback: options.imageCallback
    })
    while( (t.measureSize(check).width > fullWidth * 0.3) && size > minSize){
        size = size > 20 ? size -= (size * 0.1) : size - 0.25
        t.fontSize( size )
    }

    const thisHeight = t.height() + 20
    let node = new Konva.Group({
        id: options.id,
        x: x,
        y: y,
        width: fullWidth,
        height: thisHeight,
        onClick: options.onClick,
        name:"inf_track widget show_extra"
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: fullWidth,
        height: thisHeight,
        cornerRadius: 4,
        fill: '#d2d2d2',
        hoverFill: '#a2a2a2',
    })
    node.add(r)
    node.add(t)

    return node
}
registerRenderer( {type: "default", configs: "set_export_finances"}, (primitive, options = {})=>{
    const config = {width: 612, spacing: 10,/*height: 1400,count: 4,*/ itemPadding: [2,2,2,2], padding: [10,10,10,10], ...(options.renderConfig ?? {})}
    if( primitive.renderConfig?.count){
        config.count = primitive.renderConfig?.count
    }
    const width = config.width 
    const height = config.count ? undefined : config.height 
    
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: width,
        height: height,
    })
    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: width - config.padding[3] - config.padding[1],
        height: height - config.padding[0] - config.padding[2],
        fill: '#f9fafb',
        name: "background"
    })
    g.add(r)
    let x = config.padding[3]
    let y = config.padding[0]


    let items = options.list
    const maxScale = items.map(d=>d.referenceParameters.funding).reduce((a,c)=>c > a ? c : a, 0)

    let rWidth = 0
    let renderList = config.count ? items.slice(0, config.count) : items
    for( const d of renderList ){
        const node = RenderPrimitiveAsKonva( d, {
            config: "export_finances", 
            x: x, 
            y: y, 
            width: width - config.itemPadding[1] - config.itemPadding[3], 
            imageCallback: options.imageCallback,
            renderConfig: primitive.renderConfig,
            padding: config.itemPadding, imageCallback: options.imageCallback})
        
        g.add(node)
        rWidth = Math.max(rWidth, node.width())
        y += node.height() + config.spacing
    }
    g.width( rWidth + config.padding[1])
    g.height( y + config.padding[2])

    if( options.getConfig){
        config.width = g.width()
        config.height = g.height()
        return config
    }

    return g
})
registerRenderer( {type: "default", configs: "set_overview"}, (primitive, options = {})=>{
    return renderBaselineOverviewSet( primitive, options)
})
registerRenderer( {type: "categoryId", id: 34, configs: "set_overview"}, (primitive, options = {})=>{
    return renderBaselineOverviewSet( primitive, {...options, renderConfig: {...(options.renderConfig ?? {}), width: 600}})
})
function renderBaselineOverviewSet(primitive, options){
    const config = {width: 300, spacing: 10, itemPadding: [2,2,2,2], padding: [10,10,10,10], ...(options.renderConfig ?? {}), ...(options.renderOptions ?? {})}
    if( primitive.renderConfig?.count){
        config.count = primitive.renderConfig?.count
    }
    const width = config.width 
    const height = config.count ? undefined : config.height 
    
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: width,
        height: height,
    })
    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: width - config.padding[3] - config.padding[1],
        height: height ? height - config.padding[0] - config.padding[2] : 0,
        fill: 'transparent',
        name: "background"
    })
    g.add(r)
    let x = 0
    let y = config.padding[0]


    let rankBy = primitive.renderConfig?.rank 
    let items = options.list
    if( rankBy){
        if( rankBy === "title"){
            items = items.sort((a,b)=>(a.title ?? "").localeCompare(b.title ?? ""))
        }else{
            items = items.filter(d=>d.referenceParameters?.[rankBy]).sort((a,b)=>b.referenceParameters[rankBy] - a.referenceParameters[rankBy])
        }

    }

    let renderList = config.count ? items.slice(0, config.count) : items
    for( const d of renderList ){
        const node = RenderPrimitiveAsKonva( d, {
            config: "overview", 
            x: x, 
            y: y, 
            width: width - config.itemPadding[1] - config.itemPadding[3], 
            imageCallback: options.imageCallback,
            renderOptions: options.renderOptions,
            padding: config.itemPadding, imageCallback: options.imageCallback})
        
        g.add(node)
        y += node.height() + config.spacing
        if( y >= config.height ){
            break
        }
    }
    g.height( y + config.padding[2])

    if( options.getConfig){
        config.height = g.height()
        return config
    }

    return g
}
registerRenderer( {type: "default",  configs: "overview"}, (primitive, options = {})=>{
    
    const config = {width: 300, padding: [10,10,10,10], fontSize: 10, leftSize: 150, maxScale: 100, parameter: "funding", ...options}
    if( options.getConfig){
        return config
    }

    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.height ? (config.height - config.padding[0] - config.padding[2]) :undefined
    let ox =  config.padding[3]
    let oy =  config.padding[0]



    const g = new Konva.Group({
        id: primitive.id,
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height,
        name:"inf_track primitive "
    })
    if( g ){
        const r = new Konva.Rect({
            x: 0,
            y: 0,
            width: config.width,
            height: config.height,
            cornerRadius: 2,
            fill: 'white',
        })
        g.add(r)


        let tx = ox 
        const title = new CustomText({
            fontSize: config.fontSize - 2,
            fontStyle:"bold",
            text: primitive.title,
            y: oy + config.padding[0],
            x: tx,
            width: availableWidth - tx,
            height: 16,
            wrap: false,
            ellipsis: true,
            refreshCallback: options.imageCallback
        })
        g.add(title);
        
        const t = new CustomText({
            x: tx,
            y: config.padding[0] + oy + 16,
            fontSize: config.fontSize,
            lineHeight: 1.5,
            withMarkdown: true,
            text: primitive.referenceParameters?.description?.slice(0,150) ?? primitive.referenceParameters?.summary ?? "",
            fill: '#334155',
            wrap: true,
            refreshCallback: options.imageCallback,
            ellipsis: true,
            width: availableWidth - tx,
            height: availableHeight ? availableHeight - (config.padding[0] +oy+16) : undefined,
        })
        g.add(t)
        //const h = Math.max( t.height() + t.y(), (config.itemSize ?? 0) + oy) + config.padding[2]
        const h = t.height() + t.y()
        r.height(h)
        g.height(h)



    }
    return g


})
registerRenderer( {type: "categoryId", id: [34, 78], configs: "overview"}, (primitive, options = {})=>{
    const config = {width: 600, height: 40, padding: [2,2,2,2], fontSize: 12, ...options}
    if( options.getConfig){
        return config
    }
    const g = new Konva.Group({
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height,
        name:"inf_track primitive",
        id: primitive.id
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        fill: 'white',
        name:"background"
    })
    g.add(r)

    let ox =  config.padding[3]
    let oy =  config.padding[0]

    

    const logo = imageHelper( `/api/image/${primitive.id}` + (primitive.imageCount ? `?${primitive.imageCount}` : ""), {
        x: ox,
        y: oy,
        size: config.height - config.padding[0] - config.padding[2],
        center: true,
        imageCallback: options.imageCallback,
        placeholder: options.placeholder !== false,
        maxScale: 1,
        scaleRatio: 2
    })
    g.add( logo )

    let tx = ox + config.height
    const title = new CustomText({
        fontSize: config.fontSize,
        fontStyle:"bold",
        text: primitive.title,
        y: oy + config.padding[0] + (config.fontSize / 2),
        x: tx,
        width: config.width - tx - config.padding[1],
        height: config.fontSize,
        wrap: false,
        ellipsis: true,
        refreshCallback: options.imageCallback
    })
    const sub = new CustomText({
        fontSize: config.fontSize - 2,
        fontStyle:"light",
        text: primitive.referenceParameters?.url,
        y: oy + config.padding[0] + (config.fontSize / 2) + title.height(),
        x: tx,
        width: config.width - tx - config.padding[1],
        url: primitive.referenceParameters?.url,
        height: config.fontSize,
        wrap: false,
        ellipsis: true,
        refreshCallback: options.imageCallback
    })

    g.add(title);
    g.add(sub);
    return g

})
registerRenderer( {type: "categoryId", id: 44, configs: "overview"}, (primitive, options = {})=>{
    const config = {width: 300, itemSize: 60, padding: [10,10,10,10], fontSize: 10, leftSize: 150, maxScale: 100, ...options}
    if( options.getConfig){
        return config
    }

    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.height ? (config.height - config.padding[0] - config.padding[2]) :undefined
    let ox =  config.padding[3]
    let oy =  config.padding[0]



    const g = new Konva.Group({
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height,
        name:"inf_track primitive"
    })
    if( g ){
        const r = new Konva.Rect({
            x: 0,
            y: 0,
            width: config.width,
            height: config.height,
            cornerRadius: 2,
            fill: 'white',
        })
        g.add(r)


        const logo = imageHelper( `/api/image/${primitive.id}` + (primitive.imageCount ? `?${primitive.imageCount}` : ""), {
            x: ox,
            y: oy,
            size: config.itemSize,
            center: true,
            imageCallback: options.imageCallback,
            placeholder: options.placeholder !== false,
            maxScale: 1,
            scaleRatio: 2
        })
        g.add( logo )



        let tx = ox + config.itemSize + (config.itemSize / 5)
        const title = new CustomText({
            fontSize: config.fontSize - 2,
            fontStyle:"bold",
            text: primitive.title,
            y: oy + config.padding[0],
            x: tx,
            width: availableWidth - tx,
            height: 16,
            wrap: false,
            ellipsis: true,
            refreshCallback: options.imageCallback
        })
        g.add(title);

        let overview = primitive.referenceParameters?.description ?? ""

        if(overview.length > 200){
            let lines = overview.split(/(?<!\d)\.(?!\d)|\n/).map(d=>d.trim())
            overview = ""
            do{
                overview += lines.shift() + " "

            }while(lines[0] && ((overview.length + lines[0].length) < 200))
        }
        
        const t = new CustomText({
            x: tx,
            y: config.padding[0] + oy + 16,
            fontSize: config.fontSize,
            lineHeight: 1.5,
            text: overview.trim(),
            fill: '#334155',
            wrap: true,
            refreshCallback: options.imageCallback,
            ellipsis: true,
            width: availableWidth - tx,
            height: availableHeight ? availableHeight - (config.padding[0] +oy+16) : undefined,
        })
        g.add(t)
        if( !availableHeight){
            const h = Math.max( t.height() + t.y(), config.itemSize + oy) + config.padding[2]
            r.height(h)
            g.height(h)
        }



    }
    return g


})
registerRenderer( {type: "categoryId", id: 29, configs: "overview"}, (primitive, options = {})=>{
    let showDescription = options.renderOptions?.showDescription
    const config = {width: showDescription ? 300 : 500, itemSize: 60, padding: [10,10,10,10], fontSize: showDescription ? 10 : 28, leftSize: 150, maxScale: 100, parameter: "funding", ...options}
    if( options.getConfig){
        return config
    }

    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.height ? (config.height - config.padding[0] - config.padding[2]) :undefined
    let ox =  config.padding[3]
    let oy =  config.padding[0]



    const g = new Konva.Group({
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height,
        name:"inf_track primitive",
        id: primitive.id
    })
    if( g ){
        const r = new Konva.Rect({
            x: 0,
            y: 0,
            width: config.width,
            height: config.height,
            fill: 'transparent',
        })
        g.add(r)


        const logo = imageHelper( `/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`, {
            x: ox,
            y: oy,
            size: config.itemSize,
            center: true,
            imageCallback: options.imageCallback,
            placeholder: options.placeholder !== false,
            maxScale: 1,
            scaleRatio: 2
        })
        g.add( logo )



        let tx = ox + config.itemSize + (config.itemSize / 5)
        const title = new CustomText({
            fontSize: config.fontSize - 2,
            fontStyle:"bold",
            //text: (!config.parameter || config.parameter === "none") ? primitive.title : `${primitive.title} (${roundCurrency(primitive?.referenceParameters[config.parameter] ?? 0)})`,
            text: primitive.title ,
            y: oy + config.padding[0],
            x: tx,
            width: availableWidth - tx,
            height: 16,
            wrap: false,
            ellipsis: true,
            refreshCallback: options.imageCallback
        })
        g.add(title);
        if( !availableHeight){
            const h = Math.max( title.height() + title.y(), config.itemSize + oy) + config.padding[2]
            r.height(h)
            g.height(h)
        }
        if( showDescription ){
            let overview = primitive.referenceParameters?.description ?? ""
            
            if(overview.length > 200){
                let lines = overview.split(/(?<!\d)\.(?!\d)|\n/).map(d=>d.trim())
                overview = ""
                do{
                    overview += lines.shift() + " "
                    
                }while(lines[0] && ((overview.length + lines[0].length) < 200))
                }
                
                const t = new CustomText({
                            x: tx,
                            y: config.padding[0] + oy + 16,
                            fontSize: config.fontSize,
                            lineHeight: 1.5,
                    text: overview.trim(),
                    fill: '#334155',
                    wrap: true,
                    refreshCallback: options.imageCallback,
                    ellipsis: true,
                    width: availableWidth - tx,
                    height: availableHeight ? availableHeight - (config.padding[0] +oy+16) : undefined,
                })
            g.add(t)
            if( !availableHeight){
                const h = Math.max( t.height() + t.y(), config.itemSize + oy) + config.padding[2]
                r.height(h)
                g.height(h)
            }
        }else{
            title.y( (r.height() - title.height() )/ 2)
        }
    }
    return g


})
registerRenderer( {type: "categoryId", id: [29,78], configs: "set_ranking"}, (primitive, options = {})=>{
    const config = {width: 200, height: 200, itemSize: 30, itemPadding: [2,2,2,2], padding: [10,10,10,10], ...(options.renderConfig ?? {})}
    if( options.getConfig){
        return config
    }
    const width = config.width 
    const height = config.height 
    
    
    const g = new Konva.Group({
        id: primitive.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: width,
        height: height,
    })
    let x = 0
    let y = config.padding[0]
    const fullHeight = config.itemSize + config.itemPadding[0] + config.itemPadding[2]

    let items = options.list
    
    let rankBy = options.renderOptions?.rank ?? "title" 
    const rankKey = rankBy === "raised" ? "funding" : rankBy
    if( rankBy){
        if( rankBy === "title"){
            items = items.sort((a,b)=>(a.title ?? "").localeCompare(b.title ?? ""))
        }else{
            items = items.filter(d=>d.referenceParameters?.[rankKey]).sort((a,b)=>b.referenceParameters[rankKey] - a.referenceParameters[rankKey])
        }

    }
    const maxScale = items.map(d=>d.referenceParameters?.[rankKey]).reduce((a,c)=>c > a ? c : a, 0)

    

    for( const d of items ){
        const node = RenderPrimitiveAsKonva( d, {
            config: "ranking", 
            maxScale,
            x: x, 
            y: y, 
            height: fullHeight, 
            width: width - config.itemPadding[1] - config.itemPadding[3], 
            placeholder: options.placeholder !== false,
            parameter: rankKey,
            currency: rankKey === "funding" ? "$" : false,
            padding: config.itemPadding, imageCallback: options.imageCallback})
        if( node ){
            g.add(node)
        }
        y += fullHeight
        if( (y + fullHeight) > height){
            break
        }
    }

    return g
})

registerRenderer( {type: "categoryId", id: [29,78], configs: "ranking"}, (primitive, options = {})=>{
    const config = {width: 300, height: 30, itemSize: 25, padding: [10,10,10,10], fontSize: 12, leftSize: 150, maxScale: 100, parameter: "funding", ...options}
    if( options.getConfig){
        return config
    }

    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.height - config.padding[0] - config.padding[2]
    let ox = 0
    let oy = 0



    const g = new Konva.Group({
        id: primitive.id,
        width: config.width,
        height: config.height,
        x: (options.x ?? 0) + config.padding[3],
        y: (options.y ?? 0) + config.padding[0],
        name: 'primitive clickable'
    })
    if( g ){

        let url
        if( primitive.referenceParameters?.hasImg ){
            url = `/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`
        }else{
            if( primitive.referenceParameters?.url ){
                let domain = getRegisteredDomain( primitive.referenceParameters?.url) 
                if(domain){
                    url = `/api/companyLogo?name=${primitive.title}&domain=${domain}` 
                }else{
                    url = `/api/companyLogo?name=${primitive.title}` 
                }

            }
        }

        if( url ){
            const logo = imageHelper( url, {
                x: ox,
                y: oy,
                size: config.itemSize,
                center: true,
                name: 'primitive',
                imageCallback: options.imageCallback,
                placeholder: options.placeholder !== false
            })
            g.add( logo )
        }


        let tx = url ? ox + config.itemSize + (config.itemSize / 5) : ox
        const title = new Konva.Text({
            fontSize: config.fontSize,
            text: primitive.title,
            y: oy + config.padding[0] + (config.itemSize - config.fontSize) / 2,
            x: tx,
            width: config.leftSize - tx,
            height: 12,
            wrap: false,
            ellipsis: true
        })
        g.add(title);
        
        const rhs = config.leftSize
        const rightSize = availableWidth - rhs
        const amountSize = 80
        const barSize = rightSize - amountSize

        const scale = (primitive?.referenceParameters[config.parameter] ??0 ) / config.maxScale 
        const thisBar = Math.min(Math.max(0, scale), 1) * barSize

        const bar = new Konva.Rect({
            y: oy + config.padding[0],
            x: rhs,
            width: thisBar,
            height: availableHeight,
            fill: "#00bc7d"            
        })
        g.add(bar);
        const value = primitive?.referenceParameters[config.parameter] ?? 0
        const amount = new Konva.Text({
            fontSize: config.fontSize * 0.8,
            text: config.currency ? roundCurrency(value) : formatNumber(value),
            y: oy + config.padding[0] + (config.itemSize - config.fontSize) / 2,
            x: rhs + thisBar + 5,
            width: amountSize - 10,
            height: 12,
            wrap: false,
            ellipsis: true
        })
        g.add(amount);



    }
    return g


})


registerRenderer( {type: "categoryId", id: 109, configs: "dials"}, function renderFunc(primitive, options = {}){
    return typeMaps[ "default" ]["set_dials"](options.partial, {...options, list:[primitive]})
})
registerRenderer( {type: "categoryId", id: 109, configs: "checktable"}, function renderFunc(primitive, options = {}){
    return typeMaps[ "default" ]["set_checktable"](options.partial, {...options, list:[primitive]})
})
registerRenderer( {type: "categoryId", id: 82, configs: "default"}, function renderFunc(primitive, options = {}){
    return categoryMaps[109]["default"](primitive, {...options, field:"description", fallback: "summary"})
})
registerRenderer( {type: "categoryId", id: 109, configs: "set_summary_section"}, function renderFunc(primitive, options = {}){
    const config = {alignParts: "section", itemWidth: options.renderOptions?.width ?? 600, minColumns: 1, spacing: options.items?.length > 1 ? [40,40] : [0,0], alignHeight: true, itemPadding: [10,10,10,10], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    const sectionConfig = primitive.getConfig.sections ?? {}
    return baseGridRender(options, {...config, sectionConfig})
})
registerRenderer({ type: "categoryId", id: 109, configs: "summary_section" }, function renderFunc(primitive, options = {}) {
  // ---------- base config ----------
  const config = {
    field: "summary",
    showId: true,
    idSize: 14,
    fontSize: 16,
    width: 1600,
    maxHeight: 3000,
    padding: [10, 10, 10, 10],
    ...options
  };

  if (config.minWidth) config.width = Math.max(config.width ?? 0, config.minWidth);

  const idHeight = config.showId ? 20 : 0;
  const availableWidth = config.width - config.padding[1] - config.padding[3];
  const availableHeight = config.maxHeight != null
    ? config.maxHeight - config.padding[0] - config.padding[2] - idHeight
    : undefined;

  const ox = options.x ?? 0;
  const oy = options.y ?? 0;

  const g = new Konva.Group({
    id: primitive.id,
    x: ox,
    y: oy,
    width: config.width,
    onClick: options.onClick,
    name: "inf_track primitive"
  });
  const r = new Konva.Rect({
    x: 0,
    y: 0,
    width: config.width,
    cornerRadius: 10,
    fill: "white",
    name: "item_background"
  });
  g.add(r);

  // ===========================================================
  // 1) CLASSIFICATION + RENDERER REGISTRY
  // ===========================================================

  const L = s => (s || "").toLowerCase().trim();

  // fuzzy-ish matcher using compareTwoStrings if present
  const scoreMatch = (heading, targets, opts = {}) => {
    const h = L(heading || "");
    if (!h) return 0;
    const list = [targets].flat().map(L);

    let best = 0;
    for (const t of list) {
      if (!t) continue;
      if (h === t) return 1;                         // exact
      if (h.includes(t) || t.includes(h)) best = Math.max(best, 0.85); // contains
      if (typeof compareTwoStrings === "function") {
        best = Math.max(best, compareTwoStrings(h, t));
      }
    }
    // optional regex boosts
    if (opts.regex && opts.regex.test(h)) best = Math.max(best, 0.9);
    return best;
  };

  // Render helpers return the height they consume (and mutate y)
  const mkText = (attrs) => new CustomText({
    fontFamily: "Poppins",
    lineHeight: 1.3,
    fill: "#334155",
    wrap: true,
    withMarkdown: true,
    ...attrs
  });

  // ----------------------------------------------------------------
  // Renderers: add more by pushing into RENDERERS
  // Each renderer: {name, match(heading,node)=>score, render(ctx)}
  // ctx: {group, x, y, config, availableWidth, clampHeight, options, primitive}
  // node: {heading, content, subsections?}
  // render MUST return {heightConsumed, skipTraversal?: boolean}
  // ----------------------------------------------------------------
  const RENDERERS = [
    {
      name: "segmentTitle",
      match: (h, node, ctx) => (options?.data?.segment_title && primitive.filterDescription) ? 0.98 : 0,
      render: (ctx, node) => {
        const text = `**${primitive.filterDescription}**`;
        const t = mkText({
            x: ctx.config.padding[3],
            y: ctx.y,
            fontSize: ctx.config.fontSize * 1.5,
            fontStyle: ctx.config.fontStyle,
            lineHeight: 1.1,
            text,
            width: ctx.availableWidth
        });
        ctx.group.add(t);
        return { heightConsumed: t.height() + ctx.spaceY };
      }
    },
    {
      name: "title",
      match: (h) => scoreMatch(h, ["title", "analysis title", "summary title"]),
      render: (ctx, node) => {
        const titleText = (node.content || node.heading || "")
          .replace(/^title\s*[-:]\s*/i, "");
        const t = mkText({
          x: ctx.config.padding[3],
          y: ctx.y,
          fontSize: ctx.config.fontSize * 1.5,
            fontStyle: ctx.config.fontStyle,
          lineHeight: 1.3,
          text: `**${titleText}**`,
          width: ctx.availableWidth,
          name: "section section_title"
        });
        ctx.group.add(t);
        return { heightConsumed: t.height() + ctx.spaceY };
      }
    },
    {
      name: "summary",
      match: (h) => scoreMatch(h, ["description", "summary", "overview"]),
      render: (ctx, node) => {
        const t = mkText({
          x: ctx.config.padding[3],
          y: ctx.y,
          fontSize: ctx.config.fontSize * 1.2,
            fontStyle: ctx.config.fontStyle,
          text: node.content ?? "",
          width: ctx.availableWidth,
          name: "section section_summary"
        });
        ctx.group.add(t);
        return { heightConsumed: t.height() + ctx.spaceY };
      }
    },
    {
      name: "detailsBullets",
      match: (h) => scoreMatch(h, ["recurring topics", "themes", "topics", "capabilities"]),
      render: (ctx, node) => {
        let content;
        if (typeof node.content === "string") {
          content = node.content.split(/\n/);
        } else if (Array.isArray(node.content)) {
          content = node.content;
        } else {
          content = node.subsections?.map(d => d.content);
        }
        content = (content || [])
        if( ctx.config.itemCount !== undefined){
            content = content.slice(0, ctx.config.itemCount)
        }
        content = content.filter(d => typeof d === "string")
          .map(d => d.replace(/^(\s*-?\s*)([^:]+)[:\]]/, (m, p1, p2) => {
            if (p2.startsWith("[")) p2 = p2.slice(1);
            if (p2.endsWith("]")) p2 = p2.slice(0, -1);
            p2 = p2.trim();
            if (!p2.startsWith("**")) p2 = "**" + p2;
            if (!p2.endsWith("**")) p2 = p2 + "**";
            return p2;
          }))
          .join("\n");

        const t = mkText({
          x: ctx.config.padding[3],
          y: ctx.y,
          fontSize: ctx.config.fontSize,
            fontStyle: ctx.config.fontStyle,
          text: content,
          width: ctx.availableWidth,
          name: "section section_details"
        });
        ctx.group.add(t);
        return { heightConsumed: t.height() + ctx.spaceY };
      }
    },
    {
      name: "quotes",
      match: (h) => scoreMatch(h, ["quotes", "verbatim quotes", "examples", "evidence quotes", "customers"]),
      render: (ctx, node) => {
        let content;
        if (typeof node.content === "string") content = node.content;
        else if (Array.isArray(node.content)) content = node.content.join("\n");
        else content = node.subsections?.map(d => d.content).join("\n");

        const regex = /\(?[Ff]ragments?:? ?(?:\d+(?:, ?\d+)*|\d+(?: and \d+)*|\d+)\)?/g;
        content = (content || "").replace(regex, "").replace(/[ \t]{2,}/g, " ").trim();
        content = (content || "")
                .split("\n")

        if( ctx.config.itemCount !== undefined){
            content = content.slice(0, ctx.config.itemCount)
        }
        
        content = content.map(line => {
                    // Match any leading indent/markup (spaces, tabs, bullets, numbers, etc.)
                    const match = line.match(/^(\s*(?:[-*]|\d+\.)?\s*)(.*)$/);
                    if (!match) return `"${line}"`; // no special leading text

                    const [, prefix, text] = match;
                    //areturn `${prefix}"${text}"`;
                    return `"${text}"`.replaceAll('""','"');
                })
                .join("\n");
        const t = mkText({
          x: ctx.config.padding[3] * 4,
          y: ctx.y,
          fontSize: ctx.config.fontSize,
            fontStyle: ctx.config.fontStyle ?? "italic",
          lineHeight: 1.1,
          sectionSpacing: 2.2,
          leftBorder: '#bbb',
          text: content,
          width: ctx.availableWidth - (ctx.config.padding[3] * 8),
          name: "section section_quotes"
        });
        ctx.group.add(t);
        return { heightConsumed: t.height() + ctx.spaceY };
      }
    },
    {
      name: "sentiment",
      match: (h) => scoreMatch(h, ["overall sentiment", "sentiment"]),
      render: (ctx, node) => {
        let ly = 0;
        const g2 = new Konva.Group({
          x: ctx.config.padding[3],
          y: ctx.y,
          name: "section section_sentiment"
        });
        ctx.group.add(g2);

        const headingText = mkText({
          x: 0, y: 0,
          fontSize: ctx.config.fontSize,
          text: "Sentiment",
          width: ctx.availableWidth
        });
        g2.add(headingText);
        ly += headingText.height() + ctx.spaceY / 2;

        const steps = ["overwhelmingly negative", "mostly negative", ["neutral", "mixed"], "mostly positive", "overwhelmingly positive"];
        const stepText = ["Overwhelmingly Negative", "Mostly Negative", "Neutral / Mixed", "Mostly Positive", "Overwhelmingly Positive"];
        const colors = ["#eeb9b7", "#f8d1a0", "#bcddfb", "#a2ccfb", "#cbe6bc"];
        const sentimentText = node.content;
        const score = steps.findIndex(d => typeof d === "string" ? d === sentimentText : d.includes(sentimentText));
        const stepWidth = ctx.availableWidth / steps.length;
        const h = ctx.config.fontSize * 1.25;

        steps.forEach((d, i) => {
          g2.add(new Konva.Rect({
            x: stepWidth * i, y: ly,
            width: stepWidth, height: h,
            stroke: "#c2c2c2", fill: colors[i]
          }));
        });
        ly += h + (score > -1 ? ctx.spaceY : ctx.spaceY * 0.5);

        const label = mkText({
          x: 0, y: ly,
          fontSize: ctx.config.fontSize,
          text: (score === -1) ? (sentimentText || "") : stepText[score],
          width: "auto",
          align: "center"
        });
        if (score > -1) {
          const midX = ((score + 0.5) * stepWidth);
          g2.add(label);
          label.x(midX - label.width() / 2);
          g2.add(new Konva.Line({
            x: midX,
            y: ly - ctx.config.fontSize * 1.5,
            points: [0, 0, ctx.config.fontSize / 2, ctx.config.fontSize, -ctx.config.fontSize / 2, ctx.config.fontSize],
            closed: true,
            strokeWidth: 0,
            fill: "#666"
          }));
        } else {
          g2.add(label);
        }

        ly += label.height() + ctx.spaceY / 2;
        return { heightConsumed: ly };
      }
    },
    {
      name: "organizations",
      match: (h) => scoreMatch(h, ["companies", "organizations"]),
      render: (ctx, node) => {
        // layout logos + captions
        const names = Array.isArray(node.content)
          ? node.content
          : String(node.content || "")
              .split(/[,\n]/)
              .map(d => d.replace(/^\s*-\s+/, "").trim())
              .filter(Boolean);

        const candidates = options?.data?.company_candidates ?? [];
        const companySizing = 96;
        let x = ctx.config.padding[3];
        let consumed = ctx.spaceY * 2; // top spacing

        const pickPrimitive = (name) => {
          const variants = name.split(" ").map((_, i, a) => a.slice(0, i + 1).join(" ")).reverse();
          for (const v of variants) {
            let p = candidates.find(d => d.title.toLowerCase() === v.toLowerCase());
            if (!p && typeof compareTwoStrings === "function") {
              const scored = candidates
                .map(d => [d, compareTwoStrings(d.title, v)])
                .filter(d => d[1] > 0.75)
                .sort((a, b) => b[1] - a[1]);
              p = scored[0]?.[0];
            }
            if (p) return p;
          }
          return undefined;
        };

        const primitives = names.map(pickPrimitive).filter(Boolean).slice(0, 5);

        for (const d of primitives) {
          const logo = imageHelper(`/api/image/${d.id}` + (d.imageCount ? `?${d.imageCount}` : ""), {
            x, y: ctx.y + consumed,
            width: companySizing,
            height: companySizing / 2,
            center: true,
            imageCallback: options.imageCallback,
            placeholder: options.placeholder !== false,
            maxScale: 1,
            scaleRatio: 1
          });
          ctx.group.add(logo);
          const t = mkText({
            x,
            y: ctx.y + consumed + (companySizing / 2) + ctx.spaceY,
            fontSize: ctx.config.fontSize * 0.6,
            text: d.title,
            align: "center",
            width: companySizing
          });
          ctx.group.add(t);
          x += companySizing + ctx.config.padding[3];
        }

        // total height chunk
        return { heightConsumed: 48 + ctx.spaceY + (ctx.config.fontSize * 0.6) + (ctx.spaceY * 3) };
      }
    },
    {
      name: "paragraphFallback",
      match: (h, node) => {
        // default for anything with content but no strong match
        const has = (node?.content && String(node.content).trim()) ? 0.65 : 0;
        return has;
      },
      render: (ctx, node) => {
        const t = mkText({
          x: ctx.config.padding[3],
          y: ctx.y,
          fontSize: ctx.config.fontSize,
          fontStyle: "light",
          text: node?.content ? String(node.content) : (node?.heading || ""),
          width: ctx.availableWidth,
          name: "section section_paragraph"
        });
        t.attrs.refreshCallback = options.imageCallback;
        ctx.group.add(t);
        return { heightConsumed: t.height() + ctx.spaceY };
      }
    }
  ];

  // ===========================================================
  // 2) TREE WALK
  // ===========================================================

  const spaceYBase = config.fontSize * 1;
  let y = config.padding[0];

  // availableHeight clamping helper
  const clampHeight = (h) => {
    if (availableHeight == null) return h;
    const used = y - config.padding[0]; // already used
    const left = Math.max(availableHeight - used, 0);
    return Math.min(h, left);
  };

  const ctxBase = {
    group: g,
    config,
    availableWidth,
    options,
    primitive,
    spaceY: spaceYBase,
    clampHeight
  };

  const chooseRenderer = (node) => {
    const h = node?.heading || "";
    let best = { score: -1, r: null };
    for (const r of RENDERERS) {
      const s = r.match(h, node, ctxBase) ?? 0;
      if (s > best.score) best = { score: s, r };
    }
    return best.r;
  };

  const titleRenderer = RENDERERS.find(d=>d.name === "title")
  let first = true

  const visit = (node) => {
    if (!node) return;
    const thisSectionConfig = options?.sectionConfig?.[node?.heading] ?? {}
    const renderer = (thisSectionConfig.sectionStyle ? RENDERERS.find(d=>d.name === thisSectionConfig.sectionStyle) : undefined) ?? chooseRenderer(node);
    if( thisSectionConfig.show == false){
        return
    }

    if (renderer) {
        if( thisSectionConfig.largeSpacing && !first ){
            y += ctxBase.spaceY
        }
        if( thisSectionConfig.heading ){
            const res = titleRenderer.render({ ...ctxBase, config: {...ctxBase.config , ...thisSectionConfig}, y }, {content: node.heading}) || { heightConsumed: 0 };
            let consume = clampHeight(res.heightConsumed || 0);
            if (availableHeight != null && consume <= 0) return;
            y += consume - ctxBase.spaceY;
        }
        
        const res = renderer.render({ ...ctxBase, config: {...ctxBase.config , ...thisSectionConfig}, y }, node) || { heightConsumed: 0 };
        let consume = clampHeight(res.heightConsumed || 0);

        // if we've run out of space, stop walking
        if (availableHeight != null && consume <= 0) return;

        y += consume;
        first = false

        // if renderer says "don't traverse children", stop here
        if (res.skipTraversal) return;
    }

    // traverse children
    if (Array.isArray(node.subsections)) {
      for (const child of node.subsections) {
        if (availableHeight != null && (y - config.padding[0]) >= availableHeight) break;
        visit(child);
      }
    }
  };

  const data = primitive.referenceParameters.structured_summary;

  if (Array.isArray(data) && data.length) {
    // special-case: if there's no explicit title/summary sections, synthesize them from the first node
    /*const hasAny = (targets) =>
      data.some(n => scoreMatch(n?.heading, targets) >= 0.9);

    if (!hasAny(["title", "analysis title", "summary title"]) &&
        !hasAny(["description", "summary", "overview"])) {
      // synthesize: first node's heading as title; node as summary
      visit({ heading: "title", content: data[0]?.heading });
      visit({ heading: "summary", content: data[0]?.content ?? data[0]?.heading });
    }*/

    if( options.sectionConfig?.segment_title){
    const res = titleRenderer.render({ ...ctxBase, config: {...ctxBase.config, fontSize: (ctxBase.config.fontSize ?? 16) * 1.2 }, y }, {content: primitive.filterDescription}) || { heightConsumed: 0 };
    let consume = clampHeight(res.heightConsumed || 0);
    if (availableHeight != null && consume <= 0) return;
    y += consume - ctxBase.spaceY;
    }
    for (const node of data) {
      if (availableHeight != null && (y - config.padding[0]) >= availableHeight) break;
      visit(node);
    }
  } else {
    // --------- legacy single-field path (unchanged) ----------
    let text = primitive.referenceParameters[config.field];
    text = text?.replaceAll("\\n", "\n");
    const t = mkText({
      x: config.padding[3],
      y: config.padding[0],
      fontSize: config.fontSize,
      text,
      width: availableWidth
    });
    t.attrs.refreshCallback = options.imageCallback;
    if (options.inTable && options.height) t.y((options.height - t.height()) / 2);

    let h = t.height();
    if (availableHeight && h > availableHeight) {
      t.ellipsis(true);
      t.height(availableHeight);
      h = availableHeight;
    }
    g.add(t);
    y = Math.max(h + config.padding[0], options.height ?? 0);
  }

  const totalheight = Math.max(y + config.padding[2], config.padding[0] + config.padding[2]) + idHeight;

  if (options.getConfig) {
    return { ...config, height: totalheight };
  }

  g.setAttrs({ width: config.width, height: totalheight });
  r.height(totalheight);
  return g;
});
registerRenderer( {type: "categoryId", id: 109, configs: "default"}, function renderFunc(primitive, options = {}){

    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, width: 1200, padding: [10,10,10,10], ...options}
    if( config.minWidth){
        config.width = Math.max(config.width ?? 0, config.minWidth)
    }

    let idHeight = config.showId ?  20 : 0
    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.maxHeight !== undefined ? config.maxHeight - config.padding[0] - config.padding[2] - idHeight: undefined
    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 



    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        onClick: options.onClick,
        name:"inf_track primitive"
    })
    if( g ){
        const r = new Konva.Rect({
            x: 0,
            y: 0,
            width: config.width,
            cornerRadius: 2,
            fill: 'white',
            name:"background"
        })
        g.add(r)

        let text = primitive.referenceParameters[config.field] ?? primitive.referenceParameters[config.fallback]
        /*if( primitive.origin.plainId === 435057){
            text = text.replace(/^.+MVTR.+\n/,"")
        }*/
       if( typeof(text) === "object"){
        text = Object.keys(text).map(d=>`${d}: ${text[d]}`).join("\n")
       }
       text = text?.replaceAll('\\n','\n')

        const t = new CustomText({
            x: config.padding[3],
            y: config.padding[0],
            fontSize: config.fontSize,
            //fontFamily: "Poppins",
            lineHeight: 1.3,
            text: text,
            withMarkdown: true,
            fill: '#334155',
            wrap: true,
            width: availableWidth,
        })
        t.attrs.refreshCallback = options.imageCallback
        if( options.inTable && options.height ){
            t.y((options.height - t.height()) / 2)
        }

        let h = t.height()
        if( availableHeight ){
            if( h > availableHeight ){
                t.ellipsis(true)
                t.height( availableHeight )
                h = availableHeight
            }
        }
        //t.height(h)
        g.add(t)


        let totalheight = Math.max(h + config.padding[0] + config.padding[2] + idHeight, options.height ?? 0)

        if( options.getConfig){
            config.height = totalheight
            return config
        }

        if( config.showId ){
            const idText = new CustomText({
                name:"plainId",
                x: config.padding[3],
                y: totalheight - config.padding[2] - config.idSize ,
                fontSize: config.idSize,
                text: `${primitive.displayType} #${primitive.plainId}`,
                fill: '#94a3b8',
                wrap: true,
                width: availableWidth,
            })
            idText.attrs.refreshCallback = options.imageCallback
            g.add(idText)
        }

        g.setAttrs({
            width: config.width,
            height: totalheight
        })
        r.height( totalheight )
    }
    return g
})
registerRenderer( {type: "categoryId", id: 124, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseSocialMedia(primitive, {
            ...options, 
            width: defaultWidthByCategory[124],
            account_name: primitive.referenceParameters?.account,
            name: primitive.referenceParameters?.full_name,
            type: primitive.referenceParameters?.category_name,
            bioline1: primitive.referenceParameters?.biography,
            bioline2: primitive.referenceParameters?.bio_hastags,
            followers: primitive.referenceParameters?.followers,
            post_count: primitive.referenceParameters?.posts_count,
            engagement_score: primitive.referenceParameters?.avg_engagement,
        })
})


function baseSocialMedia(primitive, options){
    const config = {showId: true, idSize: 14, width: 480, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let idHeight = config.showId ?  20 : 0
    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.maxHeight !== undefined ? config.maxHeight - config.padding[0] - config.padding[2] - idHeight: undefined
    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 



    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        onClick: options.onClick,
        name:"inf_track primitive"
    })
    if( g ){
        const r = new Konva.Rect({
            x: 0,
            y: 0,
            width: config.width,
            cornerRadius: 2,
            fill: 'white',
        })
        g.add(r)

        let imageWidth = config.width
        let imageHeight = 0
        if( primitive.referenceParameters?.hasImg){
            imageHeight = (imageWidth / 16 * 9) + 10
            const img = imageHelper( `/api/image/${primitive.id}` + (primitive.imageCount ? `?${primitive.imageCount}` : ""), {
                x: 0,
                y: 0,
                padding: config.padding,
                width: imageWidth,
                height: imageHeight,
                center: true,
                fit:"cover",
                imageCallback: options.imageCallback,
                placeholder: options.placeholder !== false,
                maxScale: 1,
                scaleRatio: 2
                
            })
            g.add( img )
        }

        const textToShow = [
            options.account_name,
            options.name && `**${options.name}**`,
            options.bioline1,
            options.bioline2,
            " ",
            options.followers && `Followers: ${formatNumber(options.followers)}`,
            options.post_count && `Posts: ${formatNumber(options.post_count)}`,
            options.engagement_score && `Engagement Score: ${options.engagement_score}`
        ].filter(d=>d).join("\n")

        const t = new CustomText({
            x: config.padding[3],
            y: config.padding[0] + imageHeight,
            fontSize: 16,
            lineHeight: 1.15,
            withMarkdown: true,
            text: textToShow,
            fill: '#334155',
            wrap: true,
            imageCallback: options.imageCallback,
            ellipsis: true,
            width: availableWidth,
        })
        t.attrs.refreshCallback = options.imageCallback

        let h = t.height()
        if( availableHeight ){
            if( h > availableHeight ){
                t.ellipsis(true)
                t.height( availableHeight )
                h = availableHeight
            }
        }
        //t.height(h)
        g.add(t)


        let fy = 0

        let totalheight = fy + h + config.padding[0] + config.padding[2] + idHeight + imageHeight

        if( config.showId ){
            const idText = new CustomText({
                x: config.padding[3],
                y: totalheight - config.padding[2] - config.idSize ,
                fontSize: config.idSize,
                text: `${primitive.displayType} #${primitive.plainId}`,
                fill: '#94a3b8',
                wrap: true,
                width: availableWidth,
            })
            idText.attrs.refreshCallback = options.imageCallback
            g.add(idText)
        }

        g.setAttrs({
            width: config.width,
            height: totalheight
        })
        r.height( totalheight )
    }
    return g
}

export function renderPlaceholder(renderOptions = {}){
    let { 
        id, 
        x = 0, 
        y = 0, 
        width = 128, 
        height = 128, 
        type, 
        text, 
        scale = 1,
        fontFamily,
        ...options
    } = {
        ...renderOptions
    };

    const theme = renderOptions.theme ?? defaultTheme;
    const themeFont = theme.fontFamily ?? "Poppins";
    fontFamily = fontFamily ?? themeFont;

    width = Math.abs(width)
    height = Math.abs(height)
    

    const og = new Konva.Group({
        id: id,
        x,
        y,
        width,
        height,
        opacity: 0.6,
        id: options.ids?.[0],
        name:"inf_track primitive shape_element"
    })
    const g = new Konva.Group({
        id: id,
        x: 0,
        y: 0,
        width,
        height,
        opacity: 0.6,
        id: options.ids?.[0],
        name:"inf_track primitive shape_element"
    })
    const padding = Math.min(width, height) * 0.05 

    const usableHeight = height - (padding * 2)
    const usableWidth = width - (padding * 2)
    
    const r = new Konva.Rect({
        x: padding,
        y: padding,
        width: usableWidth,
        height: usableHeight,
        stroke: themeColor(theme, 'border', '#e2e2e2'),
        strokeWidth: 10 * scale,
        cornerRadius: padding
    })
    g.add(r)
    
    

    switch(options.style){
        case "text":
            {
                const h = usableHeight < 120 ? 10 * scale : 30 * scale
                const widths = [0.6, 0.8, 0.4, 0.7, 0.2]
                const lenW = widths.length
                const cornerRadius = h * 0.3
                for( let y = h + (padding * 2), i = 0 ; (y + h) < usableHeight; i++, y += ( h * 2)){
                    const thisWidth = (usableWidth - (2 * padding)) * widths[i % lenW]
                    g.add(new Konva.Rect({
                        x: padding * 2,
                        y,
                        width: thisWidth,
                        height: h,
                        cornerRadius,
                        fill: themeColor(theme, 'placeholder', '#e2e2e2')
                    }))
                }
            }
            break
        case "pie_chart":
            {
                const r = (Math.min(usableHeight, usableWidth) / 2) * 0.9
                g.add(new Konva.Circle({
                        x: padding + r + (usableWidth - r * 2) / 2,
                        y: padding + r + (usableHeight - r * 2) / 2,
                        radius: r,
                        fill: themeColor(theme, 'overlay', '#f2f2f2'),
                    }))
                g.add(new Konva.Arc({
                        x: padding + r + (usableWidth - r * 2) / 2,
                        y: padding + r + (usableHeight - r * 2) / 2,
                        angle: 50,
                        rotation: 270,
                        outerRadius: r,
                        fill: themeColor(theme, 'border', '#d2d2d2'),
                    }))
                  g.add(new Konva.Arc({
                          x: padding + r + (usableWidth - r * 2) / 2,
                          y: padding + r + (usableHeight - r * 2) / 2,
                          angle: 90,
                          rotation: 320,
                          outerRadius: r,
                          fill: themeColor(theme, 'placeholder', '#e2e2e2'),
                      }))

            }
            break
    }
    if( options.status?.message ){
        const t = new Konva.CustomText({
            text: options.status?.message,
            fontSize: usableWidth > 150 ? 40 * scale : 20 * scale ,
            align: "center",
            width: usableWidth,
            maxHeight: usableHeight,
            wrap: true
        })
        t.x( (width - t.width()) / 2)
        t.y( (height - t.height()) / 2)
        g.add(t)
    }
    
    og.add(g)
    return og

}
export function renderPlainObject(renderOptions = {}){
    let { 
        id, 
        x = 0, 
        y = 0, 
        width = 128, 
        height = 128, 
        type, 
        text, 
        fontFamily = "Poppins", 
        ...options 
    } = { 
        ...renderOptions 
    };
    let didOverflow = false

    width = Math.abs(width)
    height = Math.abs(height)
    

    const g = new Konva.Group({
        id: id,
        x,
        y,
        width,
        height,
        id: options.ids?.[0],
        name:"inf_track primitive shape_element"
    })
    if( options.fill || options.stroke){
        if( options.style === "line"){
            const l = new Konva.Line({
                points: [0,0,width,height],
                //fill: options.fill,
                stroke: options.stroke,
            })
            g.add(l)
        }else{
            const r = new Konva.Rect({
                x: 0,
                y: 0,
                width,
                height,
                fill: options.fill,
                stroke: options.stroke,
            })
            g.add(r)
        }
    } 
    if( options.style === "text" || type === "text"){
        let useText
        if( options.compose){
            let count = Array.isArray(text) ? text.length : 1            
            let flatText = Array.isArray(text) ? text.join("\n") : text
            useText = options.compose.replaceAll(`{text}`, flatText)
            useText = useText.replaceAll(`{count}`, count)
        }else{
            useText = Array.isArray(text) ? text.join("\n") : text
        }
        let padding = [0,0,0,0]

        if( options.text_padding && typeof(options.text_padding) == "string"){
            const parts = options.text_padding.split(",").map(d=>parseFloat(d.trim())).map(d=>isNaN(d) ? 0 : d)
            if( parts.length === 4){
                padding = [parts[0], parts[1], parts[2], parts[3]]
            }else if(parts.length === 2){
                padding = [parts[0], parts[1], parts[0], parts[1]]
            }else{
                padding = [parts[0], parts[0], parts[0], parts[0]]
            }
        }

        let fontStyle = options.fontStyle

        if( options.fontStyle === "auto" ){
            fontStyle = "normal"
            useText = useText
                .split('\n')
                .map(line => {
                const match = line.match(/^([^:]+):/);
                if (match) {
                    const prefix = match[1];
                    return line.replace(prefix + ':', `**${prefix}**:`);
                }
                return line;
                })
                .join('\n');
        }
        let y = 0
        if(options.heading){
            const t = new CustomText({
                x: padding[3],
                y: y,
                fontSize: 12,
                fontFamily: fontFamily,
                fontStyle:"bold",
                text: options.heading.toUpperCase(),
                fill: '#999999',
                showPlaceHolder: false,
                wrap: false,
                bgFill: 'transparent',
                align:'center',
                width: width - padding[3] - padding[1],
                withMarkdown: false,
                ellipsis: false,
                refreshCallback: options.imageCallback
            })
            g.add(t)
            y += t.height() * 2
        }

        const t = new CustomText({
            x: padding[3],
            y: padding[1]+ y,
            width: width - padding[3] - padding[1],
            height: height - padding[2] - padding[0],
            lineHeight: options.lineHeight ?? 1.2,
            text: useText,
            withMarkdown: true,
            fill: options.text_color ?? "black",
            fontFamily: fontFamily,
            fontSize: options.fontSize,
            align: options.align,
            fontStyle: fontStyle,
            refreshCallback: options.imageCallback
        })
        g.add(t)
        if( options.fromPrimitive){
            g.name("inf_track primitive")
        }
    }else  if( type === "structured_text"){
        const {didOverflow: thisOverflow} = renderFormattedSections( text, g, {width, height, fontFamily, ...options})
        didOverflow ||= thisOverflow
    }
    if( didOverflow ){
        g.attrs.overflowing = true
    }
    return g

}

registerRenderer( {type: "categoryId", id: 138, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseImageWithText(primitive, {...options, textField: primitive.referenceParameters?.summary})
})
registerRenderer( {type: "categoryId", id: 149, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseImageWithText(primitive, {itemSize: options?.width ?? 280, ...options, textField: primitive.referenceParameters?.overview, padding: [10,10,10,10], imageUrl: primitive.referenceParameters?.imageUrl})
})
registerRenderer( {type: "categoryId", id: 123, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseImageWithText(primitive, {...options, textField: primitive.referenceParameters?.description, width: options.width ?? 320, padding: [10,10,10,10], imageUrl: primitive.referenceParameters?.imageUrl})
})
registerRenderer( {type: "categoryId", id: 122, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseImageWithText(primitive, {...options, textField: primitive.referenceParameters?.overview, width: options.width ?? 320, imageUrl: primitive.referenceParameters?.imageUrl})
})
registerRenderer( {type: "categoryId", id: 152, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseImageWithText(primitive, {...options, textField: primitive.referenceParameters?.overview, width: options.width ?? 320, imageUrl: primitive.referenceParameters?.imageUrl})
})
registerRenderer( {type: "categoryId", id: 125, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseImageWithText(primitive, {...options, textField: `**${primitive.title}**\n${primitive.referenceParameters?.description ?? ""}`, width: options.width ?? 320, brandName: "reddit"})
})
registerRenderer( {type: "categoryId", id: 63, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseImageWithText(primitive, {...options, textField: primitive.referenceParameters?.snippet ?? primitive.text})
})
registerRenderer( {type: "categoryId", id: 34, configs: "default"}, function renderFunc(primitive, options = {}){
    //return baseImageWithText(primitive, {...options, textField: primitive.referenceParameters?.description.replace(/[\*-]+/g, '')?.replace(/\n+/g, '\n')?.replace(/\s+/g, ' ').trim() ?? primitive.snippet})
    return baseImageWithText(primitive, {...options, textField: primitive.snippet ??  primitive.referenceParameters?.description?.replace(/[\*-]+/g, '')?.replace(/\n+/g, '\n')?.replace(/\s+/g, ' ')?.trim()?.slice(0,200) ?? ""})
})
function baseImageWithText(primitive, options){
    const config = {showId: true, idSize: 14, fontSize: 16, width: 256, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let idHeight = config.showId ?  20 : 0
    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.maxHeight !== undefined ? config.maxHeight - config.padding[0] - config.padding[2] - idHeight: undefined
    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 



    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        onClick: options.onClick,
        name:"inf_track primitive"
    })
    if( g ){
        const r = new Konva.Rect({
            x: 0,
            y: 0,
            width: config.width,
            cornerRadius: 2,
            fill: 'white',
        })
        g.add(r)


        let imageHeight = 0
        let url
        let imageFit = "cover"
        imageHeight = (config.width / 16 * 9) + 10
        if( primitive.referenceParameters?.hasImg){
            url = `/api/image/${primitive.id}` + (primitive.imageCount ? `?${primitive.imageCount}` : "")
        }else if( primitive.referenceParameters.source === "Instagram" ){
            const shortcode = primitive.referenceParameters.url.split("/").at(-1)
            url = "/api/remoteImage?url=" + encodeURIComponent(`https://www.instagram.com/p/${shortcode}/media/?size=m`)
        }else if( options.imageUrl ){
            url = "/api/remoteImage?url=" + encodeURIComponent(options.imageUrl)
        }else if( options.brandName ){
            imageFit = "comtain"
            url = "/api/companyLogo?name=" + options.brandName
        }
        if( url ){
            g.add( imageHelper( url , {
                x: 0,
                y: 0,
                padding: config.padding,
                width: config.width,
                height: imageHeight,
                center: true,
                maxScale: 1,
                scaleRatio: 2,
                fit: imageFit,
                imageCallback: options.imageCallback,
                placeholder: options.placeholder !== false
            }))

        }

        let textToShow = options.textField?.trim()
        let hashtags
        if( options.renderOptions?.extract_hashtags){
            const {text: cleaned, hashtags: _hashtags} = extractHashtags( textToShow)
            hashtags = _hashtags
            textToShow = cleaned
            if( !isNaN(options.renderOptions.extract_hashtags)){
                hashtags = hashtags.slice(0, options.renderOptions.extract_hashtags)
                const delta = _hashtags.length - options.renderOptions.extract_hashtags
                if( delta > 0){
                    hashtags.push(`+${delta} more`)
                }

            }
        }

        if( options.renderOptions?.text_length){
            const parts = textToShow.split(/\s+/)
            textToShow = parts.slice(0, options.renderOptions.text_length).join(" ")
            if( parts.length > options.renderOptions.text_length ){
                textToShow += "..."
            }
        }else{
            textToShow = textToShow?.slice(0,150)
        }
        let y = config.padding[0] + imageHeight
        let totalheight = y + idHeight + config.padding[2] 
        let hashtagText 
        if( hashtags ){
            hashtagText = new CustomText({
                x: config.padding[3],
                y,
                fontSize: config.fontSize * 0.75,
                lineHeight: 1.5,
                text: hashtags.join(" "),
                fontStyle: "bold",
                fill: '#999',
                wrap: true,
                    imageCallback: options.imageCallback,
                width: availableWidth,
            })
            g.add( hashtagText )
            y += hashtagText.height() + (config.fontSize * 0.5)
            totalheight = y + (config.fontSize * 0.5) + idHeight + config.padding[2] 
        }

        if( availableHeight ){
            if( y > availableHeight ){
                hashtagText.ellipsis(true)
                hashtagText.height( availableHeight )
            }
        }
        if( !availableHeight || y < availableHeight ){
            const t = new CustomText({
                x: config.padding[3],
                y: y,
                fontSize: config.fontSize,
                lineHeight: 1.5,
                text: textToShow,
                fill: '#334155',
                withMarkdown: true,
                wrap: true,
                    imageCallback: options.imageCallback,
                ellipsis: true,
                width: availableWidth,
            })
            t.attrs.refreshCallback = options.imageCallback

            totalheight = t.y() + t.height() 

            if( availableHeight ){
                if( totalheight > availableHeight ){
                    t.ellipsis(true)
                    t.height( availableHeight - t.y() )
                }
            }
            g.add(t)
            totalheight = t.y() + t.height() + (config.fontSize * 0.5) + idHeight + config.padding[2] 
        }



        if( config.showId ){
            const idText = new CustomText({
                x: config.padding[3],
                y: totalheight - config.padding[2] - config.idSize ,
                fontSize: config.idSize,
                text: `${primitive.displayType} #${primitive.plainId}`,
                fill: '#94a3b8',
                wrap: true,
                width: availableWidth,
            })
            idText.attrs.refreshCallback = options.imageCallback
            g.add(idText)
        }

        g.setAttrs({
            width: config.width,
            height: totalheight
        })
        r.height( totalheight )
    }
    return g
}
registerRenderer( {type: "default", configs: "ai_processing"}, function renderFunc(primitive, options = {}){
    const config = {showId: true, idSize: 14, width: 256, height: 212, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let ox = (options.x ?? 0)
    let oy = (options.y ?? 0)

    const theme = options.theme ?? defaultTheme;

    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        name:"inf_track primitive"
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        cornerRadius: 2,
        fill: 'white',
    })
    g.add(r)
    const spinner = createSpinner( 10, 60, config.width / 2, config.height / 2)
    g.add( spinner)

    var angularSpeed = 360 / 4000 / 33;
    let lastTick, startTick
    let count = 0
    if( options.amimCallback ){
        g.attrs.hasAnimationNode = spinner._id
        options.amimCallback(spinner, (tick)=>{
            if( !lastTick ){
                lastTick = tick
                startTick = tick
            }
            if( (tick - lastTick) < 33){
                return false
            }
            lastTick = tick
            const duration = tick - startTick
            const rotation = (duration / 2000) * 360
            //spinner.rotation(rotation);
            count++
            spinner.rotation(count * (250/9));
            return true
        })

    }
    
    return g
})

function createSpinner(n, radius, centerX, centerY) {
    const spinnerGroup = new Konva.Group({
        x: centerX,
        y: centerY,
    });


    const angleIncrement = 250 / (n - 1); // 240 degrees divided by (n-1) intervals
    const colorIncrement = 255 / (n - 1); // Color increment for shading
    
    const circle = new Konva.Circle({
        x: 0,
        y: 0,
        radius: radius * 1.4,
        fill: "white"
    })
        spinnerGroup.add(circle);


    for (let i = 0; i < n; i++) {
        const angle = (angleIncrement * i) * (Math.PI / 180); // Convert degrees to radians
        const x = radius * Math.cos(angle);
        const y = -radius * Math.sin(angle); // Y coordinate inverted for canvas

        const redValue = Math.round((i / (n - 1)) * 230); // From 0 to 230
        const greenValue = 255; // Constant green
        const blueValue = Math.round((i / (n - 1)) * 230); // From 0 to 230
        const color = `rgb(${redValue}, ${greenValue}, ${blueValue})`; // Interpolated color

        //const colorValue = Math.floor(255 - colorIncrement * Math.abs((n/2) - i)); // Darker in the middle, lighter on edges
        //const color = `rgb(0, ${colorValue}, 0)`;

        const circle = new Konva.Circle({
            x: x,
            y: y,
            radius: radius * 0.15, // Adjust the size of the small circles
            fill: color
        });

        spinnerGroup.add(circle);
    }
    spinnerGroup.offsetX(spinnerGroup.width() / 2);
    spinnerGroup.offsetY(spinnerGroup.height() / 2);

    return spinnerGroup;
}


registerRenderer( {type: "default", configs: "default"}, function renderFunc(primitive, options = {}){
    const config = {showId: true, idSize: 14, width: 256, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let idHeight = config.showId ?  20 : 0
    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.maxHeight !== undefined ? config.maxHeight - config.padding[0] - config.padding[2] - idHeight: undefined
    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 



    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        onClick: options.onClick,
        name:"inf_track primitive"
    })
    if( g ){
        const r = new Konva.Rect({
            x: 0,
            y: 0,
            width: config.width,
            cornerRadius: 2,
            fill: 'white',
        })
        g.add(r)
        const t = new CustomText({
            x: config.padding[3],
            y: config.padding[0],
            fontSize: 16,
            lineHeight: 1.5,
            text: primitive.title,
            verticalAlign: options.inTable ? "middle" : undefined,
            fill: '#334155',
            wrap: true,
            width: availableWidth,
        })
        t.attrs.refreshCallback = options.imageCallback

        let h = t.height()
        if( availableHeight ){
            if( h > availableHeight ){
                t.ellipsis(true)
                t.height( availableHeight )
            }
        }
        //t.height(h)
        g.add(t)


        let fy = 0
        if( primitive.referenceId === 101 ){
            const fields = [[["Description", "Description: " + primitive.referenceParameters?.description], ["Pricing", "Pricing: $" +primitive.referenceParameters?.price_month + "/mo"]],Object.keys(primitive.referenceParameters?.features ?? {}).map(d=>[d,`${primitive.referenceParameters.features[d]}`])].flat()
            const showFieldName = false
            fy = h + config.padding[0] + config.padding[2] + 8
            for(const d of fields){
                if(d[1] === "FALSE"){
                    continue
                }
                let h = 0
                if( showFieldName ){
                    const t1 = new CustomText({
                        x: config.padding[3],
                        y: fy,
                        fontSize: 12,
                        lineHeight: 1.5,
                        text: d[0],
                        fill: '#334155',
                        wrap: true,
                        width: availableWidth * 0.25,
                    })
                    t1.attrs.refreshCallback = options.imageCallback
                    g.add(t1)
                    h = t1.height()
                }
                const t2 = new CustomText({
                    x: config.padding[3] + (showFieldName ? (availableWidth * 0.25) + 8 : 0),
                    y: fy,
                    fontSize: 12,
                    lineHeight: 1.5,
                    text: d[1],
                    fill: '#334155',
                    wrap: true,
                    width: (availableWidth * 0.75) - 8,
                })
                t2.attrs.refreshCallback = options.imageCallback
                g.add(t2)
                fy += Math.max(h, t2.height()) + 4
            }

        }


        let totalheight = fy + h + config.padding[0] + config.padding[2] + idHeight

        if( config.showId ){
            const idText = new CustomText({
                x: config.padding[3],
                y: totalheight - config.padding[2] - config.idSize ,
                fontSize: config.idSize,
                text: `${primitive.displayType} #${primitive.plainId}`,
                fill: '#94a3b8',
                wrap: true,
                width: availableWidth,
            })
            idText.attrs.refreshCallback = options.imageCallback
            g.add(idText)
        }

        g.setAttrs({
            width: config.width,
            height: totalheight
        })
        r.height( totalheight )
    }
    return g
})


registerRenderer( {type: "categoryId", id: 95, configs: "default"}, (primitive, options = {})=>{
    const config = {width: 555, height: 800, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 



    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        name:"inf_track primitive inf_keep"
    })
    const bg = new Konva.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        fill: themeColor(theme, "background", "#ffffff")

    })
    g.add( bg )
    if( options.concept_info?.[primitive.id]){

        /*const logo = imageHelper( `/published/image/${options.concept_info[primitive.id]?.id}`, {
            size: 48,
            x: config.padding[3] + 12,
            y: config.padding[0] + 6,
            center: true,
            imageCallback: options.imageCallback,
            placeholder: options.placeholder !== false
        })
        g.add( logo )*/
        const conceptText = new Konva.Text({
            x: config.padding[3] + 68,
            y: config.padding[0] + 8,
            fontSize:14,
            fontStyle:"bold",
            width: config.width - config.padding[3] - config.padding[1] - 24,
            text: options.concept_info[primitive.id]?.title
        })
        g.add( conceptText )
    }
    const concept2Text = new Konva.Text({
        x: config.padding[3] + 68,
        y: config.padding[0] + 8 + 16,
        fontSize:12,
        lineHeight:1.2,
        width: config.width - config.padding[3] - config.padding[1] - 24,
        fill: themeColor(theme, 'accent', '#7e8184'),
        text: "1,264 followers\nPromoted"
    })
    g.add( concept2Text )
    const subheading = new Konva.Text({
        x: config.padding[3] + 12,
        y: 64,
        fontSize:14,
        width: config.width - config.padding[3] - config.padding[1],
        wrap: true,
        text: primitive.referenceParameters?.subheadline
    })
    g.add( subheading )
    const image = imageHelper( `/published/image/${primitive.id}`, {
        x: 0,
        y: subheading.attrs.y + subheading.height() + 8,
        padding: [0,0,0,0],
        width: 555,
        height: 300,
        center: true,
        imageCallback: options.imageCallback,
        fit: "cover",
        placeholder: options.placeholder !== false,
        maxScale: 1,
        scaleRatio: 4

    })
    g.add( image )
    const headingText = new Konva.Text({
        x: config.padding[3] + 12,
        y: 380,
        y: image.attrs.y + image.height() + 12,
        fontSize:14,
        fontStyle:"bold",
        width: config.width - config.padding[3] - config.padding[1] - 24,
        wrap: true,
        text: primitive.referenceParameters?.headline
    })
    const urlText = new Konva.Text({
        x: config.padding[3] + 12,
        y: 380,
        y: image.attrs.y + image.height() + 12 + headingText.height() +8 ,
        fontSize:12,
        width: config.width - config.padding[3] - config.padding[1] - 24,
        fill: themeColor(theme, "accent", "#7e8184"),
        wrap: true,
        text: primitive.referenceParameters?.url ?? "www.homepage.io"
    })
    const textBg = new Konva.Rect({
        x: 0,
        y: image.attrs.y + image.height(),
        width: config.width,
        height: headingText.height() + 36 + urlText.height(),
        fill: themeColor(theme, "overlay", "#edf3f8")

    })
    let footerHeight = 0

    g.add( textBg )
    g.add( headingText )
    g.add( urlText )
    g.height( textBg.attrs.y + textBg.attrs.height + footerHeight)
    bg.height( textBg.attrs.y + textBg.attrs.height + footerHeight)

    return g


})

registerRenderer( {type: "categoryId", id: 100, configs: "default"}, (primitive, options = {})=>{
    const config = {width: 600, height: 1800, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 



    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        name:"inf_track primitive inf_keep"
    })
    if( g ){

        const logo = imageHelper( `/api/image/${primitive.id}` + (primitive.imageCount ? `?${primitive.imageCount}` : ""), {
            x: 0,
            y: 0,
            padding: config.padding,
            width: config.width,
            height: config.height,
            center: true,
            imageCallback: options.imageCallback,
            placeholder: options.placeholder !== false,
            maxScale: 1,
            scaleRatio: 4

        })
        g.add( logo )

    }
    return g


})
registerRenderer( {type: "type", id: "flow", configs: "default"}, (primitive, options = {})=>{
    const config = {width: 800, height: 600, ...options}
    const g = new Konva.Group({
        id: primitive.id,
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        minRenderSize : 0,
        name:"inf_track inf_keep"
        //name:"inf_track action_primitive inf_keep"
    })
    return g
})
function arrowButton({x = 0, y = 0, size = 60, dir = "right", callback, theme = defaultTheme}){

    const g = new Konva.Group({
        x, y, onClick: callback,
        width: size,
        height: size,
        name: "clickable"
    })
    const color = themeColor(theme, 'primary', 'black');
    if( dir === "left"){
        g.add( new Konva.Line({
            name: "hover_target",
            fill: color,
            points: [size,0,
                0, size / 2,
                size,size
            ],
            closed: true
        }))
    }else{
        g.add( new Konva.Line({
            name: "hover_target",
            fill: color,
            points: [0,0,
                size, size / 2,
                0,size
            ],
            closed: true
        }))

    }
    return g
}
registerRenderer( {type: "type", id: "page", configs: "default"}, (primitive, options = {})=>{
    const config = {width: 1920, height: 1080, pageColumns: 6, ...options}
    const theme = options.theme ?? defaultTheme;
    const g = new Konva.Group({
        id: primitive.id,
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        minRenderSize : 0,
        name:"inf_track",
        clipX:0,
        clipY:0,
        clipWidth:config.width,
        clipHeight:config.height
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        stroke: themeColor(theme, 'border', '#555'),
        fill: themeColor(theme, 'background', 'white'),
        name:"background"
    })
    g.add(r)


    let startX = 0
    let startY = 0
    let pageCol = 0
    let maxX = config.width, maxY = config.height
    let pageIdx = options.itemIdx ?? 0
    if( !options.utils?.prepareBoards){
        if( primitive.slide_state?.data?.slideSpec && !options.getConfig ){
            let margin = [60, 60 ,60, 60], spacer = [20,20]
            let mainWidth = 1920  - margin[3] - margin[1]
            let headerFontSize = 48
            const skeleton = primitive.slide_state.data?.slideSpec
            const t = new CustomText({
                text: skeleton.title,
                align:"left",
                fontStyle: "bold",
                fill: themeColor(theme, 'muted', '#777'),
                x: margin[3],
                y: margin[0],
                wrap: true,
                width: mainWidth,
                lineHeight: 1.05,
                fontSize: headerFontSize ,
                refreshCallback: options.imageCallback,
                fontFamily: theme.fontFamily
            })
            g.add(t)

            const sections = skeleton.sections
            const sectionWidth = (mainWidth - ((sections.length - 1) * spacer[1])) / sections.length
            sections.forEach((d,i)=>{
                let x = margin[3] + (i * (sectionWidth + spacer[1]))
                let y = margin[0] + (headerFontSize * 2 * 1.05) + spacer[1]
                const sectionHeight = 1080 - margin[2] - y

                const sectionData = options.data?.sections[i]

                g.add( new Konva.Rect({
                    x, 
                    y,
                    width: sectionWidth, 
                    height: sectionHeight,
                    strokeWidth: 1,
                    stroke: themeColor(theme, 'border', '#a2a2a2'),
                    cornerRadius: 10,
                    dashEnabled: true,
                    dash:[5,3]
                }))
                
                 const t = new Konva.CustomText({
                    text: d.overview,
                    fontSize: 26,
                    align: "center",
                    x: x + 40,
                    width: sectionWidth - 80,
                    wrap: true,
                    fontFamily: theme.fontFamily
                })

                const previewWidth = sectionWidth / 3 * 2
                const previewHeight = sectionHeight / 3 * 2
                const offsetY = (sectionHeight - (previewHeight + spacer[0] + t.height())) / 2

                const preview = sectionData?.visualization

                if( preview ){
                    const thisRenderOptions = preview.renderOptions
                    if( thisRenderOptions.size === "size"){
                        thisRenderOptions.width = previewWidth
                        thisRenderOptions.height = previewHeight
                    }
                    const chart = renderDatatable({
                        data: preview.data,
                        viewConfig: preview.viewConfig,
                        renderOptions: thisRenderOptions,
                        id: primitive.id,
                        stageOptions:{
                            x: x + (sectionWidth - previewWidth) / 2,
                            y: y + offsetY,
                            imageCallback: options.imageCallback
                        },
                        theme: options.theme
                    })
                    g.add(chart)
                    if( preview.renderOptions.size === "scale"){
                        const scale = Math.min( previewWidth / chart.width(), previewHeight / chart.height() )
                        chart.scale({x: scale, y: scale})
                    }
                }else{
                    g.add( renderPlaceholder({
                        x: x + (sectionWidth - previewWidth) / 2,
                        y: y + offsetY,
                        style: d.type === "visualization" ? "pie_chart" : "text",
                        scale: 0.5,
                        width: previewWidth,
                        height: previewHeight,
                        theme: options.theme
                    }))
                }
                t.y( y + offsetY + previewHeight + spacer[0])
                g.add(t)
            })
            const suggestions = primitive.slide_state.suggestions
            const suggestionCount = primitive.slide_state.suggestions.length
            const currentSuggestion = (primitive.slide_state.data?.selection ?? 1) 

            function switchSuggestion(suggestion){
                console.log(`DEPRECATED - DO NOT SET IN RENDERER`)
                const newData = {
                    ...primitive.slide_state,
                    data: {
                        selection: suggestion,
                        slideSpec: suggestions[suggestion - 1]
                    }
                }
                

                primitive.setField("slide_state", newData)
            }

            if( currentSuggestion > 1){
                g.add( arrowButton( {x: 1840, y: 1040, size: 30, dir: "left", callback: ()=>switchSuggestion( currentSuggestion - 1), theme} ))
            }
            if( currentSuggestion < suggestionCount ){
                g.add( arrowButton( {x: 1880, y: 1040, size: 30, dir: "right", callback: ()=>switchSuggestion( currentSuggestion + 1), theme} ))
            }
        }
        g.name("inf_track page")
    }else{
        const subpages = options.utils.prepareBoards( primitive )
        for(const subboards of subpages){
        const subrenders = subboards.map(d=>options.utils.renderBoard(d, {imageCallback: options.imageCallback, amimCallback: options.amimCallback, theme: options.theme}))
            let i = 0

            const sg = new Konva.Group({
                id: primitive.id,
                x: startX,
                y: startY,
                width: config.width,
                height: config.height,
                onClick: options.onClick,
                minRenderSize : 0,
                pageIdx,
                name:"inf_track _inf_keep _page",
                clipX:0,
                clipY:0,
                clipWidth:config.width,
                clipHeight:config.height
                //name:"inf_track action_primitive inf_keep"
            })
            const r = new Konva.Rect({
                x: 0,
                y: 0,
                width: config.width,
                height: config.height,
                stroke: themeColor(theme, 'border', '#555'),
                fill: themeColor(theme, 'background', 'white'),
                name:"background"
            })
            sg.add(r)

            g.add(sg)


            let idx = 0

            for(const sub of subrenders){
                if( !sub?.rendered ){
                    continue
                }
                sub.rendered.stateData = subboards[idx].state
                idx++
                const ss = sub.rendered.scaleX()
                const sw = (sub.rendered.width() * ss)
                const sh = (sub.rendered.height() * ss)
                const r = sub.x + sw
                const b = sub.y + sh
                const cl = Math.max( -sub.x / ss, 0)
                const ct = Math.max( -sub.y / ss, 0)
                const cw = r > config.width ? config.width - cl - sub.x : config.width
                const ch = b > config.height ? config.height - ct - sub.y : config.height
                sub.rendered.x(sub.x)
                sub.rendered.y(sub.y)
                sub.rendered.attrs.pageTrack = pageIdx
                sub.rendered.find(d=>d.attrs.name?.includes("inf_track")).forEach(d=>d.attrs.pageTrack = pageIdx)
                if( !sub.rendered.name()){
                    sub.rendered.name('inf_track primitive')
                }
                sub.rendered.clip({
                    x: cl,
                    y: ct,
                    width: cw / ss,
                    height: ch /ss
                })
                sg.add(sub.rendered)
            }
            maxX = Math.max(maxX, startX + config.width)
            maxY = Math.max(maxY, startY + config.height)
            startX += config.width + 20
            pageCol++
            if( pageCol >= config.pageColumns ){
                pageCol = 0
                startX = 0
                startY += config.height + 20
            }
            pageIdx++
        }
        
        g.width(maxX)
        g.height(maxY)
        g.clipWidth(maxX)
        g.clipHeight(maxY)
        r.width(maxX)
        r.height(maxY)
        r.fill("#f2f2f2")
        if( options.getConfig ){
            config.height = maxY
            config.width = maxX
        }
    }
    config.width = maxX
    config.height = maxY
    if( options.getConfig ){
        return config
    }

    return g
})


registerRenderer( {type: "type", id: "actionrunner", configs: "default"}, (primitive,options)=>renderDefaultActionPrimitive(primitive, {...options, typeText: "Action", typeIcon: <HeroIcon icon='FARun'/>}))
registerRenderer( {type: "type", id: "summary", configs: "widget"}, (primitive,options)=>renderDefaultActionPrimitive(primitive, {...options, contentAsMarkdown: true,typeText: "Summary", typeIcon: <HeroIcon icon='FARun'/>}))
registerRenderer( {type: "type", id: "categorizer", configs: "widget"}, (primitive,options)=>renderDefaultActionPrimitive(primitive, {...options, contentAsMarkdown: true,typeText: "Action", typeIcon: <HeroIcon icon='FARun'/>}))
registerRenderer( {type: "type", id: "query", configs: "widget"}, (primitive,options)=>renderDefaultActionPrimitive(primitive, {...options, contentAsMarkdown: true, typeText: "Query", typeIcon: <HeroIcon icon='FARobot'/>}))
registerRenderer( {type: "type", id: "action", configs: "widget"}, (primitive,options)=>renderDefaultActionPrimitive(primitive, {...options, contentAsMarkdown: true, typeText: "Action", typeIcon: <HeroIcon icon='FARobot'/>}))
registerRenderer( {type: "type", id: "search", configs: "default"}, renderDefaultActionPrimitive)

function renderDefaultActionPrimitive(primitive, options){
        options.data ||= {}
        const config = {width: 500, height: 100, ...options}
        const g = new Konva.Group({
            id: primitive.id,
            x: config.x,
            y: config.y,
            width: config.width,
            height: config.height,
            onClick: options.onClick,
            minRenderSize : 0,
            name:"inf_track action_primitive inf_keep"
        })
        const r = new Konva.Rect({
            x: 0,
            y: 0,
            cornerRadius: 10,
            width: config.width,
            height: config.height,
            fill: PrimitiveConfig.typeConfig[primitive.type]?.render?.background ?? "#fff"
        })
    
        let lx = 5, ly = 5
        function addWidgetText(text, options = {}){
            if( options.x ){
                lx = options.x
            }
            if( options.y ){
                ly = options.y
            }
            ly += (options.margin?.[0] ?? 0)
            let fontHeight = options.fontSize ?? 14
            let lineHeight = options.lineHeight ?? 1.1
            const t = new CustomText({
                text: text,
                align:"left",
                wrap: false,
                ellipsis: true,
                withMarkdown: options.markdown,
                fontStyle: options.bold ? "bold" : undefined,
                fill: options.color,
                verticalAlign:"middle",
                x: lx,
                y: ly,
                wrap: options.wrap,
                lineFill: options.lineFill,
                width: config.width - lx,
                lineHeight: lineHeight,
                fontSize: fontHeight,
                refreshCallback: options.imageCallback
            })
            ly += t.height() + (options.margin?.[1] ?? 0)
            return t
        }
    
        g.add(r)
    
        if( options.data.icon ){
            renderReactSVGIcon( options.data.icon, 
                {
                    target: g,
                    x:lx, 
                    y:ly,
                    width: 48,
                    height: 48,
                    imageCallback: options.imageCallback
                })
            lx = 56
            ly = 12
        }

        g.add(addWidgetText(options.data.title, {fontSize: 18, bold:true, lineFill: '#666'}))
        
        if( options.data.count !== undefined){

            const count = addWidgetText(options.data.count + " " + options.data.items, {color: "#eee", fontSize: 14, lineFill: "#3f6212"})
            const pill = new Konva.Rect({
                x: lx,
                y: count.attrs.y,
                cornerRadius: 10,
                fill: PrimitiveConfig.typeConfig[primitive.type]?.render?.accentBackground ?? "#626262",
                width: count.textWidth + 16,
                height: count.textHeight + 8
            })
            count.attrs.x += 8
            count.attrs.y += 5
            ly += 5
            g.add(pill)
            g.add(count)
        }
        
        if( options.data?.descendants ){
            let py = 20
            for(const d of options.data.descendants ){
                g.add(addWidgetText(d.title + " - " + d.count, {x: 20, y: py + 2}))
                if( d.icon ){
                    renderReactSVGIcon( d.icon, 
                            {
                                target: g,
                                x:2, 
                                y:py,
                                width: 16,
                                height: 16,
                                imageCallback: options.imageCallback,
                                target: g
                            })
                }
                py += 20
            }
        }
        if( options.data.content ){
            g.add(addWidgetText(options.data.content, {fontSize: 14, lineHeight: 1.25, color: '#555', wrap: true, markdown: options.contentAsMarkdown, margin: [8,8]}))
        }
        
    
        const button1 = new Konva.Group({
            x: config.width - 46,
            y: 5,
            width: 36,
            height:36,
            name:"inf_track widget"
        })
    
        if( true ){
            const progress = 0.3
            button1.add( new Konva.Circle({
                x: 18,
                y: 18,
                radius: 16,
                stroke: '#3f6212',
                strokeWidth: 1,
                name: "hover_target"
            }))
            button1.add( new Konva.Arc({
                x: 18,
                y: 18,
                innerRadius: 14,
                outerRadius: 18,
                angle: 360 * progress,
                rotation: 270,
                stroke: undefined,
                fill: "#3f6212",
                name: "hover_target"
            }))
            button1.add( new Konva.Rect({
                x: 13,
                y: 13,
                width: 10,
                height: 10,
                fill: "#3f6212",
                hoverFill: r.attrs.fill,
                name: "hover_target"
            }))
        }else{
            button1.add( new Konva.Circle({
                x: 18,
                y: 18,
                radius: 18,
                stroke: '#3f6212',
                strokeWidth: 1,
                fill: r.attrs.fill,
                hoverFill: "#3f6212",
                name: "hover_target"
            }))
            button1.add( new Konva.Line({
                points:[20-8.66,8,20+8.66,18,20-8.66,28],
                fill: "#3f6212",
                hoverFill: r.attrs.fill,
                closed: true,
                name: "hover_target"
            }))
        }
        g.add(button1)
    
        const finalHeight = Math.max( config.height, ly + 20)
        r.height(finalHeight)
        g.height(finalHeight)

        if( options.getConfig ){
            config.height = finalHeight
            return config
        }
    
        renderReactSVGIcon( options.typeIcon ?? MagnifyingGlassIcon, 
                            {
                                props: {fill: "#555"},
                                target: g,
                                x:5, 
                                y: finalHeight - 20,
                                width: 16,
                                height: 16,
                                imageCallback: options.imageCallback,
                                
                            })
        g.add(addWidgetText(`${options.typeText ?? "Search"} #${primitive.plainId}`, {color:"#555", fontSize: 11, x: 25, y: finalHeight- 18}))

        if( true ){
            const label = new CustomText({text: "Show", color: "#eee", fontSize: 11, lineFill: "#3f6212", x: 4, y: 3})
            const button = new Konva.Group({
                x: config.width - 46,
                y: finalHeight - 18,
                width: label.width() + 8,
                height: label.height() + 4,
                name:"inf_track widget"
            })
            button.add(new Konva.Rect({
                x: 0,
                y: 0,
                cornerRadius: 10,
                fill: '#f2f2f2',
                hoverFill: '#d2d2d2',
                width: button.width(),
                height: button.height(),
                data: {
                    open: options.data.showItems
                },
                name: "hover_target clickable toggle_items"
            }))
            button.add(label)
            g.add(button)
        }

        return g
}

export function convertIconForKonva( icon, options ){
    if( typeof(icon) === "string"){
    }else if( typeof(icon) === "function"){
        icon = renderToString( icon(options.props))
    }else if( icon.render ){
        icon = renderToString( icon.render(options.props))
    }else if( icon.$$typeof ){
        //icon = renderToString( icon )
        icon = renderToString(cloneElement(icon, options.props));
    }else{
        return undefined
    }
    const dim = options.width && options.height ? undefined : extractSVGDimensions(icon)
    let width = options.width ?? dim.width
    let height = options.height ?? dim.height
    let ox = 0, oy = 0

    if( options.width && options.height && options.center){
        const dim = extractSVGDimensions(icon)
        const scale = Math.min( options.width / dim.width, options.height / dim.height)
        const nWidth = dim.width * scale
        const nHeight = dim.height * scale
        ox = (width - nWidth) / 2
        oy = (height - nHeight) / 2
        width = nWidth
        height = nHeight
    }
    return {icon, ox, oy, width, height}
}


function renderReactSVGIcon( _icon, options = {} ){
    const {icon, ox, oy, width, height} = convertIconForKonva( _icon, options)
    const o = imageHelper( 'svg:' + icon, {
        x: (options.x ?? 0) + ox,
        y: (options.y ?? 0) + oy,
        width,
        height,
        center: true,
        imageCallback: options.imageCallback,
        maxScale: 4,
        scaleRatio: 4
    })
    if( options.target){
        options.target.add(o)
    }
    return o
}

function extractSVGDimensions(svgString) {
    // Regex patterns for width, height, and viewBox
    const widthRegex = /\swidth\s*=\s*["']?(\d+\.?\d*%?)["']?/i;
    const heightRegex = /\sheight\s*=\s*["']?(\d+\.?\d*%?)["']?/i;
    const viewBoxRegex = /\sviewBox\s*=\s*["']?([\d\s.-]+)["']?/i;
  
    // Extract matches for width, height, and viewBox
    const widthMatch = svgString.match(widthRegex);
    const heightMatch = svgString.match(heightRegex);
    const viewBoxMatch = svgString.match(viewBoxRegex);
  
    // Extract width and height values from viewBox if present
    let viewBoxWidth = null, viewBoxHeight = null;
    if (viewBoxMatch) {
      const viewBoxValues = viewBoxMatch[1].split(/\s+/);
      if (viewBoxValues.length === 4) {
        viewBoxWidth = viewBoxValues[2];  // 3rd value in viewBox is width
        viewBoxHeight = viewBoxValues[3]; // 4th value in viewBox is height
      }
    }
  
    // Use width and height if available, otherwise use viewBox dimensions
    const definitiveWidth = parseInt(widthMatch ? widthMatch[1] : viewBoxWidth)
    const definitiveHeight = parseInt(heightMatch ? heightMatch[1] : viewBoxHeight);
  
    return {
      width: definitiveWidth ? definitiveWidth : null,
      height: definitiveHeight ? definitiveHeight : null
    };
  }
  

registerRenderer( {type: "categoryId", id: 29, configs: "default"}, (primitive, options = {})=>{
    const config = {width: 80, height: 80, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.height - config.padding[0] - config.padding[2]
    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 



    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        minRenderSize : 0,
        name:"inf_track primitive inf_keep"
    })
    if( g ){
        let showName = false

        const logo = imageHelper( `/api/image/${primitive.id}${primitive.imageCount ? `?${primitive.imageCount}` : ""}`, {
            x: 0,
            y: 0,
            padding: config.padding,
            width: config.width,
            height: config.height - (showName ? 12 : 0),
            center: true,
            alt: primitive.title,
            imageCallback: options.imageCallback,
            placeholder: options.placeholder !== false
        })
        if( showName ){
                const r = new Konva.Rect({
                    x:0,
                    y: 0,
                    width: config.width,
                    height: config.height,
                    fill: "white"
                })
                const text = new CustomText({
                    fontSize: 5,
                    text: primitive.title,
                    align:"center",
                    wrap: false,
                    ellipsis: true,
                    verticalAlign:"middle",
                    bgFill:"#f3f4f6",
                    x: 0,
                    y: config.height - 6,
                    width: config.width,
                    height: 12,
                    refreshCallback: options.imageCallback
                })
                g.add(r)
                g.add(text)
        }
        g.add( logo )

    }
    return g


})

export function finalizeImages( node, options ){
    const list = node.find('.img_ph')
    while(list.length > 0){
        const delay = 1 +(Math.random() * 50)
        const thisSection = list.splice(0,20)
        setTimeout(()=>{
            for(const d of thisSection){
                d.finalize(options)            
            }
        }, delay)

    }
    //for(const d of list){
    //    d.finalize()
   // }

}



function imageHelper(url, options){
        const image = new CustomImage( {
            url: url, 
            ...options,
            x: options.x ?? 0, 
            y: options.y ?? 0, 
            padding: options.padding, 
            width: options.width ?? options.size, 
            height: options.height ?? options.size, 
            placeholder: options.placeholder, 
            name: options.placeholder ? "img_ph" : undefined})

        if(options.imageCallback){
            image.attrs.refreshCallback = ()=>options.imageCallback(image)
        }

    return image

}


    function getRotatedPolygon(node) {
        // Get the local dimensions.
        const rect = node.getClientRect({ skipTransform: true });
        const width = rect.width
        const height = rect.height
        // With the offset set to (width/2, height/2), the local corners are:
        /*const localCorners = [
          { x: -width / 2, y: -height / 2 },
          { x: width / 2, y: -height / 2 },
          { x: width / 2, y: height / 2 },
          { x: -width / 2, y: height / 2 }
        ];*/
        const localCorners = [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height  }
        ];
        // Use the node's absolute transform to map local coordinates into the parent coordinate system.
        const transform = node.getAbsoluteTransform();
        return localCorners.map(pt => transform.point(pt));
      }
  
  /**
   * Checks if two convex polygons intersect using the Separating Axis Theorem (SAT).
   *
   * @param {Array} polyA - Array of points [{x, y}, ...] for the first polygon.
   * @param {Array} polyB - Array of points [{x, y}, ...] for the second polygon.
   * @returns {boolean} True if the polygons overlap; false if a separating axis is found.
   */
  function polygonsIntersect(polyA, polyB) {
    // Helper: Compute the normalized axes (perpendiculars to edges) for a polygon.
    function getAxes(polygon) {
      const axes = [];
      for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i];
        const p2 = polygon[(i + 1) % polygon.length];
        // The edge from p1 to p2.
        const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
        // The perpendicular (normal) is (edge.y, -edge.x)
        let normal = { x: edge.y, y: -edge.x };
        // Normalize the axis.
        const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
        if (length !== 0) {
          normal.x /= length;
          normal.y /= length;
        }
        axes.push(normal);
      }
      return axes;
    }
  
    // Helper: Projects a polygon onto an axis and returns the min and max values.
    function projectPolygon(axis, polygon) {
      let min = axis.x * polygon[0].x + axis.y * polygon[0].y;
      let max = min;
      for (let i = 1; i < polygon.length; i++) {
        const projection = axis.x * polygon[i].x + axis.y * polygon[i].y;
        if (projection < min) {
          min = projection;
        }
        if (projection > max) {
          max = projection;
        }
      }
      return { min, max };
    }
  
    // Combine the axes from both polygons.
    const axes = getAxes(polyA).concat(getAxes(polyB));
  
    // For each axis, project both polygons. If the projections do not overlap,
    // then a separating axis exists and the polygons do not intersect.
    for (let i = 0; i < axes.length; i++) {
      const axis = axes[i];
      const projA = projectPolygon(axis, polyA);
      const projB = projectPolygon(axis, polyB);
      if (projA.max < projB.min || projB.max < projA.min) {
        // Found a separating axis.
        return false;
      }
    }
  
    // No separating axis found; the polygons intersect.
    return true;
  }


export function plotWordCloud(options = {}){
    const startWords = options.words ?? []
    const sizes = startWords.map(d=>d.size)
    const min = sizes.reduce((a,c)=>a < c ? a : c, Infinity)
    const max = sizes.reduce((a,c)=>a > c ? a : c, -Infinity)
    const range = max - min
    const maxFont = 80
    const minFont = 8
    const fontScale = (maxFont - minFont) / range
    const words = startWords.map(d=>{
        return {
            text: d.text,
            size: ((d.size - min) * fontScale) + minFont
        }
    }).sort((a,b)=>b.size - a.size)

    
    // Center point of the stage
    const cx = options.width / 2;
    const cy = options.height / 2;
    
    // Array to store already placed Konva.Text nodes
    const placedWords = [];
    
    /**
     * Attempts to place a word on the stage by testing five orientations.
     * The candidate rotations range from -30° to 30°.
     * For each candidate spiral position, we try all rotations. If one is
     * collision-free, we place the word; otherwise, we continue moving along the spiral.
     */
    const g = new Konva.Group({
        id: options.id,
        width: options.width,
        height: options.height,
        minRenderSize : 0,
        name:"inf_track primitive inf_keep"
    })
    function placeWord(word) {
        let spiralAngle = 0;
        let spiralRadius = 0;
        let x = cx;
        let y = cy;
    
        // Define the five candidate rotations in degrees.
        const candidateRotations = [-15,0, 15, -30, 30];


        while (true) {
            // Test each candidate rotation for the current (x,y) position.
            for (let rotation of candidateRotations) {
                // Create a temporary text node with the current rotation.
                const textNode = new Konva.Text({
                    text: word.text,
                    fontSize: word.size,
                    fontFamily: 'Arial',
                    fill: 'black',
                    x: x,
                    y: y,
                    rotation: rotation,
                });
                const rect = textNode.getClientRect({ skipTransform: true });
                textNode.offset({x: rect.width / 2, y: rect.height / 2})
        
              // Compute the rotated polygon for this candidate.
                const candidatePoly = getRotatedPolygon(textNode);

                // Check for overlap with each already placed word.
                let collides = placedWords.some(existingWord => {
                    const existingPoly = getRotatedPolygon(existingWord);
                    return polygonsIntersect(candidatePoly, existingPoly);
                });

                if (!collides) {
                    g.add(textNode);
                    placedWords.push(textNode);
                    return; // Exit once the word is placed.
                }
            }
        
            spiralAngle += 0.1;
            spiralRadius += 2;
            x = cx + spiralRadius * Math.cos(spiralAngle);
            y = cy + spiralRadius * Math.sin(spiralAngle);
        }
    }
    
    // Place each word from the list
    words.forEach(placeWord);

    return g

}

export function renderMatrix( primitive, list, options ){
    let columnExtents = options.columnExtents ? options.columnExtents.slice(0, options.max_cols ?? 200) : [{idx:0}]
    //let rowExtents = options.rowExtents ? options.rowExtents.slice(0,options.max_rows ??  200).sort((a,b)=>(`${a.label ?? ""}`).localeCompare(`${b.label ?? ""}`)) : [{idx:0}]
    let rowExtents = options.rowExtents ? options.rowExtents.slice(0,options.max_rows ??  200) : [{idx:0}]
    if( columnExtents.length === 0){
        columnExtents = [{idx:0}]
    }
    if( rowExtents.length === 0){
        rowExtents = [{idx:0}]
    }

    if( options.widgetConfig ){
        const g = new Konva.Group({
            name: "view",
            x:options.x ?? 0,
            y:options.y ?? 0
        })

        let w, h
        const widget = RenderPrimitiveAsKonva( primitive, {config: "widget", data: options.widgetConfig, imageCallback: options.imageCallback})
        widget.name(widget.name() + " item_info")
        g.add( widget )
        w = widget.width()
        h = widget.height()

        if( options.widgetConfig.showItems ){

            const padding = options.x === 0 ? [10,10,10,10] : [0,0,0,0]
            
            const content = renderMatrix(primitive, list, {...options, x: 0, y: 0, padding, widgetConfig: undefined})
            if( content ){

                const contentScale = Math.min(1, w / content.width() )
                content.scale({x:contentScale, y:contentScale})
                content.y( h + (options.x === 0 ? 0 : 20))
                g.add(content)
                
                h = h + (content.height() * contentScale)
            }
        }

        g.width( w )
        g.height( h )
        
        return g
    }

    
    
    const g = new Konva.Group({
        name: "view",
        x:options.x ?? 0,
        y:options.y ?? 0
    })
    let configName = options.viewConfig?.renderType ?? "grid" 

    const asCounts = options.viewConfig?.showAsCounts
    const asChecks = options.viewConfig?.parameters?.showAsCheck ?? configName === "checktable"
    if( asCounts ){
        configName = "heatmap"
    }
    if( asChecks ){
        configName = "checktable"
    }


    const columnSize = new Array(columnExtents.length).fill(0)
    const rowSize = new Array(rowExtents.length).fill(0)
    const cells = []
    
    const referenceIds = list.map(d=>d.primitive.referenceId).filter((d,i,a)=>a.indexOf(d) === i)
    if( referenceIds.length > 1){
        console.log(`Multiple types in list, selecting first`)
    }
    
    const globalData = {}
    let checkMap
    const mainstore = MainStore()
    let cellContentLimit
    if( configName === "grid" ){//&& !asCounts ){
        cellContentLimit = {
            "result": 50,
            "evidence": 150
        }[list[0]?.primitive?.type] ?? 150
        
        cellContentLimit = {
            29: 63
        }[referenceIds[0]] ?? cellContentLimit
    }else if(configName === "checktable" || configName === "dials"){
        const evaluatorMap = (axis)=>{
            if( !axis){return}
            if( axis.type == "category" ){
                const axisPrim = mainstore.primitive(axis.primitiveId)
                if(axisPrim?.referenceId === PrimitiveConfig.Constants.SCORE){
                    return axisPrim.primitives.allItems.reduce((a,d)=>{
                        if( d.title === "high"){
                            a[d.id] = 3
                        }else if( d.title === "medium"){
                            a[d.id] = 2
                        }else if( d.title === "low"){
                            a[d.id] = 1
                        }
                        return a
                    },{})
                }
                if(axisPrim?.referenceId === PrimitiveConfig.Constants.EVALUATOR){
                    return axisPrim.primitives.allItems.reduce((a,d)=>{
                        if( d.title === "clearly"){
                            a[d.id] = 3
                        }else if( d.title === "likely"){
                            a[d.id] = 2
                        }else if( d.title === "possibly"){
                            a[d.id] = 1
                        }
                        return a
                    },{})
                }
            }
            return undefined

        }
        const colEvalMap =  evaluatorMap({type: "category", primitiveId: options.axis?.column?.primitiveId})
        const rowEvalMap =  evaluatorMap({type: "category", primitiveId:options.axis?.row?.primitiveId})
        if( colEvalMap ){
            console.log(`Got evaluator in view ${primitive.plainId}`)
            console.log(colEvalMap)
            list = list.map(d=>({...d, column: 0}))
            columnExtents = [{idx:0}]
        }
        if( colEvalMap || rowEvalMap){
            checkMap ={
                ...(colEvalMap ?? {}),
                ...(rowEvalMap ?? {})
            }
        }

    }

    let itemColsByColumn = new Array(columnExtents.length).fill(0)

    let rIdx = 0
    for(const row of rowExtents){
        let cIdx = 0
        for(const column of columnExtents){

            let subListWithAllocations = list.filter((item)=>(Array.isArray(item.column) ? item.column.includes( column.idx ) : item.column === column.idx) && (Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx))
            let subList = subListWithAllocations.map(d=>d.primitive)

            if( asCounts ){
                //console.log(`MAPPING FOR asCounts`)
                //subList = mainstore.uniquePrimitives( subList.flatMap(d=>d.findParentPrimitives({referenceId: [9]})) )
            }

            let cellShowExtra
            if( cellContentLimit ){
                if( subList.length > cellContentLimit){
                    if( options.expand && options.expand.includes([column.idx, row.idx].filter(d=>d).join("-"))){
                        cellShowExtra = -1
                    }else{
                        cellShowExtra = subList.length - cellContentLimit
                        subList = subList.slice(0, cellContentLimit)
                    }
                }
            }

            const itemLength = subList.length 
            const itemCols = Math.floor( Math.sqrt( itemLength) )

            itemColsByColumn[cIdx] = options.data?.columns ?? Math.max(itemColsByColumn[cIdx], itemCols)


            cells.push({
                cIdx, rIdx,
                col: column,
                row: row,
                list: subList,
                listWithAllocations: subListWithAllocations,
                itemLength,
                itemCols,
                showExtra: cellShowExtra
            })
            cIdx++
        }
        rIdx++
    }



    let minHeight = 0
    let minWidth = options.width ?? defaultWidthByCategory[referenceIds[0]] ?? 300
    if( referenceIds[0] === 29){
        minWidth = options.hideColumnHeader ? 60 : 120
    }

    
    if( asCounts ){
        minWidth = 128
    }else if( asChecks || configName === "checktable" || configName === "dials"){
        minWidth = 64
    }
    if( configName === "ranking"){
        minWidth = options.width ? options.width / columnExtents.length : 600 
        minHeight = options.height ? options.height / rowExtents.length : 600 
    }

    

    const baseRenderConfig = {
                config: configName, 
                referenceId: referenceIds[0], 
                placeholder: options.placeholder !== false, 
                imageCallback: options.imageCallback,
                utils: options.utils,
                renderOptions: options.renderOptions,
                padding: options.padding ?? [0,0,0,0]
    }
    if( asCounts || options?.renderOptions?.calcRange){
        const cellCount = cells.map(d=>d.itemLength)
        const columnRange = columnExtents.map((_,i)=>cells.filter(d=>d.cIdx === i).map(d=>d.itemLength))
        const rowRange = rowExtents.map((_,i)=>cells.filter(d=>d.rIdx === i).map(d=>d.itemLength))

        baseRenderConfig.range = [Math.min(...cellCount), Math.max(...cellCount)]
        baseRenderConfig.totals = cellCount.reduce((a,d)=>a+d,0)
        baseRenderConfig.colTotal = columnRange.map(d=>d.reduce((a,d)=>a+d,0))
        baseRenderConfig.rowTotal = rowRange.map(d=>d.reduce((a,d)=>a+d,0))
        baseRenderConfig.colRange = columnRange.map(d=>[Math.min(0,...d), Math.max(...d)])
        baseRenderConfig.rowRange = rowRange.map(d=>[Math.min(0,...d), Math.max(...d)])
        baseRenderConfig.colTitles = columnExtents.map(d=>d.label)
        baseRenderConfig.rowTitles = rowExtents.map(d=>d.label)
    }

    for(const cell of cells){
        const config = RenderSetAsKonva( primitive, cell.list, 
            {
                ...baseRenderConfig,
                cIdx: cell.cIdx,
                rIdx: cell.rIdx,
                renderConfig:{
                    ...(options.renderConfig ?? {}),
                    asChecks,
                    showExtra: cell.showExtra,
                    columns: itemColsByColumn[cell.cIdx], 
                    minWidth: minWidth,
                    viewConfig: options.viewConfig
                },
                checkMap,
                allocationExtents: options.allocations,
                listWithAllocations: cell.listWithAllocations,
                data: options.data,
                getConfig: true
            } )    
            if(!config){
                console.warn("Did not get a render result")
                return
            }
        
        itemColsByColumn[cell.cIdx] = Math.max(itemColsByColumn[cell.cIdx], config.columns)
        
        columnSize[cell.cIdx] = Math.max( config.width > columnSize[cell.cIdx] ? config.width : columnSize[cell.cIdx], minWidth)
        rowSize[cell.rIdx] = Math.max( config.height > rowSize[cell.rIdx] ? config.height : rowSize[cell.rIdx], 30, minHeight)

        cell.config = config
    }
    const maxRowHeight = Math.max(...rowSize, 0)

    let headerHeight = 0
    let maxFont = maxRowHeight / 4
    let headerScale = Math.max(1, Math.max(columnSize.reduce((a,c)=>a+c, 0) / 2000 , rowSize.reduce((a,c)=>a+c, 0) / 4000 ))
    let headerFontSize = Math.min(12 * headerScale, maxFont, 120)
    let textPadding = new Array(4).fill(headerFontSize * 0.3 )
    let rowLabelAsText = true
    let recalc = false
    let recalcRow = false
    let columnLabelAsText = true
    const iconSize = [128, ...columnSize, ...rowSize].reduce((a,c)=>a < c ? a : c)
    let columnLabels
    let headerTextHeight = 0

    let showColumnHeaders = options.hideColumnHeader !== true && (columnExtents.length > 1)

    if( configName === "timeseries"){
        globalData.maximumValue = cells.map(d=>d.config.data.series).flat().reduce((a,c)=> a > c ? a : c, -Infinity) 
        globalData.minimumValue = cells.map(d=>d.config.data.series).flat().reduce((a,c)=> a < c ? a : c, Infinity) 
    }

    if( showColumnHeaders){

        headerHeight = (headerFontSize * 4)
        headerTextHeight = headerHeight - textPadding[0] - textPadding[2]
        
        
        
        
        rowSize.forEach((d,i)=>{if(d < headerHeight){
            rowSize[i] = headerHeight
        }})
        
        
        columnLabels = columnExtents.map((d,idx)=>{
            const cellConfig = cells.find(d=>d.cIdx === idx)?.config ?? {padding: [5,5,5,5]}
            if( d.imageUrl ){
                columnLabelAsText = false
                const iconSize = 100
                const logo = new Konva.Group({
                    x: 0,
                    y: cellConfig.padding[0] + textPadding[0],
                    width: columnSize[idx],
                    height: iconSize
                })
                logo.add( imageHelper( "/api/remoteImage?url=" + d.imageUrl, {
                    x: (columnSize[idx] - iconSize) /2,
                    y: 0,
                    size: iconSize * 0.8,
                    center: true,
                    imageCallback: options.imageCallback,
                    placeholder: options.placeholder !== false
                }) )
                logo.add( new CustomText({
                    //fontFamily: "system-ui",
                    fontSize: iconSize * 0.12,
                    text: d.label  ?? "",
                    wrap: true,
                    align:"center",
                    bgFill:"transparent",
                   // verticalAlign:"middle",
                    x: 0,
                    y: iconSize * 0.9,
                    width: columnSize[idx],
                    height: iconSize * 0.18,
                    ellipsis: true,
                    refreshCallback: options.imageCallback
                }))
                headerHeight = logo.height()
                return logo
            }else if( options.axis?.column?.type === "icon"){
                columnLabelAsText = false
                const useSize = iconSize < headerHeight ? iconSize : headerHeight
                const logo = imageHelper( `/api/image/${d.idx}`, {
                    x: (columnSize[idx] - useSize) /2,
                    y: cellConfig.padding[0] + textPadding[0],
                    linkUrl: d.referenceParameters?.url,
                    size: useSize, 
                    center: true,
                    imageCallback: options.imageCallback,
                    placeholder: options.placeholder !== false
                })
                return logo
            }else{
                const longestWord = `${(d.label ?? "")}`.split(" ").reduce((a,c)=>a.length > c.length ? a : c, 0)
                const colWidth = columnSize[idx] - textPadding[1] - textPadding[3] - cellConfig.padding[3] - cellConfig.padding[1] 
                
                const text = new CustomText({
                    //fontFamily: "system-ui",
                    fontSize: headerFontSize,
                    text: longestWord,
                    align:"center",
                    wrap: true,
                    verticalAlign:"middle",
                    bgFill:"#f3f4f6",
                    x: cellConfig.padding[3] + textPadding[3],
                    y: cellConfig.padding[0] + textPadding[0],
                    width: colWidth,
                    height: "auto",
                    refreshCallback: options.imageCallback
                })
                
                while( text.measureSize(longestWord).width > colWidth && headerFontSize > 6){
                    headerFontSize = headerFontSize > 50 ? headerFontSize -= (headerFontSize * 0.1) : headerFontSize - 0.25
                    text.fontSize( headerFontSize )
                } 
                text.text( d.label ?? "" )  
                
                return text
            }
        })
        
        
        function isColumnHeaderOverflowing(labels, height){
            return labels.filter(d=>d.height() > height).length >0
        }
        
        if( columnLabelAsText ){
            
            while( isColumnHeaderOverflowing( columnLabels, headerTextHeight) && headerFontSize > 6){
                headerFontSize = headerFontSize > 50 ? headerFontSize -= (headerFontSize * 0.1) : headerFontSize - 0.25
                columnLabels.forEach(d=>d.fontSize(headerFontSize))
                recalc = true
            }
            columnLabels.forEach(d=>d.fontSize(headerFontSize))
        }
        
    }
    let showRowheaders =  (options.hideRowHeaders !== true ) && (rowExtents.length > 1 || rowExtents[0]?.label?.length > 0)
    let headerWidth = 0
    let rowLabels
    
    if( showRowheaders ){
        function isRowHeaderOverflowing(labels, heights){
            return labels.filter((d,i)=>d.height() > heights[i]).length >0
        }
        const longestPairs = rowExtents.map(d=>{
            const words = `${(d.label  ?? "")}`.split(" ")
            const coupleLength = [words, words.map((d,i,a)=> i > 0 ? a[i-1] + " " + d : undefined ).filter(d=>d)].flat()
            return coupleLength.reduce((a,c)=>c.length > a.length ? c : a, "" )
        }).reduce((a,c)=>c.length > a.length ? c : a, "" )
        
        let textWidth 
        let rowHeights = []
        rowLabels = rowExtents.map((d,idx)=>{
            const cellConfig = cells.find(d=>d.rIdx === idx)?.config
            rowHeights[idx] = rowSize[idx] - textPadding[0] - textPadding[2] - cellConfig.padding[0] - cellConfig.padding[2]
            if( d.imageUrl ){
                rowLabelAsText = false
                const iconSize = 100
                headerWidth = iconSize + textPadding[1] + textPadding[3] + cellConfig.padding[3] + cellConfig.padding[1]
                const logo = new Konva.Group({
                    x: cellConfig.padding[3] + textPadding[3],
                    y: cellConfig.padding[0] + textPadding[0],
                    width: iconSize,
                    height: iconSize
                })
                logo.add( imageHelper( "/api/remoteImage?url=" + d.imageUrl, {
                    x: iconSize * 0.1,
                    y: 0,
                    size: iconSize * 0.8,
                    center: true,
                    imageCallback: options.imageCallback,
                    placeholder: options.placeholder !== false
                }) )
                logo.add( new CustomText({
                    //fontFamily: "system-ui",
                    fontSize: iconSize * 0.12,
                    text: d.label  ?? "",
                    wrap: true,
                    align:"center",
                    bgFill:"transparent",
                   // verticalAlign:"middle",
                    x: 0,
                    y: iconSize * 0.9,
                    width: iconSize,
                    height: iconSize * 0.18,
                    ellipsis: true,
                    refreshCallback: options.imageCallback
                }))
                return logo
            }else if( options.axis?.row?.type === "icon"){
                rowLabelAsText = false
                const iconSize = 100
                headerWidth = iconSize + textPadding[1] + textPadding[3] + cellConfig.padding[3] + cellConfig.padding[1]
                const logo = imageHelper( `/api/image/${d.idx}`, {
                    x: cellConfig.padding[3] + textPadding[3],
                    y: cellConfig.padding[0] + textPadding[0],
                    size: iconSize,
                    center: true,
                   // linkUrl: d.referenceParameters?.url,
                    imageCallback: options.imageCallback,
                    placeholder: options.placeholder !== false
                })
                return logo
            }else{

                const text = new CustomText({
                    //fontFamily: "system-ui",
                    fontSize: headerFontSize,
                    text: textWidth ? (d.label  ?? "") : ` ${longestPairs} `,
                    wrap: true,
                    align:"center",
                    bgFill:"#f3f4f6",
                    verticalAlign:"middle",
                    x: cellConfig.padding[3] + textPadding[3],
                    y: cellConfig.padding[0] + textPadding[0],
                    width: textWidth ? textWidth : "auto",
                    refreshCallback: options.imageCallback
                })
                if( !textWidth ){
                    textWidth = text.width()
                    headerWidth = textWidth + textPadding[1] + textPadding[3] + cellConfig.padding[3] + cellConfig.padding[1]
                    text.width(textWidth)
                    text.text( d.label  ?? "")
                }
                return text
            }
        })
        if( rowLabelAsText){

            while( isRowHeaderOverflowing( rowLabels, rowHeights) && headerFontSize > 6){
                headerFontSize = headerFontSize > 50 ? headerFontSize -= (headerFontSize * 0.1) : headerFontSize - 0.25
                rowLabels.forEach(d=>d.fontSize(headerFontSize))
                recalcRow = true
            }
            if( recalcRow && showColumnHeaders ){
                columnLabels.forEach(d=>d.fontSize(headerFontSize))
            }
        }
    }
    if( recalc || recalcRow ){
        headerTextHeight = columnLabels ? columnLabels.reduce((a,c)=>c.height() > a ? c.height() : a, 0) : 0
        headerHeight = headerTextHeight + textPadding[0] + textPadding[2] 
    }
    if( showColumnHeaders){
        columnLabels.forEach(d=>{
            d.y(d.y() + ((headerTextHeight - d.height())/2) )
        })
    }
    let headerPadding = cells[0]?.config.padding[0] ?? 0

    const columnY = rowSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), showColumnHeaders ?  headerHeight + headerPadding : 0))
    
    if( showRowheaders ){
        rowExtents.forEach((header,idx)=>{
            const cellConfig = cells.find(d=>d.rIdx === idx)?.config ?? {padding:[0,0,0,0]}
            const group = new Konva.Group({
                name: "inf_track row_header",
                id: `${idx}`,
                x: 0,
                y: columnY[idx],
                width: headerWidth,
                height: rowSize[idx]
            }) 
            if( rowLabelAsText ){
                const bg = new Konva.Rect({
                    x: cellConfig.padding[3],
                    y: cellConfig.padding[0],
                    width: headerWidth - cellConfig.padding[3] - cellConfig.padding[1],
                    height: rowSize[idx] - cellConfig.padding[0] - cellConfig.padding[2] ,
                    fill:'#f3f4f6'
                })
                group.add(bg)
            }
            rowLabels[idx].y( cellConfig.padding[0] + textPadding[0] + (((rowSize[idx] - cellConfig.padding[0] - textPadding[0] - cellConfig.padding[2] - textPadding[2]) - rowLabels[idx].height()) / 2))
            group.add(rowLabels[idx])
            g.add(group)
        })
    }


    const columnX = columnSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), headerWidth ))
    if( showColumnHeaders){
        columnExtents.forEach((header,idx)=>{
            const cellConfig = cells.find(d=>d.cIdx === idx)?.config ?? {padding:[0,0,0,0]}
            const group = new Konva.Group({
                name: "inf_track column_header",
                x: columnX[idx],
                y: 0,
                width: columnSize[idx],
                height: headerHeight
            }) 
            if( columnLabelAsText ){
                const bg = new Konva.Rect({
                    x: cellConfig.padding[3],
                    y: cellConfig.padding[0],
                    width: columnSize[idx] - cellConfig.padding[3] - cellConfig.padding[1] ,
                    height: headerHeight,
                    fill:'#f3f4f6'
                })
                group.add(bg)
            }
            group.add(columnLabels[idx])
            g.add(group)
        })

    }
    for( const cell of cells){

        const c = RenderSetAsKonva( primitive, cell.list, 
            {
                ...baseRenderConfig,
                primitiveClick: options.primitiveClick,
                cIdx: cell.cIdx,
                rIdx: cell.rIdx,
                id: `${cell.cIdx}-${cell.rIdx}`, 
                renderConfig:{
                    ...(options.renderConfig ?? {}),
                    asChecks,
                    showExtra: cell.showExtra,
                    width: columnSize[cell.cIdx], 
                    height: rowSize[cell.rIdx] , 
                    minWidth: minWidth,
                    minHeight: rowSize[cell.rIdx] - cell.config.padding[0] - cell.config.padding[2],
                    maxHeight: options?.renderOptions?.height ? options?.renderOptions?.height - columnY[cell.rIdx] : undefined,
                    columns: itemColsByColumn[cell.cIdx], 
                    rows: cell.itemRows,
                    viewConfig: options.viewConfig
                },
                data: {
                    ...(options.data ?? {}),
                    ...(cell.config.data ?? {})
                },
                globalData,
                allocationExtents: options.allocations,
                listWithAllocations: cell.listWithAllocations,
                checkMap,
                cachedNodes: cell.config.cachedNodes
            })
        
        c.x(columnX[cell.cIdx] )
        c.y(columnY[cell.rIdx] )
        cell.node = c
        g.add(c)
    }

    
    let height = g.find(()=>true).map(d=>d.y() + d.height()).reduce((a,c)=>c > a ? c : a, 0)

    
    if( options.viewConfig.renderType === "distribution_chart" && options.calcRange){
        columnExtents.forEach((header,idx)=>{
            const group = new Konva.Group({
                name: "inf_track column_header",
                x: columnX[idx],
                y: height + (headerFontSize * 0.2),
                width: columnSize[idx],
                height: headerFontSize * 1.4
            }) 
            group.add(new Konva.CustomText({
                x: 0,
                y: 0,
                width: columnSize[idx], 
                fontSize: headerFontSize,
                align:'center',
                color: '#777',
                text:  baseRenderConfig.colTotal[idx]
            }))
            g.add(group)
        })
        height += headerFontSize * 1.4
    }
    if( height < 40 ){
        height = 200
    }

    g.width( g.find(()=>true).map(d=>d.x() + d.width()).reduce((a,c)=>c > a ? c : a, 0))
    g.height( height )

    return g

}

function generateAxisTicks([minVal, maxVal], tickCount = 5) {
  // Ensure zero baseline for positive-only data
  const dataMin = minVal > 0 ? 0 : minVal;
  const dataMax = maxVal;

  const rawStep = (dataMax - dataMin) / (tickCount - 1);

  // Round step to a "nice" number (1, 2, 5 * power of 10)
  function niceNumber(x, round) {
    const exp = Math.floor(Math.log10(x));
    const f = x / Math.pow(10, exp);
    let nf;
    if (round) {
      if (f < 1.5) nf = 1;
      else if (f < 3) nf = 2;
      else if (f < 7) nf = 5;
      else nf = 10;
    } else {
      if (f <= 1) nf = 1;
      else if (f <= 2) nf = 2;
      else if (f <= 5) nf = 5;
      else nf = 10;
    }
    return nf * Math.pow(10, exp);
  }

  const step = niceNumber(rawStep, true);
  const niceMin = Math.floor(dataMin / step) * step;
  const niceMax = Math.ceil(dataMax / step) * step;

  const ticks = [];
  for (let v = niceMin; v <= niceMax; v += step) {
    ticks.push(v);
  }

  return ticks;
}

function renderBarChart( segments, {showValue, showAxis, showLines, showAxisValue, ...options}){
    const config = {size: 20, ...options}
    const width = config.width ?? config.size
    const height = config.height ?? config.barHeght ?? config.size

    let r = config.size / 2
    const g = new Konva.Group({
        x: options.x ?? 0,
        y: options.y ?? 0,
        width,
        height
    })
    let mode = false ? "seperate" : "interleave"
    const fontSize = 4
    let axisFontSize = config.width > 300 ? 20 : 6

    const asPercent = options.showValue === "percent"
    const segmentCount = segments.length
    const subSegments = options.sublabels?.items?.length ?? 1

    // Accumulate series totals and maxima
    const totals = [];
    const perSeriesMax = [];
    const perSegmentTotals = [];
    let globalMaxCount = 0
    for (let sIdx = 0; sIdx < segments.length; sIdx++){
        const { count } = segments[sIdx]
        if (Array.isArray(count)) {
            let segSum = 0
            for (let i = 0; i < count.length; i++) {
                const v = count[i] ?? 0
                segSum += v
                totals[i] = (totals[i] ?? 0) + v
                perSeriesMax[i] = Math.max(perSeriesMax[i] ?? 0, v)
                if (v > globalMaxCount) globalMaxCount = v
            }
            perSegmentTotals[sIdx] = segSum
        } else {
            const v = (count ?? 0)
            totals[0] = (totals[0] ?? 0) + v
            perSeriesMax[0] = Math.max(perSeriesMax[0] ?? 0, v)
            perSegmentTotals[sIdx] = v
            if (v > globalMaxCount) globalMaxCount = v
        }
    }

    // Determine scaling maxima
    let singleYAxis = true
    let maxValue
    if (asPercent) {
        maxValue = 100
    } else if (options.stack) {
        // Stacked: scale by the largest stacked height among segments
        const stackedMax = Math.max(0, ...perSegmentTotals)
        maxValue = stackedMax || 1
    } else {
        // Grouped bars: use a single global max across all bars
        maxValue = globalMaxCount
    }
    let colors = options.colors ?? options.theme?.palette?.categoryColors ?? categoryColors
    
    let axisList = []
    let yAxisList = []

    const barBase = height - (showAxis ? axisFontSize * 3 : 0.2)
    const barSize = barBase
    let baseLine 
    let ox = 0


    if( showAxis ){
        let rescaleAxis = false
        const yTicks = generateAxisTicks(  [0, maxValue] )
        const scaleY = barSize / maxValue
        let yAxisGap = 0
        if( showLines && showAxisValue ){
            const maxAxisValueHeight = barSize / yTicks.length * 0.3
            yTicks.forEach((y, i)=>{
                const yp = barBase - (y * scaleY)
                if( yp > 0){
                    const r = prepareAxisText( formatNumber(y), {
                        fontSize: axisFontSize, 
                        maxHeight: maxAxisValueHeight,
                        textPadding: [0,0,0,0],
                        minFontSize: 1,
                        refreshCallback: options.imageCallback
                    } )
                    r.rendered.x(0)
                    r.rendered.y(yp)
                    g.add( r.rendered)
                    yAxisList.push(r.rendered)
                    if( r.rescaled ){
                        if( !rescaleAxis || r.fontSize < rescaleAxis ){
                            rescaleAxis = r.fontSize
                        }
                    }
                }
            })
            if( rescaleAxis ){
                axisFontSize = rescaleAxis
                for(const d of yAxisList ){
                    d.fontSize( rescaleAxis )
                }
            }
            const yAxisWidth = Math.max( ...yAxisList.map(d=>d.width() ?? 0))
            for(const d of yAxisList ){
                d.width( yAxisWidth )
                d.align("right")
                const trueHeight = (d.textArr[0].ascent +d.textArr[0].descent)
                d.y( d.y() - trueHeight / 2 )
            }
            const ydelta = Math.max(10, yAxisWidth * 0.1)
            yAxisGap = yAxisWidth + ydelta
            ox = yAxisGap + ydelta
        }
        if( showLines){
            const dash = [5,3]
            yTicks.forEach((y, i)=>{
                const yp = barBase - (y * scaleY)
                if( yp > 0){
                    const line = new Konva.Line( {
                        points: [yAxisGap, yp, width, yp],
                        stroke: i === 0 ? "black" : "#d2d2d2",
                        dashEnabled: i > 0,
                        dash: i > 0 ? dash : undefined,
                        strokeWidth: 1
                    })
                    if( i === 0){
                        baseLine = line
                    }else{
                        g.add( line )
                    }
                }
            })
        }
    }
    const plotWidth = width - ox
    const subSegmentGap = (subSegments === 1 || segmentCount === 1) ? 0 : (mode === "interleave" ? 0.2 : 0.05)
    const widthToUse = plotWidth * (1 - subSegmentGap)
    const barWidth = options.stack ? plotWidth : widthToUse / (segmentCount * subSegments)
    const segmentGap = segmentCount > 1 ? (plotWidth * subSegmentGap) / (segmentCount - 1) : 0
    const axisWidth = barWidth * (mode === "interleave" ? subSegments : 1)
    if( showAxis ){
        let rescaleAxis = false

        segments.forEach((s, idx)=>{
            [s.count].flat().forEach((ss, iIdx)=>{
                let x
                if( mode === "interleave"){
                    x = ox + (((idx * subSegments) + iIdx) * barWidth) + (idx * segmentGap)
                }else{
                    x = ox + (idx * barWidth) + (iIdx * segmentCount * barWidth) +(iIdx * segmentGap * segmentCount)
                }
                if( mode !== "interleave" || iIdx === 0){
                    const r = prepareAxisText( s, {
                        fontSize: axisFontSize, 
                        maxWidth: axisWidth,
                        textPadding: [0,0,0,0],
                        minFontSize: 1,
                        refreshCallback: options.imageCallback
                    } )
                    r.rendered.x(x)
                    r.rendered.y(0)
                    g.add( r.rendered)
                    axisList.push(r.rendered)
                    if( r.rescaled ){
                        if( !rescaleAxis || r.fontSize < rescaleAxis ){
                            rescaleAxis = r.fontSize
                        }
                    }
                }
            })
        })
        if( rescaleAxis ){
            for(const d of axisList ){
                d.fontSize( rescaleAxis )
            }
        }
    }

    let idx = 0 
    
    if( showAxis){
        for(const d of axisList ){
            d.y( barBase + (axisFontSize * 0.5) )
        }
    }

    
    const colorBySubSegment = options.colorBySecondary ?? segmentCount  === 1
    const whiteMixFactor = 0.8 / (colorBySubSegment ? segmentCount : subSegments)

    for( const s of  segments){
        // Reset stack position per segment
        let y = barBase;
        [s.count].flat().forEach((ss, iIdx)=>{
            let x
            if( mode === "interleave"){
                x = ox + (((idx * subSegments) + iIdx) * barWidth) + (idx * segmentGap)
            }else{
                x = ox + (idx * barWidth) + (iIdx * segmentCount * barWidth) +(iIdx * segmentGap * segmentCount)
            }
            const scale = barSize / maxValue
            const denom = asPercent ? (perSegmentTotals[idx] || 0) : 1
            const count = asPercent ? (denom ? (100 * (ss ?? 0) / denom) : 0) : (ss ?? 0)
            const h = count * scale
            if( h > 0){
                const majorIdx = colorBySubSegment ? iIdx : idx
                const minorIdx = colorBySubSegment ? idx : iIdx
                let color = s.color ?? colors[majorIdx % colors.length]
                if( iIdx > 0 && !colorBySubSegment){
                    color = mixHexWithWhite(color, (minorIdx * whiteMixFactor))
                }
                
                var bar = new Konva.Rect({
                    x: x,
                    y: y - h,
                    width: barWidth,
                    height: h,
                    fill: color,
                    name: "cell clickable hover",
                    id: `0-${s.idx}`,
                });
                g.add(bar)
            }
            if( showValue ){
                const t = new CustomText({
                    x: x,
                    y: (barBase - h) - fontSize * 1.2,
                    fontSize: fontSize,
                    text: asPercent ? `${count.toFixed(0)}%` : count,
                    align:"center",
                    fill: '#334155',
                    bgFill: 'transparent',
                    width: barWidth,
                    align: "center",
                    refreshCallback: options.imageCallback
                })
                g.add(t)
            }
            if( options.stack){
                y -= h
            }
        })
        idx++
    }
    if( baseLine ){
        g.add(baseLine)
    }
    return g
}
function renderPieChart( segments, options = {}){
    const config = {size: 20, ...options}

    let r = config.size / 2
    const g = new Konva.Group({
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: config.size,
        height: config.size
    })

    const total = segments.map(d=>d?.count ?? 0).reduce((a,c)=>a+c,0)
    const scale = total ? (360 / total) : 0



    let a = 0
    let idx = 0
    let colors = options.colors ?? options.theme?.palette?.categoryColors ?? categoryColors

    g.add(new Konva.Circle({
        x: r,
        y: r,
        radius: r,
        fill: "white",
        shadowEnabled: true,
        shadowBlur: 6,
        shadowColor: "#999",
        shadowOpacity: 0.6,
        shadowOffsetX: r * 0.015,
        shadowOffsetY: r * 0.02
    }))

    for( const s of  segments){

        const degs = scale * s.count
        var wedge = new Konva.Wedge({
            x: r,
            y: r,
            radius: r,
            angle: degs,
            fill: s.color ?? colors[idx % colors.length],
            //stroke: 'black',
            //strokeWidth: 1,
            strokeScaleEnabled: false,
            rotation: 270 + a,
            name: "cell clickable",
            id: `0-${s.idx}`,
          });
        g.add(wedge)
        a += degs
        idx++
    }

    return g

}

function renderSubCategoryChart( title, data, options = {}){
    let config ={
        fontSize: 12,
        ...options
    }
    let {
        x = 0,
        y = 0,
        innerPadding = [10,10,10,10],
        itemSize = 200,        
        paletteName        
    } = options
    
    data = data.map((d,i)=>{
        return {
            ...d,
            idx: i
        }
    })
    
    const width = options.width ?? options.itemSize
    const height = options.height ?? options.itemSize

    if( options.byTag ){
        data = data.sort((a,b)=>a.tag - b.tag)
        const tagColorsArr = Object.values(options.theme?.palette?.tagColors ?? tagColors)
        let lastTag, idx = 0
        data.forEach(d=>{
            if( d.tag !== lastTag){
                idx = 0
            }else{
                idx ++
            }
            lastTag = d.tag
            const colArr = tagColorsArr[d.tag]
            d.color = colArr[idx % colArr.length]
        })
    }else if(options.sort === "labels"){
        data = data.sort((a,b)=>(`${a.label ?? ""}`).localeCompare(`${b.label ?? ""}`))
    }else if(options.sort === "none"){

    }else{
        data = data.sort((a,b)=>b.count - a.count)
    }

    
    const sg = new Konva.Group({
        x,
        y,
        width,
        height
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width,
        height,
        name:"background"
    })
    sg.add(r)
    const innerSpacing = config.fontSize * 1.2

    let colors = options.theme?.palette?.categoryColors ?? categoryColors
    if( options.colorMap ){
        colors = data.map(d=>options.colorMap[d.label])
    }else{
        let selectedPalette = heatMapPalette.find(d=>d.name === paletteName)
        if( selectedPalette ){
            if( selectedPalette.dynamic){
                colors = interpolateHexColors(selectedPalette.colors.at(0), selectedPalette.colors.at(-1), data.length)
                if( options.reversePalette ){
                    colors = [...selectedPalette.colors].reverse()
                }
            }else if( selectedPalette.category_colors ){
                colors = selectedPalette.category_colors 
            }else{
                colors = [...selectedPalette.colors]
            }
        }
        if( options.reversePalette === false){
            if( colors.length > data.length){
                colors = colors.slice( -data.length)
            }
        }else{
            colors = [...colors].reverse()
        }
    }
    let showLegend = !options.hideLegend

    let legend
    let usableWidth = width
    let usableHeight = height
    let minW = innerPadding[1] + innerPadding[3]
    let minH = innerPadding[2] + innerPadding[0]
    if( showLegend ){
        const maxLegendWidth = usableWidth * 0.5
        const legendData = options.colorBySecondary ? (options.sublabels?.items ?? []) : data
        legend = renderLegend( legendData,{
                            ...options,
                            fontSize: options.legendSize ?? (config.fontSize * 0.8),
                            x: 0,
                            y: 0,
                            width: options.legendOnRight ? undefined : width,
                            maxWidth: options.legendOnRight ? maxLegendWidth : undefined,
                            colors,
                            height: options.legendOnRight ? usableHeight : undefined
        })
        if( options.legendOnRight ){
            usableWidth -= (legend.width() + innerPadding[3])
            if( usableWidth < minW ){usableWidth = minW }
        }else{
            usableHeight -= (legend.height() + (innerSpacing * 1.5))
            if( usableHeight < minH ){usableHeight = minH }
        }
    }
    
    let pieY = innerSpacing
    if( !options.hideTitle){

        const t = new CustomText({
            x: innerPadding[3],
            y: innerPadding[0],
            fontSize: config.fontSize,
            height: config.fontSize * 2.3,
            lineHeight: 1.1,
            fontStyle: "bold",
            text: title,
            align: 'center',
            fill: '#334155',
            wrap: false,
            ellipsis: true,
            width: usableWidth - innerPadding[3] - innerPadding[1],
        })
        sg.add(t)
        pieY = (config.fontSize * 2.5) + innerSpacing
    }
    if( data.at(-1)?.label === "Unknown"){
        colors[data.length - 1] = "#d2d2d2"
    }


    let mainChart

    if( options.style ==="bar" || options.style ==="stacked_bar"   ){
        const barGraphOptions = {
            width: usableWidth, 
            height: usableHeight, 
            x: innerPadding[3], 
            barHeght: options.scale ? usableHeight * options.scale : undefined, 
            y: innerPadding[0], 
            colors: colors, 
            colorBySecondary: options.colorBySecondary,
            showValue: options.showValue, 
            showAxis: true,
            showLines: true,
            showAxisValue: true,
            stack: options.style === "stacked_bar",
            sublabels: options.sublabels
        }

        if( options.style ==="bar" ){
            mainChart = renderBarChart(data, barGraphOptions)
        }else if( options.style ==="stacked_bar"  ){
            mainChart = renderBarChart(data, barGraphOptions)
        }
    }else if( options.style === "weighted"){
        showLegend = false
        const { weightedSum, totalCount } = data.reduce(
            (acc, { label, count }, score) => {
              return {
                weightedSum: acc.weightedSum + score * count,
                totalCount:  acc.totalCount   + count
              };
            },
            { weightedSum: 0, totalCount: 0 }
          );
          
          let avgSentiment, label, color
          if( totalCount > 1){
            avgSentiment = weightedSum / totalCount
            const rounded = Math.round(avgSentiment);
            label = data[rounded].label
            color = colors[rounded]
          }else{
           color = "white"
           label = "None"
        }
        
        mainChart = new Konva.Group({
            x: innerPadding[3],
            y: pieY,
            width: usableWidth - (innerPadding[3] + innerPadding[1]),
            height: usableHeight - (pieY + innerPadding[2]),
        })
        
          mainChart.add(new Konva.Rect({
                x: 0,
                y: 0,
                width: usableWidth - (innerPadding[3] + innerPadding[1]),
                height: usableHeight - (pieY + innerPadding[2]),
                fill:  color
          }))
          const l = new CustomText({
            x: 0,
            y: 0,
            width: usableWidth - (innerPadding[3] + innerPadding[1]),
            text: label,
            fontSize: itemSize / 15,
            align: 'center',
            verticalAlign: 'middle'
        }) 
        l.y( (usableHeight - l.height() ) / 2)
        mainChart.add(l)
    }else{
        let fullPieSize = (Math.min(usableHeight - innerPadding[2] - innerPadding[0], usableWidth - innerPadding[3] - innerPadding[1])) * 0.95
        let pieSize = fullPieSize
        const pieMid = (fullPieSize / 2)
        if( options.scale ){
            pieSize *= options.scale
        }
        const pie = renderPieChart(data, {size: pieSize, x: (usableWidth - pieSize) / 2, y: pieY + pieMid - (pieSize/ 2), colors: colors})
        mainChart = new Konva.Group({
            x: 0,
            y: 0,
            width: usableWidth,
            height: usableHeight
        })
        mainChart.add(pie)
    }
    sg.add( mainChart )

    let finalWidth = mainChart.width() + innerPadding[1] + innerPadding[3]
    let finalHeight = mainChart.height() + innerPadding[0] + innerPadding[2]
    if( showLegend){
        sg.add( legend)
        if( options.legendOnRight ){
            legend.x( mainChart.x() + mainChart.width() + innerPadding[3])
            legend.y( (mainChart.y() + (mainChart.height() / 2)) - (legend.height() / 2))
            finalWidth = legend.x() + legend.width() + innerPadding[1]
        }else{
            legend.x( innerPadding[3])
            legend.y( mainChart.y() + mainChart.height() + innerPadding[2])
            finalHeight = legend.y() + legend.height() + innerPadding[2]
        }
    }
    sg.width( finalWidth )
    r.width( finalWidth )
    sg.height( finalHeight )
    r.height( finalHeight )
    sg.attrs.legendInfo = {colors, data}
    return sg
}
function renderLegend( data, {colors, itemSize, height, width, maxWidth, ...options} ){
    if( !width ){
        width = itemSize
    }
    if(!height){
        height = itemSize
    }

    const legendFontSize = options.fontSize ?? 12
    const slx = (legendFontSize * 1.2)
    const rxDelta = legendFontSize * (1.2 - 0.05)
    let lIdx = 0
    let lx = slx
    let ly = 0

    const sg = new Konva.Group({
        x: options.x,
        y: options.y,
        width: 0,
        height: 0
    })

    let maxX = 0, maxY = 0
    
    for( const d of (data ?? []) ){
        if( ly >= height){
            break
        }
        const r = new Konva.Rect({
            //x: innerPadding[3] + (legendFontSize * 0.05),
            x: lx - rxDelta,
            y: ly - (legendFontSize * 0.05),
            width: legendFontSize * 0.9,
            height: legendFontSize * 0.9,
            fill: d?.color ?? colors[ lIdx % colors.length],
            strokeScaleEnabled: false,
            strokeWidth:1,
            stroke: '#555'
        })
        sg.add(r)
        
        const t = new CustomText({
            x: lx,
            y: ly,
            fontSize: legendFontSize,
            text: d.label, //`${d.label} ${(d.count / total * 100).toFixed(2)}%`,
            fill: '#334155',
            ellipsis: true,
            width: options.horizontalLegend ? "auto" : (width ? width - lx : undefined)
        })
        if( maxWidth && t.width() > maxWidth){
            t.width( maxWidth)
        }
        if( options.horizontalLegend ){
            if( lx + t.width() > width){
                lx = slx
                ly += legendFontSize * 1.5
                t.x(slx)
                t.y(ly)
                r.y(ly)
                r.x(slx - rxDelta)
            }
            lx += t.width() + (legendFontSize * 3)
        }else{
            ly += legendFontSize * 1.5
        }
        sg.add(t)
        const ex = t.x() + t.width()
        if( ex > maxX){maxX = ex}
        const ey = t.y() + t.height()
        if( ey > maxY){maxY = ey}
        lIdx++
    }            
    sg.width(maxX)
    sg.height(maxY)
    return sg

}
registerRenderer( {type: "default", configs: "dial"}, (primitive, options = {})=>{
    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, width: 400, padding: [0,0,0,0], ...options, ...(primitive.renderConfig ?? {})}

    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 


    const sets = options.data?.mappedCategories ?? []
    const usableWidth = config.width - config.padding[1] - config.padding[3]
    
    let x = config.padding[3]// + spacing
    let y = config.padding[0] //+ ySpacing

    let innerPadding = [10,10,10,10]


    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: usableWidth,
        onClick: options.onClick,
        name:"inf_track"
    })
    let style = config.style
    
            let colors = [
                "#cd5a50",
                "#e27da7",
                "#f0a9ad",
                "#f7db5a",
                "#c6d866",
                "#83bb57",
                "#52ab59"
            ]

            let aligned = 0, total = 0
            for(const score of options.data){
                if( score.label === "clearly" || score.label === "likely"){
                    aligned+=score.count
                }
                total+=score.count
            }
            const complete = aligned / total
            const colorIdx = Math.floor(colors.length * complete)
            const needle = 180 * complete
            const ring = 14

            const r = ((usableWidth / 2) - ring) * (options.show_label ? 0.85 : 1)

            var wedge1 = new WedgeRing({
                x: usableWidth / 2,
                y: (usableWidth / 2) - ring,
                outerRadius: r,
                innerRadius: r * 0.65,
                angle: 180,
                fill: "#dadada  ",
                rotation:  180,
            });
            g.add(wedge1)
            var wedge2 = new WedgeRing({
                x: usableWidth / 2,
                y: (usableWidth / 2) - ring,
                outerRadius: r,
                innerRadius: r * 0.65,
                angle: needle,
                fill: config.invert ? colors[colors.length - 1 - colorIdx]  : colors[colorIdx],
                rotation:  180,
            });
            g.add(wedge2)
            g.height(usableWidth / 2)

            g.add( new Konva.Circle({
                x: usableWidth / 2,
                y: (usableWidth / 2) - ring,
                radius: 12,
                fill: "#434343"
            }))
            g.add( new Konva.Line({
                x: usableWidth / 2,
                y: (usableWidth / 2) -ring,
                points:[
                    - 8, - 6,
                    + 8, - 6,
                    0, -r * 0.85,
                ],
                closed: true,
                rotation:  -90 + needle,
                fill: "#434343"
            }))
            if( options.show_label){
                g.add( new CustomText({
                    x: (usableWidth / 2) - (r / 0.92) - 15,
                    y: ((usableWidth / 2) - ring) * 0.8,
                    fontSize: 20,
                    text: "L",
                    fill: '#334155',
                    align:"center",
                    width: 30
                }))
                g.add( new CustomText({
                    x: (usableWidth / 2) - 15,
                    y: ((usableWidth / 2) - ring) - ( r / 0.92) - 8,
                    fontSize: 20,
                    text: "M",
                    align:"center",
                    fill: '#334155',
                    width: 30
                }))
                g.add( new CustomText({
                    x: (usableWidth / 2) + (r / 0.92) - 15,
                    y: ((usableWidth / 2) - ring) * 0.8,
                    fontSize: 20,
                    text: "H",
                    fill: '#334155',
                    align:"center",
                    width: 30
                }))
            }

    return g
})
registerRenderer( {type: "default", configs: "chart"}, (primitive, options = {})=>{
    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, width: 400, padding: [0,0,0,0], ...options, ...(primitive.renderConfig ?? {})}

    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 


    const sets = options.data?.mappedCategories ?? []
    const usableWidth = config.width - config.padding[1] - config.padding[3]
    
    let x = config.padding[3]// + spacing
    let y = config.padding[0] //+ ySpacing

    let innerPadding = [10,10,10,10]


    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: usableWidth,
        onClick: options.onClick,
        name:"inf_track"
    })
    let style = config.style
    
    const sg = renderSubCategoryChart("NAME", options.data, {
        x: x, 
        y: y, 
        itemSize: usableWidth, 
        innerPadding, 
        style, 
        hideTitle: config.show_title === false, 
        hideLegend: config.show_legend === false, 
        byTag: config.by_tag,
        paletteName: config.colors
    })
    g.add(sg)
    
    g.width(sg.width())
    g.height(sg.height())
    return g
})

registerRenderer( {type: "default", configs: "word_cloud"}, (primitive, options = {})=>{
    const words = options.data.mappedCategories[0].details.map(d=>({text:d.label, size: d.items.length}))
    
    return plotWordCloud( {id: primitive.id, width: 300, height: 300, ...options, words})
})
registerRenderer( {type: "default", configs: "cat_overview"}, (primitive, options = {})=>{
    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, itemSize: 280, width: 1200, padding: [0,0,0,0], ...options, ...(primitive.renderConfig ?? {})}

    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 


    const sets = options.data?.mappedCategories ?? []
    const usableWidth = config.width - config.padding[1] - config.padding[3]
    const setCount = sets.length 
    
    const itemSize = config.itemSize
    const columns = Math.floor(usableWidth / (itemSize + 10))
    const spacing = columns > 1 ? (usableWidth - (columns * itemSize)) / (columns - 1) : 0
    let ySpacing = 30
    const actualColumns = Math.min(columns, setCount)
    
    const actualWidth = ((spacing + itemSize) * actualColumns) - spacing
    let x = config.padding[3]// + spacing
    let y = config.padding[0] //+ ySpacing
    let maxY = 0
    let cIdx = 0

    let rHeight = 0
    let rowCells = []
    let innerPadding = [10,10,10,10]


    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: actualWidth,
        onClick: options.onClick,
        name:"inf_track"
    })

    function updateGraphBackground(){
        for(const d of rowCells){
            d.find('.background')[0]?.height(rHeight)
        }
    }

    for( const item of sets ){
        const sg = renderSubCategoryChart(item.title, item.details, {
                                                x: x, 
                                                y: y, 
                                                itemSize, 
                                                innerPadding, 
                                                style: config.style, 
                                                showValue: config.show_value !== false, 
                                                hideTitle: config.show_title === false, 
                                                hideLegend: config.show_legend === false, 
                                                byTag: config.by_tag,
                                                paletteName: config.colors
                                            })
        g.add(sg)
        rowCells.push( sg )
        
        rHeight = sg.attrs.height > rHeight  ? sg.attrs.height : rHeight

        x += itemSize + spacing
        cIdx ++
        maxY = y + rHeight
        if( cIdx === columns ){
            updateGraphBackground()
            x = config.padding[3] //+ spacing
            y += rHeight + ySpacing
            rHeight = 0
            cIdx = 0
            rowCells = []
        }
        
    }
    updateGraphBackground()
    const h = maxY + config.padding[2] //+ ySpacing
    //r.height(h)
    g.height(h)
    return g

})
registerRenderer( {type: "categoryId", id: 128, configs: "set_default"}, function renderFunc(primitive, options = {}){
    return categoryGrid( primitive, options)
})
registerRenderer( {type: "categoryId", id: 113, configs: "set_format_grid"}, function renderFunc(primitive, options = {}){
    return categoryGrid( primitive, {...options, itemSize: 450})
})
registerRenderer( {type: "categoryId", id: 109, configs: "set_format_grid"}, function renderFunc(primitive, options = {}){
    return categoryGrid( primitive, {...options, itemSize: 450})
})
registerRenderer( {type: "default", configs: "set_distribution"}, function renderFunc(primitive, options = {}){
    console.warn("USING OLD RENDER FOR SUB DISTRIBITION")
    const {list, extents, ...forwardOptions} = options
    const viewConfig = {
        renderType: "distribution_chart",
        field: options.renderOptions?.field //?? "is_verified_review"
    }
    return renderMatrix(primitive, list ?? [], {...forwardOptions, rowExtents: extents?.row, columnExtents: extents.column, viewConfig})
})
registerRenderer( {type: "default", configs: "datatable_distribution"}, function renderFunc({table, cell, renderOptions, ...options}){
    const config = {itemSize: 280, padding: [10,10,10,10], ...options}
    let scale = 1
    let max, min
    const width = renderOptions.width ?? config.itemSize
    const height = renderOptions.height ?? config.itemSize


    function sortByOrder(values){
        if( renderOptions.order === "high_to_low"){
            return values.sort((a,b)=>b.count - a.count)
        }else if( renderOptions.order === "low_to_high"){
            return values.sort((a,b)=>a.count - b.count)
        }
        return values
    }

    const count = cell.count
    let values = Object.values(cell.allocations ?? {})?.[0] ?? [{count:cell.count, label: "Count"}]
    let sublabels
    if( Object.keys(table.allocations ?? {}).length > 1 ){
        values = sortByOrder(values)
        values = values.map(d=>({label:d.label, count: Object.values(d.allocations)[0].map(d=>d.count)}))
        sublabels = Object.values(table.allocations)[1]
        if( renderOptions.style !== "bar"){
            values = values.map(d=>d[0])
            sublabels = null
        }
    }else{
        values = Object.values(values)
        values = sortByOrder(values)
    }
    
    /*if( !values ){
        values = [{count:cell.count, label: "Count"}]
    }*/
    if(table.ranges && renderOptions.calcRange){
        if( renderOptions.calcRange === "row"){
            ({min, max} = table.ranges.rows.order[cell.rIdx])
        }else if( renderOptions.calcRange === "column"){
            ({min, max} = table.ranges.columns.order[cell.cIdx])
        }else{
            ({min, max} = table.ranges.table)
        }
        scale = ((count / max) * 0.8) + 0.2
    }

    
    const allocValues = Object.values(table.defs?.allocations ?? {})
    const colorBySecondary = allocValues[0]?.type !== "category" && allocValues[1]?.type === "category"
    

    let g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width,
        height
    })
    const sg = renderSubCategoryChart("", values, {
        x: 0,//config.itemSize,// * (renderOptions.show_legend ? 0.1 : 0), 
        y: 0, 
        width: width - config.padding[1] - config.padding[3],
        height: height - config.padding[0] - config.padding[2],
        innerPadding: config.padding, 
        style: renderOptions.style, 
        hideTitle: true, 
        paletteName: renderOptions.colors,
        colorBySecondary,
        sublabels,
        scale,
        max,
        min,
        count,
        colorMap: renderOptions.colorMap,
        showValue: renderOptions.show_value ?? false, 
        legendSize: renderOptions.legend_size,
        legendOnRight: renderOptions.show_legend === "right",
        horizontalLegend: renderOptions.show_legend !== "right",
        reversePalette: renderOptions.reverse_palette,
        hideLegend: !renderOptions.show_legend,
        sort: "none"
    })
    g.add(sg)
    g.width(sg.width())
    g.height(sg.height())
    if( options.getConfig){
        return {
            width: sg.width(),
            height: sg.height()
        }
    }
    return g
})
registerRenderer( {type: "default", configs: "datatable_heatmap"}, ({table, cell, renderOptions, ...options})=>{
    const config = {width: 128, height: 128, padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( renderOptions.width ){
        config.width = renderOptions.width
    }
    if( renderOptions.height ){
        config.height = renderOptions.height
    }
    let range = table.ranges.table
    let totals = table.totals.table
    let title = ""
    let fontSize = 16 / 128 * config.width

    if( renderOptions?.group_by === "row"){
        totals = table.totals.rows?.order?.[cell.rIdx]
        range = table.ranges.rows?.order?.[cell.rIdx]
        //title = options.colTitles?.[options.cIdx]
    }else if( renderOptions?.group_by === "col"){
        totals = table.totals.columns?.order?.[cell.cIdx]
        range = table.ranges.columns?.order?.[cell.cIdx]
        //title = options.rowTitles?.[options.rIdx]
    }

    const colors = heatMapPalette.find(d=>d.name === (renderOptions?.colors ?? "default"))?.colors ?? heatMapPalette[0].colors
    const textColors = heatMapPalette.find(d=>d.name === (renderOptions?.colors ?? "default"))?.text_colors ?? colors.map(d=>"black")
    range ||= {min: 0, max: 0}
    totals ||= 0
    const spread = range.max - range.min + 1
    
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height,
    })

    const idx = Math.floor((cell.count- range.min) / spread * colors.length) 

    if( renderOptions.bubble){
        const b = new Konva.Rect({
            x: config.padding[3],
            y: config.padding[0],
            width: config.width - config.padding[3] - config.padding[1],
            height: config.height - config.padding[0] - config.padding[2],
            fill: "transparent",
            name: "background"
        })
        g.add(b)
        const midX = (config.width - config.padding[3] - config.padding[1]) / 2
        const midY = (config.height - config.padding[2] - config.padding[0]) / 2
        const maxR = Math.min(midX, midY)
        const s = cell.count
        let r = s ===0 ? (!renderOptions.counts ? 1 : 0) : maxR / spread * (1+(s- range.min))
        let color = s === 0 && !renderOptions.counts ? "#555" : s === 0 ? "white" : colors[idx]
        if( r > 0){
            const r2 = new Konva.Circle({
                x: config.padding[3] + midX,
                y: config.padding[0] + midY,
                radius: r,
                fill: color
            })
            g.add(r2)
        }
    }else{
        const r2 = new Konva.Rect({
            x: config.padding[3],
            y: config.padding[0],
            width: config.width - config.padding[3] - config.padding[1],
            height: config.height - config.padding[0] - config.padding[2],
            fill: cell.count === 0 ? "white" : colors[idx]
        })
        g.add(r2)
    }
    if( renderOptions?.counts){
        const t = new Konva.CustomText({
            x: config.padding[3],
            y: (config.height) / 2,
            text: renderOptions?.counts === "percentage" ? `${(cell.count / totals * 100).toFixed(0)}% ` : cell.count,
            fontSize: fontSize * (renderOptions.bubble ? 0.5  : 1),
            fontStyle: renderOptions.bubble ? "bold" : undefined,
            fill: textColors[idx],
            width: config.width - config.padding[3] - config.padding[1],
            align:'center',
            height:20,
            bgFill: 'transparent',
            refreshCallback: options.imageCallback
        })
        g.add(t)
        t.y((config.height - t.textHeight ) /2)

    }else if( renderOptions?.titles){
        const t = new Konva.CustomText({
            x: config.padding[3],
            y: (config.height - 20) / 2,
            text: title,
            fontSize: 16,
            width: config.width - config.padding[3] - config.padding[1],
            fill: textColors[idx],
            wrap: true,
            ellipses: true,
            align:'center',
            //height:20,
            bgFill: 'transparent',
            refreshCallback: options.imageCallback
        })
        g.add(t)
        t.y((config.height - t.height() ) /2)

    }


    if( options.getConfig){
        return config
    }

    return g
})
registerRenderer( {type: "default", configs: "set_distribution_chart"}, function renderFunc(primitive, options = {}){
 //   console.warn("USING OLD RENDER FOR SUB DIST - REPLACE")
    const config = {itemSize: 280, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return {
            ...config,
            width: config.itemSize,
            height: config.itemSize
        }
    }
    const list = options.listWithAllocations ?? []
    let field = options.renderConfig.viewConfig.field
    let values = {}
    let useBasic = false
    if( field === "is_verified_review" ){
        values = {
            true: {label: "Yes", count: 0},
            false: {label: "No", count: 0}
        }
        useBasic = true
    }else if( field === "review_rating"){
        useBasic = true
        values = {
            1: {label: "1", count: 0},
            2: {label: "2", count: 0},
            3: {label: "3", count: 0},
            4: {label: "4", count: 0},
            5: {label: "5", count: 0},
        }
    }else{
        values = options.allocationExtents?.filterGroup0?.reduce((a,c)=>{
            a[c.idx] = {label: c.label, count: 0}
            return a
        },{}) ?? {}
    }
    list.forEach(d=>{
        let v
        if(useBasic){
            v = d.primitive.referenceParameters?.[field] ?? ""
        }else{
            const lookup = Array.isArray(d.filterGroup0) ? d.filterGroup0[0] : d.filterGroup0
            v = lookup
        }
        values[v] ||= {label: v, count: 0}
        values[v].count++
    })
    let scale
    let max, min, count
    if(options.renderOptions.calcRange && Array.isArray(options.rowRange)){
        //max = options.range[1]
        //min = options.range[0]
        //max = options.rowRange[options.rIdx][1]
        //min = options.rowRange[options.rIdx][0]
        max = options.colRange[options.cIdx][1]
        min = options.colRange[options.cIdx][0]
        count = list.length 
        scale = ((count / max) * 0.8) + 0.2
        
    }
    let g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.itemSize,
        height: config.itemSize
    })
    const sg = renderSubCategoryChart("", Object.values(values), {
        x: config.itemSize * (options.renderOptions.show_legend ? 0.1 : 0), 
        y: 0, 
        itemSize: config.itemSize * (options.renderOptions.show_legend ? 0.8 : 1), 
        innerPadding: config.padding, 
        style: options.renderOptions.style, 
        hideTitle: true, 
        paletteName: options.renderOptions.colors,
        scale,
        max,
        min,
        count,
        horizontalLegend: true,
        reversePalette: options.renderOptions.reverse_palette,
        hideLegend: !options.renderOptions.show_legend,
        sort: "none"
    })
    g.add(sg)
    return g
})
registerRenderer( {type: "default", configs: "datatable_timeseries"}, function renderFunc({table, cell, renderOptions, ...options}){
    const config = {width: 280, height: 140, padding: [10,10,10,10], ...options}
    if( renderOptions.width ){
        config.width = renderOptions.width
    }
    if( renderOptions.height ){
        config.height = renderOptions.height
    }
 
    let g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.width,
        height: config.height
    })
    const sg = new Konva.Rect({
        width: config.width,
        height: config.height,
        fill: "green"
    })
    const timeseries = cell.timeseries
    let seriesIdx = -1

    const showingDeltas = renderOptions.timeRange ? renderOptions.timeRange?.startsWith("delta_") : false

    function minMaxTimeForCell( series ){
        const msList = Object.keys(series ?? {}).map(d=>parseInt(d)).sort().sort((a,b)=>a-b)
        let min = parseInt(msList.at(0))
        let max = parseInt(msList.at(-1))

        if( renderOptions.timeRange === "row" || renderOptions.timeRange === "delta_row"){
            ({min, max} = table.ranges.timeseries.time.rows.order[cell.rIdx])
        }else if( renderOptions.timeRange === "column" || renderOptions.timeRange === "delta_column"){
            ({min, max} = table.ranges.timeseries.time.columns.order[cell.cIdx])
        }
        
        return {msList, min, max}
    }

    for( const series of timeseries ?? [] ){
        seriesIdx += 1
        const {msList, min, max} = minMaxTimeForCell( series )
        const dx = config.width / (max - min)        

        let minValue = 0
        let maxValue = Object.values(series ?? {}).reduce((a,d)=>(d.count ?? 0) > a ? (d.count ?? 0) : a, -Infinity)


        if( renderOptions.calcRange){
            let values
            const totalData = table.ranges.timeseries.values
            if( renderOptions.calcRange === "row"){
                values = totalData.rows.order[cell.rIdx][seriesIdx]
            }else if( renderOptions.calcRange === "column"){
                values = totalData.columns.order[cell.cIdx][seriesIdx]
            }
            maxValue = values?.max ?? 0
        }

        const dy = config.height / (maxValue - minValue)

        const inFrame = msList.filter(d=>d <= max)

        function calcPoint(d){
            return [(d - min) * dx, config.height - ((series[d].count - minValue) * dy) ]
        }
        
        const points = inFrame.map(d=>{
            return calcPoint(d)
        }).flat()

        const color = "#0ea5e9"
        const ys = points.filter((_, i) => i % 2 === 1);
        const minY = ys.reduce((a,c)=>c < a ? c :a, Infinity)
        const maxY = ys.reduce((a,c)=>c > a ? c :a, -Infinity)
        
        g.add(new Konva.Rect({
            width: config.width,
            height: config.height,
            fill: "white"
        }))
        
        let fadeColor = mixHexWithWhite(color, 0.65)
        const fade = new Konva.Line({
            points: [...points, points.at(-2), config.height, 0, config.height],
            closed: true,
            fillLinearGradientStartPoint: { x: config.width/2 / 2, y: minY },
            fillLinearGradientEndPoint: { x: config.width/2 / 2, y: maxY },
            fillLinearGradientColorStops: [0, fadeColor, 0.8, 'white'],
        })
        g.add(fade)

        const lastPointInterpolated = series[msList.at(-1)].interpolated
        const mainPoints = lastPointInterpolated ? points.slice(0,-2) : points

        const li = new Konva.Line({
            points: mainPoints,
            stroke: color,
            strokeWidth: 1,
        })
        g.add(li)
        if( lastPointInterpolated ){
            const li = new Konva.Line({
                points: points.slice(-4),
                stroke: color,
                strokeWidth: 1,
                dashEnabled: true,
                dash: [6, 5]
            })
            g.add(li)
        }


        mainPoints.forEach((_, i) => {
            if (i % 2 === 0) {
              const x = points[i];
              const y = points[i + 1];
              const dot = new Konva.Circle({
                x,
                y,
                radius: 2,
                fill: color,
              });
              g.add(dot);
            }
        })
        const maxLabel = new Konva.Text({
            x: 0,
            y: 5,
            color: "#888",
            align: "right",
            text: (showingDeltas ? "Avg " : "") + Math.ceil( series[ inFrame.at(-1) ].count )
        })
        maxLabel.x( config.width - maxLabel.width() - 5 )

        g.add(maxLabel)
        
    }
    if( options.getConfig){
        return {
            width: g.width(),
            height: g.height()
        }
    }
    return g
})
registerRenderer( {type: "default", configs: "set_overunder"}, function renderFunc(primitive, options = {}){
    const config = {itemSize: 350, padding: [2,2,2,2], ...options}
    const fontSize = 12
    const barHeight = 20
    const list = options.list ?? []
    const scores = (options.allocations?.filterGroup0 ?? []).filter(d=>d.idx !== undefined && d.idx !== null && d.idx !== "_N_")
    const groups = options.allocations?.filterGroup1 ?? []
    let groupColors = options.theme?.palette?.categoryColors ?? categoryColors

    let g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: config.itemSize,
        height: config.itemSize
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: config.itemSize,
        height: config.itemSize,
        fill:"white"
    })
    g.add(r)


    let positives, negatives

    if( scores.length % 2 === 1){
        const mid = (scores.length + 1) / 2
        negatives = new Set(scores.map(d=>d.idx).slice(0,mid - 1))
        positives = new Set(scores.map(d=>d.idx).slice(mid))
    }else{
        const mid = scores.length / 2
        negatives = new Set(scores.map(d=>d.idx).slice(0,mid))
        positives = new Set(scores.map(d=>d.idx).slice(mid))
    }

    const renderData = {}
    const maximums = {positives: 0, negatives: 0}

    for(const row of options.extents.row ){
        for(const column of options.extents.column ){

            let subList = list.filter((item)=>(Array.isArray(item.column) ? item.column.includes( column.idx ) : item.column === column.idx) && (Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx))

            for(const group of groups){

                let subListForGroup = group ? subList.filter((item)=>(Array.isArray(item.filterGroup1) ? item.filterGroup1.includes( group.idx ) : item.filterGroup1 === group.idx)) : subList
                
                const negativeScoreCounts = negatives.keys().toArray().reduce((a,c)=>{a[c] = 0; return a}, {})
                const positiveScoreCounts = positives.keys().toArray().reduce((a,c)=>{a[c] = 0; return a}, {})
                const global = {positives: 0, negatives: 0, total: 0}
                
                const key = `${column.idx}-${row.idx}`
                renderData[key] ||= []
                
                for( const d of subListForGroup ){
                    const score = Array.isArray(d.filterGroup0) ? d.filterGroup0[0] : d.filterGroup0
                    if( negatives.has(score)){
                        negativeScoreCounts[score] = (negativeScoreCounts[score]  || 0) + 1
                        global.negatives++
                    }else if( positives.has(score)){
                        global.positives++
                        positiveScoreCounts[score] = (positiveScoreCounts[score]  || 0) + 1
                    }
                    global.total++
                }
                if( global.positives > maximums.positives){
                    maximums.positives = global.positives
                }
                if( global.negatives > maximums.negatives){
                    maximums.negatives = global.negatives
                }
                renderData[key].push( {
                    global,
                    negativeScoreCounts,
                    positiveScoreCounts
                })
            }
        }
    }
    const usableWidth = (config.itemSize * 0.9) - (config.renderOptions.show_breakdown ? barHeight * 4 : 0)
    const scale = usableWidth / (config.renderOptions?.center ? Math.max(maximums.negatives, maximums.positives) * 2 : (maximums.negatives + maximums.positives))
    const axisOrigin = (config.renderOptions.show_breakdown ? barHeight * 2 : 0) + (config.renderOptions?.center ? (Math.max(maximums.negatives, maximums.positives) * scale) : (maximums.negatives * scale))

    const heatColors = [...heatMapPalette.find(d=>d.name === "heat").colors].slice(-negatives.size).reverse()
    const greenColors = [...heatMapPalette.find(d=>d.name === "green").colors].slice(-negatives.size)

    let x = config.padding[3], y = config.padding[0]
    let maxW = 0
    let rIdx = -1
    const includeNeutralInPercent = true
    for(const row of options.extents.row ?? []){
        rIdx ++
        let cIdx = -1
        for(const column of options.extents.column ?? []){
            cIdx++
            const key = `${column.idx}-${row.idx}`
            const data = renderData[key]            
            if( !data ){
                continue
            }

            let sg = new Konva.Group({
                x,
                y,
                width: config.itemSize,
            })
            let ly = 0
            if( cIdx === 0){
                sg.add(new CustomText({
                    x: axisOrigin + 4,
                    text: options.extents.row[rIdx].label,
                    fontSize
                }))
                ly += fontSize * 1.2
            }
            let idx = -1
            for(const thisData of data){
                idx++
                if( config.renderOptions.show_breakdown){
                    sg.add(renderPieChart( Object.keys(thisData.negativeScoreCounts).map(d=>({label: scores.find(d2=>d2.idx === d)?.label, count: thisData.negativeScoreCounts[d] })),
                    {
                        x: 0,
                        y: ly + barHeight * 0.1,
                        size: barHeight * 0.8,
                        colors: heatColors
                    }))
                    sg.add(new CustomText({
                        x: (barHeight),
                        y: ly + barHeight * 0.1,                        
                        fontSize: fontSize * 0.7,
                        text: `${((includeNeutralInPercent ? thisData.global.negatives / thisData.global.total : thisData.global.negatives  / (thisData.global.positives + thisData.global.negatives ) )* 100).toFixed(0)}%`
                    }))
                }
                sg.add(new Konva.Rect({
                    x: axisOrigin - (scale * thisData.global.negatives),
                    y: ly,
                    width: (scale * (thisData.global.negatives + thisData.global.positives)),
                    height: barHeight,
                    fill: groupColors[idx]
                }))
                if( config.renderOptions.show_breakdown){
                    sg.add(renderPieChart( Object.keys(thisData.positiveScoreCounts).map(d=>({label: scores.find(d2=>d2.idx === d)?.label, count: thisData.positiveScoreCounts[d] })),
                    {
                        x: config.itemSize - barHeight,
                        y: ly + barHeight * 0.1,
                        size: barHeight * 0.8,
                        colors: greenColors
                    }))
                    sg.add(new CustomText({
                        x: config.itemSize - (barHeight * 2),
                        fontSize: fontSize * 0.7,
                        y: ly + barHeight * 0.1,                        
                        text: `${((includeNeutralInPercent ? thisData.global.positives / thisData.global.total : thisData.global.positives / (thisData.global.positives + thisData.global.negatives ))* 100).toFixed(0)}%`
                    }))
                }
                ly += barHeight * 1.2
            }            
            sg.height(ly)
            g.add(sg)
            y += sg.height() + (fontSize * 1.75)

            x += config.itemSize
            maxW = x > maxW ? x : maxW
        }
        x = config.padding[3] 
    }
    g.width(maxW)

    g.add(new Konva.Line({
        points: [ config.padding[3] + axisOrigin, config.padding[0], config.padding[3] + axisOrigin, y],
        strokeWidth: 1 ,
        stroke: "#828282"
    }))
    if( groups.length > 0){
        if( options.show_legend){
            const legend = renderLegend( groups,{
                                ...options,
                                fontSize: fontSize * 0.8,
                                x: config.padding[3],
                                y: y,
                                itemSize: config.itemSize,
                                colors: groupColors
            })
            g.add( legend)
            y += legend.height()

        }

    }

    r.height(y)
    g.height(y)


    if( options.getConfig){
        return {
            ...config,
            width: g.width(),
            height: g.height()
        }
    }

    /*list.forEach(d=>{
        const v = Array.isArray(d.filterGroup0) ? d.filterGroup0[0] : d.filterGroup0
        values[v] ||= {label: v, count: 0}
        values[v].count++
    })*/
    return g
})

function categoryGrid(primitive, options = {}){
    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, width: 1200, height: 1200, itemSize: 280, padding: [10,10,10,10], ...options, ...(primitive.renderConfig ?? {})}
    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 
    
    if( !options.extents?.column ||  options.extents?.row){
        return new Konva.Group({
            x: ox,
            y: oy,
            width: 100,
            height: 100,
            onClick: options.onClick,
            name:"inf_track primitive"
        })
    }

    const setCount = options.extents.column.length * options.extents.row.length
    const usableWidth = config.width - config.padding[1] - config.padding[3]
    const itemSize = config.itemSize
    const columns = Math.floor(usableWidth / (itemSize + 10))
    const spacing = (usableWidth - (columns * itemSize)) / (columns - 1)
    let ySpacing = spacing
    const actualColumns = Math.min(columns, setCount)
    let colors = options.theme?.palette?.categoryColors ?? categoryColors
    
    const actualWidth = ((spacing + itemSize) * actualColumns) - spacing
    let x = config.padding[3]// + spacing
    let y = config.padding[0] //+ ySpacing
    let maxY = 0
    let cIdx = 0
    let idx = 0

    let rHeight = 0
    let rowCells = []
    let innerPadding = [10,10,10,10]

    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        name:"inf_track"
    })


    function updateBackground(){
        for(const d of rowCells){
            d.find('.background_rect')[0]?.height(rHeight)
        }
    }

    let sortedRows = options.extents.row
    let sortedCols = options.extents.column
    
    if(  config.by_tag ){
        [sortedRows, sortedCols].flat().forEach(d=>{
            d.tag = d.primitive?.filterTargets?.[0]?.referenceParameters?.tag
        })

        sortedCols = sortedCols.sort((a,b)=>a.tag - b.tag)
        sortedRows = sortedRows.sort((a,b)=>a.tag - b.tag)

        let lastTag, tagIdx = 0;

        ([sortedRows, sortedCols]).flat().forEach(d=>{
            if( d.tag !== lastTag){
                tagIdx = 0
            }
            const scol = Object.values(options.theme?.palette?.tagColors ?? tagColors)[d.tag]
            d.color = scol ? scol[tagIdx % scol.length] : undefined
            tagIdx ++
            lastTag = d.tag
        })
        
    }


    for(const row of sortedRows){
        for(const column of sortedCols){
            let color = column.color ?? row.color ?? colors[idx % colors.length] 
            const tg = new Konva.Group({
                x: x,
                y: y,
                width: itemSize,
                height: itemSize,
                onClick: options.onClick,
                name:"inf_track primitive"
            })
            const r = new Konva.Rect({
                x: 0,
                y: 0,
                width: itemSize,
                height: itemSize,
                stroke: color,
                strokeWidth: 1,
                name:"background_rect"
            })
            tg.add(r)

            const titleText = [row.label, column.label].filter(d=>d).join(" - ")

            const header = new CustomText({
                        fontSize: 16,
                        text: titleText,
                        align:"left",
                        wrap: false,
                        ellipsis: true,
                        verticalAlign:"top",
                        fontStyle: "bold",
                        fontFamily: "Poppins",
                        fill: config.by_tag ? getTextColor(color) : "white",
                        x: innerPadding[3],
                        y: innerPadding[0],
                        width: itemSize - innerPadding[3] - innerPadding[1],
                        refreshCallback: options.imageCallback
                    })

            const r2 = new Konva.Rect({
                x: 0,
                y: 0,
                width: itemSize,
                height: header.height() + innerPadding[3] + innerPadding[1],
                fill: color,
            })
            tg.add(r2)
            tg.add(header)

            
            const thisSet = options.list.filter(d=>(!d.column || d.column.includes(column.idx)) && (!d.row || d.row.includes(row.idx)))
            let ty = r2.height() + innerPadding[0]
            let mainText
            if( thisSet.length > 0){
                tg.attrs.id = thisSet[0].primitive.id
            }
            for(const item of thisSet){
                mainText = new CustomText({
                    fontSize: 11,
                    fontFamily: "Poppins",
                    text: item.primitive.referenceParameters.summary,
                    align:"left",
                    wrap: false,
                    ellipsis: true,
                    withMarkdown: true,
                    lineHeight: 1.3,
                    verticalAlign:"top",
                    fill:"#334155",
                    x: 4,
                    y: ty,
                    width: itemSize - 8,
                    refreshCallback: options.imageCallback
                })
                ty += mainText.height() + innerPadding[2]
                tg.add( mainText )
            }
            g.add(tg)

            rHeight = ty > rHeight  ? ty : rHeight

            tg.height( rHeight)
            r.height( rHeight)

            rowCells.push(tg)
            
            x += itemSize + spacing
            cIdx ++
            idx++
            maxY = y + rHeight
            
            if( cIdx === columns ){
                updateBackground()
                x = config.padding[3] 
                y += rHeight + innerPadding[2] + innerPadding[0]
                rHeight = 0
                cIdx = 0
                rowCells = []
            }
        }
    }
    updateBackground()

    const h = maxY + config.padding[2] //+ ySpacing
    g.height(h)
    
    return g
}
registerRenderer( {type: "categoryId", id: 29, configs: "export_finances"}, function renderFunc(primitive, options = {}){
    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, width: 492, itemSize: 280, padding: [10,10,10,10], ...options}

    let lineColor
    let withBackground = false
    let bgColor = "white"
    let textColor = "black"
    let padding = [0,0,0,0]
    let columnWidths = []

    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 

    if( options.renderConfig?.layout === "narrow"){
        config.width = 156
        bgColor = "#1C258C"
        lineColor = "white"
        withBackground = true
        textColor = "white"
        padding = [16,8,8,8]
    }else{
        columnWidths = [140]
        config.width = 492
    }

    const g = new Konva.Group({
        x: ox,
        y: oy,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        name:"inf_track primitive"
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        fill: bgColor,
        name: withBackground ? "" : "background"
    })
    g.add(r)
    let text = convertOrganizationFinancialData( primitive, primitive.metadata?.actions?.find(d=>d.key === "convert_financials")?.transform ?? {}, options.renderConfig?.section ?? "financial_highlights")
    if( text ){
        const index = text.indexOf('|');
        if( index >-1 ){
            text = text.substring(index)
        }
        const table = convertMarkupToTable(text, {
            x: padding[3],
            y: padding[0],
            cellPadding: [7,6,7,0],
            columnWidths,
            textColor,
            columnLines: false, 
            borderColor: lineColor, 
            width: config.width - padding[1] - padding[3]
        })
        if( table ){
            g.add(table)
            g.height(table.height() + padding[0] + padding[2])
            r.height(table.height() + padding[0] + padding[2])
        }
    }

    if( options.getConfig){
        return {...config, height: g.height()}
    }
    return g
})
registerRenderer( {type: "categoryId", id: 109, configs: "export"}, function renderFunc(primitive, options = {}){
    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, width: 612, itemSize: 280, padding: [10,10,10,10], ...options}


    let calloutColor = "#1C258C"
    let secondaryColor = "#F5F5F5"

    primitive= options.list[0]

    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 

    let innerPadding = [5,5,5,5]
    let minorWidth = 156
    let minHeight = 0

    let majorSpacing = [12,12]
    let majorPadding = [2,2,2,2]
    let minorSpacing = [8,8]
    let minorPadding = [16,2,16,2]

    const id = parseInt(options.exportOptions?.section ?? "0")
    let layout = options.exportOptions?.layout ?? "bullets_on_left_full"
    let bulletColor = "black"
    innerPadding = [32, 60, 20, 60]



    if( layout === "bullets_on_left_full"){
        minHeight = 525
        layout = "bullets_on_left"
    }else if( layout === "bullets_above_full"){
        minHeight = 525
        layout = "bullets_above"
    }

    if( layout === "bullets_on_left"){
        bulletColor = "white"
    }else if( layout === "bullets_on_right"){
        bulletColor = "white"
        minorWidth = 216
        innerPadding = [32, 0, 20, 60]
    }else if( layout === "plain" || layout === "text_table"){
        minorWidth = undefined

    }else if( layout === "bullets_above"){
        minorWidth = undefined
        majorSpacing = [12,170]
    }
    
    const g = new Konva.Group({
        x: ox,
        y: oy,
        width: config.width,
        height: config.height,
        onClick: options.onClick,
        name:"inf_track primitive"
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        fill:"white",
        shadowColor: 'black',
        name:"background"
    })
    g.add(r)

    
        
        
    let section
    
    if( primitive.referenceParameters?.structured_summary ){
        section = primitive.referenceParameters.structured_summary[id]
    //text = flattenStructuredResponse( struct, struct)
    }
    if( section ){
        const heading = section.heading

        let subsections = section.subsections
        if( subsections?.length === 1 && !subsections[0].content){
            subsections = subsections[0].subsections
        }

        const tables = subsections ? subsections.filter(d=>d.content?.startsWith("|")) : []
        const bullets = subsections ? subsections.filter(d=>d.content?.startsWith("- ")) : []
        const main = subsections ? subsections.filter(d=>!d.content?.startsWith("- ") && !d.content?.startsWith("|")) : [section]
        let bulletGroup 
        let mainGroup 
        let majorWidth = (config.width - innerPadding[1] - innerPadding[3]) - (minorWidth ?? 0) - majorSpacing[1]
        
        const sectionTitle = new CustomText({
                    fontSize: 20,
                    text: heading.toUpperCase(),
                    align:"left",
                    wrap: false,
                    ellipsis: true,
                    lineHeight:1.3,
                    verticalAlign:"top",
                    fontFamily: "Poppins",
                    fill: calloutColor,
                    fontStyle: "bold",
                    x: innerPadding[3],
                    y: innerPadding[0],
                    width: config.width - innerPadding[1] - innerPadding[3],
                    refreshCallback: options.imageCallback
                })

        g.add(sectionTitle)

        let y = innerPadding[0] + sectionTitle.height() + 44
        let targetHeight


        if( layout === "section_grid"){
            const sections = section.subsections.slice(0,4)
            const rows = Math.ceil(sections / 2)
            const sectionHeight = rows === 1 ? 502 : (502 - 18)
            let sectionWidth = 240
            
            sections.forEach((section, idx)=>{
                let sg = new Konva.Group({
                    x: innerPadding[3] + ((idx % 2) * 252),
                    y: y + (Math.floor( idx / 2)  * (sectionWidth + 18)),
                    width: sectionWidth,
                    height: sectionHeight,
                })
                g.add(sg)
                
                let textIndent = 0

                if( sections.length > 2){
                    const r = new Konva.Rect({
                        x: 0,
                        y: 0,
                        width: sectionWidth,
                        height: sectionHeight,
                        fill: secondaryColor
                    })
                    sg.add(r)
                    textIndent = 16
                }
                const subHeader = new CustomText({
                        fontSize: 16,
                        text: (section.heading ?? ""),
                        align:"left",
                        wrap: false,
                        ellipsis: true,
                        lineHeight:1.3,
                        verticalAlign:"top",
                        fontFamily: "Poppins",
                        fontStyle:"bold",
                        withMarkdown: true,
                        fill: bulletColor,
                        x: textIndent,
                        y: textIndent,
                        width: sectionWidth - (textIndent * 2),
                        refreshCallback: options.imageCallback
                    })
                const text = new CustomText({
                        fontSize: 10,
                        text: section.content ?? "",
                        align:"left",
                        wrap: false,
                        ellipsis: true,
                        lineHeight:1.6,
                        verticalAlign:"top",
                        fontFamily: "Poppins",
                        withMarkdown: true,
                        fill: bulletColor,
                        x: textIndent,
                        y: textIndent + subHeader.height() + 12,
                        width: sectionWidth - (textIndent * 2),
                        refreshCallback: options.imageCallback
                    })
                    sg.add(subHeader)
                    sg.add(text)


            })
        }else{

            const bulletText = new CustomText({
                        fontSize: 10,
                        text: bullets.map(d=>d.content).join("\n"),
                        align:"left",
                        wrap: false,
                        ellipsis: true,
                        lineHeight:1.3,
                        verticalAlign:"top",
                        fontFamily: "Poppins",
                        withMarkdown: true,
                        fill: bulletColor,
                        x: minorPadding[1],
                        y: minorPadding[0],
                        width: (minorWidth ?? majorWidth)  - minorPadding[1] - minorPadding[3],
                        refreshCallback: options.imageCallback
                    })

            const mainText = new CustomText({
                        fontSize: 10,
                        text: main.map(d=>d.content).join("\n"),
                        align:"left",
                        wrap: false,
                        ellipsis: true,
                        verticalAlign:"top",
                        fontFamily: "Poppins",
                        withMarkdown: true,
                        lineHeight: 1.6,
                        fill:"black",
                        x: majorPadding[1],
                        y: majorPadding[0],
                        width: majorWidth - minorPadding[1] - minorPadding[3],
                        refreshCallback: options.imageCallback
                    })

            
            if( layout === "bullets_on_left"){
                bulletGroup = new Konva.Group({
                    x: innerPadding[3],
                    y: y,
                    width: minorWidth,
                    height: config.height,
                })
                g.add(bulletGroup)
                const br = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: minorWidth,
                    height: config.height,
                    fill:calloutColor,
                    name:"background_rect"
                })
                bulletGroup.add(br)

                mainGroup = new Konva.Group({
                    x: innerPadding[3] + minorWidth + majorSpacing[1],
                    y: y,
                    width: majorWidth,
                    height: config.height,
                })
                g.add(mainGroup)


                targetHeight = Math.max(minHeight, mainText.height(), bulletText.height()  )
                mainGroup.height(targetHeight)
                bulletGroup.height(targetHeight)
                br.height(targetHeight)
                r.height(targetHeight + bulletGroup.y()+ innerPadding[2])
                g.height(targetHeight+ bulletGroup.y()+ innerPadding[2])

            }else if( layout === "text_table"){
                mainGroup = new Konva.Group({
                    x: innerPadding[3],
                    y: y,
                    width: majorWidth,
                    height: config.height,
                })
                g.add(mainGroup)

                let tableY = mainGroup.y() + mainText.height() + 44

                let tableHeaderText = tables.map(d=>d.heading ?? "").filter(d=>d).join("\n").toUpperCase()
                if( tableHeaderText){

                    let tableHeader  = new CustomText({
                        fontSize: 10,
                        text: tableHeaderText,
                        align:"left",
                        wrap: false,
                        ellipsis: true,
                        verticalAlign:"top",
                        fontFamily: "Poppins",
                        fontStyle:"bold",
                        withMarkdown: true,
                        lineHeight: 1.6,
                        fill:"black",
                        x: innerPadding[3],
                        y: tableY,
                        width: majorWidth - minorPadding[1] - minorPadding[3],
                        refreshCallback: options.imageCallback
                    })
                    g.add(tableHeader)
                    tableY += tableHeader.height() + 8
                }

                for(const d of tables){
                    const table = convertMarkupToTable( d.content, {
                        cellPadding: [7,6,7,0],
                        columnLines: false,
                        width: majorWidth, 
                        refreshCallback: options.imageCallback
                    } )
                    if( table ){
                        table.x(innerPadding[3])
                        table.y(tableY)

                        g.add(table)
                        tableY += table.height() + 12
                    }
                }


                targetHeight = Math.max(minHeight, mainText.height() )
                mainGroup.height(targetHeight)

                let overallHeight = tableY

                r.height( overallHeight + innerPadding[2])
                g.height( overallHeight + innerPadding[2])
            }else if( layout === "plain"){
                mainGroup = new Konva.Group({
                    x: innerPadding[3],
                    y: y,
                    width: majorWidth,
                    height: config.height,
                })
                g.add(mainGroup)

                targetHeight = Math.max(minHeight, mainText.height() )
                mainGroup.height(targetHeight)
                r.height(targetHeight + mainGroup.y()+ innerPadding[2])
                g.height(targetHeight + mainGroup.y()+ innerPadding[2])
            }else if( layout === "bullets_on_right"){
                bulletGroup = new Konva.Group({
                    x: innerPadding[3] + majorWidth + majorSpacing[1],
                    y: y,
                    width: minorWidth,
                    height: config.height,
                })
                g.add(bulletGroup)
                const br = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: minorWidth,
                    height: config.height,
                    fill:calloutColor,
                    name:"background_rect"
                })
                bulletGroup.add(br)

                mainGroup = new Konva.Group({
                    x: innerPadding[3],
                    y: y,
                    width: majorWidth,
                    height: config.height,
                })
                g.add(mainGroup)


                targetHeight = Math.max(minHeight, mainText.height(), bulletText.height()  )
                mainGroup.height(targetHeight)
                bulletGroup.height(targetHeight)
                br.height(targetHeight)
                r.height(targetHeight + bulletGroup.y()+ innerPadding[2])
                g.height(targetHeight+ bulletGroup.y()+ innerPadding[2])

            }else if( layout === "bullets_image_full"){
                let br
                let offsetForBullet = 0
                if( bullets.length > 0){
                    offsetForBullet = minorWidth + majorSpacing[1]
                    bulletGroup = new Konva.Group({
                        x: innerPadding[3],
                        y: y,
                        width: minorWidth,
                        height: config.height,
                    })
                    g.add(bulletGroup)
                    br = new Konva.Rect({
                        x: 0,
                        y: 0,
                        width: minorWidth,
                        height: config.height,
                        fill:secondaryColor,
                        name:"background_rect"
                    })
                    bulletGroup.add(br)
                }else{
                    majorWidth = (config.width - innerPadding[1] - innerPadding[3])
                    mainText.width(majorWidth)
                }

                mainGroup = new Konva.Group({
                    x: innerPadding[3] + offsetForBullet,
                    y: y,
                    width: majorWidth ,
                    height: config.height,
                })
                g.add(mainGroup)

                
                let totalHeight = 647
                targetHeight = Math.max(minHeight, mainText.height(), bulletText.height()  )
                let imagePos =  Math.max( 329, mainGroup.y() + targetHeight + 27)
                let imageHeight = totalHeight - imagePos - 19 - 15

                const placeHolderBg = new Konva.Rect({
                    x: 0,
                    y: imagePos + 60,
                    width: config.width,
                    height: totalHeight - (imagePos + 60),
                    fill: calloutColor
                })
                g.add( placeHolderBg )
                const placeHolder = new Konva.Rect({
                    x: innerPadding[3],
                    y: imagePos,
                    width: config.width - innerPadding[3] - innerPadding[1],
                    height: imageHeight,
                    fill: "#dadada"
                })
                g.add( placeHolder )

                const captionText = new CustomText({
                        fontSize: 8,
                        text: "CAPTION FOR IMAGE",
                        align:"left",
                        wrap: false,
                        ellipsis: true,
                        verticalAlign:"top",
                        fontFamily: "Poppins",
                        withMarkdown: true,
                        lineHeight: 1.6,
                        fill: "white",
                        x: innerPadding[3],
                        y: imagePos + imageHeight + 4,
                        width: config.width - innerPadding[3] - innerPadding[1],
                        refreshCallback: options.imageCallback
                    })
                g.add(captionText)


                mainGroup.height(targetHeight)
                if( br ){
                    bulletGroup.height(targetHeight)
                    br.height(targetHeight)
                }
                r.height( totalHeight )
                g.height( totalHeight )
            }else {
                minorWidth = majorWidth
                
                bulletGroup = new Konva.Group({
                    x: innerPadding[3] + majorSpacing[1],
                    y: y,
                    width: minorWidth,
                    height: config.height,
                })
                g.add(bulletGroup)
                const br = new Konva.Rect({
                    x: 0,
                    y: 0,
                    width: minorWidth ,
                    height: bulletText.height() + minorPadding[0] + minorPadding[2],
                    fill: secondaryColor,
                    name:"background_rect"
                })
                bulletText.fontStyle("500")
                bulletGroup.add(br)
                bulletGroup.height(br.height())

                mainGroup = new Konva.Group({
                    x: innerPadding[3] + majorSpacing[1],
                    y: y + br.height() + 24,
                    width: majorWidth,
                    height: config.height,
                })
                g.add(mainGroup)
                targetHeight = Math.max(minHeight , (mainText.height() + mainGroup.y())  ) + innerPadding[2]
                r.height(targetHeight)
                g.height(targetHeight)
            }
            if( bulletGroup && bulletText ){
                bulletGroup.add(bulletText)
            }
            if( mainGroup && mainText ){
                mainGroup.add(mainText)
            }
        }
    }
    
    
    g.height(r.height())
    
    if( options.getConfig ){
        return {...config, height: g.height()}
    }


    return g
})
registerRenderer( {type: "default", configs: "set_export"}, (primitive, options = {})=>{
    return RenderPrimitiveAsKonva(options.list[0], {...options, exportOptions: primitive.renderConfig})
})


function convertMarkupToTable( markup, options = {} ){
    let config = {width: 612, fontSize: 12, cellPadding: [4,4,4,4], rowLines: true, columnLines: true, borderColor: '#D4D4D4', textColor: 'black',...options}
    if( typeof(markup) !== "string"){
        return
    }
    const textRows = markup.trim().split("\n")
    if( textRows.length > 0){
        let firstRow = textRows[0]
        if( firstRow[0] === "|" && firstRow[firstRow.length - 1] === "|"){
            
            let rows = textRows.map(d=>d.slice(1, d.length - 1).split("|"))//.map(d=>d.trim()))
            const columns = rows[0]
            let columnWidths = options.columnWidths ?? []
            const definedWidth = columnWidths.reduce((a,c)=>a + (c ?? 0), 0)
            const calcCols = columns.length - columnWidths.filter(d=>d !== undefined).length
            const calcWidth = (config.width - definedWidth) / calcCols
            columnWidths = columns.map((_,i)=>columnWidths[i] == undefined ? calcWidth : columnWidths[i] )

            let g = new Konva.Group({
                x: options.x ?? 0,
                y: options.y ?? 0,
                name: "table"
            })
            let x = 0, y = 0, rIdx = 0

            let headerRows = 0
            rows = rows.filter((d,i)=>{
                const isHeaderSeparator = d.every((col) => /^-+$/.test(col));
                if( isHeaderSeparator ){
                    headerRows = i
                    return false
                }
                return true
            })

            let rowHeight = 0
            let toUpdate = []
            function updateRowHeight(){
                for(const d of toUpdate){
                    d.header( rowHeight)
                }
            }

            for(const row of rows){
                rowHeight = 0
                for(let cIdx = 0; cIdx < columns.length; cIdx++){
                    let gc = new Konva.Group({
                        name: "cell",
                        id: `${cIdx}-${rIdx}`,
                        x,
                        y
                    })
                    let cellText = row[cIdx] ?? ""
                    let align = ((cellText[0] === " ") && (cellText.match(/^\s-?\$?\d+(\.\d+)?[KMB]?$/))) ? "right" : "left"
                    const t = new CustomText({
                        fontSize: 8,
                        text: cellText.trim(),
                        align: align,
                        wrap: true,
                        fontStyle: rIdx < headerRows ? "bold" : undefined,
                        verticalAlign:"top",
                        fontFamily: "Poppins",
                        withMarkdown: false,//rIdx >= headerRows,
                        lineHeight: 1.6,
                        fill: config.textColor,
                        x: config.cellPadding[3],
                        y: config.cellPadding[0],
                        width: columnWidths[cIdx] - config.cellPadding[3] - config.cellPadding[1],
                        refreshCallback: options.refreshCallback
                    })
                    gc.add(t)
                    rowHeight = Math.max(rowHeight, t.height())

                    g.add(gc)
                    x += columnWidths[cIdx]
                }
                updateRowHeight()
                x = 0
                y += rowHeight + config.cellPadding[0] + config.cellPadding[2]
                toUpdate = []
                rowHeight = 0
                rIdx++
                if( config.rowLines ){
                    g.add( new Konva.Line({
                        points:[0,y,config.width,y],
                        strokeWidth: rIdx === headerRows ? 2 : 1,
                        stroke: rIdx === headerRows ? config.textColor : config.borderColor
                    }))

                }
            }
            if( config.columnLines ){
                let x =0
                for(let cIdx = 0; cIdx < (columns.length - 1); cIdx++){
                    x += columnWidths[cIdx]
                    g.add( new Konva.Line({
                        points:[x,0,x,y],
                        strokeWidth: 1,
                        stroke: config.borderColor
                    }))
                }
            }
            g.width(config.width)
            g.height(y)


            return g
        }
    }
}

export function renderIndicators(indicatorList, options){
    const indicatorWidth = 20
    
    const padding = 2
    const offsetX = 4
    const fullWidth = indicatorWidth + padding + padding
    const height = indicatorList.length * fullWidth

    const g = new Konva.Group({
        x: (options.x ?? fullWidth),
        y: options.y ?? 0,
        width: fullWidth + offsetX,
        height: height,
        name:"indicators"
    })
    const r = new Konva.Rect({
        x: offsetX,
        y: 0,
        width: fullWidth,
        height: height,
        fill: '#fcfcfc',
        stroke: '#b8b8b8',
        strokeWidth: 0.5,
            strokeScaleEnabled: false,
        cornerRadius: 10
    })
    g.add(r)
    let y = 2
    for(const indicator of indicatorList){
        if( indicator.icon){
            renderReactSVGIcon( <HeroIcon icon={indicator.icon}/>, 
                {
                    target: g,
                    props: {fill: indicator.color},
                    x:padding + offsetX, 
                    y:padding,
                    width: indicatorWidth,
                    height: indicatorWidth,
                    center: true,
                    imageCallback: options.imageCallback
                }
            )
        }
        y += fullWidth
    }
    return g
}

function renderFormattedSections( text, g, fullOptions = {} ){
    let {width, height, fontFamily, ...options} = fullOptions
    let didOverflow = false
    let y = 0, idx = 0
    const padding = options.padding ?? [0,0,0,0]
    g.name("inf_track primitive")
    const columns = options.columns ?? 1
    const itemPadding = (options.fontSize ?? 16) * 0.5
    const textWidth = (width - padding[3] - padding[1] - (itemPadding * columns - 1) ) / columns
    let cIdx = 0
    let yPos = new Array(columns).fill(0)
    for(const block of text ){
        y = yPos[cIdx]
        const itemsForBlock = []
        if( y < height ){
            for(const section of block){
                const thisText = flattenStructuredResponse([section], [section])
                const lineHeight = options.lineHeight ?? 1.2
                const fontSize = section.fontSize ?? options.fontSize ?? 16
                const fontStyle = section.fontStyle ?? options.fontStyle
                if( idx > 0 ){
                    const incr = fontSize * lineHeight * (section.sectionStart ? 0.5 : 1) * (section.largeSpacing ? 1.5 : 0.5)
                    y += incr
                }
                const t = new CustomText({
                    x: padding[3] + (cIdx * (itemPadding + textWidth)),
                    y: padding[1] + y,
                    width: textWidth,
                    lineHeight,
                    text: thisText,
                    withMarkdown: true,
                    fontFamily: section.fontFamily ?? fontFamily,
                    fontStyle,
                    fontSize,
                    refreshCallback: options.imageCallback
                })
                g.add(t)
                itemsForBlock.push(t)
                y += t.height() 
                if( y > height ){
                    didOverflow = true
                    if( cIdx === 0){
                        const delta = height - t.y()
                        t.height(delta)
                    }else{
                        itemsForBlock.forEach(d=>d.destroy())
                    }
                    break
                }
                idx++
            }
        }
        yPos[cIdx] = y + itemPadding
        cIdx ++
        if( cIdx === columns){
            if( options.alignRows ){
                const maxInRow = Math.max(...yPos)
                yPos.fill(maxInRow)
                
            }
            cIdx = 0
        }
    }
    return {didOverflow}
}


export function renderDatatable({id, primitive, data, stageOptions, renderOptions, viewConfig, ...options}){
    const { 
        width = 128, 
    } = { 
        ...renderOptions 
    };
    const {
        x = 0,
        y = 0,
        imageCallback
    } = stageOptions

    const theme = options.theme ?? renderOptions.theme ?? defaultTheme;
    options.theme = theme;

    if( renderOptions.widgetConfig && primitive){
        const g = new Konva.Group({
            name: "view",
            x:options.x ?? 0,
            y:options.y ?? 0
        })

        let w, h
        const widget = RenderPrimitiveAsKonva( primitive, {config: "widget", data: renderOptions.widgetConfig, imageCallback: options.imageCallback, theme: renderOptions.theme ?? options.theme})
        widget.name(widget.name() + " item_info")
        g.add( widget )
        w = widget.width()
        h = widget.height()

        if( renderOptions.widgetConfig.showItems ){

            const padding = options.x ? [0,0,0,0] : [10,10,10,10]
            
            const content = renderDatatable({id, data, stageOptions, renderOptions, viewConfig, ...options})
            if( content ){

                const contentScale = Math.min(1, w / content.width() )
                if( content.width() < w){
                    content.x( Math.min(padding[3], (w - content.width()) / 2))
                }
                content.scale({x:contentScale, y:contentScale})
                content.y( h + padding[0])
                g.add(content)
                
                h = h + (content.height() * contentScale) + padding[0] + padding[2]
            }
        }

        g.width( w  )
        g.height( h )
        
        return g
    }

    const g = new Konva.Group({
        id: id,
        x,
        y,
        width,
        name:"view"
    })

    let showColumnheaders =  (renderOptions.show_column_headers !== false ) && (data.columns.length > 1)
    let showRowheaders =  (renderOptions.show_row_headers !== false ) && (data.rows.length > 1)

    const columns = data.columns.slice(0, renderOptions.max_cols ?? 200)
    const rows = data.rows.slice(0, renderOptions.max_rows ?? 200)

    let rowHeights = rows.map(d=>0)
    let columnWidths = columns.map(d=>0)

    let config = viewConfig?.matrixType ?? "grid"

    let renderer = typeMaps[ "default" ][`datatable_${config}`]

    const maxColIdx = columns.length - 1
    const maxRowIdx = rows.length - 1

    let showSingleLegend = !(typeof(renderOptions.show_legend) === "string" && renderOptions.show_legend.startsWith("each-"))
    const legendPosition = !renderOptions.show_legend ? false : typeof(renderOptions.show_legend) === "string" && renderOptions.show_legend.includes("right") ? "right" : "below"


    let {show_legend, ...relayConfig} = renderOptions
    if(data.cells.length === 1 ){
        relayConfig = renderOptions
        showSingleLegend = false
    }
    relayConfig.show_legend = showSingleLegend ? false : legendPosition

    let configName = viewConfig?.renderType ?? "grid" 
    const commonOptions = {
        stageOptions, 
        renderOptions: relayConfig, 
        expand: options.expand,
        config: configName, 
        maxHeight: renderOptions.height,
        sectionConfig: primitive?.getConfig.sections
    }

    let configForCells = data.cells.reduce((a,cell)=>{
        if( cell.cIdx > maxColIdx || cell.rId > maxRowIdx){
            return a
        }
        const cellConfig = renderer({
            id: cell.id, 
            ...commonOptions,
            table:data, 
            getConfig: true, 
            cell
        })
        a[cell.id] = cellConfig
        if( cellConfig.height > rowHeights[cell.rIdx]){
            rowHeights[cell.rIdx] = cellConfig.height
        }
        if( cellConfig.width > columnWidths[cell.cIdx]){
            columnWidths[cell.cIdx] = cellConfig.width
        }
        return a
    },{})
    let maxDim = Math.max(...columnWidths, ...rowHeights)
    const spacing = 10//Math.round( maxDim * 0.05)

    const columnX = columnWidths.reduce((acc, w, i) => (acc.push(i ? acc[i - 1] + columnWidths[i - 1] + spacing : 0), acc), []);
    const rowY = rowHeights.reduce((acc, w, i) => (acc.push(i ? acc[i - 1] + rowHeights[i - 1] + spacing : 0), acc), []);


    const headers = prepareHeaders({columns: showColumnheaders ? columns : [], rows: showRowheaders ? rows : [], columnWidths, rowHeights, columnX, rowY, spacing, renderOptions, refreshCallback: imageCallback})
    let footers
    if( (data.totals.columns && renderOptions.show_column_totals) || (data.totals.rows  && renderOptions.show_row_totals)){
        footers = prepareHeaders({
            columns: data.totals.columns && data.totals.columns.order.map(d=>({label: d})),
            rows: data.totals.rows && data.totals.rows.order.map(d=>({label: d})),
            background: false,
            fontSize: headers.fontSize,
            includeColumns: renderOptions.show_column_totals,
            includeRows: renderOptions.show_row_totals,
            renderOptions,
            columnWidths, rowHeights, columnX, rowY, spacing, refreshCallback: imageCallback
        })
    }


    let maxX = 50, maxY = 50

    let ox = 0, oy = 0
    if( headers.columns ){
        g.add( headers.columns)
        oy += headers.columns.height() + spacing
    }
    if( headers.rows ){
        g.add( headers.rows)
        ox += headers.rows.width() + spacing
    }

    let legendInfo
    let legendDeltaX, legendDeltaY

    const subColumnTracker = new Array(maxColIdx + 1).fill(undefined)

    for(const cell of data.cells){
        if( cell.cIdx > maxColIdx || cell.rIdx > maxRowIdx){
            continue
        }
        const x = ox + columnX[cell.cIdx]
        const y =  oy + rowY[cell.rIdx]
        const width = columnWidths[cell.cIdx]
        const height = rowHeights[cell.rIdx]
        const rendered = renderer({
            id: cell.id,
            x, 
            y, 
            table: data, 
            ...commonOptions,
            renderOptions: {...relayConfig, colorMap: legendInfo?.colorMap},
            cell})

        if( !legendInfo){
            const thisLegend = rendered.find(d=>d.attrs.legendInfo)?.[0]?.attrs?.legendInfo
            if( thisLegend ){
                legendInfo = thisLegend
                legendInfo.colorMap = thisLegend.data.reduce((a,d)=>{a[d.label]=thisLegend.colors[d.idx];return a},{})
            }
        }
        if( x + width > maxX){ maxX = x + width}
        if( y + height > maxY){ maxY = y + height}
        g.add(rendered)
        if( rendered.attrs.resizeInfo ){
            if( !subColumnTracker[ cell.cIdx ] || rendered.attrs.resizeInfo.columns > subColumnTracker[ cell.cIdx ].columns ){
                subColumnTracker[ cell.cIdx ] = rendered.attrs.resizeInfo
            }
        }
    }
    if( footers?.columns){
        footers?.columns.y(maxY)
        if( headers?.columns){
            footers.columns.x( headers.columns.x() )
        }
        maxY += footers?.columns.height()
        g.add( footers.columns)

    }
    if( footers?.rows){
        footers?.rows.x(maxX)
        if( headers?.rows){
            footers.rows.y( headers.rows.y() )
        }
        maxX += footers?.rows.width()
        g.add( footers.rows)
    }
    if( legendPosition && showSingleLegend && legendInfo?.data){
        const showOnRight = legendPosition === "right"
        const legendFontSize = renderOptions.legend_size ? renderOptions.legend_size : 12
        const legend = renderLegend( legendInfo.data,{
                            ...options,
                            fontSize: legendFontSize,
                            x: showOnRight ? (maxX + (legendFontSize * 1.5)) : 0,
                            y: showOnRight ? 0 : maxY,
                            horizontalLegend: !showOnRight,
                            width: showOnRight ? 200 : maxX,
                            height: showOnRight ? maxY : 300,
                            colors: legendInfo?.colors
        })
        legend.name("inf_track row_header")
        g.add( legend)
        if( showOnRight ){
            const ox = maxX
            maxX = legend.x() + legend.width()
            legend.y( (maxY - legend.height()) / 2)
            legendDeltaX = maxX - ox
        }else{
            const oy = maxY
            legend.x( (maxX - legend.width()) /2 )
            legend.y( maxY + legendFontSize * 1.5)
            maxY = legend.y() + legend.height()
            legendDeltaY = maxY - oy
        }

    }
    g.width(maxX)
    g.height(maxY)
    if( options.getConfig ){
        return {
            width: maxX,
            height: maxY
        }
    }

    const subColumns = subColumnTracker.reduce((a,c)=>a + (c?.columns ?? 0), 0)
    const widthPadding = (maxColIdx  * spacing) + subColumnTracker.reduce((a,c)=>a + (c?.widthPadding ?? 0), 0)

    g.attrs.resizeInfo = {
        //spacing: [spacing, spacing],
        columns: subColumns, //columns.length,
        rows: rows.length,
        widthPadding
    }

    return g
}
function prepareAxisText(header, {maxWidth, maxHeight, textPadding, fontSize, refreshCallback, longestPair, minFontSize = 6}){
    const d = header.label ?? header ?? ""
    let longestFrag
    const words = `${d}`.split(" ")
    if( longestPair && words.length > 5){
        const coupleLength = [words, words.map((d,i,a)=> i > 0 ? a[i-1] + " " + d : undefined ).filter(d=>d)].flat()
        longestFrag = coupleLength.reduce((a,c)=>c.length > a.length ? c : a, "" )
    }else{
        longestFrag = words.reduce((a,c)=>a.length > c.length ? a : c, 0)
    }

    
    const text = new CustomText({
        fontSize,
        text: longestFrag,
        align:"center",
        wrap: true,
        verticalAlign:"middle",
        bgFill:"#f3f4f6",
        x: textPadding[3],
        y: textPadding[0],
        withMarkdown: true,
        width: maxWidth ?? "auto",
        height: "auto",
        refreshCallback
    })
    let rescaled = false
    
    if( maxWidth ){
        while( text.measureSize(longestFrag).width > maxWidth && fontSize > minFontSize){
            fontSize = fontSize > 50 ? fontSize -= (fontSize * 0.1) : fontSize - 0.25
            text.fontSize( fontSize )
            rescaled = true
        } 
    }
    text.text( d )  
    if( maxHeight ){
        while( text.height() > maxHeight && fontSize > minFontSize){
            fontSize = fontSize > 50 ? fontSize -= (fontSize * 0.1) : fontSize - 0.25
            text.fontSize( fontSize )
            rescaled = true
        } 
    }
    
    return {rendered: text, fontSize, rescaled}
}
function prepareHeaders({columns, rows, columnWidths, rowHeights, columnX, rowY, renderOptions, baseFontSize = 12, spacing, textPadding = [5,5,5,5], refreshCallback, includeColumns = true, includeRows = true, background = true,...options}){
    const maxColumnWidth = Math.max(...columnWidths)
    const maxRowHeight = Math.max(...rowHeights)
    let maxFont =  Math.max(6, maxRowHeight / 4)
    let headerScale = Math.max(1, Math.max(maxColumnWidth / 200 , maxRowHeight / 45 ))
    let headerFontSize = options.fontSize ?? Math.min(baseFontSize * headerScale, maxFont, baseFontSize * 10)
    const padding = textPadding.map(d=>d / baseFontSize * headerFontSize)

    let columnLabelAsText = true
    let rowLabelAsText = true

    if( columns.length === 0 || (columns.length === 1 && !columns[0].label)  ){includeColumns = false}
    if( rows.length === 0 || (rows.length === 1 && !rows[0].label)){includeRows = false}
    const renderedColumns = includeColumns && new Konva.Group({x: 0, y: 0})
    const renderedRows = includeRows && new Konva.Group({x: 0, y: 0})

    let needColumnFontRescale = false
    let needRowFontRescale = false
    
    const idealWidth = Math.min(200, ...columnWidths)

    const columnContent = includeColumns ? columns.map((d,i)=>{
        if( renderOptions?.columnAsCompany){
            columnLabelAsText = false
            const iconSize = idealWidth
            const logo = imageHelper( "/api/companyLogo?name=" + d.label, {
                x: (columnWidths[i] - (iconSize * 0.8)) /2,
                y: 0,
                size: iconSize * 0.8,
                imageCallback: refreshCallback
            }) 
            return logo

        }
        if( d.imageUrl ){
            columnLabelAsText = false
            const iconSize = idealWidth
            const logo = imageHelper( "/api/remoteImage?url=" + d.imageUrl, {
                x: (columnWidths[i] - (iconSize * 0.8)) /2,
                y: 0,
                size: iconSize * 0.8,
                imageCallback: refreshCallback
            }) 
            return logo
        }else{
            const r = prepareAxisText( d, {
                fontSize: headerFontSize, 
                maxWidth: columnWidths[i]  - padding[1] - padding[3],
                textPadding: padding,
                refreshCallback
            } )
            if( r.fontSize !== headerFontSize){
                headerFontSize = r.fontSize
                needColumnFontRescale = true
            }
            return r.rendered
        }
    }) : []
    const rowContent = includeRows ? rows.map((d,i)=>{
        const r = prepareAxisText( d, {
            fontSize: headerFontSize, 
            longestPair: true,
            maxWidth: idealWidth - padding[1] - padding[3],
            maxHeight: rowHeights[i],
            textPadding: padding,
            refreshCallback
        } )
        if( r.fontSize !== headerFontSize){
            headerFontSize = r.fontSize
            needRowFontRescale = true
        }
        return r.rendered
    }) : []
    if( needColumnFontRescale ){
        columnContent.forEach(d=>d.fontSize(headerFontSize))
    }
    if( needRowFontRescale ){
        rowContent.forEach(d=>d.fontSize(headerFontSize))
    }

    const maxColumnContentHeight = columnContent.reduce((a,d)=>{const h = d.height(); return h > a ? h : a}, 0)
    const height = maxColumnContentHeight + padding[0] + padding[2]
    if( includeColumns ){

        columnContent.forEach((d,i)=>{
            const h = new Konva.Group({
                id: `column_${i}`,
                name: "inf_track column_header",
                x: columnX[i], y: 0,
                width: columnWidths[i],
                height
            })
            if( columnLabelAsText && background ){
                const r = new Konva.Rect({
                    x: 0, y: 0,
                    width: columnWidths[i],
                    height,
                    fill:'#f3f4f6'
                })
                h.add(r)
            }
            d.y( (height - d.height()) / 2)
            h.add(d)
            renderedColumns.add(h)
        })
        renderedColumns.width(columnX.at(-1) + columnWidths.at(-1))
        renderedColumns.height(height)

        if( renderedRows ){
            renderedRows.y(height + spacing)
        }
    }

    if( includeRows){

        rowContent.forEach((d,i)=>{
            const h = new Konva.Group({
                id: `row_${i}`,
                name: "inf_track row_header",
                x: 0, y: rowY[i],
                width: idealWidth,
                height: rowHeights[i]
            })
            if( background ){
                const r = new Konva.Rect({
                    x: 0, y: 0,
                    width: idealWidth,
                    height: rowHeights[i],
                    fill:'#f3f4f6'
                })
                h.add(r)
            }
            d.y( (rowHeights[i] - d.height()) / 2)
            h.add(d)
            renderedRows.add(h)
        })
        if( renderedColumns ){
            renderedColumns.x(idealWidth + spacing)
        }
        renderedRows.width(idealWidth)
        renderedRows.height(rowY.at(-1) + rowHeights.at(-1))
    }

    return {columns: renderedColumns, rows: renderedRows, fontSize: headerFontSize}
}
