import { SceneCanvas } from "konva/lib/Canvas";
import { Factory } from "konva/lib/Factory";
import { _registerNode } from "konva/lib/Global";
import { Util } from "konva/lib/Util";
import { getBooleanValidator, getNumberOrAutoValidator, getNumberValidator, getStringValidator } from "konva/lib/Validators";
import { Text } from "konva/lib/shapes/Text";

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
    return dummyContext;
}

class CustomText extends Text {

  _buildPrivateCache(){
    if( this.textWidth === 0){
        return
    }

    let w = this.attrs.width//this.width()
    let h = this._cachedHeight

    //const w = this.getWidth()
    //const h = this.getHeight()

    /*this.pcache = new SceneCanvas({
      width: w * this.scaleRatio ,
      height: h * this.scaleRatio,
      pixelRatio: 1
    })*/

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
      return {width: metrics.width, ascent: metrics.actualBoundingBoxAscent}
  }
_setTextData() {
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
  let wasHeader = false

  for (var i = 0, max = lines.length; i < max; ++i) {
      var line = lines[i];
      if( line.length === 0){
        continue
      }
      let padding = 0.35
      var startIndent = 0
      const isIndented = line.match(/^(\s*)(-+)\s(.*)/)
      if( isIndented ){
        const count = isIndented[1] ? 2 : (isIndented[2].length)
        startIndent = indentWidth * count
        line = isIndented[3]
        if( wasIndented < startIndent){
          padding = 0.1
        }else if( wasIndented > startIndent){
          padding = 0.5
        }else{
          padding = 0.2
        }
      }
      
      let indent = startIndent
      const fragments = line.split("**")
      let bold = false
      let advanced = false
      let large = fragments.length === 3 && fragments[0].length === 0 && fragments[2].length === 0
      
      let lineHeightPx = large ? baseLineHeightPx * 1.5 : baseLineHeightPx
      if( !large && wasHeader){
        padding = -0.25
      }

      if( i > 0){
        currentHeightPx += lineHeightPx * padding;
      }
      let idx = -1
      let segment = 0
      for( let line of fragments ){
        idx++
        


        let thisBold = idx % 2 === 1
        if( bold!= thisBold ){
          bold = thisBold
          getDummyContext().font = bold ? (large ? this.headlineFont : this.boldFont) : this.standardFont
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
        if (lineWidth > maxWidth) {
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
                  this._addMDTextLine(match, matchMetrics, indent, currentHeightPx + translateY, bold, large, drawBullet);
                  indent = startIndent
                  textWidth = Math.max(textWidth, matchWidth);
                  currentHeightPx += lineHeightPx;
                  advanced = true
                  var shouldHandleEllipsis = this._shouldHandleEllipsis(currentHeightPx);
                  if (shouldHandleEllipsis) {
                      this._tryToAddEllipsisToLastLine();
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
          }
        }else {
          this._addMDTextLine(line, lineMetrics, indent, currentHeightPx + translateY, bold, large, drawBullet);
          textWidth = Math.max(textWidth, lineWidth);
          if (this._shouldHandleEllipsis(currentHeightPx + lineHeightPx) && i < max - 1) {
            this._tryToAddEllipsisToLastLine();
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
      if (fixedHeight && currentHeightPx + lineHeightPx > maxHeightPx) {
          break;
      }
      wasIndented = startIndent
      wasHeader = large
    }
  this.textHeight = fontSize;
  this.textWidth = textWidth;
  this._cachedHeight = this.height()
}


  renderText(){
    var textArr = this.textArr,
    textArrLen = textArr.length;

    if (!this.text()) {
      return;
    }
    var padding = this.padding(),
      fontSize = this.fontSize(),
      lineHeightPx = this.lineHeight() * fontSize,
      n,
      translateY = lineHeightPx / 2 ;

    const context = this.pcache._canvas_context
    this.pcache._canvas_context.textBaseline = MIDDLE
    
    this.pcache._canvas_context.fillStyle = this.attrs.fill

    let alignCenter = this.attrs.align === "center"
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
          context.font = bold ? (obj.large ? this.headlineFont : this.boldFont) : this.standardFont
        }
        let offset = (alignCenter ? (this.attrs.width - obj.width)/2 : 0) + (obj.indent ?? 0)
        
        context.fillText(text, lineTranslateX + offset, obj.y)

        if( obj.bullet ){
          const r = obj.ascent / 6
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
        let offset = (alignCenter ? (this.attrs.width - obj.width)/2 : 0)
        
        context.fillText(text, lineTranslateX + offset, translateY + lineTranslateY)
        
        if (textArrLen > 1) {
          translateY += lineHeightPx;
        }
      }
    }
  }

  
  refreshCache(){
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
        if( !this.refreshRequested || (performance.now() - this.refreshRequested > 100)){
            this.attrs.refreshCallback(this)
            this.refreshRequested = performance.now()
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

    let ph = !this.pcache
    const tooSmall = fh * scale < 6

    if( ph && !tooSmall){
        this.requestRefresh()
    }
    if( ph || tooSmall){

        let showLines = fh * scale > 2.5
        let ctx = context
        if( showLines && this.attrs.showPlaceHolder !== false){
            ctx.fillStyle = "#eaeaea"
            let y = 0, step = this.lineHeight() * fh 
            let alignCenter = this.attrs.align === "center"
            if( this.attrs.withMarkdown ){
              for(const d of this.textArr){
                ctx.fillRect(d.indent, d.y, d.width - 1 , fh - 1)
              }
            }else{
              for(const d of this.textArr){
                let offset = alignCenter ? (this.attrs.width - d.width)/2 : 0
                ctx.fillRect(offset, y, d.width - 1 , fh - 1)
                y += step
              }
            }
        }else{
          ctx.fillStyle = "#eaeaea"
          ctx.fillRect(0,0,  w - 1, h - 1)
        }
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