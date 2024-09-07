import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { createEditor, Editor, Transforms, Text, Node, Element as SlateElement } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';


const markdownToSlate = (markdownContent) => {
    const lines = markdownContent.split('\n');
    const slateNodes = [];
    
    lines.forEach((line) => {
      const trimmedLine = line.trim();
  
      // Handle headers
      if (trimmedLine.startsWith('#')) {
        slateNodes.push({
          type: 'heading',
          children: [{ text: trimmedLine.replace(/^#+\s*/, '') }],
        });
        return;
      }
  
      // Handle ordered list items (e.g., "1. Item")
      const orderedListMatch = line.match(/^(\s*)(\d+\.)\s+(.*)/);
      if (orderedListMatch) {
        const indentLevel = Math.floor(orderedListMatch[1].length / 2); // Two spaces per indent level
        const content = parseMarkdownText(orderedListMatch[3]);
  
        slateNodes.push({
          type: 'ordered-list',
          children: [
            {
              type: 'list-item',
              indentLevel: indentLevel,
              children: content,
            }
          ]
        });
        return;
      }
  
      // Handle unordered list items (e.g., "- Item")
      const unorderedListMatch = line.match(/^(\s*)(-|\*)\s+(.*)/);
      if (unorderedListMatch) {
        const indentLevel = Math.floor(unorderedListMatch[1].length / 2); // Two spaces per indent level
        const content = parseMarkdownText(unorderedListMatch[3]);
        
        const wrappedContent = wrapInNestedLists('unordered-list', content, indentLevel);

        slateNodes.push(wrappedContent);
        return;
      }
  
      // Handle regular paragraphs
      if (trimmedLine) {
        slateNodes.push({
          type: 'paragraph',
          children: parseMarkdownText(trimmedLine),
        });
      }
    });
  
    return slateNodes;
  };

  const wrapInNestedLists = (listType, content, indentLevel) => {
    
    let wrappedContent = {
      type: 'list-item',
      children: content,
    };
  
    for (let i = 0; i < indentLevel; i++) {
      wrappedContent = {
        type: listType,
        children: [wrappedContent],
      };
    }
  
    return wrappedContent;
  };
  
  // Helper function to parse bold and regular text in Markdown
  const parseMarkdownText = (text) => {
    const regex = /(\*\*|__)(.*?)\1/g; // Regex to detect bold text
    const segments = [];
    let lastIndex = 0;
    let match;
  
    while ((match = regex.exec(text)) !== null) {
      // Push the non-bold text before the bold part
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index) });
      }
  
      // Push the bold text
      segments.push({ text: match[2], bold: true });
  
      // Update the last index to continue parsing
      lastIndex = regex.lastIndex;
    }
  
    // Push any remaining non-bold text
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex) });
    }
    if( segments.length === 0){
      segments.push({ text: "" });
    }
  
    return segments;
  };
  
  const slateToMarkdown = (slateContent, depth = 0) => {
    return slateContent.map((node) => {
      if (node.type === 'heading') {
        return `# ${Node.string(node)}`;
      } else if (node.type === 'list-item') {
        const indent = '  '.repeat(depth); // Two spaces per indentation level
  
        // Determine if it's part of an ordered list or unordered list
        const listPrefix = node.ordered ? `${depth + 1}.` : '-';
  
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
      // Process initialMarkdown to convert it to Slate format
      return markdownToSlate(initialMarkdown);  // Assuming markdownToSlate is implemented
    } else {
      // Return an empty paragraph node if no initialMarkdown is provided
      return [{ type: 'paragraph', children: [{ text: '' }] }];
    }

  }

export function MarkdownEditor({ initialMarkdown, ...props }){
  const editor = useMemo(() => withHistory(withReact(createEditor())), []);

  

  const [value, setValue] = useState(() => convertInitialValue( initialMarkdown));

  useEffect(()=>{
    editor.children = convertInitialValue( initialMarkdown)
    editor.onChange();
  },[initialMarkdown])


  // Render the editor elements
  const renderElement = useCallback((props) => {
     const { element, attributes, children } = props;
    switch (props.element.type) {
      case 'heading':
        return <h2 {...props.attributes}>{props.children}</h2>;
    case 'unordered-list':
        return <ul {...attributes} className="pl-6 list-disc">{children}</ul>;
        case 'ordered-list':
        return <ol {...attributes} className="pl-6 list-decimal">{children}</ol>;
        case 'list-item':
        return <li {...attributes}>{children}</li>;
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
    //ReactEditor.focus(editor);
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
        console.log( newParentPath)
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

  return (
    <div>
      <Slate editor={editor} initialValue={value} onChange={(newValue) => setValue(newValue)}>
        <Editable
            style={{ minHeight: '160px'}}
            className='p-1 border rounded-sm'
          renderElement={renderElement}
          renderLeaf={renderLeaf} 
          onBlur={saveChanges}
          onKeyDown={handleKeyDown}
          placeholder={props.placeholder}
        />
      </Slate>
    </div>
  );
};

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
