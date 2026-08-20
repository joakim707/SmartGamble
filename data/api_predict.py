"""
API REST exposant le modèle de prédiction (même logique que predict.py)
au dashboard SmartGamble.

Le modèle (RandomForestClassifier, features home_team_id/away_team_id,
split temporel 70% entraînement / 30% test comme dans predict.py) est
entraîné une seule fois au démarrage de l'API et gardé en mémoire —
c'est ce modèle-là, pas un ré-entraîné sur 100% des données, qui sert
les prédictions : l'accuracy annoncée correspond donc exactement au
modèle réellement interrogé.

Limites connues (à assumer à l'oral de certification) :
- Seulement 2 features, home_team_id/away_team_id en brut (pas
  d'encodage catégoriel, pas de stats de forme ni de classement) →
  le modèle ne capture ni la forme récente ni la qualité réelle des
  équipes, seulement des motifs statistiques liés aux identifiants.
- Accuracy mesurée sur le holdout temporel (fin de saison) : ~38-39%,
  à comparer aux ~33% d'un tirage aléatoire à 3 issues (Domicile/Nul/
  Extérieur) — légèrement mieux que le hasard, loin d'être fiable.
- Un home_team_id/away_team_id absent des données d'entraînement
  produit quand même une prédiction (RandomForest ne "sait" pas qu'il
  extrapole hors distribution) : peu significatif pour une équipe
  jamais vue à l'entraînement.

Monitorage (E5) : chaque requête est journalisée dans logs/api.log
(timestamp, endpoint, statut, durée), avec une ligne "ALERTE" dédiée sur
toute réponse en erreur (status >= 400) — ça couvre aussi les échecs
d'authentification (401), sans code dédié : ce sont des erreurs comme
les autres pour le monitorage. /health expose en plus le total de
requêtes, le nombre d'erreurs et le temps de réponse moyen depuis le
démarrage. Voir data/check_monitoring.py pour un résumé en ligne de commande.

Authentification (E5 : restreindre l'accès à l'API) : /predict et
/predict/batch exigent l'en-tête X-API-Key, comparé à API_SECRET_KEY
(.env). /health reste public — un endpoint de supervision externe doit
pouvoir être interrogé sans credentials.

Lancement : python data/api_predict.py   (sert sur http://localhost:5000)
"""

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from supabase import create_client

load_dotenv()

# ================================
# Journalisation (E5 : monitorage / détection d'incidents)
# ================================
# Une ligne par requête dans logs/api.log : timestamp, endpoint, statut,
# durée en ms (format JSON pour rester facilement exploitable par
# check_monitoring.py). Les réponses en erreur (status >= 400) déclenchent
# en plus une ligne "ALERTE" dédiée, pour une détection rapide en grep.
LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logger = logging.getLogger("api_predict")
logger.setLevel(logging.INFO)
_file_handler = logging.FileHandler(LOG_DIR / "api.log", encoding="utf-8")
_file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(_file_handler)
logger.propagate = False  # ne pas dupliquer sur stdout, les print() de démarrage restent séparés

# Compteurs en mémoire exposés par /health — pas de persistance, remis à
# zéro à chaque redémarrage de l'API (suffisant pour un monitorage minimal).
_stats_lock = threading.Lock()
_stats = {"total_requests": 0, "total_errors": 0, "total_duration_ms": 0.0}


def _record_request(duration_ms: float, is_error: bool) -> None:
    with _stats_lock:
        _stats["total_requests"] += 1
        _stats["total_duration_ms"] += duration_ms
        if is_error:
            _stats["total_errors"] += 1


def _stats_snapshot() -> dict:
    with _stats_lock:
        total = _stats["total_requests"]
        avg_ms = (_stats["total_duration_ms"] / total) if total else 0.0
        return {
            "total_requests": total,
            "total_errors": _stats["total_errors"],
            "avg_response_time_ms": round(avg_ms, 2),
        }

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Erreur : SUPABASE_URL ou SUPABASE_KEY manquant dans le fichier .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

API_SECRET_KEY = os.getenv("API_SECRET_KEY")

if not API_SECRET_KEY:
    raise ValueError("Erreur : API_SECRET_KEY manquant dans le fichier .env")

RESULT_LABELS = {2: "Domicile", 1: "Nul", 0: "Exterieur"}

# Origines autorisées à appeler l'API : ports utilisés par `next dev`
ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:3001"]

# État du modèle — rempli une seule fois par train_model() au démarrage
_model: RandomForestClassifier | None = None
_test_accuracy: float | None = None
_train_size = 0
_test_size = 0


# ================================
# Entraînement (identique à predict.py)
# ================================
def _load_finished_matches() -> pd.DataFrame:
    """Reproduit la préparation de données de predict.py."""
    response = supabase.table("match").select("*").eq("status", "finished").execute()
    matchs = response.data or []

    data = []
    for m in matchs:
        if m.get("score_home") is None or m.get("score_away") is None:
            continue
        if m["score_home"] > m["score_away"]:
            resultat = 2  # Victoire domicile
        elif m["score_home"] == m["score_away"]:
            resultat = 1  # Nul
        else:
            resultat = 0  # Victoire extérieur

        data.append({
            "id":            m.get("id"),
            "home_team_id":  m.get("home_team_id", 0),
            "away_team_id":  m.get("away_team_id", 0),
            "resultat_reel": resultat,
            "date":          m.get("utc_date", str(m.get("id"))),
        })

    return pd.DataFrame(data).sort_values(by="date").reset_index(drop=True)


