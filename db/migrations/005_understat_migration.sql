-- Migration 005 : remplacement SofaScore → Understat
-- Supprime les colonnes SofaScore devenues inutiles et ajoute understat_id

-- sofascore_id n'est plus utilisé depuis la migration vers Understat
ALTER TABLE match DROP COLUMN IF EXISTS sofascore_id;

-- sofa_match_url n'est plus utilisé (les URLs SofaScore ne sont plus construites)
ALTER TABLE match DROP COLUMN IF EXISTS sofa_match_url;

-- understat_id : identifiant numérique du match côté Understat (ex: "14132")
-- Stocké en VARCHAR pour rester flexible si Understat change le format
ALTER TABLE match ADD COLUMN IF NOT EXISTS understat_id VARCHAR(20);

-- Contrainte UNIQUE requise pour que l'upsert ON CONFLICT fonctionne
ALTER TABLE match ADD UNIQUE (understat_id);
