
export function getRegisteredDomain(url) {
  try{

    const hostname = new URL(url).hostname;
    return getBaseDomain( hostname )
  }catch(e){
    return undefined 
  }
}
export function extractHashtags(str = "") {
  const hashtags = [];
  // Match: any spaces/commas/semicolons before the #tag, then the #tag, then any after
  const cleaned = str.replace(/[\s,;]*#(\w+)[\s,;]*/g, (match, tag) => {
    hashtags.push('#' + tag);
    return ' ';        // replace the whole match with a single space
  })
  // collapse multiple spaces into one, then trim ends
  .replace(/\s{2,}/g, ' ')
  .trim();

  return { text: cleaned, hashtags };
}

export function pickAtRandom(input, count) {
  const out = [];
  const used = new Set();
  const n = input.length;

  count = Math.min(count, n);

  while (out.length < count && used.size < n) {
    const idx = Math.floor(Math.random() * n);
    if (!used.has(idx)) {
      used.add(idx);
      out.push(input[idx]);
    }
  }
  return out;
}
export function isObjectId(id){
  return /^[0-9a-fA-F]{24}$/.test(id);
}
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
  const parts = hostname.split('.');
  const len = parts.length;

  // Common second-level labels under country TLDs:
  const SLD = new Set(['co','com','net','org','gov','edu','ac','mil','sch']);

  // If it ends in e.g. “.co.uk” (2-letter country + known SLD), grab last 3 parts:
  if (len >= 3 
      && parts[len-1].length === 2 
      && SLD.has(parts[len-2].toLowerCase())
  ) {
    return parts.slice(-3).join('.');
  }

  // Otherwise just take last 2 parts:
  return parts.slice(-2).join('.');
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
export function expandStringLiterals(text, literals = {}){
  const matches = text.match(/\{([^}]+)\}/g).map(d=>d.slice(1,-1)).filter((d,i,a)=>a.indexOf(d)===i);
  for(const fm of matches){
    let [m,mod] = fm.split("_")
    let item = literals[m]
    if( typeof(item) === "object" && item.data){
      item = item.data
    }
    let textItem = item
    if( Array.isArray(item)){
      const oArray = []
      for(const d of item){
        if( typeof(d)==="object"){
          if( d.type === "summary"){
            oArray.push( d.referenceParameters?.summary ?? "")
          }else{
            oArray.push( d.title ?? "")
          }
        }else{
          oArray.push( d )
        }
      }
      if( mod === "count"){
        textItem = oArray.length
      }else{
        textItem = oArray.join(". ")
      }
    }
    text = text.replaceAll(`{${fm}}`, textItem ?? "")
  }
  return text

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
export function markdownToSlate(markdownContent = "") {
  const lines = markdownContent.split(/\r?\n/);
  const slateNodes = [];

  // For nested lists:
  const listStack = []; // { node, indent, type }

  // For tables:
  let currentTable = null;
  let postTableText 
  let isInTable    = false;

  const flushLists = () => {
    listStack.length = 0;
  };

  const appendTop = (node) => {
    if (listStack.length) {
      listStack[listStack.length - 1].node.children.push(node);
    } else {
      slateNodes.push(node);
    }
  };
  let rowBuffer = ""
  let rowPipeCount = 0
  let nextRowBuffer = ""
  let nextPipeCount = 0

  let lineCount = lines.length
  for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
    let raw = lines[lineNumber] ?? ""
    if( isInTable ){
      if( (rowPipeCount >0 ||raw[0] === "|") && rowPipeCount < currentTable.expectedPipeCount ){
        let cols = raw.split("|")
        const isHeaderSep = cols.length > 1 && cols.slice(1, -1).every(c => /^-+$/.test(c));
        if( !isHeaderSep ){
          const pipes = cols.length  - 1
          if( rowPipeCount > 1 && raw.startsWith("|")){
            nextRowBuffer = raw
            nextPipeCount = pipes
            raw = rowBuffer 
            if( raw.at(-1) !== "|"){
              raw += "|"
            }
            if( lineNumber === (lineCount - 1)){
              lineCount++
            }
          }else{
            rowBuffer += (rowBuffer !== "" ? "\n" : "") + raw
            //rowBuffer += raw
            rowPipeCount += pipes
            if(rowPipeCount == currentTable.expectedPipeCount ){
              nextRowBuffer = ""
              nextPipeCount = 0
              raw = rowBuffer 
            }else if( lineNumber === (lineCount - 1)){
              raw = rowBuffer 
              if( raw.at(-1) !== "|"){
                raw += "|"
              }
            }else{
              continue
            }
          }
        }
      }
    }
    const line    = raw.replace(/\r$/, "");
    let trimmed = line.trim();

    // 1) Continuation of last <li>?
    const cont = raw.match(/^(\s+)(\S.*)/);
    if (cont && listStack.length) {
      const [, , text] = cont;
      if (!/^(\d+\.)\s|^[-*]\s/.test(text)) {
        const topList  = listStack[listStack.length - 1].node;
        const lastItem = topList.children[topList.children.length - 1];
        lastItem.children.push({ text: "\n" });
        parseInlineWithBadges(text).forEach(tok => lastItem.children.push(tok));
        continue;
      }
    }

    // 2) Table rows
    if (trimmed.includes("|")) {
      // break out of any open lists
      flushLists();

      if( isInTable ){
        if( trimmed.at(-1) !== "|" && rowPipeCount === currentTable.expectedPipeCount){
          const pos = trimmed.lastIndexOf("|")
          postTableText = trimmed.slice(pos + 1)
          trimmed = trimmed.slice(0, pos + 1)
        }
      }

      // split out the cells
      let cols = trimmed.split("|").map(c => c.trim()).slice(1, -1);

      // header-separator row?
      const isHeaderSep = cols.every(c => /^-+$/.test(c));
      if (isHeaderSep) {
        if (currentTable && currentTable.children.length) {
          currentTable.children[0].isHeader = true;
          rowBuffer = nextRowBuffer
          rowPipeCount = nextPipeCount
        }
        continue;
      }

      // build the row
      const row = {
        type: "table-row",
        children: cols.map(c => {
          
          return {
            type: "table-cell",
            children: [{type: "paragraph", children:parseInlineWithBadges(c)}],
          }
        }),
      };

      if (isInTable) {
        currentTable.children.push(row);
        rowPipeCount = nextPipeCount
        rowBuffer = nextRowBuffer
      } else {
        currentTable = { type: "table", children: [row] };
        slateNodes.push(currentTable);
        isInTable = true;
          currentTable.expectedPipeCount = row.children.length + 1;
          rowBuffer = nextRowBuffer
          rowPipeCount = nextPipeCount
      }
      continue;
    } else {
      isInTable = false;
      if( postTableText ){
        slateNodes.push({
          type: "paragraph",
          children: parseInlineWithBadges(postTableText),
        });
        postTableText = undefined
      }
    }

    // 3) Headings
    const h = trimmed.match(/^(#+)\s+(.*)$/);
    if (h) {
      flushLists();
      const level = Math.min(Math.max(h[1].length, 1), 6);
      slateNodes.push({
        type: "heading",
        level,
        children: parseInlineWithBadges(h[2]),
      });
      continue;
    }

    // 4) Lists
    const mOrdered   = raw.match(/^(\s*)(\d+\.)\s+(.*)$/);
    const mUnordered = !mOrdered && raw.match(/^(\s*)([-*])\s+(.*)$/);
    if (mOrdered || mUnordered) {
      const [, indentSpaces, marker, rest] = mOrdered || mUnordered;
      const indentCount = indentSpaces.length;
      const isOrdered   = !!mOrdered;
      const listType    = isOrdered ? "ordered-list" : "unordered-list";
      const itemContent = parseInlineWithBadges(rest);
      const wrappedItem = {
        type: "list-item",
        children: [
          { type: "paragraph", children: itemContent }
        ]
      };

      // capture explicit start if “3.” etc.
      const explicitStart = isOrdered
        ? parseInt(marker.slice(0, -1), 10)
        : undefined;

      // a) deeper indent → nested list under last <li>
      if (
        listStack.length &&
        indentCount > listStack[listStack.length - 1].indent
      ) {
        const parentList = listStack[listStack.length - 1].node;
        const parentItem = parentList.children[parentList.children.length - 1];
        const nestedList = { type: listType, children: [] };
        if (isOrdered && explicitStart > 1) nestedList.start = explicitStart;
        parentItem.children.push(nestedList);
        listStack.push({ node: nestedList, indent: indentCount, type: listType });
        //nestedList.children.push({ type: "list-item", children: itemContent });
        nestedList.children.push( wrappedItem )
        continue;
      }

      // b) pop deeper/mismatched
      while (listStack.length) {
        const top = listStack[listStack.length - 1];
        if (
          top.indent > indentCount ||
          (top.indent === indentCount && top.type !== listType)
        ) {
          listStack.pop();
        } else {
          break;
        }
      }

      // c) same list container → append
      if (
        listStack.length &&
        listStack[listStack.length - 1].indent === indentCount &&
        listStack[listStack.length - 1].type === listType
      ) {
        const existing = listStack[listStack.length - 1].node;
        //existing.children.push({ type: "list-item", children: itemContent });
        existing.children.push( wrappedItem )
        continue;
      }

      // d) new list container
      const newList = { type: listType, children: [] };
      if (isOrdered && explicitStart > 1) newList.start = explicitStart;
      appendTop(newList);
      listStack.push({ node: newList, indent: indentCount, type: listType });
      newList.children.push( wrappedItem )
      //newList.children.push({ type: "list-item", children: itemContent });
      continue;
    }

    // 5) Paragraph / blank
    flushLists();
    if (trimmed) {
      slateNodes.push({
        type: "paragraph",
        children: parseInlineWithBadges(trimmed),
      });
    } else {
      slateNodes.push({
        type: "paragraph",
        children: [{ text: "" }],
      });
    }
  }

      if( postTableText ){
        slateNodes.push({
          type: "paragraph",
          children: parseInlineWithBadges(postTableText),
        });
      }

  // ensure at least one node
  return slateNodes.length
    ? slateNodes
    : [{ type: "paragraph", children: [{ text: "" }] }];
}

  
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
            children: parseInlineWithBadges(headingText),
          });
        }
        return;
      }
  
      // Handle ordered list items (e.g., "1. Item")
      const orderedListMatch = line.match(/^(\s*)(\d+\.)\s+(.*)/);
      if (orderedListMatch) {
        const indentLevel = Math.floor(orderedListMatch[1].length / 2); // Two spaces per indent level
        const content = parseInlineWithBadges(orderedListMatch[3]);
  
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
        const content = parseInlineWithBadges(unorderedListMatch[3]);
  
        const wrappedContent = wrapInNestedLists('unordered-list', content, indentLevel);
  
        nodes.push(wrappedContent);
        return;
      }
  
      // Handle paragraphs
      if (trimmedLine) {
        nodes.push({
          type: 'paragraph',
          children: parseInlineWithBadges(trimmedLine),
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

function parseInlineWithBadges(text) {
    const RE = /(\[\[([^\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    const parts = [];
    let lastIndex = 0;
    let m;
  
    while ((m = RE.exec(text)) !== null) {
      const [fullMatch, , badgeType, linkLabel, linkUrl] = m;
      if (m.index > lastIndex) {
        parts.push(...parseMarkdownInline(text.slice(lastIndex, m.index)));
      }
      if (badgeType) {
        const isRef = badgeType.startsWith('ref:');

        if (isRef) {
          parts.push({ type: 'line-break', children: [{ text: '' }] });
        }
        parts.push({
          type: 'badge',
          badgeType,
          children: [{ text: '' }],
        });
      }
      else if (linkLabel && linkUrl) {
        parts.push({
          type: 'link',
          url: linkUrl,
          children: parseMarkdownInline(linkLabel),
        });
      }
      lastIndex = m.index + fullMatch.length;
    }
  
    if (lastIndex < text.length) {
      parts.push(...parseMarkdownInline(text.slice(lastIndex)));
    }
  

   const final = [];
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i];
      if (chunk.text && chunk.text.includes('\n')) {
        const segments = chunk.text.split('\n');
        segments.forEach((seg, idx) => {
          if (seg) final.push({ type:"paragraph", ...chunk, text: seg });
        });
      } else {
        final.push(chunk);
      }
    }
  
    return final.length ? final : [{ text: '' }];

}
  
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
      /*} else if (text.startsWith('__', i)) {
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
        }*/
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
        //const specialChars = ['*', '_', '`'];
        const specialChars = ['*', '`'];
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

export function cartesianProduct(arrays) {
  return arrays.reduce((acc, curr) => {
    const result = [];
    for (const combo of acc) {
      for (const item of curr) {
        result.push([...combo, item]);
      }
    }
    return result;
  }, [[]]); 
}

export function compareTwoStrings(first, second) {
    //https://github.com/aceakash/string-similarity#readme
    
  first = first?.replace(/\s+/g, '') ?? ""
  second = second?.replace(/\s+/g, '') ?? ""

  if (first === second) return 1; // identical or empty
  if (first.length < 2 || second.length < 2) return 0; // if either is a 0-letter or 1-letter string

  let firstBigrams = new Map();
  for (let i = 0; i < first.length - 1; i++) {
    const bigram = first.substring(i, i + 2);
    const count = firstBigrams.has(bigram)
      ? firstBigrams.get(bigram) + 1
      : 1;

    firstBigrams.set(bigram, count);
  };

  let intersectionSize = 0;
  for (let i = 0; i < second.length - 1; i++) {
    const bigram = second.substring(i, i + 2);
    const count = firstBigrams.has(bigram)
      ? firstBigrams.get(bigram)
      : 0;

    if (count > 0) {
      firstBigrams.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  return (2.0 * intersectionSize) / (first.length + second.length - 2);
}


export function deepEqualIgnoreOrder(a, b) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== typeof b) return false;
  
    // Array-as-set comparison
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) return false;
      const setA = new Set(a);
      const setB = new Set(b);
      if (setA.size !== setB.size) return false;
      for (const x of setA) {
        if (!setB.has(x)) return false;
      }
      return true;
    }
  
    // Object comparison
    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const key of keysA) {
        if (!(key in b) || !deepEqualIgnoreOrder(a[key], b[key])) {
          return false;
        }
      }
      return true;
    }
  
    return false;
  }
  export function findFilterMatches(arr,target){
    const testArr = arr.map(d=>{
      const {title, ...toKeep} = d
      return toKeep
    })
    const testTarget = Object.fromEntries( Object.entries(target ?? {}).filter(d=>d[1]) )
    return findMatches(testArr, testTarget)
  }
  
  function findMatches(arr, target) {
    if( !arr ){
      return []
    }
    return arr.find(item => deepEqualIgnoreOrder(item, target));
  }
export function modiftyEntries(obj, entry, callback) {

    if( !callback || !obj){
        return obj
    }
    // Check if the object has a 'heading' key and delete it
    if (obj.hasOwnProperty(entry)) {
        const result = callback( obj )
        obj[entry] = result
    }
    
    // Loop through each key-value pair in the object
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            if (Array.isArray(obj[key])) {
                // If the value is an array, loop through its items
                obj[key].forEach(item => {
                if (typeof item === 'object') {
                    modiftyEntries(item, entry, callback)
                }
                });
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                // If the value is an object, recurse into it
                modiftyEntries(obj[key], entry, callback)
            }
        }
    }
    return obj
 }
