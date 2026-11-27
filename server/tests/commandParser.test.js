import { describe, expect, test } from '@jest/globals';
import { parseCommand } from '../src/utils/commandParser.js';

describe('voice command parser', () => {
  test('does not treat ordinary technical speech as a command', () => {
    expect(parseCommand('I would skip the index and use a hash').isCommand).toBe(false);
  });

  test('accepts short command phrases and fuzzy matches', () => {
    expect(parseCommand('say that again')).toMatchObject({ isCommand: true, command: 'repeat' });
    expect(parseCommand('say that agin')).toMatchObject({ isCommand: true, command: 'repeat' });
  });

  test('rejects a command phrase embedded in a longer utterance', () => {
    expect(parseCommand('please skip this question for me').isCommand).toBe(false);
  });
});
