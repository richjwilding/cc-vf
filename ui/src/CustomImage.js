import { SceneCanvas } from 'konva/lib/Canvas'
import { Context } from 'konva/lib/Context'
import { Factory } from 'konva/lib/Factory'
import { _registerNode } from 'konva/lib/Global'
import { Shape, ShapeConfig } from 'konva/lib/Shape'
import { GetSet, IRect } from 'konva/lib/types'
import { Util } from 'konva/lib/Util'
import { getNumberValidator, getBooleanValidator, getStringValidator, getNumberOrArrayOfNumbersValidator } from 'konva/lib/Validators'

var WGL_QUEUE_LENGTH = 512
var WGL_QUEUE_TIMEOUT = 50

function setupShadersAndBuffers(gl) {
  // Vertex shader source code
  const vertexShaderSrc = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  // Fragment shader source code
  const fragmentShaderSrc = `
    precision mediump float;
    varying vec2 v_texCoord;
    uniform sampler2D u_image;
    void main() {
      gl_FragColor = texture2D(u_image, v_texCoord);
    }
  `;

  // Compile the shaders
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);

  // Link the shaders into a program
  const program = createProgram(gl, vertexShader, fragmentShader);
  gl.useProgram(program);

  // Set up the vertex buffer (quad coordinates)
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const positions = [
    -1, -1,
     1, -1,
    -1,  1,
     1,  1,
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  // Bind position buffer to the attribute in the vertex shader
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  // Set up the texture coordinate buffer (maps texture to quad)
  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  const texCoords = [
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    1.0, 1.0,
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

  // Bind texture coordinate buffer to the attribute in the vertex shader
  const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(texCoordLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

  // Return the compiled program so we can use it in rendering
  return program;
}

// Utility function to compile a shader
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compilation failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Utility function to link shaders into a WebGL program
function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link failed:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}
function setupFramebuffer(gl) {
  // Create a framebuffer
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  // Create a texture to hold the framebuffer's color output
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WGL_QUEUE_LENGTH, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  // Attach the texture as the color buffer for the framebuffer
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  // Check if framebuffer is set up correctly
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('Framebuffer is not complete:', status);
  }

  // Return the framebuffer so it can be reused for every image
  return framebuffer;
}


class CustomImage extends Shape {

  static phUrl = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iNjAiIGZpbGw9IiNhYWEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CiAgPHBhdGggY2xpcC1ydWxlPSJldmVub2RkIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xLjUgNmEyLjI1IDIuMjUgMCAwIDEgMi4yNS0yLjI1aDE2LjVBMi4yNSAyLjI1IDAgMCAxIDIyLjUgNnYxMmEyLjI1IDIuMjUgMCAwIDEtMi4yNSAyLjI1SDMuNzVBMi4yNSAyLjI1IDAgMCAxIDEuNSAxOFY2Wk0zIDE2LjA2VjE4YzAgLjQxNC4zMzYuNzUuNzUuNzVoMTYuNUEuNzUuNzUgMCAwIDAgMjEgMTh2LTEuOTRsLTIuNjktMi42ODlhMS41IDEuNSAwIDAgMC0yLjEyIDBsLS44OC44NzkuOTcuOTdhLjc1Ljc1IDAgMSAxLTEuMDYgMS4wNmwtNS4xNi01LjE1OWExLjUgMS41IDAgMCAwLTIuMTIgMEwzIDE2LjA2MVptMTAuMTI1LTcuODFhMS4xMjUgMS4xMjUgMCAxIDEgMi4yNSAwIDEuMTI1IDEuMTI1IDAgMCAxLTIuMjUgMFoiPjwvcGF0aD4KPC9zdmc+";
  static placeholderImage = null
  static placeholderImagePromise = null; // Store the promise here
  static wgl = null
  static wtexture = null
  static wframebuffer = null

