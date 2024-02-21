import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Transformer, Group, Image, Line } from 'react-konva';
import MainStore from './MainStore';
import useImage from 'use-image';
import useDataEvent from './CustomHook';
import { RenderPrimitiveAsKonva, RenderSetAsKonva, roundCurrency } from './RenderHelpers';
import { exportKonvaToPptx } from './PptHelper';

let showBoundingBox = false

const PrimitiveImage = ({url, size, ...props}) => {
  const [image] = useImage(url);
  let x = 0 ,y = 0, width = 20, height = 20
  if( image ){
    if( size ){
        let scale = Math.min(size / image.width, size / image.height)
        width = image.width * scale
        height = image.height * scale
        x = (size - width) / 2
        y = (size - height) / 2
    }
  }
  return <Image image={image} {...props} x={props.x + x} y={props.y + y} width={width} height={height}/>;
};


function getTokensInString(text) {
    if (typeof text === "string") {
      var result = [];
      var tokens = text.split(/\s/);
      for(var i = 0; i < tokens.length; i++) {
        if (tokens[i].length > 0) {
          result.push(tokens[i]);
        }
      }
      return result;
    }
    return [];
  }
  
  function hasBrokenWords (sourceTokens, renderLines) {
    var combined = "";
    for (var i = 0; i < renderLines.length; i++) {
      combined += (i === 0 ? "" : " ") + renderLines[i].text;
    }
      
    var a = sourceTokens;
    var b = getTokensInString(combined);
        
    if (a.length !== b.length) {
        return true;
    }
      
    for (var i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return true;
        }
    }
      
    return false;
  }
function shrinkTextToFit( konvaObject, attributes, startSize ){
    return
    var sourceTokens = getTokensInString(attributes.text);
    var minFont = 2
    if( startSize ){
        konvaObject.fontSize(startSize)
    }
    let size = konvaObject.fontSize()
    
//    console.log(`Start = ${size}`)
    while( (size > minFont) && (konvaObject.getHeight() > attributes.height || hasBrokenWords(sourceTokens, konvaObject.textArr))){
        const newSize = size > 20 ? size - 1 : size > 10 ? size - 0.5 : size * 0.98
        konvaObject.fontSize( newSize );
        size = newSize
        //console.log(`-- ${size}`)
    }
}

