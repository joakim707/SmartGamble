"""
Orchestrateur — exécute tous les scripts de fetch dans l'ordre.
Utilisé par le workflow GitHub Actions (toutes les 12 heures).

Ordre :
  1. fetch_matches   → matchs + équipes
  2. fetch_odds      → cotes
  3. fetch_form      → forme des équipes (basée sur les matchs terminés)
  4. fetch_lineups   → effectifs joueurs
  5. fetch_stats     → stats joueurs (async, via Understat)
"""

import sys
import time
import asyncio
import traceback


def run(label: str, fn):
    print(f"\n{'='*50}")
    print(f"  {label}")
    print(f"{'='*50}")
    start = time.time()
    try:
        fn()
        elapsed = time.time() - start
        print(f"  ✓ Terminé en {elapsed:.1f}s")
    except Exception:
        print(f"  ✗ Erreur :")
        traceback.print_exc()
        sys.exit(1)


def main():
    # Import ici pour que chaque module charge son .env indépendamment
    from fetch_matches import fetch_and_store_matches
    from fetch_odds    import fetch_and_store_odds
    from fetch_form    import run as fetch_form
    from fetch_lineups import run as fetch_lineups

    run("1/5 — Matchs & équipes",   fetch_and_store_matches)
    run("2/5 — Cotes",              fetch_and_store_odds)
    run("3/5 — Forme des équipes",  fetch_form)
    run("4/5 — Effectifs joueurs",  fetch_lineups)

    # fetch_stats est async
    print(f"\n{'='*50}")
    print("  5/5 — Stats joueurs (Understat)")
    print(f"{'='*50}")
    start = time.time()
    try:
        from fetch_stats import run as fetch_stats_async
        asyncio.run(fetch_stats_async())
        print(f"  ✓ Terminé en {time.time() - start:.1f}s")
    except Exception:
        print("  ✗ Erreur :")
        traceback.print_exc()
        sys.exit(1)

    print(f"\n{'='*50}")
    print("  Tous les fetches terminés avec succès.")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
