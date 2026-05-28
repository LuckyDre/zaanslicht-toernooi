'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { supabase, Match, Team, Field, Tournament } from '@/lib/supabase'

type Referee   = { id: string; name: string; token: string; tournament_id: string }
type FullMatch = Match & { home_team: Team; away_team: Team; field: Field | null }
type SS        = { home: number; away: number; saving: boolean; error: string | null; saved: boolean }

const PHASE_LABEL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'KF', semi_final: 'HF', final: 'Finale', third_place: '3e plaats',
}

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
    <span className="font-mono font-bold tabular-nums" style={{ color: '#22c55e', fontSize: '1.05rem' }}>
      {m}:{s.toString().padStart(2, '0')}
    </span>
  )
}

// ── Compact scheduled match card (waiting state) ──────────────────────────────
function ScheduledCard({ match, time }: { match: FullMatch; time?: string | null }) {
  const homeColor = match.home_team?.color || 'var(--orange)'
  const awayColor = match.away_team?.color || '#888'
  const phaseLabel = PHASE_LABEL[match.phase]
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1.5px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-2.5"
        style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
        {time && (
          <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
            🕐 {time}
          </span>
        )}
        {match.field?.name && (
          <span className="text-sm flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {match.field.name}
          </span>
        )}
        {phaseLabel && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-md ml-auto flex-shrink-0"
            style={{ backgroundColor: '#FF6B0020', color: 'var(--orange)', border: '1px solid #FF6B0050' }}>
            {phaseLabel}
          </span>
        )}
        {!phaseLabel && (
          <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            R{match.round}
          </span>
        )}
      </div>
      {/* Teams */}
      <div className="flex items-center justify-between gap-4 px-4 py-4">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: homeColor }} />
          <span className="font-bold truncate">{match.home_team?.name ?? '—'}</span>
        </div>
        <span className="font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>vs</span>
        <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
          <span className="font-bold truncate text-right">{match.away_team?.name ?? '—'}</span>
          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: awayColor }} />
        </div>
      </div>
      {/* Waiting indicator */}
      <div className="px-4 pb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--orange)' }} />
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Wacht op start ronde</span>
      </div>
    </div>
  )
}

