import mongoose from 'mongoose';

const noteSetSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  title: { type: String, required: true },
  language: { type: String, default: 'en' },
  level: { type: String, default: 'intermediate' },
  rawText: { type: String, default: '' },
  isPrebuilt: { type: Boolean, default: false, index: true },
  isPublished: { type: Boolean, default: false },
}, { timestamps: true });

noteSetSchema.index({ ownerId: 1, isPublished: 1 });
noteSetSchema.index({ ownerId: 1, updatedAt: -1 });

export default mongoose.models.NoteSet || mongoose.model('NoteSet', noteSetSchema);
