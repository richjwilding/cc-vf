import Konva from "konva";
import { Util } from 'konva/lib/Util'
import CustomImage  from "./CustomImage";
import CustomText from "./CustomText";
const typeMaps = {}
const categoryMaps = {}

export function roundCurrency(number){
    if(number === 0){
        return "$0"
    }
    const suffixes = ["", "K", "M","B","T"];
    const suffixIndex = Math.floor(Math.log10(Math.abs(number)) / 3);

    const scaledNumber = number / Math.pow(10, suffixIndex * 3);
    const formattedNumber = scaledNumber.toFixed( suffixIndex > 1 ? 0 : 2);

    return "$" + formattedNumber.replace(/\.00$/, '') + suffixes[suffixIndex];
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
registerRenderer( {type: "default", configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemSize: 256, columns: 5, spacing: [8,12], itemPadding: [10,12,10,8], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }

    if( config.minColumns) {
        config.columns = Math.max(config.minColumns, config.columns)
    }
    const fullWidth = config.itemSize + config.itemPadding[1] + config.itemPadding[3]

    const calcWidth = ((Math.max(1, config.columns)  + 1) * config.spacing[1]) + (Math.max(1, config.columns) * fullWidth) + config.padding[1] + config.padding[3]

    if( calcWidth > config.width ){
        config.columns = Math.max(1, ((config.width - config.padding[1] + config.padding[3]) - config.spacing[1]) / (config.itemSize + config.spacing[1]))
    }else{
        config.width = calcWidth
    }

    config.rows = Math.ceil( options.list.length / config.columns )


    const width = config.width 
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: width
    })
    let x = config.padding[3] + config.spacing[1]

    const items = options.list

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
    
    let ypos = new Array( config.columns).fill(config.padding[0] + config.spacing[0])

    for( const d of items ){
        let y = ypos[col]
        let node
        
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
                imageCallback: options.imageCallback
            })
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
registerRenderer( {type: "categoryId", id: 29, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemSize: 30, columns: 3, minColumns: 3, spacing: [2,2], itemPadding: [2,2,2,2], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }
    const fullHeight = config.itemSize + config.itemPadding[0] + config.itemPadding[2]
    const fullWidth = config.itemSize + config.itemPadding[1] + config.itemPadding[3]

    let minColumns = config.minColumns

    if( config.minWidth ){
        minColumns = Math.max(1, Math.floor(((config.minWidth - config.padding[1] - config.padding[3]) - config.spacing[1]) / (fullWidth + config.spacing[1])))
    }

    if( minColumns) {
        config.columns = Math.max(minColumns, config.columns)
    }



    const calcWidth = ((config.columns + 1) * config.spacing[1]) + (config.columns * fullWidth) + config.padding[1] + config.padding[3]

    if( !config.width || calcWidth > config.width ){
        config.width = calcWidth
        config.columns = Math.max(1, ((config.width - config.padding[1] - config.padding[3]) - config.spacing[1]) / (fullWidth + config.spacing[1]))
    }

    config.rows = Math.ceil( options.list.length / config.columns )
    
    //config.width ||= ((config.columns - 1) * config.spacing[1]) + (config.columns * fullWidth) + config.padding[1] + config.padding[3]
    config.height ||= ((config.rows - 1) * config.spacing[0]) + (config.rows * fullHeight) + config.padding[0] + config.padding[2]

    if( options.getConfig){
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

    const items = options.list

    const r = new Konva.Rect({
        x: config.padding[3],
        y: config.padding[0],
        width: config.width - config.padding[3] - config.padding[1],
        height: config.height - config.padding[0] - config.padding[2],
        fill: '#f9fafb'
    })
    g.add(r)

    let idx = 0
    for( const d of items ){
        const node = RenderPrimitiveAsKonva( d, {
            config: "default", 
            x: x, 
            y: y, 
            onClick: options.primitiveClick,
            height: fullHeight, 
            width: fullWidth, 
            padding: config.itemPadding, 
            placeholder: options.placeholder !== false,
            imageCallback: options.imageCallback})
        if( node ){
            g.add(node)
        }

        x += fullWidth + config.spacing[1]
        idx++
        if( idx === config.columns){
            idx = 0
            x = config.padding[3] + config.spacing[1]
            y += fullHeight + config.spacing[0]
            if( (y + fullHeight) > height){
                break
            }
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


registerRenderer( {type: "default", configs: "default"}, (primitive, options = {})=>{
    const config = {showId: true, idSize: 14, width: 256, padding: [10,10,10,10], ...options}
    if( options.getConfig){
        return config
    }

    let idHeight = config.showId ?  20 : 0
    let availableWidth = config.width - config.padding[1] - config.padding[3]
    let availableHeight = config.maxHeight !== undefined ? config.maxHeight - config.padding[0] - config.padding[2] - idHeight : undefined
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
           // shadowColor: "#aaa",
            //shadowOffset: {x:1, y:1},
            //shadowBlur: 4,
        })
        g.add(r)
        const t = new CustomText({
            x: config.padding[3],
            y: config.padding[3],
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
        t.height(h)
//        console.log(h)
        g.add(t)
        let totalheight = h + config.padding[0] + config.padding[2] + idHeight

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
        const image = new CustomImage( {url: url, x: options.x ?? 0, y: options.y ?? 0, padding: options.padding, width: options.width ?? options.size, height: options.height ?? options.size, placeholder: options.placeholder, name: options.placeholder ? "img_ph" : undefined})

        if(options.imageCallback){
            image.attrs.refreshCallback = ()=>options.imageCallback(image)
        }

    return image

}

export function renderMatrix( primitive, list, options ){
    const columnExtents = options.columnExtents ?? [{idx:0}]
    const rowExtents = options.rowExtents ?? [{idx:0}]
    
    console.log(`Rendering ${columnExtents.length} x ${rowExtents.length}`)

    const g = new Konva.Group({
        name: "view",
        x:options.x ?? 0,
        y:options.y ?? 0
    })


    const columnSize = new Array(columnExtents.length).fill(0)
    const rowSize = new Array(rowExtents.length).fill(0)
    const cells = []
    
    const referenceIds = list.map(d=>d.primitive.referenceId).filter((d,i,a)=>a.indexOf(d) === i)
    if( referenceIds.length > 1){
        console.log(`Multiple types in list, selecting first`)
    }

    let itemColsByColumn = new Array(columnExtents.length).fill(0)
    
    let rIdx = 0
    for(const row of rowExtents){
        let cIdx = 0
        for(const column of columnExtents){
            const subList = list.filter((item)=>(Array.isArray(item.column) ? item.column.includes( column.idx ) : item.column === column.idx) && (Array.isArray(item.row) ? item.row.includes( row.idx ) : item.row === row.idx)).map(d=>d.primitive)
            const itemLength = subList.length 
            const itemCols = Math.floor( Math.sqrt( itemLength) )

            itemColsByColumn[cIdx] = Math.max(itemColsByColumn[cIdx], itemCols)


            cells.push({
                cIdx, rIdx,
                col: column,
                row: row,
                list: subList,
                itemLength,
                itemCols
            })
            cIdx++
        }
        rIdx++
    }



    const minWidth = {29: 120}[referenceIds[0]] ?? 300
    for(const cell of cells){
        const config = RenderSetAsKonva( primitive, cell.list, {config: "grid", referenceId: referenceIds[0], renderConfig:{columns: itemColsByColumn[cell.cIdx], minWidth: minWidth}, getConfig: true} )    
        
        itemColsByColumn[cell.cIdx] = Math.max(itemColsByColumn[cell.cIdx], config.columns)
        
        columnSize[cell.cIdx] = Math.max( config.width > columnSize[cell.cIdx] ? config.width : columnSize[cell.cIdx], minWidth)
        rowSize[cell.rIdx] = Math.max( config.height > rowSize[cell.rIdx] ? config.height : rowSize[cell.rIdx], 30)

        cell.config = config
    }

    let headerScale = Math.max(1, Math.max(columnSize.reduce((a,c)=>a+c, 0) / 2000 , rowSize.reduce((a,c)=>a+c, 0) / 3000 ))
    let headerFontSize = Math.min(12 * headerScale, 120)
    let textPadding = new Array(4).fill(headerFontSize * 0.3 )
    let headerHeight = headerFontSize * 2
    let headerTextHeight = headerHeight - textPadding[0] - textPadding[2]

    rowSize.forEach((d,i)=>{if(d < headerHeight){
        rowSize[i] = headerHeight
    }})

    let adjustedFont = false

    const columnLabels = columnExtents.map((d,idx)=>{
        const cellConfig = cells.find(d=>d.cIdx === idx)?.config
        
        const longestWord = (d.label ?? "").split(" ").reduce((a,c)=>a.length > c.length ? a : c, 0)
        const colWidth = columnSize[idx] - textPadding[1] - textPadding[3] - cellConfig.padding[3] - cellConfig.padding[1] 

        const text = new Konva.Text({
            fontFamily: "system-ui",
            fontSize: headerFontSize,
            text: longestWord,
            align:"center",
            wrap: true,
            verticalAlign:"middle",
            x: cellConfig.padding[3] + textPadding[3],
            y: cellConfig.padding[0] + textPadding[0],
            width: colWidth,
            height: "auto"
        })

        while( text.measureSize(longestWord).width > colWidth && headerFontSize > 6){
            headerFontSize = headerFontSize > 50 ? headerFontSize -= (headerFontSize * 0.1) : headerFontSize - 0.25
            text.fontSize( headerFontSize )
        } 
        text.text( d.label ?? "" )  

        return text
    })

    function isColumnHeaderOverflowing(labels, height){
        return labels.filter(d=>d.height() > height).length >0
    }
    function isRowHeaderOverflowing(labels, heights){
        return labels.filter((d,i)=>d.height() > heights[i]).length >0
    }
    
    let recalc = false
    let recalcRow = false
    while( isColumnHeaderOverflowing( columnLabels, headerTextHeight) && headerFontSize > 6){
        headerFontSize = headerFontSize > 50 ? headerFontSize -= (headerFontSize * 0.1) : headerFontSize - 0.25
        columnLabels.forEach(d=>d.fontSize(headerFontSize))
        recalc = true
    }

    let showRowheaders = rowExtents.length > 1 || rowExtents[0]?.label?.length > 0
    let headerWidth = 0
    let rowLabels

    if( showRowheaders ){
        const longestPairs = rowExtents.map(d=>{
            const words = (d.label  ?? "").split(" ")
            const coupleLength = words.map((d,i,a)=> i > 0 ? a[i-1] + " " + d : undefined ).filter(d=>d)
            return coupleLength.reduce((a,c)=>c.length > a.length ? c : a, "" )
        }).reduce((a,c)=>c.length > a.length ? c : a, "" )
        console.log(`Longest pair = `, longestPairs)

        let textWidth 
        let rowHeights = []
        rowLabels = rowExtents.map((d,idx)=>{
            const cellConfig = cells.find(d=>d.rIdx === idx)?.config
            rowHeights[idx] = rowSize[idx] - textPadding[0] - textPadding[2] - cellConfig.padding[0] - cellConfig.padding[2]
            const text = new Konva.Text({
                fontFamily: "system-ui",
                fontSize: headerFontSize,
                text: textWidth ? (d.label  ?? "") : longestPairs,
                wrap: true,
                align:"center",
                verticalAlign:"middle",
                x: cellConfig.padding[3] + textPadding[3],
                y: cellConfig.padding[0] + textPadding[0],
                width: textWidth ? textWidth : "auto"
            })
            if( !textWidth ){
                textWidth = text.width()
                headerWidth = textWidth + textPadding[1] + textPadding[3] + cellConfig.padding[3] + cellConfig.padding[1]
                text.width(textWidth)
                text.text( d.label  ?? "")
            }
            return text
        })

        while( isRowHeaderOverflowing( rowLabels, rowHeights) && headerFontSize > 6){
            headerFontSize = headerFontSize > 50 ? headerFontSize -= (headerFontSize * 0.1) : headerFontSize - 0.25
            rowLabels.forEach(d=>d.fontSize(headerFontSize))
            recalcRow = true
        }
        if( recalcRow ){
            columnLabels.forEach(d=>d.fontSize(headerFontSize))
        }

   
    }
    if( recalc || recalcRow ){
        headerTextHeight = columnLabels.reduce((a,c)=>c.height() > a ? c.height() : a, 0)
        headerHeight = headerTextHeight + textPadding[0] + textPadding[2] 
    }
    columnLabels.forEach(d=>d.height(headerTextHeight))
    let headerPadding = cells[0].config.padding[0]

    const columnY = rowSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), headerHeight + headerPadding))
    
    if( showRowheaders ){
        rowExtents.forEach((header,idx)=>{
            const cellConfig = cells.find(d=>d.rIdx === idx)?.config
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
        const cellConfig = cells.find(d=>d.cIdx === idx)?.config
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
                primitiveClick: options.primitiveClick,
                id: `${cell.cIdx}-${cell.rIdx}`, 
                config: "grid", 
                referenceId: referenceIds[0], 
                placeholder: options.placeholder !== false, 
                imageCallback: options.imageCallback, 
                renderConfig:{
                    width: columnSize[cell.cIdx], 
                    height: rowSize[cell.rIdx] , 
                    minHeight: rowSize[cell.rIdx] - cell.config.padding[0] - cell.config.padding[2],
                    columns: itemColsByColumn[cell.cIdx], 
                    rows: cell.itemRows
                },
                cachedNodes: cell.config.cachedNodes
            })
        c.x(columnX[cell.cIdx] )
        c.y(columnY[cell.rIdx] )
        cell.node = c
        g.add(c)
    }

    for(let rIdx = 0; rIdx < rowExtents.length; rIdx++){
        const thisRow = cells.filter(d=>d.rIdx === rIdx)
        const maxHeightCell = thisRow.reduce((a,c)=>c.node.attrs.height > a.node.attrs.height ? c : a )
        const maxHeight = maxHeightCell.node.attrs.height
        const bg = maxHeightCell.node.find('.background')?.[0]
        const maxHeightBg = bg ? bg.attrs.height : undefined

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

    g.width( g.find(()=>true).map(d=>d.x() + d.width()).reduce((a,c)=>c > a ? c : a, 0))
    g.height( g.find(()=>true).map(d=>d.y() + d.height()).reduce((a,c)=>c > a ? c : a, 0))

    return g



}
