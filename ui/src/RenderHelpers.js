import Konva from "konva";
import { Util } from 'konva/lib/Util'
import CustomImage  from "./CustomImage";
import CustomText from "./CustomText";
import PrimitiveConfig from "./PrimitiveConfig";
import CollectionUtils from "./CollectionHelper";
import moment from "moment";
const typeMaps = {}
const categoryMaps = {}

export const heatMapPalette = PrimitiveConfig.heatMapPalette

export function roundCurrency(number){
    if(number === 0){
        return "$0"
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
registerRenderer( {type: "default", configs: "set_checktable"}, (primitive, options = {})=>{
    const config = {width: 16, height: 16, padding: [2,2,2,2], ...(options.renderConfig ?? {})}
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
        if( items.length > 0 ){
            const cScale = Math.min(w,h * 0.75) / 500 
            const points = [
                100, 300, 200, 400, 400, 100
              ].map(d=>d * cScale)
              const dim = 500 * cScale
              
              const polyline = new Konva.Line({
                points: points,
                x: config.padding[3] + ((w - dim) / 2),
                y: config.padding[0] + ((h - dim) / 2),
                stroke: 'black',
                strokeWidth: 2,
                lineJoin: 'round',
                lineCap: 'round',
                closed: false
              });
              g.add(polyline)

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
registerRenderer( {type: "default", configs: "set_timeseries"}, (primitive, options = {})=>{
    const config = {width: 256, height: 128, padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }

    const renderWidth = config.width - config.padding[3] - config.padding[1]
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
        width: renderWidth,
        height: renderHeight,
        fill: "white",
        name: "background"
    })




    g.add(r)
    if( series.length > 0){
        
        //const maxValue = series.reduce((a,c)=>c > a ? c : a, -Infinity) + 1
        //const minValue = series.reduce((a,c)=>c < a ? c : a, Infinity) - 1

        const maxValue = (primitive.renderConfig?.align_scale === "yes" ? options.globalData.maximumValue : series.reduce((a,c)=>c > a ? c : a, -Infinity)) + 1
        const minValue = (primitive.renderConfig?.align_scale === "yes" ? options.globalData.minimumValue : series.reduce((a,c)=>c < a ? c : a, Infinity))- 1

        const range = maxValue - minValue
        
        const len = series.length
        const dx = renderWidth / (len - 1)
        const lineMargin = renderHeight * 0.1
        const scale = (renderHeight - lineMargin - lineMargin) / range
        const points = series.map((d,i)=>[i * dx, renderHeight - lineMargin - (scale * (d - minValue))]).flat()
        //const lower = series.map((_,i)=>[(len - 1 - i) * dx, renderHeight - lineMargin - (scale * (series[len - i - 1] - minValue)) + (renderHeight * 0.1)]).flat()
        const lower = series.map((_,i)=>[(len - 1 - i) * dx, renderHeight - lineMargin ]).flat()

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
    }




    return g
})
registerRenderer( {type: "default", configs: "set_heatmap"}, (primitive, options = {})=>{
    const config = {width: 128, height: 128, padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }
    let range = options.range
    if( primitive.renderConfig?.group_by === "row"){
        range = options.rowRange[options.rIdx]
    }else if( primitive.renderConfig?.group_by === "col"){
        range = options.colRange[options.cIdx]
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
    console.log(idx, items.length, range[0], range[1])

    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: config.height - config.padding[0] - config.padding[2],
        fill: colors[idx],
        name: "background"
    })
    g.add(r)


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
    const fullWidth = (config.itemWidth ?? config.itemSize) + config.itemPadding[1] + config.itemPadding[3]

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
        height: config.height - config.padding[0] - config.padding[2],
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


registerRenderer( {type: "categoryId", id: 109, configs: "default"}, function renderFunc(primitive, options = {}){

    const config = {showId: true, idSize: 14, width: 800, padding: [10,10,10,10], ...options}
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
            text: primitive.referenceParameters.summary,
            withMarkdown: true,
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
                h = availableHeight
            }
        }
        //t.height(h)
        g.add(t)


        let totalheight = h + config.padding[0] + config.padding[2] + idHeight

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
            placeholder: options.placeholder !== false
        })
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
    const columnExtents = options.columnExtents ?? [{idx:0}]
    const rowExtents = options.rowExtents ?? [{idx:0}]
    
    const g = new Konva.Group({
        name: "view",
        x:options.x ?? 0,
        y:options.y ?? 0
    })
    let configName = options.viewConfig?.renderType ?? "grid" 

    const asCounts = options.viewConfig?.showAsCounts
    const asChecks = options.viewConfig?.parameters?.showAsCheck
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

    let cellContentLimit = {
        "result": 50,
        "evidence": 150
    }[list[0]?.primitive?.type] ?? false
    
    cellContentLimit = {
        29: 63
    }[referenceIds[0]] ?? cellContentLimit

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
    let minWidth = {29: 120}[referenceIds[0]] ?? 300
    if( asCounts ){
        minWidth = 128
    }else if( asChecks){
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
                    asChecks,
                    showExtra: cell.showExtra,
                    columns: itemColsByColumn[cell.cIdx], minWidth: minWidth
                },
                getConfig: true
            } )    
        
        itemColsByColumn[cell.cIdx] = Math.max(itemColsByColumn[cell.cIdx], config.columns)
        
        columnSize[cell.cIdx] = Math.max( config.width > columnSize[cell.cIdx] ? config.width : columnSize[cell.cIdx], minWidth)
        rowSize[cell.rIdx] = Math.max( config.height > rowSize[cell.rIdx] ? config.height : rowSize[cell.rIdx], 30, minHeight)

        cell.config = config
    }
    const maxRowHeight = Math.max(...rowSize)

    let maxFont = maxRowHeight / 4

    let headerScale = Math.max(1, Math.max(columnSize.reduce((a,c)=>a+c, 0) / 2000 , rowSize.reduce((a,c)=>a+c, 0) / 4000 ))
    let headerFontSize = Math.min(12 * headerScale, maxFont, 120)
    let textPadding = new Array(4).fill(headerFontSize * 0.3 )
    let headerHeight = (headerFontSize * 4)
    let headerTextHeight = headerHeight - textPadding[0] - textPadding[2]


    const globalData = {}
    if( configName === "timeseries"){
        globalData.maximumValue = cells.map(d=>d.config.data).flat().reduce((a,c)=> a > c ? a : c, -Infinity) 
        globalData.minimumValue = cells.map(d=>d.config.data).flat().reduce((a,c)=> a < c ? a : c, Infinity) 
    }

    rowSize.forEach((d,i)=>{if(d < headerHeight){
        rowSize[i] = headerHeight
    }})

    const iconSize = 100
    let columnLabelAsText = true
    let rowLabelAsText = true

    const columnLabels = columnExtents.map((d,idx)=>{
        const cellConfig = cells.find(d=>d.cIdx === idx)?.config ?? {padding: [5,5,5,5]}
        if( options.axis?.column?.type === "icon"){
            columnLabelAsText = false
            const logo = imageHelper( `/api/image/${d.idx}`, {
                x: cellConfig.padding[3] + textPadding[3],
                y: cellConfig.padding[0] + textPadding[0],
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
                fontFamily: "system-ui",
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
    function isRowHeaderOverflowing(labels, heights){
        return labels.filter((d,i)=>d.height() > heights[i]).length >0
    }
    
    let recalc = false
    let recalcRow = false
    if( columnLabelAsText ){

        while( isColumnHeaderOverflowing( columnLabels, headerTextHeight) && headerFontSize > 6){
            headerFontSize = headerFontSize > 50 ? headerFontSize -= (headerFontSize * 0.1) : headerFontSize - 0.25
            columnLabels.forEach(d=>d.fontSize(headerFontSize))
            recalc = true
        }
        columnLabels.forEach(d=>d.fontSize(headerFontSize))
    }

    let showRowheaders = rowExtents.length > 1 || rowExtents[0]?.label?.length > 0
    let headerWidth = 0
    let rowLabels

    if( showRowheaders ){
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
                    imageCallback: options.imageCallback,
                    placeholder: options.placeholder !== false
                })
                return logo
            }else{

                const text = new CustomText({
                    fontFamily: "system-ui",
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
    columnLabels.forEach(d=>{
        d.y(d.y() + ((headerTextHeight - d.height())/2) )
    })
    let headerPadding = cells[0]?.config.padding[0] ?? 0

    const columnY = rowSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), headerHeight + headerPadding))
    
    if( showRowheaders ){
        rowExtents.forEach((header,idx)=>{
            const cellConfig = cells.find(d=>d.rIdx === idx)?.config ?? {padding:[0,0,0,0]}
            const group = new Konva.Group({
                name: "inf_track row_header",
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

    for( const cell of cells){

        const c = RenderSetAsKonva( primitive, cell.list, 
            {
                ...baseRenderConfig,
                primitiveClick: options.primitiveClick,
                cIdx: cell.cIdx,
                rIdx: cell.rIdx,
                id: `${cell.cIdx}-${cell.rIdx}`, 
                renderConfig:{
                    asChecks,
                    showExtra: cell.showExtra,
                    width: columnSize[cell.cIdx], 
                    height: rowSize[cell.rIdx] , 
                    minHeight: rowSize[cell.rIdx] - cell.config.padding[0] - cell.config.padding[2],
                    columns: itemColsByColumn[cell.cIdx], 
                    rows: cell.itemRows
                },
                data: cell.config.data,
                globalData,
                cachedNodes: cell.config.cachedNodes
            })
        c.x(columnX[cell.cIdx] )
        c.y(columnY[cell.rIdx] )
        cell.node = c
        g.add(c)
    }

    
   /* 
    for(let rIdx = 0; rIdx < rowExtents.length; rIdx++){
        const thisRow = cells.filter(d=>d.rIdx === rIdx)
        if( thisRow && thisRow.length > 0){
            const maxHeightCell = thisRow.reduce((a,c)=>c.node.attrs.height > a.node.attrs.height ? c : a )
            const cellConfig = thisRow[0].config ?? {padding:[0,0,0,0]}
            let headerHeight = showRowheaders ? rowSize[rIdx] - cellConfig.padding[0] - cellConfig.padding[2] : 0
            console.log(`*** `, cellConfig, rowSize[rIdx], headerHeight)
            if( maxHeightCell ){
                const maxHeight = Math.max(headerHeight, maxHeightCell.node.attrs.height)
                const bg = maxHeightCell.node.find('.background')?.[0]
                const maxHeightBg = Math.max(headerHeight, bg ? bg.attrs.height : headerHeight)
                
                for(const d of thisRow ){
                    if( d.node.attrs.height < maxHeight){
                        d.node.attrs.height = maxHeight
                        if( maxHeightBg ){
                            const bg = d.node.find('.background')?.[0]
                            if( bg ){
                                bg.attrs.height = maxHeightBg
                            }
                        }
                    }
                }
                
            }
        }
    }*/

    g.width( g.find(()=>true).map(d=>d.x() + d.width()).reduce((a,c)=>c > a ? c : a, 0))
    g.height( g.find(()=>true).map(d=>d.y() + d.height()).reduce((a,c)=>c > a ? c : a, 0))

    return g

}
