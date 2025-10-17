import crypto from 'crypto';

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(',')}}`;
}

export function computeRepresentationHash(payload) {
  const serialized = stableStringify(payload);
  return crypto.createHash('sha1').update(serialized).digest('base64url').slice(0, 16);
}

export function cloneContent(content) {
  if (typeof structuredClone === 'function') {
    return structuredClone(content);
  }
  return JSON.parse(JSON.stringify(content ?? null));
}

export function flattenStructuredContent(structured) {
  const flat = [];
  const blocks = Array.isArray(structured) ? structured : [];
  blocks.forEach((block, blockIndex) => {
    (Array.isArray(block) ? block : []).forEach((section, sectionIndex) => {
      flat.push({
        block: blockIndex,
        index: sectionIndex,
        heading: section?.heading ?? null,
        content: section?.content ?? null,
        fontSize: section?.fontSize ?? null,
        fontStyle: section?.fontStyle ?? null,
        largeSpacing: Boolean(section?.largeSpacing),
        sectionStart: Boolean(section?.sectionStart),
      });
    });
  });
  return flat;
}

export function regroupStructuredContent(flatSections) {
  const grouped = [];
  for (const section of flatSections ?? []) {
    const blockIndex = Number(section.block) || 0;
    if (!Array.isArray(grouped[blockIndex])) {
      grouped[blockIndex] = [];
    }
    grouped[blockIndex].push({
      heading: section.heading ?? undefined,
      content: section.content ?? undefined,
      fontSize: section.fontSize ?? undefined,
      fontStyle: section.fontStyle ?? undefined,
      largeSpacing: Boolean(section.largeSpacing),
      sectionStart: Boolean(section.sectionStart),
    });
  }
  return grouped.map((block) => block.filter((section) => section.heading || section.content));
}

export function applyHeadingHeuristic(structured) {
  let changed = false;
  if (!Array.isArray(structured)) {
    return { changed, content: structured };
  }
  const next = structured.map((block = []) => {
    let run = [];
    const updatedBlock = [];
    const flush = () => {
      if (run.length > 1) {
        run.slice(1).forEach((section) => {
          const heading = section.heading ?? '';
          const content = section.content ?? '';
          const merged = content ? `${heading}: ${content}` : heading;
          section.heading = undefined;
          section.content = merged;
          section.sectionStart = Boolean(section.sectionStart);
          changed = true;
        });
      }
      run = [];
    };

    (Array.isArray(block) ? block : []).forEach((section) => {
      const heading = section?.heading?.trim();
      const content = typeof section?.content === 'string' ? section.content.trim() : '';
      const headingOnly = Boolean(heading) && !content;
      const clone = { ...section };
      if (headingOnly) {
        run.push(clone);
      } else {
        flush();
      }
      updatedBlock.push(clone);
    });
    flush();
    return updatedBlock;
  });
  return { changed, content: next };
}

