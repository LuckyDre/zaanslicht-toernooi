'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { generateRoundRobin } from '@/lib/schedule'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'

const TEAM_COLORS = [
  '#FF6B00', '#3B82F6', '#22c55e', '#ef4444', '#a855f7',
  '#06b6d4', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1',
  '#84cc16', '#f97316', '#0ea5e9', '#8b5cf6', '#10b981',
  '#F5E642',
]

export default function NewTournamentPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1: Tournament settings
  const [name, setName] = useState('')
  const [numFields, setNumFields] = useState(2)
  const [numTeams, setNumTeams] = useState(8)
  const [matchMinutes, setMatchMinutes] = useState(10)
  const [numHalves, setNumHalves] = useState<1 | 2>(1)
  const [totalMinutes, setTotalMinutes] = useState('')
  const [finalsType, setFinalsType] = useState<'none' | 'final' | 'semi_final' | 'quarter_final'>('final')

  // Step 2: Team names
  const [teamNames, setTeamNames] = useState<string[]>([])

  const handleStep1 = () => {
    if (!name.trim()) return
    setTeamNames(Array.from({ length: numTeams }, (_, i) => `Team ${i + 1}`))
    setStep(2)
  }

  const handleCreate = async () => {
    setLoading(true)
    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now()

      // Create tournament
      const { data: tournament, error: tErr } = await supabase
        .from('tournaments')
        .insert({
          name: name.trim(),
          slug,
          num_fields: numFields,
          num_teams: numTeams,
          match_duration_minutes: matchMinutes * (numHalves === 2 ? 2 : 1),
          num_halves: numHalves,
          total_duration_minutes: totalMinutes ? parseInt(totalMinutes) : null,
          finals_type: finalsType,
          status: 'draft',
        })
        .select()
        .single()

      if (tErr || !tournament) throw tErr

      // Create fields
      const fieldData = Array.from({ length: numFields }, (_, i) => ({
        tournament_id: tournament.id,
        name: `Veld ${i + 1}`,
        display_order: i,
      }))
      const { data: fields } = await supabase.from('fields').insert(fieldData).select()

      // Create teams
      const teamData = teamNames.map((n, i) => ({
        tournament_id: tournament.id,
        name: n.trim() || `Team ${i + 1}`,
        color: TEAM_COLORS[i % TEAM_COLORS.length],
      }))
      const { data: teams } = await supabase.from('teams').insert(teamData).select()

      if (!teams || !fields) throw new Error('Teams of velden aanmaken mislukt')

      // Initialize standings
      await supabase.from('standings').insert(
        teams.map(team => ({
          tournament_id: tournament.id,
          team_id: team.id,
          played: 0, won: 0, drawn: 0, lost: 0,
          goals_for: 0, goals_against: 0, points: 0,
        }))
      )

      // Generate schedule
      const slots = generateRoundRobin(numTeams, numFields)
      const matchData = slots.map(slot => ({
        tournament_id: tournament.id,
        field_id: fields[slot.fieldIndex]?.id ?? null,
        home_team_id: teams[slot.homeTeamIndex].id,
        away_team_id: teams[slot.awayTeamIndex].id,
        round: slot.round,
        match_number: slot.matchNumber,
        phase: 'group' as const,
        status: 'scheduled' as const,
      }))

      await supabase.from('matches').insert(matchData)

      router.push('/admin')
    } catch (err) {
      console.error(err)
      alert('Er ging iets mis. Probeer opnieuw.')
      setLoading(false)
    }
  }

  const matchesCount = (numTeams * (numTeams - 1)) / 2
  const roundsCount = numTeams % 2 === 0 ? numTeams - 1 : numTeams
  const estMinutes = roundsCount * matchMinutes * numHalves

  const finalsOptions = [
    { value: 'none' as const, label: 'Geen finale', desc: 'Alleen poulefase' },
    { value: 'final' as const, label: 'Finale', desc: 'Top 2 spelen een finale' },
    { value: 'semi_final' as const, label: 'Halve finales + finale', desc: 'Top 4 spelen knock-out' },
    { value: 'quarter_final' as const, label: 'Kwart- + halve finales + finale', desc: 'Top 8 spelen knock-out' },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />

      <main className="max-w-xl mx-auto px-4 py-6">
        <Link href="/admin" className="text-sm mb-4 inline-block hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
          ← Terug
        </Link>
        <h1 className="text-2xl font-bold mb-6">Nieuw toernooi</h1>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  backgroundColor: step >= s ? 'var(--orange)' : 'var(--bg-elevated)',
                  color: step >= s ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {s}
              </div>
              <span className="text-sm" style={{ color: step === s ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {s === 1 ? 'Instellingen' : 'Teams'}
              </span>
              {s < 2 && <span style={{ color: 'var(--border)' }}>›</span>}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-5">
            <Card>
              <h2 className="font-semibold mb-4">Toernooi details</h2>
              <div className="flex flex-col gap-4">
                <Input
                  label="Naam van het toernooi"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="bijv. Zaans Licht Cup 2025"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Aantal velden
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setNumFields(Math.max(1, numFields - 1))}
                        className="w-9 h-9 rounded-lg text-lg font-bold cursor-pointer transition-colors"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >−</button>
                      <span className="text-xl font-bold w-6 text-center">{numFields}</span>
                      <button
                        onClick={() => setNumFields(Math.min(10, numFields + 1))}
                        className="w-9 h-9 rounded-lg text-lg font-bold cursor-pointer transition-colors"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >+</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Aantal teams
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setNumTeams(Math.max(2, numTeams - 1))}
                        className="w-9 h-9 rounded-lg text-lg font-bold cursor-pointer transition-colors"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >−</button>
                      <span className="text-xl font-bold w-6 text-center">{numTeams}</span>
                      <button
                        onClick={() => setNumTeams(Math.min(32, numTeams + 1))}
                        className="w-9 h-9 rounded-lg text-lg font-bold cursor-pointer transition-colors"
                        style={{ backgroundColor: 'var(--bg-elevated)' }}
                      >+</button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold mb-4">Wedstrijd instellingen</h2>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Speeltijd per helft (minuten)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setMatchMinutes(Math.max(1, matchMinutes - 1))}
                      className="w-9 h-9 rounded-lg text-lg font-bold cursor-pointer"
                      style={{ backgroundColor: 'var(--bg-elevated)' }}
                    >−</button>
                    <span className="text-xl font-bold w-8 text-center">{matchMinutes}</span>
                    <button
                      onClick={() => setMatchMinutes(Math.min(90, matchMinutes + 1))}
                      className="w-9 h-9 rounded-lg text-lg font-bold cursor-pointer"
                      style={{ backgroundColor: 'var(--bg-elevated)' }}
                    >+</button>
                  </div>
                </div>

                <div className="flex gap-3">
                  {([1, 2] as const).map(h => (
                    <button
                      key={h}
                      onClick={() => setNumHalves(h)}
                      className="flex-1 py-3 rounded-lg font-medium cursor-pointer transition-all text-sm"
                      style={{
                        backgroundColor: numHalves === h ? 'var(--orange)' : 'var(--bg-elevated)',
                        color: numHalves === h ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {h} helft{h === 2 ? 'en' : ''}
                    </button>
                  ))}
                </div>

                <Input
                  label="Totale toernooiduur (optioneel, in minuten)"
                  type="number"
                  value={totalMinutes}
                  onChange={e => setTotalMinutes(e.target.value)}
                  placeholder={`Schatting: ~${estMinutes} min`}
                  min="1"
                />
              </div>
            </Card>

            <Card>
              <h2 className="font-semibold mb-4">Finale systeem</h2>
              <div className="flex flex-col gap-2">
                {finalsOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setFinalsType(opt.value)}
                    className="flex items-center justify-between p-3 rounded-lg cursor-pointer text-left transition-all"
                    style={{
                      backgroundColor: finalsType === opt.value ? '#FF6B0022' : 'var(--bg-elevated)',
                      border: `1px solid ${finalsType === opt.value ? 'var(--orange)' : 'transparent'}`,
                    }}
                  >
                    <div>
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</div>
                    </div>
                    <div
                      className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                      style={{
                        borderColor: finalsType === opt.value ? 'var(--orange)' : 'var(--border)',
                        backgroundColor: finalsType === opt.value ? 'var(--orange)' : 'transparent',
                      }}
                    />
                  </button>
                ))}
              </div>
            </Card>

            {/* Summary */}
            <div
              className="p-3 rounded-xl text-sm"
              style={{ backgroundColor: '#FF6B0011', border: '1px solid #FF6B0033' }}
            >
              <p style={{ color: 'var(--orange)' }} className="font-semibold mb-1">Samenvatting</p>
              <p style={{ color: 'var(--text-secondary)' }}>
                {matchesCount} wedstrijden · {roundsCount} rondes · {numFields} veld{numFields > 1 ? 'en' : ''} · ca. {estMinutes} min totaal
              </p>
            </div>

            <Button onClick={handleStep1} disabled={!name.trim()}>
              Volgende: Teams instellen →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <Card>
              <h2 className="font-semibold mb-4">Teamnamen ({numTeams} teams)</h2>
              <div className="flex flex-col gap-3">
                {teamNames.map((n, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: TEAM_COLORS[i % TEAM_COLORS.length] }}
                    />
                    <input
                      value={n}
                      onChange={e => {
                        const next = [...teamNames]
                        next[i] = e.target.value
                        setTeamNames(next)
                      }}
                      className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      placeholder={`Team ${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>
                ← Terug
              </Button>
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
