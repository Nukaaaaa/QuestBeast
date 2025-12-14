import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  content: { type: String, required: true },
  fileUrl: { type: String, default: '' },
  grade: { type: Number, min: 0, max: 100, default: 0 },
  feedback: { type: String, default: '' },
  quest: { type: mongoose.Schema.Types.ObjectId, ref: 'Quest', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export default mongoose.model('Submission', submissionSchema);
