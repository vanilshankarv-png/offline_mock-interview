import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startedAt: { type: Date, default: Date.now, required: true },
  noteSetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'NoteSet' }],
  style: { type: String, enum: ['friendly_coach', 'standard', 'strict', 'rapid_fire'], required: true },
  mode: { type: String, required: true },
  language: { type: String, required: true },
  questionCount: { type: Number, enum: [5, 10, 15], required: true },
  askedQuestionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  questionTypes: { type: [String], default: [] },
  usedOpeners: { type: [String], default: [] },
  usedPhrases: { type: mongoose.Schema.Types.Mixed, default: {} },
  hintRecords: [{ questionId: mongoose.Schema.Types.ObjectId, hintLevelUsed: Number }],
  currentQuestionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null },
  retryQuestionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null },
  progressApplied: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'finished'], default: 'active', index: true },
  finishedAt: { type: Date, default: null },
}, { timestamps: true });

sessionSchema.index({ createdAt: -1 });
sessionSchema.index({ userId: 1, startedAt: -1 });

export default mongoose.models.Session || mongoose.model('Session', sessionSchema);
