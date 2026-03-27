/**
 * store.js — MongoDB Abstraction Layer
 * All methods are now asynchronous over Mongoose models
 */

import User from './models/User.js'
import Friend from './models/Friend.js'
import Battle from './models/Battle.js'
import Favorite from './models/Favorite.js'

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
  if (!id.match(/^[0-9a-fA-F]{24}$/)) return null // Catch invalid objectId
  return await User.findById(id)
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
  
  const favs = await Favorite.find({ userId: safe.id }).select('-_id -__v -userId -updatedAt -createdAt').lean()
  safe.favorites = favs || []
  
  return safe
}

export async function toggleFavorite(userId, pokemonId) {
  const existing = await Favorite.findOne({ userId, pokemonId })
  if (existing) {
    await Favorite.findByIdAndDelete(existing._id)
  } else {
    await Favorite.create({ userId, pokemonId })
  }
  const allFavs = await Favorite.find({ userId }).select('-_id -__v -userId -updatedAt -createdAt').lean()
  return allFavs
}

export async function updateFavoriteCharacteristics(userId, pokemonId, updates) {
  const fav = await Favorite.findOne({ userId, pokemonId })
  if (!fav) return null
  
  if (updates.nickname !== undefined) fav.nickname = updates.nickname
  if (updates.notes !== undefined) fav.notes = updates.notes
  
  await fav.save()
  const obj = fav.toObject()
  delete obj._id
  delete obj.__v
  delete obj.userId
  delete obj.createdAt
  delete obj.updatedAt
  return obj
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
  if (!id.match(/^[0-9a-fA-F]{24}$/)) return null
  return await Friend.findById(id)
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
  if (!id.match(/^[0-9a-fA-F]{24}$/)) return null
  return await Battle.findById(id)
}

export async function updateBattle(id, updates) {
  return await Battle.findByIdAndUpdate(id, updates, { new: true })
}
