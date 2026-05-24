"""
Récupère les effectifs des équipes via football-data.org et les stocke en BDD.

Flow : pour chaque ligue → /v4/competitions/{code}/teams → upsert joueurs dans player
Note: le champ thesportsdb_id stocke ici les IDs football-data.org (réutilisation du schéma).
"""

import os
import time
import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL     = os.getenv("SUPABASE_URL")
SUPABASE_KEY     = os.getenv("SUPABASE_KEY")
FOOTBALL_API_KEY = os.getenv("FOOTBALL_DATA_API_KEY")

HEADERS  = {"X-Auth-Token": FOOTBALL_API_KEY}
BASE_URL = "https://api.football-data.org/v4"

LEAGUES = [
    {"code": "PL",  "name": "Premier League"},
    {"code": "FL1", "name": "Ligue 1"},
    {"code": "PD",  "name": "La Liga"},
    {"code": "BL1", "name": "Bundesliga"},
    {"code": "SA",  "name": "Serie A"},
    {"code": "BSA", "name": "Brasileirão"},
]

# Mapping positions football-data.org → notre convention
POSITION_MAP = {
    "Goalkeeper":          "Goalkeeper",
    "Defence":             "Defender",
    "Centre-Back":         "Defender",
    "Left-Back":           "Defender",
    "Right-Back":          "Defender",
    "Midfield":            "Midfielder",
    "Central Midfield":    "Midfielder",
    "Defensive Midfield":  "Midfielder",
    "Attacking Midfield":  "Midfielder",
    "Offence":             "Forward",
    "Centre-Forward":      "Forward",
    "Left Winger":         "Forward",
    "Right Winger":        "Forward",
}

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def upsert_player(player: dict, team_id: int) -> None:
    raw_pos = player.get("position")
    shirt   = player.get("shirtNumber")
    supabase.table("player").upsert(
        {
            "thesportsdb_id": player["id"],          # football-data.org player ID
            "team_id":        team_id,
            "name":           player["name"],
            "position":       POSITION_MAP.get(raw_pos, raw_pos),
            "nationality":    player.get("nationality"),
            "shirt_number":   shirt if isinstance(shirt, int) else None,
        },
        on_conflict="thesportsdb_id",
    ).execute()


def fetch_league_squads(league_code: str, league_name: str):
    print(f"\n=== {league_name} ===")
    resp = requests.get(
        f"{BASE_URL}/competitions/{league_code}/teams",
        headers=HEADERS,
        timeout=15,
    )

    if resp.status_code == 429:
        print("  Rate limit, attente 60s...")
        time.sleep(60)
        return

    if resp.status_code != 200:
        print(f"  Erreur {resp.status_code} : {resp.text[:120]}")
        return

    teams = resp.json().get("teams", [])
    print(f"  {len(teams)} équipes trouvées")

    for team_data in teams:
        team_name = team_data["name"]
        squad     = team_data.get("squad") or []

        result = supabase.table("team").select("id").eq("name", team_name).execute()
        if not result.data:
            print(f"  [skip] Équipe inconnue en BDD : {team_name}")
            continue

        team_id = result.data[0]["id"]
        print(f"  {team_name} : {len(squad)} joueurs")

        for player in squad:
            try:
                upsert_player(player, team_id)
            except Exception as e:
                print(f"    Erreur {player.get('name')} : {e}")

    # Free tier : 10 req/min → attente 7s entre ligues
    time.sleep(7)


def run():
    for league in LEAGUES:
        fetch_league_squads(league["code"], league["name"])
    print("\nTerminé.")


if __name__ == "__main__":
    run()
