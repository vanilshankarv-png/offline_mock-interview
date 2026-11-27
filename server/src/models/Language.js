import mongoose from 'mongoose';

const languageSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  nativeName: { type: String, required: true },
  dir: { type: String, enum: ['ltr', 'rtl'], required: true },
  speechLocale: { type: String, required: true },
  enabled: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.models.Language || mongoose.model('Language', languageSchema);
