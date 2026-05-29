'use client'

import { useEffect, useState, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, Match, Tournament, Field, Referee } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Button } from '@/components/ui/Button'

// ── QR popup per scheidsrechter ───────────────────────────────────────────────
function RefQRButton({ refUrl, qrUrl, refName }: { refUrl: string; qrUrl: string; refName: string }) {
  const [open, setOpen]     = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer active:scale-95 flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
        title="Toon scheidsrechter link">
        📱 Link
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center gap-4"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between w-full">
              <div>
                <h3 className="font-bold text-base">📱 {refName}</h3>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Scan of deel deze link</p>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid var(--border)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR" width={200} height={200} />
            </div>
            <div className="w-full rounded-2xl px-3 py-2 text-xs font-mono text-center"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {refUrl}
            </div>
            <button
              onClick={async () => { await navigator.clipboard.writeText(refUrl); setCopied(true); setTimeout(() => setCopied(false), 2500) }}
              className="w-full rounded-2xl py-3 font-bold text-sm cursor-pointer transition-all active:scale-[0.98]"
              style={{ backgroundColor: copied ? '#22c55e' : 'var(--orange)', color: '#fff' }}>
              {copied ? '✓ Gekopieerd!' : '📋 Kopieer link'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── KO pill label helper ──────────────────────────────────────────────────────
const KO_PILL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'KF', semi_final: 'HF', final: 'F', third_place: '3e',
}
function getRoundPillLabel(ms: Match[]): string | undefined {
  for (const m of ms) { const lbl = KO_PILL[m.phase]; if (lbl) return lbl }
  return undefined
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RefereesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches]       = useState<Match[]>([])
  const [referees, setReferees]     = useState<Referee[]>([])
  const [fields, setFields]         = useState<Field[]>([])
  const [loading, setLoading]       = useState(true)

  const [newRefName, setNewRefName] = useState('')
  const [addingRef, setAddingRef]   = useState(false)
  const [autoAssigning, setAutoAssigning] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) router.push('/login') })
  }, [router])

  useEffect(() => {
    Promise.all([
      supabase.from('tournaments').select('*').eq('id', id).single(),
      supabase.from('matches').select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)').eq('tournament_id', id).order('round').order('match_number'),
      supabase.from('referees').select('*').eq('tournament_id', id).order('created_at'),
      supabase.from('fields').select('*').eq('tournament_id', id).order('display_order'),
    ]).then(([t, m, r, f]) => {
      setTournament(t.data)
      setMatches(m.data ?? [])
      setReferees(r.data ?? [])
      setFields(f.data ?? [])
      setLoading(false)
    })
  }, [id])

  // Realtime: wedstrijdstatus bijhouden (voor vrij/bezig)
  useEffect(() => {
    if (!id) return
    const sub = supabase
      .channel(`referees-rt-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` },
        ({ new: updated }) => {
          const m = updated as Match
          setMatches(prev => prev.map(p => p.id === m.id ? { ...p, ...m, home_team: p.home_team, away_team: p.away_team, field: p.field } : p))
        })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [id])

  // ── Derived state ─────────────────────────────────────────────────────────
  const rounds = useMemo(() => {
    const map: Record<number, Match[]> = {}
    matches.forEach(m => { const r = m.round ?? 0; if (!map[r]) map[r] = []; map[r].push(m) })
    return Object.entries(map).sort(([a], [b]) => Number(a) - Number(b))
      .map(([r, ms]) => ({ round: Number(r), matches: [...ms].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)) }))
  }, [matches])

  const liveRefIds = useMemo(
    () => new Set(matches.filter(m => m.status === 'live' && m.referee_id).map(m => m.referee_id!)),
    [matches]
  )

  // ── Functies ──────────────────────────────────────────────────────────────
  const reloadReferees = async () => {
    const { data } = await supabase.from('referees').select('*').eq('tournament_id', id).order('created_at')
    setReferees(data ?? [])
  }

  const addReferee = async () => {
    const name = newRefName.trim(); if (!name) return
    setAddingRef(true)
    await supabase.from('referees').insert({ tournament_id: id, name })
    setNewRefName(''); setAddingRef(false)
    reloadReferees()
  }

  const deleteReferee = async (refId: string) => {
    if (!confirm('Scheidsrechter verwijderen? Wedstrijden worden losgekoppeld.')) return
    await supabase.from('referees').delete().eq('id', refId)
    reloadReferees()
  }

  const toggleBlock = async (refId: string, roundNum: number) => {
    const ref = referees.find(r => r.id === refId); if (!ref) return
    const current = ref.blocked_rounds ?? []
    const next = current.includes(roundNum) ? current.filter(r => r !== roundNum) : [...current, roundNum]
    setReferees(prev => prev.map(r => r.id === refId ? { ...r, blocked_rounds: next } : r))
    await supabase.from('referees').update({ blocked_rounds: next }).eq('id', refId)
  }

  const assignInGrid = async (matchId: string, refId: string | null, round: number, currentRefId: string | null) => {
    const isMine = currentRefId === refId
    const newRefId = isMine ? null : refId
    // Verwijder conflicts: dezelfde scheids al ingepland op ander veld in dezelfde ronde
    const conflicts = newRefId !== null
      ? matches.filter(x => x.id !== matchId && x.round === round && x.referee_id === newRefId)
      : []
    const toUpdate = [
      { id: matchId, refId: newRefId },
      ...conflicts.map(x => ({ id: x.id, refId: null as string | null })),
    ]
    await Promise.all(toUpdate.map(({ id, refId: r }) =>
      supabase.from('matches').update({ referee_id: r }).eq('id', id)
    ))
    setMatches(prev => prev.map(p => {
      const u = toUpdate.find(t => t.id === p.id)
      return u ? { ...p, referee_id: u.refId } : p
    }))
  }

  const autoAssign = async () => {
    if (!referees.length) return
    if (!confirm(`Wedstrijden automatisch verdelen over ${referees.length} scheidsrechter${referees.length !== 1 ? 's' : ''}?\n\nBestaande toewijzingen worden overschreven.`)) return
    setAutoAssigning(true)

    const toAssign = matches
      .filter(m => m.status !== 'cancelled' && m.status !== 'finished')
      .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.match_number ?? 0) - (b.match_number ?? 0))

    const roundGroups: Record<number, typeof toAssign> = {}
    toAssign.forEach(m => { const r = m.round ?? 0; if (!roundGroups[r]) roundGroups[r] = []; roundGroups[r].push(m) })

    const counts: Record<string, number> = {}
    const lastWorkedRound: Record<string, number | null> = {}
    referees.forEach(r => { counts[r.id] = 0; lastWorkedRound[r.id] = null })

    const sortedRoundNums = Object.keys(roundGroups).map(Number).sort((a, b) => a - b)
    const updates: { id: string; refId: string }[] = []

    for (let ri = 0; ri < sortedRoundNums.length; ri++) {
      const roundNum  = sortedRoundNums[ri]
      const prevRound = ri > 0 ? sortedRoundNums[ri - 1] : null
      const roundMs   = roundGroups[roundNum]
      const usedInRound = new Set<string>()

      for (const m of roundMs) {
        const notBlocked = (r: Referee) => !(r.blocked_rounds ?? []).includes(roundNum)
        let available = referees.filter(r => !usedInRound.has(r.id) && notBlocked(r) && (prevRound === null || lastWorkedRound[r.id] !== prevRound))
        if (!available.length) available = referees.filter(r => !usedInRound.has(r.id) && notBlocked(r))
        if (!available.length) available = referees.filter(r => !usedInRound.has(r.id))
        if (!available.length) break

        const best = available.reduce((a, b) => counts[a.id] <= counts[b.id] ? a : b)
        updates.push({ id: m.id, refId: best.id })
        counts[best.id]++; usedInRound.add(best.id); lastWorkedRound[best.id] = roundNum
      }
    }

    await Promise.all(updates.map(({ id, refId }) =>
      supabase.from('matches').update({ referee_id: refId }).eq('id', id)
    ))
    setMatches(prev => prev.map(m => {
      const u = updates.find(x => x.id === m.id)
      return u ? { ...m, referee_id: u.refId } : m
    }))
    setAutoAssigning(false)
  }

  const siteBase = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />
      <main className="max-w-xl mx-auto px-4 py-5">

        {/* ── Top bar ── */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <Link href={`/admin/tournament/${id}/matches`}
              className="text-xs hover:opacity-80 mb-1 inline-block"
              style={{ color: 'var(--text-secondary)' }}>
              ← Terug naar wedstrijden
            </Link>
            <h1 className="text-xl font-bold leading-tight">
              👤 Scheidsrechters
            </h1>
            {tournament && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{tournament.name}</p>
            )}
          </div>
          <Link href={`/tournament/${id}`} target="_blank" className="mt-5 flex-shrink-0">
            <Button size="sm" variant="ghost">Live ↗</Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">

            {/* ── Toevoegen + auto-verdelen ── */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
              <div className="px-4 py-3 flex items-center gap-2"
                style={{ borderBottom: referees.length >= 2 ? '1px solid var(--border)' : undefined, backgroundColor: 'var(--bg-elevated)' }}>
                <input
                  type="text"
                  placeholder="Naam scheidsrechter…"
                  value={newRefName}
                  onChange={e => setNewRefName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addReferee()}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
                <button onClick={addReferee} disabled={addingRef || !newRefName.trim()}
                  className="text-sm font-bold px-4 py-2 rounded-xl cursor-pointer disabled:opacity-40 flex-shrink-0 active:scale-95"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                  {addingRef ? '…' : '+ Voeg toe'}
                </button>
              </div>

              {referees.length >= 2 && (
                <div className="px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Verdeel alle <strong>nog te spelen</strong> wedstrijden eerlijk over {referees.length} scheidsrechters
                  </p>
                  <button onClick={autoAssign} disabled={autoAssigning}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl cursor-pointer disabled:opacity-50 flex-shrink-0 active:scale-95"
                    style={{ backgroundColor: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e50' }}>
                    {autoAssigning ? '⏳ Bezig…' : '🎲 Automatisch verdelen'}
                  </button>
                </div>
              )}
            </div>

            {/* ── Scheidsrechterslijst ── */}
            {referees.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Nog geen scheidsrechters. Voeg een naam toe hierboven.
              </div>
            ) : (
              [...referees]
                .sort((a, b) =>
                  matches.filter(m => m.referee_id === a.id).length -
                  matches.filter(m => m.referee_id === b.id).length
                )
                .map(ref => {
                  const assignedCount = matches.filter(m => m.referee_id === ref.id).length
                  const maxCount = Math.max(...referees.map(r => matches.filter(m => m.referee_id === r.id).length), 1)
                  const barPct = Math.round((assignedCount / maxCount) * 100)
                  const refUrl = `${siteBase}/ref/${ref.id}/${ref.token}`
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(refUrl)}&bgcolor=ffffff&color=1a1a1a&margin=8`
                  const isBusy = liveRefIds.has(ref.id)

                  return (
                    <div key={ref.id} className="rounded-2xl overflow-hidden"
                      style={{ border: `1.5px solid ${isBusy ? '#ef444440' : 'var(--border)'}`, backgroundColor: 'var(--bg-card)' }}>

                      {/* Drukke-indicator balk bovenaan */}
                      {liveRefIds.size > 0 && (
                        <div className="px-4 py-1.5 flex items-center gap-2"
                          style={{ backgroundColor: isBusy ? '#ef444415' : '#22c55e12', borderBottom: '1px solid var(--border)' }}>
                          <span className="text-[11px] font-bold"
                            style={{ color: isBusy ? '#ef4444' : '#22c55e' }}>
                            {isBusy ? '● Momenteel aan het fluiten' : '● Vrij — beschikbaar als vervanger'}
                          </span>
                        </div>
                      )}

                      {/* Hoofdrij */}
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-sm">{ref.name}</p>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-md"
                              style={{ backgroundColor: assignedCount === 0 ? '#ef444415' : '#22c55e20', color: assignedCount === 0 ? '#ef4444' : '#22c55e' }}>
                              {assignedCount} wedstrijd{assignedCount !== 1 ? 'en' : ''}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)', width: 100 }}>
                            <div className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${barPct}%`, backgroundColor: assignedCount === 0 ? '#ef4444' : '#22c55e' }} />
                          </div>
                        </div>
                        <RefQRButton refUrl={refUrl} qrUrl={qrUrl} refName={ref.name} />
                        <button onClick={() => deleteReferee(ref.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs cursor-pointer active:scale-90 flex-shrink-0"
                          style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}
                          title="Verwijder scheidsrechter">✕</button>
                      </div>

                      {/* Toewijzingsrooster per veld */}
                      {fields.length > 0 && (
                        <div className="px-4 pb-2 flex flex-col gap-1.5">
                          {fields.map(f => {
                            const fieldMs = matches
                              .filter(m => m.field_id === f.id && m.status !== 'cancelled')
                              .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))
                            if (!fieldMs.length) return null
                            return (
                              <div key={f.id} className="flex items-start gap-2">
                                <span className="text-[11px] font-semibold flex-shrink-0 pt-0.5"
                                  style={{ color: 'var(--text-secondary)', minWidth: 52 }}>
                                  {f.name}:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {fieldMs.map(m => {
                                    const isBlockedRound = (ref.blocked_rounds ?? []).includes(m.round ?? 0)
                                    const isFinished = m.status === 'finished'
                                    const isMine  = m.referee_id === ref.id
                                    const isOther = m.referee_id !== null && !isMine
                                    const other   = isOther ? referees.find(r => r.id === m.referee_id) : null
                                    const pill    = getRoundPillLabel(rounds.find(r => r.round === m.round)?.matches ?? [])
                                    const locked  = isBlockedRound || isFinished

                                    return (
                                      <button key={m.id}
                                        onClick={() => { if (!locked) assignInGrid(m.id, ref.id, m.round ?? 0, m.referee_id ?? null) }}
                                        title={
                                          isFinished && isMine  ? `Gespeeld door ${ref.name} 🔒`
                                          : isFinished && isOther ? `Gespeeld door ${other?.name ?? '?'} 🔒`
                                          : isFinished          ? `Gespeeld (geen scheids) 🔒`
                                          : isBlockedRound      ? `Geblokkeerd voor ${ref.name}`
                                          : isOther             ? `Nu: ${other?.name ?? '?'} — klik om over te nemen`
                                          : isMine              ? 'Klik om los te koppelen'
                                          : 'Klik om toe te wijzen'
                                        }
                                        className="text-[11px] px-1.5 py-0.5 rounded-md font-semibold transition-colors"
                                        style={{
                                          cursor: locked ? 'not-allowed' : 'pointer',
                                          opacity: isBlockedRound ? 0.35 : isFinished ? 0.55 : 1,
                                          backgroundColor: isMine  ? '#22c55e20'
                                            : isOther ? (isFinished ? '#3b82f610' : '#ef444415')
                                            : 'var(--bg-elevated)',
                                          color: isMine ? '#22c55e'
                                            : isOther ? (isFinished ? 'var(--text-secondary)' : '#ef4444')
                                            : 'var(--text-secondary)',
                                          border: `1px solid ${isMine ? '#22c55e50'
                                            : isOther ? (isFinished ? 'var(--border)' : '#ef444435')
                                            : 'var(--border)'}`,
                                        }}>
                                        {isFinished ? '🔒 ' : ''}{pill ?? `R${m.round}`}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Blokkeer rondes */}
                      {rounds.length > 0 && (
                        <div className="mx-3 mb-3 px-3 py-2 rounded-xl flex items-start gap-2"
                          style={{ backgroundColor: '#ef444410', border: '1px dashed #ef444440' }}>
                          <span className="text-[11px] font-bold flex-shrink-0 pt-0.5 select-none"
                            style={{ color: '#ef4444', minWidth: 54 }}>
                            🚫 Blok:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {rounds.map(({ round: rn, matches: rm }) => {
                              const isBlocked = (ref.blocked_rounds ?? []).includes(rn)
                              const pill = getRoundPillLabel(rm)
                              return (
                                <button key={rn}
                                  onClick={e => { e.stopPropagation(); toggleBlock(ref.id, rn) }}
                                  title={isBlocked ? `Ronde ${rn} geblokkeerd — klik om vrij te geven` : `Klik om ronde ${rn} te blokkeren`}
                                  className="text-[11px] px-2 py-0.5 rounded-md cursor-pointer active:scale-95 font-bold transition-colors select-none"
                                  style={{
                                    backgroundColor: isBlocked ? '#ef444430' : 'rgba(255,255,255,0.08)',
                                    color: isBlocked ? '#ef4444' : 'var(--text-secondary)',
                                    border: `1.5px solid ${isBlocked ? '#ef4444' : '#ef444430'}`,
                                    textDecoration: isBlocked ? 'line-through' : 'none',
                                  }}>
                                  {isBlocked ? '✕ ' : ''}{pill ?? `R${rn}`}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
            )}
          </div>
        )}
      </main>
    </div>
  )
}
