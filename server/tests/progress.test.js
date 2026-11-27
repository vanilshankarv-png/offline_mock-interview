import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import Answer from '../src/models/Answer.js';
import DailyStreak from '../src/models/DailyStreak.js';
import ProgressStat from '../src/models/ProgressStat.js';
import { connectDatabase } from '../src/config/database.js';
import { updateProgressOnFinish } from '../src/services/progress.service.js';

const userId = new mongoose.Types.ObjectId();
const sessionId = new mongoose.Types.ObjectId();

beforeAll(async () => connectDatabase());
afterAll(async () => {
  await Answer.deleteMany({ sessionId });
  await ProgressStat.deleteMany({ userId });
  await DailyStreak.deleteMany({ userId });
  await mongoose.disconnect();
});

describe('progress updates', () => {
  test('uses weighted follow-up scores, counts attempts, and updates the streak', async () => {
    const common = { sessionId, userId, questionId: new mongoose.Types.ObjectId(), topic: 'Arrays', durationSec: 30,
      transcript: 'answer', scores: { finalScore: 80 }, coaching: { wentWell: [], toImprove: [] }, reaction: 'strong' };
    await Answer.create(common);
    await Answer.create({ ...common, questionId: new mongoose.Types.ObjectId(), isFollowUp: true,
      scores: { finalScore: 60 } });
    const streak = await updateProgressOnFinish({ _id: sessionId, userId });
    const stat = await ProgressStat.findOne({ userId, topic: 'Arrays' }).lean();
    expect(stat.attempts).toBe(2);
    expect(stat.avgScore).toBeCloseTo((0.8 + 0.6 * 0.5) / 1.5, 4);
    expect(streak.currentStreak).toBe(1);
  });
});
