'use client'

import { useEffect, useState, useMemo, use } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tournament, Match, Standing } from '@/lib/supabase'

// ── Klok ─────────────────────────────────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="font-mono tabular-nums">
      {time.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

// ── Sortering stand ───────────────────────────────────────────────────────────
function sortStanding(a: Standing, b: Standing) {
  if (b.points !== a.points) return b.points - a.points
  const gdA = a.goals_for - a.goals_against, gdB = b.goals_for - b.goals_against
  if (gdB !== gdA) return gdB - gdA
  return b.goals_for - a.goals_for
}

// ── KO-labels ─────────────────────────────────────────────────────────────────
const KO_LABEL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'Kwartfinale', semi_final: 'Halve finale',
  final: 'Finale', third_place: '3e plaats',
}

// ── Wedstrijdkaart ────────────────────────────────────────────────────────────
function MatchCard({ match, fieldName }: { match: Match; fieldName: string }) {
  const isLive = match.status === 'live'
  const isDone = match.status === 'finished'
  const phaseLabel = match.phase !== 'group' ? KO_LABEL[match.phase] : null

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        border: `2px solid ${isLive ? 'var(--orange)' : isDone ? '#22c55e55' : 'var(--border)'}`,
        backgroundColor: isLive ? '#FF6B000D' : 'var(--bg-card)',
        minWidth: 0,
      }}>
      {/* Veld + fase header */}
      <div className="px-4 py-2 flex items-center justify-between gap-2"
        style={{ backgroundColor: isLive ? '#FF6B0022' : 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
        <span className="font-bold text-sm truncate" style={{ color: isLive ? 'var(--orange)' : 'var(--text-secondary)' }}>
          {isLive ? '● ' : ''}{fieldName}{phaseLabel ? ` · ${phaseLabel}` : ''}
        </span>
        {isDone && <span className="text-xs font-bold" style={{ color: '#22c55e' }}>✓ Gespeeld</span>}
      </div>

      {/* Score */}
      <div className="px-4 py-5 flex items-center gap-3">
        {/* Thuisteam */}
        <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-full flex-shrink-0"
            style={{ backgroundColor: match.home_team?.color ?? 'var(--orange)' }} />
          <span className="font-bold text-center leading-tight text-base md:text-lg truncate w-full text-center">
            {match.home_team?.name ?? '—'}
          </span>
        </div>

        {/* Score midden */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <span className="font-black tabular-nums leading-none"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: isLive ? 'var(--orange)' : isDone ? '#22c55e' : 'var(--text-secondary)' }}>
            {match.home_score ?? 0}
          </span>
          <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>–</span>
          <span className="font-black tabular-nums leading-none"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: isLive ? 'var(--orange)' : isDone ? '#22c55e' : 'var(--text-secondary)' }}>
            {match.away_score ?? 0}
          </span>
        </div>

        {/* Uitteam */}
        <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-full flex-shrink-0"
            style={{ backgroundColor: match.away_team?.color ?? '#888' }} />
          <span className="font-bold text-center leading-tight text-base md:text-lg truncate w-full text-center">
            {match.away_team?.name ?? '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Mini-stand tabel ──────────────────────────────────────────────────────────
function StandingTable({ poolStandings, poolName }: { poolStandings: Standing[]; poolName: string }) {
  const sorted = [...poolStandings].sort(sortStanding)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
        <span className="font-bold text-sm" style={{ color: 'var(--orange)' }}>🏆 {poolName}</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
            <th className="text-left px-3 py-1.5 font-semibold w-6">#</th>
            <th className="text-left px-2 py-1.5 font-semibold">Team</th>
            <th className="text-center px-2 py-1.5 font-semibold w-7">G</th>
            <th className="text-center px-2 py-1.5 font-semibold w-7">W</th>
            <th className="text-center px-2 py-1.5 font-semibold w-7">V</th>
            <th className="text-center px-2 py-1.5 font-semibold w-10">Dlt</th>
            <th className="text-center px-2 py-1.5 font-semibold w-8">Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => (
            <tr key={s.team_id}
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <td className="px-3 py-2 font-bold text-center text-xs"
                style={{ color: i === 0 ? 'var(--orange)' : 'var(--text-secondary)' }}>
                {i + 1}
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.team?.color ?? 'var(--orange)' }} />
                  <span className="font-semibold truncate">{s.team?.name ?? '—'}</span>
                </div>
              </td>
              <td className="px-2 py-2 text-center tabular-nums" style={{ color: 'var(--text-secondary)' }}>{s.played}</td>
              <td className="px-2 py-2 text-center tabular-nums" style={{ color: 'var(--text-secondary)' }}>{s.won}</td>
              <td className="px-2 py-2 text-center tabular-nums" style={{ color: 'var(--text-secondary)' }}>{s.lost}</td>
              <td className="px-2 py-2 text-center tabular-nums text-xs" style={{ color: 'var(--text-secondary)' }}>
                {s.goals_for}–{s.goals_against}
              </td>
              <td className="px-2 py-2 text-center font-black tabular-nums"
                style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>
                {s.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────
export default function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches]       = useState<Match[]>([])
  const [standings, setStandings]   = useState<Standing[]>([])
  const [loading, setLoading]       = useState(true)

  type GoalNotif = {
    id: string
    teamName: string
    teamColor: string
    homeTeamName: string
    awayTeamName: string
    homeScore: number
    awayScore: number
  }
  const [goalNotif, setGoalNotif] = useState<GoalNotif | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('tournaments').select('*').eq('id', id).single(),
      supabase.from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
        .eq('tournament_id', id).order('round').order('match_number'),
      supabase.from('standings')
        .select('*, team:teams(*)')
        .eq('tournament_id', id),
    ]).then(([t, m, s]) => {
      setTournament(t.data)
      setMatches(m.data ?? [])
      setStandings(s.data ?? [])
      setLoading(false)
    })
  }, [id])

  // Auto-dismiss goal notificatie na 3 seconden
  useEffect(() => {
    if (!goalNotif) return
    const t = setTimeout(() => setGoalNotif(null), 3000)
    return () => clearTimeout(t)
  }, [goalNotif])

  // Realtime: wedstrijden + standen
  useEffect(() => {
    if (!id) return
    const sub = supabase
      .channel(`screen-rt-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` },
        ({ new: updated }) => {
          const m = updated as Match
          setMatches(prev => {
            const old = prev.find(p => p.id === m.id)
            // Doelpunt-detectie:
            // - Wedstrijd was LIVE en blijft LIVE (geen afsluiting)
            // - Score van één team is gestegen (niet bij starten of afsluiten)
            if (
              old &&
              old.status === 'live' &&
              m.status === 'live' &&
              ((m.home_score ?? 0) > (old.home_score ?? 0) ||
               (m.away_score ?? 0) > (old.away_score ?? 0))
            ) {
              const homeGoal = (m.home_score ?? 0) > (old.home_score ?? 0)
              setGoalNotif({
                id: `${m.id}-${Date.now()}`,
                teamName:     homeGoal ? (old.home_team?.name ?? '?') : (old.away_team?.name ?? '?'),
                teamColor:    homeGoal ? (old.home_team?.color ?? 'var(--orange)') : (old.away_team?.color ?? '#888'),
                homeTeamName: old.home_team?.name ?? '?',
                awayTeamName: old.away_team?.name ?? '?',
                homeScore:    m.home_score ?? 0,
                awayScore:    m.away_score ?? 0,
              })
            }
            return prev.map(p =>
              p.id === m.id ? { ...p, ...m, home_team: p.home_team, away_team: p.away_team, field: p.field } : p
            )
          })
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'standings', filter: `tournament_id=eq.${id}` },
        ({ new: updated }) => {
          const s = updated as Standing
          setStandings(prev => prev.map(p => p.id === s.id ? { ...p, ...s, team: p.team } : p))
        })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [id])

  // ── Live en geplande wedstrijden ──────────────────────────────────────────
  const liveMatches      = useMemo(() => matches.filter(m => m.status === 'live'), [matches])
  const scheduledMatches = useMemo(() => matches.filter(m => m.status === 'scheduled'), [matches])

  // Welke wedstrijden tonen we?
  const displayMatches = liveMatches.length > 0 ? liveMatches
    : scheduledMatches.length > 0 ? scheduledMatches.filter(m => {
        const minRound = Math.min(...scheduledMatches.map(x => x.round ?? 0))
        return (m.round ?? 0) === minRound
      })
    : []

  // Groepeer standen per poule
  const standingsByPool = useMemo(() => {
    const map: Record<number, Standing[]> = {}
    standings.forEach(s => {
      const p = s.pool ?? 1
      if (!map[p]) map[p] = []
      map[p].push(s)
    })
    return map
  }, [standings])

  // Unieke poules die in de actieve matches voorkomen
  const activePools = useMemo(() => {
    const pools = new Set<number>()
    displayMatches.forEach(m => {
      if (m.phase === 'group') {
        const pool = m.home_team?.pool ?? m.away_team?.pool
        if (pool) pools.add(pool)
      }
    })
    return [...pools].sort()
  }, [displayMatches])

  // KO-wedstrijden in de displaylist
  const koMatches = useMemo(() => displayMatches.filter(m => m.phase !== 'group'), [displayMatches])

  const numPools   = tournament?.num_pools ?? 1
  const poolNames  = tournament?.pool_names
  const poolName   = (p: number) => poolNames?.[p - 1] ?? (numPools > 1 ? `Poule ${String.fromCharCode(64 + p)}` : 'Stand')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const allDone = matches.length > 0 && matches.every(m => m.status === 'finished' || m.status === 'cancelled')

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>

      {/* ── Doelpunt-notificatie ── */}
      {goalNotif && (
        <div
          key={goalNotif.id}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ animation: 'goalIn 0.35s ease-out' }}>
          <div className="rounded-3xl px-10 py-8 flex flex-col items-center gap-3 shadow-2xl"
            style={{
              backgroundColor: goalNotif.teamColor,
              border: '4px solid rgba(255,255,255,0.3)',
              minWidth: 280,
              maxWidth: '80vw',
            }}>
            <span className="text-5xl">⚽</span>
            <p className="font-black text-white text-center"
              style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              DOELPUNT!
            </p>
            <p className="font-black text-white text-center"
              style={{ fontSize: 'clamp(1.2rem, 3vw, 2rem)', textShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
              {goalNotif.teamName}
            </p>
            <p className="font-black text-white tabular-nums"
              style={{ fontSize: 'clamp(1.8rem, 5vw, 3rem)', textShadow: '0 2px 8px rgba(0,0,0,0.4)', opacity: 0.95 }}>
              {goalNotif.homeScore} – {goalNotif.awayScore}
            </p>
            <p className="text-white text-sm text-center font-semibold"
              style={{ opacity: 0.8 }}>
              {goalNotif.homeTeamName} · {goalNotif.awayTeamName}
            </p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
        <div className="flex items-center gap-4">
          {tournament?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tournament.logo_url} alt="Logo" className="h-10 w-10 object-contain" />
          )}
          {!tournament?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/zaanslicht-logo.png" alt="Logo" className="h-10 w-10 object-contain" />
          )}
          <div>
            <h1 className="font-black text-xl leading-tight">{tournament?.name ?? '—'}</h1>
            <p className="text-xs font-semibold mt-0.5"
              style={{ color: liveMatches.length > 0 ? 'var(--orange)' : 'var(--text-secondary)' }}>
              {liveMatches.length > 0
                ? `● ${liveMatches.length} wedstrijd${liveMatches.length !== 1 ? 'en' : ''} live`
                : allDone ? '✓ Toernooi afgelopen'
                : scheduledMatches.length > 0 ? 'Volgende ronde...'
                : '—'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black tabular-nums"><Clock /></div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">

        {/* Geen wedstrijden */}
        {displayMatches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="text-6xl">{allDone ? '🏆' : '⏳'}</div>
            <p className="text-2xl font-bold">{allDone ? 'Toernooi afgelopen!' : 'Wacht op de wedstrijden…'}</p>
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              {allDone ? 'Bedankt voor het meedoen.' : 'Het toernooi begint zo.'}
            </p>
          </div>
        )}

        {/* Groepsfase-layout: per poule wedstrijden + stand */}
        {activePools.length > 0 && (
          <div className={`grid gap-6 ${activePools.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
            {activePools.map(pool => {
              const poolMs = displayMatches.filter(m =>
                m.phase === 'group' && (m.home_team?.pool === pool || m.away_team?.pool === pool)
              )
              const poolSts = standingsByPool[pool] ?? []
              return (
                <div key={pool} className="flex flex-col gap-4">
                  {/* Wedstrijden in deze poule */}
                  {poolMs.map(m => (
                    <MatchCard key={m.id} match={m} fieldName={m.field?.name ?? `Wedstrijd ${m.match_number}`} />
                  ))}
                  {/* Stand van deze poule */}
                  {poolSts.length > 0 && (
                    <StandingTable poolStandings={poolSts} poolName={poolName(pool)} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* KO-wedstrijden */}
        {koMatches.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-black mb-4" style={{ color: 'var(--orange)' }}>🏆 Finale rondes</h2>
            <div className={`grid gap-4 ${koMatches.length === 1 ? 'max-w-md mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
              {koMatches.map(m => (
                <MatchCard key={m.id} match={m} fieldName={m.field?.name ?? `Wedstrijd ${m.match_number}`} />
              ))}
            </div>
          </div>
        )}

        {/* Eindstand na afloop (alle pools) */}
        {allDone && Object.keys(standingsByPool).length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-black mb-4" style={{ color: 'var(--text-secondary)' }}>Eindstanden</h2>
            <div className={`grid gap-4 ${numPools === 1 ? 'max-w-lg mx-auto' : 'grid-cols-1 md:grid-cols-2'}`}>
              {Object.entries(standingsByPool).map(([pool, poolSts]) => (
                <StandingTable key={pool} poolStandings={poolSts} poolName={poolName(Number(pool))} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="px-6 py-3 flex-shrink-0 text-center"
        style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Live via zaanslicht-toernooi · updates automatisch
        </p>
      </footer>
    </div>
  )
}