  static setupWGL(){
    if( this.wUnsupported){return}
    console.log(`Setting up wgl`)
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl = canvas.getContext('webgl');
    if (!gl) {
      this.wUnsupported = true
      return
    }

    // Setup shaders, buffers, and framebuffer (same as before)
    // Do this only once for all images
    const program = setupShadersAndBuffers(gl);
    const framebuffer = setupFramebuffer(gl);

    // Reuse the same texture object for all images
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.wgl = gl
    this.wtexture = texture
    this.wframebuffer = framebuffer
  }

  constructor(attrs) {
    const defaults = {
      maxScale: 10,
      scaleRatio: 2,
      rescaleMax: 4,
      rescaleMin: 0.14}
    
    super(attrs);
    for( const k in defaults){
      this[k] = attrs[k] ?? defaults[k]
    }

    this.avgColor = '#e2e2e2'

    if( !this.attrs.placeholder ){
      if( this.attrs.cloneFrom){
        this.cloneImage(this.attrs.cloneFrom)
      }else{
        this._buildPrivateCache()

        if( this.attrs.url ){
          this.fetchAndCreateImageBitmap( ).then(()=>{
          this.requestRefresh()
          })
        }
      }
    }
    
    this._requestDraw()

  }
  finalize(options){
    if( !this.attrs.placeholder ){
      return
    }
    if( this.attrs.url ){
      this.fetchAndCreateImageBitmap( )
    }
    this._buildPrivateCache()
    this.attrs.placeholder = false
    this.attrs.name = undefined
    if( !this.attrs.refreshCallback && options){
      this.attrs.refreshCallback = options?.imageCallback(this)
    }
    this.requestRefresh()

  }

