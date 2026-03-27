/**
 * push-server.js — Servidor Express con soporte Web Push (VAPID)
 * PokePWA — Fase 4
 *
 * Uso:
 *   1. npm install (express, cors, web-push, dotenv ya instalados)
 *   2. node push-server.js  → la primera vez imprime las VAPID keys
 *      copia el output a .env y vuelve a ejecutar.
 *   3. POST http://localhost:3001/subscribe   { subscription: PushSubscription }
 *   4. POST http://localhost:3001/send-notification { type: "invitacion-amistad" | "reto-batalla", message?: string }
 */

import express from 'express'
import cors from 'cors'
import webpush from 'web-push'
import dotenv from 'dotenv'
import { readFileSync, writeFileSync, existsSync } from 'fs'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// ── VAPID Keys ────────────────────────────────────────────────
// Si no existen en .env, generar y mostrar en consola para que
// el usuario las copie a su .env
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  const vapidKeys = webpush.generateVAPIDKeys()
  VAPID_PUBLIC_KEY = vapidKeys.publicKey
  VAPID_PRIVATE_KEY = vapidKeys.privateKey

  console.log('\n⚠  VAPID keys generadas — cópialas a tu archivo .env:\n')
  console.log(`VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}`)
  console.log(`VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}`)
  console.log(`VAPID_MAILTO=mailto:admin@pokepwa.com\n`)

  // Escribir automáticamente un .env si no existe
  if (!existsSync('.env')) {
    writeFileSync(
      '.env',
      `VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}\nVAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}\nVAPID_MAILTO=mailto:admin@pokepwa.com\nPORT=3001\n`,
    )
    console.log('✔  Archivo .env creado automáticamente.\n')
  }
}

webpush.setVapidDetails(
  process.env.VAPID_MAILTO || 'mailto:admin@pokepwa.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
)

// ── Almacén en memoria de subscripciones ─────────────────────
// En producción usa una base de datos (MongoDB, PostgreSQL, etc.)
const subscriptions = []

// ── Endpoints ─────────────────────────────────────────────────

/**
 * GET /
 * Ruta raíz — muestra info del servidor
 */
app.get('/', (req, res) => {
  res.json({
    name: 'PokePWA Push Server',
    status: 'running',
    endpoints: {
      'GET /vapid-public-key': 'Obtener clave pública VAPID',
      'POST /subscribe': 'Registrar una suscripción push',
      'POST /send-notification': 'Enviar notificación (type: invitacion-amistad | reto-batalla)',
    },
    subscribers: subscriptions.length,
  })
})

/**
 * GET /vapid-public-key
 * El frontend lo llama para obtener la clave pública VAPID
 * antes de suscribirse.
 */
app.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY })
})

/**
 * POST /subscribe
 * Body: { subscription: PushSubscription }
 * Guarda la subscripción del usuario.
 */
app.post('/subscribe', (req, res) => {
  const { subscription } = req.body

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Subscripción inválida.' })
  }

  // Evitar duplicados por endpoint
  const exists = subscriptions.find((s) => s.endpoint === subscription.endpoint)
  if (!exists) {
    subscriptions.push(subscription)
    console.log('[Push] Nueva subscripción guardada. Total:', subscriptions.length)
  }

  res.status(201).json({ message: 'Subscripción registrada correctamente.' })
})

/**
 * POST /send-notification
 * Body: { type: "invitacion-amistad" | "reto-batalla", message?: string, url?: string }
 * Envía una notificación push a todos los suscriptores.
 */
app.post('/send-notification', async (req, res) => {
  const { type, message, url } = req.body

  if (!type) {
    return res.status(400).json({ error: 'El campo "type" es obligatorio.' })
  }

  if (subscriptions.length === 0) {
    return res.status(404).json({ error: 'No hay suscriptores registrados.' })
  }

  const payload = JSON.stringify({ type, message, url: url || '/' })

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(sub, payload).catch((err) => {
        console.error('[Push] Error enviando a:', sub.endpoint, err.statusCode)
        // Eliminar subscripciones expiradas (410 Gone)
        if (err.statusCode === 410) {
          const idx = subscriptions.indexOf(sub)
          if (idx !== -1) subscriptions.splice(idx, 1)
        }
        throw err
      }),
    ),
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length

  console.log(`[Push] Notificaciones enviadas: ${succeeded} ok, ${failed} fallidas.`)
  res.json({ sent: succeeded, failed, type })
})

// ── Inicio del servidor ───────────────────────────────────────
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`\n🚀 Push Server PokePWA corriendo en http://localhost:${PORT}`)
  console.log(`   GET  /vapid-public-key`)
  console.log(`   POST /subscribe`)
  console.log(`   POST /send-notification\n`)
})
