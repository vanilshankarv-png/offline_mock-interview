import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { deleteChatSession, getChatHistory, sendChat } from '../services/chat.service.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-f]{24}$/i);
const messageSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  noteSetIds: z.array(objectId).min(1).max(50).optional(),
  language: z.string().trim().min(2).max(20).optional(),
  sessionId: objectId.optional(),
}).strict();
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'You have sent too many messages. Please wait a minute and try again.' } } });

router.use(authenticate);
router.post('/', limiter, async (req, res, next) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try { return sendSuccess(res, await sendChat({ user: req.user, ...parsed.data })); } catch (error) { return next(error); }
});

router.get('/history', async (req, res, next) => {
  const query = z.object({ sessionId: objectId, page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict().safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a valid sessionId, page, and limit.' } });
  try { return sendSuccess(res, await getChatHistory({ userId: req.user._id, ...query.data })); }
  catch (error) { return next(error); }
});

router.delete('/sessions/:id', async (req, res, next) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Chat session not found.' } });
  try { return sendSuccess(res, await deleteChatSession({ userId: req.user._id, sessionId: req.params.id })); }
  catch (error) { return next(error); }
});

export default router;
