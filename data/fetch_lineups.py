"""
Récupère les compositions de match depuis SofaScore et les stocke en BDD.

Flow : pour chaque match terminé avec un sofascore_id et une sofa_match_url
       → navigue vers la page match SofaScore (Playwright)
       → intercepte la réponse native /api/v1/event/{id}/lineups
       → upsert joueurs dans 'player' (via sofascore_id)
       → upsert titulaires + absents dans 'lineup'

Bypass Cloudflare : on laisse SofaScore charger sa page normalement.
Le navigateur navigue vers la page match ; SofaScore.com appelle
api.sofascore.com lui-même (requête native, TLS réel, cookies CF présents).
On intercepte la réponse au vol via page.on("response", …).

Pré-requis : migrations 003 et 004 appliquées.
"""

import os
import time
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# ================================
# Configuration
# ================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# SofaScore utilise des codes de position à une lettre
POSITION_MAP = {
    "G": "Goalkeeper",
    "D": "Defender",
    "M": "Midfielder",
    "F": "Forward",
}


def _reconnect_supabase() -> None:
    """Recrée le client Supabase pour réinitialiser le pool de connexions HTTP/2."""
    global supabase
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ================================
# Helpers Supabase
# ================================

def upsert_player(sofa_player: dict, team_id: int, shirt_number: int | None = None) -> int | None:
    """
    Insère ou met à jour un joueur via son sofascore_id.
    Retourne l'id Supabase du joueur, ou None si les données sont incomplètes.
    """
    sofa_id     = sofa_player.get("id")
    name        = sofa_player.get("name") or sofa_player.get("shortName", "")
    pos_code    = sofa_player.get("position")
    position    = POSITION_MAP.get(pos_code, pos_code)
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
    result = supabase.table("match").select("home_team_id, away_team_id").eq("id", match_id).execute()
    if not result.data:
        return None, None
    row = result.data[0]
    return row["home_team_id"], row["away_team_id"]


def process_side(match_id: int, team_id: int, side_data: dict) -> None:
    """
    Traite un côté (home ou away) d'une réponse lineup SofaScore.
    Upsert joueurs + titulaires/remplaçants/absents.
    """
    for entry in side_data.get("players", []):
        sofa_player  = entry.get("player", {})
        is_starter   = not entry.get("substitute", True)
        shirt_number = entry.get("shirtNumber")
        player_id    = upsert_player(sofa_player, team_id, shirt_number)
        if player_id:
            upsert_lineup_entry(match_id, team_id, player_id, is_starter, is_absent=False)

    for entry in side_data.get("missingPlayers", []):
        sofa_player  = entry.get("player", {})
        shirt_number = entry.get("shirtNumber")
        player_id    = upsert_player(sofa_player, team_id, shirt_number)
        if player_id:
            upsert_lineup_entry(match_id, team_id, player_id, is_starter=False, is_absent=True)
            supabase.table("player").update({"is_absent": True}).eq("id", player_id).execute()


# ================================
# Fetch lineup via interception Playwright
# ================================

