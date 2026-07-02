"""
Récupère les classements des 5 grands championnats depuis API-Sports
et les stocke dans la table 'standing' de Supabase.

API-Sports free tier : saisons 2022 à 2024 uniquement.
On utilise la saison 2024 (= 2024-25) comme référence.
"""

import os
import requests
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL    = os.getenv("SUPABASE_URL")
SUPABASE_KEY    = os.getenv("SUPABASE_KEY")
API_SPORTS_KEY  = os.getenv("API_SPORTS_KEY")
API_SPORTS_URL  = os.getenv("API_SPORTS_URL", "https://v3.football.api-sports.io")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

HEADERS = {"x-apisports-key": API_SPORTS_KEY}

# Saison la plus récente disponible sur le free tier API-Sports
SEASON = 2024

# IDs API-Sports → noms stockés en BDD (doivent correspondre à la table 'match')
LEAGUES = {
    39:  "Premier League",
    140: "La Liga",
    78:  "Bundesliga",
    135: "Serie A",
    61:  "Ligue 1",
}


def fetch_league_standings(league_id: int, league_name: str) -> None:
    print(f"\n  [{league_name}] Récupération saison {SEASON}...")

    resp = requests.get(
        f"{API_SPORTS_URL}/standings",
        headers=HEADERS,
        params={"league": league_id, "season": SEASON},
    )
    data = resp.json()

    if not data.get("response"):
        print(f"  ✗ Impossible : {data.get('errors', data)}")
        return

    try:
        rows_api = data["response"][0]["league"]["standings"][0]
    except (IndexError, KeyError) as e:
        print(f"  ✗ Structure inattendue : {e}")
        return

    # Supprime l'ancien classement pour cette ligue
    supabase.table("standing").delete().eq("league", league_name).execute()

    payloads = []
    for row in rows_api:
        payloads.append({
            "league":         league_name,
            "rank":           row["rank"],
            "team_name":      row["team"]["name"],
            "logo_url":       row["team"].get("logo", ""),
            "played":         row["all"]["played"],
            "win":            row["all"]["win"],
            "draw":           row["all"]["draw"],
            "lose":           row["all"]["lose"],
            "goals_for":      row["all"]["goals"]["for"],
            "goals_against":  row["all"]["goals"]["against"],
            "points":         row["points"],
        })

    if payloads:
        supabase.table("standing").insert(payloads).execute()
        print(f"  ✓ {len(payloads)} équipes insérées.")


def run():
    if not API_SPORTS_KEY:
        print("Erreur : API_SPORTS_KEY manquant dans .env")
        return

    print(f"Mise à jour des classements (saison {SEASON})...")
    for league_id, league_name in LEAGUES.items():
        fetch_league_standings(league_id, league_name)
    print("\nClassements mis à jour.")


if __name__ == "__main__":
    run()
