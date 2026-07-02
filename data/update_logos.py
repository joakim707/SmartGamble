"""
Récupère les crests d'équipe depuis football-data.org et met à jour logo_url
dans la table team de Supabase.

football-data.org retourne team.crest dans les endpoints /competitions/{code}/teams
"""

import os
import time
import requests
from difflib import SequenceMatcher
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY")
FD_API_KEY    = os.getenv("FOOTBALL_DATA_API_KEY") or os.getenv("FOOTBALL_DATA_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

FD_HEADERS = {"X-Auth-Token": FD_API_KEY}

# Codes championnats football-data.org
LEAGUES = {
    "Premier League": "PL",
    "Ligue 1":        "FL1",
    "La Liga":        "PD",
    "Bundesliga":     "BL1",
    "Serie A":        "SA",
}


# Mappings explicites : nom BDD → nom exact football-data.org
# Nécessaires quand la similarité fuzzy est trop faible ou ambiguë
EXPLICIT_MAPPINGS: dict[str, str] = {
    # Premier League
    "Wolverhampton Wanderers FC": "Wolverhampton Wanderers FC",
    "Southampton FC":             "Southampton FC",
    "West Ham United FC":         "West Ham United FC",
    "Leicester City FC":          "Leicester City FC",
    "Sheffield United FC":        "Sheffield United FC",
    "Luton Town FC":              "Luton Town FC",
    # Ligue 1
    "Rennes":                     "Stade Rennais FC 1901",
    "Stade de Reims":             "Stade de Reims",
    "Reims":                      "Stade de Reims",
    "Lens":                       "Racing Club de Lens",
    "Lyon":                       "Olympique Lyonnais",
    "FC Nantes":                  "FC Nantes",
    "Nantes":                     "FC Nantes",
    "Montpellier":                "Montpellier HSC",
    "Montpellier HSC":            "Montpellier HSC",
    "AS Saint-Étienne":           "AS Saint-Étienne",
    "Saint-Étienne":              "AS Saint-Étienne",
    "Saint Etienne":              "AS Saint-Étienne",
    "FC Metz":                    "FC Metz",
    "Metz":                       "FC Metz",
    "Clermont Foot 63":           "Clermont Foot 63",
    "Red Star FC":                "Red Star FC",
    "Rodez AF":                   "Rodez AF",
    # La Liga
    "Granada CF":                 "Granada CF",
    "UD Almería":                 "UD Almería",
    "Cádiz CF":                   "Cádiz CF",
    "CD Leganés":                 "CD Leganés",
    "UD Las Palmas":              "UD Las Palmas",
    "Real Valladolid CF":         "Real Valladolid CF",
    # Bundesliga
    "SV Darmstadt 98":            "SV Darmstadt 98",
    "Holstein Kiel":              "Holstein Kiel",
    "VfL Bochum 1848":            "VfL Bochum 1848",
    "SC Paderborn 07":            "SC Paderborn 07",
    # Serie A
    "Hellas Verona FC":           "Hellas Verona FC",
    "Hellas Verona":              "Hellas Verona FC",
    "Empoli FC":                  "Empoli FC",
    "US Salernitana 1919":        "US Salernitana 1919",
    "US Cremonese":               "US Cremonese",
    "Cremonese":                  "US Cremonese",
    "AC Pisa 1909":               "AC Pisa 1909",
    "Pisa":                       "AC Pisa 1909",
}


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def fetch_fd_teams(code: str) -> list[dict]:
    url = f"https://api.football-data.org/v4/competitions/{code}/teams"
    r = requests.get(url, headers=FD_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json().get("teams", [])


def find_fd_team(db_name: str, fd_teams: list[dict]) -> tuple[dict | None, float]:
    """Retourne (fd_team, score). Priorité : mapping explicite > fuzzy ≥ 0.85."""
    target = EXPLICIT_MAPPINGS.get(db_name)
    if target:
        for fd in fd_teams:
            if fd["name"].lower() == target.lower():
                return fd, 1.0
            if fd.get("shortName", "").lower() == target.lower():
                return fd, 1.0
        # Mapping explicite mais équipe absente de cette ligue fd (ex: relégué)
        return None, 0.0

    best_score = 0.0
    best_fd    = None
    for fd in fd_teams:
        for candidate in [fd["name"], fd.get("shortName", ""), fd.get("tla", "")]:
            if not candidate:
                continue
            s = similarity(db_name, candidate)
            if s > best_score:
                best_score = s
                best_fd    = fd

    return (best_fd, best_score) if best_score >= 0.85 else (None, best_score)


def main():
    if not FD_API_KEY:
        print("ERREUR: FOOTBALL_DATA_API_KEY manquant dans .env")
        return

    db_teams = supabase.table("team").select("id, name, league").execute().data
    print(f"{len(db_teams)} équipes en BDD\n")

    total_updated = 0

    for league_name, code in LEAGUES.items():
        print(f"=== {league_name} ({code}) ===")
        try:
            fd_teams = fetch_fd_teams(code)
        except Exception as e:
            print(f"  Erreur API: {e}")
            continue

        db_league = [t for t in db_teams if t["league"] == league_name]

        updated = 0
        for db_team in db_league:
            fd, score = find_fd_team(db_team["name"], fd_teams)

            if fd and fd.get("crest"):
                supabase.table("team").update(
                    {"logo_url": fd["crest"]}
                ).eq("id", db_team["id"]).execute()
                print(f"  ✓ {db_team['name']} → {fd['name']} ({score:.0%})")
                updated += 1
            else:
                best_name = fd["name"] if fd else "aucun"
                print(f"  ✗ {db_team['name']} — meilleur match: {best_name} ({score:.0%})")

        print(f"  => {updated}/{len(db_league)} équipes mises à jour\n")
        total_updated += updated
        time.sleep(1)

    print(f"Total : {total_updated} logos mis à jour")


if __name__ == "__main__":
    main()
