import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, test, jest } from '@jest/globals';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import User from '../src/models/User.js';
import AppSetting from '../src/models/AppSetting.js';
import AuditLog from '../src/models/AuditLog.js';
import nlpClient from '../src/services/nlpClient.js';
import { connectDatabase } from '../src/config/database.js';
import { csvRow, escapeCsvCell } from '../src/utils/csv.js';

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userEmail = `b8-user-${suffix}@example.com`;
const adminEmail = `b8-admin-${suffix}@example.com`;
let regularUser;
let adminUser;
let userToken;
let adminToken;

beforeAll(async () => {
  await connectDatabase();
  const passwordHash = await bcrypt.hash('B8Secure123', 12);
  regularUser = await User.create({ name: 'B8 User', email: userEmail, passwordHash, role: 'user' });
  adminUser = await User.create({ name: 'B8 Admin', email: adminEmail, passwordHash, role: 'admin' });
  userToken = jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: String(regularUser._id), expiresIn: '10m' });
  adminToken = jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: String(adminUser._id), expiresIn: '10m' });
});

afterAll(async () => {
  await Promise.all([AppSetting.deleteMany({ key: 'llm.enabled' }), AuditLog.deleteMany({ actorId: adminUser._id })]);
  await User.deleteMany({ _id: { $in: [regularUser._id, adminUser._id] } });
  await mongoose.disconnect();
});

describe('admin access and safety', () => {
  test('non-admin users receive 403 on every admin route', async () => {
    const cases = [
      ['get', '/api/v1/admin/ping'], ['get', '/api/v1/admin/users'],
      ['patch', `/api/v1/admin/users/${regularUser._id}`], ['delete', `/api/v1/admin/users/${regularUser._id}`],
      ['get', '/api/v1/admin/notes'], ['post', '/api/v1/admin/notes'], ['post', '/api/v1/admin/notes/upload'],
      ['get', `/api/v1/admin/notes/${regularUser._id}`], ['patch', `/api/v1/admin/notes/${regularUser._id}`],
      ['delete', `/api/v1/admin/notes/${regularUser._id}`], ['get', '/api/v1/admin/phrase-banks'],
      ['post', '/api/v1/admin/phrase-banks'], ['get', '/api/v1/admin/phrase-banks/openers'],
      ['patch', '/api/v1/admin/phrase-banks/openers'], ['delete', '/api/v1/admin/phrase-banks/openers'],
      ['put', '/api/v1/admin/translations/en'], ['patch', '/api/v1/admin/languages/hi'],
      ['get', '/api/v1/admin/chat/flagged'], ['patch', `/api/v1/admin/chat/messages/${regularUser._id}`],
      ['get', '/api/v1/admin/settings/llm'], ['patch', '/api/v1/admin/settings/llm'],
      ['get', '/api/v1/admin/stats'], ['get', '/api/v1/admin/export/sessions.csv'],
    ];
    for (const [method, path] of cases) {
      const response = await request(app)[method](path).set('Authorization', `Bearer ${userToken}`).send({});
      expect(response.status).toBe(403);
    }
  });

  test('an admin cannot demote themselves', async () => {
    const response = await request(app).patch(`/api/v1/admin/users/${adminUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`).send({ role: 'user' });
    expect(response.status).toBe(400);
    const stored = await User.findById(adminUser._id);
    expect(stored.role).toBe('admin');
  });

  test('admin can read Ollama reachability and toggle the persisted LLM setting', async () => {
    const getStatus = jest.spyOn(nlpClient, 'get').mockResolvedValue({ data: {
      enabled: false, reachable: true, model: 'llama3.2', modelAvailable: true,
    } });
    const setStatus = jest.spyOn(nlpClient, 'post').mockResolvedValue({ data: {
      enabled: true, reachable: true, model: 'llama3.2', modelAvailable: true,
    } });

    const status = await request(app).get('/api/v1/admin/settings/llm').set('Authorization', `Bearer ${adminToken}`);
    expect(status.status).toBe(200);
    expect(status.body.data).toMatchObject({ enabled: false, reachable: true, modelAvailable: true });
    const updated = await request(app).patch('/api/v1/admin/settings/llm')
      .set('Authorization', `Bearer ${adminToken}`).send({ enabled: true });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ enabled: true, reachable: true, applied: true });
    expect((await AppSetting.findOne({ key: 'llm.enabled' })).value).toBe(true);
    expect(await AuditLog.exists({ actorId: adminUser._id, action: 'setting.updated', resourceId: 'llm.enabled' })).toBeTruthy();

    getStatus.mockRestore();
    setStatus.mockRestore();
  });
});

describe('CSV export escaping', () => {
  test.each(['=SUM(1,2)', '+1+1', '-2+3', '@HYPERLINK("x")'])('prefixes formula-like value %s', (value) => {
    expect(escapeCsvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
    expect(csvRow([value])).toContain('\'');
  });
  test('quotes commas and embedded quotes', () => {
    expect(csvRow(['simple', 'a,"b"'])).toBe('"simple","a,""b"""');
  });
});
