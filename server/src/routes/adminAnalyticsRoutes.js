import { Router } from 'express';
import Answer from '../models/Answer.js';
import ChatMessage from '../models/ChatMessage.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import ProgressStat from '../models/ProgressStat.js';
import { csvRow } from '../utils/csv.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { z } from 'zod';

const router = Router();

router.get('/stats', async (req, res, next) => {
  if (!z.object({}).strict().safeParse(req.query).success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'This endpoint does not accept query parameters.' } });
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
  try {
    const [totalUsers, activeUsers7d, totalSessions, scoreRows, dailyRows, topTopics, languageUsage, chatbotQuestions, flaggedAnswers] = await Promise.all([
      User.countDocuments({}), User.countDocuments({ isActive: true, lastLoginAt: { $gte: sevenDaysAgo } }), Session.countDocuments({}),
      Answer.aggregate([{ $group: { _id: null, avgScore: { $avg: '$scores.finalScore' } } }]),
      Session.aggregate([{ $match: { $or: [{ startedAt: { $gte: thirtyDaysAgo } }, { startedAt: { $exists: false }, createdAt: { $gte: thirtyDaysAgo } }] } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: { $ifNull: ['$startedAt', '$createdAt'] }, timezone: 'UTC' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }]),
      ProgressStat.aggregate([{ $group: { _id: '$topic', avgScore: { $avg: '$avgScore' }, attempts: { $sum: '$attempts' } } },
        { $sort: { avgScore: 1 } }, { $limit: 10 }, { $project: { _id: 0, topic: '$_id', avgScore: 1, attempts: 1 } }]),
      Session.aggregate([{ $group: { _id: '$language', sessions: { $sum: 1 } } }, { $sort: { sessions: -1 } },
        { $project: { _id: 0, language: '$_id', sessions: 1 } }]),
      ChatMessage.countDocuments({ role: 'user' }), ChatMessage.countDocuments({ role: 'assistant', flagged: true }),
    ]);
    const dailyMap = new Map(dailyRows.map((row) => [row._id, row.count]));
    const sessionsPerDay = [];
    for (let offset = 0; offset < 30; offset += 1) {
      const date = new Date(thirtyDaysAgo);
      date.setUTCDate(date.getUTCDate() + offset);
      const key = date.toISOString().slice(0, 10);
      sessionsPerDay.push({ date: key, count: dailyMap.get(key) || 0 });
    }
    return sendSuccess(res, { totalUsers, activeUsers7d, totalSessions, avgScore: Math.round(scoreRows[0]?.avgScore || 0),
      sessionsPerDay, topTopics, languageUsage, chatbotQuestions, flaggedAnswers });
  } catch (error) { return next(error); }
});

router.get('/export/sessions.csv', async (req, res, next) => {
  if (!z.object({}).strict().safeParse(req.query).success) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'This endpoint does not accept query parameters.' } });
  const pipeline = [
    { $lookup: { from: User.collection.name, localField: 'userId', foreignField: '_id', as: 'user' } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: Answer.collection.name, localField: '_id', foreignField: 'sessionId', as: 'answers' } },
    { $unwind: { path: '$answers', preserveNullAndEmptyArrays: true } },
    { $addFields: { answerWeight: { $cond: ['$answers.isFollowUp', 0.5, 1] }, hasAnswer: { $cond: [{ $ifNull: ['$answers._id', false] }, 1, 0] } } },
    { $group: { _id: '$_id', userEmail: { $first: '$user.email' }, date: { $first: { $ifNull: ['$finishedAt', { $ifNull: ['$startedAt', '$createdAt'] }] } },
      style: { $first: '$style' }, scoreSum: { $sum: { $multiply: [{ $ifNull: ['$answers.scores.finalScore', 0] }, '$answerWeight'] } },
      scoreWeight: { $sum: { $multiply: ['$hasAnswer', '$answerWeight'] } }, durationSec: { $sum: { $multiply: ['$hasAnswer', { $ifNull: ['$answers.durationSec', 0] }] } },
      topics: { $addToSet: { $cond: ['$hasAnswer', '$answers.topic', null] } } } },
    { $project: { userEmail: { $ifNull: ['$userEmail', ''] }, date: 1, style: 1,
      totalScore: { $cond: [{ $gt: ['$scoreWeight', 0] }, { $round: [{ $divide: ['$scoreSum', '$scoreWeight'] }, 0] }, 0] },
      durationMin: { $round: [{ $divide: ['$durationSec', 60] }, 2] }, topics: { $setDifference: ['$topics', [null]] } } },
    { $sort: { date: -1 } },
  ];
  try {
    res.status(200);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="sessions.csv"');
    res.write(csvRow(['userEmail', 'date', 'topics', 'style', 'totalScore', 'durationMin']) + '\r\n');
    const cursor = Session.aggregate(pipeline).cursor({ batchSize: 200 });
    for await (const row of cursor) {
      res.write(csvRow([row.userEmail, row.date?.toISOString?.() || row.date, (row.topics || []).join('; '), row.style, row.totalScore, row.durationMin]) + '\r\n');
    }
    return res.end();
  } catch (error) {
    if (res.headersSent) return res.end();
    return next(error);
  }
});

export default router;
