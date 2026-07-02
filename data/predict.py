"""
Pipeline d'entraînement et de prédiction chronologique SmartGamble.

Étapes :
  1. Chargement des matchs + classements depuis Supabase
  2. Enrichissement : home_win_rate historique + données de classement
  3. Évaluation chronologique (70 % train / 30 % test) sur 5 modèles
  4. Entraînement final du meilleur modèle sur 100 % des matchs terminés
  5. Prédictions sur les matchs à venir + sauvegarde en BDD

Table Supabase requise pour la sauvegarde (à créer si absente) :
  CREATE TABLE predictions (
    id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    match_id      integer REFERENCES match(id),
    model_name    text,
    prob_home     float,
    prob_draw     float,
    prob_away     float,
    predicted_result int,   -- 0 = domicile, 1 = nul, 2 = extérieur
    confidence    float,
    created_at    timestamptz DEFAULT now(),
    UNIQUE(match_id, model_name)
  );
"""
import os
import joblib
import pandas as pd
import numpy as np
from collections import defaultdict
from dotenv import load_dotenv
from supabase import create_client, Client
from sklearn.metrics import log_loss

from models.model_momentum import get_model as get_momentum
from models.model_squad    import get_model as get_squad
from models.model_standings import get_model as get_standings
from models.utils import compute_confidence

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Coupure entre 1ère et 2ème moitié de saison 2025-26
# Entraînement : tout ce qui est AVANT cette date
# Prédictions  : tout ce qui est APRÈS (terminés ou à venir)
CUTOFF_DATE = os.getenv("CUTOFF_DATE", "2026-01-15")


# ---------------------------------------------------------------------------
# Enrichissement des données
# ---------------------------------------------------------------------------

def _compute_home_win_rates(matches):
    """Taux de victoires à domicile par équipe depuis l'historique disponible."""
    results = defaultdict(list)
    for m in matches:
        if m.get('status') == 'finished' and m.get('score_home') is not None:
            won = (m.get('score_home') or 0) > (m.get('score_away') or 0)
            results[m['home_team_id']].append(won)
    return {
        tid: sum(r) / len(r) if r else 0.45
        for tid, r in results.items()
    }


def _form_before(finished_desc, team_id, before_date, n=5):
    """
    Forme d'une équipe sur les n derniers matchs terminés AVANT before_date.
    finished_desc doit être trié par match_date décroissant.
    Retourne une chaîne W/D/L ou None si aucun historique.
    """
    results = []
    for m in finished_desc:
        if before_date and (m.get('match_date') or '') >= before_date:
            continue
        sh = m.get('score_home') or 0
        sa = m.get('score_away') or 0
        if m.get('home_team_id') == team_id:
            results.append('W' if sh > sa else ('D' if sh == sa else 'L'))
        elif m.get('away_team_id') == team_id:
            results.append('W' if sa > sh else ('D' if sa == sh else 'L'))
        if len(results) == n:
            break
    return ''.join(results) or None


def _enrich_matches(matches, standings):
    """Ajoute home_win_rate, forme dynamique et données de classement à chaque match."""
    home_win_rates = _compute_home_win_rates(matches)

    # Matchs terminés triés du plus récent au plus ancien (pour calcul de forme)
    finished_desc = sorted(
        [m for m in matches if m.get('status') == 'finished' and m.get('score_home') is not None],
        key=lambda m: m.get('match_date') or '',
        reverse=True,
    )

    # Index du classement par nom d'équipe (avec fallback fuzzy ignoré pour l'instant)
    standings_idx = {s['team_name']: s for s in standings}

    for m in matches:
        date = m.get('match_date')
        m['home_win_rate'] = home_win_rates.get(m.get('home_team_id'), 0.45)
        # Forme calculée depuis l'historique en base (pas besoin de fetch_form)
        m['home_form'] = _form_before(finished_desc, m.get('home_team_id'), date)
        m['away_form'] = _form_before(finished_desc, m.get('away_team_id'), date)

        home_name = (m.get('home') or {}).get('name', '')
        away_name = (m.get('away') or {}).get('name', '')
        hs  = standings_idx.get(home_name, {})
        aws = standings_idx.get(away_name, {})

        m['home_rank']          = hs.get('rank')
        m['home_points']        = hs.get('points')
        m['home_goals_for']     = hs.get('goals_for')
        m['home_goals_against'] = hs.get('goals_against')
        m['away_rank']          = aws.get('rank')
        m['away_points']        = aws.get('points')
        m['away_goals_for']     = aws.get('goals_for')
        m['away_goals_against'] = aws.get('goals_against')

    return matches


# ---------------------------------------------------------------------------
# Évaluation
# ---------------------------------------------------------------------------

