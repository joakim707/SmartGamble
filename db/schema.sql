-- ========================
-- SmartGamble - Schéma BDD
-- PostgreSQL
-- ========================

-- Équipes
CREATE TABLE team (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    short_name  VARCHAR(20),
    league      VARCHAR(50) NOT NULL,  -- ex: "Ligue 1", "Premier League"
    logo_url    VARCHAR(255),
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Matchs
CREATE TABLE match (
    id              SERIAL PRIMARY KEY,
    home_team_id    INTEGER NOT NULL REFERENCES team(id),
    away_team_id    INTEGER NOT NULL REFERENCES team(id),
    league          VARCHAR(50) NOT NULL,
    match_date      TIMESTAMP NOT NULL,
    status          VARCHAR(20) DEFAULT 'upcoming', -- upcoming | finished | cancelled
    -- Résultat (NULL si pas encore joué)
    score_home      INTEGER,
    score_away      INTEGER,
    -- Cotes
    odds_home       NUMERIC(5, 2),  -- cote victoire domicile
    odds_draw       NUMERIC(5, 2),  -- cote nul
    odds_away       NUMERIC(5, 2),  -- cote victoire extérieur
    odds_updated_at TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Stats globales par équipe et par saison
CREATE TABLE team_stats (
    id              SERIAL PRIMARY KEY,
    team_id         INTEGER NOT NULL REFERENCES team(id),
    season          VARCHAR(10) NOT NULL,  -- ex: "2024-25"
    -- Résultats
    played          INTEGER DEFAULT 0,
    wins            INTEGER DEFAULT 0,
    draws           INTEGER DEFAULT 0,
    losses          INTEGER DEFAULT 0,
    -- Buts
    goals_for       INTEGER DEFAULT 0,
    goals_against   INTEGER DEFAULT 0,
    -- Forme récente (5 derniers matchs, ex: "WDLWW")
    form            VARCHAR(10),
    -- Classement
    rank            INTEGER,
    points          INTEGER DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (team_id, season)
);

-- ========================
-- Index utiles
-- ========================
CREATE INDEX idx_match_date ON match(match_date);
CREATE INDEX idx_match_league ON match(league);
CREATE INDEX idx_match_status ON match(status);
CREATE INDEX idx_team_stats_season ON team_stats(team_id, season);
