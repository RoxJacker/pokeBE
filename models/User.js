import mongoose from 'mongoose'

const teamSchema = new mongoose.Schema({
  id: Number,
  name: String,
  sprite: String,
  spriteBack: String,
  types: [String],
  maxHp: Number,
  currentHp: Number,
  stats: mongoose.Schema.Types.Mixed,
  moves: [mongoose.Schema.Types.Mixed]
})

const favoriteSchema = new mongoose.Schema({
  pokemonId: { type: Number, required: true },
  nickname: { type: String, default: '' },
  notes: { type: String, default: '' },
  addedAt: { type: Date, default: Date.now }
}, { _id: false })

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  friendCode: { type: String, required: true, unique: true },
  avatar: { type: String, default: null },
  team: { type: [teamSchema], default: [] },
  favorites: { type: [favoriteSchema], default: [] },

  pushSubscription: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true, collection: 'usuarios' })

export default mongoose.model('User', userSchema)
