import { createRequire } from 'module';
import { Util } from 'konva/lib/Util';
import { renderPlainObject } from '../../ui/src/renderers/plainObjectRenderer.js';

const DEFAULT_FONT_SIZE = 16;

let CanvasClass;
try {
  const require = createRequire(import.meta.url);
  const skiaCanvas = require('skia-canvas');
  CanvasClass = skiaCanvas?.Canvas ?? null;
} catch (error) {
  CanvasClass = null;
}

function ensureCanvasEnvironment() {
  if (!CanvasClass) {
    return;
  }

  const createCanvas = () => {
    const canvas = new CanvasClass(1, 1);
    if (!canvas.style) {
      canvas.style = {};
    }
    return canvas;
  };

  Util.createCanvasElement = () => {
    const canvas = createCanvas();
    if (typeof canvas.getContext === 'function') {
      canvas.getContext('2d');
    }
    return canvas;
  };

  if (typeof Util.createImageElement !== 'function' || !Util.createImageElement.name.includes('bound')) {
    Util.createImageElement = () => {
      if (CanvasClass.Image) {
        const image = new CanvasClass.Image();
        if (!image.style) {
          image.style = {};
        }
        return image;
      }
      return createCanvas();
    };
  }

  if (typeof global.document === 'undefined') {
    global.document = {
      createElement: (tag) => {
        if (tag === 'canvas') {
          return createCanvas();
        }
        if (tag === 'img' && CanvasClass.Image) {
          const image = new CanvasClass.Image();
          if (!image.style) {
            image.style = {};
          }
          return image;
        }
        return { style: {} };
      },
    };
  }

  if (typeof global.window === 'undefined') {
    global.window = {
      devicePixelRatio: 1,
      document: global.document,
    };
  } else if (!global.window.document) {
    global.window.document = global.document;
  }
}

ensureCanvasEnvironment();

function resolvePadding(padding) {
  if (!padding) {
    return [0, 0, 0, 0];
  }
  if (Array.isArray(padding)) {
    if (padding.length === 4) {
      return padding.map((value) => Number(value) || 0);
    }
    if (padding.length === 2) {
      const [vertical, horizontal] = padding.map((value) => Number(value) || 0);
      return [vertical, horizontal, vertical, horizontal];
    }
    if (padding.length === 1) {
      const value = Number(padding[0]) || 0;
      return [value, value, value, value];
    }
  }
  if (typeof padding === 'string') {
    const parts = padding
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => !Number.isNaN(value));
    return resolvePadding(parts);
  }
  const coerced = Number(padding) || 0;
  return [coerced, coerced, coerced, coerced];
}

function normalizeOptions(content, options) {
  const width = Number(options.width ?? content.width ?? 0);
  const height = Number(options.height ?? content.height ?? 0);
  const padding = resolvePadding(options.padding ?? content.padding);
  const fontSize = Number(options.fontSize ?? content.fontSize ?? DEFAULT_FONT_SIZE) || DEFAULT_FONT_SIZE;
  const columns = Math.max(Number(options.columns ?? content.columns ?? 1) || 1, 1);

  return {
    width,
    height,
    padding,
    fontSize,
    columns,
    lineHeight: options.lineHeight ?? content.lineHeight,
    fontFamily: options.fontFamily ?? content.fontFamily,
    fontStyle: options.fontStyle ?? content.fontStyle,
    theme: options.theme ?? content.theme,
  };
}

function determineColumnIndex(node, renderSettings) {
  const { columns, padding, width, fontSize } = renderSettings;
  if (columns <= 1) {
    return 0;
  }
  const itemPadding = fontSize * 0.5;
  const usableWidth = width - padding[3] - padding[1];
  const textWidth = columns > 0 ? (usableWidth - ((itemPadding * columns) - 1)) / columns : usableWidth;
  const step = textWidth + itemPadding;
  const offset = (typeof node.x === 'function' ? node.x() : 0) - padding[3];
  if (!Number.isFinite(step) || step <= 0) {
    return 0;
  }
  const rawIndex = Math.round(offset / step);
  return Math.max(0, Math.min(columns - 1, rawIndex));
}

function collectTextNodes(group) {
  if (!group?.getChildren) {
    return [];
  }
  return group.getChildren((child) => {
    if (typeof child?.getClassName === 'function') {
      const className = child.getClassName();
      return className === 'Text' || className === 'Label';
    }
    return false;
  });
}

function measureFromRenderedGroup(group, renderSettings) {
  const textNodes = collectTextNodes(group);
  if (textNodes.length === 0) {
    return {
      usedHeight: 0,
      columnHeights: new Array(renderSettings.columns).fill(0),
    };
  }

  let maxBottom = 0;
  let minTop = Number.POSITIVE_INFINITY;
  const columnHeights = new Array(renderSettings.columns).fill(0);

  for (const node of textNodes) {
    const top = typeof node.y === 'function' ? node.y() : 0;
    const height = typeof node.height === 'function' ? node.height() : 0;
    const bottom = top + height;
    if (Number.isFinite(bottom)) {
      maxBottom = Math.max(maxBottom, bottom);
    }
    if (Number.isFinite(top)) {
      minTop = Math.min(minTop, top);
    }

    const columnIndex = determineColumnIndex(node, renderSettings);
    if (columnIndex >= 0 && columnIndex < columnHeights.length) {
      columnHeights[columnIndex] = Math.max(columnHeights[columnIndex], bottom);
    }
  }

  if (!Number.isFinite(minTop)) {
    minTop = 0;
  }

  return {
    usedHeight: maxBottom - Math.min(minTop, 0),
    columnHeights,
  };
}

export function measureContent(content, options = {}) {
  if (!content) {
    return {
      usedHeight: 0,
      allowedHeight: options.height ?? 0,
      overflow: false,
      columnHeights: [],
    };
  }

  const renderSettings = normalizeOptions(content, options);
  if (!renderSettings.width || !renderSettings.height) {
    return {
      usedHeight: 0,
      allowedHeight: renderSettings.height || 0,
      overflow: false,
      columnHeights: new Array(renderSettings.columns).fill(0),
    };
  }

  const renderPayload = {
    ...content,
    ...options,
    width: renderSettings.width,
    height: renderSettings.height,
    padding: renderSettings.padding,
    fontSize: renderSettings.fontSize,
    columns: renderSettings.columns,
    lineHeight: renderSettings.lineHeight,
    fontFamily: renderSettings.fontFamily,
    fontStyle: renderSettings.fontStyle,
    theme: renderSettings.theme,
  };

  let group;
  try {
    group = renderPlainObject(renderPayload);
  } catch (error) {
    return {
      usedHeight: 0,
      allowedHeight: renderSettings.height,
      overflow: false,
      columnHeights: new Array(renderSettings.columns).fill(0),
      error: error?.message,
    };
  }

  const measurement = measureFromRenderedGroup(group, renderSettings);
  const allowedHeight = renderSettings.height;
  const usedHeight = measurement.usedHeight;

  return {
    usedHeight,
    allowedHeight,
    overflow: usedHeight > allowedHeight || Boolean(group?.attrs?.overflowing),
    columnHeights: measurement.columnHeights,
  };
}
