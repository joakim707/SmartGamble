import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from models.utils import form_to_points, calculate_recent_goals, build_target


def build_features(matches_data):
    rows = []
    for m in matches_data:
        rows.append({
            'match_id': m['id'],
            'match_date': m.get('match_date'),
            'status': m.get('status'),
            'home_team': (m.get('home') or {}).get('name', ''),
            'away_team': (m.get('away') or {}).get('name', ''),
            'home_odds': m.get('home_odds') or 0,
            # Taux de victoires à domicile calculé depuis l'historique (pré-calculé dans predict.py)
            'home_win_rate': m.get('home_win_rate', 0.45),
            'form_diff': form_to_points(m.get('home_form')) - form_to_points(m.get('away_form')),
            'goal_diff': calculate_recent_goals(m.get('home_form')) - calculate_recent_goals(m.get('away_form')),
            'target': build_target(m),
        })
    return pd.DataFrame(rows)


def get_model():
    return {
        "name": "Momentum (Forme + Buts)",
        "features": ['home_win_rate', 'form_diff', 'goal_diff'],
        "clf": RandomForestClassifier(n_estimators=200, min_samples_leaf=3, random_state=42),
        "build_fn": build_features,
    }
