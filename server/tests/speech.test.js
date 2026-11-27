import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, test, jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import User from '../src/models/User.js';
import nlpClient from '../src/services/nlpClient.js';

const email = `speech-${Date.now()}@example.com`;
let user;
let token;

beforeAll(async () => {
  await connectDatabase();
  const passwordHash = await bcrypt.hash('SpeechUser123', 12);
  user = await User.create({ name: 'Speech User', email, passwordHash, role: 'user' });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'SpeechUser123' });
  token = login.body.data.accessToken;
});

afterAll(async () => {
  await User.deleteOne({ _id: user?._id });
  await mongoose.disconnect();
});

describe('speech transcription proxy', () => {
  test('requires a user token and proxies bounded WebM uploads to the internal service', async () => {
    const anonymous = await request(app).post('/api/v1/speech/transcribe')
      .attach('file', Buffer.from('webm-audio'), { filename: 'answer.webm', contentType: 'audio/webm;codecs=opus' });
    expect(anonymous.status).toBe(401);

    const post = jest.spyOn(nlpClient, 'post').mockResolvedValue({ data: {
      transcript: 'A clear answer.', language: 'en', segments: [{ start: 0.1, end: 0.6, text: 'A' }],
    } });
    const response = await request(app).post('/api/v1/speech/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('webm-audio'), { filename: 'answer.webm', contentType: 'audio/webm;codecs=opus' });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({ transcript: 'A clear answer.', language: 'en' });
    expect(post).toHaveBeenCalledWith('/nlp/stt', expect.any(FormData));
    post.mockRestore();
  });
});
