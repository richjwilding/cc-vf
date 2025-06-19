import { SceneCanvas } from "konva/lib/Canvas";
import { Factory } from "konva/lib/Factory";
import { _registerNode } from "konva/lib/Global";
import { Util } from "konva/lib/Util";
import { getBooleanValidator, getNumberOrAutoValidator, getNumberValidator, getStringValidator } from "konva/lib/Validators";
import { Text } from "konva/lib/shapes/Text";
import { markdownToSlate } from "./SharedTransforms";

var DISABLE_CANVAS = true
var AUTO = 'auto',
  //CANVAS = 'canvas',
  CENTER = 'center',
  INHERIT = 'inherit',
  JUSTIFY = 'justify',
  CHANGE_KONVA = 'Change.konva',
  CONTEXT_2D = '2d',
  DASH = '-',
  LEFT = 'left',
  LTR = 'ltr',
  TEXT = 'text',
  TEXT_UPPER = 'Text',
  TOP = 'top',
  BOTTOM = 'bottom',
  MIDDLE = 'middle',
  NORMAL = 'normal',
  PX_SPACE = 'px ',
  SPACE = ' ',
  RIGHT = 'right',
  RTL = 'rtl',
  WORD = 'word',
  CHAR = 'char',
  NONE = 'none',
  ELLIPSIS = '…',
  ATTR_CHANGE_LIST = [
    'direction',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontVariant',
    'padding',
    'align',
    'verticalAlign',
    'lineHeight',
    'text',
    'width',
    'height',
    'wrap',
    'ellipsis',
    'letterSpacing',
  ],
  // cached variables
  attrChangeListLen = ATTR_CHANGE_LIST.length;


const HEATMAP = {
  colors:[
    "#f6d7dc",
    "#fbeadb",
    "#fcfcf7",
    "#e5f1e3",
    "#cae5df"
  ]
}

var dummyContext;
function getDummyContext() {
    if (dummyContext) {
        return dummyContext;
    }
    dummyContext = Util.createCanvasElement().getContext(CONTEXT_2D);
    dummyContext.textBaseline = MIDDLE
    return dummyContext;
}
  function normalizeFontFamily(fontFamily) {
      return fontFamily
        .split(',')
        .map((family) => {
          family = family.trim();
          const hasSpace = family.indexOf(' ') >= 0;
          const hasQuotes = family.indexOf('"') >= 0 || family.indexOf("'") >= 0;
          if (hasSpace && !hasQuotes) {
            family = `"${family}"`;
          }
          return family;
        })
        .join(', ');
    }
    

class CustomText extends Text {

  _buildPrivateCache(){
    if( this.textWidth === 0){
        return
    }

    let w = this.attrs.width//this.width()
    let h = this._cachedHeight

      this.pcache = document.createElement('canvas');
      this.pcache.width = w * this.scaleRatio;
      this.pcache.height = h * this.scaleRatio;
      this.pcache._canvas_context = this.pcache.getContext('2d');


      this.pcache.style.padding = '0';
      this.pcache.style.margin = '0';
      this.pcache.style.border = '0';
      this.pcache.style.position = 'absolute';
      this.pcache.style.top = '0';
      this.pcache.style.left = '0';


      this.attrs.bgFill = this.attrs.bgFill || "white"


      this.lastScale = 1
    this.uWidth = this.pcache.width
    this.uHeight = this.pcache.height

    this.pcache._canvas_context.fillStyle = this.attrs.bgFill 
    this.pcache._canvas_context.fillRect(0,0,  this.uWidth, this.uHeight)
    this.pcache._canvas_context.font = this.fontCache
    this.pcache._canvas_context.textBaseline = MIDDLE
    this.pcache._canvas_context.textAlign = LEFT


  }
  getHeight() {
    if( this.attrs.withMarkdown ){
      var isAuto = this.attrs.height === AUTO || this.attrs.height === undefined;

      const lastItem = this.textArr.slice(-1)?.[0]

      if( lastItem?.tableInfo ){
        return lastItem?.tableInfo.tableHeight
      }

      return isAuto
      ? (lastItem?.y ?? 0) + (this.lineHeight() * this.fontSize() / 2)
      : this.attrs.height;
    }else{
      return super.getHeight()
    }
  }
  _addMDTextLine(line, metrics, indent, y, bold, large, bullet, color, fontScale, tableInfo) {
      const align = this.align();
      if (align === JUSTIFY) {
          line = line.trim();
      }
      return this.textArr.push({
          text: line,
          width: metrics.width,
          ascent: metrics.ascent,
          descent: metrics.descent,
          y: y,
          bold: bold,
          large: large,
          bullet: bullet,
          indent: indent,
          lastInParagraph: false,
          fontScale: fontScale,
          tableInfo,
          color
      });
  }
  setFont
  _getTextStats(text) {
      const metrics = getDummyContext().measureText(text)
      return {width: metrics.width, ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent}
  }

