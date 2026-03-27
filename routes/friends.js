import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import {
  createFriendRequest,
  getFriends,
  findFriendById,
  updateFriend,
  deleteFriend,
  findUserByFriendCode,
  findUserByEmail,
  findUserById,
  sanitizeUser,
} from '../store.js'

const router = Router()

// Helper to send push to a user (injected from server.js)
let sendPushToUser = null
export function setSendPush(fn) {
  sendPushToUser = fn
}

router.post('/request', authMiddleware, async (req, res) => {
  const { friendCode, email } = req.body

  let targetUser = null
  if (friendCode) {
    targetUser = await findUserByFriendCode(friendCode)
  } else if (email) {
    targetUser = await findUserByEmail(email.toLowerCase().trim())
  }

  if (!targetUser) {
    return res.status(404).json({ error: 'Usuario no encontrado.' })
  }

  if (targetUser.id.toString() === req.user.id.toString()) {
    return res.status(400).json({ error: 'No puedes enviarte una solicitud a ti mismo.' })
  }

  const result = await createFriendRequest(req.user.id, targetUser.id)

  if (result.error) {
    return res.status(409).json({ error: result.error })
  }

  // Send push notification to target user
  if (sendPushToUser && targetUser.pushSubscription) {
    sendPushToUser(targetUser.pushSubscription, {
      type: 'invitacion-amistad',
      message: `¡${req.user.username} quiere ser tu amigo!`,
      url: '/friends',
    })
  }

  console.log(`[Friends] ${req.user.username} → solicitud a ${targetUser.username}`)
  res.status(201).json({ friend: result.friend, targetUser: await sanitizeUser(targetUser) })
})

router.get('/', authMiddleware, async (req, res) => {
  const all = await getFriends(req.user.id)

  const enriched = await Promise.all(all.map(async (f) => {
    const otherId = f.fromUserId.toString() === req.user.id.toString() ? f.toUserId : f.fromUserId
    const otherUser = await findUserById(otherId)
    return {
      id: f._id.toString(),
      fromUserId: f.fromUserId.toString(),
      toUserId: f.toUserId.toString(),
      status: f.status,
      createdAt: f.createdAt,
      otherUser: await sanitizeUser(otherUser),
      direction: f.fromUserId.toString() === req.user.id.toString() ? 'sent' : 'received',
    }
  }))

  const pending = enriched.filter((f) => f.status === 'pending')
  const accepted = enriched.filter((f) => f.status === 'accepted')

  res.json({ pending, accepted })
})

router.post('/:id/accept', authMiddleware, async (req, res) => {
  const fr = await findFriendById(req.params.id)
  if (!fr) return res.status(404).json({ error: 'Solicitud no encontrada.' })
  if (fr.toUserId.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'No autorizado.' })
  if (fr.status !== 'pending') return res.status(400).json({ error: 'La solicitud ya fue procesada.' })

  await updateFriend(fr._id, { status: 'accepted' })

  console.log(`[Friends] ${req.user.username} aceptó la solicitud de ${fr.fromUserId}`)
  res.json({ message: 'Solicitud aceptada.', friend: fr })
})

router.post('/:id/decline', authMiddleware, async (req, res) => {
  const fr = await findFriendById(req.params.id)
  if (!fr) return res.status(404).json({ error: 'Solicitud no encontrada.' })
  if (fr.toUserId.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'No autorizado.' })

  await deleteFriend(fr._id)
  res.json({ message: 'Solicitud rechazada.' })
})

export default router