export function convertVisualizationToPrimitiveConfig({source, title, layout, filters, x_axis, y_axis, palette, metadata} ){
    let columnAxis = convertVisualizationAxis( x_axis, metadata)
    let rowAxis = convertVisualizationAxis( y_axis, metadata)
    let viewFilters = filters ? [...filters] : []
    let displayType = "default"
    
    switch( layout ){
        case "pie":
        case "bar":
        case "timeline": 
            displayType = "subchart"
            break
    }
    const renderConfigurationIdx = metadata.renderConfig.explore.configs.findIndex(d=>d.builtIn === "subchart")
    const palette_name = palette?.palette_name

    const selectPalette = palette_name ? {
        "green": "green",
        "red": "heat",
        "heat": "heat",
        "scale": "default",
        "ice": "ice_blue"
          }[palette_name.toLowerCase()]  : undefined

    const renderConfig = {
        style: layout,
        colors: selectPalette ?? "default",
        order: "high_to_low"
    }
    
    const axis = [
        columnAxis,
        rowAxis
    ].filter(d=>d.type !== "none")
    const slices = axis.shift()
    

    if( layout === "pie" || layout === "bar"){
        if( slices ){
            viewFilters.unshift(slices)
            columnAxis = axis[0] ??  {type: "none", filter: []}
            rowAxis = axis[1] ??  {type: "none", filter: []}
        }
    }

    const referenceParameters = {
                                    "target": "items",
                                    "referenceId": metadata.id,
                                    "descend": true,
                                    "explore": {
                                        "view": renderConfigurationIdx,
                                        "axis":{
                                          "column": columnAxis,
                                          "row": rowAxis,
                                        },
                                        "filterTrack": 1,
                                    }
                                }
    if( viewFilters.length > 0){
        const filters = viewFilters.map((d,i)=>{
            return {
                filterTrack: i,
                ...d
            }
        })
        referenceParameters.explore.filters = filters
        referenceParameters.explore.filterTrack = filters.length
    }

    console.log( renderConfig )
    console.log( referenceParameters )
    return {renderConfig, referenceParameters}

}

function mapParameter( def ){
  if( !def ){
    return "title"
  }
    const field = def.field ?? def.parameter
    if( field === "title"){
      return field
    }
    return `params.${field}`
}

function convertVisualizationAxis(def){
  
    let axis = {type: "none", filter: []}
    if( def ){
        const field = def.field ?? def.parameter ?? def.category
        if( def.category_prompt ){
          axis = {
            type: "category",
            toPrepare:{
              prompt: def.category_prompt,
              number: def.number ?? 8,
              parameter: mapParameter(field)
            }
          }

        }else if( def.type === "category" || isObjectId(field) ){
            axis = {
                type: "category", 
                primitiveId: field
            }
        }else{
            if( def.operator === "sum" || def.operator === "count"){

            }else{
                axis = {
                    type: "parameter", 
                    parameter: mapParameter(field),
                }
                if( def.values ?? def.value){
                    axis.invert = true
                    axis.filter = def.values ?? def.value
                }
            }
        }
    }
    return axis
}