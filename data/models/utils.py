import numpy as np


def form_to_points(form_str):
    """Convertit une chaîne W/D/L en moyenne de points par match."""
    if not form_str or not isinstance(form_str, str):
        return 1.0
    points = {'W': 3, 'D': 1, 'L': 0}
    return sum(points.get(c, 1) for c in form_str) / len(form_str)


def calculate_recent_goals(form_str):
    """Différentiel de buts pondéré depuis les 5 derniers matchs."""
    if not form_str or not isinstance(form_str, str):
        return 0.0
    return form_str.count('W') * 1.5 - form_str.count('L') * 1.5


def calculate_absences(absences_list):
    """
    Retourne (nombre_absents, somme_des_impacts).
    Si l'absence est un dict avec clé 'impact', on l'utilise ; sinon 1.0 par défaut.
    """
    if not absences_list or not isinstance(absences_list, list):
        return 0, 0.0
    impact = sum(
        float(a.get('impact', 1.0)) if isinstance(a, dict) else 1.0
        for a in absences_list
    )
    return len(absences_list), impact


def build_target(m):
    """Encode le résultat : 0 = domicile, 1 = nul, 2 = extérieur. -1 si non terminé."""
    if m.get('status') != 'finished':
        return -1
    hg = m.get('score_home') or 0
    ag = m.get('score_away') or 0
    if hg > ag:
        return 0
    if hg == ag:
        return 1
    return 2


def compute_confidence(proba_row):
    """
    Indice de confiance normalisé entre 0 et 100 %.
    0 % = incertitude totale (1/3 partout), 100 % = certitude absolue.
    """
    p_max = float(np.max(proba_row))
    confidence = (p_max - 1 / 3) / (2 / 3)
    return round(max(0.0, min(1.0, confidence)) * 100, 1)
