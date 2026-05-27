export type MatchSlot = {
  homeTeamIndex: number
  awayTeamIndex: number
  round: number
  fieldIndex: number
  matchNumber: number
}

/** Build the circle-rotation round list for a single pool. */
function buildPoolRounds(poolTeams: number[]): [number, number][][] {
  const t = poolTeams.length % 2 === 0
    ? [...poolTeams]
    : [...poolTeams, -1] // -1 = bye
  const n = t.length
  const rounds: [number, number][][] = []
  for (let r = 0; r < n - 1; r++) {
    const roundMatches: [number, number][] = []
    for (let i = 0; i < n / 2; i++) {
      const home = t[i], away = t[n - 1 - i]
      if (home !== -1 && away !== -1) roundMatches.push([home, away])
    }
    rounds.push(roundMatches)
    // Rotate: keep t[0] fixed, rotate the rest
    t.splice(1, 0, t.pop()!)
  }
  return rounds
}

/**
 * Sort matches so teams that played most recently appear as LATE as possible.
 * Priority: 0 tired teams < 1 tired team < 2 tired teams.
 * This minimises consecutive-round appearances at algo-round boundaries.
 */
function restSort(matches: [number, number][], tired: Set<number>): [number, number][] {
  if (tired.size === 0) return matches
  return [...matches].sort((a, b) => {
    const ca = (tired.has(a[0]) ? 1 : 0) + (tired.has(a[1]) ? 1 : 0)
    const cb = (tired.has(b[0]) ? 1 : 0) + (tired.has(b[1]) ? 1 : 0)
    return ca - cb
  })
}

/**
 * Core scheduler.
 *
 * Single pool  → fills all available fields per time-slot.
 *                Rest-aware: teams that played in the previous slot are pushed
 *                to later slots within each algo-round.
 *
 * Multi-pool   → each pool is assigned a dedicated field (pool p → field p % numFields).
 *                Pools play simultaneously, each on their own field.
 *                If more pools than fields, extra pools cycle back to field 0, 1, …
 *                and are queued sequentially behind the first pool on that field.
 *                Rest-aware ordering is applied per field queue.
 */
export function generateSchedule(
  numFields: number,
  teamsByPool: number[][],
): MatchSlot[] {
  const numPools = teamsByPool.length
  const poolRoundLists = teamsByPool.map(buildPoolRounds)
  const maxAlgoRounds = Math.max(...poolRoundLists.map(r => r.length), 0)

  const slots: MatchSlot[] = []
  let matchNumber = 1
  let globalRound = 1

  // ── Single pool: fill all fields per time-slot ───────────────────────────
  if (numPools === 1) {
    let tired = new Set<number>()
    for (let algoRound = 0; algoRound < maxAlgoRounds; algoRound++) {
      // Reorder: push teams that just played to later positions
      const matches = restSort(poolRoundLists[0][algoRound], tired)
      for (let i = 0; i < matches.length; i += numFields) {
        const chunk = matches.slice(i, i + numFields)
        chunk.forEach(([home, away], fieldIdx) => {
          slots.push({ homeTeamIndex: home, awayTeamIndex: away, round: globalRound, fieldIndex: fieldIdx, matchNumber: matchNumber++ })
        })
        // Teams in this slot are now "tired" for the next slot
        tired = new Set(chunk.flatMap(([h, a]) => [h, a]))
        globalRound++
      }
    }
    return slots
  }

  // ── Multi-pool: dedicated field per pool (pool p → field p % numFields) ──
  // Track per-field tired teams for rest-aware ordering within each field queue
  const tiredByField = new Map<number, Set<number>>()

  for (let algoRound = 0; algoRound < maxAlgoRounds; algoRound++) {
    // Collect matches per field for this algo-round
    const fieldQueues = new Map<number, [number, number][]>()
    poolRoundLists.forEach((poolRounds, p) => {
      if (algoRound >= poolRounds.length) return
      const f = p % numFields
      if (!fieldQueues.has(f)) fieldQueues.set(f, [])
      fieldQueues.get(f)!.push(...poolRounds[algoRound])
    })

    // Apply rest-aware ordering to each field's queue
    for (const [f, queue] of fieldQueues) {
      const tired = tiredByField.get(f) ?? new Set<number>()
      fieldQueues.set(f, restSort(queue, tired))
    }

    // Number of time-slots = longest queue across all fields
    const maxQueueLen = Math.max(...Array.from(fieldQueues.values()).map(q => q.length), 0)

    for (let slot = 0; slot < maxQueueLen; slot++) {
      let hasMatches = false
      fieldQueues.forEach((queue, fieldIdx) => {
        const match = queue[slot]
        if (!match) return
        const [home, away] = match
        slots.push({ homeTeamIndex: home, awayTeamIndex: away, round: globalRound, fieldIndex: fieldIdx, matchNumber: matchNumber++ })
        hasMatches = true
        // Update tired teams for this field
        tiredByField.set(fieldIdx, new Set([home, away]))
      })
      if (hasMatches) globalRound++
    }
  }

  return slots
}

/** Convenience wrapper — single pool (no pool division). */
export function generateRoundRobin(numTeams: number, numFields: number): MatchSlot[] {
  return generateSchedule(numFields, [Array.from({ length: numTeams }, (_, i) => i)])
}

/** Preview helper: returns { rounds, matches } for given settings without full slot detail. */
export function previewSchedule(numTeams: number, numFields: number, numPools: number) {
  const teamsByPool = Array.from({ length: numPools }, (_, p) => {
    const size = Math.floor(numTeams / numPools) + (p < numTeams % numPools ? 1 : 0)
    let start = 0
    for (let pp = 0; pp < p; pp++) start += Math.floor(numTeams / numPools) + (pp < numTeams % numPools ? 1 : 0)
    return Array.from({ length: size }, (_, i) => start + i)
  })
  const slots = generateSchedule(numFields, teamsByPool)
  return {
    matches: slots.length,
    rounds: slots.length > 0 ? Math.max(...slots.map(s => s.round)) : 0,
    poolSizes: teamsByPool.map(p => p.length),
  }
}
