'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, Tournament } from '@/lib/supabase'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

const statusLabel = { draft: 'Concept', active: 'Actief', finished: 'Afgelopen' }
const statusVariant = { draft: 'gray', active: 'green', finished: 'orange' } as const

export default function AdminPage() {
  const router = useRouter()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/login')
    })
    supabase.from('tournaments').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        setTournaments(data ?? [])
        setLoading(false)
      })
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Toernooi "${name}" verwijderen? Dit kan niet ongedaan worden.`)) return
    setDeleting(id)
    await supabase.from('tournaments').delete().eq('id', id)
    setTournaments(prev => prev.filter(t => t.id !== id))
    setDeleting(null)
  }

  const handleStatusChange = async (id: string, status: Tournament['status']) => {
    await supabase.from('tournaments').update({ status }).eq('id', id)
    setTournaments(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Beheer je toernooien
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/tournament/new">
              <Button>+ Nieuw toernooi</Button>
            </Link>
            <Button variant="ghost" onClick={handleLogout}>Uitloggen</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
          </div>
        ) : tournaments.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-lg mb-2">Nog geen toernooien</p>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Maak je eerste toernooi aan
            </p>
            <Link href="/admin/tournament/new">
              <Button>+ Nieuw toernooi</Button>
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {tournaments.map(t => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-base">{t.name}</h3>
                      <Badge variant={statusVariant[t.status]}>{statusLabel[t.status]}</Badge>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {t.num_teams} teams · {t.num_fields} veld{t.num_fields > 1 ? 'en' : ''} · {t.match_duration_minutes} min
                      {t.num_halves === 2 ? ' (2×)' : ''} · {t.finals_type !== 'none' ? 'Met finale' : 'Geen finale'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Status buttons */}
                    {t.status === 'draft' && (
                      <Button size="sm" variant="secondary" onClick={() => handleStatusChange(t.id, 'active')}>
                        Activeren
                      </Button>
                    )}
                    {t.status === 'active' && (
                      <Button size="sm" variant="secondary" onClick={() => handleStatusChange(t.id, 'finished')}>
                        Afsluiten
                      </Button>
                    )}
                    {t.status === 'finished' && (
                      <Button size="sm" variant="secondary" onClick={() => handleStatusChange(t.id, 'active')}>
                        ↩ Heropenen
                      </Button>
                    )}

                    <Link href={`/admin/tournament/${t.id}/matches`}>
                      <Button size="sm" variant="secondary">Scores invoeren</Button>
                    </Link>
                    <Link href={`/tournament/${t.id}`} target="_blank">
                      <Button size="sm" variant="ghost">Bekijk ↗</Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={deleting === t.id}
                      onClick={() => handleDelete(t.id, t.name)}
                    >
                      Verwijder
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
