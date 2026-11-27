import { randomInt } from 'node:crypto';
import Chunk from '../models/Chunk.js';
import NoteSet from '../models/NoteSet.js';
import ProgressStat from '../models/ProgressStat.js';
import Question from '../models/Question.js';
import Session from '../models/Session.js';
import { pick } from './phrase.service.js';
import { updateProgressOnFinish } from './progress.service.js';

export function selectNextQuestion({ questions, askedQuestionIds = [], recentQuestionIds = [], questionTypes = [], index,
  progressStats = [], random = Math.random }) {
  const excluded = new Set([...askedQuestionIds, ...recentQuestionIds].map(String));
  const available = questions.filter((question) => !excluded.has(String(question._id ?? question.id)));
  if (!available.length) return null;

  const stageTypes = index === 0 ? ['definition'] : index < 3 ? ['example', 'why'] : ['scenario', 'compare'];
  let staged = available.filter((question) => stageTypes.includes(question.type));
  if (!staged.length) staged = available;
  const usedTypes = new Set(questionTypes);
  if (usedTypes.size < 3 && index >= 2) {
    const freshType = staged.filter((question) => !usedTypes.has(question.type));
    const anyFresh = available.filter((question) => !usedTypes.has(question.type));
    if (freshType.length) staged = freshType;
    else if (index >= 3 && anyFresh.length) staged = anyFresh;
  }

  const scores = new Map(progressStats.map((stat) => [String(stat.topic).toLowerCase(), Number(stat.avgScore)]));
  const weighted = staged.map((question) => {
    const score = scores.get(String(question.topic || '').toLowerCase());
    const weight = score == null ? 1 : 1 + Math.max(0, 1 - score) * 4;
    return { question, weight };
  });
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random() * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.question;
  }
  return weighted.at(-1).question;
}

export async function createSession({ user, noteSetIds, style, mode, language, questionCount }) {
  const filter = { _id: { $in: noteSetIds } };
  filter.$or = [{ ownerId: user._id }, { ownerId: null, isPublished: true }];
  const noteSets = await NoteSet.find(filter).select('_id');
  if (noteSets.length !== new Set(noteSetIds.map(String)).size) {
    const error = new Error('One or more note sets are unavailable to this account.');
    error.statusCode = 403;
    error.code = 'NOTE_ACCESS_DENIED';
    throw error;
  }
  const session = await Session.create({ userId: user._id, noteSetIds, style, mode, language, questionCount });
  const greeting = await pick('encouragement', style, { usedPhrases: {} });
  return { sessionId: String(session._id), greeting };
}

export async function getOwnedSession(id, userId) {
  const session = await Session.findOne({ _id: id, userId });
  if (!session) {
    const error = new Error('Session not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  return session;
}

export async function nextQuestion(session, user) {
  if (session.status !== 'active') {
    const error = new Error('This session has finished.');
    error.statusCode = 409;
    error.code = 'SESSION_FINISHED';
    throw error;
  }
  if (session.askedQuestionIds.length >= session.questionCount) {
    const error = new Error('All questions in this session have been asked.');
    error.statusCode = 409;
    error.code = 'SESSION_COMPLETE';
    throw error;
  }
  const [questions, progressStats, previousSessions] = await Promise.all([
    Question.find({ noteSetId: { $in: session.noteSetIds } }).lean(),
    ProgressStat.find({ userId: user._id }).select('topic avgScore').lean(),
    Session.find({ userId: user._id, _id: { $ne: session._id } }).sort({ startedAt: -1 }).limit(3).select('askedQuestionIds').lean(),
  ]);
  const recentIds = previousSessions.flatMap((item) => item.askedQuestionIds || []);
  const index = session.askedQuestionIds.length;
  const question = selectNextQuestion({ questions, askedQuestionIds: session.askedQuestionIds, recentQuestionIds: recentIds,
    questionTypes: session.questionTypes, index, progressStats });
  if (!question) {
    const error = new Error('No unused questions are available for this session.');
    error.statusCode = 409;
    error.code = 'NO_QUESTIONS_AVAILABLE';
    throw error;
  }

  const phraseState = { usedPhrases: { openers: [...session.usedOpeners] } };
  let opener = await pick('openers', session.style, phraseState);
  const includeName = randomInt(0, 3) === 0;
  opener = opener.replace(/\{name\}/g, includeName ? user.name : '').replace(/\s{2,}/g, ' ').trim();
  const spokenText = opener.replace(/\{question\}/g, question.text);
  session.usedOpeners = phraseState.usedPhrases.openers || [];
  session.askedQuestionIds.push(question._id);
  session.questionTypes.push(question.type);
  session.currentQuestionId = question._id;
  await session.save();
  return { questionId: String(question._id), text: spokenText, spokenText, type: question.type, index: index + 1, total: session.questionCount };
}

export async function makeHint(session, questionId, level) {
  if (String(session.currentQuestionId) !== String(questionId)) {
    const error = new Error('That question is not the current question in this session.');
    error.statusCode = 404;
    error.code = 'QUESTION_NOT_FOUND';
    throw error;
  }
  const question = await Question.findById(questionId).lean();
  if (!question || !session.askedQuestionIds.some((id) => String(id) === String(questionId))) {
    const error = new Error('Question not found in this session.');
    error.statusCode = 404;
    error.code = 'QUESTION_NOT_FOUND';
    throw error;
  }
  const chunk = question.chunkId ? await Chunk.findById(question.chunkId).lean() : null;
  let hint;
  if (level === 1) {
    const keyword = question.expectedKeywords?.[0];
    const initials = keyword?.split(/\s+/).map((word) => word[0].toUpperCase()).join(' ');
    hint = keyword ? `Think of a key term with these initials: ${initials}.` : `Focus on the category: ${question.topic || 'the main topic'}.`;
  } else if (level === 2) {
    const source = chunk?.text || question.answer || question.text;
    const sentences = source.split(/(?<=[.!?])\s+/);
    const keyword = question.expectedKeywords?.[0];
    const clue = sentences.find((sentence) => keyword && sentence.toLowerCase().includes(keyword.toLowerCase())) || sentences[0];
    hint = keyword ? clue.replace(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '_____') : clue;
  } else {
    hint = question.answer || chunk?.text || 'Review the main idea in your notes.';
  }
  const existing = session.hintRecords.find((record) => String(record.questionId) === String(questionId));
  if (existing) existing.hintLevelUsed = Math.max(existing.hintLevelUsed, level);
  else session.hintRecords.push({ questionId, hintLevelUsed: level });
  await session.save();
  return { questionId: String(questionId), level, hintLevelUsed: level, hint };
}

export async function finishSession(session) {
  if (session.status === 'finished' && session.progressApplied) {
    return { sessionId: String(session._id), status: session.status, finishedAt: session.finishedAt };
  }
  session.status = 'finished';
  session.finishedAt ||= new Date();
  if (!session.progressApplied) {
    await session.save();
    await updateProgressOnFinish(session);
    session.progressApplied = true;
    await session.save();
  }
  return { sessionId: String(session._id), status: session.status, finishedAt: session.finishedAt };
}
