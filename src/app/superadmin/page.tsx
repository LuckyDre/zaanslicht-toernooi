'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, AdminProfile, Invitation, AccessRequest } from '@/lib/supabase'
import toast, { Toaster } from 'react-hot-toast'
import { FEATURE_FLAGS } from '@/lib/admin'
import { Navbar } from '@/components/ui/Navbar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'

export default function SuperAdminPage() {
  const router = useRouter()
  const [loading,         setLoading]         = useState(true)
  const [myProfile,       setMyProfile]       = useState<AdminProfile | null>(null)
  const [admins,          setAdmins]          = useState<AdminProfile[]>([])
  const [invitations,     setInvitations]     = useState<Invitation[]>([])
  const [accessRequests,  setAccessRequests]  = useState<AccessRequest[]>([])
  const [approvingId,     setApprovingId]     = useState<string | null>(null)
  const [rejectingId,     setRejectingId]     = useState<string | null>(null)
  const [approvedUrl,     setApprovedUrl]     = useState<{ reqId: string; url: string } | null>(null)
  const [copiedReq,       setCopiedReq]       = useState(false)

  // Uitnodiging aanmaken
  const [inviteEmail,  setInviteEmail]  = useState('')
  const [inviteName,   setInviteName]   = useState('')
  const [inviteDays,   setInviteDays]   = useState(7)
  const [inviting,     setInviting]     = useState(false)
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)

  // Admin bewerken
  const [expiryEdit,   setExpiryEdit]   = useState<Record<string, string>>({})
  const [savingExpiry, setSavingExpiry] = useState<string | null>(null)
  const [featureEdit,  setFeatureEdit]  = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const [{ data: a }, { data: i }, { data: r }] = await Promise.all([
      supabase.from('admin_profiles').select('*').order('created_at'),
      supabase.from('invitations').select('*').order('created_at', { ascending: false }),
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
    ])
    setAdmins(a ?? [])
    setInvitations(i ?? [])
    setAccessRequests(r ?? [])
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('admin_profiles').select('*').eq('user_id', user.id).single()
      if (!profile?.is_superadmin) { router.push('/admin'); return }
      setMyProfile(profile)
      await loadData()
      setLoading(false)
    }
    init()
  }, [router, loadData])

  const createInvitation = async () => {
    if (!inviteEmail.trim() || !myProfile) return
    setInviting(true); setNewInviteUrl(null)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + inviteDays)
    const { data, error } = await supabase.from('invitations').insert({
      email:      inviteEmail.trim(),
      name:       inviteName.trim() || null,
      created_by: myProfile.user_id,
      expires_at: expiresAt.toISOString(),
    }).select().single()
    if (!error && data) {
      setNewInviteUrl(`${window.location.origin}/invite/${data.token}`)
      setInviteEmail(''); setInviteName('')
      await loadData()
    }
    setInviting(false)
  }

  const toggleActive = async (adminId: string, current: boolean) => {
    await supabase.from('admin_profiles').update({ is_active: !current }).eq('id', adminId)
    setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, is_active: !current } : a))
  }

  const saveExpiry = async (adminId: string) => {
    const val = expiryEdit[adminId]
    setSavingExpiry(adminId)
    const expires_at = val ? new Date(val).toISOString() : null
    await supabase.from('admin_profiles').update({ expires_at }).eq('id', adminId)
    setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, expires_at } : a))
    setSavingExpiry(null)
    setExpiryEdit(prev => { const n = { ...prev }; delete n[adminId]; return n })
  }

  const clearExpiry = async (adminId: string) => {
    await supabase.from('admin_profiles').update({ expires_at: null }).eq('id', adminId)
    setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, expires_at: null } : a))
    setExpiryEdit(prev => { const n = { ...prev }; delete n[adminId]; return n })
  }

  const toggleFeature = async (adminId: string, key: string, current: boolean) => {
    const admin = admins.find(a => a.id === adminId)
    if (!admin) return
    const features = { ...admin.features, [key]: !current }
    await supabase.from('admin_profiles').update({ features }).eq('id', adminId)
    setAdmins(prev => prev.map(a => a.id === adminId ? { ...a, features } : a))
  }

  const deleteAdmin = async (adminId: string, name: string) => {
    if (!confirm(`Admin "${name}" verwijderen?\nAlle toernooien van deze admin blijven bestaan maar zijn niet meer toegankelijk.`)) return
    await supabase.from('admin_profiles').delete().eq('id', adminId)
    setAdmins(prev => prev.filter(a => a.id !== adminId))
  }

  const deleteInvitation = async (invId: string) => {
    await supabase.from('invitations').delete().eq('id', invId)
    setInvitations(prev => prev.filter(i => i.id !== invId))
  }

  // ── Toegangsaanvragen ─────────────────────────────────────────────────────
  const approveRequest = async (req: AccessRequest) => {
    if (!myProfile) { toast.error('Geen admin-profiel gevonden'); return }
    setApprovingId(req.id)
    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)

      const { data: inv, error: invErr } = await supabase.from('invitations').insert({
        email:      req.email,
        name:       req.name,
        created_by: myProfile.user_id,
        expires_at: expiresAt.toISOString(),
      }).select().single()

      if (invErr) { toast.error(`Uitnodiging mislukt: ${invErr.message}`); return }
      if (!inv)   { toast.error('Geen data terug van uitnodiging'); return }

      const { error: updErr } = await supabase.from('access_requests').update({
        status:      'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: myProfile.id,
      }).eq('id', req.id)

      if (updErr) toast.error(`Status bijwerken mislukt: ${updErr.message}`)

      setAccessRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved' } : r))
      setApprovedUrl({ reqId: req.id, url: `${window.location.origin}/invite/${inv.token}` })
      await loadData()
    } finally {
      setApprovingId(null)
    }
  }

  const rejectRequest = async (req: AccessRequest) => {
    if (!myProfile || !confirm(`Aanvraag van ${req.name} afwijzen?`)) return
    setRejectingId(req.id)
    await supabase.from('access_requests').update({
      status:      'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: myProfile.id,
    }).eq('id', req.id)
    setAccessRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'rejected' } : r))
    setRejectingId(null)
  }

  const copyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  const copyReqUrl = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedReq(true); setTimeout(() => setCopiedReq(false), 2500)
  }

  if (loading) return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar isAdmin />
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--orange)', borderTopColor: 'transparent' }} />
      </div>
    </div>
  )

  const regularAdmins    = admins.filter(a => !a.is_superadmin)
  const pendingInvites   = invitations.filter(i => !i.used_at && new Date(i.expires_at) > new Date())
  const pendingRequests  = accessRequests.filter(r => r.status === 'pending')

  return (
    <div className="min-h-screen pb-10" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Toaster position="top-center" toastOptions={{ style: { background: '#1a1a1a', color: '#fff', border: '1px solid #333' } }} />
      <Navbar isAdmin />
      <main className="max-w-3xl mx-auto px-4 py-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <Link href="/admin" className="text-xs mb-1 inline-block hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}>← Admin dashboard</Link>
            <h1 className="text-2xl font-bold">⚙️ Superadmin</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Beheer admins, toegang en features
            </p>
          </div>
          <div className="flex gap-3 mt-4 flex-wrap">
            {[
              { label: 'Actieve admins', value: regularAdmins.filter(a => a.is_active).length },
              { label: 'Open uitnodigingen', value: pendingInvites.length },
              { label: 'Openstaande aanvragen', value: pendingRequests.length, highlight: pendingRequests.length > 0 },
            ].map(s => (
              <div key={s.label} className="px-4 py-2.5 rounded-xl text-center"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: `1px solid ${'highlight' in s && s.highlight ? 'var(--orange)' : 'var(--border)'}`,
                }}>
                <p className="text-xl font-bold" style={'highlight' in s && s.highlight ? { color: 'var(--orange)' } : {}}>{s.value}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Toegangsaanvragen ── */}
        <Card className="mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">📋 Toegangsaanvragen</h2>
            {pendingRequests.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                {pendingRequests.length} nieuw
              </span>
            )}
          </div>

          {accessRequests.length === 0 ? (
            <p className="text-sm py-2" style={{ color: 'var(--text-secondary)' }}>
              Nog geen aanvragen ontvangen.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {accessRequests.map(req => (
                <div key={req.id} className="rounded-2xl p-4"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: `1px solid ${req.status === 'pending' ? 'var(--orange)40' : 'var(--border)'}`,
                    opacity: req.status !== 'pending' ? 0.6 : 1,
                  }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-sm">{req.name}</span>
                        {req.club && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                            {req.club}
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{
                            backgroundColor: req.status === 'pending' ? '#f59e0b20' : req.status === 'approved' ? '#22c55e20' : '#ef444420',
                            color: req.status === 'pending' ? '#f59e0b' : req.status === 'approved' ? '#22c55e' : '#ef4444',
                          }}>
                          {req.status === 'pending' ? 'Wachtend' : req.status === 'approved' ? '✓ Goedgekeurd' : '✗ Afgewezen'}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{req.email}</p>
                      {req.message && (
                        <p className="text-xs mt-1.5 italic" style={{ color: 'var(--text-secondary)' }}>
                          &ldquo;{req.message}&rdquo;
                        </p>
                      )}
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(req.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    {/* Actieknoppen — alleen voor wachtende aanvragen */}
                    {req.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => rejectRequest(req)}
                          disabled={rejectingId === req.id || approvingId === req.id}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all active:scale-95"
                          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          {rejectingId === req.id ? '…' : '✗ Afwijzen'}
                        </button>
                        <button
                          onClick={() => approveRequest(req)}
                          disabled={approvingId === req.id || rejectingId === req.id}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 transition-all active:scale-95"
                          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                          {approvingId === req.id ? '⏳ …' : '✓ Goedkeuren (30d)'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Uitnodigingslink na goedkeuring */}
                  {approvedUrl?.reqId === req.id && (
                    <div className="mt-3 p-3 rounded-xl"
                      style={{ backgroundColor: '#22c55e12', border: '1px solid #22c55e40' }}>
                      <p className="text-xs font-semibold mb-1.5" style={{ color: '#22c55e' }}>
                        ✓ Uitnodiging aangemaakt — 30 dagen geldig
                      </p>
                      <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                        Stuur deze link naar {req.name}:
                      </p>
                      <div className="flex gap-2 items-center">
                        <code className="flex-1 text-xs px-2 py-1.5 rounded-lg overflow-hidden"
                          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                          {approvedUrl.url}
                        </code>
                        <button onClick={() => copyReqUrl(approvedUrl.url)}
                          className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer active:scale-95"
                          style={{ backgroundColor: copiedReq ? '#22c55e' : 'var(--orange)', color: '#fff' }}>
                          {copiedReq ? '✓' : '📋'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Nieuwe uitnodiging ── */}
        <Card className="mb-5">
          <h2 className="font-bold mb-4">📧 Nieuwe admin uitnodigen</h2>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="E-mailadres" type="email" value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)} placeholder="naam@club.nl" />
              <Input label="Naam (optioneel)" value={inviteName}
                onChange={e => setInviteName(e.target.value)} placeholder="Jan de Boer" />
            </div>
            {/* Geldigheid */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Uitnodiging geldig (dagen)
              </label>
              <div className="flex gap-2">
                {[3, 7, 14, 30].map(d => (
                  <button key={d} onClick={() => setInviteDays(d)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all"
                    style={{
                      backgroundColor: inviteDays === d ? 'var(--orange)' : 'var(--bg-elevated)',
                      color: inviteDays === d ? '#fff' : 'var(--text-secondary)',
                    }}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={createInvitation} loading={inviting} disabled={!inviteEmail.trim()}>
              🔗 Uitnodigingslink genereren
            </Button>
          </div>

          {/* Gegenereerde link */}
          {newInviteUrl && (
            <div className="mt-4 p-4 rounded-2xl"
              style={{ backgroundColor: '#22c55e12', border: '1.5px solid #22c55e50' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: '#22c55e' }}>✓ Link aangemaakt</p>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                Stuur deze link naar de nieuwe admin (via WhatsApp, e-mail, etc.):
              </p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 text-xs px-2 py-1.5 rounded-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                  {newInviteUrl}
                </code>
                <button onClick={() => copyUrl(newInviteUrl)}
                  className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer active:scale-95"
                  style={{ backgroundColor: copied ? '#22c55e' : 'var(--orange)', color: '#fff' }}>
                  {copied ? '✓' : '📋'}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* ── Openstaande uitnodigingen ── */}
        {invitations.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-3"
              style={{ color: 'var(--text-secondary)' }}>Uitnodigingen</h2>
            <div className="flex flex-col gap-2">
              {invitations.map(inv => {
                const expired = new Date(inv.expires_at) < new Date()
                const used    = !!inv.used_at
                const url     = typeof window !== 'undefined' ? `${window.location.origin}/invite/${inv.token}` : ''
                return (
                  <div key={inv.id} className="px-4 py-3 rounded-2xl flex items-center gap-3"
                    style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', opacity: used || expired ? 0.5 : 1 }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{inv.email}</p>
                      {inv.name && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{inv.name}</p>}
                      <p className="text-xs mt-0.5" style={{ color: used ? '#22c55e' : expired ? '#ef4444' : 'var(--text-secondary)' }}>
                        {used ? '✓ Gebruikt' : expired ? '⏰ Verlopen' : `Geldig t/m ${new Date(inv.expires_at).toLocaleDateString('nl-NL')}`}
                      </p>
                    </div>
                    {!used && !expired && (
                      <button onClick={() => copyUrl(url)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer flex-shrink-0"
                        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                        📋 Link
                      </button>
                    )}
                    <button onClick={() => deleteInvitation(inv.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs cursor-pointer flex-shrink-0"
                      style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Admins ── */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-secondary)' }}>
            Admins ({regularAdmins.length})
          </h2>

          {regularAdmins.length === 0 ? (
            <Card className="text-center py-8">
              <p style={{ color: 'var(--text-secondary)' }}>
                Nog geen admins. Genereer een uitnodigingslink hierboven.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {regularAdmins.map(admin => {
                const expired   = admin.expires_at ? new Date(admin.expires_at) < new Date() : false
                const canAccess = admin.is_active && !expired
                const isEditing = featureEdit === admin.id

                return (
                  <Card key={admin.id}>
                    {/* Hoofdrij */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="font-semibold">{admin.name}</p>
                          <Badge variant={canAccess ? 'green' : 'gray'}>
                            {!admin.is_active ? 'Inactief' : expired ? 'Verlopen' : 'Actief'}
                          </Badge>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{admin.email}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          Lid sinds {new Date(admin.created_at).toLocaleDateString('nl-NL')}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap flex-shrink-0">
                        <button onClick={() => toggleActive(admin.id, admin.is_active)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-xl cursor-pointer active:scale-95"
                          style={{
                            backgroundColor: admin.is_active ? '#ef444415' : '#22c55e20',
                            color: admin.is_active ? '#ef4444' : '#22c55e',
                            border: `1px solid ${admin.is_active ? '#ef444435' : '#22c55e40'}`,
                          }}>
                          {admin.is_active ? '⏸ Deactiveer' : '▶ Activeer'}
                        </button>
                        {FEATURE_FLAGS.length > 0 && (
                          <button onClick={() => setFeatureEdit(isEditing ? null : admin.id)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-xl cursor-pointer"
                            style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                            🚩 Features
                          </button>
                        )}
                        <button onClick={() => deleteAdmin(admin.id, admin.name)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs cursor-pointer"
                          style={{ backgroundColor: '#ef444415', color: '#ef4444', border: '1px solid #ef444430' }}>
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Verloopdatum */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        ⏰ Verloopdatum:
                      </span>
                      <input type="date"
                        value={expiryEdit[admin.id] ?? (admin.expires_at ? admin.expires_at.substring(0, 10) : '')}
                        onChange={e => setExpiryEdit(prev => ({ ...prev, [admin.id]: e.target.value }))}
                        className="rounded-lg px-2 py-1 text-xs outline-none"
                        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', color: expired ? '#ef4444' : 'var(--text-primary)' }} />
                      {expiryEdit[admin.id] !== undefined && (
                        <button onClick={() => saveExpiry(admin.id)} disabled={savingExpiry === admin.id}
                          className="text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer disabled:opacity-50"
                          style={{ backgroundColor: 'var(--orange)', color: '#fff' }}>
                          {savingExpiry === admin.id ? '…' : 'Opslaan'}
                        </button>
                      )}
                      {admin.expires_at ? (
                        <button onClick={() => clearExpiry(admin.id)}
                          className="text-xs px-2 py-1 rounded-lg cursor-pointer"
                          style={{ color: 'var(--text-secondary)' }}>
                          ✕ geen limiet
                        </button>
                      ) : (
                        !expiryEdit[admin.id] && (
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Geen einddatum</span>
                        )
                      )}
                    </div>

                    {/* Feature flags */}
                    {isEditing && FEATURE_FLAGS.length > 0 && (
                      <div className="mt-3 pt-3 flex flex-col gap-2"
                        style={{ borderTop: '1px solid var(--border)' }}>
                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                          Feature flags
                        </p>
                        {FEATURE_FLAGS.map(flag => {
                          const on = admin.features?.[flag.key] === true
                          return (
                            <div key={flag.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
                              style={{ backgroundColor: 'var(--bg-elevated)' }}>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">{flag.label}</p>
                                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{flag.description}</p>
                              </div>
                              {/* Toggle switch */}
                              <button onClick={() => toggleFeature(admin.id, flag.key, on)}
                                className="w-11 h-6 rounded-full relative cursor-pointer transition-all flex-shrink-0"
                                style={{ backgroundColor: on ? 'var(--orange)' : 'var(--bg-base)', border: '2px solid var(--border)' }}>
                                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                                  style={{ left: on ? 'calc(100% - 1.25rem)' : '0.125rem' }} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
