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

LEAGUE_CODE = "FL1"
LEAGUE_NAME = "Ligue 1"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ================================
# Helpers
# ================================
def upsert_team(team_data: dict) -> int:
    """Insère ou met à jour une équipe, retourne son id Supabase."""
    name = team_data["name"]
    payload = {
        "name":       name,
        "short_name": team_data.get("shortName", name[:20]),
        "league":     LEAGUE_NAME,
        "logo_url":   team_data.get("crest"),
    }
    # SELECT first (no unique constraint on name in schema)
    existing = supabase.table("team").select("id").eq("name", name).execute()
    if existing.data:
        team_id = existing.data[0]["id"]
        supabase.table("team").update(payload).eq("id", team_id).execute()
        return team_id
    result = supabase.table("team").insert(payload).execute()
    return result.data[0]["id"]


def upsert_match(match_data: dict, home_id: int, away_id: int):
    """Insère ou met à jour un match."""
    match_date = match_data["utcDate"]

    status_map = {
        "SCHEDULED": "upcoming",
        "LIVE":      "upcoming",
        "IN_PLAY":   "upcoming",
        "PAUSED":    "upcoming",
        "FINISHED":  "finished",
        "CANCELLED": "cancelled",
        "POSTPONED": "cancelled",
    }
    status = status_map.get(match_data["status"], "upcoming")

    score     = match_data.get("score", {})
    full_time = score.get("fullTime", {})

    payload = {
        "home_team_id": home_id,
        "away_team_id": away_id,
        "league":       LEAGUE_NAME,
        "match_date":   match_date,
        "status":       status,
        "score_home":   full_time.get("home"),
        "score_away":   full_time.get("away"),
    }
    supabase.table("match").upsert(
        payload, on_conflict="home_team_id,away_team_id,match_date"
    ).execute()


# ================================
# Main
# ================================
def fetch_and_store_matches():
    print(f"Récupération des matchs {LEAGUE_NAME}...")

    # Fetch scheduled matches
    response = requests.get(
        f"{BASE_URL}/competitions/{LEAGUE_CODE}/matches",
        headers=HEADERS,
        params={"status": "SCHEDULED"},
    )
    if response.status_code != 200:
        print(f"Erreur API : {response.status_code} - {response.text}")
        return

    matches = response.json().get("matches", [])
    print(f"{len(matches)} matchs trouvés")

    for match in matches:
        home = match["homeTeam"]
        away = match["awayTeam"]

        home_id = upsert_team(home)
        away_id = upsert_team(away)
        upsert_match(match, home_id, away_id)

        print(f"  {home['name']} vs {away['name']} — {match['utcDate'][:10]}")

    # Also fetch finished matches (for form calculation)
    response_finished = requests.get(
        f"{BASE_URL}/competitions/{LEAGUE_CODE}/matches",
        headers=HEADERS,
        params={"status": "FINISHED"},
    )
    if response_finished.status_code == 200:
        finished = response_finished.json().get("matches", [])
        print(f"\n{len(finished)} matchs terminés récupérés")
        for match in finished:
            home = match["homeTeam"]
            away = match["awayTeam"]
            home_id = upsert_team(home)
            away_id = upsert_team(away)
            upsert_match(match, home_id, away_id)

    print("\nImport terminé !")


if __name__ == "__main__":
    fetch_and_store_matches()
