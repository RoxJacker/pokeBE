import mongoose from 'mongoose'

const favoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pokemonId: { type: Number, required: true },
  nickname: { type: String, default: '' },
  notes: { type: String, default: '' },
  addedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'favoritos' })

export default mongoose.model('Favorite', favoriteSchema)
