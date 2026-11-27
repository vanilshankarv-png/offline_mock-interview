import { Router } from 'express';
import { z } from 'zod';
import Language from '../models/Language.js';
import Translation from '../models/Translation.js';
import { languages } from '../config/languages.js';
import { writeAudit } from '../utils/audit.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();
const languageCode = (value) => languages.some((language) => language.code === value);
const translationBody = z.object({
  translations: z.record(z.string().regex(/^[\w.-]{1,160}$/), z.union([
    z.string().max(2_000), z.object({ value: z.string().max(2_000), reviewed: z.boolean().optional() }).strict(),
  ])).refine((translations) => Object.keys(translations).length > 0, 'Provide at least one translation.'),
  reviewed: z.boolean().default(false),
}).strict();

router.put('/translations/:lang', async (req, res, next) => {
  const parsedParams = z.object({ lang: z.string().regex(/^[a-z]{2,3}$/i) }).strict().safeParse(req.params);
  if (!parsedParams.success) return res.status(404).json({ success: false, error: { code: 'LANGUAGE_NOT_FOUND', message: 'Unsupported language.' } });
  if (!z.object({}).strict().safeParse(req.query).success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Unexpected query parameter.' } });
  const lang = parsedParams.data.lang.toLowerCase();
  if (!languageCode(lang)) return res.status(404).json({ success: false, error: { code: 'LANGUAGE_NOT_FOUND', message: 'Unsupported language.' } });
  const parsed = translationBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try {
    const entries = Object.entries(parsed.data.translations).map(([key, raw]) => ({
      key, value: typeof raw === 'string' ? raw : raw.value,
      reviewed: typeof raw === 'string' ? parsed.data.reviewed : raw.reviewed ?? parsed.data.reviewed,
    }));
    const previousRows = await Translation.find({ lang, key: { $in: entries.map((entry) => entry.key) } }).lean();
    const previous = new Map(previousRows.map((row) => [row.key, row]));
    await Translation.bulkWrite(entries.map((entry) => ({ updateOne: {
      filter: { lang, key: entry.key },
      update: { $set: { value: entry.value, reviewed: entry.reviewed, updatedBy: req.user._id }, $setOnInsert: { lang, key: entry.key } },
      upsert: true,
    } })));
    await Promise.all(entries.map((entry) => writeAudit({ actorId: req.user._id,
      action: previous.has(entry.key) ? 'translation.updated' : 'translation.created', resourceType: 'translation',
      resourceId: `${lang}:${entry.key}`, changes: { before: previous.get(entry.key)?.value ?? null, after: entry.value, reviewed: entry.reviewed } })));
    return sendSuccess(res, { language: lang, updated: entries.length });
  } catch (error) { return next(error); }
});

router.patch('/languages/:code', async (req, res, next) => {
  const parsedParams = z.object({ code: z.string().regex(/^[a-z]{2,3}$/i) }).strict().safeParse(req.params);
  if (!parsedParams.success) return res.status(404).json({ success: false, error: { code: 'LANGUAGE_NOT_FOUND', message: 'Unsupported language.' } });
  if (!z.object({}).strict().safeParse(req.query).success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Unexpected query parameter.' } });
  const code = parsedParams.data.code.toLowerCase();
  if (!languageCode(code)) return res.status(404).json({ success: false, error: { code: 'LANGUAGE_NOT_FOUND', message: 'Unsupported language.' } });
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try {
    const definition = languages.find((language) => language.code === code);
    const before = await Language.findOne({ code }).lean();
    const language = await Language.findOneAndUpdate({ code }, { $set: { ...definition, enabled: parsed.data.enabled } }, { new: true, upsert: true, runValidators: true });
    await writeAudit({ actorId: req.user._id, action: 'language.updated', resourceType: 'language', resourceId: code,
      changes: { enabledBefore: before?.enabled ?? definition.enabled, enabledAfter: language.enabled } });
    return sendSuccess(res, { language: { code: language.code, name: language.name, nativeName: language.nativeName,
      dir: language.dir, speechLocale: language.speechLocale, enabled: language.enabled } });
  } catch (error) { return next(error); }
});

export default router;
