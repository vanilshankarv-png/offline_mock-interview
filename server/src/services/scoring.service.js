import Answer from '../models/Answer.js';
import Chunk from '../models/Chunk.js';
import NoteSet from '../models/NoteSet.js';
import { scoringConfig as config } from '../config/scoringConfig.js';
import nlpClient from './nlpClient.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round4 = (value) => {
  const factor = 10 ** config.signalDecimals;
  return Math.round(value * factor) / factor;
};

export function paceScore(wpm) {
  for (const band of config.paceBands) {
    if (wpm >= band.min && wpm <= band.max) return band.score;
  }
  return config.paceDefaultScore;
}

export function fillerScore(perMinute) {
  if (perMinute < config.fillerBands[0].below) return config.fillerBands[0].score;
  for (const band of config.fillerBands.slice(1)) if (perMinute <= band.through) return band.score;
  return config.fillerDefaultScore;
}

export function pauseScore(longPauseCount) {
  for (const band of config.pauseBands) if (longPauseCount <= band.max) return band.score;
  return config.pauseDefaultScore;
}

export function countLongPauses(segments = [], thresholdSeconds = config.longPauseThresholdSeconds) {
  let pauses = 0;
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index].start - segments[index - 1].end > thresholdSeconds) pauses += 1;
  }
  return pauses;
}

export function lengthScore(durationSec, questionType) {
  const isRapid = config.rapidFireTypes.includes(questionType);
  const band = config.lengthBands[isRapid ? 'rapid_fire' : 'standard'];
  let score = 1;
  if (durationSec < band.minSeconds) score = durationSec / band.minSeconds;
  else if (durationSec > band.maxSeconds) score = 1 - ((durationSec - band.maxSeconds) / band.longFalloffSeconds);
  return Math.max(band.minScore, score);
}

export function calculateScores({ keywordCoverage = 0, semanticSimilarity = 0, completeness = 0, wpm = 0,
  fillersPerMin = 0, longPauseCount = 0, durationSec = 0, questionType = 'explain_simple', confidence }) {
  const content = config.contentWeights.keywordCoverage * keywordCoverage
    + config.contentWeights.semanticSimilarity * semanticSimilarity
    + config.contentWeights.completeness * completeness;
  const clarity = clamp(confidence ?? config.clarityDefault, config.clarityRange.min, config.clarityRange.max);
  const deliveryParts = {
    pace: paceScore(wpm),
    fillers: fillerScore(fillersPerMin),
    pauses: pauseScore(longPauseCount),
    length: lengthScore(durationSec, questionType),
    clarity,
  };
  const delivery = config.deliveryWeights.pace * deliveryParts.pace
    + config.deliveryWeights.fillers * deliveryParts.fillers
    + config.deliveryWeights.pauses * deliveryParts.pauses
    + config.deliveryWeights.length * deliveryParts.length
    + config.deliveryWeights.clarity * deliveryParts.clarity;
  const finalScore = Math.round(100 * (config.finalWeights.content * content + config.finalWeights.delivery * delivery));
  return { content: round4(content), delivery: round4(delivery), finalScore, deliveryParts };
}

function sentence(text, pattern) {
  return String(text || '').split(/(?<=[.!?])\s+/).find((part) => pattern.test(part))?.trim() || '';
}

export function buildSayItBetter(chunk) {
  if (!chunk) return '';
  const source = chunk.text || '';
  const definition = chunk.definitions?.[0] || sentence(source, /\b(?:is|means|refers to|defined as)\b/i);
  const example = sentence(source, /\b(?:for example|such as|e\.g\.|for instance)\b/i);
  const purpose = sentence(source, /\b(?:used to|helps|allows|because|purpose)\b/i);
  return [definition, example, purpose].filter(Boolean).filter((item, index, all) => all.indexOf(item) === index).join(' ');
}

