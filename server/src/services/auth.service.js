import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
function tokenMatches(token, digest) {
  if (!digest) return false;
  const actual = Buffer.from(hashToken(token));
  const expected = Buffer.from(digest);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function issueTokens(userId) {
  return {
    accessToken: jwt.sign({}, env.JWT_ACCESS_SECRET, { subject: String(userId), expiresIn: env.JWT_ACCESS_TTL, algorithm: 'HS256' }),
    refreshToken: jwt.sign({ type: 'refresh' }, env.JWT_REFRESH_SECRET, { subject: String(userId), expiresIn: env.JWT_REFRESH_TTL, algorithm: 'HS256' }),
  };
}
export function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, preferredLanguage: user.preferredLanguage };
}
export async function register({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, role: 'user' });
    const tokens = issueTokens(user._id);
    user.refreshTokenHash = hashToken(tokens.refreshToken);
    user.lastLoginAt = new Date();
    await user.save();
    return { user, ...tokens };
  } catch (error) {
    if (error.code === 11000) {
      const duplicate = new Error('An account with this email already exists.');
      duplicate.statusCode = 409;
      duplicate.code = 'EMAIL_ALREADY_EXISTS';
      throw duplicate;
    }
    throw error;
  }
}
export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +refreshTokenHash');
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) return null;
  const tokens = issueTokens(user._id);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  user.lastLoginAt = new Date();
  await user.save();
  return { user, ...tokens };
}
export async function rotateRefreshToken(token) {
  let payload;
  try { payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }); } catch { return null; }
  if (payload.type !== 'refresh') return null;
  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  if (!user || !user.isActive || !tokenMatches(token, user.refreshTokenHash)) return null;
  const tokens = issueTokens(user._id);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  await user.save();
  return { user, ...tokens };
}
export async function invalidateRefreshToken(userId, token) {
  const user = await User.findById(userId).select('+refreshTokenHash');
  if (user && token && tokenMatches(token, user.refreshTokenHash)) {
    user.refreshTokenHash = null;
    await user.save();
  }
}
