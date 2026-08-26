"""
Récupère les stats joueurs via Understat et les stocke dans player_stats.
Understat couvre : Premier League, La Liga, Bundesliga, Serie A, Ligue 1.
"""

import asyncio
import os
from difflib import SequenceMatcher

import aiohttp
from understat import Understat
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")
SEASON       = "2024"   # Understat utilise l'année de début : 2024 = saison 2024-25
SEASON_LABEL = "2024-25"

supabase = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

# Mapping ligue Understat → nom utilisé en BDD
LEAGUES = [
    {"understat": "epl",        "db_name": "Premier League"},
    {"understat": "la_liga",    "db_name": "La Liga"},
    {"understat": "bundesliga", "db_name": "Bundesliga"},
    {"understat": "serie_a",    "db_name": "Serie A"},
    {"understat": "ligue_1",    "db_name": "Ligue 1"},
]


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def build_player_index(league_name: str) -> dict[str, int]:
    """Retourne {nom_joueur_lowercase: player.id} pour une ligue."""
    result = (
        supabase.table("player")
        .select("id, name, team:team_id(league)")
        .execute()
    )
    index = {}
    for p in result.data:
        if p["team"] and p["team"].get("league") == league_name:
            index[p["name"].lower()] = p["id"]
    return index


def find_player_id(understat_name: str, index: dict[str, int]) -> int | None:
    """Match fuzzy du nom Understat vers notre BDD (ratio > 0.75)."""
    key = understat_name.lower()
    # Correspondance exacte d'abord
    if key in index:
        return index[key]
    # Fuzzy sinon
    best_ratio = 0.0
    best_id    = None
    for db_name, pid in index.items():
        r = _similarity(key, db_name)
        if r > best_ratio:
            best_ratio = r
            best_id    = pid
    return best_id if best_ratio > 0.75 else None


def upsert_stats(player_id: int, minutes: int, goals: int, assists: int) -> None:
    supabase.table("player_stats").upsert(
        {
            "player_id":     player_id,
            "season":        SEASON_LABEL,
            "minutes_played": minutes,
            "goals":         goals,
            "assists":       assists,
        },
        on_conflict="player_id,season",
    ).execute()


async def fetch_league(session: aiohttp.ClientSession, league: dict) -> None:
    understat_key = league["understat"]
    db_name       = league["db_name"]
    print(f"\n=== {db_name} ===")

    u = Understat(session)
    try:
        players = await u.get_league_players(understat_key, SEASON)
    except Exception as e:
        print(f"  Erreur Understat : {e}")
        return

    print(f"  {len(players)} joueurs récupérés")

    index   = build_player_index(db_name)
    matched = 0
    skipped = 0

    for p in players:
        name    = p.get("player_name", "")
        minutes = int(p.get("time", 0))
        goals   = int(p.get("goals", 0))
        assists = int(p.get("assists", 0))

        player_id = find_player_id(name, index)
        if player_id is None:
            skipped += 1
            continue

        try:
            upsert_stats(player_id, minutes, goals, assists)
            matched += 1
        except Exception as e:
            print(f"  Erreur upsert {name} : {e}")

    print(f"  {matched} joueurs mis à jour, {skipped} non trouvés en BDD")


async def run():
    async with aiohttp.ClientSession() as session:
        for league in LEAGUES:
            await fetch_league(session, league)
    print("\nTerminé.")


if __name__ == "__main__":
    asyncio.run(run())
