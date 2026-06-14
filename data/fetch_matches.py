"""
Récupère les matchs des 5 grands championnats depuis SofaScore
et les stocke dans la table 'match' de Supabase.

Flow : pour chaque championnat → navigue vers la page du tournoi
       → intercepte la réponse native /events/round/N (round actuel)
       → ouvre le dropdown de round (click force=True pour passer les modals)
       → itère sur tous les rounds disponibles en cliquant chaque option
       → intercepte chaque réponse /events/round/N
       → upsert équipes + matchs avec sofascore_id + sofa_match_url

Bypass Cloudflare : on intercepte les requêtes que SofaScore émet lui-même
via page.on("response", …). Ces requêtes sont natives au navigateur —
TLS réel, cookies CF présents — elles passent là où fetch() injecté échoue.
"""

import os
import re
import time
from datetime import datetime, timezone
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

# IDs SofaScore des championnats — saison 2025/2026
CHAMPIONNATS_SOFA = {
    "Premier League": {"tournament_id": 17, "season_id": 76986, "slug": "football/england/premier-league/17"},
    "Ligue 1":        {"tournament_id": 34, "season_id": 77356, "slug": "football/france/ligue-1/34"},
    "La Liga":        {"tournament_id": 8,  "season_id": 77559, "slug": "football/spain/laliga/8"},
    "Serie A":        {"tournament_id": 23, "season_id": 76457, "slug": "football/italy/serie-a/23"},
    "Bundesliga":     {"tournament_id": 35, "season_id": 77333, "slug": "football/germany/bundesliga/35"},
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

# Noms SofaScore -> noms football-data.org pour éviter les doublons d'équipes
TEAM_NAME_ALIASES = {
    "Real Madrid":              "Real Madrid CF",
    "Atletico Madrid":          "Atletico de Madrid",
    "Atletico de Madrid":       "Atletico de Madrid",
    "Sevilla":                  "Sevilla FC",
    "Rayo Vallecano":           "Rayo Vallecano de Madrid",
    "Elche":                    "Elche CF",
    "Valencia":                 "Valencia CF",
    "Getafe":                   "Getafe CF",
    "Real Sociedad":            "Real Sociedad de Fútbol",
    "Espanyol":                 "RCD Espanyol de Barcelona",
    "Villarreal":               "Villarreal CF",
    "Osasuna":                  "CA Osasuna",
    "Real Betis":               "Real Betis Balompié",
    "Mallorca":                 "RCD Mallorca",
    "1. FC Heidenheim":         "1. FC Heidenheim 1846",
    "FC St. Pauli":             "FC St. Pauli 1910",
    "Bournemouth":              "AFC Bournemouth",
    "West Ham United":          "West Ham United FC",
    "Arsenal":                  "Arsenal FC",
    "Aston Villa":              "Aston Villa FC",
    "Brentford":                "Brentford FC",
    "Burnley":                  "Burnley FC",
    "Sunderland":               "Sunderland AFC",
    "Chelsea":                  "Chelsea FC",
    "Crystal Palace":           "Crystal Palace FC",
    "Everton":                  "Everton FC",
    "Wolverhampton":            "Wolverhampton Wanderers FC",
    "Manchester United":        "Manchester United FC",
    "Brighton & Hove Albion":   "Brighton & Hove Albion FC",
    "Manchester City":          "Manchester City FC",
    "Leeds United":             "Leeds United FC",
    "Newcastle United":         "Newcastle United FC",
    "Tottenham Hotspur":        "Tottenham Hotspur FC",
    "Nottingham Forest":        "Nottingham Forest FC",
    "Fulham":                   "Fulham FC",
    "RC Strasbourg":            "RC Strasbourg Alsace",
    "AS Monaco":                "Monaco",
    "Stade Brestois":           "Stade Brestois 29",
    "Stade Rennais":            "Stade Rennais FC 1901",
    "RC Lens":                  "Lens",
    "Lorient":                  "FC Lorient",
    "Paris Saint-Germain":      "Paris Saint-Germain FC",
    "Sassuolo":                 "US Sassuolo Calcio",
    "Lecce":                    "US Lecce",
    "Genoa":                    "Genoa CFC",
}


def upsert_team(team_data: dict, league_name: str) -> int:
    """
    Insère ou met à jour une équipe en BDD.
    Le logo est construit à partir de l'ID SofaScore de l'équipe.
    Retourne l'id Supabase de l'équipe.
    """
    raw_name = team_data["name"]
    name     = TEAM_NAME_ALIASES.get(raw_name, raw_name)
    sofa_tid = team_data["id"]

    payload = {
        "name":       name,
        "short_name": team_data.get("shortName", name[:20]),
        "league":     league_name,
        "logo_url":   f"https://api.sofascore.com/api/v1/team/{sofa_tid}/image",
    }

    existing = supabase.table("team").select("id").eq("name", name).execute()
    if existing.data:
        team_id = existing.data[0]["id"]
        supabase.table("team").update(payload).eq("id", team_id).execute()
        return team_id

    result = supabase.table("team").insert(payload).execute()
    return result.data[0]["id"]


def check_migration() -> None:
    """
    Vérifie que la migration 003 est correctement appliquée :
    — colonne sofascore_id présente sur match
    — contrainte UNIQUE sur sofascore_id (requise pour ON CONFLICT)
    Arrête le script avec un message clair si un élément manque.
    """
    try:
        supabase.table("match").select("sofascore_id").limit(1).execute()
    except Exception:
        _migration_error("La colonne sofascore_id est absente de la table match.")

    try:
        supabase.table("match").upsert(
            {"sofascore_id": -1},
            on_conflict="sofascore_id",
        ).execute()
    except Exception as e:
        msg = str(e)
        if "42P10" in msg or "no unique or exclusion constraint" in msg:
            _migration_error(
                "La contrainte UNIQUE sur sofascore_id est manquante.\n"
                "Exécute dans Supabase SQL Editor :\n\n"
                "  ALTER TABLE match  ADD UNIQUE (sofascore_id);\n"
                "  ALTER TABLE player ADD UNIQUE (sofascore_id);"
            )


def _migration_error(detail: str) -> None:
    print("\n" + "=" * 60)
    print("ERREUR : migration 003 incomplète")
    print("=" * 60)
    print(detail)
    print("\nMigration complète (db/migrations/003_sofascore_integration.sql)")
    print("=" * 60)
    raise SystemExit(1)


def upsert_match(event: dict, home_id: int, away_id: int, league_name: str) -> None:
    """
    Insère ou met à jour un match en utilisant sofascore_id comme clé de conflit.
    SofaScore stocke la date de début en timestamp Unix (secondes depuis epoch).
    """
    status_type = event.get("status", {}).get("type", "notstarted")
    status      = STATUS_MAP.get(status_type, "upcoming")

    start_ts   = event.get("startTimestamp")
    match_date = (
        datetime.fromtimestamp(start_ts, tz=timezone.utc).isoformat()
        if start_ts else None
    )

    home_score = event.get("homeScore", {}).get("current")
    away_score = event.get("awayScore", {}).get("current")

    # URL directe vers la page match SofaScore (utilisée par fetch_lineups.py)
    # Format réel : /football/match/{slug}/{customId}#id:{eventId}
    slug      = event.get("slug", "")
    custom_id = event.get("customId", "")
    sofa_match_url = (
        f"https://www.sofascore.com/football/match/{slug}/{custom_id}"
        f"#id:{event['id']},tab:lineups"
        if slug and custom_id else None
    )

    payload = {
        "sofascore_id":  event["id"],
        "home_team_id":  home_id,
        "away_team_id":  away_id,
        "league":        league_name,
        "match_date":    match_date,
        "status":        status,
        "score_home":    home_score,
        "score_away":    away_score,
        "sofa_match_url": sofa_match_url,
    }

    try:
        supabase.table("match").upsert(payload, on_conflict="sofascore_id").execute()
    except Exception as e:
        if "23505" in str(e):
            supabase.table("match").update({"sofascore_id": event["id"]}) \
                .eq("home_team_id", home_id) \
                .eq("away_team_id", away_id) \
                .eq("match_date", match_date) \
                .execute()
            supabase.table("match").upsert(payload, on_conflict="sofascore_id").execute()
        else:
            raise


# ================================
# Helpers modale / popup
# ================================

def _dismiss_overlays(page) -> None:
    """Supprime cookie consent et modal SofaScore (login/promo) via JS + Escape."""
    for selector in [
        'button[title*="Accept"]',
        'button[title*="Accepter"]',
        '[class*="fc-primary-button"]',
        'button:has-text("Accept all")',
        '.fc-cta-consent',
    ]:
        try:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=800):
                btn.click(force=True)
                time.sleep(0.4)
                break
        except Exception:
            pass

    try:
        page.evaluate("""
            document.querySelector('.fc-consent-root')?.remove();
            document.querySelectorAll('[data-testid="modal"]').forEach(e => e.remove());
            document.querySelectorAll('.ui-modal').forEach(e => e.remove());
        """)
    except Exception:
        pass

    try:
        page.keyboard.press("Escape")
    except Exception:
        pass

    time.sleep(0.3)


