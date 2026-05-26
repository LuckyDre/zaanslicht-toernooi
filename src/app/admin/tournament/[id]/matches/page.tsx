'use client'

import { useEffect, useState, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, Match, Tournament, Standing, Field } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Button } from '@/components/ui/Button'

type MS = { homeScore: number; awayScore: number; saving: boolean; saved: boolean; error: string | null }
type RS = 'scheduled' | 'live' | 'finished'

function getRoundStatus(ms: Match[]): RS {
  const active = ms.filter(m => m.status !== 'cancelled')
  if (!active.length || active.every(m => m.status === 'finished')) return 'finished'
  if (active.some(m => m.status === 'live')) return 'live'
  return 'scheduled'
}

// ─── KO helpers ─────────────────────────────────────────────────────────────

const KO_PILL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'KF', semi_final: 'HF', final: 'F', third_place: '3e',
}
const KO_LABEL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'Kwartfinales', semi_final: 'Halve finales',
  final: 'Finale', third_place: 'Wedstrijd om 3e plaats',
}
const FINALS_COUNT: Record<string, number> = { final: 2, semi_final: 4, quarter_final: 8 }
const FINALS_PHASE: Record<string, Match['phase']> = {
  final: 'final', semi_final: 'semi_final', quarter_final: 'quarter_final',
}
const PHASE_ORDER: Partial<Record<Match['phase'], number>> = {
  quarter_final: 1, semi_final: 2, third_place: 3, final: 4,
}

function getRoundPillLabel(ms: Match[]): string | undefined {
  for (const m of ms) {
    const lbl = KO_PILL[m.phase]
    if (lbl) return lbl
  }
  return undefined
}

function sortStanding(a: Standing, b: Standing) {
  if (b.points !== a.points) return b.points - a.points
  const gdA = a.goals_for - a.goals_against, gdB = b.goals_for - b.goals_against
  if (gdB !== gdA) return gdB - gdA
  return b.goals_for - a.goals_for
}

/** Return the top-ranked team ID from each pool (pool winners) */
function getPoolWinners(standings: Standing[], numPools: number): string[] {
  return Array.from({ length: numPools }, (_, p) =>
    standings.filter(s => (s.pool ?? 1) === p + 1).sort(sortStanding)[0]?.team_id
  ).filter(Boolean) as string[]
}

/**
 * Generate round-robin rounds for the finale poule.
 * Uses the circle algorithm — each team appears at most once per round,
 * so matches can be played simultaneously on different fields.
 * Returns rounds as arrays of [homeId, awayId] pairs.
 */
function generateFinalePouleRounds(teamIds: string[]): [string, string][][] {
  const t: (string | null)[] = [...teamIds]
  if (t.length % 2 !== 0) t.push(null) // bye slot
  const n = t.length
  const rounds: [string, string][][] = []

  for (let r = 0; r < n - 1; r++) {
    const roundMatches: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const home = t[i], away = t[n - 1 - i]
      if (home && away) roundMatches.push([home, away])
    }
    rounds.push(roundMatches)
    // Rotate: keep t[0] fixed
    t.splice(1, 0, t.pop()!)
  }
  return rounds
}

/** For single-pool knockout: standard bracket seedings */
function seedsToMatchups(seeds: string[]): [string, string][] {
  const n = seeds.length
  if (n === 2) return [[seeds[0], seeds[1]]]
  if (n === 4) return [[seeds[0], seeds[3]], [seeds[1], seeds[2]]]
  if (n === 8) return [[seeds[0], seeds[7]], [seeds[3], seeds[4]], [seeds[1], seeds[6]], [seeds[2], seeds[5]]]
  const pairs: [string, string][] = []
  for (let i = 0, j = n - 1; i < j; i++, j--) pairs.push([seeds[i], seeds[j]])
  return pairs
}

/** Top N seeds from single-pool standings */
function getSeeds(standings: Standing[], count: number): string[] {
  return [...standings].sort(sortStanding).slice(0, count).map(s => s.team_id)
}

