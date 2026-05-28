'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { supabase, Match, Team, Field } from '@/lib/supabase'

type FullMatch = Match & { home_team: Team; away_team: Team; field: Field | null }
type PageState = 'loading' | 'invalid' | 'waiting' | 'live' | 'finished'

// ── Elapsed timer ─────────────────────────────────────────────────────────────
function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const calc = useCallback(() =>
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  , [startedAt])
  const [secs, setSecs] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(id)
  }, [calc])
  const m = Math.floor(secs / 60), s = secs % 60
  return (
    <span className="font-mono font-bold tabular-nums text-xl" style={{ color: '#22c55e' }}>
      {m}:{s.toString().padStart(2, '0')}
    </span>
  )
}

// ── Main referee page ─────────────────────────────────────────────────────────
// [id]    = match ID
// [token] = match.ref_token  (unique per match, shared only with that match's referee)
export default function RefMatchPage({ params }: { params: Promise<{ id: string; token: string }> }) {
  const { id: matchId, token } = use(params)

  const [pageState, setPageState] = useState<PageState>('loading')
  const [match, setMatch]         = useState<FullMatch | null>(null)
  const [homeScore, setHomeScore] = useState(0)
  const [awayScore, setAwayScore] = useState(0)
  const [saving, setSaving]       = useState(false)
  const [saveOk, setSaveOk]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Apply a (partial) match update
  const applyStatus = useCallback((status: Match['status'], hs?: number | null, as_?: number | null) => {
    if (status === 'live')     setPageState('live')
    else if (status === 'finished') {
      setPageState('finished')
      setHomeScore(hs ?? 0)
      setAwayScore(as_ ?? 0)
    } else {
      setPageState('waiting')
    }
  }, [])

  useEffect(() => {
    // Load match + validate token client-side
    supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('id', matchId)
      .single()
      .then(({ data }) => {
        if (!data || data.ref_token !== token) { setPageState('invalid'); return }
        const m = data as FullMatch
        setMatch(m)
        setHomeScore(m.home_score ?? 0)
        setAwayScore(m.away_score ?? 0)
        applyStatus(m.status, m.home_score, m.away_score)
      })

    // Real-time — status change from admin (scheduled → live) appears instantly
    const sub = supabase
      .channel(`ref-match-${matchId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: `id=eq.${matchId}`,
      }, ({ new: upd }) => {
        const m = upd as Match
        setMatch(prev => prev ? { ...prev, ...m } : null)
        applyStatus(m.status, m.home_score, m.away_score)
      })
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [matchId, token, applyStatus])

  const saveScore = async (status: 'live' | 'finished') => {
    setSaving(true)
    setError(null)
    setSaveOk(false)
    const { data } = await supabase.rpc('update_match_as_referee', {
      p_match_id:    matchId,
      p_ref_token:   token,
      p_home_score:  homeScore,
      p_away_score:  awayScore,
      p_status:      status,
      p_finished_at: status === 'finished' ? new Date().toISOString() : null,
    })
    setSaving(false)
    if (data?.success === false) {
      setError(data.error ?? 'Fout bij opslaan')
    } else {
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
      if (status === 'finished') {
        setPageState('finished')
        setMatch(prev => prev ? { ...prev, status: 'finished', home_score: homeScore, away_score: awayScore } : prev)
      }
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (pageState === 'loading') return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="w-10 h-10 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
    </div>
  )

  // ── Invalid ──────────────────────────────────────────────────────────────────
  if (pageState === 'invalid') return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="text-center max-w-xs">
        <div className="text-6xl mb-5">🔒</div>
        <h1 className="text-xl font-bold mb-3">Geen toegang</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Ongeldige scheidsrechterslink. Vraag de toernooi-admin om een nieuwe link.
        </p>
      </div>
    </div>
  )

  if (!match) return null

  const homeName  = match.home_team?.name  ?? '?'
  const awayName  = match.away_team?.name  ?? '?'
  const homeColor = match.home_team?.color || 'var(--orange)'
  const awayColor = match.away_team?.color || '#888'
  const fieldName = match.field?.name

  // ── Finished ─────────────────────────────────────────────────────────────────
  if (pageState === 'finished') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-6"
      style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="text-6xl">🏁</div>
      <h1 className="text-2xl font-bold text-center">Wedstrijd afgerond</h1>
      {fieldName && (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{fieldName}</p>
      )}
      <div className="w-full max-w-xs rounded-3xl p-6"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4">
          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="w-5 h-5 rounded-full" style={{ backgroundColor: homeColor }} />
            <span className="font-bold text-sm text-center leading-tight">{homeName}</span>
          </div>
          <span className="text-5xl font-bold font-mono tabular-nums" style={{ color: '#22c55e' }}>
            {match.home_score ?? homeScore}–{match.away_score ?? awayScore}
          </span>
          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="w-5 h-5 rounded-full" style={{ backgroundColor: awayColor }} />
            <span className="font-bold text-sm text-center leading-tight">{awayName}</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
        Uitslag opgeslagen. Bedankt!
      </p>
    </div>
  )

  // ── Waiting ──────────────────────────────────────────────────────────────────
  if (pageState === 'waiting') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-6"
      style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold mb-2">Wacht op start</h1>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          De wedstrijd is nog niet gestart. Zodra de admin de ronde start, verschijnen
          hier automatisch de score-knoppen.
        </p>
      </div>

      {/* Match preview card */}
      <div className="w-full max-w-xs rounded-3xl overflow-hidden"
        style={{ border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
        {(fieldName || match.round) && (
          <div className="px-4 py-2.5 text-center text-sm font-semibold"
            style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            {[fieldName, match.round ? `Ronde ${match.round}` : null].filter(Boolean).join(' · ')}
          </div>
        )}
        <div className="px-4 py-6 flex items-center justify-between gap-4">
          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="w-6 h-6 rounded-full" style={{ backgroundColor: homeColor }} />
            <span className="font-bold text-base text-center leading-tight">{homeName}</span>
          </div>
          <span className="text-xl font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>vs</span>
          <div className="flex-1 flex flex-col items-center gap-2">
            <span className="w-6 h-6 rounded-full" style={{ backgroundColor: awayColor }} />
            <span className="font-bold text-base text-center leading-tight">{awayName}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--orange)' }} />
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Wachten op admin…</span>
      </div>
    </div>
  )

  // ── Live ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>

      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-4 py-3"
        style={{ backgroundColor: '#22c55e18', borderBottom: '2px solid #22c55e40' }}>
        <div className="flex items-center justify-between max-w-sm mx-auto">
          <div>
            {fieldName && (
              <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{fieldName}</p>
            )}
            <p className="font-bold text-sm" style={{ color: '#22c55e' }}>● LIVE</p>
          </div>
          {match.started_at && <ElapsedTimer startedAt={match.started_at} />}
        </div>
      </div>

      {/* Score area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-sm mx-auto w-full gap-8">

        {/* Teams + score inputs */}
        <div className="w-full flex items-start gap-3">

          {/* Home */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <span className="w-6 h-6 rounded-full" style={{ backgroundColor: homeColor }} />
              <span className="font-bold text-sm text-center leading-tight px-1">{homeName}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button onPointerDown={() => setHomeScore(s => s + 1)}
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', touchAction: 'manipulation' }}>
                +
              </button>
              <span className="text-7xl font-bold font-mono tabular-nums select-none leading-none py-2">
                {homeScore}
              </span>
              <button onPointerDown={() => setHomeScore(s => Math.max(0, s - 1))}
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', touchAction: 'manipulation' }}>
                −
              </button>
            </div>
          </div>

          {/* Separator */}
          <div className="flex-shrink-0 mt-28 text-3xl font-bold" style={{ color: 'var(--text-secondary)' }}>:</div>

          {/* Away */}
          <div className="flex-1 flex flex-col items-center gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <span className="w-6 h-6 rounded-full" style={{ backgroundColor: awayColor }} />
              <span className="font-bold text-sm text-center leading-tight px-1">{awayName}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button onPointerDown={() => setAwayScore(s => s + 1)}
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', touchAction: 'manipulation' }}>
                +
              </button>
              <span className="text-7xl font-bold font-mono tabular-nums select-none leading-none py-2">
                {awayScore}
              </span>
              <button onPointerDown={() => setAwayScore(s => Math.max(0, s - 1))}
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', touchAction: 'manipulation' }}>
                −
              </button>
            </div>
          </div>
        </div>

        {/* Feedback */}
        {error && (
          <p className="text-sm text-center font-semibold" style={{ color: '#ef4444' }}>{error}</p>
        )}
        {saveOk && !error && (
          <p className="text-sm text-center font-semibold" style={{ color: '#22c55e' }}>✓ Opgeslagen</p>
        )}

        {/* Action buttons */}
        <div className="w-full flex flex-col gap-3">
          <button disabled={saving} onPointerDown={() => saveScore('live')}
            className="w-full rounded-2xl py-4 font-semibold text-base cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', touchAction: 'manipulation' }}>
            {saving ? '…' : '💾 Tussenstand opslaan'}
          </button>
          <button disabled={saving} onPointerDown={() => saveScore('finished')}
            className="w-full rounded-2xl py-5 font-bold text-lg cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: 'var(--orange)', color: '#fff', touchAction: 'manipulation' }}>
            {saving ? 'Opslaan…' : '✓ Eindstand — wedstrijd afsluiten'}
          </button>
        </div>
      </div>
    </div>
  )
}
