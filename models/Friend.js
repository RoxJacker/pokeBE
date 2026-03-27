import mongoose from 'mongoose'

const friendSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending' }
}, { timestamps: true, collection: 'amigos' })

// Compound index to prevent duplicate friendships
friendSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true })

export default mongoose.model('Friend', friendSchema)