function getWinner(m: Match): string {
  return (m.home_score ?? 0) >= (m.away_score ?? 0) ? m.home_team_id : m.away_team_id
}
function getLoser(m: Match): string {
  return (m.home_score ?? 0) < (m.away_score ?? 0) ? m.home_team_id : m.away_team_id
}

// ─── Round navigator pill ────────────────────────────────────────────────────
function RoundPill({ n, label, status, selected, onClick }: {
  n: number; label?: string; status: RS; selected: boolean; onClick: () => void
}) {
  const bg     = selected ? 'var(--orange)' : status === 'finished' ? '#22c55e20' : status === 'live' ? '#FF6B0025' : 'var(--bg-card)'
  const border = selected ? 'var(--orange)' : status === 'finished' ? '#22c55e60' : status === 'live' ? 'var(--orange)' : 'var(--border)'
  const txtCol = selected ? '#fff' : 'var(--text-primary)'
  return (
    <button onClick={onClick}
      className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl cursor-pointer active:scale-95 transition-transform"
      style={{ width: 48, height: 48, backgroundColor: bg, border: `2px solid ${border}`, color: txtCol }}>
      <span className="font-bold text-sm leading-none">{label ?? n}</span>
      <span className="text-[10px] leading-none mt-0.5"
        style={{ color: selected ? 'rgba(255,255,255,.8)' : status === 'finished' ? '#22c55e' : status === 'live' ? 'var(--orange)' : 'var(--border)' }}>
        {status === 'finished' ? '✓' : status === 'live' ? '●' : '·'}
      </span>
    </button>
  )
}

