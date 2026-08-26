import os
import re
import random
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
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")

BASE_URL = "https://api.the-odds-api.com/v4"

LEAGUES = {
    "soccer_france_ligue_one":   "Ligue 1",
    "soccer_spain_la_liga":      "La Liga",
    "soccer_germany_bundesliga": "Bundesliga",
}

# Bookmakers FR pertinents avec leurs clés exactes de l'API
BOOKMAKERS = "winamax_fr,unibet_fr,betclic_fr,pmu_fr,betfair_ex_eu,pinnacle,williamhill,unibet_se,unibet_nl,betsson,marathonbet,onexbet"

# ================================
# Config — cotes simulées (mode hors-saison)
# ================================
# the-odds-api.com ne fournit pas de cotes historiques sur le plan gratuit, et son
# endpoint /odds ne renvoie que les vraies rencontres à venir — qui ne tombent jamais
# dans la fenêtre simulée par le dashboard (frontend/lib/api.ts, getUpcomingMatches).
# On génère donc des cotes plausibles à partir du score final des matchs de cette période.
SIM_DATE_FROM  = "2026-01-01T00:00:00"
SIM_DATE_TO    = "2026-05-29T23:59:59"
SIM_LEAGUES    = ["Ligue 1", "Premier League", "La Liga", "Bundesliga", "Serie A"]
SIM_BOOKMAKERS = ["Winamax", "Unibet", "Betclic", "Pinnacle", "Betfair Exchange"]
SIM_OVERROUND  = 1.06  # marge bookmaker (~6%), réaliste pour un marché h2h

supabase = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


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
# Cotes simulées (matchs finished de la période dashboard)
# ================================
def _implied_probabilities(score_home: int, score_away: int) -> tuple[float, float, float]:
    """
    Dérive (p_home, p_draw, p_away) du score final : l'issue réelle est favorisée,
    d'autant plus que l'écart de buts est grand. Léger avantage terrain sur les nuls.
    """
    diff = score_home - score_away
    margin = abs(diff)

    if diff == 0:
        return 0.36, 0.30, 0.34

    p_win = min(0.42 + 0.08 * margin, 0.78)
    p_draw = max(0.28 - 0.05 * margin, 0.10)
    p_lose = 1 - p_win - p_draw

    return (p_win, p_draw, p_lose) if diff > 0 else (p_lose, p_draw, p_win)


def _simulated_odds_for_match(match_id: int, p_home: float, p_draw: float, p_away: float):
    """Cotes décimales par bookmaker simulé : marge + bruit déterministe (seed = match+bookmaker)."""
    for bookmaker in SIM_BOOKMAKERS:
        rng = random.Random(f"{match_id}-{bookmaker}")
        home_odd = round(1 / (p_home * SIM_OVERROUND) * rng.uniform(0.96, 1.04), 2)
        draw_odd = round(1 / (p_draw * SIM_OVERROUND) * rng.uniform(0.96, 1.04), 2)
        away_odd = round(1 / (p_away * SIM_OVERROUND) * rng.uniform(0.96, 1.04), 2)
        yield bookmaker, home_odd, draw_odd, away_odd


def generate_simulated_odds() -> None:
    """Génère des cotes pour les matchs finished de la période simulée par le dashboard."""
    result = (
        supabase.table("match")
        .select("id, league, score_home, score_away")
        .in_("league", SIM_LEAGUES)
        .eq("status", "finished")
        .gte("match_date", SIM_DATE_FROM)
        .lte("match_date", SIM_DATE_TO)
        .filter("score_home", "not.is", "null")
        .filter("score_away", "not.is", "null")
        .execute()
    )
    matches = result.data or []
    print(f"\n{len(matches)} matchs terminés (période simulée) à coter")

    count = 0
    for m in matches:
        p_home, p_draw, p_away = _implied_probabilities(m["score_home"], m["score_away"])
        for bookmaker, home_odd, draw_odd, away_odd in _simulated_odds_for_match(
            m["id"], p_home, p_draw, p_away
        ):
            upsert_odds(m["id"], bookmaker, home_odd, draw_odd, away_odd)
            count += 1

    print(f"{count} lignes de cotes simulées insérées sur {len(matches)} matchs")


# ================================
# Main
# ================================
def fetch_and_store_odds():
    for sport_key, league_name in LEAGUES.items():
        print(f"\nRécupération des cotes — {league_name}...")

        params = {
            "apiKey":     ODDS_API_KEY,
            "regions":    "eu",
            "markets":    "h2h",
            "oddsFormat": "decimal",
        }
        if BOOKMAKERS:
            params["bookmakers"] = BOOKMAKERS

        response = requests.get(f"{BASE_URL}/sports/{sport_key}/odds", params=params)

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
    import argparse

    parser = argparse.ArgumentParser(
        description="Importe les cotes réelles (upcoming) et/ou génère des cotes simulées (finished, période dashboard)."
    )
    parser.add_argument("--skip-real", action="store_true", help="Ne pas interroger the-odds-api.com")
    parser.add_argument("--skip-simulated", action="store_true", help="Ne pas générer de cotes simulées")
    args = parser.parse_args()

    if not args.skip_real:
        fetch_and_store_odds()
    if not args.skip_simulated:
        generate_simulated_odds()
