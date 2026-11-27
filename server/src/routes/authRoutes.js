import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { invalidateRefreshToken, login, publicUser, register, rotateRefreshToken } from '../services/auth.service.js';
import { env } from '../config/env.js';

const router = Router();
const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(8).max(128).regex(/[A-Za-z]/, 'Password must contain a letter.').regex(/[0-9]/, 'Password must contain a number.');
const registrationSchema = z.object({ email: emailSchema, password: passwordSchema, name: z.string().trim().min(1).max(100) }).strict();
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
const updateSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), preferredLanguage: z.string().trim().min(2).max(20).optional() }).strict().refine((value) => Object.keys(value).length > 0);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } } });
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', path: '/api/v1/auth' };
const validationError = (res, error) => res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.issues?.[0]?.message || 'Invalid request.' } });

router.post('/register', authLimiter, async (req, res, next) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    const result = await register(parsed.data);
    res.cookie('refreshToken', result.refreshToken, cookieOptions);
    return res.status(201).json({ success: true, data: { user: publicUser(result.user), accessToken: result.accessToken } });
  } catch (error) { return next(error); }
});

router.post('/login', authLimiter, async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    const result = await login(parsed.data);
    if (!result) return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    res.cookie('refreshToken', result.refreshToken, cookieOptions);
    return res.json({ success: true, data: { user: publicUser(result.user), accessToken: result.accessToken } });
  } catch (error) { return next(error); }
});

router.post('/refresh', async (req, res, next) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Refresh token is required.' } });
  try {
    const result = await rotateRefreshToken(token);
    if (!result) { res.clearCookie('refreshToken', cookieOptions); return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Refresh token is invalid or expired.' } }); }
    res.cookie('refreshToken', result.refreshToken, cookieOptions);
    return res.json({ success: true, data: { user: publicUser(result.user), accessToken: result.accessToken } });
  } catch (error) { return next(error); }
});

router.post('/logout', async (req, res, next) => {
  try {
    if (req.cookies?.refreshToken) {
      try {
        const payload = jwt.verify(req.cookies.refreshToken, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
        await invalidateRefreshToken(payload.sub, req.cookies.refreshToken);
      } catch { /* Invalid or expired cookies are still cleared. */ }
    }
    res.clearCookie('refreshToken', cookieOptions);
    return res.json({ success: true, data: { message: 'Logged out.' } });
  } catch (error) { return next(error); }
});

router.get('/me', authenticate, (req, res) => res.json({ success: true, data: { user: publicUser(req.user) } }));
router.patch('/me', authenticate, async (req, res, next) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return validationError(res, parsed.error);
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { $set: parsed.data }, { new: true, runValidators: true });
    return res.json({ success: true, data: { user: publicUser(user) } });
  } catch (error) { return next(error); }
});

export default router;
