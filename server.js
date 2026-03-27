/**
 * server.js — PokePWA API Server
 * Full REST API: auth, users, friends, battles, teams, push notifications
 */

import express from 'express'
import cors from 'cors'
import webpush from 'web-push'
import dotenv from 'dotenv'
import { existsSync, writeFileSync } from 'fs'
import mongoose from 'mongoose'

// Route modules
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import friendsRoutes, { setSendPush as setFriendsPush } from './routes/friends.js'
import battlesRoutes, { setSendPush as setBattlesPush } from './routes/battles.js'
import teamsRoutes from './routes/teams.js'

dotenv.config()

// ── MongoDB Connection ────────────────────────────────────────
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pokepwa'
mongoose.connect(mongoUri)
  .then(() => console.log('\n✅ Conectado a MongoDB'))
  .catch(err => console.error('\n❌ Error conectando a MongoDB:', err))

const app = express()

// CORS: Allow frontend from Railway or localhost
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174']
  : ['http://localhost:5173', 'http://localhost:5174']

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      callback(null, true)
    } else {
      callback(null, true) // Permissive for PWA — in production tighten this
    }
  },
  credentials: true,
}))
app.use(express.json())

// ── VAPID Keys ────────────────────────────────────────────────
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  const vapidKeys = webpush.generateVAPIDKeys()
  VAPID_PUBLIC_KEY = vapidKeys.publicKey
  VAPID_PRIVATE_KEY = vapidKeys.privateKey

  console.log('\n⚠  VAPID keys generadas:\n')
  console.log(`VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}`)
  console.log(`VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}\n`)

  if (!existsSync('.env')) {
    writeFileSync(
      '.env',
      `VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}\nVAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}\nVAPID_MAILTO=mailto:admin@pokepwa.com\nPORT=3001\n`,
    )
    console.log('✔  .env creado automáticamente.\n')
  }
}

webpush.setVapidDetails(
  process.env.VAPID_MAILTO || 'mailto:admin@pokepwa.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
)

// ── Push helper ───────────────────────────────────────────────
function sendPushToUser(subscription, data) {
  if (!subscription) return
  const payload = JSON.stringify(data)
  webpush.sendNotification(subscription, payload).catch((err) => {
    console.error('[Push] Error enviando notificación:', err.statusCode || err.message)
  })
}

// Inject push function into route modules
setFriendsPush(sendPushToUser)
setBattlesPush(sendPushToUser)

// ── Routes ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'PokePWA API Server',
    status: 'running',
    endpoints: {
      auth: 'POST /api/auth/register, POST /api/auth/login',
      users: 'GET /api/users/me, PUT /api/users/me, GET /api/users/lookup',
      friends: 'POST /api/friends/request, GET /api/friends, POST /api/friends/:id/accept|decline',
      battles: 'POST /api/battles/challenge, GET /api/battles, POST /api/battles/:id/accept|decline',
      teams: 'GET /api/teams/me, PUT /api/teams/me',
      push: 'GET /vapid-public-key',
    },
  })
})

app.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/friends', friendsRoutes)
app.use('/api/battles', battlesRoutes)
app.use('/api/teams', teamsRoutes)

// ── Legacy /subscribe endpoint (saves push subscription to user) ──
import { authMiddleware } from './middleware/auth.js'
import { updateUser, findUserById } from './store.js'

app.post('/subscribe', authMiddleware, async (req, res) => {
  const { subscription } = req.body
  if (!subscription) {
    return res.status(400).json({ error: 'Subscription requerida.' })
  }
  await updateUser(req.user.id, { pushSubscription: subscription })
  console.log(`[Push] Subscription guardada para: ${req.user.username}`)
  res.json({ ok: true })
})

// ── Test endpoint: send push notification to a user ──
app.post('/api/test/send-push', async (req, res) => {
  const { userId, type, message } = req.body
  const user = await findUserById(userId)
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' })
  if (!user.pushSubscription) return res.status(400).json({ error: 'Usuario sin suscripción push.' })

  sendPushToUser(user.pushSubscription, {
    type: type || 'invitacion-amistad',
    message: message || '¡Alguien quiere ser tu amigo!',
  })

  console.log(`[Test Push] Enviada a ${user.username}: ${type}`)
  res.json({ ok: true, sentTo: user.username })
})

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n🚀 PokePWA API Server en http://localhost:${PORT}`)
  console.log(`   Auth:    /api/auth`)
  console.log(`   Users:   /api/users`)
  console.log(`   Friends: /api/friends`)
  console.log(`   Battles: /api/battles`)
  console.log(`   Teams:   /api/teams\n`)
})
