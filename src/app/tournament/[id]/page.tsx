'use client'

import { useEffect, useState, use, useMemo } from 'react'
import Link from 'next/link'
import { supabase, Tournament, Match, Standing, Team } from '@/lib/supabase'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = (typeof window !== 'undefined') ? require('qrcode') : null
import { Navbar }         from '@/components/ui/Navbar'
import { Card }           from '@/components/ui/Card'
import { Badge }          from '@/components/ui/Badge'
import { StandingsTable } from '@/components/public/StandingsTable'
import { MatchCard }      from '@/components/public/MatchCard'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function sortStanding(a: Standing, b: Standing) {
  if (b.points !== a.points) return b.points - a.points
  const gdA = a.goals_for - a.goals_against, gdB = b.goals_for - b.goals_against
  if (gdB !== gdA) return gdB - gdA
  return b.goals_for - a.goals_for
}

function mWinner(m: Match): Team | undefined {
  if (m.home_score == null || m.away_score == null) return undefined
  return m.home_score >= m.away_score ? m.home_team : m.away_team
}
function mLoser(m: Match): Team | undefined {
  if (m.home_score == null || m.away_score == null) return undefined
  return m.home_score < m.away_score ? m.home_team : m.away_team
}

function SectionHeader({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="font-semibold text-sm" style={{ color }}>{label}</span>
    </div>
  )
}

const POOL_COLORS  = ['#FF6B00', '#3B82F6', '#22c55e', '#a855f7']
const POOL_LABELS  = ['A', 'B', 'C', 'D']
const PHASE_LABELS: Record<string, string> = {
  quarter_final: 'Kwartfinales', semi_final: 'Halve finales',
  third_place: 'Wedstrijd om 3e plaats', final: 'Finale',
}
const KO_PHASES = ['quarter_final', 'semi_final', 'third_place', 'final'] as const

