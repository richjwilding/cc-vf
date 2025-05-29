// ChatComponent.jsx (React)
import { useEffect, useState, useRef } from 'react';
import MarkdownEditor from './MarkdownEditor';
import MainStore from './MainStore';
import clsx from 'clsx';
import { Logo } from './logo';
import { PrimitiveCard } from './PrimitiveCard';
import { HeroIcon } from './HeroIcon';
import { Badge } from './@components/badge';
import { isObjectId } from './SharedTransforms';

export default function AgentChat({primitive, ...props}) {
    const [messages, setMessages] = useState([]);
        const inputBox = useRef({})
        const editorRef = useRef()
      const [autoSend, setAutoSend] = useState('');
   //   const [input, setInput] = useState('');
      const [pending, setPending] = useState(false);
      const [context, setContext] = useState(false);
      const readerRef = useRef(null);
      const insertedCount = useRef(0)
    
      useEffect(()=>{
        const mainstore = MainStore()
        updateStatus( {active: !inputBox.current?.empty(), messages})
        const contextMessages = messages.filter(d=>d.role === "assistant" && d.hidden).map(d=>d.content?.match(/\[\[chat_scope:([^\]]*)\]\]/)?.[1]?.split(",")).filter(d=>d)
        const latestContext = contextMessages.at(-1)?.map(d=>{
          const asNum = parseInt(d)
          if( isObjectId(d) || isNaN(asNum)){
            return mainstore.primitive(d)
          }else{
            return mainstore.primitive(asNum)
          }
        }).filter(d=>d)
        setContext( latestContext )
      }, [messages])


      useEffect(() => {
        if (insertedCount.current === 0 && messages.length > 0) {
          editorRef.current.appendMessages(messages)
          insertedCount.current = messages.length
        }
      }, [messages])
    
      // whenever messages grows, append only the tail
      useEffect(() => {
        if (messages.length > 0 && messages.length === insertedCount.current) {
          const msg = messages.at(-1)
          if( msg.hidden && msg.removePrevious){
            editorRef.current.appendMessages(undefined, true)
          }else{
            editorRef.current.appendMessages([msg], true)
          }
        }else if (messages.length > insertedCount.current) {
          const newMsgs = messages.slice(insertedCount.current).filter(d=>!d.hidden)
          if( newMsgs.length > 0){
            editorRef.current.appendMessages(newMsgs)
          }
        }
        insertedCount.current = messages.length
      }, [messages])


      function updateAssistantUI(text, hidden = false, other = {}) {
        setMessages(h => {
          const lastMsg = h[h.length - 1]
          if (lastMsg.role === 'assistant' && !lastMsg.preview){
            if( !hidden) {
              if( !lastMsg.hidden ){
                return [...h.slice(0, -1), { hidden, role:'assistant', content: text, ...other }];
              }
            }else{
              if( lastMsg.content.endsWith("[[agent_running]]") || lastMsg.content.match(/\[\[update:[^\]]*\]\]$/)){
                lastMsg.content = lastMsg.content.replace("[[agent_running]]","").replace(/\[\[update:[^\]]*\]\]$/, "");
                if( lastMsg.content.length === 0){
                  return [...h.slice(0, -1), { hidden, role:'assistant', content: text, removePrevious: true, ...other }];
                }else{
                  return [...h.slice(0, -1), lastMsg, { hidden, role:'assistant', content: text, ...other }];
                }
              }
            }
          }
          return [...h, { hidden, role:'assistant', content: text, ...other }];
        });
      }
    
      async function sendChat() {
        if( pending){return}
        setPending(true)
        const userMsg = { role: 'user', content: inputBox.current?.value().trim() };
        const nextFull = [...messages, userMsg, { role: 'assistant', content: "[[update:Thinking...]]"}]
        setMessages(nextFull);;
        inputBox.current.clear()

        updateStatus({active: false, messages: nextFull});
      
        // 2) Kick off the fetch + ReadableStream
        const res = await fetch(`/api/primitive/${primitive.id}/agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: nextFull }),
        });
        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let buffer   = '';
      
        let displayContent = '';
      
        // cancel any prior in-flight stream
        if (readerRef.current) readerRef.current.cancel();
        readerRef.current = reader;
      
        // 4) Read & process chunks
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop();
      
          for (const part of parts) {
            if (!part.startsWith('data:')) continue;
            const payload = JSON.parse(part.slice(5).trim());
      
            if (payload.content) {
              if( payload.content.startsWith("__SC_BK")){
                const rewind = payload.content.match(/__SC_BK(\d+)__/)
                if( rewind ){
                  const rewindCount = parseInt(rewind[1])
                  displayContent = displayContent.slice(0, displayContent.length - rewindCount)
                  payload.content = payload.content.slice(rewind[0].length)
                }
              }
              if( displayContent.endsWith("[[agent_running]]")){
                displayContent = displayContent.slice(0, displayContent.length - 17 )
              }else  {
                displayContent = displayContent.replace(/\[\[update:[^\]]*\]\]$/, "");
              }
              displayContent += payload.content;
              updateAssistantUI(displayContent, payload.hidden);
              if( payload.hidden){
                displayContent = ""
              }
            }else if(payload.preview){
              updateAssistantUI(payload.preview, false, {preview: true});
            }
      
            if (payload.done) {
                setPending(false)
              reader.cancel();
              readerRef.current = null;
              return;
            }
          }
        }
      }
    
      function handleInputKeyPress(e){
        if(e.key === "Enter"){
            if( !e.altKey ){
                sendChat()
                return true
            }
        }
        return false
      }
      function updateStatus(status = {}){
        if(props.setStatus){
          props.setStatus({
            activeChat: status.active || status.messages?.length > 0,
            hasReplies: status.messages?.length > 0
          })
        }
      }
      function rewind(){
        const msgToRemove = messages.at(-1)
        editorRef.current.appendMessages(undefined, true)
        if( msgToRemove.hidden ){
          console.log(`SKIP REMOVAL FROM SLATE OF HIDDEN MESSAFE`)
        }
        setMessages(messages.slice(0,  msgToRemove.hidden ? -2 : -1))
        setPending(false)
        console.log(msgToRemove)
       // insertedCount.current = insertedCount.current - 1
      }
      function clear(){
        insertedCount.current = 0
        setMessages([])
        inputBox.current.clear()
        inputBox.current.focus()
        updateStatus({active: true, messages: []})
        setPending(false)
      }
    
      function handleInputFocus(){
        updateStatus({active: true, messages})
      }
      function handleInputBlur(){
        updateStatus({active: !inputBox.current?.empty(), messages})
      }
      return (
          <>
            {context && <div className={clsx([
                    "w-full flex flex-col space-y-2 border-b px-1 py-2 max-w-full w-full",
                ])}>
                  <p className='text-xs text-gray-400 font-semibold '>Context</p>
                  <div className='inline-flex'>
                  {context.map(d=><div 
                      onClick={props.contextClick ? ()=>props.contextClick(d) : undefined}
                      className='border hover:border-gray-400 hover:shadow-sm rounded-md flex space-x-1 px-1 py-1 items-center'>
                      {d.metadata?.icon && <HeroIcon icon={d.metadata.icon} className='w-5 h-5' strokeWidth={1}/>}
                      <div className='flex flex-col space-y-0.5 max-w-48 '>
                        <span className='text-sm/5 text-slate-800 font-semibold truncate ellipses'>{d.title}</span>
                        <span className='text-xs text-slate-600 truncate'>{d.displayType} #{d.plainId}</span>
                        <div className='flex'>
                          <Badge color='zinc' className="!py-0 !text-slate-600">{d.itemsForProcessing.length ?? 0 } items</Badge>
                        </div>
                      </div>
                    </div>
                  )}
                  </div>
            </div>}
            {false && messages.length > 0 && <div className="flex flex-1 items-stretch oveflow-y-auto min-h-32 w-full mb-2">
                <MarkdownEditor  scrollToEnd={true} initialMarkdown={messages.filter(d=>!d.hidden)} float={true}/>
            </div>}
            {messages.length > 0 && <div className="flex flex-1 items-stretch oveflow-y-auto min-h-32 w-full mb-2">
                <MarkdownEditor  scrollToEnd={true} float={true} ref={editorRef} controlled={false}/>
            </div>}
            <div className={clsx([
                    "w-full flex space-x-2",
                    props.seperateInput ? "mt-4 bg-white shadow-lg p-3 rounded-lg border"  : "pt-3" 
                ])}>
                <div className="flex flex-1 items-stretch flex flex-1 items-stretch max-h-60 overflow-y-scroll">
                    <MarkdownEditor onFocus={handleInputFocus} onBlur={handleInputBlur} ref={inputBox} initialMarkdown={""} onKeyUp={handleInputKeyPress} float={props.seperateInput}/>
                </div>
                <button type="submit" style={{ padding: '0 16px' }} onClick={()=>sendChat()}>Send</button>
                <button style={{ padding: '0 16px' }} onClick={rewind}>Rewind</button>
                <button style={{ padding: '0 16px' }} onClick={clear}>Clear</button>
            </div>
        </>

      );
}