    _MDtryToAddEllipsisToLastLine() {
        var width = this.attrs.width, fixedWidth = width !== AUTO && width !== undefined, padding = this.padding(), maxWidth = width - padding * 2, shouldAddEllipsis = this.ellipsis();
        var lastLine = this.textArr[this.textArr.length - 1];
        if (!lastLine || !shouldAddEllipsis) {
            return;
        }
        if (fixedWidth) {
            var haveSpace = this._getTextWidth(lastLine.text + ELLIPSIS) < maxWidth;
            if (!haveSpace) {
                lastLine.text = lastLine.text.slice(0, lastLine.text.length - 3);
            }
        }
        //lastLine.text += ELLIPSIS
        //lastLine.width = this._getTextWidth(lastLine.text);
        this.textArr.splice(this.textArr.length - 1, 1);
        this._addMDTextLine(lastLine.text + ELLIPSIS, 
                            {width:lastLine.width, ascent: lastLine.ascent, descent: lastLine.descent},
                            lastLine.indent, 
                            lastLine.y, 
                            lastLine.bold,
                            lastLine.large,
                            lastLine.bullet,
                            lastLine.color,
                            lastLine.fontScale,
                            lastLine.tableInfo
        )
    }


    _getContextFont(options = {}) {
      return (
        (options.style ?? this.fontStyle()) +
        SPACE +
        (options.variant ?? this.fontVariant()) +
        SPACE +
        (options.weight ?? "normal") +
        SPACE +
        ((options.size ?? this.fontSize()) + PX_SPACE) +
        // wrap font family into " so font families with spaces works ok
        normalizeFontFamily(options.family ?? this.fontFamily())
      );
    }

_setTextData() {
  /*if( !this.text().startsWith("### Brand\nPet Travel Hub by Mars Petcare & Tripadviso")){
    return this._setTextDataOLD()
  }*/

    this.fontCache = this._getContextFont()
    

  if( this.fontStyle() === "light"){
    this.standardFont = this._getContextFont({style: "normal", weight: 300})
    this.boldFont = this._getContextFont({style: "normal", weight: 500})
    this.headlineFont = this._getContextFont({style: "normal", weight: 500, size: this.fontSize() * 1.5 })
  }else if( this.fontStyle() === "bold"){
    this.standardFont = this._getContextFont({style: "normal", weight: 600})
    this.boldFont = this._getContextFont({style: "normal", weight: 900})
    this.headlineFont = this._getContextFont({style: "normal", weight: 900, size: this.fontSize() * 1.5 })
  }else{
    this.standardFont = this._getContextFont({weight: "normal"})
    this.boldFont = this._getContextFont({weight: "bold"})
    this.headlineFont = this._getContextFont({weight: "bold", size: this.fontSize() * 1.5 })
  }

  if( !this.attrs.withMarkdown ){
    super._setTextData()
    this._cachedHeight = this.height()
    return
  }

  const formattedList = markdownToSlate( this.text()) 
  const p = formattedList[formattedList.length - 1]
  if( p.children.length === 1 && p.type === "paragraph" && p.children[0].text.length === 0 ){
    formattedList.pop()
  }
  if( this.tableDecoration ){
    delete this["tableDecoration"]
  }
  
  var fontSize = +this.fontSize(),
      baseLineHeightPx = this.lineHeight() * fontSize, 
      width = this.attrs.width, 
      height = this.attrs.height, 
      fixedWidth = width !== AUTO && width !== undefined, 
      fixedHeight = height !== AUTO && height !== undefined, 
      padding = this.padding(), 
      maxWidth = width - padding * 2, 
      maxHeightPx = height - padding * 2, 
      currentHeightPx = 0, 
      wrap = this.wrap(), 
      shouldWrap = wrap !== NONE, 
      wrapAtWord = wrap !== CHAR && shouldWrap, 
      shouldAddEllipsis = this.ellipsis();

  let translateY
  let lineHeightPx 
  this.textArr = [];
  
  var additionalWidth = shouldAddEllipsis ? this._getTextStats(ELLIPSIS).width : 0;

  let placeTextWidth = maxWidth
  let fontScaleForTable = 1
  

  const placeText = ( text, large, bold, drawBullet, startIndent, indent, color, lastLine, tableInfo )=>{
    
    let targetFont = bold ? (large ? this.headlineFont : this.boldFont) : (large ? this.headlineFont : this.standardFont)
    if( fontScaleForTable != 1){
      const size = targetFont.match(/(\d+.?\d+)px/)
      targetFont = targetFont.replace(size[0], (size[1] * fontScaleForTable) + "px")
    }
    getDummyContext().font = targetFont
    
    let lineMetrics = this._getTextStats(text)
    let lineWidth = lineMetrics.width + indent;
    var leaveForHeight = false
    let advanced = false
    let textWidth = 0
    
    if( translateY === undefined || tableInfo?.first){
      translateY = lineHeightPx / 2 ;
    }

    if (lineWidth > placeTextWidth) {
      let frag = 0, retry = false
      while (text.length > 0) {
          var low = 0, high = text.length, match = '', matchWidth = 0;
          while (low < high) {
              var mid = (low + high) >>> 1, substr = text.slice(0, mid + 1), substrWidth = this._getTextStats(substr).width + additionalWidth + indent
              if (substrWidth <= placeTextWidth) {
                  low = mid + 1;
                  match = substr;
                  matchWidth = substrWidth;
              }
              else {
                  high = mid;
              }
          }
          if (match) {
              let matchMetrics
              if (wrapAtWord) {
                  var wrapIndex;
                  var nextChar = text[match.length];
                  var nextIsSpaceOrDash = nextChar === SPACE || nextChar === DASH;
                  if (nextIsSpaceOrDash && matchWidth <= placeTextWidth) {
                      wrapIndex = match.length;
                  }
                  else {
                      wrapIndex =
                          Math.max(match.lastIndexOf(SPACE), match.lastIndexOf(DASH)) +
                              1;
                  }
                  if (wrapIndex > 0) {
                      low = wrapIndex;
                      match = match.slice(0, low);
                    }
                    matchMetrics = this._getTextStats(match)
                    matchWidth = matchMetrics.width + indent;
              }
              match = match.trimRight();
              this._addMDTextLine(match, matchMetrics, indent, currentHeightPx + translateY, bold, large, drawBullet && (frag === 0), color, fontScaleForTable, tableInfo);
              indent = startIndent
              textWidth = Math.max(textWidth, matchWidth);
              currentHeightPx += lineHeightPx;
              advanced = true
              var shouldHandleEllipsis = this._shouldHandleEllipsis(currentHeightPx);
              if (shouldHandleEllipsis) {
                  this._MDtryToAddEllipsisToLastLine();
                  leaveForHeight = true
                  break;
              }
              text = text.slice(low);
              text = text.trimLeft();
              if (text.length > 0) {
                  lineMetrics = this._getTextStats(text)
                  lineWidth = lineMetrics.width + indent;
                  if (lineWidth <= placeTextWidth) {
                      this._addMDTextLine(text, lineMetrics, indent, currentHeightPx + translateY, bold, large, false, color, fontScaleForTable, tableInfo);
                      advanced = false
                      textWidth = Math.max(textWidth, lineWidth);
                      break;
                  }
              }
          }
          else {
              break;
          }
          frag++
          if( leaveForHeight ){
            break
          }
      }
      if( frag === 0 && indent > startIndent ){
        currentHeightPx += lineHeightPx;
        const partial = placeText( text, large, bold, drawBullet, startIndent, startIndent, color, lastLine, tableInfo )
        indent = partial.indent
        advanced = partial.advanced
        textWidth = partial.textWidth
        lineWidth = partial.indent

      }
    }else {
      this._addMDTextLine(text, lineMetrics, indent, currentHeightPx + translateY, bold, large, drawBullet, color, fontScaleForTable, tableInfo);
      textWidth = Math.max(textWidth, lineWidth);
      if (this._shouldHandleEllipsis(currentHeightPx ) && !lastLine) {
        this._MDtryToAddEllipsisToLastLine();
        leaveForHeight = true
      }
    }
    indent = lineWidth

    return {indent: indent, newline: advanced, clippedForHeight: leaveForHeight, textWidth}
  }

  let maxUsedWidth = 0
  let lastWasHeading, lastWasListItem,lastLineHeight
  let startIndent = 0
  let clipped


  let indentWidths = []

  const processSection = ( section, lastSection, tableInfo, partOfListItem )=>{
    if( clipped ){
      return
    }
    const isHeading = section.type === "heading"
    const isListItem = section.type === "list-item" || partOfListItem
    const large = isHeading


    let didAdvance = false, needAdvance = false
    lineHeightPx = large ? baseLineHeightPx * 1.2 : baseLineHeightPx

    if( section.type === "unordered-list" || section.type === "ordered-list"){
      const px = "" + lineHeightPx
      if( !indentWidths[px] ){
        getDummyContext().font = (large ? this.headlineFont : this.standardFont)
        indentWidths[px] = this._getTextStats("    ").width
      }
      let preIndent = startIndent
      startIndent += indentWidths[px]
      
      if( section.children ){
          currentHeightPx += (lineHeightPx * 0.35);
        for(const sub of section.children ){
          processSection( sub, false, false )
        }
        if(this.textArr[this.textArr.length - 1]) {
          this.textArr[this.textArr.length - 1].lastInParagraph = true;
        }
      }

      startIndent = preIndent
    }else if( section.type === "table"){
      const rows = section.children
      const startX = startIndent
      this.tableDecoration ||= []
      if(rows.length > 0){
        const columnCount = rows[0].children.length
        if( columnCount > 9){
          fontScaleForTable = 0.35
        }else if( columnCount > 6){
          fontScaleForTable = 0.4
        }else if( columnCount > 3){
          fontScaleForTable = 0.8
        }
        const mainLineHeight = baseLineHeightPx
        //const heatRegex = /^(\d+)(?: - | – |: |\s+)(.*)$/
        //const heatOrSentimentRegex = /^(?:(\d+)|(strongly negative|slightly negative|neutral|slightly positive|strongly positive))(?: - | – |: |\s+)(.*)$/i;
        const heatOrSentimentRegex = /^(?:(\d+)|(strongly negative|slightly negative|neutral|slightly positive|strongly positive))(?: - | – |: |\s+)?(.*)?$/i;

        baseLineHeightPx = baseLineHeightPx * fontScaleForTable
        const rowSpacing = baseLineHeightPx * 0.2
        const colSpacing = baseLineHeightPx * 0.1
        const columnSize = new Array(columnCount).fill( width / columnCount )
        let maxForRow = 0
        let startRow = currentHeightPx 
        let rIdx = 0
        for( const row of rows){
          startRow += maxForRow
          currentHeightPx = startRow
          maxForRow = 0
          let cIdx = 0
          startIndent = startX + colSpacing
          let fills = []
          for(const col of row.children){
            placeTextWidth = startIndent + columnSize[cIdx] -  colSpacing - colSpacing
            currentHeightPx = startRow + rowSpacing
            let firstOfCell = true
            if( rIdx === 0){
                fills[cIdx] = "#999999"
            }else{

              //const m = col.children[0].children?.[0]?.text?.match(heatRegex)
              const m = col.children[0]?.text?.match(heatOrSentimentRegex)
              if (false && m) {
                let v;
              
                if (m[1]) {
                  // Case: number found (Group 1)
                  v = parseInt(m[1], 10) - 1;
                  if (v > 4) v = 4;
                  col.children[0].text = m[3]
                } else if (m[2]) {
                  // Case: sentiment found (Group 2)
                  const sentimentText = m[2].toLowerCase();
                  const sentimentScale = {
                    "strongly negative": 0,
                    "slightly negative": 1,
                    "neutral": 2,
                    "slightly positive": 3,
                    "strongly positive": 4
                  };
                  v = sentimentScale[sentimentText];
                }
              
                if (v !== undefined) {
                  fills[cIdx] = HEATMAP.colors[v];
                }
              }
            }
            for(const child of col.children){
              processSection( child, false, {first: firstOfCell, col: cIdx, row: rIdx, xPadding: colSpacing, yPadding: rowSpacing, fill: fills[cIdx]} )
              firstOfCell = false
            }
            startIndent += columnSize[cIdx]
            const rowHeight = currentHeightPx - startRow
            maxForRow = rowHeight > maxForRow ? rowHeight : maxForRow
            cIdx++
          }
          let sx = startX
          maxForRow += rowSpacing * 2 
          for( let cIdx = 0; cIdx < columnCount; cIdx++){
            const fill = fills[cIdx]
            
            this.tableDecoration.push({
              type: "rect",
              x: sx,
              y: startRow,
              width: columnSize[cIdx],
              height: maxForRow ,
              fill,
              stroke: "#999999",
            })
            sx += columnSize[cIdx]
          }
          rIdx++
        }
        startIndent = startX
        placeTextWidth = maxWidth
        currentHeightPx = startRow + maxForRow + rowSpacing
        this.textArr[this.textArr.length - 1].tableInfo.tableHeight = currentHeightPx
        fontScaleForTable = 1
        baseLineHeightPx = mainLineHeight
      }
    }else{
      needAdvance  = true
      if( !tableInfo || !tableInfo.first ){
        if(isHeading && (lastWasHeading === false)){
          //currentHeightPx += (lineHeightPx * 0.6);
          currentHeightPx += (lineHeightPx * 0.6);
        }else if(!isHeading && lastWasHeading){
          currentHeightPx -= (lineHeightPx * 0.3);
        }else if( isListItem){
          currentHeightPx += (lineHeightPx * 0.1);
        }else if( !isListItem && lastWasListItem){
          currentHeightPx += (lastLineHeight * 0.2);
        }
      }
      const children = section.children ?? [section]
      let markAsLastParagraph = false
      if( children ){
        let indent = startIndent
        let fragmentIdx = 0
        for(const frag of children ){
          if( frag.type === "unordered-list" || section.type === "ordered-list"){
            console.error("THIS IS BEING CALLED")
            const px = "" + lineHeightPx
            if( !indentWidths[px] ){
              getDummyContext().font = (large ? this.headlineFont : this.standardFont)
              indentWidths[px] = this._getTextStats("    ").width
            }
            let preIndent = startIndent
            startIndent += indentWidths[px]
            
            //currentHeightPx += (lineHeightPx * (isListItem ? 1.1 : 1.4));
            currentHeightPx += (lineHeightPx * 0.2);
            //didAdvance = true
            if( frag.children ){
              for(const sub of frag.children ){
                processSection( sub, false, false )
              }
            }
            markAsLastParagraph = true
            startIndent = preIndent
          }else{

            const bold = frag.bold || isHeading  || tableInfo?.row === 0
            const bullet = isListItem && (fragmentIdx === 0)
            const lastLine = lastSection && (fragmentIdx === (children.length - 1))
            const color = tableInfo?.row === 0 ? "white" : undefined
            let text = frag.text
            let fragChildren = frag.children
            if( text !== undefined){
              text = text.replace(/^\s+/," ")

              const result = placeText( text, large, bold, bullet, startIndent, indent, color, lastLine, tableInfo)
              indent = result.indent
              if( result.textWidth > maxUsedWidth ){
                maxUsedWidth = result.textWidth
              }
              didAdvance = result.newline
              if( result.clippedForHeight ){
                clipped = true
                break
              }
            }
            if( fragChildren ){
                    processSection( frag, false, false, isListItem )
                    didAdvance = true
            }
            fragmentIdx++
            if( !isListItem ){
              markAsLastParagraph = true
            }
          }
        }
        if(markAsLastParagraph && this.textArr[this.textArr.length - 1]) {
          this.textArr[this.textArr.length - 1].lastInParagraph = true;
        }
      }
    }
    if( !didAdvance && needAdvance){
      currentHeightPx += (lineHeightPx * (isListItem ? 1.1 : 1.4));
    }
    
    lastWasHeading = isHeading
    lastWasListItem = isListItem
    if( needAdvance ){
      lastLineHeight = lineHeightPx
    }

  }

  let sIdx = 0
  for(const section of formattedList ){
    sIdx++
    processSection(section, sIdx === formattedList.length)
  }
  this.textHeight = fontSize;
  this.textWidth = maxUsedWidth;
  this._cachedHeight = this.height()

}


checkCanvasCleared() {
  if( this.pcache){
    let canvas = this.pcache
    const ctx = this.pcache._canvas_context
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] !== 0) {
        return false;
      }
    }
    return true;
  }
  return false
}


  renderText(sceneContext){
    var textArr = this.textArr,
    textArrLen = textArr.length;

    let context
    if (!this.text()) {
      return;
    }
    this.textWasRendered = true

    var padding = this.padding(),
    fontSize = this.fontSize(),
    lineHeightPx = this.lineHeight() * fontSize,
    n,
    translateY = lineHeightPx / 2 ;

    if( DISABLE_CANVAS ){
      context = sceneContext
    }else{
      this.pcache._canvas_context.fillStyle = this.attrs.bgFill 
      this.pcache._canvas_context.fillRect(0,0,  this.uWidth, this.uHeight)
      context = this.pcache._canvas_context
    }
    context.textBaseline = MIDDLE
    context.fillStyle = this.attrs.fill

    let alignCenter = this.attrs.align === "center"
    let alignRight = this.attrs.align === "right"
    let py = []
    var lineTranslateX = padding;
    var lineTranslateY = padding;

    let bold = false, large = false, lastScale = 1, lastFill
    if( this.attrs.withMarkdown){
      
      context.font = this.standardFont

      for (n = 0; n < textArrLen; n++) {
        var obj = textArr[n], text = obj.text
        if( bold !== obj.bold || large !== obj.large){
          bold = obj.bold
          large = obj.large
          context.font = bold ? (obj.large ? this.headlineFont : this.boldFont) : (obj.large ? this.headlineFont : this.standardFont)
          if( lastScale !== 1){
            lastScale = undefined
          }
        }

        if( obj.fontScale !== lastScale ){
          lastScale = obj.fontScale
          let targetFont = context.font 
          const size = targetFont.match(/(\d+.?\d+)px/)
          context.font = targetFont.replace(size[0], (size[1] * lastScale) + "px")
        }
        let useColor = obj.color ?? this.attrs.fill
        if( useColor !== lastFill ){
          context.fillStyle = useColor
          lastFill = useColor
        }


        let offset = (obj.indent ?? 0)
        if( alignCenter ){
          offset += (this.attrs.width - obj.width) / 2
        }else if(alignRight){
          offset += (this.attrs.width - obj.width)
        }
        
        context.fillText(text, lineTranslateX + offset, obj.y)

        if( obj.bullet ){
          const r = Math.abs(obj.ascent / 6)
          context.beginPath();
          context.arc(lineTranslateX + offset - (r * 4), obj.y, r, 0, Math.PI * 2, false);
          context.closePath();
          context.fill();
        }
      }
    }else{
      context.font =this.fontCache
      for (n = 0; n < textArrLen; n++) {
        var obj = textArr[n],
        text = obj.text
        let offset = 0
        if( alignCenter ){
          offset += (this.attrs.width - obj.width) / 2
        }else if(alignRight){
          offset += (this.attrs.width - obj.width)
        }
        
        context.fillText(text, lineTranslateX + offset, translateY + lineTranslateY)
        
        if (textArrLen > 1) {
          translateY += lineHeightPx;
        }
      }
    }
  }

  resetOwner(){
    this.queuedForRefresh = false
  }
  
  refreshCache(){
    this.queuedForRefresh = false
    const isFirst = !this.pcache
    if( isFirst ){
        this._buildPrivateCache()
    }
    if(this.pcache){
        if((this.newScale ?? this.lastScale) === this.lastRenderScale)
        {
          return
        }
        const ctx = this.pcache._canvas_context
        if( this.newScale){
            const rw = this.attrs.width//this.getWidth()
            const rh = this._cachedHeight//this.getHeight()
            const w = this.newScale * rw
            const h = this.newScale * rh
            if( w > 0 && h > 0){
                let doResize = true // w > this.pcache.width || h > this.pcache.height
                if( doResize ){
                    this.pcache.width = w//setSize( w, h)
                    this.pcache.height = h
                }
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.scale( this.newScale ?? 1, this.newScale ?? 1)

                if( !doResize && !this.attrs.bgFill){
                    ctx.clearRect(0,0, rw + 5, rh + 5)
                }
                if( this.attrs.bgFill){
                  ctx.fillStyle = this.attrs.bgFill 
                  ctx.fillRect(0,0,  rw + 5, rh + 5)
                }

                this.uWidth = w 
                this.uHeight = h

                this.lastScale = this.newScale
                this.newScale = undefined
            }
        }
        this.renderText(  )
        this.lastRenderScale = this.lastScale
        this.refreshRequested = false
        if( isFirst ){
            this.requestRefresh()
        }
    }
  }
  destroy(){
    if( this.pcache ){
      //Util.releaseCanvas( this.pcache )
      this.pcache.width = 0
      this.pcache.height = 0
    }
    super.destroy()
  }
  _useBufferCanvas() {
    return false
  }

    
  constructor(attrs) {
    attrs.fontFamily ||= "Poppins"
    super(attrs);
    this.scaleRatio = 1
    this.rescaleMax = 1.5
    this.rescaleMin = 0.5
    this._cachedHeight = this.height()

  }

  requestRefresh(){
    if(this.attrs.refreshCallback && !this.placeholder){
        if(!this.queuedForRefresh ){
          this.queuedForRefresh = true
          this.attrs.refreshCallback(this)
          /*
          if( !this.refreshRequested || (performance.now() - this.refreshRequested > 100)){
            this.attrs.refreshCallback(this)
            this.refreshRequested = performance.now()
          }*/
        }
    }
    
  }
  getScale(){
    let scale = 1
    let parent = this.parent
    while (parent) {
      scale *= parent.attrs.scaleX ?? 1
      parent = parent.parent
    }
    return scale

  }


  _sceneFunc(context) {
    let scale = this.getScale()

    let w = this.attrs.width//this.width()
    let h = this._cachedHeight
    let fh = this.attrs.fontSize

    let ph = !DISABLE_CANVAS && !this.pcache
    const tooSmall = fh * scale < 6

    if( ph && !tooSmall){
        this.requestRefresh()
    }
    if( this.checkCanvasCleared()){
      console.warn(`CANVAS HAS BEEN CLEARED`)
      console.log(this)
      this.requestRefresh()
    }
    if( ph || tooSmall){

        let showLines = fh * scale > 1.5
        let ctx = context
        if( showLines && this.attrs.showPlaceHolder !== false){
            ctx.fillStyle = this.attrs.lineFill ?? "#eaeaea"
            let y = 0, step = this.lineHeight() * fh 
            let alignCenter = this.attrs.align === "center"
            let alignRight = this.attrs.align === "right"
            if( this.attrs.withMarkdown ){
              for(const d of this.textArr){
                ctx.fillRect(d.indent, d.y, d.width - 1 , fh - 1)
              }
            }else{
              for(const d of this.textArr){
                //let offset = alignCenter ? (this.attrs.width - d.width)/2 : 0
                let offset = 0
                if( alignCenter ){
                  offset += (this.attrs.width - d.width) / 2
                }else if(alignRight){
                  offset += (this.attrs.width - d.width)
                }
                ctx.fillRect(offset, y, d.width - 1 , fh - 1)
                y += step
              }
            }
        }else{
          let steps = Math.min(Math.max(Math.ceil(h / 50), 2), 30)
          let step = Math.max(h / steps, 10)
          ctx.fillStyle = this.attrs.lineFill ?? "#eaeaea"
          let widths = [w - 2, w * 0.8, w * 0.6, w * 0.7, w*0.2]
          let wi = 0
          for(let i = (step * 0.3); i < h ; i += step){
            ctx.fillRect(1, i,  widths[wi], step * 0.45)
            wi = (wi + 1) % 5
            
          }
          //ctx.fillRect(0,0,  w - 1, h - 1)
        }
    }else{
      if( DISABLE_CANVAS ){
        if( this.tableDecoration ){
          for(const decoration of this.tableDecoration){
            if( decoration.x > this.attrs.width || (decoration.x + decoration.width - this.attrs.width) > 1){continue}
            if( decoration.y > this.attrs.height || (decoration.y + decoration.height - this.attrs.height) > 1){continue}
            if( decoration.type === "rect" ){
              if( decoration.fill){
                context.fillStyle = decoration.fill 
                context.fillRect( decoration.x, decoration.y, decoration.width, decoration.height)
              }
              if( decoration.stroke){
                context.strokeStyle = decoration.stroke
                context.lineWidth = 0.5
                context.strokeRect( decoration.x, decoration.y, decoration.width, decoration.height)
              }
            }              
          }
        }
        /*
      context.strokeStyle ="#ff0000"
        context.lineWidth = 0.5
      context.strokeRect(0,0, this.attrs.width, this.height())*/

        this.renderText( context )
      }else{

        if( this.pcache.width > 0 && this.pcache.height > 0){
          const ratio = (scale / (this.lastScale )) 
          if( ratio < this.rescaleMin || ratio > this.rescaleMax){
            this.newScale = scale
            this.requestRefresh()
          }
          
          if( this.pcache ){
            context.drawImage(this.pcache, 0, 0, this.uWidth, this.uHeight, 0, 0, w, h)
          }
        }
      }
    }
  }
}

