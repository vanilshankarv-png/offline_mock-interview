import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../utils/apiResponse.js';
import { getLlmStatus, setLlmEnabled } from '../services/llmSettings.service.js';

const router = Router();

router.get('/settings/llm', async (req, res, next) => {
  if (!z.object({}).strict().safeParse(req.query).success || !z.object({}).strict().safeParse(req.body || {}).success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'This endpoint does not accept a query or request body.' } });
  }
  try { return sendSuccess(res, await getLlmStatus()); }
  catch (error) { return next(error); }
});

router.patch('/settings/llm', async (req, res, next) => {
  if (!z.object({}).strict().safeParse(req.query).success) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'This endpoint does not accept query parameters.' } });
  }
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try { return sendSuccess(res, await setLlmEnabled(parsed.data.enabled, req.user._id)); }
  catch (error) { return next(error); }
});

export default router;
