-- Migration 004 : URL de la page match SofaScore
-- Utilisée par fetch_lineups.py pour naviguer vers la page match
-- et intercepter la réponse lineup API native (bypass Cloudflare).

ALTER TABLE match ADD COLUMN IF NOT EXISTS sofa_match_url TEXT;
