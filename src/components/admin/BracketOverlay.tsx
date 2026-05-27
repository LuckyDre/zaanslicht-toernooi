'use client'

import { Match, Tournament, Standing } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface FinaleStat {
  teamId: string
  name: string
  color: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  pts: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const PHASE_LABEL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'Kwartfinales',
  semi_final: 'Halve finales',
  final: 'Finale',
  third_place: 'Wedstrijd om 3e plaats',
}
const PHASE_ORDER_MAP: Partial<Record<Match['phase'], number>> = {
  quarter_final: 1, semi_final: 2, third_place: 3, final: 4,
}
const MEDALS = ['🥇', '🥈', '🥉', '4', '5', '6']
const POOL_COLORS = ['#FF6B00', '#3B82F6', '#22c55e', '#a855f7']
const POOL_LABELS_FB = ['A', 'B', 'C', 'D']

function sortStanding(a: Standing, b: Standing) {
  if (b.points !== a.points) return b.points - a.points
  const gdA = a.goals_for - a.goals_against, gdB = b.goals_for - b.goals_against
  if (gdB !== gdA) return gdB - gdA
  return b.goals_for - a.goals_for
}

function sortFinaleStat(a: FinaleStat, b: FinaleStat) {
  if (b.pts !== a.pts) return b.pts - a.pts
  const gdA = a.gf - a.ga, gdB = b.gf - b.ga
  if (gdB !== gdA) return gdB - gdA
  return b.gf - a.gf
}

/** Compute a mini-league ranking from the finale-phase matches */
function computeFinaleRanking(finaleMatches: Match[]): FinaleStat[] {
  const stats: Record<string, FinaleStat> = {}

  const ensure = (id: string, name: string, color: string) => {
    if (!stats[id]) stats[id] = { teamId: id, name, color, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 }
  }

  for (const m of finaleMatches) {
    if (m.status !== 'finished' || m.home_score === null || m.away_score === null) continue
    const hid = m.home_team_id, aid = m.away_team_id
    ensure(hid, m.home_team?.name ?? '?', m.home_team?.color ?? '#888')
    ensure(aid, m.away_team?.name ?? '?', m.away_team?.color ?? '#888')

    const hs = m.home_score, as_ = m.away_score
    stats[hid].played++; stats[aid].played++
    stats[hid].gf += hs; stats[hid].ga += as_
    stats[aid].gf += as_; stats[aid].ga += hs

    if (hs > as_) {
      stats[hid].won++; stats[hid].pts += 3; stats[aid].lost++
    } else if (hs < as_) {
      stats[aid].won++; stats[aid].pts += 3; stats[hid].lost++
    } else {
      stats[hid].drawn++; stats[hid].pts++; stats[aid].drawn++; stats[aid].pts++
    }
  }

  return Object.values(stats).sort(sortFinaleStat)
}

// ── Small components ──────────────────────────────────────────────────────────

function Divider({ label, color = 'var(--text-secondary)' }: { label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 my-1">
      <span className="text-xs font-bold uppercase tracking-wider flex-shrink-0" style={{ color }}>{label}</span>
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
    </div>
  )
}

function DownArrow() {
  return (
    <div className="flex items-center justify-center my-3 gap-2">
      <div className="h-px flex-1" style={{ backgroundColor: 'var(--border)' }} />
      <span className="text-xl" style={{ color: 'var(--text-secondary)', lineHeight: 1 }}>▼</span>
      <div className="h-px flex-1" style={{ backgroundColor: 'var(--border)' }} />
    </div>
  )
}

