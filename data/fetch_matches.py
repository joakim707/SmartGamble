"""
Récupère les matchs des 5 grands championnats depuis football-data.org
et les stocke dans la table 'match' de Supabase.

football-data.org est une API REST officielle et gratuite (tier 1 : 10 req/min).
Elle couvre les 5 grandes ligues européennes avec résultats, scores et calendrier.

Flow : pour chaque ligue
       → GET /v4/competitions/{code}/matches?season=2024
       → upsert équipes dans 'team'
       → upsert matchs dans 'match' avec fd_match_id comme clé
"""

import asyncio
import os
from datetime import datetime

import aiohttp
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ================================
# Configuration
# ================================

SUPABASE_URL         = os.getenv("SUPABASE_URL")
SUPABASE_KEY         = os.getenv("SUPABASE_KEY")
FOOTBALL_DATA_TOKEN  = os.getenv("FOOTBALL_DATA_API_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# football-data.org identifie les saisons par l'année de début : 2024 = 2024-25
SAISON = "2025"

# Codes de compétition football-data.org → noms affichés en BDD
LIGUES = {
    "PL":  "Premier League",   # Premier League (Angleterre)
    "PD":  "La Liga",          # Primera Division (Espagne)
    "BL1": "Bundesliga",       # 1. Bundesliga (Allemagne)
    "SA":  "Serie A",          # Serie A (Italie)
    "FL1": "Ligue 1",          # Ligue 1 (France)
}

# Mapping statut football-data.org → notre convention
STATUS_MAP = {
    "SCHEDULED":  "upcoming",
    "TIMED":      "upcoming",
    "IN_PLAY":    "live",
    "PAUSED":     "live",
    "FINISHED":   "finished",
    "CANCELLED":  "cancelled",
    "POSTPONED":  "cancelled",
    "SUSPENDED":  "cancelled",
    "AWARDED":    "finished",
}

# En-têtes HTTP requis par football-data.org
def _headers() -> dict:
    return {"X-Auth-Token": FOOTBALL_DATA_TOKEN}


# ================================
# Helpers Supabase
# ================================

def upsert_equipe(nom: str, nom_court: str, ligue: str, logo_url: str = "") -> int:
    """
    Insère l'équipe si elle n'existe pas encore, ou met à jour son logo.
    Recherche par nom exact pour éviter les doublons.
    Retourne l'id Supabase de l'équipe.
    """
    existant = supabase.table("team").select("id").eq("name", nom).execute()
    if existant.data:
        team_id = existant.data[0]["id"]
        if logo_url:
            supabase.table("team").update({"logo_url": logo_url}).eq("id", team_id).execute()
        return team_id

    result = supabase.table("team").insert({
        "name":       nom,
        "short_name": nom_court,
        "league":     ligue,
        "logo_url":   logo_url,
    }).execute()
    return result.data[0]["id"]


def upsert_match(match: dict, home_id: int, away_id: int, ligue: str) -> None:
    """
    Insère ou met à jour un match avec fd_match_id comme clé de conflit.

    football-data.org fournit :
    - utcDate : date ISO 8601 en UTC
    - status  : FINISHED, SCHEDULED, IN_PLAY, etc.
    - score.fullTime.home / .away : score final

    Si le match existe déjà (même fd_match_id), le statut et le score sont mis à jour.
    """
    fd_id  = match["id"]                         # identifiant football-data.org
    status = STATUS_MAP.get(match.get("status", ""), "upcoming")

    # football-data.org retourne la date en ISO 8601 UTC ("2024-08-16T19:00:00Z")
    match_date = match.get("utcDate")

    # Le score n'est disponible que si le match est terminé
    score = match.get("score", {}).get("fullTime", {})
    score_home = score.get("home") if status == "finished" else None
    score_away = score.get("away") if status == "finished" else None

    payload = {
        "fd_match_id":  fd_id,
        "home_team_id": home_id,
        "away_team_id": away_id,
        "league":       ligue,
        "match_date":   match_date,
        "status":       status,
        "score_home":   score_home,
        "score_away":   score_away,
    }

    # on_conflict="fd_match_id" : mise à jour si le match existe déjà
    supabase.table("match").upsert(payload, on_conflict="fd_match_id").execute()


# ================================
# Fetch par championnat
# ================================

async def fetch_ligue(
    session: aiohttp.ClientSession, code: str, ligue_nom: str
) -> None:
    """
    Récupère et stocke tous les matchs d'un championnat depuis football-data.org.

    Un seul appel GET suffit pour obtenir TOUS les matchs de la saison
    (terminés + à venir), contrairement à l'approche round-par-round précédente.
    """
    print(f"\n=== {ligue_nom} ===")

    url = f"https://api.football-data.org/v4/competitions/{code}/matches"

    # Petite pause pour respecter la limite de 10 requêtes/min du tier gratuit
    await asyncio.sleep(6)

    async with session.get(url, params={"season": SAISON}, headers=_headers()) as resp:
        if resp.status != 200:
            print(f"  Erreur {resp.status} : {await resp.text()}")
            return
        data = await resp.json()

    matchs = data.get("matches", [])
    print(f"  {len(matchs)} matchs reçus")

    termines = 0
    a_venir  = 0

    for match in matchs:
        home = match.get("homeTeam", {})
        away = match.get("awayTeam", {})

        # Certains matchs futurs n'ont pas encore d'équipes assignées
        if not home.get("name") or not away.get("name"):
            continue

        home_id = upsert_equipe(home["name"], home.get("shortName", ""), ligue_nom, home.get("crest", ""))
        away_id = upsert_equipe(away["name"], away.get("shortName", ""), ligue_nom, away.get("crest", ""))
        upsert_match(match, home_id, away_id, ligue_nom)

        if match.get("status") == "FINISHED":
            termines += 1
        else:
            a_venir += 1

    print(f"  {termines} terminés + {a_venir} à venir importés")


# ================================
# Point d'entrée
# ================================

async def run() -> None:
    """Lance la collecte pour toutes les ligues, avec pause entre chaque requête."""
    if not FOOTBALL_DATA_TOKEN:
        print("ERREUR : FOOTBALL_DATA_API_KEY manquant dans le .env")
        print("Inscris-toi gratuitement sur https://www.football-data.org/")
        return

    async with aiohttp.ClientSession() as session:
        for code, ligue_nom in LIGUES.items():
            await fetch_ligue(session, code, ligue_nom)

    print("\nImport terminé !")


# Compatibilité avec fetch_all.py
def fetch_and_store_matches() -> None:
    """Point d'entrée synchrone pour fetch_all.py."""
    asyncio.run(run())


if __name__ == "__main__":
    asyncio.run(run())
