'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { generateSchedule, previewSchedule } from '@/lib/schedule'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

// ── Advies engine ─────────────────────────────────────────────────────────────
function getAdvice(numTeams: number, numFields: number, matchMinutes: number, numHalves: 1 | 2, breakMinutes: number) {
  // Zoek de beste poule-indeling (1–4 poules)
  // Scoreer elke optie: poules van 4 teams = ideaal, gelijke grootte = bonus
  let suggestedPools = 1
  let bestScore = -Infinity
  for (let p = 1; p <= Math.min(4, numTeams); p++) {
    if (numTeams < p * 2) break // minimaal 2 teams per poule
    const avg = numTeams / p
    const sizes = Array.from({ length: p }, (_, i) =>
      Math.floor(numTeams / p) + (i < numTeams % p ? 1 : 0)
    )
    const isEqual = sizes.every(s => s === sizes[0])
    const score = -Math.abs(avg - 4) * 3 + (isEqual ? 4 : 0) + (p > 1 ? 1 : 0)
    if (score > bestScore) { bestScore = score; suggestedPools = p }
  }

  const poolSizes = Array.from({ length: suggestedPools }, (_, i) =>
    Math.floor(numTeams / suggestedPools) + (i < numTeams % suggestedPools ? 1 : 0)
  )
  const isEqual   = poolSizes.every(s => s === poolSizes[0])
  const avgSize   = numTeams / suggestedPools
  const minSize   = Math.min(...poolSizes)

  const items: { icon: string; text: string; warn: boolean }[] = []

  // ── Poule-grootte ──────────────────────────────────────────────────────────
  if (isEqual && avgSize === 4) {
    items.push({ icon: '✅', text: `${suggestedPools} ${suggestedPools === 1 ? 'poule' : 'poules'} van 4 teams — ideaal: elk team speelt 3 groepswedstrijden`, warn: false })
  } else if (isEqual && avgSize >= 3 && avgSize <= 5) {
    items.push({ icon: '✅', text: `${suggestedPools} ${suggestedPools === 1 ? 'poule' : 'poules'} van ${Math.round(avgSize)} teams — goed werkbaar`, warn: false })
  } else if (minSize < 3) {
    items.push({ icon: '⚠️', text: `Te weinig teams per poule (${poolSizes.join(' + ')}) — elke poule heeft minimaal 3 teams nodig`, warn: true })
  } else {
    const nearest = [suggestedPools * 3, suggestedPools * 4, suggestedPools * 5].find(n => n >= numTeams - 2)
    items.push({ icon: '⚠️', text: `Ongelijke poules (${poolSizes.join(' + ')} teams) — kies ${nearest ?? suggestedPools * 4} teams voor gelijke poules`, warn: true })
  }

  // ── Velden vs poules ───────────────────────────────────────────────────────
  if (suggestedPools > 1) {
    if (numFields >= suggestedPools) {
      items.push({ icon: '✅', text: `${numFields} velden, ${suggestedPools} poules — alle poules spelen tegelijk, geen wachttijd`, warn: false })
    } else {
      items.push({ icon: 'ℹ️', text: `${numFields} veld${numFields > 1 ? 'en' : ''} voor ${suggestedPools} poules — poules wisselen van veld, rondes duren iets langer`, warn: false })
    }
  } else if (numFields > 1) {
    items.push({ icon: 'ℹ️', text: `${numFields} velden, 1 poule — alle velden draaien tegelijk, rondes gaan snel`, warn: false })
  }

  // ── Finale-advies ──────────────────────────────────────────────────────────
  let suggestedFinale: 'none' | 'final' | 'semi_final' | 'quarter_final'
  let finaleText: string
  if (numTeams < 4) {
    suggestedFinale = 'none'
    finaleText = 'geen finale (te weinig teams)'
  } else if (numTeams >= 16 && suggestedPools >= 4) {
    suggestedFinale = 'quarter_final'
    finaleText = 'kwartfinales → halve finales → finale (8 teams)'
  } else {
    suggestedFinale = 'semi_final'
    finaleText = suggestedPools > 1
      ? `halve finales → finale (top 1 per poule + beste runner-up = 4 teams)`
      : `halve finales → finale (top 4)`
  }
  items.push({ icon: '🏆', text: `Aanbevolen finale: ${finaleText}`, warn: false })

  // ── Tijdschatting ──────────────────────────────────────────────────────────
  const { rounds } = previewSchedule(numTeams, numFields, suggestedPools)
  const FINALE_ROUNDS: Record<string, number> = { none: 0, final: 1, semi_final: 2, quarter_final: 3 }
  const finaleRounds = FINALE_ROUNDS[suggestedFinale] ?? 0
  const totalRounds = rounds + finaleRounds
  const speelMin = totalRounds * matchMinutes * numHalves
  const pauzeMin = Math.max(0, totalRounds - 1) * breakMinutes
  const totalMin = speelMin + pauzeMin
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  const durStr = h > 0 ? `${h} uur${m > 0 ? ` ${m} min` : ''}` : `${m} minuten`
  items.push({ icon: '⏱', text: `Geschatte toernooiduur: ca. ${durStr} (${totalRounds} rondes × ${matchMinutes * numHalves} min + ${totalRounds - 1} pauzes × ${breakMinutes} min)`, warn: false })

  return { suggestedPools, suggestedFinale, items }
}

