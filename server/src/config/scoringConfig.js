export const scoringConfig = Object.freeze({
  contentWeights: Object.freeze({ keywordCoverage: 0.5, semanticSimilarity: 0.3, completeness: 0.2 }),
  deliveryWeights: Object.freeze({ pace: 0.3, fillers: 0.3, pauses: 0.2, length: 0.1, clarity: 0.1 }),
  finalWeights: Object.freeze({ content: 0.6, delivery: 0.4 }),
  paceBands: Object.freeze([
    Object.freeze({ min: 110, max: 150, score: 1.0 }),
    Object.freeze({ min: 90, max: 110, score: 0.7 }),
    Object.freeze({ min: 150, max: 175, score: 0.7 }),
  ]),
  paceDefaultScore: 0.4,
  fillerBands: Object.freeze([
    Object.freeze({ below: 3, score: 1.0 }),
    Object.freeze({ through: 6, score: 0.7 }),
    Object.freeze({ through: 10, score: 0.4 }),
  ]),
  fillerDefaultScore: 0.2,
  pauseBands: Object.freeze([
    Object.freeze({ max: 0, score: 1.0 }),
    Object.freeze({ max: 2, score: 0.7 }),
    Object.freeze({ max: 4, score: 0.4 }),
  ]),
  pauseDefaultScore: 0.2,
  longPauseThresholdSeconds: 1.5,
  lengthBands: Object.freeze({
    standard: Object.freeze({ minSeconds: 20, maxSeconds: 90, longFalloffSeconds: 90, minScore: 0.3 }),
    rapid_fire: Object.freeze({ minSeconds: 5, maxSeconds: 30, longFalloffSeconds: 30, minScore: 0.3 }),
  }),
  rapidFireTypes: Object.freeze(['rapid_fire']),
  clarityDefault: 0.8,
  clarityRange: Object.freeze({ min: 0, max: 1 }),
  signalDecimals: 4,
  reactionBands: Object.freeze({ strongMin: 75, partialMin: 45 }),
  coachingThresholds: Object.freeze({ goodCoverage: 0.7, goodCompleteness: 0.67, fastWpm: 175, slowWpm: 90, highFillersPerMin: 3, longPauses: 1 }),
  report: Object.freeze({ followUpWeight: 0.5, weakTopicMaxScore: 0.65, historyDays: 90, topIssues: 3 }),
});

export default scoringConfig;
