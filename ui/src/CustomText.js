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
      return isAuto
      ? (this.textArr.slice(-1)?.[0]?.y ?? 0) + (this.lineHeight() * this.fontSize() / 2)
      : this.attrs.height;
    }else{
      return super.getHeight()
    }
  }
  _addMDTextLine(line, metrics, indent, y, bold, large, bullet) {
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
                            lastLine.bullet
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
  

  const placeText = ( text, large, bold, drawBullet, startIndent, indent, lastLine )=>{
    
    getDummyContext().font = bold ? (large ? this.headlineFont : this.boldFont) : (large ? this.headlineFont : this.standardFont)
    
    let lineMetrics = this._getTextStats(text)
    let lineWidth = lineMetrics.width + indent;
    var leaveForHeight = false
    let advanced = false
    let textWidth = 0
    
    if( translateY === undefined){
      translateY = lineHeightPx / 2 ;
    }

    if (lineWidth > maxWidth) {
      let frag = 0
      while (text.length > 0) {
          var low = 0, high = text.length, match = '', matchWidth = 0;
          while (low < high) {
              var mid = (low + high) >>> 1, substr = text.slice(0, mid + 1), substrWidth = this._getTextStats(substr).width + additionalWidth + indent
              if (substrWidth <= maxWidth) {
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
                  if (nextIsSpaceOrDash && matchWidth <= maxWidth) {
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
              this._addMDTextLine(match, matchMetrics, indent, currentHeightPx + translateY, bold, large, drawBullet && (frag === 0));
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
                  if (lineWidth <= maxWidth) {
                      this._addMDTextLine(text, lineMetrics, indent, currentHeightPx + translateY, bold, large);
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
    }else {
      this._addMDTextLine(text, lineMetrics, indent, currentHeightPx + translateY, bold, large, drawBullet);
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

  const processSection = ( section, lastSection )=>{
    if( section.type === "table"){
      return
    }
    if( clipped ){
      return
    }
    const isHeading = section.type === "heading"
    const isListItem = section.type === "list-item"
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
        for(const sub of section.children ){
          processSection( sub )
        }
      }

      startIndent = preIndent
    }else{
      needAdvance  = true
      if(isHeading && (lastWasHeading === false)){
        currentHeightPx += (lineHeightPx * 0.6);
      }else if(!isHeading && lastWasHeading){
        currentHeightPx -= (lineHeightPx * 0.3);
      }else if( isListItem){
        currentHeightPx += (lineHeightPx * 0.2);
      }else if( !isListItem && lastWasListItem){
        currentHeightPx += (lastLineHeight * 0.2);
      }
      if( section.children ){
        let indent = startIndent
        let fragmentIdx = 0
        for(const frag of section.children ){
          const bold = frag.bold || isHeading
          const bullet = isListItem && (fragmentIdx === 0)
          const lastLine = lastSection && (fragmentIdx === (section.children.length - 1))
          const result = placeText( frag.text, large, bold, bullet, startIndent, indent, lastLine)
          
          indent = result.indent
          if( result.textWidth > maxUsedWidth ){
            maxUsedWidth = result.textWidth
          }
          didAdvance = result.newline
          if( result.clippedForHeight ){
            clipped = true
            break
          }
          fragmentIdx++
        }
        if (this.textArr[this.textArr.length - 1]) {
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
_setTextDataOLD() {
    this.fontCache = this._getContextFont()

    let stem = this.fontCache.slice(this.fontCache.indexOf(" "))
    this.standardFont = "normal" + stem
    this.boldFont = "bold " + stem
    this.headlineFont = "bold " + stem.replace(/(\d+)px/, (d)=>(parseInt(d) * 1.5) + "px")

    if( !this.attrs.withMarkdown ){
      super._setTextData()
      this._cachedHeight = this.height()
      return
    }

  var lines = this.text().split('\n'), fontSize = +this.fontSize(), textWidth = 0, baseLineHeightPx = this.lineHeight() * fontSize, width = this.attrs.width, height = this.attrs.height, fixedWidth = width !== AUTO && width !== undefined, fixedHeight = height !== AUTO && height !== undefined, padding = this.padding(), maxWidth = width - padding * 2, maxHeightPx = height - padding * 2, currentHeightPx = 0, wrap = this.wrap(), shouldWrap = wrap !== NONE, wrapAtWord = wrap !== CHAR && shouldWrap, shouldAddEllipsis = this.ellipsis();
  this.textArr = [];
  
  fixedHeight = false
  getDummyContext().font = this.standardFont

  var indentWidth = this._getTextStats("      ").width
  var additionalWidth = shouldAddEllipsis ? this._getTextStats(ELLIPSIS).width : 0;
  var translateY 




  let wasIndented = false
  let wasHeader = undefined

  for (var i = 0, max = lines.length; i < max; ++i) {
      var line = lines[i];
      if( line.length === 0){
        continue
      }
      let padding = 0.35
      var startIndent = 0
      const isIndented = line.match(/^(\s*)(-+)\s(.*)/)
      if( isIndented ){
        //const count = isIndented[1] ? 2 : (isIndented[2].length)
        const count =  (isIndented[2].length)
        startIndent = indentWidth * count
        line = isIndented[3]
        if( wasIndented < startIndent){
          padding = 0.1
        }else if( wasIndented > startIndent){
          padding = 0.5
        }else{
          padding = 0.6
        }
      }
      
      let indent = startIndent
      let large = line.trim().startsWith("#")
      if( large ){
        line = line.replace(/^\s*#+\s*/,"")
      }

      const fragments = line.split("**")
      let bold = false
      let advanced = false
      //let large = fragments.length === 3 && fragments[0].length === 0 && fragments[2].length === 0
      
      let lineHeightPx = large ? baseLineHeightPx * 1.2 : baseLineHeightPx
      if( large && !wasHeader){
        //padding = -0.1
        currentHeightPx += lineHeightPx * 0.4;
      }

      if( i > 0){
        currentHeightPx += lineHeightPx * padding;
      }
      let idx = -1
      let segment = 0

      for( let line of fragments ){
        idx++
        let thisBold = idx % 2 === 1
        if( bold!= thisBold || large != wasHeader){
          bold = thisBold
          //getDummyContext().font = bold ? (large ? this.headlineFont : this.boldFont) : this.standardFont
          getDummyContext().font = bold ? (large ? this.headlineFont : this.boldFont) : (large ? this.headlineFont : this.standardFont)
          if( bold ){
            indent = startIndent
            if( idx > 1){
              currentHeightPx += lineHeightPx;
            }
          }
        }
        if( line.length === 0){
          continue
        }
        var drawBullet = (segment === 0) && (indent > 0)

        segment++
        
        if( translateY === undefined){
          translateY = lineHeightPx / 2 ;
        }
        var lineMetrics = this._getTextStats(line)
        var lineWidth = lineMetrics.width + indent;
        var leaveForHeight = false
        if (lineWidth > maxWidth) {
          let frag = 0
          while (line.length > 0) {
              var low = 0, high = line.length, match = '', matchWidth = 0;
              while (low < high) {
                  var mid = (low + high) >>> 1, substr = line.slice(0, mid + 1), substrWidth = this._getTextStats(substr).width + additionalWidth + indent
                  if (substrWidth <= maxWidth) {
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
                      var nextChar = line[match.length];
                      var nextIsSpaceOrDash = nextChar === SPACE || nextChar === DASH;
                      if (nextIsSpaceOrDash && matchWidth <= maxWidth) {
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
                  this._addMDTextLine(match, matchMetrics, indent, currentHeightPx + translateY, bold, large, drawBullet && (frag === 0));
                  indent = startIndent
                  textWidth = Math.max(textWidth, matchWidth);
                  currentHeightPx += lineHeightPx;
                  advanced = true
                  var shouldHandleEllipsis = this._shouldHandleEllipsis(currentHeightPx + lineHeightPx);
                  if (shouldHandleEllipsis) {
                      this._MDtryToAddEllipsisToLastLine();
                      leaveForHeight = true
                      break;
                  }
                  line = line.slice(low);
                  line = line.trimLeft();
                  if (line.length > 0) {
                      lineMetrics = this._getTextStats(line)
                      lineWidth = lineMetrics.width + indent;
                      if (lineWidth <= maxWidth) {
                          this._addMDTextLine(line, lineMetrics, indent, currentHeightPx + translateY, bold, large);
                          currentHeightPx += lineHeightPx;
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
        }else {
          this._addMDTextLine(line, lineMetrics, indent, currentHeightPx + translateY, bold, large, drawBullet);
          textWidth = Math.max(textWidth, lineWidth);
          if (this._shouldHandleEllipsis(currentHeightPx + lineHeightPx) && i < max - 1) {
            this._MDtryToAddEllipsisToLastLine();
            leaveForHeight = true
          }
          indent = startIndent
        }
        indent = lineWidth
      }
      if( !advanced ){
        currentHeightPx += lineHeightPx;
      }
      if (this.textArr[this.textArr.length - 1]) {
          this.textArr[this.textArr.length - 1].lastInParagraph = true;
      }
      if(leaveForHeight || (fixedHeight && (currentHeightPx + (lineHeightPx > maxHeightPx)))) {
          break;
      }
      wasIndented = startIndent
      wasHeader = large
    }
  this.textHeight = fontSize;
  this.textWidth = textWidth;
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

    let bold = false, large = false
    if( this.attrs.withMarkdown){
      
      context.font = this.standardFont

      for (n = 0; n < textArrLen; n++) {
        var obj = textArr[n], text = obj.text
        if( bold !== obj.bold || large !== obj.large){
          bold = obj.bold
          large = obj.large
          context.font = bold ? (obj.large ? this.headlineFont : this.boldFont) : (obj.large ? this.headlineFont : this.standardFont)
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