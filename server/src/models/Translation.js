import mongoose from 'mongoose';

const translationSchema = new mongoose.Schema({
  lang: { type: String, required: true },
  key: { type: String, required: true },
  value: { type: String, required: true },
  reviewed: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

translationSchema.index({ lang: 1, key: 1 }, { unique: true });
export default mongoose.models.Translation || mongoose.model('Translation', translationSchema);
