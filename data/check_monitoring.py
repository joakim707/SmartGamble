"""
Tableau de bord en ligne de commande pour le monitorage de l'API de
prédiction (data/api_predict.py).

Lit logs/api.log (écrit par api_predict.py, une ligne JSON structurée par
requête + une ligne "ALERTE" par réponse en erreur) et affiche un résumé
lisible : nombre de requêtes, taux d'erreur, temps de réponse moyen,
répartition par endpoint, et dernières alertes.

Utilisation : python data/check_monitoring.py
"""

import json
import re
from collections import Counter
from pathlib import Path

LOG_FILE = Path(__file__).resolve().parent.parent / "logs" / "api.log"

# Format écrit par logging.Formatter("%(asctime)s %(levelname)s %(message)s")
LOG_LINE = re.compile(r"^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})\s+(?P<level>\w+)\s+(?P<message>.*)$")

LAST_ALERTS_SHOWN = 5


def parse_log() -> tuple[list[dict], list[tuple[str, str]]]:
    """Retourne (entrées de requêtes structurées, alertes [(timestamp, message)])."""
    requests_log: list[dict] = []
    alerts: list[tuple[str, str]] = []

    for line in LOG_FILE.read_text(encoding="utf-8").splitlines():
        match = LOG_LINE.match(line)
        if not match:
            continue

        timestamp, level, message = match["timestamp"], match["level"], match["message"]

        if level == "ERROR" and message.startswith("ALERTE"):
            alerts.append((timestamp, message))
            continue

        if level == "INFO":
            try:
                entry = json.loads(message)
            except json.JSONDecodeError:
                continue
            requests_log.append(entry)

    return requests_log, alerts


def display_summary(requests_log: list[dict], alerts: list[tuple[str, str]]) -> None:
    total = len(requests_log)

    print("=== Monitorage API de prédiction (logs/api.log) ===\n")

    if total == 0:
        print("Aucune requête journalisée pour l'instant.")
        print("Lance l'API (python data/api_predict.py) et envoie-lui une requête pour générer des logs.")
        return

    errors = [r for r in requests_log if r.get("status", 0) >= 400]
    error_rate = len(errors) / total * 100
    avg_duration = sum(r.get("duration_ms", 0) for r in requests_log) / total

    print(f"Requêtes journalisées : {total}")
    print(f"Erreurs                : {len(errors)} ({error_rate:.1f}%)")
    print(f"Temps de réponse moyen : {avg_duration:.1f} ms\n")

    print("Répartition par endpoint :")
    by_endpoint = Counter(r.get("endpoint", "?") for r in requests_log)
    for endpoint, count in by_endpoint.most_common():
        print(f"  {endpoint:<20} {count}")

    print(f"\nAlertes détectées : {len(alerts)}")
    if alerts:
        print(f"Dernières {min(LAST_ALERTS_SHOWN, len(alerts))} :")
        for timestamp, message in alerts[-LAST_ALERTS_SHOWN:]:
            print(f"  [{timestamp}] {message}")
    else:
        print("  Aucune — tout va bien.")


def main() -> None:
    if not LOG_FILE.exists():
        print(f"Fichier de log introuvable : {LOG_FILE}")
        print("Lance l'API (python data/api_predict.py) pour qu'il soit créé.")
        return

    requests_log, alerts = parse_log()
    display_summary(requests_log, alerts)


if __name__ == "__main__":
    main()
