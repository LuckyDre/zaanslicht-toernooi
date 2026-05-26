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

type MatchState = { homeScore: number; awayScore: number; saving: boolean; saved: boolean; error: string | null }

export default function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [states, setStates] = useState<Record<string, MatchState>>({})
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | 'scheduled' | 'live' | 'finished'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })
  }, [router])

  useEffect(() => {
    supabase.from('tournaments').select('*').eq('id', id).single()
      .then(({ data }) => setTournament(data))
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
    setSelected(prev => {
      const next = new Set(prev)
      next.has(matchId) ? next.delete(matchId) : next.add(matchId)
      return next
    })
  }

  const handleSave = async (match: Match, status: 'live' | 'finished') => {
    const s = states[match.id]
    if (!s) return
    updateState(match.id, { saving: true, error: null, saved: false })
    const { error } = await supabase.from('matches').update({
      home_score: s.homeScore, away_score: s.awayScore, status,
      started_at: status === 'live' && !match.started_at ? new Date().toISOString() : match.started_at,
      finished_at: status === 'finished' ? new Date().toISOString() : null,
    }).eq('id', match.id)
    if (error) {
      updateState(match.id, { saving: false, error: `Fout: ${error.message}` })
    } else {
      setMatches(prev => prev.map(m => m.id === match.id
        ? { ...m, home_score: s.homeScore, away_score: s.awayScore, status,
            started_at: status === 'live' && !m.started_at ? new Date().toISOString() : m.started_at,
            finished_at: status === 'finished' ? new Date().toISOString() : null }
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

  // Bulk: start all selected scheduled matches
  const handleBulkStart = async () => {
    const toStart = matches.filter(m => selected.has(m.id) && m.status === 'scheduled')
    if (toStart.length === 0) return
    setBulkSaving(true)
    const now = new Date().toISOString()
    await Promise.all(toStart.map(m =>
      supabase.from('matches').update({ status: 'live', started_at: now, home_score: 0, away_score: 0 }).eq('id', m.id)
    ))
    setMatches(prev => prev.map(m =>
      selected.has(m.id) && m.status === 'scheduled'
        ? { ...m, status: 'live', started_at: now, home_score: 0, away_score: 0 }
        : m
    ))
    setStates(prev => {
      const next = { ...prev }
      toStart.forEach(m => { next[m.id] = { ...next[m.id], homeScore: 0, awayScore: 0, saved: true } })
      return next
    })
    setSelected(new Set())
    setBulkSaving(false)
  }

  // Bulk: finish all selected live matches with current scores
  const handleBulkFinish = async () => {
    const toFinish = matches.filter(m => selected.has(m.id) && m.status === 'live')
    if (toFinish.length === 0) return
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

  const filtered = matches.filter(m => activeFilter === 'all' || m.status === activeFilter)
  const liveCount = matches.filter(m => m.status === 'live').length
  const scheduledCount = matches.filter(m => m.status === 'scheduled').length
  const finishedCount = matches.filter(m => m.status === 'finished').length

  const selectedScheduled = matches.filter(m => selected.has(m.id) && m.status === 'scheduled').length
  const selectedLive = matches.filter(m => selected.has(m.id) && m.status === 'live').length

  // Select all visible non-finished matches
  const selectAll = () => {
    const ids = filtered.filter(m => m.status !== 'finished').map(m => m.id)
    setSelected(prev => {
      const allSelected = ids.every(id => prev.has(id))
      if (allSelected) return new Set()
      return new Set(ids)
    })
  }

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link href="/admin" className="text-sm mb-4 inline-block hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          ← Admin dashboard
        </Link>

        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">{tournament?.name ?? '...'}</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {matches.length} wedstrijden · {finishedCount} gespeeld · {liveCount} live · {scheduledCount} gepland
            </p>
          </div>
          <Link href={`/tournament/${id}`} target="_blank">
            <Button size="sm" variant="ghost">Live view ↗</Button>
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ backgroundColor: 'var(--bg-card)' }}>
          {[
            { key: 'all', label: `Alle (${matches.length})` },
            { key: 'live', label: `Live (${liveCount})` },
            { key: 'scheduled', label: `Gepland (${scheduledCount})` },
            { key: 'finished', label: `Klaar (${finishedCount})` },
          ].map(f => (
            <button key={f.key} onClick={() => { setActiveFilter(f.key as typeof activeFilter); setSelected(new Set()) }}
              className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
              style={{ backgroundColor: activeFilter === f.key ? 'var(--orange)' : 'transparent', color: activeFilter === f.key ? '#fff' : 'var(--text-secondary)' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Selecteer alles balk */}
        {!loading && filtered.some(m => m.status !== 'finished') && (
          <div className="flex items-center justify-between mb-4 px-1">
            <button onClick={selectAll} className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}>
              <div className="w-5 h-5 rounded border-2 flex items-center justify-center"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: filtered.filter(m => m.status !== 'finished').every(m => selected.has(m.id)) ? 'var(--orange)' : 'transparent'
                }}>
                {filtered.filter(m => m.status !== 'finished').every(m => selected.has(m.id)) && (
                  <span className="text-white text-xs font-bold">✓</span>
                )}
              </div>
              Selecteer alles
            </button>
            {selected.size > 0 && (
              <span className="text-sm font-medium" style={{ color: 'var(--orange)' }}>
                {selected.size} geselecteerd
              </span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map(match => {
              const s = states[match.id]
              if (!s) return null
              const isLive = match.status === 'live'
              const isDone = match.status === 'finished'
              const isSelected = selected.has(match.id)

              return (
                <div key={match.id} className="relative">
                  {/* Selectie checkbox */}
                  {!isDone && (
                    <button
                      onClick={() => toggleSelect(match.id)}
                      className="absolute top-3 right-3 z-10 w-6 h-6 rounded border-2 flex items-center justify-center cursor-pointer transition-all"
                      style={{
                        borderColor: isSelected ? 'var(--orange)' : 'var(--border)',
                        backgroundColor: isSelected ? 'var(--orange)' : 'var(--bg-elevated)',
                      }}
                    >
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </button>
                  )}

                  <Card style={{ border: `1px solid ${isSelected ? 'var(--orange)' : isLive ? 'var(--green)' : 'var(--border)'}` }}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 pr-8">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {match.field ? match.field.name : `Wedstrijd #${match.match_number}`}
                        {match.round ? ` · Ronde ${match.round}` : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        {s.saved && <span className="text-xs" style={{ color: 'var(--green)' }}>✓ Opgeslagen</span>}
                        <Badge variant={isLive ? 'green' : isDone ? 'gray' : 'yellow'}>
                          {isLive ? '● LIVE' : isDone ? 'Gespeeld' : 'Gepland'}
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
                        <ScoreInput value={s.homeScore} onChange={v => updateState(match.id, { homeScore: v, saved: false })} />
                      </div>
                      <div className="text-xl font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>vs</div>
                      <div className="flex-1 min-w-0 flex flex-col items-end">
                        <div className="flex items-center gap-2 mb-3 justify-end">
                          <span className="font-semibold truncate text-sm">{match.away_team?.name ?? '—'}</span>
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
                        </div>
                        <ScoreInput value={s.awayScore} onChange={v => updateState(match.id, { awayScore: v, saved: false })} />
                      </div>
                    </div>

                    {s.error && (
                      <div className="mb-3 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: '#ef444422', color: 'var(--red)' }}>
                        {s.error}
                      </div>
                    )}

                    {/* Individuele knoppen */}
                    <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                      {!isDone && !isLive && (
                        <Button size="sm" variant="secondary" loading={s.saving} onClick={() => handleSave(match, 'live')} className="flex-1">
                          ▶ Start
                        </Button>
                      )}
                      {isLive && (
                        <Button size="sm" variant="secondary" loading={s.saving} onClick={() => handleScoreUpdate(match)} className="flex-1">
                          💾 Score opslaan
                        </Button>
                      )}
                      {!isDone && (
                        <Button size="sm" loading={s.saving} onClick={() => handleSave(match, 'finished')} className="flex-1">
                          ✓ Afsluiten
                        </Button>
                      )}
                      {isDone && (
                        <Button size="sm" variant="secondary" loading={s.saving} onClick={() => handleSave(match, 'finished')} className="flex-1">
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

      {/* Bulk actie balk — verschijnt als er wedstrijden geselecteerd zijn */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 px-4 py-4 flex flex-col gap-2"
          style={{ backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border)', boxShadow: '0 -4px 20px rgba(0,0,0,0.4)' }}
        >
          <div className="max-w-2xl mx-auto w-full">
            <p className="text-sm font-semibold mb-2 text-center" style={{ color: 'var(--text-secondary)' }}>
              {selected.size} wedstrijd{selected.size !== 1 ? 'en' : ''} geselecteerd
            </p>
            <div className="flex gap-3">
              {selectedScheduled > 0 && (
                <Button loading={bulkSaving} onClick={handleBulkStart} className="flex-1">
                  ▶ Start {selectedScheduled} wedstrijd{selectedScheduled !== 1 ? 'en' : ''}
                </Button>
              )}
              {selectedLive > 0 && (
                <Button loading={bulkSaving} onClick={handleBulkFinish} className="flex-1" variant="secondary">
                  ✓ Sluit {selectedLive} af
                </Button>
              )}
              <Button variant="ghost" onClick={() => setSelected(new Set())} className="px-4">
                Annuleer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
