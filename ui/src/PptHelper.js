import pptxgen from "pptxgenjs";
import Konva from "konva";
import CustomImage from "./CustomImage";
import WedgeRing from "./WedgeRing";

const defaultWidthInInches = 10 * 4
const defaultHeightInInches = 5.625 * 4
export function createPptx(  options = {} ){
    const pptx = new pptxgen();
    
    pptx.defineLayout({ name:'VF_CUSTOM', width: options.width ?? defaultWidthInInches, height: options.height ?? defaultHeightInInches });
    pptx.layout = 'VF_CUSTOM'
    return pptx
}
window.setupPPTX = ()=>{
    return createPptx()
}

export async function exportKonvaToPptx( stage, pptx, options = {} ){
    let savePptx = false
    
    if( !pptx ){
        pptx = createPptx(options.slideSettings)
        savePptx = true
    }

    let slideOptions
    if( options.master ){
        slideOptions = {masterName: options.master}
    }

    let slide = pptx.addSlide(slideOptions);
    let startSlide = slide

    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity
    let rootScale = 1
    if( stage.getClassName() == "Stage"){
        for( const layer of stage.children){
            for( const konvaNode of layer.children ){
                const l = konvaNode.x() 
                const t = konvaNode.y() 
                if( l < minX){ minX = l}
                if( t < minY){ minY = t}
                const r = konvaNode.x() + konvaNode.width()
                const b = konvaNode.y() + konvaNode.height()
                if( r > maxX){ maxX = r}
                if( b > maxY){ maxY = b}
            }
        }
        const stageNode = stage.container()
        if( stageNode.style.backgroundColor && stageNode.style.backgroundColor !== ""){
            slide.background = {color: toHex(stageNode.style.backgroundColor)}

        }
        maxX = maxX - minX
        maxY = maxY - minY
    }else{
        if( options.noFraming){

            maxX = stage.width()  * rootScale
            maxY = stage.height() * rootScale
            rootScale = 1
        }else{
            for( const konvaNode of stage.children ){
                const nodeClass = konvaNode.name().split(" ")
                if( options.removeNodes && options.removeNodes.filter(d=>nodeClass.includes(d)).length > 0){
                    continue
                }
                const l = konvaNode.x() 
                const t = konvaNode.y() 
                if( l < minX){ minX = l}
                if( t < minY){ minY = t}
                const r = konvaNode.x() + konvaNode.width() * konvaNode.scaleX()
                const b = konvaNode.y() + konvaNode.height() * konvaNode.scaleY()
                if( r > maxX){ maxX = r}
                if( b > maxY){ maxY = b}
            }
            rootScale =  1
            maxX -= minX
            maxY -= minY
        }
    }

    let slidePadding = options.padding ?? [0,0,0,0]
    
    let activeLayout = pptx.LAYOUTS[pptx.layout]
    let widthInInches = activeLayout.width / 914400
    let heightInInches = activeLayout.height / 914400

    let gScale = options.scale ?? Math.min( (widthInInches - slidePadding[1] - slidePadding[3]) / maxX, (heightInInches - slidePadding[0] - slidePadding[2])/ maxY )
    let pageOffset = 0, pageNum = 0
    let columnHeaders = []
    let contentYAfterColumn = 0
    if( options.fit === "width" ){
        gScale = (widthInInches - slidePadding[1] - slidePadding[3]) / maxX
    }
    const fontScale = gScale * 72 // 0.95
    const maxPagePos = heightInInches - slidePadding[0] 


    function toHex(col){
        if( !col ){
            return undefined
        }
        if( col.slice(0,1) === "#"){
            if(col.length === 4){
                const r = col.slice(1,2)
                const g = col.slice(2,3)
                const b = col.slice(3,4)
                col = `#${r}${r}${g}${g}${b}${b}`
            }
        }
        const r = Konva.Util.getRGB(col)
        let h = '#' + (r.r.toString(16).padStart(2, '0')) + (r.g.toString(16).padStart(2, '0')) + (r.b.toString(16).padStart(2, '0'))
        return h
    }
    
    function processNode( konvaNode, ox = 0, oy = 0, pScale = 1, first = false ){
        const nodeClass = konvaNode.name().split(" ")
        if( options.removeNodes && options.removeNodes.filter(d=>nodeClass.includes(d)).length > 0){
            return
        }
        const ObjClassName = konvaNode.getClassName()
        
        const x = first ? ((slidePadding[3] / gScale) - (options.offsetForFrame?.[0] ?? 0)) : ( ox + (konvaNode.x() * pScale))
        const y = first ? ((slidePadding[0] / gScale) - (options.offsetForFrame?.[1] ?? 0) ) : (oy + (konvaNode.y() * pScale))

        
        let thisScale = konvaNode.scale()?.x ?? 1
        thisScale *= pScale
        let scale = gScale


        let rx = x * scale, ry = (y - pageOffset) * scale
        let rw = konvaNode.width() * scale * thisScale, rh = konvaNode.height() * scale * thisScale
        let rr = konvaNode.radius ? konvaNode.radius() * scale * thisScale : undefined

        if(options.asTable){

            
            if(konvaNode instanceof Konva.Rect && (ry + rh) > maxPagePos){
                rh = maxPagePos - ry
            }
            if( (ry > maxPagePos) || ((ry + rh) > maxPagePos)){
                if(slide._slideObjects.length > 0){
                    if( columnHeaders.length === 0 || columnHeaders[0].ox === ox){
                        
                        pageOffset = y
                        slide = pptx.addSlide();
                        pageNum++
                        if( columnHeaders ){
                            let h = -Infinity
                            for(const d of columnHeaders){
                                processNode(d.node, d.ox, d.oy + pageOffset, d.scale )
                                const th = d.node.height()
                                
                                if( th > h ){
                                    h = th
                                }                            
                            }
                            pageOffset -= (contentYAfterColumn + h)
                        }
                        ry = (y - pageOffset) * scale
                    }
                }
            }
            if(  pageNum === 0){
                if(nodeClass.includes("column_header")){
                    columnHeaders.push( {node: konvaNode, ox: ox, oy: oy, scale: pScale})
                }else{
                    if(!contentYAfterColumn && columnHeaders.length > 0){
                        contentYAfterColumn = oy
                    }
                }
            }
        }



        if (konvaNode instanceof Konva.Text) {

            const kFontSize =konvaNode.fontSize()
            const kLargeFontSize = kFontSize * 1.5
            const fontSize = konvaNode.fontSize() * fontScale * thisScale
            const largeFontSize = (konvaNode.fontSize() * 1.5) * fontScale * thisScale
            const LINE_MULT_FACTOR = 0.823
            const lineSpacingMultiple = konvaNode.lineHeight() * LINE_MULT_FACTOR

            //indent,large, bold
            if( konvaNode.className === "CustomText"){
                let indentTracker = false, indentLevel = 0, yTracker
                let agg = []
                let stack = []               
                let hasIndents = false
                let spacingAfter = 0, spacingBefore = 0
                let lastBold, lastIndent, lastLarge, lastBullet, lastWasLastInPara, lastEndList 
                console.log(konvaNode.textArr)
                let tIdx = 0
                let bulletNeedsFlushing = false
                let lastSegment, startSegment, latchSegment, lastFontSize
                let inTable = false, liveTable = [], tableSet = []
                for( const d of konvaNode.textArr){
                    if( d.tableInfo){
                        if( !inTable ){
                            liveTable = []
                            inTable = true
                        }
                        liveTable.push( d )
                        continue
                    }else{
                        if( inTable ){
                            console.log(`Finished table`)
                            console.log( tableSet)
                            inTable = false
                            tableSet.push(liveTable)
                            liveTable = undefined
                        }
                    }
                    if( d.text === "" ){
                        continue
                    }
                    if( agg.length === 0){
                        startSegment = d
                    }
                    let flush = false
                    let markEndList = d.lastInParagraph
                    if( d.bullet ){
                        if( !lastBullet ){
                            flush = true
                            //lastBullet = true
                            //markEndList = true
                        }
                        //bulletNeedsFlushing = true
                        hasIndents = true
                        if( indentTracker ){
                            if( d.indent > indentTracker ){
                                indentLevel++
                                flush = true
                            }else if( d.indent < indentTracker ){
                                indentLevel--
                                flush = true
                            }else{
                                //if( lastWasLastInPara ){
                                    flush = true
                                //}
                            }
                            indentTracker = d.indent
                        }else{
                            indentTracker = d.indent
                            indentLevel = 1
                            flush = true
                        }
                    }else{
                        if( lastWasLastInPara ){
                            indentLevel = 0
                            indentTracker = false
                            flush = true
                        }
                    }
                    if( lastBold !== undefined && d.bold != lastBold){
                        flush = true
                    }
                    spacingBefore = 0
                    spacingAfter = 0
                    const useFontSize = (lastLarge ?  largeFontSize : fontSize)
                    
                    if( flush ){
                        if(latchSegment && startSegment){
                            const bottomTextCurrent = startSegment.y + ((startSegment.large ? kLargeFontSize : kFontSize) / 2)
                            const topCurrent = bottomTextCurrent - ((startSegment.large ? kLargeFontSize : kFontSize) * 0.76 * konvaNode.lineHeight())

                            const bottomTextPrevious = latchSegment.y + ((latchSegment.large ? kLargeFontSize : kFontSize) / 2)
                            const bottomPrevious = bottomTextPrevious + ((latchSegment.large ? kLargeFontSize : kFontSize) * 0.24 * konvaNode.lineHeight())

                            spacingBefore = (topCurrent - bottomPrevious) * fontScale * thisScale * lineSpacingMultiple * 0.98
                            spacingBefore = spacingBefore.toFixed(3)
                        }
                        if( agg.length ){
                            let options = {
                                    paraSpaceBefore: spacingBefore,
                                    paraSpaceAfter: spacingAfter,
                                    bold: lastBold || lastLarge,
                                    fontSize: useFontSize.toFixed(3),
                                    breakLine: lastEndList ? true : false 
                                }
                            if( bulletNeedsFlushing && lastIndent ){
                                //options.bullet = {indent: (fontScale * konvaNode.fontSize() * 0.4).toFixed(3)}
                                options.bullet = {indent: (useFontSize * 0.4).toFixed(3)}
                                options.indentLevel = lastIndent 
                                bulletNeedsFlushing = false
                            }
                            stack.push({
                                text: agg.join(" ").trim() + (tIdx && d.bold !== lastBold ? " " : ""),
                                //text: agg.join(" ") + (!d.bullet && lastIndent === 0 ? "\n" : ""),
                                options
                            })
                            agg = []
                            const tf = d.large ? largeFontSize : fontSize
                            startSegment = d
                            latchSegment = undefined
                            console.log(stack.slice(-1)[0].text, stack.slice(-1)[0].options)
                            //bulletNeedsFlushing = d.bullet
                        }
                    }
                    if( d.bullet ){
                        bulletNeedsFlushing = true
                    }
                    if( !latchSegment && lastSegment){
                        latchSegment = lastSegment
                    }

                    let textToAdd = d.text
                    lastSegment = d
                    agg.push(d.text)
                    lastBold = d.bold
                    lastIndent = indentLevel
                    lastLarge = d.large
                    lastFontSize = useFontSize
                    lastBullet = d.bullet
                    lastWasLastInPara = d.lastInParagraph
                    lastEndList = markEndList
                    tIdx++
                }
                if( agg.length > 0){
                    const useFontSize = (lastLarge ?  largeFontSize : fontSize)
                    let options = {
                            paraSpaceBefore: spacingBefore,
                            paraSpaceAfter: spacingAfter,
                            bold: lastBold || lastLarge,
                            fontSize: (lastLarge ?  largeFontSize : fontSize).toFixed(3),
                            breakLine: lastEndList ? true : false 
                        }
                    if( (lastBullet || bulletNeedsFlushing) && lastIndent ){
                        //options.bullet = {indent: (fontScale * konvaNode.fontSize() * 0.4).toFixed(3)}
                        options.bullet = {indent: (useFontSize * 0.4).toFixed(3)}
                        options.indentLevel = lastIndent 
                    }
                    
                    stack.push({
                        text: agg.join(" ").trim(),
                        options
                    })
                }
                console.log(stack)
                slide.addText(stack, {
                    x: rx,
                    y: ry,
                    w: rw * 1.01,
                    h: rh,
                    bold: konvaNode.fontStyle() === "bold",
                    lineSpacingMultiple,//0.866,
                    italic: konvaNode.fontStyle() === "italic",
                    fontFace: konvaNode.fontFamily() + (konvaNode.fontStyle() === "light" ? " light" : ""),
                    align: hasIndents ? undefined : konvaNode.align(),
                    valign: hasIndents ? "top" : konvaNode.verticalAlign(),
                    margin:konvaNode.padding(),
                    fontSize: fontSize.toFixed(3),
                    color: toHex(konvaNode.fill()),
                });
                if( konvaNode.attrs?.url){
                    slide.addShape(pptx.shapes.RECTANGLE, {
                        x: rx,
                        y: ry,
                        w: rw,
                        h: rh,
                        hyperlink: {url: konvaNode.attrs.url}
                    })
                }
                if( inTable ){
                    tableSet.push(liveTable)
                }
                if( tableSet ){
                    for(const tableData of tableSet){
                        const rowIdx = tableData.reduce((a,d)=>{a[d.tableInfo.row] = d.tableInfo.row; return a},[])
                        const colIdx = tableData.reduce((a,d)=>{a[d.tableInfo.col] = d.tableInfo.col; return a},[])
                        const topOffset = (tableData[0].y  - (fontSize * 0.5 * (tableData[0].fontScale ?? 1)) + tableData[0].tableInfo.yPadding)  * scale * thisScale
                        const lastItem = tableData[tableData.length - 1]
                        const tableHeight = lastItem.tableInfo.tableHeight - topOffset
                    
                        const data = rowIdx.map(rIdx=>{
                            return colIdx.map(cIdx=>{
                                const items = tableData.filter(d=>d.tableInfo.col === cIdx && d.tableInfo.row === rIdx)
                                let text = ""
                                if( items.length > 0){

                                    const options = {}
                                    if( items[0].tableInfo.row === 0){
                                        options.bold = true
                                        options.color = "#ffffff"
                                    }
                                    if( items[0].fontScale && items[0].fontScale !== 1 ){
                                        options.fontSize = fontSize * items[0].fontScale
                                    }
                                    if( items[0].tableInfo.fill ){
                                        options.fill = toHex(items[0].tableInfo.fill)
                                    }
                                    text = items.map(d=>d.text).join(" ")
                                }
                                return {text, options}
                            })
                        })
                        const rowStarts = tableData.filter(d=>d.tableInfo.col === 0).map(d=>d.y)
                        const baserowHeights = rowStarts.map((d,i,a)=>(i === (rowStarts.length - 1) ? tableHeight : a[i + 1]) - d)
                        const rowHeights = baserowHeights.map(d=>(d / tableHeight)) 
                        //const rowHeights = baserowHeights.map(d=>d * scale * thisScale )
                        const mx = lastItem.tableInfo.xPadding * scale * thisScale * 2
                        const my = lastItem.tableInfo.yPadding * scale * thisScale * 2
                        slide.addTable(data,{
                            x: rx,
                            y: ry + topOffset,
                            w: rw,
                            h: tableHeight * scale * thisScale,
                            fontFace: konvaNode.fontFamily() + (konvaNode.fontStyle() === "light" ? " light" : ""),
                            margin: [my, mx, my, mx],
                            rowH: rowHeights,
                            fontSize: fontSize.toFixed(3),
                            border:{
                                type:"solid",
                                pt: 1,
                                color: toHex(konvaNode.tableDecoration?.[0]?.stroke)
                            }
                        })
                    }
                }
            }else{

                let text = konvaNode.textArr.reduce((a,d)=>a + (d.lastInParagraph ? d.text + "\n" : d.text + " "), "")
                
                slide.addText(text, {
                    x: rx,
                    y: ry,
                    w: rw,
                    h: rh,
                    bold: konvaNode.fontStyle() === "bold",
                    lineSpacingMultiple,
                    italic: konvaNode.fontStyle() === "italic",
                    fontFace: konvaNode.fontFamily() + (konvaNode.fontStyle() === "light" ? " light" : ""),
                    align: konvaNode.align(),
                    valign: konvaNode.verticalAlign(),
                    margin:konvaNode.padding(),
                    fontSize: fontSize.toFixed(3),
                    color: toHex(konvaNode.fill()),
                });
            }
        } else if (konvaNode instanceof Konva.Circle ) {
                slide.addShape(pptx.shapes.OVAL, {
                    x: rx - (rw/2),
                    y: ry - (rh/2),
                    w: rw,
                    h: rh,
                    fill: toHex(konvaNode.fill()),
                    line: konvaNode.stroke() ? {
                        color:toHex(konvaNode.stroke()),
                        width: konvaNode.strokeWidth() /2
                    } : undefined,
                });
        }else if (ObjClassName === "Wedge") {
            const wedgeWidth = 2 * rr;
            const wedgeHeight = 2 * rr;
            if( konvaNode.angle() > 0){

                
                slide.addShape(pptx.shapes.ARC, {
                    x: rx - rr,
                    y: ry - rr,
                    w: wedgeWidth,
                    h: wedgeHeight,
                    angleRange:[konvaNode.rotation(), konvaNode.rotation() + konvaNode.angle()],
                    fill: {color: toHex(konvaNode.fill())},
                    line:konvaNode.stroke() ? {
                        color: toHex(konvaNode.stroke()),
                        width: konvaNode.strokeWidth() / 2,
                    } : undefined,
                });
                
            }

            //slide.addShape(pptx.shapes.ARC, { x: rx, y: ry, w: 1.5, h: 1.45, fill: { color: pptx.colors.ACCENT3 }, angleRange:[konvaNode.rotation(), konvaNode.rotation() + konvaNode.angle()] });
        }else if (ObjClassName === "WedgeRing") {
            let ir = konvaNode.innerRadius() * scale * thisScale
            let or = konvaNode.outerRadius() * scale * thisScale
            if( konvaNode.angle() > 0){
                
                slide.addShape(pptx.shapes.BLOCK_ARC, {
                    x: rx - or,
                    y: ry - or,
                    w: 2 * or,
                    h: 2 * or,
                    angleRange:[konvaNode.rotation(), konvaNode.rotation() + konvaNode.angle()],
                    arcThicknessRatio: 1 - (ir/or),
                    fill: {color: toHex(konvaNode.fill())},
                    line:konvaNode.stroke() ? {
                        color: toHex(konvaNode.stroke()),
                        width: konvaNode.strokeWidth() / 2,
                    } : undefined,
                });
                
                //slide.addShape(pptx.shapes.BLOCK_ARC, { x: 10.75, y: 2.45, w: 1.5, h: 1.45, fill: { color: pptx.colors.ACCENT3 }, arcThicknessRatio: 0.1,angleRange: [0,100] })
            }
        } else if (konvaNode instanceof Konva.Arc ) {
            const width = konvaNode.width() * scale * thisScale
            const height = konvaNode.height() * scale * thisScale
            if( false && konvaNode.innerRadius() > 0){
                const t=slide.addShape(pptx.shapes.BLOCK_ARC, {
                    x: rx - (rw/2),
                    y: ry - (rh/2),
                    w: rw,
                    h: rh,
                    //rotate: konvaNode.rotation(),
                    angleRange: [0, konvaNode.angle()],
                    fill: toHex(konvaNode.fill()),
                    line: {
                        color:toHex(konvaNode.stroke()),
                        width: konvaNode.strokeWidth() /2
                    },
                });
                console.log(t)
            }else{
                slide.addShape(pptx.shapes.ARC, {
                    x: rx - (rw/2),
                    y: ry - (rh/2),
                    w: rw,
                    h: rh,
                    rotate: konvaNode.rotation(),
                    angleRange: [0, konvaNode.angle()],
                    fill: toHex(konvaNode.fill()),
                    line: {
                        color:toHex(konvaNode.stroke()),
                        width: konvaNode.strokeWidth() /2
                    },
                });
            }
        } else if (konvaNode instanceof Konva.Rect ) {
            // Handle rectangle
            if( konvaNode.cornerRadius() > 0 ){
                slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
                    x: rx,
                    y: ry,
                    w: rw,
                    h: rh,
                    rectRadius: konvaNode.cornerRadius() * scale * thisScale,
                    line: konvaNode.stroke() ? {
                        color: toHex(konvaNode.stroke()),
                        width: konvaNode.strokeWidth() / 2,
                    } : undefined,
                    fill: toHex(konvaNode.fill()),
                });
            }else{
                slide.addShape(pptx.shapes.RECTANGLE, {
                    x: rx,
                    y: ry,
                    w: rw,
                    h: rh,
                    line: konvaNode.stroke() ? {
                        color: toHex(konvaNode.stroke()),
                        width: konvaNode.strokeWidth() / 2,
                    } : undefined,
                    fill: toHex(konvaNode.fill()),
                });
            }
        } else if (konvaNode instanceof Konva.Image || konvaNode instanceof CustomImage) {
            // Handle image
            let imgDataUrl = konvaNode.toDataURL();
            slide.addImage({
                data: imgDataUrl,
                x: rx,
                y: ry,
                w: rw,
                h: rh,
                ...(konvaNode.attrs.linkUrl ? {hyperlink: {url: konvaNode.attrs.linkUrl}} : {})
            });

            
            console.log(`img ${konvaNode.width() * scale * thisScale} ${konvaNode.height() * scale * thisScale}`)
        } else if (konvaNode instanceof Konva.Line) {

            let gradientFill = undefined

            if( konvaNode.fillLinearGradientStartPoint && konvaNode.fillLinearGradientEndPoint){
                const stops = konvaNode.fillLinearGradientColorStops()
                if(stops ){
                    gradientFill = {type:'gradient', stops: [{ pos: 0, color:'C1F15E' }, { pos: 62, color:'90BA3F' }, { pos: 100, color:'7FA03E'}],
                            linearAngle: 90, linearScaled: false}
                }
            }

            let points = [...konvaNode.points()];
            if(konvaNode.rotation()){
                points = rotatePoints( points, konvaNode.rotation() * Math.PI / 180)
            }
            const nodes = []
            let l, r, t, b
            console.log(points)
            while(points.length > 0){
                const x = points.shift()
                const y = points.shift()
                nodes.push( [x, y])
                if( l === undefined || x < l){l = x}
                if( t === undefined || y < t){t = y}
                if( r === undefined || x > r){r = x}
                if( b === undefined || y > b){b = y}
            }
            const sx = r-l
            const sy = b-t
            if( konvaNode.closed() ){
                nodes.push(nodes[0])
            }

            let outNodes = nodes.map(d=>({x: (d[0] - l) * thisScale * scale, y: (d[1] - t) * thisScale *  scale }))
            //console.log(outNodes)


            slide.addShape(pptx.shapes.CUSTOM_GEOMETRY, {
                x: rx + (l * scale * thisScale),
                y: ry + (t * scale * thisScale),
                w: sx * scale * thisScale,
                h: sy * scale * thisScale,
                fill: gradientFill ?? konvaNode.closed() ? toHex(konvaNode.fill()) :  undefined,
                line: konvaNode.strokeEnabled() ? { color: toHex(konvaNode.stroke()), width: konvaNode.strokeWidth() } : undefined,
                points: outNodes
            });
        } else if (konvaNode instanceof Konva.Group) {
            for(const child of konvaNode.children){
                processNode(child, x, y, thisScale  )
            }
        }
    }

    if( stage.getClassName() == "Stage"){
        for( const layer of stage.children){
            for( const konvaNode of layer.children ){
                processNode( konvaNode, -minX + (slidePadding[3] / gScale), -minY + (slidePadding[0] / gScale) )
            }
        }
    }else{
        if( options.noFraming){
            processNode(stage, 0, 0, rootScale, true)
        }else{
            for(const child of stage.children){
                processNode( child, -minX + (slidePadding[3] / gScale), -minY + (slidePadding[0] / gScale), rootScale )
            }
        }
    }
    if( options.title ){
        slide.addText(options.title, {
            x: widthInInches * 0.75,
            y: 0.1,
            w: widthInInches * 0.25,
            align: "right",
            fontSize: 40,
        });
    }

    if( savePptx ){
        writePptx(pptx)
    }
    return startSlide
}


function rotatePoints(points, angleRadians, pivot = [0, 0]) {
    const [pX, pY] = pivot;
    const rotatedPoints = [];
  
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i] - pX;
      const y = points[i + 1] - pY;
  
      const xRot = x * Math.cos(angleRadians) - y * Math.sin(angleRadians);
      const yRot = x * Math.sin(angleRadians) + y * Math.cos(angleRadians);
  
      rotatedPoints.push(xRot + pX, yRot + pY);
    }
    return rotatedPoints;
  }


export function writePptx(pptx){
    pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
}