import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import { writeAudit } from '../utils/audit.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();
const idSchema = z.string().regex(/^[0-9a-f]{24}$/i);
const updateSchema = z.object({ role: z.enum(['user', 'admin']).optional(), isActive: z.boolean().optional() })
  .strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required.');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/users', async (req, res, next) => {
  const parsedQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
    role: z.enum(['user', 'admin']).optional(), status: z.enum(['active', 'inactive']).optional(), search: z.string().max(100).default('') }).strict().safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid user filters or pagination.' } });
  }
  const { page, limit, role, status, search } = parsedQuery.data;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.isActive = status === 'active';
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  try {
    const [users, total] = await Promise.all([
      User.find(filter).select('name email role isActive preferredLanguage createdAt updatedAt').sort({ createdAt: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return sendSuccess(res, { users, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) { return next(error); }
});

router.patch('/users/:id', async (req, res, next) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  if (String(req.user._id) === req.params.id && (parsed.data.role === 'user' || parsed.data.isActive === false)) {
    return res.status(400).json({ success: false, error: { code: 'SELF_ADMIN_CHANGE_DENIED', message: 'An admin cannot demote or deactivate their own account.' } });
  }
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    const before = { role: user.role, isActive: user.isActive };
    Object.assign(user, parsed.data);
    await user.save();
    await writeAudit({ actorId: req.user._id, action: parsed.data.role && parsed.data.role !== before.role ? 'user.role_changed' : 'user.updated',
      resourceType: 'user', resourceId: user._id, changes: { before, after: { role: user.role, isActive: user.isActive } } });
    return sendSuccess(res, { user: { id: String(user._id), name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
  } catch (error) { return next(error); }
});

router.delete('/users/:id', async (req, res, next) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
  if (String(req.user._id) === req.params.id) return res.status(400).json({ success: false, error: { code: 'SELF_ADMIN_CHANGE_DENIED', message: 'An admin cannot deactivate their own account.' } });
  try {
    const user = await User.findById(req.params.id).select('+refreshTokenHash');
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });
    const before = { name: user.name, email: user.email, isActive: user.isActive };
    user.name = 'Deleted user';
    user.email = `deleted-${user._id}@example.invalid`;
    user.passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    user.refreshTokenHash = null;
    user.preferredLanguage = 'en';
    user.isActive = false;
    await user.save();
    await writeAudit({ actorId: req.user._id, action: 'user.deleted', resourceType: 'user', resourceId: user._id,
      changes: { before, after: { name: user.name, email: user.email, isActive: false } } });
    return sendSuccess(res, { id: String(user._id), deleted: true });
  } catch (error) { return next(error); }
});

export default router;
