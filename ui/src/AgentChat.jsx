// ChatComponent.jsx (React)
import { useEffect, useState, useRef } from 'react';
import MarkdownEditor from './MarkdownEditor';
import MainStore from './MainStore';
import clsx from 'clsx';
import { Logo } from './logo';

const DB_RE = /_db([0-9a-fA-F]{24})/g;

function replaceDbPlaceholders(str, callback) {
  return str.replace(DB_RE, (fullMatch, objectId) => {
    return MainStore().primitive(objectId)?.plainId
  });
}


export default function AgentChat({primitive, ...props}) {
    const [messages, setMessages] = useState([]);
        const inputBox = useRef({})
      const [autoSend, setAutoSend] = useState('');
   //   const [input, setInput] = useState('');
      const [pending, setPending] = useState(false);
      const readerRef = useRef(null);
    
      const appendMessage = (msg) => {
        setMessages((m) => [...m, msg]);
      };

      useEffect(()=>{
        updateStatus( {active: !inputBox.current?.empty(), messages})
      }, [messages])

      function updateAssistantUI(text, hidden = false) {
        setMessages(h => {
          const lastMsg = h[h.length - 1]
          if (lastMsg.role === 'assistant'){
            if( !hidden) {
              if( !lastMsg.hidden ){
                return [...h.slice(0, -1), { hidden, role:'assistant', content: text }];
              }
            }else{
              if( lastMsg.content.endsWith("[[agent_running]]") || lastMsg.content.match(/\[\[update:[^\]]*\]\]$/)){
                lastMsg.content = lastMsg.content.replace("[[agent_running]]","").replace(/\[\[update:[^\]]*\]\]$/, "");
                if( lastMsg.content.length === 0){
                  return [...h.slice(0, -1), { hidden, role:'assistant', content: text }];
                }else{
                  return [...h.slice(0, -1), lastMsg, { hidden, role:'assistant', content: text }];
                }
              }
            }
          }
          return [...h, { hidden, role:'assistant', content: text }];
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
      
        // 3) Sliding-window buffering setup
        const MAX_ID_LEN    = 36;                   // max length of your DB IDs
        const ID_TRIGGER_RE = /_db[A-Za-z0-9_-]{4,}/;  // heuristic for an ID
        const ID_TRIGGER_LENGTH = 7 
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
          console.log(`==== ${status.messages?.length}`)
          props.setStatus({
            activeChat: status.active || status.messages?.length > 0,
            hasReplies: status.messages?.length > 0
          })
        }
      }
      function clear(){
        setMessages([])
        inputBox.current.clear()
        inputBox.current.focus()
        updateStatus({active: true, messages: []})
      }
    
      function handleInputFocus(){
        updateStatus({active: true, messages})
      }
      function handleInputBlur(){
        updateStatus({active: !inputBox.current?.empty(), messages})
      }
      return (
          <>
            {messages.length > 0 && <div className="flex flex-1 items-stretch oveflow-y-auto min-h-32 w-full mb-2">
                <MarkdownEditor  scrollToEnd={true} initialMarkdown={messages.filter(d=>!d.hidden)} float={true}/>
            </div>}
            <div className={clsx([
                    "w-full flex space-x-2",
                    props.seperateInput ? "mt-4 bg-white shadow-lg p-3 rounded-lg border"  : "pt-3" 
                ])}>
                <div className="flex flex-1 items-stretch flex flex-1 items-stretch max-h-60 overflow-y-scroll">
                    <MarkdownEditor onFocus={handleInputFocus} onBlur={handleInputBlur} ref={inputBox} initialMarkdown={""} onKeyUp={handleInputKeyPress} float={props.seperateInput}/>
                </div>
                <button type="submit" style={{ padding: '0 16px' }} onClick={()=>sendChat()}>Send</button>
                <button style={{ padding: '0 16px' }} onClick={clear}>Clear</button>
            </div>
        </>
      );
}