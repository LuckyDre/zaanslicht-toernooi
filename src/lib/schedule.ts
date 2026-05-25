export type MatchSlot = {
  homeTeamIndex: number
  awayTeamIndex: number
  round: number
  fieldIndex: number
  matchNumber: number
}

export function generateRoundRobin(numTeams: number, numFields: number): MatchSlot[] {
  const teams = Array.from({ length: numTeams }, (_, i) => i)
  const slots: MatchSlot[] = []
  let matchNumber = 1

  // Add bye team if odd number
  const t = numTeams % 2 === 0 ? [...teams] : [...teams, -1]
  const n = t.length
  const rounds: [number, number][][] = []

  for (let round = 0; round < n - 1; round++) {
    const roundMatches: [number, number][] = []
    for (let i = 0; i < n / 2; i++) {
      const home = t[i]
      const away = t[n - 1 - i]
      if (home !== -1 && away !== -1) {
        roundMatches.push([home, away])
      }
    }
    rounds.push(roundMatches)
    // Rotate: keep t[0] fixed, rotate rest
    t.splice(1, 0, t.pop()!)
  }

  let roundNum = 1
  for (const roundMatches of rounds) {
    roundMatches.forEach((match, idx) => {
      slots.push({
        homeTeamIndex: match[0],
        awayTeamIndex: match[1],
        round: roundNum,
        fieldIndex: idx % numFields,
        matchNumber: matchNumber++,
      })
    })
    roundNum++
  }

  return slots
}

export function calculateScheduledTime(
  slot: MatchSlot,
  numFields: number,
  matchDurationMinutes: number,
  startTime: Date
): Date {
  // Within a round, matches on different fields run in parallel
  // Each "wave" is ceil(matchesInRound / numFields) * matchDuration
  const time = new Date(startTime)
  time.setMinutes(time.getMinutes() + (slot.round - 1) * matchDurationMinutes)
  return time
}
