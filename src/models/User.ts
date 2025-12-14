import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 50, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' },
  level: { type: Number, default: 1, min: 1 },
  points: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: true },
  quests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quest' }]
}, { timestamps: true });

export default mongoose.model('User', userSchema);