type Tab = 'standings' | 'matches' | 'schedule'

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [standings,  setStandings]  = useState<Standing[]>([])
  const [matches,    setMatches]    = useState<Match[]>([])
  const [tab,        setTab]        = useState<Tab>('standings')
  const [loading,    setLoading]    = useState(true)
  const [userId,     setUserId]     = useState<string | null>(null)
  const [favorites,  setFavorites]  = useState<string[]>([])
  const [qrDataUrl,  setQrDataUrl]  = useState<string | null>(null)
  const [showQR,     setShowQR]     = useState(false)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) { setUserId(data.session.user.id) }
      else {
        const { data: a } = await supabase.auth.signInAnonymously()
        if (a.user) setUserId(a.user.id)
      }
    })
  }, [])

  // ── QR code genereren zodra pagina geladen is ─────────────────────────────
  useEffect(() => {
    if (!QRCode) return
    const url = window.location.href
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#111111', light: '#ffffff' } })
      .then((dataUrl: string) => setQrDataUrl(dataUrl))
      .catch(() => {/* QR generatie mislukt — stil negeren */})
  }, [])

  useEffect(() => {
    if (!userId) return
    supabase.from('user_favorites').select('team_id')
      .eq('user_id', userId).eq('tournament_id', id)
      .then(({ data }) => setFavorites(data?.map(f => f.team_id) ?? []))
  }, [userId, id])

  // ── Data loading + realtime ───────────────────────────────────────────────
  useEffect(() => {
    supabase.from('tournaments').select('*').eq('id', id).single()
      .then(({ data }) => setTournament(data))
    supabase.from('standings').select('*, team:teams(*)').eq('tournament_id', id)
      .then(({ data }) => setStandings(data ?? []))
    supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('tournament_id', id).order('match_number')
      .then(({ data }) => { setMatches(data ?? []); setLoading(false) })

    const reloadMatches = () =>
      supabase.from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
        .eq('tournament_id', id).order('match_number')
        .then(({ data }) => setMatches(data ?? []))

    const matchSub = supabase.channel(`tournament-${id}-matches`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `tournament_id=eq.${id}` }, reloadMatches)
      .subscribe()
    const standSub = supabase.channel(`tournament-${id}-standings`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'standings', filter: `tournament_id=eq.${id}` },
        () => supabase.from('standings').select('*, team:teams(*)').eq('tournament_id', id)
              .then(({ data }) => setStandings(data ?? [])))
      .subscribe()
    return () => { supabase.removeChannel(matchSub); supabase.removeChannel(standSub) }
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

  // ── Derived state ─────────────────────────────────────────────────────────
  const liveMatches      = matches.filter(m => m.status === 'live')
  const finishedMatches  = matches.filter(m => m.status === 'finished')
  const scheduledMatches = matches.filter(m => m.status === 'scheduled')
  const koMatches        = matches.filter(m => m.phase !== 'group')
  const koActive         = koMatches.some(m => m.status === 'live' || m.status === 'scheduled')
  const liveGroup        = liveMatches.filter(m => m.phase === 'group')

  const finalMatch      = koMatches.find(m => m.phase === 'final'       && m.status === 'finished')
  const thirdPlaceMatch = koMatches.find(m => m.phase === 'third_place' && m.status === 'finished')
  const tournamentComplete = !!finalMatch

  const winner   = finalMatch      ? mWinner(finalMatch)      : undefined
  const runnerUp = finalMatch      ? mLoser(finalMatch)       : undefined
  const third    = thirdPlaceMatch ? mWinner(thirdPlaceMatch) : undefined
  const fourth   = thirdPlaceMatch ? mLoser(thirdPlaceMatch)  : undefined

  const sfLosers = useMemo(() =>
    koMatches.filter(m => m.phase === 'semi_final' && m.status === 'finished')
      .map(m => mLoser(m)?.id).filter(Boolean) as string[]
  , [koMatches])

  const numPools = tournament?.num_pools ?? 1
  const poolLabel = (p: number) => tournament?.pool_names?.[p] ?? `Poule ${POOL_LABELS[p] ?? p + 1}`

  // Placement voor een team na afloop
  const getPlacement = (teamId: string) => {
    if (winner?.id    === teamId) return { emoji: '🥇', text: 'Kampioen!' }
    if (runnerUp?.id  === teamId) return { emoji: '🥈', text: '2e plaats' }
    if (third?.id     === teamId) return { emoji: '🥉', text: '3e plaats' }
    if (fourth?.id    === teamId) return { emoji: '4️⃣', text: '4e plaats' }
    if (sfLosers.includes(teamId) && !thirdPlaceMatch) return { emoji: '🥉', text: '3e / 4e plaats' }
    const s = standings.find(x => x.team_id === teamId)
    if (s) {
      const pool = standings.filter(x => x.pool === s.pool).sort(sortStanding)
      const pos  = pool.findIndex(x => x.team_id === teamId) + 1
      return { emoji: pos === 1 ? '🏅' : '⚽', text: `${pos}e in ${poolLabel((s.pool ?? 1) - 1)}` }
    }
    return null
  }

  // Beste favoriet voor de teamkaart (voorkeur: KO deelname)
  const favTeam = useMemo(() => {
    if (!favorites.length) return null
    const koFav = favorites.find(fav => koMatches.some(m => m.home_team_id === fav || m.away_team_id === fav))
    return koFav ?? favorites[0]
  }, [favorites, koMatches])

  const favStanding      = standings.find(s => s.team_id === favTeam)
  const favTeamObj       = favStanding?.team as Team | undefined
  const favPoolIdx       = favStanding ? (favStanding.pool ?? 1) - 1 : 0
  const favPoolStandings = favStanding
    ? standings.filter(s => s.pool === favStanding.pool).sort(sortStanding)
    : []

  const roundTimeMap = buildRoundTimeMap(matches, tournament)
  const matchMinutes = tournament?.match_duration_minutes ?? 10

  // ── Loading / not found ───────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar />
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
      </div>
    </div>
  )
  if (!tournament) return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p style={{ color: 'var(--text-secondary)' }}>Toernooi niet gevonden</p>
        <Link href="/" className="mt-4 inline-block" style={{ color: 'var(--orange)' }}>← Terug</Link>
      </div>
    </div>
  )

  const tabs: { key: Tab; label: string }[] = [
    { key: 'standings', label: 'Stand' },
    { key: 'matches',   label: `Uitslagen${finishedMatches.length > 0 ? ` (${finishedMatches.length})` : ''}` },
    { key: 'schedule',  label: `Schema${scheduledMatches.length > 0 ? ` (${scheduledMatches.length})` : ''}` },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-6">

        {/* ── QR Overlay ── */}
        {showQR && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowQR(false)}>
            <div className="w-full max-w-xs rounded-3xl p-6 flex flex-col items-center gap-4"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
              onClick={e => e.stopPropagation()}>
              {/* Logo in overlay */}
              {tournament.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tournament.logo_url} alt="Logo" className="h-12 w-auto object-contain" />
              )}
              <div>
                <p className="font-bold text-center text-base">{tournament.name}</p>
                <p className="text-xs text-center mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Scan deze QR-code om de live pagina te openen
                </p>
              </div>
              {qrDataUrl ? (
                <div className="rounded-2xl overflow-hidden p-2 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR code" width={280} height={280} />
                </div>
              ) : (
                <div className="w-[280px] h-[280px] rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: 'var(--bg-elevated)' }}>
                  <div className="w-8 h-8 rounded-full border-2 animate-spin"
                    style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
                </div>
              )}
              <button onClick={() => setShowQR(false)}
                className="w-full py-3 rounded-2xl font-bold text-sm cursor-pointer"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                Sluiten
              </button>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="mb-5">
          <Link href="/" className="text-sm mb-3 inline-block hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
            ← Alle toernooien
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* Club logo */}
              {tournament.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tournament.logo_url} alt="Logo" className="w-12 h-12 rounded-xl object-contain flex-shrink-0"
                  style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', padding: 4 }} />
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-bold leading-tight">{tournament.name}</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {tournament.num_teams} teams · {tournament.num_fields} veld{tournament.num_fields > 1 ? 'en' : ''} · {tournament.match_duration_minutes} min
                  {tournament.finals_type !== 'none' ? ' · met finales' : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <Badge variant={tournament.status === 'active' ? 'green' : tournament.status === 'finished' ? 'orange' : 'gray'}>
                {tournament.status === 'active' ? 'Live' : tournament.status === 'finished' ? 'Afgelopen' : 'Binnenkort'}
              </Badge>
              {/* QR deel-knop */}
              <button onClick={() => setShowQR(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/>
                  <rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/>
                </svg>
                Deel
              </button>
            </div>
          </div>
        </div>

        {/* ── 1. WINNAAR BANNER ─────────────────────────────────────────────── */}
        {tournamentComplete && winner && (
          <div className="mb-6 rounded-3xl overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${winner.color}22 0%, var(--bg-card) 55%)`, border: `2px solid ${winner.color}55` }}>

            {/* Kampioen */}
            <div className="px-5 pt-6 pb-3 text-center">
              <div className="text-5xl mb-2 select-none">🏆</div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: winner.color }}>Kampioen</p>
              <h2 className="text-3xl font-bold leading-tight" style={{ color: winner.color }}>{winner.name}</h2>
            </div>

            {/* Podium */}
            <div className="flex items-end justify-center gap-3 px-5 pb-5">
              {/* 2e */}
              {runnerUp && (
                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <span className="text-xl select-none">🥈</span>
                  <div className="w-full rounded-xl py-2 px-1 text-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <p className="text-xs font-bold truncate">{runnerUp.name}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>2e plaats</p>
                  </div>
                </div>
              )}
              {/* 1e */}
              <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <span className="text-2xl select-none">🥇</span>
                <div className="w-full rounded-xl py-3 px-1 text-center"
                  style={{ backgroundColor: `${winner.color}18`, border: `1.5px solid ${winner.color}55` }}>
                  <p className="text-sm font-bold truncate" style={{ color: winner.color }}>{winner.name}</p>
                  <p className="text-xs font-bold mt-0.5" style={{ color: winner.color }}>Winnaar! 🎉</p>
                </div>
              </div>
              {/* 3e */}
              {(third ?? sfLosers.length > 0) && (
                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  <span className="text-xl select-none">🥉</span>
                  <div className="w-full rounded-xl py-2 px-1 text-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                    <p className="text-xs font-bold truncate">{third?.name ?? '3e/4e'}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>3e plaats</p>
                  </div>
                </div>
              )}
            </div>

            {/* Gepersonaliseerde boodschap per favoriet */}
            {favorites.map(favId => {
              const placement = getPlacement(favId)
              const t = standings.find(s => s.team_id === favId)?.team as Team | undefined
              if (!placement || !t) return null
              return (
                <div key={favId} className="mx-4 mb-4 px-4 py-4 rounded-2xl text-center"
                  style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                  <div className="text-3xl mb-1 select-none">{placement.emoji}</div>
                  <p className="font-bold text-lg leading-tight">{t.name}</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--orange)' }}>{placement.text}</p>
                  <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Bedankt voor je aanwezigheid bij <strong>{tournament.name}</strong>!<br />
                    We hopen je volgend jaar weer te zien. 👋 Tot dan!
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 2. FINALES naar boven (als actief) ───────────────────────────── */}
        {koActive && !tournamentComplete && (
          <div className="mb-6 rounded-2xl overflow-hidden"
            style={{ border: '2px solid var(--orange)', backgroundColor: 'var(--bg-card)' }}>
            <div className="px-4 py-3 flex items-center gap-2"
              style={{ backgroundColor: '#FF6B0015', borderBottom: '1px solid #FF6B0030' }}>
              <span className="text-base select-none">🏆</span>
              <span className="font-bold text-sm" style={{ color: 'var(--orange)' }}>Finales</span>
              {koMatches.some(m => m.status === 'live') && (
                <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e50' }}>
                  ● Live
                </span>
              )}
            </div>
            <div className="px-4 py-3 flex flex-col gap-4">
              {KO_PHASES.map(phase => {
                const pm = koMatches.filter(m => m.phase === phase)
                if (!pm.length) return null
                return (
                  <div key={phase} className="flex flex-col gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--orange)' }}>
                      {PHASE_LABELS[phase]}
                    </p>
                    {pm.map(m => (
                      <MatchCard key={m.id} match={m} tournamentId={id}
                        expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 3. Live-banner groepsfase ─────────────────────────────────────── */}
        {liveGroup.length > 0 && !koActive && (
          <div className="mb-4 p-3 rounded-xl flex items-center gap-2"
            style={{ backgroundColor: '#22c55e18', border: '1px solid #22c55e60' }}>
            <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-sm font-semibold" style={{ color: '#22c55e' }}>
              {liveGroup.length} wedstrijd{liveGroup.length > 1 ? 'en' : ''} live
            </span>
          </div>
        )}

        {/* ── 4. FAVORIET TEAM CARD (groepsfase / niet afgelopen) ───────────── */}
        {favTeam && !tournamentComplete && favStanding && favTeamObj && (
          <div className="mb-5 rounded-2xl overflow-hidden"
            style={{ border: `1.5px solid ${POOL_COLORS[favPoolIdx] ?? 'var(--orange)'}50`, backgroundColor: 'var(--bg-card)' }}>
            {/* Header */}
            <div className="px-4 py-2.5 flex items-center gap-2"
              style={{ backgroundColor: `${POOL_COLORS[favPoolIdx] ?? 'var(--orange)'}12`, borderBottom: '1px solid var(--border)' }}>
              <span className="text-sm select-none">⭐</span>
              <span className="font-bold text-sm flex-1 truncate">{favTeamObj.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                style={{ backgroundColor: `${POOL_COLORS[favPoolIdx] ?? 'var(--orange)'}20`, color: POOL_COLORS[favPoolIdx] ?? 'var(--orange)' }}>
                {poolLabel(favPoolIdx)}
              </span>
            </div>
            {/* Pool-stand */}
            {favPoolStandings.map((s, rank) => {
              const t = s.team as Team | undefined
              const isMe = s.team_id === favTeam
              const col  = POOL_COLORS[favPoolIdx] ?? 'var(--orange)'
              return (
                <div key={s.team_id}
                  className="flex items-center gap-2 px-4 py-2"
                  style={{
                    borderTop: rank > 0 ? '1px solid var(--border)' : undefined,
                    backgroundColor: isMe ? `${col}10` : 'transparent',
                  }}>
                  <span className="text-xs w-5 text-center font-bold flex-shrink-0"
                    style={{ color: isMe ? col : 'var(--text-secondary)' }}>{rank + 1}</span>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: t?.color ?? '#888' }} />
                  <span className={`text-sm flex-1 truncate${isMe ? ' font-bold' : ''}`}
                    style={{ color: isMe ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {t?.name ?? '—'}
                  </span>
                  <div className="flex items-center gap-3 text-xs flex-shrink-0">
                    <span style={{ color: 'var(--text-secondary)' }}>{s.played}G</span>
                    <span className="font-bold" style={{ color: isMe ? col : 'var(--text-primary)' }}>{s.points}pt</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{s.goals_for}–{s.goals_against}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 5. TABS ───────────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ backgroundColor: 'var(--bg-card)' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-medium cursor-pointer transition-all"
              style={{
                backgroundColor: tab === t.key ? 'var(--orange)' : 'transparent',
                color: tab === t.key ? '#fff' : 'var(--text-secondary)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── STAND ─────────────────────────────────────────────────────────── */}
        {tab === 'standings' && (() => {
          if (numPools <= 1) return (
            <StandingsTable standings={standings} tournamentId={id}
              favoriteTeamIds={favorites} onToggleFavorite={toggleFavorite} />
          )
          return (
            <div className="flex flex-col gap-6">
              {Array.from({ length: numPools }, (_, p) => {
                const color = POOL_COLORS[p] ?? '#FF6B00'
                const ps = standings.filter(s => (s.pool ?? 1) === p + 1)
                return (
                  <div key={p}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl font-bold text-sm"
                      style={{ backgroundColor: `${color}20`, color }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      {poolLabel(p)}
                      <span className="font-normal text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>
                        {ps.length} teams
                      </span>
                    </div>
                    <StandingsTable standings={ps} tournamentId={id}
                      favoriteTeamIds={favorites} onToggleFavorite={toggleFavorite} />
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* ── UITSLAGEN ─────────────────────────────────────────────────────── */}
        {tab === 'matches' && (() => {
          const done  = finishedMatches
          const live  = liveMatches
          const doneGroup   = done.filter(m => m.phase === 'group')
          const doneKO      = done.filter(m => m.phase !== 'group')
          if (live.length === 0 && done.length === 0) return (
            <Card className="text-center py-8">
              <p style={{ color: 'var(--text-secondary)' }}>Nog geen gespeelde wedstrijden</p>
            </Card>
          )
          return (
            <div className="flex flex-col gap-5">
              {live.length > 0 && (
                <div className="flex flex-col gap-3">
                  <SectionHeader color="#22c55e" label="Live" />
                  {live.map(m => <MatchCard key={m.id} match={m} tournamentId={id}
                    expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                </div>
              )}
              {numPools > 1
                ? Array.from({ length: numPools }, (_, p) => {
                    const pm = doneGroup.filter(m => (m.home_team?.pool ?? 1) === p + 1)
                    if (!pm.length) return null
                    return (
                      <div key={p} className="flex flex-col gap-3">
                        <SectionHeader color={POOL_COLORS[p] ?? '#FF6B00'} label={poolLabel(p)} />
                        {pm.map(m => <MatchCard key={m.id} match={m} tournamentId={id}
                          expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                      </div>
                    )
                  })
                : doneGroup.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {doneGroup.map(m => <MatchCard key={m.id} match={m} tournamentId={id}
                        expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                    </div>
                  )}
              {KO_PHASES.map(phase => {
                const pm = doneKO.filter(m => m.phase === phase)
                if (!pm.length) return null
                return (
                  <div key={phase} className="flex flex-col gap-3">
                    <SectionHeader color="var(--orange)" label={`🏆 ${PHASE_LABELS[phase]}`} />
                    {pm.map(m => <MatchCard key={m.id} match={m} tournamentId={id}
                      expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* ── SCHEMA ────────────────────────────────────────────────────────── */}
        {tab === 'schedule' && (() => {
          const sg = scheduledMatches.filter(m => m.phase === 'group')
          const sk = scheduledMatches.filter(m => m.phase !== 'group')
          if (!scheduledMatches.length) return (
            <Card className="text-center py-8">
              <p style={{ color: 'var(--text-secondary)' }}>Geen geplande wedstrijden meer</p>
            </Card>
          )
          return (
            <div className="flex flex-col gap-5">
              {numPools > 1
                ? Array.from({ length: numPools }, (_, p) => {
                    const pm = sg.filter(m => (m.home_team?.pool ?? 1) === p + 1)
                    if (!pm.length) return null
                    return (
                      <div key={p} className="flex flex-col gap-3">
                        <SectionHeader color={POOL_COLORS[p] ?? '#FF6B00'} label={poolLabel(p)} />
                        {pm.map(m => <MatchCard key={m.id} match={m} tournamentId={id}
                          expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                      </div>
                    )
                  })
                : sg.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {sg.map(m => <MatchCard key={m.id} match={m} tournamentId={id}
                        expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                    </div>
                  )}
              {KO_PHASES.map(phase => {
                const pm = sk.filter(m => m.phase === phase)
                if (!pm.length) return null
                return (
                  <div key={phase} className="flex flex-col gap-3">
                    <SectionHeader color="var(--orange)" label={`🏆 ${PHASE_LABELS[phase]}`} />
                    {pm.map(m => <MatchCard key={m.id} match={m} tournamentId={id}
                      expectedTime={roundTimeMap[m.round]} matchMinutes={matchMinutes} />)}
                  </div>
                )
              })}
            </div>
          )
        })()}

        <p className="text-xs text-center mt-6" style={{ color: 'var(--text-secondary)' }}>
          ☆ Tik op een ster naast een team om het als favoriet te markeren
        </p>

      </main>
    </div>
  )
}