  cloneImage(cache){
    this.pcache = cache
    this.isClone = true
    //this.pcache._canvas_context.drawImage(this.maxImage, 0, 0, this.pcache.width, this.pcache.height);
  }
checkCanvasCleared() {
  if( this.pcache){
    let canvas = this.pcache._canvas_context
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

  static syncAverageQueue(){
    let gl = this.wgl
    const list = this.wList.splice(0, WGL_QUEUE_LENGTH)

    let numImages = list.length
    const pixelData = new Uint8Array(numImages * 4);  // 4 bytes per image (RGBA)
    gl.readPixels(0, 0, numImages, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);
    let o = 0
    for(const d of list){
      d.avgColor = `rgb(${pixelData[ o + 0]}, ${pixelData[o + 1]}, ${pixelData[o + 2]})`
      o += 4
    }
    if( this.wList.length > 0){
      CustomImage.scheduleQueueSync()
    }
  }
  static scheduleQueueSync(){
    if( this.wTimeout ){
      return
    }
    this.wTimeout = setTimeout(()=>{
      this.wTimeout = undefined
      CustomImage.syncAverageQueue()
    }, WGL_QUEUE_TIMEOUT)
  }

  static requestAverageColorFromWGL(image) {
    if( !this.wgl ){
      CustomImage.setupWGL()
      this.wList = []
    }
    if( this.wUnsupported ){
      return
    }
    let gl = this.wgl
    
    let x = this.wList.length
    gl.viewport(x, 0, 1, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image.pcache._canvas);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.wList.push(image)

    if( x === WGL_QUEUE_LENGTH - 1){
      clearTimeout( this.wTimeout )
      this.wTimeout = undefined
      CustomImage.syncAverageQueue()
    }else{
      CustomImage.scheduleQueueSync()
    }
}

getAverageColor(ctx, width, height) {
  // Get the image data (all the pixels)
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let r = 0, g = 0, b = 0;
  const factor = 1
  const inc = 4 * factor

  for (let i = 0; i < data.length; i += inc) {
    r += data[i];     // Red
    g += data[i + 1]; // Green
    b += data[i + 2]; // Blue
  }

  // Calculate the average color
  const pixelCount = data.length / inc;
  r = Math.round(r / pixelCount);
  g = Math.round(g / pixelCount);
  b = Math.round(b / pixelCount);

  // Return the result as an RGB string
  return `rgb(${r}, ${g}, ${b})`;
}

  fetchAndCreateImageBitmap() {
    return new Promise((resolve, reject) => {
      const img = new Image();
  
      img.onload = () => {
          let padding = this.attrs.padding ?? [0,0,0,0]
          let aWidth = this.attrs.width - padding[1] - padding[3]
          let aHeight = (this.attrs.height - padding[0] - padding[2]) 
          let targetWidth = aWidth * this.maxScale * this.scaleRatio, targetHeight = aHeight * this.maxScale * this.scaleRatio
          
          const targetRatio = targetWidth / targetHeight

          let sy = 0, sx =0
          let sWidth = img.width
          let sHeight = img.height
          let newWidth, newHeight

          if( this.attrs.fit === "cover"){
            if(img.width >= img.height){
                sHeight = img.width / targetRatio
                sy = (img.height - sHeight) / 2
            }else{
                sWidth = img.height * targetRatio
                sx = (img.width - sWidth) / 2
            }
            newWidth = targetWidth
            newHeight = targetHeight
          }else{
            if(img.width > img.height){
              if(img.width < targetWidth){
                targetWidth = img.width
                targetHeight = targetWidth / targetRatio
              }
            }else{
              if(img.height < targetHeight){
                targetHeight = img.height
                targetWidth = targetHeight * targetRatio
              }
            }
            const imgScale = Math.min( targetWidth / img.width, targetHeight / img.height)
            newWidth = img.width * imgScale
            newHeight = img.height * imgScale
          }



          const xOffset = (targetWidth - newWidth) / 2;
          const yOffset = (targetHeight - newHeight) / 2;

          this.activeScale = Math.min(targetWidth / aWidth, targetHeight / aHeight )
      

          this.maxImage = document.createElement('canvas');
          this.maxImage.width = this.attrs.width * this.activeScale
          this.maxImage.height = this.attrs.height * this.activeScale



          let ctx = this.maxImage.getContext("2d")

          if( xOffset !== 0 || yOffset !== 0 || newWidth !== targetWidth || newHeight !== targetHeight ){
            this.needsFill = true
          }
          if(!this.attrs.url.startsWith("svg:")){
            ctx.fillStyle = 'white';
            ctx.fillRect(0,0,this.maxImage.width, this.maxImage.height)
          }

          ctx.drawImage(img, sx,sy, sWidth,sHeight, xOffset + (this.activeScale * padding[3]), yOffset + (this.activeScale * padding[0]), newWidth, newHeight);
          
          
          this._clearSelfAndDescendantCache('absoluteTransform')
          this.requestRefresh()
        
        resolve(); // Indicate that the image has been successfully loaded and drawn

      };
  
      img.onerror = (e) => {
        if( this.attrs.alt ){
          this.maxImage = document.createElement('canvas');
          this.maxImage.width = 128//this.attrs.width * this.activeScale
          this.maxImage.height = 128//this.attrs.height * this.activeScale
          let ctx = this.maxImage.getContext("2d")
          ctx.fillStyle = 'white';
          ctx.fillRect(0,0,this.maxImage.width, this.maxImage.height)
          
          ctx.fillStyle = 'black';
          ctx.textBaseline = "middle"
          ctx.textAlign = "center"
          ctx.font = "14px Arial"
          ctx.fillText(this.attrs.alt , 64, 64)
          this.pcache._canvas_context.drawImage(this.maxImage, 0,0);
          this.requestRefresh()
        }
        resolve()
      };

          
      let url = this.attrs.url
      if(this.attrs.url.startsWith("svg:")){
        img.width = this.attrs.width * this.attrs.scaleRatio
        img.height = this.attrs.height * this.attrs.scaleRatio 
        url = url.slice(4)
        url = url.replace(/\swidth="\d+"/, ` width="${img.width}"`)
        url = url.replace(/\sheight="\d+"/, ` height="${img.height}"`)

        url = 'data:image/svg+xml;utf8,' + encodeURIComponent( url )
      }
  
      img.crossOrigin = 'Anonymous';
      img.src = url
    });
  }
  toDataURL(){
    if( this.maxImage ){
      return this.maxImage.toDataURL("image/png", 1)
    }
    return super.toDataURL()
  }
  _buildPrivateCache(){

    this.pcache = new SceneCanvas({
      width: this.getWidth() * this.scaleRatio ,
      height: this.getHeight() * this.scaleRatio,
      pixelRatio: 1
    })
    this.pcache._canvas_context = this.pcache._canvas.getContext("2d")    

    
    if( !this.maxImage && !this.cloneFrom){
      CustomImage.ensurePlaceholderReady().then(() => {
          if( !this.maxImage ){
            if(!this.attrs.url.startsWith("svg:")){
                const w = Math.max(Math.min(this.pcache.width, 200),CustomImage.placeholderImage.width)
                const h = CustomImage.placeholderImage.height / CustomImage.placeholderImage.width * w
                let x = (this.pcache.width - w)/2
                let y = (this.pcache.height - h)/2
                this.pcache._canvas_context.drawImage(CustomImage.placeholderImage, x, y, w, h);
            }
        }
      });
    }
    
  }
  clone(){
    const newItem = super.clone({url:undefined, cloneFrom: this.pcache})
    return newItem
  }


  static ensurePlaceholderReady() {
    if (!CustomImage.placeholderImage) {
      if (!this.placeholderImagePromise) {
        // Only create the placeholder if it doesn't already exist
        this.placeholderImagePromise =  new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0); // Draw the image onto the canvas

            CustomImage.placeholderImage = canvas; // Assign the canvas as the placeholder image
            resolve(); // Resolve the promise now that the placeholder is ready
          };
          img.src = this.phUrl; // Set the source of the image to the data URL
        });
      }
      return this.placeholderImagePromise 
    } else {
      // If the placeholder already exists, return a resolved promise
      return Promise.resolve();
    }
  }

  refreshCache(){
    this.queuedForRefresh = false
    if( this.maxImage ){
      if( this.newScale ){
        const width = this.getWidth();
        const height = this.getHeight();


        let sWidth = width * this.newScale * this.scaleRatio
        let sHeight = height * this.newScale * this.scaleRatio
        if( sHeight > 30000 || sWidth > 30000 || (sWidth * sHeight) > 16000000){
          this.lastScale = this.newScale
          this.newScale = undefined
          return
        }else{

          this.pcache._canvas.width = sWidth
          this.pcache._canvas.height = sHeight

          this.pcache.width = sWidth
          this.pcache._canvas.style.width = width + 'px';
          
          this.pcache.height = sHeight
          this.pcache._canvas.style.height = height + 'px';
          
          this.lastScale = this.newScale
          this.newScale = undefined
        }
      }
      this.pcache._canvas_context.drawImage(this.maxImage, 0, 0, this.pcache.width, this.pcache.height);
      if(!this.avgColorComputed && this.pcache._canvas.width > 0 && this.pcache._canvas.height > 0 ){
        this.avgColorComputed = true
        CustomImage.requestAverageColorFromWGL( this )
      }
    }
  }
  resetOwner(){
    this.queuedForRefresh = false
  }
  requestRefresh(){
        if(this.attrs.refreshCallback && !this.placeholder){
          if( ! this.queuedForRefresh){
            this.queuedForRefresh = true
            this.attrs.refreshCallback()
            return
          }
        }
  }

  destroy(){
    if( this.pcache ){
      if(!this.isClone){
        Util.releaseCanvas( this.pcache )
      }
      if( this.maxImage ){
          this.maxImage.width = 0
          this.maxImage.height = 0
        }
    }
    return Shape.prototype.destroy.call(this);
  }

  _useBufferCanvas() {
    return Shape.prototype._useBufferCanvas.call(this, true);
  }

  _sceneFunc(context) {
    if( !this.pcache ){
      return
    }
    const width = this.getWidth();
    const height = this.getHeight();
    this.lastRenderContext = context
    
    if( !((width > 0) && (height > 0))){
      return
    }

    let scale = this.scale()?.x ?? 1
    let parent = this.parent
    while (parent) {
      scale *= parent.scale()?.x
      parent = parent.parent
    }
    
    if( this.maxImage !== undefined){
        const ratio = (scale / (this.lastScale ?? 1)) 
        if( ratio < this.rescaleMin || ratio > this.rescaleMax || this.refreshForCycle){
          this.refreshForCycle = false
          if( this.refreshForCycle ){
            console.log(`REFRESH FOR RECYCLE`)
          }
          this.newScale = scale
          this.requestRefresh()
      }
    }
    if(  ((width * scale) < 6 || (height * scale )< 6)){      
      context.fillStyle = this.avgColor ?? '#e2e2e2'
      context.fillRect(0, 0,  width, height)
    }else{
      if( this.pcache._canvas.width > 0 && this.pcache._canvas.height > 0){
        context.drawImage(this.pcache._canvas, 0, 0 , width, height)
      }
    }
  }

  _hitFunc(context) {
    const width = this.width();
    const height = this.height();
    const cornerRadius = this.cornerRadius();

    context.beginPath();
    if (!cornerRadius) {
        context.rect(0, 0, width, height);
    } else {
        Util.drawRoundedRectPath(context, width, height, cornerRadius);
    }
    context.closePath();
    context.fillStrokeShape(this);
  }

  getWidth() {
    return this.attrs.width ?? this.image()?.width;
  }

  getHeight() {
    return this.attrs.height ?? this.image()?.height;
  }


  static fromURL(url, callback, onError = null) {
    const img = Util.createImageElement();
    img.onload = function () {
      
      const image = new CustomImage({image: img});
        callback(image);
    };
    img.onerror = onError;
    img.crossOrigin = 'Anonymous';
    img.src = url;
  };
}

