"""
Calcule la forme récente de chaque équipe (5 derniers matchs)
et met à jour team_stats.form.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SEASON       = "2024-25"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def compute_form(team_id: int, matches: list) -> str:
    """Retourne jusqu'à 5 résultats W/D/L (le plus récent en premier)."""
    results = []
    for m in matches:
        sh, sa = m.get("score_home"), m.get("score_away")
        if sh is None or sa is None:
            continue
        if m["home_team_id"] == team_id:
            results.append("W" if sh > sa else "D" if sh == sa else "L")
        else:
            results.append("W" if sa > sh else "D" if sa == sh else "L")
        if len(results) == 5:
            break
    return "".join(results)


def run():
    # Matchs terminés triés du plus récent au plus ancien
    finished = (
        supabase.table("match")
        .select("id, home_team_id, away_team_id, score_home, score_away, match_date")
        .eq("status", "finished")
        .order("match_date", desc=True)
        .execute()
        .data
    )
    print(f"{len(finished)} matchs terminés chargés\n")

    teams = supabase.table("team").select("id, name").execute().data

    updated = 0
    for team in teams:
        team_id = team["id"]

        team_matches = [
            m for m in finished
            if m["home_team_id"] == team_id or m["away_team_id"] == team_id
        ]
        if not team_matches:
            continue

        form = compute_form(team_id, team_matches)
        if not form:
            continue

        supabase.table("team_stats").upsert(
            {"team_id": team_id, "season": SEASON, "form": form},
            on_conflict="team_id,season",
        ).execute()

        print(f"{team['name']}: {form}")
        updated += 1

    print(f"\n{updated} équipes mises à jour.")


if __name__ == "__main__":
    run()