/** Eredivisie-clubs met hun primaire trikot-kleur (seizoen 2024-2025) */
const EREDIVISIE_TEAMS: { name: string; color: string }[] = [
  { name: 'Ajax',              color: '#D2122E' }, // rood met witte verticale streep
  { name: 'PSV',               color: '#CC2229' }, // rood met witte strepen
  { name: 'Feyenoord',         color: '#C8102E' }, // rood / wit gehalveerd
  { name: 'AZ',                color: '#E50000' }, // rood / wit
  { name: 'FC Twente',         color: '#E4000F' }, // rood / wit
  { name: 'FC Utrecht',        color: '#D01515' }, // rood / wit
  { name: 'Heerenveen',        color: '#1B5091' }, // blauw / witte strepen
  { name: 'Sparta Rotterdam',  color: '#B5121B' }, // rood / wit horizontale strepen
  { name: 'NEC',               color: '#CC0000' }, // rood / zwart
  { name: 'Go Ahead Eagles',   color: '#F5C400' }, // rood / goud
  { name: 'FC Groningen',      color: '#006633' }, // groen / wit
  { name: 'NAC Breda',         color: '#F0B400' }, // geel / zwarte strepen
  { name: 'RKC Waalwijk',      color: '#003DA5' }, // geel / blauw
  { name: 'Almere City',       color: '#0066B3' }, // rood / blauw
  { name: 'PEC Zwolle',        color: '#005CA9' }, // blauw / wit
  { name: 'Willem II',         color: '#8B0000' }, // rood / wit / blauw
  { name: 'Heracles Almelo',   color: '#2C2C2C' }, // zwart / wit
  { name: 'Fortuna Sittard',   color: '#FFD700' }, // geel / groen
]

const TEAM_COLORS = EREDIVISIE_TEAMS.map(t => t.color)

const POOL_COLORS  = ['#FF6B00', '#3B82F6', '#22c55e', '#a855f7']
const POOL_LABELS  = ['A', 'B', 'C', 'D']

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - 1))}
        className="w-9 h-9 rounded-lg text-lg font-bold cursor-pointer"
        style={{ backgroundColor: 'var(--bg-elevated)' }}>−</button>
      <span className="text-xl font-bold w-6 text-center">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))}
        className="w-9 h-9 rounded-lg text-lg font-bold cursor-pointer"
        style={{ backgroundColor: 'var(--bg-elevated)' }}>+</button>
    </div>
  )
}

function ColorDot({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <label className="relative cursor-pointer flex-shrink-0" title="Klik om kleur te wijzigen">
      <span className="w-6 h-6 rounded-full block"
        style={{ backgroundColor: color, boxShadow: '0 0 0 2px rgba(255,255,255,0.18)' }} />
      <input type="color" value={color} onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
    </label>
  )
}

