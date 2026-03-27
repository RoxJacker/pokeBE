/**
 * battleEngine.js — Pokémon Battle Engine
 * Damage calculation (Gen V simplified), type chart, turn resolution
 */

// ============================================================
// TYPE EFFECTIVENESS CHART (18 types)
// ============================================================
// 2 = super effective, 0.5 = not very effective, 0 = immune, 1 = normal
const TYPES = [
  'normal','fire','water','electric','grass','ice',
  'fighting','poison','ground','flying','psychic',
  'bug','rock','ghost','dragon','dark','steel','fairy'
]

const TYPE_CHART = {
  normal:   { rock: 0.5, ghost: 0, steel: 0.5 },
  fire:     { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water:    { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass:    { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice:      { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison:   { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground:   { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying:   { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic:  { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug:      { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock:     { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost:    { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon:   { dragon: 2, steel: 0.5, fairy: 0 },
  dark:     { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel:    { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy:    { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
}

/**
 * Get type effectiveness multiplier for a move type vs defender types
 */
export function getTypeMultiplier(moveType, defenderTypes) {
  let multiplier = 1
  const chart = TYPE_CHART[moveType] || {}
  for (const defType of defenderTypes) {
    const eff = chart[defType]
    if (eff !== undefined) multiplier *= eff
  }
  return multiplier
}

/**
 * Check if a move gets STAB (Same Type Attack Bonus)
 */
function getSTAB(moveType, attackerTypes) {
  return attackerTypes.includes(moveType) ? 1.5 : 1
}

/**
 * Calculate damage using simplified Gen V formula
 * Level is fixed at 50 for fairness
 */
export function calculateDamage(attacker, defender, move) {
  if (!move.power || move.power === 0) return { damage: 0, effectiveness: 1 }

  const level = 50

  // Physical vs Special split
  let atk, def
  if (move.damage_class === 'physical') {
    atk = attacker.stats.attack
    def = defender.stats.defense
  } else {
    atk = attacker.stats['special-attack']
    def = defender.stats['special-defense']
  }

  // Base damage formula
  const baseDamage = ((((2 * level) / 5 + 2) * move.power * (atk / def)) / 50) + 2

  // Modifiers
  const stab = getSTAB(move.type, attacker.types)
  const typeMultiplier = getTypeMultiplier(move.type, defender.types)
  const random = 0.85 + Math.random() * 0.15 // 0.85 to 1.0

  const totalDamage = Math.floor(baseDamage * stab * typeMultiplier * random)

  return {
    damage: Math.max(1, totalDamage), // Minimum 1 damage (unless immune)
    effectiveness: typeMultiplier,
    stab: stab > 1,
  }
}

/**
 * Check if a move hits based on accuracy
 */
function doesMoveHit(move) {
  if (!move.accuracy || move.accuracy === null) return true // Moves like Swift always hit
  return Math.random() * 100 < move.accuracy
}

/**
 * Get effectiveness message
 */
function getEffectivenessMessage(multiplier) {
  if (multiplier === 0) return 'No afecta...'
  if (multiplier >= 2) return '¡Es super efectivo!'
  if (multiplier < 1 && multiplier > 0) return 'No es muy efectivo...'
  return null
}

/**
 * Resolve a single turn where both players have chosen moves
 * Returns an array of events that happened during the turn
 */
export function resolveTurn(battleState, player1Action, player2Action) {
  const events = []
  const p1 = battleState.players[0]
  const p2 = battleState.players[1]

  const p1Active = p1.team[p1.activePokemonIndex]
  const p2Active = p2.team[p2.activePokemonIndex]

  // Determine order by Speed (higher goes first)
  let first, second, firstActive, secondActive, firstAction, secondAction
  if (p1Active.stats.speed >= p2Active.stats.speed) {
    first = p1; second = p2
    firstActive = p1Active; secondActive = p2Active
    firstAction = player1Action; secondAction = player2Action
  } else {
    first = p2; second = p1
    firstActive = p2Active; secondActive = p1Active
    firstAction = player2Action; secondAction = player1Action
  }

  // Execute first player's move
  const firstResult = executeMove(firstActive, secondActive, firstAction, events, first.userId, second.userId)

  // Check if second Pokémon fainted
  if (secondActive.currentHp <= 0) {
    secondActive.currentHp = 0
    events.push({
      type: 'faint',
      pokemon: secondActive.name,
      userId: second.userId,
      message: `¡${secondActive.name} se ha debilitado!`,
    })

    // Check if the player has more Pokémon
    const hasMore = second.team.some((p, i) => i !== second.activePokemonIndex && p.currentHp > 0)
    if (!hasMore) {
      events.push({
        type: 'victory',
        winnerId: first.userId,
        message: `¡${first.username} ha ganado la batalla!`,
      })
      battleState.status = 'finished'
      battleState.winnerId = first.userId
    } else {
      events.push({ type: 'switch_required', userId: second.userId })
    }

    battleState.turn++
    return events
  }

  // Execute second player's move
  const secondResult = executeMove(secondActive, firstActive, secondAction, events, second.userId, first.userId)

  // Check if first Pokémon fainted
  if (firstActive.currentHp <= 0) {
    firstActive.currentHp = 0
    events.push({
      type: 'faint',
      pokemon: firstActive.name,
      userId: first.userId,
      message: `¡${firstActive.name} se ha debilitado!`,
    })

    const hasMore = first.team.some((p, i) => i !== first.activePokemonIndex && p.currentHp > 0)
    if (!hasMore) {
      events.push({
        type: 'victory',
        winnerId: second.userId,
        message: `¡${second.username} ha ganado la batalla!`,
      })
      battleState.status = 'finished'
      battleState.winnerId = second.userId
    } else {
      events.push({ type: 'switch_required', userId: first.userId })
    }
  }

  battleState.turn++
  return events
}

/**
 * Execute a single move and push events
 */
function executeMove(attacker, defender, action, events, attackerUserId, defenderUserId) {
  const move = attacker.moves[action.moveIndex]

  events.push({
    type: 'move',
    pokemon: attacker.name,
    userId: attackerUserId,
    move: move.name,
    message: `¡${attacker.name} usó ${move.name}!`,
  })

  // Check accuracy
  if (!doesMoveHit(move)) {
    events.push({
      type: 'miss',
      pokemon: attacker.name,
      message: `¡${attacker.name} falló el ataque!`,
    })
    return { damage: 0 }
  }

  // Status moves (power = 0 or null)
  if (!move.power) {
    events.push({
      type: 'status_move',
      move: move.name,
      message: `${move.name} fue usado. (Sin efecto de daño en esta versión)`,
    })
    return { damage: 0 }
  }

  const result = calculateDamage(attacker, defender, move)

  if (result.effectiveness === 0) {
    events.push({
      type: 'immune',
      message: `No afecta a ${defender.name}...`,
    })
    return result
  }

  // Apply damage
  defender.currentHp = Math.max(0, defender.currentHp - result.damage)

  events.push({
    type: 'damage',
    target: defender.name,
    targetUserId: defenderUserId,
    damage: result.damage,
    remainingHp: defender.currentHp,
    maxHp: defender.maxHp,
    effectiveness: result.effectiveness,
    stab: result.stab,
  })

  const effMsg = getEffectivenessMessage(result.effectiveness)
  if (effMsg) {
    events.push({ type: 'effectiveness', message: effMsg })
  }

  if (result.stab) {
    events.push({ type: 'info', message: '(Bonificación STAB)' })
  }

  return result
}

/**
 * Calculate HP stat from base stat (simplified, level 50)
 */
export function calculateHP(baseHP) {
  // Simplified: HP = base + 60 (gives a reasonable range)
  return Math.floor(((2 * baseHP) * 50) / 100) + 50 + 10
}

/**
 * Calculate other stat from base stat (simplified, level 50)
 */
export function calculateStat(baseStat) {
  return Math.floor(((2 * baseStat) * 50) / 100) + 5
}

/**
 * Pick 4 offensive moves from a Pokémon's move list
 * Prioritizes damaging moves with higher power
 */
export function selectBattleMoves(allMoves) {
  // Filter to moves with power > 0 and sort by power descending
  const damagingMoves = allMoves
    .filter(m => m.power && m.power > 0)
    .sort((a, b) => b.power - a.power)

  // Pick top 4 diverse type moves if possible
  const selected = []
  const usedTypes = new Set()

  // First pass: one move per type (for coverage)
  for (const move of damagingMoves) {
    if (selected.length >= 4) break
    if (!usedTypes.has(move.type)) {
      selected.push(move)
      usedTypes.add(move.type)
    }
  }

  // Second pass: fill remaining slots with strongest moves
  for (const move of damagingMoves) {
    if (selected.length >= 4) break
    if (!selected.find(m => m.name === move.name)) {
      selected.push(move)
    }
  }

  // If we still don't have 4 moves, add a default "Struggle"
  while (selected.length < 4) {
    selected.push({
      name: 'Forcejeo',
      type: 'normal',
      power: 50,
      accuracy: 100,
      damage_class: 'physical',
    })
  }

  return selected.slice(0, 4)
}
