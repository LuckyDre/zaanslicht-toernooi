'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { supabase, Match, Tournament } from '@/lib/supabase'

// ── Elapsed timer ─────────────────────────────────────────────────────────────
function ElapsedTimer({ startedAt, matchMinutes }: { startedAt: string; matchMinutes: number }) {
  const calc = useCallback(() =>
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  , [startedAt])
  const [secs, setSecs] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(id)
  }, [calc])
  const overtime = secs > matchMinutes * 60
  const m = Math.floor(secs / 60), s = secs % 60
  return (
    <span className="font-mono text-sm font-bold tabular-nums"
      style={{ color: overtime ? '#ef4444' : '#22c55e' }}>
      {m}:{s.toString().padStart(2, '0')}{overtime ? ' ⚡' : ''}
    </span>
  )
}

// ── Score state per match ─────────────────────────────────────────────────────
type SS = { home: number; away: number; saving: boolean; error: string | null }

// ── Referee match card ────────────────────────────────────────────────────────
function RefMatchCard({
  match, s, matchMinutes, onUpd, onSave,
}: {
  match: Match; s: SS
  matchMinutes: number
  onUpd: (p: Partial<SS>) => void
  onSave: (status: Match['status']) => void
}) {
  const isLive      = match.status === 'live'
  const isScheduled = match.status === 'scheduled'

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        border: `2px solid ${isLive ? '#22c55e' : 'var(--border)'}`,
        backgroundColor: isLive ? '#22c55e08' : 'var(--bg-card)',
      }}>

      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: isLive ? '#22c55e18' : 'var(--bg-elevated)',
          borderBottom: `1px solid ${isLive ? '#22c55e40' : 'var(--border)'}`,
        }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold truncate">{match.field?.name ?? `Wedstrijd ${match.match_number}`}</span>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            R{match.round}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLive && match.started_at && (
            <ElapsedTimer startedAt={match.started_at} matchMinutes={matchMinutes} />
          )}
          {s.saving && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>…</span>}
          {s.error && <span className="text-xs font-bold" style={{ color: '#ef4444' }}>⚠</span>}
          {isLive && <span className="text-xs font-bold" style={{ color: '#22c55e' }}>● LIVE</span>}
        </div>
      </div>

      {/* Score entry */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">

          {/* Home team */}
          <div className="flex-1 flex flex-col items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 px-1">
              <span className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
              <span className="font-bold text-sm truncate leading-tight text-center">
                {match.home_team?.name ?? '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onPointerDown={() => onUpd({ home: Math.max(0, s.home - 1) })}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--bg-elevated)', touchAction: 'manipulation' }}>
                −
              </button>
              <span className="text-5xl font-bold font-mono w-14 text-center tabular-nums select-none">
                {s.home}
              </span>
              <button
                onPointerDown={() => onUpd({ home: s.home + 1 })}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', touchAction: 'manipulation' }}>
                +
              </button>
            </div>
          </div>

          <div className="text-2xl font-bold flex-shrink-0 mt-6" style={{ color: 'var(--text-secondary)' }}>
            :
          </div>

          {/* Away team */}
          <div className="flex-1 flex flex-col items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 px-1">
              <span className="font-bold text-sm truncate leading-tight text-center">
                {match.away_team?.name ?? '—'}
              </span>
              <span className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: match.away_team?.color || '#888' }} />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onPointerDown={() => onUpd({ away: Math.max(0, s.away - 1) })}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--bg-elevated)', touchAction: 'manipulation' }}>
                −
              </button>
              <span className="text-5xl font-bold font-mono w-14 text-center tabular-nums select-none">
                {s.away}
              </span>
              <button
                onPointerDown={() => onUpd({ away: s.away + 1 })}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', touchAction: 'manipulation' }}>
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-4 pb-4">
        {isScheduled && (
          <button disabled={s.saving}
            onClick={() => onSave('live')}
            className="flex-1 py-4 rounded-2xl font-bold text-base cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: '#22c55e', color: '#fff' }}>
            ▶ Start wedstrijd
          </button>
        )}
        {isLive && (
          <>
            <button disabled={s.saving}
              onClick={() => onSave('live')}
              className="flex-1 py-3.5 rounded-2xl font-semibold text-sm cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              💾 Tussenstand
            </button>
            <button disabled={s.saving}
              onClick={() => onSave('finished')}
              className="flex-1 py-3.5 rounded-2xl font-bold text-base cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
              style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
              ✓ Eindstand
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main referee page ─────────────────────────────────────────────────────────
export default function RefPage({ params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = use(params)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches]       = useState<Match[]>([])
  const [scores, setScores]         = useState<Record<string, SS>>({})
  const [auth, setAuth]             = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    // Validate referee token server-side
    supabase.rpc('validate_ref_token', {
      p_tournament_id: id,
      p_ref_token: token,
    }).then(({ data, error }) => {
      setAuth(!error && data === true ? 'ok' : 'denied')
    })

    // Load tournament meta (no ref_token exposed)
    supabase.from('tournaments')
      .select('id,name,match_duration_minutes,break_minutes,starts_at,status')
      .eq('id', id).single()
      .then(({ data }) => setTournament(data as Tournament))

    const loadMatches = () =>
      supabase.from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
        .eq('tournament_id', id)
        .order('round').order('match_number')
        .then(({ data }) => {
          const list = data ?? []
          setMatches(list)
          setScores(prev => {
            const next = { ...prev }
            list.forEach(m => {
              if (!next[m.id]) {
                next[m.id] = { home: m.home_score ?? 0, away: m.away_score ?? 0, saving: false, error: null }
              }
            })
            return next
          })
        })

    loadMatches()

    // Real-time: live score updates
    const sub = supabase.channel(`ref-${id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches',
        filter: `tournament_id=eq.${id}`,
      }, loadMatches)
      .subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [id, token])

  const upd = (matchId: string, p: Partial<SS>) =>
    setScores(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...p } }))

  const saveMatch = async (match: Match, status: Match['status']) => {
    const s = scores[match.id]
    if (!s) return
    upd(match.id, { saving: true, error: null })

    const { error } = await supabase.rpc('update_match_as_referee', {
      p_match_id:    match.id,
      p_ref_token:   token,
      p_home_score:  s.home,
      p_away_score:  s.away,
      p_status:      status,
      p_started_at:  status === 'live' && !match.started_at ? new Date().toISOString() : null,
      p_finished_at: status === 'finished' ? new Date().toISOString() : null,
    })

    if (error) {
      upd(match.id, { saving: false, error: error.message })
    } else {
      setMatches(prev => prev.map(m =>
        m.id === match.id
          ? {
              ...m, status,
              home_score: s.home, away_score: s.away,
              started_at: status === 'live' && !m.started_at ? new Date().toISOString() : m.started_at,
              finished_at: status === 'finished' ? new Date().toISOString() : null,
            }
          : m
      ))
      upd(match.id, { saving: false })
    }
  }

  const matchMinutes = tournament?.match_duration_minutes ?? 25

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (auth === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="w-10 h-10 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  // ── Access denied ────────────────────────────────────────────────────────────
  if (auth === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6"
        style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="text-center max-w-xs">
          <div className="text-6xl mb-5">🔒</div>
          <h1 className="text-xl font-bold mb-3">Geen toegang</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Ongeldige scheidsrechterslink. Vraag de toernooi-admin om een nieuwe link.
          </p>
        </div>
      </div>
    )
  }

  // ── Derive match groups ──────────────────────────────────────────────────────
  const live      = matches.filter(m => m.status === 'live')
  const scheduled = matches.filter(m => m.status === 'scheduled')
  const finished  = matches.filter(m => m.status === 'finished')

  // Group scheduled by round
  const byRound: Record<number, Match[]> = {}
  scheduled.forEach(m => {
    const r = m.round ?? 0
    if (!byRound[r]) byRound[r] = []
    byRound[r].push(m)
  })
  const schedRounds = Object.keys(byRound).map(Number).sort((a, b) => a - b)

  // Last 5 finished (most recent first for easy correction)
  const recentDone = [...finished].reverse().slice(0, 5)

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: 'var(--bg-base)' }}>

      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-4 py-3.5"
        style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--orange)' }}>
              📋 Scheidsrechter
            </p>
            <h1 className="font-bold text-base leading-tight">{tournament?.name ?? '…'}</h1>
          </div>
          {live.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: '#22c55e20', border: '1px solid #22c55e60' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#22c55e' }} />
              <span className="text-sm font-bold" style={{ color: '#22c55e' }}>
                {live.length} live
              </span>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-6">

        {/* ── Live ── */}
        {live.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#22c55e' }}>
              ● Live
            </h2>
            <div className="flex flex-col gap-4">
              {live.map(m => (
                <RefMatchCard key={m.id} match={m} s={scores[m.id] ?? { home: 0, away: 0, saving: false, error: null }}
                  matchMinutes={matchMinutes}
                  onUpd={p => upd(m.id, p)}
                  onSave={status => saveMatch(m, status)} />
              ))}
            </div>
          </section>
        )}

        {/* ── Scheduled per round ── */}
        {schedRounds.map(r => (
          <section key={r}>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
              Ronde {r}
            </h2>
            <div className="flex flex-col gap-4">
              {byRound[r].map(m => (
                <RefMatchCard key={m.id} match={m} s={scores[m.id] ?? { home: 0, away: 0, saving: false, error: null }}
                  matchMinutes={matchMinutes}
                  onUpd={p => upd(m.id, p)}
                  onSave={status => saveMatch(m, status)} />
              ))}
            </div>
          </section>
        ))}

        {/* ── All done ── */}
        {live.length === 0 && scheduled.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🏁</div>
            <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Alle wedstrijden zijn gespeeld
            </p>
          </div>
        )}

        {/* ── Recent results (editable) ── */}
        {recentDone.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
              Afgerond — tik ✏️ om te corrigeren
            </h2>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {recentDone.map((m, idx) => (
                <div key={m.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: idx > 0 ? '1px solid var(--border)' : undefined, backgroundColor: 'var(--bg-card)' }}>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: m.home_team?.color || 'var(--orange)' }} />
                    <span className="font-semibold text-sm truncate">{m.home_team?.name ?? '—'}</span>
                  </div>
                  <span className="font-bold font-mono text-base flex-shrink-0 px-2"
                    style={{ color: '#22c55e' }}>
                    {m.home_score ?? 0}–{m.away_score ?? 0}
                  </span>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                    <span className="font-semibold text-sm truncate text-right">{m.away_team?.name ?? '—'}</span>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: m.away_team?.color || '#888' }} />
                  </div>
                  <button
                    onClick={() => {
                      upd(m.id, { home: m.home_score ?? 0, away: m.away_score ?? 0 })
                      saveMatch(m, 'live')
                    }}
                    className="ml-1 w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer active:scale-90"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                    title="Heropen wedstrijd">
                    ✏️
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
