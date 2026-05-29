import { supabase } from './supabase'
import type { AdminProfile } from './supabase'

export async function getMyAdminProfile(): Promise<AdminProfile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('admin_profiles').select('*').eq('user_id', user.id).single()
  return data ?? null
}

export function isAccountExpired(profile: AdminProfile): boolean {
  if (!profile.expires_at) return false
  return new Date(profile.expires_at) < new Date()
}

export function hasFeature(profile: AdminProfile | null, key: string): boolean {
  if (!profile) return false
  if (profile.is_superadmin) return true
  return profile.features?.[key] === true
}

// Beschikbare feature flags — voeg nieuwe toe zodra ze gebouwd worden
// Voorbeeld: { key: 'new_referee_ui', label: 'Nieuwe scheids UI', description: '...' }
export const FEATURE_FLAGS: { key: string; label: string; description: string }[] = []
