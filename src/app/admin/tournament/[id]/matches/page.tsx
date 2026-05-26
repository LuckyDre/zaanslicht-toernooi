'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, Match, Tournament } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(0, value - 1))}
        className="w-12 h-12 rounded-xl text-2xl font-bold cursor-pointer flex items-center justify-center active:scale-95"
        style={{ backgroundColor: 'var(--bg-base)' }}>−</button>
      <span className="text-3xl font-bold font-mono w-10 text-center">{value}</span>
      <button onClick={() => onChange(value + 1)}
        className="w-12 h-12 rounded-xl text-2xl font-bold cursor-pointer flex items-center justify-center active:scale-95"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>+</button>
    </div>
  )
}

// Drie snelknoppen: Gestart / Gaande / Klaar
function QuickButtons({ match, saving, onStart, onSave, onFinish }: {
  match: Match
  saving: boolean
  onStart: () => void
  onSave: () => void
  onFinish: () => void
}) {
  const status = match.status
  const btn = (label: string, active: boolean, onClick: () => void, color: string) => (
    <button
      onClick={onClick}
      disabled={saving}
      className="flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
      style={{
        backgroundColor: active ? color : 'var(--bg-elevated)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
      }}
    >{label}</button>
  )

  return (
    <div className="flex gap-1.5">
      {btn('▶ Gestart', status === 'live', status === 'scheduled' ? onStart : () => {}, '#3b82f6')}
      {btn('💾 Gaande', false, status === 'live' ? onSave : () => {}, '#f59e0b')}
      {btn('✓ Klaar', status === 'finished', status !== 'finished' && status !== 'cancelled' ? onFinish : () => {}, '#22c55e')}
    </div>
  )
}

type MatchState = { homeScore: number; awayScore: number; saving: boolean; saved: boolean; error: string | null }

const STATUS_BG: Record<string, string> = {
  live: '#FF6B0018', finished: '#22c55e18', cancelled: '#ef444418', scheduled: 'transparent',
}
const STATUS_BORDER: Record<string, string> = {
  live: 'var(--orange)', finished: '#22c55e66', cancelled: '#ef444466', scheduled: 'var(--border)',
}

