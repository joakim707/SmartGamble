"""
Récupère les statistiques joueurs (xG, buts, passes décisives, minutes)
depuis Understat et les stocke dans la table 'player_stats' de Supabase.

Understat couvre les 5 grands championnats européens.
Les stats sont récupérées par ligue via get_league_players(),
puis associées aux joueurs déjà en BDD via correspondance de nom (fuzzy matching).

Flow : pour chaque ligue
       → get_league_players(ligue_key, saison) depuis Understat
       → correspondance floue nom Understat ↔ nom en BDD
       → upsert dans player_stats (player_id, saison, minutes, buts, passes)
"""

import asyncio
import os
from difflib import SequenceMatcher

import aiohttp
from understat import Understat
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ================================
# Configuration
# ================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Understat identifie les saisons par l'année de début :
# "2024" correspond à la saison 2024-2025
SAISON          = "2024"
SAISON_LABEL    = "2024-25"   # Libellé utilisé dans la table player_stats en BDD

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mapping clé Understat → nom de la ligue en BDD
# Les clés correspondent aux slugs des URLs understat.com/league/{clé}/{saison}
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
    """
    Calcule la similarité entre deux chaînes (ratio entre 0 et 1).
    Utilisé pour le fuzzy matching des noms de joueurs.
    """
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def construire_index_joueurs(ligue_nom: str) -> dict[str, int]:
    """
    Retourne un index {nom_joueur_minuscule: player.id} pour une ligue.
    Permet de retrouver rapidement un joueur par son nom.
    """
    result = (
        supabase.table("player")
        .select("id, name, team:team_id(league)")
        .execute()
    )
    index = {}
    for p in result.data:
        # On ne garde que les joueurs appartenant à la ligue ciblée
        if p["team"] and p["team"].get("league") == ligue_nom:
            index[p["name"].lower()] = p["id"]
    return index


def trouver_joueur_id(nom_understat: str, index: dict[str, int]) -> int | None:
    """
    Retrouve l'id d'un joueur en BDD à partir de son nom Understat.

    Stratégie en deux étapes :
    1. Correspondance exacte (insensible à la casse) → priorité maximale
    2. Correspondance floue (SequenceMatcher) si ratio > 0.75
       → tolère les accents, espaces et variantes orthographiques
    """
    cle = nom_understat.lower()

    # Étape 1 : correspondance exacte
    if cle in index:
        return index[cle]

    # Étape 2 : correspondance floue
    meilleur_ratio = 0.0
    meilleur_id    = None
    for nom_bdd, pid in index.items():
        ratio = _similarite(cle, nom_bdd)
        if ratio > meilleur_ratio:
            meilleur_ratio = ratio
            meilleur_id    = pid

    # On n'accepte la correspondance floue que si elle dépasse 75% de similarité
    return meilleur_id if meilleur_ratio > 0.75 else None


def upsert_stats(player_id: int, minutes: int, buts: int, passes: int) -> None:
    """
    Insère ou met à jour les stats d'un joueur pour la saison courante.
    La clé de conflit est (player_id, saison) pour éviter les doublons.
    """
    supabase.table("player_stats").upsert(
        {
            "player_id":      player_id,
            "season":         SAISON_LABEL,
            "minutes_played": minutes,
            "goals":          buts,
            "assists":        passes,
        },
        on_conflict="player_id,season",
    ).execute()


# ================================
# Fetch par ligue
# ================================

async def fetch_ligue(session: aiohttp.ClientSession, ligue: dict) -> None:
    """
    Récupère et stocke les stats de tous les joueurs d'une ligue.

    get_league_players() retourne une liste de joueurs avec pour chaque :
    player_name, time (minutes jouées), goals, assists, xG, xA, etc.
    """
    ligue_key = ligue["understat"]
    ligue_nom = ligue["db_name"]
    print(f"\n=== {ligue_nom} ===")

    u = Understat(session)
    try:
        # Récupération de tous les joueurs de la ligue pour la saison ciblée
        joueurs = await u.get_league_players(ligue_key, SAISON)
    except Exception as e:
        print(f"  Erreur Understat : {e}")
        return

    print(f"  {len(joueurs)} joueurs récupérés")

    # Construction de l'index nom → id pour cette ligue
    index    = construire_index_joueurs(ligue_nom)
    mis_a_jour = 0
    non_trouves  = 0

    for joueur in joueurs:
        nom     = joueur.get("player_name", "")
        minutes = int(joueur.get("time", 0))
        buts    = int(joueur.get("goals", 0))
        passes  = int(joueur.get("assists", 0))

        # Recherche du joueur en BDD (exacte puis floue)
        player_id = trouver_joueur_id(nom, index)
        if player_id is None:
            non_trouves += 1
            continue

        try:
            upsert_stats(player_id, minutes, buts, passes)
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
        for ligue in LIGUES:
            await fetch_ligue(session, ligue)

    print("\nTerminé.")


if __name__ == "__main__":
    asyncio.run(run())
