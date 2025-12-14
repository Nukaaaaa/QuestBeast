import mongoose from 'mongoose';

const leaderboardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  score: { type: Number, default: 0, min: 0 },
  rank: { type: Number, min: 1 },
  period: { type: String, enum: ['week', 'month', 'all'], default: 'week' },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Leaderboard', leaderboardSchema);
