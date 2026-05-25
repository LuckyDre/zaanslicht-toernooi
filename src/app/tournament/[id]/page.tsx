'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase, Tournament, Match, Standing } from '@/lib/supabase'
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

  const liveMatches = matches.filter(m => m.status === 'live')
  const finishedMatches = matches.filter(m => m.status === 'finished')
  const scheduledMatches = matches.filter(m => m.status === 'scheduled')

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
        {tab === 'standings' && (
          <StandingsTable
            standings={standings}
            tournamentId={id}
            favoriteTeamIds={favorites}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {tab === 'matches' && (
          <div className="flex flex-col gap-3">
            {liveMatches.map(m => <MatchCard key={m.id} match={m} tournamentId={id} />)}
            {finishedMatches.map(m => <MatchCard key={m.id} match={m} tournamentId={id} />)}
            {finishedMatches.length === 0 && liveMatches.length === 0 && (
              <Card className="text-center py-8">
                <p style={{ color: 'var(--text-secondary)' }}>Nog geen gespeelde wedstrijden</p>
              </Card>
            )}
          </div>
        )}

        {tab === 'schedule' && (
          <div className="flex flex-col gap-3">
            {scheduledMatches.map(m => <MatchCard key={m.id} match={m} tournamentId={id} />)}
            {scheduledMatches.length === 0 && (
              <Card className="text-center py-8">
                <p style={{ color: 'var(--text-secondary)' }}>Geen geplande wedstrijden meer</p>
              </Card>
            )}
          </div>
        )}

        {/* Favorites hint */}
        <p className="text-xs text-center mt-6" style={{ color: 'var(--text-secondary)' }}>
          ☆ Tik op een ster naast een team om het als favoriet te markeren
        </p>
      </main>
    </div>
  )
}
