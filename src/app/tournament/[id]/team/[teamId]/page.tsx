'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase, Team, Match, Standing, Tournament } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { MatchCard } from '@/components/public/MatchCard'

/** Bereken verwachte starttijd per ronde */
function buildRoundTimeMap(
  matches: Match[],
  tournament: Tournament | null,
): Record<number, string> {
  if (!tournament?.starts_at) return {}
  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b)
  const perRound = (tournament.match_duration_minutes + (tournament.break_minutes ?? 10)) * 60_000
  const map: Record<number, string> = {}
  rounds.forEach((rn, idx) => {
    map[rn] = new Date(new Date(tournament.starts_at!).getTime() + idx * perRound)
      .toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  })
  return map
}

const PHASE_LABELS: Record<string, string> = {
  group: 'Groepsfase',
  semi_final: 'Halve finale',
  third_place: 'Om 3e plaats',
  final: 'Finale',
  quarter_final: 'Kwartfinale',
}

export default function TeamPage({ params }: { params: Promise<{ id: string; teamId: string }> }) {
  const { id, teamId } = use(params)
  const [team, setTeam]           = useState<Team | null>(null)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [standing, setStanding]   = useState<Standing | null>(null)
  const [matches, setMatches]     = useState<Match[]>([])
  const [loading, setLoading]     = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [userId, setUserId]       = useState<string | null>(null)

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
    supabase.from('tournaments').select('*').eq('id', id).single()
      .then(({ data }) => setTournament(data))

    supabase.from('teams').select('*').eq('id', teamId).single()
      .then(({ data }) => setTeam(data))

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

    // Real-time: update match scores/status live
    const sub = supabase
      .channel(`team-${teamId}-matches`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` },
        () => {
          supabase.from('matches')
            .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
            .eq('tournament_id', id)
            .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
            .order('match_number')
            .then(({ data }) => { if (data) setMatches(data) })
        }
      ).subscribe()

    return () => { supabase.removeChannel(sub) }
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

  // Compute round time map from ALL tournament matches — load all matches for time calculation
  // (we only have this team's matches; use them to approximate rounds)
  const roundTimeMap = buildRoundTimeMap(matches, tournament)
  const matchMinutes = tournament?.match_duration_minutes ?? 25

  const liveMatches     = matches.filter(m => m.status === 'live')
  const upcomingMatches = matches.filter(m => m.status === 'scheduled')
  const finishedMatches = matches.filter(m => m.status === 'finished')

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
        <Link href={`/tournament/${id}`} className="text-sm mb-4 inline-block hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}>
          ← Terug naar toernooi
        </Link>

        {/* Team header */}
        <Card className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: team?.color || 'var(--orange)' }}>
                {team?.name?.charAt(0) ?? '?'}
              </div>
              <div>
                <h1 className="text-xl font-bold">{team?.name ?? '—'}</h1>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {matches.length} wedstrijd{matches.length !== 1 ? 'en' : ''}
                  {tournament?.starts_at ? ` · start ${new Date(tournament.starts_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </p>
              </div>
            </div>
            <button
              onClick={toggleFavorite}
              className="text-3xl cursor-pointer hover:scale-110 transition-transform"
              style={{ color: isFavorite ? 'var(--orange)' : 'var(--text-secondary)' }}
              title={isFavorite ? 'Verwijder favoriet' : 'Voeg toe als favoriet'}>
              {isFavorite ? '★' : '☆'}
            </button>
          </div>
        </Card>

        {/* Live banner */}
        {liveMatches.length > 0 && (
          <div className="mb-5 p-3 rounded-xl flex items-center gap-2"
            style={{ backgroundColor: '#22c55e22', border: '1px solid var(--green)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--green)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--green)' }}>Nu aan het spelen!</span>
          </div>
        )}

        {/* ── Wedstrijdrooster ── */}
        {(upcomingMatches.length > 0 || liveMatches.length > 0) && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3"
              style={{ color: 'var(--text-secondary)' }}>
              📋 Wedstrijdrooster
            </h2>
            <div className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
              {[...liveMatches, ...upcomingMatches].map((m, idx) => {
                const isLive = m.status === 'live'
                const opponent = m.home_team_id === teamId ? m.away_team : m.home_team
                const isHome   = m.home_team_id === teamId
                const time     = roundTimeMap[m.round] ?? null
                const phase    = PHASE_LABELS[m.phase] ?? ''
                return (
                  <div key={m.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      borderTop: idx > 0 ? '1px solid var(--border)' : undefined,
                      backgroundColor: isLive ? '#22c55e0a' : 'transparent',
                    }}>
                    {/* Tijd */}
                    <div className="flex-shrink-0 w-12 text-center">
                      {isLive ? (
                        <span className="text-xs font-bold animate-pulse" style={{ color: 'var(--green)' }}>LIVE</span>
                      ) : time ? (
                        <span className="text-sm font-bold tabular-nums">{time}</span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>—:——</span>
                      )}
                    </div>

                    {/* Veld */}
                    <div className="flex-shrink-0 w-16">
                      {m.field ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                          {m.field.name}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>—</span>
                      )}
                    </div>

                    {/* Tegenstander */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {isHome ? 'vs' : 'bij'}
                      </span>
                      {opponent && (
                        <>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: opponent.color || '#888' }} />
                          <span className="font-semibold text-sm truncate">{opponent.name}</span>
                        </>
                      )}
                    </div>

                    {/* Fase-label (finale etc.) */}
                    {m.phase !== 'group' && (
                      <span className="text-xs font-bold flex-shrink-0 px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>
                        🏆 {phase}
                      </span>
                    )}

                    {/* Score bij live */}
                    {isLive && (
                      <span className="font-bold font-mono text-sm flex-shrink-0"
                        style={{ color: 'var(--green)' }}>
                        {m.home_score ?? 0}–{m.away_score ?? 0}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        {standing && (
          <>
            <div className="grid grid-cols-4 gap-3 mb-3">
              {[
                { label: 'Punten',   value: standing.points,  color: 'var(--orange)' },
                { label: 'Gewonnen', value: standing.won,     color: 'var(--green)' },
                { label: 'Gelijk',   value: standing.drawn,   color: 'var(--text-secondary)' },
                { label: 'Verloren', value: standing.lost,    color: 'var(--red)' },
              ].map(s => (
                <Card key={s.label} className="text-center">
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.label}</div>
                </Card>
              ))}
            </div>
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
                  <div className="text-lg font-bold"
                    style={{ color: gd > 0 ? 'var(--green)' : gd < 0 ? 'var(--red)' : 'inherit' }}>
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
          </>
        )}

        {/* Live match cards */}
        {liveMatches.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3"
              style={{ color: 'var(--green)' }}>● LIVE</h2>
            <div className="flex flex-col gap-3">
              {liveMatches.map(m => (
                <MatchCard key={m.id} match={m} tournamentId={id}
                  expectedTime={roundTimeMap[m.round]}
                  matchMinutes={matchMinutes} />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming match cards */}
        {upcomingMatches.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3"
              style={{ color: 'var(--text-secondary)' }}>AANKOMEND</h2>
            <div className="flex flex-col gap-3">
              {upcomingMatches.map(m => (
                <MatchCard key={m.id} match={m} tournamentId={id}
                  expectedTime={roundTimeMap[m.round]}
                  matchMinutes={matchMinutes} />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-secondary)' }}>UITSLAGEN</h2>
          <div className="flex flex-col gap-3">
            {finishedMatches.map(m => (
              <MatchCard key={m.id} match={m} tournamentId={id}
                expectedTime={roundTimeMap[m.round]}
                matchMinutes={matchMinutes} />
            ))}
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
