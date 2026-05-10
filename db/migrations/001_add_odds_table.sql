-- Migration 001 : table des cotes par bookmaker
-- À exécuter dans Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS odds (
    id          SERIAL PRIMARY KEY,
    match_id    INTEGER NOT NULL REFERENCES match(id) ON DELETE CASCADE,
    bookmaker   VARCHAR(50) NOT NULL,
    odds_home   NUMERIC(5, 2),
    odds_draw   NUMERIC(5, 2),
    odds_away   NUMERIC(5, 2),
    updated_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE (match_id, bookmaker)
);

CREATE INDEX IF NOT EXISTS idx_odds_match ON odds(match_id);
