-- Migration 006 : ajout de fd_match_id pour football-data.org
-- football-data.org remplace Understat pour la collecte des matchs et compositions
-- understat_id reste en place pour une éventuelle réutilisation future

-- Identifiant du match côté football-data.org (entier)
ALTER TABLE match ADD COLUMN IF NOT EXISTS fd_match_id INTEGER;

-- Contrainte UNIQUE requise pour les upserts ON CONFLICT
ALTER TABLE match ADD UNIQUE (fd_match_id);
