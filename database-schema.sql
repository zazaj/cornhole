-- Supabase / PostgreSQL schema for the Cornhole tournament app

CREATE TABLE tournaments (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'teams',
  started BOOLEAN NOT NULL DEFAULT false,
  double_elimination BOOLEAN NOT NULL DEFAULT false,
  has_grand_finale BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  generated_from_players BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, name)
);

CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  team1_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  team2_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  team1_score INTEGER NOT NULL DEFAULT 0,
  team2_score INTEGER NOT NULL DEFAULT 0,
  winner_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  loser_match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  next_match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
  next_team_slot INTEGER CHECK (next_team_slot IN (1, 2)),
  is_bye BOOLEAN NOT NULL DEFAULT false,
  bracket TEXT NOT NULL DEFAULT 'winners',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);