-- Zaans Licht Toernooi Systeem - Database Schema

-- Tournaments
create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  num_fields int not null default 1,
  num_teams int not null,
  match_duration_minutes int not null default 10,
  num_halves int not null default 1 check (num_halves in (1,2)),
  total_duration_minutes int,
  finals_type text not null default 'none' check (finals_type in ('none','final','semi_final','quarter_final')),
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
  status text not null default 'scheduled' check (status in ('scheduled','live','finished')),
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
  -- Reset and recalculate for both teams
  if NEW.status = 'finished' and NEW.home_score is not null and NEW.away_score is not null then
    -- Upsert home team
    insert into standings (tournament_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
    values (NEW.tournament_id, NEW.home_team_id, 0, 0, 0, 0, 0, 0, 0)
    on conflict (tournament_id, team_id) do nothing;

    insert into standings (tournament_id, team_id, played, won, drawn, lost, goals_for, goals_against, points)
    values (NEW.tournament_id, NEW.away_team_id, 0, 0, 0, 0, 0, 0, 0)
    on conflict (tournament_id, team_id) do nothing;

    -- Recalculate all standings from scratch
    update standings s set
      played = sub.played,
      won = sub.won,
      drawn = sub.drawn,
      lost = sub.lost,
      goals_for = sub.goals_for,
      goals_against = sub.goals_against,
      points = sub.points
    from (
      select
        team_id,
        count(*) as played,
        sum(case when (team_id = home_team_id and home_score > away_score) or (team_id = away_team_id and away_score > home_score) then 1 else 0 end) as won,
        sum(case when home_score = away_score then 1 else 0 end) as drawn,
        sum(case when (team_id = home_team_id and home_score < away_score) or (team_id = away_team_id and away_score < home_score) then 1 else 0 end) as lost,
        sum(case when team_id = home_team_id then home_score else away_score end) as goals_for,
        sum(case when team_id = home_team_id then away_score else home_score end) as goals_against,
        sum(case
          when (team_id = home_team_id and home_score > away_score) or (team_id = away_team_id and away_score > home_score) then 3
          when home_score = away_score then 1
          else 0
        end) as points
      from matches m
      cross join (values (m.home_team_id), (m.away_team_id)) t(team_id)
      where m.tournament_id = NEW.tournament_id
        and m.status = 'finished'
        and m.phase = 'group'
        and m.home_score is not null
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
