import React, { useMemo, useState, useCallback, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { createEditor, Editor, Transforms, Text, Node, Element as SlateElement, Path } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { markdownToSlate, pickAtRandom } from './SharedTransforms';
import clsx from 'clsx';
import MainStore from './MainStore';
import { ArrowRightIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { Logo } from './logo';
import { KonvaPrimitive } from './KonvaPrimitive';
import { VisualizationPreview } from './VisualizationPreview';
import { PrimitiveReferenceInfo } from './@components/PrimitiveReferenceInfo';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useNavigate } from 'react-router-dom';

  
function withBadges(editor) {
  const { isInline, isVoid } = editor

  editor.isInline = element =>
    element.type === 'badge' ? true : isInline(element)

  editor.isVoid = element =>
    element.type === 'badge' ? true : isVoid(element)

  return editor
}



function MarkdownBadge({ badgeType, actionCallback }) {
  const navigate = useNavigate()        

  function runningBadge(title){
    return <div className="animate-border inline-flex  animate-border bg-[length:400%_400%] bg-gradient-to-r bg-white from-green-500 inline-block to-blue-500 via-purple-500 p-[1px] rounded-full">
      <span className={`bg-slate-50 inline-flex  pl-1 ${title ? "pr-2" : "pr-1"} py-0.5 text-slate-700 rounded-full place-items-center text-sm`}>
        <Logo active={true} className={`bg-gray-100 h-4 w-4 rounded-full animate-ripple-color ${title ? "mr-1" : ""}`}/>
        {title}
        </span>
    </div>
  }

  switch (badgeType) {
    case 'agent_responding':
      return runningBadge("")
    case 'agent_running':
      return runningBadge("Running...")
    // add more cases for different badges…
    default:
      if(badgeType.startsWith("update:")){
        badgeType = badgeType.slice(7)
        return runningBadge(badgeType.trim())
      }
      if(badgeType.startsWith("id:")){
        let ids = badgeType.slice(3).split(",").map(d=>d.trim())
        const mainstore = MainStore()
        let overflow = ids.length > 5 ? ids.length - 5 : undefined
        /*if( overflow ){
          ids = pickAtRandom(ids, 5)
        }*/
        const items = ids.map(d=>mainstore.primitive(d)).filter(Boolean)
         return <Popover placement="left" showArrow={true} size="lg" backdrop='blur'>
            <PopoverTrigger>
                <span className="bg-gray-200 border hover:bg-gray-300 hover:border-gray-400 inline-flex mx-0.5 items-center justify-center p-0.5 rounded-full text-gray-600 hover:text-gray-800">
                  <ArrowRightIcon className='w-3'/>
                </span>
            </PopoverTrigger>
            <PopoverContent>
              {({ open }) => <PrimitiveReferenceInfo items={items}/>}
            </PopoverContent>
        </Popover>    
      }else if(badgeType.startsWith("new:")){
        let id = badgeType.slice(4).split(",")[0]
        const target = MainStore().primitive(id)
        if( target){
                return <span onClick={()=>navigate(`/item/${id}`)} className="bg-gray-200 border hover:bg-gray-300 hover:border-gray-400 inline-flex mx-0.5 items-center justify-center p-0.5 rounded-full text-gray-600 hover:text-gray-800">
                  <ArrowRightIcon className='w-3'/>
                </span>

        }
        return <></>
      }else if(badgeType.startsWith("ref:")){
        let ids = badgeType.slice(4).split(",")

        const mainstore = MainStore()
        let overflow = ids.length > 5 ? ids.length - 5 : undefined
        if( overflow ){
          ids = pickAtRandom(ids, 5)
        }
        const badges = ids.slice(0,5).map(d=>{
          const p = mainstore.primitive(d.trim())
          if( p ){
            return <KonvaPrimitive primitive={p}/>
          }
          return <></>
        })
        return <>
        <br></br>
          {badges}
          {overflow && <span className="-mt-1 align-middle bg-gray-200 inline-block mx-1 px-1 py-1 rounded text-gray-600 leading-none text-[8px]">+{overflow} more</span>}
        </>
      }else if(badgeType.startsWith("action_item:")){
        const [_, _2,id, text] = badgeType.match(/^([^:]+):([^:]+):(.*)$/)

        return <div className="inline-flex">
          <Button startContent={<PlusCircleIcon className='w-4 h-5'/>} className="text-slate-500" variant="faded" size="sm" onPress={actionCallback ? ()=>actionCallback(id) : undefined}>{text}</Button>
        </div>
      }
      return (
        <span className="inline-block px-2 py-0.5 bg-gray-200 text-gray-800 rounded">
          {badgeType}
        </span>
      );
  }
}
  
  const slateToMarkdown = (slateContent, depth = 0) => {
    return slateContent.map((node) => {
      if (node.type === 'heading') {
        return `${'#'.repeat(node.level)} ${Node.string(node)}`;
      }else if (node.type === 'table') {
        const rows = node.children.map(rowNode => 
          rowNode.children
            .map(cellNode => Node.string(cellNode))
            .join(' | ')
        );
  
        if (node.children[0].isHeader) {
          const headerSeparator = rows[0].split(' | ').map(() => '---').join(' | ');
          return [rows[0], headerSeparator, ...rows.slice(1)].join('\n');
        }
  
        return rows.join('\n');
      } else if (node.type === 'list-item') {
        const indent = "  ".repeat(depth);

        // (1) Extract “plain text” from the new paragraph wrapper
        //     If the first child is a paragraph, pull its inline children; otherwise,
        //     fall back to whatever text nodes are directly under <li>.
        let content = "";
        if (node.children[0]?.type === "paragraph") {
          content = node.children[0].children
            .map((leaf) => {
              if (leaf.bold) {
                return `**${leaf.text}**`;
              }
              return leaf.text;
            })
            .join("");
        } else {
          content = node.children
            .map((leaf) => {
              if (leaf.bold) {
                return `**${leaf.text}**`;
              }
              return leaf.text;
            })
            .join("");
        }

        // (2) Figure out list prefix. We no longer have node.ordered directly,
        //     but in your original code, `node.ordered` was only truthy if it had
        //     been set. In practice, if there’s no `node.ordered`, fall back to “-”.
        const listPrefix = node.ordered ? `${node.index + 1}.` : "-";

        // (3) Check for a nested sub-list (either ordered or unordered) under this <li>.
        //     If found, serialize it at depth+1.
        const nestedListNode = node.children.find(
          (child) => child.type === "unordered-list" || child.type === "ordered-list"
        );
        if (nestedListNode) {
          // Recursively serialize that one nested list node
          const nestedMarkdown = slateToMarkdown(
            nestedListNode.children,
            depth + 1
          );
          return `${indent}${listPrefix} ${content}\n${nestedMarkdown}`;
        }

        // (4) No nested list, just emit this one line
        return `${indent}${listPrefix} ${content}`;
      } else if (node.type === 'unordered-list' || node.type === 'ordered-list') {
        // Recursively process list children with increased depth
        return slateToMarkdown(node.children, depth + 1);
      } else if (node.children) {
        // Handle non-list, non-heading nodes with children (e.g., paragraphs)
        return node.children.map((child) => {
          if (child.bold) {
            return `**${child.text}**`;
          }
          return child.text;
        }).join('');
      }
  
      return Node.string(node);
    }).join('\n');
  };

  function convertInitialValue(initialMarkdown){
    if (initialMarkdown) {
      if( Array.isArray(initialMarkdown ) ){
        const slateNodes = [];
        for (const { role, content, preview } of initialMarkdown) {
          if( preview){

            let parsed
            try{
              parsed = JSON.parse( content )
              console.log(parsed)
            }catch(e){
              console.warn(`Error passing visualization config`)
            }
            if( parsed ){
              slateNodes.push({
                type: "preview",
                side: role === "assistant" ? "left" : "right",
                data: parsed,
                children: [{ text: "" }]
              });
            }
            continue
          }
          const children = markdownToSlate(content);
          slateNodes.push({
            type: "chat-message",
            side: role === "assistant" ? "left" : "right",
            children,
          });
        }
      
        // ensure at least one node
        return slateNodes.length
          ? slateNodes
          : [{ type: "paragraph", children: [{ text: "" }] }];
      }
      return markdownToSlate(initialMarkdown);  
    } else {
      return [{ type: 'paragraph', children: [{ text: '' }] }];
    }
  }

//  export function MarkdownEditor({ initialMarkdown, ...props }){
const MarkdownEditor = forwardRef(function MarkdownEditor({ initialMarkdown, actionCallback, ...props }, ref){
  const editor = useMemo(() => withBadges(withHistory(withReact(createEditor()))), [])
  const slateRef = useRef()
  const statusMessage = useRef()
  const [value, setValue] = useState(() => convertInitialValue( initialMarkdown));

  useEffect(()=>{
    if( props.controlled === false){
      return
    }
    const wasAtTop = slateRef.current && (slateRef.current.scrollTop + slateRef.current.clientHeight) === slateRef.current.scrollHeight;
    editor.children = convertInitialValue( initialMarkdown)
    editor.onChange();
    //Transforms.select(editor, props.scrollToEnd ? Editor.end(editor, []) : { path: [0, 0], offset: 0 });
    if (wasAtTop && props.scrollToEnd && slateRef.current) {
      setTimeout(()=>{
        slateRef.current.scrollTop = slateRef.current.scrollHeight;
      }, 20)
    }

  },[initialMarkdown])


  function isEditorEmpty(editor) {
    const { children } = editor;
    if (children.length !== 1) return false;
  
    const firstNode = children[0];
    if (firstNode.type !== 'paragraph' || !Array.isArray(firstNode.children)) return false;
  
    return firstNode.children.length === 1 && Node.string(editor).trim() === '';
  }
  function removeStatusBadges( editor ){
        let idx = editor.children.findIndex(d=>d.statusBadge )
        while( idx > -1){
            Transforms.removeNodes(editor, { at: [idx] });
            idx = editor.children.findIndex(d=>d.statusBadge )
        }
  }

  useImperativeHandle(ref, ()=>{
    return {
      copyToClipboard,
      empty:()=>isEditorEmpty( editor ),
      focus:()=>slateRef.current.focus(),
      statusMessage:(status)=>{
        if( status ){
          statusMessage.current = [{ type:"paragraph", statusBadge: true, children: [{type: 'badge', badgeType: status, children:[{text: ""}]}]}]
        }else{
          statusMessage.current = undefined
          Editor.withoutNormalizing(editor, () => {
            removeStatusBadges(editor)
          })
        }
      },
      clear:()=>{
        const d = convertInitialValue( "")
        editor.children = d
        editor.onChange();
        Transforms.select(editor, { path: [0, 0], offset: 0 });
      },
      appendMessages: (newMsgs = [], update) => {
        Editor.withoutNormalizing(editor, () => {
        const wasAtTop = slateRef.current && (slateRef.current.scrollTop + slateRef.current.clientHeight) === slateRef.current.scrollHeight;
        const isEmpty = !newMsgs || newMsgs.length === 0
        const nodes = convertInitialValue(newMsgs)
        let done = false
        
        removeStatusBadges(editor)
        
        if( update ){
          const endIndex = editor.children.length - 1
          if (endIndex >= 0 ){
            Transforms.removeNodes(editor, { at: [endIndex] });
            if( !isEmpty ){
              Transforms.insertNodes(editor, nodes, { at: [endIndex] });
              done = true
            }
          }
        }
        if( !done && !isEmpty){
          Transforms.insertNodes(editor, nodes, { at: [editor.children.length] })
        }
        if( statusMessage.current){
          Transforms.insertNodes(editor, statusMessage.current, { at: [editor.children.length] })
        }
        // insert at the end of the document
        if (slateRef.current && props.scrollToEnd && wasAtTop) {
          // you can hook into your scroll‐to‐bottom logic here
          setTimeout(() => {
            if( slateRef.current){
              slateRef.current.scrollTop = slateRef.current.scrollHeight;
            }
          }, 50)
        }
      })
      },
      value:()=>{
        return slateToMarkdown(value)
      }
    }
  }, [value])

 async function copyToClipboard(){
    if (slateRef.current) {
      try {
        // Clone the div to avoid modifying the original content
        const clone = slateRef.current.cloneNode(true);
  
        // Function to recursively apply computed styles as inline styles
        const applyInlineStyles = (origElement, cloneElement) => {
          if (origElement.nodeType !== Node.ELEMENT_NODE) return;
  
          let style = {};
  
          // If the element is a TD, copy styles from parent TR
          if (origElement.tagName === 'TD' || origElement.tagName === 'TH') {
            const parent = origElement.parentElement;
            if (parent && parent.tagName === 'TR') {
              const parentComputedStyle = window.getComputedStyle(parent);
  
              // Copy parent TR styles to style object
              for (const key of parentComputedStyle) {
                if( key === "width"){
                    continue
                }
                let value = parentComputedStyle.getPropertyValue(key);
  
                // Convert rgba to rgb for background-color
                if (key === 'background-color' && value.startsWith('rgba')) {
                  value = rgbaToRgb(value);
                }else if (key === 'background-color' && value.startsWith('rgb(')) {
                  value = rgbaToRgb(value);
                }
  
                if( value ){
                    style[key] = value;
                }
              }
            }
          }
          // Get computed styles from the original element
          const computedStyle = window.getComputedStyle(origElement);
  
          // Copy original element's styles, overwriting parent styles if necessary
          for (const key of computedStyle) {
            let value = computedStyle.getPropertyValue(key);
  
            // Convert rgba to rgb for background-color
            if (key === 'background-color'){
                if (origElement.tagName === 'TR') {
                    value = undefined
                }else{
                    if( value.startsWith('rgba')) {
                        value = rgbaToRgb(value);
                    }
                }
            } 
  
            if( value ){
                style[key] = value;
            }
          }
  
          // Build style string
          const styleString = Object.entries(style)
            .map(([key, value]) => value ? `${key}: ${value};` : undefined).filter(d=>d)
            .join(' ');
  
        if( origElement.tagName !== "TR"){
            cloneElement.setAttribute('style', styleString);
        }
  
          // Recursively apply styles to child elements
          const origChildren = origElement.children;
          const cloneChildren = cloneElement.children;
  
          for (let i = 0; i < origChildren.length; i++) {
            applyInlineStyles(origChildren[i], cloneChildren[i]);
          }
        };
  
        // Function to convert rgba to rgb by removing alpha channel
        const rgbaToRgb = (rgba) => {
          const parts = rgba.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
          if (parts) {
            const r = parts[1];
            const g = parts[2];
            const b = parts[3];
            if( r === "0" && g === "0" && b === "0"){
                return undefined
            }
            return `rgb(${r}, ${g}, ${b})`;
          } else {
            // If it's already rgb, return as is
            return rgba;
          }
        };
  
        // Start the recursive style application
        applyInlineStyles(slateRef.current, clone);
  
        const htmlContent = clone.innerHTML;
        const plainTextContent = clone.innerText;
  
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainTextContent], { type: 'text/plain' });
        const data = [
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          }),
        ];
  
        await navigator.clipboard.write(data);
        console.log('Content copied to clipboard.');
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
    }
  };
  


  // Render the editor elements
  const renderElement = useCallback((props) => {
     const { element, attributes, children } = props;
    switch (props.element.type) {
        case 'heading':
            return <h2 className={`font-bold text-${props.element.level ?? 2}xl my-3`} {...props.attributes}>{props.children}</h2>;
        case 'unordered-list':
            return <ul {...attributes} className="pl-6 list-disc">{children}</ul>;
        case 'ordered-list':
            const start = element.start;
            return (
              <ol
                {...attributes}
                className="pl-6 list-decimal"
                {...(start && start !== 1 ? { start } : {})}
              >
                {children}
              </ol>)
        case 'list-item':
            return <li {...attributes}>{children}</li>;
        case 'table':
            return <table {...attributes} className="table-auto border-collapse">{children}</table>;

        case 'table-row':
            if (element.isHeader) {
                return <tr {...attributes} className="bg-gray-200 font-bold">{children}</tr>; // Apply header styles
            }
            return <tr {...attributes}>{children}</tr>;

        case 'table-cell':
            return <td {...attributes} className="border px-2 py-1">{children}</td>;
        case 'link':
          return (
            // wrapper makes this whole chunk non-editable and lets events through
            <span {...attributes} contentEditable={false}>
              <a
                href={element.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline cursor-pointer"
                onClick={e => {
                  e.preventDefault();
                  window.open(element.url, '_blank');
                }}
              >
                {children}
              </a>
            </span>
          );
        case "preview":
          return <div className='p-2'>
            {element.data?.views?.map(d=><VisualizationPreview {...d} size="small" />)}
          </div>
        case "chat-message":
            return (
              <div
                {...attributes}
                style={{
                  display: "flex",
                  justifyContent:
                    element.side === "right" ? "flex-end" : "flex-start",
                  margin: "4px 0",
                }}
              >
                <div
                  contentEditable={false}
                  className={clsx(
                    element.side === "right" ? "rounded-lg bg-slate-200 px-2 py-1 max-w-[60%]" : "p-2 max-w-[90%]"
                  )}
                >
                  {children}
                </div>
              </div>
            );
        case 'badge':
            return (
              <span {...attributes} contentEditable={false}>
                <MarkdownBadge badgeType={element.badgeType} actionCallback={actionCallback}/>
                {children}
              </span>
      );

        default:
            return <p {...props.attributes}>{props.children}</p>;
    }
  }, []);


  const renderLeaf = (props) => {
    const { attributes, children, leaf } = props;
    if (leaf.bold) {
      return <strong {...attributes}>{children}</strong>;
    }
    return <span {...attributes}>{children}</span>;
  };

  // Handle key down events for keyboard shortcuts
  const handleKeyUp = (event)=>{
    if(props.onKeyUp ){
      const result = props.onKeyUp(event)
      if( result){
        return
      }
    }

  }

  const handleKeyDown = (event) => {
    if (event.metaKey || event.ctrlKey) {
      switch (event.key) {
        case 'b': {
          event.preventDefault();
          toggleBoldMark();
          break;
        }
        case '1': {
          event.preventDefault();
          toggleHeading();
          break;
        }
        default:
          break;
      }
    }
  
    const { selection } = editor;
    if (!selection) return;
  
    // Get all the currently selected blocks
    const selectedBlocks = Array.from(
      Editor.nodes(editor, {
        match: (n) => SlateElement.isElement(n),
        mode: 'lowest',
      })
    );
    if (!selectedBlocks.length) return;
  
    if (event.key === 'Escape') {
      const d = convertInitialValue(initialMarkdown);
      editor.children = d;
      editor.onChange();
      Transforms.select(editor, { path: [0, 0], offset: 0 });
    }

    const getListDepth = (path) => {
      let depth = 0;
      let currPath = path;
      while (currPath.length > 0) {
        const parentEntry = Editor.parent(editor, currPath);
        if (!parentEntry) break;
        const [parentNode, parentPath] = parentEntry;
        if (
          SlateElement.isElement(parentNode) &&
          (parentNode.type === 'unordered-list' || parentNode.type === 'ordered-list')
        ) {
          depth++;
        }
        currPath = parentPath;
      }
      return depth;
    };
  
    if (event.key === 'Enter') {
      // 1) Are we in a <list-item>? If not, let Enter work normally.
      const [currentItemEntry] = Editor.nodes(editor, {
        match: (n) => SlateElement.isElement(n) && n.type === 'list-item',
        mode: 'lowest',
      });
      if (!currentItemEntry) {
        return;
      }
    
      event.preventDefault();
      const [currentItemNode, currentItemPath] = currentItemEntry;
      const currentText = Node.string(currentItemNode).trim();
    
      // 2) If this <li> has text, split it as usual.
      if (currentText !== '') {
        Transforms.splitNodes(editor, {
          at: editor.selection,
          match: (n) => SlateElement.isElement(n) && n.type === 'list-item',
          mode: 'lowest',
          always: true,
        });
        return;
      }
    
      // 3) We have an empty <li>. We want to delete just that <li>, prune any now‐empty ancestor lists,
      //    and then insert a paragraph after the *top‐level* list that contained it.
    
      // a) Find all ancestor entries (list and list-items) from the <li> upward
      const ancestorEntries = Array.from(
        Editor.levels(editor, {
          at: currentItemPath,
          match: (n) => SlateElement.isElement(n),
        })
      );
      //   The last ancestorEntry is the document root. Just below that sits the top‐level list.
    
      // b) Within that list of ancestors, find the nearest <ul>/<ol> whose parent is NOT itself a <ul>/<ol>.
      //    That is our top‐level list.
      let topListPath = null;
      for (let [node, path] of ancestorEntries) {
        if (
          SlateElement.isElement(node) &&
          (node.type === 'unordered-list' || node.type === 'ordered-list')
        ) {
          // Check parent of this list:
          const above = Editor.parent(editor, path);
          if (!above) {
            // Shouldn't happen, but if no parent, treat this as top‐level
            topListPath = path;
            break;
          }
          const [parentNode] = above;
          if (
            !(
              SlateElement.isElement(parentNode) &&
              (parentNode.type === 'unordered-list' || parentNode.type === 'ordered-list')
            )
          ) {
            // This list's parent is not itself a list → this is the top‐level list
            topListPath = path;
            break;
          }
        }
      }
    
      // c) Remove the empty <li> at currentItemPath.
      Transforms.removeNodes(editor, { at: currentItemPath });
    
      // d) Now, starting from the deepest ancestor that was a list, remove any that are now empty,
      //    but stop before removing the top‐level list itself. If the top‐level list becomes empty,
      //    we will remove it in the next step after deciding where to insert our paragraph.
      for (let [node, path] of ancestorEntries) {
        if (
          SlateElement.isElement(node) &&
          (node.type === 'unordered-list' || node.type === 'ordered-list')
        ) {
          // If this list is at or above the top‐level list, stop.
          if (Path.equals(path, topListPath)) {
            break;
          }
          // Otherwise, check if it has any children left. If not, remove it.
          try {
            const updated = Node.get(editor, path);
            if (updated.children.length === 0) {
              Transforms.removeNodes(editor, { at: path });
            }
          } catch {
            // If that node no longer exists, skip.
          }
        }
      }
    
      // e) If the top‐level list itself has become empty, remove it too.
      let insertPath;
      try {
        const updatedTop = Node.get(editor, topListPath);
        if (updatedTop.children.length === 0) {
          Transforms.removeNodes(editor, { at: topListPath });
          // Since it’s gone, we will insert at that location:
          insertPath = topListPath;
        } else {
          // Still has items → insert immediately after it
          insertPath = Path.next(topListPath);
        }
      } catch {
        // It no longer exists (was removed), so insert at topListPath
        insertPath = topListPath;
      }
    
      // f) Insert a brand‐new paragraph at insertPath
      const paragraphNode = {
        type: 'paragraph',
        children: [{ text: '' }],
      };
      Transforms.insertNodes(editor, paragraphNode, { at: insertPath });
    
      // g) Place the cursor inside that new paragraph
      const [newPara] = Editor.nodes(editor, {
        at: insertPath,
        match: (n) => SlateElement.isElement(n) && n.type === 'paragraph',
        mode: 'lowest',
      });
      if (newPara) {
        const [, newParaPath] = newPara;
        Transforms.select(editor, Editor.start(editor, newParaPath));
      }
    
      return;
    }
    
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
    
      selectedBlocks.forEach(([node, path]) => {
        // 1) Find nearest <li> ancestor.
        const liEntry = Editor.above(editor, {
          at: path,
          match: (n) => SlateElement.isElement(n) && n.type === 'list-item',
          mode: 'lowest',
        });
    
        // CASE A: not in a <li> → convert paragraph → <li> → wrap in <ul>
        if (!liEntry) {
          Transforms.wrapNodes(
            editor,
            { type: 'list-item', children: [] },
            { at: path }
          );
          Transforms.wrapNodes(
            editor,
            { type: 'unordered-list', children: [] },
            { at: path }
          );
    
          // Merge that newly created <ul> with any adjacent <ul>
          {
            const [maybeListNode, maybeListPath] = Editor.node(editor, path);
            if (
              SlateElement.isElement(maybeListNode) &&
              maybeListNode.type === 'unordered-list'
            ) {
              let listPath = maybeListPath;
              // merge into previous if same‐type
              try {
                const prevPath = Path.previous(listPath);
                const prevNode = Node.get(editor, prevPath);
                if (SlateElement.isElement(prevNode) && prevNode.type === 'unordered-list') {
                  Transforms.mergeNodes(editor, { at: listPath });
                  listPath = prevPath;
                }
              } catch {}
              // merge the “next” list into ours if same‐type
              try {
                const nextPath = Path.next(listPath);
                const nextNode = Node.get(editor, nextPath);
                if (SlateElement.isElement(nextNode) && nextNode.type === 'unordered-list') {
                  Transforms.mergeNodes(editor, { at: nextPath });
                }
              } catch {}
            }
          }
          return;
        }
    
        // CASE B: in a <li> → compute depth
        const [liNode, liPath] = liEntry;
        const D = getListDepth(liPath);
    
        // 2) If top‐level <li> (D === 0) → wrap in nested list, then merge
        if (D === 0) {
          const listType = Editor.parent(editor, liPath)[0].type; // 'unordered-list' or 'ordered-list'
          Transforms.wrapNodes(
            editor,
            { type: listType, children: [] },
            {
              at: liPath,
              match: (n) => SlateElement.isElement(n) && n.type === 'list-item',
            }
          );
    
          // Merge that new nested list with any same‐type siblings
          {
            const [maybeListNode, maybeListPath] = Editor.node(editor, liPath);
            if (
              SlateElement.isElement(maybeListNode) &&
              maybeListNode.type === listType
            ) {
              let listPath = maybeListPath;
              try {
                const prevPath = Path.previous(listPath);
                const prevNode = Node.get(editor, prevPath);
                if (SlateElement.isElement(prevNode) && prevNode.type === listType) {
                  Transforms.mergeNodes(editor, { at: listPath });
                  listPath = prevPath;
                }
              } catch {}
              try {
                const nextPath = Path.next(listPath);
                const nextNode = Node.get(editor, nextPath);
                if (SlateElement.isElement(nextNode) && nextNode.type === listType) {
                  Transforms.mergeNodes(editor, { at: nextPath });
                }
              } catch {}
            }
          }
          return;
        }
    
        // CASE C: nested <li> (D > 0) → indent under previous sibling
        const parentListEntry = Editor.parent(editor, liPath);
        if (
          !parentListEntry ||
          !(
            SlateElement.isElement(parentListEntry[0]) &&
            (parentListEntry[0].type === 'unordered-list' ||
             parentListEntry[0].type === 'ordered-list')
          )
        ) {
          return;
        }
        const [parentListNode, parentListPath] = parentListEntry;
        const indexInParent = liPath[liPath.length - 1];
        if (indexInParent === 0) {
          // can’t indent if it’s already the first item
          return;
        }
    
        const prevSiblingPath = [...parentListPath, indexInParent - 1];
        const [prevSiblingNode] = Editor.node(editor, prevSiblingPath);
        const listType = parentListNode.type; // either 'unordered-list' or 'ordered-list'
    
        // If prevSibling already has a nested list of this type, move into it
        let childListIndex = -1;
        for (let i = 0; i < prevSiblingNode.children.length; i++) {
          const child = prevSiblingNode.children[i];
          if (SlateElement.isElement(child) && child.type === listType) {
            childListIndex = i;
            break;
          }
        }
    
        if (childListIndex >= 0) {
          const existingListPath = [...prevSiblingPath, childListIndex];
          const endIndex = Node.get(editor, existingListPath).children.length;
          Transforms.moveNodes(editor, {
            at: liPath,
            to: [...existingListPath, endIndex],
          });
    
          // Merge that nested <ul> with any same‐type siblings
          const movedListEntry = Editor.above(editor, {
            at: prevSiblingPath,
            match: (n) => SlateElement.isElement(n) && n.type === listType,
          });
          if (movedListEntry) {
            let listPath = movedListEntry[1];
            try {
              const prevPath = Path.previous(listPath);
              const prevNode = Node.get(editor, prevPath);
              if (SlateElement.isElement(prevNode) && prevNode.type === listType) {
                Transforms.mergeNodes(editor, { at: listPath });
                listPath = prevPath;
              }
            } catch {}
            try {
              const nextPath = Path.next(listPath);
              const nextNode = Node.get(editor, nextPath);
              if (SlateElement.isElement(nextNode) && nextNode.type === listType) {
                Transforms.mergeNodes(editor, { at: nextPath });
              }
            } catch {}
          }
          return;
        }
    
        // Otherwise, create a brand‐new nested list under prevSibling
        const newListPath = [...prevSiblingPath, 1];
        Transforms.insertNodes(
          editor,
          { type: listType, children: [] },
          { at: newListPath }
        );
        Transforms.moveNodes(editor, {
          at: liPath,
          to: [...newListPath, 0],
        });
    
        // Then merge that new nested <ul> with any same‐type sibling
        const movedListEntry = Editor.above(editor, {
          at: prevSiblingPath,
          match: (n) => SlateElement.isElement(n) && n.type === listType,
        });
        if (movedListEntry) {
          let listPath = movedListEntry[1];
          try {
            const prevPath = Path.previous(listPath);
            const prevNode = Node.get(editor, prevPath);
            if (SlateElement.isElement(prevNode) && prevNode.type === listType) {
              Transforms.mergeNodes(editor, { at: listPath });
              listPath = prevPath;
            }
          } catch {}
          try {
            const nextPath = Path.next(listPath);
            const nextNode = Node.get(editor, nextPath);
            if (SlateElement.isElement(nextNode) && nextNode.type === listType) {
              Transforms.mergeNodes(editor, { at: nextPath });
            }
          } catch {}
        }
        return;
      }); // end selectedBlocks.forEach
    
      // ─── FINAL PASS: collapse any two consecutive top‐level lists of same type ───
      {
        const root = editor.children;
        for (let i = 0; i < root.length - 1; i++) {
          if (
            SlateElement.isElement(root[i]) &&
            SlateElement.isElement(root[i + 1]) &&
            (root[i].type === 'unordered-list' || root[i].type === 'ordered-list') &&
            root[i].type === root[i + 1].type
          ) {
            Transforms.mergeNodes(editor, { at: [i + 1] });
            break;
          }
        }
      }
      // ──────────────────────────────────────────────────────────────────────────
    
      return;
    }
    // ─────────────────────────────────────────────────────────────────
  
    // ─────────────────────────────────────────────────────────────────
    // ◀︎── CHANGE #2: SHIFT+TAB = UNINDENT (unwrap and convert to paragraph)
    if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
    
      // 1) Collect unique <li> paths from selected blocks
      const liPathSet = new Set();
      const selectedBlocks = Array.from(
        Editor.nodes(editor, {
          match: (n) => SlateElement.isElement(n),
          mode: "lowest",
        })
      );
      selectedBlocks.forEach(([node, path]) => {
        const liEntry = Editor.above(editor, {
          at: path,
          match: (n) => SlateElement.isElement(n) && n.type === "list-item",
          mode: "lowest",
        });
        if (liEntry) {
          const [, liPath] = liEntry;
          liPathSet.add(JSON.stringify(liPath));
        }
      });
    
      // 2) Process each <li> once
      Array.from(liPathSet).forEach((serializedPath) => {
        const liPath = JSON.parse(serializedPath);
    
        // Capture original offset if cursor was inside this <li>
        let originalOffset = 0;
        const { selection } = editor;
        if (selection && selection.anchor) {
          const { anchor } = selection;
          if (
            anchor.path.length >= liPath.length &&
            Path.isCommon(liPath, anchor.path)
          ) {
            originalOffset = anchor.offset;
          }
        }
    
        // 3) Find the immediate parent‐list (<ul> or <ol>) of this <li>
        const parentListEntry = Editor.above(editor, {
          at: liPath,
          match: (n) =>
            SlateElement.isElement(n) &&
            (n.type === "unordered-list" || n.type === "ordered-list"),
        });
        if (!parentListEntry) {
          return; // Not inside any list
        }
        const [parentListNode, parentListPath] = parentListEntry;
    
        // 4) Find the <li> that owns that parent‐list (if any)
        const parentOfListEntry = Editor.parent(editor, parentListPath);
        if (
          !parentOfListEntry ||
          !(
            SlateElement.isElement(parentOfListEntry[0]) &&
            parentOfListEntry[0].type === "list-item"
          )
        ) {
          // ─────────── Depth 1 (top‐level) ───────────
    
          // a) Grab the full liNode, including any nested <ul>/<ol> under it
          const [liNode] = Editor.node(editor, liPath);

          //    • inlineLeaves = the array of leaf objects from the paragraph (child 0)
          const inlineLeaves =
            Array.isArray(liNode.children) && liNode.children[0]?.children
              ? liNode.children[0].children
              : [];

          //    • nestedChildren = any block‐level nodes beyond index 0 (usually <ul> or <ol>)
          //      that used to live under this <li>.
          const nestedChildren = Array.isArray(liNode.children)
            ? liNode.children.slice(1)
            : [];

          // b) Compute indices in the top‐level list
          const liIndex = liPath[liPath.length - 1]; // position within that list
          const listIndex = parentListPath[0];       // index of the entire list at root

          // c) Collect same‐level siblings AFTER this <li>
          const siblingsAfter = parentListNode.children.slice(liIndex + 1);

          // d) Remove every item after this <li> in the original list (bottom‐up)
          for (let i = parentListNode.children.length - 1; i > liIndex; i--) {
            Transforms.removeNodes(editor, { at: [...parentListPath, i] });
          }

          // e) Remove the <li> itself
          Transforms.removeNodes(editor, { at: [...parentListPath, liIndex] });

          // f) Insert a new paragraph at root using inlineLeaves
          const paragraphNode = {
            type: "paragraph",
            children: inlineLeaves,
          };
          const insertParaPath = [listIndex + 1];
          Transforms.insertNodes(editor, paragraphNode, { at: insertParaPath });

          // g) ◀︎── CHANGED: re‐insert each nestedChild as its own block directly below
          //    the paragraph. Start at index [listIndex + 2], then increment.
          let nextInsertIndex = listIndex + 2;
          nestedChildren.forEach((childList) => {
            Transforms.insertNodes(editor, childList, { at: [nextInsertIndex] });
            nextInsertIndex++;
          });

          // h) If siblingsAfter existed, recreate them in a new top‐level list
          //    at whatever index follows the nestedChildren blocks
          if (siblingsAfter.length > 0) {
            const newListNode = {
              type: parentListNode.type,
              children: siblingsAfter,
            };
            Transforms.insertNodes(editor, newListNode, { at: [nextInsertIndex] });
          }

          // i) Cleanup: if the original top‐level list is now empty, remove it
          try {
            const updatedList = Node.get(editor, parentListPath);
            if (
              SlateElement.isElement(updatedList) &&
              updatedList.children.length === 0
            ) {
              Transforms.removeNodes(editor, { at: parentListPath });
            }
          } catch (e) {
            // might already be gone—ignore
          }

          // j) Restore cursor into the newly inserted paragraph
          const newParaNodePath = [listIndex + 1];
          const [firstTextEntry] = Editor.nodes(editor, {
            at: newParaNodePath,
            match: (n) => Text.isText(n),
            mode: "lowest",
          });
          if (firstTextEntry) {
            const [textNode, textPath] = firstTextEntry;
            const maxOffset = textNode.text.length;
            const offset = Math.min(originalOffset, maxOffset);
            Transforms.select(editor, { path: textPath, offset });
          }

          return;
        }
        // ─────────────────────────────────────────────────────────────────
        // ◀︎── Depth ≥ 2: nested <li> → (unchanged from before)…
    
        // a) parentLiNode & parentLiPath refer to the <li> containing that child‐list
        const [parentLiNode, parentLiPath] = parentOfListEntry;
    
        // b) Capture the liNode (including any nested children beyond first paragraph)
        const [liNode] = Editor.node(editor, liPath);
    
        // c) Compute liIndex in parentListNode.children
        const liIndex = liPath[liPath.length - 1];
    
        // d) Split siblingsBefore / siblingsAfter
        const siblingsBefore = parentListNode.children.slice(0, liIndex);
        const siblingsAfter = parentListNode.children.slice(liIndex + 1);
    
        // e) Remove the entire child‐list at parentListPath
        Transforms.removeNodes(editor, { at: parentListPath });
    
        // f) Rebuild parentLiNode.children so it keeps only its paragraph at [parentLiPath, 0]
        if (siblingsBefore.length > 0) {
          Transforms.insertNodes(
            editor,
            { type: parentListNode.type, children: siblingsBefore },
            { at: [...parentLiPath, 1] }
          );
        }
        if (siblingsAfter.length > 0) {
          const idx = siblingsBefore.length > 0 ? 2 : 1;
          Transforms.insertNodes(
            editor,
            { type: parentListNode.type, children: siblingsAfter },
            { at: [...parentLiPath, idx] }
          );
        }
    
        // g) Build a brand‐new <li> for the unindented item, now preserving:
        //    1) Its original paragraph leaves
        //    2) Any nested children it had beyond that paragraph (e.g. deeper <ul> under “Indent 3”)
        const paragraphChildren =
          Array.isArray(liNode.children) && liNode.children[0]?.children
            ? liNode.children[0].children
            : [];
        const newLiChildren = [{ type: "paragraph", children: paragraphChildren }];
    
        // Add back any nested lists (children[1:]) that used to live under this <li>.
        if (Array.isArray(liNode.children)) {
          for (let i = 1; i < liNode.children.length; i++) {
            newLiChildren.push(liNode.children[i]);
          }
        }
    
        // Finally, if there were siblingsAfter (same‐level), wrap those under this new <li>
        if (siblingsAfter.length > 0) {
          newLiChildren.push({
            type: parentListNode.type,
            children: siblingsAfter,
          });
        }
    
        const unindentedLi = { type: "list-item", children: newLiChildren };
    
        // h) Insert that new <li> into the grandparent list immediately after parentLi
        const [grandListNode, grandListPath] = Editor.parent(
          editor,
          parentLiPath
        );
        const [, foundParentPath] = Editor.node(editor, parentLiPath);
        const parentIndexNow = foundParentPath[foundParentPath.length - 1];
        const insertIndex = parentIndexNow + 1;
        Transforms.insertNodes(editor, unindentedLi, {
          at: [...grandListPath, insertIndex],
        });
    
        // i) Restore cursor into the new <li>’s paragraph
        const newLiPath = [...grandListPath, insertIndex];
        const [firstTextEntry] = Editor.nodes(editor, {
          at: [...newLiPath, 0],
          match: (n) => Text.isText(n),
          mode: "lowest",
        });
        if (firstTextEntry) {
          const [textNode, textPath] = firstTextEntry;
          const maxOffset = textNode.text.length;
          const offset = Math.min(originalOffset, maxOffset);
          Transforms.select(editor, { path: textPath, offset });
        }
    
        // j) Cleanup: remove any empty nested lists under parentLi
        try {
          const updatedParentLi = Node.get(editor, parentLiPath);
          const filtered = updatedParentLi.children.filter((child) => {
            if (
              SlateElement.isElement(child) &&
              (child.type === "unordered-list" || child.type === "ordered-list")
            ) {
              return child.children.length > 0;
            }
            return true; // keep paragraphs
          });
          if (filtered.length !== updatedParentLi.children.length) {
            Transforms.setNodes(
              editor,
              { children: filtered },
              { at: parentLiPath }
            );
          }
        } catch (e) {
          // parentLi may have been removed—ignore
        }
    
        return;
      });
    
      return;
    }
    // ─────────────────────────────────────────────────────────────────
  };
  
  const __handleKeyDown = (event) => {

  

    if (event.metaKey || event.ctrlKey) {
      switch (event.key) {
        case 'b': {
          event.preventDefault();
          toggleBoldMark();
          break;
        }
        case '1': {
          event.preventDefault();
          toggleHeading();
          break;
        }
        default:
          break;
      }
    }


    const { selection } = editor;
    if (!selection) return;

  // Get all the currently selected blocks
  const selectedBlocks = Array.from(Editor.nodes(editor, {
    match: n => SlateElement.isElement(n),
    mode: 'lowest',
  }));

  if (!selectedBlocks.length) return;

  // Handle Tab key press (Indent all selected blocks)
  if (event.key === 'Escape') {
    const d = convertInitialValue( initialMarkdown)
    editor.children = d
    editor.onChange();
    Transforms.select(editor, { path: [0, 0], offset: 0 });
  }


  if (event.key === 'Enter') {
    const { selection } = editor;
  
    // Ensure we have a valid selection
    if (!selection) return;
  
    // Get the current list item at the selection
    const [currentBlockEntry] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n) && n.type === 'list-item',
      mode: 'lowest',
    });
  
    if (currentBlockEntry) {
      const [currentBlock, path] = currentBlockEntry;
  
      // Get the text content of the current block
      const currentText = Node.string(currentBlock);
  
      // Prevent the default behavior of Enter
      event.preventDefault();
  
      // Find the parent list (unordered-list or ordered-list) of the current list-item
      const parentBlock = Editor.above(editor, {
        match: n => n.type === 'unordered-list' || n.type === 'ordered-list',
        at: path,
      });
  
      if (parentBlock) {
        const [parentNode, parentPath] = parentBlock;
  
        // If the current list-item has no content (empty), handle unwrapping logic
        if (currentText.trim() === '') {
          // Get the current indentation level by checking the path depth
          const indentLevel = Editor.path(editor, path).length - 1 ;
  
          if (indentLevel > 1) {
            // Reduce the indentation level by 1 (unwrap one level of the list)
            Transforms.unwrapNodes(editor, {
              at: path,
              match: n => n.type === 'unordered-list' || n.type === 'ordered-list',
            });
          } else if (indentLevel === 1) {
            Transforms.unwrapNodes(editor, {
                at: path,
                match: n => n.type === 'unordered-list' || n.type === 'ordered-list',
              });
    
              // After unwrapping, we need to find the updated node path and convert it to a paragraph
              // We can use Editor.nodes to find the current list-item after the unwrap
              const [newBlockEntry] = Editor.nodes(editor, {
                match: n => SlateElement.isElement(n) && n.type === 'list-item',
                at: selection,  // Start at the current selection
                mode: 'lowest',
              });
    
              if (newBlockEntry) {
                const [, newPath] = newBlockEntry;
    
                // Now set the unwrapped list-item to be a paragraph
                Transforms.setNodes(editor, { type: 'paragraph' }, { at: newPath });
              }
          }
  
          return;  // Stop further processing since we handled the empty case
        }

        const listItemEntry = Editor.above(editor, {
          match: n => SlateElement.isElement(n) && n.type === 'list-item',
          at: selection,
          mode: 'lowest',
        });
        const [listItemNode, listItemPath] = listItemEntry;
  

        let nestingDepth = 0;
        let currentPath = listItemPath;
      
        while (true) {
          const parentEntry = Editor.parent(editor, currentPath);
          if (!parentEntry) break;
      
          const [parentNode, parentPath] = parentEntry;
          if (
            SlateElement.isElement(parentNode) &&
            //(parentNode.type === 'unordered-list' || parentNode.type === 'ordered-list')
            (parentNode.type === 'list-item')
          ) {
            nestingDepth++;
            currentPath = parentPath;
          } else {
            break;
          }
        }
      
        // Perform splitNodes with levels equal to the nesting depth plus one (for the list-item)
        Transforms.splitNodes(editor, {
          at: selection,
          match: n =>
            SlateElement.isElement(n) &&
            //(n.type === 'list-item' || n.type === 'unordered-list' || n.type === 'ordered-list'),
            (n.type === 'unordered-list' || n.type === 'ordered-list'),
          mode: 'lowest',
          always: true,
          levels: nestingDepth + 1,
        });

      }
    }
  }

 
  if (event.key === 'Tab' && !event.shiftKey) {
    event.preventDefault();

    selectedBlocks.forEach(([node, path]) => {
      const previousPath = Editor.before(editor, path, { unit: 'block' });
      if (previousPath) {
        const [previousNode] = Editor.node(editor, previousPath);
        
        if (previousNode && previousNode.type === 'list-item') {
          // Move the current block under the previous list item (increase indentation)
          Transforms.wrapNodes(editor, { type: 'unordered-list', children: [] }, { at: path });
          Transforms.moveNodes(editor, { to: [...previousPath, previousNode.children.length], at: path });
        } else {
          // If the previous block isn't a list item, convert the current block to a list item
          Transforms.setNodes(editor, { type: 'list-item' }, { at: path });
          Transforms.wrapNodes(editor, { type: 'unordered-list', children: [] }, { at: path });
        }
      } else {
        // If there's no previous block, just convert the current block to a list item
        Transforms.setNodes(editor, { type: 'list-item' }, { at: path });
        Transforms.wrapNodes(editor, { type: 'unordered-list', children: [] }, { at: path });
      }
    });
  }

  // Handle Shift+Tab key press (Unindent all selected blocks)
  if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault();
  
    selectedBlocks.forEach(([node, path]) => {
      if (node.type === 'list-item') {
        const parentList = Editor.above(editor, {
          at: path,
          match: n => n.type === 'unordered-list' || n.type === 'ordered-list',
        });
  
        // Step 1: Unwrap the list item from the parent unordered/ordered list
        if (parentList) {
          Transforms.unwrapNodes(editor, {
            at: path,
            match: n => n.type === 'unordered-list' || n.type === 'ordered-list',
          });
        }
  
        const [newParentNode, newParentPath] = Editor.parent(editor, path);
        if( newParentPath.length === 1){
            Transforms.setNodes(
                editor,
                { type: 'paragraph', children: [{ text: Node.string(newParentNode) }] },
                { at: newParentPath }
                );
            }

      }
    });
  }


  };

  // Toggle Bold Mark
  const toggleBoldMark = () => {
    const isActive = isMarkActive(editor, 'bold');
    Transforms.setNodes(
      editor,
      { bold: isActive ? null : true },
      { match: (n) => Text.isText(n), split: true }
    );
  };

  // Toggle Heading Block
  const toggleHeading = () => {
    const isActive = isBlockActive(editor, 'heading');
    Transforms.setNodes(
      editor,
      { type: isActive ? 'paragraph' : 'heading' },
      { match: (n) => Editor.isBlock(editor, n) }
    );
  };
  function saveChanges(e){
    const md = slateToMarkdown(value) 

    if(props.onChange){
        props.onChange( md )
    }
  }
  function handleFocus(){
    if(props.onFocus){
      props.onFocus()
    }

  }
  function handleBlur(){
    if(props.onBlur){
      props.onBlur()
    }
    saveChanges()

  }
  if( props.controlled === false){
    return (
      <Slate  editor={editor} initialValue={[]}>
        <Editable
          ref={slateRef}
            className={clsx([
              props.float ? "focus:outline-none" : "border",
              'max-h-[inherit] overflow-y-scroll p-1 w-full',
              props.className
            ])}
          renderElement={renderElement}
          renderLeaf={renderLeaf} 
        />
      </Slate>
  );        

  }
  
  return (
      <Slate  editor={editor} initialValue={value} onChange={(newValue) => setValue(newValue)}>
        <Editable
          ref={slateRef}
          readOnly={props.readOnly}
            className={clsx([
              props.float ? "focus:outline-none" : "border",
              'max-h-[inherit] overflow-y-scroll p-1 w-full',
              props.className
            ])}
          renderElement={renderElement}
          renderLeaf={renderLeaf} 
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          placeholder={props.placeholder}
        />
      </Slate>
  );
});

// Check if a mark (like bold) is active
const isMarkActive = (editor, format) => {
  const [match] = Editor.nodes(editor, {
    match: (n) => n[format] === true,
    mode: 'all',
  });
  return !!match;
};

// Check if a block (like heading) is active
const isBlockActive = (editor, format) => {
  const [match] = Editor.nodes(editor, {
    match: (n) => n.type === format,
  });
  return !!match;
};
export default MarkdownEditor
