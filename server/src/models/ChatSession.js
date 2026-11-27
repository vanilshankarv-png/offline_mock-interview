import mongoose from 'mongoose';

const chatSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, default: 'Notes chat', maxlength: 160 },
  lastActivityAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

export default mongoose.models.ChatSession || mongoose.model('ChatSession', chatSessionSchema);
