import mongoose from 'mongoose';

const questSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 100 },
  description: { type: String, required: true },
  subject: { type: String, required: true, maxlength: 50 },
  difficulty: { type: Number, min: 1, max: 5, default: 1 },
  reward: { type: Number, min: 10, default: 50 },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Submission' }] 
}, { timestamps: true });

export default mongoose.model('Quest', questSchema);
