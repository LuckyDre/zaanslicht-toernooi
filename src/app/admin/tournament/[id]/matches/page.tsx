'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, Match, Tournament } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

function ScoreInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-10 h-10 rounded-lg text-xl font-bold cursor-pointer transition-colors flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-base)' }}
      >
        −
      </button>
      <span className="text-2xl font-bold font-mono w-8 text-center">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className="w-10 h-10 rounded-lg text-xl font-bold cursor-pointer transition-colors flex items-center justify-center"
        style={{ backgroundColor: 'var(--orange)', color: '#fff' }}
      >
        +
      </button>
    </div>
  )
}

type MatchState = {
  homeScore: number
  awayScore: number
  saving: boolean
}

export default function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [states, setStates] = useState<Record<string, MatchState>>({})
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | 'scheduled' | 'live' | 'finished'>('all')

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
      .eq('tournament_id', id)
      .order('round').order('match_number')
      .then(({ data }) => {
        const list = data ?? []
        setMatches(list)
        const init: Record<string, MatchState> = {}
        list.forEach(m => {
          init[m.id] = {
            homeScore: m.home_score ?? 0,
            awayScore: m.away_score ?? 0,
            saving: false,
          }
        })
        setStates(init)
        setLoading(false)
      })
  }, [id])

  const updateState = (matchId: string, patch: Partial<MatchState>) => {
    setStates(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...patch } }))
  }

  const handleSave = async (match: Match, status: 'live' | 'finished') => {
    const s = states[match.id]
    if (!s) return
    updateState(match.id, { saving: true })

    const { error } = await supabase.from('matches').update({
      home_score: s.homeScore,
      away_score: s.awayScore,
      status,
      started_at: status === 'live' && !match.started_at ? new Date().toISOString() : match.started_at,
      finished_at: status === 'finished' ? new Date().toISOString() : null,
    }).eq('id', match.id)

    if (!error) {
      setMatches(prev => prev.map(m => m.id === match.id
        ? { ...m, home_score: s.homeScore, away_score: s.awayScore, status }
        : m
      ))
    }
    updateState(match.id, { saving: false })
  }

  const filtered = matches.filter(m => activeFilter === 'all' || m.status === activeFilter)
  const liveCount = matches.filter(m => m.status === 'live').length
  const scheduledCount = matches.filter(m => m.status === 'scheduled').length
  const finishedCount = matches.filter(m => m.status === 'finished').length

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
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
        <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ backgroundColor: 'var(--bg-card)' }}>
          {[
            { key: 'all', label: `Alle (${matches.length})` },
            { key: 'live', label: `Live (${liveCount})` },
            { key: 'scheduled', label: `Gepland (${scheduledCount})` },
            { key: 'finished', label: `Klaar (${finishedCount})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key as typeof activeFilter)}
              className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium cursor-pointer transition-all"
              style={{
                backgroundColor: activeFilter === f.key ? 'var(--orange)' : 'transparent',
                color: activeFilter === f.key ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

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

              return (
                <Card key={match.id} style={{ border: `1px solid ${isLive ? 'var(--green)' : 'var(--border)'}` }}>
                  {/* Match header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {match.field ? match.field.name : `Wedstrijd #${match.match_number}`}
                      {match.round ? ` · Ronde ${match.round}` : ''}
                    </span>
                    <Badge variant={isLive ? 'green' : isDone ? 'gray' : 'yellow'}>
                      {isLive ? '● LIVE' : isDone ? 'Gespeeld' : 'Gepland'}
                    </Badge>
                  </div>

                  {/* Teams + Score inputs */}
                  <div className="flex items-center gap-3">
                    {/* Home team */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }}
                        />
                        <span className="font-semibold truncate text-sm">{match.home_team?.name ?? '—'}</span>
                      </div>
                      <ScoreInput
                        value={s.homeScore}
                        onChange={v => updateState(match.id, { homeScore: v })}
                      />
                    </div>

                    <div className="text-xl font-bold" style={{ color: 'var(--text-secondary)' }}>vs</div>

                    {/* Away team */}
                    <div className="flex-1 min-w-0 flex flex-col items-end">
                      <div className="flex items-center gap-2 mb-2 justify-end">
                        <span className="font-semibold truncate text-sm">{match.away_team?.name ?? '—'}</span>
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: match.away_team?.color || '#888' }}
                        />
                      </div>
                      <ScoreInput
                        value={s.awayScore}
                        onChange={v => updateState(match.id, { awayScore: v })}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  {!isDone && (
                    <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                      {!isLive && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={s.saving}
                          onClick={() => handleSave(match, 'live')}
                          className="flex-1"
                        >
                          ▶ Start
                        </Button>
                      )}
                      <Button
                        size="sm"
                        loading={s.saving}
                        onClick={() => handleSave(match, 'finished')}
                        className="flex-1"
                      >
                        ✓ Opslaan & Afsluiten
                      </Button>
                    </div>
                  )}

                  {isDone && (
                    <div className="flex gap-2 mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={s.saving}
                        onClick={() => handleSave(match, 'finished')}
                        className="flex-1"
                      >
                        Score aanpassen
                      </Button>
                    </div>
                  )}
                </Card>
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
    </div>
  )
}
