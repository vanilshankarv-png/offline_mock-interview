import { describe, expect, test } from '@jest/globals';
import User from '../src/models/User.js';
import Chunk from '../src/models/Chunk.js';
import Session from '../src/models/Session.js';
import ProgressStat from '../src/models/ProgressStat.js';
import ChatMessage from '../src/models/ChatMessage.js';

function hasIndex(model, fields) {
  return model.schema.indexes().some(([keys]) => JSON.stringify(keys) === JSON.stringify(fields));
}

describe('required query indexes', () => {
  test('declares the key lookups used by auth, note retrieval, progress, and chat', () => {
    expect(hasIndex(User, { email: 1 })).toBe(true);
    expect(hasIndex(Chunk, { noteSetId: 1 })).toBe(true);
    expect(hasIndex(Session, { userId: 1, startedAt: -1 })).toBe(true);
    expect(hasIndex(ProgressStat, { userId: 1, topic: 1 })).toBe(true);
    expect(hasIndex(ChatMessage, { userId: 1, createdAt: -1 })).toBe(true);
  });
});
