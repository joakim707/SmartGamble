import os

import pandas as pd
import streamlit as st
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


# ================================
# Data
# ================================
@st.cache_data(ttl=300)
def get_odds_data(league: str) -> list[dict]:
    return (
        supabase.table("match")
        .select(
            "id, match_date, "
            "home_team:home_team_id(name), "
            "away_team:away_team_id(name), "
            "odds(bookmaker, odds_home, odds_draw, odds_away)"
        )
        .eq("status", "upcoming")
        .eq("league", league)
        .order("match_date")
        .execute()
    ).data


def build_comparison_table(matches: list[dict]) -> pd.DataFrame:
    rows = []
    for m in matches:
        home = m["home_team"]["name"]
        away = m["away_team"]["name"]
        row  = {
            "Date":  m["match_date"][:10],
            "Match": f"{home} vs {away}",
        }
        for odd in m.get("odds") or []:
            bk = odd["bookmaker"]
            row[f"{bk} — 1"] = odd["odds_home"]
            row[f"{bk} — N"] = odd["odds_draw"]
            row[f"{bk} — 2"] = odd["odds_away"]
        rows.append(row)
    return pd.DataFrame(rows)


def highlight_best_odds(df: pd.DataFrame) -> pd.DataFrame:
    """
    Pour chaque marché (1, N, 2) et chaque ligne, met en vert
    la cote la plus haute parmi les bookmakers.
    Nécessite au moins 2 bookmakers pour être utile.
    """
    styler = df.style

    for suffix in ("— 1", "— N", "— 2"):
        cols = [c for c in df.columns if c.endswith(suffix)]
        if len(cols) < 2:
            continue

        def _bold_row_max(row, cols=cols):
            max_val = row[cols].max()
            return [
                "font-weight: bold; color: #2ecc71"
                if pd.notna(v) and v == max_val
                else ""
                for v in row[cols]
            ]

        styler = styler.apply(_bold_row_max, subset=cols, axis=1)

    return styler


# ================================
# UI
# ================================
st.set_page_config(page_title="Comparatif des cotes", layout="wide")
st.title("Comparatif des cotes 1N2")

league = st.selectbox("Ligue", ["Ligue 1", "La Liga"])

with st.spinner("Chargement..."):
    matches = get_odds_data(league)

# Exclure les matchs sans aucune cote
matches_with_odds = [m for m in matches if m.get("odds")]

if not matches:
    st.warning("Aucun match à venir.")
    st.stop()

if not matches_with_odds:
    st.info("Matchs trouvés mais aucune cote disponible. Lance `data/fetch_odds.py` d'abord.")
    st.stop()

# Filtre équipe
all_teams = sorted(
    {m["home_team"]["name"] for m in matches_with_odds}
    | {m["away_team"]["name"] for m in matches_with_odds}
)
team_filter = st.selectbox("Filtrer par équipe", ["Toutes"] + all_teams)

if team_filter != "Toutes":
    matches_with_odds = [
        m for m in matches_with_odds
        if m["home_team"]["name"] == team_filter
        or m["away_team"]["name"] == team_filter
    ]
    if not matches_with_odds:
        st.info(f"Aucune cote disponible pour {team_filter}.")
        st.stop()

df = build_comparison_table(matches_with_odds)

# Détecter les bookmakers présents
bookmakers = sorted({
    odd["bookmaker"]
    for m in matches_with_odds
    for odd in (m.get("odds") or [])
})

st.dataframe(
    highlight_best_odds(df),
    use_container_width=True,
    hide_index=True,
)

cols = st.columns(3)
cols[0].metric("Matchs", len(df))
cols[1].metric("Bookmakers", len(bookmakers))
cols[2].metric("Bookmakers disponibles", ", ".join(bookmakers) or "–")

if len(bookmakers) < 2:
    st.info(
        "Surbrillance inactive : ajoute d'autres bookmakers dans `BOOKMAKERS` de "
        "`data/fetch_odds.py` pour comparer les cotes entre eux."
    )
