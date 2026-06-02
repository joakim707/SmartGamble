"""
Récupère les compositions de match depuis SofaScore et les stocke en BDD.

Flow : pour chaque match avec un sofascore_id en BDD
       → GET /api/v1/event/{sofascore_id}/lineups
       → upsert joueurs dans 'player' (via sofascore_id)
       → upsert titulaires + absents dans 'lineup'

Pré-requis : migration 003 appliquée (colonne sofascore_id sur match et player,
             colonne is_absent sur lineup).
"""

import os
import time
from curl_cffi import requests          # imite le fingerprint TLS de Chrome (bypass Cloudflare)
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ================================
# Configuration
# ================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# En-têtes complets imitant Chrome 124 — identiques à fetch_matches.py
SOFA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":             "*/*",
    "Accept-Language":    "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding":    "gzip, deflate, br",
    "Referer":            "https://www.sofascore.com/",
    "Origin":             "https://www.sofascore.com",
    "DNT":                "1",
    "Connection":         "keep-alive",
    "Cache-Control":      "no-cache",
    "Pragma":             "no-cache",
    "sec-ch-ua":          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile":   "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest":     "empty",
    "sec-fetch-mode":     "cors",
    "sec-fetch-site":     "same-origin",
}

# Session curl_cffi : imite Chrome 124 au niveau TLS pour contourner Cloudflare
_session = requests.Session(impersonate="chrome124")
_session.headers.update(SOFA_HEADERS)

# SofaScore utilise des codes de position à une lettre
POSITION_MAP = {
    "G": "Goalkeeper",
    "D": "Defender",
    "M": "Midfielder",
    "F": "Forward",
}


# ================================
# Helpers
# ================================

def upsert_player(sofa_player: dict, team_id: int) -> int | None:
    """
    Insère ou met à jour un joueur via son sofascore_id.
    Retourne l'id Supabase du joueur, ou None si les données sont incomplètes.
    """
    sofa_id  = sofa_player.get("id")
    # SofaScore fournit "name" (nom complet) et "shortName" (nom court)
    name     = sofa_player.get("name") or sofa_player.get("shortName", "")
    pos_code = sofa_player.get("position")
    position = POSITION_MAP.get(pos_code, pos_code)  # conserve le code original si inconnu

    if not sofa_id or not name:
        return None

    result = supabase.table("player").upsert(
        {
            "sofascore_id": sofa_id,
            "team_id":      team_id,
            "name":         name,
            "position":     position,
        },
        on_conflict="sofascore_id",
    ).execute()

    if not result.data:
        return None
    return result.data[0]["id"]


def upsert_lineup_entry(
    match_id: int,
    team_id: int,
    player_id: int,
    is_starter: bool,
    is_absent: bool,
) -> None:
    """
    Insère ou met à jour une ligne de composition pour un match.
    La clé de conflit (match_id, team_id, player_id) est définie dans la migration 002.
    """
    supabase.table("lineup").upsert(
        {
            "match_id":   match_id,
            "team_id":    team_id,
            "player_id":  player_id,
            "is_starter": is_starter,
            "is_absent":  is_absent,
        },
        on_conflict="match_id,team_id,player_id",
    ).execute()


def resolve_team_id(team_name: str) -> int | None:
    """
    Cherche l'id Supabase d'une équipe par son nom exact.
    Retourne None si l'équipe n'est pas encore en BDD.
    """
    result = supabase.table("team").select("id").eq("name", team_name).execute()
    if not result.data:
        return None
    return result.data[0]["id"]


def process_side(match_id: int, side_data: dict) -> None:
    """
    Traite un côté (home ou away) d'une réponse lineup SofaScore :
    — upsert les joueurs (titulaires + remplaçants)
    — upsert les absents (blessés, suspendus, incertains)
    """
    team_name = side_data.get("team", {}).get("name", "")
    team_id   = resolve_team_id(team_name)

    if team_id is None:
        print(f"    [skip] Équipe inconnue en BDD : {team_name}")
        return

    # ── Joueurs de la feuille de match (titulaires + remplaçants) ──
    for entry in side_data.get("players", []):
        sofa_player = entry.get("player", {})
        # substitute=False → titulaire, substitute=True → remplaçant
        is_starter  = not entry.get("substitute", True)
        player_id   = upsert_player(sofa_player, team_id)
        if player_id:
            upsert_lineup_entry(match_id, team_id, player_id, is_starter, is_absent=False)

    # ── Joueurs absents (blessés, suspendus, incertains) ────────────
    for entry in side_data.get("missingPlayers", []):
        sofa_player = entry.get("player", {})
        player_id   = upsert_player(sofa_player, team_id)
        if player_id:
            upsert_lineup_entry(match_id, team_id, player_id, is_starter=False, is_absent=True)
            # Marquer aussi l'absence sur la table player (drapeau global)
            supabase.table("player").update({"is_absent": True}).eq("id", player_id).execute()


def fetch_lineups_for_match(match_id: int, sofa_event_id: int) -> None:
    """
    Récupère la composition d'un match depuis l'API SofaScore
    et la stocke en BDD (titulaires + absents pour les deux équipes).
    """
    url = f"https://api.sofascore.com/api/v1/event/{sofa_event_id}/lineups"

    try:
        resp = _session.get(url, timeout=15)
    except requests.RequestException as e:
        print(f"    Erreur réseau (event {sofa_event_id}) : {e}")
        return

    if resp.status_code == 404:
        # Composition pas encore publiée par SofaScore
        print(f"    Pas de compo disponible pour l'événement {sofa_event_id}")
        return
    if resp.status_code != 200:
        print(f"    HTTP {resp.status_code} pour l'événement {sofa_event_id}")
        return

    data = resp.json()

    # SofaScore retourne "home" et "away" dans la réponse
    for side in ("home", "away"):
        side_data = data.get(side)
        if side_data:
            process_side(match_id, side_data)


# ================================
# Point d'entrée
# ================================

def run() -> None:
    """
    Parcourt tous les matchs de la BDD qui ont un sofascore_id
    et récupère leur composition depuis SofaScore.
    """
    # Filtre PostgREST "not.is.null" → retourne uniquement les matchs avec sofascore_id
    result = (
        supabase.table("match")
        .select("id, sofascore_id, status")
        .filter("sofascore_id", "not.is", "null")
        .execute()
    )

    # Initialiser la session pour obtenir les cookies Cloudflare
    try:
        _session.get("https://www.sofascore.com/", timeout=10)
    except requests.RequestException:
        pass

    matches = result.data or []
    print(f"\n{len(matches)} matchs avec sofascore_id trouvés en BDD")

    for match in matches:
        match_id      = match["id"]
        sofa_event_id = match["sofascore_id"]
        status        = match["status"]
        print(f"  Match {match_id} (sofa:{sofa_event_id}) [{status}]")

        fetch_lineups_for_match(match_id, sofa_event_id)
        time.sleep(0.6)  # Respecter le rate limit SofaScore (~1 req/s)

    print("\nCompositions importées !")


if __name__ == "__main__":
    run()
