import { describe, expect, test } from '@jest/globals';
import { selectNextQuestion } from '../src/services/session.service.js';

const questionSet = [
  { _id: 'q-def', type: 'definition', topic: 'Arrays', difficulty: 'easy' },
  { _id: 'q-example', type: 'example', topic: 'Arrays', difficulty: 'medium' },
  { _id: 'q-why', type: 'why', topic: 'Hashing', difficulty: 'medium' },
  { _id: 'q-scenario', type: 'scenario', topic: 'Hashing', difficulty: 'hard' },
  { _id: 'q-compare', type: 'compare', topic: 'Trees', difficulty: 'hard' },
];

describe('session question selection', () => {
  test('does not repeat questions asked in this or recent sessions', () => {
    const next = selectNextQuestion({ questions: questionSet, askedQuestionIds: ['q-def'], recentQuestionIds: ['q-example'], index: 1, random: () => 0 });
    expect(next._id).toBe('q-why');
  });

  test('uses varied question types and moves from definitions to examples then scenarios', () => {
    const askedQuestionIds = [];
    const questionTypes = [];
    const selected = [];
    for (let index = 0; index < 5; index += 1) {
      const next = selectNextQuestion({ questions: questionSet, askedQuestionIds, questionTypes, index, random: () => 0 });
      expect(next).toBeTruthy();
      selected.push(next);
      askedQuestionIds.push(next._id);
      questionTypes.push(next.type);
    }
    expect(selected[0].type).toBe('definition');
    expect(['example', 'why']).toContain(selected[1].type);
    expect(['scenario', 'compare']).toContain(selected[3].type);
    expect(new Set(questionTypes).size).toBeGreaterThanOrEqual(3);
    expect(new Set(askedQuestionIds).size).toBe(askedQuestionIds.length);
  });

  test('weights weaker topics above stronger topics when sampling', () => {
    const candidates = [
      { _id: 'weak', type: 'definition', topic: 'Weak' },
      { _id: 'strong', type: 'definition', topic: 'Strong' },
    ];
    const selected = selectNextQuestion({ questions: candidates, index: 0,
      progressStats: [{ topic: 'Weak', avgScore: 0.1 }, { topic: 'Strong', avgScore: 0.95 }], random: () => 0.7 });
    expect(selected._id).toBe('weak');
  });
});
