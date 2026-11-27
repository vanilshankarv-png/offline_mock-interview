import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import nlpClient from '../services/nlpClient.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();
const transcriptionLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id),
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'You have made several transcription requests. Please wait a few minutes and try again.' } } });
const acceptedMimeTypes = {
  '.webm': ['audio/webm', 'video/webm', 'application/octet-stream'],
  '.wav': ['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream'],
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const extension = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
    const mimeType = file.mimetype.split(';', 1)[0].trim().toLowerCase();
    if (!extension || !acceptedMimeTypes[extension]?.includes(mimeType)) {
      const error = new Error('Only matching .webm or .wav audio uploads are accepted.');
      error.statusCode = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

function parseAudio(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') error.statusCode = 413;
    else if (error && !error.statusCode) error.statusCode = 400;
    return error ? next(error) : next();
  });
}

router.post('/transcribe', authenticate, transcriptionLimiter, parseAudio, async (req, res, next) => {
  if (!req.file) return res.status(400).json({ success: false, error: { code: 'AUDIO_REQUIRED', message: 'An audio file is required.' } });
  try {
    res.set('Cache-Control', 'no-store');
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype.split(';', 1)[0] }), req.file.originalname);
    const result = await nlpClient.post('/nlp/stt', form);
    return sendSuccess(res, result.data);
  } catch (error) {
    if (error.response?.status === 503) {
      const unavailable = new Error('Offline speech transcription is disabled. Use browser speech input instead.');
      unavailable.statusCode = 503;
      unavailable.code = 'STT_DISABLED';
      return next(unavailable);
    }
    return next(error);
  }
});

export default router;
