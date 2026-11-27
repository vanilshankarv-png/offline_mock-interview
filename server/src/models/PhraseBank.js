import mongoose from 'mongoose';

const phraseBankSchema = new mongoose.Schema({
  category: { type: String, required: true, unique: true },
  phrases: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

export default mongoose.models.PhraseBank || mongoose.model('PhraseBank', phraseBankSchema);
