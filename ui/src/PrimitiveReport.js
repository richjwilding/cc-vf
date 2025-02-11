import React, { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Transformer, Group, Image, Line } from 'react-konva';
import MainStore from './MainStore';
import { exportKonvaToPptx } from './PptHelper';
import Konva from 'konva';
import { renderElementContent, renderScene } from './ReportRenderer';

let showBoundingBox = true
let refreshTimeout = undefined

const PrimitiveReport = forwardRef(function PrimitiveReport({primitive, source, ...props}, ref){
    const stage = useRef()
    const layer = useRef()
    const trRef = useRef()
    const myState = useRef({manualList: {}})
    const [update, forceUpdate] = useReducer( (x)=>x+1, 0)
    const [rInstance, setRInstance] = useState(  )
    const [selected, setSelected] = useState()

    const selectable = true

    const customCallback = (d)=>{
        console.log(`customCallback `, d.pcache)
        d.refreshCache()
        if( refreshTimeout ){
            clearTimeout(refreshTimeout)
        }
        refreshTimeout = setTimeout(() => {
            if( stage.current ){
                stage.current.batchDraw()
            }
            refreshTimeout = undefined
        }, 50);
    }


    function processCache(d, data){
        let content = d.referenceParameters?.content ?? d.content
        if( content.compute === "auto_summarize"){
            data = data.replaceAll(/\\n/g,"\n").replace(/\n+/g, '\n').replace(/\n/g, '\n\n');
            if( content.caption ){
                data = content.caption + "\n\n" + data
            }
        }else if (content.compute === "auto_extract"){
            if( Array.isArray(data)){
                data = data.join("\n")
            }
        }
        return data
    } 

    const exportToPptx = (ppt)=>{
        console.log(`EXPORTING`)

        if( stage.current ){
            stage.current.batchDraw()
            exportKonvaToPptx( stage.current, ppt )
        }
    }

    useImperativeHandle(ref, () => {
        return {
            exportToPptx
        };
      }, []);
    
    const textCache = []

    function clearStage(){
            if( layer.current ){
                for(const d of layer.current.children){
                    console.log(`removing `)
                    d.destroy()
                }
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
        clearStage()
        myState.transformer = undefined
    }, [primitive.id, source.id])


    function selectElement(e, prim){
        if( props.setSelectedElement ){
            if( prim ){
                props.setSelectedElement( prim )
                setTransformer(e.currentTarget)
                return
            }
            props.setSelectedElement( undefined )
        }

    }

    function setTransformer(d){
        if( d ) {

            if( !myState.transformer ){
                myState.transformer = new Konva.Transformer({flipEnabled: false, rotateEnabled: false})                    
                d.parent.add(myState.transformer)
                
            }
            myState.transformer.nodes( [d] )
            stage.current.batchDraw()
        }else{
            if( myState.transformer ){
                myState.transformer.destroy()
                myState.transformer = undefined
                stage.current.batchDraw()
            }            
        }
    }


    
    useLayoutEffect(()=>{
        if( stage.current ){
            const g = renderScene(primitive, source, {
                refreshCallback: customCallback,
                selectable: true,
                setTransformer: setTransformer,
                selectElement,
                fetchData: (d)=>{
                    let content = d.referenceParameters?.content ?? d.content
                    MainStore().doPrimitiveAction( d, `auto_${content.compute}`, {instance: rInstance.id,source: source.id, prompt: content.prompt, summary_type: content.summary_type, focus: source.referenceParameters?.focus ?? source.title}, (response)=>{
                        if( response ){
                            setTransformer(undefined)
                            rInstance.setField(`computeCache.${d.id}`, processCache( d, response ))
                            if( layer.current ){
                                const node = layer.current.find(`#${d.id}`)?.[0]
                                if( node ){
                                    node.children.find(d=>d.attrs.id === '_content')?.destroy()
                                    const content = renderElementContent(rInstance, source, d, customCallback)
                                    if( content ){
                                        content.attrs.id = "_content"
                                        node.add(content)
                                        setTimeout(() => {
                                            stage.current.batchDraw()
                                        }, 50);
                                    }

                                    setTransformer(node)
                                }
                            }
                        }
                    })

                }
            })
            if( g ){
                layer.current.add(g)
                stage.current.batchDraw()
                console.log(stage.current)
            }
        }
        return ()=>{
            clearStage()
        }
    },[ primitive.id, source.id, selected?.id, rInstance?.id, trRef.current,  update ])

    if( !rInstance ){
        return <p>NO REPORT INSTANCE</p>
    }
    


    console.log(`rInstance = `, rInstance.plainId)

    return (<>
        <Stage 
                style={{
                    background: primitive.referenceParameters?.background ?? primitive.render?.background ?? "white"
                }}
                onClick={(e)=>{
                    if(e.target === stage.current){
                        //selectElement()
                    }
                }}
            ref={stage} key={`render-${update}`} width={window.innerWidth} height={window.innerHeight}>
            <Layer ref={layer}>
            </Layer>
        </Stage>
    </>)
})

export default PrimitiveReport