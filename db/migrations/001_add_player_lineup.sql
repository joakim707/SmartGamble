-- Migration 001 : ajout colonne thesportsdb_id sur team + table player

ALTER TABLE team
    ADD COLUMN IF NOT EXISTS thesportsdb_id INTEGER UNIQUE;

CREATE TABLE IF NOT EXISTS player (
    id                SERIAL PRIMARY KEY,
    thesportsdb_id    INTEGER UNIQUE NOT NULL,
    team_id           INTEGER NOT NULL REFERENCES team(id),
    name              VARCHAR(100) NOT NULL,
    position          VARCHAR(50),
    updated_at        TIMESTAMP DEFAULT NOW()
);

-- Colonnes ajoutées après création initiale (à exécuter si la table existe déjà)
ALTER TABLE player ADD COLUMN IF NOT EXISTS nationality   VARCHAR(100);
ALTER TABLE player ADD COLUMN IF NOT EXISTS shirt_number  INTEGER;
ALTER TABLE player ADD COLUMN IF NOT EXISTS photo_url     VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_player_team     ON player(team_id);
CREATE INDEX IF NOT EXISTS idx_player_position ON player(position);
