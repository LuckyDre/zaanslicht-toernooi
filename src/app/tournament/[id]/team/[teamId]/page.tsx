'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase, Team, Match, Standing } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { MatchCard } from '@/components/public/MatchCard'

export default function TeamPage({ params }: { params: Promise<{ id: string; teamId: string }> }) {
  const { id, teamId } = use(params)
  const [team, setTeam] = useState<Team | null>(null)
  const [standing, setStanding] = useState<Standing | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        setUserId(data.session.user.id)
      } else {
        const { data: anonData } = await supabase.auth.signInAnonymously()
        if (anonData.user) setUserId(anonData.user.id)
      }
    })
  }, [])

  useEffect(() => {
    if (!userId) return
    supabase.from('user_favorites').select('id').eq('user_id', userId).eq('team_id', teamId).single()
      .then(({ data }) => setIsFavorite(!!data))
  }, [userId, teamId])

  useEffect(() => {
    supabase.from('teams').select('*').eq('id', teamId).single().then(({ data }) => setTeam(data))
    supabase.from('standings').select('*, team:teams(*)').eq('team_id', teamId).eq('tournament_id', id).single()
      .then(({ data }) => setStanding(data))
    supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('tournament_id', id)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order('match_number')
      .then(({ data }) => {
        setMatches(data ?? [])
        setLoading(false)
      })
  }, [id, teamId])

  const toggleFavorite = async () => {
    if (!userId) return
    if (isFavorite) {
      await supabase.from('user_favorites').delete().eq('user_id', userId).eq('team_id', teamId)
      setIsFavorite(false)
    } else {
      await supabase.from('user_favorites').insert({ user_id: userId, team_id: teamId, tournament_id: id })
      setIsFavorite(true)
    }
  }

  const finishedMatches = matches.filter(m => m.status === 'finished')
  const upcomingMatches = matches.filter(m => m.status !== 'finished')

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

  const gd = standing ? standing.goals_for - standing.goals_against : 0

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link href={`/tournament/${id}`} className="text-sm mb-4 inline-block hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          ← Terug naar toernooi
        </Link>

        {/* Team header */}
        <Card className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: team?.color || 'var(--orange)' }}
              >
                {team?.name?.charAt(0) ?? '?'}
              </div>
              <div>
                <h1 className="text-xl font-bold">{team?.name ?? '—'}</h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {matches.length} wedstrijd{matches.length !== 1 ? 'en' : ''}
                </p>
              </div>
            </div>
            <button
              onClick={toggleFavorite}
              className="text-3xl cursor-pointer hover:scale-110 transition-transform"
              style={{ color: isFavorite ? 'var(--orange)' : 'var(--text-secondary)' }}
              title={isFavorite ? 'Verwijder favoriet' : 'Voeg toe als favoriet'}
            >
              {isFavorite ? '★' : '☆'}
            </button>
          </div>
        </Card>

        {/* Stats */}
        {standing && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Punten', value: standing.points, color: 'var(--orange)' },
              { label: 'Gewonnen', value: standing.won, color: 'var(--green)' },
              { label: 'Gelijk', value: standing.drawn, color: 'var(--text-secondary)' },
              { label: 'Verloren', value: standing.lost, color: 'var(--red)' },
            ].map(s => (
              <Card key={s.label} className="text-center">
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
              </Card>
            ))}
          </div>
        )}

        {standing && (
          <Card className="mb-6">
            <div className="flex justify-around text-center">
              <div>
                <div className="text-lg font-bold">{standing.goals_for}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Goals voor</div>
              </div>
              <div>
                <div className="text-lg font-bold">{standing.goals_against}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Goals tegen</div>
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: gd > 0 ? 'var(--green)' : gd < 0 ? 'var(--red)' : 'inherit' }}>
                  {gd > 0 ? '+' : ''}{gd}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Doelsaldo</div>
              </div>
              <div>
                <div className="text-lg font-bold">{standing.played}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Gespeeld</div>
              </div>
            </div>
          </Card>
        )}

        {/* Upcoming */}
        {upcomingMatches.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>AANKOMENDE WEDSTRIJDEN</h2>
            <div className="flex flex-col gap-3">
              {upcomingMatches.map(m => <MatchCard key={m.id} match={m} tournamentId={id} />)}
            </div>
          </div>
        )}

        {/* Results */}
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>UITSLAGEN</h2>
          <div className="flex flex-col gap-3">
            {finishedMatches.map(m => <MatchCard key={m.id} match={m} tournamentId={id} />)}
            {finishedMatches.length === 0 && (
              <Card className="text-center py-6">
                <p style={{ color: 'var(--text-secondary)' }}>Nog geen gespeelde wedstrijden</p>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