export function buildCoaching({ transcript, correctedTranscript, evaluation, question, chunk, noteTitle, scores, longPauseCount = 0 }) {
  const missedKeywords = evaluation.missedKeywords || [];
  const thresholds = config.coachingThresholds;
  const coaching = { wentWell: [], toImprove: [], missedKeywords, fillerReport: evaluation.fillerBreakdown || {}, structureTip: '', sayItBetter: buildSayItBetter(chunk) };
  if ((evaluation.keywordCoverage || 0) >= thresholds.goodCoverage) coaching.wentWell.push('You covered the main ideas and key terms.');
  if ((evaluation.completeness || 0) >= thresholds.goodCompleteness) coaching.wentWell.push('You gave a complete, well-supported explanation.');
  if (!coaching.wentWell.length && scores.finalScore >= config.reactionBands.partialMin) coaching.wentWell.push('You made a useful start and stayed with the question.');

  if (evaluation.wpm > thresholds.fastWpm) coaching.toImprove.push(`You spoke at ${Math.round(evaluation.wpm)} words per minute. Try pausing between ideas.`);
  else if (evaluation.wpm > 0 && evaluation.wpm < thresholds.slowWpm) coaching.toImprove.push(`You spoke at ${Math.round(evaluation.wpm)} words per minute. Try connecting your points more smoothly.`);
  const fillersPerMin = evaluation.fillersPerMin || 0;
  if (fillersPerMin >= thresholds.highFillersPerMin) coaching.toImprove.push(`You used ${fillersPerMin.toFixed(1)} fillers per minute. Pause briefly instead of filling the silence.`);
  if (longPauseCount >= thresholds.longPauses) coaching.toImprove.push(`You had ${longPauseCount} long pause${longPauseCount === 1 ? '' : 's'}. Try connecting your points with a short transition.`);
  if (missedKeywords.length) coaching.toImprove.push(`Add a point about ${missedKeywords[0]} to make your answer more complete.`);
  if ((evaluation.completeness || 0) < thresholds.goodCompleteness) coaching.toImprove.push('Use a definition, an example, and a practical use case.');
  if (!coaching.toImprove.length) coaching.toImprove.push('Keep this clear structure in your next answer.');

  const isHr = /\b(?:hr|human resources|behavioral|behavioural|interview)\b/i.test(`${noteTitle || ''} ${question.topic || ''}`);
  coaching.structureTip = isHr
    ? 'Use STAR: describe the situation, task, action, and result.'
    : 'Structure your answer as a definition, an example, then a use case.';
  if (!coaching.sayItBetter) coaching.sayItBetter = correctedTranscript || transcript;
  return coaching;
}

export async function scoreWithNlp({ transcript, expectedKeywords, durationSec, chunk, questionType, language, confidence, client = nlpClient }) {
  const correctedResponse = await client.post('/nlp/fuzzy-correct', { transcript, keywords: expectedKeywords });
  const correctedTranscript = correctedResponse.data.corrected;
  const evaluateResponse = await client.post('/nlp/evaluate', {
    transcript: correctedTranscript,
    durationSec,
    expectedKeywords,
    ...(chunk?.embedding?.length ? { chunkEmbedding: chunk.embedding } : { chunkText: chunk?.text || '' }),
    questionType,
    language,
    confidence,
  });
  return { correctedTranscript, evaluation: evaluateResponse.data };
}

export async function scoreAnswer({ session, user, question, transcript, durationSec, confidence = null,
  longPauseCount = 0, segments = [], isFollowUp = false, hintLevelUsed = null, isRetry = false, client = nlpClient }) {
  const expectedKeywords = question.expectedKeywords || [];
  const chunk = question.chunkId ? await Chunk.findById(question.chunkId).lean() : null;
  const { correctedTranscript, evaluation } = await scoreWithNlp({ transcript, expectedKeywords, durationSec,
    chunk: chunk || { text: question.text }, questionType: question.type, language: session.language, confidence, client });
  const scores = calculateScores({ ...evaluation, longPauseCount, durationSec, questionType: question.type, confidence });
  const noteSet = question.noteSetId ? await NoteSet.findById(question.noteSetId).select('title').lean() : null;
  const coaching = buildCoaching({ transcript, correctedTranscript, evaluation, question, chunk, noteTitle: noteSet?.title, scores, longPauseCount });
  if (coaching.sayItBetter) {
    try {
      const rewritten = await client.post('/nlp/rewrite-feedback', {
        text: coaching.sayItBetter,
        style: 'clear, concise, and natural spoken English; preserve the supplied facts',
      }, { timeout: 8_500 });
      if (typeof rewritten.data.text === 'string' && rewritten.data.text.trim()) {
        coaching.sayItBetter = rewritten.data.text.trim();
      }
    } catch {
      // Keep the deterministic template text when the optional model is off or unavailable.
    }
  }
  const category = scores.finalScore >= config.reactionBands.strongMin ? 'strong'
    : scores.finalScore >= config.reactionBands.partialMin ? 'partial' : 'weak';
  const answer = await Answer.create({ sessionId: session._id, userId: user._id, questionId: question._id,
    topic: question.topic || chunk?.topic || 'General', transcript, correctedTranscript, durationSec, confidence,
    longPauseCount, speechSegments: segments, isFollowUp, isRetry, hintLevelUsed, scores: { ...scores, signals: evaluation }, coaching, reaction: category });
  return { answer, scores, coaching, category, evaluation, correctedTranscript };
}
