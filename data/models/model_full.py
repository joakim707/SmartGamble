import pandas as pd
from models.utils import form_to_points, calculate_recent_goals, calculate_absences, build_target
from models.xgb_wrapper import XGBMulticlassifier


def build_features(matches_data):
    rows = []
    for m in matches_data:
        h_abs_c, h_abs_i = calculate_absences(m.get('home_absences'))
        a_abs_c, a_abs_i = calculate_absences(m.get('away_absences'))
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
            'form_diff': form_to_points(m.get('home_form')) - form_to_points(m.get('away_form')),
            'goal_diff': calculate_recent_goals(m.get('home_form')) - calculate_recent_goals(m.get('away_form')),
            'abs_count_diff': a_abs_c - h_abs_c,
            'abs_impact_diff': a_abs_i - h_abs_i,
            'xg_diff': xg_diff,
            'target': build_target(m),
        })
    return pd.DataFrame(rows)


def get_model():
    return {
        "name": "Globale (Toutes stats)",
        "features": ['home_win_rate', 'form_diff', 'goal_diff', 'abs_count_diff', 'abs_impact_diff', 'xg_diff'],
        "clf": XGBMulticlassifier(n_estimators=200, random_state=42),
        "build_fn": build_features,
    }
