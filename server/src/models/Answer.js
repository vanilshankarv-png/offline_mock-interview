import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, index: true },
  topic: { type: String, default: 'General', index: true },
  transcript: { type: String, default: '' },
  correctedTranscript: { type: String, default: '' },
  durationSec: { type: Number, required: true },
  confidence: { type: Number, default: null },
  longPauseCount: { type: Number, default: 0 },
  speechSegments: { type: [{ start: Number, end: Number, text: String, _id: false }], default: [] },
  isFollowUp: { type: Boolean, default: false },
  isRetry: { type: Boolean, default: false },
  hintLevelUsed: { type: Number, min: 1, max: 3, default: null },
  scores: { type: mongoose.Schema.Types.Mixed, required: true },
  coaching: { type: mongoose.Schema.Types.Mixed, required: true },
  reaction: { type: String, required: true },
}, { timestamps: true });

answerSchema.index({ userId: 1, createdAt: -1 });
answerSchema.index({ topic: 1, createdAt: -1 });

export default mongoose.models.Answer || mongoose.model('Answer', answerSchema);
