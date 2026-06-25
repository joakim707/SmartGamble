-- Migration 003 : intégration SofaScore
-- Ajoute sofascore_id sur les tables match et player
-- Rend thesportsdb_id nullable (les joueurs SofaScore n'ont pas cet id)
-- Ajoute is_absent sur la table lineup (absence spécifique au match)

-- Identifiant SofaScore du match — sert à récupérer les compos via l'API
ALTER TABLE match ADD COLUMN IF NOT EXISTS sofascore_id INTEGER;
ALTER TABLE match ADD UNIQUE (sofascore_id);          -- séparé car IF NOT EXISTS n'est pas supporté sur ADD CONSTRAINT

-- Identifiant SofaScore du joueur — utilisé comme clé d'upsert dans fetch_lineups.py
ALTER TABLE player ADD COLUMN IF NOT EXISTS sofascore_id INTEGER;
ALTER TABLE player ADD UNIQUE (sofascore_id);

-- Les joueurs SofaScore n'ont pas de thesportsdb_id : on retire la contrainte NOT NULL
ALTER TABLE player
    ALTER COLUMN thesportsdb_id DROP NOT NULL;

-- Absence d'un joueur pour UN match précis (blessé, suspendu, incertain)
-- Différent de player.is_absent qui est une absence "globale"
ALTER TABLE lineup
    ADD COLUMN IF NOT EXISTS is_absent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_match_sofascore  ON match(sofascore_id);
CREATE INDEX IF NOT EXISTS idx_player_sofascore ON player(sofascore_id);
CREATE INDEX IF NOT EXISTS idx_lineup_absent    ON lineup(match_id, is_absent);
