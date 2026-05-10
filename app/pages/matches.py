import os
from collections import defaultdict
from datetime import datetime

import pandas as pd
import streamlit as st
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


# ================================
# Data (cached 5 min)
# ================================
@st.cache_data(ttl=300)
def get_upcoming_matches() -> list[dict]:
    return (
        supabase.table("match")
        .select(
            "id, match_date, status,"
            " home_team:home_team_id(id, name),"
            " away_team:away_team_id(id, name)"
        )
        .eq("status", "upcoming")
        .order("match_date")
        .execute()
    ).data


@st.cache_data(ttl=300)
def get_odds(match_ids: tuple[int, ...]) -> dict[int, dict]:
    """
    Retourne les cotes moyennes par match_id.
    {match_id: {"1": float, "X": float, "2": float, "bookmakers": [str]}}
    """
    if not match_ids:
        return {}

    rows = (
        supabase.table("odds")
        .select("match_id, bookmaker, odds_home, odds_draw, odds_away")
        .in_("match_id", list(match_ids))
        .execute()
    ).data

    grouped: dict[int, list] = defaultdict(list)
    for r in rows:
        grouped[r["match_id"]].append(r)

    result = {}
    for mid, entries in grouped.items():
        homes = [e["odds_home"] for e in entries if e["odds_home"]]
        draws = [e["odds_draw"] for e in entries if e["odds_draw"]]
        aways = [e["odds_away"] for e in entries if e["odds_away"]]
        result[mid] = {
            "1": round(sum(homes) / len(homes), 2) if homes else None,
            "X": round(sum(draws) / len(draws), 2) if draws else None,
            "2": round(sum(aways) / len(aways), 2) if aways else None,
            "bookmakers": sorted({e["bookmaker"] for e in entries}),
        }
    return result


@st.cache_data(ttl=300)
def get_forms(team_ids: tuple[int, ...]) -> dict[int, str]:
    """
    Calcule la forme (5 derniers matchs) pour un ensemble d'équipes.
    1 requête pour toutes les équipes, traitement en Python.
    Retourne : {team_id: "WDLWW"}
    """
    if not team_ids:
        return {}

    or_filter = ",".join(
        f"home_team_id.eq.{tid},away_team_id.eq.{tid}" for tid in team_ids
    )
    rows = (
        supabase.table("match")
        .select("home_team_id, away_team_id, score_home, score_away, match_date")
        .eq("status", "finished")
        .or_(or_filter)
        .order("match_date", desc=True)
        .limit(len(team_ids) * 10)   # 10 matchs par équipe suffit pour en avoir 5 utiles
        .execute()
    ).data

    # Group and sort by team
    team_rows: dict[int, list] = defaultdict(list)
    for m in rows:
        team_rows[m["home_team_id"]].append(m)
        team_rows[m["away_team_id"]].append(m)

    forms = {}
    for tid in team_ids:
        last5 = sorted(team_rows.get(tid, []), key=lambda x: x["match_date"], reverse=True)[:5]
        letters = []
        for m in last5:
            sh, sa = m.get("score_home"), m.get("score_away")
            if sh is None or sa is None:
                continue
            if m["home_team_id"] == tid:
                letters.append("W" if sh > sa else ("D" if sh == sa else "L"))
            else:
                letters.append("W" if sa > sh else ("D" if sa == sh else "L"))
        forms[tid] = "".join(letters) if letters else "–"

    return forms


# ================================
# Page
# ================================
st.set_page_config(page_title="Matchs – SmartGamble", layout="wide")
st.title("Prochains matchs – Ligue 1")

with st.spinner("Chargement..."):
    matches = get_upcoming_matches()

if not matches:
    st.info("Aucun match à venir. Lance `data/fetch_matches.py` d'abord.")
    st.stop()

match_ids  = tuple(m["id"] for m in matches)
team_ids   = tuple({m["home_team"]["id"] for m in matches} | {m["away_team"]["id"] for m in matches})
odds_map   = get_odds(match_ids)
forms_map  = get_forms(team_ids)

rows = []
for m in matches:
    home = m["home_team"]
    away = m["away_team"]
    o    = odds_map.get(m["id"], {})

    try:
        dt       = datetime.fromisoformat(m["match_date"].replace("Z", "+00:00"))
        date_fmt = dt.strftime("%d/%m %H:%M")
    except Exception:
        date_fmt = m["match_date"]

    rows.append(
        {
            "Date":        date_fmt,
            "Domicile":    home["name"],
            "Forme dom.":  forms_map.get(home["id"], "–"),
            "Extérieur":   away["name"],
            "Forme ext.":  forms_map.get(away["id"], "–"),
            "1":           o.get("1"),
            "X":           o.get("X"),
            "2":           o.get("2"),
        }
    )

df = pd.DataFrame(rows)

st.dataframe(
    df,
    use_container_width=True,
    hide_index=True,
    column_config={
        "Date":       st.column_config.TextColumn("Date",       width="small"),
        "Domicile":   st.column_config.TextColumn("Domicile",   width="large"),
        "Forme dom.": st.column_config.TextColumn("Forme",      width="small",
                        help="5 derniers matchs — W Victoire · D Nul · L Défaite"),
        "Extérieur":  st.column_config.TextColumn("Extérieur",  width="large"),
        "Forme ext.": st.column_config.TextColumn("Forme",      width="small"),
        "1":          st.column_config.NumberColumn("1",         width="small",
                        format="%.2f", help="Cote victoire domicile"),
        "X":          st.column_config.NumberColumn("X",         width="small",
                        format="%.2f", help="Cote match nul"),
        "2":          st.column_config.NumberColumn("2",         width="small",
                        format="%.2f", help="Cote victoire extérieur"),
    },
)

# Bookmakers source
all_bks: set[str] = set()
for o in odds_map.values():
    all_bks.update(o.get("bookmakers", []))

n_with_odds = sum(1 for mid in match_ids if mid in odds_map)
bk_str = ", ".join(sorted(all_bks)) if all_bks else "aucun"
st.caption(
    f"{len(rows)} match(s) · {n_with_odds} avec cotes · Bookmakers : {bk_str}"
)