export default function NewTournamentPage() {
  const router = useRouter()
  const [step, setStep]       = useState(1)
  const [loading, setLoading] = useState(false)

  // ── Step 1 settings ──────────────────────────────────────────────────────
  const [name, setName]             = useState('')
  const [numFields, setNumFields]   = useState(2)
  const [numTeams, setNumTeams]     = useState(8)
  const [matchMinutes, setMatch]    = useState(25)
  const [numHalves, setHalves]      = useState<1|2>(1)
  const [totalMinutes, setTotal]    = useState('')
  const [finalsType, setFinals]     = useState<'none'|'final'|'semi_final'|'quarter_final'>('final')
  const [breakMinutes, setBreak]    = useState(10)
  const [startTime, setStartTime]   = useState('')
  const [numPools, setNumPools]     = useState(1)

  // ── Step 2: team names, colors + pool assignment ─────────────────────────
  const [teamNames, setTeamNames]   = useState<string[]>([])
  const [teamColors, setTeamColors] = useState<string[]>([])
  const [teamPools, setTeamPools]   = useState<number[]>([]) // 1-indexed pool per team
  const [poolNames, setPoolNames]   = useState(['Poule A', 'Poule B', 'Poule C', 'Poule D'])

  // ── Preview calculations (live, no side-effects) ─────────────────────────
  const preview = useMemo(() => previewSchedule(numTeams, numFields, numPools), [numTeams, numFields, numPools])
  const advice  = useMemo(() => getAdvice(numTeams, numFields, matchMinutes, numHalves, breakMinutes), [numTeams, numFields, matchMinutes, numHalves, breakMinutes])

  // Go to step 2: initialise team names, colors + evenly distribute pools
  const handleStep1 = () => {
    if (!name.trim()) return
    setTeamNames(Array.from({ length: numTeams }, (_, i) => EREDIVISIE_TEAMS[i]?.name ?? `Team ${i + 1}`))
    setTeamColors(Array.from({ length: numTeams }, (_, i) => EREDIVISIE_TEAMS[i]?.color ?? TEAM_COLORS[i % TEAM_COLORS.length]))
    setTeamPools(Array.from({ length: numTeams }, (_, i) => Math.floor(i * numPools / numTeams) + 1))
    setStep(2)
  }

  const cyclePool = (teamIdx: number) =>
    setTeamPools(prev => { const n=[...prev]; n[teamIdx]=(n[teamIdx]%numPools)+1; return n })

  // ── Create tournament ─────────────────────────────────────────────────────
  const handleCreate = async () => {
    setLoading(true)
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '-' + Date.now()

      const tournamentBase = {
        name: name.trim(), slug,
        num_fields: numFields,
        num_teams:  numTeams,
        match_duration_minutes: matchMinutes * (numHalves === 2 ? 2 : 1),
        num_halves: numHalves,
        total_duration_minutes: totalMinutes ? parseInt(totalMinutes) : null,
        finals_type: finalsType,
        num_pools: numPools,
        break_minutes: breakMinutes,
        starts_at: startTime
          ? new Date(`${new Date().toDateString()} ${startTime}`).toISOString()
          : null,
        status: 'draft' as const,
      }

      // Try with pool_names; fall back gracefully if the column doesn't exist yet
      let { data: tournament, error: tErr } = await supabase
        .from('tournaments').insert({
          ...tournamentBase,
          pool_names: numPools > 1 ? poolNames.slice(0, numPools) : null,
        }).select().single()

      // PostgreSQL error 42703 = undefined_column → migration not yet run → retry without it
      if (tErr?.code === '42703') {
        ;({ data: tournament, error: tErr } = await supabase
          .from('tournaments').insert(tournamentBase).select().single())
      }

      if (tErr || !tournament) throw tErr

      // Fields
      const { data: fields } = await supabase.from('fields')
        .insert(Array.from({ length: numFields }, (_, i) => ({
          tournament_id: tournament.id, name: `Veld ${i+1}`, display_order: i,
        }))).select()

      // Teams (with pool + chosen color)
      const { data: teams } = await supabase.from('teams')
        .insert(teamNames.map((n, i) => ({
          tournament_id: tournament.id,
          name: n.trim() || `Team ${i+1}`,
          color: teamColors[i] ?? TEAM_COLORS[i % TEAM_COLORS.length],
          pool: teamPools[i] ?? 1,
        }))).select()

      if (!teams || !fields) throw new Error('Teams of velden aanmaken mislukt')

      // Standings (with pool)
      await supabase.from('standings').insert(
        teams.map((team, i) => ({
          tournament_id: tournament.id,
          team_id: team.id,
          pool: teamPools[i] ?? 1,
          played:0, won:0, drawn:0, lost:0, goals_for:0, goals_against:0, points:0,
        }))
      )

      // Schedule: group teams by pool, generate intra-pool matches
      const teamsByPool = Array.from({ length: numPools }, (_, p) =>
        teams.map((_, idx) => idx).filter(idx => (teamPools[idx] ?? 1) === p + 1)
      )
      const slots = generateSchedule(numFields, teamsByPool)
      await supabase.from('matches').insert(
        slots.map(slot => ({
          tournament_id: tournament.id,
          field_id:      fields[slot.fieldIndex]?.id ?? null,
          home_team_id:  teams[slot.homeTeamIndex].id,
          away_team_id:  teams[slot.awayTeamIndex].id,
          round:         slot.round,
          match_number:  slot.matchNumber,
          phase:         'group' as const,
          status:        'scheduled' as const,
        }))
      )

      router.push('/admin')
    } catch (err) {
      console.error(err)
      alert('Er ging iets mis. Probeer opnieuw.')
      setLoading(false)
    }
  }

  const finalsOptions = [
    { value: 'none'          as const, label: 'Geen finale',                    desc: 'Alleen groepsfase' },
    { value: 'final'         as const, label: 'Finale',                         desc: 'Top 2 spelen een finale' },
    { value: 'semi_final'    as const, label: 'Halve finales + finale',          desc: 'Top 4 spelen knock-out' },
    { value: 'quarter_final' as const, label: 'Kwart- + halve finales + finale', desc: 'Top 8 spelen knock-out' },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />
      <main className="max-w-xl mx-auto px-4 py-6">
        <Link href="/admin" className="text-sm mb-4 inline-block hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}>← Terug</Link>
        <h1 className="text-2xl font-bold mb-6">Nieuw toernooi</h1>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8">
          {[1,2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: step>=s ? 'var(--orange)' : 'var(--bg-elevated)', color: step>=s ? '#fff' : 'var(--text-secondary)' }}>
                {s}
              </div>
              <span className="text-sm" style={{ color: step===s ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {s===1 ? 'Instellingen' : 'Teams & Poules'}
              </span>
              {s<2 && <span style={{ color: 'var(--border)' }}>›</span>}
            </div>
          ))}
        </div>

        {/* ── STEP 1 ─────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-5">

            {/* Toernooi details */}
            <Card>
              <h2 className="font-semibold mb-4">Toernooi details</h2>
              <div className="flex flex-col gap-4">
                <Input label="Naam van het toernooi" value={name}
                  onChange={e => setName(e.target.value)} placeholder="bijv. Zaans Licht Cup 2025" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Aantal velden</label>
                    <Stepper value={numFields} min={1} max={10} onChange={setNumFields} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Aantal teams</label>
                    <Stepper value={numTeams} min={2} max={32} onChange={setNumTeams} />
                  </div>
                </div>
              </div>
            </Card>

            {/* ── Advies box ── */}
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#0ea5e915', border: '1.5px solid #0ea5e950' }}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-bold text-sm" style={{ color: '#0ea5e9' }}>💡 Advies voor jouw toernooi</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Niet bindend — je kunt alles zelf aanpassen</p>
                </div>
                <button
                  onClick={() => { setNumPools(advice.suggestedPools); setFinals(advice.suggestedFinale) }}
                  className="text-xs font-bold px-3 py-2 rounded-xl cursor-pointer flex-shrink-0 transition-opacity hover:opacity-80 active:scale-95"
                  style={{ backgroundColor: '#0ea5e925', color: '#0ea5e9', border: '1px solid #0ea5e960' }}>
                  Toepassen →
                </button>
              </div>
              <div className="flex flex-col gap-2.5">
                {advice.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0 leading-5">{item.icon}</span>
                    <span className="text-sm leading-5" style={{ color: item.warn ? '#f59e0b' : 'var(--text-primary)' }}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Poule-indeling */}
            <Card>
              <h2 className="font-semibold mb-1">Poule-indeling</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                Teams spelen alleen tegen teams in dezelfde poule
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { n: 1, label: 'Geen poules',     desc: 'Iedereen speelt tegen iedereen' },
                  { n: 2, label: '2 poules',         desc: '' },
                  { n: 3, label: '3 poules',         desc: '' },
                  { n: 4, label: '4 poules',         desc: '' },
                ].map(opt => {
                  const pv = previewSchedule(numTeams, numFields, opt.n)
                  const sizes = pv.poolSizes
                  const sizeStr = [...new Set(sizes)].length === 1
                    ? `${sizes[0]} teams per poule`
                    : sizes.map((s,i)=>`Poule ${POOL_LABELS[i]}: ${s}`).join(', ')
                  return (
                    <button key={opt.n} onClick={() => setNumPools(opt.n)}
                      className="p-3 rounded-xl text-left cursor-pointer transition-all"
                      style={{
                        backgroundColor: numPools===opt.n ? '#FF6B0022' : 'var(--bg-elevated)',
                        border: `1.5px solid ${numPools===opt.n ? 'var(--orange)' : 'transparent'}`,
                      }}>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {opt.n === 1 ? opt.desc : sizeStr}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Pool preview boxes */}
              {numPools > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {preview.poolSizes.map((size, p) => (
                    <div key={p} className="flex-1 min-w-0 rounded-lg px-3 py-2 text-xs"
                      style={{ backgroundColor: `${POOL_COLORS[p]}18`, border: `1px solid ${POOL_COLORS[p]}40`, color: POOL_COLORS[p] }}>
                      <div className="font-bold">Poule {POOL_LABELS[p]}</div>
                      <div className="font-normal mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {size} teams
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Wedstrijd instellingen */}
            <Card>
              <h2 className="font-semibold mb-4">Wedstrijd instellingen</h2>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Speeltijd per helft (minuten)
                  </label>
                  <Stepper value={matchMinutes} min={1} max={90} onChange={setMatch} />
                </div>
                <div className="flex gap-3">
                  {([1,2] as const).map(h => (
                    <button key={h} onClick={() => setHalves(h)}
                      className="flex-1 py-3 rounded-lg font-medium cursor-pointer transition-all text-sm"
                      style={{ backgroundColor: numHalves===h ? 'var(--orange)' : 'var(--bg-elevated)', color: numHalves===h ? '#fff' : 'var(--text-secondary)' }}>
                      {h} helft{h===2?'en':''}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Pauze tussen rondes (minuten)</label>
                  <Stepper value={breakMinutes} min={0} max={60} onChange={setBreak} />
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Wisseltijd / rust tussen rondes — standaard 10 min</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Starttijd toernooi (optioneel)</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    className="w-36 rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Wordt gebruikt voor het tijdschema per ronde</p>
                </div>
              </div>
            </Card>

            {/* Finale systeem */}
            <Card>
              <h2 className="font-semibold mb-4">Finale systeem</h2>
              <div className="flex flex-col gap-2">
                {finalsOptions.map(opt => (
                  <button key={opt.value} onClick={() => setFinals(opt.value)}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer text-left transition-all"
                    style={{
                      backgroundColor: finalsType===opt.value ? '#FF6B0022' : 'var(--bg-elevated)',
                      border: `1px solid ${finalsType===opt.value ? 'var(--orange)' : 'transparent'}`,
                    }}>
                    <div>
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</div>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: finalsType===opt.value ? 'var(--orange)' : 'var(--border)', backgroundColor: finalsType===opt.value ? 'var(--orange)' : 'transparent' }} />
                  </button>
                ))}
              </div>
            </Card>

            {/* Samenvatting */}
            <div className="p-3 rounded-xl text-sm"
              style={{ backgroundColor: '#FF6B0011', border: '1px solid #FF6B0033' }}>
              <p className="font-semibold mb-1" style={{ color: 'var(--orange)' }}>Samenvatting</p>
              <p style={{ color: 'var(--text-secondary)' }}>
                {numPools > 1
                  ? `${numPools} poules · ${preview.matches} groepswedstrijden · ${preview.rounds} rondes · ${numFields} veld${numFields>1?'en':''}`
                  : `${preview.matches} wedstrijden · ${preview.rounds} rondes · ${numFields} veld${numFields>1?'en':''}`}
                {' · '}ca. {preview.rounds * matchMinutes * numHalves} min
              </p>
            </div>

            <Button onClick={handleStep1} disabled={!name.trim()}>
              Volgende: Teams &amp; Poules →
            </Button>
          </div>
        )}

        {/* ── STEP 2 ─────────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-5">

            {numPools === 1 ? (
              // Single pool: plain list
              <Card>
                <h2 className="font-semibold mb-4">Teamnamen ({numTeams} teams)</h2>
                <div className="flex flex-col gap-3">
                  {teamNames.map((n, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <ColorDot
                        color={teamColors[i] ?? TEAM_COLORS[i % TEAM_COLORS.length]}
                        onChange={c => { const next=[...teamColors]; next[i]=c; setTeamColors(next) }} />
                      <input value={n}
                        onChange={e => { const next=[...teamNames]; next[i]=e.target.value; setTeamNames(next) }}
                        className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ backgroundColor:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-primary)' }}
                        placeholder={`Team ${i+1}`} />
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              // Multiple pools: grouped by pool
              <>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Klik op de poule-badge om een team te verplaatsen
                </p>
                {Array.from({ length: numPools }, (_, p) => {
                  const poolColor = POOL_COLORS[p]
                  const teamsInPool = teamNames.map((_, i) => i).filter(i => teamPools[i] === p + 1)
                  const nextPoolLabel = poolNames[(p + 1) % numPools] ?? POOL_LABELS[(p + 1) % numPools]

                  return (
                    <div key={p} className="rounded-2xl overflow-hidden"
                      style={{ border: `1.5px solid ${poolColor}50` }}>
                      {/* Editable pool header */}
                      <div className="px-4 py-2.5 flex items-center justify-between"
                        style={{ backgroundColor: `${poolColor}18` }}>
                        <input
                          value={poolNames[p] ?? ''}
                          onChange={e => { const next=[...poolNames]; next[p]=e.target.value; setPoolNames(next) }}
                          className="font-bold text-sm bg-transparent outline-none min-w-0"
                          style={{ color: poolColor }}
                          placeholder={`Poule ${POOL_LABELS[p]}`} />
                        <span className="text-xs flex-shrink-0 ml-2" style={{ color: 'var(--text-secondary)' }}>
                          {teamsInPool.length} teams
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 p-3">
                        {teamsInPool.length === 0 && (
                          <p className="text-xs text-center py-2" style={{ color: 'var(--text-secondary)' }}>
                            Geen teams — verplaats er een vanuit een andere poule
                          </p>
                        )}
                        {teamsInPool.map(i => (
                          <div key={i} className="flex items-center gap-2">
                            <ColorDot
                              color={teamColors[i] ?? TEAM_COLORS[i % TEAM_COLORS.length]}
                              onChange={c => { const next=[...teamColors]; next[i]=c; setTeamColors(next) }} />
                            <input value={teamNames[i]}
                              onChange={e => { const next=[...teamNames]; next[i]=e.target.value; setTeamNames(next) }}
                              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                              style={{ backgroundColor:'var(--bg-elevated)', border:'1px solid var(--border)', color:'var(--text-primary)' }}
                              placeholder={`Team ${i+1}`} />
                            <button onClick={() => cyclePool(i)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap"
                              style={{ backgroundColor: `${poolColor}20`, color: poolColor, border: `1px solid ${poolColor}40` }}
                              title={`Verplaats naar ${nextPoolLabel}`}>
                              → {nextPoolLabel.split(' ').pop()}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>← Terug</Button>
              <Button onClick={handleCreate} loading={loading} className="flex-1">
                Toernooi aanmaken ✓
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
