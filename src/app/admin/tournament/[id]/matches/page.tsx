'use client'

import { useEffect, useState, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, Match, Tournament } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Button } from '@/components/ui/Button'

type MS = { homeScore: number; awayScore: number; saving: boolean; saved: boolean; error: string | null }

function roundStatus(ms: Match[]): 'scheduled' | 'live' | 'finished' {
  const active = ms.filter(m => m.status !== 'cancelled')
  if (!active.length || active.every(m => m.status === 'finished')) return 'finished'
  if (active.some(m => m.status === 'live')) return 'live'
  return 'scheduled'
}

export default function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [states, setStates] = useState<Record<string, MS>>({})
  const [loading, setLoading] = useState(true)
  const [roundSaving, setRoundSaving] = useState<Set<number>>(new Set())
  const [stopAllSaving, setStopAllSaving] = useState(false)
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) router.push('/login') })
  }, [router])

  useEffect(() => {
    supabase.from('tournaments').select('*').eq('id', id).single().then(({ data }) => setTournament(data))
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
        const toExpand = new Set<number>()
        const sortedRounds = Object.keys(map).map(Number).sort((a, b) => a - b)
        sortedRounds.forEach(r => { if (roundStatus(map[r]) !== 'finished') toExpand.add(r) })
        const lastDone = [...sortedRounds].reverse().find(r => roundStatus(map[r]) === 'finished')
        if (lastDone !== undefined) toExpand.add(lastDone)
        setExpandedRounds(toExpand)
        setLoading(false)
      })
  }, [id])

  const upd = (matchId: string, p: Partial<MS>) =>
    setStates(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...p } }))

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
      setMatches(prev => prev.map(m => m.id === match.id
        ? { ...m, status, home_score: status === 'cancelled' ? null : s.homeScore, away_score: status === 'cancelled' ? null : s.awayScore } : m))
      upd(match.id, { saving: false, saved: true })
      setTimeout(() => upd(match.id, { saved: false }), 2500)
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

  const startRound = async (roundNum: number, toStart: Match[]) => {
    setRoundSaving(p => new Set([...p, roundNum]))
    const now = new Date().toISOString()
    await Promise.all(toStart.map(m =>
      supabase.from('matches').update({ status: 'live', started_at: now, home_score: 0, away_score: 0 }).eq('id', m.id)
    ))
    setMatches(prev => prev.map(m =>
      toStart.find(t => t.id === m.id) ? { ...m, status: 'live', started_at: now, home_score: 0, away_score: 0 } : m
    ))
    setStates(prev => {
      const n = { ...prev }
      toStart.forEach(m => { n[m.id] = { ...n[m.id], homeScore: 0, awayScore: 0 } })
      return n
    })
    setRoundSaving(p => { const n = new Set(p); n.delete(roundNum); return n })
  }

  const stopRound = async (roundNum: number, toLive: Match[]) => {
    if (!confirm(`Ronde ${roundNum}: ${toLive.length} wedstrijd${toLive.length > 1 ? 'en' : ''} afsluiten?`)) return
    setRoundSaving(p => new Set([...p, roundNum]))
    const now = new Date().toISOString()
    await Promise.all(toLive.map(m => {
      const s = states[m.id]
      return supabase.from('matches').update({
        status: 'finished', finished_at: now,
        home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0,
      }).eq('id', m.id)
    }))
    setMatches(prev => prev.map(m => {
      if (!toLive.find(t => t.id === m.id)) return m
      const s = states[m.id]
      return { ...m, status: 'finished', finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }
    }))
    setRoundSaving(p => { const n = new Set(p); n.delete(roundNum); return n })
  }

  const stopAll = async () => {
    const live = matches.filter(m => m.status === 'live')
    if (!live.length || !confirm(`${live.length} live wedstrijden stoppen?`)) return
    setStopAllSaving(true)
    const now = new Date().toISOString()
    await Promise.all(live.map(m => {
      const s = states[m.id]
      return supabase.from('matches').update({
        status: 'finished', finished_at: now,
        home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0,
      }).eq('id', m.id)
    }))
    setMatches(prev => prev.map(m => {
      if (m.status !== 'live') return m
      const s = states[m.id]
      return { ...m, status: 'finished', finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }
    }))
    setStopAllSaving(false)
  }

  const rounds = useMemo(() => {
    const map: Record<number, Match[]> = {}
    matches.forEach(m => { const r = m.round ?? 0; if (!map[r]) map[r] = []; map[r].push(m) })
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([r, ms]) => ({
        round: Number(r),
        matches: [...ms].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)),
      }))
  }, [matches])

  const liveCount = matches.filter(m => m.status === 'live').length
  const doneCount = matches.filter(m => m.status === 'finished').length
  const finishedRounds = rounds.filter(({ matches: ms }) => roundStatus(ms) === 'finished')
  const allFinishedCollapsed = finishedRounds.every(({ round }) => !expandedRounds.has(round))

  const toggleRound = (r: number) =>
    setExpandedRounds(prev => { const n = new Set(prev); n.has(r) ? n.delete(r) : n.add(r); return n })

  const toggleFinishedRounds = () => {
    if (allFinishedCollapsed) {
      setExpandedRounds(prev => { const n = new Set(prev); finishedRounds.forEach(({ round }) => n.add(round)); return n })
    } else {
      setExpandedRounds(prev => { const n = new Set(prev); finishedRounds.forEach(({ round }) => n.delete(round)); return n })
    }
  }

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/admin" className="text-sm mb-4 inline-block hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}>
          ← Admin dashboard
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">{tournament?.name ?? '...'}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {doneCount}/{matches.length} gespeeld{liveCount > 0 ? ` · ${liveCount} live` : ''} · {rounds.length} rondes
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {liveCount > 0 && (
              <Button size="sm" variant="danger" loading={stopAllSaving} onClick={stopAll}>
                ■ Stop alle ({liveCount})
              </Button>
            )}
            <Link href={`/tournament/${id}`} target="_blank">
              <Button size="sm" variant="ghost">Live ↗</Button>
            </Link>
          </div>
        </div>

        {/* Finished rounds toggle */}
        {finishedRounds.length > 0 && (
          <button onClick={toggleFinishedRounds}
            className="text-xs mb-5 cursor-pointer hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}>
            {allFinishedCollapsed
              ? `▼ Toon ${finishedRounds.length} gespeelde ronde${finishedRounds.length > 1 ? 's' : ''}`
              : '▲ Verberg gespeelde rondes'}
          </button>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          // Timeline container — rounds connected by a vertical line
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[23px] top-4 bottom-4 w-px"
              style={{ backgroundColor: 'var(--border)' }} />

            <div className="flex flex-col gap-4">
              {rounds.map(({ round, matches: rm }) => {
                const rs         = roundStatus(rm)
                const isExpanded = expandedRounds.has(round)
                const scheduled  = rm.filter(m => m.status === 'scheduled')
                const live       = rm.filter(m => m.status === 'live')
                const done       = rm.filter(m => m.status === 'finished' || m.status === 'cancelled').length
                const isSaving   = roundSaving.has(round)

                const dotColor    = rs === 'live' ? 'var(--orange)' : rs === 'finished' ? '#22c55e' : 'var(--bg-elevated)'
                const dotBorder   = rs === 'live' ? 'var(--orange)' : rs === 'finished' ? '#22c55e' : 'var(--border)'
                const cardBorder  = rs === 'live' ? 'var(--orange)' : 'var(--border)'
                const cardBg      = rs === 'live' ? '#FF6B0010' : 'var(--bg-card)'

                return (
                  <div key={round} className="flex items-start gap-3">

                    {/* Timeline dot */}
                    <div className="flex-shrink-0 mt-3.5 z-10">
                      <div className="w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center"
                        style={{ backgroundColor: dotColor, borderColor: dotBorder, boxShadow: rs === 'live' ? '0 0 0 3px #FF6B0030' : 'none' }}>
                        {rs === 'finished' && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                        {rs === 'live' && <span className="block w-2 h-2 rounded-full bg-white animate-pulse" />}
                      </div>
                    </div>

                    {/* Round card */}
                    <div className="flex-1 min-w-0 rounded-2xl overflow-hidden"
                      style={{ border: `1.5px solid ${cardBorder}`, backgroundColor: cardBg }}>

                      {/* ── Round header (click to expand/collapse) ── */}
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 cursor-pointer text-left gap-2"
                        onClick={() => toggleRound(round)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-sm whitespace-nowrap">Ronde {round}</span>
                          <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                            {rs === 'live'
                              ? `${live.length} live · ${done}/${rm.length} klaar`
                              : rs === 'finished'
                              ? `${done} gespeeld`
                              : `${scheduled.length} veld${scheduled.length !== 1 ? 'en' : ''} gepland`}
                          </span>
                        </div>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </button>

                      {/* ── Match list ── */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--border)' }}>
                          {rm.map((match) => {
                            const s          = states[match.id]; if (!s) return null
                            const isLive      = match.status === 'live'
                            const isDone      = match.status === 'finished'
                            const isCancelled = match.status === 'cancelled'
                            const isScheduled = match.status === 'scheduled'

                            return (
                              <div key={match.id}
                                style={{
                                  padding: '10px 16px',
                                  borderBottom: '1px solid var(--border)',
                                  backgroundColor: isLive ? '#FF6B0008' : 'transparent',
                                }}>

                                {/* Field label + match status */}
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                    {match.field?.name ?? `Wedstrijd ${match.match_number}`}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {s.error && <span className="text-xs" style={{ color: '#ef4444' }}>⚠ {s.error}</span>}
                                    {s.saved && <span className="text-xs font-medium" style={{ color: '#22c55e' }}>✓ Opgeslagen</span>}
                                    {isLive      && <span className="text-xs font-bold" style={{ color: 'var(--orange)' }}>● LIVE</span>}
                                    {isDone      && <span className="text-xs font-medium" style={{ color: '#22c55e' }}>✓ Gespeeld</span>}
                                    {isCancelled && <span className="text-xs" style={{ color: '#ef4444' }}>✕ Afgelast</span>}
                                  </div>
                                </div>

                                {/* Teams + score */}
                                <div className="flex items-center gap-2 mb-2.5">
                                  {/* Home */}
                                  <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
                                    <span className="text-sm font-bold truncate">{match.home_team?.name ?? '—'}</span>
                                  </div>

                                  {/* Score / controls */}
                                  <div className="flex-shrink-0">
                                    {isDone ? (
                                      <span className="text-lg font-bold font-mono px-2">
                                        {match.home_score ?? 0}–{match.away_score ?? 0}
                                      </span>
                                    ) : isCancelled ? (
                                      <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>afgelast</span>
                                    ) : isLive ? (
                                      <div className="flex items-center gap-0.5">
                                        <button
                                          onClick={() => upd(match.id, { homeScore: Math.max(0, s.homeScore - 1), saved: false })}
                                          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold cursor-pointer active:scale-95"
                                          style={{ backgroundColor: 'var(--bg-base)' }}>−</button>
                                        <span className="text-2xl font-bold font-mono w-8 text-center select-none">{s.homeScore}</span>
                                        <button
                                          onClick={() => upd(match.id, { homeScore: s.homeScore + 1, saved: false })}
                                          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold cursor-pointer active:scale-95"
                                          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>+</button>
                                        <span className="text-base font-bold mx-1.5" style={{ color: 'var(--text-secondary)' }}>:</span>
                                        <button
                                          onClick={() => upd(match.id, { awayScore: Math.max(0, s.awayScore - 1), saved: false })}
                                          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold cursor-pointer active:scale-95"
                                          style={{ backgroundColor: 'var(--bg-base)' }}>−</button>
                                        <span className="text-2xl font-bold font-mono w-8 text-center select-none">{s.awayScore}</span>
                                        <button
                                          onClick={() => upd(match.id, { awayScore: s.awayScore + 1, saved: false })}
                                          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold cursor-pointer active:scale-95"
                                          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>+</button>
                                      </div>
                                    ) : (
                                      <span className="text-sm font-medium px-3" style={{ color: 'var(--text-secondary)' }}>vs</span>
                                    )}
                                  </div>

                                  {/* Away */}
                                  <div className="flex-1 flex items-center gap-1.5 min-w-0 justify-end">
                                    <span className="text-sm font-bold truncate">{match.away_team?.name ?? '—'}</span>
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: match.away_team?.color || '#888' }} />
                                  </div>
                                </div>

                                {/* Per-match action buttons */}
                                <div className="flex gap-2">
                                  {isScheduled && (
                                    <Button size="sm" loading={s.saving}
                                      onClick={() => saveMatch(match, 'live')} className="flex-1">
                                      ▶ Start
                                    </Button>
                                  )}
                                  {isLive && (
                                    <>
                                      <Button size="sm" variant="secondary" loading={s.saving}
                                        onClick={() => saveScore(match)} className="flex-1">
                                        💾 Opslaan
                                      </Button>
                                      <Button size="sm" loading={s.saving}
                                        onClick={() => saveMatch(match, 'finished')} className="flex-1">
                                        ✓ Klaar
                                      </Button>
                                    </>
                                  )}
                                  {!isDone && !isCancelled && (
                                    <Button size="sm" variant="danger" loading={s.saving}
                                      onClick={() => { if (confirm('Wedstrijd aflasten?')) saveMatch(match, 'cancelled') }}>
                                      ✕
                                    </Button>
                                  )}
                                  {isDone && (
                                    <Button size="sm" variant="secondary" loading={s.saving}
                                      onClick={() => saveMatch(match, 'live')} className="flex-1">
                                      ✏️ Aanpassen
                                    </Button>
                                  )}
                                  {(isDone || isCancelled) && (
                                    <Button size="sm" variant="ghost" loading={s.saving}
                                      onClick={() => saveMatch(match, 'scheduled')} className="flex-1">
                                      ↩ Herplannen
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })}

                          {/* ── Prominent round action button ── */}
                          {(scheduled.length > 0 || live.length > 0) && (
                            <div className="p-3 flex flex-col gap-2">
                              {scheduled.length > 0 && (
                                <button
                                  onClick={() => startRound(round, scheduled)}
                                  disabled={isSaving}
                                  className="w-full py-4 rounded-xl font-bold text-base cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
                                  style={{ backgroundColor: 'var(--orange)', color: '#fff', fontSize: '15px' }}>
                                  {isSaving
                                    ? 'Starten…'
                                    : `▶ Start ronde ${round}  ·  ${scheduled.length} veld${scheduled.length !== 1 ? 'en' : ''}`}
                                </button>
                              )}
                              {live.length > 0 && (
                                <button
                                  onClick={() => stopRound(round, live)}
                                  disabled={isSaving}
                                  className="w-full py-4 rounded-xl font-bold text-base cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
                                  style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '15px' }}>
                                  {isSaving
                                    ? 'Stoppen…'
                                    : `■ Stop ronde ${round}  ·  ${live.length} live`}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Collapsed summary for scheduled rounds: show the big start button even when collapsed */}
                      {!isExpanded && scheduled.length > 0 && (
                        <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
                          <button
                            onClick={() => startRound(round, scheduled)}
                            disabled={isSaving}
                            className="w-full py-4 rounded-xl font-bold cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform mt-3"
                            style={{ backgroundColor: 'var(--orange)', color: '#fff', fontSize: '15px' }}>
                            {isSaving
                              ? 'Starten…'
                              : `▶ Start ronde ${round}  ·  ${scheduled.length} veld${scheduled.length !== 1 ? 'en' : ''}`}
                          </button>
                        </div>
                      )}
                      {!isExpanded && live.length > 0 && (
                        <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
                          <button
                            onClick={() => stopRound(round, live)}
                            disabled={isSaving}
                            className="w-full py-4 rounded-xl font-bold cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform mt-3"
                            style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '15px' }}>
                            {isSaving ? 'Stoppen…' : `■ Stop ronde ${round}  ·  ${live.length} live`}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
