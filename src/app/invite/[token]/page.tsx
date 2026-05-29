'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

type InviteInfo = {
  email: string
  name: string | null
  expires_at: string
  used_at: string | null
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()

  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [alreadyUsed, setAlreadyUsed] = useState(false)
  const [expired, setExpired] = useState(false)

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase
      .from('invitations')
      .select('email, name, expires_at, used_at')
      .eq('token', token)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setInvalid(true); setLoading(false); return }
        if (data.used_at) { setAlreadyUsed(true); setLoading(false); return }
        if (new Date(data.expires_at) < new Date()) { setExpired(true); setLoading(false); return }
        setInvite(data)
        setName(data.name ?? '')
        setLoading(false)
      })
  }, [token])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Wachtwoord moet minimaal 8 tekens zijn'); return }
    if (password !== passwordConfirm) { setError('Wachtwoorden komen niet overeen'); return }
    if (!name.trim()) { setError('Vul je naam in'); return }
    if (!invite) return

    setSubmitting(true)

    // 1. Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invite.email,
      password,
    })

    if (authError || !authData.user) {
      setError(authError?.message ?? 'Aanmelden mislukt. Probeer opnieuw.')
      setSubmitting(false)
      return
    }

    // 2. Claim invitation — creates admin_profile via SECURITY DEFINER function
    const { error: claimError } = await supabase.rpc('claim_invitation', {
      p_token: token,
      p_name: name.trim(),
    })

    if (claimError) {
      setError(claimError.message ?? 'Uitnodiging claimen mislukt.')
      setSubmitting(false)
      return
    }

    setDone(true)
    // Auto-redirect after 3 seconds
    setTimeout(() => router.push('/admin'), 3000)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (invalid || alreadyUsed || expired) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">{alreadyUsed ? '🔒' : '❌'}</div>
          <h1 className="text-xl font-bold mb-2">
            {invalid ? 'Ongeldige uitnodiging' : alreadyUsed ? 'Al gebruikt' : 'Uitnodiging verlopen'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {invalid && 'Deze uitnodigingslink bestaat niet.'}
            {alreadyUsed && 'Deze uitnodiging is al eerder gebruikt. Log in via de inlogpagina.'}
            {expired && 'Deze uitnodiging is verlopen. Vraag een nieuwe aan bij de beheerder.'}
          </p>
          {alreadyUsed && (
            <button onClick={() => router.push('/login')}
              className="mt-4 text-sm underline cursor-pointer"
              style={{ color: 'var(--orange)' }}>
              Naar inlogpagina →
            </button>
          )}
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-base)' }}>
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold mb-2">Account aangemaakt!</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Je wordt doorgestuurd naar het admin dashboard…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">⚽</div>
          <h1 className="text-2xl font-bold">Account aanmaken</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Uitnodiging voor <strong>{invite?.email}</strong>
          </p>
        </div>

        <Card>
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <Input
              label="Jouw naam"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="bijv. Jan de Vries"
              required
              autoComplete="name"
            />
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                E-mailadres
              </label>
              <div className="rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                {invite?.email}
              </div>
            </div>
            <Input
              label="Kies een wachtwoord"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimaal 8 tekens"
              required
              autoComplete="new-password"
            />
            <Input
              label="Herhaal wachtwoord"
              type="password"
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
              placeholder="Zelfde wachtwoord"
              required
              autoComplete="new-password"
            />
            {error && (
              <p className="text-sm" style={{ color: 'var(--red)' }}>⚠️ {error}</p>
            )}
            <Button type="submit" loading={submitting} className="w-full mt-2">
              Account aanmaken →
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
