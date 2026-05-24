"""
Récupère les joueurs de chaque équipe via TheSportsDB et les stocke en BDD.

Flow :
  1. Pour chaque équipe en BDD → searchteams → récupère idTeam → stocke team.thesportsdb_id
  2. lookup_all_players → récupère les joueurs → upsert dans player
"""

import os
import time
import requests
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TSDB_KEY = "3"  # Clé publique gratuite TheSportsDB

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def search_team_id(team_name: str) -> str | None:
    """Cherche une équipe sur TheSportsDB par son nom, retourne son idTeam."""
    resp = requests.get(
        f"https://www.thesportsdb.com/api/v1/json/{TSDB_KEY}/searchteams.php",
        params={"t": team_name},
        timeout=10,
    )
    resp.raise_for_status()
    teams = resp.json().get("teams")
    if teams:
        return teams[0]["idTeam"]
    return None


def fetch_players(thesportsdb_id: str) -> list:
    """Récupère tous les joueurs d'une équipe via son ID TheSportsDB."""
    resp = requests.get(
        f"https://www.thesportsdb.com/api/v1/json/{TSDB_KEY}/lookup_all_players.php",
        params={"id": thesportsdb_id},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("player") or []


def upsert_player(player: dict, team_id: int) -> None:
    shirt = player.get("strNumber")
    supabase.table("player").upsert(
        {
            "thesportsdb_id": int(player["idPlayer"]),
            "team_id": team_id,
            "name": player["strPlayer"],
            "position": player.get("strPosition"),
            "nationality": player.get("strNationality"),
            "shirt_number": int(shirt) if shirt and str(shirt).isdigit() else None,
            "photo_url": player.get("strThumb") or None,
        },
        on_conflict="thesportsdb_id",
    ).execute()


def run():
    teams = (
        supabase.table("team")
        .select("id, name, thesportsdb_id")
        .execute()
        .data
    )

    for team in teams:
        team_id = team["id"]
        team_name = team["name"]
        tsdb_id = team.get("thesportsdb_id")

        # Étape 1 : résoudre l'ID TheSportsDB si absent
        if not tsdb_id:
            print(f"Recherche TheSportsDB : {team_name}")
            try:
                tsdb_id = search_team_id(team_name)
            except Exception as e:
                print(f"  Erreur recherche : {e}")
                continue

            if not tsdb_id:
                print(f"  Introuvable : {team_name}")
                continue

            supabase.table("team").update({"thesportsdb_id": int(tsdb_id)}).eq("id", team_id).execute()
            print(f"  ID trouvé : {tsdb_id}")
            time.sleep(0.5)

        # Étape 2 : récupérer et stocker les joueurs
        print(f"Joueurs pour {team_name} (ID TheSportsDB: {tsdb_id})")
        try:
            players = fetch_players(tsdb_id)
        except Exception as e:
            print(f"  Erreur récupération joueurs : {e}")
            continue

        print(f"  {len(players)} joueurs trouvés")
        for player in players:
            try:
                upsert_player(player, team_id)
            except Exception as e:
                print(f"  Erreur upsert {player.get('strPlayer')} : {e}")

        time.sleep(0.5)

    print("\nTerminé.")


if __name__ == "__main__":
    run()
