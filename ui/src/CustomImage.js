import { SceneCanvas } from 'konva/lib/Canvas'
import { Context } from 'konva/lib/Context'
import { Factory } from 'konva/lib/Factory'
import { _registerNode } from 'konva/lib/Global'
import { Shape, ShapeConfig } from 'konva/lib/Shape'
import { GetSet, IRect } from 'konva/lib/types'
import { Util } from 'konva/lib/Util'
import { getNumberValidator, getBooleanValidator, getStringValidator, getNumberOrArrayOfNumbersValidator } from 'konva/lib/Validators'


class CustomImage extends Shape {

  static phUrl = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iNjAiIGZpbGw9IiNhYWEiIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBhcmlhLWhpZGRlbj0idHJ1ZSI+CiAgPHBhdGggY2xpcC1ydWxlPSJldmVub2RkIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xLjUgNmEyLjI1IDIuMjUgMCAwIDEgMi4yNS0yLjI1aDE2LjVBMi4yNSAyLjI1IDAgMCAxIDIyLjUgNnYxMmEyLjI1IDIuMjUgMCAwIDEtMi4yNSAyLjI1SDMuNzVBMi4yNSAyLjI1IDAgMCAxIDEuNSAxOFY2Wk0zIDE2LjA2VjE4YzAgLjQxNC4zMzYuNzUuNzUuNzVoMTYuNUEuNzUuNzUgMCAwIDAgMjEgMTh2LTEuOTRsLTIuNjktMi42ODlhMS41IDEuNSAwIDAgMC0yLjEyIDBsLS44OC44NzkuOTcuOTdhLjc1Ljc1IDAgMSAxLTEuMDYgMS4wNmwtNS4xNi01LjE1OWExLjUgMS41IDAgMCAwLTIuMTIgMEwzIDE2LjA2MVptMTAuMTI1LTcuODFhMS4xMjUgMS4xMjUgMCAxIDEgMi4yNSAwIDEuMTI1IDEuMTI1IDAgMCAxLTIuMjUgMFoiPjwvcGF0aD4KPC9zdmc+";
  static placeholderImage = null
  static placeholderImagePromise = null; // Store the promise here

  constructor(attrs) {
    super(attrs);
    this.maxScale = 10
    this.scaleRatio = 2
    this.rescaleMax = 1.5
    this.rescaleMin = 0.14



    if( !this.attrs.placeholder ){
      this._buildPrivateCache()
      if( this.attrs.url ){
        this.fetchAndCreateImageBitmap( )
      }
  }
    
    this._requestDraw()

  }
  finalize(){
    if( !this.attrs.placeholder ){
      return
    }
    if( this.attrs.url ){
      this.fetchAndCreateImageBitmap( )
    }
    this._buildPrivateCache()
    this.attrs.placeholder = false
    this.attrs.name = undefined
        if(this.attrs.refreshCallback ){
          this.attrs.refreshCallback()
        }

  }


