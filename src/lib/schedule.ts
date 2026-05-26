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
 * Core scheduler.
 *
 * Single pool  → fills all available fields per time-slot (original behaviour).
 * Multi-pool   → each pool is assigned a dedicated field (pool p → field p % numFields).
 *                Pools play simultaneously, each on their own field.
 *                If more pools than fields, extra pools cycle back to field 0, 1, …
 *                and are queued sequentially behind the first pool on that field.
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
    for (let algoRound = 0; algoRound < maxAlgoRounds; algoRound++) {
      const combined = poolRoundLists[0][algoRound]
      for (let i = 0; i < combined.length; i += numFields) {
        const chunk = combined.slice(i, i + numFields)
        chunk.forEach(([home, away], fieldIdx) => {
          slots.push({ homeTeamIndex: home, awayTeamIndex: away, round: globalRound, fieldIndex: fieldIdx, matchNumber: matchNumber++ })
        })
        globalRound++
      }
    }
    return slots
  }

  // ── Multi-pool: dedicated field per pool (pool p → field p % numFields) ──
  for (let algoRound = 0; algoRound < maxAlgoRounds; algoRound++) {
    // Build a queue of matches per field for this algo-round.
    // Pools sharing a field are concatenated (played sequentially on that field).
    const fieldQueues = new Map<number, [number, number][]>()
    poolRoundLists.forEach((poolRounds, p) => {
      if (algoRound >= poolRounds.length) return
      const f = p % numFields
      if (!fieldQueues.has(f)) fieldQueues.set(f, [])
      fieldQueues.get(f)!.push(...poolRounds[algoRound])
    })

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
