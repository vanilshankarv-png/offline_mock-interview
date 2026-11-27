import { describe, expect, test } from '@jest/globals';
import { calculateScores, countLongPauses, scoreWithNlp } from '../src/services/scoring.service.js';

async function mockScore(signals) {
  const calls = [];
  const client = { post: async (url, payload) => {
    calls.push({ url, payload });
    return url.endsWith('fuzzy-correct')
      ? { data: { corrected: payload.transcript } }
      : { data: signals };
  } };
  const answer = await scoreWithNlp({ transcript: 'candidate answer', expectedKeywords: ['stack'], durationSec: 40,
    chunk: { text: 'A stack is a last in first out structure.' }, questionType: 'definition', language: 'en', confidence: 0.9, client });
  const scores = calculateScores({ ...answer.evaluation, durationSec: 40, questionType: 'definition', confidence: 0.9, longPauseCount: 0 });
  return { ...answer, scores, calls };
}

describe('deterministic answer scoring', () => {
  test('counts word-level pause gaps from speech timestamps', () => {
    expect(countLongPauses([
      { start: 0, end: 0.3, text: 'I' },
      { start: 0.5, end: 0.8, text: 'think' },
      { start: 2.6, end: 3, text: 'therefore' },
      { start: 3.2, end: 3.5, text: 'yes' },
    ])).toBe(1);
  });

  test('identical NLP signals produce identical scores and call correction before evaluation', async () => {
    const signals = { keywordCoverage: 0.8, semanticSimilarity: 0.7, completeness: 0.67, wpm: 130, fillersPerMin: 1, fillerBreakdown: {}, matchedKeywords: ['stack'], missedKeywords: [] };
    const first = await mockScore(signals);
    const second = await mockScore(signals);
    expect(first.scores).toEqual(second.scores);
    expect(first.calls.map((call) => call.url)).toEqual(['/nlp/fuzzy-correct', '/nlp/evaluate']);
    expect(first.calls[1].payload.transcript).toBe('candidate answer');
  });

  test('a complete answer with strong delivery scores above 80', async () => {
    const result = await mockScore({ keywordCoverage: 1, semanticSimilarity: 1, completeness: 1, wpm: 130,
      fillersPerMin: 0, fillerBreakdown: {}, matchedKeywords: ['stack'], missedKeywords: [] });
    expect(result.scores.finalScore).toBeGreaterThan(80);
  });

  test('an unrelated answer with weak signals scores below 40', async () => {
    const result = await mockScore({ keywordCoverage: 0, semanticSimilarity: 0, completeness: 0, wpm: 30,
      fillersPerMin: 12, fillerBreakdown: { um: 8 }, matchedKeywords: [], missedKeywords: ['stack'] });
    expect(result.scores.finalScore).toBeLessThan(40);
  });
});