// ── Live score input card ─────────────────────────────────────────────────────
function LiveCard({ match, s, onUpd, onSave }: {
  match: FullMatch; s: SS
  onUpd: (p: Partial<SS>) => void
  onSave: (status: 'live' | 'finished') => void
}) {
  const homeColor = match.home_team?.color || 'var(--orange)'
  const awayColor = match.away_team?.color || '#888'
  const phaseLabel = PHASE_LABEL[match.phase]
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '2px solid #22c55e', backgroundColor: '#22c55e06' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: '#22c55e18', borderBottom: '1px solid #22c55e30' }}>
        <div className="flex items-center gap-2">
          {match.field?.name && (
            <span className="font-bold text-sm">{match.field.name}</span>
          )}
          {phaseLabel ? (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: '#FF6B0020', color: 'var(--orange)' }}>{phaseLabel}</span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>R{match.round}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {match.started_at && <ElapsedTimer startedAt={match.started_at} />}
          <span className="text-xs font-bold" style={{ color: '#22c55e' }}>● LIVE</span>
        </div>
      </div>

      {/* Score inputs */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2">
          {/* Home */}
          <div className="flex-1 flex flex-col items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 px-1">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: homeColor }} />
              <span className="font-bold text-sm truncate">{match.home_team?.name ?? '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button onPointerDown={() => onUpd({ home: Math.max(0, s.home - 1) })}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--bg-elevated)', touchAction: 'manipulation' }}>−</button>
              <span className="text-5xl font-bold font-mono w-14 text-center tabular-nums select-none">{s.home}</span>
              <button onPointerDown={() => onUpd({ home: s.home + 1 })}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', touchAction: 'manipulation' }}>+</button>
            </div>
          </div>
          <div className="text-2xl font-bold flex-shrink-0 mt-6" style={{ color: 'var(--text-secondary)' }}>:</div>
          {/* Away */}
          <div className="flex-1 flex flex-col items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 px-1">
              <span className="font-bold text-sm truncate">{match.away_team?.name ?? '—'}</span>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: awayColor }} />
            </div>
            <div className="flex items-center gap-1.5">
              <button onPointerDown={() => onUpd({ away: Math.max(0, s.away - 1) })}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--bg-elevated)', touchAction: 'manipulation' }}>−</button>
              <span className="text-5xl font-bold font-mono w-14 text-center tabular-nums select-none">{s.away}</span>
              <button onPointerDown={() => onUpd({ away: s.away + 1 })}
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold cursor-pointer active:scale-90 select-none"
                style={{ backgroundColor: 'var(--orange)', color: '#fff', touchAction: 'manipulation' }}>+</button>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback + actions */}
      {s.error && (
        <p className="px-4 pb-2 text-sm font-semibold" style={{ color: '#ef4444' }}>{s.error}</p>
      )}
      {s.saved && !s.error && (
        <p className="px-4 pb-2 text-sm font-semibold" style={{ color: '#22c55e' }}>✓ Opgeslagen</p>
      )}
      <div className="flex gap-2 px-4 pb-4">
        <button disabled={s.saving} onClick={() => onSave('live')}
          className="flex-1 py-3.5 rounded-2xl font-semibold text-sm cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', touchAction: 'manipulation' }}>
          {s.saving ? '…' : '💾 Tussenstand'}
        </button>
        <button disabled={s.saving} onClick={() => onSave('finished')}
          className="flex-1 py-3.5 rounded-2xl font-bold text-base cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
          style={{ backgroundColor: 'var(--orange)', color: '#fff', touchAction: 'manipulation' }}>
          {s.saving ? 'Opslaan…' : '✓ Eindstand'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
// [id]    = referee.id
// [token] = referee.token  (unieke link per scheidsrechter)
export default function RefPage({ params }: { params: Promise<{ id: string; token: string }> }) {
  const { id: refereeId, token } = use(params)

  const [auth, setAuth]           = useState<'loading' | 'ok' | 'denied'>('loading')
  const [referee, setReferee]     = useState<Referee | null>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches]     = useState<FullMatch[]>([])
  const [allRounds, setAllRounds] = useState<number[]>([])
  const [scores, setScores]       = useState<Record<string, SS>>({})

  // Load referee + validate token
  useEffect(() => {
    supabase.from('referees')
      .select('id,name,token,tournament_id')
      .eq('id', refereeId)
      .single()
      .then(({ data }) => {
        if (!data || data.token !== token) { setAuth('denied'); return }
        const ref = data as Referee
        setReferee(ref)
        setAuth('ok')
        // Load tournament meta
        supabase.from('tournaments')
          .select('id,name,match_duration_minutes,break_minutes,starts_at,status,slug,num_fields,num_teams,num_halves,total_duration_minutes,finals_type,num_pools,pool_names,ref_token,updated_at,created_at')
          .eq('id', ref.tournament_id).single()
          .then(({ data: t }) => setTournament(t as Tournament))
        // Load all round numbers in the tournament (for time calculation)
        supabase.from('matches')
          .select('round')
          .eq('tournament_id', ref.tournament_id)
          .then(({ data: rd }) => {
            const rounds = [...new Set((rd ?? []).map((r: { round: number }) => r.round))].sort((a, b) => a - b)
            setAllRounds(rounds)
          })
      })
  }, [refereeId, token])

  // Load matches assigned to this referee
  const loadMatches = useCallback(async () => {
    const { data } = await supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('referee_id', refereeId)
      .order('round').order('match_number')
    const list = (data ?? []) as FullMatch[]
    setMatches(list)
    setScores(prev => {
      const next = { ...prev }
      list.forEach(m => {
        if (!next[m.id]) {
          next[m.id] = { home: m.home_score ?? 0, away: m.away_score ?? 0, saving: false, error: null, saved: false }
        } else if (!next[m.id].saving) {
          // Sync server score (unless referee is actively editing)
          next[m.id] = { ...next[m.id], home: m.home_score ?? next[m.id].home, away: m.away_score ?? next[m.id].away }
        }
      })
      return next
    })
  }, [refereeId])

  useEffect(() => {
    if (auth !== 'ok' || !referee) return
    loadMatches()
    // Subscribe to all tournament matches (status changes + new assignments)
    const sub = supabase.channel(`ref-sched-${refereeId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'matches',
        filter: `tournament_id=eq.${referee.tournament_id}`,
      }, loadMatches)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [auth, referee, refereeId, loadMatches])

  const upd = (matchId: string, p: Partial<SS>) =>
    setScores(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...p } }))

  const saveScore = async (match: FullMatch, status: 'live' | 'finished') => {
    const s = scores[match.id]
    if (!s) return
    upd(match.id, { saving: true, error: null, saved: false })
    const { data } = await supabase.rpc('update_match_as_referee', {
      p_match_id:    match.id,
      p_referee_id:  refereeId,
      p_ref_token:   token,
      p_home_score:  s.home,
      p_away_score:  s.away,
      p_status:      status,
      p_finished_at: status === 'finished' ? new Date().toISOString() : null,
    })
    if (data?.success === false) {
      upd(match.id, { saving: false, error: data.error ?? 'Fout bij opslaan' })
    } else {
      upd(match.id, { saving: false, saved: true })
      setTimeout(() => upd(match.id, { saved: false }), 2000)
    }
  }

  // Compute round → time map (uses full tournament schedule)
  const roundTimeMap: Record<number, string | null> = (() => {
    if (!tournament?.starts_at || allRounds.length === 0) return {}
    const perRound = (tournament.match_duration_minutes + (tournament.break_minutes ?? 10)) * 60_000
    const map: Record<number, string | null> = {}
    allRounds.forEach((r, idx) => {
      map[r] = new Date(new Date(tournament.starts_at!).getTime() + idx * perRound)
        .toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    })
    return map
  })()

  // ── Loading / denied ─────────────────────────────────────────────────────────
  if (auth === 'loading') return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="w-10 h-10 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
    </div>
  )
  if (auth === 'denied') return (
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

  // ── Derive groups ─────────────────────────────────────────────────────────────
  const liveMatches      = matches.filter(m => m.status === 'live')
  const scheduledMatches = matches.filter(m => m.status === 'scheduled')
  const finishedMatches  = matches.filter(m => m.status === 'finished')
  const liveCount        = liveMatches.length

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: 'var(--bg-base)' }}>

      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--orange)' }}>
              🏳️ Scheidsrechter
            </p>
            <h1 className="font-bold text-base leading-tight">{referee?.name ?? '…'}</h1>
            {tournament && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{tournament.name}</p>
            )}
          </div>
          {liveCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: '#22c55e20', border: '1px solid #22c55e60' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#22c55e' }} />
              <span className="text-sm font-bold" style={{ color: '#22c55e' }}>{liveCount} live</span>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-6">

        {/* ── No matches yet ── */}
        {matches.length === 0 && auth === 'ok' && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Nog geen wedstrijden toegewezen
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              De toernooi-admin wijst je wedstrijden toe.
            </p>
          </div>
        )}

        {/* ── Live ── */}
        {liveMatches.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#22c55e' }}>
              ● Nu live
            </h2>
            <div className="flex flex-col gap-4">
              {liveMatches.map(m => (
                <LiveCard key={m.id} match={m}
                  s={scores[m.id] ?? { home: m.home_score ?? 0, away: m.away_score ?? 0, saving: false, error: null, saved: false }}
                  onUpd={p => upd(m.id, p)}
                  onSave={status => saveScore(m, status)} />
              ))}
            </div>
          </section>
        )}

        {/* ── Scheduled ── */}
        {scheduledMatches.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
              Jouw wedstrijden
            </h2>
            <div className="flex flex-col gap-3">
              {scheduledMatches.map(m => (
                <ScheduledCard key={m.id} match={m} time={roundTimeMap[m.round] ?? null} />
              ))}
            </div>
          </section>
        )}

        {/* ── All done ── */}
        {liveMatches.length === 0 && scheduledMatches.length === 0 && finishedMatches.length > 0 && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🏁</div>
            <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              Alle wedstrijden afgerond
            </p>
          </div>
        )}

        {/* ── Finished ── */}
        {finishedMatches.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
              Afgerond
            </h2>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {finishedMatches.map((m, idx) => (
                <div key={m.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: idx > 0 ? '1px solid var(--border)' : undefined, backgroundColor: 'var(--bg-card)' }}>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: m.home_team?.color || 'var(--orange)' }} />
                    <span className="font-semibold text-sm truncate">{m.home_team?.name ?? '—'}</span>
                  </div>
                  <span className="font-bold font-mono text-base flex-shrink-0 px-1"
                    style={{ color: '#22c55e' }}>
                    {m.home_score ?? 0}–{m.away_score ?? 0}
                  </span>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                    <span className="font-semibold text-sm truncate text-right">{m.away_team?.name ?? '—'}</span>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: m.away_team?.color || '#888' }} />
                  </div>
                  <span className="text-xs flex-shrink-0 ml-1" style={{ color: 'var(--text-secondary)' }}>
                    R{m.round}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
