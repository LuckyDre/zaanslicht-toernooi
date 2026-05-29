import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Tournament = {
  id: string
  name: string
  slug: string
  num_fields: number
  num_teams: number
  match_duration_minutes: number
  num_halves: 1 | 2
  total_duration_minutes: number | null
  finals_type: 'none' | 'final' | 'semi_final' | 'quarter_final'
  num_pools: number
  pool_names: string[] | null
  break_minutes: number
  starts_at: string | null
  ref_token: string | null
  status: 'draft' | 'active' | 'finished'
  logo_url: string | null
  owner_id: string | null
  created_at: string
  updated_at: string
}

export type AdminProfile = {
  id: string
  user_id: string
  email: string
  name: string
  is_superadmin: boolean
  is_active: boolean
  expires_at: string | null
  features: Record<string, boolean>
  created_by: string | null
  created_at: string
}

export type Invitation = {
  id: string
  token: string
  email: string
  name: string | null
  created_by: string | null
  used_at: string | null
  expires_at: string
  created_at: string
}

export type Team = {
  id: string
  tournament_id: string
  name: string
  color: string
  pool: number
  created_at: string
}

export type Field = {
  id: string
  tournament_id: string
  name: string
  display_order: number
}

export type Match = {
  id: string
  tournament_id: string
  field_id: string | null
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  round: number
  match_number: number
  phase: 'group' | 'quarter_final' | 'semi_final' | 'final' | 'third_place'
  scheduled_at: string | null
  started_at: string | null
  finished_at: string | null
  status: 'scheduled' | 'live' | 'finished' | 'cancelled'
  ref_token: string | null
  referee_id: string | null
  created_at: string
  home_team?: Team
  away_team?: Team
  field?: Field
  referee?: Referee
}

export type Referee = {
  id: string
  tournament_id: string
  name: string
  token: string
  blocked_rounds: number[] | null
  created_at: string
}

export type Standing = {
  id: string
  tournament_id: string
  team_id: string
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  points: number
  pool: number
  team?: Team
}