def fetch_lineups_for_match(match_id: int, sofa_event_id: int, match_url: str, page) -> None:
    """
    Navigue vers la page match SofaScore et intercepte la réponse lineup native.

    SofaScore appelle api.sofascore.com/api/v1/event/{id}/lineups de lui-même
    lors du chargement de la page → pas de 403 Cloudflare car c'est une
    requête native du navigateur, pas un fetch() injecté.
    """
    lineup_path = f"/api/v1/event/{sofa_event_id}/lineups"
    captured: dict = {}

    def _on_response(response):
        if lineup_path in response.url:
            try:
                captured["data"] = response.json()
            except Exception:
                pass

    page.on("response", _on_response)
    try:
        page.goto(match_url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(4)

        # Si les lineups ne sont pas encore chargés, essaie de cliquer sur l'onglet
        if not captured:
            for text in ("Lineups", "Formations", "Compos"):
                try:
                    btn = page.get_by_text(text, exact=True).first
                    if btn.is_visible():
                        btn.click()
                        page.wait_for_load_state("networkidle", timeout=8000)
                        time.sleep(1)
                        break
                except Exception:
                    pass

    except Exception as e:
        print(f"    [nav warning] {e}")
    finally:
        page.remove_listener("response", _on_response)

    if not captured:
        print(f"    Aucune réponse lineup interceptée (event {sofa_event_id})")
        return

    data      = captured.get("data") or {}
    home_data = data.get("home")
    away_data = data.get("away")

    if not home_data and not away_data:
        confirmed = data.get("confirmed", False)
        print(
            f"    Compo {'non confirmée' if not confirmed else 'vide'} (event {sofa_event_id})"
        )
        return

    home_team_id, away_team_id = get_match_team_ids(match_id)
    if not home_team_id or not away_team_id:
        print(f"    [skip] Match {match_id} introuvable en BDD")
        return

    supabase.table("lineup").delete().eq("match_id", match_id).execute()

    for side, team_id in (("home", home_team_id), ("away", away_team_id)):
        side_data = data.get(side)
        if side_data:
            process_side(match_id, team_id, side_data)

    print(f"    OK — compo importée (event {sofa_event_id})")


# ================================
# Point d'entrée
# ================================

def run() -> None:
    """
    Parcourt tous les matchs terminés avec sofascore_id + sofa_match_url
    et récupère leur composition depuis SofaScore via Playwright (interception).
    Les matchs qui ont déjà des compositions SofaScore sont ignorés.
    """
    result = (
        supabase.table("match")
        .select("id, sofascore_id, league, sofa_match_url")
        .filter("sofascore_id",   "not.is", "null")
        .filter("sofa_match_url", "not.is", "null")
        .eq("status", "finished")
        .execute()
    )
    matches = result.data or []
    print(f"\n{len(matches)} matchs terminés avec sofascore_id + sofa_match_url")

    # IDs des joueurs ayant un sofascore_id (vrais joueurs SofaScore)
    sofa_player_ids: set[int] = set()
    offset = 0
    while True:
        page_data = (
            supabase.table("player")
            .select("id")
            .filter("sofascore_id", "not.is", "null")
            .range(offset, offset + 999)
            .execute()
        )
        if not page_data.data:
            break
        for row in page_data.data:
            sofa_player_ids.add(row["id"])
        if len(page_data.data) < 1000:
            break
        offset += 1000
    print(f"{len(sofa_player_ids)} joueurs SofaScore en BDD")

    # Matchs ayant déjà au moins un joueur SofaScore → skip
    already_done: set[int] = set()
    offset = 0
    while True:
        page_data = (
            supabase.table("lineup")
            .select("match_id, player_id")
            .range(offset, offset + 999)
            .execute()
        )
        if not page_data.data:
            break
        for row in page_data.data:
            if row["player_id"] in sofa_player_ids:
                already_done.add(row["match_id"])
        if len(page_data.data) < 1000:
            break
        offset += 1000
    print(f"{len(already_done)} matchs déjà en BDD, ignorés")

    todo = [m for m in matches if m["id"] not in already_done]
    print(f"{len(todo)} matchs à traiter")

    if not todo:
        print("Rien à faire.")
        return

    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            user_agent=USER_AGENT,
            locale="fr-FR",
        )
        page = context.new_page()

        print("  [playwright] Ouverture de SofaScore...")
        page.goto("https://www.sofascore.com/", wait_until="domcontentloaded", timeout=30000)
        time.sleep(2)

        for i, match in enumerate(todo, 1):
            match_id      = match["id"]
            sofa_event_id = match["sofascore_id"]
            match_url     = match["sofa_match_url"]

            # Reconnexion Supabase préventive toutes les 80 itérations
            if i % 80 == 0:
                print("  [reconnexion Supabase préventive]")
                _reconnect_supabase()

            print(f"  [{i}/{len(todo)}] Match {match_id} (sofa:{sofa_event_id})")

            try:
                fetch_lineups_for_match(match_id, sofa_event_id, match_url, page)
            except Exception as e:
                err = str(e)
                if "RemoteProtocolError" in err or "ConnectionTerminated" in err:
                    print(f"  [reconnexion Supabase après erreur HTTP/2] {e}")
                    _reconnect_supabase()
                    try:
                        fetch_lineups_for_match(match_id, sofa_event_id, match_url, page)
                    except Exception as e2:
                        print(f"  [échec après reconnexion, match ignoré] {e2}")
                else:
                    print(f"  [erreur inattendue, match ignoré] {e}")

            time.sleep(0.8)

        browser.close()

    print("\nCompositions importées !")


if __name__ == "__main__":
    run()
