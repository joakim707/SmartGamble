"""
Récupère les statistiques joueurs (xG, buts, passes décisives, minutes)
depuis l'API Understat et les stocke dans la table 'player_stats' de Supabase.

Understat expose un endpoint POST non documenté mais fonctionnel :
  POST https://understat.com/main/getPlayersStats/
  Body : league=EPL&season=2024
  Réponse : {"success": true, "players": [...]}

Ce endpoint retourne les statistiques agrégées sur toute la saison pour chaque
joueur ayant participé au championnat (xG, xA, buts, passes, minutes jouées...).

Flow : pour chaque ligue
       → POST main/getPlayersStats/ avec league et season
       → correspondance floue nom Understat ↔ nom en BDD
       → upsert dans player_stats (player_id, saison, minutes, buts, passes)
"""

import asyncio
import json
import os
from difflib import SequenceMatcher

import aiohttp
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ================================
# Configuration
# ================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Understat identifie les saisons par l'année de début : "2024" = saison 2024-25
SAISON       = "2024"
SAISON_LABEL = "2024-25"   # Libellé utilisé dans la table player_stats en BDD

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# URL de l'endpoint Understat découvert par analyse du JS de understat.com
UNDERSTAT_PLAYERS_URL = "https://understat.com/main/getPlayersStats/"

# En-têtes simulant une requête AJAX depuis le navigateur
# X-Requested-With est requis par le serveur pour accepter la requête
UNDERSTAT_HEADERS = {
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
    "Referer":          "https://understat.com/",
}

# Mapping clé Understat (utilisée dans les requêtes) → nom de la ligue en BDD
LIGUES = [
    {"understat": "EPL",        "db_name": "Premier League"},
    {"understat": "La_liga",    "db_name": "La Liga"},
    {"understat": "Bundesliga", "db_name": "Bundesliga"},
    {"understat": "Serie_A",    "db_name": "Serie A"},
    {"understat": "Ligue_1",    "db_name": "Ligue 1"},
]


# ================================
# Helpers
# ================================

def _similarite(a: str, b: str) -> float:
    """Calcule la similarité entre deux noms (ratio 0→1). Utilisé pour le fuzzy matching."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def construire_index_joueurs(ligue_nom: str) -> dict[str, int]:
    """
    Retourne un index {nom_joueur_minuscule: player.id} pour une ligue donnée.
    Permet de retrouver rapidement un joueur par son nom lors du matching.
    """
    result = supabase.table("player").select("id, name, team:team_id(league)").execute()
    index = {}
    for p in result.data:
        # On ne conserve que les joueurs de la ligue ciblée
        if p["team"] and p["team"].get("league") == ligue_nom:
            index[p["name"].lower()] = p["id"]
    return index


def trouver_joueur_id(nom_understat: str, index: dict[str, int]) -> int | None:
    """
    Associe un nom de joueur Understat à un joueur en BDD.

    Étape 1 : correspondance exacte (insensible à la casse) — rapide
    Étape 2 : correspondance floue (SequenceMatcher) si ratio > 0.75
              → tolère les accents, variantes orthographiques et abréviations
    """
    cle = nom_understat.lower()

    if cle in index:
        return index[cle]

    meilleur_ratio = 0.0
    meilleur_id    = None
    for nom_bdd, pid in index.items():
        ratio = _similarite(cle, nom_bdd)
        if ratio > meilleur_ratio:
            meilleur_ratio = ratio
            meilleur_id    = pid

    return meilleur_id if meilleur_ratio > 0.75 else None


def upsert_stats(player_id: int, minutes: int, buts: int, passes: int,
                 key_passes: float, xa: float, npxg: float, shots: float) -> None:
    """
    Insère ou met à jour les stats d'un joueur pour la saison courante.
    La clé de conflit (player_id, season) empêche les doublons.
    """
    supabase.table("player_stats").upsert(
        {
            "player_id":      player_id,
            "season":         SAISON_LABEL,
            "minutes_played": minutes,
            "goals":          buts,
            "assists":        passes,
            "key_passes":     key_passes,
            "xa":             xa,
            "npxg":           npxg,
            "shots":          shots,
        },
        on_conflict="player_id,season",
    ).execute()


# ================================
# Fetch par ligue
# ================================

async def fetch_ligue(session: aiohttp.ClientSession, ligue: dict) -> None:
    """
    Récupère et stocke les stats de tous les joueurs d'une ligue via Understat.

    Appel : POST https://understat.com/main/getPlayersStats/
    Body  : league=EPL&season=2024
    Réponse JSON : {"success": true, "players": [{player_name, time, goals, assists, xG...}]}
    """
    ligue_key = ligue["understat"]
    ligue_nom = ligue["db_name"]
    print(f"\n=== {ligue_nom} ===")

    # Retry jusqu'à 3 fois en cas de déconnexion serveur
    for tentative in range(1, 4):
        try:
            async with session.post(
                UNDERSTAT_PLAYERS_URL,
                data={"league": ligue_key, "season": SAISON},
                headers=UNDERSTAT_HEADERS,
            ) as resp:
                if resp.status != 200:
                    print(f"  Erreur HTTP {resp.status}")
                    return
                # Understat retourne content-type: text/javascript, pas application/json
                # resp.json() lèverait ContentTypeError — on parse manuellement
                data = json.loads(await resp.text())
            break  # succès
        except aiohttp.ClientError as e:
            if tentative == 3:
                print(f"  Échec après 3 tentatives : {e}")
                return
            print(f"  Tentative {tentative}/3 échouée ({e}), retry dans 5s...")
            await asyncio.sleep(5)

    if not data.get("success"):
        print("  Échec : success=false dans la réponse")
        return

    joueurs = data.get("players", [])
    print(f"  {len(joueurs)} joueurs récupérés")

    # Construction de l'index nom → id pour cette ligue
    index      = construire_index_joueurs(ligue_nom)
    mis_a_jour = 0
    non_trouves = 0

    for joueur in joueurs:
        nom        = joueur.get("player_name", "")
        minutes    = int(joueur.get("time", 0))
        buts       = int(joueur.get("goals", 0))
        passes     = int(joueur.get("assists", 0))
        key_passes = float(joueur.get("key_passes", 0))
        xa         = float(joueur.get("xA", 0))
        npxg       = float(joueur.get("npxG", 0))
        shots      = float(joueur.get("shots", 0))

        player_id = trouver_joueur_id(nom, index)
        if player_id is None:
            non_trouves += 1
            continue

        try:
            upsert_stats(player_id, minutes, buts, passes, key_passes, xa, npxg, shots)
            mis_a_jour += 1
        except Exception as e:
            print(f"  Erreur upsert {nom} : {e}")

    print(f"  {mis_a_jour} joueurs mis à jour, {non_trouves} non trouvés en BDD")


# ================================
# Point d'entrée
# ================================

async def run() -> None:
    """Lance la collecte des stats pour toutes les ligues, une par une."""
    async with aiohttp.ClientSession() as session:
        for i, ligue in enumerate(LIGUES):
            if i > 0:
                await asyncio.sleep(3)
            await fetch_ligue(session, ligue)

    print("\nTerminé.")


if __name__ == "__main__":
    asyncio.run(run())
