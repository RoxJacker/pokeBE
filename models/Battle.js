import mongoose from 'mongoose'

const battleSchema = new mongoose.Schema({
  challengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  challengedId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'team_select', 'active', 'finished', 'declined'], default: 'pending' },
  state: { type: mongoose.Schema.Types.Mixed, default: null },
  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, collection: 'batallas' })

export default mongoose.model('Battle', battleSchema)
