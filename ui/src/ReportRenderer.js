
import Konva from 'konva';
import MainStore from './MainStore';
import CustomText from './CustomText';
import { RenderSetAsKonva } from './RenderHelpers';
    function customRenderer( list, element, customCallback ){

        const rh_config = element.referenceParameters?.content?.config || element.content?.config
        if( rh_config){
            var scale = 1
            if( element.referenceParameters?.content?.scale){
                scale = parseInt(element.referenceParameters.content.scale) / 100
            }
            var group = RenderSetAsKonva( element, list, {...element.content,renderConfig: {
                                                                                            ...element.render, 
                                                                                            width: element.render.width ? element.render.width / scale : undefined,
                                                                                            height: element.render.height ? element.render.height / scale : undefined,
                                                                                        }, 
                x:0, 
                y: 0, 
                imageCallback:customCallback,
                placeholder: false, config: rh_config } )
            if( group ){
                if( scale !== 1){
                    group.scale({x:scale, y:scale})
                }
            }
            return group
        }
    }

    export function renderElementContent(rInstance, source, d, customCallback, fetchData){
        if( source ){
            let items = [source]
            if( d.referenceParameters?.target ){
                items = items.map(d2=>d.fetchItemsForAction({source: d2})).flat(Infinity)
                if( d.referenceParameters.parentFilterId){
                    items = items.filter(d2=>d2.parentPrimitiveIds.includes(d.referenceParameters.parentFilterId))
                }
            }
            
            let content = d.referenceParameters?.content ?? d.content
            let text
            if( content ){
                if( content.compute === "summarize" || content.compute === "extract" ){
                    text = rInstance.computeCache && rInstance.computeCache[d.id]
                    if( text === "_FETCHING_"){
                        text = "Fetching data...."
                    }else if( !text ){
                        rInstance.setField(`computeCache.${d.id}`, "_FETCHING_")
                        if( fetchData ){
                            fetchData(d)
                        }
                    }else{
                        const original = text
                        text = (content?.caption ? content?.caption + "\n\n" : "") + text
                        if( content.compute === "extract"){
                            if( Array.isArray(original)){
                                items = original.map(d=>MainStore().primitive(d))
                                const rendered = customRenderer(items, d )
                                return rendered
                            }
                        }
                    }
                }else if( content.compute === "grid" && items && items.length > 0){
                    const rendered = customRenderer(items, d, customCallback )
                    return rendered
                }else{
                    const out = []
                    for( const item of items){
                        let node = item
                        const field = d.referenceParameters?.field ?? content.field ?? "title"
                        const parts = field.split(".")
                        let lastField = parts.pop()
                        if( parts.length > 0 ){
                            node = node.referenceParameters
                        }
                        let t = node?.[lastField]
                        if( t instanceof Object ){
                            if(Array.isArray(d)){
                                t = d.join("\n")
                            }else{
                                t = t.map(d3=>Object.keys(d3).map(d2=>`${d2}: ${d3[d2]}`).join("\n")).join("\n")
                            }
                        }
                        out.push( t)
                    }
                    text = (content?.caption ? content?.caption + "\n\n" : "") + out.join("\n")
                }
            }
            if( text ){
                return new CustomText({
                    x: 0,
                    y: 0,
                    width: d.render?.width ?? 200,
                    height: d.render?.height ?? 100,
                    fontFamily: d.referenceParameters?.fontFamily ?? d.render?.fontFamily ?? 'Poppins',
                    fontSize: d.referenceParameters?.fontSize ?? d.render?.fontSize ?? 16,
                    fontStyle: d.referenceParameters?.fontStyle ?? d.render?.fontStyle ?? "normal",
                    padding: d.referenceParameters?.padding ?? d.render?.padding ?? 20 ,
                    lineHeight: d.referenceParameters?.lineHeight ?? d.render?.lineHeight ?? 1.25,
                    refreshCallback:customCallback,
                    text: text
                })
            }
        }

    }

export function renderScene(primitive, source, options){
    let showBoundingBox = false
        const elements = primitive.primitives.allUniqueElement
        let rInstance = primitive.primitives.allReportinstance.find(d=>d.parentPrimitiveIds.includes(source.id) )
        if( !rInstance){
            return undefined
        }
        let maxX = 0, maxY = 0

        const g = new Konva.Group({
            x:0,
            y:0
        })
        for(const d of elements){
            const e = new Konva.Group({
                x: d.render?.x ?? 0,
                y: d.render?.y ?? 0,
                width: d.render?.width ?? 200,
                height: d.render?.height ?? 100,
                draggable: options.selectable,
                id: d.id
            })
            g.add(e)
            if( options.selectable ){
                e.on("click", (e)=>{
                    if(e.evt.altKey || e.evt.shiftKey){
                        options.fetchData(d)
                    }
                    options.selectElement(e,d)
                })
                e.on("dragstart", (e)=>options.setTransformer(e.currentTarget))
                e.on("dragend", (e)=>{
                    const newRender = {
                        ...(d.render ?? {}),
                        x: e.target.x(),
                        y: e.target.y(),
                    }
                    d.setField('render', newRender)
                })
                e.on("transformend", () => {
                    const node = e
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    const w = node.width() * scaleX
                    const h = node.height() * scaleY


                    node.setAttrs({
                        width: w,
                        height: h,
                        scaleX:1, 
                        scaleY:1
                    });

                    const newRender = {
                        ...(d.render ?? {}),
                        x: node.x(),
                        y: node.y(),
                        width: w,
                        height: h,
                    }
                    d.setField('render', newRender)


                    
                    e.children.find(d=>d.attrs.id === '_content')?.destroy()
                    const content = renderElementContent(rInstance, source, d, options.refreshCallback, options.fetchData)
                    if( content ){
                        content.attrs.id = "_content"
                        e.add(content)
                    }else{
                        for(const d of e.children){
                            d.destroy()
                        }
                        const bg = new Konva.Rect({
                            x: 0,
                            y: 0,
                            strokeScaleEnabled: false,
                            width: d.render?.width ?? 200,
                            height: d.render?.height ?? 100,
                            stroke: showBoundingBox ? "black" : undefined
                        })
                        e.add(bg)
                    }
                    
                    
                    setTimeout(() => {
                        if(options.refreshCallback){
                            options.refreshCallback()
                        }
                    }, 50);
                })

            }

            let content 
            if( d.referenceParameters?.content ?? d.content){
                content = renderElementContent(rInstance, source, d, options.refreshCallback)
            }
            if( content ){
                content.attrs.id = "_content"
                e.add(content)
            }else{
                const bg = new Konva.Rect({
                    x: 0,
                    y: 0,
                    strokeScaleEnabled: false,
                    width: d.render?.width ?? 200,
                    height: d.render?.height ?? 100,
                    stroke: "black" 
                })
                e.add(bg)
            }
            let r = e.x() + e.width()
            let b = e.y() + e.height()
            maxX = r > maxX ? r : maxX
            maxY = b > maxY ? b : maxY
        }
        g.width( maxX)
        g.height( maxY)
        return g
    }