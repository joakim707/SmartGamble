"""
Diagnostic : liste tous les bookmakers disponibles sur l'API pour nos ligues.
Utilisation : python data/check_bookmakers.py
"""
import os
import requests
from collections import Counter
from dotenv import load_dotenv

load_dotenv()

ODDS_API_KEY = os.getenv("ODDS_API_KEY")
BASE_URL = "https://api.the-odds-api.com/v4"

LEAGUES = {
    "soccer_france_ligue_one":       "Ligue 1",
    "soccer_spain_la_liga":          "La Liga",
    "soccer_england_premier_league": "Premier League",
    "soccer_germany_bundesliga":     "Bundesliga",
}

for sport_key, league_name in LEAGUES.items():
    print(f"\n{'='*50}")
    print(f"  {league_name} ({sport_key})")
    print(f"{'='*50}")

    response = requests.get(
        f"{BASE_URL}/sports/{sport_key}/odds",
        params={
            "apiKey":     ODDS_API_KEY,
            "regions":    "eu",
            "markets":    "h2h",
            "oddsFormat": "decimal",
        },
    )

    remaining = response.headers.get("x-requests-remaining", "?")
    used = response.headers.get("x-requests-used", "?")
    print(f"  Requêtes utilisées: {used}  |  Restantes: {remaining}")

    if response.status_code != 200:
        print(f"  ERREUR {response.status_code}: {response.text}")
        continue

    events = response.json()
    if not events:
        print("  Aucun événement trouvé.")
        continue

    print(f"  {len(events)} événement(s) trouvé(s)\n")

    bookmaker_count: Counter = Counter()
    for event in events:
        for bk in event.get("bookmakers", []):
            bookmaker_count[bk["key"]] += 1

    if not bookmaker_count:
        print("  Aucun bookmaker dans les résultats.")
    else:
        print(f"  {'Clé API':<30} {'Titre':<25} {'Matchs couverts'}")
        print(f"  {'-'*70}")
        # Affiche aussi le titre lisible du premier event pour chaque bookmaker
        bk_titles = {}
        for event in events:
            for bk in event.get("bookmakers", []):
                bk_titles[bk["key"]] = bk["title"]

        for key, count in bookmaker_count.most_common():
            print(f"  {key:<30} {bk_titles.get(key, ''):<25} {count}/{len(events)}")
