import os
import json
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

STATUS_MAP = {
    "FT": "finished",
    "AET": "finished",
    "PEN": "finished",
    "NS": "upcoming",
    "TBD": "upcoming",
    "PST": "upcoming",
    "CANC": "cancelled",
    "ABD": "cancelled",
}


def get_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def upsert_teams(cur, fixtures):
    teams = {}
    for f in fixtures:
        for side in ("home", "away"):
            t = f["teams"][side]
            teams[t["id"]] = (t["name"], None, f["league"]["name"], t.get("logo"))

    rows = [(ext_id, name, short, league, logo)
            for ext_id, (name, short, league, logo) in teams.items()]

    execute_values(cur, """
        INSERT INTO team (id, name, short_name, league, logo_url)
        VALUES %s
        ON CONFLICT (id) DO UPDATE
            SET name      = EXCLUDED.name,
                league    = EXCLUDED.league,
                logo_url  = EXCLUDED.logo_url
    """, rows)

    return {ext_id for ext_id, *_ in rows}


def upsert_matches(cur, fixtures):
    rows = []
    for f in fixtures:
        short_status = f["fixture"]["status"]["short"]
        status = STATUS_MAP.get(short_status, "upcoming")
        goals = f.get("goals") or {}
        rows.append((
            f["fixture"]["id"],
            f["teams"]["home"]["id"],
            f["teams"]["away"]["id"],
            f["league"]["name"],
            f["fixture"]["date"],
            status,
            goals.get("home"),
            goals.get("away"),
        ))

    execute_values(cur, """
        INSERT INTO match (id, home_team_id, away_team_id, league, match_date,
                           status, score_home, score_away)
        VALUES %s
        ON CONFLICT (id) DO UPDATE
            SET status      = EXCLUDED.status,
                score_home  = EXCLUDED.score_home,
                score_away  = EXCLUDED.score_away
    """, rows)

    return len(rows)


def load(json_path: str = "data/raw/matchs_2024.json"):
    with open(json_path, encoding="utf-8") as f:
        fixtures = json.load(f)

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cur:
                upsert_teams(cur, fixtures)
                n = upsert_matches(cur, fixtures)
        print(f"{n} matchs insérés/mis à jour dans la base.")
    finally:
        conn.close()


if __name__ == "__main__":
    load()