CustomText.prototype.className = 'CustomText';
_registerNode(CustomText);

/**
 * get/set width of text area, which includes padding.
 * @name Konva.Text#width
 * @method
 * @param {Number} width
 * @returns {Number}
 * @example
 * // get width
 * var width = text.width();
 *
 * // set width
 * text.width(20);
 *
 * // set to auto
 * text.width('auto');
 * text.width() // will return calculated width, and not "auto"
 */
Factory.overWriteSetter(CustomText, 'width', getNumberOrAutoValidator());

/**
 * get/set the height of the text area, which takes into account multi-line text, line heights, and padding.
 * @name Konva.Text#height
 * @method
 * @param {Number} height
 * @returns {Number}
 * @example
 * // get height
 * var height = text.height();
 *
 * // set height
 * text.height(20);
 *
 * // set to auto
 * text.height('auto');
 * text.height() // will return calculated height, and not "auto"
 */

Factory.overWriteSetter(CustomText, 'height', getNumberOrAutoValidator());


/**
 * get/set direction
 * @name Konva.Text#direction
 * @method
 * @param {String} direction
 * @returns {String}
 * @example
 * // get direction
 * var direction = text.direction();
 *
 * // set direction
 * text.direction('rtl');
 */
Factory.addGetterSetter(CustomText, 'direction', INHERIT);