  fetchAndCreateImageBitmap() {
    return new Promise((resolve, reject) => {
      const img = new Image();
  
      img.onload = () => {
          let targetWidth = this.attrs.width * this.maxScale * this.scaleRatio, targetHeight = this.attrs.height  * this.maxScale * this.scaleRatio
          
          const targetRatio = targetWidth / targetHeight

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
          let newWidth = img.width * imgScale
          let newHeight = img.height * imgScale

          const xOffset = (targetWidth - newWidth) / 2;
          const yOffset = (targetHeight - newHeight) / 2;

      

          this.maxImage = document.createElement('canvas');
          this.maxImage.width = targetWidth
          this.maxImage.height = targetHeight

          let ctx = this.maxImage.getContext("2d")
          ctx.fillStyle = 'white';
          ctx.fillRect(0,0,targetWidth, targetHeight);
          ctx.drawImage(img, xOffset, yOffset, newWidth, newHeight);
          this.refreshCache()
        
        resolve(); // Indicate that the image has been successfully loaded and drawn

      };
  
      img.onerror = () => {};
  
      img.src = this.attrs.url
    });
  }
/*  OLDfetchAndCreateImageBitmap() {
    return fetch(this.attrs.url)
      .then(response => response.blob())
      .then(blob => {
        return createImageBitmap(blob).then(bitmap => {
          let targetWidth = this.attrs.width * this.maxScale * this.scaleRatio, targetHeight = this.attrs.height  * this.maxScale * this.scaleRatio
          
          const targetRatio = targetWidth / targetHeight
          const bitmapAspectRatio = bitmap.width / bitmap.height;


          if(bitmap.width < targetWidth){
            targetWidth = bitmap.width
            targetHeight = targetWidth / targetRatio
          }
          if(bitmap.height < targetHeight){
            targetHeight = bitmap.height
            targetWidth = targetHeight * targetRatio
          }

          const bitmapScale = Math.min( targetWidth / bitmap.width, targetHeight / bitmap.height)
          let newWidth = bitmap.width * bitmapScale
          let newHeight = bitmap.height * bitmapScale

          const xOffset = (targetWidth - newWidth) / 2;
          const yOffset = (targetHeight - newHeight) / 2;

      

          this.maxImage = document.createElement('canvas');
          this.maxImage.width = targetWidth
          this.maxImage.height = targetHeight

          let ctx = this.maxImage.getContext("2d")
          ctx.fillStyle = 'white';
          ctx.fillRect(0,0,targetWidth, targetHeight);
          ctx.drawImage(bitmap, xOffset, yOffset, newWidth, newHeight);
          this.refreshCache()
          if(this.attrs.refreshCallback){
            this.attrs.refreshCallback()
          }

        });
      });
  }*/

  _buildPrivateCache(){

    this.pcache = new SceneCanvas({
      width: this.getWidth() * this.scaleRatio ,
      height: this.getHeight() * this.scaleRatio,
    })
    this.pcache._canvas_context = this.pcache._canvas.getContext("2d")    

    
    if( !this.maxImage ){
      CustomImage.ensurePlaceholderReady().then(() => {
          if( !this.maxImage ){
          this.pcache._canvas_context.drawImage(CustomImage.placeholderImage, 0, 0, this.pcache.width, this.pcache.height);
        }
      });
    }
    
  }


  static ensurePlaceholderReady() {
    if (!CustomImage.placeholderImage) {
      if (!this.placeholderImagePromise) {
        console.log(`***** CARETI`)
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
    if( this.maxImage ){
      if( this.newScale ){
        //     console.time("drwa")
        const width = this.getWidth();
        const height = this.getHeight();
        this.pcache.width = this.pcache._canvas.width = width * this.newScale * this.scaleRatio;
        this.pcache._canvas.style.width = width + 'px';
        
        this.pcache.height = this.pcache._canvas.height = height * this.newScale * this.scaleRatio;
        this.pcache._canvas.style.height = height + 'px';
        
        this.lastScale = this.newScale
        this.newScale = undefined
      }
      this.pcache._canvas_context.drawImage(this.maxImage, 0, 0, this.pcache.width, this.pcache.height);
    }
  }

  destroy(){
    if( this.pcache ){
      Util.releaseCanvas( this.pcache )
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

    let scale = this.scale()?.x ?? 1
    let parent = this.parent
    while (parent) {
      scale *= parent.scale()?.x
      parent = parent.parent
    }
    
    if( this.maxImage ){
        const ratio = (scale / (this.lastScale ?? 1)) 
        if( ratio < this.rescaleMin || ratio > this.rescaleMax){
          this.newScale = scale
        if(this.attrs.refreshCallback && !this.placeholder){
          this.attrs.refreshCallback()
        }
      }
    }
    context.drawImage(this.pcache._canvas, 0, 0, width, height)

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