const PrimitiveReport = forwardRef(function PrimitiveReport({primitive, source, ...props}, ref){
    const stage = useRef()
    const trRef = useRef()
    const myState = useRef({manualList: {}})
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [rInstance, setRInstance] = useState(  )
    const [selected, setSelected] = useState()

    function customRenderer( list, renderId, element, primitive, source, stage, commonAttrs){

        if( element.content?.config){
            var group = RenderSetAsKonva( element, list, {...element.content,...element.render, x:0, y: 0, imageCallback: ()=>stage.current.batchDraw()} )
            myState.current.manualList[element.id] = group
            return <Group id={`o${element.id}`} {...commonAttrs} />
        }

        console.log('doing')
        console.log(list.map(d=>d.plainId).length)
        let startX = element.render.x + (element.padding ?? 20)
        let startY = element.render.y + (element.padding ?? 20)
        let out = []
        let cx = startX
        let cy = startY
        let config = {grid: true, width: 600, height: 160, padding: [10,10,10,10]}
        if( renderId === 29 ){
            list = list.sort((a,b)=>(b.referenceParameters?.funding ?? 0) - (a.referenceParameters?.funding ?? 0) )
        }

        if( renderId === 84 ){
            const priority = []
            list = list.filter((item)=>{
                const partnership_a = item.relationshipAtLevel("partnership_a", 1)?.[0]
                const partnership_b = item.relationshipAtLevel("partnership_b", 1)?.[0]
                if( !(partnership_b && partnership_a)){return false}
                if( !(partnership_b.title && partnership_a.title)){return false}
                const rejects = ["Not specified", "Various", "unspecified", "dubai", "ahlibank", "european bank for"]
                if( rejects.filter(d=>partnership_a.title.toLowerCase().indexOf(d.toLowerCase()) > -1).length > 0){return false}
                if( rejects.filter(d=>partnership_b.title.toLowerCase().indexOf(d.toLowerCase()) > -1).length > 0){return false}
                const hits = ["HSBC", "BNP", "BoA", "Bank of America", "Barclays", "Chase", "Goldman Sachs", "Fargo", "JP Morgan","midcap"]
                if( hits.filter(d=>partnership_a.title.toLowerCase().indexOf(d.toLowerCase()) > -1).length > 0){
                    priority.push( item )
                    return false
                }
                if( hits.filter(d=>partnership_b.title.toLowerCase().indexOf(d.toLowerCase()) > -1).length > 0){
                    priority.push( item )
                    return false
                }
                return true
            })
            list = [priority, list].flat()
            list = list.filter((d,i,a)=>{
                const partnership_a = d.relationshipAtLevel("partnership_a", 1)?.[0]
                return a.findIndex(d2=>d2.relationshipAtLevel("partnership_a", 1)?.[0].id === partnership_a.id) === i 
            })
        }
        for(const item of list){
            //console.log(`Rendering `, item.plainId)
            if( (cy + config.height + config.padding[0] - startY ) > element.render.height ){
                break
            }
            if( renderId === 29 ){
                //config = {grid: true, width: 230, height: 120, padding: [10,10,10,10], items: {funding: false}}
                config = {grid: true, width: 300, height: 130, padding: [5,5,5,5], items: {funding: true}}
                const size = 45
                const description = item.referenceParameters?.description
                const funding = config.items.funding ? (item.referenceParameters?.funding ? `${roundCurrency(item.referenceParameters?.funding)} total funding` : "UNKNOWN FUNDING") : undefined
                const inset = 15
                const divideX = config.padding[3] + size + inset + inset
                const imageX = (inset ) + config.padding[3]
                const frameWidth = config.width - config.padding[1] - config.padding[3]
                const frameHeight = config.height - config.padding[0] - config.padding[2]
                const textX = divideX + (inset * 0.5) 
                const textWidth = frameWidth - (textX - config.padding[3]) - 10
                const activeHeight = frameHeight - inset - inset  - (funding ? 10 : 0)
                const textY = config.padding[0] + inset
                const imageY = config.padding[0] + inset + ((activeHeight - size) / 2) - 22
             //   console.log(activeHeight)
                out.push(<Group x={cx } y={cy } >
                    <Rect x={config.padding[3]} y={config.padding[0]} width={frameWidth} height={frameHeight} stroke="#f3f3f3"/>
                    <Rect x={divideX} y={config.padding[0]} width={frameWidth - (divideX - config.padding[3])} height={frameHeight} fill="#f3f3f3"/>
                    <Text width={size + inset + inset - 4} y={imageY + size + 8} x={config.padding[3] + 2} text={item.title} align='center' fontSize={10}  fontFamily='Poppins' />
                    <PrimitiveImage x={imageX} y={imageY} size={size} url={`/api/image/${item.id}`}/>
                    <Text x={textX} y={textY} width={textWidth} height={activeHeight} ellipsis align='left' verticalAlign='top' fontSize={11} text={description} lineHeight={1.15} fontFamily='Poppins'/>
                    {config.items.funding && <Text x={textX} y={textY + activeHeight} width={textWidth} height={10} align='center' verticalAlign='top' text={funding} fontSize={10} lineHeight={1.1} fill='#888'  fontFamily='Poppins'/>}
                </Group>)    
            }
            if( renderId === 84 ){
                const partnership_a = item.relationshipAtLevel("partnership_a", 1)?.[0]
                const partnership_b = item.relationshipAtLevel("partnership_b", 1)?.[0]
                if( !(partnership_a && partnership_b)){
                    continue
                }
                const size = config.height - 50
                const separation = 100
                const description = item.referenceParameters.summary 
                const textX = 30 + config.padding[3] + size + separation + size + 10
                out.push(<Group x={cx } y={cy } >
                    <Rect x={config.padding[3]} y={config.padding[0]} width={config.width} height={config.height} fill="#f3f3f3"/>
                    <Text width={size} y={30+size} x={20 + config.padding[3]} text={partnership_a.title} align='center' fontSize={12}/>
                    <Text width={size} y={30+size} x={20 + config.padding[3] + size + separation} align="center" text={partnership_b.title}  fontSize={12}/>
                    <Line
                        x={20 + config.padding[3] + size + (separation / 2)}
                        y={(config.height / 2) + config.padding[0]}
                        points={[5, -10, 15, 0, 5, 10]}
                        stroke="#444"
                    />
                    <Line
                        x={20 + config.padding[3] + size + (separation / 2)}
                        y={(config.height / 2) + config.padding[0]}
                        points={[-5, -10, -15, 0, -5, 10]}
                        stroke="#444"
                    />
                    <PrimitiveImage x={20 + config.padding[3]} y={config.padding[0] + 10} size={size} url={`/api/image/${partnership_a.id}`}/>
                    <PrimitiveImage x={20 + config.padding[3] + size + separation} y={config.padding[0] + 10} size={size} url={`/api/image/${partnership_b.id}`}/>
                    <Text x={textX} y={config.padding[0] + 20} width={config.width - 30 - textX} height={config.height - 40} align='center' verticalAlign='middle' text={description} lineHeight={1.1}/>
                </Group>)    
            }
            cx += config.width  + config.padding[1] + config.padding[3]
            if( (cx + config.width - startX) > element.render.width ){
                cx = startX 
                cy += config.height + config.padding[0] + config.padding[2]
            }
        }
        return <React.Fragment>{out}</React.Fragment>
    }


    const exportToPptx = ()=>{
        console.log(`EXPORTING`)

        if( stage.current ){
            exportKonvaToPptx( stage.current )
        }
    }

    useImperativeHandle(ref, () => {
        return {
            exportToPptx
        };
      }, []);
    
    const textCache = []
    const elements = primitive.primitives.allUniqueElement
    useDataEvent('set_field set_parameter', elements.map(d=>d.id), ()=>forceUpdate() )

    function selectElement(item){
        console.log( item?.textId)
        setSelected(item)
        if( props.setSelectedElement ){
            if( item ){
                const prim = MainStore().primitive(item.textId)
                if( prim ){
                    props.setSelectedElement( prim )
                    return
                }
            }
            props.setSelectedElement( undefined )
        }
    }

    useEffect(()=>{
        async function resolveReport(){
            let instance = primitive.primitives.allReportinstance.find(d=>d.parentPrimitiveIds.includes(source.id) )
            if( !instance){
                console.log(`Cant find instance of report - creating`)
                instance = await MainStore().createPrimitive({title:`RI - ${primitive.plainId} / ${source.plainId}`,type:"reportinstance", parent: primitive }) 
                source.addRelationship( instance, "auto" )
            }
            setRInstance( instance )
        }
        resolveReport()
    }, [primitive.id, source.id])
    
    useLayoutEffect(()=>{
        //    console.log(`STARTING UP`, primitive.id, source.id, selected?.id, rInstance?.id, trRef.current,  update)
        if( stage.current ){
            for(const element of elements){
                const kO = stage.current.find(`#${element.id}`)?.[0]
                if( kO && kO.text ) {
                    shrinkTextToFit( kO, {id: element.id, height: element.render?.height ?? 50, text: kO.text() }, element.render?.fontSize ?? 16)
                }
            }

            
            if( myState.current.manualList){
                Object.keys(myState.current.manualList).forEach(d=>{
                    const node = stage.current.find(`#o${d}`)?.[0]
                    console.log(`Rendering manual for `, node)
                    if( node ){
                        node.removeChildren()
                        node.add(myState.current.manualList[d] )
                    }
                })
                stage.current.batchDraw()
            }
        }
        if( trRef.current ){
            const kO = stage.current.find(`#${selected.id}`)?.[0]
            const textNode = stage.current.find(`#${selected.textId}`)?.[0]
            trRef.current.nodes([kO]);
            trRef.current.getLayer().batchDraw();
            if( textNode ){
                selected.text = textNode.text()
            }
        }

        return ()=>{
            console.log(`Cleaning up`)
        }
    },[ primitive.id, source.id, selected?.id, rInstance?.id, trRef.current,  update ])

    if( !rInstance ){
        return <p>NO REPORT INSTANCE</p>
    }
    
    function processCache(d, data){
        if( d.content.compute === "auto_summarize"){
            data = data.replaceAll(/\\n/g,"\n").replace(/\n+/g, '\n').replace(/\n/g, '\n\n');
            if( d.content.caption ){
                data = d.content.caption + "\n\n" + data
            }
        }else if (d.content.compute === "auto_extract"){
            if( Array.isArray(data)){
                data = data.join("\n")
            }
        }
        return data
    } 
    function fetchData(d){
        MainStore().doPrimitiveAction( d, `auto_${d.content.compute}`, {instance: rInstance.id,source: source.id, prompt: d.content.prompt, summary_type: d.content.summary_type, focus: source.referenceParameters?.focus ?? source.title}, (response)=>{
            if( response ){
                rInstance.setField(`computeCache.${d.id}`, processCache( d, response ))
                forceUpdate()
            }
        })
    }


    console.log(`rInstance = `, rInstance.plainId)

    return (<>
        <Stage 
                style={{
                    background: primitive.render?.background ?? "white"
                }}
                onClick={(e)=>{
                    if(e.target === stage.current){
                        selectElement()
                    }
                }}
            ref={stage} key={`render-${update}`} width={window.innerWidth} height={window.innerHeight}>
            <Layer>
                {elements.map(d=>{

                    const commonAttrs = {
                        x: d.render?.x ?? 50,
                        y: d.render?.y ?? 50,
                        width: d.render?.width ?? 200,
                        height: d.render?.height ?? 50
                    };
                    const textAttrs ={
                        fontFamily: d.render?.fontFamily ?? 'Poppins',
                        fontSize: d.render?.fontSize ?? 16,
                        fontStyle: d.render?.fontStyle ?? "normal",
                        padding: d.render?.padding ?? 20 ,
                        lineHeight: d.render?.lineHeight ?? 1.25,
                    }
                    
                    let text = source ? source.title : ""
                    
                    let items = [source]
                    if( d.referenceParameters?.target ){
                        items = items.map(d2=>d.fetchItemsForAction({source: d2})).flat(Infinity)
                        if( d.referenceParameters.parentFilterId){
                            items = items.filter(d2=>d2.parentPrimitiveIds.includes(d.referenceParameters.parentFilterId))
                        }
                    }
                    const out = []
                    let needCustomRender = false
                    if( d.content ){
                        if( d.content.compute){
                            if(d.content.compute ){
                                text = rInstance.computeCache && rInstance.computeCache[d.id]
                                if( text === "_FETCHING_"){
                                    text = "Fetching data...."
                                }else if( !text ){
                                    rInstance.setField(`computeCache.${d.id}`, "_FETCHING_")
                                    fetchData(d)
                                }else{

                                    text = (d.content?.caption ? d.content?.caption + "\n\n" : "") + text
                                    if( d.content.compute === "extract"){
                                        if( Array.isArray(text)){
                                            items = text.map(d=>MainStore().primitive(d))
                                            needCustomRender = items[0]?.referenceId
                                        }
                                    }
                                }
                            }
                        }else if( items[0]?.referenceId === 84 || items[0]?.referenceId === 29 ){
                            needCustomRender = items[0].referenceId
                        }else{
                            for( const item of items){
                                let node = item
                                const field = d.content.field
                                const parts = field.split(".")
                                let lastField = parts.pop()
                                if( parts.length > 0 ){
                                    node = node.referenceParameters
                                }
                                out.push( node?.[lastField] )
                            }
                            text = (d.content?.caption ? d.content?.caption + "\n\n" : "") + out.join("\n")
                        }
                    }
                    return <>
                        <Rect {...commonAttrs} stroke={showBoundingBox ? "black" : undefined} strokeWidth={1}
                            fill={d.render?.background ?? undefined}
                            cornerRadius={d.render?.rounded ? (Math.min(commonAttrs.width, commonAttrs.height) * 0.05) : undefined}
                            key={`bb${d.id}`} 
                            id={`bb${d.id}`} 
                            onClick={(e)=>{
                                if(e.evt.altKey || e.evt.shiftKey){
                                        fetchData(d)
                                }
                                selectElement({id: `bb${d.id}`, textId: `tt${d.id}`})
                            }}
                            onTransform={(e) => {
                                const node = stage.current.find(`#${selected.id}`)?.[0]
                                const textNode = stage.current.find(`#${selected.textId}`)?.[0]
                                const scaleX = node.scaleX();
                                const scaleY = node.scaleY();
                                const w = node.width() * scaleX
                                const h = node.height() * scaleY
                      
                                node.setAttrs({
                                    width: w,
                                    height: h,
                                    scaleX: 1, scaleY: 1
                                  });
                                if( textNode){
                                    textNode.setAttrs({
                                        width: w,
                                        height: h,
                                        scaleX: 1, scaleY: 1
                                    });
                                    shrinkTextToFit( textNode, {id: d.id, height: h, text: selected.text}, textAttrs.fontSize )
                                }
                            
                            }}
                            onTransformEnd={(e) => {
                                const node = stage.current.find(`#${selected.id}`)?.[0]
                                const scaleX = node.scaleX();
                                const scaleY = node.scaleY();
                      
                                node.scaleX(1);
                                node.scaleY(1);

                                const newRender = {
                                    ...d.render,
                                    x: node.x(),
                                    y: node.y(),
                                    width: Math.max(5, node.width() * scaleX),
                                    height: Math.max(5, node.height() * scaleY),
                                }
                                d.setField('render', newRender)
                                forceUpdate()
                              }}
                            draggable
                            onDragMove={(e) => {
                                const node = stage.current.find(`#${selected.textId}`)?.[0]
                                if( node ){

                                    node.setAttrs({
                                        x: e.target.x(),
                                        y: e.target.y(),
                                    });
                                }

                            }}
                            onDragEnd={(e) => {
                                const newRender = {
                                    ...d.render,
                                    x: e.target.x(),
                                    y: e.target.y(),
                                }
                                d.setField('render', newRender)
                                forceUpdate()
                            }}
                        
                        />
                        {needCustomRender && customRenderer(items, needCustomRender, d, primitive, source, stage, commonAttrs)}
                        {!needCustomRender && <Text 
                            key={"tt" + d.id} 
                            onClick={(e)=>{
                               if(e.evt.altKey || e.evt.shiftKey){
                                    fetchData(d)
                               }

                                selectElement({id: `bb${d.id}`, textId: d.id})
                                console.log(`Click `, d.id)
                            }}
                            draggable
                            onDragStart={(e) => {
                                selectElement({id: `bb${d.id}`, textId: d.id})
                            }}
                            onDragMove={(e) => {
                                const node = stage.current.find(`#${selected.id}`)?.[0]
                                node.setAttrs({
                                    x: e.target.x(),
                                    y: e.target.y(),
                                  });

                            }}
                            onDragEnd={(e) => {
                                const newRender = {
                                    ...d.render,
                                    x: e.target.x(),
                                    y: e.target.y(),
                                }
                                d.setField('render', newRender)
                                forceUpdate()
                            }}
                            id={d.id} 
                            {...commonAttrs} 
                            height={undefined} 
                            {...textAttrs} 
                            text={text} 
                            ellipsis={true}
                        />}
                    </>
                })}
                {selected && (
                    <Transformer
                    ref={trRef}
                    flipEnabled={false}
                    rotateEnabled={false}
                    boundBoxFunc={(oldBox, newBox) => {
                        // limit resize
                        if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                        return oldBox;
                        }
                        return newBox;
                    }}
                    />
                )}
                
            </Layer>
        </Stage>
    </>)
})

export default PrimitiveReport