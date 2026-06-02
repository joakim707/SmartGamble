"""
Récupère les matchs des 5 grands championnats depuis SofaScore
et les stocke dans la table 'match' de Supabase.

Flow : pour chaque championnat → pages /events/next/* (à venir)
       + pages /events/last/* (terminés, si include_finished=True)
       → upsert équipes + matchs avec leur sofascore_id
"""

import os
import time
import argparse
from datetime import datetime, timezone
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

# En-têtes complets imitant Chrome 124 sur Windows 10.
# SofaScore est protégé par Cloudflare : sans sec-ch-ua et sec-fetch-*, on reçoit 403.
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
    # En-têtes Chromium requis par Cloudflare
    "sec-ch-ua":          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile":   "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest":     "empty",
    "sec-fetch-mode":     "cors",
    "sec-fetch-site":     "same-origin",
}

# Session curl_cffi : imite Chrome 124 au niveau TLS pour contourner Cloudflare
# impersonate="chrome124" → fingerprint JA3/JA4 identique à Chrome 124
_session = requests.Session(impersonate="chrome124")
_session.headers.update(SOFA_HEADERS)

# IDs SofaScore des championnats — saison 2025/2026
CHAMPIONNATS_SOFA = {
    "Premier League": {"tournament_id": 17, "season_id": 76986},
    "Ligue 1":        {"tournament_id": 34, "season_id": 77356},
    "La Liga":        {"tournament_id": 8,  "season_id": 77559},
    "Serie A":        {"tournament_id": 23, "season_id": 76457},
    "Bundesliga":     {"tournament_id": 35, "season_id": 77333},
}

# Correspondance statut SofaScore → notre convention
STATUS_MAP = {
    "notstarted":  "upcoming",
    "inprogress":  "live",
    "finished":    "finished",
    "cancelled":   "cancelled",
    "postponed":   "cancelled",
    "interrupted": "cancelled",
    "abandoned":   "cancelled",
}


# ================================
# Helpers
# ================================

def upsert_team(team_data: dict, league_name: str) -> int:
    """
    Insère ou met à jour une équipe en BDD.
    Le logo est construit à partir de l'ID SofaScore de l'équipe.
    Retourne l'id Supabase de l'équipe.
    """
    name     = team_data["name"]
    sofa_tid = team_data["id"]

    payload = {
        "name":       name,
        "short_name": team_data.get("shortName", name[:20]),
        "league":     league_name,
        # URL du logo SofaScore (PNG 64x64)
        "logo_url": f"https://api.sofascore.com/api/v1/team/{sofa_tid}/image",
    }

    existing = supabase.table("team").select("id").eq("name", name).execute()
    if existing.data:
        team_id = existing.data[0]["id"]
        supabase.table("team").update(payload).eq("id", team_id).execute()
        return team_id

    result = supabase.table("team").insert(payload).execute()
    return result.data[0]["id"]


def upsert_match(event: dict, home_id: int, away_id: int, league_name: str) -> None:
    """
    Insère ou met à jour un match en utilisant sofascore_id comme clé de conflit.
    SofaScore stocke la date de début en timestamp Unix (secondes depuis epoch).
    """
    # Type de statut : "notstarted", "finished", etc.
    status_type = event.get("status", {}).get("type", "notstarted")
    status      = STATUS_MAP.get(status_type, "upcoming")

    # Conversion timestamp Unix → ISO 8601 UTC
    start_ts   = event.get("startTimestamp")
    match_date = (
        datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat()
        if start_ts else None
    )

    # Scores (None si le match n'est pas terminé)
    home_score = event.get("homeScore", {}).get("current")
    away_score = event.get("awayScore", {}).get("current")

    supabase.table("match").upsert(
        {
            "sofascore_id": event["id"],
            "home_team_id": home_id,
            "away_team_id": away_id,
            "league":       league_name,
            "match_date":   match_date,
            "status":       status,
            "score_home":   home_score,
            "score_away":   away_score,
        },
        on_conflict="sofascore_id",
    ).execute()


def _warmup_session() -> None:
    """
    Visite la page d'accueil SofaScore pour obtenir les cookies Cloudflare (__cf_bm).
    Non bloquant : si la requête échoue, les appels API se font quand même.
    """
    try:
        _session.get("https://www.sofascore.com/", timeout=10)
    except Exception:
        pass


def fetch_page(tournament_id: int, season_id: int, page: int, direction: str) -> list:
    """
    Récupère une page d'événements SofaScore via la session persistante.
    direction = "next" (à venir) ou "last" (terminés).
    page = 0 pour la plus récente, 1 pour la suivante, etc.
    Retourne une liste d'événements ou [] en cas d'erreur.
    """
    url = (
        f"https://api.sofascore.com/api/v1/unique-tournament/{tournament_id}"
        f"/season/{season_id}/events/{direction}/{page}"
    )
    try:
        resp = _session.get(url, timeout=15)
    except requests.RequestException as e:
        print(f"    Erreur réseau ({direction}/page {page}) : {e}")
        return []

    if resp.status_code == 404:
        # Plus de pages disponibles pour cette direction
        return []
    if resp.status_code != 200:
        print(f"    HTTP {resp.status_code} pour {direction}/page {page}")
        return []

    return resp.json().get("events", [])


def fetch_league(league_name: str, ids: dict, include_finished: bool) -> None:
    """
    Récupère et stocke tous les matchs d'un championnat.
    Parcourt les matchs à venir (next/*) et, si demandé, les terminés (last/*).
    """
    print(f"\n=== {league_name} ===")
    tid   = ids["tournament_id"]
    sid   = ids["season_id"]
    total = 0

    # ── Matchs à venir ──────────────────────────────────────────────
    for page in range(10):
        events = fetch_page(tid, sid, page, "next")
        if not events:
            break
        for evt in events:
            home_id = upsert_team(evt["homeTeam"], league_name)
            away_id = upsert_team(evt["awayTeam"], league_name)
            upsert_match(evt, home_id, away_id, league_name)
            total += 1
        time.sleep(0.5)  # Respecter le rate limit de SofaScore

    # ── Matchs terminés (données historiques pour l'algo) ───────────
    if include_finished:
        for page in range(15):
            events = fetch_page(tid, sid, page, "last")
            if not events:
                break
            for evt in events:
                home_id = upsert_team(evt["homeTeam"], league_name)
                away_id = upsert_team(evt["awayTeam"], league_name)
                upsert_match(evt, home_id, away_id, league_name)
                total += 1
            time.sleep(0.5)

    print(f"  {total} matchs importés")


# ================================
# Point d'entrée
# ================================

def fetch_and_store_matches(include_finished: bool = True) -> None:
    """Parcourt tous les championnats configurés et stocke leurs matchs."""
    # Initialiser la session pour obtenir les cookies Cloudflare
    _warmup_session()
    for league_name, ids in CHAMPIONNATS_SOFA.items():
        fetch_league(league_name, ids, include_finished)
    print("\nImport terminé !")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Importe les matchs SofaScore dans Supabase."
    )
    parser.add_argument(
        "--no-finished",
        action="store_true",
        help="Ne récupère que les matchs à venir (plus rapide, pour les tests)",
    )
    args = parser.parse_args()
    fetch_and_store_matches(include_finished=not args.no_finished)