// ─── Match card ──────────────────────────────────────────────────────────────
function MatchCard({
  match, s, onUpd, onSaveScore, onSave,
}: {
  match: Match; s: MS
  onUpd: (p: Partial<MS>) => void
  onSaveScore: () => void
  onSave: (status: Match['status']) => void
}) {
  const isLive      = match.status === 'live'
  const isDone      = match.status === 'finished'
  const isCancelled = match.status === 'cancelled'
  const isScheduled = match.status === 'scheduled'

  const borderColor = isLive ? 'var(--orange)' : isDone ? '#22c55e55' : isCancelled ? '#ef444455' : 'var(--border)'
  const bgColor     = isLive ? '#FF6B000D' : isDone ? '#22c55e0a' : 'var(--bg-card)'
  const headBg      = isLive ? '#FF6B0020' : isDone ? '#22c55e15' : 'var(--bg-elevated)'
  const statusLabel = isLive ? '● LIVE' : isDone ? '✓ Gespeeld' : isCancelled ? '✕ Afgelast' : 'Gepland'
  const statusColor = isLive ? 'var(--orange)' : isDone ? '#22c55e' : isCancelled ? '#ef4444' : 'var(--text-secondary)'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${borderColor}`, backgroundColor: bgColor }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: headBg, borderBottom: `1px solid ${borderColor}` }}>
        <span className="font-bold text-sm">{match.field?.name ?? `Wedstrijd ${match.match_number}`}</span>
        <div className="flex items-center gap-2">
          {s.saved  && <span className="text-xs font-medium" style={{ color: '#22c55e' }}>✓ Opgeslagen</span>}
          {s.error  && <span className="text-xs" style={{ color: '#ef4444' }}>⚠ {s.error}</span>}
          <span className="text-xs font-bold" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      <div className="px-4 py-4">
        {isLive ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
                <span className="font-bold text-sm truncate">{match.home_team?.name ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onUpd({ homeScore: Math.max(0, s.homeScore - 1), saved: false })}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer active:scale-90"
                  style={{ backgroundColor: 'var(--bg-base)' }}>−</button>
                <span className="text-4xl font-bold font-mono w-12 text-center select-none">{s.homeScore}</span>
                <button onClick={() => onUpd({ homeScore: s.homeScore + 1, saved: false })}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer active:scale-90"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>+</button>
              </div>
            </div>
            <div className="text-2xl font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>:</div>
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm truncate">{match.away_team?.name ?? '—'}</span>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onUpd({ awayScore: Math.max(0, s.awayScore - 1), saved: false })}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer active:scale-90"
                  style={{ backgroundColor: 'var(--bg-base)' }}>−</button>
                <span className="text-4xl font-bold font-mono w-12 text-center select-none">{s.awayScore}</span>
                <button onClick={() => onUpd({ awayScore: s.awayScore + 1, saved: false })}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer active:scale-90"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>+</button>
              </div>
            </div>
          </div>
        ) : isDone ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
              <span className="font-bold truncate">{match.home_team?.name ?? '—'}</span>
            </div>
            <span className="text-3xl font-bold font-mono flex-shrink-0" style={{ color: '#22c55e' }}>
              {match.home_score ?? 0}–{match.away_score ?? 0}
            </span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span className="font-bold truncate">{match.away_team?.name ?? '—'}</span>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
            </div>
          </div>
        ) : isCancelled ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
              <span className="font-bold truncate">{match.home_team?.name ?? '—'}</span>
            </div>
            <span className="text-sm px-2" style={{ color: '#ef4444' }}>afgelast</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span className="font-bold truncate">{match.away_team?.name ?? '—'}</span>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
              <span className="font-bold truncate">{match.home_team?.name ?? '—'}</span>
            </div>
            <span className="font-bold text-lg px-2" style={{ color: 'var(--text-secondary)' }}>vs</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span className="font-bold truncate">{match.away_team?.name ?? '—'}</span>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 px-4 pb-4">
        {isScheduled && (
          <Button size="sm" loading={s.saving} onClick={() => onSave('live')} className="flex-1">▶ Start dit veld</Button>
        )}
        {isLive && (
          <>
            <Button size="sm" variant="secondary" loading={s.saving} onClick={onSaveScore} className="flex-1">💾 Tussenstand</Button>
            <Button size="sm" loading={s.saving} onClick={() => onSave('finished')} className="flex-1">✓ Klaar</Button>
          </>
        )}
        {!isDone && !isCancelled && (
          <Button size="sm" variant="danger" loading={s.saving}
            onClick={() => { if (confirm('Wedstrijd aflasten?')) onSave('cancelled') }}>✕</Button>
        )}
        {isDone && (
          <Button size="sm" variant="secondary" loading={s.saving} onClick={() => onSave('live')} className="flex-1">✏️ Aanpassen</Button>
        )}
        {(isDone || isCancelled) && (
          <Button size="sm" variant="ghost" loading={s.saving} onClick={() => onSave('scheduled')} className="flex-1">↩ Herplannen</Button>
        )}
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tournament, setTournament]       = useState<Tournament | null>(null)
  const [matches, setMatches]             = useState<Match[]>([])
  const [standings, setStandings]         = useState<Standing[]>([])
  const [fields, setFields]               = useState<Field[]>([])
  const [states, setStates]               = useState<Record<string, MS>>({})
  const [loading, setLoading]             = useState(true)
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [roundSaving, setRoundSaving]     = useState(false)
  const [stopAllSaving, setStopAllSaving] = useState(false)
  const [generatingKO, setGeneratingKO]   = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) router.push('/login') })
  }, [router])

  useEffect(() => {
    supabase.from('tournaments').select('*').eq('id', id).single().then(({ data }) => setTournament(data))
    supabase.from('standings').select('*').eq('tournament_id', id).then(({ data }) => setStandings(data ?? []))
    supabase.from('fields').select('*').eq('tournament_id', id).order('display_order').then(({ data }) => setFields(data ?? []))

    supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('tournament_id', id).order('round').order('match_number')
      .then(({ data }) => {
        const list = data ?? []
        setMatches(list)
        const init: Record<string, MS> = {}
        list.forEach(m => { init[m.id] = { homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0, saving: false, saved: false, error: null } })
        setStates(init)
        const map: Record<number, Match[]> = {}
        list.forEach(m => { const r = m.round ?? 0; if (!map[r]) map[r] = []; map[r].push(m) })
        const sorted = Object.keys(map).map(Number).sort((a, b) => a - b)
        const liveR  = sorted.find(r => map[r].some(m => m.status === 'live'))
        const schedR = sorted.find(r => map[r].some(m => m.status === 'scheduled'))
        setSelectedRound(liveR ?? schedR ?? sorted[sorted.length - 1] ?? null)
        setLoading(false)
      })
  }, [id])

  const upd = (matchId: string, p: Partial<MS>) =>
    setStates(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...p } }))

  const tryAdvance = (updatedList: Match[], fromRound: number) => {
    const map: Record<number, Match[]> = {}
    updatedList.forEach(m => { const r = m.round ?? 0; if (!map[r]) map[r] = []; map[r].push(m) })
    if (getRoundStatus(map[fromRound] ?? []) === 'finished') {
      const sorted = Object.keys(map).map(Number).sort((a, b) => a - b)
      const next = sorted.find(r => r > fromRound && getRoundStatus(map[r]) !== 'finished')
      if (next !== undefined) setTimeout(() => setSelectedRound(next), 400)
    }
  }

  const reloadMatches = async () => {
    const { data } = await supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('tournament_id', id).order('round').order('match_number')
    if (!data) return data
    setMatches(data)
    setStates(prev => {
      const next = { ...prev }
      data.forEach(m => { if (!next[m.id]) next[m.id] = { homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0, saving: false, saved: false, error: null } })
      return next
    })
    return data
  }

  const saveMatch = async (match: Match, status: Match['status']) => {
    const s = states[match.id]; if (!s) return
    upd(match.id, { saving: true, error: null, saved: false })
    const { error } = await supabase.from('matches').update({
      home_score: status === 'cancelled' ? null : s.homeScore,
      away_score: status === 'cancelled' ? null : s.awayScore,
      status,
      started_at: status === 'live' && !match.started_at ? new Date().toISOString() : match.started_at,
      finished_at: status === 'finished' ? new Date().toISOString() : null,
    }).eq('id', match.id)
    if (error) {
      upd(match.id, { saving: false, error: error.message })
    } else {
      const updated = matches.map(m => m.id === match.id
        ? { ...m, status, home_score: status === 'cancelled' ? null : s.homeScore, away_score: status === 'cancelled' ? null : s.awayScore }
        : m)
      setMatches(updated)
      upd(match.id, { saving: false, saved: true })
      setTimeout(() => upd(match.id, { saved: false }), 2500)
      if ((status === 'finished' || status === 'cancelled') && match.round != null) tryAdvance(updated, match.round)
    }
  }

  const saveScore = async (match: Match) => {
    const s = states[match.id]; if (!s) return
    upd(match.id, { saving: true, error: null })
    const { error } = await supabase.from('matches').update({ home_score: s.homeScore, away_score: s.awayScore }).eq('id', match.id)
    if (error) {
      upd(match.id, { saving: false, error: error.message })
    } else {
      setMatches(prev => prev.map(m => m.id === match.id ? { ...m, home_score: s.homeScore, away_score: s.awayScore } : m))
      upd(match.id, { saving: false, saved: true })
      setTimeout(() => upd(match.id, { saved: false }), 2500)
    }
  }

  const startRound = async (roundMatches: Match[]) => {
    const toStart = roundMatches.filter(m => m.status === 'scheduled')
    if (!toStart.length) return
    setRoundSaving(true)
    const now = new Date().toISOString()
    await Promise.all(toStart.map(m =>
      supabase.from('matches').update({ status: 'live', started_at: now, home_score: 0, away_score: 0 }).eq('id', m.id)
    ))
    setMatches(prev => prev.map(m =>
      toStart.find(t => t.id === m.id) ? { ...m, status: 'live', started_at: now, home_score: 0, away_score: 0 } : m
    ))
    setStates(prev => { const n = { ...prev }; toStart.forEach(m => { n[m.id] = { ...n[m.id], homeScore: 0, awayScore: 0 } }); return n })
    setRoundSaving(false)
  }

  const stopRound = async (roundNum: number, roundMatches: Match[]) => {
    const toLive = roundMatches.filter(m => m.status === 'live')
    if (!toLive.length) return
    if (!confirm(`Ronde ${roundNum}: ${toLive.length} wedstrijd${toLive.length > 1 ? 'en' : ''} afsluiten?`)) return
    setRoundSaving(true)
    const now = new Date().toISOString()
    await Promise.all(toLive.map(m => {
      const s = states[m.id]
      return supabase.from('matches').update({ status: 'finished', finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }).eq('id', m.id)
    }))
    const updated = matches.map(m => {
      if (!toLive.find(t => t.id === m.id)) return m
      const s = states[m.id]
      return { ...m, status: 'finished' as Match['status'], finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }
    })
    setMatches(updated)
    setRoundSaving(false)
    tryAdvance(updated, roundNum)
  }

  const stopAll = async () => {
    const live = matches.filter(m => m.status === 'live')
    if (!live.length || !confirm(`${live.length} live wedstrijden stoppen?`)) return
    setStopAllSaving(true)
    const now = new Date().toISOString()
    await Promise.all(live.map(m => {
      const s = states[m.id]
      return supabase.from('matches').update({ status: 'finished', finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }).eq('id', m.id)
    }))
    setMatches(prev => prev.map(m => {
      if (m.status !== 'live') return m
      const s = states[m.id]
      return { ...m, status: 'finished', finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }
    }))
    setStopAllSaving(false)
  }

  // ─── Generate knockout round ────────────────────────────────────────────────
  const generateKO = async () => {
    if (!tournament) return
    setGeneratingKO(true)
    try {
      // Always fetch fresh standings so we use final group-phase results
      const { data: freshStandings } = await supabase.from('standings').select('*').eq('tournament_id', id)
      const currentStandings = freshStandings ?? standings
      if (freshStandings) setStandings(freshStandings)

      const groupMs  = matches.filter(m => m.phase === 'group')
      const koMs     = matches.filter(m => m.phase !== 'group')
      const maxMatchNum   = matches.reduce((max, m) => Math.max(max, m.match_number ?? 0), 0)
      const maxGroupRound = groupMs.reduce((max, m) => Math.max(max, m.round ?? 0), 0)
      const maxKORound    = koMs.reduce((max, m) => Math.max(max, m.round ?? 0), maxGroupRound)
      const numFields     = Math.max(fields.length, 1)
      const isMultiPool   = (tournament.num_pools ?? 1) > 1

      const insertRows: object[] = []
      let mn       = maxMatchNum + 1
      let roundNum = maxKORound + 1

      if (isMultiPool) {
        // ── Multi-pool: finale poule (cross-pool round-robin) ──────────────
        // Poule winners (1 per pool) play a full round-robin — never same pool vs same pool.
        // Each round has floor(numWinners/2) simultaneous matches on different fields.
        const winners = getPoolWinners(currentStandings, tournament.num_pools)
        if (winners.length < 2) {
          alert('Niet genoeg poulewinnaars gevonden. Zijn alle groepswedstrijden afgerond?')
          setGeneratingKO(false); return
        }
        const rounds = generateFinalePouleRounds(winners)
        for (const roundMatches of rounds) {
          for (let i = 0; i < roundMatches.length; i += numFields) {
            const chunk = roundMatches.slice(i, i + numFields)
            chunk.forEach(([home, away], fi) => {
              insertRows.push({
                tournament_id: tournament.id,
                home_team_id: home, away_team_id: away,
                round: roundNum, match_number: mn++,
                phase: 'final' as const,
                status: 'scheduled' as const,
                field_id: fields[fi]?.id ?? null,
              })
            })
            roundNum++
          }
        }

      } else {
        // ── Single-pool: knockout bracket ──────────────────────────────────
        let matchups: [string, string][]
        let phase: Match['phase']

        if (koMs.length === 0) {
          const count = FINALS_COUNT[tournament.finals_type] ?? 2
          const seeds = getSeeds(currentStandings, count)
          if (seeds.length < 2) { alert('Niet genoeg teams in de standen om finales te genereren.'); setGeneratingKO(false); return }
          phase    = FINALS_PHASE[tournament.finals_type] ?? 'final'
          matchups = seedsToMatchups(seeds)
        } else {
          const latestPhase = koMs.reduce<Match['phase']>((latest, m) =>
            (PHASE_ORDER[m.phase] ?? 0) > (PHASE_ORDER[latest] ?? 0) ? m.phase : latest
          , 'quarter_final')
          const phaseMs = [...koMs.filter(m => m.phase === latestPhase)]
            .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))

          if (latestPhase === 'semi_final') {
            // Final + 3rd place in the same round
            insertRows.push({
              tournament_id: tournament.id,
              home_team_id: getLoser(phaseMs[0]), away_team_id: getLoser(phaseMs[1]),
              round: roundNum, match_number: mn++,
              phase: 'third_place' as const, status: 'scheduled' as const,
              field_id: fields[numFields > 1 ? 1 : 0]?.id ?? null,
            })
            insertRows.push({
              tournament_id: tournament.id,
              home_team_id: getWinner(phaseMs[0]), away_team_id: getWinner(phaseMs[1]),
              round: roundNum, match_number: mn++,
              phase: 'final' as const, status: 'scheduled' as const,
              field_id: fields[0]?.id ?? null,
            })
            await supabase.from('matches').insert(insertRows)
            const upd2 = await reloadMatches()
            if (upd2) setTimeout(() => setSelectedRound(roundNum), 200)
            setGeneratingKO(false); return
          } else if (latestPhase === 'quarter_final') {
            phase    = 'semi_final'
            matchups = seedsToMatchups(phaseMs.map(getWinner))
          } else { setGeneratingKO(false); return }
        }

        for (let i = 0; i < matchups.length; i += numFields) {
          const chunk = matchups.slice(i, i + numFields)
          chunk.forEach(([home, away], fi) => {
            insertRows.push({
              tournament_id: tournament.id,
              home_team_id: home, away_team_id: away,
              round: roundNum, match_number: mn++,
              phase, status: 'scheduled' as const,
              field_id: fields[fi]?.id ?? null,
            })
          })
          roundNum++
        }
      }

      await supabase.from('matches').insert(insertRows)
      const updated = await reloadMatches()
      if (updated) {
        const newRound = maxKORound + 1
        setTimeout(() => setSelectedRound(newRound), 200)
      }
    } catch (err) {
      console.error(err)
      alert('Fout bij aanmaken finalewedstrijden. Probeer opnieuw.')
    }
    setGeneratingKO(false)
  }

  // ─── Derived state ──────────────────────────────────────────────────────────
  const rounds = useMemo(() => {
    const map: Record<number, Match[]> = {}
    matches.forEach(m => { const r = m.round ?? 0; if (!map[r]) map[r] = []; map[r].push(m) })
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([r, ms]) => ({ round: Number(r), matches: [...ms].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)) }))
  }, [matches])

  const currentRound = rounds.find(r => r.round === selectedRound)
  const liveCount    = matches.filter(m => m.status === 'live').length
  const doneCount    = matches.filter(m => m.status === 'finished').length
  const doneRounds   = rounds.filter(r => getRoundStatus(r.matches) === 'finished').length
  const progress     = rounds.length > 0 ? (doneRounds / rounds.length) * 100 : 0
  const crStatus     = currentRound ? getRoundStatus(currentRound.matches) : null
  const crScheduled  = currentRound?.matches.filter(m => m.status === 'scheduled') ?? []
  const crLive       = currentRound?.matches.filter(m => m.status === 'live') ?? []

  // KO generation availability
  const groupMatches  = matches.filter(m => m.phase === 'group')
  const koMatches     = matches.filter(m => m.phase !== 'group')
  const allGroupDone  = groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished' || m.status === 'cancelled')

  const latestKOPhase = koMatches.length > 0
    ? koMatches.reduce<Match['phase']>((latest, m) =>
        (PHASE_ORDER[m.phase] ?? 0) > (PHASE_ORDER[latest] ?? 0) ? m.phase : latest
      , 'quarter_final')
    : null

  const allLatestKODone = !!latestKOPhase &&
    koMatches.filter(m => m.phase === latestKOPhase).every(m => m.status === 'finished' || m.status === 'cancelled')

  const isMultiPool = (tournament?.num_pools ?? 1) > 1

  const canGenerateFirst = !!tournament && tournament.finals_type !== 'none' && allGroupDone && koMatches.length === 0
  // Next-round button only makes sense for single-pool knockout; multi-pool finale poule is one shot
  const canGenerateNext  = !isMultiPool && !!latestKOPhase && allLatestKODone
    && latestKOPhase !== 'final' && latestKOPhase !== 'third_place'
    && !(latestKOPhase === 'semi_final' && koMatches.some(m => m.phase === 'final'))
    && !(latestKOPhase === 'quarter_final' && koMatches.some(m => m.phase === 'semi_final'))

  const showGenerateButton = canGenerateFirst || canGenerateNext
  const generateButtonLabel = (() => {
    if (canGenerateFirst) {
      return isMultiPool
        ? `🏆 Genereer finale poule (${tournament!.num_pools} poulewinnaars)`
        : `🏆 Genereer finales (${KO_LABEL[FINALS_PHASE[tournament?.finals_type ?? ''] ?? 'final'] ?? 'Finale'})`
    }
    if (latestKOPhase === 'quarter_final') return '🏆 Genereer halve finales'
    if (latestKOPhase === 'semi_final')    return '🏆 Genereer finale & 3e plaats'
    return null
  })()

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />
      <main className="max-w-xl mx-auto px-4 py-5">

        {/* ── Top bar ── */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <Link href="/admin" className="text-xs hover:opacity-80 mb-1 inline-block" style={{ color: 'var(--text-secondary)' }}>
              ← Admin dashboard
            </Link>
            <h1 className="text-xl font-bold leading-tight">{tournament?.name ?? '…'}</h1>
          </div>
          <div className="flex gap-2 flex-shrink-0 mt-4">
            {liveCount > 0 && (
              <Button size="sm" variant="danger" loading={stopAllSaving} onClick={stopAll}>■ Stop alles</Button>
            )}
            <Link href={`/tournament/${id}`} target="_blank">
              <Button size="sm" variant="ghost">Live ↗</Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
          </div>
        ) : <>

          {/* ── Progress ── */}
          <div className="mb-5 p-3 rounded-2xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-semibold">Voortgang toernooi</span>
              <span>{doneRounds}/{rounds.length} rondes  ·  {doneCount}/{matches.length} wedstrijden</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#22c55e' : 'var(--orange)' }} />
            </div>
            {liveCount > 0 && (
              <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--orange)' }}>
                ● {liveCount} wedstrijd{liveCount > 1 ? 'en' : ''} live
              </p>
            )}
          </div>

          {/* ── Generate KO banner ── */}
          {showGenerateButton && generateButtonLabel && (
            <button
              onClick={generateKO}
              disabled={generatingKO}
              className="w-full rounded-2xl font-bold cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform mb-5"
              style={{ padding: '16px 20px', backgroundColor: '#f59e0b', color: '#fff', fontSize: '16px', border: '2px solid #d97706' }}>
              {generatingKO ? 'Aanmaken…' : generateButtonLabel}
            </button>
          )}

          {/* ── Round navigator ── */}
          <div className="mb-1">
            <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>RONDES</p>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 pb-1 mb-5">
            <div className="flex gap-2" style={{ width: 'max-content' }}>
              {rounds.map(({ round, matches: rm }) => (
                <RoundPill key={round} n={round}
                  label={getRoundPillLabel(rm)}
                  status={getRoundStatus(rm)}
                  selected={round === selectedRound}
                  onClick={() => setSelectedRound(round)} />
              ))}
            </div>
          </div>

          {/* ── Round detail ── */}
          {currentRound && <>
            {/* Round header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold">
                  {getRoundPillLabel(currentRound.matches)
                    ? KO_LABEL[currentRound.matches[0]?.phase] ?? `Ronde ${currentRound.round}`
                    : `Ronde ${currentRound.round}`}
                  {!getRoundPillLabel(currentRound.matches) && (
                    <span className="text-base font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>
                      / {rounds.filter(r => !getRoundPillLabel(r.matches)).length}
                    </span>
                  )}
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {crStatus === 'live'
                    ? `${crLive.length} live · ${currentRound.matches.filter(m => m.status === 'finished').length}/${currentRound.matches.length} klaar`
                    : crStatus === 'finished'
                    ? `Alle ${currentRound.matches.filter(m => m.status !== 'cancelled').length} wedstrijden gespeeld`
                    : `${crScheduled.length} veld${crScheduled.length !== 1 ? 'en' : ''} staan klaar`}
                </p>
              </div>
              {crStatus === 'live' && (
                <div className="px-3 py-1.5 rounded-full text-sm font-bold"
                  style={{ backgroundColor: '#FF6B0020', color: 'var(--orange)', border: '1px solid #FF6B0050' }}>
                  ● LIVE
                </div>
              )}
              {crStatus === 'finished' && (
                <div className="px-3 py-1.5 rounded-full text-sm font-bold"
                  style={{ backgroundColor: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e50' }}>
                  ✓ Gespeeld
                </div>
              )}
            </div>

            {/* Match cards */}
            <div className="flex flex-col gap-3 mb-4">
              {currentRound.matches.map(match => {
                const s = states[match.id]
                if (!s) return null
                return (
                  <MatchCard key={match.id} match={match} s={s}
                    onUpd={p => upd(match.id, p)}
                    onSaveScore={() => saveScore(match)}
                    onSave={status => saveMatch(match, status)}
                  />
                )
              })}
            </div>

            {/* ── BIG round action button ── */}
            {crScheduled.length > 0 && (
              <button onClick={() => startRound(currentRound.matches)} disabled={roundSaving}
                className="w-full rounded-2xl font-bold cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
                style={{ padding: '18px 24px', backgroundColor: 'var(--orange)', color: '#fff', fontSize: '17px' }}>
                {roundSaving ? 'Starten…' : `▶  Start${getRoundPillLabel(currentRound.matches) ? ` ${KO_LABEL[currentRound.matches[0]?.phase] ?? 'ronde'}` : ` ronde ${currentRound.round}`}  ·  ${crScheduled.length} veld${crScheduled.length !== 1 ? 'en' : ''}`}
              </button>
            )}
            {crLive.length > 0 && (
              <button onClick={() => stopRound(currentRound.round, currentRound.matches)} disabled={roundSaving}
                className="w-full rounded-2xl font-bold cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform mt-2"
                style={{ padding: '18px 24px', backgroundColor: '#ef4444', color: '#fff', fontSize: '17px' }}>
                {roundSaving ? 'Stoppen…' : `■  Sluit af  ·  ${crLive.length} live`}
              </button>
            )}
            {crStatus === 'finished' && (
              <p className="text-center text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>
                {showGenerateButton
                  ? '👆 Druk op de gele knop hierboven om de volgende ronde aan te maken'
                  : selectedRound !== rounds[rounds.length - 1]?.round
                  ? 'Ronde klaar — selecteer de volgende ronde hierboven ↑'
                  : '🏆 Toernooi afgerond!'}
              </p>
            )}
          </>}
        </>}
      </main>
    </div>
  )
}
