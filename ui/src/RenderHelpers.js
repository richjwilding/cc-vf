import Konva from "konva";
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
        const configs = d.configs ?? ["default"]
        if( !obj[d.id]){
            obj[d.id] = {}
        }
        for( const c of [configs].flat()){
            if( obj[ d.id ]?.[c] ){
                console.log(`Overwriting renderer for ${d.id} / ${c}`)
            }
            obj[ d.id ][c] = callback
        }
    }

}

export function RenderSetAsKonva( primitive, list, options = {} ){
    if( !list ){
        return
    }
    let config = "set_" + (options.config || "default")
    let source = list[0]
    const renderer = categoryMaps[source?.referenceId]?.[config] ?? typeMaps[ source?.type ]?.[config]
    if( !renderer ){
        throw `Cant find renderer for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${config}`
    }
    return renderer(primitive, {list:list, ...options, config: options.config} )
}
export function RenderPrimitiveAsKonva( primitive, options = {} ){
    let config = options.config || "default"
    const renderer = categoryMaps[primitive.referenceId]?.[config] ?? typeMaps[ primitive.type ]?.[config]
    if( !renderer ){
        throw `Cant find renderer for ${primitive.id} ${primitive.type} ${primitive.referenceId} / ${config}`
    }
    return renderer(primitive, options)

}
registerRenderer( {type: "categoryId", id: 29, configs: "set_grid"}, (primitive, options = {})=>{
    const config = {itemSize: 30, columns: 5, spacing: [2,2], itemPadding: [2,2,2,2], padding: [5,5,5,5], ...(options.renderConfig ?? {})}
    if( !options.list ){
        return undefined
    }

    if( config.minColumns) {
        config.columns = Math.max(config.minColumns, config.columns)
        console.log(`MIN COLUMNS `, config.columns)
    }
    const fullHeight = config.itemSize + config.itemPadding[0] + config.itemPadding[2]
    const fullWidth = config.itemSize + config.itemPadding[1] + config.itemPadding[3]

    config.rows = Math.floor( options.list.length / config.columns )
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
        const r = new Konva.Rect({
            x: ox,
            y: oy,
            width: config.itemSize,
            height: config.itemSize,
            fill: '#fafafa',
            stroke: '#888'
        })
        g.add(r)
        Konva.Image.fromURL(`/api/image/${primitive.id}`, function (image) {
            let x = 0 ,y = 0, width = availableWidth, height = availableHeight
            let scale = Math.min(config.itemSize / image.width(), config.itemSize / image.height())
            let iWidth = image.width() * scale
            let iHeight = image.height() * scale
            x = (height - iWidth) / 2
            y = (height - iHeight) / 2

            image.setAttrs({
                x: ox + x,
                y: oy + y,
                width: iWidth,
                height: iHeight
            });
            r.destroy()
            g.add(image);
            if(options.imageCallback){
                options.imageCallback(image, g)
            }
        })

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
        name:"inf_track primitive"
    })
    if( g ){
        const r = new Konva.Rect({
            x: config.padding[0],
            y: config.padding[3],
            width: availableWidth,
            height: availableHeight,
            fill: '#fafafa',
            stroke: '#888'
        })
        g.add(r)
        Konva.Image.fromURL(`/api/image/${primitive.id}`, function (image) {
            let x = 0 ,y = 0, width = availableWidth, height = availableHeight
            let scale = Math.min(width / image.width(), height / image.height())
            let iWidth = image.width() * scale
            let iHeight = image.height() * scale
            x = (width - iWidth) / 2
            y = (height - iHeight) / 2

            image.setAttrs({
                x: config.padding[0] + x,
                y: config.padding[3] + y,
                width: iWidth,
                height: iHeight
            });
            r.destroy()
            g.add(image);
            if(options.imageCallback){
                options.imageCallback(image, g)
            }
        })


    }
    return g


})

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



    for(const row of rowExtents){
        let cIdx = 0
        for(const column of columnExtents){
            //const subList = list.filter((item)=>item.column === column.idx && item.row === row.idx)
            const subList = list.filter((item)=>item.column === (column?.idx ?? column) && item.row === (row?.idx ?? row)).map(d=>d.primitive)
            const itemLength = subList.length 
            const itemCols = Math.floor( Math.sqrt( itemLength) )
            const itemRows = Math.floor(itemLength / itemCols)

            
            const config = RenderSetAsKonva( primitive, subList, {config: "grid", renderConfig:{columns: itemCols, rows: itemRows, minColumns: 3}, getConfig: true} )
            console.log(config)
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
    const columnX = columnSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), 0))

    let textPadding = [3,3,3,3]
    let headerHeight = 40
    let headerTextHeight = headerHeight - textPadding[0] - textPadding[2]

    let headerFontSize = 12
    const columnLabels = columnExtents.map((d,idx)=>{
        const cellConfig = cells.find(d=>d.cIdx === idx)?.config
        const text = new Konva.Text({
            fontFamily: "system-ui",
            fontSize: "12",
            text: d.label,
            align:"center",
            verticalAlign:"middle",
            x: cellConfig.padding[3] + textPadding[3],
            y: cellConfig.padding[0] + textPadding[0],
            width: columnSize[idx] - textPadding[1] - textPadding[3] - cellConfig.padding[3] - cellConfig.padding[1] ,
            height: "auto"//50 - textPadding[0] - textPadding[2] - cellConfig.padding[0] - cellConfig.padding[2]
        })
        return text
    })
    function isOverflowing(labels, height){
        return labels.filter(d=>d.height() > height).length >0
    }
    
    let recalc = false
    while( isOverflowing( columnLabels, headerTextHeight) && headerFontSize > 6){
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
    const columnY = rowSize.map((d,i,a)=>a.reduce((t,c,i2)=>t + (i2 < i ? c : 0), headerHeight + headerPadding))

    for( const cell of cells){
        const c = RenderSetAsKonva( primitive, cell.list, {primitiveClick: options.primitiveClick,id: `${cell.cIdx}-${cell.rIdx}`, config: "grid", imageCallback: options.imageCallback, renderConfig:{width: columnSize[cell.cIdx], height: rowSize[cell.rIdx], columns: cell.itemCols, rows: cell.itemRows, minColumns: 3}} )
        c.x(columnX[cell.cIdx] )
        c.y(columnY[cell.rIdx] )
        g.add(c)
    }


    g.width( g.find(()=>true).map(d=>d.x() + d.width()).reduce((a,c)=>c > a ? c : a, 0))
    g.height( g.find(()=>true).map(d=>d.y() + d.height()).reduce((a,c)=>c > a ? c : a, 0))

    return g



}
