import { Router } from 'express';
import { z } from 'zod';
import Answer from '../models/Answer.js';
import Chunk from '../models/Chunk.js';
import Question from '../models/Question.js';
import { authenticate } from '../middleware/auth.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { finishSession, getOwnedSession, makeHint, createSession, nextQuestion } from '../services/session.service.js';
import { countLongPauses, scoreAnswer } from '../services/scoring.service.js';
import { buildFollowups } from '../services/followup.service.js';
import { pick } from '../services/phrase.service.js';
import { buildSessionReport } from '../services/report.service.js';
import { scoringConfig } from '../config/scoringConfig.js';
import nlpClient from '../services/nlpClient.js';

const router = Router();
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid identifier.');
const createSchema = z.object({
  noteSetIds: z.array(objectId).min(1).max(20),
  style: z.enum(['friendly_coach', 'standard', 'strict', 'rapid_fire']),
  mode: z.string().trim().min(1).max(40),
  language: z.string().trim().min(2).max(20),
  questionCount: z.union([z.literal(5), z.literal(10), z.literal(15)]),
}).strict();
const hintSchema = z.object({ questionId: objectId, level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict();
const answerSchema = z.object({
  questionId: objectId,
  transcript: z.string().max(30_000),
  durationSec: z.number().finite().min(0).max(3_600),
  confidence: z.number().finite().optional(),
  longPauseCount: z.number().int().min(0).max(100).default(0),
  segments: z.array(z.object({ start: z.number().finite().min(0).max(3_600), end: z.number().finite().min(0).max(3_600),
    text: z.string().max(2_000) }).strict().refine((segment) => segment.end >= segment.start, 'Segment end must not precede its start.'))
    .max(2_000).optional().refine((segments) => !segments || segments.every((segment, index) => index === 0 || segment.start >= segments[index - 1].start),
      'Speech segments must be ordered by start time.'),
  isFollowUp: z.boolean().default(false),
  hintLevelUsed: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
}).strict().refine((value) => value.confidence === undefined || (value.confidence >= 0 && value.confidence <= 1), 'Confidence must be between 0 and 1.');
const retrySchema = z.object({ questionId: objectId }).strict();

router.use(authenticate);

router.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try {
    return sendSuccess(res, await createSession({ ...parsed.data, user: req.user }), 201);
  } catch (error) { return next(error); }
});

router.get('/:id/next-question', async (req, res, next) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found.' } });
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    return sendSuccess(res, await nextQuestion(session, req.user));
  } catch (error) { return next(error); }
});

router.post('/:id/hint', async (req, res, next) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found.' } });
  const parsed = hintSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    return sendSuccess(res, await makeHint(session, parsed.data.questionId, parsed.data.level));
  } catch (error) { return next(error); }
});

router.post('/:id/finish', async (req, res, next) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found.' } });
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    return sendSuccess(res, await finishSession(session));
  } catch (error) { return next(error); }
});

