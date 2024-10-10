import Konva from "konva";
import { Util } from 'konva/lib/Util'
import CustomImage  from "./CustomImage";
import CustomText from "./CustomText";
import PrimitiveConfig from "./PrimitiveConfig";
import CollectionUtils from "./CollectionHelper";
import moment from "moment";
import MainStore from "./MainStore";
import { renderToString } from "react-dom/server";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
const typeMaps = {}
const categoryMaps = {}

export const heatMapPalette = PrimitiveConfig.heatMapPalette

export const categoryColors = [ "#4e79a7",
                                "#f28e2c",
                                "#e15759",
                                "#76b7b2",
                                "#59a14f",
                                "#edc949",
                                "#af7aa1",
                                "#ff9da7",
                                "#9c755f",
                                "#bab0ab"]

export function roundCurrency(number){
    if(number === 0){
        return "$0"
    }
    if( isNaN(number)){
        return "-"
    }
    const suffixes = ["", "K", "M","B","T"];
    const suffixIndex = Math.floor(Math.log10(Math.abs(number)) / 3);

    const scaledNumber = number / Math.pow(10, suffixIndex * 3);
    const formattedNumber = scaledNumber.toFixed( suffixIndex > 1 ? 0 : 2);

    return "$" + formattedNumber.replace(/\.00$/, '') + (suffixes[suffixIndex] ?? "");
}

function registerRenderer( mappings, callback){
    for(const d of [mappings].flat()){
        let obj = typeMaps
        if( d.type === "categoryId" ){
            obj = categoryMaps
        }
        const id = d.id ?? "default"
        const configs = d.configs ?? ["default"]
        if( !obj[id]){
            obj[id] = {}
        }
        for( const c of [configs].flat()){
            if( obj[ id ]?.[c] ){
                console.log(`Overwriting renderer for ${id} / ${c}`)
            }
            obj[ id ][c] = callback
        }
    }

}

