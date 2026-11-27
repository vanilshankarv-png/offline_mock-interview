import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import ChatMessage from '../src/models/ChatMessage.js';
import ChatSession from '../src/models/ChatSession.js';
import Chunk from '../src/models/Chunk.js';
import NoteSet from '../src/models/NoteSet.js';
import { connectDatabase } from '../src/config/database.js';
import { loadAllowedChunks, sendChat } from '../src/services/chat.service.js';

const userA = new mongoose.Types.ObjectId();
const userB = new mongoose.Types.ObjectId();
let ownNote;
let privateNote;
let ownChunk;

beforeAll(async () => {
  await connectDatabase();
  ownNote = await NoteSet.create({ ownerId: userA, title: 'Stacks', language: 'en' });
  privateNote = await NoteSet.create({ ownerId: userB, title: 'Private Graph Notes', language: 'en' });
  ownChunk = await Chunk.create({ noteSetId: ownNote._id, topic: 'Stacks', text: 'A stack is a last in, first out data structure.', embedding: [1, 0] });
  await Chunk.create({ noteSetId: privateNote._id, topic: 'Graphs', text: 'Private material about graph traversal.', embedding: [0, 1] });
});

afterAll(async () => {
  await ChatMessage.deleteMany({ userId: userA });
  await ChatSession.deleteMany({ userId: userA });
  await Chunk.deleteMany({ noteSetId: { $in: [ownNote._id, privateNote._id] } });
  await NoteSet.deleteMany({ _id: { $in: [ownNote._id, privateNote._id] } });
  await mongoose.disconnect();
});

describe('notes-grounded chat access', () => {
  test('answers from a known note and returns that note as a source', async () => {
    let receivedChunks = [];
    const result = await sendChat({ user: { _id: userA }, message: 'What is a stack?', client: {
      post: async (_path, body) => {
        receivedChunks = body.chunks;
        return { data: { answer: receivedChunks[0].text, sources: [{ noteSetId: receivedChunks[0].noteSetId,
          chunkId: receivedChunks[0].id, title: receivedChunks[0].title }], confidence: 0.84 } };
      },
    } });
    expect(receivedChunks.map((chunk) => chunk.id)).toContain(String(ownChunk._id));
    expect(receivedChunks.some((chunk) => chunk.noteSetId === String(privateNote._id))).toBe(false);
    expect(result.sources[0]).toMatchObject({ noteSetId: String(ownNote._id), chunkId: String(ownChunk._id), title: 'Stacks' });
    expect(result.flagged).toBe(false);
  });

  test('flags an out-of-scope answer when NLP confidence is low', async () => {
    const result = await sendChat({ user: { _id: userA }, message: 'Tell me about ocean tides.', client: {
      post: async () => ({ data: { answer: 'Possible answer.', sources: [], confidence: 0.2 } }),
    } });
    expect(result.flagged).toBe(true);
    expect(result.answer).toContain('I couldn\'t find that in your notes');
    const saved = await ChatMessage.findById(result.assistantMessageId).lean();
    expect(saved.flagged).toBe(true);
  });

  test('never includes another users private chunks in the retrieval request', async () => {
    const chunks = await loadAllowedChunks(userA);
    expect(chunks.map((chunk) => chunk.id)).toContain(String(ownChunk._id));
    expect(chunks.some((chunk) => chunk.noteSetId === String(privateNote._id))).toBe(false);
  });
});
