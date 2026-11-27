import mongoose from 'mongoose';

const progressStatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  topic: { type: String, required: true },
  avgScore: { type: Number, min: 0, max: 1, default: 0.5 },
  scoreSum: { type: Number, default: 0 },
  scoreWeight: { type: Number, default: 0 },
  attempts: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now },
}, { timestamps: true });

progressStatSchema.index({ userId: 1, topic: 1 }, { unique: true });

export default mongoose.models.ProgressStat || mongoose.model('ProgressStat', progressStatSchema);