_registerNode(CustomImage);

Factory.addGetterSetter(
  CustomImage,
  'cornerRadius',
  0,
  getNumberOrArrayOfNumbersValidator(4)
);

// Additional getters and setters for image and crop properties can be added similarly
// to how they were defined in the original TypeScript code.


/**
 * get/set image source. It can be image, canvas or video element
 * @name Konva.Image#image
 * @method
 * @param {Object} image source
 * @returns {Object}
 * @example
 * // get value
 * var image = shape.image();
 *
 * // set value
 * shape.image(img);
 */
Factory.addGetterSetter(CustomImage, 'image');

Factory.addComponentsGetterSetter(CustomImage, 'crop', ['x', 'y', 'width', 'height']);
/**
 * get/set crop
 * @method
 * @name Konva.Image#crop
 * @param {Object} crop
 * @param {Number} crop.x
 * @param {Number} crop.y
 * @param {Number} crop.width
 * @param {Number} crop.height
 * @returns {Object}
 * @example
 * // get crop
 * var crop = image.crop();
 *
 * // set crop
 * image.crop({
 *   x: 20,
 *   y: 20,
 *   width: 20,
 *   height: 20
 * });
 */

Factory.addGetterSetter(CustomImage, 'cropX', 0, getNumberValidator());
/**
 * get/set crop x
 * @method
 * @name Konva.Image#cropX
 * @param {Number} x
 * @returns {Number}
 * @example
 * // get crop x
 * var cropX = image.cropX();
 *
 * // set crop x
 * image.cropX(20);
 */

Factory.addGetterSetter(CustomImage, 'cropY', 0, getNumberValidator());
/**
 * get/set crop y
 * @name Konva.Image#cropY
 * @method
 * @param {Number} y
 * @returns {Number}
 * @example
 * // get crop y
 * var cropY = image.cropY();
 *
 * // set crop y
 * image.cropY(20);
 */

Factory.addGetterSetter(CustomImage, 'cropWidth', 0, getNumberValidator());
/**
 * get/set crop width
 * @name Konva.Image#cropWidth
 * @method
 * @param {Number} width
 * @returns {Number}
 * @example
 * // get crop width
 * var cropWidth = image.cropWidth();
 *
 * // set crop width
 * image.cropWidth(20);
 */

Factory.addGetterSetter(CustomImage, 'cropHeight', 0, getNumberValidator());
/**
 * get/set crop height
 * @name Konva.Image#cropHeight
 * @method
 * @param {Number} height
 * @returns {Number}
 * @example
 * // get crop height
 * var cropHeight = image.cropHeight();
 *
 * // set crop height
 * image.cropHeight(20);
 */


export default CustomImage;