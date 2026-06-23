-- ============================================================
-- CoteMax – Schéma Supabase
-- Site de comparaison de cotes Coupe du Monde 2026
-- ============================================================

-- Matches (récupérés depuis The Odds API)
create table if not exists matches (
  id            uuid primary key default gen_random_uuid(),
  external_id   text unique not null,          -- ID renvoyé par The Odds API
  home_team     text not null,
  away_team     text not null,
  commence_time timestamptz not null,
  sport_key     text not null default 'soccer_fifa_world_cup',
  status        text not null default 'scheduled', -- scheduled | live | finished
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists matches_commence_time_idx on matches (commence_time);

-- Bookmakers référencés sur le site
create table if not exists bookmakers (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,   -- clé API (ex: "1xbet")
  name          text not null,          -- nom affiché
  affiliate_url text not null,          -- lien affilié
  logo_url      text,
  display_order int default 99,
  active        boolean default true
);

-- Données de cotes (snapshot toutes les 5 min)
create table if not exists odds_snapshots (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references matches (id) on delete cascade,
  bookmaker_key  text not null,
  h2h_home       numeric(6,3),   -- cote victoire équipe domicile
  h2h_draw       numeric(6,3),   -- cote match nul
  h2h_away       numeric(6,3),   -- cote victoire équipe extérieure
  fetched_at     timestamptz not null default now()
);

create index if not exists odds_snapshots_match_idx  on odds_snapshots (match_id, fetched_at desc);
create index if not exists odds_snapshots_fetched_idx on odds_snapshots (fetched_at desc);

-- Vue pratique : dernière cote par match × bookmaker
create or replace view latest_odds as
select distinct on (match_id, bookmaker_key)
  os.*,
  m.home_team,
  m.away_team,
  m.commence_time,
  m.status
from odds_snapshots os
join matches m on m.id = os.match_id
order by match_id, bookmaker_key, fetched_at desc;

-- RLS : lecture publique (site public)
alter table matches         enable row level security;
alter table bookmakers      enable row level security;
alter table odds_snapshots  enable row level security;

create policy "public_read_matches"        on matches        for select using (true);
create policy "public_read_bookmakers"     on bookmakers     for select using (true);
create policy "public_read_odds_snapshots" on odds_snapshots for select using (true);

-- Données initiales : bookmakers
insert into bookmakers (key, name, affiliate_url, display_order) values
  ('1xbet',      '1xBet',       'https://1xbet.cm',       1),
  ('betway',     'Betway',      'https://betway.cm',       2),
  ('bet365',     'Bet365',      'https://bet365.cm',       3),
  ('melbet',     'Melbet',      'https://melbet.cm',       4),
  ('paripesa',   'Paripesa',    'https://paripesa.cm',     5),
  ('betpawa',    'betPawa',     'https://betpawa.cm',      6),
  ('betwinner',  'BetWinner',   'https://betwinner.cm',    7),
  ('premierbет', 'premierBet',  'https://premierbet.cm',   8),
  ('linebet',    'Linebet',     'https://linebet.cm',      9),
  ('betandyou',  'Betandyou',   'https://betandyou.cm',   10),
  ('megapari',   'Megapari',    'https://megapari.cm',    11)
on conflict (key) do nothing;
