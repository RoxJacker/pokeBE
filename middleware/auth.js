/**
 * middleware/auth.js — Simple token-based auth middleware
 * Token = base64(userId) for simplicity. In production use JWT.
 */

import { findUserById } from '../store.js'

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido.' })
  }

  const token = authHeader.split(' ')[1]
  let userId
  try {
    userId = Buffer.from(token, 'base64').toString('utf-8')
  } catch {
    return res.status(401).json({ error: 'Token inválido.' })
  }

  const user = await findUserById(userId)
  if (!user) {
    return res.status(401).json({ error: 'Usuario no encontrado.' })
  }

  req.user = user
  next()
}
