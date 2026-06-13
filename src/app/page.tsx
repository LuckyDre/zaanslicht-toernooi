'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, Tournament } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const statusLabel   = { draft: 'Concept', active: 'Actief', finished: 'Afgelopen' }
const statusVariant = { draft: 'gray', active: 'green', finished: 'orange' } as const

export default function HomePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading]         = useState(true)

  // Contact form
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [club,     setClub]     = useState('')
  const [message,  setMessage]  = useState('')
  const [sending,  setSending]  = useState(false)
  const [result,   setResult]   = useState<'success' | 'duplicate' | 'error' | null>(null)

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('*')
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setTournaments(data ?? []); setLoading(false) })
  }, [])

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setSending(true); setResult(null)

    // Controleer op dubbele aanvraag voor dit e-mailadres
    const { data: existing } = await supabase
      .from('access_requests')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      setResult('duplicate')
      setSending(false)
      return
    }

    const { error } = await supabase.from('access_requests').insert({
      name:    name.trim(),
      email:   email.trim().toLowerCase(),
      club:    club.trim() || null,
      message: message.trim() || null,
    })

    setResult(error ? 'error' : 'success')
    if (!error) { setName(''); setEmail(''); setClub(''); setMessage('') }
    setSending(false)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ── Hero ── */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-3xl font-bold mb-2">
            Zaans Licht <span style={{ color: 'var(--orange)' }}>Toernooi</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Bekijk live standen, uitslagen en jouw favoriete teams
          </p>
        </div>

        {/* ── Toernooilijst ── */}
        <h2 className="text-lg font-semibold mb-4">Toernooien</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
          </div>
        ) : tournaments.length === 0 ? (
          <Card className="text-center py-10">
            <p style={{ color: 'var(--text-secondary)' }}>Nog geen toernooien beschikbaar</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {tournaments.map(t => (
              <Link key={t.id} href={`/tournament/${t.id}`}>
                <Card className="cursor-pointer transition-all">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{t.name}</h3>
                        <Badge variant={statusVariant[t.status]}>{statusLabel[t.status]}</Badge>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {t.num_teams} teams · {t.num_fields} veld{t.num_fields > 1 ? 'en' : ''} · {t.match_duration_minutes} min{t.num_halves === 2 ? ' (2 helften)' : ''}
                      </p>
                    </div>
                    <span className="text-xl flex-shrink-0" style={{ color: 'var(--orange)' }}>›</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* ── Toegang aanvragen ── */}
        <div className="mt-14">
          {/* Scheidingslijn met label */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              Toegang aanvragen
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
          </div>

          <div className="rounded-3xl overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>

            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">🏆</span>
                <h2 className="text-lg font-bold">Wil je ook een toernooi beheren?</h2>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Zaans Licht Toernooi is momenteel in bèta. Vraag hier gratis toegang aan —
                je ontvangt een uitnodigingslink waarmee je direct aan de slag kunt.
              </p>
              {/* Bèta-badge */}
              <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: 'var(--orange)20', border: '1px solid var(--orange)60', color: 'var(--orange)' }}>
                ⏱ Bèta · toegang voor 30 dagen
              </div>
            </div>

            <div className="h-px mx-6" style={{ backgroundColor: 'var(--border)' }} />

            {/* Formulier of bevestiging */}
            <div className="px-6 py-5">
              {result === 'success' ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-3">✅</div>
                  <h3 className="font-bold mb-1">Aanvraag ontvangen!</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Je ontvangt een uitnodigingslink zodra je aanvraag is goedgekeurd.
                    Houd je inbox in de gaten.
                  </p>
                  <button
                    onClick={() => setResult(null)}
                    className="mt-4 text-sm underline cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}>
                    Nieuwe aanvraag indienen
                  </button>
                </div>
              ) : (
                <form onSubmit={submitRequest} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Naam *"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Jouw naam"
                      required
                    />
                    <Input
                      label="E-mailadres *"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="naam@club.nl"
                      required
                    />
                  </div>
                  <Input
                    label="Voetbalclub / vereniging"
                    value={club}
                    onChange={e => setClub(e.target.value)}
                    placeholder="bijv. VV Zaandam"
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Bericht (optioneel)
                    </label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="Vertel kort wat voor toernooi je wilt organiseren…"
                      rows={3}
                      className="w-full rounded-2xl px-4 py-3 text-sm resize-none outline-none"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1.5px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  {result === 'duplicate' && (
                    <p className="text-sm rounded-xl px-4 py-2.5"
                      style={{ backgroundColor: '#f59e0b15', border: '1px solid #f59e0b40', color: '#f59e0b' }}>
                      ⚠️ Er is al een openstaande aanvraag voor dit e-mailadres. Je hoort zo snel mogelijk van ons.
                    </p>
                  )}
                  {result === 'error' && (
                    <p className="text-sm rounded-xl px-4 py-2.5"
                      style={{ backgroundColor: '#ef444415', border: '1px solid #ef444440', color: '#ef4444' }}>
                      Er ging iets mis. Probeer het opnieuw of stuur een e-mail naar het toernooicomité.
                    </p>
                  )}

                  <Button type="submit" loading={sending} disabled={!name.trim() || !email.trim()}>
                    Aanvraag versturen →
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