export default function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [states, setStates] = useState<Record<string, MatchState>>({})
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | 'scheduled' | 'live' | 'finished' | 'cancelled'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const [stopAllSaving, setStopAllSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })
  }, [router])

  useEffect(() => {
    supabase.from('tournaments').select('*').eq('id', id).single().then(({ data }) => setTournament(data))
    supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('tournament_id', id).order('round').order('match_number')
      .then(({ data }) => {
        const list = data ?? []
        setMatches(list)
        const init: Record<string, MatchState> = {}
        list.forEach(m => { init[m.id] = { homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0, saving: false, saved: false, error: null } })
        setStates(init)
        setLoading(false)
      })
  }, [id])

  const updateState = (matchId: string, patch: Partial<MatchState>) =>
    setStates(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...patch } }))

  const toggleSelect = (matchId: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(matchId) ? n.delete(matchId) : n.add(matchId); return n })
  }

  const saveMatch = async (match: Match, status: 'live' | 'finished' | 'cancelled' | 'scheduled', scores = true) => {
    const s = states[match.id]
    if (!s) return
    updateState(match.id, { saving: true, error: null, saved: false })
    const { error } = await supabase.from('matches').update({
      ...(scores && status !== 'cancelled' ? { home_score: s.homeScore, away_score: s.awayScore } : {}),
      ...(status === 'cancelled' ? { home_score: null, away_score: null } : {}),
      status,
      started_at: status === 'live' && !match.started_at ? new Date().toISOString() : match.started_at,
      finished_at: status === 'finished' ? new Date().toISOString() : null,
    }).eq('id', match.id)
    if (error) {
      updateState(match.id, { saving: false, error: `Fout: ${error.message}` })
    } else {
      setMatches(prev => prev.map(m => m.id === match.id
        ? { ...m, status,
            home_score: status === 'cancelled' ? null : s.homeScore,
            away_score: status === 'cancelled' ? null : s.awayScore }
        : m))
      updateState(match.id, { saving: false, saved: true })
      setTimeout(() => updateState(match.id, { saved: false }), 2000)
    }
  }

  const handleScoreUpdate = async (match: Match) => {
    const s = states[match.id]
    if (!s) return
    updateState(match.id, { saving: true, error: null })
    const { error } = await supabase.from('matches').update({ home_score: s.homeScore, away_score: s.awayScore }).eq('id', match.id)
    if (error) {
      updateState(match.id, { saving: false, error: `Fout: ${error.message}` })
    } else {
      setMatches(prev => prev.map(m => m.id === match.id ? { ...m, home_score: s.homeScore, away_score: s.awayScore } : m))
      updateState(match.id, { saving: false, saved: true })
      setTimeout(() => updateState(match.id, { saved: false }), 2000)
    }
  }

  // Stop ALLE live wedstrijden in één keer
  const handleStopAll = async () => {
    const live = matches.filter(m => m.status === 'live')
    if (!live.length) return
    if (!confirm(`Alle ${live.length} live wedstrijden stoppen?`)) return
    setStopAllSaving(true)
    const now = new Date().toISOString()
    await Promise.all(live.map(m => {
      const s = states[m.id]
      return supabase.from('matches').update({
        status: 'finished', finished_at: now,
        home_score: s?.homeScore ?? m.home_score ?? 0,
        away_score: s?.awayScore ?? m.away_score ?? 0,
      }).eq('id', m.id)
    }))
    setMatches(prev => prev.map(m => {
      if (m.status !== 'live') return m
      const s = states[m.id]
      return { ...m, status: 'finished', finished_at: now,
        home_score: s?.homeScore ?? m.home_score ?? 0,
        away_score: s?.awayScore ?? m.away_score ?? 0 }
    }))
    setStopAllSaving(false)
  }

  const handleBulkStart = async () => {
    const toStart = matches.filter(m => selected.has(m.id) && m.status === 'scheduled')
    if (!toStart.length) return
    setBulkSaving(true)
    const now = new Date().toISOString()
    await Promise.all(toStart.map(m =>
      supabase.from('matches').update({ status: 'live', started_at: now, home_score: 0, away_score: 0 }).eq('id', m.id)
    ))
    setMatches(prev => prev.map(m => selected.has(m.id) && m.status === 'scheduled'
      ? { ...m, status: 'live', started_at: now, home_score: 0, away_score: 0 } : m))
    setStates(prev => { const n = { ...prev }; toStart.forEach(m => { n[m.id] = { ...n[m.id], homeScore: 0, awayScore: 0 } }); return n })
    setSelected(new Set())
    setBulkSaving(false)
  }

  const handleBulkFinish = async () => {
    const toFinish = matches.filter(m => selected.has(m.id) && m.status === 'live')
    if (!toFinish.length) return
    setBulkSaving(true)
    const now = new Date().toISOString()
    await Promise.all(toFinish.map(m => {
      const s = states[m.id]
      return supabase.from('matches').update({
        status: 'finished', finished_at: now,
        home_score: s?.homeScore ?? m.home_score ?? 0,
        away_score: s?.awayScore ?? m.away_score ?? 0,
      }).eq('id', m.id)
    }))
    setMatches(prev => prev.map(m => {
      if (!selected.has(m.id) || m.status !== 'live') return m
      const s = states[m.id]
      return { ...m, status: 'finished', finished_at: now,
        home_score: s?.homeScore ?? m.home_score ?? 0,
        away_score: s?.awayScore ?? m.away_score ?? 0 }
    }))
    setSelected(new Set())
    setBulkSaving(false)
  }

  const filtered   = matches.filter(m => activeFilter === 'all' || m.status === activeFilter)
  const liveCount  = matches.filter(m => m.status === 'live').length
  const schedCount = matches.filter(m => m.status === 'scheduled').length
  const doneCount  = matches.filter(m => m.status === 'finished').length
  const cancelCount= matches.filter(m => m.status === 'cancelled').length

  const selScheduled = matches.filter(m => selected.has(m.id) && m.status === 'scheduled').length
  const selLive      = matches.filter(m => selected.has(m.id) && m.status === 'live').length

  const selectableInView = filtered.filter(m => m.status !== 'finished' && m.status !== 'cancelled')
  const allSelected = selectableInView.length > 0 && selectableInView.every(m => selected.has(m.id))

  return (
    <div className="min-h-screen pb-36" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/admin" className="text-sm mb-4 inline-block hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          ← Admin dashboard
        </Link>

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">{tournament?.name ?? '...'}</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {matches.length} wedstrijden · {doneCount} klaar · {liveCount} live · {schedCount} gepland
              {cancelCount > 0 ? ` · ${cancelCount} afgelast` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {liveCount > 0 && (
              <Button size="sm" variant="danger" loading={stopAllSaving} onClick={handleStopAll}>
                ■ Stop alle ({liveCount})
              </Button>
            )}
            <Link href={`/tournament/${id}`} target="_blank">
              <Button size="sm" variant="ghost">Live view ↗</Button>
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ backgroundColor: 'var(--bg-card)' }}>
          {[
            { key: 'all',       label: `Alle (${matches.length})` },
            { key: 'live',      label: `Live (${liveCount})` },
            { key: 'scheduled', label: `Gepland (${schedCount})` },
            { key: 'finished',  label: `Klaar (${doneCount})` },
            ...(cancelCount > 0 ? [{ key: 'cancelled', label: `Afgelast (${cancelCount})` }] : []),
          ].map(f => (
            <button key={f.key}
              onClick={() => { setActiveFilter(f.key as typeof activeFilter); setSelected(new Set()) }}
              className="flex-1 py-1.5 px-1 rounded-lg text-xs font-medium cursor-pointer transition-all"
              style={{ backgroundColor: activeFilter === f.key ? 'var(--orange)' : 'transparent', color: activeFilter === f.key ? '#fff' : 'var(--text-secondary)' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Selecteer alles */}
        {!loading && selectableInView.length > 0 && (
          <div className="flex items-center justify-between mb-4 px-1">
            <button onClick={() => { if (allSelected) setSelected(new Set()); else setSelected(new Set(selectableInView.map(m => m.id))) }}
              className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
              <div className="w-5 h-5 rounded border-2 flex items-center justify-center"
                style={{ borderColor: allSelected ? 'var(--orange)' : 'var(--border)', backgroundColor: allSelected ? 'var(--orange)' : 'transparent' }}>
                {allSelected && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              Selecteer alles
            </button>
            {selected.size > 0 && (
              <span className="text-sm font-medium" style={{ color: 'var(--orange)' }}>{selected.size} geselecteerd</span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map(match => {
              const s = states[match.id]
              if (!s) return null
              const isLive      = match.status === 'live'
              const isDone      = match.status === 'finished'
              const isCancelled = match.status === 'cancelled'
              const isSelected  = selected.has(match.id)
              const selectable  = !isDone && !isCancelled

              return (
                <div key={match.id} className="relative">
                  {selectable && (
                    <button onClick={() => toggleSelect(match.id)}
                      className="absolute top-3 right-3 z-10 w-6 h-6 rounded border-2 flex items-center justify-center cursor-pointer transition-all"
                      style={{ borderColor: isSelected ? 'var(--orange)' : 'var(--border)', backgroundColor: isSelected ? 'var(--orange)' : 'var(--bg-elevated)' }}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </button>
                  )}

                  <Card style={{ border: `1px solid ${isSelected ? 'var(--orange)' : STATUS_BORDER[match.status]}`, backgroundColor: STATUS_BG[match.status] }}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 pr-8">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {match.field ? match.field.name : `Wedstrijd #${match.match_number}`}
                        {match.round ? ` · Ronde ${match.round}` : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        {s.saved && <span className="text-xs" style={{ color: 'var(--green)' }}>✓ Opgeslagen</span>}
                        <Badge variant={isLive ? 'green' : isDone ? 'gray' : isCancelled ? 'red' : 'yellow'}>
                          {isLive ? '● LIVE' : isDone ? 'Gespeeld' : isCancelled ? 'Afgelast' : 'Gepland'}
                        </Badge>
                      </div>
                    </div>

                    {/* Teams + Scores */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
                          <span className="font-semibold truncate text-sm">{match.home_team?.name ?? '—'}</span>
                        </div>
                        {!isCancelled && <ScoreInput value={s.homeScore} onChange={v => updateState(match.id, { homeScore: v, saved: false })} />}
                      </div>
                      <div className="text-xl font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {isDone ? `${match.home_score ?? 0}–${match.away_score ?? 0}` : isCancelled ? '–' : 'vs'}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col items-end">
                        <div className="flex items-center gap-2 mb-3 justify-end">
                          <span className="font-semibold truncate text-sm">{match.away_team?.name ?? '—'}</span>
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
                        </div>
                        {!isCancelled && <ScoreInput value={s.awayScore} onChange={v => updateState(match.id, { awayScore: v, saved: false })} />}
                      </div>
                    </div>

                    {s.error && (
                      <div className="mb-3 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: '#ef444422', color: 'var(--red)' }}>
                        {s.error}
                      </div>
                    )}

                    {/* Drie snelknoppen */}
                    {!isCancelled && (
                      <div className="mb-3">
                        <QuickButtons
                          match={match}
                          saving={s.saving}
                          onStart={() => saveMatch(match, 'live')}
                          onSave={() => handleScoreUpdate(match)}
                          onFinish={() => saveMatch(match, 'finished')}
                        />
                      </div>
                    )}

                    {/* Extra knoppen */}
                    <div className="flex gap-2 flex-wrap pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      {!isDone && !isCancelled && (
                        <Button size="sm" variant="danger" loading={s.saving}
                          onClick={() => { if (confirm('Wedstrijd aflasten?')) saveMatch(match, 'cancelled', false) }}>
                          Aflasten
                        </Button>
                      )}
                      {(isDone || isCancelled) && (
                        <Button size="sm" variant="secondary" loading={s.saving}
                          onClick={() => saveMatch(match, 'scheduled', false)} className="flex-1">
                          ↩ Herplannen
                        </Button>
                      )}
                      {isDone && (
                        <Button size="sm" variant="secondary" loading={s.saving}
                          onClick={() => saveMatch(match, 'finished')} className="flex-1">
                          ✏️ Score aanpassen
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
              )
            })}

            {filtered.length === 0 && (
              <Card className="text-center py-8">
                <p style={{ color: 'var(--text-secondary)' }}>Geen wedstrijden in deze categorie</p>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Bulk actie balk */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-4 py-4"
          style={{ backgroundColor: 'var(--bg-card)', borderTop: '2px solid var(--orange)', boxShadow: '0 -4px 20px rgba(0,0,0,0.5)' }}>
          <div className="max-w-2xl mx-auto w-full">
            <p className="text-sm font-semibold mb-3 text-center" style={{ color: 'var(--text-secondary)' }}>
              {selected.size} geselecteerd · {selScheduled > 0 ? `${selScheduled} gepland` : ''}{selScheduled > 0 && selLive > 0 ? ' · ' : ''}{selLive > 0 ? `${selLive} live` : ''}
            </p>
            <div className="flex gap-2">
              {selScheduled > 0 && (
                <Button loading={bulkSaving} onClick={handleBulkStart} className="flex-1">
                  ▶ Start {selScheduled}
                </Button>
              )}
              {selLive > 0 && (
                <Button loading={bulkSaving} onClick={handleBulkFinish} variant="secondary" className="flex-1">
                  ✓ Sluit {selLive} af
                </Button>
              )}
              <Button variant="ghost" onClick={() => setSelected(new Set())}>✕</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
