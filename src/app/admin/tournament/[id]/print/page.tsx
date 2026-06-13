'use client'

import { useEffect, useState, use } from 'react'
import { supabase, Match, Tournament, Standing, Field } from '@/lib/supabase'

const KO_LABEL: Record<string, string> = {
  quarter_final: 'Kwartfinales',
  semi_final:    'Halve finales',
  final:         'Finale',
  third_place:   'Wedstrijd om 3e pl.',
}

const STATUS_NL: Record<string, string> = {
  scheduled: 'Gepland',
  live:      'Live',
  finished:  'Gespeeld',
  cancelled: 'Geannuleerd',
}

function getRoundTime(tournament: Tournament, groupIdx: number): string {
  if (!tournament.starts_at) return ''
  const per = (tournament.match_duration_minutes + (tournament.break_minutes ?? 25)) * 60_000
  return new Date(new Date(tournament.starts_at).getTime() + groupIdx * per)
    .toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function sortStanding(a: Standing, b: Standing) {
  if (b.points !== a.points) return b.points - a.points
  const sdA = a.goals_for - a.goals_against
  const sdB = b.goals_for - b.goals_against
  if (sdB !== sdA) return sdB - sdA
  return b.goals_for - a.goals_for
}

export default function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matches, setMatches]       = useState<Match[]>([])
  const [standings, setStandings]   = useState<Standing[]>([])
  const [fields, setFields]         = useState<Field[]>([])
  const [mode, setMode]             = useState<'blank' | 'filled'>('blank')
  const [ready, setReady]           = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('mode')
    if (m === 'filled') setMode('filled')

    Promise.all([
      supabase.from('tournaments').select('*').eq('id', id).single(),
      supabase.from('matches')
        .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
        .eq('tournament_id', id).order('round').order('match_number'),
      supabase.from('standings').select('*, team:teams(*)').eq('tournament_id', id),
      supabase.from('fields').select('*').eq('tournament_id', id).order('display_order'),
    ]).then(([t, m, s, f]) => {
      setTournament(t.data)
      setMatches(m.data ?? [])
      setStandings(s.data ?? [])
      setFields(f.data ?? [])
      setReady(true)
    })
  }, [id])

  // Automatisch printdialoog openen zodra data geladen is
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [ready])

  if (!ready || !tournament) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial, sans-serif' }}>
        <p style={{ color: '#666' }}>Schema laden…</p>
      </div>
    )
  }

  // Bouw rondes op
  const roundMap: Record<number, Match[]> = {}
  matches.forEach(m => {
    const r = m.round ?? 0
    if (!roundMap[r]) roundMap[r] = []
    roundMap[r].push(m)
  })
  const sortedRounds = Object.keys(roundMap).map(Number).sort((a, b) => a - b)

  let groupRoundIdx = 0
  const numPools  = tournament.num_pools ?? 1
  const poolNames = tournament.pool_names ?? []

  return (
    <>
      {/* Print-knop (verborgen bij printen) */}
      <div className="no-print" style={{
        position: 'fixed', top: 12, right: 16, display: 'flex', gap: 8, zIndex: 99,
        fontFamily: 'Arial, sans-serif',
      }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            backgroundColor: '#FF6B00', color: '#fff', fontWeight: 'bold',
            cursor: 'pointer', fontSize: 14,
          }}>
          🖨 Printen
        </button>
        <button
          onClick={() => window.close()}
          style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #ddd',
            backgroundColor: '#fff', color: '#333', cursor: 'pointer', fontSize: 14,
          }}>
          ✕ Sluiten
        </button>
      </div>

      <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a1a1a', backgroundColor: '#fff', padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>

        {/* ── Paginakop ────────────────────────────────────────────────────── */}
        <div style={{ borderBottom: '3px solid #FF6B00', paddingBottom: 10, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Zaans Licht Toernooi</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 'bold', color: '#1a1a1a' }}>{tournament.name}</h1>
            <div style={{ fontSize: 11, color: '#555', marginTop: 3 }}>
              {tournament.starts_at
                ? new Date(tournament.starts_at).toLocaleString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Geen starttijd ingesteld'}
              {' · '}
              {tournament.num_teams} teams · {tournament.num_fields} veld{tournament.num_fields > 1 ? 'en' : ''}
              {' · '}
              {tournament.match_duration_minutes} min. per wedstrijd
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#888' }}>
            <div style={{ fontWeight: 'bold', color: '#FF6B00', fontSize: 13 }}>
              {mode === 'blank' ? '📋 Leeg schema' : '📋 Ingevuld schema'}
            </div>
            <div>Afgedrukt: {new Date().toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

        {/* ── Wedstrijdschema ───────────────────────────────────────────────── */}
        <h2 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, marginTop: 0, color: '#333', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Wedstrijdschema
        </h2>

        {sortedRounds.map(roundNum => {
          const rm    = roundMap[roundNum]
          const isKO  = rm.some(m => m.phase !== 'group')
          const isGrp = !isKO
          const time  = isGrp ? getRoundTime(tournament, groupRoundIdx) : null
          if (isGrp) groupRoundIdx++

          const phaseLabel = isKO
            ? (KO_LABEL[rm[0]?.phase] ?? `Ronde ${roundNum}`)
            : `Ronde ${roundNum}`

          return (
            <div key={roundNum} style={{ marginBottom: 14, pageBreakInside: 'avoid' }}>
              {/* Ronde-header */}
              <div style={{
                backgroundColor: isKO ? '#1a1a1a' : '#FF6B00',
                color: '#fff', padding: '4px 10px',
                fontSize: 11, fontWeight: 'bold',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderRadius: '4px 4px 0 0',
              }}>
                <span>{phaseLabel}</span>
                {time && <span style={{ opacity: 0.9 }}>⏱ {time}</span>}
              </div>

              {/* Tabelrijen */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f0f0f0' }}>
                    <th style={thStyle}>Tijd</th>
                    <th style={thStyle}>Veld</th>
                    <th style={{ ...thStyle, textAlign: 'left', width: '28%' }}>Thuisteam</th>
                    <th style={{ ...thStyle, width: 40 }}>Score</th>
                    <th style={{ ...thStyle, width: 16, padding: 0 }}></th>
                    <th style={{ ...thStyle, width: 40 }}>Score</th>
                    <th style={{ ...thStyle, textAlign: 'left', width: '28%' }}>Uitteam</th>
                    <th style={thStyle}>Scheidsrechter</th>
                  </tr>
                </thead>
                <tbody>
                  {rm.map((match, mi) => {
                    const matchTime = match.scheduled_at
                      ? new Date(match.scheduled_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
                      : (isGrp && time ? time : '')

                    const homeScore = mode === 'filled' && match.home_score != null ? match.home_score : null
                    const awayScore = mode === 'filled' && match.away_score != null ? match.away_score : null
                    const finished  = match.status === 'finished'

                    return (
                      <tr key={match.id} style={{ backgroundColor: mi % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ ...tdStyle, color: '#666', width: 40 }}>{matchTime || '–'}</td>
                        <td style={{ ...tdStyle, color: '#666', width: 60 }}>{match.field?.name || '–'}</td>
                        <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>{match.home_team?.name ?? '?'}</td>

                        {/* Score thuis */}
                        <td style={{ padding: '3px 2px', textAlign: 'center' }}>
                          {mode === 'blank'
                            ? <div style={scoreBoxStyle} />
                            : <div style={{ ...scoreBoxFilledStyle, borderColor: finished ? '#22c55e' : '#ddd' }}>
                                {homeScore ?? '–'}
                              </div>
                          }
                        </td>

                        <td style={{ padding: 0, textAlign: 'center', color: '#bbb', fontWeight: 'bold', fontSize: 13 }}>–</td>

                        {/* Score uit */}
                        <td style={{ padding: '3px 2px', textAlign: 'center' }}>
                          {mode === 'blank'
                            ? <div style={scoreBoxStyle} />
                            : <div style={{ ...scoreBoxFilledStyle, borderColor: finished ? '#22c55e' : '#ddd' }}>
                                {awayScore ?? '–'}
                              </div>
                          }
                        </td>

                        <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>{match.away_team?.name ?? '?'}</td>
                        <td style={{ ...tdStyle, color: '#666', fontSize: 10 }}>
                          {(match as Match & { referee?: { name: string } }).referee?.name || '–'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}

        {/* ── Groepsstanden (alleen bij ingevuld) ──────────────────────────── */}
        {mode === 'filled' && standings.length > 0 && (
          <div style={{ marginTop: 24, pageBreakBefore: 'auto' }}>
            <h2 style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: '#333', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Groepsstanden
            </h2>

            {Array.from({ length: numPools }, (_, pi) => {
              const pool        = pi + 1
              const poolName    = poolNames[pi] ?? (numPools > 1 ? `Poule ${pool}` : null)
              const poolStandings = standings.filter(s => (s.pool ?? 1) === pool).sort(sortStanding)

              return (
                <div key={pool} style={{ marginBottom: 16, pageBreakInside: 'avoid' }}>
                  {poolName && (
                    <div style={{ backgroundColor: '#1a1a1a', color: '#fff', padding: '4px 10px', fontSize: 11, fontWeight: 'bold', borderRadius: '4px 4px 0 0' }}>
                      {poolName}
                    </div>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f0f0f0' }}>
                        <th style={{ ...thStyle, width: 28 }}>#</th>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Team</th>
                        <th style={thStyle}>Gesp.</th>
                        <th style={thStyle}>W</th>
                        <th style={thStyle}>G</th>
                        <th style={thStyle}>V</th>
                        <th style={thStyle}>Voor</th>
                        <th style={thStyle}>Tegen</th>
                        <th style={thStyle}>Saldo</th>
                        <th style={{ ...thStyle, color: '#FF6B00', fontWeight: 'bold' }}>Ptn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poolStandings.map((s, idx) => (
                        <tr key={s.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ ...tdStyle, textAlign: 'center', color: '#888' }}>{idx + 1}</td>
                          <td style={{ ...tdStyle, fontWeight: 'bold', textAlign: 'left' }}>{s.team?.name ?? '?'}</td>
                          <td style={tdStyle}>{s.played}</td>
                          <td style={tdStyle}>{s.won}</td>
                          <td style={tdStyle}>{s.drawn}</td>
                          <td style={tdStyle}>{s.lost}</td>
                          <td style={tdStyle}>{s.goals_for}</td>
                          <td style={tdStyle}>{s.goals_against}</td>
                          <td style={tdStyle}>{s.goals_for - s.goals_against}</td>
                          <td style={{ ...tdStyle, fontWeight: 'bold', color: '#FF6B00' }}>{s.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Voettekst ────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 24, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontSize: 9, color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
          <span>Zaans Licht Toernooi · {tournament.name}</span>
          <span>{new Date().toLocaleDateString('nl-NL')}</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 10mm 12mm; }
        }
      `}</style>
    </>
  )
}

// ── Stijlen ──────────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  padding: '5px 8px',
  textAlign: 'center',
  fontWeight: 'bold',
  fontSize: 10,
  color: '#555',
  borderBottom: '1px solid #e5e7eb',
  borderRight: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  textAlign: 'center',
  borderRight: '1px solid #f0f0f0',
}

const scoreBoxStyle: React.CSSProperties = {
  width: 34,
  height: 22,
  border: '2px solid #FF6B00',
  borderRadius: 4,
  margin: '0 auto',
  backgroundColor: '#fffbeb',
}

const scoreBoxFilledStyle: React.CSSProperties = {
  width: 34,
  height: 22,
  border: '2px solid #ddd',
  borderRadius: 4,
  margin: '0 auto',
  backgroundColor: '#f9fafb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 'bold',
  fontSize: 13,
  color: '#1a1a1a',
}
