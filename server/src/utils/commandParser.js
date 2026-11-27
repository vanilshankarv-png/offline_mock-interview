import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const spec = JSON.parse(readFileSync(new URL('./commandParser.spec.json', import.meta.url), 'utf8'));

export const COMMAND_SPEC = Object.freeze(spec);

function normalize(value) {
  return value.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const previous = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = previous;
    }
  }
  return row[right.length];
}

export function parseCommand(utterance) {
  const normalized = normalize(utterance);
  const wordCount = normalized ? normalized.split(' ').length : 0;
  if (!wordCount || wordCount > COMMAND_SPEC.maxWords) return { isCommand: false, command: null, matchedPhrase: null };
  let best = null;
  for (const [command, phrases] of Object.entries(COMMAND_SPEC.commands)) {
    for (const phrase of phrases) {
      const candidate = normalize(phrase);
      const similarity = 1 - editDistance(normalized, candidate) / Math.max(normalized.length, candidate.length, 1);
      if (similarity >= COMMAND_SPEC.similarityThreshold && (!best || similarity > best.similarity)) {
        best = { command, matchedPhrase: phrase, similarity };
      }
    }
  }
  return best
    ? { isCommand: true, command: best.command, matchedPhrase: best.matchedPhrase }
    : { isCommand: false, command: null, matchedPhrase: null };
}

export default parseCommand;
