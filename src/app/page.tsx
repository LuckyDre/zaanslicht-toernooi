'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, Tournament } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const statusLabel = { draft: 'Concept', active: 'Actief', finished: 'Afgelopen' }
const statusVariant = { draft: 'gray', active: 'green', finished: 'orange' } as const

export default function HomePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('*')
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTournaments(data ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-10">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-3xl font-bold mb-2">
            Zaans Licht <span style={{ color: 'var(--orange)' }}>Toernooi</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Bekijk live standen, uitslagen en jouw favoriete teams
          </p>
        </div>

        <h2 className="text-lg font-semibold mb-4">Toernooien</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }}
            />
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
      </main>
    </div>
  )
}
