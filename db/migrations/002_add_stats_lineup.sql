-- Migration 002 : stats joueurs + lineup persistée

-- Colonne absence sur player (flag "indisponible actuellement")
ALTER TABLE player
    ADD COLUMN IF NOT EXISTS is_absent BOOLEAN NOT NULL DEFAULT false;

-- Stats joueur par saison (peuplées par fetch_stats.py)
CREATE TABLE IF NOT EXISTS player_stats (
    id              SERIAL PRIMARY KEY,
    player_id       INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
    season          VARCHAR(10) NOT NULL,   -- ex: "2024-25"
    minutes_played  INTEGER NOT NULL DEFAULT 0,
    goals           INTEGER NOT NULL DEFAULT 0,
    assists         INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (player_id, season)
);

-- Lineup persistée par match + équipe
CREATE TABLE IF NOT EXISTS lineup (
    id          SERIAL PRIMARY KEY,
    match_id    INTEGER NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    team_id     INTEGER NOT NULL REFERENCES team(id),
    player_id   INTEGER NOT NULL REFERENCES player(id) ON DELETE CASCADE,
    is_starter  BOOLEAN NOT NULL DEFAULT true,
    score       NUMERIC(8, 2),
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (match_id, team_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_lineup_match_team    ON lineup(match_id, team_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_player  ON player_stats(player_id, season);
