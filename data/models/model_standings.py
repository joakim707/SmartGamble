import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from models.utils import build_target


def build_features(matches_data):
    rows = []
    for m in matches_data:
        # rang de l'adversaire - rang domicile : positif = domicile mieux classé
        rank_diff = (m.get('away_rank') or 10) - (m.get('home_rank') or 10)
        points_diff = (m.get('home_points') or 0) - (m.get('away_points') or 0)
        home_gd = (m.get('home_goals_for') or 0) - (m.get('home_goals_against') or 0)
        away_gd = (m.get('away_goals_for') or 0) - (m.get('away_goals_against') or 0)
        rows.append({
            'match_id': m['id'],
            'match_date': m.get('match_date'),
            'status': m.get('status'),
            'home_team': (m.get('home') or {}).get('name', ''),
            'away_team': (m.get('away') or {}).get('name', ''),
            'home_odds': m.get('home_odds') or 0,
            'home_win_rate': m.get('home_win_rate', 0.45),
            'rank_diff': rank_diff,
            'points_diff': points_diff,
            'goal_diff_season': home_gd - away_gd,
            'target': build_target(m),
        })
    return pd.DataFrame(rows)


def get_model():
    return {
        "name": "Classement (Standings)",
        "features": ['home_win_rate', 'rank_diff', 'points_diff', 'goal_diff_season'],
        "clf": GradientBoostingClassifier(n_estimators=200, random_state=42),
        "build_fn": build_features,
    }
