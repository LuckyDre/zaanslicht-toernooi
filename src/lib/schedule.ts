export type MatchSlot = {
  homeTeamIndex: number
  awayTeamIndex: number
  round: number
  fieldIndex: number
  matchNumber: number
}

/**
 * Core scheduler.
 * teamsByPool[p] = array of team-indices that belong to pool p.
 * Only generates intra-pool matches.
 * Matches from different pools are interleaved so they happen simultaneously.
 * Correctly splits into physical time-slots of ≤ numFields matches.
 */
export function generateSchedule(
  numFields: number,
  teamsByPool: number[][],
): MatchSlot[] {
  // Build a list-of-rounds per pool using the circle/rotation algorithm
  const poolRoundLists = teamsByPool.map(poolTeams => {
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
  })

  const maxAlgoRounds = Math.max(...poolRoundLists.map(r => r.length), 0)

  const slots: MatchSlot[] = []
  let matchNumber = 1
  let globalRound = 1

  for (let algoRound = 0; algoRound < maxAlgoRounds; algoRound++) {
    // Combine all pools' matches for this algo-round
    const combined: [number, number][] = []
    poolRoundLists.forEach(poolRounds => {
      if (algoRound < poolRounds.length) combined.push(...poolRounds[algoRound])
    })

    // Split into physical time-slots of numFields
    for (let i = 0; i < combined.length; i += numFields) {
      const chunk = combined.slice(i, i + numFields)
      chunk.forEach(([home, away], fieldIdx) => {
        slots.push({
          homeTeamIndex: home,
          awayTeamIndex: away,
          round: globalRound,
          fieldIndex: fieldIdx,
          matchNumber: matchNumber++,
        })
      })
      globalRound++
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
