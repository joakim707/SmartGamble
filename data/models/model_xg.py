import pandas as pd
from models.utils import calculate_recent_goals, build_target
from models.xgb_wrapper import XGBMulticlassifier


def build_features(matches_data):
    rows = []
    for m in matches_data:
        xg_diff = 0.0
        if m.get('home_xg') is not None and m.get('away_xg') is not None:
            xg_diff = float(m['home_xg']) - float(m['away_xg'])
        rows.append({
            'match_id': m['id'],
            'match_date': m.get('match_date'),
            'status': m.get('status'),
            'home_team': (m.get('home') or {}).get('name', ''),
            'away_team': (m.get('away') or {}).get('name', ''),
            'home_odds': m.get('home_odds') or 0,
            'home_win_rate': m.get('home_win_rate', 0.45),
            'goal_diff': calculate_recent_goals(m.get('home_form')) - calculate_recent_goals(m.get('away_form')),
            'xg_diff': xg_diff,
            'target': build_target(m),
        })
    return pd.DataFrame(rows)


def get_model():
    return {
        "name": "Analytique (xG)",
        "features": ['home_win_rate', 'goal_diff', 'xg_diff'],
        "clf": XGBMulticlassifier(n_estimators=200, random_state=42),
        "build_fn": build_features,
    }