def _evaluate_model(m_cfg, matches):
    """
    Évalue un modèle sur un split chronologique 70/30.
    Retourne un dict de résultats ou None si les données sont insuffisantes.
    """
    df = m_cfg["build_fn"](matches)

    if 'match_date' not in df.columns:
        date_map = {m['id']: m.get('match_date') for m in matches}
        df['match_date'] = df['match_id'].map(date_map)
    df['match_date'] = pd.to_datetime(df['match_date'], errors='coerce')

    df_fin = df[df['status'] == 'finished'].copy()
    # Les matchs sans date restent en fin de liste (na_position='last')
    # pour préserver au maximum l'ordre chronologique disponible
    df_fin = df_fin.sort_values('match_date', na_position='last')

    if len(df_fin) < 20:
        return None

    split_idx = int(len(df_fin) * 0.7)
    train_df = df_fin.iloc[:split_idx]
    test_df = df_fin.iloc[split_idx:]

    X_train = train_df[m_cfg["features"]]
    y_train = train_df['target']
    X_test = test_df[m_cfg["features"]]
    y_test = test_df['target']

    if len(np.unique(y_train)) < 2:
        return None

    m_cfg["clf"].fit(X_train, y_train)
    y_proba = m_cfg["clf"].predict_proba(X_test)

    # Normaliser à 3 colonnes si un modèle sklearn manque une classe
    if y_proba.shape[1] < 3:
        full_proba = np.zeros((len(y_proba), 3))
        for col_idx, cls in enumerate(m_cfg["clf"].classes_):
            full_proba[:, cls] = y_proba[:, col_idx]
        y_proba = full_proba

    loss = log_loss(y_test, y_proba, labels=[0, 1, 2])
    acc = np.mean(np.argmax(y_proba, axis=1) == y_test.values)
    avg_conf = np.mean([compute_confidence(p) for p in y_proba])

    return {
        "name": m_cfg["name"],
        "loss": loss,
        "accuracy": acc,
        "avg_confidence": avg_conf,
        "config": m_cfg,
        "n_train": len(train_df),
        "n_test": len(test_df),
    }


# ---------------------------------------------------------------------------
# Sauvegarde en BDD
# ---------------------------------------------------------------------------

def _save_predictions(rows):
    """Upsert des prédictions dans la table 'predictions'."""
    if not rows:
        return
    try:
        supabase.table("predictions").upsert(
            rows, on_conflict="match_id,model_name"
        ).execute()
        print(f"  {len(rows)} prédiction(s) sauvegardées en BDD.")
    except Exception as e:
        print(f"  Avertissement BDD : {e}")
        print("  → Vérifier que la table 'predictions' existe (voir commentaire en haut du fichier).")


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------

