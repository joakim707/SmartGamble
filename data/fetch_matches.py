"""
Récupère les matchs des 5 grands championnats depuis Understat
et les stocke dans la table 'match' de Supabase.

Understat est une source open data couvrant les 5 meilleures ligues européennes.
La librairie Python 'understat' offre une interface asynchrone (via aiohttp)
pour récupérer matchs, joueurs et statistiques avancées (xG, xA...).

Flow : pour chaque ligue
       → get_league_results()  : matchs terminés (avec score réel)
       → get_league_fixtures() : matchs à venir  (sans score)
       → upsert équipes dans 'team'
       → upsert matchs dans 'match' avec understat_id comme clé
"""

import asyncio
import os
from datetime import datetime

import aiohttp
from understat import Understat
from supabase import create_client
from dotenv import load_dotenv

# Charge les variables d'environnement depuis le fichier .env
load_dotenv()

# ================================
# Configuration
# ================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Le client Supabase est synchrone — on l'utilise directement dans le code async
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Understat identifie les saisons par l'année de début de la saison :
# "2024" correspond à la saison 2024-2025
SAISON = "2024"

# Mapping clé Understat → nom affiché en BDD
# Les clés doivent correspondre aux slugs utilisés par understat.com dans ses URLs
LIGUES = {
    "EPL":        "Premier League",
    "La_liga":    "La Liga",
    "Bundesliga": "Bundesliga",
    "Serie_A":    "Serie A",
    "Ligue_1":    "Ligue 1",
}


# ================================
# Helpers Supabase
# ================================

def upsert_equipe(nom: str, nom_court: str, ligue: str) -> int:
    """
    Insère l'équipe si elle n'existe pas encore, ou récupère son id existant.
    La recherche se fait par nom exact pour éviter les doublons.
    Retourne l'id Supabase (table 'team') de l'équipe.
    """
    # On cherche d'abord si l'équipe est déjà en BDD
    existant = supabase.table("team").select("id").eq("name", nom).execute()
    if existant.data:
        # L'équipe existe → on retourne son id sans rien modifier
        return existant.data[0]["id"]

    # L'équipe est nouvelle → on l'insère
    result = supabase.table("team").insert({
        "name":       nom,
        "short_name": nom_court,
        "league":     ligue,
    }).execute()
    return result.data[0]["id"]


def upsert_match(match: dict, home_id: int, away_id: int, ligue: str) -> None:
    """
    Insère ou met à jour un match en utilisant understat_id comme clé de conflit.

    Si le match existe déjà (même understat_id), Supabase met à jour le statut
    et le score sans créer de doublon.

    Understat fournit la date au format "YYYY-MM-DD HH:MM:SS" en UTC.
    """
    # L'id Understat est un entier, on le stocke en chaîne pour rester flexible
    understat_id = str(match["id"])

    # isResult=True si le match est joué, False si c'est un match à venir
    est_termine = match.get("isResult", False)
    status = "finished" if est_termine else "upcoming"

    # Conversion de la date Understat ("YYYY-MM-DD HH:MM:SS") en format ISO 8601
    dt_str = match.get("datetime", "")
    try:
        match_date = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S").isoformat()
    except Exception:
        match_date = None

    # Les scores ne sont disponibles que pour les matchs terminés
    goals = match.get("goals", {})
    score_home = int(goals["h"]) if est_termine and goals.get("h") is not None else None
    score_away = int(goals["a"]) if est_termine and goals.get("a") is not None else None

    payload = {
        "understat_id": understat_id,
        "home_team_id": home_id,
        "away_team_id": away_id,
        "league":       ligue,
        "match_date":   match_date,
        "status":       status,
        "score_home":   score_home,
        "score_away":   score_away,
    }

    # on_conflict="understat_id" : si le match existe déjà, on met à jour ses données
    supabase.table("match").upsert(payload, on_conflict="understat_id").execute()


# ================================
# Fetch par championnat
# ================================

async def fetch_ligue(session: aiohttp.ClientSession, ligue_key: str, ligue_nom: str) -> None:
    """
    Récupère et stocke tous les matchs terminés et à venir d'un championnat.

    Deux appels Understat sont nécessaires :
    - get_league_results()  → matchs joués (score + xG disponibles)
    - get_league_fixtures() → matchs futurs  (pas encore de score)
    """
    print(f"\n=== {ligue_nom} ===")

    # Instanciation du client Understat avec la session aiohttp partagée
    u = Understat(session)

    try:
        # Matchs joués : score réel + données xG disponibles
        termines = await u.get_league_results(ligue_key, SAISON)
        # Matchs à venir : date et équipes seulement
        a_venir  = await u.get_league_fixtures(ligue_key, SAISON)
    except Exception as e:
        print(f"  Erreur Understat : {e}")
        return

    # Traitement de tous les matchs (terminés + à venir)
    for match in termines + a_venir:
        # Chaque match Understat contient "h" (home) et "a" (away)
        # avec {id, title, short_title} pour chaque équipe
        home_data = match["h"]
        away_data = match["a"]

        # Upsert des deux équipes (création si elles n'existent pas encore)
        home_id = upsert_equipe(home_data["title"], home_data["short_title"], ligue_nom)
        away_id = upsert_equipe(away_data["title"], away_data["short_title"], ligue_nom)

        # Upsert du match avec son identifiant Understat
        upsert_match(match, home_id, away_id, ligue_nom)

    total = len(termines) + len(a_venir)
    print(f"  {len(termines)} terminés + {len(a_venir)} à venir = {total} matchs importés")


# ================================
# Point d'entrée
# ================================

async def run() -> None:
    """
    Lance la collecte pour toutes les ligues, une par une.
    La session aiohttp est partagée pour réutiliser les connexions HTTP.
    """
    async with aiohttp.ClientSession() as session:
        for ligue_key, ligue_nom in LIGUES.items():
            await fetch_ligue(session, ligue_key, ligue_nom)

    print("\nImport terminé !")


# Compatibilité avec fetch_all.py qui appelle fetch_and_store_matches()
def fetch_and_store_matches() -> None:
    """Point d'entrée synchrone — enveloppe asyncio.run() pour fetch_all.py."""
    asyncio.run(run())


if __name__ == "__main__":
    asyncio.run(run())
