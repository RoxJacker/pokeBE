import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { findUserByFriendCode, findUserByEmail, updateUser, sanitizeUser, toggleFavorite, updateFavoriteCharacteristics } from '../store.js'

const router = Router()

router.get('/me', authMiddleware, async (req, res) => {
  // authMiddleware ya inyecta req.user
  res.json({ user: await sanitizeUser(req.user) })
})

router.put('/me', authMiddleware, async (req, res) => {
  const { username, avatar, pushSubscription } = req.body
  const updates = {}
  if (username) updates.username = username
  if (avatar !== undefined) updates.avatar = avatar
  if (pushSubscription !== undefined) updates.pushSubscription = pushSubscription

  const updated = await updateUser(req.user.id, updates)
  res.json({ user: await sanitizeUser(updated) })
})

router.post('/me/favorites/:pokemonId', authMiddleware, async (req, res) => {
  const pokemonId = parseInt(req.params.pokemonId, 10)
  const favorites = await toggleFavorite(req.user.id, pokemonId)
  res.json({ favorites })
})

router.put('/me/favorites/:pokemonId', authMiddleware, async (req, res) => {
  const pokemonId = parseInt(req.params.pokemonId, 10)
  const { nickname, notes } = req.body
  
  const updated = await updateFavoriteCharacteristics(req.user.id, pokemonId, { nickname, notes })
  
  if (!updated) {
    return res.status(404).json({ error: 'Pokemon no está en favoritos.' })
  }
  
  res.json({ favorite: updated })
})

router.get('/lookup', authMiddleware, async (req, res) => {
  const { code, email } = req.query

  let user = null
  if (code) {
    user = await findUserByFriendCode(code)
  } else if (email) {
    user = await findUserByEmail(email.toLowerCase().trim())
  }

  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado.' })
  }

  if (user.id === req.user.id) {
    return res.status(400).json({ error: 'No puedes buscarte a ti mismo.' })
  }

  res.json({ user: await sanitizeUser(user) })
})

export default router
