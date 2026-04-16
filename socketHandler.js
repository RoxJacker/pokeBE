/**
 * socketHandler.js — Socket.io handler for real-time battles
 * Manages rooms, turn resolution, and Pokémon switching via WebSockets
 */

import {
  findBattleById,
  updateBattle,
  findUserById,
  sanitizeUser,
} from './store.js'
import { resolveTurn } from './battleEngine.js'

export function initSocketHandler(io, sendPushToUser) {
  // ── Authentication middleware (base64 token = userId) ───
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Token requerido'))

    try {
      const userId = Buffer.from(token, 'base64').toString('utf-8')
      const user = await findUserById(userId)
      if (!user) return next(new Error('Usuario no encontrado'))

      socket.userId = user._id.toString()
      socket.username = user.username
      next()
    } catch {
      next(new Error('Token inválido'))
    }
  })

  io.on('connection', (socket) => {
    console.log(`[Socket] ✔ Conectado: ${socket.username} (${socket.userId})`)

    // ── Join a battle room ──────────────────────────────
    socket.on('join-battle', async ({ battleId }) => {
      try {
        const battle = await findBattleById(battleId)
        if (!battle) {
          return socket.emit('error', { message: 'Batalla no encontrada.' })
        }

        const uid = socket.userId
        if (
          uid !== battle.challengerId.toString() &&
          uid !== battle.challengedId.toString()
        ) {
          return socket.emit('error', { message: 'No eres parte de esta batalla.' })
        }

        const room = `battle:${battleId}`
        socket.join(room)
        console.log(`[Socket] ${socket.username} se unió a ${room}`)

        // Send current state to the joining player
        if (battle.state) {
          socket.emit('battle-state', {
            status: battle.status,
            state: sanitizeBattleState(battle.state, uid),
            winnerId: battle.winnerId || null,
          })
        }
      } catch (err) {
        console.error('[Socket] Error en join-battle:', err)
        socket.emit('error', { message: 'Error al unirse a la batalla.' })
      }
    })

    // ── Submit a move ───────────────────────────────────
    socket.on('submit-move', async ({ battleId, moveIndex }) => {
      try {
        const battle = await findBattleById(battleId)
        if (!battle) return socket.emit('error', { message: 'Batalla no encontrada.' })
        if (battle.status !== 'active') return socket.emit('error', { message: 'La batalla no está activa.' })

        const uid = socket.userId
        if (
          uid !== battle.challengerId.toString() &&
          uid !== battle.challengedId.toString()
        ) {
          return socket.emit('error', { message: 'No eres parte de esta batalla.' })
        }

        if (moveIndex === undefined || moveIndex < 0 || moveIndex > 3) {
          return socket.emit('error', { message: 'moveIndex debe ser 0-3.' })
        }

        const state = battle.state
        if (!state.pendingMoves) state.pendingMoves = {}
        state.pendingMoves[uid] = { moveIndex }

        const p1Id = state.players[0].userId
        const p2Id = state.players[1].userId
        const room = `battle:${battleId}`

        if (state.pendingMoves[p1Id] && state.pendingMoves[p2Id]) {
          // Both moves are in — resolve the turn
          const events = resolveTurn(state, state.pendingMoves[p1Id], state.pendingMoves[p2Id])

          state.log.push({ turn: state.turn - 1, events })
          state.pendingMoves = {}

          await updateBattle(battle.id, { state, status: battle.status })

          // Emit resolved turn to BOTH players in the room
          io.to(room).emit('turn-resolved', {
            events,
            state: {
              // Send each player their sanitized view
              [p1Id]: sanitizeBattleState(state, p1Id),
              [p2Id]: sanitizeBattleState(state, p2Id),
            },
            battleStatus: battle.status,
            winnerId: battle.winnerId || null,
          })

          console.log(`[Socket] Turno resuelto en batalla ${battleId}`)
        } else {
          // Only one player has submitted — wait for the other
          await updateBattle(battle.id, { state })

          // Notify the submitter
          socket.emit('move-registered', { waiting: true })

          // Notify the opponent that a move is pending
          socket.to(room).emit('opponent-move-pending')

          console.log(`[Socket] ${socket.username} registró movimiento. Esperando oponente.`)
        }
      } catch (err) {
        console.error('[Socket] Error en submit-move:', err)
        socket.emit('error', { message: 'Error al procesar movimiento.' })
      }
    })

    // ── Switch Pokémon ──────────────────────────────────
    socket.on('switch-pokemon', async ({ battleId, pokemonIndex }) => {
      try {
        const battle = await findBattleById(battleId)
        if (!battle) return socket.emit('error', { message: 'Batalla no encontrada.' })
        if (battle.status !== 'active') return socket.emit('error', { message: 'La batalla no está activa.' })

        const uid = socket.userId
        const playerIndex = battle.state.players.findIndex(p => p.userId === uid)
        if (playerIndex === -1) return socket.emit('error', { message: 'No eres parte de esta batalla.' })

        const player = battle.state.players[playerIndex]

        if (pokemonIndex === undefined || pokemonIndex < 0 || pokemonIndex >= player.team.length) {
          return socket.emit('error', { message: 'Índice de Pokémon inválido.' })
        }

        const target = player.team[pokemonIndex]
        if (target.currentHp <= 0) {
          return socket.emit('error', { message: 'Ese Pokémon está debilitado.' })
        }

        player.activePokemonIndex = pokemonIndex
        await updateBattle(battle.id, { state: battle.state })

        const room = `battle:${battleId}`
        const p1Id = battle.state.players[0].userId
        const p2Id = battle.state.players[1].userId

        // Emit updated state to both players
        io.to(room).emit('pokemon-switched', {
          userId: uid,
          pokemonName: target.name,
          state: {
            [p1Id]: sanitizeBattleState(battle.state, p1Id),
            [p2Id]: sanitizeBattleState(battle.state, p2Id),
          },
        })

        console.log(`[Socket] ${socket.username} envió a ${target.name}`)
      } catch (err) {
        console.error('[Socket] Error en switch-pokemon:', err)
        socket.emit('error', { message: 'Error al cambiar Pokémon.' })
      }
    })

    // ── Leave battle room ───────────────────────────────
    socket.on('leave-battle', ({ battleId }) => {
      const room = `battle:${battleId}`
      socket.leave(room)
      console.log(`[Socket] ${socket.username} salió de ${room}`)
    })

    // ── Disconnect ──────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] ✖ Desconectado: ${socket.username} (${reason})`)
    })
  })

  return io
}

// ── Helper: sanitize battle state per player ──────────────
function sanitizeBattleState(state, userIdStr) {
  const playerIndex = state.players.findIndex(p => p.userId === userIdStr)
  const opponentIndex = playerIndex === 0 ? 1 : 0

  const player = state.players[playerIndex]
  const opponent = state.players[opponentIndex]

  return {
    turn: state.turn,
    myTeam: player.team,
    myActivePokemonIndex: player.activePokemonIndex,
    opponentTeam: opponent.team.map(p => ({
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
