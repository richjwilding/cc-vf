import React, { useEffect, useState, forwardRef, useReducer } from 'react';
import GoogleHelper from './GoogleHelper';

import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon } from '@heroicons/react/24/outline';



import { Viewer, Worker } from '@react-pdf-viewer/core';
import {pageNavigationPlugin} from '@react-pdf-viewer/page-navigation';
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
import MainStore from './MainStore';
import useDataEvent from './CustomHook';

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




const ResultViewer = forwardRef(function ResultViewer({createCallback, ...props}, ref){

   useDataEvent("relationship_update", props.primitive.id, ()=>setNotes(processNotesFromEvidence()))

    const processNotesFromEvidence = ()=>{
        const evidenceList = props.evidenceList || props.primitive?.primitives.allUniqueEvidence
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
  const [notes, setNotes] = React.useState(()=>processNotesFromEvidence());
  const [highlightNote, setHighlightNote] = React.useState(undefined);
  const [toolbarPluginInstance, toolbar] = MyToolBar()
  const pageNavigationPluginInstance = pageNavigationPlugin();
  const viewer = React.useRef()
  let startEl = undefined
  let endEl = undefined
  
  React.useImperativeHandle(ref, () => {
    return {
      showPrimitive( primitiveId ) {
            const note = notes.find((d)=>d.primitiveId === primitiveId)
            if( note ){
                if(  note.ref ){
                    note.ref.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
                }else{
                    if( note.highlightAreas ){
                        const firstPage = note.highlightAreas[0].pageIndex
                        pageNavigationPluginInstance.jumpToPage(firstPage)
                    }
                }
            }
            setHighlightNote( primitiveId )
      },
    };
  }, [notes.map((d)=>d.primitiveId)]);

  let noteId = notes.length;

  if( !url && props.primitive ){
        const fetchDoc = async function(){
          const data = await props.primitive.getDocument( )
          setUrl( {data: new Uint8Array( data)})
        }
        fetchDoc()
  }



  const renderHighlightTarget = (props) => {
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


  if( !url ){return <></>}


  return (
    <Worker workerUrl="https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.js">
      <div className='h-full flex flex-col divide-y divide-gray-200'>
          {toolbar}
        <div ref={viewer} className='flex-1 overflow-y-scroll pt-2 bg-gray-200 shadow-inner'>
          <Viewer
              fileUrl={url.data}
              plugins={[
                toolbarPluginInstance,
                pageNavigationPluginInstance,
                highlightPluginInstance,
              ].filter((d)=>d)}
          />
          </div>
      </div>
      <div className='bg-gray-200 rounded-b-lg shadow-lg flex flex-col py-2'/>
  </Worker>)

})
export default ResultViewer