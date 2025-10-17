import { measureContent } from './textMetrics.js';
import {
  applyHeadingHeuristic,
  cloneContent,
  computeRepresentationHash,
  flattenStructuredContent,
  regroupStructuredContent,
  stableStringify,
} from './utils.js';
import { runRewritePass } from './llm.js';

const DEFAULT_MAX_ITERATIONS = 3;

function ensureNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildMeasurementOptions(content, renderOptions = {}) {
  const width = ensureNumber(renderOptions.width ?? content.width, undefined);
  const height = ensureNumber(renderOptions.height ?? content.height, undefined);
  if (!width || !height) {
    throw new Error('renderOptions.width and renderOptions.height are required for measurement');
  }
  return {
    width,
    height,
    padding: renderOptions.padding ?? content.padding,
    fontSize: renderOptions.fontSize ?? content.fontSize,
    fontFamily: renderOptions.fontFamily ?? content.fontFamily,
    fontStyle: renderOptions.fontStyle ?? content.fontStyle,
    lineHeight: renderOptions.lineHeight ?? content.lineHeight,
    columns: renderOptions.columns ?? content.columns,
  };
}

function computeReduction(usedHeight, allowedHeight) {
  if (!allowedHeight || usedHeight <= allowedHeight) {
    return 0;
  }
  const overflow = usedHeight - allowedHeight;
  const ratio = overflow / usedHeight;
  const percent = Math.round(ratio * 100);
  return Math.max(5, Math.min(percent, 60));
}

function normalizeForLLM(content) {
  if (content.type === 'structured_text') {
    return flattenStructuredContent(content.text);
  }
  const textValue = Array.isArray(content.text) ? content.text.join('\n') : content.text ?? '';
  return [
    {
      block: 0,
      heading: null,
      content: textValue,
      fontSize: content.fontSize ?? null,
      fontStyle: content.fontStyle ?? null,
      largeSpacing: false,
      sectionStart: true,
    },
  ];
}

function applyRewrite(content, sections) {
  if (content.type === 'structured_text') {
    const regrouped = regroupStructuredContent(sections);
    return {
      ...content,
      text: regrouped,
    };
  }
  const merged = sections?.[0]?.content ?? '';
  return {
    ...content,
    text: merged,
  };
}

function resultHashPayload(content, renderOptions, themeOverrides) {
  return {
    content,
    renderOptions,
    themeOverrides,
  };
}

export async function runRepresentationPass(payload = {}) {
  const { content, renderOptions = {}, themeOverrides, previousHash, maxIterations, engine, timeoutMs } = payload;
  if (!content) {
    throw new Error('content is required');
  }

  const sourceHash = computeRepresentationHash(resultHashPayload(content, renderOptions, themeOverrides));
  if (previousHash && previousHash === sourceHash) {
    return {
      sourceHash,
      resultHash: sourceHash,
      unchanged: true,
      content,
      steps: [],
      iterations: 0,
      overflow: false,
    };
  }

  let workingContent = cloneContent(content);
  const steps = [];
  let headingAdjusted = false;
  if (workingContent.type === 'structured_text') {
    const heuristic = applyHeadingHeuristic(workingContent.text);
    if (heuristic.changed) {
      headingAdjusted = true;
      workingContent = {
        ...workingContent,
        text: heuristic.content,
      };
    }
  }

  const measurementOptions = buildMeasurementOptions(workingContent, renderOptions);
  if (themeOverrides || renderOptions.theme || workingContent.theme) {
    measurementOptions.theme = themeOverrides ?? renderOptions.theme ?? workingContent.theme;
  }
  const iterationLimit = Math.max(1, ensureNumber(maxIterations, DEFAULT_MAX_ITERATIONS));
  let lastMeasurement = null;
  let lastRewriteSignature = null;

  for (let iteration = 0; iteration < iterationLimit; iteration += 1) {
    lastMeasurement = measureContent(workingContent, measurementOptions);
    steps.push({
      type: 'measurement',
      iteration,
      usedHeight: lastMeasurement.usedHeight,
      allowedHeight: lastMeasurement.allowedHeight,
      overflow: lastMeasurement.overflow,
      columnHeights: lastMeasurement.columnHeights,
    });

    if (!lastMeasurement.overflow) {
      break;
    }

    const targetReduction = computeReduction(lastMeasurement.usedHeight, lastMeasurement.allowedHeight);
    const mode = iteration === 0 ? 'dedupe' : 'compress';
    const llmInput = normalizeForLLM(workingContent);
    const signature = stableStringify(llmInput);
    if (signature === lastRewriteSignature) {
      steps.push({ type: 'rewrite', iteration, skipped: true, reason: 'unchanged_input' });
      break;
    }

    const llmResult = await runRewritePass(llmInput, {
      mode,
      targetReduction,
      engine,
      timeoutMs,
    });

    if (!llmResult.success) {
      steps.push({
        type: 'rewrite',
        iteration,
        mode,
        targetReduction,
        error: llmResult.error,
      });
      break;
    }

    const updatedContent = applyRewrite(workingContent, llmResult.sections);
    if (workingContent.type === 'structured_text') {
      const heuristic = applyHeadingHeuristic(updatedContent.text);
      workingContent = {
        ...updatedContent,
        text: heuristic.content,
      };
      headingAdjusted = headingAdjusted || heuristic.changed;
    } else {
      workingContent = updatedContent;
    }

    steps.push({
      type: 'rewrite',
      iteration,
      mode,
      targetReduction,
      sections: llmResult.sections.length,
    });

    lastRewriteSignature = signature;
  }

  if (!lastMeasurement) {
    lastMeasurement = measureContent(workingContent, measurementOptions);
  }

  const resultHash = computeRepresentationHash(resultHashPayload(workingContent, renderOptions, themeOverrides));

  return {
    sourceHash,
    resultHash,
    unchanged: false,
    content: workingContent,
    steps,
    iterations: steps.filter((step) => step.type === 'rewrite').length,
    overflow: Boolean(lastMeasurement?.overflow),
    appliedHeadingHeuristic: headingAdjusted,
    metrics: lastMeasurement,
  };
}

