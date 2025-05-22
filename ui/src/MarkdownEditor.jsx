import React, { useMemo, useState, useCallback, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { createEditor, Editor, Transforms, Text, Node, Element as SlateElement, Path } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { markdownToSlate } from './SharedTransforms';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import MainStore from './MainStore';
import { ArrowRightCircleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { Logo } from './logo';
import { Stage } from 'react-konva';
import { RenderPrimitiveAsKonva } from './RenderHelpers';
import { KonvaPrimitive } from './KonvaPrimitive';
import { VisualizationPreview } from './VisualizationPreview';

  

function MarkdownBadge({ badgeType }) {

  function runningBadge(title){
    return <div className="animate-border inline-flex  animate-border bg-[length:400%_400%] bg-gradient-to-r bg-white from-green-500 inline-block to-blue-500 via-purple-500 p-[1px] rounded-full">
      <span className="bg-slate-50 inline-flex  pl-1 pr-2 py-0.5 text-slate-700 rounded-full place-items-center text-sm">
        <Logo active={true} className='bg-gray-100 h-4 w-4 rounded-full animate-ripple-color mr-1'/>
        {title}
        </span>
    </div>
  }

  switch (badgeType) {
    case 'agent_running':
      return runningBadge("Running...")
    // add more cases for different badges…
    default:
      if(badgeType.startsWith("update:")){
        badgeType = badgeType.slice(7)
        return runningBadge(badgeType.trim())
      }
      if(badgeType.startsWith("id:")){
        const ids = badgeType.slice(3).split(",")
        const mainstore = MainStore()
        return ids.map(d=>{
          const p = mainstore.primitive(d.trim())
          if( p ){
            return  <span 
              className="bg-gray-200 border hover:bg-gray-300 hover:border-gray-400 inline-flex items-center justify-center p-0.5 rounded-full text-gray-600 hover:text-gray-800" 
              onClick={()=>mainstore.sidebarSelect(p)}
              >
            <ArrowRightIcon className='w-3'/>
          </span>
          }
          return <></>
        })
      }
      if(badgeType.startsWith("ref:")){
        const ids = badgeType.slice(4).split(",")
        const mainstore = MainStore()
        return ids.map(d=>{
          const p = mainstore.primitive(d.trim())
          console.log(p)
          if( p ){
            return <KonvaPrimitive primitive={p}/>
          }
          return <></>
        })
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
        const indent = '  '.repeat(depth); // Two spaces per indentation level
  
        // Determine if it's part of an ordered list or unordered list
        const index = slateContent.findIndex(n => n === node);
        const listPrefix = node.ordered ? `${index + 1}.` : '-';
  
        // Handle any child text (e.g., bold text)
        const content = node.children.map((child) => {
          if (child.bold) {
            return `**${child.text}**`;
          }
          return child.text;
        }).join('');
  
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
const MarkdownEditor = forwardRef(function MarkdownEditor({ initialMarkdown, ...props }, ref){
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);
  const slateRef = useRef()

  

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

  useImperativeHandle(ref, ()=>{
    return {
      copyToClipboard,
      empty:()=>isEditorEmpty( editor ),
      focus:()=>slateRef.current.focus(),
      clear:()=>{
        const d = convertInitialValue( "")
        editor.children = d
        editor.onChange();
        Transforms.select(editor, { path: [0, 0], offset: 0 });
      },
      appendMessages: (newMsgs = [], update) => {
        const wasAtTop = slateRef.current && (slateRef.current.scrollTop + slateRef.current.clientHeight) === slateRef.current.scrollHeight;
        const nodes = convertInitialValue(newMsgs)
        let done = false
        if( update ){
          const endIndex = editor.children.length - 1
          if (endIndex >= 0 ){
            Transforms.removeNodes(editor, { at: [endIndex] });
            Transforms.insertNodes(editor, nodes, { at: [endIndex] });
            done = true
          }
        }
        if( !done ){
          Transforms.insertNodes(editor, nodes, { at: [editor.children.length] })
        }
        // insert at the end of the document
        if (props.scrollToEnd && wasAtTop) {
          // you can hook into your scroll‐to‐bottom logic here
          setTimeout(() => {
            slateRef.current.scrollTop = slateRef.current.scrollHeight;
          }, 50)
        }
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
            {element.data.map(d=><VisualizationPreview {...d} size="small" />)}
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
                <MarkdownBadge badgeType={element.badgeType} />
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

        /*
        // Non-empty list-item logic (handle as before)
        // Find the top-level block that contains the list (go up one level beyond the parent list)
        const grandParentBlock = Editor.above(editor, {
          match: n => SlateElement.isElement(n),
          at: parentPath,
        });
  
        // Find the path to insert the new node after the parent list (outside of it)
        const insertPath = grandParentBlock ? Path.next(grandParentBlock[1]) : Path.next(parentPath);
  
        // Insert a new list after the current list (outside of the list structure)
        Transforms.insertNodes(
          editor,
          {
            type: parentNode.type,  // Keep the same type (unordered-list or ordered-list)
            children: [
              {
                type: 'list-item',
                children: [{ text: '' }],
              },
            ],
          },
          { at: insertPath }
        );
  
        // Set the selection to the newly created list-item in the new list
        Transforms.select(editor, Editor.end(editor, insertPath));
  
        // Now, let's handle the indentation level (mirroring the current one)
        const indentLevel = Editor.path(editor, path).length - 2;
  
        // If the current list item is indented, we need to create nested list-item nodes
        if (indentLevel > 0) {
          for (let i = 0; i < indentLevel; i++) {
            Transforms.wrapNodes(
              editor,
              {
                type: parentNode.type,  // Wrap in the same type of list (unordered/ordered)
                children: [],
              },
              { at: insertPath }
            );
          }
        }*/
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
              'max-h-[inherit] overflow-y-scroll p-1 w-full'
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
            className={clsx([
              props.float ? "focus:outline-none" : "border",
              'max-h-[inherit] overflow-y-scroll p-1 w-full'
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
