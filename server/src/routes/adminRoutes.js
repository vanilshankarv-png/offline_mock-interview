import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { z } from 'zod';
import ChatMessage from '../models/ChatMessage.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import adminUserRoutes from './adminUsersRoutes.js';
import adminNoteRoutes from './adminNotesRoutes.js';
import adminPhraseBankRoutes from './adminPhraseBankRoutes.js';
import adminLanguageRoutes from './adminLanguageRoutes.js';
import adminAnalyticsRoutes from './adminAnalyticsRoutes.js';
import adminSettingsRoutes from './adminSettingsRoutes.js';

const router = Router();
router.use(authenticate, authorize('admin'));
router.use(adminUserRoutes);
router.use('/notes', adminNoteRoutes);
router.use('/phrase-banks', adminPhraseBankRoutes);
router.use(adminLanguageRoutes);
router.use(adminAnalyticsRoutes);
router.use(adminSettingsRoutes);
router.get('/ping', (req, res) => res.json({ success: true, data: { status: 'ok' } }));
router.get('/chat/flagged', async (req, res, next) => {
  const query = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict().safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid page or limit.' } });
  const { page, limit } = query.data;
  try {
    const filter = { role: 'assistant', flagged: true };
    const [messages, total] = await Promise.all([
      ChatMessage.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ChatMessage.countDocuments(filter),
    ]);
    return sendSuccess(res, { messages, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) { return next(error); }
});
router.patch('/chat/messages/:id', async (req, res, next) => {
  const params = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) }).strict().safeParse(req.params);
  if (!params.success) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Chat message not found.' } });
  }
  if (!z.object({}).strict().safeParse(req.query).success || !z.object({}).strict().safeParse(req.body || {}).success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'This endpoint does not accept a query or request body.' } });
  }
  try {
    const message = await ChatMessage.findOneAndUpdate({ _id: params.data.id, role: 'assistant', flagged: true },
      { $set: { reviewed: true, reviewedAt: new Date(), reviewedBy: req.user._id } }, { new: true });
    if (!message) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Flagged chat message not found.' } });
    await writeAudit({ actorId: req.user._id, action: 'chat_message.reviewed', resourceType: 'chat_message', resourceId: message._id,
      changes: { reviewed: true } });
    return sendSuccess(res, { messageId: String(message._id), reviewed: message.reviewed, reviewedAt: message.reviewedAt });
  } catch (error) { return next(error); }
});
export default router;
