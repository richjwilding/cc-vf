// ChatComponent.jsx (React)
import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import MarkdownEditor from './MarkdownEditor';
import MainStore from './MainStore';
import clsx from 'clsx';
import { Logo } from './logo';
import { PrimitiveCard } from './PrimitiveCard';
import { HeroIcon } from './HeroIcon';
import { Badge } from './@components/badge';
import { deepEqualIgnoreOrder, isObjectId } from './SharedTransforms';
import { Button } from '@heroui/react';
import { Icon } from '@iconify/react/dist/iconify.js';

//export default function AgentChat({primitive, ...props}) {
const AgentChat = forwardRef(function AgentChat({primitive, scope: agentScope, ...props}, ref){
      const [messages, setMessages] = useState([
        {
    "hidden": false,
    "role": "assistant",
    "content": "{\"views\":[{\"source\":\"68825b3088d71b23808e4f6e\",\"title\":\"Number of User Posts by Influencer Type\",\"layout\":\"bar\",\"x_axis\":{\"parameter\":\"followers\"},\"y_axis\":{\"operator\":\"sum\",\"parameter\":\"posts\"},\"filters\":[]}]}",
    "resultFor": "design_view",
    "preview": true
}
      ]);
      const inputBox = useRef({})
      const editorRef = useRef()
      const [autoSend, setAutoSend] = useState('');
      const [pending, setPending] = useState(false);
      const [context, setContext] = useState(false);
      const [chatState, setChatState] = useState({});
      const [externalContext, setExternalContext] = useState({});
      const readerRef = useRef(null);
      const actionData = useRef([])
      const insertedCount = useRef(0)
    
      useEffect(()=>{
        const mainstore = MainStore()
        updateStatus( {active: !inputBox.current?.empty(), messages})
        if( externalContext ){
          if( externalContext?.id !== context?.id){
            setContext([externalContext].flat())
          }
        }else{
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
        }
          
        const stateMessages = messages.filter(d=>d.role === "assistant" && d.hidden).filter(d=>d.content?.startsWith("[[current_state:"))
        const latestStateMsg = stateMessages.at(-1)
        let latestState
        if( latestStateMsg ){
          const partial = latestStateMsg.content.slice(16,-2)
          console.log(partial)
          try{
            latestState = JSON.parse(partial)
          }catch(e){

          }
        }
        if( !deepEqualIgnoreOrder(latestState, chatState) ){
          if(props.setChatState ){
            props.setChatState( latestState )
          }
          setChatState( latestState )
        }
      }, [messages, externalContext])

      useImperativeHandle(ref, () => {
        return {
          setContext: (context)=>{
            setExternalContext(context)
          }
        }
      }, [])

      useEffect(() => {
        if (insertedCount.current === 0 && messages.length > 0) {
          editorRef.current.appendMessages(messages.filter(d=>!d.hidden))
          insertedCount.current = messages.length
        }
      }, [messages])
    
      // whenever messages grows, append only the tail
      useEffect(() => {
        if (messages.length > 0 && messages.length === insertedCount.current) {
          const msg = messages.at(-1)
          if( msg.hidden && msg.removePrevious){
            editorRef.current.appendMessages(undefined, true)
            delete msg["removePrevious"]
          }else{
            editorRef.current.appendMessages([msg], true)
          }
        }else if (messages.length > insertedCount.current) {
          const reverseCheck = messages.slice(0,insertedCount.current).reverse().filter(d=>!d.hidden)
          const addBack = []
          let removed = false
          for( const history of reverseCheck){
            if( history.updated ){
              removed = true
              editorRef.current.appendMessages(undefined, true)
              delete history["updated"]
              addBack.push( history)
            }else{
              if(removed){
                break
              }
            }

            editorRef.current.appendMessages(addBack)
          } 
          
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
          if (lastMsg.role === 'assistant' && !lastMsg.preview && !lastMsg.context && !other.context){
            if( !hidden) {
              if( !lastMsg.hidden ){
                return [...h.slice(0, -1), { hidden, updated: true, role:'assistant', content: text, ...other }];
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
        if( inputBox.current?.empty() ){
          return
        }
        setPending(true)
        const userMsg = { role: 'user', content: inputBox.current?.value().trim() };
        const nextFull = [...messages, userMsg, { role: 'assistant', content: "[[update:Thinking...]]"}]
        setMessages(nextFull);;
        inputBox.current.clear()

        updateStatus({active: false, messages: nextFull,});
      
        // 2) Kick off the fetch + ReadableStream
        const res = await fetch(`/api/primitive/${primitive.id}/agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              messages: nextFull, 
              options: {
                parentId: primitive.origin?.id, 
                agentScope: agentScope, 
                immediateContext: externalContext ? [externalContext].flat().map(d=>d.id) : undefined,
                mode:props.mode
              }}),
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
            }else if(payload.context){
              let contextText = ""
              if( payload.context.context?.canCreate ){
                const action = "create"
                const text = payload.context.context?.action_title ?? "Add query to canvas"
                const itemId = actionData.current.length 
                actionData.current.push({
                  id: itemId,
                  action,
                  data: payload.context.context
                })
                contextText = `[[action_item:${itemId}:${text}]]`
              }
              updateAssistantUI(contextText, payload.context.context?.canCreate ? false :true, payload);
                displayContent = ""
            }else if(payload.preview){
              const {preview, ...other} =  payload
              updateAssistantUI(preview, false, {...other, preview: true});
                displayContent = ""
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
        actionData.current = []
        setPending(false)
      }
      function actionCallback(id){
        const {action, data} = actionData.current[id]
        console.log(data)
        MainStore().doPrimitiveAction( primitive, `run_agent_${action}`, data)
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
            {messages.length > 0 && <div className="flex flex-1 items-stretch oveflow-y-auto min-h-32 w-full mb-2">
                <MarkdownEditor  actionCallback={actionCallback} scrollToEnd={true} float={true} ref={editorRef} controlled={false}/>
            </div>}
            <div className={clsx([
                    "w-full flex space-x-2",
                    props.seperateInput ? "mt-4 bg-white shadow-lg p-3 rounded-lg border"  : "pt-3" 
                ])}>
                <div className="flex flex-1 items-stretch flex flex-1 items-stretch max-h-60 overflow-y-scroll">
                    <MarkdownEditor onFocus={handleInputFocus} onBlur={handleInputBlur} ref={inputBox} initialMarkdown={""} onKeyUp={handleInputKeyPress} float={props.seperateInput}/>
                </div>
                <Button variant='light' radius='full' isIconOnly size="sm" onPress={()=>sendChat()} ><Icon icon="solar:round-arrow-up-linear" className='w-6 h-6 text-default-600 hover:text-default-800'/></Button>
                <Button variant='light' radius='full' isIconOnly size="sm" onPress={rewind}><Icon icon="solar:rewind-back-circle-outline" className='w-6 h-6 text-default-600 hover:text-default-800'/></Button>
                <Button variant='light' radius='full' isIconOnly size="sm" onPress={clear}><Icon icon="solar:trash-bin-trash-linear" className='w-6 h-6 text-default-600 hover:text-default-800'/></Button>
            </div>
        </>

      );
})
export default AgentChat