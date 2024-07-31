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
export async function exportKonvaToPptx( stage, pptx, options ){
    let savePptx = false
    
    let widthInInches = 10 * 4
    let heightInInches = 5.625 * 4

    if( !pptx ){
        pptx = new pptxgen();
        
        
        pptx.defineLayout({ name:'VF_CUSTOM', width: widthInInches, height: heightInInches });
        pptx.layout = 'VF_CUSTOM'
        savePptx = true
    }


    let slide = pptx.addSlide();

    let minX = 0, minY = 0
    let maxX = 0, maxY = 0
    let rootScale = 1
    if( stage.getClassName() == "Stage"){
        for( const layer of stage.children){
            for( const konvaNode of layer.children ){
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
    }else{
        rootScale = stage.scaleX() 
        maxX = stage.width()  * rootScale
        maxY = stage.height() * rootScale
        rootScale = 1

        console.log(minX, minY, maxX, maxY, rootScale)
    }

    const gScale = Math.min( widthInInches / maxX, heightInInches / maxY )
    const fontScale = gScale * 72 // 0.95


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
        
        const x = first ? 0 : ( ox + (konvaNode.x() * pScale))
        const y = first ? 0 : (oy + (konvaNode.y() * pScale))
        
        let thisScale = konvaNode.scale()?.x ?? 1
        thisScale *= pScale
        let scale = gScale

        if (konvaNode instanceof Konva.Text) {
            const fontSize = konvaNode.fontSize() * fontScale * thisScale

            let text = konvaNode.textArr.reduce((a,d)=>a + (d.lastInParagraph ? d.text + "\n" : d.text + " "), "")

            slide.addText(text, {
                x: x * scale,
                y: y * scale,
                w: konvaNode.width() * scale * thisScale,
                h: konvaNode.height() * scale * thisScale,
                bold: konvaNode.fontStyle() === "bold",
                lineSpacing: konvaNode.lineHeight() * fontSize,
                italic: konvaNode.fontStyle() === "italic",
                fontFace: konvaNode.fontFamily(),
                align: konvaNode.align(),
                valign: konvaNode.verticalAlign(),
                margin:konvaNode.padding(),
                fontSize: fontSize.toFixed(3),
                color: toHex(konvaNode.fill()),
            });
        } else if (konvaNode instanceof Konva.Rect ) {
            // Handle rectangle
            if( konvaNode.cornerRadius() > 0 ){
                slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
                    x: x * scale,
                    y: y * scale,
                    w: konvaNode.width() * scale * thisScale,
                    h: konvaNode.height() * scale * thisScale,
                    rectRadius: konvaNode.cornerRadius() * scale * thisScale,
                    fill: toHex(konvaNode.fill()),
                });
            }else{
                slide.addShape(pptx.shapes.RECTANGLE, {
                    x: x * scale,
                    y: y * scale,
                    w: konvaNode.width() * scale * thisScale,
                    h: konvaNode.height() * scale * thisScale,
                    fill: toHex(konvaNode.fill()),
                });
            }
        } else if (konvaNode instanceof Konva.Image || konvaNode instanceof CustomImage) {
            // Handle image
            let imgDataUrl = konvaNode.toDataURL();
            slide.addImage({
                data: imgDataUrl,
                x: x * scale,
                y: y * scale,
                w: konvaNode.width() * scale * thisScale,
                h: konvaNode.height() * scale * thisScale
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
                x: (x * scale) + (l * scale * thisScale),
                y: (y * scale) + (t * scale * thisScale),
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
                processNode( konvaNode )
            }
        }
    }else{
        processNode(stage, 0, 0, rootScale, true)
    }

    if( savePptx ){
        pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
    }
}