import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { updateUser } from '../store.js'

const router = Router()

router.get('/me', authMiddleware, (req, res) => {
  res.json({ team: req.user.team || [] })
})

router.put('/me', authMiddleware, async (req, res) => {
  const { team } = req.body

  if (!Array.isArray(team)) {
    return res.status(400).json({ error: 'El equipo debe ser un array.' })
  }

  if (team.length > 6) {
    return res.status(400).json({ error: 'El equipo no puede tener más de 6 Pokémon.' })
  }

  // Validate each pokemon entry
  const sanitized = team.map((p) => ({
    id: p.id,
    name: p.name,
    sprite: p.sprite,
    types: p.types || [],
  }))

  await updateUser(req.user.id, { team: sanitized })

  console.log(`[Teams] ${req.user.username} actualizó su equipo (${sanitized.length} Pokémon)`)
  res.json({ team: sanitized })
})

export default router
