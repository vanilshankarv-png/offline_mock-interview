import { afterEach, describe, expect, jest, test } from '@jest/globals';
import PhraseBank from '../src/models/PhraseBank.js';
import { clearPhraseCache, pick } from '../src/services/phrase.service.js';

describe('phrase bank selection', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    clearPhraseCache();
  });

  test('avoids reusing variants in a session until they are exhausted', async () => {
    const phrases = ['one', 'two', 'three', 'four', 'five', 'six'];
    jest.spyOn(PhraseBank, 'find').mockReturnValue({ lean: async () => [{ category: 'openers', phrases: { standard: phrases } }] });
    const sessionState = {};
    const selected = [];
    for (let index = 0; index < phrases.length; index += 1) selected.push(await pick('openers', 'standard', sessionState));
    expect(new Set(selected).size).toBe(6);
    const next = await pick('openers', 'standard', sessionState);
    expect(phrases).toContain(next);
  });
});
