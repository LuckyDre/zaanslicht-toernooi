'use client'

import { useEffect, useState, useMemo, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, Match, Tournament, Standing, Field, Referee } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Button } from '@/components/ui/Button'
import { BracketOverlay } from '@/components/admin/BracketOverlay'
import { downloadTournamentExcel } from '@/lib/excel'

// ── Elapsed timer ─────────────────────────────────────────────────────────────
function ElapsedTimer({ startedAt, matchMinutes }: { startedAt: string; matchMinutes: number }) {
  const calc = useCallback(() =>
    Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  , [startedAt])
  const [secs, setSecs] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setSecs(calc()), 1000)
    return () => clearInterval(id)
  }, [calc])
  const overtime = secs > matchMinutes * 60
  const m = Math.floor(secs / 60), s = secs % 60
  return (
    <span className="font-mono text-xs font-bold tabular-nums"
      style={{ color: overtime ? '#ef4444' : 'var(--orange)' }}>
      {m}:{s.toString().padStart(2, '0')}{overtime ? ' ⚡' : ''}
    </span>
  )
}

// ── Round time helper ─────────────────────────────────────────────────────────
function getRoundTime(
  roundNum: number,
  sortedRoundNums: number[],
  tournament: Tournament
): string | null {
  if (!tournament.starts_at) return null
  const idx = sortedRoundNums.indexOf(roundNum)
  if (idx < 0) return null
  const perRound = (tournament.match_duration_minutes + (tournament.break_minutes ?? 25)) * 60_000
  return new Date(new Date(tournament.starts_at).getTime() + idx * perRound)
    .toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

type MS = { homeScore: number; awayScore: number; saving: boolean; saved: boolean; error: string | null }
type RS = 'scheduled' | 'live' | 'finished'

function getRoundStatus(ms: Match[]): RS {
  const active = ms.filter(m => m.status !== 'cancelled')
  if (!active.length || active.every(m => m.status === 'finished')) return 'finished'
  if (active.some(m => m.status === 'live')) return 'live'
  return 'scheduled'
}

// ─── KO helpers ─────────────────────────────────────────────────────────────

const KO_PILL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'KF', semi_final: 'HF', final: 'F', third_place: '3e',
}
const KO_LABEL: Partial<Record<Match['phase'], string>> = {
  quarter_final: 'Kwartfinales', semi_final: 'Halve finales',
  final: 'Finale', third_place: 'Wedstrijd om 3e plaats',
}
const FINALS_COUNT: Record<string, number> = { final: 2, semi_final: 4, quarter_final: 8 }
const FINALS_PHASE: Record<string, Match['phase']> = {
  final: 'final', semi_final: 'semi_final', quarter_final: 'quarter_final',
}
const PHASE_ORDER: Partial<Record<Match['phase'], number>> = {
  quarter_final: 1, semi_final: 2, third_place: 3, final: 4,
}

function getRoundPillLabel(ms: Match[]): string | undefined {
  for (const m of ms) {
    const lbl = KO_PILL[m.phase]
    if (lbl) return lbl
  }
  return undefined
}

function sortStanding(a: Standing, b: Standing) {
  if (b.points !== a.points) return b.points - a.points
  const gdA = a.goals_for - a.goals_against, gdB = b.goals_for - b.goals_against
  if (gdB !== gdA) return gdB - gdA
  return b.goals_for - a.goals_for
}

/**
 * Get top N finalists from multi-pool standings.
 * Fills first with all pool #1s (sorted by performance), then best #2s, etc.
 * Example (3 pools, count=4): winner A, winner B, winner C, best runner-up
 */
function getMultiPoolFinalists(standings: Standing[], numPools: number, count: number): string[] {
  const result: string[] = []
  for (let rank = 0; result.length < count; rank++) {
    const atRank: Standing[] = []
    for (let p = 0; p < numPools; p++) {
      const poolStandings = standings.filter(s => (s.pool ?? 1) === p + 1).sort(sortStanding)
      if (poolStandings[rank]) atRank.push(poolStandings[rank])
    }
    if (atRank.length === 0) break
    const sorted = [...atRank].sort(sortStanding)
    result.push(...sorted.slice(0, count - result.length).map(s => s.team_id))
  }
  return result
}

/** For single-pool knockout: standard bracket seedings */
function seedsToMatchups(seeds: string[]): [string, string][] {
  const n = seeds.length
  if (n === 2) return [[seeds[0], seeds[1]]]
  if (n === 4) return [[seeds[0], seeds[3]], [seeds[1], seeds[2]]]
  if (n === 8) return [[seeds[0], seeds[7]], [seeds[3], seeds[4]], [seeds[1], seeds[6]], [seeds[2], seeds[5]]]
  const pairs: [string, string][] = []
  for (let i = 0, j = n - 1; i < j; i++, j--) pairs.push([seeds[i], seeds[j]])
  return pairs
}

/** Top N seeds from single-pool standings */
function getSeeds(standings: Standing[], count: number): string[] {
  return [...standings].sort(sortStanding).slice(0, count).map(s => s.team_id)
}

function getWinner(m: Match): string {
  return (m.home_score ?? 0) >= (m.away_score ?? 0) ? m.home_team_id : m.away_team_id
}
function getLoser(m: Match): string {
  return (m.home_score ?? 0) < (m.away_score ?? 0) ? m.home_team_id : m.away_team_id
}

// ─── Round navigator pill ────────────────────────────────────────────────────
function RoundPill({ n, label, time, status, selected, refStatus, onClick }: {
  n: number; label?: string; time?: string | null; status: RS; selected: boolean
  refStatus: 'none' | 'partial' | 'full'; onClick: () => void
}) {
  const bg     = selected ? 'var(--orange)' : status === 'finished' ? '#22c55e20' : status === 'live' ? '#FF6B0025' : 'var(--bg-card)'
  const border = selected ? 'var(--orange)' : status === 'finished' ? '#22c55e60' : status === 'live' ? 'var(--orange)' : 'var(--border)'
  const txtCol = selected ? '#fff' : 'var(--text-primary)'
  const subCol = selected ? 'rgba(255,255,255,.75)' : 'var(--text-secondary)'
  const dotCol = selected ? 'rgba(255,255,255,.85)' : status === 'finished' ? '#22c55e' : status === 'live' ? 'var(--orange)' : 'var(--border)'
  const refDot = refStatus === 'full' ? '#22c55e' : refStatus === 'partial' ? '#f59e0b' : 'transparent'
  return (
    <button onClick={onClick}
      className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl cursor-pointer active:scale-95 transition-transform gap-0.5 relative"
      style={{ width: 62, minHeight: 56, padding: '6px 4px', backgroundColor: bg, border: `2px solid ${border}`, color: txtCol }}>
      <span className="font-bold text-sm leading-none">{label ?? `R${n}`}</span>
      {time && <span className="text-[9px] leading-none font-semibold" style={{ color: subCol }}>{time}</span>}
      <span className="text-[10px] leading-none" style={{ color: dotCol }}>
        {status === 'finished' ? '✓' : status === 'live' ? '●' : '·'}
      </span>
      {/* Scheidsrechter-indicator: klein bolletje rechtsonder */}
      {refStatus !== 'none' && (
        <span className="absolute bottom-1 right-1.5 w-2 h-2 rounded-full"
          style={{ backgroundColor: refDot }} />
      )}
    </button>
  )
}

