import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from models.utils import form_to_points, calculate_absences, build_target


def build_features(matches_data):
    rows = []
    for m in matches_data:
        h_abs_c, h_abs_i = calculate_absences(m.get('home_absences'))
        a_abs_c, a_abs_i = calculate_absences(m.get('away_absences'))
        rows.append({
            'match_id': m['id'],
            'match_date': m.get('match_date'),
            'status': m.get('status'),
            'home_team': (m.get('home') or {}).get('name', ''),
            'away_team': (m.get('away') or {}).get('name', ''),
            'home_odds': m.get('home_odds') or 0,
            'home_win_rate': m.get('home_win_rate', 0.45),
            'form_diff': form_to_points(m.get('home_form')) - form_to_points(m.get('away_form')),
            # Différentiel absents : positif = avantage domicile (moins d'absents)
            'abs_count_diff': a_abs_c - h_abs_c,
            'abs_impact_diff': a_abs_i - h_abs_i,
            'target': build_target(m),
        })
    return pd.DataFrame(rows)


def get_model():
    return {
        "name": "Effectif (Absences)",
        "features": ['home_win_rate', 'form_diff', 'abs_count_diff', 'abs_impact_diff'],
        "clf": RandomForestClassifier(n_estimators=200, min_samples_leaf=3, random_state=42),
        "build_fn": build_features,
    }
