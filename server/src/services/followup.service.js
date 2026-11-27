function normalize(values = []) {
  return new Set(values.map((value) => String(value).trim().toLowerCase()));
}

/** Builds no more than the remaining per-question follow-up allowance. */
export function buildFollowups({ transcript = '', expectedKeywords = [], matchedKeywords = [], hasExample = false,
  style = 'standard', followupsUsed = 0 } = {}) {
  const limit = style === 'strict' ? 2 : 1;
  const remaining = Math.max(0, limit - followupsUsed);
  if (!remaining) return [];
  const missed = expectedKeywords.filter((keyword) => !normalize(matchedKeywords).has(String(keyword).toLowerCase()));
  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const prompts = [];
  if (wordCount < 12) prompts.push('Can you give an example?');
  else if (missed.length) prompts.push(`What can you tell me about ${missed[0]}?`);
  else if (!hasExample) prompts.push('Can you give an example?');
  if (style === 'strict' && prompts.length < remaining && missed.length && prompts[0] !== `What can you tell me about ${missed[0]}?`) {
    prompts.push(`Define ${missed[0]}.`);
  }
  return prompts.slice(0, remaining);
}

export { normalize as normalizeKeywords };
