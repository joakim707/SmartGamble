"""
Script de migration Supabase — crée les tables manquantes.

Prérequis :
  1. pip install psycopg2-binary
  2. Ajouter dans .env :
       SUPABASE_DB_URL=postgresql://postgres:[MOT_DE_PASSE]@db.[PROJECT_REF].supabase.co:5432/postgres
     → Supabase Dashboard > Settings > Database > Connection string > URI

Usage :
  python data/migrate.py
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
DB_URL = os.getenv("SUPABASE_DB_URL")

MIGRATIONS = [
    {
        "name": "create_predictions",
        "sql": """
            CREATE TABLE IF NOT EXISTS predictions (
                id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                match_id         integer REFERENCES match(id) ON DELETE CASCADE,
                model_name       text NOT NULL,
                prob_home        float NOT NULL,
                prob_draw        float NOT NULL,
                prob_away        float NOT NULL,
                predicted_result int NOT NULL,   -- 0 = domicile, 1 = nul, 2 = extérieur
                confidence       float NOT NULL,
                created_at       timestamptz DEFAULT now(),
                UNIQUE (match_id, model_name)
            );
        """,
    },
]


def run_migrations():
    if not DB_URL:
        print("Erreur : SUPABASE_DB_URL manquant dans .env")
        print("  → Supabase Dashboard > Settings > Database > Connection string > URI")
        return

    print("Connexion à Supabase PostgreSQL...")
    try:
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = True
        cur = conn.cursor()
        print("  Connexion OK\n")

        for m in MIGRATIONS:
            print(f"  Migration : {m['name']}...")
            cur.execute(m["sql"])
            print(f"  ✓ {m['name']}")

        cur.close()
        conn.close()
        print("\nToutes les migrations appliquées avec succès.")

    except psycopg2.OperationalError as e:
        print(f"Erreur de connexion : {e}")
        print("  → Vérifier SUPABASE_DB_URL dans .env")
    except Exception as e:
        print(f"Erreur : {e}")


if __name__ == "__main__":
    run_migrations()
