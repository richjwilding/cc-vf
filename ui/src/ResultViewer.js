import React, { useEffect, useState, forwardRef, useLayoutEffect } from 'react';
import GoogleHelper from './GoogleHelper';

import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon } from '@heroicons/react/24/outline';



import { Viewer, Worker } from '@react-pdf-viewer/core';
import { toolbarPlugin, ToolbarSlot } from '@react-pdf-viewer/toolbar';
//import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';
import './DocumentView.css'



import {
  highlightPlugin,
  HighlightArea,
  MessageIcon,
  RenderHighlightContentProps,
  RenderHighlightsProps,
  RenderHighlightTargetProps,
} from '@react-pdf-viewer/highlight';
import { Button, Position, PrimaryButton, Tooltip} from '@react-pdf-viewer/core';

const MyToolBar = ( props ) => {
  const toolbarPluginInstance = toolbarPlugin();
  const { Toolbar } = toolbarPluginInstance;

  return [toolbarPluginInstance, (
              <Toolbar>
                  {(props) => {
                      const {
                          CurrentPageInput,
                          Download,
                          EnterFullScreen,
                          GoToNextPage,
                          GoToPreviousPage,
                          NumberOfPages,
                          Print,
                          ZoomIn,
                          ZoomOut,
                      } = props;
                      return (
                          <div className='flex px-4 pb-2 place-items-center text-sm space-x-1'>
                              <ZoomOut>
                                {props => <MagnifyingGlassMinusIcon className='w-7 h-7 p-1 rounded-xl bg-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-100 active:ring-2' onClick={props.onClick}/>}
                              </ZoomOut>
                              <ZoomIn>
                                {props => <MagnifyingGlassPlusIcon className='w-7 h-7 p-1 rounded-xl bg-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-100 active:ring-2' onClick={props.onClick}/>}
                              </ZoomIn>
                              <div className='flex grow'/>
                              <GoToPreviousPage>
                                {props => <ChevronUpIcon className='w-7 h-7 p-1 rounded-xl bg-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-100 active:ring-2' onClick={props.onClick}/>}
                              </GoToPreviousPage>
                              <div style={{ padding: '0px 2px', width: '4rem' }}>
                                  <CurrentPageInput />
                              </div>
                              <div style={{ padding: '0px 2px' }}>
                                  / <NumberOfPages />
                              </div>
                              <GoToNextPage>
                                {props => <ChevronDownIcon className='w-7 h-7 p-1 rounded-xl bg-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-100 active:ring-2' onClick={props.onClick}/>}
                              </GoToNextPage>

                              
                            </div>
                      );
                  }}
              </Toolbar>
  )];
};