/**
 * get/set font family
 * @name Konva.Text#fontFamily
 * @method
 * @param {String} fontFamily
 * @returns {String}
 * @example
 * // get font family
 * var fontFamily = text.fontFamily();
 *
 * // set font family
 * text.fontFamily('Arial');
 */
Factory.addGetterSetter(CustomText, 'fontFamily', 'Arial');

/**
 * get/set font size in pixels
 * @name Konva.Text#fontSize
 * @method
 * @param {Number} fontSize
 * @returns {Number}
 * @example
 * // get font size
 * var fontSize = text.fontSize();
 *
 * // set font size to 22px
 * text.fontSize(22);
 */
Factory.addGetterSetter(CustomText, 'fontSize', 12, getNumberValidator());

/**
 * get/set font style.  Can be 'normal', 'italic', or 'bold', '500' or even 'italic bold'.  'normal' is the default.
 * @name Konva.Text#fontStyle
 * @method
 * @param {String} fontStyle
 * @returns {String}
 * @example
 * // get font style
 * var fontStyle = text.fontStyle();
 *
 * // set font style
 * text.fontStyle('bold');
 */

Factory.addGetterSetter(CustomText, 'fontStyle', NORMAL);

/**
 * get/set font variant.  Can be 'normal' or 'small-caps'.  'normal' is the default.
 * @name Konva.Text#fontVariant
 * @method
 * @param {String} fontVariant
 * @returns {String}
 * @example
 * // get font variant
 * var fontVariant = text.fontVariant();
 *
 * // set font variant
 * text.fontVariant('small-caps');
 */

