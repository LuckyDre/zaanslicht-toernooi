-- Zaans Licht Toernooi Systeem - Database Schema

-- Tournaments
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  num_fields int not null default 1,
  num_teams int not null,
  match_duration_minutes int not null default 25,
  num_halves int not null default 1 check (num_halves in (1,2)),
  total_duration_minutes int,
  finals_type text not null default 'none' check (finals_type in ('none','final','semi_final','quarter_final')),
  num_pools int not null default 1,
  pool_names text[],
  break_minutes int not null default 10,
  starts_at timestamptz,
  ref_token uuid default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft','active','finished')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Teams
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade not null,
  name text not null,
  color text not null default '#FF6B00',
  pool int not null default 1,
  created_at timestamptz default now()
);

-- Fields (velden)
create table if not exists fields (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade not null,
  name text not null,
  display_order int not null default 0
);

-- Matches
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade not null,
  field_id uuid references fields(id) on delete set null,
  home_team_id uuid references teams(id) on delete cascade not null,
  away_team_id uuid references teams(id) on delete cascade not null,
  home_score int,
  away_score int,
  round int not null default 1,
  match_number int not null default 1,
  phase text not null default 'group' check (phase in ('group','quarter_final','semi_final','final','third_place')),
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','cancelled')),
  ref_token uuid default gen_random_uuid(),
  created_at timestamptz default now()
);

-- Standings (computed but cached for performance)
create table if not exists standings (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id) on delete cascade not null,
  team_id uuid references teams(id) on delete cascade not null,
  played int not null default 0,
  won int not null default 0,
  drawn int not null default 0,
  lost int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  points int not null default 0,
  pool int not null default 1,
  unique(tournament_id, team_id)
);

-- User favorites (no local storage - all in DB)
create table if not exists user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_id uuid references teams(id) on delete cascade not null,
  tournament_id uuid references tournaments(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, team_id)
);

-- Enable Row Level Security
alter table tournaments enable row level security;
alter table teams enable row level security;
alter table fields enable row level security;
alter table matches enable row level security;
alter table standings enable row level security;
alter table user_favorites enable row level security;

-- Public read access for published tournaments
create policy "Public read tournaments" on tournaments for select using (status != 'draft');
create policy "Public read teams" on teams for select using (true);
create policy "Public read fields" on fields for select using (true);
create policy "Public read matches" on matches for select using (true);
create policy "Public read standings" on standings for select using (true);

-- Favorites: users can manage their own
create policy "Users manage own favorites" on user_favorites
  for all using (auth.uid() = user_id);

-- Admin full access (authenticated users with admin role)
create policy "Admin all tournaments" on tournaments for all using (auth.role() = 'authenticated');
create policy "Admin all teams" on teams for all using (auth.role() = 'authenticated');
create policy "Admin all fields" on fields for all using (auth.role() = 'authenticated');
create policy "Admin all matches" on matches for all using (auth.role() = 'authenticated');
create policy "Admin all standings" on standings for all using (auth.role() = 'authenticated');

-- Enable realtime on matches and standings
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table standings;

-- Function to update standings after match result
create or replace function update_standings()
returns trigger as $$
begin
  -- Fire when a match becomes finished OR was finished and is being changed/reset
  if NEW.status = 'finished' or OLD.status = 'finished' then

    -- Step 1: reset all standings for this tournament to 0
    update standings set
      played = 0, won = 0, drawn = 0, lost = 0,
      goals_for = 0, goals_against = 0, points = 0
    where tournament_id = NEW.tournament_id;

    -- Step 2: recalculate from all finished group matches using UNION ALL
    update standings s set
      played        = sub.played,
      won           = sub.won,
      drawn         = sub.drawn,
      lost          = sub.lost,
      goals_for     = sub.goals_for,
      goals_against = sub.goals_against,
      points        = sub.points
    from (
      select
        team_id,
        count(*)::int                                                       as played,
        sum(case when gf > ga then 1 else 0 end)::int                      as won,
        sum(case when gf = ga then 1 else 0 end)::int                      as drawn,
        sum(case when gf < ga then 1 else 0 end)::int                      as lost,
        sum(gf)::int                                                        as goals_for,
        sum(ga)::int                                                        as goals_against,
        sum(case when gf > ga then 3 when gf = ga then 1 else 0 end)::int  as points
      from (
        select home_team_id as team_id, home_score::int as gf, away_score::int as ga
        from matches
        where tournament_id = NEW.tournament_id
          and status = 'finished'
          and phase = 'group'
          and home_score is not null
          and away_score is not null
        union all
        select away_team_id as team_id, away_score::int as gf, home_score::int as ga
        from matches
        where tournament_id = NEW.tournament_id
          and status = 'finished'
          and phase = 'group'
          and home_score is not null
          and away_score is not null
      ) alle_rijen
      group by team_id
    ) sub
    where s.tournament_id = NEW.tournament_id
      and s.team_id = sub.team_id;

  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_match_finished
  after update on matches
  for each row execute function update_standings();

-- ── Scheidsrechter functies ──────────────────────────────────────────────────

-- Valideer of een ref_token klopt bij een toernooi
create or replace function validate_ref_token(p_tournament_id uuid, p_ref_token uuid)
returns boolean language plpgsql security definer as $$
begin
  return exists(
    select 1 from tournaments
    where id = p_tournament_id
      and ref_token = p_ref_token
  );
end;
$$;

-- Scheidsrechter past wedstrijduitslag aan (omzeilt RLS via SECURITY DEFINER)
-- Valideert via het eigen ref_token van de wedstrijd.
-- Scores kunnen alleen worden ingevoerd als de wedstrijd live is.
create or replace function update_match_as_referee(
  p_match_id     uuid,
  p_ref_token    uuid,
  p_home_score   int,
  p_away_score   int,
  p_status       text,
  p_started_at   timestamptz default null,
  p_finished_at  timestamptz default null
)
returns json language plpgsql security definer as $$
declare
  v_token  uuid;
  v_status text;
begin
  -- Haal het ref_token en de huidige status op voor dit specifieke duel
  select ref_token, status into v_token, v_status
  from matches
  where id = p_match_id;

  if v_token is null or v_token != p_ref_token then
    return json_build_object('success', false, 'error', 'Ongeldige scheidsrechterscode');
  end if;

  -- Scores mogen alleen worden ingevoerd als de wedstrijd live is
  if v_status != 'live' then
    return json_build_object('success', false, 'error', 'Wedstrijd is nog niet gestart');
  end if;

  update matches set
    home_score  = p_home_score,
    away_score  = p_away_score,
    status      = p_status,
    finished_at = case
      when p_status = 'finished' then coalesce(p_finished_at, now())
      when p_status = 'live'     then null
      else finished_at
    end
  where id = p_match_id;

  return json_build_object('success', true);
end;
$$;

-- Migratie: voeg ref_token toe aan bestaande toernooien
alter table tournaments add column if not exists ref_token uuid default gen_random_uuid();

-- Migratie: voeg ref_token toe aan bestaande wedstrijden
alter table matches add column if not exists ref_token uuid default gen_random_uuid();
