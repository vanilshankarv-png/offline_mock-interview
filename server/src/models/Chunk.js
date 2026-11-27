import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema({
  noteSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'NoteSet', required: true, index: true },
  topic: { type: String, default: 'General' },
  text: { type: String, required: true },
  keywords: { type: [String], default: [] },
  definitions: { type: [String], default: [] },
  embedding: { type: [Number], default: [] },
}, { timestamps: true });

export default mongoose.models.Chunk || mongoose.model('Chunk', chunkSchema);