def train_model() -> None:
    """Entraîne le modèle une seule fois, au démarrage de l'API."""
    global _model, _test_accuracy, _train_size, _test_size

    print("Chargement de l'historique des matchs terminés depuis Supabase...")
    df = _load_finished_matches()

    if len(df) < 10:
        raise RuntimeError(f"Pas assez de matchs pour entraîner le modèle ({len(df)} trouvés, 10 minimum).")

    split = int(len(df) * 0.70)
    df_train, df_test = df.iloc[:split], df.iloc[split:]

    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(df_train[["home_team_id", "away_team_id"]], df_train["resultat_reel"])

    accuracy = 0.0
    if len(df_test):
        predictions = model.predict(df_test[["home_team_id", "away_team_id"]])
        accuracy = accuracy_score(df_test["resultat_reel"], predictions)

    _model = model
    _test_accuracy = accuracy
    _train_size = len(df_train)
    _test_size = len(df_test)

    print(f"Modèle entraîné : {_train_size} matchs (train) / {_test_size} matchs (test, fin de saison)")
    print(f"Accuracy sur le holdout : {accuracy * 100:.2f}%")


def _predict_one(home_team_id: int, away_team_id: int) -> dict:
    """Prédit un match sur le modèle déjà entraîné (pas de ré-entraînement ici)."""
    X = pd.DataFrame([{"home_team_id": home_team_id, "away_team_id": away_team_id}])
    probs = _model.predict_proba(X)[0]
    # model.classes_ est trié ([0, 1, 2]) donc l'ordre correspond à Extérieur/Nul/Domicile
    prob_by_class = dict(zip(_model.classes_, probs))

    prob_away = float(prob_by_class.get(0, 0.0))
    prob_draw = float(prob_by_class.get(1, 0.0))
    prob_home = float(prob_by_class.get(2, 0.0))
    predicted_class = max(prob_by_class, key=prob_by_class.get)

    return {
        "prediction": RESULT_LABELS[predicted_class],
        "probabilities": {
            "home": round(prob_home, 4),
            "draw": round(prob_draw, 4),
            "away": round(prob_away, 4),
        },
        "confidence": round(max(prob_home, prob_draw, prob_away), 4),
    }


# ================================
# API
# ================================
app = Flask(__name__)
CORS(app, origins=ALLOWED_ORIGINS)


@app.before_request
def _start_timer():
    request._start_time = time.perf_counter()


@app.after_request
def _log_request(response):
    """
    Logge chaque requête (timestamp, endpoint, statut, durée) et met à jour
    les compteurs de /health. Tourne pour toutes les routes, y compris les
    500 auto-générés par Flask sur une exception non attrapée dans une vue.
    """
    duration_ms = (time.perf_counter() - getattr(request, "_start_time", time.perf_counter())) * 1000
    is_error = response.status_code >= 400
    _record_request(duration_ms, is_error)

    logger.info(json.dumps({
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "endpoint":    request.path,
        "method":      request.method,
        "status":      response.status_code,
        "duration_ms": round(duration_ms, 2),
    }, ensure_ascii=False))

    if is_error:
        logger.error(f"ALERTE - requête en erreur sur {request.method} {request.path} (status {response.status_code})")

    return response


def require_api_key(view):
    """
    Restreint une route à l'en-tête X-API-Key. Le 401 renvoyé passe par la
    même réponse que les autres routes, donc _log_request() ci-dessus le
    journalise automatiquement comme une ALERTE, sans code supplémentaire.
    """
    @wraps(view)
    def wrapper(*args, **kwargs):
        if request.headers.get("X-API-Key") != API_SECRET_KEY:
            return jsonify({"error": "Non autorisé : en-tête X-API-Key manquant ou invalide"}), 401
        return view(*args, **kwargs)
    return wrapper


@app.get("/health")
def health():
    stats = _stats_snapshot()
    return jsonify({
        "status":         "ok" if _model is not None else "model_not_ready",
        "model_accuracy": _test_accuracy,
        "train_matches":  _train_size,
        "test_matches":   _test_size,
        **stats,
    })


@app.post("/predict")
@require_api_key
def predict():
    body = request.get_json(silent=True) or {}
    home_id, away_id = body.get("home_team_id"), body.get("away_team_id")

    if home_id is None or away_id is None:
        return jsonify({"error": "home_team_id et away_team_id sont requis"}), 400

    try:
        result = _predict_one(int(home_id), int(away_id))
    except (TypeError, ValueError):
        return jsonify({"error": "home_team_id et away_team_id doivent être des entiers"}), 400

    result["model_accuracy"] = _test_accuracy
    return jsonify(result)


@app.post("/predict/batch")
@require_api_key
def predict_batch():
    """
    Prédit plusieurs matchs en un seul appel réseau — le dashboard l'utilise
    pour calculer le confidenceScore de tous les matchs affichés sans faire
    une requête HTTP par match.
    Body attendu : {"matches": [{"home_team_id": 1, "away_team_id": 2}, ...]}
    """
    body = request.get_json(silent=True) or {}
    matches = body.get("matches")

    if not isinstance(matches, list):
        return jsonify({"error": "matches doit être une liste de {home_team_id, away_team_id}"}), 400

    results = []
    for m in matches:
        try:
            results.append(_predict_one(int(m["home_team_id"]), int(m["away_team_id"])))
        except (KeyError, TypeError, ValueError):
            results.append({"error": "home_team_id/away_team_id invalides"})

    return jsonify({"results": results, "model_accuracy": _test_accuracy})


if __name__ == "__main__":
    train_model()
    app.run(host="0.0.0.0", port=5000, debug=False)