router.post('/:id/answers', async (req, res, next) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found.' } });
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    const retryMode = String(session.retryQuestionId || '') === parsed.data.questionId;
    if ((!retryMode && session.status !== 'active') || (!retryMode && String(session.currentQuestionId) !== parsed.data.questionId)
      || !session.askedQuestionIds.some((id) => String(id) === parsed.data.questionId)) {
      return res.status(409).json({ success: false, error: { code: 'QUESTION_NOT_CURRENT', message: 'Answer the current question in this active session.' } });
    }
    const question = await Question.findById(parsed.data.questionId).lean();
    if (!question) return res.status(404).json({ success: false, error: { code: 'QUESTION_NOT_FOUND', message: 'Question not found.' } });
    const followupsAlreadyUsed = await Answer.countDocuments({ sessionId: session._id, questionId: question._id, isFollowUp: true, isRetry: false });
    const previousAnswer = retryMode ? await Answer.findOne({ sessionId: session._id, questionId: question._id, isFollowUp: false, isRetry: false }).sort({ createdAt: -1 }).lean() : null;
    const longPauseCount = parsed.data.segments
      ? countLongPauses(parsed.data.segments)
      : parsed.data.longPauseCount;
    const result = await scoreAnswer({ session, user: req.user, question, ...parsed.data, longPauseCount, isRetry: retryMode });
    if (retryMode) {
      session.retryQuestionId = null;
      await session.save();
    }
    const category = result.scores.finalScore >= scoringConfig.reactionBands.strongMin ? 'strong'
      : result.scores.finalScore >= scoringConfig.reactionBands.partialMin ? 'partial' : 'weak';
    const phraseState = { usedPhrases: session.usedPhrases || {} };
    const reaction = await pick(`reactions.${category}`, session.style, phraseState);
    session.usedPhrases = phraseState.usedPhrases;
    session.markModified('usedPhrases');
    await session.save();

    const newFollowupCount = followupsAlreadyUsed + (parsed.data.isFollowUp ? 1 : 0);
    const prompts = retryMode ? [] : buildFollowups({ transcript: result.correctedTranscript, expectedKeywords: question.expectedKeywords,
      matchedKeywords: result.evaluation.matchedKeywords, hasExample: /\b(?:for example|such as|e\.g\.|for instance)\b/i.test(result.correctedTranscript),
      style: session.style, followupsUsed: newFollowupCount });
    let followUp = prompts[0] ? { questionId: String(question._id), text: prompts[0] } : undefined;
    if (followUp && question.chunkId) {
      try {
        const chunk = await Chunk.findById(question.chunkId).select('text').lean();
        const generated = await nlpClient.post('/nlp/followup', {
          studentAnswer: result.correctedTranscript,
          chunkText: chunk?.text || question.answer || question.text,
        }, { timeout: 8_500 });
        if (typeof generated.data.followup === 'string' && generated.data.followup.trim()) {
          followUp = { ...followUp, text: generated.data.followup.trim() };
        }
      } catch {
        // The deterministic template prompt remains the fallback if Ollama is off or slow.
      }
    }
    const maxFollowups = session.style === 'strict' ? 2 : 1;
    let nextAction = followUp ? 'followup' : (session.status === 'finished' || session.askedQuestionIds.length >= session.questionCount) ? 'wrapup' : 'next';
    let hintSuggestion;
    if (!retryMode && !followUp && result.evaluation.missedKeywords?.length && newFollowupCount >= maxFollowups) {
      nextAction = 'hint';
      hintSuggestion = { questionId: String(question._id), level: parsed.data.hintLevelUsed ? Math.min(3, parsed.data.hintLevelUsed + 1) : 1 };
    }
    return sendSuccess(res, { scores: result.scores, coaching: result.coaching, reaction, reactionCategory: category,
      ...(followUp ? { followUp } : {}), ...(hintSuggestion ? { hintSuggestion } : {}), nextAction,
      ...(retryMode && previousAnswer ? { scoreComparison: { previousScore: previousAnswer.scores.finalScore,
        newScore: result.scores.finalScore, change: result.scores.finalScore - previousAnswer.scores.finalScore } } : {}),
      answerId: String(result.answer._id), correctedTranscript: result.correctedTranscript });
  } catch (error) { return next(error); }
});

router.get('/:id/report', async (req, res, next) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found.' } });
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    return sendSuccess(res, await buildSessionReport(session));
  } catch (error) { return next(error); }
});

router.post('/:id/retry', async (req, res, next) => {
  if (!objectId.safeParse(req.params.id).success) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found.' } });
  const parsed = retrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  try {
    const session = await getOwnedSession(req.params.id, req.user._id);
    if (!session.askedQuestionIds.some((id) => String(id) === parsed.data.questionId)) {
      return res.status(404).json({ success: false, error: { code: 'QUESTION_NOT_FOUND', message: 'Question not found in this session.' } });
    }
    const question = await Question.findById(parsed.data.questionId).lean();
    const previous = await Answer.findOne({ sessionId: session._id, questionId: parsed.data.questionId, isFollowUp: false, isRetry: false }).sort({ createdAt: -1 }).lean();
    if (!question || !previous) return res.status(404).json({ success: false, error: { code: 'ANSWER_NOT_FOUND', message: 'No previous answer is available to compare.' } });
    session.retryQuestionId = question._id;
    await session.save();
    return sendSuccess(res, { questionId: parsed.data.questionId, text: question.text, type: question.type,
      previousScore: previous.scores.finalScore, prompt: 'Submit a new answer to compare it with your previous score.' });
  } catch (error) { return next(error); }
});

export default router;
