import mongoose from 'mongoose';

const monsterSchema = new mongoose.Schema({
  name: { type: String, required: true, default: 'CodeBeast' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  level: { type: Number, default: 1, min: 1 },
  hunger: { type: Number, default: 100, min: 0, max: 100 },
  multiplier: { type: Number, default: 1.0, min: 1.0, max: 2.0 },
  evolutionStage: { type: String, enum: ['baby', 'adult', 'legendary'], default: 'baby' }
}, { timestamps: true });

export default mongoose.model('Monster', monsterSchema);