# ================================
# Fetch par championnat (interception)
# ================================

def fetch_league(page, context, league_name: str, ids: dict) -> None:
    """
    Récupère TOUS les matchs de la saison 2025-2026 pour un championnat.

    Stratégie : navigation par round via le dropdown SofaScore.
    1. Aller sur la page du tournoi → capture le round actuel automatiquement.
    2. Ouvrir le dropdown Round (force=True pour passer les overlays).
    3. Lister toutes les options disponibles (Round 1…38).
    4. Cliquer chaque round → SofaScore émet une requête native /events/round/N.
    5. Intercepter cette réponse → upsert en BDD.
    """
    print(f"\n=== {league_name} ===")
    tid  = ids["tournament_id"]
    sid  = ids["season_id"]
    slug = ids.get("slug", "")

    # round_num → liste d'events
    captured_rounds: dict[int, list] = {}

    def _on_response(response):
        url = response.url
        # Pas de filtre sur sid : on capture quelle que soit la saison chargée
        if f"/unique-tournament/{tid}/season/" in url and "/events/round/" in url:
            try:
                m = re.search(r"/events/round/(\d+)", url)
                if not m:
                    return
                rnum = int(m.group(1))
                data = response.json()
                evts = data.get("events", [])
                if evts:
                    captured_rounds[rnum] = evts
            except Exception:
                pass

    page.on("response", _on_response)

    # ---- Naviguer vers la page du tournoi ----
    try:
        page.goto(
            f"https://www.sofascore.com/tournament/{slug}",
            wait_until="domcontentloaded",   # plus robuste que networkidle
            timeout=45000,
        )
        # Attendre que les requêtes API partent (networkidle + buffer)
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        time.sleep(3)  # buffer pour les tournois qui chargent tardiveme
    except Exception as e:
        print(f"  [nav warning] {e}")

    _dismiss_overlays(page)

    # ---- Trouver le dropdown de round (multi-langue) ----
    # SofaScore utilise "Round", "Matchday", "Spieltag", "Journée", "Jornada", "Giornata"
    ROUND_PATTERN = re.compile(
        r"(Round|Matchday|Spieltag|Journ[eé]e|Jornada|Giornata)\s+\d+",
        re.IGNORECASE,
    )
    round_btn = page.locator('[class*="dropdown__button"]').filter(
        has_text=ROUND_PATTERN
    )
    try:
        current_text = round_btn.first.text_content(timeout=5000).strip()
        print(f"  Round actuel : {current_text}")
    except Exception:
        print("  [warn] Dropdown Round introuvable — on s'arrête au round intercepté")
        page.remove_listener("response", _on_response)
        _store_captured(captured_rounds, league_name)
        return

    # ---- Ouvrir le dropdown et récupérer la liste des rounds ----
    round_btn.first.click(force=True)
    time.sleep(0.8)

    options = page.locator('[role="option"]')
    opt_count = options.count()
    if opt_count == 0:
        print("  [warn] Aucune option dans le dropdown")
        page.remove_listener("response", _on_response)
        _store_captured(captured_rounds, league_name)
        return

    round_labels = [options.nth(i).text_content().strip() for i in range(opt_count)]
    print(f"  Rounds disponibles : {opt_count}  ({round_labels[0]} … {round_labels[-1]})")

    def _extract_rnum(label: str) -> int | None:
        """Extrait le numéro de round quel que soit le libellé (Round/Matchday/Spieltag…)."""
        m = re.search(r"\d+", label)
        return int(m.group()) if m else None

    # ---- Itérer sur chaque round ----
    for idx, label in enumerate(round_labels):
        rnum = _extract_rnum(label)
        if rnum is None:
            continue

        if rnum in captured_rounds:
            # Round déjà chargé lors de la navigation initiale — clic sans attente
            options.nth(idx).click(force=True)
        else:
            # expect_response garantit que Playwright traite la réponse native
            # avant de passer au round suivant (évite la race condition du sleep loop)
            try:
                with page.expect_response(
                    lambda r, rn=rnum, t=tid: (
                        f"/unique-tournament/{t}/season/" in r.url
                        and f"/events/round/{rn}" in r.url
                    ),
                    timeout=8000,
                ):
                    options.nth(idx).click(force=True)
            except Exception:
                pass  # timeout — capturé via on_resp si arrivé plus tard

        evts = captured_rounds.get(rnum, [])
        print(f"    {label} : {len(evts)} matchs")

        # Ré-ouvrir le dropdown pour le round suivant (sauf si c'est le dernier)
        if idx < opt_count - 1:
            time.sleep(0.3)
            _dismiss_overlays(page)
            round_btn.first.click(force=True)
            time.sleep(0.6)
            options = page.locator('[role="option"]')

    page.remove_listener("response", _on_response)
    _store_captured(captured_rounds, league_name)


def _store_captured(captured_rounds: dict, league_name: str) -> None:
    """Upsert en BDD tous les events capturés pour ce championnat."""
    total = 0
    for rnum in sorted(captured_rounds):
        for evt in captured_rounds[rnum]:
            home_id = upsert_team(evt["homeTeam"], league_name)
            away_id = upsert_team(evt["awayTeam"], league_name)
            upsert_match(evt, home_id, away_id, league_name)
            total += 1
    print(f"  => {total} matchs importés en BDD")


# ================================
# Point d'entrée
# ================================

def fetch_and_store_matches() -> None:
    """Récupère tous les matchs (terminés + à venir) de la saison pour chaque championnat."""
    check_migration()

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

        for league_name, ids in CHAMPIONNATS_SOFA.items():
            fetch_league(page, context, league_name, ids)

        browser.close()

    print("\nImport terminé !")


if __name__ == "__main__":
    fetch_and_store_matches()
