
import jsPDF from 'jspdf';
import { Canvg } from 'canvg';
import { renderToString } from 'react-dom/server';
import CoCreatedLogo from './CoCreatedLogo';

window.exportViewToPdf = exportViewToPdf

function deepCloneNodeWithCanvas(element) {
    if (!element) {
      return null;
    }
  
    // Handle <canvas> elements
    if (element.tagName === 'CANVAS') {
      const originalContext = element.getContext('2d');
  
      // Create a new canvas element
      const clonedCanvas = document.createElement('canvas');
      clonedCanvas.width = element.width;
      clonedCanvas.height = element.height;
      clonedCanvas.style.width = element.style.width;
      clonedCanvas.style.height = element.style.height;
      const clonedContext = clonedCanvas.getContext('2d');
  
      // Copy the content from the original canvas to the cloned canvas
      clonedContext.drawImage(element, 0, 0);
      clonedContext.globalCompositeOperation = 'destination-over'
      clonedContext.fillStyle = "white";
      clonedContext.fillRect(0, 0, clonedCanvas.width, clonedCanvas.height);
  
      return clonedCanvas;
    }
  
    // Clone the current element
    const clonedElement = element.cloneNode(false); // Don't clone children yet
  
    // Clone and append child nodes
    const childNodes = element.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      const clonedChild = deepCloneNodeWithCanvas(childNodes[i]);
      if (clonedChild) {
        clonedElement.appendChild(clonedChild);
      }
    }
  
    return clonedElement;
  }

export async function convertSVGToCanvas( svgElement, width, height){
    const canvasElement = document.createElement('canvas');

    // Set the canvas element's dimensions to match the SVG
    canvasElement.width = width ?? svgElement.clientWidth * 2 ;
    canvasElement.height = height ?? svgElement.clientHeight * 2;
    const context = canvasElement.getContext('2d')
    
    // Insert the canvas element before the SVG element
    
    // Convert the SVG to canvas using canvg
    let string =  typeof(svgElement) === "string" ? svgElement : new XMLSerializer().serializeToString(svgElement)
    let color = typeof(svgElement) === "string" ? undefined : window.getComputedStyle( svgElement )?.color
    if( string && color){
        string = string.replaceAll('currentColor', color)          
        console.log(string)
    }
    const c = await Canvg.from(context, string);
    c.start()
    canvasElement.style.width = (width ?? svgElement.clientWidth) + 'px';
    canvasElement.style.height = (height ?? svgElement.clientHeight) + 'px';
    
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = "white";
    context.fillRect(0, 0, canvasElement.width, canvasElement.height);
    return canvasElement

}

export async function exportViewToPdf( orignal_element, options = {} ){

    const style = document.createElement('style');
    document.head.appendChild(style);
    style.sheet?.insertRule('body > div:last-child img { display: inline-block; }');

    //const element = orignal_element.cloneNode( true )
    const element = deepCloneNodeWithCanvas( orignal_element )
    document.body.appendChild(element)

   for( const bg of element.querySelectorAll('.vfbgshape')){
    bg.style.background='transparent'
    bg.style.border='1px solid #aaa'
   }


    const headerCanvas = await convertSVGToCanvas( renderToString(CoCreatedLogo()) )
    document.body.appendChild(headerCanvas)

    const {width = 210, 
        height = 297, 
        margin = [20, 10, 20, 10],
        logo = [8, -8, 27, 6],
        } = options
    const eWidth = width - (margin[1] + margin[3])
    const eHeight = height - (margin[0] + margin[2])

    const oldTx = element.style.transform
    element.style.transform = null


    const scale = Math.min(1, eWidth / element.offsetWidth)

    let pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true,
       
        });

        
    
        const list = []
        const convertElements = element.querySelectorAll('svg');
        for(const svgElement of convertElements){
            const canvasElement = await convertSVGToCanvas( svgElement )
            svgElement.parentNode.insertBefore(canvasElement, svgElement);
          
            list.push( [svgElement, canvasElement, svgElement.style.display] )
            svgElement.style.display = 'none';
        }
        const pages = {}
        const scaledHeight = eHeight / scale
        const targets = [...element.childNodes].map((d)=>[...d.childNodes]).flat()
        let pageOffset = 0
        let lastStart = 0
        let page = 0
        let topShift = {}
        for( const el of targets){
            const oldLastStart = lastStart
            lastStart = Math.max(lastStart, el.offsetTop + el.offsetHeight)
            pageOffset += lastStart- oldLastStart
            const nextPage = pageOffset > scaledHeight
            if( nextPage ){
                page++
                pageOffset = lastStart- oldLastStart
            }
            pages[page] = pages[page] || [] 
            pages[page].push( el )
            topShift[page] = topShift[page]  || el.offsetTop 
        }
        element.style.background='transparent'

            const bandColors = [
                "#00d967",
                "#34e184",
                "#65e8a2",
                "#99f0c2",
                "#65e8a2",
                "#34e184",
                "#00d967",
                "#34e184",
                "#65e8a2",
                "#99f0c2",
                "#65e8a2",
                "#34e184",
            ]
            const bandSize  = width / bandColors.length

        for( const page of Object.keys(pages)){
            for( const page2 of Object.keys(pages)){
                for( const item of pages[page2]){
                    if(item.style){
                        item.style.display = page2 === page ? null : 'none';
                    }
                }

            }
            const pageTop = (parseInt(page) * height)

            bandColors.forEach((d, idx)=>{
                pdf.setFillColor( d )
                pdf.rect(idx * bandSize, 0, bandSize, 3, "F")
            })



            pdf.addImage(
                headerCanvas, 
                logo[0] < 0 ? width + logo[0] : logo[0] , 
                logo[1] < 0 ? height + logo[1] - logo[3] : logo[1] , 
                logo[2],
                logo[3])

            await pdf.html(element, {
                    x: margin[3], //+ item.offsetLeft,
                    y: margin[0] +  pageTop,
                    margin: [0,0,0,0],
                    html2canvas: {
                        scale: scale ,
                    },
                    callback: (updatedPdf)=>{
                        if( parseInt(page) < (Object.keys(pages).length - 1)){
                            updatedPdf.addPage()
                        }
                        return updatedPdf
                    }
                    
                })

        }
        await pdf.save("download.pdf")
    style.remove();
    //    element.parentNode.removeChild(element)
      //  headerCanvas.parentNode.removeChild(headerCanvas)
       
}