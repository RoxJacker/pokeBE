import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import {
  createBattle,
  getBattles,
  findBattleById,
  updateBattle,
  findUserById,
  sanitizeUser,
} from '../store.js'
import {
  calculateDamage,
  calculateHP,
  calculateStat,
  resolveTurn,
  selectBattleMoves,
  getTypeMultiplier,
} from '../battleEngine.js'

const router = Router()

let sendPushToUser = null
export function setSendPush(fn) {
  sendPushToUser = fn
}

let io = null
export function setIo(ioInstance) {
  io = ioInstance
}

router.post('/challenge', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.body

    if (!friendId) return res.status(400).json({ error: 'friendId es obligatorio.' })

    const target = await findUserById(friendId)
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' })

    if (target.id.toString() === req.user.id.toString()) {
      return res.status(400).json({ error: 'No puedes retarte a ti mismo.' })
    }

    const battle = await createBattle(req.user.id, target.id)

    if (sendPushToUser && target.pushSubscription) {
      sendPushToUser(target.pushSubscription, {
        type: 'reto-batalla',
        message: `¡${req.user.username} te ha desafiado a una batalla Pokémon!`,
        url: '/friends',
      })
    }

    console.log(`[Battle] ${req.user.username} reta a ${target.username}`)
    res.status(201).json({ battle, challengedUser: sanitizeUser(target) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

router.get('/', authMiddleware, async (req, res) => {
  try {
    const all = await getBattles(req.user.id)

    const enriched = await Promise.all(all.map(async (b) => {
      const challenger = await findUserById(b.challengerId)
      const challenged = await findUserById(b.challengedId)
      return {
        id: b._id.toString(),
        challengerId: b.challengerId.toString(),
        challengedId: b.challengedId.toString(),
        status: b.status,
        state: b.state,
        createdAt: b.createdAt,
        challenger: sanitizeUser(challenger),
        challenged: sanitizeUser(challenged),
        direction: b.challengerId.toString() === req.user.id.toString() ? 'sent' : 'received',
      }
    }))

    res.json({ battles: enriched })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error del servidor' })
  }
})

router.post('/:id/accept', authMiddleware, async (req, res) => {
  const battle = await findBattleById(req.params.id)
  if (!battle) return res.status(404).json({ error: 'Batalla no encontrada.' })
  if (battle.challengedId.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'No autorizado.' })
  if (battle.status !== 'pending') return res.status(400).json({ error: 'La batalla ya fue procesada.' })

  const updated = await updateBattle(battle.id, { status: 'accepted' })

  // Notify via socket
  if (io) {
    io.to(`battle:${battle._id.toString()}`).emit('battle-accepted', {
      battleId: battle._id.toString(),
      status: 'accepted',
    })
  }

  res.json({ message: 'Reto aceptado. Selecciona tu equipo.', battle: updated })
})

router.post('/:id/decline', authMiddleware, async (req, res) => {
  const battle = await findBattleById(req.params.id)
  if (!battle) return res.status(404).json({ error: 'Batalla no encontrada.' })
  if (battle.challengedId.toString() !== req.user.id.toString()) return res.status(403).json({ error: 'No autorizado.' })

  const updated = await updateBattle(battle.id, { status: 'declined' })

  // Notify via socket
  if (io) {
    io.to(`battle:${battle._id.toString()}`).emit('battle-update', {
      battleId: battle._id.toString(),
      status: 'declined',
    })
  }

  res.json({ message: 'Reto rechazado.', battle: updated })
})

router.post('/:id/start', authMiddleware, async (req, res) => {
  try {
    const battle = await findBattleById(req.params.id)
    if (!battle) return res.status(404).json({ error: 'Batalla no encontrada.' })

    const userIdStr = req.user.id.toString()
    if (userIdStr !== battle.challengerId.toString() && userIdStr !== battle.challengedId.toString()) {
      return res.status(403).json({ error: 'No eres parte de esta batalla.' })
    }

    if (battle.status !== 'accepted' && battle.status !== 'team_select') {
      return res.status(400).json({ error: 'La batalla no está en estado de selección de equipo.' })
    }

    const { team } = req.body
    if (!team || !Array.isArray(team) || team.length === 0 || team.length > 6) {
      return res.status(400).json({ error: 'Envía un equipo de 1 a 6 Pokémon (IDs).' })
    }

    const pokemonTeam = await Promise.all(
      team.map(async (pokemonId) => {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`)
        if (!response.ok) throw new Error(`Pokémon ${pokemonId} no encontrado`)
        const data = await response.json()

        const statsMap = {}
        data.stats.forEach((s) => {
          statsMap[s.stat.name] = s.base_stat
        })

        const hp = calculateHP(statsMap.hp)

        const moveUrls = data.moves.slice(0, 20).map((m) => m.move.url)
        const moveDetails = await Promise.all(
          moveUrls.map(async (url) => {
            try {
              const mRes = await fetch(url)
              const mData = await mRes.json()
              return {
                name: mData.name.replace(/-/g, ' '),
                type: mData.type.name,
                power: mData.power,
                accuracy: mData.accuracy,
                damage_class: mData.damage_class.name,
              }
            } catch {
              return null
            }
          }),
        )

        const validMoves = moveDetails.filter((m) => m !== null)
        const battleMoves = selectBattleMoves(validMoves)

        return {
          id: data.id,
          name: data.name,
          sprite: data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default,
          spriteBack: data.sprites?.back_default || data.sprites?.front_default,
          types: data.types.map((t) => t.type.name),
          stats: {
            hp: statsMap.hp,
            attack: calculateStat(statsMap.attack),
            defense: calculateStat(statsMap.defense),
            'special-attack': calculateStat(statsMap['special-attack']),
            'special-defense': calculateStat(statsMap['special-defense']),
            speed: calculateStat(statsMap.speed),
          },
          maxHp: hp,
          currentHp: hp,
          moves: battleMoves,
        }
      }),
    )

    let state = battle.state
    if (!state || !state.players) {
      state = { players: [null, null], turn: 1, pendingMoves: {}, log: [] }
    }

    const playerIndex = userIdStr === battle.challengerId.toString() ? 0 : 1
    state.players[playerIndex] = {
      userId: userIdStr,
      username: req.user.username,
      team: pokemonTeam,
      activePokemonIndex: 0,
    }

    if (state.players[0] && state.players[1]) {
      await updateBattle(battle.id, { status: 'active', state })

      const otherUserId = userIdStr === battle.challengerId.toString() ? battle.challengedId : battle.challengerId
      const otherUser = await findUserById(otherUserId)
      if (sendPushToUser && otherUser?.pushSubscription) {
        sendPushToUser(otherUser.pushSubscription, {
          type: 'batalla-inicio',
          message: `¡La batalla contra ${req.user.username} ha comenzado!`,
          url: `/battle/${battle.id}`,
        })
      }

      // Notify both players via socket that the battle started
      if (io) {
        const p1Id = state.players[0].userId
        const p2Id = state.players[1].userId
        io.to(`battle:${battle._id.toString()}`).emit('battle-started', {
          battleId: battle._id.toString(),
          state: {
            [p1Id]: sanitizeBattleState(state, p1Id),
            [p2Id]: sanitizeBattleState(state, p2Id),
          },
        })
      }

      console.log(`[Battle] ¡Batalla ${battle.id} iniciada!`)
      res.json({ message: '¡Batalla iniciada!', battle, ready: true })
    } else {
      await updateBattle(battle.id, { status: 'team_select', state })
      console.log(`[Battle] ${req.user.username} seleccionó equipo. Esperando al oponente.`)
      res.json({ message: 'Equipo registrado. Esperando al oponente...', ready: false })
    }
  } catch (err) {
    console.error('[Battle] Error al iniciar batalla:', err)
    res.status(500).json({ error: 'Error al preparar la batalla.' })
  }
})

router.post('/:id/turn', authMiddleware, async (req, res) => {
  const battle = await findBattleById(req.params.id)
  if (!battle) return res.status(404).json({ error: 'Batalla no encontrada.' })
  if (battle.status !== 'active') return res.status(400).json({ error: 'La batalla no está activa.' })

  const userIdStr = req.user.id.toString()
  if (userIdStr !== battle.challengerId.toString() && userIdStr !== battle.challengedId.toString()) {
    return res.status(403).json({ error: 'No eres parte de esta batalla.' })
  }

  const { moveIndex } = req.body
  if (moveIndex === undefined || moveIndex < 0 || moveIndex > 3) {
    return res.status(400).json({ error: 'moveIndex debe ser 0-3.' })
  }

  const state = battle.state
  if (!state.pendingMoves) state.pendingMoves = {}
  state.pendingMoves[userIdStr] = { moveIndex }

  const p1Id = state.players[0].userId
  const p2Id = state.players[1].userId

  if (state.pendingMoves[p1Id] && state.pendingMoves[p2Id]) {
    const events = resolveTurn(state, state.pendingMoves[p1Id], state.pendingMoves[p2Id])

    state.log.push({
      turn: state.turn - 1,
      events,
    })

    state.pendingMoves = {}

    await updateBattle(battle.id, { state, status: battle.status })

    const otherUserId = userIdStr === p1Id ? p2Id : p1Id
    const otherUser = await findUserById(otherUserId)
    if (sendPushToUser && otherUser?.pushSubscription) {
      sendPushToUser(otherUser.pushSubscription, {
        type: 'batalla-turno',
        message: `¡El turno se ha resuelto! Revisa la batalla.`,
        url: `/battle/${battle.id}`,
      })
    }

    res.json({
      message: 'Turno resuelto.',
      events,
      state: sanitizeBattleState(state, userIdStr),
      battleStatus: battle.status,
    })
  } else {
    // Need to save the pending move without triggering update of array issues loosely in Mixed
    // Using Mongoose update to ensure Mixed field saves
    await updateBattle(battle.id, { state })
    res.json({
      message: 'Movimiento registrado. Esperando al oponente...',
      waiting: true,
      state: sanitizeBattleState(state, userIdStr),
    })
  }
})

router.post('/:id/switch', authMiddleware, async (req, res) => {
  const battle = await findBattleById(req.params.id)
  if (!battle) return res.status(404).json({ error: 'Batalla no encontrada.' })
  if (battle.status !== 'active') return res.status(400).json({ error: 'La batalla no está activa.' })

  const userIdStr = req.user.id.toString()
  const playerIndex = battle.state.players.findIndex((p) => p.userId === userIdStr)
  if (playerIndex === -1) return res.status(403).json({ error: 'No eres parte de esta batalla.' })

  const { pokemonIndex } = req.body
  const player = battle.state.players[playerIndex]

  if (pokemonIndex === undefined || pokemonIndex < 0 || pokemonIndex >= player.team.length) {
    return res.status(400).json({ error: 'Índice de Pokémon inválido.' })
  }

  const target = player.team[pokemonIndex]
  if (target.currentHp <= 0) {
    return res.status(400).json({ error: 'Ese Pokémon está debilitado.' })
  }

  player.activePokemonIndex = pokemonIndex
  await updateBattle(battle.id, { state: battle.state })

  console.log(`[Battle] ${req.user.username} envió a ${target.name}`)
  res.json({
    message: `¡Adelante, ${target.name}!`,
    state: sanitizeBattleState(battle.state, userIdStr),
  })
})

router.get('/:id/state', authMiddleware, async (req, res) => {
  const battle = await findBattleById(req.params.id)
  if (!battle) return res.status(404).json({ error: 'Batalla no encontrada.' })

  const userIdStr = req.user.id.toString()
  if (userIdStr !== battle.challengerId.toString() && userIdStr !== battle.challengedId.toString()) {
    return res.status(403).json({ error: 'No eres parte de esta batalla.' })
  }

  if (!battle.state) {
    return res.json({ status: battle.status, state: null })
  }

  res.json({
    status: battle.status,
    state: sanitizeBattleState(battle.state, userIdStr),
    winnerId: battle.winnerId || null,
  })
})

function sanitizeBattleState(state, userIdStr) {
  const playerIndex = state.players.findIndex((p) => p.userId === userIdStr)
  const opponentIndex = playerIndex === 0 ? 1 : 0

  const player = state.players[playerIndex]
  const opponent = state.players[opponentIndex]

  return {
    turn: state.turn,
    myTeam: player.team,
    myActivePokemonIndex: player.activePokemonIndex,
    opponentTeam: opponent.team.map((p) => ({
      id: p.id,
      name: p.name,
      sprite: p.sprite,
      types: p.types,
      currentHp: p.currentHp,
      maxHp: p.maxHp,
    })),
    opponentActivePokemonIndex: opponent.activePokemonIndex,
    opponentUsername: opponent.username,
    myUsername: player.username,
    hasPendingMove: !!state.pendingMoves?.[userIdStr],
    log: state.log,
  }
}

export default router
