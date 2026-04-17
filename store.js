/**
 * store.js — MongoDB Abstraction Layer
 * All methods are now asynchronous over Mongoose models
 */

import User from './models/User.js'
import Friend from './models/Friend.js'
import Battle from './models/Battle.js'


// ── Helpers ──────────────────────────────────────────────
function generateFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// ── Users ────────────────────────────────────────────────
export async function createUser({ username, email, password }) {
  const existing = await User.findOne({ email })
  if (existing) return null

  const user = new User({
    username,
    email,
    password, // In production: hash with bcrypt
    friendCode: generateFriendCode(),
  })
  return await user.save()
}

export async function findUserByEmail(email) {
  return await User.findOne({ email })
}

export async function findUserById(id) {
  if (!id) return null
  const idStr = typeof id === 'object' ? id.toString() : String(id)
  if (!idStr.match(/^[0-9a-fA-F]{24}$/)) return null // Catch invalid objectId
  return await User.findById(idStr)
}

export async function findUserByFriendCode(code) {
  return await User.findOne({ friendCode: code.toUpperCase() })
}

export async function updateUser(id, updates) {
  return await User.findByIdAndUpdate(id, updates, { new: true })
}

export async function sanitizeUser(userDoc) {
  if (!userDoc) return null
  const safe = userDoc.toObject ? userDoc.toObject() : { ...userDoc }
  safe.id = safe._id.toString()
  delete safe.password
  delete safe.pushSubscription
  delete safe._id
  delete safe.__v
  if (!safe.team) safe.team = []
  if (!safe.favorites) safe.favorites = []
  
  return safe
}

export async function toggleFavorite(userId, pokemonId) {
  const user = await User.findById(userId)
  if (!user) return []
  
  const idx = user.favorites.findIndex(f => f.pokemonId === pokemonId)
  if (idx !== -1) {
    user.favorites.splice(idx, 1)
  } else {
    user.favorites.push({ pokemonId, addedAt: new Date() })
  }
  await user.save()
  return user.favorites
}

export async function updateFavoriteCharacteristics(userId, pokemonId, updates) {
  const user = await User.findById(userId)
  if (!user) return null
  
  const fav = user.favorites.find(f => f.pokemonId === pokemonId)
  if (!fav) return null
  
  if (updates.nickname !== undefined) fav.nickname = updates.nickname
  if (updates.notes !== undefined) fav.notes = updates.notes
  
  await user.save()
  return fav
}

// ── Friends ──────────────────────────────────────────────
export async function createFriendRequest(fromUserId, toUserId) {
  const exists = await Friend.findOne({
    $or: [
      { fromUserId, toUserId },
      { fromUserId: toUserId, toUserId: fromUserId }
    ]
  })
  if (exists) return { error: 'Ya existe una solicitud o amistad entre estos usuarios.', existing: exists }

  const fr = new Friend({ fromUserId, toUserId })
  await fr.save()
  return { friend: fr }
}

export async function getFriends(userId) {
  return await Friend.find({
    $or: [{ fromUserId: userId }, { toUserId: userId }]
  })
}

export async function findFriendById(id) {
  if (!id) return null
  const idStr = typeof id === 'object' ? id.toString() : String(id)
  if (!idStr.match(/^[0-9a-fA-F]{24}$/)) return null
  return await Friend.findById(idStr)
}

export async function updateFriend(id, updates) {
  return await Friend.findByIdAndUpdate(id, updates, { new: true })
}

export async function deleteFriend(id) {
  const result = await Friend.findByIdAndDelete(id)
  return !!result
}

// ── Battles ──────────────────────────────────────────────
export async function createBattle(challengerId, challengedId) {
  const battle = new Battle({ challengerId, challengedId })
  return await battle.save()
}

export async function getBattles(userId) {
  return await Battle.find({
    $or: [{ challengerId: userId }, { challengedId: userId }]
  })
}

export async function findBattleById(id) {
  if (!id) return null
  const idStr = typeof id === 'object' ? id.toString() : String(id)
  if (!idStr.match(/^[0-9a-fA-F]{24}$/)) return null
  return await Battle.findById(idStr)
}

export async function updateBattle(id, updates) {
  return await Battle.findByIdAndUpdate(id, updates, { new: true })
}
