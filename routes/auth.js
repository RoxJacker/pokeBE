import { Router } from 'express'
import { createUser, findUserByEmail, sanitizeUser } from '../store.js'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' })
    }

    const user = await createUser({ username, email: email.toLowerCase().trim(), password })
    if (!user) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo.' })
    }

    const token = Buffer.from(user.id).toString('base64')

    console.log(`[Auth] Usuario registrado: ${user.username} (${user.friendCode})`)
    res.status(201).json({ user: await sanitizeUser(user), token })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Error del servidor al registrarse.' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos.' })
    }

    const user = await findUserByEmail(email.toLowerCase().trim())
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' })
    }

    const token = Buffer.from(user.id).toString('base64')

    console.log(`[Auth] Login: ${user.username}`)
    res.json({ user: await sanitizeUser(user), token })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Error del servidor al hacer login.' })
  }
})

export default router
