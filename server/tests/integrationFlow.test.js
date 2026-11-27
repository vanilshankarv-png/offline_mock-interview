import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import Answer from '../src/models/Answer.js';
import ChatMessage from '../src/models/ChatMessage.js';
import ChatSession from '../src/models/ChatSession.js';
import Chunk from '../src/models/Chunk.js';
import NoteSet from '../src/models/NoteSet.js';
import Question from '../src/models/Question.js';
import Session from '../src/models/Session.js';
import User from '../src/models/User.js';
import nlpClient from '../src/services/nlpClient.js';

const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userEmail = `flow-${unique}@example.com`;
const adminEmail = `flow-admin-${unique}@example.com`;
let admin;
let userId;
let noteId;
let sessionId;
let uploadedChunkId;
let postSpy;

beforeAll(async () => {
  await connectDatabase();
  const passwordHash = await bcrypt.hash('FlowAdmin123', 12);
  admin = await User.create({ name: 'Flow Admin', email: adminEmail, passwordHash, role: 'admin' });
  postSpy = jest.spyOn(nlpClient, 'post').mockImplementation(async (url, body) => {
    if (url === '/nlp/ingest') return { data: [{ topic: 'Java Basics', text: 'A Java class is a blueprint for objects. For example, a Student class stores learner data. Classes help organize reusable behavior.', keywords: ['class', 'object'], definitions: ['A Java class is a blueprint for objects.'], embedding: [1, 0] }] };
    if (url === '/nlp/questions') {
      uploadedChunkId = body.chunks[0].id;
      return { data: [{ chunkId: uploadedChunkId, topic: 'Java Basics', type: 'definition', text: 'What is a Java class?', expectedKeywords: ['class', 'object'], difficulty: 'easy' }] };
    }
    if (url === '/nlp/fuzzy-correct') return { data: { corrected: body.transcript, replacements: [] } };
    if (url === '/nlp/evaluate') return { data: { keywordCoverage: 1, semanticSimilarity: 0.9, completeness: 1, wpm: 130,
      fillerCount: 0, fillersPerMin: 0, fillerBreakdown: {}, weakPhraseCount: 0, matchedKeywords: ['class', 'object'], missedKeywords: [] } };
    if (url === '/nlp/rewrite-feedback') return { data: { text: 'A rewritten coaching answer.', finalScore: 0 } };
    if (url === '/nlp/followup') return { data: { followup: null, enabled: false } };
    if (url === '/nlp/chat') return { data: { answer: 'A Java class is a blueprint for objects.',
      sources: [{ noteSetId: body.chunks[0].noteSetId, chunkId: body.chunks[0].id, title: body.chunks[0].title }], confidence: 0.9 } };
    throw new Error(`Unexpected NLP endpoint: ${url}`);
  });
});

afterAll(async () => {
  postSpy?.mockRestore();
  if (noteId) {
    await Promise.all([Chunk.deleteMany({ noteSetId: noteId }), Question.deleteMany({ noteSetId: noteId }), NoteSet.deleteOne({ _id: noteId })]);
  }
  if (sessionId) {
    await Promise.all([Answer.deleteMany({ sessionId }), Session.deleteOne({ _id: sessionId })]);
  }
  await ChatMessage.deleteMany({ userId: userId || admin?._id });
  await ChatSession.deleteMany({ userId: userId || admin?._id });
  await User.deleteMany({ _id: { $in: [admin?._id, userId].filter(Boolean) } });
  await mongoose.disconnect();
});

describe('backend integration flow with the NLP client mocked', () => {
  test('registers, uploads a note, practices, chats, and enforces admin RBAC', async () => {
    const registered = await request(app).post('/api/v1/auth/register').send({ name: 'Flow User', email: userEmail, password: 'FlowUser123' });
    expect(registered.status).toBe(201);
    userId = registered.body.data.user.id;
    const userToken = registered.body.data.accessToken;
    const adminLogin = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: 'FlowAdmin123' });
    const adminToken = adminLogin.body.data.accessToken;

    const noteText = '# Java Basics\n\nA class is a blueprint for objects. For example, a Student class stores learner data.';
    const upload = await request(app).post('/api/v1/admin/notes/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', 'Java Basics')
      .field('language', 'en')
      .field('level', 'beginner')
      .field('isPublished', 'true')
      .attach('file', Buffer.from(noteText), { filename: 'java-basics.md', contentType: 'text/markdown' });
    expect(upload.status).toBe(201);
    noteId = upload.body.data.note._id;

    const started = await request(app).post('/api/v1/sessions').set('Authorization', `Bearer ${userToken}`).send({
      noteSetIds: [noteId], style: 'standard', mode: 'practice', language: 'en', questionCount: 5,
    });
    expect(started.status).toBe(201);
    sessionId = started.body.data.sessionId;
    const next = await request(app).get(`/api/v1/sessions/${sessionId}/next-question`).set('Authorization', `Bearer ${userToken}`);
    expect(next.status).toBe(200);
    expect(next.body.data.type).toBe('definition');

    const answer = await request(app).post(`/api/v1/sessions/${sessionId}/answers`).set('Authorization', `Bearer ${userToken}`).send({
      questionId: next.body.data.questionId,
      transcript: 'A class is a blueprint for objects. For example, a Student class stores learner data and helps organize behavior.',
      durationSec: 35,
      confidence: 0.9,
      longPauseCount: 0,
    });
    expect(answer.status).toBe(200);
    expect(answer.body.data.scores.finalScore).toBe(98);
    const finished = await request(app).post(`/api/v1/sessions/${sessionId}/finish`).set('Authorization', `Bearer ${userToken}`);
    expect(finished.status).toBe(200);
    const report = await request(app).get(`/api/v1/sessions/${sessionId}/report`).set('Authorization', `Bearer ${userToken}`);
    expect(report.status).toBe(200);
    expect(report.body.data.answers).toHaveLength(1);

    const chat = await request(app).post('/api/v1/chat').set('Authorization', `Bearer ${userToken}`).send({ message: 'What is a Java class?' });
    expect(chat.status).toBe(200);
    expect(chat.body.data.sources[0].noteSetId).toBe(noteId);

    const forbiddenStats = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${userToken}`);
    expect(forbiddenStats.status).toBe(403);
    const adminStats = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(adminStats.status).toBe(200);
    expect(adminStats.body.data.totalUsers).toBeGreaterThanOrEqual(2);
    expect(postSpy).toHaveBeenCalled();
  });
});
