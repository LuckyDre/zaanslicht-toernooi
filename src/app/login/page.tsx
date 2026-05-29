'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getMyAdminProfile, isAccountExpired } from '@/lib/admin'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message || 'Verkeerde e-mail of wachtwoord')
      setLoading(false)
      return
    }

    // Check admin profile — is account active and not expired?
    const profile = await getMyAdminProfile()
    if (!profile) {
      await supabase.auth.signOut()
      setError('Geen admin-profiel gevonden. Neem contact op met de beheerder.')
      setLoading(false)
      return
    }
    if (!profile.is_active) {
      await supabase.auth.signOut()
      setError('Je account is gedeactiveerd. Neem contact op met de beheerder.')
      setLoading(false)
      return
    }
    if (isAccountExpired(profile)) {
      await supabase.auth.signOut()
      setError('Je account is verlopen. Neem contact op met de beheerder.')
      setLoading(false)
      return
    }

    router.push('/admin')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">⚽</div>
          <h1 className="text-2xl font-bold">Admin inloggen</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Zaans Licht Toernooi</p>
        </div>

        <Card>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Input
              label="E-mailadres"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@zaanslicht.com"
              required
              autoComplete="email"
            />
            <Input
              label="Wachtwoord"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            {error && (
              <p className="text-sm text-center" style={{ color: 'var(--red)' }}>{error}</p>
            )}
            <Button type="submit" loading={loading} className="w-full mt-2">
              Inloggen
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
