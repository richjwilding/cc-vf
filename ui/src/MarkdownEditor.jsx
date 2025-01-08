import React, { useMemo, useState, useCallback, useEffect, forwardRef } from 'react';
import { createEditor, Editor, Transforms, Text, Node, Element as SlateElement, Path } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { markdownToSlate } from './SharedTransforms';

  
  
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
      return markdownToSlate(initialMarkdown);  
    } else {
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
        console.log(newParentNode)
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
