import { Router } from 'express';
import { getMergedTranslations, listLanguages, translationEtag } from '../services/translation.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { z } from 'zod';

const router = Router();

router.get('/languages', async (req, res, next) => {
  if (!z.object({}).strict().safeParse(req.query).success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Unexpected query parameter.' } });
  try { return sendSuccess(res, await listLanguages()); } catch (error) { return next(error); }
});

router.get('/translations/:lang', async (req, res, next) => {
  const params = z.object({ lang: z.string().regex(/^[a-z]{2,3}$/i) }).strict().safeParse(req.params);
  if (!params.success) return res.status(404).json({ success: false, error: { code: 'LANGUAGE_NOT_FOUND', message: 'Unsupported language.' } });
  if (!z.object({}).strict().safeParse(req.query).success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Unexpected query parameter.' } });
  try {
    const translations = await getMergedTranslations(params.data.lang.toLowerCase());
    const etag = translationEtag(translations);
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=300');
    if (req.get('If-None-Match')?.split(/\s*,\s*/).includes(etag)) return res.status(304).end();
    return res.json(translations);
  } catch (error) { return next(error); }
});

export default router;
