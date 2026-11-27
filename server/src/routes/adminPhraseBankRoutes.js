import { Router } from 'express';
import { z } from 'zod';
import PhraseBank from '../models/PhraseBank.js';
import { clearPhraseCache } from '../services/phrase.service.js';
import { writeAudit } from '../utils/audit.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();
const styles = ['friendly_coach', 'standard', 'strict', 'rapid_fire'];
const categories = ['openers', 'reactions', 'transitions', 'encouragement'];
const categorySchema = z.enum(categories);
function validatePhraseBank(category, phrases, previous = null) {
  const flattened = [];
  if (category === 'reactions') {
    for (const group of ['strong', 'partial', 'weak']) {
      const bank = phrases[group];
      if (!bank || styles.some((style) => !Array.isArray(bank[style]) || bank[style].length < 6)) return 'Each reaction group needs six phrases per style.';
      flattened.push(...styles.flatMap((style) => bank[style]));
    }
    if (Object.keys(phrases).some((key) => !['strong', 'partial', 'weak'].includes(key))) return 'Reaction groups must be strong, partial, and weak.';
  } else {
    if (styles.some((style) => !Array.isArray(phrases[style]) || phrases[style].length < 6)) return 'Each style needs at least six phrase variants.';
    flattened.push(...styles.flatMap((style) => phrases[style]));
    if (Object.keys(phrases).some((key) => !styles.includes(key))) return 'Only supported styles are allowed.';
  }
  if (flattened.some((phrase) => /\{(?!name\}|question\})[^{}]+\}/.test(phrase))) return 'Only the {name} and {question} placeholders are allowed.';
  if (category === 'openers' && flattened.some((phrase) => !phrase.includes('{question}'))) return 'Every opener must preserve the {question} placeholder.';
  if (category === 'openers' && !flattened.some((phrase) => phrase.includes('{name}'))) return 'At least one opener must include the {name} placeholder.';

  if (previous && category === 'openers') {
    for (const style of styles) {
      const oldPhrases = previous[style] || [];
      const newPhrases = phrases[style] || [];
      for (let index = 0; index < Math.min(oldPhrases.length, newPhrases.length); index += 1) {
        if (oldPhrases[index].includes('{name}') && !newPhrases[index].includes('{name}')) return 'Existing {name} placeholders must be preserved.';
      }
    }
  }
  return null;
}

const bodySchema = z.object({ category: categorySchema, phrases: z.record(z.string(), z.unknown()) }).strict();
const updateSchema = z.object({ phrases: z.record(z.string(), z.unknown()) }).strict();

router.get('/', async (req, res, next) => {
  try { return sendSuccess(res, { phraseBanks: await PhraseBank.find({}).sort({ category: 1 }).lean() }); }
  catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  const phraseError = validatePhraseBank(parsed.data.category, parsed.data.phrases);
  if (phraseError) return res.status(400).json({ success: false, error: { code: 'INVALID_PHRASE_BANK', message: phraseError } });
  try {
    if (await PhraseBank.exists({ category: parsed.data.category })) return res.status(409).json({ success: false, error: { code: 'ALREADY_EXISTS', message: 'Phrase bank already exists.' } });
    const bank = await PhraseBank.create(parsed.data);
    clearPhraseCache();
    await writeAudit({ actorId: req.user._id, action: 'phrase_bank.created', resourceType: 'phrase_bank', resourceId: bank.category,
      changes: { category: bank.category } });
    return sendSuccess(res, { phraseBank: bank }, 201);
  } catch (error) { return next(error); }
});

router.get('/:category', async (req, res, next) => {
  const parsed = categorySchema.safeParse(req.params.category);
  if (!parsed.success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Phrase bank not found.' } });
  try {
    const bank = await PhraseBank.findOne({ category: parsed.data }).lean();
    if (!bank) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Phrase bank not found.' } });
    return sendSuccess(res, { phraseBank: bank });
  } catch (error) { return next(error); }
});

router.patch('/:category', async (req, res, next) => {
  const category = categorySchema.safeParse(req.params.category);
  const parsed = updateSchema.safeParse(req.body);
  if (!category.success || !parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid category or phrase bank body.' } });
  try {
    const bank = await PhraseBank.findOne({ category: category.data });
    if (!bank) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Phrase bank not found.' } });
    const phraseError = validatePhraseBank(category.data, parsed.data.phrases, bank.phrases);
    if (phraseError) return res.status(400).json({ success: false, error: { code: 'INVALID_PHRASE_BANK', message: phraseError } });
    const before = bank.phrases;
    bank.phrases = parsed.data.phrases;
    await bank.save();
    clearPhraseCache();
    await writeAudit({ actorId: req.user._id, action: 'phrase_bank.updated', resourceType: 'phrase_bank', resourceId: bank.category,
      changes: { before, after: bank.phrases } });
    return sendSuccess(res, { phraseBank: bank });
  } catch (error) { return next(error); }
});

router.delete('/:category', async (req, res, next) => {
  const category = categorySchema.safeParse(req.params.category);
  if (!category.success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Phrase bank not found.' } });
  try {
    const bank = await PhraseBank.findOneAndDelete({ category: category.data });
    if (!bank) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Phrase bank not found.' } });
    clearPhraseCache();
    await writeAudit({ actorId: req.user._id, action: 'phrase_bank.deleted', resourceType: 'phrase_bank', resourceId: bank.category,
      changes: { category: bank.category } });
    return sendSuccess(res, { category: bank.category, deleted: true });
  } catch (error) { return next(error); }
});

export default router;
