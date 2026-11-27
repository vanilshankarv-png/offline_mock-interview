import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import User from '../src/models/User.js';
import bcrypt from 'bcryptjs';

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userEmail = `auth-user-${suffix}@example.com`;
const adminEmail = `auth-admin-${suffix}@example.com`;

beforeAll(async () => {
  await connectDatabase();
  const passwordHash = await bcrypt.hash('AdminPass123', 12);
  await User.create({ name: 'Test Admin', email: adminEmail, passwordHash, role: 'admin' });
});

afterAll(async () => {
  await User.deleteMany({ email: { $in: [userEmail, adminEmail] } });
  await mongoose.disconnect();
});

describe('authentication and RBAC', () => {
  test('registers a user and prevents duplicate email', async () => {
    const payload = { name: 'Test User', email: userEmail, password: 'Password123' };
    const created = await request(app).post('/api/v1/auth/register').send(payload);
    expect(created.status).toBe(201);
    expect(created.body.data.user.role).toBe('user');
    expect(JSON.stringify(created.body)).not.toMatch(/passwordHash|refreshToken/);
    const duplicate = await request(app).post('/api/v1/auth/register').send(payload);
    expect(duplicate.status).toBe(409);
  });

  test('logs in successfully and rejects a wrong password', async () => {
    const ok = await request(app).post('/api/v1/auth/login').send({ email: userEmail, password: 'Password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();
    expect(JSON.stringify(ok.body)).not.toMatch(/passwordHash|refreshToken/);
    expect(ok.headers['set-cookie']?.join(';')).toContain('HttpOnly');
    const failed = await request(app).post('/api/v1/auth/login').send({ email: userEmail, password: 'WrongPass123' });
    expect(failed.status).toBe(401);
  });

  test('requires authentication, and restricts admin ping to admins', async () => {
    const anonymous = await request(app).get('/api/v1/admin/ping');
    expect(anonymous.status).toBe(401);
    const userLogin = await request(app).post('/api/v1/auth/login').send({ email: userEmail, password: 'Password123' });
    const denied = await request(app).get('/api/v1/admin/ping').set('Authorization', `Bearer ${userLogin.body.data.accessToken}`);
    expect(denied.status).toBe(403);
    const adminLogin = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password: 'AdminPass123' });
    const allowed = await request(app).get('/api/v1/admin/ping').set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`);
    expect(allowed.status).toBe(200);
  });

  test('sanitizes operator-shaped input and assigns request IDs without reflecting unsafe values', async () => {
    const invalid = await request(app).post('/api/v1/auth/login').send({ email: { $ne: null }, password: 'bad' });
    expect(invalid.status).toBe(400);
    expect(invalid.headers['x-request-id']).toBeTruthy();
    const health = await request(app).get('/api/v1/health').set('X-Request-Id', 'test-request-123').set('Origin', 'https://not-the-client.example');
    expect(health.headers['x-request-id']).toBe('test-request-123');
    expect(health.headers['access-control-allow-origin']).toBeUndefined();
  });
});