Factory.addGetterSetter(CustomText, 'fontVariant', NORMAL);

/**
 * get/set padding
 * @name Konva.Text#padding
 * @method
 * @param {Number} padding
 * @returns {Number}
 * @example
 * // get padding
 * var padding = text.padding();
 *
 * // set padding to 10 pixels
 * text.padding(10);
 */

Factory.addGetterSetter(CustomText, 'padding', 0, getNumberValidator());

/**
 * get/set horizontal align of text.  Can be 'left', 'center', 'right' or 'justify'
 * @name Konva.Text#align
 * @method
 * @param {String} align
 * @returns {String}
 * @example
 * // get text align
 * var align = text.align();
 *
 * // center text
 * text.align('center');
 *
 * // align text to right
 * text.align('right');
 */

Factory.addGetterSetter(CustomText, 'align', LEFT);

/**
 * get/set vertical align of text.  Can be 'top', 'middle', 'bottom'.
 * @name Konva.Text#verticalAlign
 * @method
 * @param {String} verticalAlign
 * @returns {String}
 * @example
 * // get text vertical align
 * var verticalAlign = text.verticalAlign();
 *
 * // center text
 * text.verticalAlign('middle');
 */

Factory.addGetterSetter(CustomText, 'verticalAlign', TOP);

/**
 * get/set line height.  The default is 1.
 * @name Konva.Text#lineHeight
 * @method
 * @param {Number} lineHeight
 * @returns {Number}
 * @example
 * // get line height
 * var lineHeight = text.lineHeight();
 *
 * // set the line height
 * text.lineHeight(2);
 */

