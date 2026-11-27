import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  noteSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'NoteSet', required: true, index: true },
  chunkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chunk' },
  topic: { type: String, default: 'General', index: true },
  type: { type: String, required: true },
  text: { type: String, required: true },
  expectedKeywords: { type: [String], default: [] },
  difficulty: { type: String, default: 'medium' },
  answer: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.models.Question || mongoose.model('Question', questionSchema);
