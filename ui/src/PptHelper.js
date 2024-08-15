import pptxgen from "pptxgenjs";
import Konva from "konva";
import CustomImage from "./CustomImage";

/*
export async function exportKonvaToPptx( konva ){

    // 1. Create a Presentation
    let pres = new pptxgen();
    
    // 2. Add a Slide to the presentation
    let slide = pres.addSlide();
    
    // 3. Add 1+ objects (Tables, Shapes, etc.) to the Slide
    slide.addText("Hello World from PptxGenJS...", {
        x: 1.5,
        y: 1.5,
        color: "363636",
        fill: { color: "F1F1F1" },
        align: pres.AlignH.center,
    });
    
    // 4. Save the Presentation
    await pres.writeFile({ fileName: "Sample Presentation.pptx" });
}*/
const widthInInches = 10 * 4
const heightInInches = 5.625 * 4
export function createPptx(  options ){
    const pptx = new pptxgen();
    
    pptx.defineLayout({ name:'VF_CUSTOM', width: widthInInches, height: heightInInches });
    pptx.layout = 'VF_CUSTOM'
    return pptx
}
export async function exportKonvaToPptx( stage, pptx, options = {} ){
    let savePptx = false
    
    if( !pptx ){
        pptx = createPptx()
        savePptx = true
    }


    let slide = pptx.addSlide();

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
        rootScale = stage.scaleX() 
        maxX = stage.width()  * rootScale
        maxY = stage.height() * rootScale
        rootScale = 1

    }

    let slidePadding = options.padding ?? [0,0,0,0]

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
        
        const x = first ? (slidePadding[3] / gScale) : ( ox + (konvaNode.x() * pScale))
        const y = first ? (slidePadding[0] / gScale) : (oy + (konvaNode.y() * pScale))

        
        let thisScale = konvaNode.scale()?.x ?? 1
        thisScale *= pScale
        let scale = gScale


        let rx = x * scale, ry = (y - pageOffset) * scale
        let rw = konvaNode.width() * scale * thisScale, rh = konvaNode.height() * scale * thisScale

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

            const fontSize = konvaNode.fontSize() * fontScale * thisScale
            const largeFontSize = (konvaNode.fontSize() * 1.5) * fontScale * thisScale

            //indent,large, bold
            if( konvaNode.className === "CustomText"){
                let indentTracker = false, indentLevel = 0, yTracker
                let agg = []
                let stack = []               
                let hasIndents = false
                let spacingAfter = 0, spacingBefore = 0
                let lastBold, lastIndent, lastLarge, lastBullet, lastWasLastInPara, lastEndList 
                console.log(konvaNode.textArr)
                for( const d of konvaNode.textArr){
                    let flush = false
                    if( d.bullet ){
                        hasIndents = true
                        if( indentTracker ){
                            if( d.indent > indentTracker ){
                                indentLevel++
                                flush = true
                            }else if( d.indent < indentTracker ){
                                indentLevel--
                                flush = true
                            }else{
                                if( lastWasLastInPara ){
                                    flush = true
                                }
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
                            flush = true
                        }
                    }
                    if( lastBold !== undefined && d.bold != lastBold){
                        flush = true
                    }
                    spacingBefore = 0
                    spacingAfter = 0
                    let markEndList = false
                    if( lastEndList) {
                        spacingBefore = largeFontSize * 0.5
                    }
                    if( flush ){
                        if( lastLarge ){
                            spacingAfter = largeFontSize * 0.05
                            //spacingAfter = 0
                        }
                        if( agg.length ){
                            if( lastIndent ){
                                spacingBefore = fontSize * 0.2
                                if( indentLevel === 0){
                                    markEndList = true
                                }
                            }
                            stack.push({
                                text: agg.join(" ") + (!d.bullet && lastIndent === 0 ? "\n" : ""),
                                options:{
                                    paraSpaceBefore: spacingBefore,
                                    paraSpaceAfter: spacingAfter,
                                    bold: lastBold,
                                    bullet: lastBullet && lastIndent ? {indentLevel: indentLevel, indent: (fontScale * 10).toFixed(3)} : false,
                                    fontSize: (lastLarge ?  largeFontSize : fontSize).toFixed(3),
                                    breakLine: markEndList ? true : false 
                                }
                            })
                            agg = []
                        }
                    }
                    agg.push(d.text)
                    lastBold = d.bold
                    lastIndent = indentLevel
                    lastLarge = d.large
                    lastBullet = d.bullet
                    lastWasLastInPara = d.lastInParagraph
                    lastEndList = markEndList
                }
                if( agg.length > 0){
                    stack.push({
                        text: agg.join(" "),
                        options:{
                            bold: lastBold,
                            paraSpaceBefore: spacingBefore,
                            bullet: lastBullet && lastIndent ? {indentLevel: indentLevel, indent: ( fontScale * 10).toFixed(3)} : false,
                            fontSize: (lastLarge ?  largeFontSize : fontSize).toFixed(3),
                        }
                    })
                }
                console.log(stack)
                slide.addText(stack, {
                    x: rx,
                    y: ry,
                    w: rw,
                    h: rh,
                    bold: konvaNode.fontStyle() === "bold",
                    lineSpacingMultiple: konvaNode.lineHeight() * 0.866,
                    italic: konvaNode.fontStyle() === "italic",
                    fontFace: konvaNode.fontFamily(),
                    align: hasIndents ? undefined : konvaNode.align(),
                    valign: hasIndents ? undefined : konvaNode.verticalAlign(),
                    margin:konvaNode.padding(),
                    fontSize: fontSize.toFixed(3),
                    color: toHex(konvaNode.fill()),
                });
            }else{

                let text = konvaNode.textArr.reduce((a,d)=>a + (d.lastInParagraph ? d.text + "\n" : d.text + " "), "")
                
                slide.addText(text, {
                    x: rx,
                    y: ry,
                    w: rw,
                    h: rh,
                    bold: konvaNode.fontStyle() === "bold",
                    lineSpacingMultiple: konvaNode.lineHeight() * 0.866,
                    italic: konvaNode.fontStyle() === "italic",
                    fontFace: konvaNode.fontFamily(),
                    align: konvaNode.align(),
                    valign: konvaNode.verticalAlign(),
                    margin:konvaNode.padding(),
                    fontSize: fontSize.toFixed(3),
                    color: toHex(konvaNode.fill()),
                });
            }
        } else if (konvaNode instanceof Konva.Circle ) {
            // Handle rectangle
                slide.addShape(pptx.shapes.OVAL, {
                    x: rx - (rw/2),
                    y: ry - (rh/2),
                    w: rw,
                    h: rh,
                    fill: toHex(konvaNode.fill()),
                    line: {
                        color:toHex(konvaNode.stroke()),
                        width: konvaNode.strokeWidth() /2
                    },
                });
        } else if (konvaNode instanceof Konva.Arc ) {
            // Handle rectangle
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
                    fill: toHex(konvaNode.fill()),
                });
            }else{
                slide.addShape(pptx.shapes.RECTANGLE, {
                    x: rx,
                    y: ry,
                    w: rw,
                    h: rh,
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
            });
            console.log(`img ${konvaNode.width() * scale * thisScale} ${konvaNode.height() * scale * thisScale}`)
        } else if (konvaNode instanceof Konva.Line) {

            let gradientFill = undefined

            if( konvaNode.fillLinearGradientStartPoint && konvaNode.fillLinearGradientEndPoint){
                const stops = konvaNode.fillLinearGradientColorStops()
                if(stops ){
                    gradientFill = {
                        type: 'gradient',
                        stops: [
                            { pos: stops[0] * 100, color: stops[1].slice(1)},
                            { pos: stops[2] * 100, color: stops[3].slice(1)},
                        ]
                    };
                    gradientFill = {
                        type: "linearGradient",
                        stops: [
                            { position: 0, color: '000000', transparency: 10 },
                            { position: 100, color: '333333', transparency: 50 },
                        ],
                        angle: 45,
                        scaled: 1,
                        rotWithShape: false,
                        tileRect: { t: 0, r: 0.5, b: 0.25, l: 1 },
                        flip: 'xy',
                    }
                }
            }

            const points = [...konvaNode.points()];
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
            console.log(nodes)
            console.log(l,t,r,b)
            const sx = r-l
            const sy = b-t
            console.log(sx,sy)

            const outNodes = nodes.map(d=>({x: (d[0] - l) * thisScale * scale, y: (d[1] - t) * thisScale *  scale }))
            console.log(outNodes)

            slide.addShape(pptx.shapes.CUSTOM_GEOMETRY, {
                x: rx + (l * scale * thisScale),
                y: ry + (t * scale * thisScale),
                w: sx * scale * thisScale,
                h: sy * scale * thisScale,
                fill: gradientFill,
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
        processNode(stage, 0, 0, rootScale, true)
    }

    if( savePptx ){
        writePptx(pptx)
    }
}
export function writePptx(pptx){
    pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
}