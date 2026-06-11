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
from collections import defaultdict
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


def _reconnect_supabase() -> None:
    """Recrée le client Supabase pour réinitialiser le pool de connexions HTTP/2."""
    global supabase
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Slugs SofaScore par championnat — identiques à fetch_matches.py
LEAGUE_SLUGS = {
    "Premier League": "football/england/premier-league/17",
    "Ligue 1":        "football/france/ligue-1/34",
    "La Liga":        "football/spain/laliga/8",
    "Serie A":        "football/italy/serie-a/23",
    "Bundesliga":     "football/germany/bundesliga/35",
}

# En-têtes complets imitant Chrome 124 — identiques à fetch_matches.py
SOFA_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
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
    "sec-ch-ua":          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile":   "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest":     "empty",
    "sec-fetch-mode":     "cors",
    # api.sofascore.com est un sous-domaine différent de www.sofascore.com → same-site
    "sec-fetch-site":     "same-site",
}

# Session curl_cffi : imite Chrome 124 au niveau TLS pour contourner Cloudflare
_session = requests.Session(impersonate="chrome131")
_session.headers.update(SOFA_HEADERS)


# Playwright ne tourne qu'une seule fois au démarrage (cf_clearance TTL ~1h)
_playwright_initialized = False


def _warmup_with_playwright() -> bool:
    """
    Lance Chromium (headless) via Playwright pour obtenir de vrais cookies Cloudflare.

    Contrairement à curl_cffi, un vrai navigateur exécute le challenge JS de Cloudflare
    et reçoit un cookie cf_clearance (TTL ~1 h) + __cf_bm (TTL ~30 min).
    Ces cookies sont injectés dans la session curl_cffi via l'en-tête Cookie.

    Nécessaire sur les IPs GitHub Actions (AWS) que Cloudflare connaît et défie.
    Retourne True si succès, False si Playwright n'est pas installé ou échoue.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False

    print("  [playwright] Warmup Cloudflare (chromium headless)...")
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            ctx = browser.new_context(
                user_agent=SOFA_HEADERS["User-Agent"],
                locale="fr-FR",
            )
            page = ctx.new_page()

            # Page d'accueil — résout le challenge CF global
            page.goto("https://www.sofascore.com/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)

            # Une page par championnat — obtient les cookies CF spécifiques à chaque ligue
            for league, slug in LEAGUE_SLUGS.items():
                try:
                    page.goto(
                        f"https://www.sofascore.com/tournament/{slug}",
                        wait_until="domcontentloaded",
                        timeout=15000,
                    )
                    time.sleep(1)
                    print(f"  [playwright] {league} ✓")
                except Exception:
                    pass

            # Injecter les cookies dans la session curl_cffi
            cookies = ctx.cookies()
            browser.close()

        cookie_header = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
        _session.headers.update({"Cookie": cookie_header})
        cf = [c["name"] for c in cookies if "cf" in c["name"].lower()]
        print(f"  [playwright] {len(cookies)} cookies injectés — CF: {cf}")
        return True

    except Exception as e:
        print(f"  [playwright warmup échoué] {e}")
        return False


def _warmup_session() -> bool:
    """
    Renouvelle les cookies Cloudflare.

    — Premier appel : Playwright (vrai navigateur) pour obtenir cf_clearance (~1h)
    — Appels suivants (toutes les 50 itérations) : curl_cffi pour rafraîchir __cf_bm (~30 min)
      Pas de relancement de Chromium — trop lent sur 200+ matchs.
    """
    global _playwright_initialized
    if not _playwright_initialized:
        _playwright_initialized = _warmup_with_playwright()
        if _playwright_initialized:
            return True
    # Re-warmup léger : rafraîchit __cf_bm sans relancer Chromium
    try:
        resp = _session.get("https://www.sofascore.com/", timeout=10)
        time.sleep(2)
        return resp.status_code == 200
    except Exception as e:
        print(f"  [warmup curl_cffi échoué] {e}")
        return False


def _get_with_retry(url: str, context: str) -> requests.Response | None:
    """
    GET avec jusqu'à 3 tentatives en cas de 403.
    Entre chaque tentative : warmup + délai croissant (2s, 4s).
    Retourne la Response si status 200, None sinon.
    """
    for attempt in range(3):
        try:
            resp = _session.get(url, timeout=15)
        except requests.RequestException as e:
            print(f"    Erreur réseau {context} (tentative {attempt + 1}) : {e}")
            return None

        if resp.status_code == 200:
            return resp
        if resp.status_code == 404:
            return resp  # appelant gère le 404
        if resp.status_code == 403 and attempt < 2:
            delay = (attempt + 1) * 2
            print(f"    403 {context} → warmup (tentative {attempt + 1}/3, attente {delay}s)")
            ok = _warmup_session()
            if not ok:
                print(f"    Warmup échoué, nouvelle tentative quand même")
            time.sleep(delay)
            continue

        print(f"    HTTP {resp.status_code} {context} (tentative {attempt + 1}/3)")
        return None

    print(f"    3 tentatives épuisées pour {context}, event ignoré")
    return None


def _warmup_league(league: str) -> None:
    """Visite la page du championnat pour obtenir les cookies Cloudflare spécifiques."""
    slug = LEAGUE_SLUGS.get(league)
    if not slug:
        return
    try:
        league_url = f"https://www.sofascore.com/tournament/{slug}"
        _session.headers.update({"Referer": "https://www.sofascore.com/"})
        _session.get(league_url, timeout=10)
        _session.headers.update({"Referer": league_url})
        time.sleep(2)
    except Exception:
        pass

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

def upsert_player(sofa_player: dict, team_id: int, shirt_number: int | None = None) -> int | None:
    """
    Insère ou met à jour un joueur via son sofascore_id.

    sofa_player : objet "player" imbriqué dans l'entrée SofaScore
    shirt_number : numéro de maillot, passé depuis l'entrée parente (shirtNumber)
    Retourne l'id Supabase du joueur, ou None si les données sont incomplètes.
    """
    sofa_id  = sofa_player.get("id")
    name     = sofa_player.get("name") or sofa_player.get("shortName", "")
    pos_code = sofa_player.get("position")
    position = POSITION_MAP.get(pos_code, pos_code)

    # La nationalité est dans player.country.name
    nationality = sofa_player.get("country", {}).get("name")

    if not sofa_id or not name:
        return None

    result = supabase.table("player").upsert(
        {
            "sofascore_id": sofa_id,
            "team_id":      team_id,
            "name":         name,
            "position":     position,
            "nationality":  nationality,
            "shirt_number": shirt_number,
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


def get_match_team_ids(match_id: int) -> tuple[int | None, int | None]:
    """
    Récupère les ids Supabase de l'équipe domicile et extérieure pour un match.
    Plus fiable que de chercher par nom : la réponse lineups SofaScore
    ne contient pas de champ 'team' dans home/away.
    """
    result = supabase.table("match").select("home_team_id, away_team_id").eq("id", match_id).execute()
    if not result.data:
        return None, None
    row = result.data[0]
    return row["home_team_id"], row["away_team_id"]


def process_side(match_id: int, team_id: int, side_data: dict) -> None:
    """
    Traite un côté (home ou away) d'une réponse lineup SofaScore.
    team_id est passé directement depuis le match en BDD (plus fiable que le nom).

    — upsert les joueurs (titulaires + remplaçants) avec numéro et nationalité
    — upsert les absents (blessés, suspendus, incertains)
    """
    # ── Joueurs de la feuille de match (titulaires + remplaçants) ──
    for entry in side_data.get("players", []):
        sofa_player  = entry.get("player", {})
        # substitute=False → titulaire, substitute=True → remplaçant
        is_starter   = not entry.get("substitute", True)
        # shirtNumber est à la racine de l'entrée (entier), pas dans player
        shirt_number = entry.get("shirtNumber")
        player_id    = upsert_player(sofa_player, team_id, shirt_number)
        if player_id:
            upsert_lineup_entry(match_id, team_id, player_id, is_starter, is_absent=False)

    # ── Joueurs absents (blessés, suspendus, incertains) ────────────
    for entry in side_data.get("missingPlayers", []):
        sofa_player  = entry.get("player", {})
        shirt_number = entry.get("shirtNumber")
        player_id    = upsert_player(sofa_player, team_id, shirt_number)
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

    resp = _get_with_retry(url, f"event {sofa_event_id}")
    if resp is None:
        return
    if resp.status_code == 404:
        print(f"    Pas de compo disponible pour l'événement {sofa_event_id}")
        return

    data = resp.json()

    home_data = data.get("home")
    away_data = data.get("away")

    # Pas de données de composition dans la réponse → ne pas toucher les données existantes
    if not home_data and not away_data:
        confirmed = data.get("confirmed", False)
        if not confirmed:
            print(f"    Compo non encore confirmée (event {sofa_event_id})")
        else:
            print(f"    Compo vide (event {sofa_event_id})")
        return

    # Récupérer les team_id depuis la BDD (la réponse lineups n'a pas de champ team)
    home_team_id, away_team_id = get_match_team_ids(match_id)
    if not home_team_id or not away_team_id:
        print(f"    [skip] Match {match_id} introuvable en BDD")
        return

    # Supprimer les anciennes entrées avant d'insérer les nouvelles
    supabase.table("lineup").delete().eq("match_id", match_id).execute()

    sides = {"home": home_team_id, "away": away_team_id}
    for side, team_id in sides.items():
        side_data = data.get(side)
        if side_data:
            process_side(match_id, team_id, side_data)


# ================================
# Point d'entrée
# ================================

def run() -> None:
    """
    Parcourt tous les matchs terminés avec un sofascore_id, par championnat,
    et récupère leur composition depuis SofaScore.
    Les matchs qui ont déjà des compositions sont ignorés.
    """
    # Matchs terminés avec sofascore_id, avec le nom du championnat pour le warmup
    result = (
        supabase.table("match")
        .select("id, sofascore_id, league")
        .filter("sofascore_id", "not.is", "null")
        .eq("status", "finished")
        .execute()
    )
    matches = result.data or []
    print(f"\n{len(matches)} matchs terminés avec sofascore_id")

    # Étape 1 : IDs des joueurs ayant un sofascore_id (vrais joueurs SofaScore)
    sofa_player_ids: set[int] = set()
    offset = 0
    while True:
        page = (
            supabase.table("player")
            .select("id")
            .filter("sofascore_id", "not.is", "null")
            .range(offset, offset + 999)
            .execute()
        )
        if not page.data:
            break
        for row in page.data:
            sofa_player_ids.add(row["id"])
        if len(page.data) < 1000:
            break
        offset += 1000
    print(f"{len(sofa_player_ids)} joueurs SofaScore en BDD")

    # Étape 2 : Match IDs ayant au moins un joueur SofaScore → skip (déjà traités)
    # Les matchs avec seulement des compos algo (player.sofascore_id null) sont re-traités.
    already_done: set[int] = set()
    offset = 0
    while True:
        page = (
            supabase.table("lineup")
            .select("match_id, player_id")
            .range(offset, offset + 999)
            .execute()
        )
        if not page.data:
            break
        for row in page.data:
            if row["player_id"] in sofa_player_ids:
                already_done.add(row["match_id"])
        if len(page.data) < 1000:
            break
        offset += 1000
    print(f"{len(already_done)} matchs déjà en BDD, ignorés")

    # Grouper par championnat pour le warmup par ligue
    by_league: dict[str, list] = defaultdict(list)
    for m in matches:
        if m["id"] not in already_done:
            by_league[m["league"]].append(m)

    todo = sum(len(v) for v in by_league.values())
    print(f"{todo} matchs à traiter")

    # Warmup initial
    _warmup_session()

    global_i = 0
    for league, league_matches in by_league.items():
        print(f"\n=== {league} ({len(league_matches)} matchs) ===")
        _warmup_league(league)

        for match in league_matches:
            match_id      = match["id"]
            sofa_event_id = match["sofascore_id"]
            global_i += 1

            # Reconnexion Supabase préventive toutes les 80 itérations
            if global_i % 80 == 0:
                print("  [reconnexion Supabase préventive]")
                _reconnect_supabase()

            # Re-warmup Cloudflare toutes les 50 requêtes (cookie __cf_bm TTL ~30 min)
            if global_i % 50 == 0:
                print("  [re-warmup session SofaScore]")
                _warmup_session()

            print(f"  Match {match_id} (sofa:{sofa_event_id})")

            try:
                fetch_lineups_for_match(match_id, sofa_event_id)
            except Exception as e:
                err = str(e)
                if "RemoteProtocolError" in err or "ConnectionTerminated" in err:
                    print(f"  [reconnexion Supabase apres erreur HTTP/2] {e}")
                    _reconnect_supabase()
                    try:
                        fetch_lineups_for_match(match_id, sofa_event_id)
                    except Exception as e2:
                        print(f"  [echec apres reconnexion, match ignore] {e2}")
                else:
                    print(f"  [erreur inattendue, match ignore] {e}")

            time.sleep(0.6)  # Respecter le rate limit SofaScore (~1 req/s)

    print("\nCompositions importees !")


if __name__ == "__main__":
    run()
