import { rewritePresentationSections } from '../openai_helper.js';

export async function runRewritePass(flatSections, options = {}) {
  const response = await rewritePresentationSections(flatSections, options);
  if (!response.success) {
    return { success: false, error: response.error, raw: response.raw };
  }
  return { success: true, sections: response.sections };
}

