import Answer from '../models/Answer.js';
import DailyStreak from '../models/DailyStreak.js';
import ProgressStat from '../models/ProgressStat.js';
import { scoringConfig } from '../config/scoringConfig.js';

function utcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function updateProgressOnFinish(session) {
  const now = new Date();
  const answers = await Answer.find({ sessionId: session._id }).select('topic scores.finalScore isFollowUp').lean();
  const grouped = new Map();
  for (const answer of answers) {
    const topic = answer.topic || 'General';
    const weight = answer.isFollowUp ? scoringConfig.report.followUpWeight : 1;
    const entry = grouped.get(topic) || { scoreSum: 0, scoreWeight: 0, attempts: 0 };
    entry.scoreSum += (answer.scores?.finalScore || 0) / 100 * weight;
    entry.scoreWeight += weight;
    entry.attempts += 1;
    grouped.set(topic, entry);
  }

  await Promise.all([...grouped].map(async ([topic, values]) => {
    const incrementScore = values.scoreSum;
    const incrementWeight = values.scoreWeight;
    const incrementAttempts = values.attempts;
    await ProgressStat.updateOne({ userId: session.userId, topic }, [{ $set: {
      scoreSum: { $add: [{ $ifNull: ['$scoreSum', 0] }, incrementScore] },
      scoreWeight: { $add: [{ $ifNull: ['$scoreWeight', { $ifNull: ['$attempts', 0] }] }, incrementWeight] },
      attempts: { $add: [{ $ifNull: ['$attempts', 0] }, incrementAttempts] },
      avgScore: { $divide: [
        { $add: [{ $ifNull: ['$scoreSum', 0] }, incrementScore] },
        { $add: [{ $ifNull: ['$scoreWeight', { $ifNull: ['$attempts', 0] }] }, incrementWeight] },
      ] },
      lastSeen: now,
      updatedAt: now,
      createdAt: { $ifNull: ['$createdAt', now] },
    } }], { upsert: true });
  }));

  const today = utcDay(now);
  let streak = await DailyStreak.findOne({ userId: session.userId });
  if (!streak) streak = new DailyStreak({ userId: session.userId, currentStreak: 0, longestStreak: 0 });
  const lastActive = streak.lastActiveDate ? utcDay(new Date(streak.lastActiveDate)) : null;
  if (!lastActive || lastActive.getTime() !== today.getTime()) {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    streak.currentStreak = lastActive?.getTime() === yesterday.getTime() ? streak.currentStreak + 1 : 1;
    streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak);
    streak.lastActiveDate = today;
    await streak.save();
  }
  return streak;
}

export async function getProgress(userId) {
  const cutoff = new Date(Date.now() - scoringConfig.report.historyDays * 24 * 60 * 60 * 1000);
  const [answers, progressStats, streak] = await Promise.all([
    Answer.find({ userId, createdAt: { $gte: cutoff } }).select('scores.finalScore createdAt topic isFollowUp').sort({ createdAt: 1 }).lean(),
    ProgressStat.find({ userId }).sort({ avgScore: 1 }).lean(),
    DailyStreak.findOne({ userId }).lean(),
  ]);

  const byDay = new Map();
  const byWeek = new Map();
  for (const answer of answers) {
    const day = utcDay(new Date(answer.createdAt));
    const key = day.toISOString().slice(0, 10);
    const weight = answer.isFollowUp ? scoringConfig.report.followUpWeight : 1;
    const current = byDay.get(key) || { scoreSum: 0, weight: 0, attempts: 0 };
    current.scoreSum += answer.scores.finalScore * weight;
    current.weight += weight;
    current.attempts += 1;
    byDay.set(key, current);

    const weekStart = new Date(day);
    const weekday = (weekStart.getUTCDay() + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - weekday);
    const weekKey = weekStart.toISOString().slice(0, 10);
    const week = byWeek.get(weekKey) || { scoreSum: 0, weight: 0 };
    week.scoreSum += answer.scores.finalScore * weight;
    week.weight += weight;
    byWeek.set(weekKey, week);
  }
  const history = [...byDay].map(([date, stats]) => ({ date, averageScore: Math.round(stats.scoreSum / stats.weight), attempts: stats.attempts }));
  const averageByWeek = [...byWeek].map(([weekStart, stats]) => ({ weekStart, averageScore: Math.round(stats.scoreSum / stats.weight) }));
  return {
    history,
    weakTopics: progressStats.filter((stat) => stat.avgScore < scoringConfig.report.weakTopicMaxScore).slice(0, 5)
      .map(({ topic, avgScore, attempts, lastSeen }) => ({ topic, avgScore, attempts, lastSeen })),
    streak: streak?.currentStreak || 0,
    averageByWeek,
  };
}
