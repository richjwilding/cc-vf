import Konva from "konva";
import { Util } from 'konva/lib/Util'
import CustomImage  from "./CustomImage";
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
        throw `Cant find renderer for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${config}`
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
        throw `Cant find renderer for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${config}`
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

    config.rows = Math.ceil( options.list.length / config.columns )
    config.width ||= ((config.columns - 1) * config.spacing[1]) + (config.columns * fullWidth) + config.padding[1] + config.padding[3]

    if( options.getConfig){
        return config
    }
    const width = config.width 
    
    const g = new Konva.Group({
        id: options.id,
        name:"cell inf_track",
        x: (options.x ?? 0),
        y: (options.y ?? 0),
        width: width
    })
    let x = config.padding[3]

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
    
    let ypos = new Array( config.columns).fill(config.padding[0])

    for( const d of items ){
        let y = ypos[col]
        const node = RenderPrimitiveAsKonva( d, {
            config: "default", 
            x: x, 
            y: y, 
            onClick: options.primitiveClick,
            maxHeight: 400,
            width: fullWidth, 
            padding: config.itemPadding, 
            imageCallback: options.imageCallback})
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
            x = config.padding[3]
        }
    }
    const height = ypos.reduce((a,c)=>c > a ? c : a, 0) + config.padding[0] + config.padding[2] 
    r.height( height )
    g.height( height )

    return g
})
registerRenderer( {type: "categoryId", id: 29, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemSize: 30, columns: 5, minColumns: 5, spacing: [2,2], itemPadding: [2,2,2,2], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }

    if( config.minColumns) {
        config.columns = Math.max(config.minColumns, config.columns)
    }
    const fullHeight = config.itemSize + config.itemPadding[0] + config.itemPadding[2]
    const fullWidth = config.itemSize + config.itemPadding[1] + config.itemPadding[3]

    config.rows = Math.ceil( options.list.length / config.columns )
    config.width ||= ((config.columns - 1) * config.spacing[1]) + (config.columns * fullWidth) + config.padding[1] + config.padding[3]
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
    let x = config.padding[3]
    let y = config.padding[0]

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
            imageCallback: options.imageCallback})
        if( node ){
            g.add(node)
        }

        x += fullWidth + config.spacing[1]
        idx++
        if( idx === config.columns){
            idx = 0
            x = config.padding[3]
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
            placeholder: false//true
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
        const t = new Konva.Text({
            x: config.padding[3],
            y: config.padding[3],
            fontSize: 16,
            lineHeight: 1.5,
            text: primitive.title,
            fill: '#334155',
            wrap: true,
            width: availableWidth,
        })
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

            const idText = new Konva.Text({
                x: config.padding[3],
                y: totalheight - config.padding[2] - config.idSize ,
                fontSize: config.idSize,
                text: `${primitive.displayType} #${primitive.plainId}`,
                fill: '#94a3b8',
                wrap: true,
                width: availableWidth,
            })
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
            x: config.padding[3],
            y: config.padding[0],
            size: Math.min(availableHeight, availableWidth),
            center: true,
            imageCallback: options.imageCallback,
            placeholder: true
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
        const image = new CustomImage( {placeholder: true, url: url, x: options.x ?? 0, y: options.y ?? 0, width: options.size, height: options.size, name: options.placeholder ? "img_ph" : undefined})

        if(options.imageCallback){
          //  options.imageCallback(image)
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
        x:0,y:0
    })


    const columnSize = new Array(columnExtents.length).fill(0)
    const rowSize = new Array(rowExtents.length).fill(0)
    let rIdx = 0
    const cells = []

    const referenceIds = list.map(d=>d.primitive.referenceId).filter((d,i,a)=>a.indexOf(d) === i)
    if( referenceIds.length > 1){
        console.log(`Multiple types in list, selecting first`)
    }


    for(const row of rowExtents){
        let cIdx = 0
        for(const column of columnExtents){
            //const subList = list.filter((item)=>item.column === column.idx && item.row === row.idx)
            const subList = list.filter((item)=>item.column === (column?.idx ?? column) && item.row === (row?.idx ?? row)).map(d=>d.primitive)
            const itemLength = subList.length 
            const itemCols = Math.floor( Math.sqrt( itemLength) )
            const itemRows = Math.ceil(itemLength / itemCols)

            const config = RenderSetAsKonva( primitive, subList, {config: "grid", referenceId: referenceIds[0], renderConfig:{columns: itemCols, rows: itemRows, minColumns: 3}, getConfig: true} )
            columnSize[cIdx] = config.width > columnSize[cIdx] ? config.width : columnSize[cIdx]
            rowSize[rIdx] = config.height > rowSize[rIdx] ? config.height : rowSize[rIdx]

            cells.push({
                cIdx, rIdx,
                col: column,
                row: row,
                list: subList,
                itemLength,
                itemCols,
                itemRows,
                config
            })
            cIdx++
        }
        rIdx++
    }

    let textPadding = [3,3,3,3]
    let headerHeight = 40
    let headerTextHeight = headerHeight - textPadding[0] - textPadding[2]

    let headerFontSize = 12
    const columnLabels = columnExtents.map((d,idx)=>{
        const cellConfig = cells.find(d=>d.cIdx === idx)?.config
        const text = new Konva.Text({
            fontFamily: "system-ui",
            fontSize: 12,
            text: d.label,
            align:"center",
            wrap: true,
            verticalAlign:"middle",
            x: cellConfig.padding[3] + textPadding[3],
            y: cellConfig.padding[0] + textPadding[0],
            width: columnSize[idx] - textPadding[1] - textPadding[3] - cellConfig.padding[3] - cellConfig.padding[1] ,
            height: "auto"
        })
        return text
    })

    function isColumnHeaderOverflowing(labels, height){
        return labels.filter(d=>d.height() > height).length >0
    }
    
    let recalc = false
    while( isColumnHeaderOverflowing( columnLabels, headerTextHeight) && headerFontSize > 6){
        headerFontSize = headerFontSize - 0.25
        columnLabels.forEach(d=>d.fontSize(headerFontSize))
        recalc = true
    }
    if( recalc ){
        headerTextHeight = columnLabels.reduce((a,c)=>c.height() > a ? c.height() : a, 0)
        headerHeight = headerTextHeight + textPadding[0] + textPadding[2] 
    }
    columnLabels.forEach(d=>d.height(headerTextHeight))
    let headerPadding = cells[0].config.padding[0]

    const columnY = rowSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), headerHeight + headerPadding))

    let showRowheaders = rowExtents.length > 1 || rowExtents[0]?.label?.length > 0
    let headerWidth = 0

    if( showRowheaders ){
        const longestPairs = rowExtents.map(d=>{
            const words = d.label.split(" ")
            const coupleLength = words.map((d,i,a)=> i > 0 ? a[i-1] + " " + d : undefined ).filter(d=>d)
            return coupleLength.reduce((a,c)=>c.length > a.length ? c : a, "" )
        }).reduce((a,c)=>c.length > a.length ? c : a, "" )
        console.log(`Longest pair = `, longestPairs)

        let textWidth 
        const rowLabels = rowExtents.map((d,idx)=>{
            const cellConfig = cells.find(d=>d.rIdx === idx)?.config
            const text = new Konva.Text({
                fontFamily: "system-ui",
                fontSize: 12,
                text: textWidth ? d.label : longestPairs,
                wrap: true,
                align:"center",
                verticalAlign:"middle",
                x: cellConfig.padding[3] + textPadding[3],
                y: cellConfig.padding[0] + textPadding[0],
                height: rowSize[idx] - textPadding[0] - textPadding[2] - cellConfig.padding[0] - cellConfig.padding[2] ,
                width: textWidth ? textWidth : "auto"
            })
            if( !textWidth ){
                textWidth = text.width()
                headerWidth = textWidth + textPadding[1] + textPadding[3] + cellConfig.padding[3] + cellConfig.padding[1]
                text.width(textWidth)
                text.text( d.label )
            }
            return text
        })

   
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
        const c = RenderSetAsKonva( primitive, cell.list, {primitiveClick: options.primitiveClick,id: `${cell.cIdx}-${cell.rIdx}`, config: "grid", referenceId: referenceIds[0], imageCallback: options.imageCallback, renderConfig:{width: columnSize[cell.cIdx], height: rowSize[cell.rIdx], columns: cell.itemCols, rows: cell.itemRows, minColumns: 3}} )
        c.x(columnX[cell.cIdx] )
        c.y(columnY[cell.rIdx] )
        cell.node = c
        g.add(c)
    }

    for(let rIdx = 0; rIdx < rowExtents.length; rIdx++){
        const thisRow = cells.filter(d=>d.rIdx === rIdx)
        const maxHeight = thisRow.map(d=>d.node.attrs.height).reduce((a,c)=>c > a ? c : a,0 )
        for(const d of thisRow ){
            if( d.node.attrs.height < maxHeight){
                const bg = d.node.find('.background')?.[0]
                d.node.attrs.height = maxHeight
                if( bg ){
                    bg.attrs.height = maxHeight
                }
            }
        }
        
    }

    g.width( g.find(()=>true).map(d=>d.x() + d.width()).reduce((a,c)=>c > a ? c : a, 0))
    g.height( g.find(()=>true).map(d=>d.y() + d.height()).reduce((a,c)=>c > a ? c : a, 0))

    return g



}
