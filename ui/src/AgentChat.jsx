// ChatComponent.jsx (React)
import { useEffect, useState, useRef } from 'react';
import MarkdownEditor from './MarkdownEditor';
import MainStore from './MainStore';

const DB_RE = /_db([0-9a-fA-F]{24})/g;

function replaceDbPlaceholders(str, callback) {
  return str.replace(DB_RE, (fullMatch, objectId) => {
    return MainStore().primitive(objectId)?.plainId
  });
}


export default function AgentChat({primitive, ...props}) {
    const [messages, setMessages] = useState([]);
      const [input, setInput] = useState('');
      const readerRef = useRef(null);
    
      const appendMessage = (msg) => {
        setMessages((m) => [...m, msg]);
      };

      function updateAssistantUI(text) {
        setMessages(h => {
          if (h[h.length - 1].role === 'assistant') {
            return [...h.slice(0, -1), { role:'assistant', content: text }];
          }
          return [...h, { role:'assistant', content: text }];
        });
      }
    
      async function sendChat() {
        const userMsg = { role: 'user', content: input };
        const nextFull = [...messages, userMsg];
        setMessages(nextFull);
        setInput('');
      
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
        let buffering      = false;
        let idBuffer       = '';
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
              // always accumulate raw text
              idBuffer += payload.content;
      
              if (!buffering) {
                // haven’t hit an ID yet?
                const m = ID_TRIGGER_RE.exec(idBuffer);
                if (m) {
                  // flush & scrub before the match
                  const prefix = idBuffer.slice(0, m.index);
                  displayContent += replaceDbPlaceholders(prefix);
                  // keep the rest (ID in progress) buffered
                  idBuffer = idBuffer.slice(m.index);
                  buffering = true;
                  updateAssistantUI(displayContent);
                } else {
                    if( idBuffer.length > ID_TRIGGER_LENGTH){
                        const safe = idBuffer.slice(0, idBuffer.length - ID_TRIGGER_LENGTH)
                        // no ID-like text: scrub & emit whole buffer
                        displayContent += replaceDbPlaceholders(safe);
                        idBuffer = idBuffer.slice(safe.length )
                        updateAssistantUI(displayContent);
                    }
                }
              } else {
                // already buffering → sliding-window flush
                while (idBuffer.length > 2 * MAX_ID_LEN) {
                  const flushLen = idBuffer.length - MAX_ID_LEN;
                  const toClean  = idBuffer.slice(0, flushLen);
                  idBuffer       = idBuffer.slice(flushLen);
                  displayContent += replaceDbPlaceholders(toClean);
                  updateAssistantUI(displayContent);
                }
              }
            }
      
            if (payload.done) {
              // final flush of whatever remains
              if (buffering || idBuffer.length) {
                displayContent += replaceDbPlaceholders(idBuffer);
              }
              updateAssistantUI(displayContent);
      
              reader.cancel();
              readerRef.current = null;
              return;
            }
          }
        }
      }
    
      const onSubmit = (e) => {
        e.preventDefault();
        sendChat();
      };
    
      return (
        <div style={{ maxWidth: 600, margin: 'auto' }}>
          <div style={{ height: 400, overflowY: 'auto', border: '1px solid #ccc', padding: 10 }}>
            {false && messages.map((m,i) => (
              <div key={i} style={{ margin: '8px 0' }}>
                <strong>{m.role}:</strong> {m.content}
              </div>
            ))}
            <MarkdownEditor initialMarkdown={messages.map(d=>`**${d.role}**: ${d.content}`).join("\n")}/>
          </div>
          <form onSubmit={onSubmit} style={{ display: 'flex', marginTop: 10 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message…"
              style={{ flex: 1, padding: 8 }}
            />
            <button type="submit" style={{ padding: '0 16px' }}>Send</button>
            <button style={{ padding: '0 16px' }} onClick={()=>{setMessages([])}}>Clear</button>
          </form>
        </div>
      );
}