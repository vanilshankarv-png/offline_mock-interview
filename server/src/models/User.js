import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user', required: true },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null, index: true },
  preferredLanguage: { type: String, default: 'en', trim: true, maxlength: 20 },
  refreshTokenHash: { type: String, default: null, select: false },
}, { timestamps: true });

userSchema.index({ role: 1, isActive: 1, createdAt: -1 });

export default mongoose.models.User || mongoose.model('User', userSchema);