Factory.addGetterSetter(CustomText, 'lineHeight', 1, getNumberValidator());

/**
 * get/set wrap.  Can be "word", "char", or "none". Default is "word".
 * In "word" wrapping any word still can be wrapped if it can't be placed in the required width
 * without breaks.
 * @name Konva.Text#wrap
 * @method
 * @param {String} wrap
 * @returns {String}
 * @example
 * // get wrap
 * var wrap = text.wrap();
 *
 * // set wrap
 * text.wrap('word');
 */

Factory.addGetterSetter(CustomText, 'wrap', WORD);

/**
 * get/set ellipsis. Can be true or false. Default is false. If ellipses is true,
 * Konva will add "..." at the end of the text if it doesn't have enough space to write characters.
 * That is possible only when you limit both width and height of the text
 * @name Konva.Text#ellipsis
 * @method
 * @param {Boolean} ellipsis
 * @returns {Boolean}
 * @example
 * // get ellipsis param, returns true or false
 * var ellipsis = text.ellipsis();
 *
 * // set ellipsis
 * text.ellipsis(true);
 */

Factory.addGetterSetter(CustomText, 'ellipsis', false, getBooleanValidator());

/**
 * set letter spacing property. Default value is 0.
 * @name Konva.Text#letterSpacing
 * @method
 * @param {Number} letterSpacing
 */

Factory.addGetterSetter(CustomText, 'letterSpacing', 0, getNumberValidator());

/**
 * get/set text
 * @name Konva.Text#text
 * @method
 * @param {String} text
 * @returns {String}
 * @example
 * // get text
 * var text = text.text();
 *
 * // set text
 * text.text('Hello world!');
 */

Factory.addGetterSetter(CustomText, 'text', '', getStringValidator());

/**
 * get/set text decoration of a text.  Possible values are 'underline', 'line-through' or combination of these values separated by space
 * @name Konva.Text#textDecoration
 * @method
 * @param {String} textDecoration
 * @returns {String}
 * @example
 * // get text decoration
 * var textDecoration = text.textDecoration();
 *
 * // underline text
 * text.textDecoration('underline');
 *
 * // strike text
 * text.textDecoration('line-through');
 *
 * // underline and strike text
 * text.textDecoration('underline line-through');
 */

Factory.addGetterSetter(CustomText, 'textDecoration', '');

export default CustomText;