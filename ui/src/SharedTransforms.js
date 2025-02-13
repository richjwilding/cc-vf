
export function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}
export function roundCurrency(number){
    if(number === 0){
        return "$0"
    }
    if( isNaN(number)){
        return "-"
    }
    let prefix = "$"
    if( number < 0){
        prefix = "-$"
        number = -number
    }

    return prefix + formatNumber(number)
}
export function getBaseDomain(hostname) {
  let parts = hostname.split('.');
  if (parts.length > 2) {
      return parts.slice(-2).join('.'); // Keeps only "example.com" or "site.com"
  }
  return hostname; // If no subdomain, return as is
}

export function cleanURL(url){
   // Trim whitespace from the input
   let cleanedUrl = url.trim();

   // Check if the URL has a protocol, if not, add "https://"
   if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleanedUrl)) {
       cleanedUrl = "https://" + cleanedUrl;
   }

   return cleanedUrl;
}
export function baseURL(url) {
  // Clean the URL first
  const cleanedUrl = cleanURL(url);

  // Use URL constructor to parse and extract the base URL
  try {
      const parsedUrl = new URL(cleanedUrl);
      // Combine protocol and hostname
      return `${parsedUrl.protocol}//${parsedUrl.hostname}`;
  } catch (error) {
      throw new Error("Invalid URL");
  }
}

export function formatNumber(number){
    if(number === 0){
        return "0"
    }
    if( isNaN(number)){
        return "-"
    }
    const suffixes = ["", "K", "M","B","T"];
    const suffixIndex = Math.floor(Math.log10(Math.abs(number)) / 3);

    const scaledNumber = number / Math.pow(10, suffixIndex * 3);
    let formattedNumber = scaledNumber.toFixed( suffixIndex > 1 ? 1 : 2);
    formattedNumber = formattedNumber.replace(/\.0+$/, '');

    return formattedNumber.replace(/\.00$/, '') + (suffixes[suffixIndex] ?? "");
}
  export function markdownToSlate(markdownContent){
    const lines = (markdownContent ?? "").split('\n');
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
        //const indentLevel = Math.floor(orderedListMatch[1].length / 2); // Two spaces per indent level
        const indentLevel = Math.max(1, Math.floor(orderedListMatch[1].length / 2)); // Two spaces per indent level
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
        const indentLevel = Math.max(1, Math.floor(unorderedListMatch[1].length / 2)); // Two spaces per indent level
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
  
    return slateNodes;
  };
  export function parseMarkdownText(text){
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
  
  export function parseMarkdownInline(text){
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
  
  export function wrapInNestedLists(listType, content, indentLevel){
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

export function convertOrganizationFinancialData( primitive, analysisTables, sections){
    let overall = ""
    let tables = 0
    sections = [sections].flat()

    for(const section of sections){
        let data = primitive.financialData?.[section]
        if( !data || Object.keys(data).length === 0){
            continue
        }
        const sectionInfo = analysisTables[section]

        let out = ""
        let validRows = 0
        if( sectionInfo.sourceType === "list"){
            const rows = Object.keys(data)
            for(const rowName of rows){
                if( data[rowName]){
                    out += "|" + (sectionInfo.rows?.[rowName] ?? rowName)+ "|" + data[rowName] + "|\n"
                    validRows++
                }
            }
        }else{
            if( Array.isArray(data)){
                data = data.reduce((a,c)=>{
                    a[c.Breakdown] = c.value
                    return a
                }, {})
            }
            let rows = Object.keys(data)
            if(sectionInfo.skipMissing && sectionInfo.rows){
                rows = rows.filter(d=>sectionInfo.rows[d])  
            }
            if( sectionInfo.rows){
                const order = Object.keys(sectionInfo.rows)
                rows = rows.sort((a,b)=>order.indexOf(a) - order.indexOf(b))
            }
            
            let cols
            let showHeader = true
            for(const rowName of rows){
                let row = data[rowName]
                if( row ){
                    const rowConfig = sectionInfo.rows?.[rowName] ?? {title: rowName}
                    
                    if(rowConfig.skip){continue}

                    if(!Array.isArray(row) ){
                        row = Object.keys(row).map(d=>({column_name: sectionInfo.rows?.[2] ?? d, value: row[d]}))
                        showHeader = false
                    }
                    if(!cols){
                        cols = row.map(d=>d.column_name)
                        if( sectionInfo.columns?.order){
                            if( sectionInfo.columns?.order === "TTM_QTRS"){
                                let qtrs = cols.filter(d=>d !== "TTM")
                                let sorted = qtrs.sort((a,b)=>new Date(b) - new Date(a))
                                cols = ["TTM", ...sorted]
                            }
                        }
                        out = (showHeader ? "||" : "|") + cols.join("|") + "|\n"
                    }

                    let name = typeof(rowConfig) === "string" ? rowConfig : rowConfig.title


                    out += showHeader ? `|${name}|` : "|"
                    out += cols.map(c=>{
                        let v = row.find(d=>d.column_name === c)?.value ?? "" 
                        if( rowConfig.format === "currency"){
                            let asFloat = parseFloat(v)
                            if( !isNaN(asFloat) ){
                                if( sectionInfo.columns?.order === "TTM_QTRS"){
                                    if( c !== "TTM"){
                                        asFloat *= 1000
                                    }
                                }
                                v = " " + roundCurrency( asFloat)
                            }
                        }else if( rowConfig.format === "number"){
                            const asFloat = parseFloat(v)
                            if( !isNaN(asFloat) ){
                                v = " " + formatNumber( asFloat)
                            }
                        }
                        return v
                    }).join("|") + "|\n"
                    validRows += row.find(d=>d.value && d.value.trim() != "-" ) ? 1 : 0
                }else{
                    if( cols ){
                        out += "|" + cols.map(c=>"-").join("|") + "|\n"
                    }
                }
            }
        }
        if( validRows ){
            if(tables > 0){
                overall += "\n"
            }
            let title = sectionInfo.title ?? section
            overall += title + "\n" + "-".repeat(title.length) + "\n"
            overall += out
            tables ++ 
        }

    }
    return overall
}