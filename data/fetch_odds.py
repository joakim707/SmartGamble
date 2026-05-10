import os
import re
import requests
from difflib import SequenceMatcher
from supabase import create_client
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

# ================================
# Config
# ================================
ODDS_API_KEY = os.getenv("ODDS_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

BASE_URL = "https://api.the-odds-api.com/v4"

LEAGUES = {
    "soccer_france_ligue_one": "Ligue 1",
    "soccer_spain_la_liga":    "La Liga",
}

BOOKMAKERS = "bet365,unibet,betclic,winamax"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ================================
# Helpers
# ================================
_NOISE = re.compile(r"['\-.]")

def _norm(name: str) -> str:
    """Lowercase + collapse hyphens/apostrophes to spaces."""
    return re.sub(r"\s+", " ", _NOISE.sub(" ", name.lower())).strip()


def _sim(a: str, b: str) -> float:
    """Similarity in [0, 1]: substring shortcut first, then SequenceMatcher."""
    na, nb = _norm(a), _norm(b)
    if na in nb or nb in na:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


MATCH_THRESHOLD = 0.45


def find_match_id(home_name: str, away_name: str, league_name: str) -> int | None:
    """
    Cherche le meilleur match upcoming en BDD par score de similarité.
    Gère les écarts de nommage entre the-odds-api et football-data.org
    (ex: "Paris Saint Germain" ↔ "Paris Saint-Germain FC").
    """
    result = (
        supabase.table("match")
        .select("id, home_team:home_team_id(name), away_team:away_team_id(name)")
        .eq("league", league_name)
        .eq("status", "upcoming")
        .execute()
    )

    best_id, best_score = None, 0.0

    for match in result.data:
        home_score = _sim(home_name, match["home_team"]["name"])
        away_score = _sim(away_name, match["away_team"]["name"])

        if home_score >= MATCH_THRESHOLD and away_score >= MATCH_THRESHOLD:
            score = (home_score + away_score) / 2
            if score > best_score:
                best_score = score
                best_id = match["id"]

    return best_id


def upsert_odds(match_id: int, bookmaker: str, home: float, draw: float, away: float):
    """Insère ou met à jour les cotes d'un bookmaker pour un match."""
    supabase.table("odds").upsert(
        {
            "match_id":  match_id,
            "bookmaker": bookmaker,
            "odds_home": home,
            "odds_draw": draw,
            "odds_away": away,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="match_id,bookmaker",
    ).execute()


# ================================
# Main
# ================================
def fetch_and_store_odds():
    for sport_key, league_name in LEAGUES.items():
        print(f"\nRécupération des cotes — {league_name}...")

        response = requests.get(
            f"{BASE_URL}/sports/{sport_key}/odds",
            params={
                "apiKey":     ODDS_API_KEY,
                "regions":    "eu",
                "markets":    "h2h",
                "bookmakers": BOOKMAKERS,
                "oddsFormat": "decimal",
            },
        )

        remaining = response.headers.get("x-requests-remaining", "?")
        print(f"  Requêtes restantes : {remaining}")

        if response.status_code != 200:
            print(f"  Erreur API : {response.status_code} - {response.text}")
            continue

        events = response.json()
        print(f"  {len(events)} événements trouvés")

        for event in events:
            home_name = event["home_team"]
            away_name = event["away_team"]

            match_id = find_match_id(home_name, away_name, league_name)
            if not match_id:
                print(f"  Match non trouvé en BDD : {home_name} vs {away_name}")
                continue

            for bookmaker in event.get("bookmakers", []):
                bk_name = bookmaker["title"]
                for market in bookmaker.get("markets", []):
                    if market["key"] != "h2h":
                        continue

                    outcomes = {o["name"]: o["price"] for o in market["outcomes"]}
                    home_odd = outcomes.get(home_name)
                    away_odd = outcomes.get(away_name)
                    draw_odd = outcomes.get("Draw")

                    if not all([home_odd, away_odd, draw_odd]):
                        continue

                    upsert_odds(match_id, bk_name, home_odd, draw_odd, away_odd)
                    print(f"  {home_name} vs {away_name} — {bk_name} : {home_odd}/{draw_odd}/{away_odd}")

    print("\nImport des cotes terminé !")


if __name__ == "__main__":
    fetch_and_store_odds()
