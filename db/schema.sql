-- ============================================================
-- SmartGamble — schema.sql (consolidé)
-- Reflète l'état réel de la base au 17/08/2026 :
--   schema.sql original + migrations 001, 002, 003 fusionnées
--   + table odds (ajoutée pour le comparateur de cotes)
--
-- Les fichiers db/migrations/*.sql restent conservés comme
-- historique chronologique des évolutions ; ce fichier sert de
-- source de vérité unique pour recréer la base en une seule passe
-- (ex: nouveau projet Supabase).
-- ============================================================

-- ========================
-- Équipes
-- ========================
CREATE TABLE IF NOT EXISTS team (
    id                SERIAL PRIMARY KEY,
    name              VARCHAR(100) NOT NULL,
    short_name        VARCHAR(20),
    league            VARCHAR(50) NOT NULL,  -- ex: "Ligue 1", "Premier League"
    logo_url          VARCHAR(255),
    thesportsdb_id    INTEGER UNIQUE,        -- ID TheSportsDB pour l'API joueurs
    created_at        TIMESTAMP DEFAULT NOW()
);

-- ========================
-- Matchs
-- ========================
CREATE TABLE IF NOT EXISTS match (
    id              SERIAL PRIMARY KEY,
    home_team_id    INTEGER NOT NULL REFERENCES team(id),
    away_team_id    INTEGER NOT NULL REFERENCES team(id),
    league          VARCHAR(50) NOT NULL,
    match_date      TIMESTAMP NOT NULL,
    status          VARCHAR(20) DEFAULT 'upcoming', -- upcoming | finished | cancelled
    -- Résultat (NULL si pas encore joué)
    score_home      INTEGER,
    score_away      INTEGER,
    -- Cotes "rapides" (moyenne/dernière valeur connue, indépendant de la table odds)
    odds_home       NUMERIC(5, 2),
    odds_draw       NUMERIC(5, 2),
    odds_away       NUMERIC(5, 2),
    odds_updated_at TIMESTAMP,
    -- Intégration SofaScore (migration 003)
    sofascore_id    INTEGER UNIQUE,          -- sert à récupérer les compos via l'API SofaScore
    created_at      TIMESTAMP DEFAULT NOW()
);

-- ========================
-- Stats globales par équipe et par saison
-- ========================
CREATE TABLE IF NOT EXISTS team_stats (
    id              SERIAL PRIMARY KEY,
    team_id         INTEGER NOT NULL REFERENCES team(id),
    season          VARCHAR(10) NOT NULL,  -- ex: "2024-25"
    played          INTEGER DEFAULT 0,
    wins            INTEGER DEFAULT 0,
    draws           INTEGER DEFAULT 0,
    losses          INTEGER DEFAULT 0,
    goals_for       INTEGER DEFAULT 0,
    goals_against   INTEGER DEFAULT 0,
    form            VARCHAR(10),   -- forme récente, ex: "WDLWW"
    rank            INTEGER,
    points          INTEGER DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (team_id, season)
);

-- ========================
-- Joueurs
-- thesportsdb_id nullable depuis la migration 003 : les joueurs
-- importés via SofaScore n'ont pas forcément d'équivalent TheSportsDB.
-- ========================
CREATE TABLE IF NOT EXISTS player (
    id                SERIAL PRIMARY KEY,
    thesportsdb_id    INTEGER UNIQUE,        -- nullable (migration 003)
    sofascore_id      INTEGER UNIQUE,        -- ajouté migration 003
    team_id           INTEGER NOT NULL REFERENCES team(id),
    name              VARCHAR(100) NOT NULL,
    position          VARCHAR(50),           -- Goalkeeper | Defender | Midfielder | Forward
    nationality       VARCHAR(100),
    shirt_number      INTEGER,
    photo_url         VARCHAR(255),
    is_absent         BOOLEAN NOT NULL DEFAULT false,  -- absence globale (migration 002)
    updated_at        TIMESTAMP DEFAULT NOW()
);

-- ========================
-- Stats joueurs par saison (migration 002, peuplée par fetch_stats.py)
-- ========================
CREATE TABLE IF NOT EXISTS player_stats (
    id              SERIAL PRIMARY KEY,
    player_id       INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
    season          VARCHAR(10) NOT NULL,
    minutes_played  INTEGER NOT NULL DEFAULT 0,
    goals           INTEGER NOT NULL DEFAULT 0,
    assists         INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (player_id, season)
);

-- ========================
-- Compositions d'équipe par match (migration 002, complétée migration 003)
-- ========================
CREATE TABLE IF NOT EXISTS lineup (
    id          SERIAL PRIMARY KEY,
    match_id    INTEGER NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    team_id     INTEGER NOT NULL REFERENCES team(id),
    player_id   INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
    is_starter  BOOLEAN NOT NULL DEFAULT true,
    is_absent   BOOLEAN NOT NULL DEFAULT false,  -- absence pour CE match (migration 003)
    score       NUMERIC(8, 2),
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (match_id, team_id, player_id)
);

-- ========================
-- Cotes par bookmaker (ajoutée pour le comparateur — absente du
-- schema.sql original et des migrations historiques, créée le
-- 17/08/2026 pour couvrir data/fetch_odds.py)
-- ========================
CREATE TABLE IF NOT EXISTS odds (
    id              SERIAL PRIMARY KEY,
    match_id        INTEGER NOT NULL REFERENCES match(id),
    bookmaker       VARCHAR(50) NOT NULL,
    odds_home       NUMERIC(5, 2),
    odds_draw       NUMERIC(5, 2),
    odds_away       NUMERIC(5, 2),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (match_id, bookmaker)
);

-- ========================
-- Index utiles
-- ========================
CREATE INDEX IF NOT EXISTS idx_match_date        ON match(match_date);
CREATE INDEX IF NOT EXISTS idx_match_league      ON match(league);
CREATE INDEX IF NOT EXISTS idx_match_status      ON match(status);
CREATE INDEX IF NOT EXISTS idx_match_sofascore   ON match(sofascore_id);

CREATE INDEX IF NOT EXISTS idx_team_stats_season ON team_stats(team_id, season);

CREATE INDEX IF NOT EXISTS idx_player_team       ON player(team_id);
CREATE INDEX IF NOT EXISTS idx_player_position   ON player(position);
CREATE INDEX IF NOT EXISTS idx_player_sofascore  ON player(sofascore_id);

CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id, season);

CREATE INDEX IF NOT EXISTS idx_lineup_match        ON lineup(match_id);
CREATE INDEX IF NOT EXISTS idx_lineup_match_team   ON lineup(match_id, team_id);
CREATE INDEX IF NOT EXISTS idx_lineup_absent       ON lineup(match_id, is_absent);

CREATE INDEX IF NOT EXISTS idx_odds_match          ON odds(match_id);