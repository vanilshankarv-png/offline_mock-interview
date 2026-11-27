import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import NoteSet from '../models/NoteSet.js';
import { writeAudit } from '../utils/audit.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { deletePrebuiltNote, importPrebuiltNote } from '../services/adminNotes.service.js';

const router = Router();
const idSchema = z.string().regex(/^[0-9a-f]{24}$/i);
const levels = ['beginner', 'intermediate', 'advanced'];
const createSchema = z.object({ title: z.string().trim().min(1).max(160), text: z.string().trim().min(1).max(1_000_000),
  language: z.string().trim().min(2).max(20).default('en'), level: z.enum(levels).default('intermediate'), isPublished: z.boolean().default(false) }).strict();
const updateSchema = z.object({ title: z.string().trim().min(1).max(160).optional(), text: z.string().trim().min(1).max(1_000_000).optional(),
  language: z.string().trim().min(2).max(20).optional(), level: z.enum(levels).optional(), isPublished: z.boolean().optional() })
  .strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
const mimeByExtension = { '.txt': ['text/plain'], '.md': ['text/markdown', 'text/x-markdown', 'application/octet-stream'], '.pdf': ['application/pdf'] };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, done) => {
  const extension = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!extension || !mimeByExtension[extension] || !mimeByExtension[extension].includes(file.mimetype)) {
    const error = new Error('Only .txt, .md, and .pdf files with a matching content type are accepted.');
    error.statusCode = 400;
    return done(error);
  }
  return done(null, true);
} });
const parseUpload = (req, res, next) => upload.single('file')(req, res, (error) => {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_SIZE') error.statusCode = 413;
  else if (!error.statusCode) error.statusCode = 400;
  return next(error);
});

async function findPrebuilt(id) {
  const note = await NoteSet.findOne({ _id: id, ownerId: null });
  if (!note) {
    const error = new Error('Prebuilt note not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  return note;
}

router.get('/', async (req, res, next) => {
  const parsedQuery = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(100).default(''), published: z.enum(['true', 'false']).optional() }).strict().safeParse(req.query);
  if (!parsedQuery.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid note filters or pagination.' } });
  const { page, limit, search, published } = parsedQuery.data;
  const filter = { ownerId: null };
  if (published !== undefined) filter.isPublished = published === 'true';
  if (search) filter.title = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  try {
    const [notes, total] = await Promise.all([NoteSet.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), NoteSet.countDocuments(filter)]);
    return sendSuccess(res, { notes, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) { return next(error); }
});

router.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try {
    const result = await importPrebuiltNote(parsed.data);
    await writeAudit({ actorId: req.user._id, action: 'note.created', resourceType: 'note', resourceId: result.note._id,
      changes: { title: result.note.title, level: result.note.level, language: result.note.language } });
    return sendSuccess(res, { note: result.note, chunkCount: result.chunkCount, questionCount: result.questionCount }, 201);
  } catch (error) { return next(error); }
});

router.post('/upload', parseUpload, async (req, res, next) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(160), language: z.string().trim().min(2).max(20).default('en'),
    level: z.enum(levels).default('intermediate'), isPublished: z.enum(['true', 'false']).optional() }).strict().safeParse(req.body);
  if (!parsed.success || !req.file) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error?.issues[0]?.message || 'A file is required.' } });
  try {
    const result = await importPrebuiltNote({ ...parsed.data, isPublished: parsed.data.isPublished === 'true', file: req.file });
    await writeAudit({ actorId: req.user._id, action: 'note.created', resourceType: 'note', resourceId: result.note._id,
      changes: { title: result.note.title, level: result.note.level, filename: req.file.originalname } });
    return sendSuccess(res, { note: result.note, chunkCount: result.chunkCount, questionCount: result.questionCount }, 201);
  } catch (error) { return next(error); }
});

router.get('/:id', async (req, res, next) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prebuilt note not found.' } });
  try { return sendSuccess(res, { note: await findPrebuilt(req.params.id) }); } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prebuilt note not found.' } });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try {
    const note = await findPrebuilt(req.params.id);
    const before = { title: note.title, level: note.level, language: note.language, isPublished: note.isPublished };
    if (parsed.data.text !== undefined) {
      const result = await importPrebuiltNote({ ...note.toObject(), ...parsed.data, text: parsed.data.text, existingNote: note });
      await writeAudit({ actorId: req.user._id, action: 'note.updated', resourceType: 'note', resourceId: note._id,
        changes: { before, after: { title: note.title, level: note.level, language: note.language, isPublished: note.isPublished }, contentReimported: true } });
      return sendSuccess(res, { note: result.note, chunkCount: result.chunkCount, questionCount: result.questionCount });
    }
    Object.assign(note, parsed.data);
    await note.save();
    await writeAudit({ actorId: req.user._id, action: 'note.updated', resourceType: 'note', resourceId: note._id,
      changes: { before, after: { title: note.title, level: note.level, language: note.language, isPublished: note.isPublished } } });
    return sendSuccess(res, { note });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Prebuilt note not found.' } });
  try {
    const note = await findPrebuilt(req.params.id);
    await deletePrebuiltNote(note);
    await writeAudit({ actorId: req.user._id, action: 'note.deleted', resourceType: 'note', resourceId: note._id,
      changes: { title: note.title } });
    return sendSuccess(res, { id: String(note._id), deleted: true });
  } catch (error) { return next(error); }
});

export default router;