// ─── Scheidsrechter QR-knop (in de scheidsrechters-lijst) ────────────────────
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

// ─── Match card ──────────────────────────────────────────────────────────────
function MatchCard({
  match, s, matchMinutes, expectedTime, referees, canStart, onUpd, onSaveScore, onSave, onAssignRef,
}: {
  match: Match; s: MS; matchMinutes: number; expectedTime?: string | null
  referees: Referee[]; canStart: boolean
  onUpd: (p: Partial<MS>) => void
  onSaveScore: () => void
  onSave: (status: Match['status']) => void
  onAssignRef: (refereeId: string | null) => void
}) {
  const [showAssign, setShowAssign] = useState(false)

  const isLive      = match.status === 'live'
  const isDone      = match.status === 'finished'
  const isCancelled = match.status === 'cancelled'
  const isScheduled = match.status === 'scheduled'

  const borderColor = isLive ? 'var(--orange)' : isDone ? '#22c55e55' : isCancelled ? '#ef444455' : 'var(--border)'
  const bgColor     = isLive ? '#FF6B000D' : isDone ? '#22c55e0a' : 'var(--bg-card)'
  const headBg      = isLive ? '#FF6B0020' : isDone ? '#22c55e15' : 'var(--bg-elevated)'
  const statusLabel = isLive ? '● LIVE' : isDone ? '✓ Gespeeld' : isCancelled ? '✕ Afgelast' : 'Gepland'
  const statusColor = isLive ? 'var(--orange)' : isDone ? '#22c55e' : isCancelled ? '#ef4444' : 'var(--text-secondary)'

  const assignedRef = referees.find(r => r.id === match.referee_id) ?? null

  return (
    <>
    <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${borderColor}`, backgroundColor: bgColor }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: headBg, borderBottom: `1px solid ${borderColor}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-sm truncate">{match.field?.name ?? `Wedstrijd ${match.match_number}`}</span>
          {!isLive && !isDone && expectedTime && (
            <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
              🕐 {expectedTime}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLive && match.started_at && (
            <ElapsedTimer startedAt={match.started_at} matchMinutes={matchMinutes} />
          )}
          {s.saved  && <span className="text-xs font-medium" style={{ color: '#22c55e' }}>✓</span>}
          {s.error  && <span className="text-xs" style={{ color: '#ef4444' }}>⚠</span>}
          <span className="text-xs font-bold" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      <div className="px-4 py-4">
        {isLive ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
                <span className="font-bold text-sm truncate">{match.home_team?.name ?? '—'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onUpd({ homeScore: Math.max(0, s.homeScore - 1), saved: false })}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer active:scale-90"
                  style={{ backgroundColor: 'var(--bg-base)' }}>−</button>
                <span className="text-4xl font-bold font-mono w-12 text-center select-none">{s.homeScore}</span>
                <button onClick={() => onUpd({ homeScore: s.homeScore + 1, saved: false })}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer active:scale-90"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>+</button>
              </div>
            </div>
            <div className="text-2xl font-bold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>:</div>
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm truncate">{match.away_team?.name ?? '—'}</span>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onUpd({ awayScore: Math.max(0, s.awayScore - 1), saved: false })}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer active:scale-90"
                  style={{ backgroundColor: 'var(--bg-base)' }}>−</button>
                <span className="text-4xl font-bold font-mono w-12 text-center select-none">{s.awayScore}</span>
                <button onClick={() => onUpd({ awayScore: s.awayScore + 1, saved: false })}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer active:scale-90"
                  style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>+</button>
              </div>
            </div>
          </div>
        ) : isDone ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
              <span className="font-bold truncate">{match.home_team?.name ?? '—'}</span>
            </div>
            <span className="text-3xl font-bold font-mono flex-shrink-0" style={{ color: '#22c55e' }}>
              {match.home_score ?? 0}–{match.away_score ?? 0}
            </span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span className="font-bold truncate">{match.away_team?.name ?? '—'}</span>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
            </div>
          </div>
        ) : isCancelled ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
              <span className="font-bold truncate">{match.home_team?.name ?? '—'}</span>
            </div>
            <span className="text-sm px-2" style={{ color: '#ef4444' }}>afgelast</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span className="font-bold truncate">{match.away_team?.name ?? '—'}</span>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.home_team?.color || 'var(--orange)' }} />
              <span className="font-bold truncate">{match.home_team?.name ?? '—'}</span>
            </div>
            <span className="font-bold text-lg px-2" style={{ color: 'var(--text-secondary)' }}>vs</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
              <span className="font-bold truncate">{match.away_team?.name ?? '—'}</span>
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: match.away_team?.color || '#888' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Scheids-toewijzingsrij ── */}
      {!isCancelled && (
        <div className="flex items-center gap-2 px-4 pb-2 pt-0">
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>👤</span>
          {assignedRef ? (
            <span className="text-xs font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
              {assignedRef.name}
            </span>
          ) : (
            <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>Geen scheids</span>
          )}
          <button onClick={() => setShowAssign(true)}
            className="text-xs px-2 py-0.5 rounded-lg cursor-pointer flex-shrink-0 active:scale-95"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            {assignedRef ? 'Wijzig' : '+ Toewijzen'}
          </button>
        </div>
      )}

      <div className="flex gap-2 px-4 pb-4">
        {isScheduled && canStart && (
          <Button size="sm" loading={s.saving} onClick={() => onSave('live')} className="flex-1">▶ Start dit veld</Button>
        )}
        {isLive && (
          <>
            <Button size="sm" variant="secondary" loading={s.saving} onClick={onSaveScore} className="flex-1">💾 Tussenstand</Button>
            <Button size="sm" loading={s.saving} onClick={() => onSave('finished')} className="flex-1">✓ Klaar</Button>
          </>
        )}
        {!isDone && !isCancelled && (
          <Button size="sm" variant="danger" loading={s.saving}
            onClick={() => { if (confirm('Wedstrijd aflasten?')) onSave('cancelled') }}>✕</Button>
        )}
        {isDone && (
          <Button size="sm" variant="secondary" loading={s.saving} onClick={() => onSave('live')} className="flex-1">✏️ Aanpassen</Button>
        )}
        {(isDone || isCancelled) && (
          <Button size="sm" variant="ghost" loading={s.saving} onClick={() => onSave('scheduled')} className="flex-1">↩ Herplannen</Button>
        )}
      </div>
    </div>

    {/* ── Scheids toewijzen bottom-sheet ── */}
    {showAssign && (
      <div className="fixed inset-0 z-50 flex items-end justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={() => setShowAssign(false)}>
        <div className="w-full max-w-lg rounded-t-3xl px-5 pt-5 pb-8 flex flex-col gap-3"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="font-bold text-base">👤 Scheids toewijzen</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {match.field?.name ?? `Wedstrijd ${match.match_number}`}
                {' · '}
                {match.home_team?.name ?? '?'} vs {match.away_team?.name ?? '?'}
              </p>
            </div>
            <button onClick={() => setShowAssign(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>✕</button>
          </div>
          {/* Geen scheids */}
          <button
            onClick={() => { onAssignRef(null); setShowAssign(false) }}
            className="w-full px-4 py-3 rounded-2xl text-sm font-semibold text-left cursor-pointer active:scale-[0.98] transition-transform"
            style={{
              backgroundColor: !match.referee_id ? 'var(--orange)' : 'var(--bg-elevated)',
              color: !match.referee_id ? '#fff' : 'var(--text-secondary)',
              border: `1.5px solid ${!match.referee_id ? 'var(--orange)' : 'var(--border)'}`,
            }}>
            Geen scheids
          </button>
          {referees.length === 0 && (
            <p className="text-xs text-center py-2" style={{ color: 'var(--text-secondary)' }}>
              Nog geen scheidsrechters aangemaakt. Voeg ze toe in het Scheidsrechters-blok.
            </p>
          )}
          {/* Referee list */}
          {referees.map(r => (
            <button key={r.id}
              onClick={() => { onAssignRef(r.id); setShowAssign(false) }}
              className="w-full px-4 py-3 rounded-2xl text-sm font-semibold text-left cursor-pointer active:scale-[0.98] transition-transform"
              style={{
                backgroundColor: match.referee_id === r.id ? 'var(--orange)' : 'var(--bg-elevated)',
                color: match.referee_id === r.id ? '#fff' : 'var(--text-primary)',
                border: `1.5px solid ${match.referee_id === r.id ? 'var(--orange)' : 'var(--border)'}`,
              }}>
              {r.name}
            </button>
          ))}
        </div>
      </div>
    )}
    </>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tournament, setTournament]       = useState<Tournament | null>(null)
  const [matches, setMatches]             = useState<Match[]>([])
  const [standings, setStandings]         = useState<Standing[]>([])
  const [fields, setFields]               = useState<Field[]>([])
  const [states, setStates]               = useState<Record<string, MS>>({})
  const [loading, setLoading]             = useState(true)
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [roundSaving, setRoundSaving]     = useState(false)
  const [stopAllSaving, setStopAllSaving] = useState(false)
  const [generatingKO, setGeneratingKO]   = useState(false)
  const [showBracket, setShowBracket]     = useState(false)
  const [showTimeline, setShowTimeline]   = useState(false)
  const [editStartTime, setEditStartTime] = useState('')
  const [savingTime, setSavingTime]       = useState(false)
  const [referees, setReferees]           = useState<Referee[]>([])
  const [showLogo, setShowLogo]           = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg]             = useState<{ ok: boolean; text: string } | null>(null)
  const [showExport, setShowExport]       = useState(false)
  const [excelLoading, setExcelLoading]   = useState<'blank' | 'filled' | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) router.push('/login') })
  }, [router])

  useEffect(() => {
    supabase.from('tournaments').select('*').eq('id', id).single().then(({ data }) => setTournament(data))
    supabase.from('standings').select('*').eq('tournament_id', id).then(({ data }) => setStandings(data ?? []))
    supabase.from('fields').select('*').eq('tournament_id', id).order('display_order').then(({ data }) => setFields(data ?? []))
    supabase.from('referees').select('*').eq('tournament_id', id).order('created_at').then(({ data }) => setReferees(data ?? []))

    supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('tournament_id', id).order('round').order('match_number')
      .then(({ data }) => {
        const list = data ?? []
        setMatches(list)
        const init: Record<string, MS> = {}
        list.forEach(m => { init[m.id] = { homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0, saving: false, saved: false, error: null } })
        setStates(init)
        const map: Record<number, Match[]> = {}
        list.forEach(m => { const r = m.round ?? 0; if (!map[r]) map[r] = []; map[r].push(m) })
        const sorted = Object.keys(map).map(Number).sort((a, b) => a - b)
        const liveR  = sorted.find(r => map[r].some(m => m.status === 'live'))
        const schedR = sorted.find(r => map[r].some(m => m.status === 'scheduled'))
        setSelectedRound(liveR ?? schedR ?? sorted[sorted.length - 1] ?? null)
        setLoading(false)
      })
  }, [id])

  // ── Realtime: wedstrijdupdates van scheidsrechters op telefoon ────────────────
  useEffect(() => {
    if (!id) return
    const sub = supabase
      .channel(`admin-rt-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: `tournament_id=eq.${id}`,
      }, ({ new: updated }) => {
        const m = updated as Match
        // Bewaar de gejoinde team/veld-data, update alleen de eigen kolommen
        setMatches(prev => prev.map(p =>
          p.id === m.id
            ? { ...p, ...m, home_team: p.home_team, away_team: p.away_team, field: p.field }
            : p
        ))
        // Update score-state als de admin niet zelf aan het typen is
        setStates(prev => {
          if (!prev[m.id] || prev[m.id].saving) return prev
          return {
            ...prev,
            [m.id]: {
              ...prev[m.id],
              homeScore: m.home_score ?? prev[m.id].homeScore,
              awayScore: m.away_score ?? prev[m.id].awayScore,
            },
          }
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [id])

  const upd = (matchId: string, p: Partial<MS>) =>
    setStates(prev => ({ ...prev, [matchId]: { ...prev[matchId], ...p } }))

  const tryAdvance = (updatedList: Match[], fromRound: number) => {
    const map: Record<number, Match[]> = {}
    updatedList.forEach(m => { const r = m.round ?? 0; if (!map[r]) map[r] = []; map[r].push(m) })
    if (getRoundStatus(map[fromRound] ?? []) === 'finished') {
      const sorted = Object.keys(map).map(Number).sort((a, b) => a - b)
      const next = sorted.find(r => r > fromRound && getRoundStatus(map[r]) !== 'finished')
      if (next !== undefined) setTimeout(() => setSelectedRound(next), 400)
    }
  }

  const reloadMatches = async () => {
    const { data } = await supabase.from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), field:fields(*)')
      .eq('tournament_id', id).order('round').order('match_number')
    if (!data) return data
    setMatches(data)
    setStates(prev => {
      const next = { ...prev }
      data.forEach(m => { if (!next[m.id]) next[m.id] = { homeScore: m.home_score ?? 0, awayScore: m.away_score ?? 0, saving: false, saved: false, error: null } })
      return next
    })
    return data
  }

  const assignReferee = async (matchId: string, refId: string | null) => {
    await supabase.from('matches').update({ referee_id: refId }).eq('id', matchId)
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, referee_id: refId } : m))
  }

  const saveMatch = async (match: Match, status: Match['status']) => {
    const s = states[match.id]; if (!s) return
    upd(match.id, { saving: true, error: null, saved: false })
    const { error } = await supabase.from('matches').update({
      home_score: status === 'cancelled' ? null : s.homeScore,
      away_score: status === 'cancelled' ? null : s.awayScore,
      status,
      started_at: status === 'live' && !match.started_at ? new Date().toISOString() : match.started_at,
      finished_at: status === 'finished' ? new Date().toISOString() : null,
    }).eq('id', match.id)
    if (error) {
      upd(match.id, { saving: false, error: error.message })
    } else {
      const updated = matches.map(m => m.id === match.id
        ? { ...m, status, home_score: status === 'cancelled' ? null : s.homeScore, away_score: status === 'cancelled' ? null : s.awayScore }
        : m)
      setMatches(updated)
      upd(match.id, { saving: false, saved: true })
      setTimeout(() => upd(match.id, { saved: false }), 2500)
      if ((status === 'finished' || status === 'cancelled') && match.round != null) tryAdvance(updated, match.round)
    }
  }

  const saveScore = async (match: Match) => {
    const s = states[match.id]; if (!s) return
    upd(match.id, { saving: true, error: null })
    const { error } = await supabase.from('matches').update({ home_score: s.homeScore, away_score: s.awayScore }).eq('id', match.id)
    if (error) {
      upd(match.id, { saving: false, error: error.message })
    } else {
      setMatches(prev => prev.map(m => m.id === match.id ? { ...m, home_score: s.homeScore, away_score: s.awayScore } : m))
      upd(match.id, { saving: false, saved: true })
      setTimeout(() => upd(match.id, { saved: false }), 2500)
    }
  }

  const startRound = async (roundMatches: Match[]) => {
    const toStart = roundMatches.filter(m => m.status === 'scheduled')
    if (!toStart.length) return
    setRoundSaving(true)
    const now = new Date().toISOString()
    await Promise.all(toStart.map(m =>
      supabase.from('matches').update({ status: 'live', started_at: now, home_score: 0, away_score: 0 }).eq('id', m.id)
    ))
    setMatches(prev => prev.map(m =>
      toStart.find(t => t.id === m.id) ? { ...m, status: 'live', started_at: now, home_score: 0, away_score: 0 } : m
    ))
    setStates(prev => { const n = { ...prev }; toStart.forEach(m => { n[m.id] = { ...n[m.id], homeScore: 0, awayScore: 0 } }); return n })
    setRoundSaving(false)
  }

  const stopRound = async (roundNum: number, roundMatches: Match[]) => {
    const toLive = roundMatches.filter(m => m.status === 'live')
    if (!toLive.length) return
    if (!confirm(`Ronde ${roundNum}: ${toLive.length} wedstrijd${toLive.length > 1 ? 'en' : ''} afsluiten?`)) return
    setRoundSaving(true)
    const now = new Date().toISOString()
    await Promise.all(toLive.map(m => {
      const s = states[m.id]
      return supabase.from('matches').update({ status: 'finished', finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }).eq('id', m.id)
    }))
    const updated = matches.map(m => {
      if (!toLive.find(t => t.id === m.id)) return m
      const s = states[m.id]
      return { ...m, status: 'finished' as Match['status'], finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }
    })
    setMatches(updated)
    setRoundSaving(false)
    tryAdvance(updated, roundNum)
  }

  const stopAll = async () => {
    const live = matches.filter(m => m.status === 'live')
    if (!live.length || !confirm(`${live.length} live wedstrijden stoppen?`)) return
    setStopAllSaving(true)
    const now = new Date().toISOString()
    await Promise.all(live.map(m => {
      const s = states[m.id]
      return supabase.from('matches').update({ status: 'finished', finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }).eq('id', m.id)
    }))
    setMatches(prev => prev.map(m => {
      if (m.status !== 'live') return m
      const s = states[m.id]
      return { ...m, status: 'finished', finished_at: now, home_score: s?.homeScore ?? 0, away_score: s?.awayScore ?? 0 }
    }))
    setStopAllSaving(false)
  }

  // ─── Generate knockout round ────────────────────────────────────────────────
  const generateKO = async () => {
    if (!tournament) return
    setGeneratingKO(true)
    try {
      // Always fetch fresh standings so we use final group-phase results
      const { data: freshStandings } = await supabase.from('standings').select('*').eq('tournament_id', id)
      const currentStandings = freshStandings ?? standings
      if (freshStandings) setStandings(freshStandings)

      const groupMs  = matches.filter(m => m.phase === 'group')
      const koMs     = matches.filter(m => m.phase !== 'group')
      const maxMatchNum   = matches.reduce((max, m) => Math.max(max, m.match_number ?? 0), 0)
      const maxGroupRound = groupMs.reduce((max, m) => Math.max(max, m.round ?? 0), 0)
      const maxKORound    = koMs.reduce((max, m) => Math.max(max, m.round ?? 0), maxGroupRound)
      const numFields     = Math.max(fields.length, 1)
      const isMultiPool   = (tournament.num_pools ?? 1) > 1

      const insertRows: object[] = []
      let mn       = maxMatchNum + 1
      let roundNum = maxKORound + 1

      if (isMultiPool && koMs.length === 0) {
        // ── Multi-pool: seed INITIAL KO round from pool standings ──────────
        // Only runs when no KO matches exist yet.
        // After this, advancement uses the standard single-pool logic below.
        const count = FINALS_COUNT[tournament.finals_type] ?? 4
        const finalists = getMultiPoolFinalists(currentStandings, tournament.num_pools, count)
        if (finalists.length < 2) {
          alert('Niet genoeg teams gevonden. Zijn alle groepswedstrijden afgerond?')
          setGeneratingKO(false); return
        }
        const matchups = seedsToMatchups(finalists)
        const phase: Match['phase'] = count <= 2 ? 'final' : count <= 4 ? 'semi_final' : 'quarter_final'
        for (let i = 0; i < matchups.length; i += numFields) {
          const chunk = matchups.slice(i, i + numFields)
          chunk.forEach(([home, away], fi) => {
            insertRows.push({
              tournament_id: tournament.id,
              home_team_id: home, away_team_id: away,
              round: roundNum, match_number: mn++,
              phase, status: 'scheduled' as const,
              field_id: fields[fi % fields.length]?.id ?? null,
            })
          })
          roundNum++
        }

      } else {
        // ── Single-pool initial KO  OR  any-pool KO advancement ───────────
        // Multi-pool after the first KO round also uses this path.
        let matchups: [string, string][]
        let phase: Match['phase']

        if (koMs.length === 0) {
          const count = FINALS_COUNT[tournament.finals_type] ?? 2
          const seeds = getSeeds(currentStandings, count)
          if (seeds.length < 2) { alert('Niet genoeg teams in de standen om finales te genereren.'); setGeneratingKO(false); return }
          phase    = FINALS_PHASE[tournament.finals_type] ?? 'final'
          matchups = seedsToMatchups(seeds)
        } else {
          const latestPhase = koMs.reduce<Match['phase']>((latest, m) =>
            (PHASE_ORDER[m.phase] ?? 0) > (PHASE_ORDER[latest] ?? 0) ? m.phase : latest
          , 'quarter_final')
          const phaseMs = [...koMs.filter(m => m.phase === latestPhase)]
            .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))

          if (latestPhase === 'semi_final') {
            // Final + 3rd place in the same round
            insertRows.push({
              tournament_id: tournament.id,
              home_team_id: getLoser(phaseMs[0]), away_team_id: getLoser(phaseMs[1]),
              round: roundNum, match_number: mn++,
              phase: 'third_place' as const, status: 'scheduled' as const,
              field_id: fields[numFields > 1 ? 1 : 0]?.id ?? null,
            })
            insertRows.push({
              tournament_id: tournament.id,
              home_team_id: getWinner(phaseMs[0]), away_team_id: getWinner(phaseMs[1]),
              round: roundNum, match_number: mn++,
              phase: 'final' as const, status: 'scheduled' as const,
              field_id: fields[0]?.id ?? null,
            })
            await supabase.from('matches').insert(insertRows)
            const upd2 = await reloadMatches()
            if (upd2) setTimeout(() => setSelectedRound(roundNum), 200)
            setGeneratingKO(false); return
          } else if (latestPhase === 'quarter_final') {
            phase    = 'semi_final'
            matchups = seedsToMatchups(phaseMs.map(getWinner))
          } else { setGeneratingKO(false); return }
        }

        for (let i = 0; i < matchups.length; i += numFields) {
          const chunk = matchups.slice(i, i + numFields)
          chunk.forEach(([home, away], fi) => {
            insertRows.push({
              tournament_id: tournament.id,
              home_team_id: home, away_team_id: away,
              round: roundNum, match_number: mn++,
              phase, status: 'scheduled' as const,
              field_id: fields[fi]?.id ?? null,
            })
          })
          roundNum++
        }
      }

      await supabase.from('matches').insert(insertRows)
      const updated = await reloadMatches()
      if (updated) {
        const newRound = maxKORound + 1
        setTimeout(() => setSelectedRound(newRound), 200)
      }
    } catch (err) {
      console.error(err)
      alert('Fout bij aanmaken finalewedstrijden. Probeer opnieuw.')
    }
    setGeneratingKO(false)
  }

  // ─── Derived state ──────────────────────────────────────────────────────────
  const rounds = useMemo(() => {
    const map: Record<number, Match[]> = {}
    matches.forEach(m => { const r = m.round ?? 0; if (!map[r]) map[r] = []; map[r].push(m) })
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([r, ms]) => ({ round: Number(r), matches: [...ms].sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)) }))
  }, [matches])

  const currentRound = rounds.find(r => r.round === selectedRound)
  const liveCount    = matches.filter(m => m.status === 'live').length
  const doneCount    = matches.filter(m => m.status === 'finished').length
  const doneRounds   = rounds.filter(r => getRoundStatus(r.matches) === 'finished').length
  const progress     = rounds.length > 0 ? (doneRounds / rounds.length) * 100 : 0
  const crStatus     = currentRound ? getRoundStatus(currentRound.matches) : null
  const crScheduled  = currentRound?.matches.filter(m => m.status === 'scheduled') ?? []
  const crLive       = currentRound?.matches.filter(m => m.status === 'live') ?? []

  // KO generation availability
  const groupMatches  = matches.filter(m => m.phase === 'group')
  const koMatches     = matches.filter(m => m.phase !== 'group')
  const allGroupDone  = groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished' || m.status === 'cancelled')

  const latestKOPhase = koMatches.length > 0
    ? koMatches.reduce<Match['phase']>((latest, m) =>
        (PHASE_ORDER[m.phase] ?? 0) > (PHASE_ORDER[latest] ?? 0) ? m.phase : latest
      , 'quarter_final')
    : null

  const allLatestKODone = !!latestKOPhase &&
    koMatches.filter(m => m.phase === latestKOPhase).every(m => m.status === 'finished' || m.status === 'cancelled')

  const isMultiPool = (tournament?.num_pools ?? 1) > 1

  // ── Tijdplanning ─────────────────────────────────────────────────────────────
  const sortedRoundNums = useMemo(() => rounds.map(r => r.round), [rounds])

  const roundTimeMap = useMemo((): Record<number, string | null> => {
    const map: Record<number, string | null> = {}
    if (!tournament?.starts_at) { sortedRoundNums.forEach(rn => { map[rn] = null }); return map }
    const perRound = (tournament.match_duration_minutes + (tournament.break_minutes ?? 25)) * 60_000
    sortedRoundNums.forEach((rn, idx) => {
      map[rn] = new Date(new Date(tournament.starts_at!).getTime() + idx * perRound)
        .toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    })
    return map
  }, [sortedRoundNums, tournament])

  const saveStartTime = async () => {
    if (!tournament || !editStartTime) return
    setSavingTime(true)
    const iso = new Date(`${new Date().toDateString()} ${editStartTime}`).toISOString()
    await supabase.from('tournaments').update({ starts_at: iso }).eq('id', tournament.id)
    setTournament(prev => prev ? { ...prev, starts_at: iso } : prev)
    setSavingTime(false); setEditStartTime('')
  }

  // ─── Logo uploaden (canvas-compressie → data-URL → direct in DB) ────────────
  const uploadLogo = async (file: File) => {
    if (!tournament) return
    setLogoUploading(true); setLogoMsg(null)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload = e => {
          const img = new Image()
          img.onerror = reject
          img.onload = () => {
            const MAX = 400
            const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
            const w = Math.round(img.width * ratio)
            const h = Math.round(img.height * ratio)
            const canvas = document.createElement('canvas')
            canvas.width = w; canvas.height = h
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
            resolve(canvas.toDataURL('image/png', 0.92))
          }
          img.src = e.target!.result as string
        }
        reader.readAsDataURL(file)
      })
      const { error } = await supabase.from('tournaments')
        .update({ logo_url: dataUrl }).eq('id', tournament.id)
      if (error) throw error
      setTournament(prev => prev ? { ...prev, logo_url: dataUrl } : prev)
      setLogoMsg({ ok: true, text: 'Logo opgeslagen ✓' })
      setTimeout(() => setLogoMsg(null), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout'
      setLogoMsg({ ok: false, text: `Mislukt: ${msg}` })
    }
    setLogoUploading(false)
  }

  const removeLogo = async () => {
    if (!tournament || !confirm('Logo verwijderen?')) return
    await supabase.from('tournaments').update({ logo_url: null }).eq('id', tournament.id)
    setTournament(prev => prev ? { ...prev, logo_url: null } : prev)
  }

  // ── Compute tournament winner for winner banner ─────────────────────────────
  const allMatchesDone = matches.length > 0 && matches.every(m => m.status === 'finished' || m.status === 'cancelled')
  const tournamentWinner = useMemo((): { name: string; color: string } | null => {
    if (!allMatchesDone || koMatches.length === 0) return null
    // Both single- and multi-pool now use proper knockout → look at the final match
    const finalMatch = koMatches.find(m => m.phase === 'final' && m.status === 'finished')
    if (!finalMatch) return null
    const winnerTeam = (finalMatch.home_score ?? 0) >= (finalMatch.away_score ?? 0)
      ? finalMatch.home_team : finalMatch.away_team
    return winnerTeam ? { name: winnerTeam.name, color: winnerTeam.color ?? '#f59e0b' } : null
  }, [allMatchesDone, koMatches])

  const canGenerateFirst = !!tournament && tournament.finals_type !== 'none' && allGroupDone && koMatches.length === 0
  // Next-round button: single- and multi-pool both use proper knockout now
  const canGenerateNext  = !!latestKOPhase && allLatestKODone
    && latestKOPhase !== 'final' && latestKOPhase !== 'third_place'
    && !(latestKOPhase === 'semi_final' && koMatches.some(m => m.phase === 'final'))
    && !(latestKOPhase === 'quarter_final' && koMatches.some(m => m.phase === 'semi_final'))

  // ── Excel download ─────────────────────────────────────────────────────────
  const handleExcel = async (mode: 'blank' | 'filled') => {
    if (!tournament) return
    setExcelLoading(mode)
    try {
      await downloadTournamentExcel(tournament, matches, standings, fields, mode)
    } finally {
      setExcelLoading(null)
    }
  }

  const showGenerateButton = canGenerateFirst || canGenerateNext
  const generateButtonLabel = (() => {
    if (canGenerateFirst) {
      if (isMultiPool) {
        const count = FINALS_COUNT[tournament!.finals_type] ?? 4
        const sfCount = count / 2
        return `🏆 Genereer halve finales (${count} teams · ${sfCount} wedstrijd${sfCount !== 1 ? 'en' : ''})`
      }
      return `🏆 Genereer finales (${KO_LABEL[FINALS_PHASE[tournament?.finals_type ?? ''] ?? 'final'] ?? 'Finale'})`
    }
    if (latestKOPhase === 'quarter_final') return '🏆 Genereer halve finales'
    if (latestKOPhase === 'semi_final')    return '🏆 Genereer finale & 3e plaats'
    return null
  })()

  return (
    <div className="min-h-screen pb-8" style={{ backgroundColor: 'var(--bg-base)' }}>
      {showBracket && tournament && (
        <BracketOverlay
          tournament={tournament}
          matches={matches}
          standings={standings}
          onClose={() => setShowBracket(false)}
        />
      )}

      <Navbar isAdmin />
      <main className="max-w-xl mx-auto px-4 py-5">

        {/* ── Top bar ── */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <Link href="/admin" className="text-xs hover:opacity-80 mb-1 inline-block" style={{ color: 'var(--text-secondary)' }}>
              ← Admin dashboard
            </Link>
            <h1 className="text-xl font-bold leading-tight">{tournament?.name ?? '…'}</h1>
          </div>
          <div className="flex gap-2 flex-shrink-0 mt-4 flex-wrap justify-end">
            {liveCount > 0 && (
              <Button size="sm" variant="danger" loading={stopAllSaving} onClick={stopAll}>■ Stop alles</Button>
            )}
            {koMatches.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setShowBracket(true)}>📊 Bracket</Button>
            )}
            <Link href={`/tournament/${id}`} target="_blank">
              <Button size="sm" variant="ghost">Live ↗</Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
          </div>
        ) : <>

          {/* ── Progress ── */}
          <div className="mb-5 p-3 rounded-2xl" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-semibold">Voortgang toernooi</span>
              <span>{doneRounds}/{rounds.length} rondes  ·  {doneCount}/{matches.length} wedstrijden</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#22c55e' : 'var(--orange)' }} />
            </div>
            {liveCount > 0 && (
              <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--orange)' }}>
                ● {liveCount} wedstrijd{liveCount > 1 ? 'en' : ''} live
              </p>
            )}
          </div>

          {/* ── Exporteren sectie ── */}
          <div className="mb-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
            <button
              onClick={() => setShowExport(e => !e)}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)' }}>
              <span className="text-sm font-bold">📥 Exporteren &amp; printen</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{showExport ? '▲' : '▼'}</span>
            </button>

            {showExport && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Leeg schema = invulvakken voor notities · Ingevuld = met huidige scores · Excel bevat automatische berekeningen
                </p>
                <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  {/* Print knoppen */}
                  <a
                    href={`/admin/tournament/${id}/print?mode=blank`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-sm font-semibold cursor-pointer transition-all active:scale-[0.97]"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', textDecoration: 'none' }}>
                    🖨 Leeg schema
                  </a>
                  <a
                    href={`/admin/tournament/${id}/print?mode=filled`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-sm font-semibold cursor-pointer transition-all active:scale-[0.97]"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', textDecoration: 'none' }}>
                    🖨 Ingevuld schema
                  </a>
                  {/* Excel knoppen */}
                  <button
                    onClick={() => handleExcel('blank')}
                    disabled={excelLoading !== null}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-sm font-semibold cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{ backgroundColor: '#1D6F42', border: '1px solid #145232', color: '#fff' }}>
                    {excelLoading === 'blank' ? '⏳ Laden…' : '📊 Excel leeg'}
                  </button>
                  <button
                    onClick={() => handleExcel('filled')}
                    disabled={excelLoading !== null}
                    className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-sm font-semibold cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{ backgroundColor: '#1D6F42', border: '1px solid #145232', color: '#fff' }}>
                    {excelLoading === 'filled' ? '⏳ Laden…' : '📊 Excel ingevuld'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Tijdschema sectie ── */}
          <div className="mb-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
            {/* Header — klik om uit te klappen */}
            <button
              onClick={() => setShowTimeline(t => !t)}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">📅 Tijdschema</span>
                {tournament?.starts_at
                  ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>
                      start {new Date(tournament.starts_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  : <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>geen starttijd ingesteld</span>
                }
              </div>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{showTimeline ? '▲' : '▼'}</span>
            </button>

            {showTimeline && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                {/* Starttijd instellen */}
                <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>Starttijd:</span>
                  <input type="time" value={editStartTime || (tournament?.starts_at ? new Date(tournament.starts_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '')}
                    onChange={e => setEditStartTime(e.target.value)}
                    className="rounded-lg px-2 py-1 text-xs outline-none"
                    style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-primary)', width: 90 }} />
                  {editStartTime && (
                    <button onClick={saveStartTime} disabled={savingTime}
                      className="text-xs font-bold px-3 py-1 rounded-lg cursor-pointer"
                      style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                      {savingTime ? '…' : 'Opslaan'}
                    </button>
                  )}
                  {tournament && (
                    <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary)' }}>
                      pauze: {tournament.break_minutes ?? 25} min
                    </span>
                  )}
                </div>

                {/* Ronde-lijst */}
                {rounds.map(({ round, matches: rm }, idx) => {
                  const isKO = rm.some(m => m.phase !== 'group')
                  const prevIsGroup = idx > 0 && rounds[idx - 1].matches.every(m => m.phase === 'group')
                  const isFirstKO   = isKO && prevIsGroup
                  const st = getRoundStatus(rm)
                  const time = roundTimeMap[round]
                  const label = getRoundPillLabel(rm)
                  return (
                    <div key={round}>
                      {isFirstKO && (
                        <div className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
                          style={{ backgroundColor: '#FF6B0010', color: 'var(--orange)', borderTop: '1px solid var(--border)' }}>
                          🏆 Finale rondes
                        </div>
                      )}
                      <div
                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                        style={{
                          borderTop: isFirstKO ? 'none' : '1px solid var(--border)',
                          backgroundColor: round === selectedRound ? '#FF6B000A' : 'transparent',
                        }}
                        onClick={() => setSelectedRound(round)}>
                        {/* Status dot */}
                        <span className="text-sm w-4 text-center flex-shrink-0"
                          style={{ color: st === 'finished' ? '#22c55e' : st === 'live' ? 'var(--orange)' : 'var(--text-secondary)' }}>
                          {st === 'finished' ? '✓' : st === 'live' ? '●' : '○'}
                        </span>
                        {/* Tijd */}
                        <span className="text-sm font-bold tabular-nums w-12 flex-shrink-0"
                          style={{ color: time ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {time ?? '—:——'}
                        </span>
                        {/* Label */}
                        <span className="flex-1 text-sm">
                          {label ? (KO_LABEL[rm[0]?.phase] ?? `Ronde ${round}`) : `Ronde ${round}`}
                        </span>
                        {/* Wedstrijden */}
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                          {rm.filter(m => m.status !== 'cancelled').length} wedstrijd{rm.length !== 1 ? 'en' : ''}
                        </span>
                        {round === selectedRound && (
                          <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--orange)' }}>◀</span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Eindtijd schatting */}
                {tournament?.starts_at && rounds.length > 0 && (() => {
                  const lastTime = roundTimeMap[rounds[rounds.length - 1].round]
                  if (!lastTime) return null
                  const endMs = new Date(tournament.starts_at).getTime() +
                    (rounds.length - 1) * (tournament.match_duration_minutes + (tournament.break_minutes ?? 25)) * 60_000 +
                    tournament.match_duration_minutes * 60_000
                  const endStr = new Date(endMs).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Verwachte eindtijd</span>
                      <span className="text-sm font-bold">~{endStr}</span>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          {/* ── Logo sectie ── */}
          <div className="mb-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
            <button
              onClick={() => setShowLogo(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">🖼️ Club logo</span>
                {tournament?.logo_url
                  ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>Ingesteld</span>
                  : <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Niet ingesteld</span>}
              </div>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{showLogo ? '▲' : '▼'}</span>
            </button>

            {showLogo && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <div className="px-4 py-4 flex flex-col gap-3">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Het logo van de gastvereniging wordt weergegeven op de publieke toernooi-pagina en in de QR-deel popup.
                    Upload een vierkant logo (PNG of SVG werkt het beste).
                  </p>
                  {/* Huidig logo */}
                  {tournament?.logo_url && (
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={tournament.logo_url} alt="Logo" className="w-14 h-14 object-contain" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">Huidig logo</p>
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                          Zichtbaar op de publieks&shy;pagina
                        </p>
                      </div>
                      <button onClick={removeLogo}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer"
                        style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                        Verwijder
                      </button>
                    </div>
                  )}
                  {/* Upload knop */}
                  <label className="flex items-center justify-center gap-2 rounded-2xl py-3 px-4 cursor-pointer transition-all active:scale-[0.98]"
                    style={{ backgroundColor: logoUploading ? 'var(--bg-elevated)' : 'var(--orange)', color: logoUploading ? 'var(--text-secondary)' : '#fff', border: `2px dashed ${logoUploading ? 'var(--border)' : 'var(--orange)'}` }}>
                    {logoUploading
                      ? <><span className="w-4 h-4 rounded-full border-2 animate-spin inline-block" style={{ borderColor: 'var(--text-secondary)', borderTopColor: 'transparent' }} /> Uploading…</>
                      : <><span className="text-lg">📁</span> <span className="font-bold text-sm">{tournament?.logo_url ? 'Vervang logo' : 'Upload logo'}</span></>
                    }
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} />
                  </label>
                  {logoMsg && (
                    <p className="text-xs font-semibold text-center" style={{ color: logoMsg.ok ? '#22c55e' : '#ef4444' }}>
                      {logoMsg.text}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Scheidsrechters knop → eigen pagina ── */}
          <div className="mb-4">
            <Link href={`/admin/tournament/${id}/referees`}>
              <div className="rounded-2xl px-4 py-3 flex items-center justify-between cursor-pointer hover:opacity-90 active:scale-[0.99] transition-all"
                style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">👤 Scheidsrechters</span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: referees.length > 0 ? '#FF6B0020' : 'var(--bg-elevated)', color: referees.length > 0 ? 'var(--orange)' : 'var(--text-secondary)' }}>
                    {referees.length}
                  </span>
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>Beheren →</span>
              </div>
            </Link>
          </div>
          {/* ── Tournament winner banner ── */}
          {tournamentWinner && (
            <div className="rounded-2xl p-5 text-center mb-5"
              style={{ background: `linear-gradient(135deg, ${tournamentWinner.color}22, ${tournamentWinner.color}11)`, border: `2px solid ${tournamentWinner.color}` }}>
              <div className="text-4xl mb-2">🏆</div>
              <div className="font-bold text-xl" style={{ color: tournamentWinner.color }}>{tournamentWinner.name}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Winnaar toernooi</div>
              <button onClick={() => setShowBracket(true)}
                className="mt-3 text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer transition-opacity hover:opacity-80"
                style={{ backgroundColor: `${tournamentWinner.color}30`, color: tournamentWinner.color, border: `1px solid ${tournamentWinner.color}66` }}>
                📊 Bekijk volledig bracket →
              </button>
            </div>
          )}

          {/* ── Generate KO banner ── */}
          {showGenerateButton && generateButtonLabel && (
            <button
              onClick={generateKO}
              disabled={generatingKO}
              className="w-full rounded-2xl font-bold cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform mb-5"
              style={{ padding: '16px 20px', backgroundColor: '#f59e0b', color: '#fff', fontSize: '16px', border: '2px solid #d97706' }}>
              {generatingKO ? 'Aanmaken…' : generateButtonLabel}
            </button>
          )}

          {/* ── Round navigator ── */}
          <div className="overflow-x-auto -mx-4 px-4 pb-2 mb-4">
            <div className="flex items-end gap-1.5" style={{ width: 'max-content' }}>
              {rounds.map(({ round, matches: rm }, idx) => {
                const isKO       = rm.some(m => m.phase !== 'group')
                const prevGroup  = idx > 0 && rounds[idx - 1].matches.every(m => m.phase === 'group')
                const isFirstKO  = isKO && (idx === 0 || prevGroup)
                const active     = rm.filter(m => m.status !== 'cancelled')
                const withRef    = active.filter(m => m.referee_id !== null).length
                const refStatus: 'none' | 'partial' | 'full' =
                  active.length === 0 ? 'none'
                  : withRef === active.length ? 'full'
                  : withRef > 0 ? 'partial'
                  : 'none'
                return (
                  <div key={round} className="flex items-end gap-1.5">
                    {/* Fase-scheiding: verticale lijn + label */}
                    {isFirstKO && (
                      <div className="flex flex-col items-center self-stretch justify-end pb-1 px-1">
                        <span className="text-[9px] font-bold uppercase mb-1" style={{ color: 'var(--orange)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                          Finales
                        </span>
                        <div className="w-0.5 flex-1 rounded-full" style={{ backgroundColor: 'var(--orange)', opacity: 0.5, minHeight: 28 }} />
                      </div>
                    )}
                    <RoundPill
                      n={round}
                      label={getRoundPillLabel(rm) ?? undefined}
                      time={roundTimeMap[round]}
                      status={getRoundStatus(rm)}
                      refStatus={refStatus}
                      selected={round === selectedRound}
                      onClick={() => setSelectedRound(round)}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Round detail ── */}
          {currentRound && <>
            {/* Round header */}
            {(() => {
              const activeMs = currentRound.matches.filter(m => m.status !== 'cancelled')
              const plannedTime = roundTimeMap[currentRound.round]
              const startTimes  = activeMs.map(m => m.started_at).filter(Boolean) as string[]
              const endTimes    = activeMs.filter(m => m.status === 'finished').map(m => m.finished_at).filter(Boolean) as string[]
              const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
              const earliestStart = startTimes.length ? fmtTime(startTimes.reduce((a, b) => a < b ? a : b)) : null
              const latestEnd     = endTimes.length === activeMs.length && endTimes.length > 0
                ? fmtTime(endTimes.reduce((a, b) => a > b ? a : b))
                : null
              const withRef    = activeMs.filter(m => m.referee_id !== null).length
              const refComplete = activeMs.length > 0 && withRef === activeMs.length
              const refPartial  = withRef > 0 && !refComplete
              return (
                <div className="mb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">
                        {getRoundPillLabel(currentRound.matches)
                          ? KO_LABEL[currentRound.matches[0]?.phase] ?? `Ronde ${currentRound.round}`
                          : `Ronde ${currentRound.round}`}
                        {!getRoundPillLabel(currentRound.matches) && (
                          <span className="text-base font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>
                            / {rounds.filter(r => !getRoundPillLabel(r.matches)).length}
                          </span>
                        )}
                      </h2>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {crStatus === 'live'
                          ? `${crLive.length} live · ${currentRound.matches.filter(m => m.status === 'finished').length}/${currentRound.matches.length} klaar`
                          : crStatus === 'finished'
                          ? `Alle ${activeMs.length} wedstrijden gespeeld`
                          : `${crScheduled.length} veld${crScheduled.length !== 1 ? 'en' : ''} staan klaar`}
                      </p>
                      {/* Scheidsrechter-status voor deze ronde */}
                      {referees.length > 0 && (
                        <p className="text-xs mt-0.5 font-semibold"
                          style={{ color: refComplete ? '#22c55e' : refPartial ? '#f59e0b' : 'var(--text-secondary)' }}>
                          {refComplete
                            ? `👤 ✓ Alle ${withRef} scheidsrechters toegewezen`
                            : refPartial
                            ? `👤 ${withRef}/${activeMs.length} scheidsrechters toegewezen`
                            : '👤 Nog geen scheidsrechters toegewezen'}
                        </p>
                      )}
                    </div>
                    {crStatus === 'live' && (
                      <div className="px-3 py-1.5 rounded-full text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: '#FF6B0020', color: 'var(--orange)', border: '1px solid #FF6B0050' }}>
                        ● LIVE
                      </div>
                    )}
                    {crStatus === 'finished' && (
                      <div className="px-3 py-1.5 rounded-full text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: '#22c55e15', color: '#22c55e', border: '1px solid #22c55e50' }}>
                        ✓ Gespeeld
                      </div>
                    )}
                  </div>
                  {/* Tijdsbalk: gepland · gestart · afgesloten */}
                  {(plannedTime || earliestStart || latestEnd) && (
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {plannedTime && (
                        <span className="flex items-center gap-1 text-xs font-semibold"
                          style={{ color: crStatus === 'scheduled' ? 'var(--orange)' : 'var(--text-secondary)' }}>
                          🕐 {plannedTime}
                        </span>
                      )}
                      {earliestStart && (
                        <>
                          {plannedTime && <span className="text-xs" style={{ color: 'var(--border)' }}>·</span>}
                          <span className="flex items-center gap-1 text-xs font-semibold"
                            style={{ color: '#22c55e' }}>
                            ▶ {earliestStart}
                          </span>
                        </>
                      )}
                      {latestEnd && (
                        <>
                          <span className="text-xs" style={{ color: 'var(--border)' }}>·</span>
                          <span className="flex items-center gap-1 text-xs font-semibold"
                            style={{ color: 'var(--text-secondary)' }}>
                            ■ {latestEnd}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Match cards */}
            <div className="flex flex-col gap-3 mb-4">
              {(() => {
                const prevBlocked = rounds.some(r =>
                  r.round < currentRound.round &&
                  r.matches.some(m => m.status === 'live' || m.status === 'scheduled')
                )
                return currentRound.matches.map(match => {
                  const s = states[match.id]
                  if (!s) return null
                  return (
                    <MatchCard key={match.id} match={match} s={s}
                      matchMinutes={tournament?.match_duration_minutes ?? 10}
                      expectedTime={roundTimeMap[match.round ?? 0]}
                      referees={referees}
                      canStart={!prevBlocked}
                      onUpd={p => upd(match.id, p)}
                      onSaveScore={() => saveScore(match)}
                      onSave={status => saveMatch(match, status)}
                      onAssignRef={refId => assignReferee(match.id, refId)}
                    />
                  )
                })
              })()}
            </div>

            {/* ── BIG round action button ── */}
            {crScheduled.length > 0 && (() => {
              // Blokkeer starten als een vorige ronde nog live of gepland is
              const blockedBy = rounds.find(r =>
                r.round < currentRound.round &&
                r.matches.some(m => m.status === 'live' || m.status === 'scheduled')
              )
              return blockedBy ? (
                <div className="w-full rounded-2xl text-center py-4 px-5"
                  style={{ backgroundColor: 'var(--bg-elevated)', border: '2px dashed var(--border)' }}>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
                    ⏳ Wacht — ronde {blockedBy.round} is nog niet afgerond
                  </p>
                </div>
              ) : (
                <button onClick={() => startRound(currentRound.matches)} disabled={roundSaving}
                  className="w-full rounded-2xl font-bold cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform"
                  style={{ padding: '18px 24px', backgroundColor: 'var(--orange)', color: '#fff', fontSize: '17px' }}>
                  {roundSaving ? 'Starten…' : `▶  Start${getRoundPillLabel(currentRound.matches) ? ` ${KO_LABEL[currentRound.matches[0]?.phase] ?? 'ronde'}` : ` ronde ${currentRound.round}`}  ·  ${crScheduled.length} veld${crScheduled.length !== 1 ? 'en' : ''}`}
                </button>
              )
            })()}
            {crLive.length > 0 && (
              <button onClick={() => stopRound(currentRound.round, currentRound.matches)} disabled={roundSaving}
                className="w-full rounded-2xl font-bold cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-transform mt-2"
                style={{ padding: '18px 24px', backgroundColor: '#ef4444', color: '#fff', fontSize: '17px' }}>
                {roundSaving ? 'Stoppen…' : `■  Sluit af  ·  ${crLive.length} live`}
              </button>
            )}
            {crStatus === 'finished' && (
              <p className="text-center text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>
                {showGenerateButton
                  ? '👆 Druk op de gele knop hierboven om de volgende ronde aan te maken'
                  : selectedRound !== rounds[rounds.length - 1]?.round
                  ? 'Ronde klaar — selecteer de volgende ronde hierboven ↑'
                  : '🏆 Toernooi afgerond!'}
              </p>
            )}
          </>}
        </>}
      </main>
    </div>
  )
}
