import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema({
  noteSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'NoteSet', required: true },
  chunkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chunk', required: true },
  title: { type: String, default: '' },
  score: { type: Number, default: null },
}, { _id: false });

const chatMessageSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatSession', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  sources: { type: [sourceSchema], default: [] },
  confidence: { type: Number, min: 0, max: 1, default: null },
  flagged: { type: Boolean, default: false, index: true },
  flagReason: { type: String, default: null },
  reviewed: { type: Boolean, default: false, index: true },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

chatMessageSchema.index({ role: 1, flagged: 1, createdAt: -1 });
chatMessageSchema.index({ userId: 1, sessionId: 1, createdAt: 1 });
chatMessageSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);