export function RenderSetAsKonva( primitive, list, options = {} ){
    if( !list ){
        return
    }
    let config = "set_" + (options.config || "default")
    let source =  list?.[0]
    let referenceId =  options.referenceId ?? source?.referenceId
    let renderer = categoryMaps[referenceId]?.[config] ?? typeMaps[ source?.type ]?.[config]
    if( !renderer ){
        renderer = typeMaps[ "default" ]?.[config]
    }

    if( !renderer ){
        console.warn(`Cant find renderer for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${config}`)
        return
    }
    return renderer(primitive, {list:list, ...options, config: options.config} )
}
export function RenderPrimitiveAsKonva( primitive, options = {} ){
    if( !primitive){
        return
    }
    let config = options.config || "default"
    let renderer = categoryMaps[primitive.referenceId]?.[config] ?? typeMaps[ primitive.type ]?.[config]
    if( !renderer ){
        renderer = typeMaps[ "default" ]?.[config]
    }
    if( !renderer ){
        console.warn(`Cant find renderer for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${config}`)
        return
    }
    return renderer(primitive, options)

}
registerRenderer( {type: "default", configs: "set_TEMP_dials"}, (primitive, options = {})=>{
    const config = {width: 60, height: 45, padding: [2,2,2,2], ...(options.renderConfig ?? {})}
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

        const colorscheme = primitive.renderConfig?.colors ?? "green"
        const colors = {
            green: [undefined, "#bbf7d0", "#86efac", "#4ade80"],
            blue: [undefined, "#bfdbfe", "#93c5fd", "#3b82f6"],
        }[colorscheme]


        if( items.length > 0 ){
            let showTitle = true
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
                        bgFill:"#f3f4f6",
                        x: 0,
                        y: config.height - 9,
                        width: config.width,
                        height: 12,
                        refreshCallback: options.imageCallback
                    })
                    g.add(text)
                }
                const ay = config.padding[0] + h - (showTitle ? 10 : 0)
                if( score < 3){
                    var arc1 = new Konva.Arc({
                        x: config.padding[3] + (w/ 2),
                        y: ay,
                        innerRadius: w * 0.15,
                        outerRadius: w * 0.4,
                        angle: 180,
                        rotation: 180,
                        fill: '#eee',
                        stroke: '#ccc',
                        strokeWidth: 0.5,
                    });
                  g.add(arc1)
                }
                    var arc = new Konva.Arc({
                        x: config.padding[3] + (w/ 2),
                        y: ay,
                        innerRadius: w * 0.15,
                        outerRadius: w * 0.4,
                        angle: 60 * score,
                        rotation: 180,
                        fill: colors[score],
                        stroke: '#ccc',
                        strokeWidth: 0.5,
                    });
                  g.add(arc)
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
registerRenderer( {type: "default", configs: "set_dials"}, (primitive, options = {})=>{
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
            fill: '#f9fafb',
            name: "background"
        })
        g.add(r)

        const colorscheme = primitive.renderConfig?.colors ?? "green"
        const colors = {
            green: [undefined, "#bbf7d0", "#86efac", "#4ade80"],
            blue: [undefined, "#bfdbfe", "#93c5fd", "#3b82f6"],
        }[colorscheme]


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
                        bgFill:"#f3f4f6",
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
                        fill: '#eee',
                        stroke: '#ccc',
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
registerRenderer( {type: "default", configs: "set_checktable"}, (primitive, options = {})=>{
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
})
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
        
        //const field = primitive.renderConfig?.field ?? "funding"
        //const values = options.list.map(d=>d.referenceParameters?.[field] ?? 0)

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
registerRenderer( {type: "default", configs: "set_timeseries"}, (primitive, options = {})=>{
    const config = {width: 128, height: 80, padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }
    const alignScale = primitive.renderConfig?.align_scale
    const doBoth = alignScale === "both"
    if( doBoth && options.getConfig){
        if( !options.renderConfig.width){
            options.config = options.config * 2
        }
    }

    const renderWidth = (config.width - config.padding[3] - config.padding[1]) * (doBoth ? 0.45 : 1)
    const renderHeight = config.height - config.padding[0] - config.padding[2]

    if( options.getConfig){
        const years = parseInt(primitive.renderConfig?.range ?? "1") 
        const endDate = primitive.renderConfig?.end ?? new Date()
        const startDate = moment(endDate).subtract(years, "year")
        config.data = CollectionUtils.convertToTimesSeries( 
                                        options.list, 
                                        {
                                            field: primitive.renderConfig?.field,
                                            startDate: startDate,
                                            endDate: endDate,
                                            period: "month"
                                        })
        return config
    }
    const series = options.data

    
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




    let offsetX = 0
    g.add(r)
    function renderPlot(alignScale){
        const maxValue = (alignScale ? (options.globalData?.maximumValue ?? 0) : series.reduce((a,c)=>c > a ? c : a, -Infinity)) + 1
        const minValue = (alignScale ? (options.globalData?.minimumValue ?? 0): series.reduce((a,c)=>c < a ? c : a, Infinity))- 1

        const range = maxValue - minValue
        
        const len = series.length
        const dx = renderWidth / (len - 1)
        const lineMargin = renderHeight * 0.1
        const scale = (renderHeight - lineMargin - lineMargin) / range
        const points = series.map((d,i)=>[offsetX + (i * dx), renderHeight - lineMargin - (scale * (d - minValue))]).flat()
        //const lower = series.map((_,i)=>[(len - 1 - i) * dx, renderHeight - lineMargin - (scale * (series[len - i - 1] - minValue)) + (renderHeight * 0.1)]).flat()
        const lower = series.map((_,i)=>[ offsetX + (len - 1 - i) * dx, renderHeight - lineMargin ]).flat()

        const shaded = [
            ...points,
            ...lower
        ]


        for(const d of points){
            if(isNaN(d)){
                console.log('err')
            }
        }

        const l2 = new Konva.Line({
            points: shaded,
            strokeEnabled: false,
            fillLinearGradientStartPoint: { x: renderWidth / 2, y: 0 },
            fillLinearGradientEndPoint: { x: renderWidth / 2, y: renderHeight },
            fillLinearGradientColorStops: [0, '#e0f2fe', 0.7, 'white'],
            closed: true
        })
        g.add(l2)

        
        const l = new Konva.Line({
            points: points,
            strokeWidth: 1,
            strokeScaleEnabled: false,
            stroke: "#0ea5e9"
        })
        g.add(l)
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
registerRenderer( {type: "default", configs: "set_heatmap"}, (primitive, options = {})=>{
    const config = {width: 128, height: 128, padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }
    let range = options.range
    if(!options.inTable){

        if( primitive.renderConfig?.group_by === "row"){
            range = options.rowRange[options.rIdx]
        }else if( primitive.renderConfig?.group_by === "col"){
            range = options.colRange[options.cIdx]
        }
    }

    const colors = heatMapPalette.find(d=>d.name === (primitive?.renderConfig?.colors ?? "default"))?.colors ?? heatMapPalette[0].colors
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

    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: config.height - config.padding[0] - config.padding[2],
        fill: colors[idx],
        name: "background"
    })
    g.add(r)
    const r2 = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: config.height - config.padding[0] - config.padding[2],
        fill: items.length === 0 ? "white" : colors[idx]
    })
    g.add(r2)
    if( primitive.renderConfig?.counts){
        const t = new Konva.CustomText({
            x: config.padding[3],
            y: (config.height - 20) / 2,
            text: items.length,
            fontSize: 16,
            width: config.width - config.padding[3] - config.padding[1],
            align:'center',
            height:20,
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
})
registerRenderer( {type: "default", configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemSize: 256, columns: 5, spacing: [8,12], itemPadding: [10,12,10,8], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
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

    if( calcWidth > config.width ){
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

    let idx = 0
    let col = 0
    
    let ypos = new Array( config.columns ?? 1).fill(config.padding[0] + config.spacing[0])

    for( let dIdx = 0; dIdx < itemCount; dIdx++){
        const d = items[dIdx]
        let y = ypos[col]
        let node
        let lastNode

        if( d ){
            if( options.cachedNodes ){
                node = options.cachedNodes.children.find(d2=>d2.attrs.id === d.id)
                if( node ){
                    node.remove()
                    node.attrs.placeholder = options.placeholder !== false
                    node.children.forEach(d=>{
                        if(d.className === "CustomImage"|| d.className === "CustomText"){
                            d.attrs.refreshCallback = options.imageCallback
                        }
                        
                    })
                }
            }
            if( !node ){
                node = RenderPrimitiveAsKonva( d, {
                    config: "default", 
                    x: x, 
                    y: y, 
                    onClick: options.primitiveClick,
                    maxHeight: 400,
                    width: fullWidth, 
                    padding: config.itemPadding, 
                    placeholder: options.placeholder !== false,
                    toggles: options.toggles,
                    imageCallback: options.imageCallback
                })
            }
        }else{
            col = config.columns - 1
            x = (config.padding[3] + config.spacing[1]) + ((fullWidth + config.spacing[1]) * col)
            y = ypos[col]

            node = addExtraNode( config, options, x, y, fullWidth)
        }

        if( node ){
            g.add(node)
            ypos[col] += config.spacing[0] + (node.attrs.height ?? 0)
        }
        

        x += fullWidth + config.spacing[1]
        col++
        idx++
        if( idx === config.columns){
            idx = 0
            col = 0
            x = config.padding[3] + config.spacing[1]
        }
        lastNode = node
    }
    
    const height = Math.max(ypos.reduce((a,c)=>c > a ? c : a, 0) + config.padding[0] + config.padding[2], config.minHeight ?? 0)
    config.height = height + config.spacing[0]

    if( options.getConfig){
        config.cachedNodes = g
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
    const config = {showId: true, fontSize: 16, width: 128, padding: [10,10,10,10], ...options}
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
            const textHeight = options.getConfig ? undefined : h - config.padding[0] - config.padding[2] 
            
            const t = new CustomText({
                x: config.padding[3],
                y: config.padding[0],
                fontSize: config.fontSize,
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
            
            t.y( config.padding[0] + (th - t.height())  /2)
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

    if( primitive.plainId === 411195){
        const order = [
            "3-3-1",
            "3-2-1",
            "2-3-1",
            "2-2-1",
            "3-3-2",
            "3-2-2",
            "2-3-2",
            "2-2-2",
            "3-1-1",
            "3-1-2",
            "2-1-2",
            "1-3-1",
            "1-2-1",
            "2-1-1",
            "1-3-2",
            "1-3-3",
            "1-1-1",
            "1-1-1"
        ].reverse()
        for(const thisLabel of rowLabels){
            let scores = []
            for(let idx = 1; idx <  4; idx++){
                const cell = cells.find(d=>d.cIdx === pcLength + idx && d.rIdx === rIdx)
                let ts = cell.list.map(d=>d.parentPrimitiveIds.map(d=>partialConfig[idx ]?.checkMap[d] ?? 0)).flat().reduce((a,c)=>a > c ? a : c, 0)
                scores[idx - 1] = ts
            }
            let ov_score = order.indexOf(scores.join("-")) 
            console.log(`Remap score for ${thisLabel} = ${pScores[rIdx]} / ${ov_score}`)
            pScores[rIdx] = ov_score
            rIdx++
        }


    }
    if( primitive.plainId === 533912){
        const countries = cells.filter(d=>d.cIdx === 2).map(d=>d.primitive?.referenceParameters.location).filter((d,i,a)=>d && a.indexOf(d)===i).sort()
        for(const thisLabel of rowLabels){
            const country = cells.find(d=>d.rIdx === rIdx && d.cIdx === 2)?.primitive?.referenceParameters?.location
            pScores[rIdx] = countries.indexOf(country)
            rIdx++
        }
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
            let minWidth = 100
            const range = rowLabels.map((_,i)=>cells.filter(d=>d.cIdx === cIdx && d.rIdx === i).map(d=>d.listLength))
            const cell = cells.find(d=>d.cIdx === cIdx && d.rIdx === rIdx)
            
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

registerRenderer( {type: "categoryId", id: 109, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemWidth: 600, minColumns: 1, spacing: [2,2], itemPadding: [20,20,20,20], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 100, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemWidth: 600, itemHeight: 1800, spacing: [2,2], itemPadding: [20,20,20,20], padding: [5,5,5,5], ...(options.renderConfig ?? {}), columns: 3}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 29, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemSize: 60, columns: 3, minColumns: 3, spacing: [8,8], itemPadding: [2,2,2,2], padding: [2,2,2,2], ...(options.renderConfig ?? {})}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 101, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemWidth: 360, spacing: [2,2], itemPadding: [2,2,2,2], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    return baseGridRender(options, config)
})
registerRenderer( {type: "categoryId", id: 95, configs: "set_grid"},(primitive, options = {})=>{
    const config = {itemWidth:555, spacing: [20,20], itemPadding: [2,2,2,2], padding: [5,5,5,5], ...(options.renderConfig ?? {}), height: undefined}

    const concept_info = {}
    for(const d of options.list){
        const concept = d.findParentPrimitives({referenceId: [PrimitiveConfig.Constants["CONCEPT"]]})
        if( concept ){
            concept_info[d.id] = {id:concept[0].id, title: concept[0].title}
        }
    }


    return baseGridRender({...options, extras: {concept_info}}, config)
})
function baseGridRender( options, config){
    if( !options.list ){
        return undefined
    }

    const heightDefined = config.itemHeight || config.itemSize
    
    const fullHeight =  heightDefined ? (config.itemHeight ?? config.itemSize) + config.itemPadding[0] + config.itemPadding[2] : undefined
    const fullWidth = ((config.columns === 1 ? Math.max(config.itemWidth ?? 0, config.minWidth ?? 0 ) : config.itemWidth ?? config.itemSize)) + config.itemPadding[1] + config.itemPadding[3]

    let minColumns = config.minColumns

    let items = options.list
    let itemCount = items.length + (config.showExtra ? 1 : 0)

    if( config.minWidth ){
        minColumns = Math.max(minColumns ?? 1, 1, Math.floor(((config.minWidth - config.padding[1] - config.padding[3]) - config.spacing[1]) / (fullWidth + config.spacing[1])))
    }

    if( minColumns) {
        config.columns = Math.max(minColumns, config.columns)
    }



    const calcWidth = ((config.columns + 1) * config.spacing[1]) + (config.columns * fullWidth) + config.padding[1] + config.padding[3]

    if( !config.columns ){
        if( !config.width ){
            config.columns = 1
        }
        config.columns = Math.floor(Math.max(1, ((config.width - config.padding[1] - config.padding[3]) - config.spacing[1]) / (fullWidth + config.spacing[1])))
    }
    if(!config.width || calcWidth > config.width ){
        config.width = calcWidth
        config.columns = Math.floor(Math.max(1, ((config.width - config.padding[1] - config.padding[3]) - config.spacing[1]) / (fullWidth + config.spacing[1])))
    }

    config.rows = Math.ceil( itemCount / config.columns )
    
    if( heightDefined ){
        config.height ||= ((config.rows + 1) * config.spacing[0]) + (config.rows * fullHeight) + config.padding[0] + config.padding[2]
    }

    if( options.getConfig && config.height){
        return config
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
                height: fullHeight, 
                width: fullWidth, 
                padding: config.itemPadding, 
                placeholder: options.placeholder !== false,
                toggles: options.toggles,
                imageCallback: options.imageCallback,
                ...options.extras
            })
        }else{
            node = addExtraNode( config, options, x, y, fullWidth)
        }

        g.add(node)
        let lastHeight = fullHeight ?? node.attrs.height
        columnYs[idx] += lastHeight + config.spacing[0]

        x += fullWidth + config.spacing[1]
        idx++
        if( idx === config.columns){
            idx = 0
            x = config.padding[3] + config.spacing[1]
            y = columnYs[idx]
            if( heightDefined && (y + fullHeight) > height){
                break
            }
        }
    }

    if( !heightDefined ){
        const mayY = Math.max(...columnYs) 
       // r.height( mayY)
        g.height( mayY + config.padding[2])
        config.height = mayY + config.padding[2]
    }

    if( options.getConfig ){
        return config
    }

    return g
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
registerRenderer( {type: "default", configs: "set_overview"}, (primitive, options = {})=>{
    const config = {width: 300, spacing: 10,/*height: 1400,*/count: 4, itemPadding: [2,2,2,2], padding: [10,10,10,10], ...(options.renderConfig ?? {})}
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
    let x = 0
    let y = config.padding[0]


    //const items = options.list.filter(d=>d.referenceParameters?.funding).sort((a,b)=>b.referenceParameters.funding - a.referenceParameters.funding)
    let items = options.list
    /*
    const mode = primitive.renderConfig?.mode ?? "none"
    if( mode == "funding"){
        items = options.list.filter(d=>d.referenceParameters?.funding).sort((a,b)=>b.referenceParameters.funding - a.referenceParameters.funding)
    }else{
        items = options.list
    }*/
    const maxScale = items.map(d=>d.referenceParameters.funding).reduce((a,c)=>c > a ? c : a, 0)

    let renderList = config.count ? items.slice(0, config.count) : items
    for( const d of renderList ){
        const node = RenderPrimitiveAsKonva( d, {
            config: "overview", 
            x: x, 
            y: y, 
            width: width - config.itemPadding[1] - config.itemPadding[3], 
            imageCallback: options.imageCallback,
            padding: config.itemPadding, imageCallback: options.imageCallback})
        
        g.add(node)
        y += node.height() + config.spacing
    }
    g.height( y + config.padding[2])

    if( options.getConfig){
        config.height = g.height()
        return config
    }

    return g
})
//registerRenderer( {type: "default", configs: "overview"}, (primitive, options = {})=>{
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
            text: primitive.referenceParameters.description.slice(0,150),
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
registerRenderer( {type: "categoryId", id: 29, configs: "overview"}, (primitive, options = {})=>{
    const config = {width: 300, itemSize: 60, padding: [10,10,10,10], fontSize: 10, leftSize: 150, maxScale: 100, parameter: "funding", ...options}
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


        const logo = imageHelper( `/api/image/${primitive.id}`, {
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
            text: `${primitive.title} (${roundCurrency(primitive?.referenceParameters[config.parameter] ?? 0)})`,
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
registerRenderer( {type: "categoryId", id: 29, configs: "set_ranking"}, (primitive, options = {})=>{
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

    const items = options.list.filter(d=>d.referenceParameters?.funding).sort((a,b)=>b.referenceParameters.funding - a.referenceParameters.funding)
    const maxScale = items.map(d=>d.referenceParameters.funding).reduce((a,c)=>c > a ? c : a, 0)

    for( const d of items ){
        const node = RenderPrimitiveAsKonva( d, {
            config: "ranking", 
            maxScale,
            x: x, 
            y: y, 
            height: fullHeight, 
            width: width - config.itemPadding[1] - config.itemPadding[3], 
            placeholder: options.placeholder !== false,
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

registerRenderer( {type: "categoryId", id: 29, configs: "ranking"}, (primitive, options = {})=>{
    const config = {width: 300, height: 30, itemSize: 25, padding: [10,10,10,10], fontSize: 12, leftSize: 150, maxScale: 100, parameter: "funding", ...options}
    if( options.getConfig){
        return config
    }

    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.height - config.padding[0] - config.padding[2]
    let ox = (options.x ?? 0) + config.padding[3]
    let oy = (options.y ?? 0) + config.padding[0]



    const g = new Konva.Group({
        id: primitive.id,
        width: config.width,
        height: config.height,
    })
    if( g ){


        const logo = imageHelper( `/api/image/${primitive.id}`, {
            x: ox,
            y: oy,
            size: config.itemSize,
            center: true,
            imageCallback: options.imageCallback,
            placeholder: options.placeholder !== false
        })
        g.add( logo )



        let tx = ox + config.itemSize + (config.itemSize / 5)
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
        const amountSize = 50
        const barSize = rightSize - amountSize

        const scale = (primitive?.referenceParameters[config.parameter] ??0 ) / config.maxScale 
        const thisBar = Math.min(Math.max(0, scale), 1) * barSize

        const bar = new Konva.Rect({
            y: oy + config.padding[0],
            x: rhs,
            width: thisBar,
            height: availableHeight,
            fill: "#0082c5"            
        })
        g.add(bar);
        const amount = new Konva.Text({
            fontSize: config.fontSize,
            text: roundCurrency(primitive?.referenceParameters[config.parameter] ?? 0),
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
    return categoryMaps[109]["default"](primitive, {...options, field:"description"})
})
registerRenderer( {type: "categoryId", id: 109, configs: "default"}, function renderFunc(primitive, options = {}){

    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, width: 1200, maxHeight: 3000, padding: [10,10,10,10], ...options}
    let toggleWidth = 0
    if( options.toggles){
        toggleWidth = 26
    }
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

        let text = primitive.referenceParameters[config.field]
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
            lineHeight: 1.5,
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


        if( options.toggles ){
            const active = Object.values(options.toggles)[0][primitive.id]
            const startX = availableWidth + config.padding[3] - toggleWidth + 2
            const startY = totalheight - config.padding[2] - config.idSize
            g.add( renderToggle(active, startX, startY, toggleWidth, config.idSize, Object.keys(options.toggles)[0]))
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
                width: availableWidth - toggleWidth,
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
registerRenderer( {type: "categoryId", id: 63, configs: "default"}, function renderFunc(primitive, options = {}){
    return baseImageWithText(primitive, {...options, textField: primitive.referenceParameters?.snippet ?? primitive.text})
})
registerRenderer( {type: "categoryId", id: 34, configs: "default"}, function renderFunc(primitive, options = {}){
    //return baseImageWithText(primitive, {...options, textField: primitive.referenceParameters?.description.replace(/[\*-]+/g, '')?.replace(/\n+/g, '\n')?.replace(/\s+/g, ' ').trim() ?? primitive.snippet})
    return baseImageWithText(primitive, {...options, textField: primitive.snippet ??  primitive.referenceParameters?.description?.replace(/[\*-]+/g, '')?.replace(/\n+/g, '\n')?.replace(/\s+/g, ' ')?.trim()?.slice(0,200) ?? ""})
})
function baseImageWithText(primitive, options){
    const config = {showId: true, idSize: 14, width: 256, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let toggleWidth = 0
    if( options.toggles){
        toggleWidth = 26
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
        if( primitive.referenceParameters?.hasImg){
            imageHeight = (config.width / 16 * 9) + 10
            const img = imageHelper( `/api/image/${primitive.id}`, {
                x: 0,
                y: 0,
                padding: config.padding,
                width: config.width,
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

        const textToShow = options.allText ? options.textField :options.textField.slice(0,150)

        const t = new CustomText({
            x: config.padding[3],
            y: config.padding[0] + imageHeight,
            fontSize: 16,
            lineHeight: 1.5,
            text: options.textField,
          //  height: availableHeight,
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

        if( options.toggles ){
            const active = Object.values(options.toggles)[0][primitive.id]
            const startX = availableWidth + config.padding[3] - toggleWidth + 2
            const startY = totalheight - config.padding[2] - config.idSize
            g.add( renderToggle(active, startX, startY, toggleWidth, config.idSize, Object.keys(options.toggles)[0]))
        }


        if( config.showId ){
            const idText = new CustomText({
                x: config.padding[3],
                y: totalheight - config.padding[2] - config.idSize ,
                fontSize: config.idSize,
                text: `${primitive.displayType} #${primitive.plainId}`,
                fill: '#94a3b8',
                wrap: true,
                width: availableWidth - toggleWidth,
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

    let toggleWidth = 0
    if( options.toggles){
        toggleWidth = 26
    }

    let idHeight = config.showId ?  20 : 0
    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 



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

    let toggleWidth = 0
    if( options.toggles){
        toggleWidth = 26
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

        if( options.toggles ){
            const active = Object.values(options.toggles)[0][primitive.id]
            const startX = availableWidth + config.padding[3] - toggleWidth + 2
            const startY = totalheight - config.padding[2] - config.idSize
            g.add( renderToggle(active, startX, startY, toggleWidth, config.idSize, Object.keys(options.toggles)[0]))
        }


        if( config.showId ){
            const idText = new CustomText({
                x: config.padding[3],
                y: totalheight - config.padding[2] - config.idSize ,
                fontSize: config.idSize,
                text: `${primitive.displayType} #${primitive.plainId}`,
                fill: '#94a3b8',
                wrap: true,
                width: availableWidth - toggleWidth,
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

export function renderToggle(active, startX, startY, toggleWidth, height, id){
    const g = new Konva.Group({
        x: startX, 
        y: startY, 
        width: toggleWidth, 
        name: "_toggle clickable",
        height: height,
        id: id
    })

    const r = height * 0.75 * 0.5
    const gap = (height * 0.25 * 0.5)
    const toggleCore = new Konva.Circle({
        x: active ? toggleWidth - gap - r : gap + r,
        y:  gap + r,
        radius: r,
        fill: active ? '#4ade80' : '#e2e8f0'
    })
    g.add(toggleCore)
    const toggleBase = new Konva.Rect({
        x: 0,
        y: 0,
        cornerRadius: 10,
        stroke: active ? '#4ade80' : '#e2e8f0',
        width: toggleWidth,
        height: height,
    })
    g.add(toggleBase)
    return g

}

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
        fill: "#ffffff"

    })
    g.add( bg )
    if( options.concept_info?.[primitive.id]){

        const logo = imageHelper( `/published/image/${options.concept_info[primitive.id]?.id}`, {
            size: 48,
            x: config.padding[3] + 12,
            y: config.padding[0] + 6,
            center: true,
            imageCallback: options.imageCallback,
            placeholder: options.placeholder !== false
        })
        g.add( logo )
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
        fill: "#7e8184",
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
        fill: "#7e8184",
        wrap: true,
        text: primitive.referenceParameters?.url ?? "www.homepage.io"
    })
    const textBg = new Konva.Rect({
        x: 0,
        y: image.attrs.y + image.height(),
        width: config.width,
        height: headingText.height() + 36 + urlText.height(),
        fill: "#edf3f8"

    })
    let footerHeight = 0

    if( options.toggles ){
        footerHeight = 30
        let toggleWidth = 26
        const active = Object.values(options.toggles)[0][primitive.id]
        const startX = config.width - config.padding[3] - config.padding[1] - 24 + config.padding[3] - toggleWidth + 2
        const startY = textBg.attrs.y + textBg.attrs.height + 10 
        g.add( renderToggle(active, startX, startY, toggleWidth, 14, Object.keys(options.toggles)[0]))
    }

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

        const logo = imageHelper( `/api/image/${primitive.id}`, {
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

registerRenderer( {type: "type", id: "search", configs: "default"}, (primitive, options = {})=>{
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
        const t = new CustomText({
            text: text,
            align:"left",
            wrap: false,
            ellipsis: true,
            fontStyle: options.bold ? "bold" : undefined,
            fill: options.color,
            verticalAlign:"middle",
            x: lx,
            y: ly,
            lineFill: options.lineFill,
            width: config.width - lx,
            height: 12,
            fontSize: options.fontSize ?? 14,
            refreshCallback: options.imageCallback
        })
        ly += t.textHeight * 1.15
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

    g.add(addWidgetText(primitive.title, {fontSize: 18, bold:true, lineFill: '#666'}))
    
    const count = addWidgetText(options.data.count + " " + options.data.items, {color: "#eee", fontSize: 11, lineFill: "#3f6212"})
    const pill = new Konva.Rect({
        x: lx,
        y: count.attrs.y,
        cornerRadius: 10,
        fill: "#3f6212",
        width: count.textWidth + 8,
        height: count.textHeight + 4
    })
    count.attrs.x += 4
    count.attrs.y += 3
    g.add(pill)
    g.add(count)
    
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
    
    renderReactSVGIcon( MagnifyingGlassIcon, 
                        {
                            props: {fill: "#555"},
                            target: g,
                            x:5, 
                            y:config.height - 20,
                            width: 16,
                            height: 16,
                            imageCallback: options.imageCallback
                        })
    g.add(addWidgetText(`Search #${primitive.plainId}`, {color:"#555", fontSize: 11, x: 23, y: config.height - 17}))

    const button1 = new Konva.Group({
        x: config.width - 46,
        y: config.height - 46,
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


    return g
})
function renderReactSVGIcon( icon, options = {} ){
    const finalProps = {
        ...options.props,
    }
    if( typeof(icon) === "string"){
    }else if( typeof(icon) === "function"){
        icon = renderToString( icon(options.props))
    }else if( icon.render ){
        icon = renderToString( icon.render(options.props))
    }else if( icon.$$typeof ){
        icon = renderToString( icon )
    }else{
        return undefined
    }
    const dim = options.width && options.height ? undefined : extractSVGDimensions(icon)
    const o = imageHelper( 'svg:' + icon, {
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width ?? dim.width,
        height: options.height ?? dim.height,
        center: true,
        imageCallback: options.imageCallback,
        maxScale: 1,
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
        let showName = true

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
    for(const d of node.find('.img_ph')){
        d.finalize()
    }

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

export function renderMatrix( primitive, list, options ){
    let columnExtents = options.columnExtents ? options.columnExtents.slice(0,200) : [{idx:0}]
    let rowExtents = options.rowExtents ? options.rowExtents.slice(0,200) : [{idx:0}]
    if( columnExtents.length === 0){
        columnExtents = [{idx:0}]
    }
    if( rowExtents.length === 0){
        rowExtents = [{idx:0}]
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

    let toggleMap
    if( options.toggles ){
        for(const d of Object.keys(options.toggles)){
            toggleMap ||= {}
            toggleMap[d] = {}
            for(const d2 of list){
                if( d2[d] !== "_N_" ){
                    toggleMap[d][d2.primitive.id] = d2[d]?.[0]
                }
            }
        }        
    }

    let rIdx = 0
    for(const row of rowExtents){
        let cIdx = 0
        for(const column of columnExtents){
            let subList = list.filter((item)=>(Array.isArray(item.column) ? item.column.includes( column.idx ) : item.column === column.idx) && (Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx)).map(d=>d.primitive)

            if( asCounts ){
                console.log(`MAPPING FOR asCounts`)
                subList = mainstore.uniquePrimitives( subList.map(d=>d.origin) )
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

            itemColsByColumn[cIdx] = Math.max(itemColsByColumn[cIdx], itemCols)


            cells.push({
                cIdx, rIdx,
                col: column,
                row: row,
                list: subList,
                itemLength,
                itemCols,
                showExtra: cellShowExtra
            })
            cIdx++
        }
        rIdx++
    }



    let minHeight = 0
    let minWidth = options.width ?? 300
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
                toggles: toggleMap,
    }
    if( asCounts ){
        const cellCount = cells.map(d=>d.itemLength)
        const columnRange = columnExtents.map((_,i)=>cells.filter(d=>d.cIdx === i).map(d=>d.itemLength))
        const rowRange = rowExtents.map((_,i)=>cells.filter(d=>d.rIdx === i).map(d=>d.itemLength))
        
        baseRenderConfig.range = [Math.min(...cellCount), Math.max(...cellCount)]
        baseRenderConfig.colRange = columnRange.map(d=>[Math.min(...d), Math.max(...d)])
        baseRenderConfig.rowRange = rowRange.map(d=>[Math.min(...d), Math.max(...d)])
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
                },
                checkMap,
                getConfig: true
            } )    
        
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
    const iconSize = 100
    let columnLabels
    let headerTextHeight = 0

    if( options.hideColumnHeader !== true){

        headerHeight = (headerFontSize * 4)
        headerTextHeight = headerHeight - textPadding[0] - textPadding[2]
        
        
        if( configName === "timeseries"){
            globalData.maximumValue = cells.map(d=>d.config.data).flat().reduce((a,c)=> a > c ? a : c, -Infinity) 
            globalData.minimumValue = cells.map(d=>d.config.data).flat().reduce((a,c)=> a < c ? a : c, Infinity) 
        }
        
        
        rowSize.forEach((d,i)=>{if(d < headerHeight){
            rowSize[i] = headerHeight
        }})
        
        
        columnLabels = columnExtents.map((d,idx)=>{
            const cellConfig = cells.find(d=>d.cIdx === idx)?.config ?? {padding: [5,5,5,5]}
            if( options.axis?.column?.type === "icon"){
                columnLabelAsText = false
                const logo = imageHelper( `/api/image/${d.idx}`, {
                    x: cellConfig.padding[3] + textPadding[3],
                    y: cellConfig.padding[0] + textPadding[0],
                    linkUrl: d.referenceParameters.url,
                    size: iconSize,
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
            if( options.axis?.row?.type === "icon"){
                rowLabelAsText = false
                const iconSize = 100
                headerWidth = iconSize + textPadding[1] + textPadding[3] + cellConfig.padding[3] + cellConfig.padding[1]
                const logo = imageHelper( `/api/image/${d.idx}`, {
                    x: cellConfig.padding[3] + textPadding[3],
                    y: cellConfig.padding[0] + textPadding[0],
                    size: iconSize,
                    center: true,
                    linkUrl: d.referenceParameters.url,
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
            if( recalcRow ){
                columnLabels.forEach(d=>d.fontSize(headerFontSize))
            }
        }
    }
    if( recalc || recalcRow ){
        headerTextHeight = columnLabels.reduce((a,c)=>c.height() > a ? c.height() : a, 0)
        headerHeight = headerTextHeight + textPadding[0] + textPadding[2] 
    }
    if( options.hideColumnHeader !== true){
        columnLabels.forEach(d=>{
            d.y(d.y() + ((headerTextHeight - d.height())/2) )
        })
    }
    let headerPadding = cells[0]?.config.padding[0] ?? 0

    const columnY = rowSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), options.hideColumnHeader ? 0 : headerHeight + headerPadding))
    
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
            const bg = new Konva.Rect({
                x: cellConfig.padding[3],
                y: cellConfig.padding[0],
                width: headerWidth - cellConfig.padding[3] - cellConfig.padding[1],
                height: rowSize[idx] - cellConfig.padding[0] - cellConfig.padding[2] ,
                fill:'#f3f4f6'
            })
            group.add(bg)
            rowLabels[idx].y( cellConfig.padding[0] + textPadding[0] + (((rowSize[idx] - cellConfig.padding[0] - textPadding[0] - cellConfig.padding[2] - textPadding[2]) - rowLabels[idx].height()) / 2))
            group.add(rowLabels[idx])
            g.add(group)
        })
    }


    const columnX = columnSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), headerWidth ))
    if( options.hideColumnHeader !== true){
        columnExtents.forEach((header,idx)=>{
            const cellConfig = cells.find(d=>d.cIdx === idx)?.config ?? {padding:[0,0,0,0]}
            const group = new Konva.Group({
                name: "inf_track column_header",
                x: columnX[idx],
                y: 0,
                width: columnSize[idx],
                height: headerHeight
            }) 
            const bg = new Konva.Rect({
                x: cellConfig.padding[3],
                y: cellConfig.padding[0],
                width: columnSize[idx] - cellConfig.padding[3] - cellConfig.padding[1] ,
                height: headerHeight,
                fill:'#f3f4f6'
            })
            group.add(bg)
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
                    columns: itemColsByColumn[cell.cIdx], 
                    rows: cell.itemRows
                },
                data: cell.config.data,
                globalData,
                checkMap,
                cachedNodes: cell.config.cachedNodes
            })
        c.x(columnX[cell.cIdx] )
        c.y(columnY[cell.rIdx] )
        cell.node = c
        g.add(c)
    }

    

    g.width( g.find(()=>true).map(d=>d.x() + d.width()).reduce((a,c)=>c > a ? c : a, 0))
    g.height( g.find(()=>true).map(d=>d.y() + d.height()).reduce((a,c)=>c > a ? c : a, 0))

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
    const scale = 360 / total

    const outline = new Konva.Circle({
        x: r,
        y: r,
        radius: r,
        stroke: "#555"
    })
    g.add(outline)


    let a = 0
    let idx = 0
    let colors = options.colors ?? categoryColors
    for( const s of  segments){
        const degs = scale * s.count
        var wedge = new Konva.Wedge({
            x: r,
            y: r,
            radius: r,
            angle: degs,
            fill: colors[idx % colors.length],
            //stroke: 'black',
            //strokeWidth: 1,
            strokeScaleEnabled: false,
            rotation: a,
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
        colors = categoryColors
    } = options
    
    const sg = new Konva.Group({
        x,
        y,
        width: itemSize,
        height: itemSize
    })
    const r = new Konva.Rect({
        x: 0,
        y: 0,
        width: itemSize,
        height: itemSize,
        cornerRadius: 10,
        stroke: '#d9d9d9',
        name:"background"
    })
    sg.add(r)
   // rowCells.push(r)
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
        width: itemSize - innerPadding[3] - innerPadding[1],
    })
    sg.add(t)
    const pieSize = (itemSize - innerPadding[3] - innerPadding[1]) * 0.95
    const innerSpacing = config.fontSize * 1.2
    const pieY = (config.fontSize * 2.5) + innerSpacing
    sg.add( renderPieChart(data, {size: pieSize, x: (itemSize - pieSize) / 2, y: pieY, colors: colors}))

    const legendFontSize = config.fontSize * 0.8
    const lx = (legendFontSize * 1.2) + innerPadding[3]
    let ly = pieY + pieSize + (innerSpacing * 1.5) 
    let lIdx = 0

    for( const d of (data ?? []) ){
        const r = new Konva.Rect({
            x: innerPadding[3] + (legendFontSize * 0.05),
            y: ly + (legendFontSize * 0.05),
            width: legendFontSize * 0.9,
            height: legendFontSize * 0.9,
            fill: colors[ lIdx % colors.length],
            strokeScaleEnabled: false,
            strokeWidth:1,
            stroke: '#555'
        })
        sg.add(r)


        const t = new CustomText({
            x: lx,
            y: ly,
            fontSize: legendFontSize,
            text: d.label,
            fill: '#334155',
            ellipsis: true,
            width: itemSize - lx
        })
        ly += legendFontSize * 1.5
        sg.add(t)
        lIdx++
    }            
    sg.height( ly )
    return sg
}

registerRenderer( {type: "default", configs: "cat_overview"}, (primitive, options = {})=>{
    const config = {field: "summary", showId: true, idSize: 14, fontSize: 16, itemSize: 280, width: 1200, padding: [0,0,0,0], ...options}

    let ox = (options.x ?? 0) 
    let oy = (options.y ?? 0) 

    const g = new Konva.Group({
        id: primitive.id,
        x: ox,
        y: oy,
        width: config.width,
        onClick: options.onClick,
        name:"inf_track"
    })

    const sets = options.data?.mappedCategories ?? []
    const usableWidth = config.width - config.padding[1] - config.padding[3]
    const setCount = sets.length 
    
    const itemSize = config.itemSize
    const columns = Math.floor(usableWidth / (itemSize + 10))
    const spacing = (usableWidth - (columns * itemSize)) / (columns + 1)
    const rows = Math.ceil( setCount / columns )
    let ySpacing = 30
    
    let x = config.padding[3] + spacing
    let y = config.padding[0] + ySpacing
    let maxY = 0
    let cIdx = 0

    let rHeight = 0
    let rowCells = []
    let innerPadding = [10,10,10,10]

    function updateGraphBackground(){
        for(const d of rowCells){
            d.find('.background')[0]?.height(rHeight + innerPadding[2])
        }
    }

    for( const item of sets ){
        const sg = renderSubCategoryChart(item.title, item.details, {x: x, y: y, itemSize, innerPadding})
        g.add(sg)
        rowCells.push( sg )
        
        console.log(sg.attrs.height)
        rHeight = sg.attrs.height > rHeight  ? sg.attrs.height : rHeight

        x += itemSize + spacing
        cIdx ++
        maxY = y + rHeight
        if( cIdx === columns ){
            updateGraphBackground()
            x = config.padding[3] + spacing
            y += rHeight + ySpacing
            rHeight = 0
            cIdx = 0
            rowCells = []
        }
        
    }
    updateGraphBackground()
    const h = maxY + config.padding[2] + ySpacing
    //r.height(h)
    g.height(h)
    return g

})