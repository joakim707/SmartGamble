"""
Analyse le sentiment (positif/négatif/neutre) de titres d'actualité
liés aux équipes de football, via l'API Hugging Face Inference.

Objectif : explorer l'intégration d'un service IA tiers (NLP) pour
enrichir l'analyse au-delà des stats pures — un flux d'actualité très
négatif sur une équipe pourrait par exemple pondérer une prédiction.

Modèle : lxyuan/distilbert-base-multilingual-cased-sentiments-student
(DistilBERT multilingue, distillé d'un classifieur zero-shot), qui sort
nativement les 3 classes positive/negative/neutral — y compris sur du
texte français. Le modèle initialement visé, tblard/tf-allocine, n'a
plus aucun provider d'inférence actif côté Hugging Face (mapping vide),
d'où ce remplacement par un modèle équivalent mais servable.

Démo autonome : liste de titres d'actualité fictifs mais réalistes sur
des équipes déjà en base (PSG, Marseille, Lyon, Monaco, Lens). Ne touche
pas à Supabase ni au dashboard — script indépendant pour la veille techno.
"""

import os
import time
from collections import defaultdict

import requests
from dotenv import load_dotenv

load_dotenv()

HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")

MODEL = "lxyuan/distilbert-base-multilingual-cased-sentiments-student"
# L'ancien host api-inference.huggingface.co est décommissionné ; l'API Inference
# Hugging Face passe désormais par le routeur, avec le provider "hf-inference"
# pour l'hébergement gratuit standard.
API_URL = f"https://router.huggingface.co/hf-inference/models/{MODEL}"
HEADERS = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}

# Nombre de tentatives si le modèle est encore en train de charger (503)
MAX_RETRIES = 3

LABEL_FR = {"positive": "positif", "negative": "négatif", "neutral": "neutre"}

# ================================
# Démo : titres d'actualité (équipes déjà en base)
# ================================
NEWS_HEADLINES = [
    {"team": "Paris Saint-Germain",   "title": "Le PSG écrase Montpellier 5-0 et impressionne toute la Ligue 1"},
    {"team": "Paris Saint-Germain",   "title": "Le PSG s'incline lourdement face à un promu, la crise s'installe"},
    {"team": "Paris Saint-Germain",   "title": "Le PSG communique sur la composition de son groupe pour le prochain match"},
    {"team": "Olympique de Marseille", "title": "L'OM enchaîne un troisième succès de rang et grimpe au classement"},
    {"team": "Olympique de Marseille", "title": "Marseille humilié à domicile, la colère gronde chez les supporters"},
    {"team": "Olympique Lyonnais",     "title": "L'Olympique Lyonnais officialise son calendrier pour la trêve internationale"},
    {"team": "Monaco",                 "title": "Monaco valide sa qualification en Ligue des champions avec brio"},
    {"team": "Lens",                   "title": "Lens enregistre une nouvelle défaite et s'enfonce dans la crise"},
]


def analyze_sentiment(text: str) -> tuple[str, float]:
    """
    Interroge l'API Hugging Face Inference pour un titre donné.
    Retourne (sentiment, score) où sentiment ∈ {"positif", "négatif", "neutre"}.
    Gère le cas où le modèle est encore en train de charger (503).
    """
    payload = {"inputs": text}
    data = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(API_URL, headers=HEADERS, json=payload, timeout=30)
        except requests.RequestException as e:
            raise RuntimeError(f"Erreur réseau : {e}") from e

        if resp.status_code == 503:
            wait = resp.json().get("estimated_time", 15)
            print(f"    Modèle en cours de chargement, nouvelle tentative dans {wait:.0f}s...")
            time.sleep(min(wait, 30))
            continue

        if resp.status_code == 403:
            raise RuntimeError(
                "HTTP 403 — le token HUGGINGFACE_API_KEY n'a pas la permission "
                "\"Make calls to Inference Providers\" (à activer sur "
                "huggingface.co/settings/tokens, ou régénérer un token avec ce scope)"
            )

        if resp.status_code != 200:
            raise RuntimeError(f"HTTP {resp.status_code} — {resp.text[:200]}")

        data = resp.json()
        break

    if data is None:
        raise RuntimeError("Modèle indisponible après plusieurs tentatives")

    # La réponse peut être imbriquée ([[{...}, {...}]]) ou plate ([{...}, {...}])
    scores = data[0] if isinstance(data[0], list) else data
    best = max(scores, key=lambda s: s["score"])

    return LABEL_FR.get(best["label"], best["label"].lower()), best["score"]


def run() -> None:
    if not HUGGINGFACE_API_KEY:
        print("HUGGINGFACE_API_KEY manquante dans .env")
        return

    print(f"Analyse de {len(NEWS_HEADLINES)} titres via {MODEL}\n")

    # Score signé par titre pour la moyenne : positif = +score, négatif = -score, neutre = 0
    team_scores: dict[str, list[float]] = defaultdict(list)

    for item in NEWS_HEADLINES:
        team, title = item["team"], item["title"]

        try:
            sentiment, score = analyze_sentiment(title)
        except RuntimeError as e:
            print(f"[{team}] \"{title}\"")
            print(f"  Erreur : {e}\n")
            continue

        signed = score if sentiment == "positif" else -score if sentiment == "négatif" else 0.0
        team_scores[team].append(signed)

        print(f"[{team}] \"{title}\"")
        print(f"  -> {sentiment} (confiance : {score:.2%})\n")

    if not team_scores:
        print("Aucun titre analysé avec succès.")
        return

    print("=== Score de sentiment moyen par équipe (-1 = très négatif, +1 = très positif) ===")
    for team, scores in team_scores.items():
        avg = sum(scores) / len(scores)
        print(f"  {team:<25} {avg:+.2f}  ({len(scores)} titre{'s' if len(scores) > 1 else ''})")


if __name__ == "__main__":
    run()