const ResultViewer = forwardRef(function ResultViewer({evidenceList, createCallback, ...props}, ref){
    
    const processNotesFromEvidence = ()=>{
        if( !evidenceList ){ return []}
        let id = 0
        return evidenceList.filter((d)=>d.referenceParameters?.highlightAreas).map((d)=>{
            return {
                id: id++,
                primitiveId: d.id,
                highlightAreas: d.referenceParameters.highlightAreas,
                quote: d.referenceParameters.quotedText,
                content: d.title
            }
        })
    }

  const [url, setUrl ] = useState()
  const [message, setMessage] = React.useState('');
  const [notes, setNotes] = React.useState(processNotesFromEvidence());
  const [highlightNote, setHighlightNote] = React.useState(undefined);
  const [toolbarPluginInstance, toolbar] = MyToolBar()
  const viewer = React.useRef()
  let startEl = undefined
  let endEl = undefined
  
  React.useImperativeHandle(ref, () => {
    return {
      showPrimitive( primitiveId ) {
            const note = notes.find((d)=>d.primitiveId === primitiveId)
            if( note.ref ){
                note.ref.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
            }
            setHighlightNote( primitiveId )
      },
    };
  }, []);

  const noteEles = new Map();
  let noteId = notes.length;

  //const defaultLayoutPluginInstance = defaultLayoutPlugin();

  if( !url && props.GoogleDoc ){
    if( props.GoogleDoc.type === "google_drive"){
        const fetchDoc = async function(){
          const docAsString = await GoogleHelper().getFileAsPdf( props.GoogleDoc.id )
          if( docAsString === undefined){debugger}
          const data = new Uint8Array(docAsString.length )
          data.forEach((d,idx)=>data[idx] = docAsString.charCodeAt(idx))
          setUrl( {data:  data})
        }
        fetchDoc()
    }
  }



  const renderHighlightTarget = (props) => {
    console.log(props)
    return (
    <div
        className='absolute rounded-[50%] p-2 border-2 shadow-md shadow-gray-400 hover:ring-2 z-10 bg-blue-600 hover:bg-blue-700 text-white'
        onClick={props.toggle}
        style={{
            left: `${Math.max(0,props.selectionRegion.left - 2)}%`,
            top: `${props.selectionRegion.top + props.selectionRegion.height}%`,
            transform: 'translateX(-50%)'
        }}
    >
        <PlusIcon className='w-5 h-5' strokeWidth={3}/>
    </div>
)};

const renderHighlightContent = (props) => {
    const addNote = async () => {
        if (message !== '') {
            const note = {
                id: ++noteId,
                content: message,
                highlightAreas: props.highlightAreas,
                quote: props.selectedText,
            };
            if( createCallback ){
                note.primitiveId = await createCallback(note)
            }
            setNotes(notes.concat([note]));
            props.cancel();
        }
    };

    return (
        <div
            style={{
                background: '#fff',
                border: '1px solid rgba(0, 0, 0, .3)',
                borderRadius: '2px',
                padding: '8px',
                position: 'absolute',
                left: `${props.selectionRegion.left}%`,
                top: `${props.selectionRegion.top + props.selectionRegion.height}%`,
                zIndex: 1,
            }}
        >
            <div>
                <textarea
                    rows={3}
                    style={{
                        border: '1px solid rgba(0, 0, 0, .3)',
                    }}
                    onChange={(e) => setMessage(e.target.value)}
                ></textarea>
            </div>
            <div
                style={{
                    display: 'flex',
                    marginTop: '8px',
                }}
            >
                <div style={{ marginRight: '8px' }}>
                    <PrimaryButton onClick={addNote}>Add</PrimaryButton>
                </div>
                <Button onClick={props.cancel}>Cancel</Button>
            </div>
        </div>
    );
};


const renderHighlights = (rProps) => (
    <div className='custom_highlight'>
        {notes.map((note) => {
            return (
            <React.Fragment key={note.id}>
                {note.highlightAreas
                    .filter((area) => area.pageIndex === rProps.pageIndex)
                    .map((area, idx) => (
                        <div
                            key={idx}
                            className='docview_highlightarea'
                            style={Object.assign(
                                {},
                                {
                                    background: note.primitiveId === highlightNote ? "green":  'yellow',
                                    opacity: 0.4,
                                },
                                rProps.getCssProperties(area, rProps.rotation)
                            )}
//                            onClick={props.onHighlightClick ? () => props.onHighlightClick(note.primitiveId) : undefined}
                            onMouseOver={()=>console.log('HELLO')}
                            ref={(ref) => {
                                note.ref = ref
                            }}
                        />
                    ))}
            </React.Fragment>
        )})}
    </div>
);

const highlightPluginInstance = props.enableEvidence ? highlightPlugin({
    renderHighlightTarget,
    renderHighlightContent,
    renderHighlights,
}) : undefined;

    /*console.log('reset')
    let hasAnchor = false
    let selRect 
    let rect = {}

    useLayoutEffect(()=>{
        console.log(`TRY REG`)
        if( viewer.current ){
            const textLayer = viewer.current.querySelector('.rpv-core__text-layer')
            const highlightLayer = viewer.current.querySelector('.custom_highlight')
            
            console.log(highlightLayer)
            console.log(viewer.current)
            console.log(textLayer)
                console.log(`registered`)
            if( textLayer ){
                textLayer.addEventListener("mouseup", (e)=>{
                    console.log(`up`)
                    startEl = undefined
                    hasAnchor = false
                    if( selRect ){
                        highlightLayer.removeChild(selRect)
                    }
                })
                textLayer.addEventListener("mousedown", (e)=>{
                    if( !startEl && e.target.classList.contains('rpv-core__text-layer-text') ){
                        startEl = e.target
                    }
                })
                textLayer.addEventListener("mousemove", (e)=>{
                    if( !startEl ){return}
                    if( !hasAnchor ){
                        const range = window.getSelection().getRangeAt(0)
                        if( range ){
                            const rects = range.getClientRects()
                            console.log(rects)
                            if( rects ){
                                let r = rects[0]
                                console.log(rects)
                                let p = textLayer.getClientRects()[0]
                                
                                hasAnchor = true
                                selRect = document.createElement('div')
                                selRect.style.position = "absolute"
                                selRect.style.border = "1px solid red"
                                selRect.style.background = "green"
                                selRect.style.left = "0px"
                                selRect.style.top = "0px"
                                selRect.style.width = `${r.x - p.x}px`
                                selRect.style.height = `${r.y - p.y}px`
                                highlightLayer.appendChild(selRect)
                            }
                        }
                        
                    }
                    if( startEl && startEl!=e.target && e.target.classList.contains('rpv-core__text-layer-text') ){
                       // e.target.style.background='green'
                    }
                },true);
            }
        }
    },[viewer.current, url])*/


  if( !url ){return <></>}

  console.log(notes)

  return (
    <Worker workerUrl="https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.js">
    <div className='bg-white rounded-lg shadow h-full flex flex-col py-4'>
      <div className='h-full flex flex-col divide-y divide-gray-200'>
          {toolbar}
        <div ref={viewer} className='flex-1 overflow-y-scroll pt-2 bg-gray-200 shadow-inner'>
          <Viewer
              fileUrl={url.data}
              plugins={[
                toolbarPluginInstance,
                highlightPluginInstance
              ].filter((d)=>d)}
          />
          </div>
      </div>
      <div className='bg-gray-200 rounded-b-lg shadow-lg flex flex-col py-2'/>
    </div>
  </Worker>)

/*
  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
    setPageNumber(2)
  }
  return (
    <div className='w-fill bg-gray-200 rounded-lg shadow-inner flex-column justify-center p-2 '>
      <Document file={url} onLoadSuccess={onDocumentLoadSuccess}>
        <Page className='shadow-lg' pageNumber={pageNumber} />
      </Document>
      <p>
        Page {pageNumber} of {numPages}
      </p>
    </div>
  );*/
})
export default ResultViewer