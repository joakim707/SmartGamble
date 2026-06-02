import os
import requests
from supabase import create_client
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# ================================
# Config
# ================================
FOOTBALL_API_KEY = os.getenv("FOOTBALL_DATA_API_KEY")
SUPABASE_URL     = os.getenv("SUPABASE_URL")
SUPABASE_KEY     = os.getenv("SUPABASE_KEY")

HEADERS  = {"X-Auth-Token": FOOTBALL_API_KEY}
BASE_URL = "https://api.football-data.org/v4"

LEAGUES = [
    {"code": "FL1", "name": "Ligue 1"},
    {"code": "PL",  "name": "Premier League"},
    {"code": "PD",  "name": "La Liga"},
    {"code": "BL1", "name": "Bundesliga"},
    {"code": "SA",  "name": "Serie A"},
]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ================================
# Helpers
# ================================
def upsert_team(team_data: dict, league_name: str) -> int:
    """Insère ou met à jour une équipe, retourne son id Supabase."""
    name = team_data["name"]
    payload = {
        "name":       name,
        "short_name": team_data.get("shortName", name[:20]),
        "league":     league_name,
        "logo_url":   team_data.get("crest"),
    }
    existing = supabase.table("team").select("id").eq("name", name).execute()
    if existing.data:
        team_id = existing.data[0]["id"]
        supabase.table("team").update(payload).eq("id", team_id).execute()
        return team_id
    result = supabase.table("team").insert(payload).execute()
    return result.data[0]["id"]


def upsert_match(match_data: dict, home_id: int, away_id: int, league_name: str):
    """Insère ou met à jour un match."""
    status_map = {
        "SCHEDULED": "upcoming",
        "LIVE":      "upcoming",
        "IN_PLAY":   "upcoming",
        "PAUSED":    "upcoming",
        "FINISHED":  "finished",
        "CANCELLED": "cancelled",
        "POSTPONED": "cancelled",
    }
    status    = status_map.get(match_data["status"], "upcoming")
    full_time = match_data.get("score", {}).get("fullTime", {})

    supabase.table("match").upsert(
        {
            "home_team_id": home_id,
            "away_team_id": away_id,
            "league":       league_name,
            "match_date":   match_data["utcDate"],
            "status":       status,
            "score_home":   full_time.get("home"),
            "score_away":   full_time.get("away"),
        },
        on_conflict="home_team_id,away_team_id,match_date",
    ).execute()


def fetch_league(league_code: str, league_name: str):
    print(f"\n=== {league_name} ({league_code}) ===")

    for status_param in ("SCHEDULED", "FINISHED"):
        response = requests.get(
            f"{BASE_URL}/competitions/{league_code}/matches",
            headers=HEADERS,
            params={"status": status_param},
        )
        if response.status_code != 200:
            print(f"  Erreur {status_param} : {response.status_code} - {response.text}")
            continue

        matches = response.json().get("matches", [])
        print(f"  {len(matches)} matchs {status_param}")

        for match in matches:
            home    = match["homeTeam"]
            away    = match["awayTeam"]
            home_id = upsert_team(home, league_name)
            away_id = upsert_team(away, league_name)
            upsert_match(match, home_id, away_id, league_name)
            if status_param == "SCHEDULED":
                print(f"    {home['name']} vs {away['name']} — {match['utcDate'][:10]}")


# ================================
# Main
# ================================
def fetch_and_store_matches():
    for league in LEAGUES:
        fetch_league(league["code"], league["name"])
    print("\nImport terminé !")


if __name__ == "__main__":
    fetch_and_store_matches()