/** Compact match card for the bracket — two-row team layout */
function BracketCard({ match }: { match: Match }) {
  const done = match.status === 'finished'
  const homeWins = done && (match.home_score ?? 0) > (match.away_score ?? 0)
  const awayWins = done && (match.away_score ?? 0) > (match.home_score ?? 0)
  const isDraw = done && match.home_score === match.away_score

  const winnerBg = '#f59e0b18'
  const winnerText = '#f59e0b'
  const drawText = '#64748b'

  return (
    <div className="rounded-xl overflow-hidden flex-1"
      style={{ border: `1.5px solid ${done ? (isDraw ? '#64748b55' : '#f59e0b55') : 'var(--border)'}`, backgroundColor: 'var(--bg-card)', minWidth: 0 }}>
      {/* Home row */}
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: homeWins ? winnerBg : 'transparent', borderBottom: '1px solid var(--border)' }}>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: match.home_team?.color ?? 'var(--orange)' }} />
        <span className="flex-1 font-semibold text-sm truncate"
          style={{ color: homeWins ? winnerText : isDraw ? drawText : 'var(--text-primary)' }}>
          {match.home_team?.name ?? 'TBD'}
        </span>
        <span className="font-bold text-sm flex-shrink-0"
          style={{ color: homeWins ? winnerText : isDraw ? drawText : 'var(--text-secondary)' }}>
          {done ? match.home_score : '—'}
        </span>
        {homeWins && <span className="text-xs flex-shrink-0">🏆</span>}
      </div>
      {/* Away row */}
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: awayWins ? winnerBg : 'transparent' }}>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: match.away_team?.color ?? '#888' }} />
        <span className="flex-1 font-semibold text-sm truncate"
          style={{ color: awayWins ? winnerText : isDraw ? drawText : 'var(--text-primary)' }}>
          {match.away_team?.name ?? 'TBD'}
        </span>
        <span className="font-bold text-sm flex-shrink-0"
          style={{ color: awayWins ? winnerText : isDraw ? drawText : 'var(--text-secondary)' }}>
          {done ? match.away_score : '—'}
        </span>
        {awayWins && <span className="text-xs flex-shrink-0">🏆</span>}
      </div>
    </div>
  )
}

/** Winner / champion banner */
function WinnerBanner({ name, color, subtitle = 'Toernooi Winnaar' }: { name: string; color: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl p-5 text-center"
      style={{ background: `linear-gradient(135deg, ${color}22, ${color}11)`, border: `2px solid ${color}` }}>
      <div className="text-4xl mb-2">🏆</div>
      <div className="font-bold text-xl" style={{ color }}>{name}</div>
      <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</div>
    </div>
  )
}

// ── Single-pool knockout bracket ──────────────────────────────────────────────
function SinglePoolBracket({ matches }: { matches: Match[] }) {
  const koMatches = matches.filter(m => m.phase !== 'group')

  // Group by phase
  const byPhase: Partial<Record<Match['phase'], Match[]>> = {}
  for (const m of koMatches) {
    if (!byPhase[m.phase]) byPhase[m.phase] = []
    byPhase[m.phase]!.push(m)
  }

  const phaseSequence: Match['phase'][] = ['quarter_final', 'semi_final', 'final']
  const activePhases = phaseSequence.filter(p => (byPhase[p]?.length ?? 0) > 0)

  // Determine single winner from the final
  const finalMatch = byPhase['final']?.[0]
  const winner = finalMatch?.status === 'finished'
    ? ((finalMatch.home_score ?? 0) >= (finalMatch.away_score ?? 0) ? finalMatch.home_team : finalMatch.away_team)
    : null

  const thirdPlaceMatch = byPhase['third_place']?.[0]

  if (koMatches.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">⏳</p>
        <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Finales nog niet aangemaakt</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Genereer de finales na afloop van de groepsfase.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {winner && (
        <WinnerBanner name={winner.name} color={winner.color ?? '#f59e0b'} />
      )}

      {activePhases.map((phase, idx) => {
        const phaseMatches = [...(byPhase[phase] ?? [])].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))
        const isLast = idx === activePhases.length - 1

        return (
          <div key={phase}>
            <Divider label={PHASE_LABEL[phase] ?? phase} color={phase === 'final' ? '#f59e0b' : 'var(--text-secondary)'} />
            <div className="flex flex-wrap gap-2 mt-2">
              {phaseMatches.map(m => (
                <BracketCard key={m.id} match={m} />
              ))}
            </div>
            {/* Connect to next phase */}
            {!isLast && <DownArrow />}
          </div>
        )
      })}

      {/* 3rd place */}
      {thirdPlaceMatch && (
        <div>
          <Divider label="Wedstrijd om 3e plaats" />
          <div className="flex gap-2 mt-2">
            <BracketCard match={thirdPlaceMatch} />
          </div>
          {thirdPlaceMatch.status === 'finished' && (() => {
            const thirdTeam = (thirdPlaceMatch.home_score ?? 0) >= (thirdPlaceMatch.away_score ?? 0)
              ? thirdPlaceMatch.home_team : thirdPlaceMatch.away_team
            return thirdTeam ? (
              <div className="mt-3 rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: '#cd7f3222', border: '1.5px solid #cd7f3266' }}>
                <span className="text-2xl">🥉</span>
                <div>
                  <p className="font-bold" style={{ color: '#cd7f32' }}>{thirdTeam.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>3e plaats</p>
                </div>
              </div>
            ) : null
          })()}
        </div>
      )}
    </div>
  )
}

