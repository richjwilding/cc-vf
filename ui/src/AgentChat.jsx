// ChatComponent.jsx (React)
import { useEffect, useState, useRef, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react';
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

const MODE_ICON_MAP = {
  search: 'MagnifyingGlassIcon',
  insights: 'ChartBarIcon',
  slides: 'PresentationChartLineIcon',
  viz: 'ChartPieIcon',
  flow_builder: 'PuzzlePieceIcon',
  summary: 'DocumentTextIcon',
};

const DEFAULT_MODE_ICON = 'Squares2X2Icon';

//export default function AgentChat({primitive, ...props}) {
const AgentChat = forwardRef(function AgentChat({primitive, scope: agentScope, ...props}, ref){
      const [messages, setMessages] = useState([        


        
        /*{
    "hidden": false,
    "role": "assistant",
    "content": "Absolutely! Here are a few additional ideas for visualizations using Reddit data to complement your current Instagram-focused slide:\n\n1. **Sentiment Comparison Chart:**  \n   Visualize the overall sentiment (positive, neutral, negative) of Reddit discussions about Thorne’s purchase drivers and barriers. This could be a stacked bar or pie chart, showing whether Reddit users are more skeptical, enthusiastic, or mixed compared to Instagram.\n\n2. **Theme Heatmap:**  \n   Create a heatmap showing which specific product attributes (e.g., ingredient transparency, clinical evidence, price, taste) are discussed most frequently on Reddit versus Instagram. This would highlight where conversations overlap and where they diverge.\n\n3. **Quote Cloud or Highlighted Comments:**  \n   Feature a “voice of the customer” section with representative Reddit quotes for each major purchase driver or barrier. This adds qualitative depth and shows how Reddit users articulate their reasoning.\n\n4. **Journey Mapping:**  \n   Map out the typical “wellness journey” or decision process as described by Reddit users—what triggers their interest, what research they do, what convinces or deters them. This could be a flow diagram or annotated timeline.\n\n5. **Influencer vs. Peer Signal:**  \n   Compare the influence of peer recommendations versus influencer/celebrity mentions on Reddit (which tends to be more peer-driven) versus Instagram. This could be a side-by-side bar chart or a network diagram.\n\n6. **Barrier Deep Dive:**  \n   Use Reddit data to do a deeper dive into a specific barrier (e.g., skepticism about efficacy or price concerns), showing sub-themes or the most common questions/complaints.\n\nIf any of these ideas interest you, let me know which one(s) you’d like to explore further!"
}*/
        /*{
            "hidden": false,
            "role": "assistant",
            "content": "{\"views\":[{\"source\":\"68825b3088d71b23808e4f6e\",\"title\":\"Distribution of Influencers by Follower Count Category\",\"layout\":\"pie\",\"x_axis\":{\"parameter\":\"followers\"}}]}",
            "resultFor": "design_view",
            "preview": true
        }*/
        /*{
            "role": "assistant",
            "content": `"### Efficacy
- Consumer reviews report noticeable improvements in joint and ligament pain relief.
- Some users experienced marked reductions in pain after using the supplements.
- There are mixed experiences with some users reporting worsening symptoms due to dosing issues.
- Positive endorsements include both consumer and healthcare professional observations.
### Ingredient Transparency
- Thorne states that all supplements are free of gluten, artificial fillers, dyes, and additives.
- Ingredients are sourced from trusted suppliers, with in-house laboratory testing for quality control.
- Only select products are independently tested, such as those carrying NSF Certified for Sport.
### Concerns and Praise
## Concerns
- Some reviews highlight that not all products are third-party tested.
- Several users raise concerns about the serving size, noting that 4 capsules can be too many at one time.
- There are reports of quality issues, including incidents of receiving empty capsules.
- A few consumers mentioned worsening joint symptoms over time.
## Praise
- Numerous customer reviews praise the supplements for effective joint and ligament support.
- Positive feedback includes noticeable improvements in pain and overall joint function.
- Endorsements from users and healthcare professionals reinforce claims of efficacy.
- Several consumers stated that the supplements performed better than other brands. [[ref:688229695df2b9a82e1e36a4,688229705df2b9a82e1e36b9,688229765df2b9a82e1e36ce,6882293e5df2b9a82e1e3647]]`
         
        }*/
      ]);
      const inputBox = useRef({})
      const editorRef = useRef()
      const [autoSend, setAutoSend] = useState('');
      const [pending, setPending] = useState(false);
      const [context, setContext] = useState(false);
      const [chatState, setChatState] = useState({});
      const [externalContext, setExternalContext] = useState(props.context ?? {});
      const readerRef = useRef(null);
      const actionData = useRef([])
      const insertedCount = useRef(0)
      const [modeSummary, setModeSummary] = useState({ available: [], active: null });
      const modeRefreshController = useRef(null);

      const applyAgentMode = useCallback((modeData) => {
        if (!modeData) {
          setModeSummary({ available: [], active: null });
          return;
        }

        setModeSummary((prev) => {
          const nextAvailable = modeData.available ?? [];
          const prevAvailable = prev?.available ?? [];
          const unchanged =
            prev?.active === modeData.active &&
            prevAvailable.length === nextAvailable.length &&
            prevAvailable.every((item, idx) => {
              const candidate = nextAvailable[idx] ?? {};
              return (
                item.id === candidate.id &&
                item.label === candidate.label &&
                item.icon === candidate.icon
              );
            });

          if (unchanged) {
            return prev;
          }

          return {
            available: nextAvailable,
            active: modeData.active ?? null,
          };
        });
      }, []);

      function setAgentStatus(status){
        if( editorRef.current ){          
            editorRef.current.statusMessage(status)
        }
      }
    
      useEffect(()=>{
        const mainstore = MainStore()
        updateStatus( {active: !inputBox.current?.empty(), messages})
        if( externalContext ){
          const ext = [externalContext].flat().filter(Boolean)
          if( ext.map(d=>d?.id).join("-") !== [context].flat().filter(d=>Boolean).map(d=>d?.id).join("-")){
            setContext(ext)
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

/*      useEffect(() => {
        if (insertedCount.current === 0 && messages.length > 0) {
          editorRef.current.appendMessages(messages.filter(d=>!d.hidden))
          insertedCount.current = messages.length
        }
      }, [messages])*/
    
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


      /*function updateAssistantUI(text, hidden = false, other = {}) {
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
      }*/
      function updateAssistantUI(text, hidden = false, other = {}) {
        setMessages(h => {
          const lastMsg = h[h.length - 1]
          if (lastMsg.role === 'assistant' && !lastMsg.preview && !lastMsg.context && !other.context){
                return [...h.slice(0, -1), {...other, updated: true, role:'assistant', content: text, hidden }];
          }
          return [...h, {...other, role:'assistant', content: text, hidden }];
        });
      }

      async function sendChat() {
        if( pending){return}
        if( inputBox.current?.empty() ){
          return
        }
        setPending(true)
        const userMsg = { role: 'user', content: inputBox.current?.value().trim() };
        //const nextFull = [...messages, userMsg, { role: 'assistant', content: "[[update:Thinking...]]"}]
        const nextFull = [...messages, userMsg]//, { role: 'assistant', content: "[[update:Thinking...]]"}]
        setAgentStatus("agent_responding")
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
      
            if (payload.agent_mode) {
              applyAgentMode(payload.agent_mode);
              continue;
            }

            if (payload.content) {
              if( payload.content.startsWith("__SC_BK")){
                const rewind = payload.content.match(/__SC_BK(\d+)__/)
                if( rewind ){
                  const rewindCount = parseInt(rewind[1])
                  displayContent = displayContent.slice(0, displayContent.length - rewindCount)
                  payload.content = payload.content.slice(rewind[0].length)
                }
              }
              let statusUpdate

              displayContent += payload.content;
              
              if( displayContent.match(/\[\[agent_running\]\]/)){
                statusUpdate = "[[agent_running]]"
                displayContent = displayContent.replace(statusUpdate, "" )
              }else  {
                const m = displayContent.match(/\[\[update:([^\]]*\]\])$/, "")
                if( m ){
                  statusUpdate = m[0]
                  displayContent = displayContent.replace(statusUpdate, "");
                }
              }
              if( statusUpdate ){
                setAgentStatus( statusUpdate.slice(2, -2) )
              }else{
                setAgentStatus( "agent_responding" )
              }
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
              const hidden = payload.context.context?.canCreate ? false :true
              console.log(hidden)
              updateAssistantUI(contextText, hidden, payload);
                displayContent = ""
            }else if(payload.preview){
              const {preview, ...other} =  payload
              updateAssistantUI(preview, false, {...other, preview: true});
                displayContent = ""
            }
      
            if (payload.done) {
              setAgentStatus()
              setPending(false)
              reader.cancel();
              readerRef.current = null;
              return;
            }
          }
        }
      }

      const immediateContextIds = useMemo(() => {
        const source = externalContext && [externalContext].flat().filter(Boolean).length > 0
          ? [externalContext].flat().filter(Boolean)
          : [context].flat().filter(Boolean);
        return source?.map((item) => item?.id)?.filter(Boolean) ?? [];
      }, [externalContext, context]);

      const refreshModeSummary = useCallback(async (ids) => {
        if (!primitive?.id) {
          return;
        }

        const controller = new AbortController();
        if (modeRefreshController.current) {
          modeRefreshController.current.abort();
        }
        modeRefreshController.current = controller;

        let reader;
        try {
          
          const res = await fetch(`/api/primitive/${primitive.id}/agent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [],
              options: {
                parentId: primitive.origin?.id,
                agentScope,
                immediateContext: ids?.length ? ids : undefined,
                modePing: true,
              },
            }),
            signal: controller.signal,
          });

          if (!res.ok || !res.body) {
            return;
          }

          reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let finished = false;

          while (!finished) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();
            for (const part of parts) {
              if (!part.startsWith('data:')) continue;
              const payload = JSON.parse(part.slice(5).trim());
              if (payload.agent_mode) {
                applyAgentMode(payload.agent_mode);
              }
              if (payload.done) {
                finished = true;
              }
            }
          }
        } catch (error) {
          if (!controller.signal.aborted && error.name !== 'AbortError') {
            console.warn('Mode refresh failed', error);
          }
        } finally {
          if (reader) {
            try {
              await reader.cancel?.();
            } catch (_) {
              // ignore cancellation errors
            }
            reader.releaseLock?.();
          }

          if (modeRefreshController.current === controller) {
            modeRefreshController.current = null;
          }
        }
      }, [primitive?.id, primitive?.origin?.id, agentScope?.constrainTo, applyAgentMode]);

      const modeRefreshKey = immediateContextIds.length ? immediateContextIds.join(',') : 'none';

      useEffect(() => {
        refreshModeSummary(immediateContextIds);
      }, [refreshModeSummary, modeRefreshKey]);

      useEffect(() => () => {
        modeRefreshController.current?.abort?.();
      }, []);

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
            {props.showContext !== false && context && <div className={clsx([
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
                <MarkdownEditor actionCallback={actionCallback} scrollToEnd={true} float={true} ref={editorRef} controlled={false}/>
            </div>}
            {modeSummary?.available?.length > 0 && (
              <div className="w-full flex flex-wrap items-center gap-2 mb-2">
                {modeSummary.available.map((mode) => {
                  const icon = mode.icon || MODE_ICON_MAP[mode.id] || DEFAULT_MODE_ICON;
                  const isActive = mode.id === modeSummary.active;
                  return (
                    <div
                      key={mode.id}
                      className={clsx(
                        'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors',
                        isActive
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-slate-100 text-slate-600 border-transparent'
                      )}
                    >
                      <HeroIcon icon={icon} className={clsx('h-4 w-4', isActive ? 'text-white' : 'text-slate-500')} />
                      <span>{mode.label || mode.id}</span>
                    </div>
                  );
                })}
              </div>
            )}
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
