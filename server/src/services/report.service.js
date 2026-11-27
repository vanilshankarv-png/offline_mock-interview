import Answer from '../models/Answer.js';
import { scoringConfig } from '../config/scoringConfig.js';

export async function buildSessionReport(session) {
  const answers = await Answer.find({ sessionId: session._id }).sort({ createdAt: 1 }).lean();
  const weightedAnswers = answers.map((answer) => ({
    ...answer,
    reportWeight: answer.isFollowUp ? scoringConfig.report.followUpWeight : 1,
  }));
  const totalWeight = weightedAnswers.reduce((sum, answer) => sum + answer.reportWeight, 0);
  const totalScore = totalWeight
    ? Math.round(weightedAnswers.reduce((sum, answer) => sum + answer.scores.finalScore * answer.reportWeight, 0) / totalWeight)
    : 0;

  const issues = new Map();
  const topics = new Map();
  for (const answer of weightedAnswers) {
    for (const issue of answer.coaching?.toImprove || []) {
      const key = issue.startsWith('You spoke at') ? 'pace'
        : issue.startsWith('You used') ? 'fillers'
          : issue.startsWith('You had') ? 'pauses'
            : issue.startsWith('Add a point') ? 'missed-keyword'
              : issue.startsWith('Use a definition') ? 'structure' : issue;
      const current = issues.get(key) || { message: issue, count: 0 };
      current.count += 1;
      issues.set(key, current);
    }
    const topic = answer.topic || 'General';
    const stats = topics.get(topic) || { scoreSum: 0, weight: 0 };
    stats.scoreSum += answer.scores.finalScore * answer.reportWeight;
    stats.weight += answer.reportWeight;
    topics.set(topic, stats);
  }
  const topicScores = [...topics].map(([topic, stats]) => ({ topic, averageScore: Math.round(stats.scoreSum / stats.weight) }));
  topicScores.sort((left, right) => right.averageScore - left.averageScore);
  const topTopic = [...topicScores].sort((left, right) => left.averageScore - right.averageScore)[0];
  return {
    sessionId: String(session._id),
    status: session.status,
    totalScore,
    answers: weightedAnswers,
    topImprovements: [...issues.values()].sort((left, right) => right.count - left.count || left.message.localeCompare(right.message)).slice(0, scoringConfig.report.topIssues),
    strongestTopic: topicScores[0] || null,
    weakestTopic: topTopic || null,
    nextPracticeGoal: topTopic
      ? `Practice ${topTopic.topic} next, focusing on a clear definition, an example, and a practical use case.`
      : 'Complete a practice session to get a topic-specific goal.',
  };
}
