import pptxgen from "pptxgenjs";
import Konva from "konva";

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
export async function exportKonvaToPptx( stage ){
    let pptx = new pptxgen();

    let widthInInches = 10 * 4
    let heightInInches = 5.625 * 4

    pptx.defineLayout({ name:'VF_CUSTOM', width: widthInInches, height: heightInInches });
    pptx.layout = 'VF_CUSTOM'


    let slide = pptx.addSlide();

    let maxX = 0, maxY = 0
    for( const layer of stage.children){
        for( const konvaNode of layer.children ){
            const r = konvaNode.x() + konvaNode.width()
            const b = konvaNode.y() + konvaNode.height()
            if( r > maxX){ maxX = r}
            if( b > maxY){ maxY = b}
        }
    }

    const scale = Math.min( widthInInches / maxX, heightInInches / maxY )
    const fontScale = scale * 72 // 0.95

    const stageNode = stage.container()
    if( stageNode.style.backgroundColor && stageNode.style.backgroundColor !== ""){
        slide.background = {color: toHex(stageNode.style.backgroundColor)}

    }

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
    function processNode( konvaNode, ox = 0, oy = 0 ){
        const x = ox + konvaNode.x()
        const y = oy + konvaNode.y()
        let fragmentJoin = " " // "\n"


        if (konvaNode instanceof Konva.Text) {
            const fontSize = konvaNode.fontSize() * fontScale

            let text = konvaNode.textArr.map(d=>d.text).join(fragmentJoin)

            slide.addText(text, {
                x: x * scale,
                y: y * scale,
                w: konvaNode.width() * scale,
                h: konvaNode.height() * scale,
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
        } else if (konvaNode instanceof Konva.Rect) {
            // Handle rectangle
            if( konvaNode.cornerRadius() > 0 ){
                slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
                    x: x * scale,
                    y: y * scale,
                    w: konvaNode.width() * scale,
                    h: konvaNode.height() * scale,
                    rectRadius: konvaNode.cornerRadius() * scale,
                    fill: toHex(konvaNode.fill()),
                });
            }else{
                slide.addShape(pptx.shapes.RECTANGLE, {
                    x: x * scale,
                    y: y * scale,
                    w: konvaNode.width() * scale,
                    h: konvaNode.height() * scale,
                    fill: toHex(konvaNode.fill()),
                });
            }
        } else if (konvaNode instanceof Konva.Image) {
            // Handle image
            let imgDataUrl = konvaNode.toDataURL();
            slide.addImage({
                data: imgDataUrl,
                x: x * scale,
                y: y * scale,
                w: konvaNode.width() * scale,
                h: konvaNode.height() * scale
            });
        } else if (konvaNode instanceof Konva.Line) {
            const points = konvaNode.points();
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

            const outNodes = nodes.map(d=>({x: (d[0] - l) * scale, y: (d[1] - t) * scale }))
            console.log(outNodes)

            slide.addShape(pptx.shapes.CUSTOM_GEOMETRY, {
                x: (x + l) * scale,
                y: (y + t) * scale,
                w: sx * scale,
                h: sy * scale ,
                line: { color: toHex(konvaNode.stroke()), width: konvaNode.strokeWidth() },
                points: outNodes
            });
        } else if (konvaNode instanceof Konva.Group) {
            for(const child of konvaNode.children){
                processNode(child, x, y )
            }
        }
    }

    for( const layer of stage.children){
        for( const konvaNode of layer.children ){
            processNode( konvaNode )
        }
    }

    pptx.writeFile({ fileName: "Konva_Stage_Export.pptx" });
}