// ── Multi-pool finale flowchart ────────────────────────────────────────────────
function MultiPoolFinale({ tournament, matches, standings }: {
  tournament: Tournament
  matches: Match[]
  standings: Standing[]
}) {
  const numPools = tournament.num_pools ?? 1
  const finaleMatches = matches.filter(m => m.phase !== 'group')
  const allFinaleDone = finaleMatches.length > 0 && finaleMatches.every(m => m.status === 'finished' || m.status === 'cancelled')
  const ranking = computeFinaleRanking(finaleMatches)

  // Who qualified per pool (top 2)
  const qualified = Array.from({ length: numPools }, (_, p) => {
    const pool = standings.filter(s => (s.pool ?? 1) === p + 1).sort(sortStanding)
    return {
      pool: p + 1,
      color: POOL_COLORS[p] ?? '#FF6B00',
      label: tournament.pool_names?.[p] ?? `Poule ${POOL_LABELS_FB[p] ?? p + 1}`,
      winner: pool[0] ?? null,
      runnerUp: pool[1] ?? null,
    }
  })

  // Finale matches by round
  const byRound: Record<number, Match[]> = {}
  finaleMatches.forEach(m => {
    const r = m.round ?? 0
    if (!byRound[r]) byRound[r] = []
    byRound[r].push(m)
  })
  const finaleRounds = Object.keys(byRound).map(Number).sort((a, b) => a - b)

  return (
    <div className="flex flex-col gap-4">

      {/* ── Winner banner ── */}
      {allFinaleDone && ranking[0] && (
        <WinnerBanner name={ranking[0].name} color={ranking[0].color} />
      )}

      {/* ── Pool qualifying ── */}
      <div>
        <Divider label="Groepsfase — doorgestroomde teams" />
        <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: `repeat(${Math.min(numPools, 3)}, 1fr)` }}>
          {qualified.map(q => (
            <div key={q.pool} className="rounded-xl p-3"
              style={{ backgroundColor: `${q.color}18`, border: `1.5px solid ${q.color}55` }}>
              <p className="font-bold text-xs mb-2.5" style={{ color: q.color }}>{q.label}</p>
              {q.winner ? (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs leading-none">🥇</span>
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: q.winner.team?.color ?? q.color }} />
                  <span className="text-xs font-semibold truncate">{q.winner.team?.name ?? '?'}</span>
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>—</p>
              )}
              {q.runnerUp ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs leading-none">🥈</span>
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: q.runnerUp.team?.color ?? q.color }} />
                  <span className="text-xs font-semibold truncate">{q.runnerUp.team?.name ?? '?'}</span>
                </div>
              ) : (
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>—</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {finaleRounds.length > 0 && (
        <>
          <DownArrow />

          {/* ── Finale matches per round ── */}
          <div>
            <Divider label="Finale poule — wedstrijden" color="#f59e0b" />
            <div className="flex flex-col gap-4 mt-2">
              {finaleRounds.map((roundNum, ri) => {
                const roundMs = [...byRound[roundNum]].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))
                const roundDone = roundMs.every(m => m.status === 'finished' || m.status === 'cancelled')
                return (
                  <div key={roundNum}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Ronde {ri + 1}
                      </span>
                      {roundDone && <span className="text-xs" style={{ color: '#22c55e' }}>✓ gespeeld</span>}
                    </div>
                    <div className="flex flex-col gap-2">
                      {roundMs.map(m => (
                        <BracketCard key={m.id} match={m} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <DownArrow />

          {/* ── Finale ranking table ── */}
          <div>
            <Divider label="Eindstand finale poule" color={allFinaleDone ? '#f59e0b' : 'var(--text-secondary)'} />
            {ranking.length === 0 ? (
              <p className="text-sm mt-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                Speelt wedstrijden af om de eindstand te zien
              </p>
            ) : (
              <div className="rounded-2xl overflow-hidden mt-2" style={{ border: '1px solid var(--border)' }}>
                {/* Column headers */}
                <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase"
                  style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                  <span className="w-5">#</span>
                  <span className="flex-1">Team</span>
                  <span className="w-8 text-center">Gs</span>
                  <span className="w-8 text-center">W</span>
                  <span className="w-8 text-center">G</span>
                  <span className="w-8 text-center">V</span>
                  <span className="w-10 text-center">Doelpnt</span>
                  <span className="w-8 text-center font-black">Pt</span>
                </div>
                {ranking.map((stat, i) => {
                  const isFirst = i === 0 && allFinaleDone
                  const gd = stat.gf - stat.ga
                  return (
                    <div key={stat.teamId}
                      className="flex items-center gap-2 px-4 py-3"
                      style={{
                        borderTop: '1px solid var(--border)',
                        backgroundColor: isFirst ? '#f59e0b0a' : 'var(--bg-card)',
                      }}>
                      <span className="w-5 text-center text-sm leading-none">
                        {MEDALS[i] ?? `${i + 1}`}
                      </span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: stat.color }} />
                        <span className="font-semibold text-sm truncate"
                          style={{ color: isFirst ? '#f59e0b' : 'var(--text-primary)' }}>
                          {stat.name}
                        </span>
                      </div>
                      <span className="w-8 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{stat.played}</span>
                      <span className="w-8 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{stat.won}</span>
                      <span className="w-8 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{stat.drawn}</span>
                      <span className="w-8 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{stat.lost}</span>
                      <span className="w-10 text-center text-xs" style={{ color: gd > 0 ? '#22c55e' : gd < 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                        {stat.gf}–{stat.ga}
                      </span>
                      <span className="w-8 text-center text-sm font-black"
                        style={{ color: isFirst ? '#f59e0b' : 'var(--text-primary)' }}>
                        {stat.pts}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {finaleRounds.length === 0 && (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">⏳</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Finale poule nog niet aangemaakt</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Sluit alle groepswedstrijden af en genereer de finale rondes.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main overlay export ────────────────────────────────────────────────────────
export function BracketOverlay({ tournament, matches, standings, onClose }: {
  tournament: Tournament
  matches: Match[]
  standings: Standing[]
  onClose: () => void
}) {
  const isMultiPool = (tournament.num_pools ?? 1) > 1

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-0.5"
            style={{ color: 'var(--text-secondary)' }}>
            {isMultiPool ? 'Finale poule overzicht' : 'Toernooi bracket'}
          </p>
          <h2 className="font-bold text-lg leading-tight">{tournament.name}</h2>
        </div>
        <button onClick={onClose}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg cursor-pointer active:scale-95 transition-transform flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {isMultiPool ? (
          <MultiPoolFinale tournament={tournament} matches={matches} standings={standings} />
        ) : (
          <SinglePoolBracket matches={matches} />
        )}
      </div>
    </div>
  )
}
