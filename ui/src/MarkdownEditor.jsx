import React, { useMemo, useState, useCallback, useEffect, forwardRef } from 'react';
import { createEditor, Editor, Transforms, Text, Node, Element as SlateElement, Path } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';

/*
const markdownToSlate = (markdownContent) => {
    const lines = markdownContent.split('\n');
    const slateNodes = [];

    let currentTable = null; // Keep track of the current table
    let isInTable = false;
    
    lines.forEach((line) => {
      const trimmedLine = line.trim();


      if (trimmedLine.includes('|')) {
        let columns = trimmedLine.split('|').map((col) => col.trim()).slice(1, -1)
  
        // Check if this is a header separator (---)
        const isHeaderSeparator = columns.every(col => /^-+$/.test(col));
  
        if (isHeaderSeparator) {
          if (currentTable && currentTable.children.length > 0) {
            currentTable.children[0].isHeader = true; // Mark the first row as a header
          }
          return; // Skip this line
        }
  
        const row = {
          type: 'table-row',
          children: columns.map(col => ({
            type: 'table-cell',
            children: [{ text: col }],
          })),
        };
  
        // If we're already in a table, append the row
        if (isInTable) {
          currentTable.children.push(row);
        } else {
          // Otherwise, create a new table and start it
          currentTable = {
            type: 'table',
            children: [row],
          };
          slateNodes.push(currentTable);
          isInTable = true;
        }
        return;
      }else{
        isInTable = false
      }
  
      // Handle headers
      if (trimmedLine.startsWith('#')) {
        const headingMatch = trimmedLine.match(/^(#+)\s*(.*)/);
  
        if (headingMatch) {
            const headingLevel = headingMatch[1].length; 
            const headingText = headingMatch[2]; 

            // Ensure the heading level is between 1 and 6 (HTML heading levels)
            const validHeadingLevel = Math.min(Math.max(headingLevel, 1), 6);

            slateNodes.push({
              type: 'heading',
              level: validHeadingLevel,  // Add the heading level to the node
              children: [{ text: headingText }],
            });
        }
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
      }else {
        // Handle blank lines by adding an empty paragraph node
        slateNodes.push({
          type: 'paragraph',
          children: [{ text: '' }],
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
  */

  const markdownToSlate = (markdownContent) => {
    const lines = markdownContent.split('\n');
    const slateNodes = [];
  
    let currentTable = null; // Keep track of the current table
    let isInTable = false;
  
    lines.forEach((line) => {
      const trimmedLine = line.trim();
  
      if (trimmedLine.includes('|')) {
        let columns = trimmedLine
          .split('|')
          .map((col) => col.trim())
          .slice(1, -1); // Remove the first and last empty elements due to leading and trailing '|'
  
        // Check if this is a header separator (---)
        const isHeaderSeparator = columns.every((col) => /^-+$/.test(col));
  
        if (isHeaderSeparator) {
          if (currentTable && currentTable.children.length > 0) {
            currentTable.children[0].isHeader = true; // Mark the first row as a header
          }
          return; // Skip this line
        }
  
        const row = {
          type: 'table-row',
          children: columns.map((col) => ({
            type: 'table-cell',
            children: parseMarkdownText(col), // Parse cell content for formatting
          })),
        };
  
        // If we're already in a table, append the row
        if (isInTable) {
          currentTable.children.push(row);
        } else {
          // Otherwise, create a new table and start it
          currentTable = {
            type: 'table',
            children: [row],
          };
          slateNodes.push(currentTable);
          isInTable = true;
        }
        return;
      } else {
        isInTable = false;
      }
  
      // Handle headers
      if (trimmedLine.startsWith('#')) {
        const headingMatch = trimmedLine.match(/^(#+)\s*(.*)/);
  
        if (headingMatch) {
          const headingLevel = headingMatch[1].length;
          const headingText = headingMatch[2];
  
          // Ensure the heading level is between 1 and 6 (HTML heading levels)
          const validHeadingLevel = Math.min(Math.max(headingLevel, 1), 6);
  
          slateNodes.push({
            type: 'heading',
            level: validHeadingLevel, // Add the heading level to the node
            children: parseMarkdownInline(headingText),
          });
        }
        return;
      }
  
      // Handle ordered list items (e.g., "1. Item")
      const orderedListMatch = line.match(/^(\s*)(\d+\.)\s+(.*)/);
      if (orderedListMatch) {
        const indentLevel = Math.floor(orderedListMatch[1].length / 2); // Two spaces per indent level
        const content = parseMarkdownInline(orderedListMatch[3]);
  
        slateNodes.push({
          type: 'ordered-list',
          children: [
            {
              type: 'list-item',
              indentLevel: indentLevel,
              children: content,
            },
          ],
        });
        return;
      }
  
      // Handle unordered list items (e.g., "- Item")
      const unorderedListMatch = line.match(/^(\s*)(-|\*)\s+(.*)/);
      if (unorderedListMatch) {
        const indentLevel = Math.floor(unorderedListMatch[1].length / 2); // Two spaces per indent level
        const content = parseMarkdownInline(unorderedListMatch[3]);
  
        const wrappedContent = wrapInNestedLists('unordered-list', content, indentLevel);
  
        slateNodes.push(wrappedContent);
        return;
      }
  
      // Handle regular paragraphs
      if (trimmedLine) {
        slateNodes.push({
          type: 'paragraph',
          children: parseMarkdownInline(trimmedLine),
        });
      } else {
        // Handle blank lines by adding an empty paragraph node
        slateNodes.push({
          type: 'paragraph',
          children: [{ text: '' }],
        });
      }
    });
    console.log(slateNodes)
  
    return slateNodes;
  };
  
  const parseMarkdownText = (text) => {
    const lines = text.split('\n');
    const nodes = [];
  
    lines.forEach((line) => {
      const trimmedLine = line.trim();
  
      // Handle headers
      if (trimmedLine.startsWith('#')) {
        const headingMatch = trimmedLine.match(/^(#+)\s*(.*)/);
  
        if (headingMatch) {
          const headingLevel = headingMatch[1].length;
          const headingText = headingMatch[2];
  
          // Ensure the heading level is between 1 and 6 (HTML heading levels)
          const validHeadingLevel = Math.min(Math.max(headingLevel, 1), 6);
  
          nodes.push({
            type: 'heading',
            level: validHeadingLevel, // Add the heading level to the node
            children: parseMarkdownInline(headingText),
          });
        }
        return;
      }
  
      // Handle ordered list items (e.g., "1. Item")
      const orderedListMatch = line.match(/^(\s*)(\d+\.)\s+(.*)/);
      if (orderedListMatch) {
        const indentLevel = Math.floor(orderedListMatch[1].length / 2); // Two spaces per indent level
        const content = parseMarkdownInline(orderedListMatch[3]);
  
        nodes.push({
          type: 'ordered-list',
          children: [
            {
              type: 'list-item',
              indentLevel: indentLevel,
              children: content,
            },
          ],
        });
        return;
      }
  
      // Handle unordered list items (e.g., "- Item")
      const unorderedListMatch = line.match(/^(\s*)(-|\*)\s+(.*)/);
      if (unorderedListMatch) {
        const indentLevel = Math.floor(unorderedListMatch[1].length / 2); // Two spaces per indent level
        const content = parseMarkdownInline(unorderedListMatch[3]);
  
        const wrappedContent = wrapInNestedLists('unordered-list', content, indentLevel);
  
        nodes.push(wrappedContent);
        return;
      }
  
      // Handle paragraphs
      if (trimmedLine) {
        nodes.push({
          type: 'paragraph',
          children: parseMarkdownInline(trimmedLine),
        });
      } else {
        // Handle blank lines by adding an empty paragraph node
        nodes.push({
          type: 'paragraph',
          children: [{ text: '' }],
        });
      }
    });
    
  
    return nodes;
  };
  
  const parseMarkdownInline = (text) => {
    const tokens = [];
    let i = 0;
  
    while (i < text.length) {
      if (text.startsWith('**', i)) {
        // Bold text
        const endIndex = text.indexOf('**', i + 2);
        if (endIndex !== -1) {
          tokens.push({
            text: text.substring(i + 2, endIndex),
            bold: true,
          });
          i = endIndex + 2;
        } else {
          // No matching closing **
          tokens.push({ text: text.substring(i) });
          break;
        }
      } else if (text.startsWith('*', i)) {
        // Italic text
        const endIndex = text.indexOf('*', i + 1);
        if (endIndex !== -1) {
          tokens.push({
            text: text.substring(i + 1, endIndex),
            italic: true,
          });
          i = endIndex + 1;
        } else {
          // No matching closing *
          tokens.push({ text: text.substring(i) });
          break;
        }
      } else if (text.startsWith('__', i)) {
        // Bold text
        const endIndex = text.indexOf('__', i + 2);
        if (endIndex !== -1) {
          tokens.push({
            text: text.substring(i + 2, endIndex),
            bold: true,
          });
          i = endIndex + 2;
        } else {
          // No matching closing __
          tokens.push({ text: text.substring(i) });
          break;
        }
      } else if (text.startsWith('_', i)) {
        // Italic text
        const endIndex = text.indexOf('_', i + 1);
        if (endIndex !== -1) {
          tokens.push({
            text: text.substring(i + 1, endIndex),
            italic: true,
          });
          i = endIndex + 1;
        } else {
          // No matching closing _
          tokens.push({ text: text.substring(i) });
          break;
        }
      } else if (text.startsWith('`', i)) {
        // Code
        const endIndex = text.indexOf('`', i + 1);
        if (endIndex !== -1) {
          tokens.push({
            text: text.substring(i + 1, endIndex),
            code: true,
          });
          i = endIndex + 1;
        } else {
          // No matching closing `
          tokens.push({ text: text.substring(i) });
          break;
        }
      } else {
        // Plain text
        let nextSpecialIndex = text.length;
        const specialChars = ['*', '_', '`'];
        specialChars.forEach((char) => {
          const index = text.indexOf(char, i);
          if (index !== -1 && index < nextSpecialIndex) {
            nextSpecialIndex = index;
          }
        });
        tokens.push({
          text: text.substring(i, nextSpecialIndex),
        });
        i = nextSpecialIndex;
      }
    }
    if( tokens.length === 0){
          tokens.push({ text: "" });

    }
  
    return tokens;
  };
  
  const wrapInNestedLists = (listType, content, indentLevel) => {
    let wrappedContent = {
      type: 'list-item',
      children: content,
    };
    
  
    for (let i = 0; i < (indentLevel ?? 1); i++) {
      wrappedContent = {
        type: listType,
        children: [wrappedContent],
      };
    }
  
    return wrappedContent;
  };
  
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

//  export function MarkdownEditor({ initialMarkdown, ...props }){
const MarkdownEditor = forwardRef(function MarkdownEditor({ initialMarkdown, ...props }, ref){
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
            return <h2 className={`font-bold text-${props.element.level ?? 2}xl my-3`} {...props.attributes}>{props.children}</h2>;
        case 'unordered-list':
            return <ul {...attributes} className="pl-6 list-disc">{children}</ul>;
        case 'ordered-list':
            return <ol {...attributes} className="pl-6 list-decimal">{children}</ol>;
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
            (parentNode.type === 'unordered-list' || parentNode.type === 'ordered-list')
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
            (n.type === 'list-item' || n.type === 'unordered-list' || n.type === 'ordered-list'),
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
  return (
    <div>
      <Slate  editor={editor} initialValue={value} onChange={(newValue) => setValue(newValue)}>
        <Editable
          ref={ref}
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
