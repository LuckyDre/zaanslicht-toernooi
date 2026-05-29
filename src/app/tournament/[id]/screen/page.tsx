'use client'

import { useEffect, useState, useMemo, use, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Tournament, Match, Standing } from '@/lib/supabase'

// ── Klok ──────────────────────────────────────────────────────────────────────
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

// ── Sortering stand ────────────────────────────────────────────────────────────
function sortStanding(a: Standing, b: Standing) {
  if (b.points !== a.points) return b.points - a.points
  const gdA = a.goals_for - a.goals_against, gdB = b.goals_for - b.goals_against
  if (gdB !== gdA) return gdB - gdA
  return b.goals_for - a.goals_for
}

// ── KO-labels ──────────────────────────────────────────────────────────────────
const KO_LABEL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'Kwartfinale', semi_final: 'Halve finale',
  final: 'Finale', third_place: '3e plaats',
}

// ── TV-Wedstrijdkaart (verticaal scorebord) ────────────────────────────────────
function MatchCard({ match, fieldName }: { match: Match; fieldName: string }) {
  const isLive = match.status === 'live'
  const isDone = match.status === 'finished'
  const phaseLabel = match.phase !== 'group' ? KO_LABEL[match.phase] : null
  const scoreColor = isLive ? 'var(--orange)' : isDone ? '#22c55e' : 'var(--text-primary)'
  const dotSize = 'clamp(10px, 1.6vw, 20px)'

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden w-full h-full min-h-0"
      style={{
        border: `2px solid ${isLive ? 'var(--orange)' : isDone ? '#22c55e44' : 'var(--border)'}`,
        backgroundColor: isLive ? '#FF6B000D' : 'var(--bg-card)',
      }}>

      {/* Veld-header */}
      <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0"
        style={{ backgroundColor: isLive ? '#FF6B0022' : 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
        <span className="font-bold truncate"
          style={{ fontSize: 'clamp(0.65rem, 1.1vw, 1rem)', color: isLive ? 'var(--orange)' : 'var(--text-secondary)' }}>
          {isLive ? '● ' : ''}{fieldName}{phaseLabel ? ` · ${phaseLabel}` : ''}
        </span>
        {isDone && <span className="font-bold flex-shrink-0" style={{ fontSize: 'clamp(0.6rem, 1vw, 0.85rem)', color: '#22c55e' }}>✓ Gespeeld</span>}
      </div>

      {/* Verticaal scorebord: thuis bovenaan, uit onderaan */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden"
        style={{ padding: 'clamp(6px, 1.2vh, 18px) clamp(10px, 2vw, 28px)', gap: 0 }}>

        {/* Thuisteam naam */}
        <div className="flex items-center justify-center gap-2 w-full">
          <div className="rounded-full flex-shrink-0"
            style={{ width: dotSize, height: dotSize, backgroundColor: match.home_team?.color ?? 'var(--orange)' }} />
          <span className="font-black text-center leading-tight truncate"
            style={{ fontSize: 'clamp(1rem, 2.8vw, 2.8rem)', lineHeight: 1.1, color: 'var(--text-primary)' }}>
            {match.home_team?.name ?? '—'}
          </span>
        </div>

        {/* Thuisscore */}
        <span className="font-black tabular-nums leading-none text-center"
          style={{ fontSize: 'clamp(3.5rem, 10vw, 10rem)', color: scoreColor, lineHeight: 0.95 }}>
          {match.home_score ?? 0}
        </span>

        {/* Scheidingsstreep */}
        <div className="flex-shrink-0 rounded-full"
          style={{
            width: 'clamp(40px, 8vw, 100px)',
            height: 3,
            backgroundColor: scoreColor,
            opacity: 0.5,
            margin: 'clamp(4px, 0.8vh, 10px) 0',
          }} />

        {/* Uitscore */}
        <span className="font-black tabular-nums leading-none text-center"
          style={{ fontSize: 'clamp(3.5rem, 10vw, 10rem)', color: scoreColor, lineHeight: 0.95 }}>
          {match.away_score ?? 0}
        </span>

        {/* Uitteam naam */}
        <div className="flex items-center justify-center gap-2 w-full">
          <div className="rounded-full flex-shrink-0"
            style={{ width: dotSize, height: dotSize, backgroundColor: match.away_team?.color ?? '#888' }} />
          <span className="font-black text-center leading-tight truncate"
            style={{ fontSize: 'clamp(1rem, 2.8vw, 2.8rem)', lineHeight: 1.1, color: 'var(--text-primary)' }}>
            {match.away_team?.name ?? '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Stand-tabel ────────────────────────────────────────────────────────────────
function StandingTable({ poolStandings, poolName }: { poolStandings: Standing[]; poolName: string }) {
  const sorted = [...poolStandings].sort(sortStanding)
  return (
    <div className="rounded-2xl overflow-hidden flex-shrink-0"
      style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
      <div className="px-4 py-2" style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
        <span className="font-black" style={{ color: 'var(--orange)', fontSize: 'clamp(0.85rem, 1.6vw, 1.4rem)' }}>
          🏆 {poolName}
        </span>
      </div>
      <table className="w-full">
        <thead>
          <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', fontSize: 'clamp(0.7rem, 1.2vw, 1rem)' }}>
            <th className="text-left px-3 py-2 font-semibold w-7">#</th>
            <th className="text-left px-3 py-2 font-semibold">Team</th>
            <th className="text-center px-2 py-2 font-semibold">G</th>
            <th className="text-center px-2 py-2 font-semibold">W</th>
            <th className="text-center px-2 py-2 font-semibold">V</th>
            <th className="text-center px-2 py-2 font-semibold">Dlt</th>
            <th className="text-center px-2 py-2 font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => (
            <tr key={s.team_id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <td className="px-3 py-2 font-bold text-center"
                style={{ color: i === 0 ? 'var(--orange)' : 'var(--text-secondary)', fontSize: 'clamp(0.75rem, 1.2vw, 1.05rem)' }}>
                {i + 1}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full flex-shrink-0"
                    style={{ width: 'clamp(8px, 1.1vw, 14px)', height: 'clamp(8px, 1.1vw, 14px)', backgroundColor: s.team?.color ?? 'var(--orange)', display: 'inline-block' }} />
                  <span className="font-bold truncate" style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1.2rem)' }}>
                    {s.team?.name ?? '—'}
                  </span>
                </div>
              </td>
              <td className="px-2 py-2 text-center tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.75rem, 1.2vw, 1.05rem)' }}>{s.played}</td>
              <td className="px-2 py-2 text-center tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.75rem, 1.2vw, 1.05rem)' }}>{s.won}</td>
              <td className="px-2 py-2 text-center tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.75rem, 1.2vw, 1.05rem)' }}>{s.lost}</td>
              <td className="px-2 py-2 text-center tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: 'clamp(0.7rem, 1.1vw, 0.95rem)' }}>
                {s.goals_for}–{s.goals_against}
              </td>
              <td className="px-2 py-2 text-center font-black tabular-nums"
                style={{ color: 'var(--text-primary)', fontSize: 'clamp(0.9rem, 1.6vw, 1.4rem)' }}>
                {s.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────────
export default function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches]       = useState<Match[]>([])
  const [standings, setStandings]   = useState<Standing[]>([])
  const [loading, setLoading]       = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  type GoalNotif = {
    id: string; teamName: string; teamColor: string
    homeTeamName: string; awayTeamName: string
    homeScore: number; awayScore: number
  }
  const [goalNotif, setGoalNotif] = useState<GoalNotif | null>(null)

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Data laden
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

  // Auto-dismiss goal notificatie
  useEffect(() => {
    if (!goalNotif) return
    const t = setTimeout(() => setGoalNotif(null), 3000)
    return () => clearTimeout(t)
  }, [goalNotif])

  // Realtime
  useEffect(() => {
    if (!id) return
    const sub = supabase
      .channel(`screen-rt-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` },
        ({ new: updated }) => {
          const m = updated as Match
          setMatches(prev => {
            const old = prev.find(p => p.id === m.id)
            if (
              old && old.status === 'live' && m.status === 'live' &&
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

  // ── Welke wedstrijden tonen ──
  const liveMatches      = useMemo(() => matches.filter(m => m.status === 'live'), [matches])
  const scheduledMatches = useMemo(() => matches.filter(m => m.status === 'scheduled'), [matches])

  const displayMatches = useMemo(() => {
    if (liveMatches.length > 0) return liveMatches
    if (scheduledMatches.length > 0) {
      const minRound = Math.min(...scheduledMatches.map(x => x.round ?? 0))
      return scheduledMatches.filter(m => (m.round ?? 0) === minRound)
    }
    return []
  }, [liveMatches, scheduledMatches])

  // Stand per poule
  const standingsByPool = useMemo(() => {
    const map: Record<number, Standing[]> = {}
    standings.forEach(s => {
      const p = s.pool ?? 1
      if (!map[p]) map[p] = []
      map[p].push(s)
    })
    return map
  }, [standings])

  // Poules die in de actieve matches voorkomen
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

  const koMatches  = useMemo(() => displayMatches.filter(m => m.phase !== 'group'), [displayMatches])
  const numPools   = tournament?.num_pools ?? 1
  const poolNames  = tournament?.pool_names
  const poolName   = (p: number) => poolNames?.[p - 1] ?? (numPools > 1 ? `Poule ${String.fromCharCode(64 + p)}` : 'Stand')
  const allDone    = matches.length > 0 && matches.every(m => m.status === 'finished' || m.status === 'cancelled')

  // ── Match-hoogte: aantal rijen in kolom bepaalt de card-hoogte ──
  // We gebruiken CSS grid met een vaste hoogte per kolom zodat kaarten altijd maximaal zijn

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden"
      style={{ height: '100dvh', backgroundColor: 'var(--bg-base)', userSelect: 'none' }}>

      {/* ── Doelpunt-popup ── */}
      {goalNotif && (
        <div key={goalNotif.id}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ animation: 'goalIn 0.35s ease-out' }}>
          <div className="rounded-3xl flex flex-col items-center gap-3 shadow-2xl"
            style={{
              backgroundColor: goalNotif.teamColor,
              border: '4px solid rgba(255,255,255,0.3)',
              padding: 'clamp(1.5rem, 4vw, 3rem) clamp(2rem, 6vw, 5rem)',
            }}>
            <span style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}>⚽</span>
            <p className="font-black text-white text-center"
              style={{ fontSize: 'clamp(2rem, 6vw, 5rem)', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              DOELPUNT!
            </p>
            <p className="font-black text-white text-center"
              style={{ fontSize: 'clamp(1.5rem, 4vw, 3.5rem)', textShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
              {goalNotif.teamName}
            </p>
            <p className="font-black text-white tabular-nums"
              style={{ fontSize: 'clamp(2.5rem, 8vw, 6rem)', textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
              {goalNotif.homeScore} – {goalNotif.awayScore}
            </p>
            <p className="text-white font-semibold text-center"
              style={{ fontSize: 'clamp(0.85rem, 1.5vw, 1.2rem)', opacity: 0.8 }}>
              {goalNotif.homeTeamName} · {goalNotif.awayTeamName}
            </p>
          </div>
        </div>
      )}

      {/* ── Compacte header ── */}
      <header className="flex items-center justify-between flex-shrink-0 gap-3"
        style={{
          padding: 'clamp(6px, 1vh, 12px) clamp(10px, 2vw, 24px)',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-card)',
          minHeight: 0,
        }}>
        {/* Links: logo + naam */}
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tournament?.logo_url ?? '/zaanslicht-logo.png'}
            alt="Logo"
            style={{ height: 'clamp(28px, 4vh, 48px)', width: 'clamp(28px, 4vh, 48px)', objectFit: 'contain', flexShrink: 0 }}
          />
          <div className="min-w-0">
            <h1 className="font-black leading-none truncate"
              style={{ fontSize: 'clamp(0.9rem, 2.2vw, 1.8rem)' }}>
              {tournament?.name ?? '—'}
            </h1>
            <p className="font-semibold leading-none mt-0.5"
              style={{
                fontSize: 'clamp(0.6rem, 1.2vw, 0.95rem)',
                color: liveMatches.length > 0 ? 'var(--orange)' : 'var(--text-secondary)',
              }}>
              {liveMatches.length > 0
                ? `● ${liveMatches.length} wedstrijd${liveMatches.length !== 1 ? 'en' : ''} live`
                : allDone ? '✓ Toernooi afgelopen'
                : scheduledMatches.length > 0 ? 'Volgende ronde...'
                : '—'}
            </p>
          </div>
        </div>

        {/* Rechts: klok + fullscreen */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="font-black tabular-nums leading-none"
              style={{ fontSize: 'clamp(1.2rem, 3vw, 2.4rem)' }}>
              <Clock />
            </div>
            <p style={{ fontSize: 'clamp(0.55rem, 1vw, 0.8rem)', color: 'var(--text-secondary)' }}>
              {new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Volledig scherm verlaten' : 'Volledig scherm'}
            className="rounded-xl flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80 active:opacity-60"
            style={{
              width: 'clamp(32px, 4vw, 48px)',
              height: 'clamp(32px, 4vw, 48px)',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              fontSize: 'clamp(0.9rem, 1.8vw, 1.4rem)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}>
            {isFullscreen ? '⛶' : '⛶'}
          </button>
        </div>
      </header>

      {/* ── Hoofdinhoud ── */}
      <main className="flex-1 flex flex-col min-h-0"
        style={{ padding: 'clamp(6px, 1vh, 14px) clamp(8px, 1.5vw, 20px)', gap: 'clamp(6px, 1vh, 14px)' }}>

        {/* Leeg scherm */}
        {displayMatches.length === 0 && !allDone && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div style={{ fontSize: 'clamp(3rem, 10vw, 8rem)' }}>⏳</div>
            <p className="font-black" style={{ fontSize: 'clamp(1.5rem, 4vw, 3rem)' }}>Wacht op de wedstrijden…</p>
            <p style={{ fontSize: 'clamp(0.9rem, 2vw, 1.5rem)', color: 'var(--text-secondary)' }}>
              Het toernooi begint zo.
            </p>
          </div>
        )}

        {/* Toernooi afgelopen */}
        {allDone && displayMatches.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div style={{ fontSize: 'clamp(3rem, 10vw, 8rem)' }}>🏆</div>
            <p className="font-black" style={{ fontSize: 'clamp(1.5rem, 4vw, 3rem)' }}>Toernooi afgelopen!</p>
            <p style={{ fontSize: 'clamp(0.9rem, 2vw, 1.5rem)', color: 'var(--text-secondary)' }}>
              Bedankt voor het meedoen.
            </p>
          </div>
        )}

        {/* ── Groepsfase: per poule een kolom ── */}
        {activePools.length > 0 && (
          <div className="flex-1 flex min-h-0 gap-3"
            style={{ gap: 'clamp(6px, 1.2vw, 18px)' }}>

            {activePools.map(pool => {
              const poolMs  = displayMatches.filter(m =>
                m.phase === 'group' && (m.home_team?.pool === pool || m.away_team?.pool === pool)
              )
              const poolSts = standingsByPool[pool] ?? []

              return (
                <div key={pool} className="flex-1 flex flex-col min-h-0 min-w-0"
                  style={{ gap: 'clamp(6px, 1vh, 12px)' }}>

                  {/* Wedstrijden in deze poule: altijd in een rij naast elkaar */}
                  <div className="flex min-h-0 flex-1"
                    style={{ gap: 'clamp(6px, 1vw, 14px)' }}>
                    {poolMs.map(m => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        fieldName={m.field?.name ?? `Wedstrijd ${m.match_number}`}
                      />
                    ))}
                  </div>

                  {/* Stand onder de wedstrijden */}
                  {poolSts.length > 0 && (
                    <StandingTable poolStandings={poolSts} poolName={poolName(pool)} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── KO-rondes ── */}
        {koMatches.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0"
            style={{ gap: 'clamp(6px, 1vh, 12px)' }}>
            <p className="font-black flex-shrink-0"
              style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.4rem)', color: 'var(--orange)' }}>
              🏆 Finale rondes
            </p>
            <div className="flex flex-1 min-h-0"
              style={{ gap: 'clamp(6px, 1vw, 14px)' }}>
              {koMatches.map(m => (
                <MatchCard
                  key={m.id}
                  match={m}
                  fieldName={m.field?.name ?? `Wedstrijd ${m.match_number}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Eindstand na afloop */}
        {allDone && Object.keys(standingsByPool).length > 0 && displayMatches.length === 0 && (
          <div className="flex-1 flex flex-col min-h-0" style={{ gap: 'clamp(6px, 1vh, 12px)' }}>
            <p className="font-black flex-shrink-0"
              style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.4rem)', color: 'var(--text-secondary)' }}>
              Eindstanden
            </p>
            <div className="flex gap-4 flex-wrap">
              {Object.entries(standingsByPool).map(([pool, poolSts]) => (
                <div key={pool} className="flex-1 min-w-48">
                  <StandingTable poolStandings={poolSts} poolName={poolName(Number(pool))} />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