def run_experiment():
    print("=" * 65)
    print("  SMARTGAMBLE — Pipeline d'entraînement IA")
    print("=" * 65)

    # 1. Chargement
    print("\n[1/4] Chargement des données...")
    matches = supabase.table("match").select(
        "*, home:home_team_id(name), away:away_team_id(name)"
    ).execute().data or []

    standings = supabase.table("standing").select("*").execute().data or []

    finished = [m for m in matches if m.get('status') == 'finished']
    upcoming = [m for m in matches if m.get('status') == 'upcoming']
    print(f"  {len(finished)} matchs terminés  |  {len(upcoming)} à venir  |  {len(standings)} entrées classement")

    if not finished:
        print("Erreur : Aucun match terminé trouvé.")
        return

    # 2. Enrichissement
    print("\n[2/4] Calcul des features enrichies...")
    matches = _enrich_matches(matches, standings)

    # Résumé de complétude des données analytiques
    checks = [
        ('home_form',      'Forme équipes'),
        ('home_xg',        'Expected Goals (xG)'),
        ('home_absences',  'Absences joueurs'),
    ]
    print(f"\n  Complétude des données analytiques :")
    for field, label in checks:
        n = sum(1 for m in finished if m.get(field) is not None)
        status = "✓" if n > 0 else "✗ manquant"
        print(f"    {label:<25} {n:>4} / {len(finished)}  {status}")
    n_scores = sum(1 for m in finished if m.get('score_home') is not None)
    print(f"    {'Scores (score_home)':<25} {n_scores:>4} / {len(finished)}  {'✓' if n_scores > 0 else '✗ manquant'}")

    # 3. Évaluation des modèles
    print("\n[3/4] Évaluation (70 % train / 30 % test chronologique)...\n")
    models_to_test = [get_momentum(), get_squad(), get_standings()]
    results = []

    for m_cfg in models_to_test:
        res = _evaluate_model(m_cfg, matches)
        if res is None:
            print(f"  ✗  {m_cfg['name']:<32}  Ignoré (données insuffisantes ou 1 seule classe cible).")
            continue
        results.append(res)
        print(
            f"  ✓  {res['name']:<32}"
            f"  Log Loss: {res['loss']:.4f}"
            f"  |  Acc: {res['accuracy']:.1%}"
            f"  |  Conf moy: {res['avg_confidence']:.1f}%"
            f"  |  (train={res['n_train']}, test={res['n_test']})"
        )

    if not results:
        print("Aucun modèle évaluable.")
        return

    results.sort(key=lambda x: x["loss"])

    print("\n  --- Classement des modèles (meilleur → moins bon) ---")
    for i, r in enumerate(results, 1):
        print(f"  {i}. {r['name']:<32}  Log Loss: {r['loss']:.4f}")

    best = results[0]
    print(f"\n  → Modèle retenu : {best['name']}")

    # 4. Entraînement final + prédictions 2ème moitié de saison
    print(f"\n[4/4] Entraînement sur 1ère moitié → prédictions 2ème moitié (coupure : {CUTOFF_DATE})...")

    best_cfg = best["config"]

    # Entraînement : uniquement les matchs terminés AVANT la coupure
    all_df = best_cfg["build_fn"](matches)
    all_df['match_date_dt'] = pd.to_datetime(all_df['match_date'], errors='coerce')
    cutoff_ts = pd.Timestamp(CUTOFF_DATE)

    train_mask = (all_df['status'] == 'finished') & (
        all_df['match_date_dt'].isna() | (all_df['match_date_dt'] < cutoff_ts)
    )
    train_final = all_df[train_mask]

    if train_final.empty:
        print("  Aucun match d'entraînement avant la coupure — entraînement sur tous les matchs terminés.")
        train_final = all_df[all_df['status'] == 'finished']

    best_cfg["clf"].fit(train_final[best_cfg["features"]], train_final['target'])
    print(f"  Entraîné sur {len(train_final)} matchs (avant {CUTOFF_DATE})")

    model_path = os.path.join(os.path.dirname(__file__), 'best_model.pkl')
    joblib.dump({
        'model': best_cfg["clf"],
        'features': best_cfg["features"],
        'model_name': best_cfg["name"],
        'cutoff_date': CUTOFF_DATE,
    }, model_path)
    print(f"  Modèle sauvegardé → {model_path}")

    # Prédictions : tous les matchs de la 2ème moitié (terminés ou à venir)
    second_half_mask = all_df['match_date_dt'] >= cutoff_ts
    second_half_df = all_df[second_half_mask].copy()

    # Fallback : si aucun match après coupure, prendre les matchs "upcoming"
    if second_half_df.empty:
        second_half_df = all_df[all_df['status'] == 'upcoming'].copy()

    if second_half_df.empty:
        print("  Aucun match à prédire dans la 2ème moitié de saison.")
        return

    n_fin_2nd  = len(second_half_df[second_half_df['status'] == 'finished'])
    n_up_2nd   = len(second_half_df[second_half_df['status'] == 'upcoming'])
    print(f"  2ème moitié : {n_fin_2nd} matchs terminés + {n_up_2nd} à venir → {len(second_half_df)} prédictions")

    probas = best_cfg["clf"].predict_proba(second_half_df[best_cfg["features"]])
    if probas.shape[1] < 3:
        full_p = np.zeros((len(probas), 3))
        for ci, cls in enumerate(best_cfg["clf"].classes_):
            full_p[:, cls] = probas[:, ci]
        probas = full_p

    LABEL   = {0: "DOM", 1: "NUL", 2: "EXT"}
    CORRECT = {True: "✓", False: "✗", None: " "}

    header = (f"  {'Match':<38} {'DOM':>6} {'NUL':>6} {'EXT':>6}"
              f" {'Conf':>6}  {'Préd':>4}  Réel")
    print(f"\n{header}")
    print("  " + "-" * 82)

    predictions_rows = []
    correct_count = 0
    evaluated_count = 0

    for i, (_, row) in enumerate(second_half_df.iterrows()):
        p       = probas[i]
        pred    = int(np.argmax(p))
        conf    = compute_confidence(p)
        actual  = int(row['target']) if row['target'] != -1 else None
        match_str = f"{row.get('home_team', '?')} vs {row.get('away_team', '?')}"

        # Comparaison avec le résultat réel (si le match est terminé)
        is_correct = (pred == actual) if actual is not None else None
        if actual is not None:
            evaluated_count += 1
            if is_correct:
                correct_count += 1
        actual_str = LABEL.get(actual, "?") if actual is not None else "—"
        check_str  = CORRECT[is_correct]

        print(
            f"  {match_str:<38}"
            f" {p[0]:>5.1%} {p[1]:>5.1%} {p[2]:>5.1%}"
            f" {conf:>5.1f}%"
            f"  {LABEL[pred]:>4}"
            f"  {actual_str} {check_str}"
        )
        predictions_rows.append({
            "match_id":        row['match_id'],
            "model_name":      best_cfg["name"],
            "prob_home":       round(float(p[0]), 4),
            "prob_draw":       round(float(p[1]), 4),
            "prob_away":       round(float(p[2]), 4),
            "predicted_result": pred,
            "confidence":      conf,
        })

    if evaluated_count > 0:
        acc_2nd = correct_count / evaluated_count
        print(f"\n  Accuracy 2ème moitié : {correct_count}/{evaluated_count} = {acc_2nd:.1%}")

    print()
    _save_predictions(predictions_rows)
    print("\nPipeline terminé.")


if __name__ == "__main__":
    run_experiment()
