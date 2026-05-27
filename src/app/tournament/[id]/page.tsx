'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase, Tournament, Match, Standing } from '@/lib/supabase'

/** Bereken verwachte starttijd per ronde-nummer */
function buildRoundTimeMap(matches: Match[], tournament: Tournament | null): Record<number, string> {
  if (!tournament?.starts_at) return {}
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b)
  const perRound = (tournament.match_duration_minutes + (tournament.break_minutes ?? 25)) * 60_000
  const map: Record<number, string> = {}
  rounds.forEach((rn, idx) => {
    map[rn] = new Date(new Date(tournament.starts_at!).getTime() + idx * perRound)
      .toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  })
  return map
}
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { StandingsTable } from '@/components/public/StandingsTable'
import { MatchCard } from '@/components/public/MatchCard'

type Tab = 'standings' | 'matches' | 'schedule'

export default function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [standings, setStandings] = useState<Standing[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [tab, setTab] = useState<Tab>('standings')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<string[]>([])

  // Load user session (anonymous auth for favorites)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        setUserId(data.session.user.id)
      } else {
        // Sign in anonymously so favorites can be stored
        const { data: anonData } = await supabase.auth.signInAnonymously()
        if (anonData.user) setUserId(anonData.user.id)
      }
    })
  }, [])

  useEffect(() => {
    if (!userId) return
    supabase
      .from('user_favorites')
      .select('team_id')
      .eq('user_id', userId)
      .eq('tournament_id', id)
      .then(({ data }) => setFavorites(data?.map(f => f.team_id) ?? []))
  }, [userId, id])

  useEffect(() => {
    // Load tournament
    supabase.from('tournaments').select('*').eq('id', id).single()
      .then(({ data }) => setTournament(data))

    // Load standings with team info
    supabase.from('standings').select('*, team:teams(*)').eq('tournament_id', id)
      .then(({ data }) => setStandings(data ?? []))

    // Load matches with team and field info
    supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('tournament_id', id)
      .order('match_number')
      .then(({ data }) => {
        setMatches(data ?? [])
        setLoading(false)
      })

    // Real-time subscription for matches
    const matchSub = supabase
      .channel(`tournament-${id}-matches`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` },
        () => {
          supabase.from('matches')
            .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
            .eq('tournament_id', id).order('match_number')
            .then(({ data }) => setMatches(data ?? []))
        }
      ).subscribe()

    // Real-time subscription for standings
    const standSub = supabase
      .channel(`tournament-${id}-standings`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standings', filter: `tournament_id=eq.${id}` },
        () => {
          supabase.from('standings').select('*, team:teams(*)').eq('tournament_id', id)
            .then(({ data }) => setStandings(data ?? []))
        }
      ).subscribe()

    return () => {
      supabase.removeChannel(matchSub)
      supabase.removeChannel(standSub)
    }
  }, [id])

  const toggleFavorite = async (teamId: string) => {
    if (!userId) return
    if (favorites.includes(teamId)) {
      await supabase.from('user_favorites').delete().eq('user_id', userId).eq('team_id', teamId)
      setFavorites(prev => prev.filter(f => f !== teamId))
    } else {
      await supabase.from('user_favorites').insert({ user_id: userId, team_id: teamId, tournament_id: id })
      setFavorites(prev => [...prev, teamId])
    }
  }

  const liveMatches      = matches.filter(m => m.status === 'live')
  const finishedMatches  = matches.filter(m => m.status === 'finished')
  const scheduledMatches = matches.filter(m => m.status === 'scheduled')
  const roundTimeMap     = buildRoundTimeMap(matches, tournament)
  const matchMinutes     = tournament?.match_duration_minutes ?? 10

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Navbar />
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  if (!tournament) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p style={{ color: 'var(--text-secondary)' }}>Toernooi niet gevonden</p>
          <Link href="/" className="mt-4 inline-block" style={{ color: 'var(--orange)' }}>← Terug</Link>
        </div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'standings', label: 'Stand' },
    { key: 'matches', label: `Uitslagen${finishedMatches.length > 0 ? ` (${finishedMatches.length})` : ''}` },
    { key: 'schedule', label: `Schema${scheduledMatches.length > 0 ? ` (${scheduledMatches.length})` : ''}` },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link href="/" className="text-sm mb-3 inline-block hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
            ← Alle toernooien
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{tournament.name}</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {tournament.num_teams} teams · {tournament.num_fields} veld{tournament.num_fields > 1 ? 'en' : ''} · {tournament.match_duration_minutes} min
                {tournament.num_halves === 2 ? ' per helft' : ''}
                {tournament.finals_type !== 'none' ? ` · Finale systeem` : ''}
              </p>
            </div>
            <Badge variant={tournament.status === 'active' ? 'green' : tournament.status === 'finished' ? 'orange' : 'gray'}>
              {tournament.status === 'active' ? 'Live' : tournament.status === 'finished' ? 'Afgelopen' : 'Binnenkort'}
            </Badge>
          </div>
        </div>

        {/* Live matches banner */}
        {liveMatches.length > 0 && (
          <div className="mb-4 p-3 rounded-xl flex items-center gap-2" style={{ backgroundColor: '#22c55e22', border: '1px solid var(--green)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--green)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--green)' }}>
              {liveMatches.length} wedstrijd{liveMatches.length > 1 ? 'en' : ''} live
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ backgroundColor: 'var(--bg-card)' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium cursor-pointer transition-all"
              style={{
                backgroundColor: tab === t.key ? 'var(--orange)' : 'transparent',
                color: tab === t.key ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'standings' && (() => {
          const numPools = tournament.num_pools ?? 1
          if (numPools <= 1) {
            return (
              <StandingsTable
                standings={standings}
                tournamentId={id}
                favoriteTeamIds={favorites}
                onToggleFavorite={toggleFavorite}
              />
            )
          }
          const POOL_COLORS = ['#FF6B00', '#3B82F6', '#22c55e', '#a855f7']
          const POOL_LABELS_FB = ['A', 'B', 'C', 'D']
          return (
            <div className="flex flex-col gap-6">
              {Array.from({ length: numPools }, (_, p) => {
                const color = POOL_COLORS[p] ?? '#FF6B00'
                const label = tournament.pool_names?.[p] ?? `Poule ${POOL_LABELS_FB[p] ?? p + 1}`
                const poolStandings = standings.filter(s => (s.pool ?? 1) === p + 1)
                return (
                  <div key={p}>
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-t-xl font-bold text-sm"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      {label}
                      <span className="font-normal text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>
                        {poolStandings.length} teams
                      </span>
                    </div>
                    <StandingsTable
                      standings={poolStandings}
                      tournamentId={id}
                      favoriteTeamIds={favorites}
                      onToggleFavorite={toggleFavorite}
                    />
                  </div>
                )
              })}
            </div>
          )
        })()}

        {(tab === 'matches' || tab === 'schedule') && (() => {
          const pool_colors = ['#FF6B00', '#3B82F6', '#22c55e', '#a855f7']
          const pool_labels_fb = ['A', 'B', 'C', 'D']
          const numPools = tournament.num_pools ?? 1
          const poolLabel = (p: number) =>
            tournament.pool_names?.[p] ?? `Poule ${pool_labels_fb[p] ?? p + 1}`

          const PHASE_LABELS: Record<string, string> = {
            quarter_final: 'Kwartfinales',
            semi_final: 'Halve finales',
            third_place: 'Wedstrijd om 3e plaats',
            final: 'Finale',
          }
          const KNOCKOUT_PHASES = ['quarter_final', 'semi_final', 'third_place', 'final'] as const

          function SectionHeader({ color, label }: { color: string; label: string }) {
            return (
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="font-semibold text-sm" style={{ color }}>{label}</span>
              </div>
            )
          }

          if (tab === 'matches') {
            const live = liveMatches
            const done = finishedMatches
            const doneGroup = done.filter(m => m.phase === 'group')
            const doneKnockout = done.filter(m => m.phase !== 'group')

            if (live.length === 0 && done.length === 0) {
              return (
                <Card className="text-center py-8">
                  <p style={{ color: 'var(--text-secondary)' }}>Nog geen gespeelde wedstrijden</p>
                </Card>
              )
            }
            return (
              <div className="flex flex-col gap-5">
                {live.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <SectionHeader color="var(--green)" label="Live" />
                    {live.map(m => <MatchCard key={m.id} match={m} tournamentId={id} expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                  </div>
                )}
                {numPools > 1
                  ? Array.from({ length: numPools }, (_, p) => {
                      const pm = doneGroup.filter(m => (m.home_team?.pool ?? 1) === p + 1)
                      if (pm.length === 0) return null
                      return (
                        <div key={p} className="flex flex-col gap-3">
                          <SectionHeader color={pool_colors[p] ?? '#FF6B00'} label={poolLabel(p)} />
                          {pm.map(m => <MatchCard key={m.id} match={m} tournamentId={id} expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                        </div>
                      )
                    })
                  : doneGroup.length > 0 && (
                      <div className="flex flex-col gap-3">
                        {doneGroup.map(m => <MatchCard key={m.id} match={m} tournamentId={id} expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                      </div>
                    )}
                {KNOCKOUT_PHASES.map(phase => {
                  const pm = doneKnockout.filter(m => m.phase === phase)
                  if (pm.length === 0) return null
                  return (
                    <div key={phase} className="flex flex-col gap-3">
                      <SectionHeader color="var(--orange)" label={`🏆 ${PHASE_LABELS[phase]}`} />
                      {pm.map(m => <MatchCard key={m.id} match={m} tournamentId={id} expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                    </div>
                  )
                })}
              </div>
            )
          }

          // schedule tab
          const schedGroup = scheduledMatches.filter(m => m.phase === 'group')
          const schedKnockout = scheduledMatches.filter(m => m.phase !== 'group')

          if (scheduledMatches.length === 0) {
            return (
              <Card className="text-center py-8">
                <p style={{ color: 'var(--text-secondary)' }}>Geen geplande wedstrijden meer</p>
              </Card>
            )
          }
          return (
            <div className="flex flex-col gap-5">
              {numPools > 1
                ? Array.from({ length: numPools }, (_, p) => {
                    const pm = schedGroup.filter(m => (m.home_team?.pool ?? 1) === p + 1)
                    if (pm.length === 0) return null
                    return (
                      <div key={p} className="flex flex-col gap-3">
                        <SectionHeader color={pool_colors[p] ?? '#FF6B00'} label={poolLabel(p)} />
                        {pm.map(m => <MatchCard key={m.id} match={m} tournamentId={id} expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                      </div>
                    )
                  })
                : schedGroup.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {schedGroup.map(m => <MatchCard key={m.id} match={m} tournamentId={id} expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                    </div>
                  )}
              {KNOCKOUT_PHASES.map(phase => {
                const pm = schedKnockout.filter(m => m.phase === phase)
                if (pm.length === 0) return null
                return (
                  <div key={phase} className="flex flex-col gap-3">
                    <SectionHeader color="var(--orange)" label={`🏆 ${PHASE_LABELS[phase]}`} />
                    {pm.map(m => <MatchCard key={m.id} match={m} tournamentId={id} expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Favorites hint */}
        <p className="text-xs text-center mt-6" style={{ color: 'var(--text-secondary)' }}>
          ☆ Tik op een ster naast een team om het als favoriet te markeren
        </p>
      </main>
    </div>
  )
}
